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
