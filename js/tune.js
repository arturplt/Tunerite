"use strict";
/* ---- Pitch correction for voice recordings ----
   1. A pitch track: the voice's frequency every 256 samples (the same YIN analysis the tuner uses), median-smoothed.
   2. For each voiced frame the nearest note of the chosen scale; `amount` says how far the voice is pulled towards it, and `speed` how fast that pull follows (slow keeps
      the natural slides, fast is the robotic "hard tune" sound).
   3. TD-PSOLA: pitch marks are placed on the waveform peaks, the signal is cut into two-period grains around them and overlap-added at the new spacing. The timing does not change,
      and the voice keeps its vowel colour because the grains themselves are not altered. Unvoiced sounds (s, t, breath) are copied through unchanged. */
const Tune = {
  H: 512, W: 3072,
  yieldUi() { return new Promise(r => setTimeout(r, 0)); },
  /* The pitch of every hop (frame f is centred on sample f * H), found in two steps so that a single note cannot flip between octaves:
     1. For each frame all the plausible periods are collected (the dips of the YIN difference curve), not just the first one.
     2. A path through those candidates is chosen over the whole recording: each candidate costs its YIN value, and jumping between candidates costs more the further apart they are
        (an octave costs more than any single frame can gain), so a held note stays in one octave. Quiet frames can only be "no pitch".
     Returns { f0 (cleaned, Hz, 0 = none), path (before cleaning), raw (each frame's single best dip, i.e. what a plain detector says), conf, rms, H }. */
  async trackDetail(x, sr) {
    const H = this.H, W = this.W, F = Math.floor(x.length / H) + 1, k = Math.max(1, Math.floor(sr / 16000)), srd = sr / k, n = Math.floor(W / k), maxTau = Math.min(Math.floor(srd / 65), n - 64), minTau = Math.max(2, Math.floor(srd / 1100));
    const fr = new Float32Array(W), cands = new Array(F), rms = new Float32Array(F), raw = new Float32Array(F), conf = new Float32Array(F), c = new Float32Array(maxTau + 2), Wi = n - maxTau; let loud = 0;
    for (let f = 0; f < F; f++) {
      const s0 = f * H - W / 2; let e = 0; for (let i = 0; i < W; i++) { const j = s0 + i, v = j >= 0 && j < x.length ? x[j] : 0; fr[i] = v; e += v * v; }
      rms[f] = Math.sqrt(e / W); if (rms[f] > loud) loud = rms[f];
      const y = decimate(fr, k); let run = 0; c[0] = 1;
      for (let tau = 1; tau <= maxTau; tau++) { let d = 0; for (let i = 0; i < Wi; i++) { const q = y[i] - y[i + tau]; d += q * q; } run += d; c[tau] = run > 0 ? d * tau / run : 1; }
      const list = []; for (let t = minTau + 1; t < maxTau; t++) if (c[t] < 0.5 && c[t] < c[t - 1] && c[t] <= c[t + 1]) { const den = c[t - 1] + c[t + 1] - 2 * c[t], sh = den ? (c[t - 1] - c[t + 1]) / (2 * den) : 0; list.push({ f: srd / (t + (Math.abs(sh) < 1 ? sh : 0)), c: c[t] }); }
      list.sort((a, b) => a.c - b.c); cands[f] = list.slice(0, 5); if (list.length) { raw[f] = list[0].f; conf[f] = 1 - list[0].c; }
      if (f % 60 === 59) await this.yieldUi();
    }
    const gate = Math.max(0.002, loud * 0.04); for (let f = 0; f < F; f++) if (rms[f] < gate) { cands[f] = []; raw[f] = 0; conf[f] = 0; }      // quiet next to the loudest part: background noise, not a note
    /* The path: dynamic programming over [candidates..., "no pitch"] per frame. */
    const U = 0.4, SW = 0.3, OCT = 1.5, cost = [], back = [];
    for (let f = 0; f < F; f++) {
      const cs = cands[f], m = cs.length, cf = new Float64Array(m + 1), bk = new Int16Array(m + 1);
      for (let i = 0; i <= m; i++) {
        const obs = i < m ? cs[i].c : U; let best = 0, bi = 0;
        if (f > 0) {
          const pc = cands[f - 1], pm = pc.length, pcost = cost[f - 1]; best = 1e18;
          for (let j = 0; j <= pm; j++) { const t = (i < m && j < pm) ? OCT * Math.abs(Math.log2(cs[i].f / pc[j].f)) : (i === m && j === pm) ? 0 : SW, v = pcost[j] + t; if (v < best) { best = v; bi = j; } }
        }
        cf[i] = best + obs; bk[i] = bi;
      }
      cost.push(cf); back.push(bk);
    }
    const path = new Float32Array(F); let i = 0; { const last = cost[F - 1]; let b = 1e18; for (let q = 0; q < last.length; q++) if (last[q] < b) { b = last[q]; i = q; } }
    for (let f = F - 1; f >= 0; f--) { path[f] = i < cands[f].length ? cands[f][i].f : 0; i = back[f][i]; }
    return { f0: this.clean(path), path, raw, conf, rms, H, F };
  },
  async track(x, sr) { return (await this.trackDetail(x, sr)).f0; },
  /* What the correction would do, without making it: the pitch data plus the note each frame is pulled to and by how many cents. */
  async inspect(buf, o) {
    const x = buf.getChannelData(0), sr = buf.sampleRate, d = await this.trackDetail(x, sr); d.sr = sr; this.annotate(d, o); return d;
  },
  annotate(d, o) {
    const p = this.plan(d.f0, d.sr, o); d.target = p.target; d.shift = new Float32Array(d.F); for (let f = 0; f < d.F; f++) d.shift[f] = isNaN(p.corr[f]) ? 0 : p.corr[f] * 100;
    return d;
  },

  /* Removes what a pitch tracker gets wrong on a real voice: octave jumps (pulled back next to the neighbours), stray frames, one-frame gaps and tiny islands of "voice". */
  clean(f0) {
    const F = f0.length, mid = f => 69 + 12 * Math.log2(f / 440), hz = m => 440 * Math.pow(2, (m - 69) / 12), m = new Float32Array(F);
    for (let f = 0; f < F; f++) m[f] = f0[f] > 0 ? mid(f0[f]) : NaN;
    const out = new Float32Array(F);
    for (let f = 0; f < F; f++) {
      if (isNaN(m[f])) continue; const v = []; for (let k = Math.max(0, f - 8); k <= Math.min(F - 1, f + 8); k++) if (k !== f && !isNaN(m[k])) v.push(m[k]);
      if (v.length < 4) { out[f] = m[f]; continue; } const md = median(v); let x = m[f]; while (x - md > 6) x -= 12; while (x - md < -6) x += 12;
      out[f] = Math.abs(x - md) > 3 ? 0 : x;      // still far from its neighbours: drop it
    }
    for (let f = 0; f < F; f++) if (out[f]) { const v = []; for (let k = Math.max(0, f - 2); k <= Math.min(F - 1, f + 2); k++) if (out[k]) v.push(out[k]); out[f] = v.length >= 3 ? median(v) : out[f]; }      // median of the pitched neighbours
    for (let f = 1; f < F - 1; f++) { if (out[f]) continue; let e = f; while (e < F && !out[e]) e++; if (e < F && e - f <= 4 && out[f - 1]) { for (let k = f; k < e; k++) out[k] = out[f - 1] + (out[e] - out[f - 1]) * (k - f + 1) / (e - f + 1); f = e; } }      // short gaps inside a note
    for (let f = 0; f < F; f++) { if (!out[f]) continue; let e = f; while (e < F && out[e]) e++; if (e - f < 4) for (let k = f; k < e; k++) out[k] = 0; f = e; }      // a note shorter than 20 ms is not one
    const r = new Float32Array(F); for (let f = 0; f < F; f++) r[f] = out[f] ? hz(out[f]) : 0; return r;
  },
  /* The nearest allowed note to midi pitch m. `set` holds pitch classes relative to `root`; null allows every semitone. */
  /* The note a pitch m (midi, fractional) at time t (seconds from the start of the recording) is pulled to, or null for "leave it": the notes of the followed track when o.notes is
     given, else the nearest note of the scale. Following a track: the notes sounding at t, or failing that the one nearest in time within a short reach (singers come in a little early or
     late); the note is taken in whichever octave is closest to the voice, since a voice and an instrument are rarely in the same octave. */
  targetFor(m, t, o) {
    if (!o.notes) return this.snap(m, o.set, o.root);
    const ns = o.notes, reach = 0.12; let best = null, bd = 1e9, near = null, nd = 1e9;
    let lo = 0, hi = ns.length; while (lo < hi) { const mid = (lo + hi) >> 1; if (ns[mid].s <= t + reach) lo = mid + 1; else hi = mid; }
    for (let i = lo - 1; i >= 0 && ns[i].s > t - o.maxLen - reach; i--) {
      const n = ns[i]; if (n.e + reach < t) continue; const d = t < n.s ? n.s - t : t > n.e ? t - n.e : 0, p = n.m + 12 * Math.round((m - n.m) / 12), dp = Math.abs(p - m);
      if (d === 0) { if (dp < bd) { bd = dp; best = p; } } else if (d < nd || (d === nd && dp < Math.abs(near - m))) { nd = d; near = p; }
    }
    return best != null ? best : near;
  },
  snap(m, set, root) {
    const r = Math.round(m); let best = r, bd = 1e9;
    for (let n = r - 7; n <= r + 7; n++) { if (set && !set.has((((n - root) % 12) + 12) % 12)) continue; const d = Math.abs(n - m); if (d < bd) { bd = d; best = n; } }
    return best;
  },
  /* The pitch ratio to apply at every hop. */
  /* What to do with every pitched frame, before any smoothing in time: `corr` (semitones to move it, NaN where there is no pitch) and `target` (the note it is pulled to, 0 for none).
     o.range: a dead zone in cents (the voice is only pulled to the edge of it, so a note that is close stays as it is);
     o.human 0-1: how much of the vibrato is kept (the correction is worked out for the slow centre of the pitch and applied to the wobbling pitch);
     o.slides 0-1: how much a fast slide between notes is protected from correction; o.maxShift: the largest correction in semitones; o.fine: all targets moved by this many cents. */
  plan(f0, sr, o) {
    const F = f0.length, a4 = o.a4 || 440, H = this.H, rng = (o.range || 0) / 100, hum = o.human || 0, sld = o.slides || 0, mx = o.maxShift == null ? 3 : o.maxShift, fine = (o.fine || 0) / 100;
    const m = new Float32Array(F).fill(NaN), c = new Float32Array(F).fill(NaN), corr = new Float32Array(F).fill(NaN), target = new Float32Array(F);
    for (let f = 0; f < F; f++) if (f0[f] > 0) m[f] = 69 + 12 * Math.log2(f0[f] / a4);
    const half = Math.max(1, Math.round(0.1 * sr / H));      // the slow centre: the mean over about 200 ms, which is a whole vibrato cycle
    for (let f = 0; f < F; f++) { if (isNaN(m[f])) continue; let s = 0, n = 0; for (let k = Math.max(0, f - half); k <= Math.min(F - 1, f + half); k++) if (!isNaN(m[k]) && Math.abs(m[k] - m[f]) < 6) { s += m[k]; n++; } c[f] = s / n; }
    const zone = d => d > rng ? d - rng : d < -rng ? d + rng : 0, tgt = (x, f) => { const t = this.targetFor(x, f * H / sr, o); return t == null ? null : t + fine; };
    const k = Math.max(1, Math.round(0.03 * sr / H));
    for (let f = 0; f < F; f++) {
      if (isNaN(m[f])) continue; const tm = tgt(m[f], f), tc = hum > 0 ? tgt(c[f], f) : null; target[f] = tm == null ? 0 : tm;
      const cm = tm == null ? 0 : zone(tm - m[f]), cc = tc == null ? 0 : zone(tc - c[f]); let v = o.amount * ((1 - hum) * cm + hum * cc);
      if (sld > 0 && f - k >= 0 && f + k < F && !isNaN(c[f - k]) && !isNaN(c[f + k])) { const slope = Math.abs(c[f + k] - c[f - k]) / (2 * k * H / sr), w = clamp((slope - 4) / 8, 0, 1); v *= 1 - sld * w; }      // from 4 semitones a second the pitch is sliding; by 12 it surely is
      corr[f] = clamp(v, -mx, mx);
    }
    return { corr, target };
  },
  ratios(f0, sr, o) {
    const F = f0.length, R = new Float32Array(F).fill(1), tau = 0.4 * Math.pow(1 - o.speed, 2), alpha = tau < 1e-4 ? 1 : 1 - Math.exp(-(this.H / sr) / tau), p = this.plan(f0, sr, o);
    let cs = 0, prev = false;
    for (let f = 0; f < F; f++) {
      if (isNaN(p.corr[f])) { prev = false; continue; }
      cs = prev ? cs + (p.corr[f] - cs) * alpha : p.corr[f]; prev = true; R[f] = Math.pow(2, cs / 12);
    }
    return R;
  },

  /* The signal without rumble and without the highest harmonics: what the pitch marks are placed on (the grains themselves come from the untouched signal). */
  band(x, sr) {
    const y = new Float32Array(x.length), a = 1 - Math.exp(-2 * Math.PI * 70 / sr), b = 1 - Math.exp(-2 * Math.PI * 1500 / sr); let l = 0, p = 0, q = 0;
    for (let i = 0; i < x.length; i++) { l += (x[i] - l) * a; p += (x[i] - l - p) * b; q += (p - q) * b; y[i] = q; }
    return y;
  },
  /* The position near `c` (within +-r) whose period-long stretch looks most like the one before `prev`. */
  align(y, prev, c, T, r) {
    const h = Math.round(T / 2), n = y.length; let best = c, bv = -2;
    const ref = (i, k) => y[i + k]; if (prev - h < 0 || prev + h >= n) return c;
    let er = 0; for (let k = -h; k <= h; k++) er += ref(prev, k) * ref(prev, k); if (er < 1e-12) return c;
    for (let p = Math.max(h, Math.round(c - r)); p <= Math.min(n - h - 1, Math.round(c + r)); p++) {
      let cc = 0, ep = 0; for (let k = -h; k <= h; k++) { const v = y[p + k]; cc += v * ref(prev, k); ep += v * v; }
      const nc = cc / Math.sqrt(er * ep + 1e-12); if (nc > bv) { bv = nc; best = p; }
    }
    return best;
  },
  peak(x, lo, hi) { lo = Math.max(0, lo | 0); hi = Math.min(x.length - 1, hi | 0); let b = lo, bv = -1e9; for (let i = lo; i <= hi; i++) if (x[i] > bv) { bv = x[i]; b = i; } return b; },
  /* Pitch marks: on waveform peaks one period apart while the voice is pitched, every 10 ms otherwise. */
  marks(x, f0, sr) {
    const N = x.length, H = this.H, F = f0.length, out = [], un = Math.round(0.01 * sr), y = this.band(x, sr); let pos = 0;
    while (pos < N) {
      const f = f0[Math.min(F - 1, Math.round(pos / H))], last = out[out.length - 1];
      if (f > 0) {
        const T = sr / f; let p = last && last.v ? this.align(y, last.p, last.p + T, T, T * 0.15) : this.peak(y, pos, pos + T);
        if (last && p <= last.p) p = last.p + Math.max(1, Math.round(T * 0.5));
        out.push({ p, T, v: true }); pos = p + T;
      } else { const p = Math.round(pos); out.push({ p, T: un, v: false }); pos = p + un; }
    }
    return out;
  },
  /* Overlap-add at the new spacing. Instead of taking the nearest analysis grain (which repeats or skips a whole period every so often: audible as roughness on a voice with any
     breath or jitter) each grain is a blend of the two analysis grains the new position falls between, so the sound slides from one period to the next. The spacing follows the real
     distance between the pitch marks, so the pitch lands where the ratio says. */
  synth(x, f0, R, sr) {
    const N = x.length, H = this.H, F = f0.length, mk = this.marks(x, f0, sr), out = new Float32Array(N), ws = new Float32Array(N); if (mk.length < 2) return x;
    let j = 0, ts = mk[0].p;
    while (ts < N) {
      while (j + 2 < mk.length && mk[j + 1].p <= ts) j++;
      const a = mk[j], b = mk[j + 1], span = Math.max(1, b.p - a.p), al = clamp((ts - a.p) / span, 0, 1), T = Math.max(16, Math.round(span)), c = Math.round(ts), ratio = a.v && b.v ? R[Math.min(F - 1, Math.round(ts / H))] : 1;
      for (let k = -T; k <= T; k++) {
        const i = c + k; if (i < 0 || i >= N) continue; const sa = a.p + k, sb = b.p + k, va = sa >= 0 && sa < N ? x[sa] : 0, vb = sb >= 0 && sb < N ? x[sb] : 0, w = 0.5 + 0.5 * Math.cos(Math.PI * k / T);
        out[i] += ((1 - al) * va + al * vb) * w; ws[i] += w;
      }
      ts += T / ratio;
    }
    for (let i = 0; i < N; i++) out[i] = ws[i] > 1e-3 ? out[i] / ws[i] : x[i];
    return out;
  },
  /* A corrected copy of an AudioBuffer. o: { amount 0-1, speed 0-1, root, set, a4 }. */
  async process(buf, o) {
    const x = buf.getChannelData(0), sr = buf.sampleRate, d = await this.trackDetail(x, sr); d.sr = sr; await this.yieldUi();
    const R = this.ratios(d.f0, sr, o), out = this.synth(x, d.f0, R, sr), dry = clamp(o.dry || 0, 0, 1);
    if (dry > 0) for (let i = 0; i < out.length; i++) out[i] = x[i] * dry + out[i] * (1 - dry);      // some of the untouched voice back in
    const b = new AudioBuffer({ length: out.length, sampleRate: sr, numberOfChannels: 1 }); b.copyToChannel(out, 0);
    d.R = R; b.dbg = this.annotate(d, o); return b;
  },
};
