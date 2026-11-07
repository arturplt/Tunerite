"use strict";
/* ---- The Settings tab's hardware controls. Each one stands in for a native control and keeps its API, so the code that reads and writes the settings does not change:
   a rocker has .checked and fires "change"; a key group has .value and fires "change"; a fader has .value and fires "input"; a stepper sits beside a hidden <select> or number input
   and shows its choice on a small LCD. Programmatic changes (.checked = ..., .value = ...) repaint the control. ---- */
const SetUI = {
  rocker(el) {
    Object.defineProperty(el, 'checked', { get: () => el.getAttribute('aria-pressed') === 'true', set: v => { el.setAttribute('aria-pressed', v ? 'true' : 'false'); el.setAttribute('aria-checked', v ? 'true' : 'false'); }, configurable: true });
    el.setAttribute('role', 'switch'); el.checked = false;
    el.addEventListener('click', () => { el.checked = !el.checked; el.dispatchEvent(new Event('change', { bubbles: true })); });
  },
  /* A group of interlocked keys (one up at a time): the buttons carry data-v. */
  keys(el) {
    const btns = () => [...el.querySelectorAll('button[data-v]')]; let cur = '';
    Object.defineProperty(el, 'value', { get: () => cur, set: v => { cur = String(v); btns().forEach(b => b.setAttribute('aria-pressed', b.dataset.v === cur ? 'true' : 'false')); }, configurable: true });
    el.addEventListener('click', e => { const b = e.target.closest('button[data-v]'); if (!b || b.dataset.v === cur) return; el.value = b.dataset.v; el.dispatchEvent(new Event('change', { bubbles: true })); });
  },
  /* A horizontal fader: slot, lit fill, ticks and a ribbed cap. data-min, data-max, data-step, data-ticks, data-major and data-labels describe it. */
  fader(el) {
    const min = +el.dataset.min, max = +el.dataset.max, step = +el.dataset.step || 1, n = +el.dataset.ticks || 0, major = +el.dataset.major || 0, labels = el.dataset.labels ? el.dataset.labels.split(',') : [];
    let v = min, html = '<i class="slot"></i><i class="fillbar"></i>';
    for (let i = 0; i < n; i++) html += '<i class="tk' + (major && i % major === 0 ? ' m' : '') + '" style="--t:' + (i / (n - 1)).toFixed(4) + '"></i>';
    labels.forEach((t, i) => { html += '<span class="tl" style="--t:' + (i / (labels.length - 1)).toFixed(4) + '">' + t + '</span>'; });
    el.innerHTML = html + '<i class="cap"></i>'; el.setAttribute('role', 'slider'); el.tabIndex = 0; el.setAttribute('aria-valuemin', min); el.setAttribute('aria-valuemax', max);
    const snap = x => clamp(Math.round((x - min) / step) * step + min, min, max), paint = () => { el.style.setProperty('--v', ((v - min) / (max - min)).toFixed(4)); el.setAttribute('aria-valuenow', v); };
    Object.defineProperty(el, 'value', { get: () => String(+v.toFixed(4)), set: x => { v = snap(+x); paint(); }, configurable: true });
    const user = x => { const nv = snap(x); if (nv === v) return; v = nv; paint(); el.dispatchEvent(new Event('input', { bubbles: true })); };
    const fromPointer = e => { const r = el.getBoundingClientRect(), len = el.querySelector('.cap').offsetWidth; user(min + clamp((e.clientX - r.left - len / 2) / (r.width - len), 0, 1) * (max - min)); };
    el.addEventListener('pointerdown', e => { try { el.setPointerCapture(e.pointerId); } catch (x) { /* a synthetic pointer */ } el.classList.add('drag'); el.focus(); fromPointer(e); e.preventDefault(); });
    el.addEventListener('pointermove', e => { if (el.classList.contains('drag')) fromPointer(e); });
    const end = () => el.classList.remove('drag'); el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('keydown', e => { const d = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step, PageUp: step * 4, PageDown: -step * 4 }[e.key]; if (e.key === 'Home') user(min); else if (e.key === 'End') user(max); else if (d) user(v + d); else return; e.preventDefault(); });
    paint();
  },
  /* A stepper: arrows either side of a small LCD, driving a hidden <select> (it cycles through the visible options) or a number input (data-step, clamped). */
  stepper(box) {
    const src = document.getElementById(box.dataset.for), lcd = box.querySelector('b'), num = src.tagName === 'INPUT';
    const text = () => num ? src.value + ' ' + (box.dataset.unit || '') : (src.options[src.selectedIndex] ? src.options[src.selectedIndex].textContent : '–');
    box._sync = () => { const t = text().trim(); if (lcd.textContent !== t) lcd.textContent = t; };
    const move = d => {
      if (num) { const s = +src.step || 1, nv = clamp((+src.value || 0) + d * s, +src.min, +src.max); if (nv === +src.value) return; src.value = nv; }
      else { const o = [...src.options].filter(x => !x.hidden && !x.disabled); if (!o.length) return; const i = Math.max(0, o.indexOf(src.options[src.selectedIndex])); src.value = o[(i + d + o.length) % o.length].value; }
      box._sync(); src.dispatchEvent(new Event(num ? 'input' : 'change', { bubbles: true }));
    };
    box.querySelector('.l').onclick = () => move(-1); box.querySelector('.r').onclick = () => move(1); src.addEventListener('change', box._sync); box._sync();
  },
  init() {
    $$('#s-settings [data-ctl="rocker"]').forEach(el => this.rocker(el)); $$('#s-settings [data-ctl="keys"]').forEach(el => this.keys(el)); $$('#s-settings [data-ctl="fader"]').forEach(el => this.fader(el)); $$('#s-settings .stp').forEach(el => this.stepper(el));
    const sec = $$('#s-settings .secbtn'), show = k => { $('#s-settings').dataset.sec = k; sec.forEach(b => b.setAttribute('aria-pressed', b.dataset.sec === k ? 'true' : 'false')); };
    sec.forEach(b => b.addEventListener('click', () => show(b.dataset.sec))); show($('#s-settings').dataset.sec || 'disp');
    ['#setTempo', '#setVol'].forEach(id => $(id).addEventListener('input', () => this.readouts()));
  },
  /* the numbers next to the faders, and every stepper's screen, follow the settings */
  readouts() { const t = $('#setTempo'), v = $('#setVol'); if (t && $('#tempoVal')) $('#tempoVal').textContent = t.value + '%'; if (v && $('#volVal')) $('#volVal').textContent = Math.round(+v.value * 100) + '%'; },
  sync() { this.readouts(); $$('#s-settings .stp').forEach(b => b._sync && b._sync()); }
};
