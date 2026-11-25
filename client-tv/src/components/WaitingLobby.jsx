import Icon from './common/Icon'
import { useState, useEffect } from 'react'

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

  const handleRemoveParticipant = (participantId) => {
    if (window.confirm('Are you sure you want to remove this student?')) {
      socket.emit('remove-participant', { participantId });
    }
  };
  
  useEffect(() => {
    if (!socket) return
    
    socket.on('participants-list', (data) => {
      setParticipants(data.participants || [])
    })
    
    socket.on('participant-joined', (data) => {
      setParticipants(prev => {
        if (prev.find(p => p.id === data.participant.id)) return prev;
        return [...prev, data.participant];
      })
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
  
  const host = typeof window !== 'undefined' ? window.location.host : ''
  const isLocal = /^(localhost|127\.0\.0\.1|\[::1\])(:|$)/.test(host)
  const AVATAR_COLORS = ['#818cf8', '#f472b6', '#34d399', '#fbbf24', '#38bdf8', '#c084fc', '#fb923c']

  return (
    <div className="gm-lobby">
      <section className="gm-join-card">
        <div className="ds-kicker">Join the quiz</div>
        <h1>Grab your phone <span className="ds-grad-text">and join!</span></h1>
        <ol className="gm-join-steps">
          <li><span>1</span>Open {isLocal ? 'the quiz app' : <strong>{host}</strong>} on your phone</li>
          <li><span>2</span>Enter this code and your name</li>
        </ol>
        <div className="gm-code" aria-label="Session code">{sessionData?.code}</div>
        <div className="gm-waiting"><span className="gm-dots"><i /><i /><i /></span>
          {userRole === 'host' ? 'Start when everyone is in' : 'Waiting for the host to start…'}</div>
      </section>

      <section className="gm-players">
        <div className="gm-players-head">
          <h2>Players</h2>
          <span className="gm-count">{participants.length}</span>
        </div>
        {participants.length === 0 ? (
          <div className="gm-players-empty">
            <div className="gm-pulse"><Icon name="phone" /></div>
            <p>Players will appear here as they join.</p>
          </div>
        ) : (
          <div className="gm-player-grid">
            {participants.map((p, index) => (
              <div key={p.id} className="gm-player" style={{ animationDelay: `${index * 40}ms`, '--c': AVATAR_COLORS[index % AVATAR_COLORS.length] }}>
                <span className="gm-avatar">{p.name.charAt(0).toUpperCase()}</span>
                <span className="gm-player-name">{p.name}</span>
                {userRole === 'host' && (
                  <button className="gm-remove" onClick={() => handleRemoveParticipant(p.id)} title="Remove student" aria-label={`Remove ${p.name}`}>×</button>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {userRole === 'host' ? (
        <div className="ds-actionbar gm-lobby-bar">
          <span className="ds-muted" style={{ flex: 1 }}>
            {participants.length ? `${participants.length} player${participants.length === 1 ? '' : 's'} ready` : 'Waiting for players…'}
          </span>
          {isAudioLocked && sessionData?.musicEnabled && (
            <button className="ds-btn" onClick={handleUnlockAudio}><Icon name="volume" /> Enable sound</button>
          )}
          <button className="ds-btn ds-btn-success ds-btn-lg" onClick={handleStartQuiz}><Icon name="play" /> Start quiz</button>
        </div>
      ) : (
        isAudioLocked && sessionData?.musicEnabled && (
          <div className="ds-actionbar gm-lobby-bar">
            <span className="ds-muted" style={{ flex: 1 }}>Tap to allow music on this screen</span>
            <button className="ds-btn" onClick={handleUnlockAudio}><Icon name="volume" /> Enable sound</button>
          </div>
        )
      )}
    </div>
  )
}

export default WaitingLobby
