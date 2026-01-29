import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import './JoinSession.css'

function JoinSession({ socket, onJoinSuccess }) {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [isHost, setIsHost] = useState(false)
  const { user } = useAuth()
  
  const handleCodeChange = (e) => {
    let value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (value.length > 3 && value.length <= 6) {
      value = value.slice(0, 3) + '-' + value.slice(3)
    } else if (value.length > 6) {
      value = value.slice(0, 7)
    }
    setCode(value)
  }
  
  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    
    if (!code || code.length < 7) {
      setError('Please enter a valid session code')
      return
    }
    
    if (!socket) {
      setError('Not connected to server')
      return
    }
    
    setLoading(true)
    
    socket.emit('join-session', {
      code: code,
      role: isHost ? 'host' : 'display'
    })
    
    socket.once('session-joined', (data) => {
      setLoading(false)
      // Pass role to success handler
      onJoinSuccess(data.session.code, data.session, isHost ? 'host' : 'display')
    })
    
    socket.once('error', (data) => {
      setLoading(false)
      setError(data.message || 'Failed to join session')
    })
    
    setTimeout(() => {
      if (loading) {
        setLoading(false)
        setError('Request timed out. Please try again.')
      }
    }, 10000)
  }
  
  return (
    <div className="join-session-tv fade-in">
      <div className="join-content">
        <div className="tv-icon">📺</div>
        <h1>Quiz Display</h1>
        <p className="subtitle">Enter the session code to display the quiz</p>
        
        <form onSubmit={handleSubmit} className="join-form-tv">
          <input
            type="text"
            placeholder="ABC-123"
            value={code}
            onChange={handleCodeChange}
            maxLength={7}
            disabled={loading}
            autoComplete="off"
            className="code-input-tv"
            autoFocus
          />

            {error && (
            <div className="error-message-tv">
              {error}
            </div>
          )}
          
          <button
            type="submit"
            className="join-button-tv"
            disabled={loading || !code}
          >
            {loading ? (
              <div className="flex items-center justify-center gap-md">
                <div className="spinner"></div>
                <span>Connecting...</span>
              </div>
            ) : (
              'Connect to Display'
            )}
          </button>
        </form>
        
        <div className="join-footer-tv">
          {user ? (
            <p>Welcome back, {user.name}! <Link to="/dashboard" style={{ color: '#FFD93D', fontWeight: 'bold', marginLeft: '5px' }}>Go to Dashboard →</Link></p>
          ) : (
            <p>Are you a teacher? <Link to="/login" style={{ color: '#FFD93D', fontWeight: 'bold' }}>Login here</Link></p>
          )}
        </div>
      </div>
    </div>
  )
}

export default JoinSession
