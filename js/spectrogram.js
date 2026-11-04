"use strict";
/* ---- Spectrogram over a piano keyboard (collapsed by default; only drawn while open) ---- */
const setInst = i => { Store.data.settings.inst = i; Store.save(); Engine.applySettings(); Spec.setMode(instMode(i)); UI.refresh(); };
const instMode = i => i === 'piano' ? 'piano' : i === 'whistle' ? 'whistle' : 'voice';
/* Horizontal centre of every key (lo..hi) on a keyboard drawn w wide, matching Piano.draw. */
const kbCenters = (w, lo, hi) => {
  const nw = (() => { let n = 0; for (let m = lo; m <= hi; m++) if (!isBlack(m)) n++; return n; })(), ww = w / nw, off = { 1: -0.08, 3: 0.08, 6: -0.08, 8: 0, 10: 0.08 }, out = new Float64Array(hi - lo + 1), idx = new Map();
  let i = 0; for (let m = lo; m <= hi; m++) if (!isBlack(m)) idx.set(m, i++);
  for (let m = lo; m <= hi; m++) out[m - lo] = isBlack(m) ? (idx.get(m - 1) + 1 + (off[((m % 12) + 12) % 12] || 0)) * ww : (idx.get(m) + 0.5) * ww;
  return out;
};
const Spec = {
  full: false,
  /* Full screen: the same canvas and controls are moved into an overlay (so the history stays), and put back afterwards. */
  async openFull() {
    this.full = true; const cv = $('#specCv');
    { const t = $('#specTags'); if (t) t.width = t.width; }        // drop the note chips left on the page behind the overlay
    $('#specFullCtl').appendChild($('#specCtl')); $('#specFullCv').appendChild(cv); cv.classList.add('sfull-cv'); cv.style.height = '';
    { const d = $('.disprow'); if (d) { if (!this.dispHome) { this.dispHome = document.createComment('disprow'); d.before(this.dispHome); } $('#specFullCtl').appendChild(d); } }       // view and colour buttons come along
    $('#o-spec').classList.add('on');
    try { if (document.documentElement.requestFullscreen) await $('#o-spec').requestFullscreen(); } catch (e) {}
    try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (e) {}    // only possible in full screen on some phones
    toast('Play the keys along the bottom, or use your computer keyboard.', 3000);
  },
  closeFull() {
    if (!this.full) return; this.full = false; const cv = $('#specCv');
    { const t = $('#specFullTags'); if (t) t.width = t.width; }
    $('#specPhCtl').after($('#specCtl')); $('#specPhCv').after(cv); cv.classList.remove('sfull-cv'); cv.style.height = '100%';
    { const d = $('.disprow'); if (d && this.dispHome && this.dispHome.parentNode) this.dispHome.after(d); }
    $('#o-spec').classList.remove('on');
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {}
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
  },
  /* Quality (FFT size): left = fast response, coarse pitch; right = fine pitch, slower. The slider steps through powers of two. Default follows the range: piano and max mic use the finest. */
  FFT: { low: 4096, mid: 16384, high: 32768 }, SIZES: [2048, 4096, 8192, 16384, 32768],
  fftSize() { const v = Store.data.settings.fft; return typeof v === 'number' && this.SIZES.includes(v) ? v : this.FFT[v] || (this.mode === 'piano' || this.mode === 'max' ? 32768 : 16384); },
  applyFft() {
    const an = Engine.specAn, sz = this.fftSize();
    if (an && an.fftSize !== sz) an.fftSize = sz;
    if (Knobs.qSync) Knobs.qSync();
    const sr = Engine.ctx ? Engine.ctx.sampleRate : 48000, el = $('#specFftInfo');
    if (el) el.innerHTML = '<span>' + (sr / sz).toFixed(1) + ' Hz/row</span><span>' + (sz / sr).toFixed(2) + ' s</span>';
  },
  data: null, lut: null, mode: 'voice', key: '',
  /* Heat ramp in the UI palette: near-black brown, ember, amber, cream. */
  /* The heat ramp has four looks: the amber of the rest of the app, green phosphor, ice and plain grey. */
  PALS: {
    amber: [[0, 13, 11, 9], [0.3, 74, 52, 38], [0.6, 226, 85, 58], [0.85, 255, 179, 71], [1, 243, 234, 214]],
    green: [[0, 6, 12, 8], [0.3, 20, 70, 34], [0.6, 50, 170, 70], [0.85, 140, 240, 110], [1, 225, 255, 215]],
    ice: [[0, 6, 9, 14], [0.3, 22, 50, 96], [0.6, 50, 130, 210], [0.85, 130, 210, 250], [1, 235, 248, 255]],
    mono: [[0, 10, 10, 10], [0.3, 60, 60, 60], [0.6, 140, 140, 140], [0.85, 215, 215, 215], [1, 255, 255, 255]]
  },
  palName() { const p = Store.data.settings.specPal; return this.PALS[p] ? p : 'amber'; },
  palAcc() { return { amber: '#ffb347', green: '#7dff8a', ice: '#7fd3ff', mono: '#f0f0f0' }[this.palName()]; },
  makeLut() {
    const L = new Uint8Array(256 * 3), stops = this.PALS[this.palName()];
    for (let i = 0; i < 256; i++) {
      const v = i / 255; let k = 1; while (k < stops.length - 1 && v > stops[k][0]) k++;
      const a = stops[k - 1], b = stops[k], f = clamp((v - a[0]) / (b[0] - a[0]), 0, 1);
      for (let c = 0; c < 3; c++) L[i * 3 + c] = Math.round(a[c + 1] + (b[c + 1] - a[c + 1]) * f);
    }
    return L;
  },
  /* Cool ramp for the app's own sound: black, deep blue, cyan, white. */
  makeLutBlue() {
    const L = new Uint8Array(256 * 3), stops = [[0, 0, 0, 0], [0.3, 12, 36, 110], [0.6, 30, 120, 255], [0.85, 90, 220, 255], [1, 235, 250, 255]];
    for (let i = 0; i < 256; i++) {
      const v = i / 255; let k = 1; while (k < stops.length - 1 && v > stops[k][0]) k++;
      const a = stops[k - 1], b = stops[k], f = clamp((v - a[0]) / (b[0] - a[0]), 0, 1);
      for (let c = 0; c < 3; c++) L[i * 3 + c] = Math.round(a[c + 1] + (b[c + 1] - a[c + 1]) * f);
    }
    return L;
  },
  setMode(m) {
    this.mode = m;
    document.querySelectorAll('#specRange button').forEach(b => b.classList.toggle('on', b.dataset.r === m));
    this.key = '';                                                 // forces a clear + redraw on the next frame
    // a piano's bass notes sit only ~1.6 Hz apart (A0 27.5, A#0 29.1), so wide ranges need a 4x longer window than a voice
    if (Engine.analyser) Engine.analyser.fftSize = m === 'voice' || m === 'whistle' ? 16384 : 32768;
  },
  /* The waterfall shares its columns with the piano below it: every pitch sits straight above its own key, and time rises from the keys. */
  draw(midi) {
    const cv = $('#specCv'), an = Engine.specAn || Engine.analyser; if (!an) return;
    this.applyFft();
    if (!cv.clientWidth || !cv.clientHeight) return;
    const { g, w, h } = fitCanvas(cv), lo = 21, hi = 108, a4 = Store.data.settings.a4, dpr = window.devicePixelRatio || 1, W = cv.width, H = cv.height;
    const kb = kbCenters(w, lo, hi), sh = this.full ? Math.round(Math.min(150, h * 0.3) * dpr) : 0, key = w + 'x' + h + ':' + an.fftSize + ':' + a4 + ':' + sh;
    if (key !== this.key) { this.key = key; g.fillStyle = '#0d0b09'; g.fillRect(0, 0, w, h); this.cols = null; }
    const nyq = Engine.ctx.sampleRate / 2;
    $('#specNote').textContent = noteName(lo) + ' to ' + noteName(hi) + (hi >= freqToMidi(nyq, a4) - 1 ? ' (the mic stops at ' + Math.round(nyq) + ' Hz). ' : '. ') + 'Brightness is how loud each pitch is. It rises from the piano keys, newest at the bottom. The line is the note the tuner locked on to.';
    if (!this.data || this.data.length !== an.frequencyBinCount) this.data = new Float32Array(an.frequencyBinCount);
    an.getFloatFrequencyData(this.data);
    const oa = Store.data.settings.specSynth !== false && Engine.outAn;       // the app's own sound, straight from the mixer: no speaker, no microphone
    let O = null; if (oa) { if (oa.fftSize !== an.fftSize) oa.fftSize = an.fftSize; if (!this.dataO || this.dataO.length !== oa.frequencyBinCount) this.dataO = new Float32Array(oa.frequencyBinCount); oa.getFloatFrequencyData(this.dataO); O = this.dataO; }
    const binHz = Engine.ctx.sampleRate / an.fftSize, D = this.data, L = (Spec.lut && Spec.lutP === Spec.palName()) ? Spec.lut : (Spec.lutP = Spec.palName(), Spec.lut = Spec.makeLut()), LB = Spec.lutB || (Spec.lutB = Spec.makeLutBlue());
    const dbAt = (A, a, b) => {
      let db = -140;
      if (b - a < 1) { const c = (a + b) / 2, i = Math.floor(c), t = c - i, p = A[i] > -140 ? A[i] : -140, q = A[i + 1] > -140 ? A[i + 1] : -140; db = p + (q - p) * t; }       // silence reads -Infinity: clamp it, or -Inf minus -Inf is NaN and paints solid black
      else for (let k = Math.floor(a); k <= Math.ceil(b) && k < A.length; k++) if (A[k] > db) db = A[k];
      return db;
    }, idx = (db, floor, span) => Math.round(clamp((db - floor) / span, 0, 1) * 255) * 3;
    if (!this.cols) {                                                // per device pixel column: the range of FFT bins under it
      const f0 = new Float32Array(W), f1 = new Float32Array(W), at = x => { let m = lo - 0.5; if (x >= kb[kb.length - 1]) m = hi + 0.5; else if (x > kb[0]) { let k = 0; while (kb[k + 1] < x) k++; m = lo + k + (x - kb[k]) / (kb[k + 1] - kb[k]); } else m = lo - 0.5 + 0.5 * (x / kb[0]) ; return m; };
      for (let px = 0; px < W; px++) { f0[px] = midiToFreq(at(px / dpr), a4) / binHz; f1[px] = midiToFreq(at((px + 1) / dpr), a4) / binHz; }
      this.cols = { f0, f1 };
    }
    const view = Store.data.settings.specView || 'water', voiced = performance.now() - Tuner.lastVoiced < 350 && Tuner.midi != null;
    if (this.lastView !== view) { this.lastView = view; g.fillStyle = '#0d0b09'; g.fillRect(0, 0, w, h); this.pk = null; this.hold = null; }      // a new view starts on a clean screen
    this.curO = O; if (view !== 'water') this.alt(view, g, w, h, dpr, sh, D, an, dbAt, idx, lo, hi, a4, binHz); else {
    const rh = Math.max(1, Math.round(2 * dpr)), area = H - sh, { f0, f1 } = this.cols, row = g.createImageData(W, rh), px8 = row.data;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(cv, 0, rh, W, area - rh, 0, 0, W, area - rh);        // history moves up, away from the keyboard
    g.fillStyle = 'rgba(13,11,9,0.003)'; g.fillRect(0, 0, W, Math.round((area - rh) * 0.4));       // phosphor decay, very light and only near the top: older sound dims as it fades out
    const dbs = new Float32Array(W); let fmax = -140;
    for (let x = 0; x < W; x++) { dbs[x] = dbAt(D, f0[x], f1[x]); if (dbs[x] > fmax) fmax = dbs[x]; }
    /* auto gain: the scale follows the loudest recent sound (slow fall), so a quiet phone mic still shows, while silence stays dark */
    this.pk = Math.max(fmax, (this.pk == null ? -140 : this.pk) - 0.25); const top = Math.max(this.pk, -62);
    for (let x = 0; x < W; x++) {
      const a = f0[x], b = f1[x], li = idx(dbs[x], top - 45, 45), lb = O ? idx(dbAt(O, a, b), -100, 55) : 0;
      const r = Math.min(255, L[li] + LB[lb]), gg = Math.min(255, L[li + 1] + LB[lb + 1]), bb = Math.min(255, L[li + 2] + LB[lb + 2]);
      for (let y = 0; y < rh; y++) { const o = (y * W + x) * 4; px8[o] = r; px8[o + 1] = gg; px8[o + 2] = bb; px8[o + 3] = 255; }
    }
    g.putImageData(row, 0, area - rh);
    if (voiced && Store.data.settings.specLine) {
      const m = clamp(Tuner.midi, lo, hi), k = Math.min(kb.length - 2, Math.floor(m - lo)), x = (kb[k] + (kb[k + 1] - kb[k]) * (m - lo - k)) * dpr;
      g.fillStyle = '#9ccc65'; g.fillRect(Math.round(x - 1.5 * dpr), area - rh, Math.round(3 * dpr), rh);
    }
    g.restore(); }
    if (sh) this.strip(g, w, h, sh / dpr, lo, hi, voiced ? Math.round(Tuner.midi) : null); else cv._kb = null;
    this.drawSound(h, sh / dpr);
    this.bloom(cv);
  },
  /* Scope sync: find the note's period by autocorrelation, then trigger on the rising zero crossing after the deepest trough and end exactly a whole number of cycles later (both at sub-sample positions), so the picture does not drift. Returns [start, length] in samples; unpitched sound falls back to a plain 2048-sample window. */
  scopeLock(T, N, sr) {
    const fb = [N - 2049, 2048], L = 2048, e = N - 1, base = e - L - 1500; if (base < 1) return fb;
    const lmin = Math.max(12, Math.floor(sr / 3000)), lmax = Math.min(1500, Math.floor(sr / 40)); let e0 = 0; for (let i = 0; i < L; i++) e0 += T[e - i] * T[e - i]; if (e0 < 1e-6) return fb;
    const r = new Float32Array(lmax + 2); let best = 0;
    for (let k = lmin; k <= lmax; k++) { let sx = 0, sy = 0; for (let i = 0; i < L; i += 2) { const a = T[e - i], b = T[e - i - k]; sx += a * b; sy += b * b; } r[k] = sx / Math.sqrt(e0 / 2 * sy + 1e-12); if (r[k] > best) best = r[k]; }
    if (best < 0.5) return fb;
    let P = 0; for (let k = lmin + 1; k < lmax; k++) if (r[k] >= 0.9 * best && r[k] >= r[k - 1] && r[k] >= r[k + 1]) { const d = r[k - 1] - 2 * r[k] + r[k + 1]; P = k + (d ? 0.5 * (r[k - 1] - r[k + 1]) / d : 0); break; }
    if (!P) return fb;
    const rise = (from, to) => { for (let i = Math.max(1, Math.ceil(from)); i < to; i++) if (T[i - 1] < 0 && T[i] >= 0) return i - 1 + (-T[i - 1]) / (T[i] - T[i - 1]); return -1; };
    const K = Math.max(1, Math.min(8, Math.round(700 / P))), start = e - (K + 2) * P - 2; if (start < 1) return fb;
    let mi = Math.floor(start), mv = 1; for (let i = Math.floor(start); i < start + P; i++) if (T[i] < mv) { mv = T[i]; mi = i; }
    const t0 = rise(mi, mi + P + 2); if (t0 < 0) return fb;
    const t1 = rise(t0 + K * P - P * 0.4, t0 + K * P + P * 0.4); if (t1 < 0 || t1 + 2 > e) return fb;
    return [t0, t1 - t0];
  },
  /* Three more ways to see the sound: the live spectrum (a curve over the same piano columns), a scope of the waveform, and a chroma wheel of the twelve note names. */
  alt(view, g, w, h, dpr, sh, D, an, dbAt, idx, lo, hi, a4, binHz) {
    const ah = h - sh / dpr, acc = this.palAcc(), u = 1 / dpr, f = n => n * u, { f0, f1 } = this.cols;
    g.fillStyle = '#0d0b09'; g.fillRect(0, 0, w, ah);
    g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1; g.beginPath(); for (let i = 1; i < 4; i++) { const y = Math.round(ah * i / 4) + 0.5; g.moveTo(0, y); g.lineTo(w, y); } g.stroke();
    if (view === 'spectrum') {
      const n = Math.max(2, Math.floor(w / 2)), L = new Float32Array(n + 1); let fmax = -140;
      for (let i = 0; i <= n; i++) { const X = Math.min(f0.length - 1, Math.floor(i / n * (w - 1) * dpr)); L[i] = dbAt(D, f0[X], f1[X]); if (L[i] > fmax) fmax = L[i]; }
      this.pk = Math.max(fmax, (this.pk == null ? -140 : this.pk) - 0.25); const top = Math.max(this.pk, -62), lv = i => clamp((L[i] - (top - 45)) / 45, 0, 1);
      if (!this.hold || this.hold.length !== n + 1) this.hold = new Float32Array(n + 1);
      g.beginPath(); g.moveTo(0, ah); for (let i = 0; i <= n; i++) g.lineTo(i / n * w, ah - lv(i) * ah * 0.94); g.lineTo(w, ah); g.closePath();
      const gr = g.createLinearGradient(0, 0, 0, ah); gr.addColorStop(0, acc + '88'); gr.addColorStop(1, acc + '08'); g.fillStyle = gr; g.fill();
      g.lineWidth = 2; g.lineJoin = 'round'; g.strokeStyle = acc; g.shadowColor = acc; g.shadowBlur = 6; g.beginPath(); for (let i = 0; i <= n; i++) { const x = i / n * w, y = ah - lv(i) * ah * 0.94; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); g.shadowBlur = 0;
      const O = this.curO; if (O) {                                           // the app's own sound, blue, on the same fixed scale as the waterfall
        const lo2 = i => { const X = Math.min(f0.length - 1, Math.floor(i / n * (w - 1) * dpr)); return clamp((dbAt(O, f0[X], f1[X]) + 100) / 55, 0, 1); }, B = '#3aa0ff';
        g.beginPath(); g.moveTo(0, ah); for (let i = 0; i <= n; i++) g.lineTo(i / n * w, ah - lo2(i) * ah * 0.94); g.lineTo(w, ah); g.closePath();
        const gb = g.createLinearGradient(0, 0, 0, ah); gb.addColorStop(0, B + '88'); gb.addColorStop(1, B + '08'); g.fillStyle = gb; g.fill();
        g.lineWidth = 2; g.lineJoin = 'round'; g.strokeStyle = B; g.shadowColor = B; g.shadowBlur = 6; g.beginPath(); for (let i = 0; i <= n; i++) { const x = i / n * w, y = ah - lo2(i) * ah * 0.94; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); g.shadowBlur = 0;
      }
      g.fillStyle = '#fff4d6'; for (let i = 0; i <= n; i++) { this.hold[i] = Math.max(lv(i), this.hold[i] - 0.006); if (this.hold[i] > 0.04) g.fillRect(i / n * w - 1, ah - this.hold[i] * ah * 0.94 - 2, 2, 2); }      // peaks fall slowly
    } else if (view === 'scope') {
      const N = an.fftSize, sr = an.context ? an.context.sampleRate : 48000, oa = Store.data.settings.specSynth !== false && Engine.outAn;
      const trace = (src, key, col) => {                                  // each source is locked to its own pitch; the app's own sound is blue, like in the spectrogram
        const T = this[key] && this[key].length === N ? this[key] : (this[key] = new Float32Array(N)); src.getFloatTimeDomainData(T);
        const [t0, span] = this.scopeLock(T, N, sr), at = p => { const i = Math.floor(p), fr = p - i; return (T[i] || 0) * (1 - fr) + (T[Math.min(N - 1, i + 1)] || 0) * fr; };
        let pk = 0; for (let x = 0; x < w; x += 2) pk = Math.max(pk, Math.abs(at(t0 + x / w * span)));
        return { at, t0, span, pk, col };
      };
      const trs = [trace(an, 'td', acc)]; if (oa) { if (oa.fftSize !== N) oa.fftSize = N; trs.push(trace(oa, 'tdO', '#3aa0ff')); }
      this.sg = Math.max(...trs.map(t => t.pk), (this.sg || 0) * 0.97, 0.02); const sc = ah * 0.42 / this.sg;
      for (const t of trs.reverse()) { g.lineWidth = 2; g.lineJoin = 'round'; g.strokeStyle = t.col; g.shadowColor = t.col; g.shadowBlur = 8; g.beginPath(); for (let x = 0; x < w; x++) { const y = ah / 2 - t.at(t.t0 + x / w * t.span) * sc; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); }
      g.shadowBlur = 0;
      g.strokeStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.moveTo(0, ah / 2 + 0.5); g.lineTo(w, ah / 2 + 0.5); g.stroke();
    } else if (view === 'chroma') {
      const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'], bw = w / 12;
      const fold = A => { const P = new Float32Array(12); for (let m = lo; m <= hi; m++) { const fa = midiToFreq(m - 0.5, a4) / binHz, fb = midiToFreq(m + 0.5, a4) / binHz; if (fb >= A.length) break; P[((m % 12) + 12) % 12] += Math.pow(10, dbAt(A, fa, fb) / 10); } return P; };
      const level = (P, key, ck) => { let mx = 0; for (let i = 0; i < 12; i++) mx = Math.max(mx, P[i]); this[ck] = Math.max(mx, (this[ck] || 0) * 0.985, 1e-9); const c = this[key] || (this[key] = new Float32Array(12)); for (let i = 0; i < 12; i++) { const t = Math.pow(P[i] / this[ck], 0.5); c[i] += (t - c[i]) * (t > c[i] ? 0.5 : 0.12); } return c; };
      const chr = level(fold(D), 'chr', 'cm'), O = this.curO, own = O ? level(fold(O), 'chrO', 'cmO') : null; let big = 0, bi = 0;
      for (let i = 0; i < 12; i++) { if (chr[i] > big) { big = chr[i]; bi = i; } }
      g.font = f(16) + 'px Silkscreen, ui-monospace, monospace'; g.textAlign = 'center';
      const bar = (v, x, ww, c0, c1) => { const bh = Math.max(f(3), v * (ah - 34)), gr = g.createLinearGradient(0, ah - 22 - bh, 0, ah - 22); gr.addColorStop(0, c0); gr.addColorStop(1, c1); g.fillStyle = gr; g.fillRect(x, ah - 22 - bh, ww, bh); };
      for (let i = 0; i < 12; i++) {
        const x = i * bw + bw * 0.14, ww = bw * 0.72, hot = i === bi && big > 0.25;
        if (own) bar(own[i], x, ww, '#8fd0ff', '#3aa0ff40');                                  // the app's own sound: blue, wide, behind
        bar(chr[i], own ? x + ww * 0.25 : x, own ? ww * 0.5 : ww, hot ? '#fff4d6' : acc, acc + '40');
        g.fillStyle = hot ? '#fff4d6' : '#8a6a3a'; g.fillText(names[i], i * bw + bw / 2, ah - 6);
      }
      g.textAlign = 'start';
    }
  },
  /* Full screen: which sound is active, as a pixel LCD chip on the graph just above the keys. It lives on its own canvas, so it never gets scrolled into the history. */
  drawSound(h, kh) {
    const cv = $('#specFullTags'); if (!cv) return;
    const { g, w, h: H } = fitCanvas(cv); g.clearRect(0, 0, w, H);
    $('#specFullCv').style.setProperty('--kh', Math.round(kh) + 'px');       // the mesh stops above the piano
    if (!this.full || !w) return;
    const u = 1 / (window.devicePixelRatio || 1), f = n => n * u, sn = v => Math.round(v / u) * u, st = Store.data.settings, on = SF.sf && st.timbre === 'sf';
    let t = on ? SF.name.replace(/\.sf[23]$/i, '') + (SF.sf.presets[SF.preset] ? ' \u00b7 ' + SF.sf.presets[SF.preset].name : '') : 'Built-in \u00b7 ' + timbreOf(st.timbre).label;
    t = t.toUpperCase(); g.font = f(16) + 'px Silkscreen, ui-monospace, monospace'; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    const padX = f(8), chH = f(20), maxW = w - f(24) - 2 * padX; while (t.length > 4 && g.measureText(t).width > maxW) t = t.slice(0, -2).trimEnd() + '\u2026';
    const tw = Math.ceil(g.measureText(t).width) + 2 * padX, x0 = sn(f(12)), y0 = sn(H - kh - chH - f(52));
    g.fillStyle = '#000'; g.fillRect(x0 - f(2), y0 - f(2), tw + f(4), chH + f(4));
    g.fillStyle = '#1a120a'; g.fillRect(x0, y0, tw, chH);
    g.fillStyle = '#6b4513'; g.fillRect(x0, y0, tw, f(2)); g.fillRect(x0, y0 + chH - f(2), tw, f(2));
    g.fillStyle = 'rgba(255,50,50,0.65)'; g.fillText(t, sn(x0 + padX) - f(1), sn(y0 + f(15))); g.fillStyle = 'rgba(60,170,255,0.6)'; g.fillText(t, sn(x0 + padX) + f(1), sn(y0 + f(15)));
    g.fillStyle = '#ffb347'; g.fillText(t, sn(x0 + padX), sn(y0 + f(15)));
  },
  /* Note names as pixel-art chips on top of the spectrogram, stacked in rows so neighbours never overlap, each with a stepped arrow down to its key. Display only. */
  drawTags(tags, srcW) {
    const cv = $('#specTags'); if (!cv) return;
    const { g, w, h } = fitCanvas(cv); g.clearRect(0, 0, w, h);
    if (this.full || !tags.length || !w || ['scope', 'chroma'].includes(Store.data.settings.specView)) return;
    /* 24dp type has 3dp font pixels, so every chip edge, text row and arrow step sits on the 3dp grid that is drawn over this pane (both start at its top left corner) */
    const u = 1 / (window.devicePixelRatio || 1), q = 3 * u, sq = v => Math.round(v / q) * q, k = w / srcW, chH = 9 * q, padX = 2 * q, gap = q;
    g.font = 24 * u + 'px Silkscreen, ui-monospace, monospace'; g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    const rows = [-1e9, -1e9, -1e9];
    tags.forEach(tg => {
      const cx = tg.cx * k, tw = Math.ceil(g.measureText(tg.t).width / q) * q + 2 * padX;
      let row = rows.findIndex(e => e <= cx - tw / 2); if (row < 0) row = rows.indexOf(Math.min.apply(null, rows));
      const x0 = sq(clamp(cx - tw / 2, 0, w - tw)), y0 = sq(h - 3 * q - chH - row * (chH + gap)); rows[row] = x0 + tw + gap;
      g.fillStyle = '#120c05'; g.fillRect(x0 - 2 * u, y0 - 2 * u, tw + 4 * u, chH + 4 * u);        // dark pixel outline
      g.fillStyle = tg.c; g.fillRect(x0, y0, tw, chH);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x0, y0, tw, q);
      g.fillStyle = '#1d1408'; g.fillText(tg.t, x0 + padX, y0 + 7 * q);        // capitals are 5 font pixels tall: rows 2 to 6 of the chip's 9
      const ax = sq(cx);
      g.fillStyle = '#120c05'; g.fillRect(ax - 2 * q, y0 + chH + 2 * u, 4 * q, q); g.fillRect(ax - q, y0 + chH + q + 2 * u, 2 * q, q);
      g.fillStyle = tg.c; g.fillRect(ax - 2 * q, y0 + chH, 4 * q, q); g.fillRect(ax - q, y0 + chH + q, 2 * q, q);
    });
  },
  /* Bloom: a small blurred copy of the picture glows over it, so bright lines bleed light like a CRT. Display only, so the history underneath stays clean. Desktop only. */
  bloom(cv) {
    const b = $('#specBloom'); if (!b) return;
    if (this.full) { if (b.width > 1) { b.width = 1; b.height = 1; } return; }       // full screen moves the picture out of this pane: drop the stale glow
    if (this.bloomOn == null) this.bloomOn = !!(window.matchMedia && matchMedia('(hover:hover) and (pointer:fine)').matches);
    if (!this.bloomOn) return;
    const bw = Math.max(1, cv.width >> 2), bh = Math.max(1, cv.height >> 2);
    if (b.width !== bw || b.height !== bh) { b.width = bw; b.height = bh; }
    b.getContext('2d').drawImage(cv, 0, 0, bw, bh);
  },
  /* Full screen has no piano canvas below, so a plain keyboard is drawn along the bottom edge. */
  strip(g, w, h, kh, lo, hi, sung) {
    const held = Midi.keys(), whites = []; for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
    const ww = w / whites.length, kb = kbCenters(w, lo, hi), tb = 6 * UIK, top = h - kh, y0 = top + tb, bw = ww * 0.6, col = m => m === sung ? '#9ccc65' : held.includes(m) ? '#ffb347' : null;
    g.fillStyle = '#050506'; g.fillRect(0, top, w, kh);
    const felt = g.createLinearGradient(0, top, 0, y0); felt.addColorStop(0, '#2a0808'); felt.addColorStop(1, '#6e1a1a'); g.fillStyle = felt; g.fillRect(0, top, w, tb);       // a felt strip along the back of the keys, so no bright key edge touches the graph
    kh -= tb;
    const art = KeyArt.begin(g, y0, kh - 1, kh * 0.62), lit = Scale.expand(held), stOf = m => m === sung ? 'heard' : lit.includes(m) ? 'on' : Scale.has(m) ? null : 'off';
    whites.forEach((m, i) => KeyArt.white(g, art, i * ww + 0.5, y0, ww - 1, kh - 1, stOf(m)));
    for (let m = lo; m <= hi; m++) if (isBlack(m)) KeyArt.black(g, art, kb[m - lo] - bw / 2, y0, bw, kh * 0.62, stOf(m));
    const wx = new Map(); whites.forEach((m, i) => wx.set(m, i * ww));
    g.canvas._kb = kbGeom(lo, hi, whites, wx, ww, m => kb[m - lo] - bw / 2, bw, y0, kh, kh * 0.62);      // makes the strip playable
  }
};

/* ---- Keyboard strip: realistic keys, pressed keys (blue, from MIDI) and the heard pitch (green), each named ---- */
const Piano = {
  draw() {
    const cv = $('#pianoCv'); if (!cv.clientWidth) return;
    const { g, w, h } = fitCanvas(cv), lo = 21, hi = 108;               // always the whole keyboard, A0 to C8, so it never changes size
    const held = Midi.keys(), voiced = performance.now() - Tuner.lastVoiced < 350 && Tuner.midi != null, heard = voiced ? Math.round(Tuner.midi) : null;
    const heardNotes = Tuner.chordNow.notes, chordOn = heardNotes.length >= 2, heardList = chordOn ? heardNotes : heard != null ? [heard] : [];
    const whites = []; for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
    const ww = w / whites.length, top = 6, tagArea = 3, kh = h - tagArea - top, bh = kh * 0.62, bw = ww * 0.6;
    const wx = new Map(); whites.forEach((m, i) => wx.set(m, i * ww));
    const off = { 1: -0.08, 3: 0.08, 6: -0.08, 8: 0, 10: 0.08 };
    const bx = m => wx.get(m - 1) + ww - bw / 2 + (off[((m % 12) + 12) % 12] || 0) * ww;
    const colour = (m, black) => heardList.includes(m) ? '#9ccc65' : held.includes(m) ? '#ffb347' : black ? '#141210' : '#f3ead6';
    g.clearRect(0, 0, w, h);
    const art = KeyArt.begin(g, top, kh, bh), lit = Scale.expand(held), stOf = (m) => heardList.includes(m) ? 'heard' : lit.includes(m) ? 'on' : Scale.has(m) ? null : 'off', felt = g.createLinearGradient(0, 0, 0, top); felt.addColorStop(0, '#2a0808'); felt.addColorStop(1, '#6e1a1a'); g.fillStyle = felt; g.fillRect(0, 0, w, top);
    const keyPath = (x, y, kw, kh2) => { const r = Math.min(3, kw / 3); g.beginPath(); g.moveTo(x, y); g.lineTo(x + kw, y); g.lineTo(x + kw, y + kh2 - r); g.quadraticCurveTo(x + kw, y + kh2, x + kw - r, y + kh2); g.lineTo(x + r, y + kh2); g.quadraticCurveTo(x, y + kh2, x, y + kh2 - r); g.closePath(); };
    whites.forEach(m => {
      const x = wx.get(m); KeyArt.white(g, art, x + 0.5, top, ww - 1, kh, stOf(m));
      if (heardList.includes(m) && held.includes(m)) { g.fillStyle = '#ffb347'; g.fillRect(x + 0.5, top + kh - 5, ww - 1, 4); }   // heard AND pressed
      if (m % 12 === 0) { g.fillStyle = heardList.includes(m) || held.includes(m) ? '#24211e' : '#b8a888'; g.font = (9 * UIK) + 'px sans-serif'; g.textAlign = 'center'; g.fillText(noteName(m), x + ww / 2, top + kh - 8); }
    });
    for (let m = lo; m <= hi; m++) if (isBlack(m)) { KeyArt.black(g, art, bx(m), top, bw, bh, stOf(m)); }
    cv._kb = kbGeom(lo, hi, whites, wx, ww, bx, bw, top, kh, bh);
    // name tags: drawn as pixel-art chips on the spectrogram, just above the keys they belong to
    const tags = held.map(m => ({ m, t: noteName(m), c: '#ffb347' }));
    heardList.forEach(m => {
      const cn = !chordOn && m === heard ? Math.round(centsOff(Tuner.midi)) : 0, t = noteName(m) + (cn ? (cn > 0 ? ' +' : ' ') + cn + '¢' : ''), e = tags.find(x => x.m === m);
      if (e) { e.t = t; e.c = '#9ccc65'; } else tags.push({ m, t, c: '#9ccc65' });
    });
    tags.sort((a, b) => a.m - b.m);
    tags.forEach(tg => { tg.cx = isBlack(tg.m) ? bx(tg.m) + bw / 2 : wx.get(tg.m) + ww / 2; });
    Spec.drawTags(tags, w);
    // text summary
    const parts = [];
    if (held.length) { const pl = Scale.expand(held).slice().sort((x, y) => x - y), dk = describeKeys(pl); parts.push((pl.length > held.length ? 'Playing: ' : 'Pressed: ') + pl.map(noteName).join(' ') + (pl.length >= 2 ? ' (' + dk.name + (pl.length === 2 ? ', ' + dk.detail : '') + ')' : '')); }      // with a chord mode on, the chord that sounds
    if (chordOn) { const dk = describeKeys(heardNotes); parts.push('Hearing: ' + heardNotes.map(noteName).join(' ') + ' (' + dk.name + (heardNotes.length === 2 ? ', ' + dk.detail : '') + ')'); }
    else if (heard != null) parts.push('Hearing: ' + noteName(heard) + (Tuner.f ? ' ' + Tuner.f.toFixed(1) + ' Hz' : ''));
    if (typeof Arp !== 'undefined' && Arp.on) parts.push('Arp: ' + Arp.PATN[Arp.cfg().pat] + ' \u00b7 ' + Arp.rateName() + (Arp.cfg().rate >= 1 ? ' (' + Seq.ECHO_NAMES[Math.round(Knobs.val('etime') * 5)] + ')' : ''));
    const txt = parts.join('\n') || (Store.data.settings.inst === 'piano' ? 'Play a key' : '\u00a0'), info = $('#pianoInfo');
    if (info.dataset.t !== txt) { info.dataset.t = txt; info.textContent = ''; txt.split('\n').forEach(l => { const r = document.createElement('span'); r.textContent = l; info.appendChild(r); }); }       // one line each for what is pressed and what is heard
  }
};

