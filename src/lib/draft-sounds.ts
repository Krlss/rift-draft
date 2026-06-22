// ─── Web Audio API Sound Effects for Draft Simulator ─────────────────────
// No external dependencies — all sounds are generated programmatically
// Safe to import in SSR (guards against window unavailability)

let _ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  try {
    if (!_ctx) {
      _ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    }
    if (_ctx.state === 'suspended') _ctx.resume()
    return _ctx
  } catch {
    return null
  }
}

/** Play a single oscillator note */
function note(
  freq: number,
  startOffset: number,
  duration: number,
  type: OscillatorType = 'sine',
  volume = 0.22
) {
  const c = getCtx()
  if (!c) return
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.connect(gain)
  gain.connect(c.destination)
  osc.type = type
  osc.frequency.value = freq
  const t = c.currentTime + startOffset
  gain.gain.setValueAtTime(volume, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration)
  osc.start(t)
  osc.stop(t + duration + 0.01)
}

let _enabled = true

export const DraftSounds = {
  setEnabled(val: boolean) { _enabled = val },
  isEnabled() { return _enabled },

  /** Your pick/ban turn has started */
  yourTurn() {
    if (!_enabled) return
    note(880, 0,    0.10)
    note(1100, 0.10, 0.22)
  },

  /** Champion picked */
  lockIn() {
    if (!_enabled) return
    note(440, 0,    0.05, 'square', 0.14)
    note(660, 0.05, 0.05, 'square', 0.11)
    note(880, 0.08, 0.38, 'sine',   0.20)
  },

  /** Champion banned */
  ban() {
    if (!_enabled) return
    note(300, 0,    0.08, 'sawtooth', 0.17)
    note(200, 0.07, 0.30, 'sawtooth', 0.20)
  },

  /** Ticked each second when timer ≤ 10 */
  timerWarning() {
    if (!_enabled) return
    note(700, 0, 0.06, 'square', 0.12)
  },

  /** Draft officially begins */
  draftStart() {
    if (!_enabled) return
    ;[440, 554, 659, 880, 1100].forEach((f, i) =>
      note(f, i * 0.12, 0.40, 'sine', 0.20)
    )
  },

  /** Ready check initiated */
  readyCheckStart() {
    if (!_enabled) return
    note(660, 0,    0.16, 'sine', 0.22)
    note(880, 0.16, 0.30, 'sine', 0.22)
  },

  /** One player confirmed ready */
  playerReady() {
    if (!_enabled) return
    note(770, 0, 0.15, 'sine', 0.15)
  },

  /** All 10 players ready — draft starting */
  allReady() {
    if (!_enabled) return
    ;[440, 550, 660].forEach((f, i) => note(f, i * 0.10, 0.35, 'sine', 0.20))
  },

  /** Join request approved */
  approved() {
    if (!_enabled) return
    note(550, 0,    0.15)
    note(770, 0.12, 0.25)
  },

  /** Join request denied */
  denied() {
    if (!_enabled) return
    note(220, 0, 0.30, 'sawtooth', 0.20)
  },

  /** Ready check cancelled */
  cancelled() {
    if (!_enabled) return
    note(400, 0,    0.15, 'sawtooth', 0.15)
    note(300, 0.12, 0.30, 'sawtooth', 0.15)
  },
}
