import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import JoinSession from './components/JoinSession'
import WaitingLobby from './components/WaitingLobby'
import QuestionDisplay from './components/QuestionDisplay'
import ResultsDisplay from './components/ResultsDisplay'
import LoginScreen from './components/LoginScreen'
import RegisterScreen from './components/RegisterScreen'
import HostDashboard from './components/HostDashboard'
import QuestionsPage from './components/QuestionsPage'
import CreateSessionPage from './components/CreateSessionPage'
import { AuthProvider, useAuth } from './context/AuthContext'
import { useWebSocket } from './hooks/useWebSocket'

// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <div className="spinner"></div>;
  if (!user) return <Navigate to="/login" />;
  return children;
};

// Auto-connector for Host launching session
const LobbyConnect = ({ socket, onJoinSuccess }) => {
  const { state } = useLocation();
  const [error, setError] = useState('');
  
  useEffect(() => {
    if (state?.code && state?.isHost && socket) {
      socket.emit('join-session', {
        code: state.code,
        role: 'host'
      });
      
      const handleJoined = (data) => {
        onJoinSuccess(data.session.code, data.session, 'host');
      };
      
      const handleError = (data) => {
        setError(data.message);
      };

      socket.once('session-joined', handleJoined);
      socket.once('error', handleError);
      
      return () => {
        socket.off('session-joined', handleJoined);
        socket.off('error', handleError);
      };
    }
  }, [state, socket]);

  if (error) return <div className="error-message">{error}</div>;
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="spinner"></div>
      <p style={{ marginLeft: '10px' }}>Connecting to session...</p>
    </div>
  );
};

function AppContent() {
  const [sessionCode, setSessionCode] = useState(null)
  const [sessionData, setSessionData] = useState(null)
  const [quizStatus, setQuizStatus] = useState('waiting')
  const [userRole, setUserRole] = useState('display')
  
  const { socket, connected, error } = useWebSocket()
  
  const handleJoinSuccess = (code, session, role = 'display') => {
    setSessionCode(code)
    setSessionData(session)
    setUserRole(role)
  }
  
  useEffect(() => {
    if (!socket) return
    
    socket.on('start-quiz', () => {
      setQuizStatus('active')
    })
    
    socket.on('end-quiz', () => {
      setQuizStatus('completed')
    })
    
    return () => {
      socket.off('start-quiz')
      socket.off('end-quiz')
    }
  }, [socket])

  // If in a session, show session screens
  if (sessionCode) {
    return (
      <Routes>
        <Route path="*" element={
          quizStatus === 'active' ? (
             quizStatus === 'completed' ? 
               <ResultsDisplay socket={socket} sessionData={sessionData} userRole={userRole} /> : 
               <QuestionDisplay socket={socket} sessionData={sessionData} userRole={userRole} />
          ) : (
            <WaitingLobby socket={socket} sessionData={sessionData} userRole={userRole} />
          )
        } />
      </Routes>
    );
  }

  return (
    <div className="tv-container">
       {/* Connection Status */}
       <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 1000,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 24px',
          background: 'rgba(0,0,0,0.7)',
          borderRadius: '30px',
          fontSize: '16px',
          fontWeight: 600
        }}>
          <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`}></span>
          {connected ? 'Connected' : 'Disconnected'}
        </div>
        
        {error && (
          <div style={{
            position: 'fixed',
            top: '100px',
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--color-error)',
            color: 'white',
            padding: '20px 40px',
            borderRadius: 'var(--radius-md)',
            fontSize: '20px',
            zIndex: 1000
          }}>
            {error}
          </div>
        )}

      <Routes>
        <Route path="/" element={<JoinSession socket={socket} onJoinSuccess={handleJoinSuccess} />} />
        <Route path="/login" element={<LoginScreen />} />
        <Route path="/register" element={<RegisterScreen />} />
        
        {/* Protected Routes */}
        <Route path="/dashboard" element={<ProtectedRoute><HostDashboard /></ProtectedRoute>} />
        <Route path="/questions" element={<ProtectedRoute><QuestionsPage /></ProtectedRoute>} />
        <Route path="/create-session" element={<ProtectedRoute><CreateSessionPage /></ProtectedRoute>} />
        
        {/* Helper to connect host after creating session */}
        <Route path="/lobby-connect" element={<LobbyConnect socket={socket} onJoinSuccess={handleJoinSuccess} />} />
        
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
