/** Competition (team) mode pieces for the big screen. */

const FORMAT_LABEL = { DIRECTED: 'Directed', ALL: 'Everyone answers', BUZZER: 'Buzzer', CLUE: 'Clue round' }
export const formatLabel = (f) => FORMAT_LABEL[f] || f

/** Who is answering a directed question + who is next. */
export function TurnCard({ turn, tried = [] }) {
  if (!turn) return null
  return (
    <div className={`tm-turn-card ${turn.isPass ? 'pass' : ''}`} key={`${turn.participantId}-${turn.attempt}`}>
      <span className="tm-turn-avatar">{turn.name?.charAt(0).toUpperCase()}</span>
      <div className="tm-turn-text">
        <small>{turn.isPass ? `Passed · attempt ${turn.attempt}` : 'Question for'}</small>
        <strong>{turn.name}</strong>
      </div>
      {turn.points != null && <span className="tm-turn-pts">{turn.points} pts</span>}
      {turn.order?.length > 1 && (
        <div className="tm-turn-order">
          {turn.order.map((n) => (
            <span key={n} className={n === turn.name ? 'now' : tried.includes(n) ? 'done' : ''}>{n}</span>
          ))}
        </div>
      )}
    </div>
  )
}

/** Clues on the big screen: revealed ones big, the rest as locked tiles with their points. */
export function ClueBoardTV({ question, reveal }) {
  const shown = reveal || question.clues || []
  const total = Math.max(question.cluesTotal || 0, shown.length)
  const pts = question.cluePoints || []
  return (
    <div className="tm-clueboard">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`tm-clue-tv ${i < shown.length ? 'open' : ''}`} style={{ animationDelay: `${i * 80}ms` }}>
          <span className="tm-clue-n">{i + 1}</span>
          <span className="tm-clue-text">{i < shown.length ? shown[i] : 'Hidden clue'}</span>
          {pts[i] != null && <span className="tm-clue-pts">{pts[i]} pts</span>}
        </div>
      ))}
    </div>
  )
}

export function TurnToast({ result }) {
  if (!result) return null
  return (
    <div className={`tm-toast-tv ${result.isCorrect ? 'good' : 'bad'}`} key={`${result.participantId}-${result.attempt}-${result.clue}-${result.points}`}>
      <span>{result.isCorrect ? '✓' : result.timedOut ? '⏱' : '✗'}</span>
      <strong>{result.name}</strong>
      {result.isCorrect ? `+${result.points}` : result.timedOut ? 'time up' : result.points ? `${result.points}` : 'wrong'}
    </div>
  )
}

/** End-of-round screen in competition mode: round scores, topper, elimination. */
export function TeamRoundRecap({ data, isHost, onEliminate, onNextRound, eliminatedNow = [] }) {
  const rows = data.summary?.rows || []
  const toppers = new Set(data.summary?.toppers || [])
  const topper = rows.find((r) => toppers.has(r.id))
  const elim = data.elimination
  const outNow = new Set([...(elim?.done || []), ...eliminatedNow.map((g) => g.id)])
  const pending = elim && outNow.size < elim.count
  const candidates = new Set([...(elim?.candidates || []), ...(elim?.tied || [])])
  let activeRank = 0

  return (
    <div className="tm-recap">
      <div className="ds-kicker">End of round {data.round}</div>
      <h1>{data.roundName || `Round ${data.round}`} <span className="ds-grad-text">results</span></h1>

      {topper && (
        <div className="tm-topper-card">
          <span className="tm-topper-crown">🏆</span>
          <div><small>Round topper</small><strong>{topper.name}</strong></div>
          <span className="tm-topper-pts">+{topper.roundPoints}</span>
        </div>
      )}

      <div className="tm-recap-table">
        <div className="tm-recap-row head"><span>#</span><span>Group</span><span>This round</span><span>Total</span></div>
        {rows.map((r) => {
          const out = r.eliminated || outNow.has(r.id)
          const rank = out ? '–' : ++activeRank
          return (
            <div key={r.id} className={`tm-recap-row ${out ? 'out' : ''} ${toppers.has(r.id) ? 'top' : ''} ${pending && candidates.has(r.id) ? 'risk' : ''}`}>
              <span className="tm-rank">{rank}</span>
              <span className="tm-name">{r.name}{out && <em>OUT{r.eliminatedRound ? ` · R${r.eliminatedRound}` : ''}</em>}</span>
              <span className={`tm-rp ${r.roundPoints < 0 ? 'neg' : ''}`}>{r.roundPoints > 0 ? '+' : ''}{r.roundPoints}</span>
              <span className="tm-total">{r.total}</span>
            </div>
          )
        })}
      </div>

      {elim && (
        <div className={`tm-elim ${pending ? 'pending' : 'done'}`}>
          {pending ? (
            <>
              <strong>⚔️ Elimination — {elim.count - outNow.size} group{elim.count - outNow.size > 1 ? 's' : ''} to go out</strong>
              {elim.tied?.length > 0 && <span className="ds-dim">Tie at the bottom — host chooses who goes out.</span>}
              {isHost && (
                <div className="tm-elim-actions">
                  {[...candidates].filter((id) => !outNow.has(id)).map((id) => {
                    const g = rows.find((r) => r.id === id)
                    return <button key={id} className="ds-btn ds-btn-danger ds-btn-lg" onClick={() => onEliminate([id])}>Eliminate {g?.name}</button>
                  })}
                </div>
              )}
              {!isHost && <span className="ds-dim">Waiting for the host to confirm…</span>}
            </>
          ) : (
            <strong>🚪 {eliminatedNow.length ? eliminatedNow.map((g) => g.name).join(', ') : rows.filter((r) => outNow.has(r.id)).map((r) => r.name).join(', ')} eliminated</strong>
          )}
        </div>
      )}

      {isHost && (
        <button className="ds-btn ds-btn-primary ds-btn-lg tm-next" disabled={pending} onClick={onNextRound}>
          {pending ? 'Confirm elimination first' : `Start round ${data.nextRound} →`}
        </button>
      )}
    </div>
  )
}
