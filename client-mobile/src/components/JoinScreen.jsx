import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './JoinScreen.css'

function JoinScreen({ socket, onJoinSuccess }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()
  
  const handleCodeChange = (e) => {
    // Format as ABC-123
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
      setError('Please enter a valid code')
      return
    }
    
    if (!name || name.trim().length < 2) {
      setError('Please enter your name (at least 2 characters)')
      return
    }
    
    if (!socket) {
      setError('Not connected to server')
      return
    }
    
    setLoading(true)
    
    // Join session
    socket.emit('join-session', {
      code: code,
      name: name.trim(),
      role: 'student'
    })
    
    // Listen for join confirmation
    socket.once('session-joined', (data) => {
      setLoading(false)
      onJoinSuccess(data.session.code, data.participant, data.currentGameState)
      navigate('/lobby')
    })
    
    // Listen for errors
    socket.once('error', (data) => {
      setLoading(false)
      setError(data.message || 'Failed to join session')
    })
    
    // Timeout after 10 seconds
    setTimeout(() => {
      if (loading) {
        setLoading(false)
        setError('Request timed out. Please try again.')
      }
    }, 10000)
  }
  
  return (
    <div className="join-screen fade-in">
      <div className="join-header">
        <div className="quiz-icon">🎯</div>
        <h1>Quiz Time!</h1>
        <p className="subtitle">Enter the code to join the quiz</p>
      </div>
      
      <form onSubmit={handleSubmit} className="join-form">
        <div className="form-group">
          <label htmlFor="code">Quiz Code</label>
          <input
            id="code"
            type="text"
            placeholder="ABC-123"
            value={code}
            onChange={handleCodeChange}
            maxLength={7}
            disabled={loading}
            autoComplete="off"
            className="code-input"
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="name">Your Name</label>
          <input
            id="name"
            type="text"
            placeholder="Enter your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={30}
            disabled={loading}
            autoComplete="name"
          />
        </div>
        
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
        
        <button 
          type="submit" 
          className="btn-primary join-button"
          disabled={loading || !code || !name}
        >
          {loading ? (
            <div className="flex items-center justify-center gap-md">
              <div className="spinner"></div>
              <span>Joining...</span>
            </div>
          ) : (
            'Join Quiz'
          )}
        </button>
      </form>
      
      <div className="join-footer">
        <p>Ask your teacher for the quiz code</p>
      </div>
    </div>
  )
}

export default JoinScreen
