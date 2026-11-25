/** Competition (team) mode pieces for the phone. */

export function TurnBanner({ turn, me, oral }) {
  if (!turn) return null
  const mine = turn.participantId === me
  if (mine) {
    return (
      <div className={`tm-turn mine ${turn.isPass ? 'pass' : ''}`}>
        <span className="tm-turn-icon">{turn.isPass ? '↪' : '🎯'}</span>
        <div>
          <strong>{turn.isPass ? 'Passed to you!' : 'Your turn!'}</strong>
          <span>{oral ? 'Answer out loud — the host will mark it' : `Worth ${turn.points ?? ''} pts`}</span>
        </div>
      </div>
    )
  }
  return (
    <div className="tm-turn">
      <span className="tm-turn-avatar">{turn.name?.charAt(0).toUpperCase()}</span>
      <div>
        <strong>{turn.name} is answering</strong>
        <span>{turn.isPass ? 'Passed question' : 'Wait — it may pass to you if they miss'}</span>
      </div>
    </div>
  )
}

export function ClueBoard({ question, locked }) {
  const shown = question.clues || []
  const total = question.cluesTotal || shown.length
  const pts = question.cluePoints || []
  return (
    <div className="tm-clues">
      <div className="tm-clues-head">
        <strong>Clues</strong>
        <span className="tm-worth">Worth {question.pointsNow ?? pts[shown.length - 1] ?? ''} pts</span>
      </div>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className={`tm-clue ${i < shown.length ? 'open' : ''}`}>
          <span className="tm-clue-n">{i + 1}</span>
          <span className="tm-clue-text">{i < shown.length ? shown[i] : 'Hidden'}</span>
          {pts[i] != null && <span className="tm-clue-pts">{pts[i]}</span>}
        </div>
      ))}
      {locked && <div className="tm-locked">🔒 Wrong answer — your group is out of this question</div>}
    </div>
  )
}

export function TurnToast({ result }) {
  if (!result) return null
  return (
    <div className={`tm-toast ${result.isCorrect ? 'good' : 'bad'}`} key={`${result.participantId}-${result.attempt}-${result.clue}`}>
      {result.isCorrect ? '✓' : result.timedOut ? '⏱' : '✗'} <strong>{result.name}</strong>
      {result.isCorrect ? ` +${result.points}` : result.timedOut ? ' ran out of time' : result.points ? ` ${result.points}` : ' missed'}
    </div>
  )
}

export function RoundEndCard({ data, me }) {
  if (!data) return null
  const rows = data.summary?.rows || []
  const mine = rows.find((r) => r.id === me)
  const myRank = rows.filter((r) => !r.eliminated).findIndex((r) => r.id === me) + 1
  const topper = rows.find((r) => data.summary?.toppers?.includes(r.id))
  const atRisk = data.elimination?.candidates?.includes(me) || data.elimination?.tied?.includes(me)
  return (
    <div className="tm-roundend">
      <div className="ds-kicker">{data.roundName || `Round ${data.round}`} complete</div>
      {mine ? (
        <>
          <div className="tm-roundend-big">{mine.roundPoints >= 0 ? '+' : ''}{mine.roundPoints}<small>pts this round</small></div>
          <div className="tm-roundend-row">
            <span><b>{mine.total}</b> total</span>
            {myRank > 0 && <span><b>#{myRank}</b> rank</span>}
          </div>
        </>
      ) : (
        <h3>Round {data.round} complete</h3>
      )}
      {topper && <div className="tm-topper">🏆 Round topper: <strong>{topper.name}</strong> (+{topper.roundPoints})</div>}
      {atRisk && <div className="tm-risk">⚠️ Lowest score — the host is deciding eliminations</div>}
      <p className="ds-dim" style={{ margin: 0 }}>Next round starts soon…</p>
    </div>
  )
}

export function EliminatedView({ round, name }) {
  return (
    <div className="ph-page ph-center tm-out">
      <div className="tm-out-icon">🚪</div>
      <h1>{name ? `${name}, ` : ''}you’re out</h1>
      <p className="ds-dim">Your group was eliminated{round ? ` after round ${round}` : ''}. Thanks for playing — keep watching the big screen for the winners!</p>
    </div>
  )
}
