import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

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
      role: isHost ? 'host' : 'display',
      token: localStorage.getItem('token')
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
    <div className="ds-tvjoin">
      <div className="ds-tvjoin-card">
        <span className="ds-brand-icon" style={{ width: 64, height: 64, fontSize: 30, borderRadius: 20, margin: '0 auto' }}>📺</span>
        <h1>Show a quiz on <span className="ds-grad-text">this screen</span></h1>
        <p className="ds-dim">Enter the session code from the host’s launch page.</p>

        <form onSubmit={handleSubmit}>
          <input
            type="text"
            placeholder="ABC-123"
            value={code}
            onChange={handleCodeChange}
            maxLength={7}
            disabled={loading}
            autoComplete="off"
            className="ds-code-input"
            aria-label="Session code"
            autoFocus
          />
          {error && <div className="ds-alert bad" style={{ marginTop: 12 }}>⚠️ {error}</div>}
          <button type="submit" className="ds-btn ds-btn-primary ds-btn-lg ds-btn-block" style={{ marginTop: 16 }} disabled={loading || !code}>
            {loading ? <><span className="ds-spinner" /> Connecting…</> : 'Connect to display'}
          </button>
        </form>

        <div className="ds-auth-footer">
          {user
            ? <>Signed in as {user.name}. <Link to="/dashboard" className="ds-link">Go to dashboard →</Link></>
            : <>Are you the host? <Link to="/login" className="ds-link">Sign in</Link></>}
        </div>
      </div>
    </div>
  )
}

export default JoinSession
