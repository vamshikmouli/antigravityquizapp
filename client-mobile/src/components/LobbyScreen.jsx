import { useState, useEffect } from 'react'
import './LobbyScreen.css'

function LobbyScreen({ socket, participantData }) {
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
  
  return (
    <div className="lobby-screen fade-in">
      <div className="lobby-header">
        <h1>Waiting for Quiz to Start...</h1>
        <p className="participant-name">Welcome, {participantData?.name}!</p>
      </div>
      
      <div className="lobby-content">
        <div className="waiting-animation">
          <div className="pulse-circle"></div>
          <div className="pulse-circle delay-1"></div>
          <div className="pulse-circle delay-2"></div>
        </div>
        
        <div className="participants-count">
          <div className="count-number">{participants.length}</div>
          <div className="count-label">
            {participants.length === 1 ? 'Student' : 'Students'} Joined
          </div>
        </div>
        
        {participants.length > 0 && (
          <div className="participants-list">
            <h3>Participants:</h3>
            <div className="participants-grid">
              {participants.map((p, index) => (
                <div 
                  key={p.id} 
                  className={`participant-chip ${p.id === participantData?.id ? 'you' : ''}`}
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {p.name}
                  {p.id === participantData?.id && <span className="you-badge">(You)</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      <div className="lobby-footer">
        <p>The quiz will start soon...</p>
        <p className="hint">Keep this screen open and ready!</p>
      </div>
    </div>
  )
}

export default LobbyScreen
