const COLORS = ['#818cf8', '#f472b6', '#34d399', '#fbbf24', '#38bdf8', '#c084fc', '#fb923c']

function Leaderboard({ leaderboard, buzzerWinner, variant = 'standard' }) {
  const top = leaderboard.slice(0, 10)
  const best = Math.max(1, ...top.map((p) => p.score || 0))
  const medal = (rank) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null)

  return (
    <div className={`gm-board ${variant === 'large' ? 'large' : ''}`}>
      <div className="gm-board-head">
        <span>🏆</span>
        <h3>Leaderboard</h3>
        {top.length > 0 && <span className="gm-board-n">{leaderboard.length}</span>}
      </div>

      <div className="gm-board-list">
        {top.length === 0 ? (
          <div className="gm-board-empty">Scores appear after the first answer</div>
        ) : (
          top.map((p, index) => {
            const isBuzz = buzzerWinner && p.id === buzzerWinner.participantId
            return (
              <div key={p.id} className={`gm-row r${p.rank} ${isBuzz ? 'buzz' : ''}`}
                style={{ animationDelay: `${index * 40}ms`, '--c': COLORS[index % COLORS.length] }}>
                <span className="gm-rank">{medal(p.rank) || p.rank}</span>
                <span className="gm-avatar sm">{p.name.charAt(0).toUpperCase()}</span>
                <div className="gm-row-main">
                  <div className="gm-row-name">
                    {p.name}
                    {p.buzzerWins > 0 && <span className="gm-buzz-wins" title="Buzzer wins">🔔 {p.buzzerWins}</span>}
                  </div>
                  <div className="gm-bar"><i style={{ width: `${Math.max(4, ((p.score || 0) / best) * 100)}%` }} /></div>
                </div>
                <span className="gm-score">{p.score}</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default Leaderboard
