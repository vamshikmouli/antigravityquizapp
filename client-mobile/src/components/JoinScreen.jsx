import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

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
      onJoinSuccess(data)
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
    <div className="ph-page ph-join">
      <div className="ph-hero">
        <span className="ds-brand-icon ph-logo">🎯</span>
        <h1>Ready to <span className="ds-grad-text">play?</span></h1>
        <p className="ds-dim">Enter the code on the big screen and your name.</p>
      </div>

      <form onSubmit={handleSubmit} className="ph-card">
        <label className="ds-field">
          <span className="ds-label">Quiz code</span>
          <input id="code" type="text" inputMode="text" placeholder="ABC-123" value={code} onChange={handleCodeChange}
            maxLength={7} disabled={loading} autoComplete="off" autoCapitalize="characters" className="ds-code-input ph-code" />
        </label>
        <label className="ds-field">
          <span className="ds-label">Your name</span>
          <input id="name" type="text" placeholder="e.g. Priya" value={name} onChange={(e) => setName(e.target.value)}
            maxLength={30} disabled={loading} autoComplete="name" className="ds-input ph-input" />
        </label>
        {error && <div className="ds-alert bad" style={{ marginBottom: 14 }}>⚠️ {error}</div>}
        <button type="submit" className="ds-btn ds-btn-primary ds-btn-lg ds-btn-block ph-big-btn" disabled={loading || !code || !name}>
          {loading ? <><span className="ds-spinner" /> Joining…</> : 'Join quiz →'}
        </button>
      </form>

      <p className="ph-foot">Ask your teacher for the code</p>
    </div>
  )
}

export default JoinScreen
