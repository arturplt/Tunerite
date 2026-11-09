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
  st.inst = 'whistle'; UI.refresh(); T.eq($('#trSingT').textContent, 'Whistling'); T.eq(PDev.mode(), 'whistle', 'the device shows the whistle source');
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

T.test('piano scale and chords: off-scale keys are locked, a key plays the chord of its scale degree', async () => {
  await audio(); UI.show('piano'); const st = Store.data.settings, keep = JSON.stringify(st.pk), calls = [], orig = Engine._playNote.bind(Engine); Engine._playNote = (m, w, d, o) => { calls.push(m); return orig(m, w, d, o); };
  const play = m => { calls.length = 0; const h = Engine.playNote(m, Engine.ctx.currentTime + 0.01, 1, { live: true, sustain: true, gain: 0.25 }); if (h) h.release(); return calls.slice(); };
  try {
    st.pk = { key: 0, scale: 'off', lock: true, chord: 'off' }; T.eq(play(61).join(), '61', 'no scale: every key plays');
    st.pk = { key: 0, scale: 'major', lock: true, chord: 'off' }; T.eq(play(61).length, 0, 'C major: C sharp is locked'); T.eq(play(62).join(), '62', 'D plays alone with chords off'); st.pk.lock = false; T.eq(play(61).join(), '61', 'unlocked, a greyed key still plays');
    st.pk = { key: 0, scale: 'major', lock: true, chord: 'triad' }; T.eq(play(60).join(), '60,64,67', 'C gives C major'); T.eq(play(62).join(), '62,65,69', 'D gives D minor'); T.eq(play(71).join(), '71,74,77', 'B gives B diminished'); T.eq(Scale.nameOf([71, 74, 77]), 'Bdim', 'and names it');
    st.pk.chord = 'sus2'; T.eq(play(60).join(), '60,62,67', 'sus 2 on C is C D G'); st.pk.chord = 'sus4'; T.eq(play(60).join(), '60,65,67', 'sus 4 on C is C F G'); st.pk.chord = '7sus4'; T.eq(play(67).join(), '67,72,74,77', '7sus4 on G is G C D F'); T.eq(Scale.nameOf([67, 72, 74, 77]), 'G7sus4'); st.pk.chord = 'sus24'; T.eq(play(60).join(), '60,62,65,67', 'sus 2+4 on C is C D F G'); st.pk.lock = false; T.eq(play(61).join(), '61,63,66,68', 'a grey key still gets the same kind of chord');
    st.pk.chord = 'dim'; T.eq(play(60).join(), '60,63,66', 'diminished on C is C E-flat G-flat'); T.eq(Scale.nameOf([60, 63, 66]), 'Cdim'); st.pk.chord = 'dim7'; T.eq(play(62).join(), '62,65,68,71', 'diminished 7th on D'); st.pk.chord = 'hdim'; T.eq(play(71).join(), '71,74,77,81', 'half-diminished on B'); T.eq(Scale.nameOf([71, 74, 77, 81]), 'Bmin7b5');
    st.pk.lock = true; st.pk.chord = '7th'; T.eq(play(67).join(), '67,71,74,77', 'G gives G7'); st.pk = { key: 9, scale: 'minor', lock: true, chord: 'triad' }; T.eq(play(69).join(), '69,72,76', 'A minor: A gives A minor'); T.eq(play(64).join(), '64,67,71', 'E gives E minor in A natural minor');
    st.pk = { key: 0, scale: 'major', lock: true, chord: 'off' }; T.ok(Midi.msg([0x90, 61, 90], true) === undefined && !Midi.down.has(61), 'a MIDI key outside the locked scale is ignored');
    UI.show('train'); T.ok(!Scale.blocked(61), 'the lock only applies in the Piano tab');
  } finally { Engine._playNote = orig; st.pk = JSON.parse(keep); Midi.panic && Midi.panic(); UI.show('piano'); }
});

T.test('ear training: every level makes valid questions, stars and unlocking follow the score', async () => {
  let r = 1; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647, bad = [];
  EAR.LEVELS.forEach(l => {
    let prev = null;
    for (let i = 0; i < 120; i++) {
      const q = EAR.make(l, rnd, prev); prev = q; const ids = q.options.map(o => o.id);
      if (q.options.length < 2 || new Set(ids).size !== ids.length) bad.push(l.id + ': options ' + ids.join());
      if (q.seq ? !q.seq.every(x => ids.includes(x)) : !ids.includes(q.answer)) bad.push(l.id + ': the answer is not an option');
      if (!q.events.length || q.events.some(e => !(e.d > 0) || e.t < 0 || e.n.some(m => !(m >= 28 && m <= 100)))) bad.push(l.id + ': events out of range');
      if (!q.explain || !q.prompt) bad.push(l.id + ': no text');
    }
  });
  T.eq(bad.slice(0, 5).join(' | '), '', 'no invalid question in ' + EAR.LEVELS.length + ' levels');
  T.eq([0.5, 0.8, 0.9, 1].map(p => EAR.stars(p)).join(), '0,1,2,3', 'stars: 80%, 90% and 100%');
  const P = {}; T.ok(EAR.unlocked(P, 'u1l1') && !EAR.unlocked(P, 'u1l2'), 'only the first level is open at the start'); T.eq(EAR.next(P).id, 'u1l1');
  P.u1l1 = { best: 0.7, stars: 0 }; T.ok(!EAR.unlocked(P, 'u1l2'), 'below 80% the next level stays shut'); P.u1l1 = { best: 0.8, stars: 1 }; T.ok(EAR.unlocked(P, 'u1l2'), 'a star opens the next level'); T.eq(EAR.next(P).id, 'u1l2');
  T.eq(EAR.rnChord(0, 'V').join(), '55,59,62', 'the V chord in C is G B D'); T.eq(EAR.rnChord(0, 'vi').join(), '57,60,64', 'the vi chord in C is A C E');
});
T.test('ear training: the Ear mode lists the course, a drill scores, and passing opens the next level', async () => {
  await audio(); const st = Store.data.settings, keep = { m: st.trainMode, e: JSON.stringify(Store.data.ear), l: JSON.stringify(Store.data.earLog) }; Store.data.ear = { levels: {} }; Store.data.earLog = [];
  try {
    st.trainMode = 'ear'; UI.show('train'); UI.refresh(); T.ok(!$('#trDevice').hidden && $('#trEx').hidden, 'the Practice device replaces the exercises'); { const a = PDev.api('ear'); T.eq(a.levels.length, EAR.LEVELS.length, 'every level is on the map'); T.eq(a.levels.filter(l => a.unlocked(l.id)).length, 1, 'only the first level is open'); }
    Ear.open('u1l1'); T.ok($('#o-ear').classList.contains('on'), 'the drill opens'); T.eq($$('#earOpts .earopt').length, 2);
    for (let i = 0; i < 10; i++) { T.ok(!Ear.locked, 'ready for question ' + (i + 1)); const right = Ear.q.answer, b = $('#earOpts [data-id="' + right + '"]'); b.click(); T.ok(b.classList.contains('ok'), 'the right answer lights up'); Ear.advance(); }
    T.ok(!$('#earRes').hidden, 'results show'); const rec = Store.data.ear.levels.u1l1; T.ok(rec && rec.stars === 3 && rec.best === 1, 'ten right earn three stars: ' + JSON.stringify(rec)); T.ok(EAR.unlocked(Ear.prog(), 'u1l2'), 'the next level is open'); T.eq(Store.data.earLog.length, 1, 'the session is logged for the streak');
    Ear.open('u1l2'); for (let i = 0; i < 10; i++) { const right = Ear.q.answer, wrong = Ear.q.options.find(o => o.id !== right).id; $('#earOpts [data-id="' + wrong + '"]').click(); T.ok(!$('#earNext').hidden, 'a miss waits for Next'); Ear.advance(); }
    T.eq(Store.data.ear.levels.u1l2.stars, 0, 'ten wrong earn nothing'); T.ok(!EAR.unlocked(Ear.prog(), 'u1l3'), 'and open nothing');
    Ear.open('u7l1'); T.ok(!$('#o-ear').classList.contains('on') || Ear.lv.id !== 'u7l1', 'a locked level does not open');
  } finally { Ear.close(); st.trainMode = keep.m; Store.data.ear = JSON.parse(keep.e || 'null') || undefined; Store.data.earLog = JSON.parse(keep.l || 'null') || undefined; UI.show('tuner'); }
});

T.test('rhythm training: every level fits its bar, scoring follows the taps, and a drill earns stars and opens the next level', async () => {
  await audio(); const st = Store.data.settings, keep = { m: st.trainMode, r: JSON.stringify(Store.data.rhythm), l: JSON.stringify(Store.data.rhythmLog), click: Engine.click }; Store.data.rhythm = { levels: {} }; Store.data.rhythmLog = []; Engine.click = () => null;
  try {
    const ids = RHYTHM.LEVELS.map(l => l.id); T.eq(new Set(ids).size, ids.length, 'level ids are unique');
    RHYTHM.LEVELS.filter(l => !l.game).forEach(l => l.pats.forEach(p => { T.ok(p.length === l.pats[0].length && p.length % l.beats === 0 && /^[x.]+$/.test(p) && p.includes('x'), l.id + ' pattern ' + p); }));
    const exp = [0, 1, 2, 3]; T.eq(RHYTHM.score(exp, [0.01, 1.02, 1.99, 3.03]).score, 1, 'close taps are perfect'); T.eq(RHYTHM.score(exp, [0.5, 1.5, 2.5, 3.5]).score, 0, 'half a beat off earns nothing'); T.eq(RHYTHM.score(exp, [0, 1, 2]).score, 0.75, 'a missed hit costs a quarter'); T.eq(RHYTHM.score(exp, [0, 1, 2, 3, 3.4]).extras, 1, 'an extra tap is counted');
    T.eq([60, 70, 85, 95].map(p => RHYTHM.stars(p)).join(), '0,1,2,3', 'stars at 70, 85 and 95');
    st.trainMode = 'rhythm'; UI.show('train'); UI.refresh(); T.ok(!$('#trDevice').hidden && $('#trEx').hidden && $('#trSing').hidden, 'the device shows the rhythm map'); T.eq(PDev.mode(), 'rhythm');
    { const a = PDev.api('rhythm'); T.eq(a.levels.length, RHYTHM.LEVELS.filter(l => !l.game).length, 'every drill level is on the map'); T.eq(a.levels.filter(l => a.unlocked(l.id)).length, 1, 'only the first level is open'); }
    $$('#pdLabels button').forEach(b => { if (b.dataset.m === 'rhythm') T.ok(b.classList.contains('on'), 'the RHYTHM key is lit'); });
    Rhy.open('r1l2'); await new Promise(r => setTimeout(r, 50)); T.ok(!$('#o-rhythm').classList.contains('on'), 'a locked level does not open');
    await Rhy.open('r1l1'); T.ok($('#o-rhythm').classList.contains('on') && PDev.playing(), 'the drill opens inside the screen'); T.ok($$('#rhyLane .rdot').length > 0, 'the lane shows the pattern');
    for (let i = 0; i < Rhy.lv.n; i++) { Rhy.taps = RHYTHM.onsets(Rhy.pat, Rhy.lv.beats).map(b => b * Rhy.beat + 0.01); Rhy.judge(); clearTimeout(Rhy.timer); T.ok($$('#rhyLane .rdot.good').length > 0, 'a clean round lights the hits green'); if (Rhy.rd >= Rhy.lv.n) Rhy.finish(); else Rhy.round(); }
    const rec = Store.data.rhythm.levels.r1l1; T.ok(rec && rec.stars === 3 && rec.best === 100, 'five clean rounds earn three stars: ' + JSON.stringify(rec)); T.ok(RHYTHM.unlocked(Rhy.prog(), 'r1l2'), 'the next level is open'); T.eq(Store.data.rhythmLog.length, 1, 'the drill is logged for the streak'); T.ok(!Rhy.on && PDev.state === 'result' && PDev.res.kind === 'rhythm', 'the device shows the result');
    await Rhy.open('r1l1'); Rhy.setClap(true); T.ok(Rhy.clap && Engine.listeners.has(Rhy.fn), 'clap mode listens to the microphone'); Rhy.phase = 'tap'; Rhy.endAt = Rhy.Y + 99; Rhy.sounds = []; const f = (t, rms) => Rhy.heard({ t, rms }), h = Engine.half || 0.02;
    for (let i = 0; i < 20; i++) f(Rhy.Y - 1 + i * 0.02, 0.003); f(Rhy.Y + 1 - h + 0.01, 0.2); f(Rhy.Y + 1.02 - h + 0.01, 0.2); T.eq(Rhy.taps.length, 1, 'a jump in level is one clap, and its ring is not another'); T.ok(Math.abs(Rhy.taps[0] - 1) < 0.1, 'at about the right time: ' + Rhy.taps[0]);
    Rhy.sounds = [Rhy.Y + 2]; f(Rhy.Y + 2.05 - h + 0.01 - 0.0, 0.003); f(Rhy.Y + 2.07, 0.3); T.eq(Rhy.taps.length, 1, 'a level jump right after our own click is ignored'); Rhy.setClap(false); T.ok(!Engine.listeners.has(Rhy.fn), 'tap mode lets go of the microphone'); Rhy.close();
    await Rhy.open('r1l2'); for (let i = 0; i < Rhy.lv.n; i++) { Rhy.taps = []; Rhy.judge(); clearTimeout(Rhy.timer); if (Rhy.rd >= Rhy.lv.n) Rhy.finish(); else Rhy.round(); }
    T.eq(Store.data.rhythm.levels.r1l2.stars, 0, 'no taps earn nothing'); T.ok(!RHYTHM.unlocked(Rhy.prog(), 'r1l3'), 'and open nothing');
  } finally { Rhy.on && Rhy.close(); Engine.click = keep.click; st.trainMode = keep.m; Store.data.rhythm = JSON.parse(keep.r || 'null') || undefined; Store.data.rhythmLog = JSON.parse(keep.l || 'null') || undefined; UI.show('tuner'); }
});

T.test('beat hero: the five songs build, claps and held notes are judged, the boss song ends the course unit, and a run is scored on the device', async () => {
  await audio(); const st = Store.data.settings, keep = { m: st.trainMode, r: JSON.stringify(Store.data.rhythm), l: JSON.stringify(Store.data.rhythmLog), click: Engine.click, back: st.heroBack }; Store.data.rhythm = { levels: {} }; Store.data.rhythmLog = []; Engine.click = () => null; st.heroBack = true;
  try {
    const G = RHYTHM.LEVELS.filter(l => l.game); T.eq(G.length, 5, 'five game levels'); T.ok(G[4].boss && G[4].game === 'h5', 'the last one is the boss song');
    G.forEach(l => { const song = HERO.SONGS[l.game], notes = HERO.build(song); T.ok(notes.length >= 8, l.id + ' has notes'); song.bars.forEach(b => T.ok(b.length === 8 && /^[csw.\-]+$/.test(b.replace(/ /g, '')) && !/^-/.test(b), l.id + ' bar ' + b)); T.ok(notes.every((n, i) => !i || n.b >= notes[i - 1].b), l.id + ' is in time order'); T.eq(l.bpm, song.bpm, l.id + ' tempo'); });
    T.ok(new Set(G.map(l => HERO.SONGS[l.game].bpm)).size === 5 || HERO.SONGS.h5.bpm > HERO.SONGS.h1.bpm, 'the boss is quicker than the first song');
    T.eq([0.05, 0.1, 0.18, 0.3].map(HERO.clapQ).join(), '1,0.75,0.5,0', 'clap windows'); T.eq([0.9, 0.7, 0.4, 0.1].map(HERO.holdQ).join(), '1,0.75,0.5,0', 'hold windows'); T.eq(HERO.laneOf(300) + HERO.laneOf(900) + HERO.laneOf(20), 'sw' + null, 'voice below 600 Hz, whistle above');
    T.eq([0, 9, 10, 35, 99].map(HERO.mult).join(), '1,1,2,4,4', 'multiplier');
    const a = PDev.api('play'); T.eq(a.levels.length, 5, 'the PLAY map holds the five songs'); T.ok(a.unlocked('r8l1'), 'the first game level is open from the start'); T.ok(!a.unlocked('r8l2'), 'the second waits for a star');
    st.trainMode = 'play'; UI.show('train'); UI.refresh(); T.eq(PDev.mode(), 'play'); T.eq(PDev.KINDS[PDev.KINDS.length - 1], 'play', 'PLAY is the last key, after RHYTHM'); await Rhy.open('r8l2'); T.ok(!Hero.on, 'a locked game level does not open');
    await Rhy.open('r8l1'); T.ok(Hero.on && $('#o-hero').classList.contains('on'), 'the game opens inside the Practice screen'); T.ok($('#o-hero').parentNode === $('#pdPane') && !$('#pdPane').hidden, 'in the device pane'); Hero.at = 0;
    { const W0 = Hero.W, H0 = Hero.H; Hero.W = 900; Hero.H = 400; T.ok(Hero.geo().horiz, 'a wide screen runs the notes sideways'); const gw = Hero.geo(); T.eq(Hero.laneAt(gw.hit + 50, gw.y0 + gw.lw * 1.5), 's', 'a row is a lane'); Hero.draw(1);
      Hero.W = 360; Hero.H = 540; T.ok(!Hero.geo().horiz, 'a tall screen drops them'); const gt = Hero.geo(); T.eq(Hero.laneAt(gt.x0 + gt.lw * 2.5, 300), 'w', 'a column is a lane'); Hero.draw(1); Hero.W = W0; Hero.H = H0; }
    Hero.notes.filter(n => n.l === 'c').forEach((n, i) => { Hero.at = n.t + (i % 2 ? 0.02 : -0.03); Hero.clap(Hero.at); Hero.update(); });
    T.ok(Hero.combo === Hero.notes.length && Hero.points > 0, 'clean claps build a combo: ' + Hero.combo); T.ok(Hero.maxCombo === Hero.notes.length && Hero.meter > 0.9, 'and fill the rock meter');
    Hero.at = Hero.endSec + 1; Hero.update(); T.ok(!Hero.on && PDev.state === 'result' && PDev.res.kind === 'play' && PDev.res.id === 'r8l1', 'the run ends on the device result');
    const rec = Store.data.rhythm.levels.r8l1; T.ok(rec && rec.stars === 3 && rec.best === 100, 'a perfect run earns three stars: ' + JSON.stringify(rec)); T.ok(a.unlocked('r8l2'), 'the second song opens');
    await Rhy.open('r8l2'); Hero.at = 0; const s2 = Hero.notes.find(n => n.l === 's'); for (let t = s2.t; t < s2.t + s2.len; t += 0.02) Hero.voice('s', t, 0.02); Hero.at = s2.t + s2.len + 0.3; Hero.update(); T.eq(s2.q, 1, 'a held voice for the whole note is perfect');
    Hero.voice('w', s2.t + 99, 0.02); const w = Hero.notes.find(n => n.l === 'c'); T.ok(w.q == null || w.q === 0, 'untouched claps stay open or miss');
    Hero.at = Hero.endSec + 1; Hero.update(); T.ok(Store.data.rhythm.levels.r8l2 && Store.data.rhythm.levels.r8l2.stars === 0, 'a song with only one note sung earns nothing');
    await Rhy.open('r8l1'); Hero.at = 0; Hero.notes.forEach(n => Hero.resolve(n, 0)); Hero.update(); T.ok(Hero.fail || !Hero.on, 'missing everything fails the song');
  } finally { Hero.on && Hero.close(); Hero.at = null; Engine.click = keep.click; st.heroBack = keep.back; st.trainMode = keep.m; Store.data.rhythm = JSON.parse(keep.r || 'null') || undefined; Store.data.rhythmLog = JSON.parse(keep.l || 'null') || undefined; UI.show('tuner'); }
});

T.test('SoundFonts popup: Built-in is a font of its own with every built-in instrument', async () => {
  await audio(); scene(); Ed.ti = 0; $('#sfPop').hidden = false; await SFMgr.refresh(true);
  try {
    T.ok($$('#sfpFonts .sfpRow')[0].textContent.startsWith('Built-in'), 'Built-in is the first font'); T.eq(SFMgr.font, SFMgr.BI, 'and it is the one browsed when no SoundFont is in use');
    const rows = $$('#sfpList .sfpRow').map(r => r.firstChild.textContent); T.eq(rows.length, Object.keys(TIMBRES).length + 1, 'every built-in instrument and the drum kit are listed'); T.ok(rows.includes('Drum kit'));
    const k = Object.keys(TIMBRES)[3], row = $$('#sfpList .sfpRow')[3]; row.click(); T.eq(SFMgr.pick, k, 'clicking one highlights it'); await SFMgr.use(SFMgr.pick); T.eq(Seq.tracks[0].inst, 'syn:' + k, 'Use for this track plays the track with it');
    T.eq(SFMgr.current(Seq.tracks[0]).i, k, 'and it is shown as the track\'s sound'); await SFMgr.use('kit'); T.eq(Seq.tracks[0].inst, 'kit', 'the drum kit works too'); await SFMgr.use(null); T.eq(Seq.tracks[0].inst, 'auto', 'Auto goes back to the file');
  } finally { $('#sfPop').hidden = true; }
});

T.test('piano Instruments tab: the built-in sound lists every voice, and the Banks tab names it', async () => {
  await audio(); UI.show('piano'); const st = Store.data.settings, keep = st.timbre; st.timbre = 'soft';
  try {
    Synth.show('banks'); const b = $$('#spBanks .lcdrow')[0]; T.ok(/^Built-in/i.test(b.firstChild.textContent) && b.classList.contains('on'), 'Banks: Built-in is listed and active'); T.eq(b.lastChild.textContent, Object.keys(TIMBRES).length + ' voices', 'with its number of voices');
    Synth.show('patch'); const rows = $$('#spPatches .lcdrow'); T.eq(rows.length, Object.keys(TIMBRES).length, 'Instruments: every built-in voice is listed'); rows[3].click(); T.eq(st.timbre, Object.keys(TIMBRES)[3], 'picking one plays the piano with it');
  } finally { st.timbre = keep; Synth.show('spec'); }
});

T.test('arpeggio with a chord mode: a held key arpeggiates its chord, one note per step', async () => {
  await audio(); UI.show('piano'); const st = Store.data.settings, keep = JSON.stringify({ pk: st.pk, arp: st.arp }), played = [], orig = Engine.playNote;
  Engine.playNote = function (m, w, d, o) { if (o && o.arp) played.push(m); return orig.call(Engine, m, w, d, o); };
  try {
    st.pk = { key: 0, scale: 'major', lock: true, chord: 'triad' }; st.arp = { on: true, rate: 1 / 7, pat: 0, gate: 0.5, oct: 0 }; Arp.clear();
    const h = Engine.playNote(62, Engine.ctx.currentTime + 0.01, 30, { live: true, sustain: true, gain: 0.2 }); T.ok(h && h.release, 'the arpeggiator takes the key'); T.eq(Arp.order().join(), '62,65,69', 'D in C major: the arpeggio runs D F A');
    st.arp.pat = 1; T.eq(Arp.order().join(), '69,65,62', 'down order'); st.arp.pat = 0; st.arp.oct = 1; T.eq(Arp.order().join(), '62,65,69,74,77,81', 'a second octave repeats the chord higher'); st.arp.oct = 0;
    played.length = 0; await T.wait(700); T.ok(played.length >= 3, 'it plays steps: ' + played.join()); T.ok(played.every(m => [62, 65, 69].includes(m)), 'every step is one note of the chord, never the whole chord at once: ' + played.join());
    h.release(); st.pk.chord = 'off'; Arp.clear(); const h2 = Engine.playNote(62, Engine.ctx.currentTime + 0.01, 30, { live: true, sustain: true, gain: 0.2 }); T.eq(Arp.order().join(), '62', 'chords off: the key alone'); h2.release();
  } finally { Engine.playNote = orig; Arp.clear(); const k = JSON.parse(keep); st.pk = k.pk; st.arp = k.arp; }
});

T.test('arpeggio rate: note lengths like the echo time, and Echo follows the echo time', async () => {
  const st = Store.data.settings, keep = JSON.stringify({ arp: st.arp, fxK: st.fxK }); try {
    st.arp = { on: true, rate: 1 / 7, pat: 0, gate: 0.5, oct: 0 }; T.near(Arp.stepSec(), 0.15, 1e-9, '1/16 is a sixteenth of a bar at 100 bpm, 0.15 s'); T.eq(Arp.rateName(), '1/16');
    st.arp.rate = 3 / 7; T.eq(Arp.rateName(), '1/8.'); T.near(Arp.stepSec(), 0.45, 1e-9); st.arp.rate = 1; T.eq(Arp.rateName(), 'Echo');
    st.fxK = { etime: 0 }; T.near(Arp.stepSec(), Seq.ECHO_BEATS[0] * 0.6, 1e-9, 'Echo: 1/16 echo time'); st.fxK = { etime: 0.6 }; T.near(Arp.stepSec(), Seq.ECHO_BEATS[3] * 0.6, 1e-9, 'moving the Echo time moves the arpeggio');
    st.arp.rate = 2 / 7; st.fxK = { etime: 0.4 }; T.near(Arp.stepSec(), 0.3, 1e-9, 'with the same 1/8 on both knobs, the arpeggio and the echo step together'); T.near(Seq.ECHO_BEATS[Math.round(0.4 * 5)] * 0.6, 0.45, 1e-9, 'the default echo time is dotted 1/8');
    st.arp.rate = 3 / 7; T.near(Arp.stepSec(), Seq.ECHO_BEATS[Math.round(0.4 * 5)] * 0.6, 1e-9, 'dotted 1/8 on both: the same time');
  } finally { const k = JSON.parse(keep); st.arp = k.arp; st.fxK = k.fxK; }
});

T.test('courses: every level of the sing, whistle and piano courses builds, stars and unlocking follow the score', async () => {
  const bad = [];
  ['sing', 'whistle'].forEach(k => COURSE.LEVELS[k].forEach(l => { const ex = EXERCISES.find(e => e.id === l.ex); if (!ex) return bad.push(k + ' ' + l.id + ': no exercise ' + l.ex); try { const b = buildExercise(l.ex, { lo: 48, hi: 72 }, 1); if (!b.events.length) bad.push(l.id + ': empty'); } catch (e) { bad.push(l.id + ': ' + e.message); } }));
  COURSE.LEVELS.piano.forEach(l => {
    const d = PXS.find(x => x.id === l.px); if (!d) return bad.push(l.id + ': no piano exercise ' + l.px);
    if (d.o1.length && !d.o1.some(o => o[0] === l.o1)) bad.push(l.id + ': o1 ' + l.o1); if (d.o2.length && !d.o2.some(o => o[0] === l.o2)) bad.push(l.id + ': o2 ' + l.o2);
    if (!buildPianoSteps(l.px, l.key, l.o1, l.o2).length) bad.push(l.id + ': no steps');
  });
  Object.keys(COURSE.KINDS).forEach(k => { const ids = COURSE.LEVELS[k].map(l => l.id); if (new Set(ids).size !== ids.length) bad.push(k + ': duplicate level ids'); COURSE.LEVELS[k].forEach(l => { if (!l.title || !l.desc) bad.push(l.id + ': no text'); }); });
  T.eq(bad.slice(0, 5).join(' | '), '', 'no broken level');
  T.eq([60, 70, 85, 95, 100].map(p => COURSE.stars('sing', p)).join(), '0,1,2,3,3', 'sing: 70, 85 and 95'); T.eq([79, 80, 90, 100].map(p => COURSE.stars('piano', p)).join(), '0,1,2,3', 'piano: 80, 90 and 100');
  const P = {}; T.ok(COURSE.unlocked('piano', P, 'p1l1') && !COURSE.unlocked('piano', P, 'p1l2'), 'only the first level is open'); T.eq(COURSE.next('piano', P).id, 'p1l1');
  P.p1l1 = { best: 70, stars: 0 }; T.ok(!COURSE.unlocked('piano', P, 'p1l2')); P.p1l1 = { best: 80, stars: 1 }; T.ok(COURSE.unlocked('piano', P, 'p1l2')); T.eq(COURSE.next('piano', P).id, 'p1l2');
});
T.test('courses: the Course view lists the levels, a piano level scores and passing opens the next', async () => {
  await audio(); const st = Store.data.settings, keep = { m: st.trainMode, v: st.prView, c: JSON.stringify(Store.data.course), click: Engine.click, hear: PX.hear }; Store.data.course = {}; Engine.click = () => {}; PX.hear = () => {};
  try {
    for (const [mode, inst] of [['sing', 'voice'], ['whistle', 'whistle'], ['piano', 'voice']]) {
      st.trainMode = mode === 'piano' ? 'piano' : 'sing'; st.inst = inst; st.prView = 'course'; UI.show('train'); UI.refresh();
      T.ok(!$('#trDevice').hidden && $('#trEx').hidden, mode + ': the device replaces the exercise list'); { const a = PDev.api(mode); T.eq(PDev.mode(), mode, mode + ': the device shows this source'); T.eq(a.levels.length, COURSE.LEVELS[mode].length, mode + ': every level is on the map'); T.eq(a.levels.filter(l => a.unlocked(l.id)).length, 1, mode + ': only the first level is open'); T.eq(PDev.current(a).id, COURSE.LEVELS[mode][0].id, mode + ': the first level is picked'); }
    }
    const lv = COURSE.LEVELS.piano[0]; Course.start('piano', lv.id); T.ok(PX.on && PX.course && PX.course.id === lv.id, 'the piano level opens');
    while (!PX.finished) { const s = PX.step(); PX.good(); if (PX.advanceAt) PX.advance(); } 
    const rec = Store.data.course.piano[lv.id]; T.ok(rec && rec.stars === 3 && rec.best === 100, 'a clean run earns three stars: ' + JSON.stringify(rec)); T.ok(COURSE.unlocked('piano', Course.prog('piano'), 'p1l2'), 'the next level is open');
    T.ok(/Next level/.test($('#pxRes').textContent), 'the result offers the next level'); PX.close();
    Store.data.course.piano = {}; Course.start('piano', lv.id); PX.skip(); while (!PX.finished) PX.skip(); T.eq(Store.data.course.piano[lv.id].stars, 0, 'skipping every step earns nothing'); PX.close();
    Course.start('piano', 'p1l3'); T.ok(!PX.on, 'a locked level does not open');
    st.trainMode = 'sing'; st.inst = 'voice'; UI.show('train'); const sl = COURSE.LEVELS.sing[0], fake = { course: { kind: 'sing', id: sl.id }, practice: false, result: { agg: { score: 88 } } };
    Course.sessionDone(fake); T.eq(Store.data.course.sing[sl.id].stars, 2, 'a score of 88 earns two stars'); T.eq(fake.course.next, COURSE.LEVELS.sing[1].id, 'and offers the next level'); T.ok(!$('#rCourse').hidden && !$('#rNext').hidden, 'the result shows the course line');
    Course.sessionDone({ course: { kind: 'sing', id: COURSE.LEVELS.sing[1].id }, practice: true, result: { agg: { score: 99 } } }); T.ok(!Store.data.course.sing[COURSE.LEVELS.sing[1].id], 'a practice run is not saved'); T.ok($('#rCourse').hidden, 'and shows no course line');
  } finally { Engine.click = keep.click; PX.hear = keep.hear; PX.on && PX.close(); Store.data.course = JSON.parse(keep.c || 'null') || undefined; st.trainMode = keep.m; st.prView = keep.v; UI.show('tuner'); }
});

T.test('practice device: the map follows the course, the source keys switch kinds, PREV and NEXT pick levels, START opens the picked level', async () => {
  await audio(); const st = Store.data.settings, keep = { m: st.trainMode, v: st.prView, i: st.inst, c: JSON.stringify(Store.data.course), e: JSON.stringify(Store.data.ear), sel: PDev.sel, up: PDev.unitPick, click: Engine.click, hear: PX.hear };
  Store.data.course = {}; Store.data.ear = { levels: {} }; PDev.sel = {}; PDev.unitPick = {}; Engine.click = () => {}; PX.hear = () => {};
  try {
    st.trainMode = 'piano'; st.prView = 'course'; UI.show('train'); UI.refresh(); T.ok(!$('#trDevice').hidden && !$('#trMode') && !$('#prView'), 'the device replaces the old source and view buttons'); PDev.ts = 1000; PDev.draw();
    T.ok(PDev.hits.length >= 4, 'the map has levels and a START button to press'); T.eq($('#pdStars').textContent, '★ 0', 'no stars yet');
    const a = PDev.api('piano'); T.eq(PDev.current(a).id, COURSE.LEVELS.piano[0].id, 'the next level to play is picked');
    PDev.move(1); T.eq(PDev.current(a).id, COURSE.LEVELS.piano[1].id, 'NEXT picks the next level'); PDev.start(); T.ok(!PX.on, 'a locked level does not open'); PDev.move(-1); PDev.move(-1); T.eq(PDev.current(a).id, COURSE.LEVELS.piano[0].id, 'PREV stops at the first level');
    PDev.start(); T.ok(PX.on && PX.course && PX.course.id === COURSE.LEVELS.piano[0].id, 'START opens the picked level'); PX.close();
    T.ok(!$('#pdEx'), 'there is no Exercises key'); T.ok(!document.querySelector('#trDevice .more'), 'there is no MORE panel'); T.ok($('#pdSrc').contains($('#pdRange')), 'RANGE sits with the sound source');
    $('#pdLib').click(); T.eq(st.prView, 'lib'); T.ok(!$('#trLib').hidden && $('#trEx').hidden && $$('#libList .card').length > 0, 'the Library shows inside the screen'); $('#pdLib').click(); T.eq(st.prView, 'course', 'pressing the key again goes back'); T.ok($('#pdPane').hidden, 'the screen shows the map again');
    $('#pdLib').click(); $('#pdMap').click(); T.eq(st.prView, 'course', 'MAP goes back to the level map'); T.ok($('#pdPane').hidden);
    $('#pdLabels button[data-m="ear"]').click(); T.eq(st.trainMode, 'ear', 'the Ear key switches to Ear'); T.eq(PDev.mode(), 'ear'); T.ok(!$('#trDevice').hidden, 'Ear shows the device even in the exercise view'); PDev.draw();
    $('#pdLabels button[data-m="whistle"]').click(); T.eq(PDev.mode(), 'whistle', 'the Whistle key switches the voice to whistling'); T.eq(st.inst, 'whistle');
    $('#pdLabels button[data-m="sing"]').click(); T.eq(PDev.mode(), 'sing'); T.eq(st.inst, 'voice'); PDev.draw();
  } finally { Engine.click = keep.click; PX.hear = keep.hear; PX.on && PX.close(); Store.data.course = JSON.parse(keep.c || 'null') || undefined; Store.data.ear = JSON.parse(keep.e || 'null') || undefined; PDev.sel = keep.sel; PDev.unitPick = keep.up; st.trainMode = keep.m; st.prView = keep.v; st.inst = keep.i; UI.show('tuner'); }
});
T.test('practice device: a finished course level shows its result on the device; REPEAT, NEXT LEVEL and MAP work', async () => {
  await audio(); const st = Store.data.settings, keep = { m: st.trainMode, v: st.prView, i: st.inst, c: JSON.stringify(Store.data.course), e: JSON.stringify(Store.data.ear), l: JSON.stringify(Store.data.earLog), click: Engine.click, hear: PX.hear };
  Store.data.course = {}; Store.data.ear = { levels: {} }; Store.data.earLog = []; Engine.click = () => {}; PX.hear = () => {};
  const shown = () => { PDev.draw(); PDev.res.t = PDev.ts - 9000; PDev.draw(); };
  try {
    st.trainMode = 'piano'; st.prView = 'course'; UI.show('train'); UI.refresh(); const lv = COURSE.LEVELS.piano[0];
    Course.start('piano', lv.id); while (!PX.finished) { PX.step(); PX.good(); if (PX.advanceAt) PX.advance(); }
    T.eq(PDev.state, 'result', 'the device shows the result'); T.ok(!PX.on, 'the piano screen closed'); T.eq(PDev.res.r.stars, 3); T.eq(PDev.res.rank, 'S', 'a clean run is rank S'); T.ok(PDev.res.strip.length > 0 && PDev.res.strip.every(v => v === 1), 'every step was right first time');
    T.ok(!$('#trDevice').hidden && $('#tr-sess').hidden && $('#tr-res').hidden, 'the device is on screen'); shown(); T.ok(PDev.hits.length >= 2, 'REPEAT and NEXT LEVEL can be pressed'); T.eq($('#pdGoLbl').textContent, 'NEXT LEVEL');
    $('#pdGo').click(); T.ok(PX.on && PX.course && PX.course.id === COURSE.LEVELS.piano[1].id, 'the big key opens the next level'); PX.close();
    Course.start('piano', lv.id); PX.skip(); while (!PX.finished) PX.skip(); T.eq(PDev.res.r.stars, 0); T.eq(PDev.res.rank, 'D'); shown(); T.eq($('#pdGoLbl').textContent, 'REPEAT', 'a failed level offers REPEAT');
    $('#pdGo').click(); T.ok(PX.on && PX.course.id === lv.id, 'REPEAT opens the same level'); PX.close();
    $('#pdMap').click(); T.eq(PDev.state, 'map', 'MAP leaves the result');
    st.trainMode = 'sing'; st.inst = 'voice'; UI.show('train'); const sl = COURSE.LEVELS.sing[0];
    Course.sessionDone({ course: { kind: 'sing', id: sl.id }, practice: false, result: { agg: { score: 88, acc: 0.9, sd: 12 }, per: [{ accuracy: 0.9 }, { accuracy: 0.5 }] } });
    T.eq(PDev.state, 'result'); T.eq(PDev.res.kind, 'sing'); T.eq(PDev.res.r.stars, 2); T.eq(PDev.res.strip.length, 2, 'a bar for every note'); T.ok(typeof PDev.res.details === 'function', 'the full results stay one key away'); shown(); $('#pdMap').click();
    st.trainMode = 'ear'; UI.show('train'); UI.refresh(); Ear.open('u1l1'); for (let i = 0; i < 10; i++) { $('#earOpts [data-id="' + Ear.q.answer + '"]').click(); Ear.advance(); }
    T.eq(PDev.state, 'result'); T.eq(PDev.res.kind, 'ear'); T.eq(PDev.res.r.stars, 3); T.eq(PDev.res.strip.length, 10, 'a bar for every question'); T.ok(!Ear.on, 'the drill screen closed'); shown(); T.ok(PDev.hits.length >= 2);
  } finally { Engine.click = keep.click; PX.hear = keep.hear; PX.on && PX.close(); Ear.on && Ear.close(); PDev.state = 'map'; PDev.res = null; Store.data.course = JSON.parse(keep.c || 'null') || undefined; Store.data.ear = JSON.parse(keep.e || 'null') || undefined; Store.data.earLog = JSON.parse(keep.l || 'null') || undefined; st.trainMode = keep.m; st.prView = keep.v; st.inst = keep.i; UI.show('tuner'); }
});

T.test('practice device: the exercise, the piano exercise and the ear drill play inside the screen', async () => {
  await audio(); const st = Store.data.settings, keep = { m: st.trainMode, v: st.prView, i: st.inst, c: JSON.stringify(Store.data.course), e: JSON.stringify(Store.data.ear), l: JSON.stringify(Store.data.earLog), click: Engine.click, hear: PX.hear };
  Store.data.course = {}; Store.data.ear = { levels: {} }; Store.data.earLog = []; Engine.click = () => {}; PX.hear = () => {};
  try {
    st.trainMode = 'sing'; st.inst = 'voice'; st.prView = 'course'; UI.show('train'); UI.refresh(); const pane = $('#pdPane');
    T.ok(pane.hidden, 'the map shows when nothing is playing');
    UI.trainView('sess'); T.ok(!pane.hidden && pane.contains($('#tr-sess')) && !$('#tr-sess').hidden, 'an exercise runs inside the screen'); UI.trainView('res'); T.ok(!pane.hidden && pane.contains($('#tr-res')), 'its results too'); UI.trainView('menu'); T.ok(pane.hidden, 'and the map comes back');
    st.trainMode = 'piano'; UI.refresh(); Course.start('piano', COURSE.LEVELS.piano[0].id); T.ok(PX.on && !pane.hidden && pane.contains($('#o-pex')) && $('#o-pex').classList.contains('on'), 'a piano exercise plays inside the screen'); PX.close(); T.ok(pane.hidden, 'closing it brings the map back');
    st.trainMode = 'ear'; UI.refresh(); Ear.open('u1l1'); T.ok(!pane.hidden && pane.contains($('#o-ear')) && $('#o-ear').classList.contains('on'), 'the ear drill plays inside the screen'); Ear.close(); T.ok(pane.hidden, 'closing it brings the map back');
    UI.show('tuner'); RangeFinder.open(false); T.eq(UI.screen, 'train', 'the range finder opens on the Practice screen'); T.ok(!pane.hidden && pane.contains($('#o-range')) && $('#o-range').classList.contains('on'), 'and runs inside the screen'); RangeFinder.close(); T.ok(pane.hidden, 'closing the range finder brings the map back');
  } finally { Engine.click = keep.click; PX.hear = keep.hear; PX.on && PX.close(); Ear.on && Ear.close(); RangeFinder.active && RangeFinder.close(); UI.trainView('menu'); Store.data.course = JSON.parse(keep.c || 'null') || undefined; Store.data.ear = JSON.parse(keep.e || 'null') || undefined; Store.data.earLog = JSON.parse(keep.l || 'null') || undefined; st.trainMode = keep.m; st.prView = keep.v; st.inst = keep.i; UI.show('tuner'); }
});

T.test('piano Reset: effects, Transpose and Fine tune all go back to zero', async () => {
  await audio(); const st = Store.data.settings, keep = { t: st.transpose, f: st.fineTune, k: JSON.stringify(st.fxK) };
  try {
    st.transpose = 7; st.fineTune = 20; st.fxK = { reverb: 0.6 }; Knobs.reset();
    T.eq(st.transpose, 0, 'Transpose is back at 0'); T.eq(st.fineTune, 0, 'Fine tune is back at 0'); T.eq(Object.keys(st.fxK).length, 0, 'the effect knobs are back too');
    st.transpose = 5; $('#synReset').click(); T.eq(st.transpose, 0, 'the Reset key on the Piano tab does it too');
  } finally { st.transpose = keep.t; st.fineTune = keep.f; st.fxK = JSON.parse(keep.k || '{}'); Knobs.paintLow && Knobs.paintLow(); }
});

T.test('exercise details: the graph is drawn when the details are opened from the device result', async () => {
  await audio(); let drawn = 0; const keep = UI.drawRes; try {
    UI.drawRes = () => { drawn++; }; UI.trainView('sess'); UI.trainView('res'); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); T.ok(drawn >= 1, 'the graph is drawn when the details show'); UI.trainView('menu'); const n = drawn; UI.trainView('res'); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); T.ok(drawn > n, 'and again when they are opened a second time');
  } finally { UI.drawRes = keep; UI.trainView('menu'); }
});

T.test('practice device: on the details page the big key repeats the exercise with a repeat symbol', async () => {
  await audio(); const st = Store.data.settings, keep = { m: st.trainMode, v: st.prView, i: st.inst, again: Session.again }; let again = 0;
  try {
    Session.again = () => { again++; }; st.trainMode = 'sing'; st.inst = 'voice'; st.prView = 'course'; UI.show('train'); UI.refresh(); T.eq($('#pdGoLbl').textContent, 'START'); T.eq($('#pdGo').dataset.ico, 'play');
    UI.trainView('res'); T.eq($('#pdGoLbl').textContent, 'REPEAT', 'the key says REPEAT on the details page'); T.eq($('#pdGo').dataset.ico, 'rep', 'with a repeat symbol'); $('#pdGo').click(); T.eq(again, 1, 'and pressing it repeats the exercise');
    UI.trainView('menu'); T.eq($('#pdGoLbl').textContent, 'START'); T.eq($('#pdGo').dataset.ico, 'play', 'back to the play symbol');
  } finally { Session.again = keep.again; UI.trainView('menu'); st.trainMode = keep.m; st.prView = keep.v; st.inst = keep.i; UI.show('tuner'); }
});

T.test('mic gate slider: the cap sets the gate, the LED bar shows the live level', async () => {
  UI.show('settings'); const st = Store.data.settings, keep = st.gateDb, el = $('#gateSl'); await T.wait(50);
  try {
    st.gateDb = -42; UI.refresh(); T.eq($('#gateOut').textContent, '-42 dB', 'the readout shows the gate'); T.near(+el.style.getPropertyValue('--v'), (-42 + 60) / 50, 1e-3, 'the cap sits at -42 dB on a -60 to -10 track');
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); T.eq(st.gateDb, -41, 'the right arrow raises the gate one dB'); el.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })); T.eq(st.gateDb, -10, 'End is the top of the range, the end of the track'); el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })); T.eq(st.gateDb, -60, 'Home is the bottom');
    Gate.set(-5); T.eq(st.gateDb, -10, 'the cap cannot go past the end of the track'); T.eq($$('#gateSl .leds s.th').length, 1, 'one LED marks the threshold'); T.eq($$('#gateSl .leds s')[19].classList.contains('th'), true, 'at the gate, here the last one');
    const r = el.getBoundingClientRect(); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7, clientX: r.left + r.width / 2, clientY: r.top + 60 })); el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 7 })); T.ok(Math.abs(st.gateDb - -35) <= 2, 'clicking the middle of the track sets about -35 dB: ' + st.gateDb); T.eq($$('#gateSl .leds s.th').length, 1); T.ok($$('#gateSl .leds s')[9].classList.contains('th') || $$('#gateSl .leds s')[10].classList.contains('th'), 'the marked LED follows the cap');
    Gate.live(-90); T.eq($$('#gateSl .leds s.on').length, 0, 'silence lights nothing'); Gate.live(-34); T.eq($$('#gateSl .leds s.on').length, 10, 'a level of -34 dB lights 10 of 20'); Gate.live(-5); T.eq($$('#gateSl .leds s.on').length, 20, 'a loud level lights them all');
  } finally { Gate.live(-90); st.gateDb = keep; Store.save(); UI.show('tuner'); }
});

T.test('settings: rockers, key groups, faders and steppers drive the same settings as before', async () => {
  UI.show('settings'); const st = Store.data.settings, keep = JSON.stringify({ hear: st.hear, diff: st.diff, tempo: st.tempo, vol: st.vol, timbre: st.timbre, a4: st.a4, find: st.find, specLine: st.specLine }); await T.wait(50);
  try {
    st.hear = true; st.diff = 'medium'; st.tempo = 100; st.vol = 0.8; st.a4 = 440; st.find = 1; UI.refresh();
    const r = $('#setHear'); T.eq(r.checked, true, 'a rocker shows the setting'); T.eq(r.getAttribute('aria-pressed'), 'true'); r.click(); T.eq(st.hear, false, 'clicking a rocker flips the setting'); T.eq(r.checked, false); r.click(); T.eq(st.hear, true);
    st.specLine = true; UI.refresh(); $('#specLine').click(); T.eq(st.specLine, false, 'the Spectrogram rockers work too'); $('#specLine').click();
    T.eq($('#setDiff').value, 'medium', 'a key group shows the setting'); T.eq($$('#setDiff button[aria-pressed="true"]').length, 1, 'one key is down'); $('#setDiff button[data-v="hard"]').click(); T.eq(st.diff, 'hard', 'a key sets it'); T.eq($('#setDiff').value, 'hard'); $('#setFind button[data-v="0.3"]').click(); T.eq(st.find, 0.3, 'numbers come through as numbers');
    T.eq($('#setTempo').value, '100', 'a fader shows the tempo'); const f = $('#setTempo'); f.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); T.eq(st.tempo, 105, 'the arrow key moves it one step'); T.eq($('#tempoVal').textContent, '105%', 'and the screen shows it'); f.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true })); T.eq(st.tempo, 150); f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })); T.eq(st.tempo, 50);
    const r2 = f.getBoundingClientRect(); f.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 9, clientX: r2.left + r2.width / 2, clientY: r2.top + 20 })); f.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 9 })); T.ok(Math.abs(st.tempo - 100) <= 10, 'clicking the middle of the track sets about 100%: ' + st.tempo);
    $('#setVol').dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true })); T.near(st.vol, 0.1, 1e-9, 'the volume fader goes down to 10%'); T.eq($('#volVal').textContent, '10%');
    const t0 = st.timbre; $('.stp[data-for="setTimbre"] .r').click(); T.ok(st.timbre !== t0 && st.timbre !== 'sf', 'a stepper moves to the next instrument: ' + t0 + ' -> ' + st.timbre); T.eq($('.stp[data-for="setTimbre"] b').textContent.toLowerCase(), $('#setTimbre').options[$('#setTimbre').selectedIndex].textContent.toLowerCase(), 'its screen names it');
    $('.stp[data-for="setA4"] .r').click(); T.eq(st.a4, 441, 'the A4 stepper adds a hertz'); T.eq($('.stp[data-for="setA4"] b').textContent, '441 Hz'); $('.stp[data-for="setA4"] .l').click();
    T.ok($('.stp[data-for="pfSel"] b').textContent.length > 1, 'the profile screen names the profile: "' + $('.stp[data-for="pfSel"] b').textContent + '"');
  } finally { const k = JSON.parse(keep); Object.assign(st, k); Store.save(); UI.refresh(); UI.show('tuner'); }
});

/* ---- Sand display view ---- */
T.test('sand view: a Display button shows the sand pane, a played key pours into it, turn and shake work, the pane is saved', async () => {
  await audio(); UI.show('piano'); const st = Store.data.settings, keep = st.specView, an0 = Engine.analyser, frames = async n => { for (let i = 0; i < n; i++) { Spec.draw(); await new Promise(r => setTimeout(r, 16)); } };
  try {
    if (!Engine.analyser) Engine.analyser = Engine.ctx.createAnalyser(); Sand.clear(); const btn = $('.dv[data-v="sand"]'); T.ok(btn, 'the Display view has a Sand button'); btn.click(); T.eq(st.specView, 'sand', 'the button selects the Sand view'); T.eq(btn.getAttribute('aria-pressed'), 'true');
    await frames(3); T.ok(!$('#sandCtl').hidden, 'turn, shake and empty show in the Sand view');
    Midi.msg([0x90, 60, 90], true); await frames(60); Midi.msg([0x80, 60, 0], true); T.ok(Sand.count() > 200, 'a played key pours sand: ' + Sand.count() + ' grains');
    for (const n of [62, 64, 65]) { Midi.msg([0x90, n, 90], true); await frames(4); Midi.msg([0x80, n, 0], true); await frames(4); } await frames(90); T.ok(Sand.water() > 100, 'four keys in a row make it rain: ' + Sand.water() + ' water cells');
    { const vk = VKeys.used, tm = Tuner.midi, lv = Tuner.lastVoiced; VKeys.used = true; Sand.clear(); await frames(2); for (let i = 0; i < 70; i++) { Tuner.onFrame({ midi: 64.05 + Math.sin(i / 5) * 0.2, f: 330 }); Spec.draw(); await new Promise(r => setTimeout(r, 16)); } await frames(30); T.ok(Sand.count() > 40, 'a sung note trickles in at once, even after on-screen keys were used: ' + Sand.count() + ' grains'); VKeys.used = vk; Tuner.midi = tm; Tuner.lastVoiced = lv; }
    await frames(120); const n0 = Sand.count(); Sand.turn(); await frames(80); Sand.shake(); await frames(70); T.near(Sand.count(), n0, 40, 'turning and shaking keep every grain');
    Sand.save(); T.ok(localStorage.getItem('tunerite.sand.v2').length > 20, 'the pane is saved'); Sand.clear(); await frames(2); T.eq(Sand.count(), 0, 'Empty clears the pane');
    st.specView = 'water'; Spec.draw(); T.ok($('#sandCtl').hidden, 'the controls hide in the other views');
  } finally { st.specView = keep; Engine.analyser = an0; Sand.clear(); Midi.panic && Midi.panic(); UI.show('tuner'); }
});

T.test('sand view: motion sensors shake the pane, turn it over when the phone is upside down, and lean the sand when it is tilted', async () => {
  await audio(); UI.show('piano'); const st = Store.data.settings, keep = st.specView, an0 = Engine.analyser, frames = async n => { for (let i = 0; i < n; i++) { Spec.draw(); await new Promise(r => setTimeout(r, 16)); } };
  const ev = (g, lin) => window.dispatchEvent(new DeviceMotionEvent('devicemotion', { accelerationIncludingGravity: g, acceleration: lin || { x: 0, y: 0, z: 0 } }));
  try {
    if (!Engine.analyser) Engine.analyser = Engine.ctx.createAnalyser(); st.specView = 'sand'; Sand.clear();
    for (const n of [60, 64, 67, 62]) { Midi.msg([0x90, n, 90], true); await frames(3); Midi.msg([0x80, n, 0], true); await frames(8); } await frames(200);
    await Sand.motion(); T.ok(Sand.motionState().on, 'the Motion button switches the sensors on'); T.eq($('#sandCtl [data-s="motion"]').getAttribute('aria-pressed'), 'true');
    ev({ x: 0, y: 9.8, z: 0 }, { x: 22, y: 0, z: 0 }); T.ok(Sand.motionState().shaking, 'a sharp spike of acceleration shakes the pane'); await frames(80);
    const r0 = Sand.motionState().right; ev({ x: -5, y: 8.4, z: 0 }); T.near(Sand.motionState().lean, 0.6, 0.05, 'tilting the phone sets how far the sand leans'); await frames(150);
    T.ok(Sand.motionState().right > r0 + 0.04, 'tilted to the right, the sand moves to the right: ' + r0.toFixed(2) + ' to ' + Sand.motionState().right.toFixed(2));
    ev({ x: 0, y: 9.8, z: 0 }); T.eq(Sand.motionState().lean, 0, 'held upright, nothing leans'); const top0 = Sand.motionState().top; ev({ x: 0, y: -9.8, z: 0 }); { const m = Sand.motionState(); T.ok(m.inverted && m.gravityUp, 'turned upside down, gravity points up on the screen'); T.ok(!m.squashed, 'the screen does not flip: the phone is doing that'); T.near(m.top, top0, 0.02, 'and the picture stays where it is: ' + top0.toFixed(2) + ' of the sand in the top half before, ' + m.top.toFixed(2) + ' after'); } await frames(150); T.ok(Sand.motionState().top > top0 + 0.1, 'then the sand falls toward the top: ' + Sand.motionState().top.toFixed(2)); Sand.turn(); T.ok(Sand.motionState().squashed, 'the Turn button still flips the screen');
    await Sand.motion(); T.ok(!Sand.motionState().on, 'the Motion button switches them off again');
  } finally { st.specView = keep; Engine.analyser = an0; Sand.clear(); localStorage.removeItem('tunerite.sandmotion'); UI.show('tuner'); }
});

