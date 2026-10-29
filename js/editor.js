"use strict";
/* ---- Note editor (Mix tab) ----
   Edits Seq.song in place. Drawing, moving, resizing and velocity changes happen live on the note objects; when the gesture ends commit() sorts the notes,
   rebuilds the playable tracks (Seq.rebuild) and saves the song. Every gesture takes one undo snapshot, the first time it changes something. */
const Ed = {
  on: false, song: null, ti: 0, div: 8, tool: 'select', lane: 'vel', ls: {}, ltap: null, x0: 0, ppt: 0.1, topM: 72, sel: new Set(), hist: new EditHistory(), clip: null, ghost: true, lastDur: 480, lastVel: 90, drag: null, tap: null, geo: null, needFit: true, saveT: 0,
  SCALES: { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], pentmaj: [0, 2, 4, 7, 9], pentmin: [0, 3, 5, 7, 10], blues: [0, 3, 5, 6, 7, 10], dorian: [0, 2, 3, 5, 7, 9, 10], mixo: [0, 2, 4, 5, 7, 9, 10], harm: [0, 2, 3, 5, 7, 8, 11] },
  /* The pitch classes of the highlighted scale as {root, set}, or null. "Song key" follows the key signature written in the song. */
  scaleInfo() {
    const t = $('#edScale').value; if (t === 'off') return null;
    if (t === 'key') { const k = this.song && this.song.keySigs[0]; if (!k) return null; const maj = (((k.sf * 7) % 12) + 12) % 12, root = k.mi ? (maj + 9) % 12 : maj; return { root, set: new Set(this.SCALES[k.mi ? 'minor' : 'major']) }; }
    return { root: +$('#edRoot').value, set: new Set(this.SCALES[t]) };
  },
  CHORDS: { maj: [4, 7], min: [3, 7], dim: [3, 6], sus4: [5, 7], pow: [7], maj7: [4, 7, 11], dom7: [4, 7, 10], min7: [3, 7, 10] },
  /* The other pitches stamped with a new note: a fixed chord shape, or the triad built on that note from the highlighted scale (stacked thirds within the scale). */
  chordNotes(n) {
    const t = $('#edChord').value; if (t === '0') return [];
    if (t === 'scale') {
      const sc = this.scaleInfo(); if (!sc) return this.CHORDS.maj.map(i => n.midi + i);
      const deg = []; for (let m = n.midi; m <= n.midi + 24; m++) if (sc.set.has(((m - sc.root) % 12 + 12) % 12)) deg.push(m);
      if (deg[0] !== n.midi) return this.CHORDS.maj.map(i => n.midi + i);      // the tapped note is not in the scale
      return [deg[2], deg[4]].filter(m => m != null && m <= 127);
    }
    return this.CHORDS[t].map(i => n.midi + i).filter(m => m <= 127);
  },
  /* A bass track that plays on the kick drum hits of a drum track (inside the loop region if there is one): the root of the highlighted scale or song key. */
  makeBass(pattern, root) {
    const song = this.song; if (!song) return;
    const src = this.track && Steps.isDrum(this.track) ? this.track : song.tracks.find(t => Steps.isDrum(t));
    if (!src) return toast('Add a drum track first (＋ Drums); the bass follows its kick.', 3500);
    let a = 0, b = Infinity; if (Seq.loopA != null) { a = Math.round(songTick(song, Seq.loopA)); b = Math.round(songTick(song, Seq.loopB)); }
    const ticks = Array.from(new Set(src.notes.filter(n => (n.midi === 36 || n.midi === 35) && n.tick >= a && n.tick < b).map(n => n.tick))).sort((x, y) => x - y);
    if (!ticks.length) return toast('No kick drum hits to follow' + (b < Infinity ? ' inside the loop region.' : '.'), 3000);
    let base = 36 + root; if (base > 47) base -= 12;
    this.edit(() => {
      const ti = songAddTrack(song, 'Bass', null, 33), tr = song.tracks[ti], ch = tr.progs[0].ch;
      ticks.forEach((t, k) => {
        const gap = (ticks[k + 1] != null ? ticks[k + 1] : t + song.ppq) - t, dur = Math.round(clamp(gap, song.ppq / 8, song.ppq) * 0.9);
        const m = pattern === 'fifth' && k % 4 === 3 ? base + 7 : pattern === 'octave' && t % song.ppq ? base + 12 : base;
        tr.notes.push({ midi: m, tick: t, dur, vel: 100, ch });
      });
      this.ti = ti; this.sel.clear(); this.needFit = true; this.ls = {};
    });
    toast('Bass track added: ' + ticks.length + ' notes on the kick.', 3000);
  },
  /* Length for a note added by tapping: the chosen preset, else the one used last. */
  newDur(tick) {
    const v = $('#edLen').value; if (v === '0') return Math.max(1, this.lastDur); if (v === 'bar') return Math.round(Steps.lenAt(this.song, tick));
    return Math.max(1, Math.round(this.song.ppq * 4 / +v));
  },
  get track() { return this.song && this.song.tracks[this.ti]; },
  get grid() { return gridTicks(this.song, this.div); },
  X(t) { return this.geo.keyW + (t - this.x0) * this.ppt; },
  Y(m) { return this.geo.rulerH + (this.topM - m) * this.geo.rh; },
  tickAt(px) { return this.x0 + (px - this.geo.keyW) / this.ppt; },
  midiAt(py) { return clamp(Math.ceil(this.topM - (py - this.geo.rulerH) / this.geo.rh), 0, 127); },
  busy() { return Rec.state !== 'idle'; },
  /* The channel new notes of a track use: its latest note's, else the one it already has, else 10 (drums) for a track named like a drum kit. */
  chan(tr) { const chs = songTrackChannels(tr); return tr.notes.length ? tr.notes[tr.notes.length - 1].ch : chs.length ? chs[0] : /drum|perc/i.test(tr.name) ? 9 : songFreeChannel(this.song); },
  program(tr, ch) { const p = tr.progs.filter(e => e.ch === ch).sort((a, b) => a.tick - b.tick)[0]; return p ? p.val : 0; },
  laneCc() { return this.lane === 'vel' ? null : this.lane === 'bend' ? 'bend' : +this.lane; },
  laneLabel() { return { vel: 'VEL', 64: 'SUS', 7: 'VOL', 11: 'EXP', 10: 'PAN', 1: 'MOD', bend: 'BEND' }[this.lane] || ''; },
  laneVal(py, cc) {
    const G = this.geo, v = clamp((G.h - 4 - py) / (G.velH - 8), 0, 1);
    if (cc === 'bend') return Math.abs(v - 0.5) < 0.03 ? 8192 : Math.round(v * 16383);
    return cc === 64 ? (v >= 0.5 ? 127 : 0) : Math.round(v * 127);
  },
  beatTick() { return Math.round(songTick(this.song, Seq.pos()) / this.song.ppq) * this.song.ppq; },
  /* ---- setup ---- */
  init() {
    const cv = $('#edCv'); if (!cv) return;
    $('#sqNew').onclick = () => { if (!this.busy()) Seq.guard(() => this.newSong()); };
    const opt = (el, v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; el.appendChild(o); };
    GM_PROGRAMS.forEach((n, i) => opt($('#edProg'), i, (i + 1) + '. ' + n)); for (let c = 0; c < 16; c++) opt($('#edCh'), c, 'Ch ' + (c + 1) + (c === 9 ? ' (drums)' : ''));
    for (let n = 1; n <= 16; n++) opt($('#edNum'), n, n); $('#edNum').value = 4;
    [0, 1].forEach(mi => { for (let sf = -7; sf <= 7; sf++) opt($('#edKey'), sf + ':' + mi, keyName(sf, mi)); }); $('#edKey').value = '0:0';
    $('#edLane').onchange = e => { this.lane = e.target.value; };
    $('#edTName').onchange = e => { const tr = this.track; if (!tr || this.busy()) return; this.edit(() => { tr.name = e.target.value.trim(); }); };
    $('#edProg').onchange = e => {
      const tr = this.track; if (!tr || this.busy()) return; const ch = this.chan(tr), v = +e.target.value;
      this.edit(() => songSetProgram(tr, ch, v, 0));
      Seq.tracks.forEach(t => { if (t.tid === tr.id) t.inst = 'auto'; }); Seq.save(); Seq.render(); this.audition(60, 90, ch);   // an instrument picked in the mixer would hide the change
    };
    $('#edCh').onchange = e => {
      const tr = this.track; if (!tr || this.busy()) return; const ch = +e.target.value;
      if (songTrackChannels(tr).length > 1) { toast('This track uses several channels; split it first.', 3000); this.ls = {}; return; }
      this.edit(() => songSetChannel(tr, ch));
    };
    $('#edSName').onchange = e => {
      if (!this.song || this.busy()) return; const v = e.target.value.trim() || 'Untitled', old = Seq.name;
      this.song.name = v; Seq.name = v; if (Store.data.midi && Store.data.midi.name === old) Store.data.midi.name = v; Seq.save(); Seq.render(); this.autosave();
    };
    $('#edKey').onchange = e => { if (!this.song || this.busy()) return; const k = e.target.value.split(':').map(Number); this.edit(() => songSetKey(this.song, k[0], k[1])); };
    $('#edTrack').onchange = e => { if (Rec.state !== 'idle') { e.target.value = this.ti; return; } this.ti = +e.target.value; this.sel.clear(); this.needFit = true; this.ls = {}; };
    $('#edGrid').onchange = e => { this.div = +e.target.value; };
    { const st = Store.data.settings, root = $('#edRoot'); ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'].forEach((n, i) => opt(root, i, n));
      root.value = st.edRoot || 0; $('#edScale').value = st.edScale || 'off'; $('#edLen').value = st.edLen || '0'; this.ghost = st.edGhost !== false; $('#edGhost').classList.toggle('on', this.ghost);
      root.onchange = () => { st.edRoot = +root.value; Store.save(); }; $('#edScale').onchange = e => { st.edScale = e.target.value; Store.save(); root.disabled = e.target.value === 'off' || e.target.value === 'key'; }; root.disabled = ['off', 'key'].includes($('#edScale').value);
      $('#edLen').onchange = e => { st.edLen = e.target.value; Store.save(); };
      $('#edChord').value = st.edChord || '0'; $('#edChord').onchange = e => { st.edChord = e.target.value; Store.save(); };
      const br = $('#bpRoot'); Array.from(root.options).forEach(o => opt(br, o.value, o.textContent)); $('#bpPat').value = st.bassPat || 'root';
      $('#edBass').onclick = () => { if (!this.song || this.busy()) return; const sc = this.scaleInfo(); br.value = sc ? sc.root : +root.value; $('#bassPop').hidden = !$('#bassPop').hidden; };
      $('#bpCancel').onclick = () => { $('#bassPop').hidden = true; };
      $('#bpOk').onclick = () => { st.bassPat = $('#bpPat').value; Store.save(); $('#bassPop').hidden = true; this.makeBass($('#bpPat').value, +br.value); };
      $('#edGhost').onclick = e => { this.ghost = !this.ghost; st.edGhost = this.ghost; Store.save(); e.currentTarget.classList.toggle('on', this.ghost); }; }
    $$('[data-tool]').forEach(b => b.onclick = () => { this.tool = b.dataset.tool; $$('[data-tool]').forEach(x => x.classList.toggle('on', x === b)); });
    $$('[data-ed]').forEach(b => b.onclick = () => this.act(b.dataset.ed));
    $('#edSrc').onchange = e => { Rec.src = e.target.value; };
    $$('[data-rec]').forEach(b => { const k = b.dataset.rec; b.classList.toggle('on', k === 'recQ' ? !!Store.data.settings[k] : Store.data.settings[k] !== false); b.onclick = () => { const st = Store.data.settings; st[k] = k === 'recQ' ? !st[k] : st[k] === false; b.classList.toggle('on', k === 'recQ' ? !!st[k] : st[k] !== false); Store.save(); }; });
    $('#edScroll').oninput = e => { this.x0 = +e.target.value; };
    cv.addEventListener('pointerdown', e => this.down(e)); cv.addEventListener('pointermove', e => this.move(e));
    cv.addEventListener('pointerup', e => this.up(e)); cv.addEventListener('pointercancel', e => this.up(e));
    cv.addEventListener('wheel', e => this.wheel(e), { passive: false });
    document.addEventListener('keydown', e => this.key(e));
  },
  toggle() {
    this.on = !this.on; $('#sqEdit').hidden = !this.on;
    if (this.on) this.attach();
  },
  /* Arrangement on the loop region: duplicate, repeat or clear everything inside it, on the selected track or on all tracks. */
  regionOp(k) {
    const song = this.song; if (!song) return;
    if (Seq.loopA == null) return toast('Drag in the strip above the tracks to choose a region first.', 3000);
    const a = Math.round(songTick(song, Seq.loopA)), b = Math.round(songTick(song, Seq.loopB)), len = b - a; if (len <= 0) return;
    const trs = $('#edAllTr').checked ? song.tracks : this.track ? [this.track] : [], times = k === 'rrep' ? +$('#edRep').value : 1;
    const inside = (e, lo, hi) => e.tick >= lo && e.tick < hi, outside = (lo, hi) => e => !inside(e, lo, hi);
    this.edit(() => trs.forEach(tr => {
      if (k === 'rclr') { ['notes', 'ctrl', 'bends'].forEach(f => { tr[f] = tr[f].filter(outside(a, b)); }); return; }
      ['notes', 'ctrl', 'bends'].forEach(f => {
        const src = tr[f].filter(e => inside(e, a, b));
        for (let r = 1; r <= times; r++) { const d = len * r; tr[f] = tr[f].filter(outside(a + d, b + d)).concat(src.map(e => Object.assign({}, e, { tick: e.tick + d }))); }
      });
    }));
    if (k === 'rdup') Seq.setRegion(songSec(song, b), songSec(song, b + len));
    toast(k === 'rclr' ? 'Region cleared.' : k === 'rdup' ? 'Duplicated; the region moved to the copy.' : 'Repeated ×' + times + '.', 2200);
  },
  /* Called when the editor opens and whenever a different song was loaded. */
  attach() {
    if (!Seq.song) return;
    if (this.song !== Seq.song) { this.song = Seq.song; this.hist = new EditHistory(); this.sel.clear(); this.ti = 0; this.lastDur = this.song.ppq; this.ppt = 56 * UIK / this.song.ppq; this.tap = null; this.drag = null; }
    this.ti = clamp(this.ti, 0, Math.max(0, this.song.tracks.length - 1)); this.needFit = true; this.ls = {}; this.fillTracks();
  },
  fillTracks() {
    const sel = $('#edTrack'); if (!sel || !this.song) return;
    sel.innerHTML = ''; this.song.tracks.forEach((t, i) => { const o = document.createElement('option'); o.value = i; o.textContent = (i + 1) + '. ' + (t.name || 'Track ' + (i + 1)) + ' (' + t.notes.length + ')'; sel.appendChild(o); });
    sel.value = this.ti; this.renderMarks();
  },
  /* Tempo and time-signature changes as small buttons; the ones after the start can be removed. */
  renderMarks() {
    const box = $('#edMarks'); if (!box || !this.song) return; box.textContent = '';
    const song = this.song, barOf = t => songBarLines(song, 0, t + 1).length || 1;
    const add = (txt, tick, del) => { const b = document.createElement('button'); b.className = 'sqb'; b.textContent = txt + (tick > 0 ? ' ✕' : ''); b.title = tick > 0 ? 'Remove this change' : 'From the start of the song'; b.onclick = () => { if (tick > 0 && !this.busy()) this.edit(() => del(tick)); }; box.appendChild(b); };
    song.tempos.forEach(t => add('♩' + Math.round(60e6 / t.us) + ' · bar ' + barOf(t.tick), t.tick, tk => songRemoveTempo(song, tk)));
    song.timeSigs.forEach(t => add(t.num + '/' + t.den + ' · bar ' + barOf(t.tick), t.tick, tk => songRemoveTimeSig(song, tk)));
  },
  /* Keeps the track and song fields in step with the song. A field is only rewritten when the value it shows changes, so typing is never overwritten. */
  syncFields() {
    const tr = this.track, song = this.song, ph = songTick(song, Seq.pos()), ts = song.timeSigs.filter(t => t.tick <= ph).pop() || song.timeSigs[0], k = song.keySigs[0];
    const set = (id, v) => { if (this.ls[id] !== v) { this.ls[id] = v; $('#' + id).value = v; } };
    ['edTName', 'edProg', 'edCh'].forEach(id => { $('#' + id).disabled = !tr; });
    if (tr) { const ch = this.chan(tr); set('edTName', tr.name); set('edProg', this.program(tr, ch)); set('edCh', ch); $('#edProg').disabled = ch === 9; $('#edCh').disabled = songTrackChannels(tr).length > 1; }
    set('edSName', song.name || Seq.name); set('edKey', k ? k.sf + ':' + k.mi : '0:0'); set('edBpm', Math.round(60e6 / songTempoAt(song, ph))); set('edNum', ts.num); set('edDen', ts.den);
  },
  async newSong() {
    if (this.busy()) return; const name = await Seq.uniqueName('Untitled'), song = songNew(name);
    Seq.load(songToUnits(song), name, song); Seq.dirty = false; Seq.projKey = null; Seq.render(); Seq.sync(); if (!this.on) this.toggle();
    this.autosave(); toast('New song. Press ● Rec, or tap the grid to draw notes.', 4000);
  },
  fit() {
    this.needFit = false; const tr = this.track, G = this.geo; if (!tr || !G) return;
    if (tr.notes.length) {
      let lo = 127, hi = 0, t0 = Infinity; tr.notes.forEach(n => { if (n.midi < lo) lo = n.midi; if (n.midi > hi) hi = n.midi; if (n.tick < t0) t0 = n.tick; });
      this.topM = (lo + hi) / 2 + G.noteH / G.rh / 2; this.x0 = Math.max(0, t0 - this.song.ppq / 4);
    } else { this.topM = 60 + G.noteH / G.rh / 2; this.x0 = 0; }
  },
  clampView() { const G = this.geo; this.x0 = Math.max(0, this.x0); this.topM = clamp(this.topM, G.noteH / G.rh - 1, 127); },
  /* ---- editing ---- */
  /* Runs fn as one undoable change. */
  edit(fn) { this.hist.push(songSnapshot(this.song)); fn(); this.commit(); },
  commit() {
    Seq.dirty = true;
    if (this.song) this.song.tracks.forEach(sortNotes);      // every track, so lists stay in time order after a region or chord edit
    try { Seq.rebuild(); } catch (e) { console.warn(e); }
    this.fillTracks(); clearTimeout(this.saveT); this.saveT = setTimeout(() => this.autosave(), 700);
  },
  autosave() { Seq.keep(); },
  mark() { const d = this.drag; if (d && !d.pushed) { this.hist.push(d.snap); d.pushed = true; } },
  chosen() { return this.sel.size ? Array.from(this.sel) : []; },
  audition(midi, vel, ch) {
    const c = Engine.ctx; if (!c || !Engine.master) return; if (c.state !== 'running') c.resume();
    const ti = this.ti, t = Seq.tracks.find(x => x.ti === ti && x.ch === ch) || Seq.tracks.find(x => x.ti === ti), when = c.currentTime + 0.01;
    try {
      if (t) {
        const r = Seq.res(t); if (r.kit || t.drums) { Engine.drum(midi, when, vel || 90); return; }
        const pre = r.preset != null && SF.cache.has(r.preset) ? r.preset : -1;
        Engine.playNote(midi, when, 0.4, { preset: pre, synth: r.synth || synthFor(t.program), vel: vel || 90, seq: true, gain: 0.2 });
      } else if (this.track && this.chan(this.track) === 9) Engine.drum(midi, when, vel || 90);
      else Engine.playNote(midi, when, 0.4, { preset: -1, synth: this.track ? synthFor(this.program(this.track, this.chan(this.track))) : 'soft', vel: vel || 90, seq: true, gain: 0.2 });   // a track with no notes yet is not in the mixer
    } catch (e) { console.warn(e); }
  },
  act(k) {
    const song = this.song, tr = this.track; if (!song) return;
    if (k === 'rec') return Rec.toggle();
    if (k === 'piano') return Keys.open();
    if (Rec.state !== 'idle' && k !== 'zoomin' && k !== 'zoomout') return;
    if (k === 'view') return Steps.toggleView();
    if (k === 'rdup' || k === 'rrep' || k === 'rclr') return this.regionOp(k);
    if (k === 'tdrum') { this.edit(() => { this.ti = songAddTrack(song, 'Drums', 9, 0); this.sel.clear(); this.needFit = true; this.ls = {}; }); Steps.show(true); return; }
    if (k === 'tadd') return this.edit(() => { this.ti = songAddTrack(song, 'Track ' + (song.tracks.length + 1)); this.sel.clear(); this.needFit = true; this.ls = {}; });
    if (k === 'tdel') { if (!tr) return; return this.edit(() => { songDeleteTrack(song, this.ti); this.ti = clamp(this.ti, 0, Math.max(0, song.tracks.length - 1)); this.sel.clear(); this.needFit = true; this.ls = {}; }); }
    if (k === 'tup' || k === 'tdown') { if (!tr) return; return this.edit(() => { this.ti = songMoveTrack(song, this.ti, k === 'tup' ? -1 : 1); }); }
    if (k === 'tempo') { const bpm = clamp(Math.round(+$('#edBpm').value) || 120, 20, 300), at = this.beatTick(); return this.edit(() => songSetTempo(song, at, bpm)); }
    if (k === 'tsig') { const num = +$('#edNum').value, den = +$('#edDen').value; return this.edit(() => songSetTimeSig(song, songTick(song, Seq.pos()), num, den)); }
    if (k === 'lclear') {
      const cc = this.laneCc(); if (!tr || cc == null) return toast('Choose a controller lane first (not Velocity).', 2200);
      const n = songCtrlEvents(tr, cc).length; if (!n) return toast('That lane is empty.', 1800);
      return this.edit(() => songClearCtrl(tr, cc));
    }
    const sel = this.chosen(), g = this.grid, ph = () => snapTick(songTick(song, Seq.pos()), g);
    if (k === 'undo' || k === 'redo') {
      const snap = k === 'undo' ? this.hist.undo(songSnapshot(song)) : this.hist.redo(songSnapshot(song));
      if (snap) { songRestore(song, snap); this.sel.clear(); this.commit(); }
    } else if (k === 'zoomin' || k === 'zoomout') {
      const G = this.geo; if (!G) return; const f = k === 'zoomin' ? 1.4 : 1 / 1.4, tc = this.tickAt(G.w / 2);
      this.ppt = clamp(this.ppt * f, 2 * UIK / song.ppq, 400 * UIK / song.ppq); this.x0 = tc - (G.w / 2 - G.keyW) / this.ppt;
    } else if (!tr) return;
    else if (k === 'all') { this.sel = new Set(tr.notes); }
    else if (k === 'copy') { this.clip = notesCopy(sel); toast(sel.length ? 'Copied ' + sel.length + ' note' + (sel.length > 1 ? 's' : '') + '.' : 'Select some notes first.', 1800); }
    else if (k === 'paste') { if (!this.clip) return toast('Copy some notes first.', 2000); this.edit(() => { this.sel = new Set(notesPaste(tr, this.clip, ph())); }); }
    else if (k === 'dup') { if (!sel.length) return toast('Select some notes first.', 2000); const c = notesCopy(sel), at = Math.max.apply(null, sel.map(n => n.tick + n.dur)); this.edit(() => { this.sel = new Set(notesPaste(tr, c, at)); }); }
    else if (k === 'del') { if (!sel.length) return; this.edit(() => { const set = new Set(sel); tr.notes = tr.notes.filter(n => !set.has(n)); this.sel.clear(); }); }
    else if (k === 'up' || k === 'down' || k === 'octup' || k === 'octdown') {
      if (!sel.length) return toast('Select some notes first.', 2000);
      const d = (k === 'up' ? 1 : k === 'down' ? -1 : k === 'octup' ? 12 : -12); this.edit(() => notesTranspose(sel, d)); this.audition(sel[0].midi, sel[0].vel, sel[0].ch);
    } else if (k === 'quant') {
      if (g <= 1) return toast('Choose a grid first (not "No snap").', 2200);
      this.edit(() => notesQuantize(sel.length ? sel : tr.notes, g));
    } else if (k === 'left' || k === 'right') {
      if (!sel.length) return; const d = k === 'left' ? -g : g; this.edit(() => { const m = Math.min.apply(null, sel.map(n => n.tick)); const dd = Math.max(d, -m); sel.forEach(n => { n.tick += dd; }); });
    }
  },
  key(e) {
    if (!this.on || UI.screen !== 'seq' || !this.song) return;
    const t = e.target && e.target.tagName, mod = e.ctrlKey || e.metaKey, k = e.key; let a = null;
    const history = mod && /^[zy]$/i.test(k) && t !== 'TEXTAREA' && !(t === 'INPUT' && /^(text|search|number)$/.test(e.target.type));   // a dropdown or checkbox keeps focus after use: undo must still work
    if ((t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA') && !history) return;
    if (k === 'Delete' || k === 'Backspace') a = 'del';
    else if (mod && k.toLowerCase() === 'z') a = e.shiftKey ? 'redo' : 'undo';
    else if (mod && k.toLowerCase() === 'y') a = 'redo';
    else if (mod && k.toLowerCase() === 'a') a = 'all';
    else if (mod && k.toLowerCase() === 'c') a = 'copy';
    else if (mod && k.toLowerCase() === 'v') a = 'paste';
    else if (mod && k.toLowerCase() === 'd') a = 'dup';
    else if (k === 'ArrowUp') a = e.shiftKey ? 'octup' : 'up';
    else if (k === 'ArrowDown') a = e.shiftKey ? 'octdown' : 'down';
    else if (k === 'ArrowLeft') a = 'left';
    else if (k === 'ArrowRight') a = 'right';
    if (a) { e.preventDefault(); this.act(a); }
  },
  /* ---- pointer ---- */
  pos(e) { const r = $('#edCv').getBoundingClientRect(); return { px: e.clientX - r.left, py: e.clientY - r.top }; },
  hit(px, py) {
    const tr = this.track, G = this.geo; if (!tr) return null;
    for (let i = tr.notes.length - 1; i >= 0; i--) {
      const n = tr.notes[i], x = this.X(n.tick), w = Math.max(3, n.dur * this.ppt), y = this.Y(n.midi);
      if (px >= x - 2 && px <= x + w + 2 && py >= y && py < y + G.rh) return { n, edge: w > 10 && px > x + w - Math.min(10 * UIK, w * 0.4) };
    }
    return null;
  },
  velHit(px) {
    const tr = this.track; let best = null, bd = 12 * UIK;
    if (tr) tr.notes.forEach(n => { const d = Math.abs(this.X(n.tick) + 1 - px); if (d <= bd) { bd = d; best = n; } });
    return best;
  },
  setVel(py) {
    const d = this.drag, G = this.geo, v = clamp(Math.round((G.h - 4 - py) / (G.velH - 8) * 127), 1, 127), delta = v - d.base;
    this.mark(); d.orig.forEach(o => { o.n.vel = clamp(o.vel + delta, 1, 127); }); this.lastVel = d.note.vel;
  },
  laneDown(px, py, tick, snap) {
    const tr = this.track, cc = this.laneCc(), now = performance.now();
    if (this.ltap && now - this.ltap.t < 350 && Math.abs(this.ltap.px - px) < 10 * UIK) { this.ltap = null; this.edit(() => songRemoveCtrl(tr, cc, tick, 12 * UIK / this.ppt)); return; }   // double-tap removes a point
    this.ltap = { t: now, px }; const g = this.grid, t0 = Math.max(0, g > 1 ? Math.round(tick / g) * g : Math.round(tick));
    this.drag = { mode: 'lane', snap, last: t0, cc, ch: this.chan(tr) }; this.laneSet(t0, py);
  },
  laneSet(t, py) { const d = this.drag; this.mark(); songSetCtrl(this.track, d.ch, d.cc, t, this.laneVal(py, d.cc)); },
  seekTo(tick) { Seq.seek(clamp(songSec(this.song, Math.max(0, tick)), 0, Seq.maxPos)); },
  down(e) {
    if (!this.song || !this.geo || Rec.state !== 'idle') return; const cv = $('#edCv'), G = this.geo, { px, py } = this.pos(e), tick = this.tickAt(px), midi = this.midiAt(py), tr = this.track;
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* the gesture still works while the pointer stays over the canvas */ } e.preventDefault();
    if (py < G.rulerH) { this.drag = { mode: 'seek' }; this.seekTo(tick); return; }
    if (px < G.keyW) { if (py < G.rulerH + G.noteH) this.audition(midi, 90, tr && tr.notes.length ? tr.notes[0].ch : 0); return; }
    if (!tr) return;
    const snap = songSnapshot(this.song);
    if (py >= G.h - G.velH) {
      if (this.lane !== 'vel') return this.laneDown(px, py, tick, snap);
      const n = this.velHit(px); if (!n) return;
      if (!this.sel.has(n)) { this.sel.clear(); this.sel.add(n); }
      this.drag = { mode: 'vel', snap, note: n, base: n.vel, orig: Array.from(this.sel).map(x => ({ n: x, vel: x.vel })) }; this.setVel(py); return;
    }
    const h = this.hit(px, py), now = performance.now();
    if (h) {
      if (this.tap && this.tap.n === h.n && now - this.tap.t < 350) { this.tap = null; this.sel = new Set([h.n]); this.act('del'); return; }
      this.tap = { n: h.n, t: now };
      if (e.shiftKey && this.sel.has(h.n)) { this.sel.delete(h.n); return; }
      if (!this.sel.has(h.n)) { if (!e.shiftKey) this.sel.clear(); this.sel.add(h.n); }
      this.drag = { mode: h.edge ? 'resize' : 'move', snap, t0: tick, m0: midi, lead: h.n, dm: 0, orig: Array.from(this.sel).map(n => ({ n, tick: n.tick, midi: n.midi, dur: n.dur })) };
      if (!h.edge) this.audition(h.n.midi, h.n.vel, h.n.ch);
      return;
    }
    this.tap = null;
    const dbl = this.tool === 'select' && this.etap && now - this.etap.t < 350 && Math.abs(this.etap.px - px) < 10 * UIK && Math.abs(this.etap.py - py) < 10 * UIK;   // select tool: double-tap empty space adds a note
    this.etap = dbl ? null : { t: now, px, py };
    if (this.tool === 'draw' || dbl) {
      const g = this.grid, ch = this.chan(tr);
      this.hist.push(snap);
      const n = { midi, tick: g > 1 ? Math.floor(tick / g) * g : Math.round(tick), dur: this.newDur(tick), vel: this.lastVel, ch };
      const extra = this.chordNotes(n).map(m => Object.assign({}, n, { midi: m })); tr.notes.push(n); extra.forEach(x => tr.notes.push(x)); this.sel = new Set([n].concat(extra));
      this.drag = { mode: 'draw', snap, pushed: true, n, extra, px0: px, grew: false }; this.audition(midi, n.vel, ch); extra.forEach((x, k) => setTimeout(() => this.audition(x.midi, n.vel, ch), 30 * (k + 1)));
    } else if (this.tool === 'select') {
      if (!e.shiftKey) this.sel.clear();
      this.drag = { mode: 'box', snap, x: px, y: py, cx: px, cy: py, add: e.shiftKey };
    } else this.drag = { mode: 'pan', snap, px, py, x0: this.x0, topM: this.topM };
  },
  move(e) {
    const d = this.drag; if (!d || !this.geo) return; const { px, py } = this.pos(e), tick = this.tickAt(px), g = this.grid, G = this.geo, tr = this.track;
    const step = v => g > 1 ? Math.round(v / g) * g : Math.round(v);
    if (d.mode === 'seek') this.seekTo(tick);
    else if (d.mode === 'vel') this.setVel(py);
    else if (d.mode === 'lane') {
      const stride = Math.max(g, Math.round(this.song.ppq / 16)), t = Math.max(0, g > 1 ? Math.round(tick / g) * g : Math.round(tick)), dir = Math.sign(t - d.last);
      if (dir) for (let k = d.last + dir * stride; dir * (k - t) < 0; k += dir * stride) this.laneSet(k, py);
      this.laneSet(t, py); d.last = t;
    }
    else if (d.mode === 'pan') { this.x0 = d.x0 - (px - d.px) / this.ppt; this.topM = d.topM + (py - d.py) / G.rh; }
    else if (d.mode === 'box') { d.cx = px; d.cy = py; }
    else if (d.mode === 'draw') {
      if (d.grew || Math.abs(px - d.px0) > 4 * UIK) { d.grew = true; d.n.dur = Math.max(g > 1 ? g : 1, step(tick - d.n.tick)); d.extra.forEach(x => { x.dur = d.n.dur; }); }
    } else if (d.mode === 'resize') {
      const nd = o => Math.max(Math.min(g, o.dur), step(o.tick + o.dur + tick - d.t0) - o.tick);   // the note's end snaps to the grid lines (bar lines too), not by a grid step from where it was
      if (!d.pushed && d.orig.every(o => nd(o) === o.dur)) return; this.mark();
      d.orig.forEach(o => { o.n.dur = nd(o); });
    } else if (d.mode === 'move') {
      let dT = step(tick - d.t0), dM = this.midiAt(py) - d.m0; if (!dT && !dM && !d.pushed) return;
      dT = Math.max(dT, -Math.min.apply(null, d.orig.map(o => o.tick)));
      dM = clamp(dM, -Math.min.apply(null, d.orig.map(o => o.midi)), 127 - Math.max.apply(null, d.orig.map(o => o.midi)));
      this.mark(); d.orig.forEach(o => { o.n.tick = o.tick + dT; o.n.midi = o.midi + dM; });
      if (dM !== d.dm) { d.dm = dM; this.audition(d.lead.midi, d.lead.vel, d.lead.ch); }
    }
    void tr;
  },
  up(e) {
    const d = this.drag; if (!d) return; this.drag = null;
    if (d.mode === 'box') {
      const x0 = Math.min(d.x, d.cx), x1 = Math.max(d.x, d.cx), y0 = Math.min(d.y, d.cy), y1 = Math.max(d.y, d.cy), tr = this.track;
      if (tr && (x1 - x0 > 3 || y1 - y0 > 3)) tr.notes.forEach(n => { const nx = this.X(n.tick), nw = Math.max(3, n.dur * this.ppt), ny = this.Y(n.midi); if (nx <= x1 && nx + nw >= x0 && ny <= y1 && ny + this.geo.rh >= y0) this.sel.add(n); });
    } else if (d.mode === 'draw') { this.lastDur = d.n.dur; this.commit(); }
    else if (d.pushed) { if (d.mode === 'resize') this.lastDur = d.lead ? d.lead.dur : this.lastDur; this.commit(); }
    void e;
  },
  wheel(e) {
    if (!this.geo) return; e.preventDefault(); const G = this.geo;
    if (e.ctrlKey || e.metaKey) {
      const { px } = this.pos(e), tk = this.tickAt(px); this.ppt = clamp(this.ppt * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 2 * UIK / this.song.ppq, 400 * UIK / this.song.ppq); this.x0 = tk - (px - G.keyW) / this.ppt;
    } else if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) this.x0 += (e.deltaX || e.deltaY) / this.ppt;
    else this.topM -= e.deltaY / G.rh;
  },
  /* ---- drawing ---- */
  draw() {
    if (!this.on || !Seq.song) return; const cv = $('#edCv'); if (!cv) return;
    if (this.song !== Seq.song) this.attach();
    const { g, w, h } = fitCanvas(cv); if (w < 40 || h < 80) return;
    const U = UIK, G = this.geo = { w, h, keyW: 36 * U, rulerH: 20 * U, velH: Math.max(46 * U, h * 0.2), rh: 13 * U }; G.noteH = h - G.rulerH - G.velH;
    if (this.needFit) this.fit();
    const song = this.song, tr = this.track, ppq = song.ppq, ph = songTick(song, Seq.pos());
    if (Seq.playing && !this.drag) { if (this.X(ph) > w - 8 || this.X(ph) < G.keyW) this.x0 = ph - (w - G.keyW) * 0.1 / this.ppt; }
    this.clampView();
    const X = t => this.X(t), Y = m => this.Y(m), left = this.tickAt(G.keyW), right = this.tickAt(w), bottom = G.rulerH + G.noteH, col = SEQ_COLORS[this.ti % SEQ_COLORS.length];
    g.fillStyle = '#141210'; g.fillRect(0, 0, w, h);
    // pitch rows and the key column
    g.save(); g.beginPath(); g.rect(0, G.rulerH, w, G.noteH); g.clip();
    g.font = '600 ' + Math.round(9 * U) + 'px sans-serif'; g.textBaseline = 'middle'; const scl = this.scaleInfo();
    for (let m = Math.min(127, Math.ceil(this.topM)); m >= 0; m--) {
      const y = Y(m); if (y > bottom) break;
      const blk = isBlack(m), pc = ((m - (scl ? scl.root : 0)) % 12 + 12) % 12, inSc = !scl || scl.set.has(pc);
      g.fillStyle = !inSc ? '#0b0a09' : blk ? '#100e0c' : '#1a1714'; g.fillRect(G.keyW, y, w - G.keyW, G.rh);
      if (scl && pc === 0) { g.fillStyle = 'rgba(255,179,71,.09)'; g.fillRect(G.keyW, y, w - G.keyW, G.rh); }
      g.fillStyle = blk ? '#26221e' : '#d8cfbd'; g.fillRect(0, y, G.keyW - 1, G.rh - 1);
      if (scl && !inSc) { g.fillStyle = 'rgba(0,0,0,.5)'; g.fillRect(0, y, G.keyW - 1, G.rh - 1); } else if (scl && pc === 0) { g.fillStyle = '#ffb347'; g.fillRect(G.keyW - 5, y + 2, 3, G.rh - 5); }
      if (m % 12 === 0) { g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(G.keyW, y + G.rh - 1, w - G.keyW, 1); g.fillStyle = '#24211e'; g.textAlign = 'left'; g.fillText(noteName(m), 3, y + G.rh / 2); }
    }
    g.restore();
    // grid
    g.save(); g.beginPath(); g.rect(G.keyW, G.rulerH, w - G.keyW, h - G.rulerH); g.clip();
    const gt = this.grid, stp = gt * Math.max(1, Math.ceil(5 / (gt * this.ppt)));
    for (let t = Math.floor(Math.max(0, left) / stp) * stp; t <= right; t += stp) { g.fillStyle = t % ppq === 0 ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.035)'; g.fillRect(Math.round(X(t)), G.rulerH, 1, G.noteH); }
    const bars = songBarLines(song, Math.max(0, left), right);
    bars.forEach(b => { g.fillStyle = 'rgba(255,255,255,.2)'; g.fillRect(Math.round(X(b.tick)), G.rulerH, 1, h - G.rulerH); });
    if (Seq.loopA != null) { const x0 = X(songTick(song, Seq.loopA)), x1 = X(songTick(song, Seq.loopB)); g.fillStyle = Seq.loop ? 'rgba(255,179,71,.10)' : 'rgba(180,180,190,.06)'; g.fillRect(x0, G.rulerH, x1 - x0, h - G.rulerH); g.fillStyle = Seq.loop ? '#ffb347' : '#8a8a96'; g.fillRect(x0, G.rulerH - 4, x1 - x0, 3); }
    g.restore();
    // notes
    g.save(); g.beginPath(); g.rect(G.keyW, G.rulerH, w - G.keyW, G.noteH); g.clip();
    song.tracks.forEach((t, ti) => {
      if (ti === this.ti || !this.ghost) return; g.globalAlpha = 0.28; g.fillStyle = SEQ_COLORS[ti % SEQ_COLORS.length];
      t.notes.forEach(n => { const x = X(n.tick), nw = Math.max(2, n.dur * this.ppt); if (x + nw < G.keyW || x > w) return; const y = Y(n.midi); if (y + G.rh < G.rulerH || y > bottom) return; g.fillRect(x, y + 1, nw, G.rh - 2); });
      g.globalAlpha = 1;
    });
    if (tr) tr.notes.forEach(n => {
      const x = X(n.tick), nw = Math.max(3, n.dur * this.ppt); if (x + nw < G.keyW || x > w) return; const y = Y(n.midi); if (y + G.rh < G.rulerH || y > bottom) return;
      const on = this.sel.has(n); g.globalAlpha = 0.55 + 0.45 * (n.vel || 90) / 127; g.fillStyle = col; g.fillRect(x, y + 1, nw, G.rh - 2); g.globalAlpha = 1;
      if (on) { g.strokeStyle = '#fff'; g.lineWidth = 2; g.strokeRect(x + 1, y + 2, Math.max(1, nw - 2), G.rh - 4); }
      else { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(x, y + 1, 1, G.rh - 2); }
    });
    if (Rec.state === 'rec' && Rec.song === song && Rec.src === 'keys') Rec.live().forEach(n => { const x = X(n.tick), nw = Math.max(3, n.dur * this.ppt), y = Y(n.midi); g.fillStyle = '#ff5a4a'; g.fillRect(x, y + 1, nw, G.rh - 2); });
    const d = this.drag; if (d && d.mode === 'box') { g.fillStyle = 'rgba(255,179,71,.15)'; g.strokeStyle = '#ffb347'; g.lineWidth = 1; g.fillRect(d.x, d.y, d.cx - d.x, d.cy - d.y); g.strokeRect(d.x, d.y, d.cx - d.x, d.cy - d.y); }
    g.restore();
    // velocity lane
    const vy = h - G.velH; g.fillStyle = '#0f0d0b'; g.fillRect(0, vy, w, G.velH); g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(0, vy, w, 1);
    g.fillStyle = '#8a7c62'; g.font = '600 ' + Math.round(9 * U) + 'px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'top'; g.fillText(this.laneLabel(), 4, vy + 4);
    g.save(); g.beginPath(); g.rect(G.keyW, vy, w - G.keyW, G.velH); g.clip();
    if (tr && this.lane === 'vel') tr.notes.forEach(n => { const x = X(n.tick); if (x < G.keyW - 4 || x > w) return; const bh = (n.vel || 90) / 127 * (G.velH - 8); g.fillStyle = this.sel.has(n) ? '#fff' : col; g.fillRect(x, h - 4 - bh, Math.max(3, 3 * U), bh); });
    else if (tr) {
      const cc = this.laneCc(), max = cc === 'bend' ? 16383 : 127, ev = songCtrlEvents(tr, cc), ly = v => h - 4 - v / max * (G.velH - 8);
      if (cc === 'bend') { g.fillStyle = 'rgba(255,255,255,.1)'; g.fillRect(G.keyW, Math.round(ly(8192)), w - G.keyW, 1); }
      if (ev.length) {
        g.strokeStyle = col; g.lineWidth = 2; g.beginPath(); g.moveTo(X(ev[0].tick), ly(ev[0].val));
        for (let i = 1; i < ev.length; i++) { g.lineTo(X(ev[i].tick), ly(ev[i - 1].val)); g.lineTo(X(ev[i].tick), ly(ev[i].val)); }
        g.lineTo(w, ly(ev[ev.length - 1].val)); g.stroke(); g.fillStyle = '#fff'; ev.forEach(e => { g.fillRect(X(e.tick) - 2, ly(e.val) - 2, 5, 5); });
      }
    }
    g.restore();
    // ruler and playhead
    g.fillStyle = '#26221e'; g.fillRect(0, 0, w, G.rulerH); g.fillStyle = '#d8cfbd'; g.font = '600 ' + Math.round(10 * U) + 'px sans-serif'; g.textAlign = 'left'; g.textBaseline = 'middle';
    bars.forEach(b => { const x = X(b.tick); g.fillRect(Math.round(x), G.rulerH - 6 * U, 1, 6 * U); g.fillText(String(b.bar), x + 3, G.rulerH / 2 - 1); });
    const px = X(ph); if (px >= G.keyW && px <= w) { g.fillStyle = '#ffb347'; g.fillRect(Math.round(px) - 1, 0, 2, h); }
    // controls
    const sc = $('#edScroll'); if (!this.drag || this.drag.mode !== 'seek') { sc.max = String(Math.round(songEndTick(song) + ppq * 16)); sc.value = String(Math.round(this.x0)); }
    this.syncFields();
    const rb = $('#edRec'); rb.classList.toggle('on', Rec.state !== 'idle'); const rt = Rec.state === 'idle' ? '● Rec' : Rec.state === 'count' ? '■ Count-in…' : '■ Stop'; if (rb.textContent !== rt) rb.textContent = rt;
    $('[data-ed=undo]').disabled = !this.hist.canUndo; $('[data-ed=redo]').disabled = !this.hist.canRedo;
  }
};

