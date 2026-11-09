"use strict";
/* ---- Rhythm training in Practice: the drill screen (the level map is on the Practice device, js/practice-device.js). The curriculum and the scoring are in core/rhythm.js.
   A round is three bars: a count-in, the pattern played to you, then your turn to tap it back (Space, Enter or the pad). All times are on the audio clock. ---- */
const Rhy = {
  on: false, lv: null, rd: 0, scores: [], errs: [], pat: null, prev: null, beat: 0, bar: 0, T: 0, L: 0, Y: 0, endAt: 0, taps: [], phase: '', judged: false, raf: 0, hs: [], timer: 0, dots: [], head: null, lastCount: 0, clap: false, sounds: [], floor: 0, prevRms: 0, lastClap: -9, fn: null,
  prog() { const s = Store.data; if (!s.rhythm) s.rhythm = { levels: {} }; return s.rhythm.levels; },
  /* ---- sound ---- */
  stop() { this.hs.forEach(h => { try { h.stop(); } catch (e) { /* already gone */ } }); this.hs = []; },
  tick(when, down, vol) { const h = Engine.click(when, down ? 1300 : 900, vol, 0.05); if (h) this.hs.push(h); },
  /* clapping: a sudden jump in the microphone level is a clap. The level has to clear the room's noise and double since the last frame, and our own clicks are ignored. */
  heard(fr) {
    const r = fr.rms, t = fr.t + (Engine.half || 0.02) - 0.01 - (Engine.ctx.baseLatency || 0), jump = r > Math.max(0.02, this.floor * 3.5) && r > this.prevRms * 2 && t - this.lastClap > 0.1;
    this.prevRms = r; if (!jump) { this.floor = this.floor ? this.floor * 0.95 + r * 0.05 : r; return; }
    this.lastClap = t; if (this.sounds.some(x => t >= x - 0.03 && t <= x + 0.14)) return; this.record(t - this.Y);
  },
  setClap(on) {
    this.clap = on; Store.data.settings.rhyIn = on ? 'clap' : 'tap'; Store.save(); Engine.listeners.delete(this.fn); if (on && this.on) { this.floor = this.prevRms = 0; Engine.listeners.add(this.fn); }
    $('#rhyMode').textContent = on ? 'CLAPPING' : 'TAPPING'; $('#rhyPad').textContent = on ? 'CLAP (OR TAP)' : 'TAP'; if (this.on && !this.judged) this.round();
  },
  lat() { const c = Engine.ctx; return c ? (c.outputLatency || c.baseLatency || 0) : 0; },
  /* ---- a drill ---- */
  async open(id) {
    const lv = RHYTHM.level(id); if (!lv || !RHYTHM.unlocked(this.prog(), id)) return;
    if (lv.game) return Hero.open(lv);
    try { await Engine.start(); } catch (e) { /* the browser may need a tap first */ } if (!Engine.ctx || !Engine.master) return toast('Start the app first (tap Start).', 2500);
    this.stop(); clearTimeout(this.timer); this.lv = lv; this.on = true; this.setClap(Store.data.settings.rhyIn === 'clap'); this.rd = 0; this.scores = []; this.errs = []; this.prev = null; $('#o-rhythm').classList.add('on'); PDev.sync();
    $('#rhyTitle').textContent = RHYTHM.unitOf(lv).title + ' · ' + lv.title; this.round(); if (!this.raf) this.raf = requestAnimationFrame(() => this.frame());
  },
  close() { this.on = false; Engine.listeners.delete(this.fn); clearTimeout(this.timer); this.stop(); $('#o-rhythm').classList.remove('on'); PDev.refresh(); },
  round() {
    const lv = this.lv, c = Engine.ctx; clearTimeout(this.timer); this.stop(); this.pat = RHYTHM.pick(lv, Math.random, this.prev); this.prev = this.pat;
    this.beat = 60 / lv.bpm; this.bar = lv.beats * this.beat; this.T = c.currentTime + 0.3; this.L = this.T + this.bar; this.Y = this.L + this.bar; this.endAt = this.Y + this.bar + Math.min(0.35 * this.beat, 0.3);
    this.taps = []; this.phase = ''; this.judged = false; this.sounds = [];
    for (let i = 0; i < lv.beats; i++) { this.tick(this.T + i * this.beat, i === 0, 0.22); this.sounds.push(this.T + i * this.beat); this.tick(this.L + i * this.beat, i === 0, 0.06); this.sounds.push(this.L + i * this.beat); if (!this.clap) this.tick(this.Y + i * this.beat, i === 0, 0.06); }      // clapping: no clicks in your bar, the microphone would hear them
    RHYTHM.onsets(this.pat, lv.beats).forEach(b => { const t = this.L + b * this.beat, h = Engine.click(t, 520, 0.3, 0.1); this.sounds.push(t); if (h) this.hs.push(h); });
    this.paintLane(); this.paintStep(); $('#rhyFb').textContent = ''; $('#rhyFb').className = 'earfb';
  },
  paintStep() { $('#rhyStep').textContent = Math.min(this.rd + 1, this.lv.n) + ' / ' + this.lv.n; $('#rhyBar').style.width = (this.rd / this.lv.n * 100) + '%'; },
  paintLane() {
    const lane = $('#rhyLane'), lv = this.lv; lane.textContent = ''; this.dots = [];
    for (let i = 0; i < lv.beats; i++) { const t = document.createElement('i'); t.className = 'rtick' + (i === 0 ? ' down' : ''); t.style.left = (i / lv.beats * 100) + '%'; lane.appendChild(t); }
    RHYTHM.onsets(this.pat, lv.beats).forEach(b => { const d = document.createElement('i'); d.className = 'rdot'; d.style.left = (b / lv.beats * 100) + '%'; lane.appendChild(d); this.dots.push(d); });
    this.head = document.createElement('i'); this.head.className = 'rhead'; this.head.hidden = true; lane.appendChild(this.head);
  },
  /* ---- the clock ---- */
  frame() {
    this.raf = 0; if (!this.on) return; if (UI.screen !== 'train') return this.close();
    const now = Engine.ctx.currentTime, sub = $('#rhySub'), ph = $('#rhyPhase');
    if (now < this.L) {
      if (this.phase !== 'count') { this.phase = 'count'; ph.textContent = 'COUNT IN'; }
      const n = Math.max(1, Math.min(this.lv.beats, Math.floor((now - this.T) / this.beat) + 1)); if (now >= this.T) sub.textContent = String(n); else sub.textContent = '';
      this.head.hidden = true;
    } else if (now < this.Y) {
      if (this.phase !== 'listen') { this.phase = 'listen'; ph.textContent = 'LISTEN'; sub.textContent = 'Hear the pattern.'; }
      this.head.hidden = false; this.head.style.left = ((now - this.L) / this.bar * 100) + '%';
      RHYTHM.onsets(this.pat, this.lv.beats).forEach((b, i) => { if (now >= this.L + b * this.beat) this.dots[i].classList.add('lit'); });
    } else if (now < this.endAt) {
      if (this.phase !== 'tap') { this.phase = 'tap'; ph.textContent = 'YOUR TURN'; sub.textContent = this.clap ? 'Clap it back.' : 'Tap it back.'; this.dots.forEach(d => d.classList.remove('lit')); }
      this.head.hidden = false; this.head.style.left = (Math.min(1, (now - this.Y) / this.bar) * 100) + '%';
    } else if (!this.judged) this.judge();
    this.raf = requestAnimationFrame(() => this.frame());
  },
  /* ---- tapping ---- */
  hit() {
    if (!this.on || this.judged) return; const now = Engine.ctx.currentTime; if (now < this.Y - 0.4 * this.beat || now > this.endAt) return;
    if (!this.clap) { const h = Engine.click(now, 700, 0.25, 0.07); if (h) this.hs.push(h); } this.sounds.push(now);
    this.record(now - this.lat() - this.Y);
  },
  /* a tap or clap t seconds after the start of your bar */
  record(t) {
    if (!this.on || this.judged || t < -0.4 * this.beat || this.Y + t > this.endAt) return; this.taps.push(t);
    const m = document.createElement('i'); m.className = 'rtap'; m.style.left = (clamp(t / this.bar, -0.04, 1.04) * 100) + '%'; $('#rhyLane').appendChild(m);
    const pad = $('#rhyPad'); pad.classList.add('tap'); setTimeout(() => pad.classList.remove('tap'), 90);
  },
  /* ---- one round done ---- */
  judge() {
    this.judged = true; this.phase = 'fb'; this.head.hidden = true; const fb = $('#rhyFb'), exp = RHYTHM.onsets(this.pat, this.lv.beats).map(b => b * this.beat), r = RHYTHM.score(exp, this.taps);
    r.per.forEach((p, i) => { const d = this.dots[i]; d.classList.remove('lit'); d.classList.add(p.tap == null ? 'bad' : p.pts >= 0.7 ? 'good' : p.pts >= 0.3 ? 'ok' : 'bad'); });
    const got = r.per.filter(p => p.tap != null), mean = got.length ? got.reduce((a, p) => a + p.err, 0) / got.length : 0, miss = r.per.length - got.length;
    this.scores.push(r.score); got.forEach(p => this.errs.push(Math.abs(p.err)));
    const pct = Math.round(r.score * 100), ms = Math.round(Math.abs(mean) * 1000);
    let msg = pct + '%. ' + (r.score >= 0.95 ? 'Right on time.' : !got.length ? 'No matching taps.' : ms < 25 ? 'Nicely centred.' : mean < 0 ? 'A little early: about ' + ms + ' ms.' : 'A little late: about ' + ms + ' ms.');
    if (miss && got.length) msg += ' Missed ' + miss + '.'; if (r.extras) msg += ' ' + r.extras + (r.extras === 1 ? ' extra tap.' : ' extra taps.');
    fb.className = 'earfb ' + (r.score >= 0.7 ? 'good' : 'miss'); fb.textContent = msg; this.rd++; this.paintStep();
    $('#rhyPhase').textContent = 'ROUND ' + this.rd; $('#rhySub').textContent = pct + '%';
    this.timer = setTimeout(() => { if (this.rd >= this.lv.n) this.finish(); else this.round(); }, 2300);
  },
  finish() {
    this.stop(); const n = this.scores.length, pct = Math.round(this.scores.reduce((a, b) => a + b, 0) / n * 100), off = this.errs.length ? Math.round(this.errs.reduce((a, b) => a + b, 0) / this.errs.length * 1000) : 0;
    this.complete(this.lv, pct, [['SCORE', String(pct)], ['ROUNDS', n + ' OF ' + this.lv.n], ['AVG OFF', off + ' MS']], this.scores.slice(), 'ROUND BY ROUND'); this.close();
  },
  /* A level is over: keep the best, log it for the streak and hand the result to the device. pct is 0-100; strip is a bar for each round, bar or note (0-1). */
  complete(lv, pct, rows, strip, stripLabel) {
    const id = lv.id, stars = RHYTHM.stars(pct), P = this.prog(), old = P[id], first = !(old && old.stars >= 1);
    P[id] = { best: Math.max(old ? old.best : 0, pct), stars: Math.max(old ? old.stars : 0, stars), tries: (old ? old.tries : 0) + 1, ts: Date.now() };
    (Store.data.rhythmLog = Store.data.rhythmLog || []).push({ ts: Date.now(), lvl: id, pct }); Store.save();
    const nxt = RHYTHM.LEVELS[lv.i + 1] || null, passed = stars >= 1;
    const kind = lv.game ? 'play' : 'rhythm';
    PDev.showResult({ kind, id, pct, r: { kind, id, pct, stars, passed, first, nxt, opened: passed && first && nxt ? nxt : null, improved: !old || pct > old.best + 1e-9, gain: Math.max(0, stars - (old ? old.stars : 0)) }, rows, strip, stripLabel, details: null });
  },
  key(e) {
    if (!this.on || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Escape') { e.preventDefault(); return this.close(); }
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) this.hit(); }
  },
  init() {
    this.fn = fr => { if (this.clap) this.heard(fr); }; $('#rhyMode').onclick = () => this.setClap(!this.clap);
    $('#rhyClose').onclick = () => this.close(); $('#rhyPad').addEventListener('pointerdown', e => { e.preventDefault(); this.hit(); });
    document.addEventListener('keydown', e => this.key(e));
  }
};
