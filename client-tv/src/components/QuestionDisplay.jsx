import { useState, useEffect, useRef } from 'react'
import Leaderboard from './Leaderboard'
import FinalResultsDisplay from './FinalResultsDisplay'
import { SOCKET_EVENTS, TIME_LIMITS } from '../../../shared/constants'
import MusicControls from './MusicControls'
import Icon from './common/Icon'
import MarksEditor from './MarksEditor'
import { TurnCard, ClueBoardTV, TeamRoundRecap, formatLabel, VerdictBanner, RoundBanner } from './TeamBits'
import { playSfx } from '../utils/sfx'
import './QuestionDisplay.css'

// Host-only explanations for the fairness flags the server attaches.
const FLAG_INFO = {
  CLAMPED: 'Phone reported a faster time than the network allows — server time used',
  LAG_SPIKE: 'Unusually slow connection this round — latency credit capped',
  NO_CLIENT_TIME: 'Phone sent no reaction time — server estimate used',
  NO_ACK: 'Phone did not confirm the buzzer opened — typical latency used',
  NO_RTT: 'No latency data — no compensation given',
  BOT_PATTERN: 'Consistently inhumanly fast and uniform — possible auto-tapper'
}
const SERIOUS_FLAGS = new Set(['CLAMPED', 'BOT_PATTERN'])

// "Clue" and "Clue round" say the same thing: show the format tag only when it adds something.
const sameTag = (a, b) => {
  const x = String(a || '').trim().toLowerCase(), y = String(b || '').trim().toLowerCase()
  return Boolean(x && y && (x.includes(y) || y.includes(x)))
}

/** Countdown ring for the header: drains clockwise, turns red for the last 5 seconds. */
function TimerRing({ remaining, total, phase, stopped = false, held = false, paused = false }) {
  const r = 44, c = 2 * Math.PI * r
  const frac = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0
  const low = !stopped && !held && !paused && phase !== 'READING' && remaining <= 5
  return (
    <div className={`tv-timer ${phase.toLowerCase()} ${low ? 'low' : ''} ${stopped || held || paused ? 'stopped' : ''} ${paused ? 'paused' : ''}`} role="timer" aria-label={stopped ? 'Time stopped' : paused ? 'Timer paused' : held ? 'Timer waiting' : `${remaining} seconds left`}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r={r} className="tv-timer-track" />
        <circle cx="50" cy="50" r={r} className="tv-timer-bar" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} />
      </svg>
      <div className="tv-timer-text">
        <b>{remaining}</b>
        <small>{stopped ? 'Done' : paused ? 'Paused' : held ? 'Ready' : phase === 'READING' ? 'Read' : phase === 'BUZZER' ? 'Buzz' : 'Sec'}</small>
      </div>
    </div>
  )
}

/** Host panel: who pressed, their judged times, flags, and re-award buttons. */
function BuzzReview({ result, winnerId, canOverride, onAward }) {
  const winnerFlags = result.ranking.find(r => r.participantId === winnerId)?.flags || []
  const suspicious = winnerFlags.some(f => SERIOUS_FLAGS.has(f))
  const [open, setOpen] = useState(suspicious)
  const slowest = Math.max(1, ...result.ranking.map(r => r.reactionMs || 0))
  return (
    <div className={`buzz-review ${suspicious ? 'suspicious' : ''} ${open ? 'open' : ''}`}>
      <button className="buzz-review-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span className="buzz-review-icon"><Icon name={suspicious ? 'alert' : 'clock'} /></span>
        <span className="buzz-review-title">{suspicious ? 'Check this buzz' : 'Buzz details'}</span>
        <span className="buzz-review-meta">
          {result.ranking.length} buzz{result.ranking.length === 1 ? '' : 'es'}
          {result.falseStarts > 0 && ` · ${result.falseStarts} false start${result.falseStarts > 1 ? 's' : ''}`}
        </span>
        <span className="buzz-review-caret">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <ol className="buzz-review-list">
          {result.ranking.map((r, i) => (
            <li key={r.participantId} className={r.participantId === winnerId ? 'is-winner' : ''}>
              <span className="buzz-pos">{r.participantId === winnerId ? <Icon name="trophy" /> : i + 1}</span>
              <span className="buzz-name">{r.participantName}</span>
              <span className="buzz-bar"><i style={{ width: `${Math.max(6, ((r.reactionMs || 0) / slowest) * 100)}%` }} /></span>
              <span className="buzz-ms">{r.reactionMs} ms</span>
              <span className="buzz-flags">
                {r.flags?.filter(f => FLAG_INFO[f]).map(f => (
                  <span key={f} className={`buzz-flag ${SERIOUS_FLAGS.has(f) ? 'serious' : ''}`} title={FLAG_INFO[f]}>{f.replaceAll('_', ' ').toLowerCase()}</span>
                ))}
              </span>
              {canOverride && r.participantId !== winnerId
                ? <button className="buzz-award" onClick={() => onAward(r.participantId)}>Award</button>
                : <span className="buzz-award-spacer" />}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function QuestionDisplay({ socket, sessionData, userRole, audioManager, initialGameState }) {
  const [currentQuestion, setCurrentQuestion] = useState(initialGameState?.currentQuestion || null)
  const [questionStartTime, setQuestionStartTime] = useState(initialGameState?.startTime || null)
  const [timerPhase, setTimerPhase] = useState(() => {
    if (!initialGameState) return 'READING';
    if (!initialGameState.startTime) return 'QUESTION'; // held: teacher is reading
    const totalElapsed = Math.floor((Date.now() - initialGameState.startTime) / 1000);
    const readingTime = initialGameState.currentQuestion.readingTime || 0;
    return totalElapsed < readingTime ? 'READING' : 'QUESTION';
  })
  const [timeRemaining, setTimeRemaining] = useState(() => {
    if (!initialGameState) return 0;
    if (!initialGameState.startTime) return initialGameState.currentQuestion.timeLimit;
    const totalElapsed = Math.floor((Date.now() - initialGameState.startTime) / 1000);
    const readingTime = initialGameState.currentQuestion.readingTime || 0;
    if (totalElapsed < readingTime) return readingTime - totalElapsed;
    const questionElapsed = totalElapsed - readingTime;
    return Math.max(0, initialGameState.currentQuestion.timeLimit - questionElapsed);
  })
  const [totalTime, setTotalTime] = useState(() => {
    if (!initialGameState) return 0;
    if (!initialGameState.startTime) return initialGameState.currentQuestion.timeLimit;
    const totalElapsed = Math.floor((Date.now() - initialGameState.startTime) / 1000);
    const readingTime = initialGameState.currentQuestion.readingTime || 0;
    return totalElapsed < readingTime ? readingTime : initialGameState.currentQuestion.timeLimit;
  })
  
  // A reconnect mid-buzzer brings back who buzzed first (so the host can still mark it).
  const [buzzerWinner, setBuzzerWinner] = useState(initialGameState?.buzzer?.winner || null)
  const [buzzResult, setBuzzResult] = useState(initialGameState?.buzzer || null) // { fairness, ranking, falseStarts }
  const [buzzerStartTime, setBuzzerStartTime] = useState(null)
  const [isBuzzerPhase, setIsBuzzerPhase] = useState(false)
  const [leaderboard, setLeaderboard] = useState([])
  const [showResults, setShowResults] = useState(false)
  const [questionResults, setQuestionResults] = useState(null)
  const [roundResults, setRoundResults] = useState(null)
  // Competition (team) mode
  const [turn, setTurn] = useState(initialGameState?.currentQuestion?.turn || null)
  const [tried, setTried] = useState([])
  const [turnResult, setTurnResult] = useState(null)
  // Audience view: big verdict after each answer, who picked which option, round rules banner
  const [verdict, setVerdict] = useState(null)
  // Read-aloud + timer controls
  const [paused, setPaused] = useState(Boolean(initialGameState?.pausedAt))
  const [readAloud, setReadAloud] = useState(Boolean(sessionData?.readAloud))
  const [pickedBy, setPickedBy] = useState([]) // [{ name, answer, isCorrect }] for the current question
  const [roundBanner, setRoundBanner] = useState(false)
  const verdictTimer = useRef(null)
  const bannerTimer = useRef(null)
  const sfx = (kind) => playSfx(kind, { muted: audioManager?.isMuted, volume: audioManager?.volume ?? 0.5 })
  const sfxRef = useRef(sfx)
  sfxRef.current = sfx
  const [clueLocked, setClueLocked] = useState([])
  const [eliminatedNow, setEliminatedNow] = useState([])
  const toastTimer = useRef(null)
  const [showMarks, setShowMarks] = useState(false) // host: "Fix marks" panel
  const currentQIdRef = useRef(null)
  currentQIdRef.current = currentQuestion?.id || null
  
  const [participants, setParticipants] = useState([]);
  const [selectedParticipant, setSelectedParticipant] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');

  const timerRef = useRef(null)

  useEffect(() => {
    // Reset selected participant when question changes
    setSelectedParticipant(null);
    setSearchTerm('');
    
    // Fetch participants for picking in ORAL_OPEN
    if ((currentQuestion?.type === 'ORAL_OPEN' || currentQuestion?.type === 'CLUE') && userRole === 'host') {
      socket.emit('get-participants', (data) => {
        if (data && data.participants) {
          setParticipants(data.participants);
        }
      });
    }
  }, [currentQuestion, userRole, socket]);



  useEffect(() => {
    if (!socket) return

    // Question started
    socket.on('question-started', (data) => {
      console.log('TV: question-started', data.question.id);
      setCurrentQuestion(data.question)
      setQuestionStartTime(data.startTime)
      const readingTime = data.question.readingTime || 0
      if (readingTime > 0) {
        setTimerPhase('READING')
        setTotalTime(readingTime)
        setTimeRemaining(readingTime)
      } else {
        setTimerPhase('QUESTION')
        setTotalTime(data.question.timeLimit)
        setTimeRemaining(data.question.timeLimit)
      }
      setBuzzerWinner(null)
      setBuzzResult(null)
      setBuzzerStartTime(null)
      setIsBuzzerPhase(false)
      setShowResults(false)
      setQuestionResults(null)
      setRoundResults(null) // Clear round results
      setTurn(data.question.turn || null)
      setTried([])
      setTurnResult(null)
      setClueLocked([])
      setEliminatedNow([])
      setVerdict(null)
      setPickedBy([])
      setPaused(false)
      clearTimeout(bannerTimer.current)
      if (data.question.roundInfo?.first) {
        // New round: explain its rules to the audience for a few seconds
        setRoundBanner(true)
        sfxRef.current('round')
        bannerTimer.current = setTimeout(() => setRoundBanner(false), 9000)
      } else {
        setRoundBanner(false)
      }

      // Play music
      audioManager?.play('QUESTION')
    })
    
    // Buzzer winner
    socket.on('buzzer-winner', (data) => {
      setBuzzerWinner(data.winner)
      setBuzzResult({
        fairness: data.fairness || null,
        ranking: data.ranking || [],
        falseStarts: data.falseStarts || 0
      })
      setBuzzerStartTime(Date.now())
      setIsBuzzerPhase(true)
      setTimerPhase('BUZZER')
      setTotalTime(TIME_LIMITS.BUZZER_ANSWER)
      setTimeRemaining(TIME_LIMITS.BUZZER_ANSWER)
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

      // Play music
      audioManager?.play('ANSWER')
    })
    
    // Round Ended
    socket.on('turn-passed', (data) => {
      setTurn((prev) => { if (prev) setTried((t) => [...t, prev.name]); return data.turn })
      setVerdict((v) => (v ? { ...v, passTo: { name: data.turn?.name, points: data.turn?.points } } : v))
      setCurrentQuestion((q) => (q && q.id === data.questionId ? { ...q, timeLimit: data.timeLimit, readingTime: 0 } : q))
      setQuestionStartTime(data.startTime)
      setTimerPhase('QUESTION')
      setTotalTime(data.timeLimit)
      setTimeRemaining(data.timeLimit)
    })

    socket.on('turn-result', (data) => {
      setTurnResult(data)
      setVerdict(data)
      if (data.answer) setPickedBy((p) => [...p, { name: data.name, answer: data.answer, isCorrect: data.isCorrect }])
      sfxRef.current(data.isCorrect ? 'correct' : 'wrong')
      clearTimeout(verdictTimer.current)
      verdictTimer.current = setTimeout(() => setVerdict(null), 3800)
    })

    socket.on('clue-revealed', (data) => {
      setCurrentQuestion((q) => (q && q.id === data.questionId ? { ...q, clues: data.clues, pointsNow: data.pointsNow } : q))
    })

    socket.on('clue-reopened', (data) => {
      setBuzzerWinner(null)
      setBuzzResult(null)
      setIsBuzzerPhase(false)
      setClueLocked(data.lockedOut || [])
    })

    socket.on('group-eliminated', (data) => {
      setEliminatedNow((prev) => [...prev, ...(data.groups || [])])
    })

    // Read-aloud: the host showed the options — they appear and the clock starts
    socket.on('question-released', (data) => {
      setCurrentQuestion((q) => (q && q.id === data.questionId ? { ...q, options: data.options, optionImages: data.optionImages, held: false } : q))
      setQuestionStartTime(data.startTime)
      setTimerPhase('QUESTION')
      setPaused(false)
      audioManager?.play('OPTIONS')
    })
    socket.on('timer-paused', (data) => { if (data.questionId === currentQIdRef.current) setPaused(true) })
    socket.on('timer-resumed', (data) => {
      if (data.questionId !== currentQIdRef.current) return
      setQuestionStartTime(data.startTime)
      setPaused(false)
    })
    socket.on('read-aloud-changed', (data) => setReadAloud(Boolean(data.on)))

    // Host fixed a mark: refresh the names shown for this question's results
    socket.on('marks-corrected', (data) => {
      if (data.questionId !== currentQIdRef.current) return
      setQuestionResults((prev) => prev ? {
        ...prev,
        correctNames: data.correctNames, incorrectNames: data.incorrectNames,
        correctCount: data.correctNames.length, incorrectCount: data.incorrectNames.length
      } : prev)
    })

    // Between rounds the summary (and who is at risk) follows the fixed marks
    socket.on('round-summary-updated', (data) => {
      setRoundResults((prev) => (prev && prev.round === data.round ? { ...prev, ...data } : prev))
    })

    socket.on('round-ended', (data) => {
      setRoundResults(data)
      setLeaderboard(data.leaderboard)
      setShowResults(false)

      // Play music
      audioManager?.play('ROUND_RESULTS')
    })

    // Analytics Ready (End of Quiz)
    socket.on('analytics-ready', (data) => {
      console.log('TV: analytics-ready', data);
      
      // Play music
      audioManager?.play('FINAL_RESULTS')
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
      socket.off('turn-passed')
      socket.off('turn-result')
      socket.off('clue-revealed')
      socket.off('clue-reopened')
      socket.off('group-eliminated')
      socket.off('marks-corrected')
      socket.off('round-summary-updated')
      socket.off('question-released')
      socket.off('timer-paused')
      socket.off('timer-resumed')
      socket.off('read-aloud-changed')
    }
  }, [socket])
  
  // Timer countdown (stops once the answer is shown, and while paused)
  useEffect(() => {
    if (!currentQuestion || showResults || paused) return
    
    timerRef.current = setInterval(() => {
      if (isBuzzerPhase && buzzerStartTime) {
        const elapsed = Math.floor((Date.now() - buzzerStartTime) / 1000)
        const remaining = Math.max(0, TIME_LIMITS.BUZZER_ANSWER - elapsed)
        setTimeRemaining(remaining)
        if (remaining === 0) clearInterval(timerRef.current)
        return
      }

      if (questionStartTime) {
        const totalElapsed = Math.floor((Date.now() - questionStartTime) / 1000)
        const readingTime = currentQuestion.readingTime || 0
        
        if (totalElapsed < readingTime) {
          // Phase 1: Reading
          setTimerPhase('READING')
          setTotalTime(readingTime)
          setTimeRemaining(readingTime - totalElapsed)
        } else {
          // Phase 2: Question
          const questionElapsed = totalElapsed - readingTime
          const remaining = Math.max(0, currentQuestion.timeLimit - questionElapsed)
          
          if (timerPhase === 'READING') {
            setTimerPhase('QUESTION')
            setTotalTime(currentQuestion.timeLimit)
            // Play music transition if not already handled
            if (audioManager?.currentTrack === audioManager?.tracks?.QUESTION) {
              audioManager?.play('OPTIONS');
            }
          }
          
          setTimeRemaining(remaining)

          if (remaining === 0) {
            clearInterval(timerRef.current)
          }
        }
      }
    }, 100)
    
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [currentQuestion, questionStartTime, isBuzzerPhase, buzzerStartTime, timerPhase, showResults, paused])

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
  
  const fixMarks = userRole === 'host' && (
    <>
      <button type="button" className="ds-btn ds-btn-sm tv-fix-marks" onClick={() => setShowMarks(true)} title="Change a group's result or points">
        <Icon name="pencil" /> Fix marks
      </button>
      {showMarks && <MarksEditor socket={socket} questionId={currentQuestion?.id} onClose={() => setShowMarks(false)} />}
    </>
  )

  // If Round Ended, show large Leaderboard
  if (roundResults?.mode === 'TEAMS') {
    return (
      <div className="question-display-tv fade-in round-recap">
        {fixMarks && <div className="tv-recap-tools">{fixMarks}</div>}
        <TeamRoundRecap
          data={roundResults}
          isHost={userRole === 'host'}
          eliminatedNow={eliminatedNow}
          onEliminate={(ids) => socket.emit('eliminate-group', { participantIds: ids })}
          onNextRound={() => socket.emit('next-question', { force: true })}
        />
      </div>
    )
  }

  if (roundResults) {
    return (
      <div className="question-display-tv fade-in round-recap">
        {fixMarks && <div className="tv-recap-tools">{fixMarks}</div>}
        <div className="round-recap-content">
          <h1 className="recap-title">End of Round {roundResults.round}</h1>
          <h2 className="recap-subtitle">Next: Round {roundResults.nextRound}</h2>
          
          <div className="recap-leaderboard">
            <Leaderboard leaderboard={leaderboard} variant="large" />
          </div>
          
          {userRole === 'host' && (
            <button
               onClick={() => socket.emit('next-question', { force: true })}
               className="start-round-btn"
            >
              Start Round {roundResults.nextRound} <Icon name="arrow-right" />
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
  
  const optionLabels = 'ABCDEFGH'
  
  return (
    <div className="question-display-tv fade-in">
      <div className="tv-grid">
        {/* Main Content */}
        <div className="main-content">
          {/* Header */}
          <div className="question-header">
            <div className="question-meta">
              <span className="question-number-tv">
                Question <b>{currentQuestion.questionNumber}</b><span>/{currentQuestion.totalQuestions}</span>
              </span>
              <span className="round-badge-tv">{currentQuestion.roundName || `Round ${currentQuestion.round}`}</span>
              {currentQuestion.format && !sameTag(formatLabel(currentQuestion.format), currentQuestion.roundName) && <span className="tm-chip">{formatLabel(currentQuestion.format)}</span>}
              {currentQuestion.roundPlan?.groups > 0 && currentQuestion.roundPlan.perGroup > 0 && (
                <span className="tm-chip soft" title={currentQuestion.roundPlan.bySubject
                  ? `${currentQuestion.roundPlan.groups} groups: each group gets one question from each of the ${currentQuestion.roundPlan.subjects} subjects${currentQuestion.roundPlan.playing < currentQuestion.roundPlan.total ? ` (${currentQuestion.roundPlan.playing} of ${currentQuestion.roundPlan.total} questions played)` : ''}`
                  : currentQuestion.roundPlan.playing < currentQuestion.roundPlan.total
                  ? `${currentQuestion.roundPlan.groups} groups: ${currentQuestion.roundPlan.playing} of ${currentQuestion.roundPlan.total} questions are played so every group gets the same number`
                  : `${currentQuestion.roundPlan.groups} groups`}>
                  {currentQuestion.roundPlan.perGroup} each
                </span>
              )}
              {currentQuestion.category && <span className="tm-chip soft">{currentQuestion.category}</span>}
            </div>
            <div className="header-actions">
              <div className="points-display">
                <span className="points-value">+{currentQuestion.type === 'CLUE' && currentQuestion.pointsNow != null ? currentQuestion.pointsNow : currentQuestion.points}</span>
                {currentQuestion.negativePoints > 0 && (
                  <span className="negative-value">-{currentQuestion.negativePoints}</span>
                )}
              </div>
              
              <TimerRing remaining={timeRemaining} total={totalTime} phase={timerPhase} stopped={showResults} held={Boolean(currentQuestion.held)} paused={paused} />
              {userRole === 'host' && (
                <button
                  onClick={() => { if (window.confirm('End the quiz now? Final results will be shown.')) socket.emit('end-quiz') }}
                  className="control-btn end-btn header-end-quiz"
                  title="End quiz"
                >
                  <Icon name="stop" /> End
                </button>
              )}
            </div>
          </div>
          
          
          {roundBanner && currentQuestion.roundInfo && <RoundBanner question={currentQuestion} />}

          {/* Question */}
          <div className="question-card card-gradient">
            {currentQuestion.imageUrl && (
              <div className="question-image-tv">
                <img src={currentQuestion.imageUrl} alt="Question" />
              </div>
            )}
            <h2 className="question-text-tv">{currentQuestion.text}</h2>
          </div>

          {currentQuestion.format === 'DIRECTED' && !showResults && <TurnCard turn={turn} tried={tried} />}
          {currentQuestion.held && (
            <div className="tv-held" role="status">
              <span className="tv-held-icon"><Icon name="mic" /></span>
              <div>
                <strong>Listen — the question is being read</strong>
                <small>{currentQuestion.type === 'BUZZER' || currentQuestion.type === 'ORAL_BUZZER'
                  ? 'The buzzer opens after the question is read.'
                  : currentQuestion.optionCount ? `${currentQuestion.optionCount} options appear next — then the timer starts.` : 'The timer starts when the reading is done.'}</small>
              </div>
            </div>
          )}
          {paused && !showResults && (
            <div className="tv-paused" role="status"><Icon name="pause" /> Timer paused</div>
          )}
          {currentQuestion.type === 'CLUE' && (
            <>
              <ClueBoardTV question={currentQuestion} reveal={showResults ? questionResults?.clues : null} />
              {!showResults && (
                <div className="tm-clue-status">
                  <span className="tm-worth-tv">Worth <b>{currentQuestion.pointsNow}</b> pts now</span>
                  {clueLocked.length > 0 && <span className="tm-locked-tv"><Icon name="lock" /> {participants.filter((p) => clueLocked.includes(p.id)).map((p) => p.name).join(', ') || `${clueLocked.length} locked out`}</span>}
                </div>
              )}
            </>
          )}
          <VerdictBanner verdict={verdict} />

          {/* Row for Correct Answer and Buzzer Winner */}
          {(showResults || buzzerWinner) && (
            <div className="results-row-wrapper">
              {/* Explicit Correct Answer Reveal */}
              {showResults && (currentQuestion.type === 'SHORT_ANSWER' || currentQuestion.type === 'BUZZER' || currentQuestion.type === 'TRUE_FALSE' || currentQuestion.type === 'ORAL_BUZZER' || currentQuestion.type === 'ORAL_OPEN' || currentQuestion.type === 'CLUE') && (
                <div className="revealed-answer-container fade-in">
                  <div className="revealed-answer-label">CORRECT ANSWER</div>
                  <div className="revealed-answer-box">
                    {currentQuestion.correctAnswer || 'N/A'}
                  </div>
                </div>
              )}
              
              {/* Buzzer Winner Display - Compact One Line */}
              {buzzerWinner && (
                <div className="buzz-winner-card" key={buzzerWinner.participantId}>
                  <span className="buzz-winner-avatar">{buzzerWinner.participantName?.charAt(0).toUpperCase()}<i><Icon name="bell" /></i></span>
                  <div className="buzz-winner-text">
                    <small>{buzzResult?.fairness?.overridden ? 'Awarded by host' : 'First to buzz'}</small>
                    <strong>{buzzerWinner.participantName}</strong>
                  </div>
                  {buzzResult?.fairness?.reactionMs != null && (
                    <div className="buzz-winner-stats">
                      <span><b>{buzzResult.fairness.reactionMs}</b> ms</span>
                      {buzzResult.fairness.marginMs != null && <span>ahead by <b>{buzzResult.fairness.marginMs}</b> ms</span>}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          
          {/* Answer Options or Oral Instructions */}
          {/* Spoken-answer panels make way for the revealed answer */}
          {(currentQuestion.type === 'ORAL_BUZZER' || currentQuestion.type === 'ORAL_OPEN') && showResults ? null
          : currentQuestion.type === 'ORAL_BUZZER' ? (
            <div className="oral-buzzer-info card-gradient">
              {!buzzerWinner ? (
                <div className="waiting-buzz">
                  <div className="pulse-icon"><Icon name="zap" /></div>
                  <p>Wait for the Buzzer!</p>
                </div>
              ) : (
                <div className="answering-now">
                  <div className="pulse-icon"><Icon name="mic" /></div>
                  <p>Answering Orally...</p>
                </div>
              )}
            </div>
          ) : currentQuestion.type === 'ORAL_OPEN' && currentQuestion.format !== 'DIRECTED' ? (
            <div className="oral-open-container">
              {userRole === 'host' && !showResults ? (
                <div className="participant-picker card-gradient">
                  <h3>Pick a student to answer:</h3>
                  <input 
                    type="text" 
                    placeholder="Search student..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="participant-search"
                  />
                  <div className="participant-grid">
                    {participants
                      .filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase()))
                      .map(p => (
                      <div 
                        key={p.id} 
                        className={`participant-chip ${selectedParticipant?.id === p.id ? 'selected' : ''}`}
                        onClick={() => setSelectedParticipant(p)}
                      >
                        {p.name}
                      </div>
                    ))}
                  </div>
                  
                  {selectedParticipant && (
                    <div className="selected-marking-actions fade-in">
                      <p>Marking <strong>{selectedParticipant.name}</strong>:</p>
                      <div className="oral-marking-controls">
                        <button
                          onClick={() => {
                            socket.emit('mark-participant-oral', { 
                              questionId: currentQuestion.id,
                              participantId: selectedParticipant.id,
                              isCorrect: true
                            });
                            setSelectedParticipant(null);
                          }}
                          className="control-btn correct-btn-large"
                        >
                          <Icon name="check" /> Correct
                        </button>
                        <button
                          onClick={() => {
                            socket.emit('mark-participant-oral', { 
                              questionId: currentQuestion.id,
                              participantId: selectedParticipant.id,
                              isCorrect: false
                            });
                            setSelectedParticipant(null);
                          }}
                          className="control-btn incorrect-btn-large"
                        >
                          <Icon name="x" /> Wrong
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="oral-buzzer-info card-gradient">
                   <div className="waiting-buzz">
                    <div className="pulse-icon"><Icon name="mic" /></div>
                    <p>{showResults ? 'Answered Orally' : 'Listen to Host'}</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="answer-grid-tv">
              {currentQuestion.options.map((option, index) => (
                <div
                  key={index}
                  className={`answer-card-tv ${showResults && option === currentQuestion.correctAnswer ? 'correct' : ''} ${showResults && option !== currentQuestion.correctAnswer ? 'dimmed' : ''}`}
                  style={{
                    '--option-color': optionColors[index % 4],
                    animationDelay: `${index * 100}ms`
                  }}
                >
                  <div className="option-label-tv">{optionLabels[index]}</div>
                  <div className="option-content-tv">
                    {currentQuestion.optionImages && currentQuestion.optionImages[index] && (
                      <img src={currentQuestion.optionImages[index]} alt="" className="option-image-tv" />
                    )}
                    <div className="option-text-tv">{option}</div>
                  </div>
                  {(() => {
                    // Which groups chose this option: from the reveal, or each answered turn so far
                    const names = showResults && questionResults?.picks
                      ? (questionResults.picks[option] || []).map((n) => ({ name: n, isCorrect: option === currentQuestion.correctAnswer }))
                      : pickedBy.filter((p) => p.answer === option)
                    return names.length > 0 && (
                      <div className="tv-picks">
                        {names.map((p) => <span key={p.name} className={p.isCorrect ? 'good' : 'bad'}>{p.name}</span>)}
                      </div>
                    )
                  })()}
                  {showResults && option === currentQuestion.correctAnswer && (
                    <div className="correct-indicator"><Icon name="circle-check" /></div>
                  )}
                </div>
              ))}
            </div>
          )}
          
          {/* Host Controls */}
          {userRole === 'host' && buzzerWinner && buzzResult?.ranking?.length > 0 && (
            <BuzzReview
              key={currentQuestion.id}
              result={buzzResult}
              winnerId={buzzerWinner.participantId}
              canOverride={!showResults}
              onAward={(participantId) => socket.emit('buzzer-override', {
                questionId: currentQuestion.id,
                participantId
              })}
            />
          )}

          {userRole === 'host' && (
            <div className="host-controls">
              {currentQuestion.format === 'DIRECTED' && turn && !showResults && !currentQuestion.held && (
                <div className="oral-marking-controls">
                  <button onClick={() => socket.emit('mark-turn', { questionId: currentQuestion.id, isCorrect: true })} className="control-btn correct-btn-large"><Icon name="check" /> {turn.name} correct</button>
                  <button onClick={() => socket.emit('mark-turn', { questionId: currentQuestion.id, isCorrect: false })} className="control-btn incorrect-btn-large"><Icon name="x" /> Wrong{turn.isPass ? '' : ' · pass'}</button>
                </div>
              )}
              {currentQuestion.type === 'CLUE' && !showResults && (
                buzzerWinner ? (
                  <div className="oral-marking-controls">
                    <button onClick={() => socket.emit('mark-turn', { questionId: currentQuestion.id, isCorrect: true })} className="control-btn correct-btn-large"><Icon name="check" /> Correct +{currentQuestion.pointsNow}</button>
                    <button onClick={() => socket.emit('mark-turn', { questionId: currentQuestion.id, isCorrect: false })} className="control-btn incorrect-btn-large"><Icon name="x" /> Wrong{currentQuestion.negativePoints ? ` −${currentQuestion.negativePoints}` : ''}</button>
                  </div>
                ) : (currentQuestion.clues?.length || 0) < (currentQuestion.cluesTotal || 0) && (
                  <button onClick={() => socket.emit('reveal-clue', { questionId: currentQuestion.id })} className="control-btn results-btn">
                    <Icon name="search" /> Reveal clue {(currentQuestion.clues?.length || 0) + 1} · {currentQuestion.cluePoints?.[currentQuestion.clues?.length || 0]} pts
                  </button>
                )
              )}
              {currentQuestion.type === 'ORAL_BUZZER' && buzzerWinner && !showResults && (
                <div className="oral-marking-controls">
                  <button
                    onClick={() => socket.emit('mark-buzzer-correct', { 
                      questionId: currentQuestion.id,
                      participantId: buzzerWinner.participantId 
                    })}
                    className="control-btn correct-btn-large"
                  >
                    <Icon name="check" /> Mark correct
                  </button>
                  <button
                    onClick={() => socket.emit('mark-buzzer-incorrect', { 
                      questionId: currentQuestion.id,
                      participantId: buzzerWinner.participantId 
                    })}
                    className="control-btn incorrect-btn-large"
                  >
                    <Icon name="x" /> Mark wrong
                  </button>
                </div>
              )}

              {currentQuestion.held && (
                <button onClick={() => socket.emit('release-question', { questionId: currentQuestion.id })} className="control-btn release-btn">
                  {currentQuestion.type === 'BUZZER' || currentQuestion.type === 'ORAL_BUZZER'
                    ? <><Icon name="bell" /> Open buzzer</>
                    : currentQuestion.optionCount ? <><Icon name="eye" /> Show options</> : <><Icon name="play" /> Start timer</>}
                </button>
              )}
              {!currentQuestion.held && !showResults && (
                <button onClick={() => socket.emit(paused ? 'resume-timer' : 'pause-timer', { questionId: currentQuestion.id })} className="control-btn pause-btn">
                  <Icon name={paused ? 'play' : 'pause'} /> {paused ? 'Resume timer' : 'Pause timer'}
                </button>
              )}
              {!showResults && (
                <button
                  onClick={() => socket.emit('show-results')}
                  className="control-btn results-btn"
                >
                  <Icon name="eye" /> Show answer
                </button>
              )}
              <button type="button" className="control-btn readaloud-btn" title="Teacher reads each question before the options appear (from the next question)"
                onClick={() => socket.emit('set-read-aloud', { on: !readAloud })}>
                <Icon name="mic" /> Teacher reads: {readAloud ? 'On' : 'Off'}
              </button>

              {showResults && (
                <button
                  onClick={() => socket.emit('next-question')}
                  className="control-btn next-btn"
                >
                  Next question <Icon name="arrow-right" />
                </button>
              )}

              {fixMarks}

              {/* Inline Results Stats */}
              {showResults && questionResults && (
                <div className="results-summary-inline">
                  <div className="res-stat good" title="Correct"><Icon name="circle-check" /> {questionResults.correctCount}</div>
                  <div className="res-stat bad" title="Wrong"><Icon name="circle-x" /> {questionResults.incorrectCount}</div>
                </div>
              )}
            </div>
          )}

          {/* Detailed Results (Names) - Kept separate but shrunken */}
          {showResults && questionResults && userRole === 'host' && (
            <div className="detailed-results-host slide-in-bottom">
               <div className="names-row">
                  <span className="names-correct"><Icon name="check" /> {questionResults.correctNames.join(', ') || 'None'}</span>
                  {questionResults.incorrectNames.length > 0 && (
                    <span className="names-incorrect"><Icon name="x" /> {questionResults.incorrectNames.join(', ')}</span>
                  )}
               </div>
            </div>
          )}
        </div>
        
        {/* Sidebar - Leaderboard */}
        <div className="sidebar">
          <Leaderboard leaderboard={leaderboard} buzzerWinner={buzzerWinner} />
          <MusicControls audioManager={audioManager} sessionData={sessionData} inline />
        </div>
      </div>

    </div>
  )
}


export default QuestionDisplay
