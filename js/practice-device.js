"use strict";
/* ---- The Practice tab as a device: a screen with the level map, and keys beside it. Sing, Whistle, Piano and Ear all read their levels, stars and unlocking from the same
   course data as before (core/course.js, core/ear.js); this file only draws the map and starts a level. Pressing START opens the level in the exercise screens as it always did.
   The device is drawn at a fixed design size (1240 wide, or 430 on a phone) and scaled to fit (fit); the screen is a canvas of 750 x 446 (wide) or 360 x 540 (phone) pixels. ---- */
const PDev = {
  KINDS: ['sing', 'piano', 'whistle', 'ear'], NAMES: { sing: 'SING', piano: 'PIANO', whistle: 'WHISTLE', ear: 'EAR' },
  state: 'map', res: null, sel: {}, unitPick: {}, narrow: false, short: false, W: 750, H: 446, hits: [], ts: 0, raf: 0, C: {}, lastKind: null,
  /* ---- the levels of one kind, whichever engine they come from ---- */
  api(kind) {
    if (kind === 'ear') {
      const P = Ear.prog();
      return { kind, units: EAR.UNITS, levels: EAR.LEVELS, P, unlocked: id => EAR.unlocked(P, id), next: () => EAR.next(P), thr: EAR.STARS.map(x => Math.round(x * 100)), suffix: '%', best: p => Math.round(p.best * 100) + '%', start: id => Ear.open(id) };
    }
    const K = COURSE.KINDS[kind], P = Course.prog(kind);
    return { kind, units: COURSE.UNITS[kind], levels: COURSE.LEVELS[kind], P, unlocked: id => COURSE.unlocked(kind, P, id), next: () => COURSE.next(kind, P), thr: K.thr, suffix: kind === 'piano' ? '%' : '', best: p => Math.round(p.best) + (kind === 'piano' ? '%' : ''), start: id => Course.start(kind, id) };
  },
  mode() { const st = Store.data.settings; return st.trainMode === 'ear' ? 'ear' : st.trainMode === 'piano' ? 'piano' : st.inst === 'whistle' ? 'whistle' : 'sing'; },
  visible() { const d = $('#trDevice'); return !!d && !d.hidden && UI.screen === 'train'; },
  /* the selected level of a kind: the one the player picked, else the next one to play */
  current(a) { let id = this.sel[a.kind]; if (!id || !a.levels.some(l => l.id === id)) id = a.next().id; this.sel[a.kind] = id; return a.levels.find(l => l.id === id); },
  move(d) {
    const a = this.api(this.mode()), cur = this.current(a), i = clamp(a.levels.indexOf(cur) + d, 0, a.levels.length - 1); this.sel[a.kind] = a.levels[i].id; this.unitPick[a.kind] = null;
  },
  stars(a) { return a.levels.reduce((n, l) => n + (a.P[l.id] ? a.P[l.id].stars : 0), 0); },
  start() {
    const a = this.api(this.mode()), l = this.current(a); if (a.unlocked(l.id)) a.start(l.id);
  },
  /* the big key: start the picked level; on a result it goes on to the next level, or repeats this one */
  go() {
    if (this.state !== 'result' || !this.res) return this.start();
    if (this.res.t && this.ts - this.res.t < 2800) { this.res.t = this.ts - 4800; return; }
    const d = this.res; if (d.r.passed && d.r.nxt) d.a.start(d.r.nxt.id); else d.a.start(d.id);
  },
  scrollPane(d) { this.pane.scrollBy({ top: d * this.pane.clientHeight * 0.7, behavior: 'smooth' }); },
  toMap() { if (this.state === 'result') { this.state = 'map'; this.unitPick[this.mode()] = null; } },
  /* A course level has just finished: the engine hands over what happened and the device shows it (stars, rank, what opened, REPEAT and NEXT LEVEL). */
  showResult(d) {
    const a = this.api(d.kind), lv = a.levels.find(l => l.id === d.id); if (!lv || !this.dev) return;
    const unit = a.units.find(u => u.levels.some(l => l.id === d.id)), r = d.r, tot = this.KINDS.reduce((n, k) => n + this.stars(this.api(k)), 0), before = tot - (r.gain || 0), thr = a.thr, p = d.pct;
    this.res = Object.assign({}, d, { a, lv, unit, thr, before, after: tot, lvUp: Math.floor(before / 8) < Math.floor(tot / 8), t: 0, sparks: [], fired: {}, last: r.passed && unit.levels[unit.levels.length - 1].id === d.id,
      rank: p >= thr[2] ? 'S' : p >= thr[1] ? 'A' : p >= thr[0] ? 'B' : p >= thr[0] * 0.8 ? 'C' : 'D' });
    this.state = 'result'; this.sel[d.kind] = d.id; this.unitPick[d.kind] = null;
    UI.show('train'); UI.trainView('menu');
  },
  /* ---- setup ---- */
  init() {
    const dev = $('#trDevice'); if (!dev) return; this.cv = $('#pdCv'); this.g = this.cv.getContext('2d'); this.dev = dev;
    $$('#pdLabels button').forEach(b => b.onclick = () => this.setMode(b.dataset.m));
    const tr = $('#pdTrack'), pick = e => { const r = tr.getBoundingClientRect(), i = clamp(Math.floor((e.clientX - r.left) / r.width * 4), 0, 3); if (this.KINDS[i] !== this.mode()) this.setMode(this.KINDS[i]); };
    tr.addEventListener('pointerdown', e => { try { tr.setPointerCapture(e.pointerId); } catch (x) { /* a synthetic pointer */ } tr.drag = 1; pick(e); });
    tr.addEventListener('pointermove', e => { if (tr.drag) pick(e); }); tr.addEventListener('pointerup', () => { tr.drag = 0; });
    tr.addEventListener('keydown', e => { const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key]; if (!d) return; this.setMode(this.KINDS[clamp(this.KINDS.indexOf(this.mode()) + d, 0, 3)]); e.preventDefault(); });
    $('#pdPrev').onclick = () => { if (this.view() !== 'course' || this.playing()) return this.scrollPane(-1); this.toMap(); this.move(-1); this.draw(); }; $('#pdNext').onclick = () => { if (this.view() !== 'course' || this.playing()) return this.scrollPane(1); this.toMap(); this.move(1); this.draw(); }; $('#pdGo').onclick = () => { if (this.canRepeat()) return this.repeat(); if (this.view() === 'course' && !this.playing()) this.go(); }; $('#pdMap').onclick = () => { Store.data.settings.prView = 'course'; Store.save(); this.toMap(); UI.refresh(); };
    $('#pdLib').onclick = () => this.toggleView('lib');
    this.pane = $('#pdPane'); this.pane.append($('#trLib'), $('#trEx'), $('#tr-sess'), $('#tr-res'), $('#o-pex'), $('#o-ear'), $('#o-range'));      // the lists, the exercise and its results, the piano exercise and the ear drill all live inside the screen
    $('#pdRange').onclick = () => RangeFinder.open(Store.data.settings.inst === 'whistle');
    this.cv.addEventListener('click', e => { const r = this.cv.getBoundingClientRect(), x = (e.clientX - r.left) * this.W / r.width, y = (e.clientY - r.top) * this.H / r.height; for (let i = this.hits.length - 1; i >= 0; i--) { const h = this.hits[i]; if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) { h.fn(); this.draw(); break; } } });
    addEventListener('resize', () => this.fit());
    const again = () => { this.fit(); setTimeout(() => this.fit(), 250); }; addEventListener('orientationchange', again);      // a phone settles its new size a moment after it turns
    if (window.ResizeObserver) new ResizeObserver(() => this.fit()).observe($('#s-train'));
  },
  setMode(m) { setTrainMode(m); },
  /* Exercises and Library show inside the screen; pressing the key again goes back to the map */
  toggleView(v) { if (this.mode() === 'ear') return toast('Ear training has no ' + (v === 'ex' ? 'exercise list' : 'library') + '.', 1800); const st = Store.data.settings; st.prView = st.prView === v ? 'course' : v; Store.save(); this.toMap(); UI.refresh(); },
  view() { const v = Store.data.settings.prView; return this.mode() === 'ear' ? 'course' : v === 'lib' ? 'lib' : v === 'ex' ? 'ex' : 'course'; },
  /* the device is scaled to fit the tab; on a tall narrow window it is the phone layout, which scrolls */
  fit() {
    const dev = this.dev; if (!dev || dev.hidden) return; const host = $('#s-train'), w = host.clientWidth, h = host.clientHeight; if (!w || !h) return;
    const port = w / h < 0.9 || w < 560, short = !port && h < 520, dw = port ? 430 : 1240;      // portrait, a landscape phone, or a roomy window
    dev.classList.toggle('port', port); dev.classList.toggle('short', short); dev.style.setProperty('--s', 1); dev.style.setProperty('--dw', dw + 'px');
    const top = dev.getBoundingClientRect().top - host.getBoundingClientRect().top, aw = dev.clientWidth || w; let s = 1, DW = dw, nw = 360, nh = 540;
    if (short) { DW = Math.max(520, aw - 4); nw = DW - 230; nh = clamp(h - 2 * top - 150, 120, 420); }      // not scaled: the screen takes whatever the window gives
    else {
      const dh = (dev.querySelector('.device').offsetHeight || 700) + 8;      // the box; its drop shadow underneath may run off the bottom      // the device at its design size, so it can be scaled to fit the tab both ways
      s = Math.max(0.3, Math.min((aw - 4) / dw, (h - 2 * top - 4) / dh));      // the room inside the tab's own padding
      if (!port) { DW = clamp(Math.floor((aw - 4) / s), 1240, 2400); nw = DW - 490; nh = 446; }      // wide windows: the screen grows so the device fills the width, like the Piano tab
    }
    dev.style.setProperty('--dw', DW + 'px'); dev.style.setProperty('--s', s.toFixed(4)); dev.style.setProperty('--dp', (1 / ((window.devicePixelRatio || 1) * s)).toFixed(4) + 'px');
    { const d = window.devicePixelRatio || 1; dev.style.setProperty('--mesh-a', d >= 2.5 ? 0.26 : d >= 1.5 ? 0.18 : 0.1); dev.style.setProperty('--mesh-n', d >= 1.5 ? 3 : 2); }      // a phone's screen is dense, so its mesh is fine already; a desktop screen gets a lighter, finer one, so no squares show
    if (port !== this.narrow || short !== this.short || nw !== this.W || nh !== this.H || !this.cv.dataset.set) { this.narrow = port; this.short = short; this.W = nw; this.H = nh; this.cv.width = nw; this.cv.height = nh; this.cv.dataset.set = 1; this.g.imageSmoothingEnabled = false; }
    requestAnimationFrame(() => { const r = this.cv.getBoundingClientRect().width / this.W * (window.devicePixelRatio || 1); this.cv.style.imageRendering = r >= 1 && Math.abs(r - Math.round(r)) < 0.02 ? 'pixelated' : 'auto'; });
  },
  /* called whenever the Practice tab redraws: shows or hides the device, fills the chips, keeps the keys in step with the settings */
  refresh() {
    const dev = $('#trDevice'); if (!dev || dev.hidden || !this.pane) return; this.fit();
    const S = Store.data, mode = this.mode(), mi = this.KINDS.indexOf(mode), tot = this.KINDS.reduce((n, k) => n + this.stars(this.api(k)), 0);
    this.sync();
    $$('#pdLabels button').forEach(b => b.classList.toggle('on', b.dataset.m === mode)); const tk = $('#pdTrack'); tk.style.setProperty('--i', mi); tk.setAttribute('aria-valuenow', mi); tk.setAttribute('aria-valuetext', this.NAMES[mode]);
    $('#pdLv').textContent = String(1 + Math.floor(tot / 8)).padStart(2, '0'); $('#pdXp').style.width = (100 * (tot % 8) / 8) + '%'; $('#pdStars').textContent = '★ ' + tot;
    const n = computeStreak(S.history.concat(S.routines || [], S.guideLog || [], S.pianoLog || [], S.earLog || [])); $('#pdStreak').textContent = n + (n === 1 ? ' DAY' : ' DAYS');
    this.goKey();
    if (!this.raf) this.raf = requestAnimationFrame(t => this.tick(t));
  },
  /* the big key: START on the map, NEXT LEVEL or REPEAT on a result, REPEAT on the details page, with the matching symbol */
  /* REPEAT works whenever an exercise is open: while it runs, on its results, and during an ear drill */
  canRepeat() { return !$('#tr-res').hidden || (!$('#tr-sess').hidden && !!Session.s && !Routine.active) || (Ear.on && !!Ear.lv); },
  repeat() {
    if (!$('#tr-res').hidden) return $('#rAgain').click();
    if (Ear.on && Ear.lv) return Ear.open(Ear.lv.id);
    const ex = UI.lastExercise, c = UI.curSession && UI.curSession.course; Session.stop(); Session.begin(ex, c ? { course: { kind: c.kind, id: c.id } } : undefined);
  },
  goKey() {
    const d = this.res, res = this.state === 'result' && d && d.kind === this.mode(), det = this.canRepeat();
    const lbl = det ? 'REPEAT' : res ? (d.r.passed && d.r.nxt ? (this.short ? 'NEXT' : 'NEXT LEVEL') : 'REPEAT') : 'START', b = $('#pdGo'), ico = lbl === 'REPEAT' ? 'rep' : 'play';
    $('#pdGoLbl').textContent = lbl; b.setAttribute('aria-label', lbl === 'REPEAT' ? 'Repeat the exercise' : lbl === 'START' ? 'Start the level' : 'Next level');
    if (b.dataset.ico !== ico) { b.dataset.ico = ico; b.innerHTML = ico === 'rep' ? '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v5h5"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M7 4l13 8-13 8z" fill="currentColor"/></svg>'; }
  },
  /* the screen shows a list, an exercise, its results, a piano exercise or an ear drill whenever one of those is open; otherwise the map */
  playing() { return !$('#tr-sess').hidden || !$('#tr-res').hidden || $('#o-pex').classList.contains('on') || $('#o-ear').classList.contains('on') || $('#o-range').classList.contains('on'); },
  sync() {
    if (!this.pane) return; this.goKey(); const view = this.view(), play = this.playing(); this.pane.hidden = view === 'course' && !play;
    $('#pdLib').parentNode.classList.toggle('go', view === 'lib' && !play);
    if (play) $('#pdTick').textContent = !$('#tr-sess').hidden ? 'Sing or whistle the notes as they reach the line.' : !$('#tr-res').hidden ? 'Your results.' : $('#o-range').classList.contains('on') ? 'Sing or whistle your lowest note, then your highest.' : $('#o-ear').classList.contains('on') ? 'Listen, then pick your answer.' : 'Play the keys shown.';
    else if (view !== 'course') $('#pdTick').textContent = view === 'ex' ? 'Pick an exercise to start it. PREV and NEXT scroll.' : 'Search the library. PREV and NEXT scroll.';
  },
  tick(t) { this.raf = 0; if (!this.visible()) return; this.ts = t; this.draw(); this.raf = requestAnimationFrame(t2 => this.tick(t2)); },
  /* ---- pixel helpers ---- */
  R(x, y, w, h, c) { this.g.fillStyle = c; this.g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); },
  T(s, x, y, sz, c, al, glow) { const g = this.g; if (sz === 8) sz = 12; g.font = sz + 'px Silkscreen'; g.textAlign = al || 'left'; g.textBaseline = 'alphabetic'; if (glow) { g.shadowColor = glow; g.shadowBlur = 8; } g.fillStyle = c; g.fillText(s, Math.round(x), Math.round(y)); g.shadowBlur = 0; },
  box(x, y, w, h, fill, line, th = 3) { this.R(x - th, y - th, w + 2 * th, h + 2 * th, line); this.R(x, y, w, h, fill); },
  /* stars are pixel art, drawn from a 9 x 9 sprite at a whole-number scale, so no edge is ever diagonal or blurred */
  STAR: ['....X....', '....X....', '...XXX...', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '..XXXXX..', '.XXX.XXX.', '.XX...XX.'],
  ICON: { play: ['X......', 'XXX....', 'XXXXX..', 'XXXXXXX', 'XXXXX..', 'XXX....', 'X......'], left: ['......X', '....XXX', '..XXXXX', 'XXXXXXX', '..XXXXX', '....XXX', '......X'] },
  starImg(k, on, C) {
    const key = [k, on, C.acc, C.on, C.dim, C.off].join('|'); this.cache = this.cache || {}; if (this.cache[key]) return this.cache[key];
    const n = 9 * k + 2 * k, cv = document.createElement('canvas'); cv.width = cv.height = n; const g = cv.getContext('2d'), put = (dx, dy, c) => { g.fillStyle = c; this.STAR.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === 'X') g.fillRect(k + dx + i * k, k + dy + j * k, k, k); })); };
    [[-k, 0], [k, 0], [0, -k], [0, k]].forEach(d => put(d[0], d[1], on ? C.on : C.dim)); put(0, 0, on ? C.acc : C.off); return (this.cache[key] = cv);
  },
  star(cx, cy, r, on, C) { const k = Math.max(1, Math.round(r / 4)), n = 11 * k; this.g.drawImage(this.starImg(k, on, C), Math.round(cx - n / 2), Math.round(cy - n / 2)); },
  icon(name, x, y, k, c) { this.ICON[name].forEach((row, j) => [...row].forEach((ch, i) => { if (ch === 'X') this.R(x + i * k, y + j * k, k, k, c); })); },
  /* text with a pixel star after it, right aligned */
  starText(txt, xr, y, C) { this.T(txt, xr - 24, y, 16, C.acc, 'right'); this.g.drawImage(this.starImg(2, true, C), Math.round(xr - 22), Math.round(y - 15)); },
  blink(p = 500) { return Math.floor(this.ts / p) % 2 === 0; },
  wrap(s, n) { const w = String(s).split(' '), o = []; let l = ''; w.forEach(x => { if ((l + ' ' + x).trim().length > n) { o.push(l); l = x; } else l = (l + ' ' + x).trim(); }); o.push(l); return o; },
  colours() { const cs = getComputedStyle(this.dev), v = n => cs.getPropertyValue(n).trim() || '#000'; this.C = { bg: v('--lcd-bg'), off: v('--lcd-off'), fg: v('--lcd-fg'), lab: v('--lcd-lab'), dim: v('--lcd-dim'), on: v('--lcd-on'), good: v('--lamp-g'), bad: v('--lamp-r'), acc: v('--clay'), sh: v('--lcd-sh') }; },
  btn(x, y, w, h, fn) { this.hits.push({ x, y, w, h, fn }); },
  pbtn(label, x, y, w, h, fn, c) {
    const C = this.C, g = this.g; this.box(x, y, w, h, c || C.fg, C.on, 3); this.R(x, y, w, 4, 'rgba(255,255,255,.3)');
    const lead = label.startsWith('▶ '), trail = label.endsWith(' ▶'), txt = label.replace(/^[▶↻] /, '').replace(/ ▶$/, ''); g.font = '16px Silkscreen'; const tw = Math.ceil(g.measureText(txt).width), iw = 22, total = tw + (lead || trail ? iw : 0), x0 = Math.round(x + w / 2 - total / 2), ty = y + h / 2 + 7, iy = Math.round(y + h / 2 - 7);
    if (lead) { this.icon('play', x0, iy, 2, C.on); this.T(txt, x0 + iw, ty, 16, C.on, 'left'); } else if (trail) { this.T(txt, x0, ty, 16, C.on, 'left'); this.icon('play', x0 + tw + 8, iy, 2, C.on); } else this.T(txt, x + w / 2, ty, 16, C.on, 'center');
    this.btn(x, y, w, h, fn);
  },
  /* ---- the map: the levels of one unit on a winding road, and a panel for the level you have picked ---- */
  draw() {
    if (!this.g || this.dev.hidden || (this.pane && !this.pane.hidden)) return; this.colours(); this.hits.length = 0; const { g, W, H, C } = this, kind = this.mode(), a = this.api(kind);
    this.R(0, 0, W, H, C.bg); if (this.state === 'result' && this.res && this.res.kind === kind) return this.drawResult();
    const cur = this.current(a), units = a.units, pick = this.unitPick[kind], ui = pick != null ? pick : units.findIndex(u => u.levels.some(l => l.id === cur.id)), unit = units[clamp(ui, 0, units.length - 1)];
    const front = a.next().id, nar = this.narrow, sh = this.short, passed = l => a.P[l.id] && a.P[l.id].stars >= 1;
    // header
    this.R(0, 0, W, 40, C.sh); this.R(0, 40, W, 3, C.dim);
    const title = this.NAMES[kind] + ' · ' + unit.title.toUpperCase(); this.T(title.length > (nar ? 20 : 34) ? title.slice(0, nar ? 19 : 33) + '..' : title, 16, 28, 16, C.fg, 'left', C.fg);
    const arrow = (txt, x, dx) => { this.icon(txt, x - 7, 14, 2, ui + dx >= 0 && ui + dx < units.length ? C.acc : C.dim); this.btn(x - 14, 4, 28, 34, () => { const n = clamp(ui + dx, 0, units.length - 1); this.unitPick[kind] = n; const l = units[n].levels[0]; this.sel[kind] = l.id; }); };
    arrow('left', W - (nar ? 62 : 78), -1); this.T((ui + 1) + '/' + units.length, W - (nar ? 36 : 46), 28, 8, C.lab, 'center'); arrow('play', W - 18, 1);
    // the strip: one segment per level of the unit
    const n = unit.levels.length, sw = (W - (nar ? 28 : 36)) / n; this.R(nar ? 14 : 16, 50, W - (nar ? 28 : 36), 8, C.off); unit.levels.forEach((l, i) => { const p = a.P[l.id]; this.R((nar ? 16 : 18) + i * sw, 52, sw - 3, 4, p && p.stars ? (p.stars === 3 ? C.acc : C.fg) : (a.unlocked(l.id) ? C.dim : C.sh)); });
    const cols = sh ? Math.ceil(n / 2) : 4, dxs = sh && cols > 1 ? Math.min(100, (W - 224 - 64) / (cols - 1)) : 0, pos = i => { const row = Math.floor(i / cols), col = i % cols, c = row % 2 ? cols - 1 - col : col; if (sh) return { x: 40 + c * dxs, y: 80 + row * Math.min(72, H - 80 - 46) }; return nar ? { x: 52 + c * 88, y: 110 + row * 96 } : { x: 64 + c * Math.max(112, (W - 262 - 128) / 3), y: 128 + row * 110 }; };
    for (let i = 0; i < n - 1; i++) { const p = pos(i), q = pos(i + 1), walked = passed(unit.levels[i]), k = nar ? 12 : 14; for (let j = 0; j <= k; j++) { const x = p.x + (q.x - p.x) * j / k, y = p.y + (q.y - p.y) * j / k; this.R(x - 3, y - 3, 6, 6, walked ? C.fg : C.off); if (walked) this.R(x - 1, y - 1, 2, 2, C.on); } }
    unit.levels.forEach((l, i) => {
      const { x, y } = pos(i), open = a.unlocked(l.id), P = a.P[l.id], done = !!(P && P.stars >= 1), boss = i === n - 1 && n >= 3, sz = nar ? (boss ? 54 : 46) : sh ? (boss ? 40 : 34) : (boss ? 62 : 50), isSel = l.id === cur.id;
      this.box(x - sz / 2, y - sz / 2, sz, sz, !open ? C.off : done ? (boss ? C.acc : C.fg) : C.bg, !open ? C.dim : boss ? C.acc : C.fg, 3); if (open && done) this.R(x - sz / 2, y - sz / 2, sz, 4, 'rgba(255,255,255,.35)');
      if (open) this.T(String(i + 1), x, y + (boss ? 11 : 9), 24, done ? C.on : (boss ? C.acc : C.fg), 'center', done ? null : C.fg);
      else { this.R(x - 9, y - 2, 18, 14, C.dim); this.R(x - 6, y - 12, 3, 10, C.dim); this.R(x + 3, y - 12, 3, 10, C.dim); this.R(x - 6, y - 14, 12, 3, C.dim); }
      if (boss) { const c = open ? C.acc : C.dim, cy = y - sz / 2 - 4; this.R(x - 14, cy - 6, 28, 6, c); this.R(x - 14, cy - 14, 6, 8, c); this.R(x - 3, cy - 20, 6, 14, c); this.R(x + 10, cy - 14, 6, 8, c); }
      if (P) { this.R(x - 34, y + sz / 2 + 11, 68, 22, C.bg); for (let k = 0; k < 3; k++) this.star(x - 22 + k * 22, y + sz / 2 + 22, 8, k < P.stars, C); }
      else if (open && this.blink(700)) this.T('NEW', x, y + sz / 2 + 26, 8, C.acc, 'center');
      if (isSel) { const o = 5, c = this.blink(350) ? C.acc : C.fg, e = sz + 2 * o, x0 = x - sz / 2 - o, y0 = y - sz / 2 - o; this.R(x0 - 3, y0 - 3, e + 6, 3, c); this.R(x0 - 3, y0 + e, e + 6, 3, c); this.R(x0 - 3, y0, 3, e, c); this.R(x0 + e, y0, 3, e, c); }
      if (l.id === front && unit.levels.some(u => u.id === front)) { const bob = Math.round(Math.sin(this.ts / 260) * 3); this.sprite(x + sz / 2 - 6, y - sz / 2 - (sh ? 24 : 30) + bob, sh ? 4 : 5, C.good, C.on); }
      this.btn(x - sz / 2, y - sz / 2, sz, sz, () => { this.sel[kind] = l.id; });
    });
    this.info(a, cur, unit);
    $('#pdTick').textContent = a.unlocked(cur.id) ? cur.title + ': ' + cur.desc : 'Pass the level before this one to open it';
  },
  /* ---- the result screen ---- */
  ease(k) { k = Math.max(0, Math.min(1, k)); return 1 - Math.pow(1 - k, 3); },
  seg(e, a, d) { return Math.max(0, Math.min(1, (e - a) / d)); },
  burst(x, y, n, c) { for (let i = 0; i < n; i++) this.res.sparks.push({ x, y, vx: (Math.random() - 0.5) * 340, vy: -Math.random() * 260 - 40, t: 0, c }); },
  /* the result screen on a landscape phone: banner and stars on the left, the figures and the strip in the middle, rank and the two buttons on the right */
  drawResultShort(d) {
    const { W, H, C } = this, r = d.r, pass = r.passed; if (!d.t) { d.t = this.ts; d.lt = this.ts; }
    const dt = Math.min(0.05, (this.ts - d.lt) / 1000 || 0); d.lt = this.ts; const e = this.ts - d.t, ease = k => this.ease(k), seg = (a, b) => this.seg(e, a, b);
    this.R(0, 0, W, 30, C.sh); this.R(0, 30, W, 3, C.dim); this.T(d.lv.title.toUpperCase().slice(0, 40), 12, 22, 16, C.fg, 'left', C.fg);
    const word = !pass ? 'TRY AGAIN' : d.last ? 'UNIT COMPLETE!' : d.rank === 'S' ? 'PERFECT!' : r.stars === 3 ? 'EXCELLENT!' : 'LEVEL CLEAR!', bc = pass ? C.acc : C.bad;
    this.T(word, 14, 64, Math.round(40 - 10 * ease(seg(0, 380))), bc, 'left', bc);
    for (let k = 0; k < 3; k++) { const pk = seg(600 + k * 420, 260), on = k < r.stars, x = 30 + k * 46, y = 92; this.star(x, y, 12 * (pk > 0 ? 1 + Math.sin(pk * Math.PI) * 0.4 : 1), on && pk > 0, C); if (on && pk > 0 && !d.fired['s' + k]) { d.fired['s' + k] = 1; this.burst(x, y, 10, C.acc); } }
    const ck = ease(seg(1900, 800)); d.rows.forEach((row, i) => { const y = 124 + i * 18, v = /^\d+$/.test(row[1]) ? String(Math.round(+row[1] * ck)) : row[1]; this.T(row[0], 14, y, 12, C.lab); this.T(v, 120, y, 16, C.fg, 'left', C.fg); });
    const sx = 200, sw = W - 200 - 128, sy = 100, sh = 36, n = d.strip.length, bw = n ? Math.min(14, (sw - 2 * (n - 1)) / n) : 0, sk = ease(seg(2000, 700)); this.T(d.stripLabel, sx, sy - 5, 12, C.lab); this.R(sx, sy, sw, sh, C.off); d.strip.forEach((v, i) => { const bh = Math.max(3, sh * v * sk); this.R(sx + i * (bw + 2), sy + sh - bh, bw, bh, v >= 0.7 ? C.good : v >= 0.4 ? C.fg : C.bad); });
    const xk = seg(3300, 900), per = (d.before % 8) / 8, nb = (d.after % 8) / 8, f = d.lvUp ? (xk < 0.6 ? per + (1 - per) * ease(xk / 0.6) : nb * ease((xk - 0.6) / 0.4)) : per + (nb - per) * ease(xk), by = sy + sh + 14;
    this.T('LV ' + String(1 + Math.floor((d.lvUp && xk >= 0.6 ? d.after : d.before) / 8)).padStart(2, '0'), sx, by + 9, 12, C.fg); this.R(sx + 44, by, sw - 120, 10, C.off); this.R(sx + 44, by, (sw - 120) * Math.min(1, f), 10, C.fg); this.starText(r.gain ? '+' + r.gain : 'NO NEW', sx + sw, by + 12, C);
    const rk = seg(2900, 260), rx = W - 112, ry = 38; this.box(rx, ry, 92, 66, rk > 0 ? C.sh : C.off, rk > 0 ? C.acc : C.dim, 3); if (rk > 0) { const z = Math.round(44 + (1 - ease(rk)) * 30); this.T(d.rank, rx + 46, ry + 33 + z / 3.4, z, d.rank === 'S' ? C.acc : d.rank === 'A' ? C.good : C.fg, 'center'); if (!d.fired.rk) { d.fired.rk = 1; this.burst(rx + 46, ry + 33, 12, C.fg); } }
    d.sparks.forEach(q => { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 560 * dt; this.R(q.x, q.y, 4, 4, q.c); }); d.sparks = d.sparks.filter(q => q.t < 0.7);
    if (e > 2800) { const nextOk = pass && r.nxt; this.pbtn('REPEAT', 12, H - 40, 120, 30, () => d.a.start(d.id), pass ? C.lab : C.acc); if (nextOk) this.pbtn('NEXT ▶', 142, H - 40, 120, 30, () => d.a.start(r.nxt.id), this.blink(500) ? C.acc : C.fg); if (d.details) this.pbtn('INFO', W - 112, H - 40, 92, 30, d.details, C.lab); }
    else if (this.blink(500)) this.T('PRESS START TO SKIP', W - 12, H - 10, 8, C.dim, 'right');
    $('#pdTick').textContent = pass ? (r.opened ? 'Unlocked: ' + r.opened.title : r.stars === 3 ? 'Three stars! Rank ' + d.rank : 'Cleared. Go for more stars?') : 'Almost there. Try again';
  },
  drawResult() {
    const d = this.res, { W, H, C } = this, nar = this.narrow, r = d.r, pass = r.passed; if (!d.t) { d.t = this.ts; d.lt = this.ts; }
    if (this.short) return this.drawResultShort(d);
    const dt = Math.min(0.05, (this.ts - d.lt) / 1000 || 0); d.lt = this.ts; const e = this.ts - d.t, ease = k => this.ease(k), seg = (a, b) => this.seg(e, a, b), suf = d.a.suffix;
    this.R(0, 0, W, 40, C.sh); this.R(0, 40, W, 3, C.dim); this.T(d.lv.title.toUpperCase().slice(0, nar ? 19 : 32), 16, 28, 16, C.fg, 'left', C.fg);
    const word = !pass ? 'TRY AGAIN' : d.last ? (nar ? 'UNIT CLEAR!' : 'UNIT COMPLETE!') : d.rank === 'S' ? 'PERFECT!' : r.stars === 3 ? 'EXCELLENT!' : 'LEVEL CLEAR!', bc = pass ? C.acc : C.bad, bk = ease(seg(0, 380));
    this.T(word, W / 2, nar ? 92 : 98, Math.round((nar ? 44 : 88) - (nar ? 12 : 48) * bk), bc, 'center', bc);
    if (d.last && bk >= 1 && !nar) [W / 2 - 200, W / 2 + 200].forEach(cx => { this.R(cx - 16, 60, 32, 6, C.acc); this.R(cx - 16, 52, 6, 8, C.acc); this.R(cx - 3, 46, 6, 14, C.acc); this.R(cx + 10, 52, 6, 8, C.acc); });
    if (pass && r.improved && !r.first && e > 900 && this.blink(260)) { this.box(W / 2 - 52, nar ? 102 : 110, 104, 20, C.acc, C.on, 2); this.T('NEW BEST!', W / 2, nar ? 117 : 125, 8, C.on, 'center'); }
    for (let k = 0; k < 3; k++) { const pk = seg(600 + k * 420, 260), on = k < r.stars, x = nar ? W / 2 - 84 + k * 84 : 150 + k * 92, y = nar ? 156 : 170, rr = (k === 1 ? (nar ? 26 : 30) : (nar ? 20 : 24)) * (pk > 0 ? 1 + Math.sin(pk * Math.PI) * 0.45 : 1); this.star(x, y, rr, on && pk > 0, C); if (on && pk > 0 && !d.fired['s' + k]) { d.fired['s' + k] = 1; this.burst(x, y, 12, C.acc); } }
    const ck = ease(seg(1900, 800)), L = nar ? { x: 20, y: 210, dy: 38 } : { x: 40, y: 222, dy: 38 };
    d.rows.forEach((row, i) => { const y = L.y + i * L.dy, v = /^\d+$/.test(row[1]) ? String(Math.round(+row[1] * ck)).padStart(row[0] === 'SCORE' ? 3 : 1, '0') : row[1]; this.T(row[0], L.x, y, 8, C.lab); this.T(v, L.x, y + 20, 16, C.fg, 'left', C.fg); });
    // the strip: one bar for each note, step or question
    const dx = nar ? 0 : W - 750, sx = nar ? 20 : 310 + Math.round(dx / 2), sy = nar ? 322 : 236, sw = nar ? 320 : 230 + Math.round(dx / 2), sh = nar ? 38 : 62, n = d.strip.length, bw = n ? Math.min(18, (sw - 2 * (n - 1)) / n) : 0, sk = ease(seg(2000, 700));
    this.T(d.stripLabel, sx, sy - 6, 8, C.lab); this.R(sx, sy, sw, sh, C.off); d.strip.forEach((v, i) => { const bh = Math.max(3, sh * v * sk); this.R(sx + i * (bw + 2), sy + sh - bh, bw, bh, v >= 0.7 ? C.good : v >= 0.4 ? C.fg : C.bad); });
    const rk = seg(2900, 260), rx = nar ? W - 134 : 570 + dx, ry = nar ? 212 : 158, rw = nar ? 100 : 120, rh = nar ? 92 : 110; this.T('RANK', rx + rw / 2, ry - 8, 8, C.lab, 'center'); this.box(rx, ry, rw, rh, rk > 0 ? C.sh : C.off, rk > 0 ? C.acc : C.dim, 3);
    if (rk > 0) { const z = Math.round((nar ? 60 : 72) + (1 - ease(rk)) * 50); this.T(d.rank, rx + rw / 2, ry + rh / 2 + z / 3.4, z, d.rank === 'S' ? C.acc : d.rank === 'A' ? C.good : C.fg, 'center', d.rank === 'S' ? C.acc : null); if (!d.fired.rk) { d.fired.rk = 1; this.burst(rx + rw / 2, ry + rh / 2, d.rank === 'S' || d.rank === 'A' ? 18 : 8, C.fg); } }
    // player level: the bar moves by the stars this run added
    const xk = seg(3300, 900), per = (d.before % 8) / 8, nb = (d.after % 8) / 8, lv0 = 1 + Math.floor(d.before / 8), by = nar ? 396 : 342; let f = d.lvUp ? (xk < 0.6 ? per + (1 - per) * ease(xk / 0.6) : nb * ease((xk - 0.6) / 0.4)) : per + (nb - per) * ease(xk);
    const bx = nar ? 86 : 120, bwid = nar ? 150 : 420 + dx; this.T('LV ' + String(d.lvUp && xk >= 0.6 ? lv0 + 1 : lv0).padStart(2, '0'), nar ? 20 : 40, by, 16, C.fg); this.R(bx, by - 14, bwid, 16, C.off); this.R(bx, by - 14, bwid * Math.min(1, f), 16, C.fg); this.R(bx, by - 14, bwid * Math.min(1, f), 3, 'rgba(255,255,255,.35)');
    this.starText(r.gain ? '+' + r.gain : 'NO NEW', W - (nar ? 16 : 40), by, C);
    if (d.lvUp && xk >= 0.6) { if (!d.fired.lv) { d.fired.lv = 1; this.burst(bx + bwid / 2, by - 6, 22, C.acc); } if (this.blink(220)) this.T('LEVEL UP!', bx + bwid / 2, by - 22, 16, C.acc, 'center', C.acc); }
    if (e > 3900) { const y = nar ? 428 : 372, sfx = d.a.suffix;
      if (pass && r.opened) { this.T('NEW LEVEL UNLOCKED:', nar ? 20 : 40, y, 8, C.lab); this.g.font = '12px Silkscreen'; const lw = Math.ceil(this.g.measureText('NEW LEVEL UNLOCKED:').width); this.T(r.opened.title.toUpperCase().slice(0, nar ? 24 : 34), nar ? 20 : 40 + lw + 14, nar ? y + 22 : y, 16, this.blink(500) ? C.acc : C.fg); }
      else if (!pass) this.T('NEED ' + d.thr[0] + sfx + ' TO PASS', nar ? 20 : 40, y, 12, C.lab); else this.T(r.nxt ? 'REPLAYED · BEST STARS KEPT' : 'THAT WAS THE LAST LEVEL', nar ? 20 : 40, y, 8, C.dim); }
    d.sparks.forEach(q => { q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 560 * dt; this.R(q.x, q.y, 4, 4, q.c); }); d.sparks = d.sparks.filter(q => q.t < 0.7);
    if (e > 2800) { const y = nar ? 484 : 388, hh = nar ? 42 : 42, nextOk = pass && r.nxt, det = d.details;
      const go = () => { this.state = 'result'; };
      if (nar) { this.pbtn('AGAIN', 14, y, 104, hh, () => d.a.start(d.id), pass ? C.lab : C.acc); if (nextOk) this.pbtn('NEXT ▶', 126, y, 130, hh, () => d.a.start(r.nxt.id), this.blink(500) ? C.acc : C.fg); else { this.box(126, y, 130, hh, C.off, C.dim, 3); this.T(pass ? 'LAST' : '1★ NEEDED', 191, y + 28, 16, C.dim, 'center'); } if (det) this.pbtn('INFO', 264, y, 82, hh, det, C.lab); }
      else { const w1 = det ? 190 : 300, w2 = (det ? 260 : 340) + dx; this.pbtn('REPEAT', 40, y, w1, hh, () => d.a.start(d.id), pass ? C.lab : C.acc); if (nextOk) this.pbtn('NEXT LEVEL ▶', 40 + w1 + 14, y, w2, hh, () => d.a.start(r.nxt.id), this.blink(500) ? C.acc : C.fg); else { this.box(40 + w1 + 14, y, w2, hh, C.off, C.dim, 3); this.T(pass ? 'LAST LEVEL' : 'NEED 1 STAR TO CONTINUE', 40 + w1 + 14 + w2 / 2, y + 29, 16, C.dim, 'center'); } if (det) this.pbtn('DETAILS', 40 + w1 + w2 + 28, y, 710 + dx - (40 + w1 + w2 + 28), hh, det, C.lab); }
    } else if (this.blink(500)) this.T('PRESS START TO SKIP', W - 12, H - 10, 8, C.dim, 'right');
    $('#pdTick').textContent = pass ? (d.last ? 'Unit complete! A new area is open' : r.stars === 3 ? 'Three stars! Rank ' + d.rank : 'Cleared. Go for more stars?') : 'Almost there. Try again';
  },
  sprite(x, y, k, c, e) { ['.XXX.', 'XXXXX', 'X.X.X', 'XXXXX', 'X.X.X'].forEach((r, j) => [...r].forEach((ch, i) => { if (ch === 'X') this.R(x + i * k, y + j * k, k, k, c); else if (j === 2 && (i === 1 || i === 3)) this.R(x + i * k, y + j * k, k, k, e); })); },
  /* the same panel on a landscape phone: name, a line or two about it, stars, START */
  infoShort(a, l, x, y, w, h, P, open, done) {
    const C = this.C, t = this.wrap(l.title.toUpperCase(), 14); t.slice(0, 2).forEach((q, i) => this.T(q, x + 12, y + 46 + i * 18, 16, open ? C.fg : C.dim, 'left', open ? C.fg : null));
    const gy = y + 46 + Math.min(2, t.length) * 18 + 14; this.wrap(l.desc.toUpperCase(), 20).slice(0, Math.max(1, Math.floor((h - 118 - (Math.min(2, t.length) - 1) * 18) / 14))).forEach((q, i) => this.T(q, x + 12, gy + i * 14, 12, C.lab));
    const sy = y + h - 52; for (let k = 0; k < 3; k++) this.star((x + 24) + k * 26, sy, 8, k < (P ? P.stars : 0), C); if (P) this.T('BEST ' + a.best(P), x + w - 12, sy + 6, 12, C.fg, 'right');
    if (open) this.pbtn(done ? 'PLAY AGAIN' : '▶ START', x + 10, y + h - 36, w - 20, 26, () => this.start(), this.blink(600) ? C.acc : C.fg); else this.T('PASS THE LEVEL BEFORE FIRST', x + 10, y + h - 14, 8, C.dim);
  },
  /* the panel for the level you picked: name, what it is, your stars, what earns them, and START */
  info(a, l, unit) {
    const { W, H, C } = this, nar = this.narrow, P = a.P[l.id], open = a.unlocked(l.id), done = !!(P && P.stars >= 1), idx = unit.levels.indexOf(l), boss = idx === unit.levels.length - 1 && unit.levels.length >= 3;
    const sh = this.short, x = nar ? 10 : sh ? W - 208 : W - 242, y = nar ? 372 : sh ? 46 : 50, w = nar ? 340 : sh ? 198 : 222, h = nar ? 160 : sh ? H - 54 : 376; this.box(x, y, w, h, C.sh, C.dim, 3);
    const tag = boss ? 'FINALE' : done ? 'CLEARED' : open ? (P ? 'TRY AGAIN' : 'NEW') : 'LOCKED'; this.box(x + w - 92, y + 8, 80, 24, boss ? C.acc : done ? C.fg : C.off, boss ? C.acc : C.dim, 2); this.T(tag, x + w - 52, y + 25, 8, boss || done ? C.on : C.dim, 'center');
    this.T('LEVEL ' + (idx + 1) + ' OF ' + unit.levels.length, x + 12, y + 24, 8, C.lab);
    if (sh) return this.infoShort(a, l, x, y, w, h, P, open, done);
    let big, sz, step, gy;
    if (nar) { const t = l.title.toUpperCase(); big = [t.length > 22 ? t.slice(0, 21) + '..' : t]; sz = 16; step = 20; this.T(big[0], x + 12, y + 50, sz, open ? C.fg : C.dim, 'left', open ? C.fg : null); this.wrap(l.desc.toUpperCase(), 36).slice(0, 2).forEach((t2, i) => this.T(t2, x + 12, y + 70 + i * 15, 12, C.lab)); gy = y + 100; }
    else { big = this.wrap(l.title.toUpperCase(), 11); sz = 24; step = 26; if (big.length > 2) { big = this.wrap(l.title.toUpperCase(), 15); sz = 16; step = 20; }
      big.slice(0, 3).forEach((t, i) => this.T(t, x + 12, y + 56 + i * step, sz, open ? C.fg : C.dim, 'left', open ? C.fg : null)); gy = y + 56 + Math.min(3, big.length) * step + 6;
      this.R(x + 14, gy - 2, w - 28, 3, C.dim); this.wrap(l.desc.toUpperCase(), 17).slice(0, 5).forEach((t, i) => this.T(t, x + 14, gy + 22 + i * 18, 12, C.fg)); }
    const sy = nar ? y + 106 : y + h - 138, sx = x + (nar ? 28 : 32);
    for (let k = 0; k < 3; k++) this.star(sx + k * (nar ? 28 : 30), sy, nar ? 9 : 11, k < (P ? P.stars : 0), C);
    if (P) this.T('BEST ' + a.best(P), x + w - 14, sy + 6, 16, C.fg, 'right');
    if (!nar) a.thr.forEach((t, k) => { const on = (P ? P.stars : 0) > k; this.R(x + 14 + k * 66, sy + 28, 60, 16, on ? C.fg : C.off); for (let q = 0; q <= k; q++) this.g.drawImage(this.starImg(1, on, { acc: on ? C.on : C.dim, on: on ? C.fg : C.off, dim: C.off, off: C.off }), Math.round(x + 14 + k * 66 + 30 - ((k + 1) * 12) / 2 + q * 12), sy + 29); this.T(t + a.suffix, x + 14 + k * 66 + 30, sy + 60, 8, on ? C.lab : C.dim, 'center'); });
    if (open) this.pbtn(done ? 'PLAY AGAIN' : '▶ START', x + 12, y + h - (nar ? 38 : 46), w - 24, nar ? 28 : 34, () => this.start(), this.blink(600) ? C.acc : C.fg); else this.T('PASS THE LEVEL BEFORE FIRST', x + 12, y + h - 18, 8, C.dim);
  }
};
