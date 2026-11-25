import './BuzzerButton.css'

/**
 * Buzzer button.
 *
 * It is mounted (and painted) during the "get ready" phase, so opening it only
 * flips a class — one cheap frame even on low-end phones. Presses are taken on
 * pointerdown (finger contact), not click (finger release), and the event's
 * own high-resolution timestamp is passed up.
 *
 * phase: 'armed' (get ready; a tap here is a false start) | 'open' |
 *        'pressed' (sent, waiting for the verdict) | 'falseStart' (locked out)
 */
const COPY = {
  armed: { text: 'GET READY', icon: '✋', chip: 'Get ready', hint: 'Wait for red — tapping early locks you out!' },
  open: { text: 'BUZZ!', icon: '🔔', chip: 'Buzz now!', hint: 'Tap as fast as you can' },
  pressed: { text: 'BUZZED', icon: '✓', chip: 'Sent', hint: 'Checking who was first…' },
  falseStart: { text: 'TOO EARLY', icon: '🚫', chip: 'False start', hint: 'You tapped before red — locked out for this question.' }
}

function BuzzerButton({ phase = 'armed', onPress, timeRemaining }) {
  const live = phase === 'armed' || phase === 'open'
  const copy = COPY[phase] || COPY.armed

  const handlePointerDown = (e) => {
    if (!live) return
    e.preventDefault()
    onPress(e)
    if (phase === 'open' && navigator.vibrate) navigator.vibrate(50)
  }

  return (
    <div className={`buzzer-container bz-${phase}`}>
      <span className="bz-chip">{copy.chip}</span>
      <div className="bz-stage">
      {phase === 'open' && <><span className="bz-wave" /><span className="bz-wave w2" /></>}
      <button
        className={`buzzer-button phase-${phase} ${phase === 'open' ? 'active' : 'inactive'}`}
        onPointerDown={handlePointerDown}
        onContextMenu={(e) => e.preventDefault()}
        disabled={!live}
        aria-label={phase === 'open' ? 'Press buzzer' : copy.text}
      >
        <div className="buzzer-ring" style={{
          strokeDashoffset: phase === 'open' ? (1 - (timeRemaining / 30)) * 628 : 0
        }}></div>
        <div className="buzzer-content">
          <span className="buzzer-text">{copy.text}</span>
          <span className="buzzer-icon">{copy.icon}</span>
        </div>
      </button>
      </div>
      <p className="buzzer-hint">{copy.hint}</p>
    </div>
  )
}

export default BuzzerButton
