import { useState, useEffect } from 'react'
import './WaitingLobby.css'

function WaitingLobby({ socket, sessionData, userRole, audioManager }) {
  const [participants, setParticipants] = useState([])
  const [isAudioLocked, setIsAudioLocked] = useState(true)

  useEffect(() => {
    if (audioManager) {
      setIsAudioLocked(!audioManager.isUnlocked);
    }
  }, [audioManager]);

  const handleUnlockAudio = async () => {
    if (audioManager) {
      const unlocked = await audioManager.unlock();
      setIsAudioLocked(!unlocked);
    }
  };

  const handleStartQuiz = async () => {
    // Attempt to unlock audio one more time just in case
    await handleUnlockAudio();
    socket.emit('start-quiz');
  };
  
  useEffect(() => {
    if (!socket) return
    
    socket.on('participants-list', (data) => {
      setParticipants(data.participants || [])
    })
    
    socket.on('participant-joined', (data) => {
      setParticipants(prev => [...prev, data.participant])
    })
    
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
    <div className="waiting-lobby-tv fade-in">
      <div className="lobby-header-tv">
        <h1>Waiting for Quiz to Start</h1>
        <div className="session-code-display">
          <span className="code-label">Session Code:</span>
          <span className="code-value">{sessionData?.code}</span>
        </div>
      </div>
      
      <div className="lobby-main-tv">
        <div className="participants-count-tv">
          <div className="count-circle">
            <div className="count-number-tv">{participants.length}</div>
            <div className="count-label-tv">
              {participants.length === 1 ? 'Student' : 'Students'}
            </div>
          </div>
        </div>
        
        {participants.length > 0 && (
          <div className="participants-grid-tv">
            {participants.map((p, index) => (
              <div
                key={p.id}
                className="participant-card-tv"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="participant-avatar">
                  {p.name.charAt(0).toUpperCase()}
                </div>
                <div className="participant-name-tv">{p.name}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      <div className="lobby-footer-tv">
        <div className="waiting-indicator">
          <div className="dot"></div>
          <div className="dot"></div>
          <div className="dot"></div>
        </div>
        
        {userRole === 'host' ? (
          <div style={{ display: 'flex', gap: '20px' }}>
            {isAudioLocked && sessionData?.musicEnabled && (
              <button 
                className="start-quiz-button"
                onClick={handleUnlockAudio}
                style={{
                  background: 'var(--color-primary)',
                  fontSize: '20px',
                  padding: '16px 24px'
                }}
              >
                🔊 ENABLE SOUND
              </button>
            )}
            <button 
              className="start-quiz-button"
              onClick={handleStartQuiz}
              style={{
                fontSize: '24px',
                padding: '16px 32px',
                background: 'var(--color-success)',
                color: 'white',
                border: 'none',
                borderRadius: '12px',
                cursor: 'pointer',
                fontWeight: 'bold',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
              }}
            >
              ▶ START QUIZ
            </button>
          </div>
        ) : (
          <div>
            {isAudioLocked && sessionData?.musicEnabled && (
               <button 
               className="start-quiz-button"
               onClick={handleUnlockAudio}
               style={{
                 background: 'var(--color-primary)',
                 fontSize: '18px',
                 padding: '12px 24px',
                 marginBottom: '20px'
               }}
             >
               🔊 Enable Sound
             </button>
            )}
            <p>Waiting for host to start the quiz...</p>
          </div>
        )}
      </div>
    </div>
  )
}

export default WaitingLobby
