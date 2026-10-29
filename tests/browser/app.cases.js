"use strict";
/* Regression tests for the app layer: the Compose screen (step grid, regions, loop, tempo strip, chords, bass, projects), Practice modes and the audio effect wiring. */
const DRUMS = 2;      // index of the drum track in scene()
let audioReady = false;
async function audio() { if (audioReady) return; Engine.ctx = new AudioContext(); Engine.buildFx(); await Engine.ctx.resume(); audioReady = true; }
const notesAt = (tr, midi, tick) => tr.notes.filter(n => n.midi === midi && n.tick === tick);

/* ---- drum step grid ---- */
T.test('step grid: a preset fills the bar', () => {
  const song = scene(); Ed.ti = DRUMS; Steps.show(true); Steps.draw(); Steps.preset('Rock');
  T.eq(song.tracks[DRUMS].notes.length, 14, 'Rock = 4 kick + 2 snare + 8 hat');
  T.eq(notesAt(song.tracks[DRUMS], 36, 0)[0].vel, 127, 'accent on the downbeat kick');
});
T.test('step grid: a tap goes hit, accent, off', () => {
  const song = scene(), tr = song.tracks[DRUMS]; Ed.ti = DRUMS; Steps.show(true); Steps.draw();
  Steps.tap(36, 0, 0); T.eq(notesAt(tr, 36, 0)[0].vel, 90);
  Steps.tap(36, 0, 90); T.eq(notesAt(tr, 36, 0)[0].vel, 127);
  Steps.tap(36, 0, 127); T.eq(notesAt(tr, 36, 0).length, 0);
});
T.test('step grid: ratchets put 2-4 hits inside one step', () => {
  const song = scene(), tr = song.tracks[DRUMS]; Ed.ti = DRUMS; Steps.show(true); Steps.draw(); $('#stTap').value = '3';
  Steps.tap(38, 4, 0); T.deep(tr.notes.filter(n => n.midi === 38).map(n => n.tick), [480, 520, 560]);
  Steps.tap(38, 4, 90); T.eq(tr.notes.filter(n => n.midi === 38).length, 0, 'tapping the same ratchet removes it');
});
T.test('step grid: dragging a lit step sets its velocity', () => {
  const song = scene(), tr = song.tracks[DRUMS]; Ed.ti = DRUMS; Steps.show(true); Steps.draw(); Steps.tap(42, 2, 0); Steps.draw();
  const cell = Steps.cells[Steps.ROWS.findIndex(r => r[0] === 42) * 16 + 2];
  try { Steps.stepDown({ clientY: 300, pointerId: 1 }, 42, 2, cell); } catch (e) { /* a made-up pointer cannot be captured; the state is already set */ }
  Steps.stepMove({ clientY: 230 }, 42, 2); Steps.stepUp(42, 2);
  const v = notesAt(tr, 42, 240)[0].vel; T.ok(v > 90 && v <= 127, 'velocity went up, got ' + v);
});
T.test('step grid: mute and solo a single drum', () => {
  const song = scene(), tr = song.tracks[DRUMS]; Ed.ti = DRUMS; Steps.show(true); Steps.draw();
  Steps.flip('mute', 46); T.eq(Steps.silent({ tid: tr.id }, 46), true); T.eq(Steps.silent({ tid: tr.id }, 42), false);
  Steps.flip('solo', 36); T.eq(Steps.silent({ tid: tr.id }, 38), true, 'solo silences the others'); T.eq(Steps.silent({ tid: tr.id }, 36), false);
});
T.test('step grid: copy bar and clear bar', () => {
  const song = scene(), tr = song.tracks[DRUMS]; Ed.ti = DRUMS; Steps.show(true); Steps.draw(); Steps.preset('Rock'); Steps.draw();
  Steps.button('copy'); T.eq(tr.notes.length, 28); Steps.button('clear'); T.eq(tr.notes.length, 14, 'bar 2 cleared');
});

/* ---- loop region and arrangement ---- */
const twoNotes = s => { s.tracks[0].notes = [{ midi: 60, tick: 0, dur: 400, vel: 90, ch: 0 }, { midi: 62, tick: 480, dur: 400, vel: 90, ch: 0 }]; };
T.test('region: duplicate moves the region to the copy', () => {
  const song = scene(twoNotes); Ed.ti = 0; Seq.setRegion(0, 1);
  T.eq(Seq.loopA, 0); T.eq(Seq.loopB, 1); T.eq(Seq.loop, true, 'setting a region turns looping on');
  Ed.act('rdup'); T.deep(song.tracks[0].notes.map(n => n.tick), [0, 480, 960, 1440]); T.eq(Seq.loopA, 1); T.eq(Seq.loopB, 2);
});
T.test('region: repeat and clear, on all tracks', () => {
  const song = scene(s => { twoNotes(s); s.tracks[1].notes.push({ midi: 40, tick: 0, dur: 900, vel: 90, ch: 1 }); }); Ed.ti = 0; Seq.setRegion(0, 1); $('#edAllTr').checked = true;
  Ed.act('rrep'); T.eq(song.tracks[0].notes.length, 2 + 2 * 3, 'two notes copied three times'); T.eq(song.tracks[1].notes.length, 4, 'the bass note starts inside the region, so it repeats too');
  Ed.act('rclr'); T.eq(song.tracks[0].notes.filter(n => n.tick < 960).length, 0);
});
T.test('region: survives an edit', () => {
  scene(); Seq.setRegion(0, 1); Ed.edit(() => {}); T.eq(Seq.loopA, 0); T.eq(Seq.loopB, 1);
});
T.test('loop: playback wraps to the start of the region on the audio clock', () => {
  scene(); Seq.setRegion(0.5, 1.5);
  const saved = { note: Seq.note, res: Seq.res, auto: Seq.autoRun, ctx: Engine.ctx }, heard = [];
  try {
    Seq.note = (t, r, n) => heard.push(n.start); Seq.res = () => ({}); Seq.autoRun = () => {}; Engine.ctx = { currentTime: 101.4, state: 'running' };
    Seq.playing = true; Seq.base = 0; Seq.T0 = 100; Seq.tempo = 1; Seq.seekTracks(); Seq.tick();
    T.near(Seq.base, 0.5, 1e-9, 'the new base is the region start'); T.near(Seq.T0, 101.5, 1e-9, 'continues on the same clock');
  } finally { Seq.note = saved.note; Seq.res = saved.res; Seq.autoRun = saved.auto; Engine.ctx = saved.ctx; Seq.playing = false; }
});

/* ---- tempo and meter strip ---- */
T.test('tempo strip: add, move and delete a tempo change', () => {
  const song = scene(); Meta.open('tempo', 1920, 120, 0, 0, true); $('#mpBpm').value = 90; Meta.commit(false);
  T.deep(song.tempos.map(t => [t.tick, Math.round(60e6 / t.us)]), [[0, 120], [1920, 90]]);
  Meta.drag = { kind: 'tempo', tick: 1920, moved: true, to: 3840, v: song.tempos[1], bpm: 90, num: 0, den: 0 }; Meta.up();
  T.deep(song.tempos.map(t => t.tick), [0, 3840]);
  Meta.open('tempo', 3840, 90, 0, 0, false); Meta.commit(true); T.eq(song.tempos.length, 1);
});
T.test('tempo strip: a time signature change reshapes the bars', () => {
  const song = scene(); Meta.open('sig', 1920, 0, 3, 4, true); $('#mpNum').value = 3; $('#mpDen').value = 4; Meta.commit(false);
  T.deep(song.timeSigs.map(t => [t.tick, t.num, t.den]), [[0, 4, 4], [1920, 3, 4]]);
  T.deep(songBarLines(song, 0, 4000).map(b => b.tick), [0, 1920, 3360]);
});

/* ---- chords and bass ---- */
T.test('chords: stamp shapes and the scale triad', () => {
  scene(); $('#edChord').value = 'min7'; T.deep(Ed.chordNotes({ midi: 60 }), [63, 67, 70]);
  $('#edScale').value = 'major'; $('#edRoot').value = '0'; $('#edChord').value = 'scale'; T.deep(Ed.chordNotes({ midi: 62 }), [65, 69], 'D minor triad inside C major');
  $('#edChord').value = '0'; T.deep(Ed.chordNotes({ midi: 60 }), []);
});
T.test('bass: follows the kick drum', () => {
  const song = scene(); Ed.ti = DRUMS; Steps.show(true); Steps.draw(); Steps.preset('Four on the floor');
  Ed.makeBass('fifth', 5); const bass = song.tracks[song.tracks.length - 1];
  T.eq(song.tracks.length, 4); T.deep(bass.notes.map(n => n.tick), [0, 480, 960, 1440]); T.deep(bass.notes.map(n => n.midi), [41, 41, 41, 48], 'root F, a fifth on the fourth hit');
  T.eq(bass.progs[0].val, 33); T.ok(bass.notes.every(n => n.ch === bass.progs[0].ch));
});
T.test('bass: without a drum track it says so and adds nothing', () => {
  const song = songNew('NoDrums'); Seq.load(songToUnits(song), 'NoDrums', song); Seq.render(); Ed.attach(); const n = song.tracks.length; Ed.makeBass('root', 0); T.eq(song.tracks.length, n);
});

/* ---- mixer ---- */
T.test('mixer: pan survives a rebuild; meters and sliders run', () => {
  scene(); Seq.tracks[0].panv = 0.4; Seq.rebuild(); T.near(Seq.tracks[0].panv, 0.4, 1e-9); Seq.meters(); Seq.sliders();
});

/* ---- projects ---- */
T.test('projects: keep, list, rename, duplicate, delete', async () => {
  for (const r of await SeqStore.list()) await SeqStore.del(r.name);
  const song = scene(); Seq.keep(); await T.wait(300);
  T.deep((await SeqStore.list()).map(r => r.title), ['Test']);
  T.eq(await Seq.uniqueName('Test'), 'Test 2', 'a taken name gets a number');
  await Seq.renameProject((await SeqStore.list())[0], 'Etude'); await T.wait(300);
  T.deep((await SeqStore.list()).map(r => r.title), ['Etude']); T.eq(Seq.name, 'Etude', 'renaming the open song renames the song'); T.eq(song.name, 'Etude');
  const r = (await SeqStore.list())[0]; await SeqStore.putProj('Etude copy', r.bytes, r);
  T.eq((await SeqStore.list()).length, 2);
  await Seq.openProject('proj:Etude copy'); T.eq(Seq.name, 'Etude copy'); T.eq(Seq.song.tracks[0].notes.length, 4, 'the notes came back from the file');
  for (const x of await SeqStore.list()) await SeqStore.del(x.name); T.eq((await SeqStore.list()).length, 0);
});
T.test('projects: asking before leaving a changed song', () => {
  scene(); let ran = 0; Seq.dirty = false; Seq.guard(() => ran++); T.eq(ran, 1, 'a clean song goes straight on');
  Seq.dirty = true; Seq.guard(() => ran++); T.eq(ran, 1); T.ok($('#o-savechk').classList.contains('on'));
  $('#svCancel').click(); T.eq(ran, 1); T.ok(!$('#o-savechk').classList.contains('on'));
  Seq.guard(() => ran++); $('#svDiscard').click(); T.eq(ran, 2);
});

/* ---- practice ---- */
T.test('practice: Sing, Piano and Whistle, Exercises and Library', () => {
  const st = Store.data.settings; UI.show('train');
  st.trainMode = 'sing'; st.inst = 'voice'; st.prView = 'ex'; UI.refresh();
  T.eq($('#trSing').hidden, false); T.eq($('#trPiano').hidden, true); T.eq($('#trSingT').textContent, 'Singing');
  st.inst = 'whistle'; UI.refresh(); T.eq($('#trSingT').textContent, 'Whistling'); T.ok($$('#trMode button').find(b => b.dataset.m === 'whistle').classList.contains('on'));
  st.trainMode = 'piano'; UI.refresh(); T.eq($('#trPiano').hidden, false); T.eq($('#trSing').hidden, true); T.eq(Lib.f.kind, 'piano');
  st.trainMode = 'sing'; st.prView = 'lib'; UI.refresh(); T.eq($('#trLib').hidden, false); T.eq($('#trEx').hidden, true); T.eq(Lib.f.kind, 'sing'); T.ok($$('#libList .card').length > 0, 'the library lists exercises');
  st.prView = 'ex'; UI.show('tuner');
});

/* ---- audio ---- */
T.test('audio: effects are only wired in while they are on', async () => {
  await audio(); const st = Store.data.settings, F = Engine.fx;
  Object.assign(st, { fxDelay: 'off', chorus: false, fxDrive: 'off', fxPhase: 'off', fxWide: false }); Engine.setFx(); await T.wait(800);
  T.deep(Object.keys(F.on).filter(k => F.on[k]), [], 'nothing wired when everything is off');
  Object.assign(st, { fxDelay: 'short', chorus: true, fxDrive: 'warm', fxPhase: 'phaser', fxWide: true }); Engine.setFx();
  T.deep(Object.keys(F.on).filter(k => F.on[k]).sort(), ['chorus', 'drive', 'echo', 'phase', 'wide']);
  Object.assign(st, { fxDelay: 'off', chorus: false, fxDrive: 'off', fxPhase: 'off', fxWide: false }); Engine.setFx(); await T.wait(800); T.deep(Object.keys(F.on).filter(k => F.on[k]), []);
});
T.test('audio: a built-in voice is one oscillator at the old loudness', async () => {
  await audio(); T.near(Engine.voiceWave('pure').k, 1, 0.01); T.ok(Engine.voiceWave('soft').k < 1 && Engine.voiceWave('soft').k > 0.5);
  let made = 0; const c = Engine.ctx, orig = c.createOscillator.bind(c); c.createOscillator = () => { made++; return orig(); };
  try { Engine._playNote(60, c.currentTime + 1, 0.2, { synth: 'piano', nopool: true }); } finally { c.createOscillator = orig; }
  T.eq(made, 1, 'one oscillator for a six-partial timbre');
});
T.test('audio: vibrato is only connected to voices when it is on', async () => {
  await audio(); const st = Store.data.settings, c = Engine.ctx; let linked = 0; const orig = Engine.fx.vibDepth.connect.bind(Engine.fx.vibDepth);
  Engine.fx.vibDepth.connect = (...a) => { linked++; return orig(...a); };
  try {
    st.fxVib = 'off'; Engine._playNote(60, c.currentTime + 1, 0.2, { synth: 'soft', nopool: true }); T.eq(linked, 0);
    st.fxVib = 'light'; Engine._playNote(60, c.currentTime + 1, 0.2, { synth: 'soft', nopool: true }); T.eq(linked, 1);
  } finally { Engine.fx.vibDepth.connect = orig; }
});
