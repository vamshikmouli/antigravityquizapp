import { useEffect, useRef, useState } from 'react'

const COLORS = ['#818cf8', '#f472b6', '#34d399', '#fbbf24', '#38bdf8', '#c084fc', '#fb923c']

function Leaderboard({ leaderboard, buzzerWinner, variant = 'standard' }) {
  // Score changes pop up as "+10" / "−5" so the audience sees where points went.
  const prev = useRef(null)
  const [deltas, setDeltas] = useState({})
  useEffect(() => {
    const now = Object.fromEntries((leaderboard || []).map((p) => [p.id, p.score || 0]))
    if (prev.current) {
      const changed = {}
      for (const [id, score] of Object.entries(now)) {
        if (prev.current[id] != null && score !== prev.current[id]) changed[id] = score - prev.current[id]
      }
      if (Object.keys(changed).length) {
        setDeltas(changed)
        const t = setTimeout(() => setDeltas({}), 2600)
        prev.current = now
        return () => clearTimeout(t)
      }
    }
    prev.current = now
  }, [leaderboard])

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
              <div key={p.id} className={`gm-row r${p.rank} ${isBuzz ? 'buzz' : ''} ${p.eliminated ? 'out' : ''} ${deltas[p.id] ? (deltas[p.id] > 0 ? 'bump up' : 'bump down') : ''}`}
                style={{ animationDelay: `${index * 40}ms`, '--c': COLORS[index % COLORS.length] }}>
                <span className="gm-rank">{p.eliminated ? '–' : (medal(p.rank) || p.rank)}</span>
                <span className="gm-avatar sm">{p.name.charAt(0).toUpperCase()}</span>
                <div className="gm-row-main">
                  <div className="gm-row-name">
                    {p.name}
                    {p.buzzerWins > 0 && <span className="gm-buzz-wins" title="Buzzer wins">🔔 {p.buzzerWins}</span>}
                    {p.eliminated && <span className="gm-out-tag">OUT</span>}
                  </div>
                  <div className="gm-bar"><i style={{ width: `${Math.max(4, ((p.score || 0) / best) * 100)}%` }} /></div>
                </div>
                <span className="gm-score">
                  {deltas[p.id] ? <i className={`gm-delta ${deltas[p.id] > 0 ? 'up' : 'down'}`} key={`${p.id}-${p.score}`}>{deltas[p.id] > 0 ? '+' : '−'}{Math.abs(deltas[p.id])}</i> : null}
                  {p.score}
                </span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

export default Leaderboard
