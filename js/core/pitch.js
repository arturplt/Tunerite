"use strict";
/* ============================================================
   CORE (pure functions, no DOM or Web Audio). Tested in tests/core.test.js
   ============================================================ */
/* CORE:BEGIN */
const NOTE_NAMES = ['C','C♯','D','D♯','E','F','F♯','G','G♯','A','A♯','B'];
function freqToMidi(f, a4) { return 69 + 12 * Math.log2(f / (a4 || 440)); }
function midiToFreq(m, a4) { return (a4 || 440) * Math.pow(2, (m - 69) / 12); }
function noteName(m) { const r = Math.round(m); return NOTE_NAMES[((r % 12) + 12) % 12] + (Math.floor(r / 12) - 1); }
function centsOff(m) { return (m - Math.round(m)) * 100; }
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function median(a) { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; }

/* YIN pitch detection. Self-contained (it is copied into the AudioWorklet via toString()). */
function yin(buf, sr, fmin, fmax, thr) {
  const n = buf.length, W = n >> 1;
  const maxTau = Math.min(W - 1, Math.floor(sr / fmin));
  const minTau = Math.max(2, Math.floor(sr / fmax));
  const c = new Float32Array(maxTau + 2);
  let run = 0; c[0] = 1;
  for (let tau = 1; tau <= maxTau; tau++) {
    let s = 0;
    for (let i = 0; i < W; i++) { const x = buf[i] - buf[i + tau]; s += x * x; }
    run += s;
    c[tau] = run > 0 ? s * tau / run : 1;
  }
  let tau = -1;
  for (let t = minTau; t <= maxTau; t++) {
    if (c[t] < thr) { while (t + 1 <= maxTau && c[t + 1] < c[t]) t++; tau = t; break; }
  }
  if (tau < 1) return null;
  const x0 = c[tau - 1], x1 = c[tau], x2 = tau + 1 <= maxTau ? c[tau + 1] : c[tau];
  const den = x0 + x2 - 2 * x1;
  const shift = den !== 0 ? (x0 - x2) / (2 * den) : 0;
  const better = tau + (Math.abs(shift) < 1 ? shift : 0);
  return { freq: sr / better, conf: 1 - x1 };
}
function decimate(buf, k) {
  if (k <= 1) return buf;
  const n = Math.floor(buf.length / k), o = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < k; j++) s += buf[i * k + j]; o[i] = s / k; }
  return o;
}
/* Sharpens a high pitch found on decimated audio: re-checks a few lags around it on the full-rate samples. */
function refine(x, sr, f) {
  const t0 = sr / f, n = x.length, W = n >> 1, lo = Math.max(2, Math.floor(t0) - 4), hi = Math.min(W - 1, Math.ceil(t0) + 4), c = {};
  let best = -1, bestC = 1e9;
  for (let tau = lo; tau <= hi; tau++) {
    let d = 0, e = 0;
    for (let i = 0; i < W; i++) { const a = x[i], b = x[i + tau]; d += (a - b) * (a - b); e += a * a + b * b; }
    c[tau] = e > 0 ? d / e : 1;
    if (c[tau] < bestC) { bestC = c[tau]; best = tau; }
  }
  if (best <= lo || best >= hi) return f;
  const a = c[best - 1], b = c[best], d = c[best + 1], den = a + d - 2 * b;
  return sr / (best + (den ? (a - d) / (2 * den) : 0));
}
/* One analysis frame: raw samples in, {f (Hz, 0 if none), conf, rms} out. Decimates to ~16 kHz first to keep CPU low. */
function analyse(raw, sr, fmin, fmax, dec) {
  let e = 0;
  for (let i = 0; i < raw.length; i++) e += raw[i] * raw[i];
  const rms = Math.sqrt(e / raw.length);
  const k = dec || Math.max(1, Math.floor(sr / 16000));   // whistles reach 4 kHz, so they skip decimation
  const r = yin(decimate(raw, k), sr / k, fmin || 65, fmax || 1100, 0.2);
  return r ? { f: k > 1 && r.freq > 600 ? refine(raw, sr, r.freq) : r.freq, conf: r.conf, rms } : { f: 0, conf: 0, rms };
}

/* Turns raw frames into a steady note: noise gate, confidence floor, median smoothing, octave-jump rejection. */
class PitchTracker {
  constructor(o) { o = o || {}; this.a4 = o.a4 || 440; this.gate = o.gate || 0.008; this.minConf = o.minConf || 0.75; this.reset(); }
  reset() { this.recent = []; this.last = null; this.miss = 0; this.pend = 0; this.pendNote = null; }
  push(f, conf, rms) {
    const voiced = rms >= this.gate && f > 0 && conf >= this.minConf;
    if (!voiced) {
      if (++this.miss > 6) this.reset();
      return null;
    }
    this.miss = 0;
    const m = freqToMidi(f, this.a4);
    if (this.last !== null && Math.abs(m - this.last) > 2.5) {         // too big for a glide: hold the old note until the new one persists
      const d = Math.abs(m - this.last), overtone = [12, 19, 24, 28, 31].some(h => Math.abs(d - h) < 0.9);   // octave, fifth, ... = a pick of an overtone
      this.pend = this.pendNote !== null && Math.abs(m - this.pendNote) < 1 ? this.pend + 1 : 1; this.pendNote = m;
      if (this.pend < (overtone ? 6 : 3)) return this.last;
      this.recent = [];
    } else { this.pend = 0; this.pendNote = null; }
    this.recent.push(m);
    if (this.recent.length > 5) this.recent.shift();
    this.last = median(this.recent);
    return this.last;
  }
}

