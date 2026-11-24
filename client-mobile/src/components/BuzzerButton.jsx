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
  armed: { text: 'GET READY', icon: '⏳', hint: 'Wait for red — tapping early locks you out!' },
  open: { text: 'BUZZ IN!', icon: '🔴', hint: 'Tap to buzz in!' },
  pressed: { text: 'BUZZED!', icon: '✅', hint: 'Checking who was first…' },
  falseStart: { text: 'FALSE START', icon: '🚫', hint: 'You tapped too early — locked out for this question.' }
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
    <div className="buzzer-container">
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
      <p className="buzzer-hint">{copy.hint}</p>
    </div>
  )
}

export default BuzzerButton
