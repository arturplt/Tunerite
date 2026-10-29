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
    $('#specFullCtl').appendChild($('#specCtl')); $('#specFullCv').appendChild(cv); cv.classList.add('sfull-cv'); cv.style.height = '';
    $('#o-spec').classList.add('on');
    try { if (document.documentElement.requestFullscreen) await $('#o-spec').requestFullscreen(); } catch (e) {}
    try { if (screen.orientation && screen.orientation.lock) await screen.orientation.lock('landscape'); } catch (e) {}    // only possible in full screen on some phones
    toast('Play the keys along the bottom, or use your computer keyboard.', 3000);
  },
  closeFull() {
    if (!this.full) return; this.full = false; const cv = $('#specCv');
    $('#specPhCtl').after($('#specCtl')); $('#specPhCv').after(cv); cv.classList.remove('sfull-cv'); cv.style.height = '18rem';
    $('#o-spec').classList.remove('on');
    try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {}
    try { if (document.fullscreenElement) document.exitFullscreen(); } catch (e) {}
  },
  /* Detail (FFT size): Low = fast response, coarse pitch; Mid = balanced; High = fine pitch, slower. Default follows the range: piano and max mic use High. */
  FFT: { low: 4096, mid: 16384, high: 32768 },
  fftLevel() { return Store.data.settings.fft || (this.mode === 'piano' || this.mode === 'max' ? 'high' : 'mid'); },
  applyFft() {
    const an = Engine.specAn, lv = this.fftLevel(), sz = this.FFT[lv];
    if (an && an.fftSize !== sz) an.fftSize = sz;
    document.querySelectorAll('#specFft button').forEach(b => b.classList.toggle('on', b.dataset.f === lv));
    const sr = Engine.ctx ? Engine.ctx.sampleRate : 48000, el = $('#specFftInfo');
    if (el) el.textContent = sz + ' points · ' + (sr / sz).toFixed(1) + ' Hz per row · ' + (sz / sr).toFixed(2) + ' s window';
  },
  data: null, lut: null, mode: 'voice', key: '',
  /* Heat ramp in the UI palette: near-black brown, ember, amber, cream. */
  makeLut() {
    const L = new Uint8Array(256 * 3), stops = [[0, 13, 11, 9], [0.3, 74, 52, 38], [0.6, 226, 85, 58], [0.85, 255, 179, 71], [1, 243, 234, 214]];
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
    const binHz = Engine.ctx.sampleRate / an.fftSize, D = this.data, L = Spec.lut || (Spec.lut = Spec.makeLut()), LB = Spec.lutB || (Spec.lutB = Spec.makeLutBlue());
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
    const rh = Math.max(1, Math.round(2 * dpr)), area = H - sh, { f0, f1 } = this.cols, row = g.createImageData(W, rh), px8 = row.data;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(cv, 0, rh, W, area - rh, 0, 0, W, area - rh);        // history moves up, away from the keyboard
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
    const voiced = performance.now() - Tuner.lastVoiced < 350 && Tuner.midi != null;
    if (voiced && Store.data.settings.specLine) {
      const m = clamp(Tuner.midi, lo, hi), k = Math.min(kb.length - 2, Math.floor(m - lo)), x = (kb[k] + (kb[k + 1] - kb[k]) * (m - lo - k)) * dpr;
      g.fillStyle = '#9ccc65'; g.fillRect(Math.round(x - 1.5 * dpr), area - rh, Math.round(3 * dpr), rh);
    }
    g.restore();
    if (sh) this.strip(g, w, h, sh / dpr, lo, hi, voiced ? Math.round(Tuner.midi) : null); else cv._kb = null;
  },
  /* Full screen has no piano canvas below, so a plain keyboard is drawn along the bottom edge. */
  strip(g, w, h, kh, lo, hi, sung) {
    const held = Midi.keys(), whites = []; for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
    const ww = w / whites.length, kb = kbCenters(w, lo, hi), tb = 20 * UIK, top = h - kh, y0 = top + tb, bw = ww * 0.6, col = m => m === sung ? '#9ccc65' : held.includes(m) ? '#ffb347' : null;
    kh -= tb;                                                         // the sound label sits inside the strip: drawn over the scrolling history it would be copied upward every frame
    g.fillStyle = '#24211e'; g.fillRect(0, top, w, kh + tb);
    g.fillStyle = 'rgba(243,234,214,0.85)'; g.font = '700 ' + (13 * UIK) + 'px sans-serif'; g.textAlign = 'left'; g.fillText(SFUI.label || SFUI.now(), 10, top + tb - 6 * UIK);
    whites.forEach((m, i) => { g.fillStyle = col(m) || '#f3ead6'; g.fillRect(i * ww + 0.5, y0, ww - 1, kh - 1); });
    for (let m = lo; m <= hi; m++) if (isBlack(m)) { g.fillStyle = col(m) || '#141210'; g.fillRect(kb[m - lo] - bw / 2, y0, bw, kh * 0.62); }
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
    const NROWS = 3, ww = w / whites.length, top = 2, th = 17 * UIK, tagArea = 8 + NROWS * (th + 2), kh = h - tagArea - top, bh = kh * 0.62, bw = ww * 0.6;
    const wx = new Map(); whites.forEach((m, i) => wx.set(m, i * ww));
    const off = { 1: -0.08, 3: 0.08, 6: -0.08, 8: 0, 10: 0.08 };
    const bx = m => wx.get(m - 1) + ww - bw / 2 + (off[((m % 12) + 12) % 12] || 0) * ww;
    const colour = (m, black) => heardList.includes(m) ? '#9ccc65' : held.includes(m) ? '#ffb347' : black ? '#141210' : '#f3ead6';
    g.clearRect(0, 0, w, h);
    const keyPath = (x, y, kw, kh2) => { const r = Math.min(3, kw / 3); g.beginPath(); g.moveTo(x, y); g.lineTo(x + kw, y); g.lineTo(x + kw, y + kh2 - r); g.quadraticCurveTo(x + kw, y + kh2, x + kw - r, y + kh2); g.lineTo(x + r, y + kh2); g.quadraticCurveTo(x, y + kh2, x, y + kh2 - r); g.closePath(); };
    whites.forEach(m => {
      const x = wx.get(m); keyPath(x + 0.5, top, ww - 1, kh); g.fillStyle = colour(m, false); g.fill();
      if (heardList.includes(m) && held.includes(m)) { g.fillStyle = '#ffb347'; g.fillRect(x + 0.5, top + kh - 5, ww - 1, 4); }   // heard AND pressed
      if (m % 12 === 0) { g.fillStyle = heardList.includes(m) || held.includes(m) ? '#24211e' : '#b8a888'; g.font = (9 * UIK) + 'px sans-serif'; g.textAlign = 'center'; g.fillText(noteName(m), x + ww / 2, top + kh - 8); }
    });
    for (let m = lo; m <= hi; m++) if (isBlack(m)) { const x = bx(m); keyPath(x, top, bw, bh); g.fillStyle = colour(m, true); g.fill(); g.strokeStyle = '#0d0b09'; g.lineWidth = 1; g.stroke(); }
    cv._kb = kbGeom(lo, hi, whites, wx, ww, bx, bw, top, kh, bh);
    // name tags BELOW the keys, stacked in rows so close neighbours never overlap; the keyboard itself never moves
    const tags = held.map(m => ({ m, t: noteName(m), c: '#ffb347' }));
    heardList.forEach(m => {
      const cn = !chordOn && m === heard ? Math.round(centsOff(Tuner.midi)) : 0, t = noteName(m) + (cn ? (cn > 0 ? ' +' : ' ') + cn + '¢' : ''), e = tags.find(x => x.m === m);
      if (e) { e.t = t; e.c = '#9ccc65'; } else tags.push({ m, t, c: '#9ccc65' });
    });
    tags.sort((a, b) => a.m - b.m);
    g.font = '700 ' + (11 * UIK) + 'px sans-serif'; g.textAlign = 'center';
    const rows = new Array(NROWS).fill(-1e9);
    tags.forEach(tg => {
      const cx = isBlack(tg.m) ? bx(tg.m) + bw / 2 : wx.get(tg.m) + ww / 2, tw = g.measureText(tg.t).width + 10;
      let row = rows.findIndex(e => e <= cx - tw / 2); if (row < 0) row = rows.indexOf(Math.min.apply(null, rows));
      const x0 = clamp(cx - tw / 2, 0, w - tw), y0 = top + kh + 8 + row * (th + 2);
      rows[row] = x0 + tw + 2;
      g.fillStyle = tg.c; g.beginPath(); g.roundRect ? g.roundRect(x0, y0, tw, th, 5) : g.rect(x0, y0, tw, th); g.fill();
      g.beginPath(); g.moveTo(cx - 3, y0); g.lineTo(cx + 3, y0); g.lineTo(cx, y0 - 5); g.fill();
      g.fillStyle = '#24211e'; g.fillText(tg.t, x0 + tw / 2, y0 + th * 0.74);
    });
    g.textAlign = 'start';
    // text summary
    const parts = [];
    if (held.length) { const dk = describeKeys(held); parts.push('Pressed: ' + held.map(noteName).join(' ') + (held.length >= 2 ? ' (' + dk.name + (held.length === 2 ? ', ' + dk.detail : '') + ')' : '')); }
    if (chordOn) { const dk = describeKeys(heardNotes); parts.push('Hearing: ' + heardNotes.map(noteName).join(' ') + ' (' + dk.name + (heardNotes.length === 2 ? ', ' + dk.detail : '') + ')'); }
    else if (heard != null) parts.push('Hearing: ' + noteName(heard) + (Tuner.f ? ' ' + Tuner.f.toFixed(1) + ' Hz' : ''));
    const txt = parts.join('   ·   ') || (Store.data.settings.inst === 'piano' ? 'Play a key' : '\u00a0');
    if ($('#pianoInfo').textContent !== txt) $('#pianoInfo').textContent = txt;
  }
};

