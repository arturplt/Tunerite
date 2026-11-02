"use strict";
/* Effect knobs for Compose. Each one is a continuous amount (0 to 1) stored in settings.fxK and read by Engine.setFx; a knob that has never been touched
   leaves the Piano screen's dropdown in charge. Drag up or down (or left and right), scroll, or use the arrow keys; double-tap resets. */
const Knobs = {
  list: [
    { k: 'reverb', n: 'Reverb', d: 0, tip: 'Room to hall: the space around the notes' },
    { k: 'echo', n: 'Echo', d: 0, tip: 'Repeats that fade away' },
    { k: 'chorus', n: 'Chorus', d: 0, tip: 'Thickens the sound with slightly detuned copies' },
    { k: 'trem', n: 'Tremolo', d: 0, tip: 'Volume pulse' },
    { k: 'vib', n: 'Vibrato', d: 0, tip: 'Pitch wobble' },
    { k: 'phase', n: 'Phaser', d: 0, tip: 'Slow sweeping whoosh' },
    { k: 'wide', n: 'Width', d: 0, tip: 'Stereo widener' },
    { k: 'drive', n: 'Drive', d: 0, tip: 'Overdrive: warm to crunchy' },
    { k: 'tone', n: 'Tone', d: 0.5, tip: 'Dark on the left, bright on the right' },
  ],
  A0: -135, A1: 135, T: 21,
  /* What a knob shows when nobody has moved it: the level the Piano screen's dropdown gives. */
  base(k) {
    const s = Store.data.settings, lv = { off: 0, light: 1, medium: 2, deep: 3 };
    return { reverb: { off: 0, room: 0.3, hall: 0.75 }[s.reverb] || 0, echo: { short: 0.75, medium: 0.75, long: 0.75 }[s.fxDelay] || 0, chorus: s.chorus ? 1 : 0, trem: [0, 0.25, 0.58, 1][lv[s.fxTrem] || 0],
      vib: [0, 0.24, 0.5, 1][lv[s.fxVib] || 0], phase: s.fxPhase === 'phaser' ? 1 : 0, wide: s.fxWide ? 0.75 : 0, drive: { warm: 0.5, crunch: 1 }[s.fxDrive] || 0, tone: { dark: 0, warm: 0.25, neutral: 0.5, bright: 1 }[s.fxTone] }[k];
  },
  val(k) { const K = Store.data.settings.fxK || {}; return K[k] != null ? K[k] : this.base(k); },
  init() {
    const host = $('#fxKnobs'); if (!host) return;
    host.innerHTML = this.list.map(f => `<div class="knob" data-k="${f.k}" role="slider" tabindex="0" aria-label="${f.n}" aria-valuemin="0" aria-valuemax="100" title="${f.tip}. Drag, scroll or use the arrow keys; double-tap to reset.">
      <svg viewBox="-50 -50 100 100" aria-hidden="true">${this.ticks()}<circle class="kb" r="27"/><circle class="kf" r="20"/><circle class="kd" cx="0" cy="-14" r="3"/></svg><b>${f.n}</b></div>`).join('');
    $$('#fxKnobs .knob').forEach(el => this.wire(el));
    $('#fxKnobReset').onclick = () => this.reset();
    this.sync();
  },
  ticks() {
    let h = ''; for (let i = 0; i < this.T; i++) { const a = (this.A0 + (this.A1 - this.A0) * i / (this.T - 1)) * Math.PI / 180, big = i % 5 === 0, r0 = big ? 36 : 38; h += `<line data-i="${i}" x1="${(Math.sin(a) * r0).toFixed(2)}" y1="${(-Math.cos(a) * r0).toFixed(2)}" x2="${(Math.sin(a) * 44).toFixed(2)}" y2="${(-Math.cos(a) * 44).toFixed(2)}"/>`; }
    return h;
  },
  set(k, v, quiet) {
    const s = Store.data.settings; s.fxK = Object.assign({}, s.fxK, { [k]: clamp(Math.round(v * 100) / 100, 0, 1) });      // a new object each time: DEFAULTS.fxK is shared
    this.paint(k); Engine.setFx(); if (!quiet) { clearTimeout(this.st); this.st = setTimeout(() => Store.save(), 300); }
  },
  wire(el, get, put, def) {
    const k = el.dataset.k; let drag = null; get = get || (() => this.val(k)); put = put || ((kk, v) => this.set(kk, v)); def = def != null ? def : this.list.find(f => f.k === k).d;
    el.addEventListener('pointerdown', e => { e.preventDefault(); el.focus(); el.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, v: get() }; });
    el.addEventListener('pointermove', e => { if (!drag) return; put(k, drag.v + ((drag.y - e.clientY) + (e.clientX - drag.x)) / 150); });
    const end = () => { drag = null; };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', e => { e.preventDefault(); put(k, get() + (e.deltaY < 0 ? 0.04 : -0.04)); }, { passive: false });
    el.addEventListener('dblclick', () => put(k, def));
    el.addEventListener('keydown', e => {
      const d = { ArrowUp: 0.05, ArrowRight: 0.05, ArrowDown: -0.05, ArrowLeft: -0.05, PageUp: 0.2, PageDown: -0.2 }[e.key];
      if (d != null) { e.preventDefault(); e.stopPropagation(); put(k, get() + d); } else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); e.stopPropagation(); put(k, e.key === 'Home' ? 0 : 1); }
    });
  },
  paint(k) { const el = $(`#fxKnobs .knob[data-k="${k}"]`); if (el) this.paintEl(el, this.val(k), this.list.find(x => x.k === k)); },
  /* Any set of knobs: host gets one per entry of `list`; get(k) reads an amount and put(k, v) stores one. Used by the Compose tracks, which have their own amounts. */
  mount(host, list, get, put) {
    host.innerHTML = list.map(f => `<div class="knob" data-k="${f.k}" role="slider" tabindex="0" aria-label="${f.n}" aria-valuemin="0" aria-valuemax="100" title="${f.tip ? f.tip + '. ' : ''}${f.n}: drag, scroll or use the arrow keys; double-tap to reset.">
      <svg viewBox="-50 -50 100 100" aria-hidden="true">${this.ticks()}<circle class="kb" r="27"/><circle class="kf" r="20"/><circle class="kd" cx="0" cy="-14" r="3"/></svg><b>${f.n}</b></div>`).join('');
    host.querySelectorAll('.knob').forEach(el => {
      const f = list.find(x => x.k === el.dataset.k), paint = () => this.paintEl(el, get(f.k), f);
      this.wire(el, () => get(f.k), (kk, v) => { put(f.k, clamp(Math.round(v * 100) / 100, 0, 1)); paint(); }, f.d); paint();
    });
  },
  paintEl(el, v, f) {
    const a = this.A0 + (this.A1 - this.A0) * v, mid = f.bi != null ? f.bi : f.d > 0;
    el.querySelector('.kd').setAttribute('transform', `rotate(${a.toFixed(1)})`); el.querySelector('.kf').setAttribute('transform', `rotate(${a.toFixed(1)})`);
    const lit = v * (this.T - 1), from = mid ? (this.T - 1) / 2 : 0;
    el.querySelectorAll('line').forEach(l => { const i = +l.dataset.i; l.classList.toggle('on', mid ? (i >= Math.min(from, lit) - 1e-6 && i <= Math.max(from, lit) + 1e-6 && Math.abs(lit - from) > 0.05) : i <= lit + 1e-6 && v > 0.005); });
    if (f.txt) el.querySelector('b').textContent = f.txt(v);
    el.setAttribute('aria-valuenow', Math.round(v * 100)); el.setAttribute('aria-valuetext', mid ? (v < 0.45 ? 'darker' : v > 0.55 ? 'brighter' : 'neutral') : Math.round(v * 100) + '%'); el.classList.toggle('lit', Math.abs(v - (f.d || 0)) > (mid ? 0.03 : 0.005));
  },
  /* A dropdown on the Piano screen was changed: it takes over from that knob. */
  free(k) { const s = Store.data.settings; if (k && s.fxK && k in s.fxK) { s.fxK = Object.assign({}, s.fxK); delete s.fxK[k]; } this.sync(); },
  sync() { this.list.forEach(f => this.paint(f.k)); },
  /* Every knob to its resting position, and the dropdowns on the Piano screen go with them. */
  reset() {
    const s = Store.data.settings; Object.assign(s, { reverb: 'off', chorus: false, fxTrem: 'off', fxVib: 'off', fxDelay: 'off', fxWide: false, fxTone: 'neutral', fxPhase: 'off', fxDrive: 'off' }); s.fxK = {};
    $$('.fxRv').forEach(x => x.value = 'off'); $$('.fxCh').forEach(x => x.checked = false); $$('[data-fx]').forEach(el => { const v = s[el.dataset.fx]; if (v === undefined) return; if (el.type === 'checkbox') el.checked = !!v; else el.value = v; });
    Store.save(); Engine.applySettings(); Engine.setFx(); this.sync();
  },
};
