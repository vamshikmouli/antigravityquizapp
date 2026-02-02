import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import JoinScreen from './components/JoinScreen'
import LobbyScreen from './components/LobbyScreen'
import QuizScreen from './components/QuizScreen'
import ResultsScreen from './components/ResultsScreen'
import { useWebSocket } from './hooks/useWebSocket'

function App() {
  const [sessionCode, setSessionCode] = useState(null)
  const [participantData, setParticipantData] = useState(null)
  const [quizStatus, setQuizStatus] = useState('waiting') // waiting, active, completed
  const [initialGameState, setInitialGameState] = useState(null)
  
  const { socket, connected, error } = useWebSocket()
  
  const handleJoinSuccess = (code, participant, currentGameState) => {
    setSessionCode(code)
    setParticipantData(participant)
    
    // Save to localStorage for rejoining
    localStorage.setItem('quiz-session', JSON.stringify({
      code,
      participantId: participant.id,
      name: participant.name
    }))

    if (currentGameState) {
      setInitialGameState(currentGameState)
      setQuizStatus(currentGameState.question ? 'active' : 'waiting')
    }
  }
  
  // Auto-rejoin on mount/connect
  useEffect(() => {
    if (!socket || !connected) return
    
    const savedSession = localStorage.getItem('quiz-session')
    if (savedSession) {
      try {
        const { code, participantId, name } = JSON.parse(savedSession)
        
        // Only emit if we haven't already joined with this specific socket ID
        // or if we need to re-establish the session after a disconnect
        console.log('Establishing session on connection:', code)
        
        socket.emit('join-session', {
          code,
          participantId,
          name,
          role: 'student'
        })
        
        // We use .on instead of .once here in case of multiple reconnections,
        // but it's better to just handle the response
        const handleRejoin = (data) => {
          handleJoinSuccess(data.session.code, data.participant, data.currentGameState)
          if (data.session.status === 'ACTIVE') setQuizStatus('active')
          if (data.session.status === 'COMPLETED') setQuizStatus('completed')
        }
        
        socket.once('session-joined', handleRejoin)
      } catch (err) {
        console.error('Failed to parse saved session:', err)
        localStorage.removeItem('quiz-session')
      }
    }
  }, [socket, connected])

  useEffect(() => {
    if (!socket) return
    
    // Listen for quiz start
    socket.on('start-quiz', () => {
      console.log('[Quiz] Start signal received');
      setQuizStatus('active')
    })
    
    // Listen for quiz end
    socket.on('end-quiz', (data) => {
      console.log('[Quiz] End signal received', data);
      setQuizStatus('completed')
    })
    
    return () => {
      socket.off('start-quiz')
      socket.off('end-quiz')
    }
  }, [socket])
  
  return (
    <BrowserRouter basename="/play">
      <div className="container">
        {/* Connection Status */}
        <div style={{ 
          position: 'fixed', 
          top: '10px', 
          right: '10px', 
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: 'rgba(0,0,0,0.5)',
          borderRadius: '20px',
          fontSize: '12px'
        }}>
          <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`}></span>
          {connected ? 'Connected' : 'Disconnected'}
        </div>
        
        {error && (
          <div style={{
            position: 'fixed',
            top: '60px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--color-error)',
            color: 'white',
            padding: '12px 24px',
            borderRadius: 'var(--radius-md)',
            zIndex: 1000
          }}>
            {error}
          </div>
        )}
        
        <Routes>
          <Route 
            path="/" 
            element={
              sessionCode ? 
                (quizStatus === 'completed' ? <Navigate to="/results" /> : 
                 quizStatus === 'active' ? <Navigate to="/quiz" /> : 
                 <Navigate to="/lobby" />) : 
                <JoinScreen socket={socket} onJoinSuccess={handleJoinSuccess} />
            } 
          />
          <Route 
            path="/lobby" 
            element={
              sessionCode ? 
                (quizStatus === 'completed' ? <Navigate to="/results" /> : 
                 quizStatus === 'active' ? <Navigate to="/quiz" /> : 
                 <LobbyScreen socket={socket} participantData={participantData} />) : 
                <Navigate to="/" />
            } 
          />
          <Route 
            path="/quiz" 
            element={
              sessionCode ? 
                (quizStatus === 'completed' ? <Navigate to="/results" /> : 
                 quizStatus === 'active' ? 
                 <QuizScreen 
                   socket={socket} 
                   participantData={participantData} 
                   initialGameState={initialGameState}
                 /> : 
                 <Navigate to="/lobby" />) : 
                <Navigate to="/" />
            } 
          />
          <Route 
            path="/results" 
            element={
              sessionCode && quizStatus === 'completed' ? 
                <ResultsScreen socket={socket} participantData={participantData} /> : 
                (sessionCode && quizStatus === 'active' ? <Navigate to="/quiz" /> : <Navigate to="/" />)
            } 
          />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
