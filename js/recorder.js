"use strict";
/* ---- Recorder (Mix tab editor) ----
   Records into the track being edited, starting at the playhead (rounded to a beat). Optional count-in bar and metronome; the other tracks play along (overdub).
   Input is the MIDI keyboard / on-screen piano / computer keys (via Midi.rec) or the singing voice (pitch frames -> notes). Times are placed on the audio clock,
   shifted back by the output latency, because the player hears the click that much later than it was scheduled. */
const Rec = {
  state: 'idle', src: 'keys', song: null, tr: null, T0: 0, base: 0, startTick: 0, tempo: 1, lat: 0, ch: 0, nextTick: 0, timer: 0, act: new Map(), got: [], ctrl: [], bends: [], frames: [], lastBend: 0, listener: null,
  get metro() { return Store.data.settings.recMetro !== false; },
  get count() { return Store.data.settings.recCount !== false; },
  get snap() { return !!Store.data.settings.recQ; },
  toggle() { if (this.state === 'idle') this.start(); else this.stop(); },
  start() {
    const song = Ed.song, tr = Ed.track; if (!song || !tr) return;
    if (this.src === 'audio' && !(Vox.node && Vox.ctx === Engine.ctx)) { if (!Engine.ready) return toast('Turn the microphone on first (Tuner tab).', 3000); return Vox.prep().then(() => this.start()).catch(e => toast('Could not start the recorder: ' + (e.message || e), 4000)); }
    const c = Engine.ctx; if (!c || !Engine.master) return toast('Tap Start first, then record.', 2500);
    if (this.src !== 'keys' && !Engine.ready) return toast('Turn the microphone on first (Tuner tab).', 3000);
    if (c.state !== 'running') c.resume();
    const p = Seq.pos(), ts = song.timeSigs.filter(t => t.tick <= songTick(song, p)).pop() || song.timeSigs[0], beat = song.ppq * 4 / ts.den;
    Seq.pause();
    this.song = song; this.tr = tr; this.tempo = Seq.tempo; this.lat = Engine.outLatency();
    this.startTick = Math.max(0, Math.round(songTick(song, p) / beat) * beat); this.base = songSec(song, this.startTick);
    this.ch = Ed.chan(tr);
    this.act.clear(); this.got = []; this.ctrl = []; this.bends = []; this.frames = [];
    const beatSec = (songSec(song, this.startTick + beat) - this.base) / this.tempo, lead = this.count ? ts.num * beatSec : 0.3;
    this.T0 = c.currentTime + 0.2 + lead; this.nextTick = this.startTick;
    if (this.count) for (let k = 0; k < ts.num; k++) Engine.click(this.T0 - (ts.num - k) * beatSec, k === 0 ? 1320 : 880, k === 0 ? 0.2 : 0.12);
    this.state = 'count'; Engine.keepAwake(true);
    if (Seq.loaded) Seq.start(this.base, { at: this.T0 });
    if (this.src === 'voice') { this.listener = fr => { if (this.state === 'rec') this.frames.push({ t: fr.t, m: fr.midi }); }; Engine.listeners.add(this.listener); if (this.metro) toast('Use headphones, or the click will be recorded too.', 3500); }
    else if (this.src === 'audio') { Vox.begin(); if (this.metro) toast('Use headphones, or the click will be recorded too.', 3500); }
    else Midi.rec = d => this.onMidi(d);
    this.timer = setInterval(() => this.pump(), 25); this.pump();
  },
  /* Song time (ticks) of "now", corrected for output latency. */
  tickNow() { return songTick(this.song, this.base + (Engine.ctx.currentTime - this.lat - this.T0) * this.tempo); },
  pump() {
    const c = Engine.ctx; if (!c || Ed.song !== this.song) return this.stop(true);
    const now = c.currentTime, song = this.song;
    if (this.state === 'count' && now >= this.T0) this.state = 'rec';
    if (this.metro) {
      const hi = songTick(song, this.base + (now + 0.35 - this.T0) * this.tempo);
      if (hi > this.nextTick) {
        songBeats(song, this.nextTick, hi).forEach(b => { const when = this.T0 + (songSec(song, b.tick) - this.base) / this.tempo; if (when >= now - 0.01) Engine.click(when, b.down ? 1320 : 880, b.down ? 0.2 : 0.12); });
        this.nextTick = hi;
      }
    }
  },
  onMidi(d) {
    if (this.state === 'idle' || Engine.ctx.currentTime < this.T0 - 0.15) return;
    const st = d[0] & 0xf0, n = d[1], tick = Math.max(this.startTick, Math.round(this.tickNow()));
    if (st === 0x90 && d[2] > 0) { this.endNote(n, tick); this.act.set(n, { tick, vel: d[2] }); }
    else if (st === 0x80 || st === 0x90) this.endNote(n, tick);
    else if (st === 0xb0 && n === 64) this.ctrl.push({ tick, ch: this.ch, cc: 64, val: d[2] });
    else if (st === 0xe0) { const v = n | (d[2] << 7), t = performance.now(); if (v === 8192 || t - this.lastBend > 15) { this.bends.push({ tick, ch: this.ch, val: v }); this.lastBend = t; } }
  },
  endNote(n, tick) { const o = this.act.get(n); if (!o) return; this.act.delete(n); this.got.push({ midi: n, tick: o.tick, dur: Math.max(1, tick - o.tick), vel: o.vel, ch: this.ch }); },
  /* Notes so far, including the ones still held, for drawing. */
  live() { const t = Math.round(this.tickNow()); return this.got.concat(Array.from(this.act, ([m, o]) => ({ midi: m, tick: o.tick, dur: Math.max(1, t - o.tick) }))); },
  stop(cancel) {
    if (this.state === 'idle') return; const was = this.state; clearInterval(this.timer); this.timer = 0; Midi.rec = null; Engine.keepAwake(false);
    if (this.listener) { Engine.listeners.delete(this.listener); this.listener = null; }
    const clip = this.src === 'audio' ? Vox.finish(this.T0 + this.lat) : null;
    let notes = [], end = 0; try { end = Math.round(this.tickNow()); } catch (e) { /* the audio context is gone */ }
    this.state = 'idle'; Seq.stop(); Seq.base = clamp(this.base, 0, Seq.maxPos);   // leave the playhead where the take began, to play it back
    if (cancel || was !== 'rec' || Ed.song !== this.song) return;
    if (this.src === 'audio') { if (!clip) return toast('Nothing was recorded.', 2500); Vox.add(clip, this.base); return toast('Recorded a voice track. Delete it with the ✕ in the track list.', 3500); }
    if (this.src === 'voice') {
      const song = this.song, toTick = t => Math.max(this.startTick, Math.round(songTick(song, this.base + (t - this.lat - this.T0) * this.tempo)));
      notes = framesToNotes(this.frames).map(n => { const a = toTick(n.start), b = toTick(n.start + n.dur); return { midi: n.midi, tick: a, dur: Math.max(1, b - a), vel: 90, ch: this.ch }; });
    } else { Array.from(this.act.keys()).forEach(k => this.endNote(k, end)); notes = this.got.slice(); }
    if (!notes.length && !this.ctrl.length) return toast('Nothing was recorded.', 2500);
    if (this.snap && Ed.grid > 1) notesQuantize(notes, Ed.grid);
    const tr = this.tr, ctrl = this.ctrl, bends = this.bends;
    Ed.edit(() => { notes.forEach(n => tr.notes.push(n)); ctrl.forEach(e => tr.ctrl.push(e)); bends.forEach(e => tr.bends.push(e)); Ed.sel = new Set(notes); });
    toast('Recorded ' + notes.length + ' note' + (notes.length === 1 ? '' : 's') + '. Undo removes them.', 3500);
  }
};

