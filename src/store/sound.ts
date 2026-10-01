const KEY_ENABLED = "screenwellness.soundEnabled";
const KEY_VOLUME  = "screenwellness.soundVolume";

// ── settings ──────────────────────────────────────────────────────────────────

export function isSoundEnabled(): boolean {
  return localStorage.getItem(KEY_ENABLED) !== "false";
}

export function getSoundVolume(): number {
  const v = localStorage.getItem(KEY_VOLUME);
  return v !== null ? Math.min(1, Math.max(0, parseFloat(v))) : 0.4;
}

export function setSoundEnabled(v: boolean): void {
  localStorage.setItem(KEY_ENABLED, String(v));
}

export function setSoundVolume(v: number): void {
  localStorage.setItem(KEY_VOLUME, String(Math.min(1, Math.max(0, v))));
}

function vol(): number {
  return isSoundEnabled() ? getSoundVolume() : 0;
}

// Shared context — reuse across short one-shot sounds
let _sharedCtx: AudioContext | null = null;
function sharedCtx(): AudioContext {
  if (!_sharedCtx || _sharedCtx.state === "closed") {
    _sharedCtx = new AudioContext();
  }
  if (_sharedCtx.state === "suspended") {
    _sharedCtx.resume().catch(() => {});
  }
  return _sharedCtx;
}

// ── tick (last 5 seconds before break) ───────────────────────────────────────
export function playTick(): void {
  const v = vol();
  if (v === 0) return;
  try {
    const c = sharedCtx();
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.connect(g);
    g.connect(c.destination);
    osc.type = "sine";
    osc.frequency.value = 1100;
    g.gain.setValueAtTime(0, c.currentTime);
    g.gain.linearRampToValueAtTime(v * 0.16, c.currentTime + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + 0.07);
    osc.start(c.currentTime);
    osc.stop(c.currentTime + 0.08);
  } catch { /* ignore */ }
}

// ── meditation bell (overlay open) ───────────────────────────────────────────
export function playBell(): void {
  const v = vol();
  if (v === 0) return;
  try {
    const c = sharedCtx();
    const tones: [number, number, number][] = [
      [528,  v * 0.35, 3.5],
      [1056, v * 0.14, 1.8],
      [1584, v * 0.05, 0.9],
    ];
    for (const [freq, peak, decay] of tones) {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.connect(g);
      g.connect(c.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      g.gain.setValueAtTime(0, c.currentTime);
      g.gain.linearRampToValueAtTime(peak, c.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + decay);
      osc.start(c.currentTime);
      osc.stop(c.currentTime + decay);
    }
  } catch { /* ignore */ }
}

// ── success chime (points awarded) ───────────────────────────────────────────
export function playSuccess(): void {
  const v = vol();
  if (v === 0) return;
  try {
    const c = sharedCtx();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.connect(g);
      g.connect(c.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = c.currentTime + i * 0.09;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v * 0.22, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      osc.start(t);
      osc.stop(t + 0.55);
    });
  } catch { /* ignore */ }
}

// ── level-up fanfare (badge earned) ──────────────────────────────────────────
export function playLevelUp(): void {
  const v = vol();
  if (v === 0) return;
  try {
    const c = sharedCtx();
    // G4 C5 E5 G5 C6 E6 — ascending fanfare
    const notes = [392, 523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((freq, i) => {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.connect(g);
      g.connect(c.destination);
      osc.type = "triangle";
      osc.frequency.value = freq;
      const t = c.currentTime + i * 0.1;
      const dur = i === notes.length - 1 ? 0.9 : 0.3;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v * 0.28, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    });
  } catch { /* ignore */ }
}

// ── ambient rain (break overlay) — returns stop fn ───────────────────────────
export function startAmbientRain(): () => void {
  const v = vol();
  if (v === 0) return () => {};
  try {
    // Own context so we can close it cleanly on dismiss
    const c = new AudioContext();
    const rate = c.sampleRate;
    const bufLen = rate * 3; // 3-second looping buffer

    // Paul Kellet's pink noise algorithm
    const buf = c.createBuffer(1, bufLen, rate);
    const data = buf.getChannelData(0);
    let b0=0, b1=0, b2=0, b3=0, b4=0, b5=0;
    for (let i = 0; i < bufLen; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886*b0 + w*0.0555179;
      b1 = 0.99332*b1 + w*0.0750759;
      b2 = 0.96900*b2 + w*0.1538520;
      b3 = 0.86650*b3 + w*0.3104856;
      b4 = 0.55000*b4 + w*0.5329522;
      b5 = -0.7616*b5 - w*0.0168980;
      data[i] = (b0+b1+b2+b3+b4+b5 + w*0.5362) * 0.11;
    }

    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;

    const hp = c.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 300;

    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 5000;

    const gain = c.createGain();
    gain.gain.value = v * 0.28;

    src.connect(hp);
    hp.connect(lp);
    lp.connect(gain);
    gain.connect(c.destination);
    src.start();

    return () => {
      try { src.stop(); } catch { /* ignore */ }
      c.close().catch(() => {});
    };
  } catch {
    return () => {};
  }
}
