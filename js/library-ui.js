"use strict";
/* ---- Library screen ---- */
const Lib = {
  f: { q: '', kind: 'all', level: 0, cat: '', fav: false }, items: null, secs: {},
  all() { return this.items || (this.items = libraryItems()); },
  favs() { return Store.data.settings.favs || []; },
  toggleFav(id) { const st = Store.data.settings, a = st.favs = st.favs || [], i = a.indexOf(id); if (i >= 0) a.splice(i, 1); else a.push(id); Store.save(); this.render(); },
  seconds(it) {
    const t = (Store.data.settings.tempo || 100) / 100, r = getRange(), k = it.id + '|' + r.lo + '|' + r.hi + '|' + t;
    if (this.secs[k] == null) this.secs[k] = it.kind === 'sing' ? buildExercise(it.ex, r, t).total + 8 : buildPianoSteps(it.px, 0, it.o1, it.o2).length * 3.5 + 6;
    return this.secs[k];
  },
  /* best result and how many times it was done */
  stats(it) {
    if (it.kind === 'sing') { const L = Store.data.history.filter(h => h.ex === it.ex); return { n: L.length, best: L.length ? 'Best ' + Math.max.apply(null, L.map(h => h.score)) : '' }; }
    const L = (Store.data.pianoLog || []).filter(p => p.ex === it.px && (!p.o1 || (p.o1 === it.o1 && (p.o2 || '') === (it.o2 || ''))));
    return { n: L.length, best: L.length ? 'Best ' + Math.max.apply(null, L.map(p => Math.round(100 * p.firstTry / Math.max(1, p.steps)))) + '%' : '' };
  },
  start(it) {
    if (it.kind === 'sing') { UI.show('train'); UI.lastExercise = it.ex; Session.begin(it.ex); }
    else PX.open(it.px, { o1: it.o1, o2: it.o2 });
  },
  card(it, note) {
    const d = document.createElement('div'); d.className = 'card libcard lc-' + it.kind;
    const top = document.createElement('div'); top.className = 'lc-top';
    const ico = document.createElement('span'); ico.className = 'ico'; ico.textContent = it.kind === 'sing' ? (Store.data.settings.inst === 'whistle' ? '😗' : '🎤') : '🎹';
    const nm = document.createElement('b'); nm.className = 'lc-name'; nm.textContent = it.name;
    const fav = this.favs().includes(it.id), star = document.createElement('button'); star.className = 'star'; star.textContent = fav ? '★' : '☆'; star.title = fav ? 'Remove from favourites' : 'Add to favourites'; star.onclick = () => this.toggleFav(it.id);
    top.append(ico, nm, star);
    const sec = this.seconds(it), st = this.stats(it), meta = document.createElement('div'); meta.className = 'small muted';
    meta.textContent = '●'.repeat(it.level) + '○'.repeat(3 - it.level) + ' ' + LEVELS[it.level] + ' · ' + (sec < 45 ? '< 1 min' : '~' + Math.round(sec / 60) + ' min') + ' · ' + it.cat;
    const ds = document.createElement('div'); ds.className = 'small'; ds.style.margin = '0.25rem 0'; ds.textContent = it.desc;
    d.append(top, meta, ds);
    if (note) { const n = document.createElement('div'); n.className = 'small'; n.style.cssText = 'color:var(--warn)'; n.textContent = note; d.appendChild(n); }
    const tg = document.createElement('div'); it.skills.forEach(x => { const t = document.createElement('span'); t.className = 'tag'; t.textContent = x; tg.appendChild(t); }); d.appendChild(tg);
    const row = document.createElement('div'); row.className = 'row'; row.style.cssText = 'margin-top:0.5rem;justify-content:space-between';
    const info = document.createElement('span'); info.className = 'small muted'; info.textContent = st.n ? st.best + ' · ' + st.n + 'x' : 'Not tried yet';
    const go = document.createElement('button'); go.className = 'btn primary'; go.textContent = 'Start'; go.onclick = () => this.start(it); row.append(info, go); d.appendChild(row);
    return d;
  },
  render() {
    const F = this.f, favs = this.favs(), all = this.all();
    const cat = $('#libCat'); if (!cat.options.length) { const o = document.createElement('option'); o.value = ''; o.textContent = 'All categories'; cat.appendChild(o); [...new Set(all.map(i => i.cat))].forEach(c => { const x = document.createElement('option'); x.value = c; x.textContent = c; cat.appendChild(x); }); }
    $('#libFav').textContent = (F.fav ? '★' : '☆') + ' Favourites'; $('#libFav').classList.toggle('primary', F.fav);
    const list = libraryFilter(all, { q: F.q, kind: F.kind, level: F.level, cat: F.cat, fav: F.fav, favs }), box = $('#libList'), sg = $('#libSugg'); box.textContent = ''; sg.textContent = '';
    $('#libCount').textContent = list.length + (list.length === 1 ? ' exercise' : ' exercises') + (list.length < all.length ? ' of ' + all.length : '');
    const plain = !F.q && !F.level && !F.cat && !F.fav;
    if (plain) {
      const S = Store.data, cnt = countIssues(S.coachLog, 10), seen = new Set(), sug = [];
      (F.kind === 'piano' ? [] : Object.keys(cnt)).filter(id => ISSUES[id] && cnt[id] >= 2).sort((a, b) => cnt[b] - cnt[a]).forEach(id => { const it = all.find(i => i.kind === 'sing' && i.ex === ISSUES[id][2]); if (it && !seen.has(it.id) && sug.length < 3) { seen.add(it.id); sug.push([it, 'Suggested because: ' + ISSUES[id][0].toLowerCase()]); } });
      if (sug.length) { const h = document.createElement('h2'); h.textContent = 'Suggested for you'; sg.appendChild(h); sug.forEach(x => sg.appendChild(this.card(x[0], x[1]))); }
      const rec = [], add = it => { if (it && (F.kind === 'all' || it.kind === F.kind) && !rec.includes(it) && !seen.has(it.id) && rec.length < 4) rec.push(it); };
      const ev = [].concat(S.history.map(h => ({ ts: h.ts, it: all.find(i => i.id === 's:' + h.ex) })), (S.pianoLog || []).map(p => ({ ts: p.ts, it: all.find(i => i.kind === 'piano' && i.px === p.ex && (!p.o1 || (i.o1 === p.o1 && (i.o2 || '') === (p.o2 || '')))) }))).sort((a, b) => b.ts - a.ts);
      ev.forEach(e => add(e.it));
      if (rec.length) { const h = document.createElement('h2'); h.textContent = 'Recently practised'; sg.appendChild(h); rec.forEach(it => sg.appendChild(this.card(it))); }
    }
    if (!list.length) { box.innerHTML = '<p class="muted">Nothing matches. Clear the search or filters.</p>'; return; }
    const groups = new Map();
    list.forEach(it => { const g = (it.kind === 'sing' ? (Store.data.settings.inst === 'whistle' ? '😗 ' : '🎤 ') : '🎹 ') + it.cat; if (!groups.has(g)) groups.set(g, []); groups.get(g).push(it); });
    [...groups.keys()].sort((a, b) => (a.startsWith('🎹') ? 1 : 0) - (b.startsWith('🎹') ? 1 : 0)).forEach(g => {       // singing groups first, then piano
      const f = fold(g + ' (' + groups.get(g).length + ')', 'lib:' + g, !plain); box.appendChild(f);      // a search or filter opens every group
      groups.get(g).sort((a, b) => a.level - b.level).forEach(it => f.body.appendChild(this.card(it)));
    });
  }
};
function renderPianoRecent(box, n) {
  box.textContent = ''; const L = (Store.data.pianoLog || []).slice(-n).reverse();
  L.forEach(p => { const d = PXS.find(x => x.id === p.ex), r = document.createElement('div'); r.className = 'stat'; r.innerHTML = '<span></span><b></b>'; r.children[0].textContent = new Date(p.ts).toLocaleDateString() + ' · ' + (d ? d.name : p.ex) + (p.ex !== 'ear' ? ' · ' + NOTE_NAMES[p.key] : ''); r.children[1].textContent = Math.round(100 * p.firstTry / Math.max(1, p.steps)) + '% · ' + p.mistakes + ' miss' + (p.mistakes === 1 ? '' : 'es'); box.appendChild(r); });
  if (!L.length) box.innerHTML = '<p class="muted">Nothing yet.</p>';
}
const PX = {
  on: false, def: null, steps: [], i: 0, rec: [], prev: new Set(), wrong: [], t0: 0, tStep: 0, chordAt: 0, needRelease: false, flash: new Map(), pc: 0, timer: 0, advanceAt: 0, finished: false,
  open(id, preset) {
    this.def = PXS.find(d => d.id === id); this.on = true; this.pc = 0; this.course = preset && preset.course || null;
    const st = Store.data.settings; $('#pxShow').checked = st.pxShow !== false; $('#pxAny').checked = !!st.pxAny;
    const key = $('#pxKey'); if (!key.options.length) NOTE_NAMES.forEach((n, p) => { const o = document.createElement('option'); o.value = p; o.textContent = n; key.appendChild(o); });
    const fill = (sel, list) => { sel.textContent = ''; list.forEach(x => { const o = document.createElement('option'); o.value = x[0]; o.textContent = x[1]; sel.appendChild(o); }); sel.hidden = !list.length; };
    fill($('#pxO1'), this.def.o1); fill($('#pxO2'), this.def.o2); key.value = 0;
    if (preset) { if (preset.o1) $('#pxO1').value = preset.o1; if (preset.o2) $('#pxO2').value = preset.o2; if (preset.key != null) key.value = preset.key; } key.parentNode.hidden = !!this.def.noKey;
    if (!Midi.inputCount() && st.inst !== 'piano') { setInst('piano'); toast('No keyboard connected. Play on the on-screen keys or your computer keyboard, or play a real piano and I will listen through the microphone.', 6000); }
    $('#o-pex').classList.add('on'); this.start();
  },
  close() { this.on = false; this.course = null; clearInterval(this.timer); $('#o-pex').classList.remove('on'); VKeys.releaseAll(); UI.refresh(); },
  start() {
    this.pc = +$('#pxKey').value || 0;
    this.steps = buildPianoSteps(this.def.id, this.pc, $('#pxO1').value, $('#pxO2').value);
    this.i = 0; this.rec = []; this.finished = false; this.needRelease = false; this.prev = new Set(Played.now().notes); this.t0 = performance.now();
    $('#pxRes').hidden = true; $('#pxHear').hidden = $('#pxSkip').hidden = false; $('#pxCv').hidden = false;
    $('#pxTitle').textContent = this.def.name; this.begin(); clearInterval(this.timer); this.timer = setInterval(() => this.tick(), 30);
  },
  step() { return this.steps[this.i]; },
  begin() {
    const s = this.step(); this.wrong = []; this.tStep = performance.now(); this.chordAt = 0; this.advanceAt = 0;
    $('#pxStep').textContent = (this.i + 1) + ' / ' + this.steps.length; $('#pxBarI').style.width = (this.i / this.steps.length * 100) + '%';
    const hidden = s.ear;
    $('#pxName').textContent = hidden ? (s.kind === 'chord' ? 'Find the chord' : s.given != null ? 'Find the 2nd note' : 'Find the note') : s.name;
    $('#pxSub').textContent = s.ear ? (s.kind === 'chord' ? 'Listen, then play the whole chord. Any octave is fine, but the lowest note must match.' : s.given != null ? 'The first note is ' + noteName(s.given) + '. Play the note above it that you hear.' : 'Listen, then play it.') : s.kind === 'chord' ? (s.sub || '') + (s.sub ? ' · ' : '') + s.notes.map(noteName).join(' ') : '';
    $('#pxMsg').textContent = ''; $('#pxMsg').style.color = '';
    if (s.ear) this.hear();
  },
  hear() {
    const s = this.step(); if (!s || !Engine.ctx) return;
    const t = Engine.ctx.currentTime + 0.05;
    if (s.sound) s.sound.forEach((m, k) => Engine.playNote(m, t + k * 0.9, 0.8, { gain: 0.3 }));
    else if (s.kind === 'chord') s.notes.forEach(m => Engine.playNote(m, t, 1.2, { gain: 0.18 }));
    else Engine.playNote(s.notes[0], t, 0.9, { gain: 0.3 });
  },
  good(msg) {
    const s = this.step(), now = performance.now();
    this.rec.push({ name: s.ear ? (s.given != null ? noteName(s.given) + ' → ' + s.name : s.name) : s.name, kind: s.kind, target: s.notes[0], notes: s.notes, ms: now - this.tStep, wrong: this.wrong });
    if (Engine.ctx && Engine.master) Engine.click(Engine.ctx.currentTime, 1320, 0.12);
    const extra = s.ear ? ' It was ' + s.name + (s.interval != null ? ' (' + intervalName(s.interval) + ' above ' + noteName(s.given) + ')' : '') + '.' : '';
    $('#pxMsg').textContent = '✔ ' + (msg || 'Right') + extra; $('#pxMsg').style.color = 'var(--good)'; $('#pxName').textContent = s.name;
    this.needRelease = s.kind === 'chord';
    if (s.ear) this.advanceAt = now + 1400;          // ear exercises pause to show the answer
    else this.advance();                            // otherwise move on at once, so fast playing is never missed
  },
  advance() { this.advanceAt = 0; if (++this.i >= this.steps.length) this.finish(); else this.begin(); },
  bad(played, text) {
    this.wrong.push({ played }); played.forEach(m => this.flash.set(m, performance.now()));
    $('#pxMsg').textContent = text; $('#pxMsg').style.color = 'var(--bad)';
  },
  tick() {
    if (!this.on) return;
    const now = performance.now(); this.draw(now);
    if (this.finished) return;
    if (this.advanceAt) { if (now >= this.advanceAt) this.advance(); return; }
    const P = Played.now(), notes = P.notes.slice().sort((a, b) => a - b), any = $('#pxAny').checked || P.src === 'mic';
    const fresh = notes.filter(n => !this.prev.has(n)); this.prev = new Set(notes);
    if (this.needRelease) { if (!notes.length) this.needRelease = false; return; }
    let s = this.step();
    if (s.kind === 'note') {
      for (const n of fresh) {
        if (this.advanceAt || this.finished) break;
        s = this.step();
        if (s.kind !== 'note') break;
        const ok = any ? pcOf(n) === pcOf(s.notes[0]) : n === s.notes[0];
        if (ok) this.good(); else this.bad([n], 'That was ' + noteName(n) + (s.ear ? '. Try again.' : '. Play ' + s.name + '.'));
      }
    } else {
      if (fresh.length && !this.chordAt) this.chordAt = now;
      if (this.chordAt && now - this.chordAt > 300) {                    // give the hands time to land all the keys, then judge what is held
        this.chordAt = 0;
        if (notes.length >= 2 || s.notes.length === 1) {
          if (chordMatches(s.notes, notes)) this.good(); else { const nm = describeKeys(notes); this.bad(notes, 'You played ' + nm.name + (notes.length >= 3 ? ' (' + notes.map(noteName).join(' ') + ')' : '') + (s.ear ? '. Listen again and try once more.' : '. Need ' + s.name + '.')); this.needRelease = true; }
        }
      }
    }
  },
  skip() { if (this.finished || this.advanceAt) return; const s = this.step(); this.wrong.push({ played: [] }); this.rec.push({ name: s.name, kind: s.kind, target: s.notes[0], notes: s.notes, ms: performance.now() - this.tStep, wrong: this.wrong }); if (++this.i >= this.steps.length) this.finish(); else this.begin(); },
  finish() {
    this.finished = true; clearInterval(this.timer); this.timer = setInterval(() => this.tick(), 100);
    const sm = pianoSummary(this.rec), secs = Math.round((performance.now() - this.t0) / 1000);
    (Store.data.pianoLog = Store.data.pianoLog || []).push({ ts: Date.now(), ex: this.def.id, key: this.pc, steps: sm.steps, firstTry: sm.firstTry, mistakes: sm.mistakes, secs, o1: $('#pxO1').value, o2: $('#pxO2').value }); Store.save();
    $('#pxBarI').style.width = '100%'; $('#pxName').textContent = sm.firstTryPct + '%'; $('#pxSub').textContent = 'right the first time'; $('#pxMsg').textContent = '';
    $('#pxHear').hidden = $('#pxSkip').hidden = true; $('#pxCv').hidden = true;
    const box = $('#pxRes'); box.textContent = ''; box.hidden = false;
    const stat = (a, b) => { const d = document.createElement('div'); d.className = 'stat'; d.innerHTML = '<span></span><b></b>'; d.children[0].textContent = a; d.children[1].textContent = b; box.appendChild(d); };
    const cr = this.course ? Course.record('piano', this.course.id, sm.firstTryPct) : null;
    if (cr) { const d = document.createElement('div'); d.className = 'card'; d.textContent = Course.note(cr); box.appendChild(d); }
    stat('Steps', sm.steps); stat('Right first time', sm.firstTry + ' of ' + sm.steps); stat('Mistakes', sm.mistakes); stat('Time', secs + ' s'); stat('Typical time per step', (sm.medianMs / 1000).toFixed(1) + ' s');
    sm.tips.forEach(t => { const d = document.createElement('div'); d.className = 'card'; d.textContent = t; box.appendChild(d); });
    const row = document.createElement('div'); row.className = 'row'; row.style.marginTop = '0.625rem';
    const mk = (txt, cls, fn) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = txt; b.onclick = fn; row.appendChild(b); };
    if (cr && cr.passed && cr.nxt) mk('Next level ▶', 'primary', () => Course.start('piano', cr.nxt.id));
    mk('Again', cr && cr.passed && cr.nxt ? '' : 'primary', () => this.start());
    if (!this.def.noKey && !this.course) mk('Next key (up a fifth)', '', () => { $('#pxKey').value = (this.pc + 7) % 12; this.start(); });
    mk('Done', '', () => this.close()); box.appendChild(row);
  },
  /* keyboard: target keys amber (when "show keys" is on), pressed keys blue, wrong presses flash red */
  draw(now) {
    const cv = $('#pxCv'); if (cv.hidden || !cv.clientWidth || !this.steps.length) return;
    const { g, w, h } = fitCanvas(cv), s = this.step() || this.steps[this.steps.length - 1], all = [].concat.apply([], this.steps.map(x => x.notes.concat(x.given != null ? [x.given] : [])));
    let lo = Math.max(21, Math.min.apply(null, all) - 3), hi = Math.min(108, Math.max.apply(null, all) + 3);
    if (hi - lo < 24) { lo = Math.max(21, Math.round((hi + lo) / 2 - 12)); hi = Math.min(108, lo + 24); }
    while (isBlack(lo)) lo--; while (isBlack(hi)) hi++;
    const held = Played.now().notes, show = $('#pxShow').checked || (s.given != null), tgt = show && !s.ear ? s.notes : s.given != null ? [s.given] : [];
    const whites = []; for (let m = lo; m <= hi; m++) if (!isBlack(m)) whites.push(m);
    const ww = w / whites.length, top = 2, kh = h - top - Math.round(20 * UIK), bh = kh * 0.62, bw = ww * 0.6, wx = new Map(); whites.forEach((m, k) => wx.set(m, k * ww));
    const off = { 1: -0.08, 3: 0.08, 6: -0.08, 8: 0, 10: 0.08 }, bx = m => wx.get(m - 1) + ww - bw / 2 + (off[pcOf(m)] || 0) * ww;
    const col = (m, black) => { const f = this.flash.get(m); if (f && now - f < 450) return '#ff5d5d'; return held.includes(m) ? '#ffb347' : tgt.includes(m) ? '#ffb020' : black ? '#141210' : '#f3ead6'; };
    g.clearRect(0, 0, w, h);
    const key = (x, y, kw, kh2) => { g.beginPath(); g.rect(x, y, kw, kh2); };
    whites.forEach(m => { const x = wx.get(m); key(x + 0.5, top, ww - 1, kh); g.fillStyle = col(m, false); g.fill(); if (m % 12 === 0) { g.fillStyle = '#b8a888'; g.font = (9 * UIK) + 'px sans-serif'; g.textAlign = 'center'; g.fillText(noteName(m), x + ww / 2, top + kh - 6); } });
    for (let m = lo; m <= hi; m++) if (isBlack(m)) { key(bx(m), top, bw, bh); g.fillStyle = col(m, true); g.fill(); g.strokeStyle = '#0d0b09'; g.stroke(); }
    cv._kb = kbGeom(lo, hi, whites, wx, ww, bx, bw, top, kh, bh);
    g.font = '700 ' + (12 * UIK) + 'px sans-serif'; g.textAlign = 'center'; g.fillStyle = '#ffb020';
    tgt.forEach(m => { if (m < lo || m > hi) return; const cx = isBlack(m) ? bx(m) + bw / 2 : wx.get(m) + ww / 2; g.fillText(noteName(m), cx, top + kh + 15 * UIK); });
    g.textAlign = 'start';
  }
};

