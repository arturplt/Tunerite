"use strict";
/* A tiny test harness for the in-page tests. T.test(name, fn) registers a (possibly async) test; T.start() runs them all and posts the result to tools/run_app_tests.py.
   The tests run in the global scope of the app, so they use its objects directly (Seq, Ed, Steps, Store, ...). */
const T = {
  tests: [], log: [], passed: 0, failed: 0, perf: {},
  test(name, fn, perf) { this.tests.push({ name, fn, perf: !!perf }); },
  eq(a, b, m) { if (!Object.is(a, b)) throw new Error((m ? m + ': ' : '') + 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); },
  deep(a, b, m) { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error((m ? m + ': ' : '') + 'expected ' + y + ', got ' + x); },
  ok(v, m) { if (!v) throw new Error(m || 'expected a truthy value'); },
  near(a, b, tol, m) { if (!(Math.abs(a - b) <= tol)) throw new Error((m ? m + ': ' : '') + 'expected ' + b + ' ± ' + tol + ', got ' + a); },
  wait(ms) { return new Promise(r => setTimeout(r, ms)); },
  /* Every test starts from the same app state: the start overlay closed, the settings as they were, and the sequencer empty. */
  async reset(snapshot) {
    $('#o-start').classList.remove('on'); $$('.overlay.on').forEach(o => o.classList.remove('on'));
    Store.data.settings = JSON.parse(snapshot); try { Seq.halt(); } catch (e) { /* nothing was playing */ }
    Store.data.seq = null; Store.data.midi = null; Seq.tracks = []; Seq.song = null; Seq.loopA = Seq.loopB = null; Seq.loop = false; Seq.projKey = null; Seq.dirty = false; Steps.rm.clear(); Steps.mode = null; Steps.forTrack = null; Steps.bar = 0;
    Ed.on = false; Ed.song = null; Ed.ti = 0; Ed.sel.clear(); Ed.hist = new EditHistory(); $('#sqEdit').hidden = true;
  },
  async start(perf) {
    await this.wait(400);
    const snapshot = JSON.stringify(Store.data.settings);
    for (const t of this.tests) {
      if (perf !== !!t.perf) continue;
      try { await this.reset(snapshot); await t.fn(); this.passed++; this.log.push('ok   ' + t.name); }
      catch (e) { this.failed++; this.log.push('FAIL ' + t.name + '\n     ' + (e && e.message || e)); }
    }
    await fetch('/__result', { method: 'POST', body: JSON.stringify({ log: this.log, passed: this.passed, failed: this.failed, perf: this.perf }) });
  }
};
/* A song with a piano track (four notes), a bass track and a drum track, loaded into the sequencer and editor. */
function scene(extra) {
  const song = songNew('Test'); songAddTrack(song, 'Bass', 1, 33); songAddTrack(song, 'Drums', 9, 0);
  [60, 62, 64, 65].forEach((m, i) => song.tracks[0].notes.push({ midi: m, tick: i * 480, dur: 400, vel: 90, ch: 0 }));
  if (extra) extra(song);
  $('#stTap').value = '1'; $('#edChord').value = '0'; $('#edScale').value = 'off'; $('#edLen').value = '0'; $('#edAllTr').checked = false; $('#stDiv').value = '16'; $('#edRep').value = '3';
  Seq.load(songToUnits(song), 'Test', song); UI.show('seq'); Seq.render(); Ed.attach(); Ed.draw(); return song;
}
