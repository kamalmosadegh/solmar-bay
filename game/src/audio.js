// All sound is synthesized with WebAudio: no audio files, no network.
// SFX are short oscillator/noise bursts; the music is a tiny sequencer
// (bass + lead + hats) that loops a sunny, slightly tense groove.
let ctx = null;
let master = null;
let musicTimer = null;
let sirenOsc = null;
let sirenGain = null;
let engineOsc = null;
let engineGain = null;
let muted = false;
let musicStep = 0;

// A mellow minor groove: Am - F - C - G, 8 steps a bar, 4 bars a loop.
const BASS = [55, 0, 55, 0, 43.65, 0, 43.65, 0, 65.41, 0, 65.41, 0, 49, 0, 49, 0,
  55, 0, 55, 0, 43.65, 0, 43.65, 0, 65.41, 0, 65.41, 0, 49, 0, 98, 0];
const LEAD = [220, 0, 261.63, 0, 329.63, 0, 392, 0, 329.63, 0, 261.63, 0, 220, 0, 0, 0,
  174.61, 0, 220, 0, 261.63, 0, 329.63, 0, 392, 0, 329.63, 0, 293.66, 0, 261.63, 0];

export function ensureAudio() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
  } catch (e) {
    ctx = null;
  }
}

export function setMuted(m) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}

export function isMuted() {
  return muted;
}

function tone(freq, dur, type, vol, slideTo) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  osc.connect(g);
  g.connect(master);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noiseBurst(dur, vol, lowpass) {
  if (!ctx || muted) return;
  const t = ctx.currentTime;
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = lowpass || 1200;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(filter);
  filter.connect(g);
  g.connect(master);
  src.start(t);
}

export const sfx = {
  shoot() { noiseBurst(0.12, 0.5, 2600); tone(180, 0.08, 'square', 0.18, 60); },
  punch() { noiseBurst(0.08, 0.35, 700); },
  hit() { tone(140, 0.1, 'sawtooth', 0.2, 70); },
  crash() { noiseBurst(0.25, 0.6, 500); tone(90, 0.2, 'sine', 0.4, 40); },
  pickup() { tone(660, 0.09, 'sine', 0.25); tone(990, 0.14, 'sine', 0.22); },
  cash() { tone(880, 0.08, 'triangle', 0.25); tone(1174, 0.1, 'triangle', 0.25); tone(1568, 0.18, 'triangle', 0.22); },
  mission() { tone(523, 0.12, 'triangle', 0.28); tone(659, 0.12, 'triangle', 0.28); tone(784, 0.22, 'triangle', 0.28); },
  fail() { tone(392, 0.18, 'sawtooth', 0.2, 330); tone(311, 0.3, 'sawtooth', 0.2, 262); },
  door() { noiseBurst(0.06, 0.25, 900); tone(220, 0.06, 'square', 0.1, 180); },
  skid() { noiseBurst(0.18, 0.12, 1800); },
  arrest() { tone(440, 0.15, 'square', 0.2, 440); tone(440, 0.15, 'square', 0.2, 440); },
  horn() { tone(370, 0.18, 'square', 0.12); tone(466, 0.18, 'square', 0.1); },
  click() { tone(700, 0.05, 'square', 0.15); },
};

/** Police siren: two alternating tones while wanted > 0. */
export function setSiren(on) {
  if (!ctx) return;
  if (on && !sirenOsc) {
    sirenOsc = ctx.createOscillator();
    sirenOsc.type = 'triangle';
    sirenOsc.frequency.value = 750;
    sirenGain = ctx.createGain();
    sirenGain.gain.value = 0.05;
    sirenOsc.connect(sirenGain);
    sirenGain.connect(master);
    sirenOsc.start();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 1.4;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 220;
    lfo.connect(lfoGain);
    lfoGain.connect(sirenOsc.frequency);
    lfo.start();
    sirenOsc._lfo = lfo;
  } else if (!on && sirenOsc) {
    try { sirenOsc._lfo.stop(); sirenOsc.stop(); } catch (e) { /* already stopped */ }
    sirenOsc = null;
  }
}

/** Engine hum follows the driven car's speed; call every frame. */
export function setEngine(speed01, driving) {
  if (!ctx) return;
  if (driving && !engineOsc) {
    engineOsc = ctx.createOscillator();
    engineOsc.type = 'sawtooth';
    engineOsc.frequency.value = 60;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    engineGain = ctx.createGain();
    engineGain.gain.value = 0.0;
    engineOsc.connect(filter);
    filter.connect(engineGain);
    engineGain.connect(master);
    engineOsc.start();
  }
  if (engineOsc) {
    const target = driving ? 0.05 + speed01 * 0.06 : 0;
    engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
    engineOsc.frequency.setTargetAtTime(55 + speed01 * 130, ctx.currentTime, 0.08);
  }
}

export function startMusic() {
  ensureAudio();
  if (!ctx || musicTimer) return;
  musicTimer = setInterval(() => {
    if (muted || !ctx) return;
    const i = musicStep % 32;
    const bass = BASS[i];
    const lead = LEAD[i];
    if (bass) tone(bass, 0.22, 'triangle', 0.16);
    if (lead && musicStep % 2 === 0) tone(lead, 0.2, 'sine', 0.07);
    if (musicStep % 4 === 2) noiseBurst(0.03, 0.05, 6000); // hat tick
    musicStep += 1;
  }, 240);
}

export function stopMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
}
