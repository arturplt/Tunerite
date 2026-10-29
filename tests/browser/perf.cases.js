"use strict";
/* Load test: how long the app's own work takes with a heavy song (12 tracks, 600 notes each). Numbers are ms per operation and depend on the machine, so tools/run_app_tests.py
   compares them with tests/perf-baseline.json taken on the same machine, and flags anything more than twice as slow. */
function bigSong() {
  const song = songNew('Big'); for (let k = 1; k < 11; k++) songAddTrack(song, 'T' + k, k < 9 ? k : k + 1, k * 5); songAddTrack(song, 'Drums', 9, 0);
  song.tracks.forEach((tr, k) => {
    const dr = k === song.tracks.length - 1;
    for (let i = 0; i < 600; i++) tr.notes.push(dr ? { midi: [36, 42, 38, 42][i % 4], tick: i * 120, dur: 100, vel: 90, ch: 9 } : { midi: 40 + ((i * 7 + k * 3) % 40), tick: i * 120, dur: 160, vel: 90, ch: tr.progs[0].ch });
  });
  return song;
}
const time = (fn, n) => { fn(); const t0 = performance.now(); for (let i = 0; i < n; i++) fn(); return (performance.now() - t0) / n; };

T.test('load: the screen is drawn quickly with a big song', async () => {
  await audio(); const song = bigSong(); Seq.load(songToUnits(song), 'Big', song); UI.show('seq'); Seq.render(); Ed.attach(); Ed.ti = 1; Ed.draw();
  T.perf['draw: overview (ms)'] = time(() => Seq.draw(), 60);
  T.perf['draw: piano roll with ghosts (ms)'] = time(() => Ed.draw(), 60);
  T.perf['draw: tempo strip (ms)'] = time(() => Meta.draw(), 60);
  Ed.ti = 11; Steps.show(true); T.perf['draw: step grid (ms)'] = time(() => { Steps.sig = ''; Steps.draw(); }, 60);
  T.perf['mixer: meters + sliders (ms)'] = time(() => { Seq.mAt = 0; Seq.meters(); Seq.sliders(); }, 60);
  T.perf['edit: commit one change (ms)'] = time(() => Ed.edit(() => {}), 5);
  T.perf['song: write to MIDI bytes (ms)'] = time(() => writeSong(song), 5);
  T.perf['song: build playable tracks (ms)'] = time(() => songToUnits(song), 5);
}, true);

T.test('load: playback keeps up with a big song', async () => {
  await audio(); const song = bigSong(); Seq.load(songToUnits(song), 'Big', song); UI.show('seq'); Seq.render(); await Seq.start(0); await T.wait(1500);
  T.perf['play: scheduler tick (ms)'] = time(() => Seq.tick(), 40);
  T.perf['play: live voices at once (count)'] = Seq.nodes.length;
  T.perf['play: voices held by the audio pools (count)'] = (Engine.seqLive ? Engine.seqLive.length : 0) + (Engine.drumLive ? Engine.drumLive.length : 0);       // what the caps limit; Seq.nodes above only counts handles
  let frames = 0; const t0 = performance.now(); await new Promise(r => { const f = () => { frames++; if (performance.now() - t0 < 1500) requestAnimationFrame(f); else r(); }; requestAnimationFrame(f); });
  T.perf['play: frames per second drawn (inverse, ms)'] = 1000 / (frames / 1.5);
  Seq.pause();
}, true);

T.test('load: audio rendering cost of the voices and the effects', async () => {
  await audio();
  const render = async (setup, sec) => { const sr = 48000, off = new OfflineAudioContext(2, sr * sec, sr), saved = Object.assign({}, Engine); try { Engine.ctx = off; Engine.buildFx(); setup(off); } finally { Object.assign(Engine, saved); } const t0 = performance.now(); await off.startRendering(); return (performance.now() - t0) / sec; };
  T.perf['render: effects idle (ms per second of audio)'] = await render(() => {}, 3);
  T.perf['render: 120 soft notes (ms per second of audio)'] = await render(() => { for (let i = 0; i < 120; i++) Engine._playNote(40 + (i % 30), i * 0.025, 0.3, { nopool: true, synth: 'soft' }); }, 3);
  T.perf['render: 120 drum hits (ms per second of audio)'] = await render(() => { for (let i = 0; i < 120; i++) Engine.drum([36, 38, 42, 46][i % 4], i * 0.025, 100, undefined, true); }, 3);
}, true);
