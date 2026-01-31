import { useState, useEffect, useRef } from 'react'
import Leaderboard from './Leaderboard'
import FinalResultsDisplay from './FinalResultsDisplay'
import './QuestionDisplay.css'

function QuestionDisplay({ socket, sessionData, userRole }) {
  const [currentQuestion, setCurrentQuestion] = useState(null)
  const [questionStartTime, setQuestionStartTime] = useState(null)
  const [timeRemaining, setTimeRemaining] = useState(0)
  const [buzzerWinner, setBuzzerWinner] = useState(null)
  const [leaderboard, setLeaderboard] = useState([])
  const [showResults, setShowResults] = useState(false)
  const [questionResults, setQuestionResults] = useState(null)
  const [roundResults, setRoundResults] = useState(null)
  
  const timerRef = useRef(null)
  
  useEffect(() => {
    if (!socket) return
    
    // Question started
    socket.on('question-started', (data) => {
      console.log('TV: question-started', data.question.id);
      setCurrentQuestion(data.question)
      setQuestionStartTime(data.startTime)
      setTimeRemaining(data.question.timeLimit)
      setBuzzerWinner(null)
      setShowResults(false)
      setQuestionResults(null)
      setRoundResults(null) // Clear round results
    })
    
    // Buzzer winner
    socket.on('buzzer-winner', (data) => {
      setBuzzerWinner(data.winner)
    })
    
    // Leaderboard update
    socket.on('leaderboard-update', (data) => {
      setLeaderboard(data.leaderboard || [])
    })
    
    // Show results
    socket.on('show-results', (data) => {
      setShowResults(true)
      setQuestionResults(data)
      // Inject correct answer into currentQuestion for highlighting
      setCurrentQuestion(prev => prev ? { ...prev, correctAnswer: data.correctAnswer } : prev)
    })
    
    // Round Ended
    socket.on('round-ended', (data) => {
      setRoundResults(data)
      setLeaderboard(data.leaderboard)
      setShowResults(false)
    })

    // Analytics Ready (End of Quiz)
    socket.on('analytics-ready', (data) => {
      console.log('TV: analytics-ready', data);
      setFinalAnalytics(data.analytics)
    })

    // Trigger next question (from server automation)
    socket.on('trigger-next-question', () => {
      socket.emit('next-question')
    })
    
    return () => {
      socket.off('question-started')
      socket.off('buzzer-winner')
      socket.off('leaderboard-update')
      socket.off('show-results')
      socket.off('round-ended')
      socket.off('trigger-next-question')
    }
  }, [socket])
  
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
  
  if (!currentQuestion) {
    return (
      <div className="question-display-tv">
        <div className="waiting-question">
          <div className="spinner"></div>
          <h2>Waiting for next question...</h2>
        </div>
      </div>
    )
  }
  
  // If Round Ended, show large Leaderboard
  if (roundResults) {
    return (
      <div className="question-display-tv fade-in round-recap">
        <div className="round-recap-content">
          <h1 className="recap-title">End of Round {roundResults.round}</h1>
          <h2 className="recap-subtitle">Next: Round {roundResults.nextRound}</h2>
          
          <div className="recap-leaderboard">
            <Leaderboard leaderboard={leaderboard} />
          </div>
          
          {userRole === 'host' && (
            <button
               onClick={() => socket.emit('next-question', { force: true })}
               className="start-round-btn"
            >
              Start Round {roundResults.nextRound} ⏭️
            </button>
          )}
        </div>
      </div>
    )
  }
  
  const optionColors = {
    0: 'var(--color-option-a)',
    1: 'var(--color-option-b)',
    2: 'var(--color-option-c)',
    3: 'var(--color-option-d)'
  }
  
  const optionLabels = ['A', 'B', 'C', 'D']
  
  return (
    <div className="question-display-tv fade-in">
      <div className="tv-grid">
        {/* Main Content */}
        <div className="main-content">
          {/* Header */}
          <div className="question-header">
            <div className="question-meta">
              <span className="question-number-tv">
                Question {currentQuestion.questionNumber}/{currentQuestion.totalQuestions}
              </span>
              <span className="round-badge-tv">Round {currentQuestion.round}</span>
            </div>
            <div className="points-display">
              <span className="points-value">+{currentQuestion.points}</span>
              {currentQuestion.negativePoints > 0 && (
                <span className="negative-value">-{currentQuestion.negativePoints}</span>
              )}
            </div>
          </div>
          
          {/* Timer */}
          <div className="timer-bar-container">
            <div
              className="timer-bar-fill"
              style={{
                width: `${(timeRemaining / currentQuestion.timeLimit) * 100}%`,
                backgroundColor: timeRemaining <= 5 ? 'var(--color-error)' : 'var(--color-success)'
              }}
            ></div>
            <div className="timer-text-tv">{timeRemaining}s</div>
          </div>
          
          {/* Question */}
          <div className="question-card card-gradient">
            <h2 className="question-text-tv">{currentQuestion.text}</h2>
          </div>
          
          {/* Buzzer Winner Display */}
          {buzzerWinner && (
            <div className="buzzer-winner-tv slide-in-left">
              <div className="winner-icon">🏆</div>
              <div className="winner-info">
                <div className="winner-label">First to Buzz!</div>
                <div className="winner-name">{buzzerWinner.participantName}</div>
              </div>
            </div>
          )}
          
          {/* Answer Options */}
          <div className="answer-grid-tv">
            {currentQuestion.options.map((option, index) => (
              <div
                key={index}
                className={`answer-card-tv ${showResults && option === currentQuestion.correctAnswer ? 'correct' : ''} ${showResults && option !== currentQuestion.correctAnswer ? 'dimmed' : ''}`}
                style={{
                  '--option-color': optionColors[index],
                  animationDelay: `${index * 100}ms`
                }}
              >
                <div className="option-label-tv">{optionLabels[index]}</div>
                <div className="option-text-tv">{option}</div>
                {showResults && option === currentQuestion.correctAnswer && (
                  <div className="correct-indicator">✓</div>
                )}
              </div>
            ))}
          </div>
          
          {/* Host Controls */}
          {userRole === 'host' && (
            <div className="host-controls">
              {!showResults ? (
                <button
                  onClick={() => socket.emit('show-results')}
                  className="control-btn results-btn"
                >
                  Show Answer 👁️
                </button>
              ) : (
                <button
                  onClick={() => socket.emit('next-question')}
                  className="control-btn next-btn"
                >
                  Next Question ⏭️
                </button>
              )}
              
              <button
                onClick={() => socket.emit('end-quiz')}
                className="control-btn end-btn"
              >
                End Quiz ⏹️
              </button>
            </div>
          )}

          {/* Results Summary */}
          {showResults && questionResults && (
            <div className="results-summary slide-in-left">
              <div className="result-row">
                 <div className="result-stat">
                  <div className="stat-icon">✅</div>
                  <div className="stat-text">
                    <span className="stat-val">{questionResults.correctCount}</span> Correct
                  </div>
                </div>
                 <div className="result-stat">
                  <div className="stat-icon">❌</div>
                  <div className="stat-text">
                    <span className="stat-val">{questionResults.incorrectCount}</span> Wrong
                  </div>
                </div>
              </div>
              
              {userRole === 'host' && (
                <div className="host-names-list">
                   <div className="correct-names">
                      <strong>Correct:</strong> {questionResults.correctNames.join(', ') || 'None'}
                   </div>
                   {questionResults.incorrectNames.length > 0 && (
                     <div className="incorrect-names">
                        <strong>Incorrect:</strong> {questionResults.incorrectNames.join(', ')}
                     </div>
                   )}
                </div>
              )}
            </div>
          )}
        </div>
        
        {/* Sidebar - Leaderboard */}
        <div className="sidebar">
          <Leaderboard leaderboard={leaderboard} buzzerWinner={buzzerWinner} />
        </div>
      </div>
    </div>
  )
}


export default QuestionDisplay
