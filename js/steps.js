"use strict";
/* ---- Drum step grid (Mix editor) ---- edits the selected track's notes bar by bar; the same notes show in the piano roll. ---- */
const Steps = {
  ROWS: [[49, 'CRASH'], [46, 'OPEN HAT'], [42, 'CLOSED HAT'], [45, 'TOM'], [39, 'CLAP'], [38, 'SNARE'], [37, 'RIM'], [36, 'KICK']],
  /* 16 characters per row: . off, x hit, X accent. */
  PRESETS: {
    'Rock': { 36: 'X...x...X...x...', 38: '....X.......X...', 42: 'x.x.x.x.x.x.x.x.' },
    'Four on the floor': { 36: 'X...X...X...X...', 39: '....X.......X...', 46: '..x...x...x...x.', 42: 'x.x.x.x.x.x.x.x.' },
    'Hip hop': { 36: 'X.....x...x.....', 38: '....X.......X...', 42: 'x.xxx.xxx.x.x.xx' },
    'Funk': { 36: 'X..x..x...x..x..', 38: '....X..x.x..X..x', 42: 'xxxxxxxxxxxxxxxx' },
    'Reggae one drop': { 36: '........X.......', 37: '........X.......', 42: '..x...x...x...x.' },
    'Bossa nova': { 36: 'X..x..X.X..x..X.', 37: 'X..X..X...X..X..', 42: 'x.x.x.x.x.x.x.x.' },
    'Shuffle (use triplets)': { 36: 'X...x...X...x...', 38: '....X.......X...', 42: 'x.x.x.x.x.x.x.x.' }
  },
  bar: 0, mode: null, forTrack: null, dom: '', sig: '', cells: [],
  isDrum(tr) { return !!tr && (songTrackChannels(tr).includes(9) || (!tr.notes.length && /drum|perc/i.test(tr.name))); },
  active() { return Ed.on && !!Ed.track && (this.mode ? this.mode === 'steps' : this.isDrum(Ed.track)); },
  show(on) { this.mode = on ? 'steps' : 'notes'; this.forTrack = Ed.track ? Ed.track.id : null; },
  toggleView() { this.show(!this.active()); },
  lenAt(song, t) { const ts = song.timeSigs.filter(x => x.tick <= t).pop() || song.timeSigs[0]; return song.ppq * 4 * ts.num / ts.den; },
  /* Start tick of every bar, plus one empty bar after the last note. */
  bars(song) {
    const out = songBarLines(song, 0, songEndTick(song) + 1).map(b => b.tick); if (!out.length) out.push(0);
    const last = out[out.length - 1]; out.push(last + this.lenAt(song, last)); return out;
  },
  geo(song) {
    const bars = this.bars(song); this.bar = clamp(this.bar, 0, bars.length - 1);
    const start = bars[this.bar], len = this.bar + 1 < bars.length ? bars[this.bar + 1] - start : this.lenAt(song, start), stepT = song.ppq * 4 / (+$('#stDiv').value || 16);
    return { bars, start, len, stepT, n: Math.max(1, Math.round(len / stepT)) };
  },
  inBar(n, G) { return n.tick >= G.start - G.stepT * 0.1 && n.tick < G.start + G.len - G.stepT * 0.1; },
  /* Per drum row: the velocity (0 = off) and the number of hits (ratchets have 2-4) of every step. A step owns the notes from just before it to just before the next one. */
  values(tr, G) {
    const v = {}; this.ROWS.forEach(([m]) => { v[m] = { vel: new Array(G.n).fill(0), cnt: new Array(G.n).fill(0) }; });
    tr.notes.forEach(n => { const r = v[n.midi]; if (!r || !this.inBar(n, G)) return; const i = clamp(Math.floor((n.tick - G.start + G.stepT * 0.1) / G.stepT), 0, G.n - 1); r.vel[i] = Math.max(r.vel[i], n.vel || 1); r.cnt[i]++; });
    return v;
  },
  cell(tr, G, m, i) { const t = G.start + i * G.stepT; return tr.notes.filter(n => n.midi === m && n.tick >= t - G.stepT * 0.1 && n.tick < t + G.stepT * 0.9); },
  hits(song, G, m, i, n, vel, ch) { const t = G.start + i * G.stepT, out = []; for (let k = 0; k < n; k++) out.push({ midi: m, tick: Math.round(t + k * G.stepT / n), dur: Math.max(1, Math.round(Math.min(G.stepT / n, song.ppq / 4) / 2)), vel, ch }); return out; },
  /* One tap: in "hit" mode off, hit, accent, off; in a ratchet mode that many quick hits, or off when the step already has them. */
  tap(m, i, v0) {
    const song = Ed.song, tr = Ed.track, G = this.geo(song), ch = Ed.chan(tr), want = +$('#stTap').value, old = this.cell(tr, G, m, i), cnt = old.length;
    let add = null;
    if (want > 1) { if (cnt !== want) add = this.hits(song, G, m, i, want, v0 || 90, ch); }
    else if (!cnt) add = this.hits(song, G, m, i, 1, 90, ch);
    else if (v0 < 110) add = this.hits(song, G, m, i, Math.min(cnt, 4), 127, ch);
    Ed.edit(() => { tr.notes = tr.notes.filter(n => !old.includes(n)); if (add) add.forEach(n => tr.notes.push(n)); });
    if (add) Ed.audition(m, add[0].vel, ch);
  },
  /* Dragging up or down on a lit step sets its velocity (all its hits); the bar inside the step shows it. */
  stepDown(e, m, i, b) { const v0 = this.last ? this.last[m].vel[i] : 0; this.pd = { m, i, y: e.clientY, h: Math.max(20, b.offsetHeight), v0, moved: false, snap: songSnapshot(Ed.song), cell: this.cell(Ed.track, this.geo(Ed.song), m, i) }; b.setPointerCapture(e.pointerId); },
  stepMove(e, m, i) {
    const d = this.pd; if (!d || d.m !== m || d.i !== i || !d.v0 || !d.cell.length) return; const dy = d.y - e.clientY; if (!d.moved && Math.abs(dy) < 5) return;
    d.moved = true; const v = clamp(Math.round(d.v0 + dy / (d.h * 1.4) * 127), 1, 127); d.cell.forEach(n => { n.vel = v; });
  },
  stepUp(m, i) { const d = this.pd; this.pd = null; if (!d || d.m !== m || d.i !== i) return; if (d.moved) { Ed.hist.push(d.snap); Ed.commit(); } else this.tap(m, i, d.v0); },
  /* Mute and solo of single drum sounds inside a drum track (kept for this session). */
  rm: new Map(),
  rowState(tid) { let r = this.rm.get(tid); if (!r) this.rm.set(tid, r = { mute: new Set(), solo: new Set() }); return r; },
  silent(t, midi) { const r = this.rm.get(t.tid); return !!r && (r.solo.size ? !r.solo.has(midi) : r.mute.has(midi)); },
  flip(k, m) { const tr = Ed.track; if (!tr) return; const set = this.rowState(tr.id)[k]; if (set.has(m)) set.delete(m); else set.add(m); this.sig = ''; },
  build(G) {
    const g = $('#stGrid'); g.innerHTML = ''; g.style.gridTemplateColumns = 'minmax(84px,150px) repeat(' + G.n + ',minmax(0,1fr))'; g.style.gridTemplateRows = 'auto repeat(' + this.ROWS.length + ',minmax(26px,1fr))';
    const per = G.n % 4 === 0 ? 4 : G.n % 3 === 0 ? 3 : 2; this.cells = []; this.mbtn = [];
    g.appendChild(document.createElement('div'));
    for (let i = 0; i < G.n; i++) { const d = document.createElement('div'); d.className = 'dmnum'; d.textContent = i % per === 0 ? i / per + 1 : '·'; g.appendChild(d); }
    this.ROWS.forEach(([m, name]) => {
      const lab = document.createElement('div'); lab.className = 'dmname'; const mk = (t, k, tip) => { const b = document.createElement('button'); b.textContent = t; b.title = tip; b.className = 'dmrb'; b.onclick = e => { e.stopPropagation(); this.flip(k, m); }; return b; };
      const mb = mk('M', 'mute', 'Mute ' + name + ' in this track'), sb = mk('S', 'solo', 'Solo ' + name + ' in this track'), nm = document.createElement('span'); nm.textContent = name; nm.onclick = () => Ed.audition(m, 100, Ed.chan(Ed.track));
      lab.append(mb, sb, nm); g.appendChild(lab); this.mbtn.push([mb, sb, m]);
      for (let i = 0; i < G.n; i++) {
        const b = document.createElement('button'); b.className = 'dmstep' + (i % per === 0 ? ' beat' : ''); b.dataset.beat = i % per === 0 ? '1' : ''; b.setAttribute('aria-label', name + ' step ' + (i + 1));
        b.onpointerdown = e => this.stepDown(e, m, i, b); b.onpointermove = e => this.stepMove(e, m, i); b.onpointerup = () => this.stepUp(m, i); b.onpointercancel = () => { this.pd = null; };
        g.appendChild(b); this.cells.push(b);
      }
    });
  },
  button(k) {
    const song = Ed.song, tr = Ed.track; if (!song || !tr || Rec.state !== 'idle') return; const G = this.geo(song);
    if (k === 'prev') this.bar = Math.max(0, this.bar - 1);
    else if (k === 'next') this.bar = Math.min(G.bars.length - 1, this.bar + 1);
    else if (k === 'clear') Ed.edit(() => { tr.notes = tr.notes.filter(n => !this.inBar(n, G)); });
    else if (k === 'copy') {
      if (this.bar + 1 >= G.bars.length) return;
      const next = { start: G.bars[this.bar + 1], len: this.lenAt(song, G.bars[this.bar + 1]), stepT: G.stepT }, d = next.start - G.start, src = tr.notes.filter(n => this.inBar(n, G)).map(n => Object.assign({}, n, { tick: n.tick + d }));
      Ed.edit(() => { tr.notes = tr.notes.filter(n => !this.inBar(n, next)).concat(src); }); this.bar++;
    }
  },
  preset(name) {
    const pat = this.PRESETS[name], song = Ed.song, tr = Ed.track; if (!pat || !tr) return; const G = this.geo(song), ch = Ed.chan(tr), rows = this.ROWS.map(r => r[0]);
    Ed.edit(() => {
      tr.notes = tr.notes.filter(n => !(rows.includes(n.midi) && this.inBar(n, G)));
      rows.forEach(m => { const str = pat[m] || ''; for (let i = 0; i < G.n; i++) { const k = i * 16 / G.n, c = Number.isInteger(k) ? str[k] : '.'; if (c === 'x' || c === 'X') tr.notes.push({ midi: m, tick: Math.round(G.start + i * G.stepT), dur: Math.max(1, Math.round(Math.min(G.stepT, song.ppq / 4) / 2)), vel: c === 'X' ? 127 : 85, ch }); } });
    });
  },
  init() {
    $('#stPre').innerHTML = '<option value="">Fill bar with…</option>' + Object.keys(this.PRESETS).map(k => '<option>' + k + '</option>').join('');
    $('#stPre').onchange = e => { const v = e.target.value; e.target.value = ''; if (v && Rec.state === 'idle') this.preset(v); };
    $$('#edSteps [data-st]').forEach(b => b.onclick = () => this.button(b.dataset.st));
    $('#stDiv').onchange = () => { this.dom = ''; };
    $('#edHelp').onclick = () => toast(this.active() ? 'Tap a step: hit, then accent, then off. Drag a lit step up or down to set its velocity. Tap: ×2 to ×4 makes ratchets. M and S mute or solo one drum. Tap a name to hear it.' : 'Draw: tap to add a note, drag to set its length. Select: drag a box, drag notes to move, drag a note\'s right end to resize, double-tap to delete. Tap the ruler to move the playhead. Bottom strip: velocity. Wheel scrolls, Shift+wheel sideways, Ctrl+wheel zooms.', 9000);
  },
  draw() {
    const song = Ed.song, tr = Ed.track;
    if (tr && tr.id !== this.forTrack) { this.forTrack = tr.id; this.mode = null; }
    const on = this.active() && !!song, vb = $('#edView');
    if (vb) { vb.hidden = !(Ed.on && tr && (this.isDrum(tr) || on)); vb.textContent = on ? '♪ Notes' : '▦ Steps'; }
    $('#edSteps').hidden = !on;
    $('#edCv').hidden = on; $$('#sqEdit .pr').forEach(el => { el.hidden = on; });
    Seq.markSel();
    if (!on) return;
    let G = this.geo(song);
    if (Seq.playing) { const ph = songTick(song, Seq.pos()); let b = -1; G.bars.forEach((t, i) => { if (t <= ph) b = i; }); if (b >= 0 && b !== this.bar) { this.bar = b; G = this.geo(song); } }
    const key = G.n + ':' + G.stepT; if (key !== this.dom) { this.dom = key; this.build(G); this.sig = ''; }
    const v = this.values(tr, G), ph = songTick(song, Seq.pos()), now = Seq.playing && ph >= G.start && ph < G.start + G.len ? Math.floor((ph - G.start) / G.stepT) : -1, rs = this.rowState(tr.id);
    const sig = this.ROWS.map(r => v[r[0]].vel.join(',') + v[r[0]].cnt.join('')).join('|') + '#' + now + '#' + this.bar + '#' + Array.from(rs.mute) + '#' + Array.from(rs.solo); this.last = v;
    if (sig !== this.sig) {
      this.sig = sig; $('#stBar').textContent = 'Bar ' + (this.bar + 1) + ' / ' + G.bars.length;
      this.mbtn.forEach(([mb, sb, m]) => { mb.classList.toggle('on', rs.mute.has(m)); sb.classList.toggle('on', rs.solo.has(m)); });
      this.ROWS.forEach(([m], r) => { for (let i = 0; i < G.n; i++) {
        const b = this.cells[r * G.n + i], x = v[m].vel[i], c = v[m].cnt[i];
        b.className = 'dmstep' + (b.dataset.beat ? ' beat' : '') + (x ? ' on' + (x >= 110 ? ' acc' : '') : '') + (i === now ? ' now' : ''); b.style.setProperty('--v', x ? (0.22 + 0.78 * x / 127).toFixed(2) : 0); if (c > 1) b.dataset.n = '×' + c; else delete b.dataset.n;
      } });
    }
  }
};

