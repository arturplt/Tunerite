"use strict";
/* ---- Training session ---- */
const Session = {
  s: null,
  async begin(id) {
    const st = Store.data.settings, M = Store.data.midi, tempo = (st.tempo || 100) / 100, ex = id === 'midi' && M ? buildCustom(M.name, M.notes, M.bpm, getRange(), tempo) : buildExercise(id, getRange(), tempo);
    if (this.starting) return; this.starting = true;
    const acc = id === 'midi' && !st.wait && Seq.accompanies(); if (acc) await Seq.prepare();      // the other tracks of the file play along, so decode their instruments first
    const c = Engine.ctx, lat = Engine.outLatency();
    if (lat > 0.15) toast('High audio delay (' + Math.round(lat * 1000) + ' ms). Bluetooth headphones will hurt timing; wired is better.', 6000);
    if (!ex.fits) toast('Your range is narrower than this exercise. Some notes may be out of reach.', 5000);
    const wait = !!st.wait, beat = ex.beat, hear = st.hear && !wait, now = c.currentTime;
    const tL = now + 0.35;
    const listenEnd = hear ? tL + ex.total + 0.2 : tL;
    const t0 = hear ? listenEnd + 3 * beat + 0.4 : wait ? tL + 3 * beat + 0.2 : tL + 1.5 * beat + 3 * beat + 0.2;
    const s = this.s = { ex, wait, find: st.find, gi: 0, waiting: false, shift: 0, wbuf: [], ref: null, nextRef: 0, tol: TOLERANCE[st.diff], hear, tL, listenEnd, t0, lat, frames: [], nodes: [], raf: 0, done: false, lock: { i: -1, run: 0, locked: false, off: 0 }, bleed: [], bleedWarned: false, rec: null, recStart: 0, chunks: [], wake: null };
    const guideLevel = wait || st.guide === 'off' ? 0 : st.guide === 'on' ? 1 : Math.max(0, 1 - 0.25 * (Store.data.passes[id] || 0));
    // reference / start tone
    if (hear) ex.events.forEach(ev => s.nodes.push(Engine.playNote(ev.midi, tL + ev.start, ev.dur, { midi2: ev.midi2 })));
    else if (!wait) { const e0 = ex.events[0]; s.nodes.push(Engine.playNote(e0.midi, tL, 1.5 * beat, { gain: 0.25 })); }
    if (acc) { Seq.start(M.t0, { at: t0, skip: Seq.sing, tempo }); s.nodes.push({ stop: () => Seq.stop() }); }
    for (let k = 3; k >= 1; k--) s.nodes.push(Engine.click(t0 - k * beat, k === 1 ? 1100 : 880, 0.15));
    if (guideLevel > 0.05) ex.events.forEach(ev => s.nodes.push(Engine.playNote(ev.midi, t0 + ev.start, ev.dur, { midi2: ev.midi2, sustain: true, gain: 0.18 * guideLevel })));
    s.guide = guideLevel > 0.05; s.guideLevel = guideLevel; s.tempo = tempo;
    if (st.drone && !wait) { let dm = ex.tonic - 12; if (dm < 36) dm += 12; s.dm = dm; s.nodes.push(Engine.drone(dm, tL, t0 + ex.total)); }
    // recorder (for replay)
    if (!wait && window.MediaRecorder && Engine.stream) {
      try {
        const mt = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find(t => MediaRecorder.isTypeSupported(t));
        s.rec = mt ? new MediaRecorder(Engine.stream, { mimeType: mt }) : new MediaRecorder(Engine.stream);
        s.rec.ondataavailable = e => { if (e.data && e.data.size) s.chunks.push(e.data); };
      } catch (e) { s.rec = null; }
    }
    try { if (navigator.wakeLock) s.wake = await navigator.wakeLock.request('screen'); } catch (e) {}
    s.listener = fr => this.onFrame(fr); Engine.listeners.add(s.listener);
    $('#sTitle').textContent = ex.name; $('#sTempo').textContent = Math.round(tempo * 100) + '%';
    UI.trainView('sess');
    this.starting = false;
    s.raf = requestAnimationFrame(() => this.loop());
  },
  /* In wait mode the exercise clock stops at each note until the singer holds it; shift is the total time spent waiting. */
  virt(s, realRel) { const v = realRel - s.shift; return s.gi < s.ex.events.length ? Math.min(v, s.ex.events[s.gi].start) : v; },
  waitFrame(s, fr, realRel) {
    const evs = s.ex.events, ev = evs[s.gi];
    if (!s.waiting && ev && realRel - s.shift >= ev.start) {
      s.waiting = true; s.wbuf = []; s.nextRef = 0;
    }
    if (!s.waiting) return realRel - s.shift;
    const nowMs = performance.now();
    if (nowMs >= s.nextRef) {
      if (s.ref) s.ref.stop();
      s.ref = Engine.playNote(ev.midi, Engine.ctx.currentTime + 0.02, 2.2, { sustain: true, gain: 0.2 }); s.nextRef = nowMs + 3500;
    }
    s.shift = realRel - ev.start;
    s.wbuf.push(fr.midi); if (s.wbuf.length > 8) s.wbuf.shift();
    const hold = s.wbuf.length === 8 && s.wbuf.every(m => m != null && Math.abs(m - ev.midi) * 100 <= s.tol);
    if (!hold) return null;
    s.wbuf.forEach((m, k) => { const t = ev.start + k * HOP; s.frames.push({ rel: t, t, midi: m, m }); });
    s.shift = realRel - ev.start - 8 * HOP;
    s.waiting = false; s.justLocked = true; if (s.ref) { s.ref.stop(); s.ref = null; }
    s.lock = { i: s.gi, run: 8, locked: true, off: 0 };
    if (Store.data.settings.cues) Engine.chime();
    s.gi++;
    return ev.start + 8 * HOP;
  },
  onFrame(fr) {
    const s = this.s; if (!s || s.done) return;
    let rel = fr.t - s.t0 - s.lat;
    s.sung = fr.midi; s.lastFrameAt = performance.now();
    if (s.wait && rel >= 0) {
      const v = this.waitFrame(s, fr, rel);
      if (v == null) return;
      if (!s.justLocked) s.frames.push({ rel: v, t: v, midi: fr.midi, m: fr.midi });
      s.justLocked = false; rel = v;
    } else s.frames.push({ rel, t: rel, midi: fr.midi, m: fr.midi });
    if (s.frames.length > 4000) s.frames.shift();
    if (rel < 0 || rel >= s.ex.total) return;
    const st = Store.data.settings, tv = targetAt(s.ex.events, rel);
    let idx = s.ex.events.findIndex(e => rel >= e.start && rel < e.start + e.dur);
    if (idx !== s.lock.i) s.lock = { i: idx, run: 0, locked: false, off: 0 };
    if (st.cues && tv != null) {
      const within = fr.midi != null && Math.abs(fr.midi - tv) * 100 <= s.tol, L = s.lock;
      if (within) { L.off = 0; if (++L.run >= 8 && !L.locked) { L.locked = true; Engine.chime(); } }
      else { L.run = 0; if (L.locked && ++L.off >= 15) { L.locked = false; Engine.tick(); } }
    }
    if (s.guide && !s.bleedWarned) {                  // a human cannot hold within 4 cents for 0.8 s; the guide tone leaking into the mic can
      s.bleed.push(fr.midi); if (s.bleed.length > 40) s.bleed.shift();
      if (s.bleed.length === 40 && s.bleed.every(x => x != null) && Math.max.apply(null, s.bleed) - Math.min.apply(null, s.bleed) < 0.04) {
        s.bleedWarned = true; toast('The app seems to hear its own guide tone. Please use headphones.', 6000);
      }
    }
  },
  loop() {
    const s = this.s; if (!s || s.done) return;
    const c = Engine.ctx, now = c.currentTime - s.lat;
    let clock = s.t0, label;
    if (s.hear && now < s.listenEnd) { clock = s.tL; label = 'Listen'; }
    else if (now < s.t0) { const n = Math.ceil((s.t0 - now) / s.ex.beat); label = n <= 3 ? String(n) : 'Get ready'; }
    else if (s.wait && s.waiting) label = 'Find the note';
    else if (now < s.t0 + s.ex.total + s.shift) label = 'Sing!';
    else label = 'Done';
    const rel = s.wait && now >= s.t0 ? this.virt(s, now - s.t0) : now - clock;
    if (s.rec && s.rec.state === 'inactive' && now >= s.t0 - 3 * s.ex.beat - 0.1) { try { s.rec.start(); s.recStart = c.currentTime; } catch (e) { s.rec = null; } }
    $('#sPhase').textContent = label;
    const sung = performance.now() - (s.lastFrameAt || 0) < 300 ? s.sung : null;
    drawRoll($('#rollCv'), { events: s.ex.events, lo: s.ex.lo, hi: s.ex.hi, rel, tol: s.tol, sung, frames: clock === s.t0 ? s.frames : [], total: s.ex.total });
    // required note vs sung note, so the singer learns which note is which
    const evs = s.ex.events, cur = targetAt(evs, rel), nxt = evs.find(e => e.start + e.dur > rel), want = cur != null ? cur : nxt ? nxt.midi : null;
    const vev = evs.find(e => e.start <= rel && rel < e.start + e.dur) || nxt;
    $('#sTarget').textContent = want != null ? noteName(want) + (vev && vev.v ? ' on ' + vev.v.toUpperCase() : '') : '–';
    $('#sNote').textContent = sung != null ? noteName(sung) : '–';
    let hint = '';
    if (sung != null && want != null) {
      const d = sung - want;
      if (Math.abs(d) * 100 <= s.tol) hint = '✓ right note';
      else if (Math.abs(d) < 0.5) hint = Math.round(Math.abs(d) * 100) + '¢ ' + (d > 0 ? 'sharp ▲' : 'flat ▼');
      else { const n = Math.round(Math.abs(d)); hint = (d > 0 ? 'lower ▼ ' : 'higher ▲ ') + n + ' semitone' + (n === 1 ? '' : 's'); }
    }
    $('#sCents').textContent = hint;
    $('#sNote').style.color = hint.startsWith('✓') ? 'var(--good)' : '';
    if (rel > s.ex.total + 0.4 && !(s.wait && s.waiting)) return this.finish();
    s.raf = requestAnimationFrame(() => this.loop());
  },
  teardown() {
    const s = this.s; if (!s) return;
    s.done = true; cancelAnimationFrame(s.raf); Engine.listeners.delete(s.listener);
    s.nodes.forEach(n => n.stop()); if (s.ref) s.ref.stop(); if (s.wake) { try { s.wake.release(); } catch (e) {} }
  },
  /* Where the timeline is now: seconds into the exercise (negative before it starts), and whether the listen/count-in phase is still running. */
  relNow(s) {
    const now = Engine.ctx.currentTime - s.lat, intro = s.hear && now < s.listenEnd;
    return { now, intro, rel: s.wait && now >= s.t0 ? this.virt(s, now - s.t0) : now - (intro ? s.tL : s.t0) };
  },
  /* Left/right: jump to the start of the previous or next note. Before the exercise starts, right skips the intro. */
  seek(dir) {
    const s = this.s; if (!s || s.done || this.starting) return;
    const evs = s.ex.events, { now, intro, rel } = this.relNow(s);
    let T;
    if (intro || (s.wait ? now < s.t0 : rel < 0)) { if (dir < 0) return; T = 0; }
    else {
      let i = -1; evs.forEach((e, k) => { if (e.start <= rel + 1e-6) i = k; });
      if (s.wait) i = Math.min(s.gi, evs.length - 1);                       // wait mode: the note being waited for is the current one, so quick repeated presses keep moving
      if (dir > 0) { if (i + 1 >= evs.length) { toast('That is the last note.', 1200); return; } T = evs[i + 1].start; }
      else T = !s.wait && i >= 0 && rel - evs[i].start > 0.5 ? evs[i].start : evs[Math.max(0, i - 1)].start;
    }
    if (!s.practice) { s.practice = true; toast('Skipping around: this run will not be saved to Progress.', 3500); }
    s.nodes.forEach(n => n.stop()); s.nodes = []; if (s.ref) { s.ref.stop(); s.ref = null; }
    if (s.rec) { try { if (s.rec.state !== 'inactive') s.rec.stop(); } catch (e) {} s.rec = null; s.chunks = []; }
    s.frames = s.frames.filter(f => f.rel < T - 1e-6); s.lock = { i: -1, run: 0, locked: false, off: 0 }; s.bleed = [];
    s.hear = false; s.listenEnd = 0;
    const c = Engine.ctx;
    if (s.wait) {                                                          // wait mode: put the exercise on the note and wait for the singer there
      if (now < s.t0) s.t0 = now;
      const k = evs.findIndex(e => Math.abs(e.start - T) < 1e-6);
      s.gi = k < 0 ? 0 : k; s.waiting = false; s.wbuf = []; s.shift = (now - s.t0) - evs[s.gi].start + 0.05;
    } else {
      s.t0 = now - T;
      if (s.guide) evs.forEach(ev => {                                       // rebuild the guide tone from the new position
        const end = ev.start + ev.dur; if (end <= T + 0.05) return;
        const at = Math.max(c.currentTime + 0.05, s.t0 + ev.start), from = Math.max(ev.start, T);
        s.nodes.push(Engine.playNote(from > ev.start && ev.midi2 != null ? targetAt([ev], T) : ev.midi, at, end - from, { midi2: ev.midi2, sustain: true, gain: 0.18 * s.guideLevel }));
      });
      if (s.dm != null) s.nodes.push(Engine.drone(s.dm, c.currentTime + 0.05, s.t0 + s.ex.total));
    }
  },
  /* Up/down: change the tempo by 5 % and restart the exercise a moment later (so several key presses make one restart). */
  setTempo(delta) {
    const st = Store.data.settings, t = clamp(Math.round(((st.tempo || 100) + delta) / 5) * 5, 50, 150);
    if (t === (st.tempo || 100)) return;
    st.tempo = t; Store.save(); $('#sTempo').textContent = t + '%'; $('#tmVal').textContent = t + '%'; $('#tempoVal').textContent = t + '%'; $('#setTempo').value = t;
    if (this.s) { toast('Tempo ' + t + '%', 900); clearTimeout(this.tempoTimer); this.tempoTimer = setTimeout(() => this.restart(), 700); }
  },
  restart() { const s = this.s; if (!s || this.starting) return; const id = s.ex.id; this.stop(); Session.begin(id); },
  stop() { const s = this.s; if (!s) return; this.teardown(); if (s.ref) s.ref.stop(); if (s.rec && s.rec.state !== 'inactive') { try { s.rec.stop(); } catch (e) {} } this.s = null; if (Routine.active) Routine.abort('Routine stopped'); else UI.trainView('menu'); },
  finish() {
    const s = this.s; this.teardown();
    const frames = s.frames.map(f => ({ t: f.rel, m: f.midi }));
    const per = s.ex.events.map(ev => scoreEvent(frames, ev, s.tol, s.find));
    const agg = aggregate(per, s.ex.events);
    const rec = { ts: Date.now(), ex: s.ex.id, name: s.ex.name, score: agg.score, stars: agg.stars, acc: agg.acc, dev: agg.dev, sd: agg.sd, att: agg.attack, diff: Store.data.settings.diff };
    if (agg.score >= 70 && !s.practice) Store.data.passes[s.ex.id] = (Store.data.passes[s.ex.id] || 0) + 1;
    rec.tempo = Math.round((s.tempo || 1) * 100);
    s.result = { agg, per, frames, rec };
    // save the take, then enable replay
    const finalize = () => {
      if (s.practice) return;                                          // skipped around: nothing to save
      if (!s.chunks.length) { Store.data.history.push(rec); Store.save(); return; }
      const blob = new Blob(s.chunks, { type: s.rec.mimeType || 'audio/webm' }), id = rec.ts;
      rec.take = id; Store.data.history.push(rec); Store.save();
      s.take = { id, blob, offset: s.t0 - s.recStart, events: s.ex.events, tonic: s.ex.tonic };
      Takes.put(s.take).catch(() => {}); UI.enableReplay(s.take);
    };
    if (s.rec && s.rec.state !== 'inactive') { s.rec.onstop = finalize; try { s.rec.stop(); } catch (e) { finalize(); } } else finalize();
    UI.showResults(s);
  }
};

async function replay(take) {
  await Engine.ctx.resume();
  const c = Engine.ctx, a = new Audio(URL.createObjectURL(take.blob));
  a.onended = () => URL.revokeObjectURL(a.src);
  try { await a.play(); } catch (e) { toast('Could not play the recording.'); return; }
  const t = c.currentTime + Math.max(0, take.offset);
  take.events.forEach(ev => Engine.playNote(ev.midi, t + ev.start, ev.dur, { midi2: ev.midi2, sustain: true, gain: 0.12 }));
}

