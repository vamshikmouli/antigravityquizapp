import { useState, useEffect, useRef } from 'react'
import BuzzerButton from './BuzzerButton'
import AnswerOptions from './AnswerOptions'
import './QuizScreen.css'

function QuizScreen({ socket, participantData, initialGameState }) {
  const [currentQuestion, setCurrentQuestion] = useState(initialGameState?.question || null)
  const [questionStartTime, setQuestionStartTime] = useState(initialGameState?.startTime || null)
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [totalTime, setTotalTime] = useState(0)
  const [timerPhase, setTimerPhase] = useState('READING')
  const [buzzerActive, setBuzzerActive] = useState(false)
  const [buzzerLocked, setBuzzerLocked] = useState(false)
  const [buzzerWinner, setBuzzerWinner] = useState(null)
  const [buzzerStartTime, setBuzzerStartTime] = useState(null)
  const [canAnswer, setCanAnswer] = useState(initialGameState?.question && !initialGameState?.hasAnswered && !['BUZZER', 'ORAL_BUZZER'].includes(initialGameState?.question.type))
  const [answerSubmitted, setAnswerSubmitted] = useState(initialGameState?.hasAnswered || false)
  const [feedback, setFeedback] = useState(initialGameState?.lastAnswerResult || null)
  const [score, setScore] = useState(participantData?.score || 0)
  const [rank, setRank] = useState(null)
  const [isReading, setIsReading] = useState(false)
  
  const timerRef = useRef(null)

  // Initialize from initialGameState if provided and not already set
  useEffect(() => {
    if (initialGameState && !currentQuestion) {
      setCurrentQuestion(initialGameState.question)
      setQuestionStartTime(initialGameState.startTime)
      setAnswerSubmitted(initialGameState.hasAnswered)
      if (initialGameState.hasAnswered) {
        setFeedback(initialGameState.lastAnswerResult)
        setCanAnswer(false)
      } else {
        setCanAnswer(!['BUZZER', 'ORAL_BUZZER'].includes(initialGameState.question.type))
      }
    }
  }, [initialGameState, currentQuestion])
  
  useEffect(() => {
    if (!socket) return
    
    // Question started
    socket.on('question-started', (data) => {
      setCurrentQuestion(data.question)
      setQuestionStartTime(data.startTime)
      const readingTime = data.question.readingTime || 0
      if (readingTime > 0) {
        setTimerPhase('READING')
        setTotalTime(readingTime)
        setTimeRemaining(readingTime)
        setIsReading(true)
      } else {
        setTimerPhase('QUESTION')
        setTotalTime(data.question.timeLimit)
        setTimeRemaining(data.question.timeLimit)
        setIsReading(false)
      }
      setBuzzerActive(false)
      setBuzzerLocked(false)
      setBuzzerWinner(null)
      setBuzzerStartTime(null)
      setAnswerSubmitted(false)
      setFeedback(null)
      
      // For non-buzzer questions, enable answering immediately
      if (!['BUZZER', 'ORAL_BUZZER'].includes(data.question.type)) {
        setCanAnswer(true)
      } else {
        setCanAnswer(false)
      }
    })
    
    // Buzzer activated
    socket.on('buzzer-activated', () => {
      setBuzzerActive(true)
      setIsReading(false)
      setCanAnswer(false)
    })
    
    // Buzzer winner
    socket.on('buzzer-winner', (data) => {
      setBuzzerWinner(data.winner)
      setBuzzerLocked(true)
      setBuzzerStartTime(Date.now())
      setTimerPhase('BUZZER')
      setTotalTime(10) // BUZZER_ANSWER constant is 10
      setTimeRemaining(10)
      
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
  
  // Timer effect
  useEffect(() => {
    if (!currentQuestion) return

    timerRef.current = setInterval(() => {
      if (buzzerWinner && buzzerStartTime) {
        const elapsed = Math.floor((Date.now() - buzzerStartTime) / 1000)
        const remaining = Math.max(0, 10 - elapsed)
        setTimeRemaining(remaining)
        if (remaining === 0) clearInterval(timerRef.current)
        return
      }

      if (questionStartTime) {
        const totalElapsed = Math.floor((Date.now() - questionStartTime) / 1000)
        const readingTime = currentQuestion.readingTime || 0

        if (totalElapsed < readingTime) {
          setTimerPhase('READING')
          setTotalTime(readingTime)
          setTimeRemaining(readingTime - totalElapsed)
          setIsReading(true)
        } else {
          const questionElapsed = totalElapsed - readingTime
          const remaining = Math.max(0, currentQuestion.timeLimit - questionElapsed)
          
          if (timerPhase === 'READING') {
             setTimerPhase('QUESTION')
             setTotalTime(currentQuestion.timeLimit)
             setIsReading(false)
          }

          setTimeRemaining(remaining)
          if (remaining === 0) clearInterval(timerRef.current)
        }
      }
    }, 100)

    return () => clearInterval(timerRef.current)
  }, [currentQuestion, questionStartTime, buzzerWinner, buzzerStartTime, timerPhase])
  
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
      
      {/* Circular Timer */}
      <div className={`timer-circular-container-mobile ${timerPhase.toLowerCase()}-phase`}>
        <svg className="timer-svg-mobile" viewBox="0 0 100 100">
          <circle className="timer-bg-mobile" cx="50" cy="50" r="45" />
          <circle 
            className="timer-progress-mobile" 
            cx="50" 
            cy="50" 
            r="45"
            style={{
              strokeDashoffset: 283 - (283 * (timeRemaining / (totalTime || 1))),
              stroke: timeRemaining <= 3 ? 'var(--color-error)' : 
                      timerPhase === 'READING' ? '#3498db' :
                      timerPhase === 'BUZZER' ? 'var(--color-warning)' :
                      'var(--color-success)'
            }}
          />
        </svg>
        <div className="timer-content-mobile">
          <span className="timer-digits-mobile">{timeRemaining}</span>
          <span className="timer-unit-mobile">
            {timerPhase === 'READING' ? 'READING' : 
             timerPhase === 'BUZZER' ? 'GO!' : 'SEC'}
          </span>
        </div>
      </div>
      
      {/* Question */}
      <div className="question-container">
        {currentQuestion.imageUrl && (
          <div className="question-image-container">
            <img src={currentQuestion.imageUrl} alt="Question" className="question-image" />
          </div>
        )}
        <h2 className="question-text">{currentQuestion.text}</h2>
        <div className="question-meta">
          <span className="points-badge">+{currentQuestion.points} pts</span>
          {currentQuestion.negativePoints > 0 && (
            <span className="negative-badge">-{currentQuestion.negativePoints} for wrong</span>
          )}
        </div>
      </div>
      
      {/* Buzzer or Answer Options */}
      {(currentQuestion.type === 'BUZZER' || currentQuestion.type === 'ORAL_BUZZER') && buzzerActive && !buzzerWinner ? (
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
                {currentQuestion.type === 'ORAL_BUZZER' ? (
                  <div className="oral-instruction">
                    <div className="mic-icon">🎤</div>
                    <p className="highlight-text">ANSWER ORALLY NOW!</p>
                    <p>The host will mark your answer.</p>
                  </div>
                ) : (
                  <p>Select your answer below</p>
                )}
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
      ) : currentQuestion.type === 'ORAL_OPEN' ? (
        <div className="oral-instruction">
          <div className="mic-icon">🎤</div>
          <p className="highlight-text">LISTEN TO THE HOST!</p>
          <p>They might pick you to answer orally.</p>
        </div>
      ) : isReading && (currentQuestion.type === 'BUZZER' || currentQuestion.type === 'ORAL_BUZZER') ? (
        <div className="reading-indicator">
          <div className="pulse-dot"></div>
          <p>Read the question... Buzzer opening soon!</p>
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
      {canAnswer && !answerSubmitted && !['SHORT_ANSWER', 'ORAL_BUZZER'].includes(currentQuestion.type) && (
        <AnswerOptions 
          options={currentQuestion.options}
          optionImages={currentQuestion.optionImages}
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
