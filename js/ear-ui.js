"use strict";
/* ---- Ear training in Practice: the level map, and the drill screen. The curriculum and the question maker are in core/ear.js. ---- */
const Ear = {
  on: false, lv: null, q: null, prev: null, n: 0, qi: 0, ok: 0, tap: [], locked: false, hs: [], timer: 0, done: false,
  prog() { const s = Store.data; if (!s.ear) s.ear = { levels: {} }; return s.ear.levels; },
  /* ---- the level map in the Practice tab ---- */
  renderMap() {
    const host = $('#earMap'); if (!host) return; const P = this.prog(); host.textContent = '';
    const total = EAR.LEVELS.length, passed = EAR.LEVELS.filter(l => P[l.id] && P[l.id].stars >= 1).length, stars = EAR.LEVELS.reduce((a, l) => a + (P[l.id] ? P[l.id].stars : 0), 0), nxt = EAR.next(P);
    const head = document.createElement('div'); head.className = 'card earhead';
    head.innerHTML = '<div class="muted small">Listen, then answer. Score 80% on a level to open the next one; 90% earns a second star and 100% a third. Headphones help.</div>';
    const st = document.createElement('div'); st.className = 'earstats'; st.innerHTML = '<span><b>' + passed + ' / ' + total + '</b>levels passed</span><span><b>' + stars + ' / ' + total * 3 + '</b>stars</span>'; head.appendChild(st);
    const go = document.createElement('button'); go.className = 'btn primary'; go.style.marginTop = '0.5rem'; go.textContent = passed ? 'Continue: ' + nxt.title : 'Start: ' + nxt.title; go.onclick = () => this.open(nxt.id); head.appendChild(go); host.appendChild(head);
    EAR.UNITS.forEach(u => {
      const sec = document.createElement('details'); sec.className = 'fold earunit'; sec.dataset.k = 'ear-' + u.id; const done = u.levels.filter(l => P[l.id] && P[l.id].stars >= 1).length;
      const open = u.levels.some(l => l.id === nxt.id); if (open) sec.open = true;
      const sm = document.createElement('summary'); sm.innerHTML = '<span></span><i></i>'; sm.children[0].textContent = u.title; sm.children[1].textContent = done + ' / ' + u.levels.length; sec.appendChild(sm);
      const bl = document.createElement('div'); bl.className = 'muted small earblurb'; bl.textContent = u.blurb; sec.appendChild(bl);
      u.levels.forEach((l, i) => {
        const ok = EAR.unlocked(P, l.id), p = P[l.id], b = document.createElement('button'); b.className = 'card earlvl' + (ok ? '' : ' locked') + (l.id === nxt.id ? ' next' : ''); b.disabled = !ok;
        b.innerHTML = '<span class="num"></span><span class="txt"><span class="t"></span><span class="muted small"></span></span><span class="stars"></span>';
        b.querySelector('.num').textContent = ok ? (i + 1) : '🔒'; b.querySelector('.t').textContent = l.title; b.querySelector('.muted').textContent = l.desc;
        b.querySelector('.stars').textContent = p ? '★'.repeat(p.stars) + '☆'.repeat(3 - p.stars) : ok ? '☆☆☆' : '';
        b.title = ok ? (p ? 'Best ' + Math.round(p.best * 100) + '%' : 'Not tried yet') : 'Pass the level before this one to open it'; b.onclick = () => this.open(l.id); sec.appendChild(b);
      });
      host.appendChild(sec);
    });
  },
  /* ---- sound ---- */
  stop() { this.hs.forEach(h => { try { h.stop(); } catch (e) { /* already gone */ } }); this.hs = []; },
  async play(events) {
    try { await Engine.start(); } catch (e) { /* the browser may need a tap first */ }
    if (!Engine.ctx || !Engine.master) return; this.stop(); const t0 = Engine.ctx.currentTime + 0.06;
    events.forEach(e => e.n.forEach(m => { const h = Engine.playNote(m, t0 + e.t, e.d, { gain: e.n.length > 3 ? 0.13 : e.n.length > 1 ? 0.17 : 0.24 }); if (h) this.hs.push(h); }));
  },
  /* ---- a drill ---- */
  open(id) {
    const lv = EAR.level(id); if (!lv || !EAR.unlocked(this.prog(), id)) return; this.lv = lv;
    this.on = true; this.n = this.lv.n; this.qi = 0; this.ok = 0; this.prev = null; this.done = false; $('#o-ear').classList.add('on'); $('#earRes').hidden = true; $('#earBody').hidden = false;
    $('#earTitle').textContent = EAR.unitOf(this.lv).title + ' · ' + this.lv.title; this.ask();
  },
  close() { this.on = false; clearTimeout(this.timer); this.stop(); $('#o-ear').classList.remove('on'); this.renderMap(); },
  ask() {
    clearTimeout(this.timer); this.q = EAR.make(this.lv, Math.random, this.prev); this.prev = this.q; this.tap = []; this.locked = false;
    $('#earStep').textContent = (this.qi + 1) + ' / ' + this.n + ' · ' + this.ok + ' right'; $('#earBar').style.width = (this.qi / this.n * 100) + '%';
    $('#earPrompt').textContent = this.q.prompt; $('#earSub').textContent = this.q.sub; $('#earFb').textContent = ''; $('#earFb').className = 'earfb'; $('#earNext').hidden = true;
    const box = $('#earOpts'); box.textContent = ''; box.dataset.n = this.q.options.length;
    this.q.options.forEach((o, i) => { const b = document.createElement('button'); b.className = 'synbtn earopt'; b.dataset.id = o.id; b.type = 'button'; const k = document.createElement('i'); k.textContent = i < 9 ? i + 1 : ''; b.appendChild(k); b.appendChild(document.createTextNode(o.label)); b.onclick = () => this.pick(o.id); box.appendChild(b); });
    const mel = $('#earMel'); mel.hidden = !this.q.seq; this.paintMel(); this.play(this.q.events);
  },
  paintMel() {
    const q = this.q; if (!q || !q.seq) return; const row = $('#earMelRow'); row.textContent = '';
    for (let i = 0; i < q.seq.length; i++) { const s = document.createElement('span'); const id = this.tap[i]; s.textContent = id != null ? EAR.degLabel(+id) : '·'; s.className = id != null ? 'on' : ''; row.appendChild(s); }
  },
  pick(id) {
    if (this.locked || !this.on) return; const q = this.q;
    if (q.seq) { this.tap.push(id); this.paintMel(); this.flash(id); if (this.tap.length < q.seq.length) return; return this.verdict(this.tap.every((x, i) => x === q.seq[i])); }
    this.verdict(id === q.answer, id);
  },
  flash(id) { const b = $('#earOpts').querySelector('[data-id="' + id + '"]'); if (b) { b.classList.add('tap'); setTimeout(() => b.classList.remove('tap'), 160); } },
  back() { if (this.locked || !this.q || !this.q.seq || !this.tap.length) return; this.tap.pop(); this.paintMel(); },
  verdict(good, chosen) {
    this.locked = true; const q = this.q, fb = $('#earFb');
    $$('#earOpts .earopt').forEach(b => { if (q.answer != null) { if (b.dataset.id === q.answer) b.classList.add('ok'); else if (b.dataset.id === chosen) b.classList.add('bad'); } b.disabled = true; });
    if (good) this.ok++;
    fb.className = 'earfb ' + (good ? 'good' : 'miss'); fb.textContent = (good ? 'Right. ' : 'Not quite. ') + q.explain;
    this.qi++; $('#earStep').textContent = Math.min(this.qi, this.n) + ' / ' + this.n + ' · ' + this.ok + ' right'; $('#earBar').style.width = (this.qi / this.n * 100) + '%';
    if (good) this.timer = setTimeout(() => this.advance(), q.seq ? 1400 : 1000);
    else { $('#earNext').hidden = false; $('#earNext').textContent = this.qi >= this.n ? 'Results ▶' : 'Next ▶'; this.timer = setTimeout(() => this.play(q.events), 500); }
  },
  advance() { clearTimeout(this.timer); if (this.qi >= this.n) return this.finish(); this.ask(); },
  finish() {
    this.done = true; this.stop(); const pct = this.ok / this.n, stars = EAR.stars(pct), P = this.prog(), old = P[this.lv.id], first = !(old && old.stars >= 1), id = this.lv.id;
    P[id] = { best: Math.max(old ? old.best : 0, pct), stars: Math.max(old ? old.stars : 0, stars), tries: (old ? old.tries : 0) + 1, ts: Date.now() };
    (Store.data.earLog = Store.data.earLog || []).push({ ts: Date.now(), lvl: id, ok: this.ok, n: this.n }); Store.save();
    const nxt = EAR.LEVELS[this.lv.i + 1], passed = stars >= 1, res = $('#earRes'); $('#earBody').hidden = true; res.hidden = false; res.textContent = '';
    const msg = passed ? (stars === 3 ? 'Perfect.' : stars === 2 ? 'Very good.' : 'Passed.') : 'Not yet. 80% opens the next level.';
    res.innerHTML = '<div class="earscore"></div><div class="earstar"></div><div class="big earmsg"></div><div class="muted earnote"></div><div class="row earbtns"></div>';
    res.querySelector('.earscore').textContent = Math.round(pct * 100) + '%'; res.querySelector('.earstar').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars); res.querySelector('.earmsg').textContent = msg;
    res.querySelector('.earnote').textContent = this.ok + ' of ' + this.n + ' right.' + (passed && first && nxt ? ' Opened: ' + nxt.title + '.' : '');
    const btns = res.querySelector('.earbtns'), add = (t, f, cls) => { const b = document.createElement('button'); b.className = 'btn' + (cls ? ' ' + cls : ''); b.textContent = t; b.onclick = f; btns.appendChild(b); };
    if (passed && nxt) add('Next level ▶', () => this.open(nxt.id), 'primary'); add('Try again', () => this.open(id), passed && nxt ? '' : 'primary'); add('Level map', () => this.close());
  },
  key(e) {
    if (!this.on || /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Escape') { e.preventDefault(); return this.close(); }
    if (this.done) return; const d = /^(Digit|Numpad)(\d)$/.exec(e.code);
    if (d && +d[2] >= 1) { const b = $$('#earOpts .earopt')[+d[2] - 1]; if (b && !b.disabled) { e.preventDefault(); b.click(); } return; }
    if (e.code === 'Backspace') { e.preventDefault(); return this.back(); }
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!$('#earNext').hidden) this.advance(); else if (!this.locked) this.play(this.q.events); }
  },
  init() {
    $('#earClose').onclick = () => this.close(); $('#earPlay').onclick = () => { if (this.q) this.play(this.q.events); }; $('#earNext').onclick = () => this.advance(); $('#earBack').onclick = () => this.back();
    document.addEventListener('keydown', e => this.key(e));
  }
};
