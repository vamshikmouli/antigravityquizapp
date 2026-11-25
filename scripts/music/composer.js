/*
 * Original default quiz music, composed in code and rendered with the Web Audio
 * OfflineAudioContext (run by scripts/music/render.mjs in headless Edge/Chrome).
 * All melodies, harmonies and sounds here are original and synthesized: no
 * samples, no third-party recordings.
 *
 * window.renderTrack(name) -> Promise<base64 WAV (mono, 16-bit)>
 */
(() => {
  const SR = 24000;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const N = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  const note = (s) => { const m = s.match(/^([A-G]#?)(-?\d)$/); return 12 * (+m[2] + 1) + N[m[1]]; };
  const chord = (root, kind) => ({ maj: [0, 4, 7], min: [0, 3, 7], sus: [0, 5, 7] }[kind]).map((i) => note(root) + i);

  function makeCtx(seconds) {
    const ctx = new OfflineAudioContext(1, Math.ceil(seconds * SR), SR);
    // master chain: bus -> compressor -> gain -> out ; reverb send
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 3.5; comp.attack.value = 0.006; comp.release.value = 0.2;
    const master = ctx.createGain(); master.gain.value = 0.9;
    comp.connect(master); master.connect(ctx.destination);
    const bus = ctx.createGain(); bus.connect(comp);
    // reverb (generated impulse: decaying noise)
    const irLen = Math.floor(SR * 1.9);
    const ir = ctx.createBuffer(1, irLen, SR); const d = ir.getChannelData(0);
    let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff) * 2 - 1;
    for (let i = 0; i < irLen; i++) d[i] = rnd() * Math.pow(1 - i / irLen, 3.2);
    const verb = ctx.createConvolver(); verb.buffer = ir;
    const verbGain = ctx.createGain(); verbGain.gain.value = 0.22;
    const send = ctx.createGain(); send.connect(verb); verb.connect(verbGain); verbGain.connect(comp);
    // echo for plucks / bells
    const dly = ctx.createDelay(1.5); const fb = ctx.createGain(); fb.gain.value = 0.28;
    const dlyOut = ctx.createGain(); dlyOut.gain.value = 0.25; const dlyIn = ctx.createGain();
    dlyIn.connect(dly); dly.connect(fb); fb.connect(dly); dly.connect(dlyOut); dlyOut.connect(bus); dlyOut.connect(send);
    // noise buffer
    const nb = ctx.createBuffer(1, SR * 2, SR); const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = rnd();
    return { ctx, bus, send, dlyIn, dly, nb, rnd };
  }

  function env(ctx, g, t, a, hold, r, peak) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + Math.max(0, hold));
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + Math.max(0, hold) + r);
  }

  // ---- instruments ---------------------------------------------------------
  function tone(S, { t, f, dur = 0.3, type = 'sine', g = 0.2, a = 0.01, r = 0.2, cut, q = 0.8, cutEnv, det = [0], wet = 0.3, echo = 0 }) {
    const { ctx } = S;
    const out = ctx.createGain(); env(ctx, out, t, a, dur - a, r, g);
    let head = out;
    if (cut) {
      const flt = ctx.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = q;
      if (cutEnv) { flt.frequency.setValueAtTime(cutEnv[0], t); flt.frequency.exponentialRampToValueAtTime(cutEnv[1], t + cutEnv[2]); flt.frequency.exponentialRampToValueAtTime(cut, t + cutEnv[2] + 0.25); }
      else flt.frequency.value = cut;
      flt.connect(out); head = flt;
    }
    for (const c of det) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = c;
      const og = ctx.createGain(); og.gain.value = 1 / det.length;
      o.connect(og); og.connect(head); o.start(t); o.stop(t + dur + r + 0.05);
    }
    out.connect(S.bus);
    if (wet) { const w = ctx.createGain(); w.gain.value = wet; out.connect(w); w.connect(S.send); }
    if (echo) { const e = ctx.createGain(); e.gain.value = echo; out.connect(e); e.connect(S.dlyIn); }
  }
  function noise(S, { t, dur = 0.1, g = 0.2, a = 0.001, r = 0.1, hp, lp, bp, q = 0.8, wet = 0.15 }) {
    const { ctx } = S;
    const src = ctx.createBufferSource(); src.buffer = S.nb;
    src.playbackRate.value = 0.9 + Math.abs(S.rnd()) * 0.2;
    let head = src;
    const add = (type, f) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; head.connect(b); head = b; };
    if (hp) add('highpass', hp); if (lp) add('lowpass', lp); if (bp) add('bandpass', bp);
    const out = ctx.createGain(); env(ctx, out, t, a, dur, r, g);
    head.connect(out); out.connect(S.bus);
    if (wet) { const w = ctx.createGain(); w.gain.value = wet; out.connect(w); w.connect(S.send); }
    src.start(t, Math.abs(S.rnd()) * 1.5); src.stop(t + dur + r + 0.05);
  }
  const kick = (S, t, g = 0.9) => {
    const { ctx } = S; const o = ctx.createOscillator(); const og = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.13);
    og.gain.setValueAtTime(g, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
    o.connect(og); og.connect(S.bus); o.start(t); o.stop(t + 0.5);
  };
  const snare = (S, t, g = 0.35) => { noise(S, { t, dur: 0.02, r: 0.17, g, bp: 1900, q: 0.6, wet: 0.25 }); tone(S, { t, f: 190, dur: 0.03, r: 0.1, g: g * 0.6, type: 'triangle', wet: 0 }); };
  const clap = (S, t, g = 0.3) => { for (const o of [0, 0.011, 0.022]) noise(S, { t: t + o, dur: 0.004, r: o === 0.022 ? 0.16 : 0.012, g, bp: 1400, q: 1.2, wet: 0.35 }); };
  const hat = (S, t, g = 0.09, open = false) => noise(S, { t, dur: 0.005, r: open ? 0.16 : 0.045, g, hp: 7500, wet: 0.05 });
  const crash = (S, t, g = 0.22) => noise(S, { t, dur: 0.02, r: 2.0, g, hp: 4200, wet: 0.4 });
  const tick = (S, t, hi = true) => { tone(S, { t, f: hi ? 2350 : 1750, dur: 0.004, r: 0.03, g: 0.09, wet: 0.08 }); noise(S, { t, dur: 0.003, r: 0.01, g: 0.05, hp: 6000, wet: 0 }); };
  const timpani = (S, t, f = 98, g = 0.45) => {
    const { ctx } = S; const o = ctx.createOscillator(); const og = ctx.createGain();
    o.frequency.setValueAtTime(f * 1.04, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.08);
    og.gain.setValueAtTime(g, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(og); og.connect(S.bus); const w = ctx.createGain(); w.gain.value = 0.3; og.connect(w); w.connect(S.send);
    o.start(t); o.stop(t + 1.5); noise(S, { t, dur: 0.01, r: 0.08, g: g * 0.3, bp: 320, wet: 0.2 });
  };
  const bell = (S, t, m, g = 0.12, dur = 1.4) => {
    const f = mtof(m);
    [[1, 1], [2.0, 0.45], [3.01, 0.22], [4.17, 0.12], [5.43, 0.07]].forEach(([p, a], i) =>
      tone(S, { t, f: f * p, dur: 0.005, r: dur / (1 + i * 0.6), g: g * a, wet: 0.35, echo: 0.5 }));
  };
  const pluck = (S, t, m, g = 0.09, len = 0.22) => tone(S, { t, f: mtof(m), dur: 0.01, r: len, g, type: 'triangle', wet: 0.25, echo: 0.6 });
  const pad = (S, t, notes, dur, g = 0.05, cut = 1400) => notes.forEach((m) => tone(S, { t, f: mtof(m), dur, a: 0.35, r: 0.6, g, type: 'sawtooth', det: [-9, 0, 8], cut, q: 0.5, wet: 0.45 }));
  const bass = (S, t, m, dur, g = 0.22, cut = 520) => tone(S, { t, f: mtof(m), dur, a: 0.005, r: 0.08, g, type: 'sawtooth', cut, q: 1.2, cutEnv: [cut * 2.5, cut, 0.06], wet: 0.05 });
  const brass = (S, t, m, dur, g = 0.09) => tone(S, { t, f: mtof(m), dur, a: 0.03, r: 0.25, g, type: 'sawtooth', det: [-7, 0, 6], cut: 1700, q: 0.9, cutEnv: [500, 3200, 0.07], wet: 0.4 });
  const lead = (S, t, m, dur, g = 0.07) => {
    tone(S, { t, f: mtof(m), dur, a: 0.012, r: 0.12, g, type: 'square', cut: 2600, q: 0.6, wet: 0.3, echo: 0.35 });
    tone(S, { t, f: mtof(m + 12), dur, a: 0.012, r: 0.12, g: g * 0.25, type: 'sine', wet: 0.2 });
  };
  const applause = (S, t0, t1, density = 90, g = 0.05) => {
    const n = Math.floor((t1 - t0) * density);
    for (let i = 0; i < n; i++) {
      const t = t0 + Math.abs(S.rnd()) * (t1 - t0);
      const fade = Math.min(1, (t - t0) / 1.2, (t1 - t) / 1.5);
      noise(S, { t, dur: 0.002, r: 0.012 + Math.abs(S.rnd()) * 0.02, g: g * (0.5 + Math.abs(S.rnd())) * Math.max(0.05, fade), bp: 1100 + Math.abs(S.rnd()) * 2200, q: 1.1, wet: 0.3 });
    }
  };

  // ---- pieces ----------------------------------------------------------------
  const pieces = {
    // "Thinking" — calm suspense bed with a ticking clock. A minor, 104 BPM, 8 bars loop.
    QUESTION: { bpm: 104, bars: 8, tail: 2.5, loop: true, compose(S, B) {
      const prog = [['A2', 'min'], ['A2', 'min'], ['F2', 'maj'], ['F2', 'maj'], ['D2', 'min'], ['D2', 'min'], ['E2', 'maj'], ['E2', 'maj']];
      prog.forEach(([root, kind], bar) => {
        const t0 = bar * 4 * B; const ch = chord(root, kind);
        if (bar % 2 === 0) pad(S, t0, ch.map((m) => m + 12), 8 * B - 0.3, 0.035, 1100);
        for (let e = 0; e < 8; e++) bass(S, t0 + e * B / 2, ch[0], B / 2 - 0.04, e % 2 ? 0.1 : 0.15, 380);
        const arp = [ch[0] + 24, ch[1] + 24, ch[2] + 24, ch[1] + 24];
        for (let s = 0; s < 8; s++) pluck(S, t0 + s * B / 2, arp[s % 4] + (s >= 4 ? 12 : 0), 0.05, 0.18);
        for (let b = 0; b < 4; b++) { tick(S, t0 + b * B, true); tick(S, t0 + b * B + B / 2, false); }
        kick(S, t0, 0.5); kick(S, t0 + 2 * B, 0.35);
      });
      // soft rising "clock" motif at the half-way point
      [[16, 'E5'], [17, 'F5'], [18, 'G#5'], [19, 'A5']].forEach(([beat, n]) => bell(S, beat * B, note(n), 0.05, 1.2));
    } },

    // "Decide!" — more energy while the options are up. A minor, 120 BPM.
    OPTIONS: { bpm: 120, bars: 8, tail: 2.5, loop: true, compose(S, B) {
      const prog = [['A2', 'min'], ['F2', 'maj'], ['C3', 'maj'], ['G2', 'maj'], ['A2', 'min'], ['F2', 'maj'], ['D3', 'min'], ['E2', 'maj']];
      const motif = [[0, 'E5', 1], [1.5, 'C5', 0.5], [2, 'D5', 1], [3, 'B4', 1], [4, 'A4', 1.5], [6, 'C5', 1], [7, 'E5', 1]];
      prog.forEach(([root, kind], bar) => {
        const t0 = bar * 4 * B; const ch = chord(root, kind);
        pad(S, t0, ch.map((m) => m + 12), 4 * B - 0.2, 0.03, 1500);
        [0, 0.75, 1.5, 2, 2.75, 3.5].forEach((o, i) => bass(S, t0 + o * B, ch[0] + (i % 3 === 2 ? 12 : 0), B * 0.4, 0.16, 600));
        for (let b = 0; b < 4; b++) { kick(S, t0 + b * B, 0.7); hat(S, t0 + b * B + B / 2, 0.08); }
        clap(S, t0 + B, 0.22); clap(S, t0 + 3 * B, 0.22);
        for (let s = 0; s < 16; s++) if (s % 3 !== 2) pluck(S, t0 + s * B / 4, ch[s % 3] + 24, 0.035, 0.12);
      });
      [0, 16].forEach((startBeat) => motif.forEach(([b, n, d]) => bell(S, (startBeat + b) * B, note(n), 0.08, 0.9 + d * 0.3)));
    } },

    // Answer reveal — drum roll, then a bright major "ta-daa" with sparkles. Plays once.
    ANSWER: { bpm: 120, seconds: 4.2, loop: false, compose(S) {
      for (let i = 0, t = 0; t < 1.05; i++) { snare(S, t, 0.06 + 0.25 * (t / 1.05)); t += i < 8 ? 0.09 : 0.05; }
      noise(S, { t: 0.2, dur: 0.85, a: 0.8, r: 0.05, g: 0.08, hp: 3000, wet: 0.2 }); // riser
      const hit = 1.12;
      kick(S, hit, 1); timpani(S, hit, 65.4, 0.5); crash(S, hit, 0.25);
      ['C3', 'G3', 'C4', 'E4', 'G4', 'C5'].forEach((n) => brass(S, hit, note(n), 0.9, 0.075));
      ['C6', 'E6', 'G6', 'C7'].forEach((n, i) => bell(S, hit + 0.06 + i * 0.09, note(n), 0.07, 1.6));
    } },

    // "Scoreboard" — bright, bouncy groove for round results. C major, 116 BPM.
    ROUND_RESULTS: { bpm: 116, bars: 8, tail: 2.5, loop: true, compose(S, B) {
      const prog = [['C3', 'maj'], ['A2', 'min'], ['F2', 'maj'], ['G2', 'maj'], ['C3', 'maj'], ['A2', 'min'], ['F2', 'maj'], ['G2', 'maj']];
      const mel = [
        [[0, 'E5', 0.5], [1, 'G5', 0.5], [2, 'A5', 0.5], [2.5, 'G5', 0.5], [3, 'E5', 1]],
        [[0, 'C5', 0.5], [1, 'D5', 0.5], [1.5, 'E5', 0.5], [2, 'D5', 1], [3, 'C5', 1]],
        [[0, 'F5', 0.5], [1, 'E5', 0.5], [1.5, 'D5', 0.5], [2, 'C5', 1], [3, 'A4', 1]],
        [[0, 'B4', 0.5], [0.5, 'C5', 0.5], [1, 'D5', 1], [2, 'G5', 1.5]],
        [[0, 'E5', 0.5], [1, 'G5', 0.5], [2, 'C6', 0.5], [2.5, 'B5', 0.5], [3, 'G5', 1]],
        [[0, 'A5', 0.5], [1, 'G5', 0.5], [1.5, 'E5', 0.5], [2, 'C5', 1], [3, 'E5', 1]],
        [[0, 'F5', 0.5], [0.5, 'A5', 0.5], [1, 'C6', 1], [2, 'A5', 0.5], [2.5, 'F5', 0.5], [3, 'D5', 1]],
        [[0, 'D5', 0.5], [0.5, 'E5', 0.5], [1, 'F5', 0.5], [1.5, 'G5', 1.5]]
      ];
      prog.forEach(([root, kind], bar) => {
        const t0 = bar * 4 * B; const ch = chord(root, kind);
        [0, 1, 2, 3].forEach((b) => kick(S, t0 + b * B, b % 2 ? 0.55 : 0.8));
        snare(S, t0 + B, 0.28); snare(S, t0 + 3 * B, 0.28);
        for (let e = 0; e < 8; e++) hat(S, t0 + e * B / 2, e % 2 ? 0.1 : 0.06, e === 7);
        [[0, 0], [0.75, 0], [1.5, 12], [2, 7], [2.75, 0], [3.5, 12]].forEach(([o, iv]) => bass(S, t0 + o * B, ch[0] + iv, B * 0.35, 0.17, 700));
        [0.5, 1.5, 2.5, 3.5].forEach((o) => ch.forEach((m) => tone(S, { t: t0 + o * B, f: mtof(m + 12), dur: 0.06, r: 0.09, g: 0.03, type: 'square', cut: 2200, wet: 0.2 })));
        mel[bar].forEach(([b, n, d]) => lead(S, t0 + b * B, note(n), d * B * 0.92, 0.06));
      });
    } },

    // "Champions" — fanfare, timpani and cymbals, then a celebration with applause.
    FINAL_RESULTS: { bpm: 120, bars: 12, tail: 3, loop: true, compose(S, B) {
      // bars 1-4: fanfare
      const fan = [[0, 'G4', 0.33], [0.33, 'G4', 0.33], [0.66, 'G4', 0.34], [1, 'C5', 2.5], [4, 'E5', 0.75], [4.75, 'D5', 0.25], [5, 'C5', 1], [6, 'G4', 2],
        [8, 'A4', 0.75], [8.75, 'B4', 0.25], [9, 'C5', 1], [10, 'D5', 2], [12, 'E5', 0.5], [12.5, 'F5', 0.5], [13, 'G5', 3]];
      const fanChords = [[0, ['C4', 'E4', 'G4'], 4], [4, ['C4', 'E4', 'G4'], 2], [6, ['B3', 'D4', 'G4'], 2], [8, ['A3', 'C4', 'F4'], 2], [10, ['B3', 'D4', 'G4'], 2], [12, ['C4', 'E4', 'G4'], 4]];
      fan.forEach(([b, n, d]) => brass(S, b * B, note(n), d * B * 0.95, 0.11));
      fanChords.forEach(([b, ns, d]) => ns.forEach((n) => brass(S, b * B, note(n), d * B * 0.9, 0.045)));
      [0, 1, 4, 8, 12].forEach((b) => timpani(S, b * B, b === 12 ? 65.4 : 98, 0.45));
      for (let i = 0; i < 12; i++) timpani(S, (11 + i / 12) * B, 98, 0.12 + i * 0.02);
      crash(S, 0, 0.18); crash(S, 12 * B, 0.28); crash(S, 16 * B, 0.3);
      applause(S, 12 * B, 48 * B + 2, 110, 0.045);
      // bars 5-12: celebration C G Am F x2
      const prog = [['C3', 'maj'], ['G2', 'maj'], ['A2', 'min'], ['F2', 'maj'], ['C3', 'maj'], ['G2', 'maj'], ['A2', 'min'], ['F2', 'maj']];
      const bells = [['E5', 'G5', 'C6', 'G5'], ['D5', 'G5', 'B5', 'G5'], ['C5', 'E5', 'A5', 'E5'], ['C5', 'F5', 'A5', 'F5']];
      const hook = [[0, 'G5', 1], [1, 'E5', 0.5], [1.5, 'G5', 0.5], [2, 'C6', 2], [4, 'B5', 1], [5, 'G5', 1], [6, 'D5', 2],
        [8, 'C5', 0.5], [8.5, 'E5', 0.5], [9, 'A5', 1.5], [10.5, 'G5', 0.5], [11, 'E5', 1], [12, 'F5', 1], [13, 'A5', 1], [14, 'C6', 2]];
      prog.forEach(([root, kind], i) => {
        const t0 = (16 + i * 4) * B; const ch = chord(root, kind);
        [0, 1, 2, 3].forEach((b) => kick(S, t0 + b * B, 0.75));
        clap(S, t0 + B, 0.26); clap(S, t0 + 3 * B, 0.26);
        for (let e = 0; e < 8; e++) hat(S, t0 + e * B / 2 + B / 4, 0.07);
        [0, 1, 2, 3].forEach((b) => bass(S, t0 + b * B, ch[0] + (b % 2 ? 12 : 0), B * 0.45, 0.17, 650));
        pad(S, t0, ch.map((m) => m + 12), 4 * B - 0.2, 0.03, 1600);
        bells[i % 4].forEach((n, k) => bell(S, t0 + k * B, note(n), 0.06, 0.9));
      });
      hook.forEach(([b, n, d]) => { brass(S, (16 + b) * B, note(n) - 12, d * B * 0.9, 0.07); brass(S, (32 + b) * B, note(n) - 12, d * B * 0.9, 0.07); });
    } }
  };

  function toWav(samples) {
    const buf = new ArrayBuffer(44 + samples.length * 2); const v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, SR, true);
    v.setUint32(28, SR * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, samples.length * 2, true);
    for (let i = 0; i < samples.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, samples[i])) * 32767, true);
    let bin = ''; const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  window.renderTrack = async (name) => {
    const p = pieces[name];
    const B = 60 / p.bpm;
    const loopLen = p.seconds || p.bars * 4 * B;
    const total = loopLen + (p.loop ? p.tail : 0.3);
    const S = makeCtx(total);
    p.compose(S, B);
    const rendered = await S.ctx.startRendering();
    const all = rendered.getChannelData(0);
    let out;
    if (p.loop) {
      // fold the reverb/echo tail back onto the start so the loop is seamless
      const L = Math.round(loopLen * SR);
      out = new Float32Array(L);
      for (let i = 0; i < L; i++) out[i] = all[i] + (i + L < all.length ? all[i + L] : 0);
    } else {
      out = all;
      const fadeN = Math.round(0.25 * SR);
      for (let i = 0; i < fadeN; i++) out[out.length - 1 - i] *= i / fadeN;
    }
    let peak = 0; let sum = 0;
    for (let i = 0; i < out.length; i++) { const a = Math.abs(out[i]); if (a > peak) peak = a; sum += out[i] * out[i]; }
    const gain = 0.89 / (peak || 1);
    for (let i = 0; i < out.length; i++) out[i] *= gain;
    const rmsDb = 20 * Math.log10(Math.sqrt(sum / out.length) * gain);
    const seam = p.loop ? Math.abs(out[0] - out[out.length - 1]) : 0;
    return { wav: toWav(out), seconds: out.length / SR, rmsDb: Math.round(rmsDb * 10) / 10, seam: Math.round(seam * 1000) / 1000 };
  };
})();
