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
T.test('audio: every built-in instrument plays and every GM program has one', async () => {
  await audio(); const c = Engine.ctx;
  Object.keys(TIMBRES).forEach(k => { const h = Engine._playNote(48, c.currentTime + 1, 0.1, { synth: k, nopool: true }); T.ok(h && h.stop, k + ' plays'); h.stop(); });
  for (let p = 0; p < 128; p++) T.ok(TIMBRES[synthFor(p)], 'program ' + p);
  T.eq(synthFor(40), 'strings'); T.eq(synthFor(56), 'trumpet'); T.eq(synthFor(61), 'brass'); T.eq(synthFor(73), 'flute'); T.eq(synthFor(33), 'bass');
});
T.test('audio: built-in instruments are about as loud as the soft voice', async () => {
  await audio(); const c = Engine.ctx, an = c.createAnalyser(); an.fftSize = 2048; const buf = new Float32Array(2048);
  const loud = async (k, midi) => { const sink = c.createGain(); sink.gain.value = 1; sink.connect(an); const h = Engine._playNote(midi, c.currentTime + 0.02, 0.5, { synth: k, nopool: true, dest: sink }); let m = 0;
    for (let i = 0; i < 16; i++) { await T.wait(25); an.getFloatTimeDomainData(buf); let r = 0; for (let j = 0; j < buf.length; j++) r += buf[j] * buf[j]; m = Math.max(m, Math.sqrt(r / buf.length)); }
    h.stop(); await T.wait(60); return m; };
  const ref = await loud('soft', 60), out = {}; for (const k of Object.keys(TIMBRES)) { out[k] = +(await loud(k, 60) / ref).toFixed(2); }
  const bad = Object.keys(out).filter(k => out[k] < 0.5 || out[k] > 1.7); T.deep(bad, [], 'too quiet or too loud: ' + bad.map(k => k + ' ' + out[k]).join(', '));
});
T.test('audio: vibrato is only connected to voices when it is on', async () => {
  await audio(); const st = Store.data.settings, c = Engine.ctx; let linked = 0; const orig = Engine.fx.vibDepth.connect.bind(Engine.fx.vibDepth);
  Engine.fx.vibDepth.connect = (...a) => { linked++; return orig(...a); };
  try {
    st.fxVib = 'off'; Engine._playNote(60, c.currentTime + 1, 0.2, { synth: 'soft', nopool: true }); T.eq(linked, 0);
    st.fxVib = 'light'; Engine._playNote(60, c.currentTime + 1, 0.2, { synth: 'soft', nopool: true }); T.eq(linked, 1);
  } finally { Engine.fx.vibDepth.connect = orig; }
});
T.test('knobs: a knob takes over from its dropdown, and vibrato follows it', async () => {
  await audio(); const st = Store.data.settings, c = Engine.ctx; st.fxVib = 'off'; st.fxK = {}; Engine.setFx();
  Knobs.set('vib', 1); T.eq(Engine.vibOn(), true, 'the knob alone turns vibrato on');
  Knobs.set('vib', 0); T.eq(Engine.vibOn(), false);
  st.fxTrem = 'deep'; T.eq(Knobs.val('trem'), 1, 'untouched knob shows the dropdown level');
  Knobs.set('trem', 0.4); T.eq(Knobs.val('trem'), 0.4); Knobs.free('trem'); T.eq(Knobs.val('trem'), 1, 'changing the dropdown hands control back');
  Knobs.set('reverb', 0.9); T.eq(Engine.rvKind, 'hall'); Knobs.set('reverb', 0.2); T.eq(Engine.rvKind, 'room'); Knobs.set('reverb', 0); T.eq(Engine.rvKind, '');
  Knobs.reset(); T.eq(st.fxTrem, 'off'); T.deep(st.fxK, {});
});
T.test('track effect knobs: dragging one changes that track only', async () => {
  await audio(); scene(s => s.tracks[1].notes.push({ midi: 40, tick: 0, dur: 900, vel: 90, ch: 1 })); const k = $('#sqTracks .sqtrack .sqfx .knob[data-k="reverb"]'); T.ok(k, 'the knob exists');
  const ev = (type, y) => k.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 1, clientX: 10, clientY: y }));
  ev('pointerdown', 100); ev('pointermove', 40); ev('pointerup', 40);
  T.ok(Seq.tracks[0].fx && Seq.tracks[0].fx.reverb > 0.3, 'dragging up raises the amount ' + JSON.stringify(Seq.tracks[0].fx));
  T.ok(k.classList.contains('lit'), 'the knob lights up'); T.eq(Seq.tracks[1].fx, null, 'the other tracks are untouched');
});
T.test('track envelope: attack, decay, sustain and release shape that track\'s notes only', async () => {
  await audio(); scene(s => s.tracks[1].notes.push({ midi: 40, tick: 0, dur: 900, vel: 90, ch: 1 })); T.eq(Seq.envFor(Seq.tracks[0]), null, 'at rest the instrument keeps its own shape');
  ['ea', 'ed', 'es', 'er'].forEach(k => T.ok($('#sqTracks .sqtrack .sqfx .knob[data-k="' + k + '"]'), 'a knob for ' + k));
  Seq.setFx(Seq.tracks[0], 'ea', 0.9); Seq.setFx(Seq.tracks[0], 'es', 0.2); const e = Seq.envFor(Seq.tracks[0]); T.ok(e && e.a > 0.3 && Math.abs(e.s - 0.2) < 1e-6, 'a slow attack and a low sustain: ' + JSON.stringify(e)); T.eq(Seq.envFor(Seq.tracks[1]), null, 'the other tracks are untouched');
  const seen = []; const orig = Engine.playNote; Engine.playNote = (m, w, d, o) => { seen.push(o.env); return orig.call(Engine, m, w, d, o); };
  try { Seq.note(Seq.tracks[0], {}, { midi: 60, vel: 90 }, Engine.ctx.currentTime + 0.05, 0.5); } finally { Engine.playNote = orig; }
  T.ok(seen[0] && seen[0].a > 0.3, 'the note is played with the track\'s envelope'); Seq.tracks[0].fx = null;
});
T.test('voice tracks: a recording is a mixer channel that plays, mutes, saves and renders', async () => {
  await audio(); scene(); const sr = Engine.ctx.sampleRate, data = new Float32Array(sr).map((_, i) => 0.3 * Math.sin(i * 0.05));
  const v = Vox.add({ data, sr }, 0.5); T.eq(Seq.vox.length, 1); T.eq($$('#sqTracks .sqtrack').length, Seq.tracks.length + 1, 'a row for the recording');
  T.eq(Store.data.seq.vox[0].id, v.id, 'it is listed with the song');
  await Seq.start(0); T.ok(v.strip, 'it has a mixer strip'); T.eq(Vox.src.length, 1, 'its clip is scheduled'); Seq.gains();
  Seq.seek(0.9); await T.wait(50); T.eq(Vox.src.length, 1, 'seeking restarts it in the middle');
  Seq.halt(); T.eq(Vox.src.length, 0, 'stopping stops it');
  Seq.vox = []; Seq.render();
});
T.test('voice tracks: a take captures what the microphone hears', async () => {
  await audio(); scene(); const c = Engine.ctx, osc = c.createOscillator(); osc.start(); const saved = { mic: Engine.mic, ready: Engine.ready };
  Engine.mic = osc; Engine.ready = true; Rec.src = 'audio'; Store.data.settings.recCount = false; Store.data.settings.recMetro = false;
  try {
    Rec.start(); await T.wait(300); T.ok(Vox.node, 'the capture node exists'); await T.wait(2200); T.eq(Rec.state, 'rec');
    Vox.draw(); Vox.draw(); T.eq($('#voxCv').hidden, false, 'the spectrogram shows while recording'); T.ok(Vox.lv && Vox.lv.F > 10, 'frames of the live picture: ' + (Vox.lv && Vox.lv.F));
    Rec.stop(); const n0 = Vox.pn, F0 = Vox.lv && Vox.lv.F; Vox.draw(); await T.wait(500); Vox.draw(); T.eq(Vox.pn, n0, 'no samples after stop'); T.eq(Vox.lv && Vox.lv.F, F0, 'the live picture stops'); T.eq(Vox.sel, Seq.vox[0], 'the finished take is shown'); T.ok(Seq.vox[0].spec && Seq.vox[0].spec.ready, 'and analysed');
    T.eq(Seq.vox.length, 1, 'the take became a track'); T.ok(Seq.vox[0].buf.duration > 1.5, 'about two seconds of audio, got ' + Seq.vox[0].buf.duration);
  } finally { Engine.mic = saved.mic; Engine.ready = saved.ready; Rec.src = 'keys'; Seq.vox = []; Seq.render(); }
});
T.test('voice tracks: selecting one shows its spectrogram in place of the piano roll', async () => {
  await audio(); scene(); const sr = 48000, data = new Float32Array(sr * 2).map((_, i) => 0.4 * Math.sin(2 * Math.PI * 440 * i / sr)), v = Vox.add({ data, sr }, 0);
  Ed.on = true; Vox.select(v); await T.wait(400); T.ok(v.spec && v.spec.ready, 'the analysis finishes');
  Vox.draw(); T.eq($('#voxCv').hidden, false); T.eq($('#edCv').hidden, true, 'the piano roll is hidden');
  const rows = v.spec.cv.getContext('2d').getImageData(10, 0, 1, Vox.ROWS).data; let best = 0; for (let r = 0; r < Vox.ROWS; r++) best = Math.max(best, rows[r * 4 + 1]); const hot = []; for (let r = 0; r < Vox.ROWS; r++) if (rows[r * 4 + 1] >= best - 2) hot.push(r); const bi = hot.reduce((x, y) => x + y, 0) / hot.length;
  const f = Vox.FMIN * Math.pow(Vox.FMAX / Vox.FMIN, (Vox.ROWS - 1 - bi) / (Vox.ROWS - 1)); T.near(f, 440, 12, 'a 440 Hz tone lights the 440 Hz row, got ' + f);
  $('#sqTracks .sqtrack').click(); Vox.draw(); T.eq($('#voxCv').hidden, true, 'choosing a MIDI track brings the piano roll back'); Seq.vox = []; Seq.render();
});
T.test('voice view: other voices are drawn over the spectrogram in their own colour', async () => {
  await audio(); scene(); const sr = 48000, tone = f => new Float32Array(sr * 2).map((_, i) => 0.4 * Math.sin(2 * Math.PI * f * i / sr));
  const a = Vox.add({ data: tone(440), sr }, 0), b = Vox.add({ data: tone(220), sr }, 0); Ed.on = true; Vox.select(a); await T.wait(600);
  Vox.draw(); await T.wait(600); T.ok(b.spec && b.spec.ready, 'the other voice was analysed');
  const rows = Array.from(b.spec.at).filter(r => r >= 0); T.ok(rows.length > b.spec.F * 0.8, 'its pitch line follows it');
  const f = Vox.FMIN * Math.pow(Vox.FMAX / Vox.FMIN, rows[10] / (Vox.ROWS - 1)); T.near(f, 220, 8, 'at 220 Hz, got ' + f);
  T.ok(Vox.colour(a) !== Vox.colour(b), 'each voice has its own colour'); Vox.draw(); Seq.vox = []; Seq.render();
});
T.test('voice tracks: the transport Stop button ends a take and its graph', async () => {
  await audio(); scene(); const osc = Engine.ctx.createOscillator(); osc.start(); const saved = { mic: Engine.mic, ready: Engine.ready };
  Engine.mic = osc; Engine.ready = true; Rec.src = 'audio'; Store.data.settings.recCount = false; Store.data.settings.recMetro = false;
  try { Rec.start(); await T.wait(1800); T.eq(Rec.state, 'rec'); $('#sqStop').click(); T.eq(Rec.state, 'idle', 'Stop ends the take'); const n = Vox.pn; await T.wait(300); T.eq(Vox.pn, n, 'nothing more is captured'); T.eq(Seq.vox.length, 1, 'the take is kept'); }
  finally { Engine.mic = saved.mic; Engine.ready = saved.ready; Rec.src = 'keys'; Seq.vox = []; Seq.render(); }
});
T.test('track filters and compressor: wired only when on, with attack and release', async () => {
  await audio(); scene(); await Seq.start(0); const t = Seq.tracks[0], ty = n => t.fxn.filter(x => x.constructor.name === n).length;
  T.eq(ty('BiquadFilterNode') + ty('DynamicsCompressorNode'), 0, 'nothing wired at rest');
  Seq.setFx(t, 'lowcut', 0.5); Seq.setFx(t, 'highcut', 0.5); Seq.setFx(t, 'comp', 1);
  T.eq(ty('BiquadFilterNode'), 2, 'two filters'); T.eq(ty('DynamicsCompressorNode'), 1, 'a compressor');
  const cp = t.fxn.find(x => x.constructor.name === 'DynamicsCompressorNode'), hp = t.fxn.find(x => x.type === 'highpass');
  T.near(hp.frequency.value, 283, 5, 'low cut at half'); T.near(cp.ratio.value, 12, 0.01, 'full compression is 12:1');
  const att = cp.attack.value; Seq.setFx(t, 'attack', 1); T.ok(cp.attack.value > att * 5, 'attack knob changes it without re-wiring'); T.ok(t.fxn.includes(cp), 'same node');
  Seq.setFx(t, 'comp', 0); T.eq(ty('DynamicsCompressorNode'), 0, 'compressor removed when off'); Seq.halt();
});
T.test('track effects: gate, de-esser, mid EQ, synced echo, auto-pan, lo-fi', async () => {
  await audio(); scene(); await Seq.start(0); const t = Seq.tracks[0], n = k => t.fxn.filter(x => x.constructor.name === k).length;
  await Seq.loadGate(Engine.ctx); Seq.setFx(t, 'gate', 0.5); T.eq(n('AudioWorkletNode'), 1, 'the gate is a worklet node');
  T.near(t.fxn.find(x => x.constructor.name === 'AudioWorkletNode').parameters.get('thr').value, Math.pow(10, -40 / 20), 1e-6, 'threshold -40 dB at half');
  Seq.setFx(t, 'deess', 0.5); T.eq(n('DynamicsCompressorNode'), 1, 'de-esser has its own compressor');
  Seq.setFx(t, 'midgain', 1); const pk = t.fxn.find(x => x.type === 'peaking'); T.near(pk.gain.value, 12, 1e-6, '+12 dB at the top'); T.near(pk.frequency.value, 1000, 1, 'mid freq rests at 1 kHz');
  Seq.setFx(t, 'echo', 0.5); const dl = t.fxn.find(x => x.constructor.name === 'DelayNode' && x.delayTime.value > 0.1), beat = 60 / (Seq.bpm * Seq.tempo);
  T.near(dl.delayTime.value, 0.75 * beat, 1e-3, 'default echo time is a dotted eighth, ' + dl.delayTime.value);
  Seq.setFx(t, 'etime', 0.6); T.near(dl.delayTime.value, beat, 1e-3, 'turned up a step: a quarter note'); Seq.halt(); Seq.setTempo(0.5); await Seq.start(0); const dl2 = t.fxn.find(x => x.constructor.name === 'DelayNode' && x.delayTime.value > 0.1); T.near(dl2.delayTime.value, 2 * beat, 1e-3, 'follows the tempo');
  Seq.setFx(t, 'apan', 1); T.eq(n('StereoPannerNode'), 1, 'auto-pan'); Seq.setFx(t, 'lofi', 1); T.ok(t.fxn.some(x => x.constructor.name === 'WaveShaperNode' && x.curve && x.curve.length === 2048), 'lo-fi shaper');
  ['gate', 'deess', 'midgain', 'echo', 'apan', 'lofi'].forEach(k => Seq.setFx(t, k, k === 'midgain' ? 0.5 : 0)); T.eq(t.fxn.filter(x => x.constructor.name !== 'GainNode').length, 0, 'everything leaves the path when at rest'); Seq.setTempo(1); Seq.halt();
});
T.test('pitch correction: a sung 450 Hz is pulled to 440 Hz, timing and loudness stay', async () => {
  await audio(); scene(); const sr = 48000, N = sr * 2, ph = i => 2 * Math.PI * 450 * i / sr;
  const data = new Float32Array(N).map((_, i) => 0.3 * (Math.sin(ph(i)) + 0.5 * Math.sin(2 * ph(i)) + 0.25 * Math.sin(3 * ph(i)))), v = Vox.add({ data, sr }, 0);
  const t = Vox.tuneOf(v); t.amt = 1; t.spd = 1; t.scale = 'chrom'; await Vox.runTune(v); T.ok(v.tuned, 'a corrected copy exists'); T.eq(v.tuned.length, data.length, 'same length, so the timing is kept');
  const out = v.tuned.getChannelData(0), fr = out.slice(sr * 0.8, sr * 0.8 + 2048), r = analyse(fr, sr, 65, 1100); T.near(r.f, 440, 3, 'now at ' + r.f + ' Hz');
  const rms = a => Math.sqrt(a.reduce((s, x) => s + x * x, 0) / a.length), q = rms(Array.from(out.slice(sr * 0.5, sr * 1.5))) / rms(Array.from(data.slice(sr * 0.5, sr * 1.5))); T.near(q, 1, 0.15, 'loudness ' + q);
  t.amt = 0; await Vox.runTune(v); T.eq(v.tuned, null, 'amount 0 goes back to the original'); Seq.vox = []; Seq.render();
});
T.test('pitch correction: snaps to the chosen scale only', () => {
  const maj = new Set([0, 2, 4, 5, 7, 9, 11]); T.eq(Tune.snap(60.9, maj, 0), 60, 'a bit above C goes down to C in C major, not up to D'); T.eq(Tune.snap(63.4, maj, 0), 64, 'between D sharp and E: E');
  T.eq(Tune.snap(61.2, null, 0), 61, 'chromatic keeps the semitone'); T.eq(Tune.snap(66, new Set([0, 3, 5, 7, 10]), 9), 67, 'A minor pentatonic has no F sharp: the nearest allowed note is G');
});
/* A synthetic singing voice: a glottal pulse train with vibrato and a slow drift around 450 Hz, three formants, and a breathy "s" between the phrases. */
function synthVoice(sr, dur, o) {
  o = o || {};
  const N = Math.round(sr * dur), x = new Float32Array(N), res = (f, bw) => { const r = Math.exp(-Math.PI * bw / sr); return { a: 1 - 2 * r * Math.cos(2 * Math.PI * f / sr) + r * r, b: 2 * r * Math.cos(2 * Math.PI * f / sr), c: -r * r, y1: 0, y2: 0 }; }, F = [res(o.f1 || 700, o.f1 ? 60 : 110), res(1200, 120), res(2600, 160)];
  const g = p => p < 0.6 ? 0.5 * (1 - Math.cos(Math.PI * p / 0.6)) : p < 0.8 ? Math.cos(Math.PI / 2 * (p - 0.6) / 0.2) : 0; let ph = 0, gp = 0, seed = 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; };
  for (let i = 0; i < N; i++) {
    const t = i / sr, u = t % 1, ff = o.melody ? o.melody(t) * (1 + 0.012 * Math.sin(2 * Math.PI * 5.5 * t)) : 447 * (1 + 0.012 * Math.sin(2 * Math.PI * 5.5 * t)) * (1 + 0.015 * Math.sin(2 * Math.PI * 0.7 * t)); const f = ff * (1 + (o.jitter ? o.jitter * rnd() : 0)); let s;
    if (u < 0.8) { ph = (ph + f / sr) % 1; const v = g(ph); s = (v - gp) * 12 + (o.breath ? rnd() * o.breath : 0); gp = v; s *= Math.min(1, u / 0.03, (0.8 - u) / 0.03); } else if (u > 0.84 && u < 0.97) s = rnd() * 0.12; else s = 0;
    let y = s; F.forEach(r => { const q = r.a * y + r.b * r.y1 + r.c * r.y2; r.y2 = r.y1; r.y1 = q; y = q; }); x[i] = y;
  }
  let pk = 0; for (let i = 0; i < N; i++) pk = Math.max(pk, Math.abs(x[i])); for (let i = 0; i < N; i++) x[i] = x[i] * (o.level || 0.5) / pk + (o.floor ? rnd() * o.floor : 0) + (o.rumble ? o.rumble * Math.sin(2 * Math.PI * 17 * i / sr) : 0); return x;
}
/* How well a stretch of audio repeats itself one period later (1 = a perfect periodic tone), and the biggest jump between neighbouring samples. */
function periodicity(x, sr, a, b) {
  let tot = 0, n = 0; for (let s = a; s + 1536 < b; s += 512) {
    let best = 0, e0 = 0; for (let i = 0; i < 1024; i++) e0 += x[s + i] * x[s + i]; if (e0 / 1024 < 1e-4) continue;
    for (let lag = Math.round(sr / 800); lag < Math.round(sr / 200); lag++) { let c = 0, e1 = 0; for (let i = 0; i < 1024; i++) { c += x[s + i] * x[s + i + lag]; e1 += x[s + i + lag] * x[s + i + lag]; } best = Math.max(best, c / Math.sqrt(e0 * e1 + 1e-12)); }
    tot += best; n++;
  } return n ? tot / n : 0;
}
T.test('pitch correction: quality on a synthetic voice', async () => {
  await audio(); scene(); const sr = 48000, x = synthVoice(sr, 4), buf = new AudioBuffer({ length: x.length, sampleRate: sr, numberOfChannels: 1 }); buf.copyToChannel(x, 0);
  const out = (await Tune.process(buf, { amount: 1, speed: 1, set: null, root: 0, a4: 440 })).getChannelData(0), f0 = await Tune.track(out, sr), fin = await Tune.track(x, sr);
  const off = f => { const m = 69 + 12 * Math.log2(f / 440); return Math.abs(m - Math.round(m)) * 100; }, mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const dIn = mean(Array.from(fin).filter(f => f > 0).map(off)), dOut = mean(Array.from(f0).filter(f => f > 0).map(off));
  const pi = periodicity(x, sr, 0, x.length), po = periodicity(out, sr, 0, out.length); let jin = 0, jout = 0; for (let i = 2; i < x.length; i++) { jin = Math.max(jin, Math.abs(x[i] - 2 * x[i - 1] + x[i - 2])); jout = Math.max(jout, Math.abs(out[i] - 2 * out[i - 1] + out[i - 2])); }
  const msg = `off the note: in ${dIn.toFixed(1)} -> out ${dOut.toFixed(1)} cents; periodicity in ${pi.toFixed(3)} out ${po.toFixed(3)}; jump ratio ${(jout / jin).toFixed(2)}; voiced frames in ${Array.from(fin).filter(f => f > 0).length} out ${Array.from(f0).filter(f => f > 0).length}`;
  T.ok(dOut < 10 && po > pi * 0.95 && jout < jin * 1.4, msg);
});
T.test('pitch correction: quality on a messy sung melody', async () => {
  await audio(); scene(); const sr = 48000, notes = [261.6, 293.7, 329.6, 392], cents = 30;      // a C D E G melody sung 30 cents sharp, with 60 ms slides, breath, jitter and a noise floor
  const mel = t => { const k = Math.min(3, Math.floor(t / 1)), i = Math.floor(t), fr = t - i, a = notes[Math.min(3, i)] * Math.pow(2, cents / 1200), b = notes[Math.min(3, i + 1)] * Math.pow(2, cents / 1200); return fr > 0.7 ? a * Math.pow(b / a, Math.min(1, (fr - 0.7) / 0.1)) : a; };
  const x = synthVoice(sr, 4, { melody: mel, jitter: 0.006, breath: 0.15, level: 0.08, floor: 0.002 }), buf = new AudioBuffer({ length: x.length, sampleRate: sr, numberOfChannels: 1 }); buf.copyToChannel(x, 0);
  const out = (await Tune.process(buf, { amount: 1, speed: 0.7, set: null, root: 0, a4: 440 })).getChannelData(0), f0 = await Tune.track(out, sr), fin = await Tune.track(x, sr);
  const off = f => { const m = 69 + 12 * Math.log2(f / 440); return Math.abs(m - Math.round(m)) * 100; }, mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  const vin = Array.from(fin).filter(f => f > 0), vout = Array.from(f0).filter(f => f > 0), pi = periodicity(x, sr, 0, x.length), po = periodicity(out, sr, 0, out.length);
  const msg = `off the note: in ${mean(vin.map(off)).toFixed(1)} -> out ${mean(vout.map(off)).toFixed(1)} cents; periodicity in ${pi.toFixed(3)} out ${po.toFixed(3)}; voiced frames in ${vin.length} out ${vout.length}`;
  T.ok(mean(vout.map(off)) < 16 && po > pi * 0.9 && Math.abs(vout.length - vin.length) < vin.length * 0.1, msg);
});
T.test('pitch correction: a low voice with a strong second harmonic and rumble', async () => {
  await audio(); scene(); const sr = 48000, notes = [130.8, 146.8, 164.8, 196], cents = 30;
  const mel = t => { const i = Math.floor(t), fr = t - i, a = notes[Math.min(3, i)] * Math.pow(2, cents / 1200), b = notes[Math.min(3, i + 1)] * Math.pow(2, cents / 1200); return fr > 0.7 ? a * Math.pow(b / a, Math.min(1, (fr - 0.7) / 0.1)) : a; };
  const x = synthVoice(sr, 4, { melody: mel, jitter: 0.004, breath: 0.1, level: 0.1, floor: 0.002, f1: 262, rumble: 0.02 }), buf = new AudioBuffer({ length: x.length, sampleRate: sr, numberOfChannels: 1 }); buf.copyToChannel(x, 0);
  const out = (await Tune.process(buf, { amount: 1, speed: 0.35, set: null, root: 0, a4: 440 })).getChannelData(0), f0 = await Tune.track(out, sr), fin = await Tune.track(x, sr);
  const off = f => { const m = 69 + 12 * Math.log2(f / 440); return Math.abs(m - Math.round(m)) * 100; }, mean = a => a.reduce((s, v) => s + v, 0) / a.length, med = a => a.slice().sort((p, q) => p - q)[a.length >> 1];
  const vin = Array.from(fin).filter(f => f > 0), vout = Array.from(f0).filter(f => f > 0), pi = periodicity(x, sr, 0, x.length), po = periodicity(out, sr, 0, out.length);
  const msg = `input pitch median ${med(vin).toFixed(0)} Hz (sung ${notes[0] * 1.017 | 0}..), off note in ${mean(vin.map(off)).toFixed(0)} -> out ${mean(vout.map(off)).toFixed(0)} cents; periodicity ${pi.toFixed(2)} -> ${po.toFixed(2)}; voiced in ${vin.length} out ${vout.length}; range ${Math.min(...vout).toFixed(0)}..${Math.max(...vout).toFixed(0)} Hz`;
  T.ok(Math.min(...vout) > 110 && Math.max(...vout) < 230 && mean(vout.map(off)) < 20 && po > pi * 0.85, msg);
});
T.test('pitch correction: the voice view also draws the untouched pitch as a white line', async () => {
  await audio(); scene(); const sr = 48000, v = Vox.add({ data: synthVoice(sr, 2), sr }, 0); Ed.on = true; Vox.tuneOf(v).amt = 1; await Vox.runTune(v); Vox.select(v);
  for (let i = 0; i < 6 && !(v.spec && v.spec.ready && v.ospec && v.ospec.ready); i++) { Vox.draw(); await T.wait(300); } T.ok(v.ospec && v.ospec.ready, 'the original was analysed too'); Vox.draw(); Seq.vox = []; Seq.render();
});
T.test('pitch tracking: a held note with a weak fundamental does not jump an octave back and forth', async () => {
  const sr = 48000, N = sr * 3, x = new Float32Array(N); let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 * 2 - 1; };
  for (let i = 0; i < N; i++) { const t = i / sr, w = 2 * Math.PI * 220 * t, a1 = 0.1 + 0.25 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 3 * t)); let v = a1 * Math.sin(w) + 1.0 * Math.sin(2 * w + 0.7) + 0.5 * Math.sin(3 * w + 1.9) + 0.3 * Math.sin(4 * w) + 0.15 * Math.sin(5 * w + 2); x[i] = 0.2 * v + 0.01 * rnd(); }
  const d = await Tune.trackDetail(x, sr), flips = a => { let n = 0, prev = 0; for (let f = 0; f < a.length; f++) if (a[f] > 0) { if (prev && Math.abs(12 * Math.log2(a[f] / prev)) >= 9) n++; prev = a[f]; } return n; };
  const v = Array.from(d.f0).filter(f => f > 0); T.ok(v.length > d.F * 0.8, 'the note is found: ' + v.length + '/' + d.F);
  const fl = flips(d.f0); T.ok(fl === 0, `octave jumps: plain detector ${flips(d.raw)}, after the path ${fl}; median ${v.sort((a, b) => a - b)[v.length >> 1].toFixed(0)} Hz`);
});
T.test('voice view: spectrogram detail slider and pitch debug', async () => {
  await audio(); scene(); const sr = 48000, v = Vox.add({ data: synthVoice(sr, 3), sr }, 0); Ed.on = true; Vox.select(v);
  T.eq(Vox.N, 4096, 'the default detail'); [0, 1, 2, 3, 4].forEach((q, i) => { Vox.setDetail(q); T.eq(Vox.N, [512, 1024, 2048, 4096, 8192][i]); }); T.eq(v.spec, null, 'changing the detail drops the old picture');
  Vox.setDetail(2); for (let i = 0; i < 8 && !(v.spec && v.spec.ready); i++) { Vox.draw(); await T.wait(300); } T.ok(v.spec.ready && v.spec.N === 2048 && v.spec.H === 512, 'analysed at 2048 with a quarter-window hop');
  Vox.dbgOn = true; for (let i = 0; i < 10 && !v.dbg; i++) { Vox.draw(); await T.wait(300); } T.ok(v.dbg && v.dbg.F > 10, 'the pitch data was made'); Vox.draw(); T.eq($('#voxSave').hidden, false, 'the save button appears');
  Vox.dbgOn = false; Vox.setDetail(3); Seq.vox = []; Seq.render();
});
T.test('pitch correction: following a track pulls the voice to its notes, in the voice\'s octave', async () => {
  await audio(); const song = scene(s => { s.tracks[0].notes.length = 0; [[62, 0], [64, 960]].forEach(([m, t]) => s.tracks[0].notes.push({ midi: m, tick: t, dur: 900, vel: 90, ch: 0 })); });
  const tr = Seq.tracks[0], sr = 48000, mel = t => (t < 1 ? 146.8 : 164.8) * 1.03, v = Vox.add({ data: synthVoice(sr, 2, { melody: mel, level: 0.2 }), sr }, 0);      // sung a little sharp: D3 then E3, while the track has D4 then E4
  const tn = Vox.tuneOf(v); tn.amt = 1; tn.spd = 1; tn.scale = 'trk:' + tr.tid + ':' + tr.ch; const o = Vox.tuneOpts(v); T.ok(o.notes && o.notes.length === 2, 'the track\'s notes were found');
  T.eq(Tune.targetFor(50.5, 0.5, o), 50, 'D3 is pulled to D, in the voice\'s octave, not to D4'); T.eq(Tune.targetFor(52.6, 1.5, o), 52, 'E3 in the second half'); T.eq(Tune.targetFor(52.6, 0.95, o), 50, 'at 0.95 s the D has just ended and the E is about to start: the one nearer in time wins');
  T.eq(Tune.targetFor(52.6, 5, o), null, 'far from every note: left alone');
  await Vox.runTune(v); T.ok(v.tuned && v.dbg && v.dbg.target.some(x => x === 50) && v.dbg.target.some(x => x === 52), 'the debug data shows both target notes'); Seq.vox = []; Seq.render();
});
T.test('pitch correction: range, vibrato, slides, max shift, fine tune and dry mix', async () => {
  const sr = 48000, H = Tune.H, F = 200, mk = (fn) => { const a = new Float32Array(F); for (let f = 0; f < F; f++) a[f] = 440 * Math.pow(2, (fn(f * H / sr) - 69) / 12); return a; };
  const base = { amount: 1, speed: 1, set: null, root: 0, a4: 440 }, at = (p, f) => p.corr[f] * 100;
  let p = Tune.plan(mk(() => 69.3), sr, base); T.near(at(p, 100), -30, 0.1, 'a note 30 cents sharp is pulled down by 30');
  p = Tune.plan(mk(() => 69.3), sr, Object.assign({}, base, { range: 20 })); T.near(at(p, 100), -10, 0.1, 'with a 20 cent dead zone only the 10 cents beyond it are removed');
  p = Tune.plan(mk(() => 69.15), sr, Object.assign({}, base, { range: 20 })); T.near(at(p, 100), 0, 0.01, 'inside the dead zone nothing happens');
  const vib = mk(t => 69.1 + 0.3 * Math.sin(2 * Math.PI * 5.5 * t)), flat = Tune.plan(vib, sr, base), kept = Tune.plan(vib, sr, Object.assign({}, base, { human: 1 }));
  const rng = (q) => { let lo = 1e9, hi = -1e9; for (let f = 60; f < 140; f++) { const m = 69.1 + 0.3 * Math.sin(2 * Math.PI * 5.5 * f * H / sr) + q.corr[f]; lo = Math.min(lo, m); hi = Math.max(hi, m); } return hi - lo; };
  T.ok(rng(flat) < 0.05, 'without humanize the vibrato is flattened: ' + rng(flat).toFixed(2)); T.ok(rng(kept) > 0.45, 'with humanize it stays: ' + rng(kept).toFixed(2));
  const slide = mk(t => 62 + 8 * t / (200 * H / sr) * 10), s0 = Tune.plan(slide, sr, base), s1 = Tune.plan(slide, sr, Object.assign({}, base, { slides: 1 })); T.ok(Math.abs(s1.corr[100]) < Math.abs(s0.corr[100]) * 0.2 + 0.01, 'a fast slide is left alone with Slides at full: ' + s1.corr[100].toFixed(2) + ' vs ' + s0.corr[100].toFixed(2));
  p = Tune.plan(mk(() => 69.45), sr, Object.assign({}, base, { maxShift: 0.2 })); T.near(at(p, 100), -20, 0.1, 'the largest correction is limited'); p = Tune.plan(mk(() => 69), sr, Object.assign({}, base, { fine: 25 })); T.near(at(p, 100), 25, 0.1, 'fine tune moves the target');
  await audio(); const x = synthVoice(sr, 2), buf = new AudioBuffer({ length: x.length, sampleRate: sr, numberOfChannels: 1 }); buf.copyToChannel(x, 0);
  const wet = (await Tune.process(buf, base)).getChannelData(0), mixed = (await Tune.process(buf, Object.assign({}, base, { dry: 0.5 }))).getChannelData(0); let ok = true; for (let i = 5000; i < 90000; i += 997) if (Math.abs(mixed[i] - (0.5 * x[i] + 0.5 * wet[i])) > 1e-5) ok = false; T.ok(ok, 'dry 0.5 is half original, half corrected');
});
T.test('voice view: the A/B button switches between the original and the corrected voice', async () => {
  await audio(); scene(); const sr = 48000, v = Vox.add({ data: synthVoice(sr, 2), sr }, 0); Vox.tuneOf(v).amt = 1; await Vox.runTune(v); T.ok(v.tuned);
  T.eq(Vox.pb(v), v.tuned); v.bypass = true; T.eq(Vox.pb(v), v.buf, 'bypass plays the original'); v.bypass = false; Seq.vox = []; Seq.render();
});

/* ---- full-screen keyboard ---- */
T.test('full-screen keyboard: effect knobs share the Compose settings, letters are hidden until asked for', () => {
  const st = Store.data.settings, before = Object.assign({}, st.fxK); Keys.open(); st.kyLetters = false;
  T.eq($$('#kyKnobs .knob').length, Knobs.list.length, 'one knob per effect');
  Knobs.set('reverb', 0.6, true); T.eq($('#kyKnobs .knob[data-k="reverb"]').getAttribute('aria-valuenow'), '60', 'a Compose change shows on the keyboard');
  const ky = $('#kyKnobs .knob[data-k="echo"]'); ky.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })); T.ok(Knobs.val('echo') > 0, 'the keyboard knob moves the shared amount');
  Keys.draw(); T.ok($('#kySfName').textContent.length > 0, 'the SoundFont name is shown');
  Keys.close(); st.fxK = before; Knobs.sync();
});
T.test('synth panel: a preset keeps the sound and the knobs, and is an instrument in Compose', async () => {
  await audio(); const st = Store.data.settings, keep = { fxK: st.fxK, timbre: st.timbre, presetId: st.presetId }, list = Store.data.presets;
  Store.data.presets = []; st.timbre = 'soft'; st.fxK = { reverb: 0.7, drive: 0.4 }; Knobs.sync();
  const p = Presets.save('Test lead'); T.eq(Presets.save('test LEAD').id, p.id, 'saving the same name replaces it'); T.eq(Presets.list().length, 1);
  st.fxK = {}; Knobs.sync(); await Presets.apply(p.id); T.near(Knobs.val('reverb'), 0.7, 1e-6, 'knobs come back'); T.near(Knobs.val('drive'), 0.4, 1e-6);
  T.eq(Seq.alias('up:' + p.id), 'syn:soft', 'a built-in sound maps to its voice'); T.near(Presets.trackFx(p).reverb, 0.7, 1e-6, 'the track gets the shared knobs');
  Synth.show('user'); T.eq($$('#spPresets .lcdrow').length, 1, 'the Presets page lists it'); Synth.show('spec');
  Presets.remove(p.id); T.eq(Seq.alias('up:' + p.id), 'auto', 'a deleted preset falls back to auto');
  Store.data.presets = list; Object.assign(st, keep); Knobs.sync();
});

T.test('new effects: filter, unison, glide, pitch bend, reverb types, ping-pong echo', async () => {
  await audio(); const st = Store.data.settings, keep = JSON.stringify({ u: st.fxUni, g: st.fxGlide, p: st.fxPing, k: st.fxK, l: st.liveFx });
  const calls = [], orig = Engine._playNote.bind(Engine); Engine._playNote = (m, w, d, op) => { calls.push({ det: op.detune, gfrom: op.gfrom }); return orig(m, w, d, op); };
  const play = m => { calls.length = 0; return Engine.playNote(m, Engine.ctx.currentTime + 0.01, 1, { live: true, sustain: true, gain: 0.25 }); };
  try {
    st.fxUni = 0; play(60).release(); T.eq(calls.length, 1, 'unison off plays one voice');
    st.fxUni = 0.4; let h = play(60); T.eq(calls.length, 3, 'unison adds two detuned copies'); T.ok(calls.some(c => c.det < 0) && calls.some(c => c.det > 0), 'one flat, one sharp'); h.release();
    st.fxUni = 1; h = play(60); T.eq(calls.length, 5, 'full unison plays five voices'); h.release(); st.fxUni = 0;
    st.fxGlide = 0.5; Engine.lastLive = null; play(60).release(); h = play(67); T.eq(calls[0].gfrom, 60, 'glide starts from the last note'); h.release(); st.fxGlide = 0;
    Engine.setBend(0.5); await T.wait(300); T.near(Engine.bend.offset.value, 100, 1, 'a half bend is one semitone'); Engine.setBend(0);
    st.fxK = { reverb: 0.8, rvtype: 2 / 3, rvsize: 0.25 }; Engine.setFx(); T.eq(Engine.rvKind, 'plate1', 'type and size choose the space'); st.fxK = { reverb: 0.8, rvtype: 1, rvsize: 0.5 }; Engine.setFx(); T.ok(Engine.shim.on, 'shimmer feeds the octave copy');
    st.fxK = { reverb: 0.8 }; Engine.setFx(); T.eq(Engine.rvKind, 'hall', 'untouched, the amount alone picks room or hall'); T.ok(!Engine.shim.on, 'and shimmer is disconnected');
    st.fxK = { echo: 0.8 }; st.fxPing = true; Engine.setFx(); await T.wait(400); T.ok(Engine.fx.dlWet2.gain.value > 0.3 && Engine.fx.dlFb.gain.value < 0.01, 'ping-pong sends repeats to the second side');
    st.fxPing = false; Engine.setFx(); await T.wait(400); T.near(Engine.fx.dlWet2.gain.value, 0, 0.01, 'plain echo stays on one delay');
    Seq.liveTail(); st.liveFx = { fcut: 0.3, freso: 0.8 }; Seq.liveFx(); const lp = (Seq.live.fxn || []).filter(n => n.type === 'lowpass'); T.eq(lp.length, 1, 'the resonant filter is in the chain'); T.near(lp[0].frequency.value, 80 * Math.pow(250, 0.3), 1, 'cutoff follows the knob');
  } finally { Engine._playNote = orig; const k = JSON.parse(keep); Object.assign(st, { fxUni: k.u, fxGlide: k.g, fxPing: k.p, fxK: k.k, liveFx: k.l }); Engine.setFx(); Seq.liveFx(); }
});
