// Short synthesized sound effects for the big screen (no audio files):
// correct / wrong / pass / round. Respects the music mute and volume.
let ctx = null

export function playSfx(kind, { muted = false, volume = 0.5 } = {}) {
  if (muted || typeof window === 'undefined') return
  try {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return
    ctx = ctx || new AC()
    if (ctx.state === 'suspended') ctx.resume()
    const now = ctx.currentTime + 0.02
    const out = ctx.createGain()
    out.gain.value = Math.max(0.05, Math.min(1, volume)) * 0.6
    out.connect(ctx.destination)
    const tone = (freq, at, dur, type = 'triangle', gain = 0.5) => {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.type = type
      o.frequency.setValueAtTime(freq, now + at)
      g.gain.setValueAtTime(0.0001, now + at)
      g.gain.exponentialRampToValueAtTime(gain, now + at + 0.015)
      g.gain.exponentialRampToValueAtTime(0.0001, now + at + dur)
      o.connect(g).connect(out)
      o.start(now + at)
      o.stop(now + at + dur + 0.05)
    }
    if (kind === 'correct') {          // bright rising chime
      tone(784, 0, 0.16); tone(988, 0.09, 0.16); tone(1319, 0.18, 0.45)
    } else if (kind === 'wrong') {     // low double buzz
      tone(196, 0, 0.22, 'sawtooth', 0.22); tone(155, 0.2, 0.4, 'sawtooth', 0.22)
    } else if (kind === 'pass') {      // soft hand-over
      tone(523, 0, 0.14, 'sine', 0.35); tone(698, 0.11, 0.22, 'sine', 0.35)
    } else if (kind === 'round') {     // short fanfare
      ;[523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, i === 3 ? 0.5 : 0.18, 'triangle', 0.4))
    }
  } catch { /* sound is optional */ }
}
