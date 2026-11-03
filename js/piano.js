"use strict";
/* ---- Piano practice: the app waits for each note or chord you play ---- */
const PXS = [
  { id: 'scale', name: 'Scales', desc: 'Play a scale or mode up and back down. The app waits for each note.' },
  { id: 'arpeggio', name: 'Arpeggios', desc: 'Broken chords up and back down, one note at a time.' },
  { id: 'chords', name: 'Chords', desc: 'Play the whole chord at once. Around all twelve keys, or every inversion in one key.' },
  { id: 'progression', name: 'Chord progressions', desc: 'Play the chords of common progressions in any key, with smooth voice leading, or in all twelve keys.' },
  { id: 'sequence', name: 'Finger patterns', desc: 'A pattern such as thirds or broken thirds, repeated from every note of the scale.' },
  { id: 'intervals', name: 'Intervals', desc: 'Play two notes together: a chosen interval from every root, or a random one each time.' },
  { id: 'flash', name: 'Note flash', desc: 'Random notes to find fast. Trains your map of the keyboard.' },
  { id: 'ear', name: 'Play what you hear', desc: 'Listen, then find the note, the scale degree, the second note of an interval or the chord on the keys.', noKey: true }
].map(d => Object.assign(d, PIANO_OPTS[d.id]));
const Played = {                                                // what is sounding right now: keys from MIDI if there is a keyboard, else notes heard by the microphone
  now() {
    const k = Midi.keys(); if (k.length || Midi.inputCount() || VKeys.used) return { src: 'midi', notes: k };
    Tuner.checkChord(performance.now()); const c = Tuner.chordNow.notes;
    if (c.length >= 2) return { src: 'mic', notes: c };
    return { src: 'mic', notes: performance.now() - Tuner.lastVoiced < 350 && Tuner.midi != null ? [Math.round(Tuner.midi)] : [] };
  }
};
/* ---- Playing the app's own keys: touch, mouse and the computer keyboard. Presses go through Midi.msg, so chord names,
   the keyboard strip and the piano exercises treat them exactly like a real MIDI keyboard. ---- */
function kbGeom(lo, hi, whites, wx, ww, bx, bw, top, kh, bh) {
  const blacks = []; for (let m = lo; m <= hi; m++) if (isBlack(m)) blacks.push({ m, x0: bx(m), x1: bx(m) + bw });
  return { whites: whites.map(m => ({ m, x0: wx.get(m), x1: wx.get(m) + ww })), blacks, y0: top, yb: top + bh, y1: top + kh };
}
function kbHit(cv, x, y) {
  const K = cv._kb; if (!K || y < K.y0 || y > K.y1) return null;
  if (y <= K.yb) { const b = K.blacks.find(k => x >= k.x0 && x <= k.x1); if (b) return b.m; }
  const w = K.whites.find(k => x >= k.x0 && x < k.x1); return w ? w.m : null;
}
const KEYMAP = { KeyA: [0, 'A'], KeyW: [1, 'W'], KeyS: [2, 'S'], KeyE: [3, 'E'], KeyD: [4, 'D'], KeyF: [5, 'F'], KeyT: [6, 'T'], KeyG: [7, 'G'], KeyY: [8, 'Y'], KeyH: [9, 'H'], KeyU: [10, 'U'], KeyJ: [11, 'J'], KeyK: [12, 'K'], KeyO: [13, 'O'], KeyL: [14, 'L'], KeyP: [15, 'P'], Semicolon: [16, ';'] };
const VKeys = {
  used: false, oct: 4, vel: 100, voices: new Map(), pedal: false, sus: new Set(), ptr: new Map(), keys: new Map(),
  press(n, vel) {
    if (typeof Scale !== 'undefined' && Scale.blocked(n)) return;      // greyed-out key
    if (this.voices.has(n) && !this.sus.has(n) && Midi.down.has(n)) return;
    this.used = true; vel = vel || this.vel;
    const old = this.voices.get(n); if (old) { old.release(); this.voices.delete(n); } this.sus.delete(n);
    if (Engine.ctx && Engine.master) { try { this.voices.set(n, Engine.playNote(n, Engine.ctx.currentTime + 0.005, 30, { gain: 0.05 + 0.3 * vel / 127, sustain: true, vel, live: true })); } catch (e) {} }
    Midi.msg([0x90, n, vel], true);
  },
  release(n) {
    Midi.msg([0x80, n, 0], true);
    const v = this.voices.get(n); if (!v) return;
    if (this.pedal) this.sus.add(n); else { v.release(); this.voices.delete(n); }
  },
  setPedal(on) {
    this.pedal = on; const b = $('#kyPedal'); if (b) b.classList.toggle('primary', on); const f = $('#fxSus'); if (f) f.checked = on; if (typeof Knobs !== 'undefined' && Knobs.paintLow) Knobs.paintLow();
    if (!on) { this.sus.forEach(n => { const v = this.voices.get(n); if (v && !Midi.down.has(n)) { v.release(); this.voices.delete(n); } }); this.sus.clear(); }
  },
  releaseAll() { this.ptr.clear(); Midi.panic(); },
  /* Pointer handling for a keyboard canvas: several fingers at once, and sliding from key to key. */
  attach(cv) {
    cv.style.touchAction = 'none';
    const at = e => { const r = cv.getBoundingClientRect(); return kbHit(cv, e.clientX - r.left, e.clientY - r.top); };
    const vel = e => e.pointerType === 'touch' && e.pressure > 0 && e.pressure !== 0.5 ? clamp(Math.round(40 + e.pressure * 87), 40, 127) : this.vel;
    cv.addEventListener('pointerdown', e => { const n = at(e); if (n == null) return; try { cv.setPointerCapture(e.pointerId); } catch (x) {} this.ptr.set(e.pointerId, n); this.press(n, vel(e)); e.preventDefault(); });
    cv.addEventListener('pointermove', e => { if (!this.ptr.has(e.pointerId)) return; const n = at(e), old = this.ptr.get(e.pointerId); if (n != null && n !== old) { this.release(old); this.ptr.set(e.pointerId, n); this.press(n, vel(e)); } });
    const up = e => { if (!this.ptr.has(e.pointerId)) return; this.release(this.ptr.get(e.pointerId)); this.ptr.delete(e.pointerId); };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => cv.addEventListener(t, up));
  },
  /* Computer keys are active on the Tuner, in the on-screen piano and in piano exercises, and never while typing or while another screen is open. */
  keysActive() {
    if (Store.data.settings.kbPlay === false && !Keys.on) return false;
    const ov = document.querySelector('.overlay.on'); if (ov) return ov.id === 'o-keys' || ov.id === 'o-pex' || ov.id === 'o-spec';
    return UI.screen === 'tuner' || UI.screen === 'piano' || (UI.screen === 'seq' && Rec.state !== 'idle');
  },
  onKey(e, down) {
    if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || !this.keysActive()) return;
    const k = KEYMAP[e.code];
    if (k) {
      e.preventDefault(); const n = 12 * (this.oct + 1) + k[0];
      if (down) { if (e.repeat || this.keys.has(e.code)) return; this.keys.set(e.code, n); this.press(n); }
      else if (this.keys.has(e.code)) { this.release(this.keys.get(e.code)); this.keys.delete(e.code); }
      return;
    }
    if (!down) { if (e.code === 'Space' && (Keys.on || PX.on)) { e.preventDefault(); this.setPedal(false); } return; }
    if (e.repeat) return;
    const sf = Keys.on && { ArrowUp: () => SFUI.stepFont(-1), ArrowDown: () => SFUI.stepFont(1), ArrowLeft: () => SFUI.stepPreset(-1), ArrowRight: () => SFUI.stepPreset(1) }[e.code];
    if (sf) sf();
    else if (e.code === 'KeyZ') { this.oct = Math.max(1, this.oct - 1); toast('Octave C' + this.oct, 800); }
    else if (e.code === 'KeyX') { this.oct = Math.min(7, this.oct + 1); toast('Octave C' + this.oct, 800); }
    else if (e.code === 'KeyC') { this.vel = Math.max(20, this.vel - 20); toast('Volume ' + Math.round(this.vel / 1.27) + '%', 800); }
    else if (e.code === 'KeyV') { this.vel = Math.min(127, this.vel + 20); toast('Volume ' + Math.round(this.vel / 1.27) + '%', 800); }
    else if (e.code === 'Space' && (Keys.on || PX.on)) { e.preventDefault(); this.setPedal(true); }
    else return;
    e.preventDefault();
  }
};
/* The big on-screen piano (full-screen overlay) */
const Keys = {
  on: false, lo: 48, span: 3,
  open() { this.on = true; $('#kySpan').value = this.span; $('#o-keys').classList.add('on'); this.fit(); },
  close() { this.on = false; VKeys.setPedal(false); VKeys.releaseAll(); $('#o-keys').classList.remove('on'); },
  fit() { this.lo = clamp(this.lo, 24, 108 - 12 * this.span); this.lo -= ((this.lo % 12) + 12) % 12; $('#kyRange').textContent = noteName(this.lo) + ' – ' + noteName(this.lo + 12 * this.span); },
  shift(d) { this.lo += 12 * d; this.fit(); },
  draw() {
    const cv = $('#kyCv'); if (!cv.clientWidth || !cv.clientHeight) return;
    const { g, w, h } = fitCanvas(cv), lo = this.lo, hi = lo + 12 * this.span, held = Midi.keys(), lit = Scale.expand(held);
    const whites = []; for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
    const ww = w / whites.length, top = 2, kh = h - 4, bh = kh * 0.62, bw = ww * 0.62, wx = new Map(); whites.forEach((m, i) => wx.set(m, i * ww));
    const off = { 1: -0.08, 3: 0.08, 6: -0.08, 8: 0, 10: 0.08 }, bx = m => wx.get(m - 1) + ww - bw / 2 + (off[pcOf(m)] || 0) * ww;
    const label = {}; if (Store.data.settings.kyLetters) Object.keys(KEYMAP).forEach(c => { label[12 * (VKeys.oct + 1) + KEYMAP[c][0]] = KEYMAP[c][1]; });
    g.clearRect(0, 0, w, h); g.textAlign = 'center'; const art = KeyArt.begin(g, top, kh, bh);
    whites.forEach(m => {
      const x = wx.get(m), on = lit.includes(m); KeyArt.white(g, art, x + 1, top, ww - 2, kh, on ? 'on' : Scale.has(m) ? null : 'off');
      g.fillStyle = on ? '#24211e' : '#b8a888'; g.font = '700 ' + (11 * UIK) + 'px sans-serif'; if (m % 12 === 0) g.fillText(noteName(m), x + ww / 2, top + kh - 8 * UIK);
      if (label[m]) { g.fillStyle = on ? '#24211e' : '#c58bff'; g.font = '700 ' + (14 * UIK) + 'px sans-serif'; g.fillText(label[m], x + ww / 2, top + kh - 28 * UIK); }
    });
    for (let m = lo; m <= hi; m++) if (isBlack(m)) {
      const x = bx(m), on = lit.includes(m); KeyArt.black(g, art, x, top, bw, bh, on ? 'on' : Scale.has(m) ? null : 'off');
      if (label[m]) { g.fillStyle = on ? '#24211e' : '#c58bff'; g.font = '700 ' + (13 * UIK) + 'px sans-serif'; g.fillText(label[m], x + bw / 2, top + bh - 10 * UIK); }
    }
    cv._kb = kbGeom(lo, hi, whites, wx, ww, bx, bw, top, kh, bh); g.textAlign = 'start';
    const dk = describeKeys(held), nm = $('#kyName'), nt = $('#kyNotes'); if (nm.textContent !== dk.name) nm.textContent = dk.name; const t = held.length > 1 ? dk.detail : ''; if (nt.textContent !== t) nt.textContent = t;
  }
};

