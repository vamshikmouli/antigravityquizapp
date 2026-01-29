import './BuzzerButton.css'

function BuzzerButton({ active, onPress, timeRemaining }) {
  const handlePress = () => {
    if (active) {
      // Haptic feedback if available
      if (navigator.vibrate) {
        navigator.vibrate(50)
      }
      onPress()
    }
  }
  
  return (
    <div className="buzzer-container">
      <button
        className={`buzzer-button ${active ? 'active' : 'inactive'}`}
        onClick={handlePress}
        disabled={!active}
        aria-label="Press buzzer"
      >
        <div className="buzzer-ring" style={{
          strokeDashoffset: active ? (1 - (timeRemaining / 30)) * 628 : 0
        }}></div>
        <div className="buzzer-content">
          <span className="buzzer-text">BUZZ IN!</span>
          <span className="buzzer-icon">🔴</span>
        </div>
      </button>
      <p className="buzzer-hint">Tap to buzz in!</p>
    </div>
  )
}

export default BuzzerButton
