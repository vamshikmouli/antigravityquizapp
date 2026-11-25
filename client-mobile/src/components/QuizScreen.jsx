import { useState, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import BuzzerButton from './BuzzerButton'

// The pointer event's own timestamp is on the performance.now() clock in
// modern browsers. Very old WebViews used epoch ms; fall back to now() then.
function eventTime(e) {
  const now = performance.now()
  const ts = e?.timeStamp
  return typeof ts === 'number' && ts > 0 && ts <= now + 5 && now - ts < 1000 ? ts : now
}
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
  // Fair buzzer: 'idle' | 'armed' | 'open' | 'pressed' | 'falseStart'
  const [buzzerPhase, setBuzzerPhase] = useState('idle')
  const [buzzResult, setBuzzResult] = useState(null) // fairness + ranking from the server

  const timerRef = useRef(null)
  const roundIdRef = useRef(null)
  const shownAtRef = useRef(null)    // performance.now() when the open buzzer was painted
  const buzzerPhaseRef = useRef('idle')
  const setPhase = (p) => { buzzerPhaseRef.current = p; setBuzzerPhase(p) }

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
      setPhase('idle')
      setBuzzResult(null)
      roundIdRef.current = null
      shownAtRef.current = null

      // For non-buzzer questions, enable answering immediately
      if (!['BUZZER', 'ORAL_BUZZER'].includes(data.question.type)) {
        setCanAnswer(true)
      } else {
        setCanAnswer(false)
      }
    })
    
    // Get ready: paint the (grey) buzzer now so opening it later is one cheap frame.
    socket.on('buzzer-armed', (data) => {
      roundIdRef.current = data?.roundId || null
      setIsReading(false)
      setCanAnswer(false)
      if (buzzerPhaseRef.current !== 'falseStart') setPhase('armed')
    })

    // Buzzer open. Commit the DOM synchronously, then stamp the frame it is
    // painted in and ack — the server uses that ack as this phone's
    // down + render + up latency for this round.
    socket.on('buzzer-activated', (data, ack) => {
      if (data?.roundId) roundIdRef.current = data.roundId
      const lockedOut = buzzerPhaseRef.current === 'falseStart'
      flushSync(() => {
        setBuzzerActive(true)
        setIsReading(false)
        setCanAnswer(false)
        if (!lockedOut) setPhase('open')
      })
      const stamp = () => {
        shownAtRef.current = performance.now()
        if (typeof ack === 'function') ack()
      }
      if (document.hidden) stamp()
      else requestAnimationFrame(stamp)
    })

    // Server says this player jumped early (or impossibly fast).
    socket.on('buzzer-false-start', () => {
      setPhase('falseStart')
    })

    // Buzzer winner (also re-sent if the host re-awards the buzz)
    socket.on('buzzer-winner', (data) => {
      setBuzzerWinner(data.winner)
      setBuzzResult({ fairness: data.fairness || null, ranking: data.ranking || [] })
      setBuzzerLocked(true)
      setBuzzerStartTime(Date.now())
      setTimerPhase('BUZZER')
      setTotalTime(10) // BUZZER_ANSWER constant is 10
      setTimeRemaining(10)

      // Only the (current) winner may answer
      setCanAnswer(data.winner.participantId === participantData.id)
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
      socket.off('buzzer-armed')
      socket.off('buzzer-activated')
      socket.off('buzzer-false-start')
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
          if (remaining === 0) {
            clearInterval(timerRef.current)
            if (timerPhase === 'QUESTION' || timerPhase === 'BUZZER') {
              setCanAnswer(false)
            }
          }
        }
      }
    }, 100)

    return () => clearInterval(timerRef.current)
  }, [currentQuestion, questionStartTime, buzzerWinner, buzzerStartTime, timerPhase])
  
  const handleBuzzerPress = (e) => {
    if (!socket || !currentQuestion) return
    const tapAt = eventTime(e)
    const phase = buzzerPhaseRef.current

    if (phase === 'armed') {
      // Tapped before it opened: false start (only ever hurts the tapper).
      setPhase('falseStart')
      socket.emit('buzzer-press', {
        questionId: currentQuestion.id,
        roundId: roundIdRef.current,
        falseStart: true
      })
      return
    }
    if (phase !== 'open' || buzzerLocked) return

    setPhase('pressed')
    const reactionMs = shownAtRef.current != null ? Math.max(0, Math.round(tapAt - shownAtRef.current)) : null
    socket.emit('buzzer-press', {
      questionId: currentQuestion.id,
      roundId: roundIdRef.current,
      reactionMs
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
        <div className="header-left">
          <div className="header-top-row">
            <div className="question-badge">
              <span className="q-label">Q</span>
              <span className="q-numbers">{currentQuestion.questionNumber}/{currentQuestion.totalQuestions}</span>
            </div>
            <div className="round-info-badge">
              R{currentQuestion.round}
            </div>
          </div>
          
          <div className="header-bottom-row">
            <div className="stat-badge score-badge">
              <div className="stat-icon">💰</div>
              <div className="stat-details">
                <span className="stat-label">SCORE</span>
                <span className="stat-value">{score}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="header-right">
          {rank && (
            <div className="stat-badge rank-badge">
              <div className="stat-icon">🏆</div>
              <div className="stat-details">
                <span className="stat-label">RANK</span>
                <span className="stat-value">#{rank}</span>
              </div>
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
      {(currentQuestion.type === 'BUZZER' || currentQuestion.type === 'ORAL_BUZZER') && buzzerPhase !== 'idle' && !buzzerWinner ? (
        <BuzzerButton
          phase={buzzerPhase}
          onPress={handleBuzzerPress}
          timeRemaining={timeRemaining}
        />
      ) : buzzerWinner ? (
        <div className="buzzer-winner-display">
          {(() => {
            const won = buzzerWinner.participantId === participantData.id
            const theirs = buzzResult?.fairness?.reactionMs
            const margin = buzzResult?.fairness?.marginMs
            const mine = buzzResult?.ranking?.find(r => r.participantId === participantData.id)
            const slowest = Math.max(1, theirs || 0, mine?.reactionMs || 0)
            return won ? (
              <div className="bz-result won">
                <div className="bz-result-icon">🏆</div>
                <h3>You buzzed first!</h3>
                {theirs != null && (
                  <div className="bz-result-chips">
                    <span><b>{theirs}</b> ms reaction</span>
                    {margin != null && <span>ahead by <b>{margin}</b> ms</span>}
                  </div>
                )}
                {currentQuestion.type === 'ORAL_BUZZER' ? (
                  <div className="bz-result-say">🎤 <strong>Answer out loud now!</strong><span>The host will mark your answer.</span></div>
                ) : (
                  <p className="bz-result-next">Pick your answer below 👇</p>
                )}
              </div>
            ) : (
              <div className="bz-result">
                <div className="bz-result-avatar">{buzzerWinner.participantName?.charAt(0).toUpperCase()}</div>
                <h3>{buzzerWinner.participantName} buzzed first</h3>
                {mine && theirs != null && (
                  <div className="bz-compare">
                    <div><span>{buzzerWinner.participantName}</span><i style={{ width: `${Math.max(8, (theirs / slowest) * 100)}%` }} /><b>{theirs} ms</b></div>
                    <div className="me"><span>You</span><i style={{ width: `${Math.max(8, (mine.reactionMs / slowest) * 100)}%` }} /><b>{mine.reactionMs} ms</b></div>
                  </div>
                )}
                {!mine && buzzerPhase === 'falseStart' && <p className="bz-result-note bad">You were locked out (false start).</p>}
                <p className="bz-result-note">Waiting for their answer…</p>
              </div>
            )
          })()}
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
      
      {/* Time's Up Overlay */}
      {timeRemaining === 0 && !answerSubmitted && !feedback && (
        <div className="times-up-overlay fade-in">
          <div className="times-up-content">
            <div className="alarm-icon">⏳</div>
            <h2>TIME'S UP!</h2>
            <p>You didn't submit an answer in time.</p>
          </div>
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
