"use strict";
/* ---- Editable song model (ticks, so a file can be edited and written back) ----
   Song: {name, ppq, tempos:[{tick,us}], timeSigs:[{tick,num,den}], keySigs:[{tick,sf,mi}],
          tracks:[{name, notes:[{midi,tick,dur,vel,ch}], ctrl:[{tick,ch,cc,val}], bends:[{tick,ch,val}], progs:[{tick,ch,val}], meta:[{tick,type,data}]}]}
   Times are in ticks (ppq ticks per quarter note). tempos and timeSigs always start at tick 0. meta keeps text, lyric, marker and cue events. */
function newSong(ppq) {
  return { name: '', ppq: ppq || 480, tempos: [{ tick: 0, us: 500000 }], timeSigs: [{ tick: 0, num: 4, den: 4 }], keySigs: [], markers: [], tracks: [] };
}
let SONG_ID = 1;   // every track gets an id that is not written to the file, so the mixer can tell tracks apart after they are reordered or restored by undo
function newSongTrack(name) { return { id: SONG_ID++, name: name || '', notes: [], ctrl: [], bends: [], progs: [], meta: [] }; }
function parseSong(u8) {
  let p = 0;
  const tag = () => String.fromCharCode(u8[p], u8[p + 1], u8[p + 2], u8[p + 3]);
  const r32 = () => { const v = ((u8[p] << 24) | (u8[p + 1] << 16) | (u8[p + 2] << 8) | u8[p + 3]) >>> 0; p += 4; return v; };
  const r16 = () => { const v = (u8[p] << 8) | u8[p + 1]; p += 2; return v; };
  if (u8.length < 14 || tag() !== 'MThd') throw new Error('That does not look like a MIDI file.');
  p = 4; const hl = r32(); r16(); const ntr = r16(), div = r16(); p = 8 + hl;
  if (div & 0x8000 || !div) throw new Error('This MIDI file uses a timing format that is not supported.');
  const song = newSong(div); song.tempos = []; song.timeSigs = [];
  const text = (a, b) => String.fromCharCode.apply(null, Array.from(u8.subarray(a, b))).replace(/[^\x20-\x7e]/g, '').trim();
  for (let t = 0; t < ntr && p + 8 <= u8.length; t++) {
    const id = tag(); p += 4; const len = r32(), end = Math.min(u8.length, p + len);
    if (id !== 'MTrk') { p = end; continue; }
    const vlq = () => { let v = 0, b; do { b = u8[p++]; v = v * 128 + (b & 0x7f); } while ((b & 0x80) && p < end); return v; };
    const tr = newSongTrack(''); let tick = 0, run = 0; const open = {};
    while (p < end) {
      tick += vlq();
      let st = u8[p];
      if (st < 0x80) st = run; else { p++; if (st < 0xf0) run = st; }
      if (st === 0xff) {
        const type = u8[p++], l = vlq();
        if (type === 0x51 && l === 3) song.tempos.push({ tick, us: (u8[p] << 16) | (u8[p + 1] << 8) | u8[p + 2] });
        else if (type === 0x58 && l >= 2) song.timeSigs.push({ tick, num: u8[p], den: Math.pow(2, u8[p + 1]) });
        else if (type === 0x59 && l >= 2) song.keySigs.push({ tick, sf: (u8[p] << 24) >> 24, mi: u8[p + 1] ? 1 : 0 });
        else if (type === 0x03) { if (!tr.name) tr.name = text(p, p + l); }
        else if (type === 0x06) (song.markers = song.markers || []).push({ tick, name: text(p, p + l) });
        else if (type === 0x01 || type === 0x05 || type === 0x07) tr.meta.push({ tick, type, data: Array.from(u8.subarray(p, p + l)) });
        p += l;
      } else if (st === 0xf0 || st === 0xf7) { p += vlq(); }
      else {
        const hi = st & 0xf0, ch = st & 15, c1 = u8[p++], c2 = (hi === 0xc0 || hi === 0xd0) ? 0 : u8[p++];
        const key = ch * 128 + c1;
        if (hi === 0x90 && c2 > 0) (open[key] = open[key] || []).push({ tick, vel: c2 });
        else if (hi === 0x80 || hi === 0x90) {
          const a = open[key];
          if (a && a.length) { const o = a.shift(); tr.notes.push({ midi: c1, tick: o.tick, dur: Math.max(1, tick - o.tick), vel: o.vel, ch }); }
        } else if (hi === 0xc0) tr.progs.push({ tick, ch, val: c1 });
        else if (hi === 0xb0) tr.ctrl.push({ tick, ch, cc: c1, val: c2 });
        else if (hi === 0xe0) tr.bends.push({ tick, ch, val: c1 | (c2 << 7) });
      }
    }
    Object.keys(open).forEach(key => open[key].forEach(o => tr.notes.push({ midi: key % 128, tick: o.tick, dur: Math.max(1, tick - o.tick), vel: o.vel, ch: Math.floor(key / 128) })));   // notes never switched off end with the track
    p = end;
    tr.notes.sort((a, b) => a.tick - b.tick || a.midi - b.midi);
    if (!song.tracks.length && !song.name && !tr.notes.length && !tr.ctrl.length && !tr.bends.length && !tr.progs.length) { song.name = tr.name; continue; }   // conductor track
    song.tracks.push(tr);
  }
  const clean = (arr, def) => { arr.sort((a, b) => a.tick - b.tick); const o = []; arr.forEach(e => { if (o.length && o[o.length - 1].tick === e.tick) o[o.length - 1] = e; else o.push(e); }); if (!o.length || o[0].tick > 0) o.unshift(Object.assign({ tick: 0 }, def)); return o; };
  song.tempos = clean(song.tempos, { us: 500000 }); song.timeSigs = clean(song.timeSigs, { num: 4, den: 4 }); song.keySigs.sort((a, b) => a.tick - b.tick); song.markers.sort((a, b) => a.tick - b.tick);
  return song;
}
/* Standard MIDI File, type 1: a conductor track (name, tempo, time and key signature) and then one track per song track. */
function writeSong(song) {
  const out = [];
  const w32 = v => out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255), w16 = v => out.push((v >> 8) & 255, v & 255);
  const vlq = (v, b) => { v = Math.max(0, Math.round(v)) >>> 0; const s = [v & 127]; for (v >>>= 7; v; v >>>= 7) s.unshift((v & 127) | 128); for (let i = 0; i < s.length; i++) b.push(s[i]); };
  const meta = (tick, ord, type, data) => { const b = [0xff, type]; vlq(data.length, b); data.forEach(x => b.push(x & 255)); return { tick: Math.max(0, Math.round(tick)), ord, bytes: b }; };
  const str = s => Array.from(String(s || '')).map(c => c.charCodeAt(0) & 255);
  const clamp7 = v => Math.max(0, Math.min(127, Math.round(v)));
  const chunk = evs => {
    evs.sort((a, b) => a.tick - b.tick || a.ord - b.ord);
    const b = []; let last = 0;
    evs.forEach(e => { vlq(e.tick - last, b); e.bytes.forEach(x => b.push(x)); last = e.tick; });
    b.push(0, 0xff, 0x2f, 0); return b;
  };
  const cond = [];
  if (song.name) cond.push(meta(0, 0, 0x03, str(song.name)));
  song.tempos.forEach(t => cond.push(meta(t.tick, 1, 0x51, [(t.us >> 16) & 255, (t.us >> 8) & 255, t.us & 255])));
  song.timeSigs.forEach(t => cond.push(meta(t.tick, 1, 0x58, [t.num, Math.round(Math.log2(t.den)), 24, 8])));
  song.keySigs.forEach(k => cond.push(meta(k.tick, 1, 0x59, [k.sf & 255, k.mi ? 1 : 0])));
  (song.markers || []).forEach(m => cond.push(meta(m.tick, 1, 0x06, str(m.name))));
  const chunks = [chunk(cond)];
  song.tracks.forEach(tr => {
    const ev = [], ev1 = (tick, ord, bytes) => ev.push({ tick: Math.max(0, Math.round(tick)), ord, bytes });
    if (tr.name) ev.push(meta(0, 0, 0x03, str(tr.name)));
    tr.meta.forEach(m => ev.push(meta(m.tick, 1, m.type, m.data)));
    tr.progs.forEach(e => ev1(e.tick, 2, [0xc0 | (e.ch & 15), clamp7(e.val)]));
    tr.ctrl.forEach(e => ev1(e.tick, 3, [0xb0 | (e.ch & 15), clamp7(e.cc), clamp7(e.val)]));
    tr.bends.forEach(e => { const v = Math.max(0, Math.min(16383, Math.round(e.val))); ev1(e.tick, 4, [0xe0 | (e.ch & 15), v & 127, v >> 7]); });
    tr.notes.forEach(n => {
      const ch = n.ch & 15, k = clamp7(n.midi), dur = Math.max(1, Math.round(n.dur));
      ev1(n.tick + dur, 5, [0x80 | ch, k, 0]); ev1(n.tick, 6, [0x90 | ch, k, Math.max(1, clamp7(n.vel == null ? 90 : n.vel))]);   // off sorts before on at the same tick, so repeated notes stay separate
    });
    chunks.push(chunk(ev));
  });
  out.push(0x4d, 0x54, 0x68, 0x64); w32(6); w16(1); w16(chunks.length); w16(song.ppq);
  chunks.forEach(c => { out.push(0x4d, 0x54, 0x72, 0x6b); w32(c.length); for (let i = 0; i < c.length; i++) out.push(c[i]); });
  return Uint8Array.from(out);
}
/* Tempo segments with the time in seconds at each change, for tick <-> second conversion. */
function songSegs(song) {
  const segs = [{ tick: 0, us: 500000, sec: 0 }];
  song.tempos.slice().sort((a, b) => a.tick - b.tick).forEach(tp => {
    const l = segs[segs.length - 1];
    if (tp.tick === l.tick) { l.us = tp.us; return; }
    segs.push({ tick: tp.tick, us: tp.us, sec: l.sec + (tp.tick - l.tick) * l.us / 1e6 / song.ppq });
  });
  return segs;
}
function songSec(song, tick, segs) {
  segs = segs || songSegs(song); let i = segs.length - 1; while (i > 0 && segs[i].tick > tick) i--;
  return segs[i].sec + (tick - segs[i].tick) * segs[i].us / 1e6 / song.ppq;
}
function songTick(song, sec, segs) {
  segs = segs || songSegs(song); let i = segs.length - 1; while (i > 0 && segs[i].sec > sec) i--;
  return segs[i].tick + (sec - segs[i].sec) * 1e6 * song.ppq / segs[i].us;
}
/* Controller curves of one channel, in seconds: vol (CC 7 x CC 11, squared like General MIDI, 0..1), pan (CC 10, -1..1) and bend (pitch wheel as cents, +-200 at full deflection).
   A curve is an empty array when the channel has no such events. */
function songAutomation(song, tr, ch, segs) {
  const sec = t => songSec(song, t, segs), vol = [], pan = [], bend = [];
  let v7 = 127, v11 = 127;
  tr.ctrl.filter(e => e.ch === ch && (e.cc === 7 || e.cc === 10 || e.cc === 11)).sort((a, b) => a.tick - b.tick).forEach(e => {
    if (e.cc === 10) pan.push({ t: sec(e.tick), v: clamp((e.val - 64) / 63, -1, 1) });
    else { if (e.cc === 7) v7 = e.val; else v11 = e.val; vol.push({ t: sec(e.tick), v: Math.pow(v7 / 127, 2) * Math.pow(v11 / 127, 2) }); }
  });
  tr.bends.filter(e => e.ch === ch).sort((a, b) => a.tick - b.tick).forEach(e => bend.push({ t: sec(e.tick), c: (e.val - 8192) / 8192 * 200 }));
  return { vol, pan, bend };
}
/* The shape parseMidi returns (seconds, one unit per track and channel), so playback and "sing it" can use an edited song.
   A note released while the sustain pedal (CC 64) is down gets `sus`: how long it really sounds, until the pedal comes up (at most 16 beats). A unit with volume, pan or bend events gets `auto`. */
function songToUnits(song) {
  const segs = songSegs(song), units = [];
  song.tracks.forEach((tr, ti) => {
    const byCh = {}; tr.notes.forEach(n => (byCh[n.ch] = byCh[n.ch] || []).push(n));
    Object.keys(byCh).forEach(ch => {
      const pr = tr.progs.filter(e => e.ch === +ch).sort((a, b) => a.tick - b.tick)[0], bk = tr.ctrl.filter(e => e.ch === +ch && e.cc === 0).sort((a, b) => a.tick - b.tick)[0];
      const pedal = +ch === 9 ? [] : tr.ctrl.filter(e => e.ch === +ch && e.cc === 64).sort((a, b) => a.tick - b.tick);
      const u = { ti, tid: tr.id, name: tr.name, ch: +ch, drums: +ch === 9, program: pr ? pr.val : 0, bank: bk ? bk.val : 0,
        notes: byCh[ch].map(n => {
          const s = songSec(song, n.tick, segs), o = { midi: n.midi, start: s, dur: songSec(song, n.tick + n.dur, segs) - s, vel: n.vel }, end = n.tick + n.dur;
          if (pedal.length) {
            let i = -1; for (let k = 0; k < pedal.length && pedal[k].tick <= end; k++) i = k;
            if (i >= 0 && pedal[i].val >= 64) {
              let rel = end + song.ppq * 16; for (let k = i + 1; k < pedal.length; k++) if (pedal[k].val < 64) { rel = Math.min(rel, pedal[k].tick); break; }
              if (rel > end) o.sus = songSec(song, rel, segs) - s;
            }
          }
          return o;
        }).sort((a, b) => a.start - b.start) };
      const au = songAutomation(song, tr, +ch, segs); if (au.vol.length || au.pan.length || au.bend.length) u.auto = au;
      units.push(u);
    });
  });
  return { bpm: Math.round(60e6 / song.tempos[0].us), units };
}
/* MP3 through lamejs, loaded the first time it is needed. */
async function encodeMp3(chans, sr) {
  if (typeof lamejs === 'undefined') await new Promise((ok, no) => { const el = document.createElement('script'); el.src = 'lame.min.js'; el.onload = ok; el.onerror = () => no(new Error('could not load the MP3 encoder')); document.head.appendChild(el); });
  const pcm = c => { const o = new Int16Array(c.length); for (let i = 0; i < c.length; i++) o[i] = Math.max(-1, Math.min(1, c[i])) * 32767; return o; };
  const L = pcm(chans[0]), R = pcm(chans[1] || chans[0]), enc = new lamejs.Mp3Encoder(2, sr, 192), parts = [];
  for (let i = 0; i < L.length; i += 1152 * 64) { const b = enc.encodeBuffer(L.subarray(i, i + 1152 * 64), R.subarray(i, i + 1152 * 64)); if (b.length) parts.push(b); }
  const tail = enc.flush(); if (tail.length) parts.push(tail);
  const bytes = new Uint8Array(parts.reduce((a, b) => a + b.length, 0)); let o = 0; parts.forEach(b => { bytes.set(b, o); o += b.length; });
  return bytes;
}
/* 16-bit PCM WAV file from one or two channels of floats (-1..1). */
function encodeWav(chans, sr) {
  const nch = chans.length, n = chans[0].length, bytes = 44 + n * nch * 2, u8 = new Uint8Array(bytes), dv = new DataView(u8.buffer);
  const str = (o, t) => { for (let i = 0; i < t.length; i++) dv.setUint8(o + i, t.charCodeAt(i)); };
  str(0, 'RIFF'); dv.setUint32(4, bytes - 8, true); str(8, 'WAVE'); str(12, 'fmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, nch, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * nch * 2, true); dv.setUint16(32, nch * 2, true); dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, n * nch * 2, true);
  let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < nch; c++) { const x = Math.max(-1, Math.min(1, chans[c][i])); dv.setInt16(o, Math.round(x < 0 ? x * 32768 : x * 32767), true); o += 2; }
  return u8;
}
/* Index just after the last sample louder than the threshold (0 if the audio is silent): used to cut the silent tail off a render. */
function lastLoud(chans, thresh) { for (let i = chans[0].length - 1; i >= 0; i--) for (let c = 0; c < chans.length; c++) if (Math.abs(chans[c][i]) > thresh) return i + 1; return 0; }

/* ---- Song editing (pure helpers, no DOM) ---- */
/* Grid size in ticks for a division (4 = quarter, 8 = eighth, 12 = eighth triplet, 16 = sixteenth...). 0 = no snapping. */
function gridTicks(song, div) { return div ? Math.max(1, Math.round(song.ppq * 4 / div)) : 1; }
function snapTick(tick, g) { return Math.max(0, Math.round(tick / g) * g); }
/* Undo/redo keep whole-song snapshots (JSON text), so every kind of edit can be undone the same way. */
function songSnapshot(song) { return JSON.stringify(song); }
function songRestore(song, snap) { const o = JSON.parse(snap); Object.keys(song).forEach(k => { delete song[k]; }); Object.assign(song, o); }
class EditHistory {
  constructor(limit) { this.undos = []; this.redos = []; this.limit = limit || 60; }
  /* Call with the snapshot taken BEFORE a change. */
  push(snap) { this.undos.push(snap); if (this.undos.length > this.limit) this.undos.shift(); this.redos = []; }
  undo(cur) { if (!this.undos.length) return null; this.redos.push(cur); return this.undos.pop(); }
  redo(cur) { if (!this.redos.length) return null; this.undos.push(cur); return this.redos.pop(); }
  get canUndo() { return this.undos.length > 0; }
  get canRedo() { return this.redos.length > 0; }
}
function sortNotes(track) { track.notes.sort((a, b) => a.tick - b.tick || a.midi - b.midi); }
/* Moves notes by whole semitones, never past the MIDI range. Returns the shift that was applied. */
function notesTranspose(notes, d) {
  if (!notes.length) return 0;
  const lo = Math.min.apply(null, notes.map(n => n.midi)), hi = Math.max.apply(null, notes.map(n => n.midi));
  d = Math.max(-lo, Math.min(127 - hi, d)); notes.forEach(n => { n.midi += d; }); return d;
}
/* Mirrors pitches around the middle of the notes' range, so the top note swaps with the bottom one. */
function notesFlip(notes) {
  if (!notes.length) return;
  const s = Math.min.apply(null, notes.map(n => n.midi)) + Math.max.apply(null, notes.map(n => n.midi)); notes.forEach(n => { n.midi = s - n.midi; });
}
/* Mirrors the notes in time between the first start and the last end, so the last note plays first. */
function notesReverse(notes) {
  if (!notes.length) return;
  const s = Math.min.apply(null, notes.map(n => n.tick)) + Math.max.apply(null, notes.map(n => n.tick + n.dur)); notes.forEach(n => { n.tick = s - n.tick - n.dur; });
}
/* Arpeggiates chords: every group of two or more notes that start together is replaced by one note per `step` ticks, cycling through its pitches in the chosen order
   ('up', 'down', 'updown' or 'random'; rnd gives numbers in [0,1)). Returns the notes to remove and the notes to add. */
function notesArp(notes, pattern, step, rnd) {
  rnd = rnd || Math.random; step = Math.max(1, Math.round(step));
  const by = new Map(); notes.forEach(n => { const k = n.tick + ':' + n.ch; if (!by.has(k)) by.set(k, []); by.get(k).push(n); });
  const del = [], add = [];
  by.forEach(g => {
    if (g.length < 2) return;
    const ps = Array.from(new Set(g.map(n => n.midi))).sort((a, b) => a - b); if (ps.length < 2) return;
    const dur = Math.max.apply(null, g.map(n => n.dur)), cnt = Math.max(1, Math.floor(dur / step)), base = g[0];
    let seq = ps; if (pattern === 'down') seq = ps.slice().reverse(); else if (pattern === 'updown') seq = ps.concat(ps.slice(1, -1).reverse());
    for (let i = 0; i < cnt; i++) {
      const m = pattern === 'random' ? ps[Math.floor(rnd() * ps.length)] : seq[i % seq.length];
      add.push(Object.assign({}, base, { midi: m, tick: base.tick + i * step, dur: i === cnt - 1 ? dur - i * step : step }));
    }
    g.forEach(n => del.push(n));
  });
  return { del, add };
}
/* Random small shifts of start time (up to `tickAmt` ticks either way) and velocity (up to `velAmt`), so a sequenced part sounds played. */
function notesHumanize(notes, tickAmt, velAmt, rnd) {
  rnd = rnd || Math.random;
  notes.forEach(n => { n.tick = Math.max(0, n.tick + Math.round((rnd() * 2 - 1) * tickAmt)); n.vel = Math.max(1, Math.min(127, Math.round((n.vel || 90) + (rnd() * 2 - 1) * velAmt))); });
}
/* Swing: notes on the off-beat steps of a grid of `step` ticks are delayed so the pair splits `ratio` : 1 - ratio (0.5 straight, about 0.67 triplet feel). */
function notesSwing(notes, step, ratio) {
  notes.forEach(n => { const k = Math.round(n.tick / step); if (k % 2 && Math.abs(n.tick - k * step) <= step / 4) n.tick = Math.max(0, Math.round((k - 1) * step + ratio * 2 * step + (n.tick - k * step))); });
}
/* Each note goes up an octave, down an octave or stays (as far as the MIDI range allows). */
function notesScatter(notes, rnd) {
  rnd = rnd || Math.random; notes.forEach(n => { const d = [-12, 0, 12][Math.floor(rnd() * 3)]; if (n.midi + d >= 0 && n.midi + d <= 127) n.midi += d; });
}
/* The pitches of a scale (set of semitone offsets from rootPc) between lo and hi, ascending. */
function scalePitches(set, rootPc, lo, hi) { const out = []; for (let m = Math.max(0, lo); m <= Math.min(127, hi); m++) if (set.has((((m - rootPc) % 12) + 12) % 12)) out.push(m); return out; }
/* Every note gets a random pitch of the scale within the range the notes cover (at least an octave). */
function notesRandomInScale(notes, set, rootPc, rnd) {
  if (!notes.length) return; rnd = rnd || Math.random;
  const lo = Math.min.apply(null, notes.map(n => n.midi)), hi = Math.max.apply(null, notes.map(n => n.midi)), ps = scalePitches(set, rootPc, lo, Math.max(hi, lo + 12)); if (!ps.length) return;
  notes.forEach(n => { n.midi = ps[Math.floor(rnd() * ps.length)]; });
}
/* Triads on scale degrees (0 = the key note), stacked thirds within the scale, voiced from the key note at or above `base`. Returns one array of pitches per degree. */
function progChords(set, rootPc, degrees, base) {
  const start = base + ((rootPc - base) % 12 + 12) % 12, ps = scalePitches(set, rootPc, start, start + 60), n = set.size;
  return degrees.map(d => { const k = ((d % n) + n) % n; return [ps[k], ps[k + 2], ps[k + 4]].filter(m => m != null); });
}
/* A short random melody in the scale: a gentle walk over scale steps with mixed note lengths, ending on the key note. Notes fill `bars` bars of `barLen` ticks from `tick`. */
function melodyIdea(set, rootPc, tick, ppq, bars, barLen, base, rnd) {
  rnd = rnd || Math.random; const ps = scalePitches(set, rootPc, base - 5, base + 14); if (ps.length < 3) return [];
  const lens = [ppq / 2, ppq / 2, ppq, ppq, ppq / 4 * 3, ppq * 2], total = bars * barLen, out = []; let t = 0, i = Math.min(ps.length - 1, Math.max(0, ps.findIndex(m => m >= base)));
  while (t < total) {
    let d = lens[Math.floor(rnd() * lens.length)]; d = Math.min(d, total - t); const last = total - t - d < ppq / 4;
    if (last) { const ti = ps.findIndex((m, j) => j >= i - 2 && ((m - rootPc) % 12 + 12) % 12 === 0); if (ti >= 0) i = ti; }
    out.push({ midi: ps[i], tick: tick + Math.round(t), dur: Math.max(1, Math.round(d * 0.9)), vel: 80 + Math.floor(rnd() * 25) });
    t += d; const r = rnd(); i = Math.max(0, Math.min(ps.length - 1, i + (r < 0.3 ? 1 : r < 0.6 ? -1 : r < 0.75 ? 2 : r < 0.9 ? -2 : 0)));
  }
  return out;
}
/* The name of the chord made by some MIDI pitches ('C', 'Am', 'G7', 'Dm7/F'...), or '' when they are not a chord I know. The lowest note decides which root is tried first. */
const CHORD_SHAPES = [['', [0, 4, 7]], ['m', [0, 3, 7]], ['7', [0, 4, 7, 10]], ['maj7', [0, 4, 7, 11]], ['m7', [0, 3, 7, 10]], ['dim', [0, 3, 6]], ['m7b5', [0, 3, 6, 10]], ['dim7', [0, 3, 6, 9]], ['aug', [0, 4, 8]], ['sus4', [0, 5, 7]], ['sus2', [0, 2, 7]], ['6', [0, 4, 7, 9]], ['m6', [0, 3, 7, 9]], ['add9', [0, 2, 4, 7]], ['5', [0, 7]]];
function chordName(midis) {
  const pcs = Array.from(new Set(midis.map(m => ((m % 12) + 12) % 12))); if (pcs.length < 2) return '';
  const bass = ((Math.min.apply(null, midis) % 12) + 12) % 12, roots = [bass].concat(pcs.filter(p => p !== bass));
  for (const r of roots) for (const [nm, iv] of CHORD_SHAPES) {
    if (iv.length !== pcs.length) continue; const set = new Set(iv.map(i => (r + i) % 12)); if (pcs.every(p => set.has(p))) return NOTE_NAMES[r] + nm + (r !== bass ? '/' + NOTE_NAMES[bass] : '');
  }
  return '';
}
/* Snaps note starts to the grid; durations stay (a note never gets shorter than one tick). */
function notesQuantize(notes, g) { notes.forEach(n => { n.tick = snapTick(n.tick, g); n.dur = Math.max(1, n.dur); }); }
/* Copies notes with their start relative to the earliest one. */
function notesCopy(notes) {
  if (!notes.length) return null; const t0 = Math.min.apply(null, notes.map(n => n.tick));
  return { items: notes.map(n => ({ midi: n.midi, dt: n.tick - t0, dur: n.dur, vel: n.vel, ch: n.ch })), span: Math.max.apply(null, notes.map(n => n.tick + n.dur)) - t0 };
}
/* Adds a copy of the clip to the track at the given tick; returns the new notes. */
function notesPaste(track, clip, tick) {
  if (!clip) return []; const made = clip.items.map(c => ({ midi: c.midi, tick: tick + c.dt, dur: c.dur, vel: c.vel, ch: c.ch }));
  made.forEach(n => track.notes.push(n)); sortNotes(track); return made;
}
/* ---- Split, glue, legato and velocity shaping ---- */
/* Cuts every note that spans the tick into two; returns the new right-hand halves. */
function notesSplit(track, notes, at) {
  const made = []; notes.forEach(n => { if (n.tick < at && n.tick + n.dur > at) { const r = Object.assign({}, n, { tick: at, dur: n.tick + n.dur - at }); n.dur = at - n.tick; made.push(r); } });
  made.forEach(n => track.notes.push(n)); sortNotes(track); return made;
}
/* Joins the selected notes of the same pitch and channel into one long note each (from the first start to the last end). Returns the notes that remain. */
function notesGlue(track, notes) {
  const groups = {}; notes.forEach(n => { (groups[n.ch + ':' + n.midi] = groups[n.ch + ':' + n.midi] || []).push(n); });
  const gone = new Set(), kept = [];
  Object.keys(groups).forEach(k => {
    const a = groups[k].sort((x, y) => x.tick - y.tick), first = a[0]; if (a.length < 2) return kept.push(first);
    first.dur = Math.max.apply(null, a.map(n => n.tick + n.dur)) - first.tick; a.slice(1).forEach(n => gone.add(n)); kept.push(first);
  });
  track.notes = track.notes.filter(n => !gone.has(n)); return kept;
}
/* Stretches each note up to the next start among the selected notes (chords move together); the last note stays as it is. */
function notesLegato(notes) {
  const starts = Array.from(new Set(notes.map(n => n.tick))).sort((a, b) => a - b);
  notes.forEach(n => { const nx = starts.find(t => t > n.tick); if (nx != null) n.dur = nx - n.tick; });
}
/* Multiplies velocities by pct/100 and adds `add`, keeping 1..127. */
function notesVelScale(notes, pct, add) { notes.forEach(n => { n.vel = Math.max(1, Math.min(127, Math.round((n.vel == null ? 90 : n.vel) * pct / 100 + (add || 0)))); }); }
/* Slides velocity from `from` at the earliest start to `to` at the latest start. */
function notesVelRamp(notes, from, to) {
  if (!notes.length) return; const t0 = Math.min.apply(null, notes.map(n => n.tick)), t1 = Math.max.apply(null, notes.map(n => n.tick));
  notes.forEach(n => { const f = t1 > t0 ? (n.tick - t0) / (t1 - t0) : 0; n.vel = Math.max(1, Math.min(127, Math.round(from + (to - from) * f))); });
}
/* ---- Bars: insert and delete time, markers, duplicate track ---- */
function songBarTicks(song, tick) { const ts = song.timeSigs.filter(x => x.tick <= tick).pop() || song.timeSigs[0]; return song.ppq * 4 * ts.num / ts.den; }
/* Length in ticks of n bars starting at the tick (which should be a bar start). */
function songBarSpan(song, at, n) { let len = 0; for (let i = 0; i < n; i++) len += songBarTicks(song, at + len); return len; }
function songMarkers(song) { return song.markers || (song.markers = []); }
function songSetMarker(song, tick, name) {
  tick = Math.max(0, Math.round(tick)); const a = songMarkers(song), i = a.findIndex(m => m.tick === tick);
  if (i >= 0) a[i].name = name; else a.push({ tick, name }); a.sort((x, y) => x.tick - y.tick);
}
function songRemoveMarker(song, tick) { const a = songMarkers(song), i = a.findIndex(m => m.tick === tick); if (i < 0) return false; a.splice(i, 1); return true; }
/* Opens a gap of `len` ticks at `at`: later notes, controllers, tempo, meter, key and markers move along. A note that spans `at` keeps its place. */
function songInsertTime(song, at, len) {
  if (len <= 0) return; const mv = e => { if (e.tick >= at) e.tick += len; }, mvAfter = e => { if (e.tick > at) e.tick += len; };
  song.tracks.forEach(t => { t.notes.forEach(mv); t.ctrl.forEach(mv); t.bends.forEach(mv); t.progs.forEach(e => { if (e.tick > at) e.tick += len; }); t.meta.forEach(mv); });
  song.tempos.forEach(mvAfter); song.timeSigs.forEach(mvAfter); song.keySigs.forEach(mvAfter); songMarkers(song).forEach(mv);
}
/* Removes the ticks [at, at+len): notes that start inside go, ones that run into it are shortened, everything after moves back. */
function songDeleteTime(song, at, len) {
  if (len <= 0) return; const end = at + len, mv = e => { if (e.tick >= end) e.tick -= len; }, inside = e => !(e.tick >= at && e.tick < end);
  song.tracks.forEach(t => {
    t.notes = t.notes.filter(inside); t.notes.forEach(n => { if (n.tick < at && n.tick + n.dur > at) n.dur = Math.max(1, n.tick + n.dur > end ? n.dur - len : at - n.tick); else mv(n); });
    ['ctrl', 'bends', 'meta'].forEach(f => { t[f] = t[f].filter(inside); t[f].forEach(mv); });
    t.progs.forEach(e => { if (e.tick >= at && e.tick < end && e.tick > 0) e.tick = at; else mv(e); });
  });
  const collapse = (arr, same) => {     // the setting in force where the cut ends carries on from the cut
    const eff = arr.filter(e => e.tick <= end).pop(), prev = arr.filter(e => e.tick < at).pop(), keep = arr.filter(e => e.tick < at || e.tick > end);
    keep.forEach(e => { if (e.tick > end) e.tick -= len; });
    if (eff && eff.tick >= at && !(prev && same(prev, eff))) keep.push(Object.assign({}, eff, { tick: at }));
    arr.length = 0; keep.sort((a, b) => a.tick - b.tick).forEach(e => arr.push(e));
  };
  collapse(song.tempos, (a, b) => a.us === b.us); collapse(song.timeSigs, (a, b) => a.num === b.num && a.den === b.den); collapse(song.keySigs, (a, b) => a.sf === b.sf && a.mi === b.mi);
  const mk = songMarkers(song); song.markers = mk.filter(inside); song.markers.forEach(mv);
}
/* A copy of the track right after it, on its own channel (drums stay on 10). Returns the new index, or -1. */
function songDuplicateTrack(song, ti) {
  const src = song.tracks[ti]; if (!src) return -1; const t = newSongTrack((src.name || 'Track ' + (ti + 1)) + ' copy');
  ['notes', 'ctrl', 'bends', 'progs', 'meta'].forEach(f => { t[f] = src[f].map(e => Object.assign({}, e, e.data ? { data: e.data.slice() } : null)); });
  const chs = songTrackChannels(t); if (chs.length === 1 && chs[0] !== 9) songSetChannel(t, songFreeChannel(song));
  song.tracks.splice(ti + 1, 0, t); return ti + 1;
}
function songEndTick(song) { let e = 0; song.tracks.forEach(t => t.notes.forEach(n => { if (n.tick + n.dur > e) e = n.tick + n.dur; })); return e; }
/* Bar lines between two ticks, following time-signature changes: [{tick, bar}] with bar counting from 1. */
function songBarLines(song, from, to) {
  const out = []; let bar = 1;
  for (let i = 0; i < song.timeSigs.length; i++) {
    const ts = song.timeSigs[i], len = song.ppq * 4 * ts.num / ts.den, end = i + 1 < song.timeSigs.length ? song.timeSigs[i + 1].tick : Infinity;
    if (!(len > 0)) continue;
    const k0 = Math.max(0, Math.ceil((from - ts.tick) / len));
    for (let k = k0, t = ts.tick + k * len; t < Math.min(end, to); k++, t = ts.tick + k * len) out.push({ tick: t, bar: bar + k });
    if (end !== Infinity) bar += Math.ceil((end - ts.tick) / len);
  }
  return out;
}
/* Beats between two ticks (from inclusive, to exclusive), following time-signature changes: [{tick, down}] where down marks the first beat of a bar. */
function songBeats(song, from, to) {
  const out = [];
  for (let i = 0; i < song.timeSigs.length; i++) {
    const ts = song.timeSigs[i], beat = song.ppq * 4 / ts.den, bar = beat * ts.num, end = i + 1 < song.timeSigs.length ? song.timeSigs[i + 1].tick : Infinity;
    if (!(beat > 0)) continue;
    for (let k = Math.max(0, Math.ceil((from - ts.tick) / beat - 1e-9)), t = ts.tick + k * beat; t < Math.min(end, to); k++, t = ts.tick + k * beat) out.push({ tick: t, down: (k * beat) % bar < 1e-6 });
  }
  return out;
}
/* Turns pitch frames [{t (seconds), m (fractional MIDI note, or null when unvoiced)}] into notes [{midi, start, dur}] in seconds.
   A note goes on while the pitch stays within `tol` semitones of its own middle; a new pitch must last 3 frames before it starts a new note (so a stray frame does not split a note);
   a silence longer than `gap` seconds ends it; notes shorter than `min` seconds are dropped. */
function framesToNotes(frames, o) {
  o = o || {}; const tol = o.tol || 0.7, gap = o.gap || 0.1, min = o.min || 0.1, step = o.step || 0.02, out = [];
  const med = a => { const s = a.slice().sort((x, y) => x - y); return s[s.length >> 1]; };
  let cur = null, off = [], last = 0;
  const mid = () => med(cur.ms.slice(-25));
  const close = end => { if (cur && end - cur.start >= min) out.push({ midi: Math.round(mid()), start: cur.start, dur: end - cur.start }); cur = null; off = []; };
  frames.forEach(f => {
    if (f.m == null) { if (cur && f.t - last > gap) close(last + step); return; }
    if (cur && Math.abs(f.m - mid()) > tol) {
      off.push(f); last = f.t;
      if (off.length >= 3) { const keep = off; close(keep[0].t); cur = { start: keep[0].t, ms: keep.map(x => x.m) }; off = []; }
      return;
    }
    off = [];
    if (!cur) cur = { start: f.t, ms: [] };
    cur.ms.push(f.m); last = f.t;
  });
  close(last + step);
  return out;
}
/* ---- Tracks, tempo, signatures and controllers (pure helpers) ---- */
function songTrackChannels(tr) { const s = new Set(); [tr.notes, tr.progs, tr.ctrl, tr.bends].forEach(a => a.forEach(e => s.add(e.ch))); return Array.from(s).sort((a, b) => a - b); }
function songFreeChannel(song) {
  const used = new Set(); song.tracks.forEach(t => songTrackChannels(t).forEach(c => used.add(c)));
  for (let c = 0; c < 16; c++) if (c !== 9 && !used.has(c)) return c;
  return 0;
}
/* Adds a track (default: the first unused channel, program 0) and returns its index. */
function songAddTrack(song, name, ch, program) {
  const t = newSongTrack(name); t.progs.push({ tick: 0, ch: ch == null ? songFreeChannel(song) : ch, val: program || 0 }); song.tracks.push(t); return song.tracks.length - 1;
}
function songDeleteTrack(song, ti) { if (ti < 0 || ti >= song.tracks.length) return false; song.tracks.splice(ti, 1); return true; }
/* Moves a track up (d = -1) or down (d = 1); returns its new index. */
function songMoveTrack(song, ti, d) {
  const to = ti + d; if (ti < 0 || ti >= song.tracks.length || to < 0 || to >= song.tracks.length) return ti;
  const t = song.tracks.splice(ti, 1)[0]; song.tracks.splice(to, 0, t); return to;
}
/* Sets the instrument a channel starts with (program change, and a bank select when bank is not 0). */
function songSetProgram(tr, ch, program, bank) {
  tr.progs = tr.progs.filter(e => e.ch !== ch || e.tick > 0); tr.progs.push({ tick: 0, ch, val: program });
  tr.ctrl = tr.ctrl.filter(e => !(e.ch === ch && e.cc === 0 && e.tick === 0)); if (bank) tr.ctrl.push({ tick: 0, ch, cc: 0, val: bank });
}
/* Moves everything in the track to another channel. Refuses (false) when the track already uses several channels. */
function songSetChannel(tr, ch) { if (songTrackChannels(tr).length > 1) return false; [tr.notes, tr.progs, tr.ctrl, tr.bends].forEach(a => a.forEach(e => { e.ch = ch; })); return true; }
function songTempoAt(song, tick) { let us = song.tempos[0].us; song.tempos.forEach(t => { if (t.tick <= tick) us = t.us; }); return us; }
function songSetTempo(song, tick, bpm) {
  tick = Math.max(0, Math.round(tick)); const us = clamp(Math.round(60e6 / bpm), 1, 0xffffff), i = song.tempos.findIndex(t => t.tick === tick);
  if (i >= 0) song.tempos[i].us = us; else song.tempos.push({ tick, us });
  song.tempos.sort((a, b) => a.tick - b.tick);
}
function songRemoveTempo(song, tick) { const i = song.tempos.findIndex(t => t.tick === tick); if (tick <= 0 || i < 0) return false; song.tempos.splice(i, 1); return true; }
/* The start of the bar that contains the tick. */
function songBarStart(song, tick) { const bars = songBarLines(song, 0, tick + 1); return bars.length ? bars[bars.length - 1].tick : 0; }
/* Time signatures only change at the start of a bar; returns the tick that was used. */
function songSetTimeSig(song, tick, num, den) {
  tick = songBarStart(song, tick); const i = song.timeSigs.findIndex(t => t.tick === tick);
  if (i >= 0) { song.timeSigs[i].num = num; song.timeSigs[i].den = den; } else song.timeSigs.push({ tick, num, den });
  song.timeSigs.sort((a, b) => a.tick - b.tick); return tick;
}
function songRemoveTimeSig(song, tick) { const i = song.timeSigs.findIndex(t => t.tick === tick); if (tick <= 0 || i < 0) return false; song.timeSigs.splice(i, 1); return true; }
const KEY_MAJOR = ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'], KEY_MINOR = ['Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#'];
function keyName(sf, mi) { const n = (mi ? KEY_MINOR : KEY_MAJOR)[sf + 7]; return n ? n + (mi ? ' minor' : ' major') : 'C major'; }
function songSetKey(song, sf, mi) { song.keySigs = song.keySigs.filter(k => k.tick > 0); song.keySigs.unshift({ tick: 0, sf, mi: mi ? 1 : 0 }); }
/* Controller events. cc is a controller number (7 volume, 64 sustain...) or 'bend' for pitch bend (0..16383, 8192 = centre). */
function songCtrlEvents(tr, cc) { return (cc === 'bend' ? tr.bends : tr.ctrl.filter(e => e.cc === cc)).slice().sort((a, b) => a.tick - b.tick); }
function songSetCtrl(tr, ch, cc, tick, val) {
  tick = Math.max(0, Math.round(tick)); const bend = cc === 'bend', arr = bend ? tr.bends : tr.ctrl, v = Math.round(clamp(val, 0, bend ? 16383 : 127));
  const e = arr.find(x => x.ch === ch && x.tick === tick && (bend || x.cc === cc));
  if (e) e.val = v; else { arr.push(bend ? { tick, ch, val: v } : { tick, ch, cc, val: v }); arr.sort((a, b) => a.tick - b.tick); }
}
/* Removes the controller event nearest to the tick, if one is within tol ticks. */
function songRemoveCtrl(tr, cc, tick, tol) {
  const arr = cc === 'bend' ? tr.bends : tr.ctrl; let best = -1, bd = tol;
  arr.forEach((e, i) => { if ((cc === 'bend' || e.cc === cc) && Math.abs(e.tick - tick) <= bd) { bd = Math.abs(e.tick - tick); best = i; } });
  if (best < 0) return false; arr.splice(best, 1); return true;
}
function songClearCtrl(tr, cc) { const arr = cc === 'bend' ? tr.bends : tr.ctrl, keep = arr.filter(e => !(cc === 'bend' || e.cc === cc)); const n = arr.length - keep.length; if (cc === 'bend') tr.bends = []; else tr.ctrl = keep; return n; }
/* A fresh song with one piano track. */
function songNew(name) { const s = newSong(480); s.name = name || 'Untitled'; songAddTrack(s, 'Piano', 0, 0); return s; }
/* A voice sings one note at a time: chords keep their top note, overlaps are cut, ornaments too short to sing are dropped. */
function melodyFromNotes(notes) {
  const sorted = notes.slice().sort((a, b) => a.start - b.start || b.midi - a.midi), top = [];
  sorted.forEach(n => { const l = top[top.length - 1]; if (l && n.start - l.start < 0.03) return; top.push({ midi: n.midi, start: n.start, dur: n.dur }); });
  for (let i = 0; i + 1 < top.length; i++) if (top[i].start + top[i].dur > top[i + 1].start) top[i].dur = top[i + 1].start - top[i].start;
  const out = top.filter(n => n.dur >= 0.12 && n.midi >= 24 && n.midi <= 96);
  const t0 = out.length ? out[0].start : 0;
  const res = out.slice(0, 2000).map(n => ({ midi: n.midi, start: Math.round((n.start - t0) * 1000) / 1000, dur: Math.round(n.dur * 1000) / 1000 }));
  res.t0 = t0;      // where the melody began in the file, so an accompaniment can be lined up with it
  return res;
}
/* Builds an exercise from absolute-time notes, shifted by whole octaves to fit the singer's range. */
function buildCustom(name, notes, bpm, range, tempo) {
  tempo = tempo || 1;
  let best = 0, bestScore = -1;
  for (let k = -4; k <= 4; k++) {
    const inside = notes.filter(n => n.midi + 12 * k >= range.lo && n.midi + 12 * k <= range.hi).length;
    const sc = inside * 100 - Math.abs(12 * k);
    if (sc > bestScore) { bestScore = sc; best = 12 * k; }
  }
  const events = notes.map(n => ({ midi: n.midi + best, midi2: undefined, start: n.start / tempo, dur: n.dur / tempo }));
  const all = events.map(e => e.midi), lo = Math.min.apply(null, all), hi = Math.max.apply(null, all);
  const last = events[events.length - 1], total = last.start + last.dur;
  return { id: 'midi', name, group: 'MIDI', events, total, bpm: bpm * tempo, tempo, beat: clamp(60 / ((bpm || 100) * tempo), 0.5, 1),
    tonic: events[0].midi, fits: lo >= range.lo && hi <= range.hi, lo, hi };
}

