// Synthesized sound for SUNSET HEIST: every effect is built with WebAudio
// oscillators and filtered noise, so the game ships no audio files at all.
import { S } from './state.js';
import { clamp } from './util.js';

let ctx = null, master = null, engineOsc = null, engineGain = null, engineFilter = null;
let sirenOsc = null, sirenGain = null, sirenLfo = null;
let noiseBuf = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = 0.5; master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // Engine: two detuned saw oscillators through a low-pass filter.
    engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 55;
    const engineOsc2 = ctx.createOscillator(); engineOsc2.type = 'square'; engineOsc2.frequency.value = 28;
    engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 320;
    engineGain = ctx.createGain(); engineGain.gain.value = 0;
    engineOsc.connect(engineFilter); engineOsc2.connect(engineFilter);
    engineFilter.connect(engineGain); engineGain.connect(master);
    engineOsc.start(); engineOsc2.start();
    // Police siren: sine that wails up and down via an LFO.
    sirenOsc = ctx.createOscillator(); sirenOsc.type = 'sine'; sirenOsc.frequency.value = 750;
    sirenLfo = ctx.createOscillator(); sirenLfo.type = 'triangle'; sirenLfo.frequency.value = 0.55;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 280;
    sirenLfo.connect(lfoGain); lfoGain.connect(sirenOsc.frequency);
    sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
    sirenOsc.connect(sirenGain); sirenGain.connect(master);
    sirenOsc.start(); sirenLfo.start();
  } catch (e) { ctx = null; }
}

export function setMuted(m) {
  S.muted = m;
  if (master && ctx) master.gain.value = m ? 0 : 0.5;
}

// Continuous engine hum follows the driven car's speed.
export function updateEngineSound(speed, driving) {
  if (!ctx || !engineOsc) return;
  const target = driving ? 0.05 + clamp(Math.abs(speed) / 38, 0, 1) * 0.11 : 0;
  engineGain.gain.setTargetAtTime(S.muted ? 0 : target, ctx.currentTime, 0.1);
  const f = 50 + Math.abs(speed) * 4.2;
  engineOsc.frequency.setTargetAtTime(f, ctx.currentTime, 0.08);
  engineFilter.frequency.setTargetAtTime(300 + Math.abs(speed) * 22, ctx.currentTime, 0.1);
}

export function updateSirenSound() {
  if (!ctx || !sirenGain) return;
  const on = S.wanted > 0 && S.policeCars.length > 0 && !S.muted;
  sirenGain.gain.setTargetAtTime(on ? 0.035 : 0, ctx.currentTime, 0.3);
}

function noiseBurst(dur, filterFreq, gainVal, type) {
  if (!ctx || S.muted) return;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf;
  const flt = ctx.createBiquadFilter(); flt.type = type || 'bandpass'; flt.frequency.value = filterFreq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(gainVal, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  src.connect(flt); flt.connect(g); g.connect(master);
  src.start(); src.stop(ctx.currentTime + dur);
}

function tone(freq, dur, gainVal, type, slideTo) {
  if (!ctx || S.muted) return;
  const o = ctx.createOscillator(); o.type = type || 'sine'; o.frequency.value = freq;
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(gainVal, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  o.connect(g); g.connect(master);
  o.start(); o.stop(ctx.currentTime + dur);
}

export function playGunshot() { noiseBurst(0.14, 1800, 0.5, 'highpass'); tone(160, 0.08, 0.25, 'square', 60); }
export function playRivalShot() { noiseBurst(0.12, 1200, 0.22, 'highpass'); }
export function playCrash() { noiseBurst(0.35, 300, 0.6, 'lowpass'); tone(70, 0.3, 0.3, 'triangle', 35); }
export function playPickup() { tone(660, 0.1, 0.25, 'sine'); setTimeout(() => tone(990, 0.16, 0.25, 'sine'), 90); }
export function playMissionComplete() {
  [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => tone(f, 0.22, 0.28, 'triangle'), i * 110));
}
export function playMissionFail() { tone(220, 0.5, 0.3, 'sawtooth', 110); }
export function playSkid() { noiseBurst(0.25, 900, 0.12, 'bandpass'); }
export function playHorn() { tone(370, 0.18, 0.2, 'square'); tone(466, 0.18, 0.15, 'square'); }
export function playClick() { tone(880, 0.05, 0.15, 'sine'); }
