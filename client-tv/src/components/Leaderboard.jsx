import './Leaderboard.css'

function Leaderboard({ leaderboard, buzzerWinner, variant = 'standard' }) {
  const topTen = leaderboard.slice(0, 10)
  
  const getRankEmoji = (rank) => {
    if (rank === 1) return '🥇'
    if (rank === 2) return '🥈'
    if (rank === 3) return '🥉'
    return null
  }
  
  return (
    <div className={`leaderboard-panel card ${variant === 'large' ? 'large-view' : ''}`}>
      <div className="leaderboard-header">
        <h3>🏆 Live Leaderboard</h3>
      </div>
      
      <div className="leaderboard-list">
        {topTen.length === 0 ? (
          <div className="no-scores">
            <p>No scores yet</p>
          </div>
        ) : (
          topTen.map((participant, index) => {
            const isBuzzerWinner = buzzerWinner && participant.id === buzzerWinner.participantId
            const rankEmoji = getRankEmoji(participant.rank)
            
            return (
              <div
                key={participant.id}
                className={`leaderboard-item ${isBuzzerWinner ? 'buzzer-highlight' : ''}`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="rank-display">
                  {rankEmoji || `#${participant.rank}`}
                </div>
                <div className="participant-info">
                  <div className="participant-name-lb">{participant.name}</div>
                  {participant.buzzerWins > 0 && (
                    <div className="buzzer-wins">
                      🔴 {participant.buzzerWins}
                    </div>
                  )}
                </div>
                <div className="score-display">{participant.score}</div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default Leaderboard
