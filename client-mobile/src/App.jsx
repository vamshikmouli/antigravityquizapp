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
  
  const { socket, connected, error } = useWebSocket()
  
  const handleJoinSuccess = (code, participant) => {
    setSessionCode(code)
    setParticipantData(participant)
  }
  
  useEffect(() => {
    if (!socket) return
    
    // Listen for quiz start
    socket.on('start-quiz', () => {
      setQuizStatus('active')
    })
    
    // Listen for quiz end
    socket.on('end-quiz', () => {
      setQuizStatus('completed')
    })
    
    return () => {
      socket.off('start-quiz')
      socket.off('end-quiz')
    }
  }, [socket])
  
  return (
    <BrowserRouter>
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
                <Navigate to="/lobby" /> : 
                <JoinScreen socket={socket} onJoinSuccess={handleJoinSuccess} />
            } 
          />
          <Route 
            path="/lobby" 
            element={
              sessionCode ? 
                (quizStatus === 'active' ? 
                  <Navigate to="/quiz" /> : 
                  <LobbyScreen socket={socket} participantData={participantData} />
                ) : 
                <Navigate to="/" />
            } 
          />
          <Route 
            path="/quiz" 
            element={
              sessionCode && quizStatus === 'active' ? 
                (quizStatus === 'completed' ?
                  <Navigate to="/results" /> :
                  <QuizScreen socket={socket} participantData={participantData} />
                ) : 
                <Navigate to="/lobby" />
            } 
          />
          <Route 
            path="/results" 
            element={
              sessionCode && quizStatus === 'completed' ? 
                <ResultsScreen socket={socket} participantData={participantData} /> : 
                <Navigate to="/" />
            } 
          />
        </Routes>
      </div>
    </BrowserRouter>
  )
}

export default App
