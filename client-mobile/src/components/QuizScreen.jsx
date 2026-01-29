import { useState, useEffect, useRef } from 'react'
import BuzzerButton from './BuzzerButton'
import AnswerOptions from './AnswerOptions'
import './QuizScreen.css'

function QuizScreen({ socket, participantData }) {
  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [questionStartTime, setQuestionStartTime] = useState(null)
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [buzzerActive, setBuzzerActive] = useState(false)
  const [buzzerLocked, setBuzzerLocked] = useState(false)
  const [buzzerWinner, setBuzzerWinner] = useState(null)
  const [canAnswer, setCanAnswer] = useState(false)
  const [answerSubmitted, setAnswerSubmitted] = useState(false)
  const [feedback, setFeedback] = useState(null)
  const [score, setScore] = useState(participantData?.score || 0)
  const [rank, setRank] = useState(null)
  
  const timerRef = useRef(null)
  
  useEffect(() => {
    if (!socket) return
    
    // Question started
    socket.on('question-started', (data) => {
      setCurrentQuestion(data.question)
      setQuestionStartTime(data.startTime)
      setTimeRemaining(data.question.timeLimit)
      setBuzzerActive(false)
      setBuzzerLocked(false)
      setBuzzerWinner(null)
      setAnswerSubmitted(false)
      setFeedback(null)
      
      // For non-buzzer questions, enable answering immediately
      if (data.question.type !== 'BUZZER') {
        setCanAnswer(true)
      } else {
        setCanAnswer(false)
      }
    })
    
    // Buzzer activated
    socket.on('buzzer-activated', () => {
      setBuzzerActive(true)
      setCanAnswer(false)
    })
    
    // Buzzer winner
    socket.on('buzzer-winner', (data) => {
      setBuzzerWinner(data.winner)
      setBuzzerLocked(true)
      
      // If I'm the winner, enable answering
      if (data.winner.participantId === participantData.id) {
        setCanAnswer(true)
      }
    })
    
    // Buzzer locked
    socket.on('buzzer-locked', (data) => {
      setBuzzerLocked(true)
      
      // If I'm not the winner, disable answering
      if (data.winnerId !== participantData.id) {
        setCanAnswer(false)
      }
    })
    
    // Buzzer timeout
    socket.on('buzzer-timeout', () => {
      setBuzzerLocked(false)
      setCanAnswer(true)
    })
    
    // Answer received
    socket.on('answer-received', (data) => {
      setAnswerSubmitted(true)
      setFeedback(data)
      setCanAnswer(false)
    })
    
    // Leaderboard update
    socket.on('leaderboard-update', (data) => {
      const myData = data.leaderboard.find(p => p.id === participantData.id)
      if (myData) {
        setScore(myData.score)
        setRank(myData.rank)
      }
    })
    
    return () => {
      socket.off('question-started')
      socket.off('buzzer-activated')
      socket.off('buzzer-winner')
      socket.off('buzzer-locked')
      socket.off('buzzer-timeout')
      socket.off('answer-received')
      socket.off('leaderboard-update')
    }
  }, [socket, participantData])
  
  // Timer countdown
  useEffect(() => {
    if (!currentQuestion || !questionStartTime) return
    
    timerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - questionStartTime) / 1000)
      const remaining = Math.max(0, currentQuestion.timeLimit - elapsed)
      setTimeRemaining(remaining)
      
      if (remaining === 0) {
        clearInterval(timerRef.current)
      }
    }, 100)
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [currentQuestion, questionStartTime])
  
  const handleBuzzerPress = () => {
    if (!buzzerActive || buzzerLocked || !socket) return
    
    const pressTime = Date.now()
    const timeToPress = pressTime - questionStartTime
    
    socket.emit('buzzer-press', {
      questionId: currentQuestion.id,
      clientTimestamp: pressTime
    })
  }
  
  const handleAnswerSelect = (answer) => {
    if (!canAnswer || answerSubmitted || !socket) return
    
    const answerTime = Date.now()
    const timeToAnswer = answerTime - questionStartTime
    
    socket.emit('submit-answer', {
      questionId: currentQuestion.id,
      answer,
      timeToAnswer
    })
    
    setAnswerSubmitted(true)
  }
  
  if (!currentQuestion) {
    return (
      <div className="quiz-screen">
        <div className="waiting-for-question">
          <div className="spinner"></div>
          <p>Waiting for next question...</p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="quiz-screen fade-in">
      {/* Header */}
      <div className="quiz-header">
        <div className="quiz-info">
          <span className="question-number">
            Q{currentQuestion.questionNumber}/{currentQuestion.totalQuestions}
          </span>
          <span className="round-badge">Round {currentQuestion.round}</span>
        </div>
        <div className="score-info">
          <div className="score">
            <span className="score-label">Score:</span>
            <span className="score-value">{score}</span>
          </div>
          {rank && (
            <div className="rank">
              Rank #{rank}
            </div>
          )}
        </div>
      </div>
      
      {/* Timer */}
      <div className="timer-container">
        <div 
          className="timer-bar" 
          style={{ 
            width: `${(timeRemaining / currentQuestion.timeLimit) * 100}%`,
            backgroundColor: timeRemaining <= 5 ? 'var(--color-error)' : 'var(--color-success)'
          }}
        ></div>
        <div className="timer-text">{timeRemaining}s</div>
      </div>
      
      {/* Question */}
      <div className="question-container">
        <h2 className="question-text">{currentQuestion.text}</h2>
        <div className="question-meta">
          <span className="points-badge">+{currentQuestion.points} pts</span>
          {currentQuestion.negativePoints > 0 && (
            <span className="negative-badge">-{currentQuestion.negativePoints} for wrong</span>
          )}
        </div>
      </div>
      
      {/* Buzzer or Answer Options */}
      {currentQuestion.type === 'BUZZER' && buzzerActive && !buzzerWinner ? (
        <BuzzerButton 
          active={buzzerActive && !buzzerLocked}
          onPress={handleBuzzerPress}
          timeRemaining={timeRemaining}
        />
      ) : buzzerWinner ? (
        <div className="buzzer-winner-display">
          <div className={`winner-message ${buzzerWinner.participantId === participantData.id ? 'you-won' : ''}`}>
            {buzzerWinner.participantId === participantData.id ? (
              <>
                <div className="trophy">🏆</div>
                <h3>You buzzed first!</h3>
                <p>Select your answer below</p>
              </>
            ) : (
              <>
                <div className="lock-icon">🔒</div>
                <h3>{buzzerWinner.participantName} buzzed first</h3>
                <p>Waiting for their answer...</p>
              </>
            )}
          </div>
        </div>
      ) : null}
      
      {/* Short Answer Input */}
      {canAnswer && !answerSubmitted && currentQuestion.type === 'SHORT_ANSWER' && (
        <div className="short-answer-container">
           <form onSubmit={(e) => {
             e.preventDefault();
             const val = e.target.elements.answer.value.trim();
             if (val) handleAnswerSelect(val);
           }}>
             <input 
               name="answer"
               type="text" 
               placeholder="Type your answer..." 
               autoFocus 
               autoComplete="off"
               className="short-answer-input"
             />
             <button type="submit" className="submit-answer-btn">Submit</button>
           </form>
        </div>
      )}

      {/* Answer Options (MCQ / TrueFalse / Buzzer) */}
      {canAnswer && !answerSubmitted && currentQuestion.type !== 'SHORT_ANSWER' && (
        <AnswerOptions 
          options={currentQuestion.options}
          onSelect={handleAnswerSelect}
          disabled={!canAnswer}
        />
      )}
      
      {/* Feedback */}
      {feedback && (
        <div className={`feedback-container ${feedback.isCorrect ? 'correct' : 'wrong'}`}>
          <div className="feedback-icon">
            {feedback.isCorrect ? '✅' : '❌'}
          </div>
          <h3>{feedback.isCorrect ? 'Correct!' : 'Wrong!'}</h3>
          <p className="points-change">
            {feedback.points > 0 ? '+' : ''}{feedback.points} pts
          </p>
          {!feedback.isCorrect && (
            <p className="correct-answer">
              Correct answer: {feedback.correctAnswer}
            </p>
          )}
        </div>
      )}
      
      {/* Waiting for results */}
      {answerSubmitted && !feedback && (
        <div className="waiting-results">
          <div className="spinner"></div>
          <p>Answer submitted! Waiting for results...</p>
        </div>
      )}
    </div>
  )
}

export default QuizScreen
