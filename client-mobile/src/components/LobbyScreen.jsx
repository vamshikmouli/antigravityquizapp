import { useState, useEffect } from 'react'

function LobbyScreen({ socket, participantData, onExit }) {
  const [participants, setParticipants] = useState([])
  
  useEffect(() => {
    if (!socket) return
    
    // Listen for participants list
    socket.on('participants-list', (data) => {
      setParticipants(data.participants || [])
    })
    
    // Listen for new participants joining
    socket.on('participant-joined', (data) => {
      setParticipants(prev => [...prev, data.participant])
    })
    
    // Listen for participants leaving
    socket.on('participant-left', (data) => {
      setParticipants(prev => prev.filter(p => p.id !== data.participantId))
    })
    
    return () => {
      socket.off('participants-list')
      socket.off('participant-joined')
      socket.off('participant-left')
    }
  }, [socket])
  
  const COLORS = ['#818cf8', '#f472b6', '#34d399', '#fbbf24', '#38bdf8', '#c084fc', '#fb923c']
  const me = participantData?.name || 'You'

  return (
    <div className="ph-page ph-lobby">
      <div className="ph-hero">
        <div className="ph-me" style={{ '--c': '#a855f7' }}>{me.charAt(0).toUpperCase()}<span>✓</span></div>
        <h1>You’re in, <span className="ds-grad-text">{me}!</span></h1>
        <p className="ds-dim">Watch the big screen — the quiz starts soon.</p>
        <div className="ph-waiting"><span className="gm-dots"><i /><i /><i /></span> Waiting for the host</div>
      </div>

      <div className="ph-card">
        <div className="ds-row" style={{ marginBottom: 12 }}>
          <strong style={{ fontSize: 15 }}>Players</strong>
          <span className="ds-chip accent">{participants.length}</span>
        </div>
        <div className="ph-chips">
          {participants.map((p, index) => (
            <span key={p.id} className={`ph-chip ${p.id === participantData?.id ? 'you' : ''}`}
              style={{ animationDelay: `${index * 40}ms`, '--c': COLORS[index % COLORS.length] }}>
              <i>{p.name.charAt(0).toUpperCase()}</i>{p.name}{p.id === participantData?.id && <em>you</em>}
            </span>
          ))}
        </div>
      </div>

      <button type="button" className="ds-btn ds-btn-ghost ph-leave" onClick={onExit}>Leave quiz</button>
    </div>
  )
}

export default LobbyScreen
