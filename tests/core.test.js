// Run with: node tests/core.test.js
// Loads the pure CORE files (js/core/*.js) the page loads, in the same order, so the tests exercise the code that ships.
const fs = require('fs'), path = require('path'), assert = require('assert');
const CORE_FILES = ['pitch', 'scoring', 'exercises', 'midi-import', 'song', 'progress', 'library', 'soundfont-read'];
const core = CORE_FILES.map(f => fs.readFileSync(path.join(__dirname, '..', 'js', 'core', f + '.js'), 'utf8').replace(/^"use strict";\n/, '')).join('\n')
  .split('/* CORE:BEGIN */')[1].split('/* CORE:END */')[0];
const C = new Function(core + `; return { freqToMidi, midiToFreq, noteName, centsOff, analyse, PitchTracker, scoreEvent, aggregate, starsFor,
  buildExercise, parseMidi, newSong, newSongTrack, parseSong, writeSong, songSegs, songSec, songTick, songToUnits, gridTicks, snapTick, songSnapshot, songRestore, EditHistory, sortNotes, notesTranspose, notesQuantize, notesCopy, notesPaste, songEndTick, songBarLines, songBeats, framesToNotes, songTrackChannels, songFreeChannel, songAddTrack, songDeleteTrack, songMoveTrack, songSetProgram, songSetChannel, songTempoAt, songSetTempo, songRemoveTempo, songBarStart, songSetTimeSig, songRemoveTimeSig, keyName, songSetKey, songCtrlEvents, songSetCtrl, songRemoveCtrl, songClearCtrl, songNew, songAutomation, encodeWav, lastLoud, melodyFromNotes, buildCustom, EXERCISES, computeStreak, describeDeviation, TOLERANCE, HOP, targetAt,
  chordName, analyseTake, countIssues, adaptivePlan, ISSUES, refine, detectNotes, describeKeys, intervalName, buildPianoSteps, chordMatches, pianoSummary, pianoRoot, libraryItems, libraryFilter, SING_META, PIANO_LIB, LEVELS, parseSoundFont, soundFontVoices,
  SING_PATTERNS, SING_RANDOM, mulberry32, degSemis, romanChords, PIANO_PROGS, PIANO_OPTS, PIANO_CHORDS, PIANO_SCALES, PIANO_NAMES, PIANO_PATTERNS, PIANO_INTERVALS };`)();

let pass = 0, fail = 0;
function test(name, fn) { try { fn(); pass++; console.log('ok   ' + name); } catch (e) { fail++; console.log('FAIL ' + name + '\n     ' + e.message); } }
const SR = 48000;
function tone(f, n, opts) {
  opts = opts || {}; const b = new Float32Array(n);
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5;
  for (let i = 0; i < n; i++) {
    const t = i / SR; let v = 0;
    if (opts.saw) for (let h = 1; h <= 8; h++) v += Math.sin(2 * Math.PI * f * h * t) / h; else v = Math.sin(2 * Math.PI * f * t);
    b[i] = 0.3 * v + (opts.noise || 0) * rnd();
  }
  return b;
}
const centsErr = (f, target) => 1200 * Math.log2(f / target);

test('midi/frequency conversion and names', () => {
  assert.strictEqual(C.freqToMidi(440), 69); assert.strictEqual(C.noteName(69), 'A4'); assert.strictEqual(C.noteName(60), 'C4');
  assert.ok(Math.abs(C.midiToFreq(60) - 261.6256) < 0.001); assert.ok(Math.abs(C.freqToMidi(C.midiToFreq(55.3, 442), 442) - 55.3) < 1e-9);
  assert.ok(Math.abs(C.freqToMidi(442, 442) - 69) < 1e-9);
});
test('YIN: sine waves G2..G5 within 5 cents', () => {
  for (let m = 43; m <= 79; m++) {
    const f = C.midiToFreq(m), r = C.analyse(tone(f, 2048), SR);
    assert.ok(r.f > 0, 'no pitch at ' + f); assert.ok(Math.abs(centsErr(r.f, f)) < 5, `midi ${m}: ${centsErr(r.f, f).toFixed(1)} cents`);
  }
});
test('YIN: works at 44.1 kHz too', () => {
  const b = new Float32Array(2048); for (let i = 0; i < 2048; i++) b[i] = 0.3 * Math.sin(2 * Math.PI * 220 * i / 44100);
  assert.ok(Math.abs(centsErr(C.analyse(b, 44100).f, 220)) < 5);
});
test('YIN: sawtooth (strong harmonics) gives the fundamental, not an octave', () => {
  [98, 130.81, 196, 261.63, 392].forEach(f => { const r = C.analyse(tone(f, 2048, { saw: true }), SR); assert.ok(Math.abs(centsErr(r.f, f)) < 8, f + ' Hz -> ' + r.f); });
});
test('YIN: tolerates noise (about 20 dB SNR)', () => {
  const f = 220, r = C.analyse(tone(f, 2048, { noise: 0.06 }), SR); assert.ok(Math.abs(centsErr(r.f, f)) < 10, String(r.f));
});
test('YIN: silence is not voiced', () => { const r = C.analyse(new Float32Array(2048), SR); assert.strictEqual(r.f, 0); });
test('Tracker: gate blocks quiet frames', () => {
  const t = new C.PitchTracker({ gate: 0.01 }); assert.strictEqual(t.push(220, 0.95, 0.001), null); assert.ok(t.push(220, 0.95, 0.1) != null);
});
test('Tracker: brief octave glitch is rejected, sustained octave jump is accepted', () => {
  const t = new C.PitchTracker(); let out;
  for (let i = 0; i < 10; i++) out = t.push(220, 0.95, 0.1);
  assert.ok(Math.abs(out - 57) < 0.01);
  for (let i = 0; i < 2; i++) out = t.push(440, 0.95, 0.1);
  assert.ok(Math.abs(out - 57) < 0.01, 'glitch leaked: ' + out);
  t.push(220, 0.95, 0.1);
  for (let i = 0; i < 8; i++) out = t.push(440, 0.95, 0.1);
  assert.ok(Math.abs(out - 69) < 0.01, 'sustained jump not accepted: ' + out);
});
test('Tracker: smooths single-frame outliers', () => {
  const t = new C.PitchTracker(); let out;
  [220, 220, 220, 226, 220, 220].forEach(f => out = t.push(f, 0.95, 0.1)); assert.ok(Math.abs(out - 57) < 0.02);
});

// ---- scoring ----
function frames(ev, fn) { const a = []; for (let t = ev.start; t < ev.start + ev.dur; t += C.HOP) a.push({ t, m: fn(t - ev.start) }); return a; }
const EV = { midi: 60, start: 0, dur: 3 };
const sc = (fn, tol) => C.scoreEvent(frames(EV, fn), EV, tol || 25);
test('Scoring: perfect hold scores near 100', () => { assert.ok(sc(() => 60).score > 98); });
test('Scoring: silence scores about zero', () => { const r = sc(() => null); assert.ok(r.score < 5, String(r.score)); assert.strictEqual(r.dev, null); });
test('Scoring: ordering perfect > slightly sharp > wobbly > late > silent', () => {
  const perfect = sc(() => 60).score, sharp = sc(() => 60.2).score;
  const wobble = sc(t => 60 + 0.4 * Math.sin(t * 20)).score, late = sc(t => t < 1.2 ? 63 : 60).score;
  assert.ok(perfect > sharp, 'perfect>sharp'); assert.ok(sharp > wobble, `sharp ${sharp} > wobble ${wobble}`); assert.ok(perfect > late, 'late');
});
test('Scoring: sharp/flat reported with correct sign', () => {
  assert.ok(Math.abs(sc(() => 60.2).dev - 20) < 0.5); assert.ok(Math.abs(sc(() => 59.8).dev + 20) < 0.5);
  assert.strictEqual(C.describeDeviation(20, 25), '20¢ sharp'); assert.strictEqual(C.describeDeviation(-20, 25), '20¢ flat'); assert.strictEqual(C.describeDeviation(2, 25), 'on pitch');
});
test('Scoring: natural vibrato (+-30 cents at 5.5 Hz) is not punished as wobble', () => {
  const vib = sc(t => 60 + 0.3 * Math.sin(2 * Math.PI * 5.5 * t), 50), wob = sc(t => 60 + 0.3 * Math.sin(2 * Math.PI * 0.8 * t), 50);
  assert.ok(vib.sd < 8, 'vibrato sd ' + vib.sd); assert.ok(wob.sd > 3 * vib.sd, `slow wobble ${wob.sd} should exceed vibrato ${vib.sd}`);
});
test('Scoring: attack time measured from note start', () => {
  const r = sc(t => t < 0.6 ? null : 60); assert.ok(Math.abs(r.attack - 0.6) < 0.05, String(r.attack));
});
test('Scoring: tighter tolerance lowers the score for the same singing', () => {
  const f = () => 60.15; assert.ok(sc(f, 50).score > sc(f, 25).score); assert.ok(sc(f, 25).score > sc(f, 10).score);
});
test('Scoring: glide events are scored against the moving target', () => {
  const g = { midi: 60, midi2: 72, start: 0, dur: 4 };
  const good = C.scoreEvent(frames(g, t => 60 + 12 * t / 4), g, 25), bad = C.scoreEvent(frames(g, () => 60), g, 25);
  assert.ok(good.score > 95 && bad.score < 50, `${good.score} vs ${bad.score}`);
});
test('Stars thresholds', () => { assert.deepStrictEqual([49, 50, 70, 90].map(C.starsFor), [0, 1, 2, 3]); });
test('Aggregate weights by duration', () => {
  const evs = [{ dur: 1 }, { dur: 3 }], res = [{ score: 100, accuracy: 1, dev: 0, sd: 0, attack: 0.2 }, { score: 0, accuracy: 0, dev: null, sd: null, attack: null }];
  assert.strictEqual(C.aggregate(res, evs).score, 25);
});


test('Scoring: a longer find-the-note time forgives a slow start', () => {
  const f = t => t < 0.9 ? null : 60, fr = frames(EV, f);
  const quick = C.scoreEvent(fr, EV, 25, 0.3), relaxed = C.scoreEvent(fr, EV, 25, 1);
  assert.ok(relaxed.score > quick.score + 8, `${relaxed.score} vs ${quick.score}`);
  assert.ok(relaxed.parts.att > quick.parts.att);
});

// ---- MIDI import ----
function midiBytes() {            // format 1, 480 ppq, 120 bpm: C4 quarter, then E4+G4 chord quarter, drums on ch 10
  const trk = a => { const n = a.length; return [0x4d,0x54,0x72,0x6b,0,0,(n>>8)&255,n&255].concat(a); };
  const t0 = trk([0,0xff,0x51,3,0x07,0xa1,0x20, 0,0xff,0x2f,0]);
  const t1 = trk([0,0xff,0x03,3,0x4d,0x65,0x6c, 0,0x90,60,80, 0x83,0x60,0x80,60,0, 0,0x90,64,80, 0,0x90,67,80, 0x83,0x60,0x80,64,0, 0,0x80,67,0, 0,0xff,0x2f,0]);
  const t2 = trk([0,0x99,36,90, 0x60,0x89,36,0, 0,0xff,0x2f,0]);
  return Uint8Array.from([0x4d,0x54,0x68,0x64,0,0,0,6,0,1,0,3,0x01,0xe0].concat(t0, t1, t2));
}
test('MIDI: parses tempo, tracks, channels and note times', () => {
  const r = C.parseMidi(midiBytes()); assert.strictEqual(r.bpm, 120);
  const mel = r.units.find(u => u.name === 'Mel'); assert.ok(mel && !mel.drums);
  assert.strictEqual(mel.notes.length, 3); assert.ok(Math.abs(mel.notes[0].dur - 0.5) < 1e-6); assert.ok(Math.abs(mel.notes[1].start - 0.5) < 1e-6);
  assert.ok(r.units.some(u => u.drums));
  assert.throws(() => C.parseMidi(Uint8Array.from([1,2,3])), /MIDI/);
});
test('MIDI: keeps velocity, program and bank per track, and where a melody starts in the file', () => {
  const trk = a => { const n = a.length; return [0x4d,0x54,0x72,0x6b,0,0,(n>>8)&255,n&255].concat(a); };
  const t1 = trk([0,0xb2,0,1, 0,0xc2,33, 0x83,0x60,0x92,48,100, 0x83,0x60,0x82,48,0, 0,0xff,0x2f,0]);     // bank 1, program 33 on channel 3; one note after a rest of 1 beat
  const r = C.parseMidi(Uint8Array.from([0x4d,0x54,0x68,0x64,0,0,0,6,0,1,0,2,0x01,0xe0].concat(trk([0,0xff,0x51,3,0x07,0xa1,0x20, 0,0xff,0x2f,0]), t1)));
  const u = r.units[0]; assert.strictEqual(u.program, 33); assert.strictEqual(u.bank, 1); assert.strictEqual(u.notes[0].vel, 100);
  const m = C.melodyFromNotes([{ midi: 60, start: 2, dur: 1 }, { midi: 62, start: 3, dur: 1 }, { midi: 64, start: 4, dur: 1 }]);
  assert.strictEqual(m.t0, 2); assert.strictEqual(m[0].start, 0);
});
test('MIDI: chords keep the top note, and a custom exercise fits the range by octaves', () => {
  const r = C.parseMidi(midiBytes()), m = C.melodyFromNotes(r.units.find(u => u.name === 'Mel').notes);
  assert.deepStrictEqual(m.map(n => n.midi), [60, 67]);
  const ex = C.buildCustom('t', m, 120, { lo: 45, hi: 57 });
  assert.deepStrictEqual(ex.events.map(e => e.midi), [48, 55]); assert.ok(ex.fits);
  assert.ok(Math.abs(ex.total - 1) < 1e-6);
});

// ---- exercises ----
test('Every exercise builds, is ordered, and fits a typical range', () => {
  const range = { lo: 43, hi: 64 };       // G2-E4
  C.EXERCISES.forEach(def => {
    const ex = C.buildExercise(def.id, range); assert.ok(ex.events.length > 0, def.id);
    let t = 0; ex.events.forEach(e => { assert.ok(Math.abs(e.start - t) < 1e-9, def.id + ' gap'); t += e.dur; });
    assert.ok(Math.abs(t - ex.total) < 1e-9);
    if (def.id !== 'drum' && !def.id.startsWith('octave') && def.id !== 'octave') assert.ok(ex.lo >= range.lo - 1 && ex.hi <= range.hi + 1, `${def.id} ${ex.lo}-${ex.hi}`);
  });
});
test('Tongue drum exercise is fixed G3-D5 (not transposed) when it fits', () => {
  const ex = C.buildExercise('drum', { lo: 50, hi: 80 }); assert.strictEqual(ex.lo, 55); assert.strictEqual(ex.hi, 74); assert.ok(ex.fits);
});
test('Tongue drum shifts by an octave only to fit, and flags when it cannot', () => {
  const low = C.buildExercise('drum', { lo: 36, hi: 60 }); assert.strictEqual(low.lo, 43);
  assert.ok(!C.buildExercise('drum', { lo: 48, hi: 60 }).fits);
});
test('A too-narrow range sets fits=false instead of crashing', () => {
  assert.ok(!C.buildExercise('octave', { lo: 55, hi: 62 }).fits);
});
test('targetAt interpolates glides and returns null in gaps', () => {
  const evs = [{ midi: 60, midi2: 72, start: 0, dur: 4 }]; assert.strictEqual(C.targetAt(evs, 2), 66); assert.strictEqual(C.targetAt(evs, 5), null);
});

// ---- progress ----
test('Streak counts consecutive days and survives not having practised yet today', () => {
  const day = 86400000, now = new Date(2026, 9, 25, 15).getTime();
  const h = ts => ({ ts });
  assert.strictEqual(C.computeStreak([], now), 0);
  assert.strictEqual(C.computeStreak([h(now), h(now - day), h(now - 2 * day)], now), 3);
  assert.strictEqual(C.computeStreak([h(now - day), h(now - 2 * day)], now), 2);
  assert.strictEqual(C.computeStreak([h(now), h(now - 2 * day)], now), 1);
});

// ---- pitch range, chords, coaching ----
test('High notes are refined to within 3 cents (2093 Hz was 8 cents off before refinement)', () => {
  [261.63, 659.26, 1046.5, 2093].forEach(f => {
    const b = new Float32Array(4096); for (let i = 0; i < b.length; i++) { let v = 0; for (let h = 1; h <= 4; h++) v += Math.sin(2 * Math.PI * f * h * i / SR) / h; b[i] = 0.1 * v; }
    assert.ok(Math.abs(centsErr(C.analyse(b, SR, 26, 4400).f, f)) < 3, f + ' Hz');
  });
});
test('Whistle range: pure tones to 3.5 kHz are read without octave errors', () => {
  [900, 1760, 2500, 3500].forEach(f => assert.ok(Math.abs(centsErr(C.analyse(tone(f, 2048), SR, 400, 4600, 1).f, f)) < 6, f + ' Hz'));
});
test('Chord names: triads, sevenths and inversions; single notes and clusters give nothing', () => {
  assert.strictEqual(C.chordName([48, 52, 55]), 'C'); assert.strictEqual(C.chordName([60, 64, 67, 71]), 'Cmaj7');
  assert.strictEqual(C.chordName([52, 55, 60]), 'C/E'); assert.strictEqual(C.chordName([57, 60, 64]), 'Am');
  assert.strictEqual(C.chordName([60]), ''); assert.strictEqual(C.chordName([60, 61]), '');
});
function simTake(id, fn, range) {
  const ex = C.buildExercise(id, range || { lo: 48, hi: 72 }), frames = [];
  for (let t = 0; t < ex.total; t += C.HOP) { const ev = ex.events.find(e => t >= e.start && t < e.start + e.dur); if (!ev) continue; const m = fn(ev, t - ev.start, t); frames.push({ t, m }); }
  const per = ex.events.map(e => C.scoreEvent(frames, e, 25, 1));
  return C.analyseTake(ex.events, frames, per, 25, 1).map(x => x.id);
}
test('Coach: a clean take gives no tips', () => assert.deepStrictEqual(simTake('five', ev => ev.midi), []));
test('Coach: constant flatness is reported as flat', () => assert.ok(simTake('five', ev => ev.midi - 0.3).includes('flat')));
test('Coach: sliding up into notes is reported as scoop', () => assert.ok(simTake('five', (ev, dt) => ev.midi + (dt < 0.25 ? -0.6 * (1 - dt / 0.25) : 0)).includes('scoop')));
test('Coach: long notes that drop are reported as sag, without false jump or wobble tips', () => {
  const ids = simTake('hold', (ev, dt) => ev.midi - 0.35 * dt / ev.dur * 3);
  assert.ok(ids.includes('sag')); assert.ok(!ids.includes('long') && !ids.includes('wobble') && !ids.includes('over'));
});
test('Coach: silence on most notes is reported as missed', () => assert.ok(simTake('hold', (ev, dt, t) => (t % 9) < 3 ? null : ev.midi).includes('missed')));
test('Coach: a vowel that pulls sharp or flat is named', () => assert.ok(simTake('vowels', (ev, dt) => ev.midi + (ev.v === 'mi' ? 0.3 : ev.v === 'mu' ? -0.3 : 0)).includes('vowel')));
test('Coach: trailing a glide is reported as lag', () => assert.ok(simTake('siren', (ev, dt) => ev.midi + (ev.midi2 - ev.midi) * Math.max(0, dt / ev.dur - 0.15)).includes('lag')));
test('Every coaching issue has a label, a remedy and a real exercise', () => {
  Object.keys(C.ISSUES).forEach(id => { const i = C.ISSUES[id]; assert.ok(i[0] && i[1] && C.EXERCISES.some(e => e.id === i[2]), id); });
});
test('Issue counts and the adaptive plan use only recurring issues', () => {
  const c = C.countIssues([{ ids: ['flat', 'sag'] }, { ids: ['flat'] }, { ids: ['wobble', 'flat'] }], 10);
  assert.deepStrictEqual(c, { flat: 3, sag: 1, wobble: 1 });
  const p = C.adaptivePlan(c); assert.deepStrictEqual(p.focus, ['Singing flat']); assert.strictEqual(p.steps[0], 'c:breath'); assert.ok(p.steps.includes('x:hold')); assert.strictEqual(p.steps[p.steps.length - 1], 'c:cool');
  assert.ok(C.adaptivePlan({}).steps.includes('x:major'));
});
test('New warm-up and vowel exercises exist and carry vowel labels', () => {
  ['five', 'arp', 'ladder', 'vowels', 'vowelscale'].forEach(id => assert.ok(C.EXERCISES.some(e => e.id === id), id));
  assert.ok(C.buildExercise('vowels', { lo: 48, hi: 72 }).events.every(e => /^m[aeiou]$/.test(e.v)));
});

// ---- hearing chords ----
function fftDb(x) {                                  // Hann window + radix-2 FFT -> dB per bin, like AnalyserNode.getFloatFrequencyData
  const n = x.length, re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = x[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / n));
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { const t = re[i]; re[i] = re[j]; re[j] = t; } }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const a = i + k, b = i + k + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } }
  }
  const db = new Float32Array(n / 2); for (let i = 0; i < n / 2; i++) db[i] = 20 * Math.log10(Math.max(1e-9, Math.hypot(re[i], im[i]) / (n / 4))); return db;
}
function pianoChord(midis, noise) {
  const N = 32768, x = new Float32Array(N), amps = [1, 0.6, 0.4, 0.25, 0.15, 0.1]; let seed = 1; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5;
  for (let i = 0; i < N; i++) { let v = 0; midis.forEach(m => { const f = 440 * Math.pow(2, (m - 69) / 12); amps.forEach((a, h) => { v += a * Math.sin(2 * Math.PI * f * (h + 1) * (i + m * 37) / SR); }); }); x[i] = 0.05 * v + (noise == null ? 0.0005 : noise) * rnd(); }
  return fftDb(x);
}
test('Chord hearing: triads, sevenths and two-handed voicings are found from the spectrum', () => {
  [[48], [48, 52, 55], [57, 60, 64], [60, 64, 67, 72], [55, 59, 62, 65], [48, 55, 59, 64], [36, 43, 64, 72], [38, 45]].forEach(c => {
    assert.deepStrictEqual(C.detectNotes(pianoChord(c), SR, 32768, 440), c, JSON.stringify(c));
  });
});
test('Chord hearing: silence gives no notes, and the result is named', () => {
  assert.strictEqual(C.detectNotes(pianoChord([], 0.001), SR, 32768, 440).length, 0);
  assert.strictEqual(C.chordName(C.detectNotes(pianoChord([57, 60, 64]), SR, 32768, 440)), 'Am');
});
test('Chord exercises exist and fit a typical range', () => {
  ['arpm', 'arp7', 'chords'].forEach(id => { const ex = C.buildExercise(id, { lo: 43, hi: 64 }); assert.ok(ex.fits && ex.events.length > 0, id); });
});

// ---- overtone jumps ----
test('Tracker: a brief jump to an overtone (octave, 12th, double octave) is held back, a sustained one is accepted after 6 frames', () => {
  [[440, 69], [659.26, 76], [880, 81]].forEach(([f, m]) => {
    const t = new C.PitchTracker(); let out; for (let i = 0; i < 10; i++) out = t.push(220, 0.95, 0.1);
    for (let i = 0; i < 5; i++) out = t.push(f, 0.95, 0.1); assert.ok(Math.abs(out - 57) < 0.01, f + ' Hz leaked: ' + out);
    t.push(220, 0.95, 0.1); for (let i = 0; i < 7; i++) out = t.push(f, 0.95, 0.1); assert.ok(Math.abs(out - m) < 0.05, f + ' Hz not accepted: ' + out);
  });
});
test('Tracker: a real leap (not an overtone interval) is accepted after 3 frames, and frames that disagree never are', () => {
  let t = new C.PitchTracker(), out; for (let i = 0; i < 10; i++) out = t.push(220, 0.95, 0.1);
  for (let i = 0; i < 3; i++) out = t.push(293.66, 0.95, 0.1); assert.ok(Math.abs(out - 62) < 0.05, String(out));
  t = new C.PitchTracker(); for (let i = 0; i < 10; i++) out = t.push(220, 0.95, 0.1);
  [440, 659.26, 880, 440, 659.26].forEach(f => out = t.push(f, 0.95, 0.1)); assert.ok(Math.abs(out - 57) < 0.01, String(out));
});

// ---- naming what is played ----
test('Chord names: extended chords, shell voicings and inversions', () => {
  const n = a => C.chordName(a);
  assert.strictEqual(n([48, 52, 55, 58, 62]), 'C9'); assert.strictEqual(n([48, 52, 55, 62]), 'Cadd9'); assert.strictEqual(n([60, 65, 67]), 'Csus4');
  assert.strictEqual(n([50, 53, 57, 60]), 'Dm7'); assert.strictEqual(n([48, 52, 58]), 'C7(no5)'); assert.strictEqual(n([52, 55, 60]), 'C/E');
});
test('describeKeys: one key, interval, chord, and notes with no common name', () => {
  const d = C.describeKeys;
  assert.deepStrictEqual(d([60]), { name: 'C4', detail: 'one key' }); assert.deepStrictEqual(d([60, 64]), { name: 'C–E', detail: 'major third' });
  assert.deepStrictEqual(d([60, 67]), { name: 'C–G', detail: 'perfect fifth' }); assert.deepStrictEqual(d([48, 60]), { name: 'C', detail: 'octave' });
  assert.strictEqual(d([60, 64, 67]).name, 'C'); assert.strictEqual(d([60, 61, 62]).detail, 'no common chord name'); assert.strictEqual(d([]).name, '');
  assert.strictEqual(C.intervalName(16), 'major tenth'); assert.strictEqual(C.intervalName(6), 'tritone');
});

// ---- piano exercises ----
test('Piano steps: scales, arpeggios, chords around the circle, inversions, progressions', () => {
  const B = C.buildPianoSteps, m = a => a.map(s => s.notes[0]);
  assert.deepStrictEqual(m(B('scale', 0, 'major', '1')), [60, 62, 64, 65, 67, 69, 71, 72, 71, 69, 67, 65, 64, 62, 60]);
  assert.strictEqual(B('scale', 7, 'pent', '2').length, 21); assert.strictEqual(B('arpeggio', 0, 'major', '2').length, 13);
  assert.deepStrictEqual(B('chords', 0, 'major', '0').slice(0, 4).map(s => s.name), ['C', 'G', 'D', 'A']); assert.strictEqual(B('chords', 0, 'major', '0').length, 12);
  assert.deepStrictEqual(B('chords', 0, 'major', 'all').map(s => s.name), ['C', 'C/E', 'C/G']);
  assert.deepStrictEqual(B('progression', 0, 'pop').map(s => s.name), ['C', 'G', 'Am', 'F']);
  assert.deepStrictEqual([0, 5, 6, 11].map(C.pianoRoot), [60, 65, 54, 59]);
  const ear = B('ear', 0, 'interval', '', () => 0.5)[0]; assert.ok(ear.ear && ear.sound.length === 2 && ear.sound[1] - ear.sound[0] === ear.interval);
});
test('Piano chords: any octave and spelling of the same notes match, a wrong inversion or missing note does not', () => {
  assert.ok(C.chordMatches([60, 64, 67], [72, 76, 79])); assert.ok(!C.chordMatches([60, 64, 67], [64, 67, 72]));
  assert.ok(C.chordMatches([64, 67, 72], [52, 55, 60])); assert.ok(!C.chordMatches([60, 64, 67], [60, 64])); assert.ok(!C.chordMatches([60, 64, 67], []));
});
test('Piano summary: counts, and tips for missed notes, semitone slips, octave slips, inversions and hesitation', () => {
  const rec = [{ name: 'F♯4', kind: 'note', target: 66, notes: [66], ms: 900, wrong: [{ played: [65] }, { played: [65] }] }, { name: 'C♯5', kind: 'note', target: 73, notes: [73], ms: 5200, wrong: [{ played: [61] }] },
    { name: 'D4', kind: 'note', target: 62, notes: [62], ms: 800, wrong: [] }, { name: 'E4', kind: 'note', target: 64, notes: [64], ms: 700, wrong: [] }, { name: 'C/E', kind: 'chord', target: 52, notes: [52, 55, 60], ms: 1000, wrong: [{ played: [48, 52, 55] }] }];
  const s = C.pianoSummary(rec); assert.strictEqual(s.steps, 5); assert.strictEqual(s.firstTry, 2); assert.strictEqual(s.mistakes, 4);
  const all = s.tips.join(' | '); ['Most missed: F♯4', 'one key away', 'wrong octave', 'wrong lowest note', 'hesitated on C♯5'].forEach(x => assert.ok(all.includes(x), x));
  assert.ok(C.pianoSummary(Array.from({ length: 8 }, () => ({ name: 'C4', kind: 'note', target: 60, notes: [60], ms: 500, wrong: [] }))).tips[0].startsWith('Clean run'));
});

// ---- tempo ----
test('Tempo: half speed doubles every note length and the total, the tempo is recorded, custom (MIDI) exercises scale too', () => {
  const r = { lo: 48, hi: 72 }, a = C.buildExercise('five', r), b = C.buildExercise('five', r, 0.5), c = C.buildExercise('five', r, 1.5);
  assert.ok(Math.abs(b.total / a.total - 2) < 1e-9); assert.ok(Math.abs(a.total / c.total - 1.5) < 1e-9);
  assert.strictEqual(a.bpm, 72); assert.strictEqual(b.bpm, 36); assert.strictEqual(b.tempo, 0.5);
  b.events.forEach((e, i) => { assert.ok(Math.abs(e.dur - 2 * a.events[i].dur) < 1e-9); assert.strictEqual(e.midi, a.events[i].midi); });
  const cu = C.buildCustom('x', [{ midi: 60, start: 0, dur: 1 }, { midi: 64, start: 1, dur: 1 }], 120, r, 0.5);
  assert.strictEqual(cu.total, 4); assert.strictEqual(cu.events[1].start, 2); assert.strictEqual(cu.bpm, 60);
  assert.strictEqual(C.buildExercise('five', r, undefined).total, a.total);
});

// ---- exercise library ----
test('Library: every singing exercise has level and skills, every piano preset builds, ids are unique, levels are 1-3', () => {
  C.EXERCISES.forEach(e => { if (!e.id.startsWith('mel-')) assert.ok(C.SING_META[e.id] && C.SING_META[e.id][0] >= 1 && C.SING_META[e.id][0] <= 3, 'no metadata for ' + e.id); });
  Object.keys(C.SING_META).forEach(id => assert.ok(C.EXERCISES.some(e => e.id === id), 'metadata for unknown exercise ' + id));
  C.PIANO_LIB.forEach(p => assert.ok(C.buildPianoSteps(p.px, 0, p.o1, p.o2).length > 0, p.id));
  const items = C.libraryItems(); assert.strictEqual(new Set(items.map(i => i.id)).size, items.length);
  assert.strictEqual(items.length, C.EXERCISES.length + C.PIANO_LIB.length);
  items.forEach(i => { assert.ok(i.level >= 1 && i.level <= 3 && C.LEVELS[i.level], i.id); assert.ok(i.name && i.desc && i.cat, i.id); });
});
test('Library: search, kind, level, category and favourites filters', () => {
  const all = C.libraryItems(), F = f => C.libraryFilter(all, f);
  assert.strictEqual(F({}).length, all.length);
  assert.ok(F({ kind: 'sing' }).every(i => i.kind === 'sing') && F({ kind: 'piano' }).every(i => i.kind === 'piano'));
  assert.strictEqual(F({ kind: 'sing' }).length + F({ kind: 'piano' }).length, all.length);
  assert.ok(F({ q: 'vowel' }).length >= 2 && F({ q: 'vowel' }).every(i => /vowel/i.test(i.name + i.desc + i.cat + i.skills.join(' '))));
  assert.ok(F({ q: 'ii v i' }).length === 0 || F({ q: 'ii v i' }).every(i => /ii|v|i/i.test(i.name)));
  assert.ok(F({ q: 'piano scale' }).every(i => i.kind === 'piano' || /piano/.test(i.desc + i.name)));
  assert.ok(F({ level: 3 }).every(i => i.level === 3) && F({ level: 3 }).length > 0);
  assert.ok(F({ cat: 'Chords' }).length > 0 && F({ cat: 'Chords' }).every(i => i.cat === 'Chords'));
  assert.deepStrictEqual(F({ fav: true, favs: ['s:five', 'p:scale-major'] }).map(i => i.id).sort(), ['p:scale-major', 's:five']);
  assert.strictEqual(F({ q: 'zzzz nothing' }).length, 0);
});
test('New singing exercises build in a typical range', () => {
  ['holdlong', 'glide5', 'glideslow', 'second', 'fourth', 'sixth', 'harm', 'pentmaj', 'pentmin', 'blues', 'dorian', 'mixo', 'whole', 'chrom'].forEach(id => { const ex = C.buildExercise(id, { lo: 43, hi: 64 }); assert.ok(ex.events.length > 0 && ex.fits, id); });
});

// ---- modular and procedural exercises ----
test('Pattern exercises: ladders go the right way, syllables cycle, minor copies use the minor scale', () => {
  const r = { lo: 43, hi: 64 }, ex = id => C.buildExercise(id, r), m = e => e.events.map(x => x.midi - e.tonic);
  assert.deepStrictEqual(m(ex('p-three')).slice(0, 10), [0, 2, 4, 2, 0, 1, 3, 5, 3, 1]);                   // Do Re Mi Re Do, then a half step up
  assert.deepStrictEqual(m(ex('p-three-m')).slice(0, 5), [0, 2, 3, 2, 0]);                                  // minor third on the third degree
  assert.deepStrictEqual(m(ex('p-descend')).slice(0, 10), [7, 5, 4, 2, 0, 9, 7, 6, 4, 2]);                 // Sol Fa Mi Re Do, then a whole step higher
  assert.strictEqual(ex('p-three').events.length, 25);
  assert.deepStrictEqual(ex('s-vowelarp').events.map(e => e.v).slice(0, 7), ['ah', 'eh', 'ee', 'oh', 'oo', 'ah', 'eh']);
  assert.deepStrictEqual(ex('s-nay').events.map(e => e.v).filter((v, i, a) => a.indexOf(v) === i), ['nay']);
  assert.strictEqual(ex('p-three').events[0].v, undefined);
  assert.strictEqual(C.degSemis([0, 2, 4, 5, 7, 9, 11], -1), -1); assert.strictEqual(C.degSemis([0, 2, 4, 5, 7, 9, 11], 8), 14);
});
test('Random exercises: seeded runs repeat, different seeds differ, every run is gapless, starts and ends sensibly and fits the range', () => {
  const r = { lo: 43, hi: 64 }, ids = C.SING_RANDOM.map(d => d.id);
  assert.ok(ids.length >= 3);
  ids.forEach(id => {
    const a = C.buildExercise(id, r, 1, C.mulberry32(5)), b = C.buildExercise(id, r, 1, C.mulberry32(5)); assert.deepStrictEqual(a.events, b.events, id);
    const sigs = new Set();
    for (let seed = 1; seed <= 200; seed++) {
      const ex = C.buildExercise(id, r, 1, C.mulberry32(seed)); sigs.add(ex.events.map(e => e.midi).join());
      let t = 0; ex.events.forEach((e, i) => { assert.ok(Math.abs(e.start - t) < 1e-9, id + ' gap'); t += e.dur; if (i) assert.ok(e.midi !== ex.events[i - 1].midi || id === 'r-leaps', id + ' repeats a note'); });
      assert.ok(ex.fits && ex.lo >= r.lo - 1 && ex.hi <= r.hi + 1, id + ' ' + seed + ' ' + ex.lo + '-' + ex.hi);
      if (id !== 'r-leaps') assert.strictEqual(ex.events[ex.events.length - 1].midi - ex.tonic, 0, id + ' should end on the tonic');
    }
    assert.ok(sigs.size > 20, id + ' is not varied enough');
  });
});
test('Roman numerals: qualities, sevenths, flat degrees', () => {
  const R = C.romanChords;
  assert.deepStrictEqual(R('I vi'), [[0, 'major', 'I'], [9, 'minor', 'vi']]);
  assert.deepStrictEqual(R('ii7 V7 Imaj7').map(c => c[1]), ['min7', 'dom7', 'maj7']);
  assert.deepStrictEqual(R('vii° viiø7 bVII bIII'), [[11, 'dim', 'vii°'], [11, 'm7b5', 'viiø7'], [10, 'major', 'bVII'], [3, 'major', 'bIII']]);
  assert.deepStrictEqual(R('IV V7'), [[5, 'major', 'IV'], [7, 'dom7', 'V7']]);
});
test('Piano progressions: the originals are unchanged, the new ones spell the right chords', () => {
  const B = C.buildPianoSteps, names = (k, o2, pc) => B('progression', pc || 0, k, o2).map(s => s.name);
  assert.deepStrictEqual(names('jazz'), ['Dm7', 'G7', 'Cmaj7']); assert.deepStrictEqual(names('blues'), ['C7', 'F7', 'C7', 'G7', 'F7', 'C7']);
  assert.deepStrictEqual(names('diatonic'), ['C', 'Dm', 'Em', 'F', 'G', 'Am', 'Bdim', 'C']);
  assert.deepStrictEqual(names('andalusian', '', 9), ['Am', 'G', 'F', 'E']);
  assert.strictEqual(names('blues12').length, 12);
  assert.strictEqual(names('jazz', 'cycle').length, 36);
  const cyc = B('progression', 0, 'jazz', 'cycle'); assert.ok(cyc[0].sub.includes('key of C') && cyc[3].sub.includes('key of F') && cyc[6].sub.includes('key of A♯'));   // a fourth up each time
  assert.strictEqual(cyc[3].name.replace(/\/.*/, ''), 'Gm7');
});
test('Smooth voice leading: neighbouring chords stay close, and the notes are the same chord as in root position', () => {
  const B = C.buildPianoSteps, mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  Object.keys(C.PIANO_PROGS).forEach(k => {
    const root = B('progression', 0, k, ''), sm = B('progression', 0, k, 'smooth');
    assert.strictEqual(sm.length, root.length, k);
    const pcs = a => a.map(n => n % 12).sort((x, y) => x - y).join();
    sm.forEach((s, i) => { assert.strictEqual(pcs(s.notes), pcs(root[i].notes), k + ' ' + i); if (i) assert.ok(Math.abs(mean(s.notes) - mean(sm[i - 1].notes)) <= 4.5, k + ' ' + i); });
  });
  B('progression', 0, 'jazz', 'cycle').forEach(s => assert.ok(Math.min.apply(null, s.notes) >= 40 && Math.max.apply(null, s.notes) <= 84));
});
test('Piano finger patterns, intervals, note flash and the new ear types', () => {
  const B = C.buildPianoSteps, m = a => a.map(s => s.notes[0]);
  assert.deepStrictEqual(m(B('sequence', 0, 'thirds', 'major')).slice(0, 6), [60, 64, 62, 65, 64, 67]);
  assert.strictEqual(m(B('sequence', 0, 'thirds', 'major')).pop(), 72);
  Object.keys(C.PIANO_PATTERNS).forEach(pt => Object.keys(C.PIANO_SCALES).forEach(sc => { const a = m(B('sequence', 3, pt, sc)); assert.ok(a.length > 5, pt + sc); a.forEach((x, i) => { if (i) assert.ok(x !== a[i - 1], pt + ' ' + sc + ' repeats a note'); }); }));
  const iv = B('intervals', 0, '7'); assert.strictEqual(iv.length, 12); assert.deepStrictEqual(iv[0].notes, [60, 67]); assert.ok(iv.every(s => s.kind === 'chord' && s.notes[1] - s.notes[0] === 7));
  assert.ok(B('intervals', 0, 'mix', '', C.mulberry32(3)).every(s => C.PIANO_INTERVALS.includes(String(s.notes[1] - s.notes[0]))));
  const fl = B('flash', 0, 'white', '1', C.mulberry32(9)); assert.strictEqual(fl.length, 16);
  fl.forEach((s, i) => { assert.ok(s.notes[0] >= 60 && s.notes[0] <= 72 && [0, 2, 4, 5, 7, 9, 11].includes(s.notes[0] % 12)); if (i) assert.ok(s.notes[0] !== fl[i - 1].notes[0]); });
  B('flash', 2, 'key', '2', C.mulberry32(4)).forEach(s => assert.ok([0, 2, 4, 5, 7, 9, 11].includes((s.notes[0] - 2 + 120) % 12)));
  const dg = B('ear', 0, 'degree', '', C.mulberry32(2)); assert.ok(dg.every(s => s.ear && s.given === 60 && s.sound[0] === 60 && s.sound[1] === s.notes[0] && s.interval === s.notes[0] - 60));
  const ch = B('ear', 0, 'chord', '', C.mulberry32(2)); assert.ok(ch.every(s => s.ear && s.kind === 'chord' && s.notes.length === 3 && ['', 'm'].includes(s.name.replace(/^[A-G][♯#]?/, ''))), JSON.stringify(ch.map(s => s.name)));
  assert.ok(B('ear', 0, 'chordx', '', C.mulberry32(8)).every(s => s.ear && s.kind === 'chord'));
});
test('Piano menus: every preset uses options that exist, every option builds, chord and scale tables are named', () => {
  Object.keys(C.PIANO_CHORDS).forEach(k => assert.ok(C.PIANO_NAMES.chord[k], 'unnamed chord ' + k));
  Object.keys(C.PIANO_SCALES).forEach(k => assert.ok(C.PIANO_NAMES.scale[k], 'unnamed scale ' + k));
  Object.keys(C.PIANO_PATTERNS).forEach(k => assert.ok(C.PIANO_NAMES.pattern[k], 'unnamed pattern ' + k));
  C.PIANO_LIB.forEach(p => { const o = C.PIANO_OPTS[p.px]; assert.ok(o, p.id + ' has no menu'); assert.ok(o.o1.some(x => x[0] === p.o1), p.id + ' o1 ' + p.o1); if (o.o2.length) assert.ok(o.o2.some(x => x[0] === p.o2), p.id + ' o2 ' + p.o2); });
  Object.keys(C.PIANO_OPTS).forEach(px => { const o = C.PIANO_OPTS[px]; (o.o2.length ? o.o2 : [['', '']]).forEach(b => o.o1.forEach(a => { for (let pc = 0; pc < 12; pc += 5) assert.ok(C.buildPianoSteps(px, pc, a[0], b[0]).length > 0, px + ' ' + a[0] + ' ' + b[0]); })); });
  assert.ok(C.PIANO_LIB.length >= 80, 'presets: ' + C.PIANO_LIB.length);
});

// ---- SoundFont ----
/* A tiny valid SoundFont built here: one preset, one instrument, two looped sine samples (A4 for keys 0-59, A5 for keys 60-127). */
function makeTestSf2() {
  const u16 = v => [v & 255, (v >> 8) & 255], u32 = v => [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255];
  const nm = (s, n) => { const a = new Array(n).fill(0); for (let i = 0; i < s.length && i < n; i++) a[i] = s.charCodeAt(i); return a; };
  const chunk = (id, data) => { const d = Array.from(data); const sz = d.length; if (sz & 1) d.push(0); return [].concat(nm(id, 4), u32(sz), d); };
  const list = (type, chunks) => chunk('LIST', [].concat(nm(type, 4), ...chunks));
  const N = 22050, GAP = 46, sine = f => { const o = []; for (let i = 0; i < N + GAP; i++) { const v = i < N ? Math.round(12000 * Math.sin(2 * Math.PI * f * i / 22050)) : 0; o.push(v & 255, (v >> 8) & 255); } return o; };
  const smpl = [].concat(sine(440), sine(880));
  const info = list('INFO', [chunk('ifil', [].concat(u16(2), u16(1))), chunk('isng', nm('EMU8000', 8)), chunk('INAM', nm('Test font', 10))]);
  const sdta = list('sdta', [chunk('smpl', smpl)]);
  const phdr = [].concat(nm('Test piano', 20), u16(0), u16(0), u16(0), u32(0), u32(0), u32(0), nm('EOP', 20), u16(0), u16(0), u16(1), u32(0), u32(0), u32(0));
  const pbag = [].concat(u16(0), u16(0), u16(1), u16(0));
  const pmod = new Array(10).fill(0);
  const pgen = [].concat(u16(41), u16(0), u16(0), u16(0));
  const inst = [].concat(nm('Test inst', 20), u16(0), nm('EOI', 20), u16(2));
  const ibag = [].concat(u16(0), u16(0), u16(3), u16(0), u16(6), u16(0));
  const imod = new Array(10).fill(0);
  const rng = (lo, hi) => u16(lo | (hi << 8));
  const igen = [].concat(u16(43), rng(0, 59), u16(54), u16(1), u16(53), u16(0), u16(43), rng(60, 127), u16(54), u16(1), u16(53), u16(1), u16(0), u16(0));
  const shdr = [].concat(nm('Sine A4', 20), u32(0), u32(N), u32(1000), u32(21000), u32(22050), [69, 0], u16(0), u16(1), nm('Sine A5', 20), u32(N + GAP), u32(N + GAP + N), u32(N + GAP + 1000), u32(N + GAP + 21000), u32(22050), [81, 0], u16(0), u16(1), nm('EOS', 20), u32(0), u32(0), u32(0), u32(0), u32(0), [0, 0], u16(0), u16(0));
  const pdta = list('pdta', [chunk('phdr', phdr), chunk('pbag', pbag), chunk('pmod', pmod), chunk('pgen', pgen), chunk('inst', inst), chunk('ibag', ibag), chunk('imod', imod), chunk('igen', igen), chunk('shdr', shdr)]);
  const body = [].concat(nm('sfbk', 4), info, sdta, pdta);
  return new Uint8Array([].concat(nm('RIFF', 4), u32(body.length), body)).buffer;
}

test('SoundFont: the file is read (name, preset, instrument, samples with root keys and loops)', () => {
  const sf = C.parseSoundFont(makeTestSf2());
  assert.strictEqual(sf.name, 'Test font'); assert.strictEqual(sf.major, 2); assert.strictEqual(sf.compressed, false);
  assert.strictEqual(sf.presets.length, 1); assert.strictEqual(sf.presets[0].name, 'Test piano'); assert.strictEqual(sf.insts.length, 1); assert.strictEqual(sf.samples.length, 2);
  assert.deepStrictEqual(sf.samples.map(s => [s.pitch, s.rate, s.end - s.start]), [[69, 22050, 22050], [81, 22050, 22050]]);
  assert.strictEqual(sf.smpl.length, 2 * (22050 + 46));
});
test('SoundFont: the right sample is chosen by key, with root key and looping', () => {
  const sf = C.parseSoundFont(makeTestSf2()), at = n => C.soundFontVoices(sf, 0, n, 100);
  assert.strictEqual(at(57).length, 1); assert.strictEqual(at(57)[0].si, 0); assert.strictEqual(at(57)[0].root, 69); assert.ok(at(57)[0].loop);
  assert.strictEqual(at(59)[0].si, 0); assert.strictEqual(at(60)[0].si, 1); assert.strictEqual(at(72)[0].root, 81);
  assert.strictEqual(at(57)[0].env.release, 0.03);           // a missing release time still gets a short fade, so notes never click off
});
test('SoundFont: files that are not SoundFonts or are broken give a clear error', () => {
  assert.throws(() => C.parseSoundFont(new ArrayBuffer(100)), /SoundFont/);
  const cut = new Uint8Array(makeTestSf2()).slice(0, 200).buffer; assert.throws(() => C.parseSoundFont(cut), /missing|SoundFont/);
});

/* ---- editable song model ---- */
const smf = (ppq, tracks) => { const b = [0x4d,0x54,0x68,0x64,0,0,0,6,0,1,0,tracks.length,ppq >> 8,ppq & 255]; tracks.forEach(t => b.push(0x4d,0x54,0x72,0x6b,0,0,0,t.length,...t)); return Uint8Array.from(b); };
test('song: parse handles running status, tempo change, note-off as vel 0, unclosed notes', () => {
  const t = [0,0xff,0x51,3,0x07,0xa1,0x20, 0,0xc0,5, 0,0x90,0x3c,0x64, 0x60,0x80,0x3c,0, 0,0x90,0x3e,0x64, 0,0xff,0x51,3,0x03,0xd0,0x90, 0x60,0x3e,0x00, 0,0x3c,0x50, 0x30,0xff,0x2f,0];
  const bytes = smf(96, [t]), s = C.parseSong(bytes);
  assert.strictEqual(s.ppq, 96); assert.strictEqual(s.tracks.length, 1);
  const n = s.tracks[0].notes; assert.strictEqual(n.length, 3);
  assert.deepStrictEqual(n.map(x => [x.midi, x.tick, x.dur]), [[60,0,96],[60,192,48],[62,96,96]].sort((a,b)=>a[1]-b[1]||a[0]-b[0]));
  assert.strictEqual(s.tracks[0].progs[0].val, 5); assert.strictEqual(s.tempos.length, 2);
  const a = C.songToUnits(s), b = C.parseMidi(bytes);
  assert.strictEqual(a.bpm, b.bpm); assert.strictEqual(a.units.length, b.units.length);
  assert.strictEqual(b.units[0].notes.length, 2);   // parseMidi drops the note that is never switched off; parseSong keeps it
  b.units[0].notes.forEach((y, i) => { const x = a.units[0].notes[i]; assert.ok(Math.abs(x.start - y.start) < 1e-9 && Math.abs(x.dur - y.dur) < 1e-9 && x.midi === y.midi && x.vel === y.vel); });
  assert.strictEqual(a.units[0].program, b.units[0].program);
});
test('song: write then parse gives the same song', () => {
  const s = C.newSong(480); s.name = 'Demo'; s.tempos.push({ tick: 1920, us: 400000 }); s.timeSigs.push({ tick: 1920, num: 6, den: 8 }); s.keySigs.push({ tick: 0, sf: -3, mi: 1 });
  const a = C.newSongTrack('Lead'); a.notes.push({ midi: 60, tick: 0, dur: 480, vel: 100, ch: 0 }, { midi: 64, tick: 480, dur: 240, vel: 70, ch: 0 });
  a.progs.push({ tick: 0, ch: 0, val: 40 }); a.ctrl.push({ tick: 10, ch: 0, cc: 64, val: 127 }); a.bends.push({ tick: 20, ch: 0, val: 12000 }); a.meta.push({ tick: 0, type: 6, data: [65, 66] });
  const d = C.newSongTrack('Drums'); d.notes.push({ midi: 36, tick: 0, dur: 120, vel: 110, ch: 9 }); s.tracks.push(a, d);
  const r = C.parseSong(C.writeSong(s));
  assert.strictEqual(r.name, 'Demo'); assert.strictEqual(r.ppq, 480); assert.deepStrictEqual(r.tempos, s.tempos); assert.deepStrictEqual(r.timeSigs, s.timeSigs); assert.deepStrictEqual(r.keySigs, s.keySigs);
  assert.strictEqual(r.tracks.length, 2); const noId = t => Object.assign({}, t, { id: 0 }); assert.deepStrictEqual(noId(r.tracks[0]), noId(a)); assert.deepStrictEqual(noId(r.tracks[1]), noId(d));
  assert.ok(r.tracks[0].id !== r.tracks[1].id && !(r.tracks[0].id === a.id));   // ids are made fresh and are never written to the file
});
test('song: repeated notes at the same tick stay separate and bytes are a valid type 1 file', () => {
  const s = C.newSong(96), t = C.newSongTrack('x'); t.notes.push({ midi: 60, tick: 0, dur: 96, vel: 80, ch: 0 }, { midi: 60, tick: 96, dur: 96, vel: 80, ch: 0 }); s.tracks.push(t);
  const b = C.writeSong(s); assert.strictEqual(String.fromCharCode(...b.slice(0, 4)), 'MThd'); assert.strictEqual(b[9], 1); assert.strictEqual(b[11], 2);
  assert.deepStrictEqual(C.parseSong(b).tracks[0].notes.map(n => [n.tick, n.dur]), [[0, 96], [96, 96]]);
});
test('song: tick and second conversion follow the tempo map', () => {
  const s = C.newSong(480); s.tempos.push({ tick: 960, us: 250000 });
  assert.ok(Math.abs(C.songSec(s, 960) - 1) < 1e-9); assert.ok(Math.abs(C.songSec(s, 1440) - 1.25) < 1e-9);
  [0, 100, 960, 1500, 5000].forEach(k => assert.ok(Math.abs(C.songTick(s, C.songSec(s, k)) - k) < 1e-6));
});
test('song: bad input and empty song are handled', () => {
  assert.throws(() => C.parseSong(Uint8Array.from([1, 2, 3])), /MIDI/);
  const r = C.parseSong(C.writeSong(C.newSong(480))); assert.strictEqual(r.tracks.length, 0); assert.strictEqual(r.tempos[0].us, 500000);
});

test('edit: grid sizes and snapping', () => {
  const s = C.newSong(480); assert.strictEqual(C.gridTicks(s, 4), 480); assert.strictEqual(C.gridTicks(s, 16), 120); assert.strictEqual(C.gridTicks(s, 12), 160); assert.strictEqual(C.gridTicks(s, 0), 1);
  assert.strictEqual(C.snapTick(179, 120), 120); assert.strictEqual(C.snapTick(181, 120), 240); assert.strictEqual(C.snapTick(-50, 120), 0);
});
test('edit: undo and redo restore the song in place', () => {
  const s = C.newSong(480), t = C.newSongTrack('a'); s.tracks.push(t); const h = new C.EditHistory(), ref = s;
  h.push(C.songSnapshot(s)); t.notes.push({ midi: 60, tick: 0, dur: 480, vel: 90, ch: 0 });
  h.push(C.songSnapshot(s)); s.tracks[0].notes[0].midi = 62;
  C.songRestore(s, h.undo(C.songSnapshot(s))); assert.strictEqual(ref, s); assert.strictEqual(s.tracks[0].notes[0].midi, 60);
  C.songRestore(s, h.undo(C.songSnapshot(s))); assert.strictEqual(s.tracks[0].notes.length, 0);
  assert.strictEqual(h.undo(C.songSnapshot(s)), null);
  C.songRestore(s, h.redo(C.songSnapshot(s))); assert.strictEqual(s.tracks[0].notes.length, 1);
  C.songRestore(s, h.redo(C.songSnapshot(s))); assert.strictEqual(s.tracks[0].notes[0].midi, 62); assert.ok(!h.canRedo && h.canUndo);
  h.push(C.songSnapshot(s)); assert.ok(!h.canRedo);   // a new change drops the redo stack
});
test('edit: history is limited', () => { const h = new C.EditHistory(3); for (let i = 0; i < 10; i++) h.push(String(i)); assert.strictEqual(h.undos.length, 3); assert.strictEqual(h.undo('x'), '9'); });
test('edit: transpose stops at the ends of the MIDI range', () => {
  const n = [{ midi: 120, tick: 0, dur: 1 }, { midi: 100, tick: 0, dur: 1 }]; assert.strictEqual(C.notesTranspose(n, 12), 7); assert.deepStrictEqual(n.map(x => x.midi), [127, 107]);
  const m = [{ midi: 3, tick: 0, dur: 1 }, { midi: 9, tick: 0, dur: 1 }]; assert.strictEqual(C.notesTranspose(m, -12), -3); assert.strictEqual(C.notesTranspose([], 5), 0);
});
test('edit: quantize, copy and paste', () => {
  const t = C.newSongTrack('a'); t.notes.push({ midi: 60, tick: 130, dur: 100, vel: 80, ch: 0 }, { midi: 64, tick: 250, dur: 50, vel: 70, ch: 0 });
  C.notesQuantize(t.notes, 120); assert.deepStrictEqual(t.notes.map(n => n.tick), [120, 240]);
  const clip = C.notesCopy(t.notes); assert.deepStrictEqual(clip.items.map(i => i.dt), [0, 120]); assert.strictEqual(clip.span, 170);
  const made = C.notesPaste(t, clip, 1000); assert.strictEqual(made.length, 2); assert.strictEqual(t.notes.length, 4); assert.deepStrictEqual(t.notes.map(n => n.tick), [120, 240, 1000, 1120]);
  made[0].midi = 1; assert.strictEqual(clip.items[0].midi, 60);   // pasted notes are copies
  assert.strictEqual(C.notesCopy([]), null); assert.deepStrictEqual(C.notesPaste(t, null, 0), []);
});
test('edit: song end and bar lines follow time signatures', () => {
  const s = C.newSong(480), t = C.newSongTrack('a'); t.notes.push({ midi: 60, tick: 1000, dur: 500, vel: 80, ch: 0 }); s.tracks.push(t); assert.strictEqual(C.songEndTick(s), 1500);
  assert.deepStrictEqual(C.songBarLines(s, 0, 4000).map(b => [b.tick, b.bar]), [[0, 1], [1920, 2], [3840, 3]]);
  assert.deepStrictEqual(C.songBarLines(s, 2000, 4000).map(b => b.bar), [3]);
  s.timeSigs.push({ tick: 1920, num: 3, den: 4 });   // bars of 1440 ticks from bar 2
  assert.deepStrictEqual(C.songBarLines(s, 0, 5000).map(b => [b.tick, b.bar]), [[0, 1], [1920, 2], [3360, 3], [4800, 4]]);
});

test('record: beats follow the time signature and mark the first beat of each bar', () => {
  const s = C.newSong(480); assert.deepStrictEqual(C.songBeats(s, 0, 1920).map(b => [b.tick, b.down]), [[0, true], [480, false], [960, false], [1440, false]]);
  assert.deepStrictEqual(C.songBeats(s, 481, 1441).map(b => b.tick), [960, 1440]);            // from is inclusive, to is exclusive
  assert.deepStrictEqual(C.songBeats(s, 480, 960).map(b => b.tick), [480]);
  s.timeSigs.push({ tick: 1920, num: 6, den: 8 });                                             // eighth-note beats from bar 2
  assert.deepStrictEqual(C.songBeats(s, 1920, 3000).map(b => [b.tick, b.down]), [[1920, true], [2160, false], [2400, false], [2640, false], [2880, false]]);
  assert.deepStrictEqual(C.songBeats(s, 3300, 3400).map(b => [b.tick, b.down]), [[3360, true]]);   // a 6/8 bar is six eighth notes: 1440 ticks
});
test('record: sung pitch becomes notes (vibrato kept, stray frame and blip ignored, gaps split)', () => {
  const fr = []; let t = 0; const add = (n, f) => { for (let i = 0; i < n; i++) { fr.push({ t: +(t.toFixed(3)), m: f(i) }); t += 0.02; } };
  add(25, () => 60.1);                                         // 0.5 s of C4
  add(15, () => null);                                         // silence
  add(25, i => i === 12 ? 76 : 64.2);                          // E4 with one wild frame
  add(50, i => 67 + 0.3 * Math.sin(i));                        // G4 with vibrato
  add(3, () => 70);                                            // 60 ms blip: too short
  add(10, () => null);
  add(25, () => 62); add(25, () => 64);                        // two notes with no gap
  const n = C.framesToNotes(fr);
  assert.deepStrictEqual(n.map(x => x.midi), [60, 64, 67, 62, 64]);
  assert.ok(Math.abs(n[0].start - 0) < 1e-9 && Math.abs(n[0].dur - 0.5) < 0.05, JSON.stringify(n[0]));
  assert.ok(Math.abs(n[1].dur - 0.5) < 0.06 && Math.abs(n[2].dur - 1) < 0.06, JSON.stringify(n));
  assert.ok(Math.abs(n[4].start - n[3].start - 0.5) < 0.07);
  assert.deepStrictEqual(C.framesToNotes([]), []);
});

test('tracks: add picks free channels, delete, move, instrument and channel', () => {
  const s = C.newSong(480); const a = C.songAddTrack(s, 'A'), b = C.songAddTrack(s, 'B', null, 40), d = C.songAddTrack(s, 'Drums', 9, 0);
  assert.deepStrictEqual([a, b, d], [0, 1, 2]); assert.deepStrictEqual(s.tracks.map(t => C.songTrackChannels(t)), [[0], [1], [9]]); assert.strictEqual(C.songFreeChannel(s), 2);
  assert.strictEqual(new Set(s.tracks.map(t => t.id)).size, 3);
  const ids = s.tracks.map(t => t.id); assert.strictEqual(C.songMoveTrack(s, 0, 1), 1); assert.deepStrictEqual(s.tracks.map(t => t.id), [ids[1], ids[0], ids[2]]);
  assert.strictEqual(C.songMoveTrack(s, 0, -1), 0); assert.strictEqual(C.songMoveTrack(s, 2, 1), 2);
  assert.ok(C.songDeleteTrack(s, 1)); assert.strictEqual(s.tracks.length, 2); assert.ok(!C.songDeleteTrack(s, 5));
  const t = s.tracks[0]; t.notes.push({ midi: 60, tick: 0, dur: 10, vel: 90, ch: 1 });
  C.songSetProgram(t, 1, 73, 0); assert.deepStrictEqual(t.progs, [{ tick: 0, ch: 1, val: 73 }]); C.songSetProgram(t, 1, 5, 2); assert.strictEqual(t.progs.length, 1); assert.deepStrictEqual(t.ctrl, [{ tick: 0, ch: 1, cc: 0, val: 2 }]);
  C.songSetProgram(t, 1, 5, 0); assert.strictEqual(t.ctrl.length, 0);
  assert.ok(C.songSetChannel(t, 4)); assert.deepStrictEqual(C.songTrackChannels(t), [4]); assert.strictEqual(t.notes[0].ch, 4);
  t.notes.push({ midi: 62, tick: 0, dur: 10, vel: 90, ch: 7 }); assert.ok(!C.songSetChannel(t, 2)); assert.deepStrictEqual(C.songTrackChannels(t), [4, 7]);
});
test('tracks: the program set on a track is what songToUnits plays', () => {
  const s = C.newSong(480), i = C.songAddTrack(s, 'Lead', 3, 56); s.tracks[i].notes.push({ midi: 60, tick: 0, dur: 480, vel: 90, ch: 3 });
  const u = C.songToUnits(s).units[0]; assert.strictEqual(u.program, 56); assert.strictEqual(u.ch, 3); assert.strictEqual(u.tid, s.tracks[0].id);
  const r = C.parseSong(C.writeSong(s)); assert.strictEqual(C.songToUnits(r).units[0].program, 56);
});
test('tempo, time signature and key edits', () => {
  const s = C.newSong(480); assert.strictEqual(Math.round(60e6 / C.songTempoAt(s, 0)), 120);
  C.songSetTempo(s, 0, 90); C.songSetTempo(s, 1920, 150); C.songSetTempo(s, 960, 60);
  assert.deepStrictEqual(s.tempos.map(t => t.tick), [0, 960, 1920]); assert.strictEqual(Math.round(60e6 / C.songTempoAt(s, 1000)), 60); assert.strictEqual(Math.round(60e6 / C.songTempoAt(s, 5000)), 150);
  C.songSetTempo(s, 960, 100); assert.strictEqual(s.tempos.length, 3); assert.ok(C.songRemoveTempo(s, 960)); assert.ok(!C.songRemoveTempo(s, 0)); assert.ok(!C.songRemoveTempo(s, 77));
  assert.strictEqual(C.songBarStart(s, 2500), 1920); assert.strictEqual(C.songBarStart(s, 100), 0);
  assert.strictEqual(C.songSetTimeSig(s, 2500, 3, 4), 1920); assert.deepStrictEqual(s.timeSigs.map(t => [t.tick, t.num]), [[0, 4], [1920, 3]]);
  assert.strictEqual(C.songBarStart(s, 4000), 3360); C.songSetTimeSig(s, 10, 6, 8); assert.deepStrictEqual(s.timeSigs[0], { tick: 0, num: 6, den: 8 });
  assert.ok(C.songRemoveTimeSig(s, 1920)); assert.ok(!C.songRemoveTimeSig(s, 0));
  C.songSetKey(s, 2, 0); C.songSetKey(s, -3, 1); assert.strictEqual(s.keySigs.length, 1); assert.strictEqual(C.keyName(s.keySigs[0].sf, s.keySigs[0].mi), 'C minor'); assert.strictEqual(C.keyName(2, 0), 'D major'); assert.strictEqual(C.keyName(0, 1), 'A minor');
  const r = C.parseSong(C.writeSong(s)); assert.deepStrictEqual(r.tempos, s.tempos); assert.deepStrictEqual(r.keySigs, s.keySigs);
});
test('controllers: set, replace, remove, clear, pitch bend range', () => {
  const t = C.newSongTrack('x');
  C.songSetCtrl(t, 0, 64, 480, 127); C.songSetCtrl(t, 0, 64, 960, 0); C.songSetCtrl(t, 0, 7, 480, 100); C.songSetCtrl(t, 0, 64, 480, 90);
  assert.deepStrictEqual(C.songCtrlEvents(t, 64).map(e => [e.tick, e.val]), [[480, 90], [960, 0]]); assert.strictEqual(C.songCtrlEvents(t, 7).length, 1);
  C.songSetCtrl(t, 0, 7, 0, 999); assert.strictEqual(C.songCtrlEvents(t, 7)[0].val, 127);
  C.songSetCtrl(t, 2, 'bend', 100, 99999); C.songSetCtrl(t, 2, 'bend', 200, -5); assert.deepStrictEqual(C.songCtrlEvents(t, 'bend').map(e => e.val), [16383, 0]);
  assert.ok(C.songRemoveCtrl(t, 64, 490, 20)); assert.ok(!C.songRemoveCtrl(t, 64, 490, 20)); assert.strictEqual(C.songCtrlEvents(t, 64).length, 1);
  assert.strictEqual(C.songClearCtrl(t, 7), 2); assert.strictEqual(C.songCtrlEvents(t, 7).length, 0); assert.strictEqual(C.songCtrlEvents(t, 64).length, 1);
  C.songClearCtrl(t, 'bend'); assert.strictEqual(t.bends.length, 0);
});
test('new song has one piano track and survives a file round trip', () => {
  const s = C.songNew(); assert.strictEqual(s.name, 'Untitled'); assert.strictEqual(s.tracks.length, 1); assert.strictEqual(s.tracks[0].name, 'Piano');
  const r = C.parseSong(C.writeSong(s)); assert.strictEqual(r.name, 'Untitled'); assert.strictEqual(r.tracks.length, 1);   // a track with only a program change is kept
  assert.deepStrictEqual(C.songToUnits(r).units, []);
});

test('playback data: sustain pedal lengthens notes released while it is down', () => {
  const s = C.newSong(480), t = C.newSongTrack('p'); s.tracks.push(t);
  t.notes.push({ midi: 60, tick: 0, dur: 480, vel: 90, ch: 0 }, { midi: 62, tick: 1500, dur: 240, vel: 90, ch: 0 }, { midi: 64, tick: 3000, dur: 240, vel: 90, ch: 0 });
  t.ctrl.push({ tick: 100, ch: 0, cc: 64, val: 127 }, { tick: 960, ch: 0, cc: 64, val: 0 }, { tick: 2000, ch: 0, cc: 64, val: 127 });
  const n = C.songToUnits(s).units[0].notes;
  assert.ok(Math.abs(n[0].sus - 1) < 1e-9, 'note 1 rings until the pedal comes up at 960 ticks = 1 s');
  assert.strictEqual(n[1].sus, undefined);                                           // released while the pedal was up (it came up at 960 and went down again at 2000)
  assert.ok(Math.abs(n[2].sus - (480 * 16 + 240) / 960) < 1e-6, String(n[2].sus));    // pedal never released: capped at 16 beats after the note end
});
test('playback data: drums ignore the pedal; volume, expression, pan and bend curves', () => {
  const s = C.newSong(480), t = C.newSongTrack('p'); s.tracks.push(t);
  t.notes.push({ midi: 36, tick: 0, dur: 100, vel: 90, ch: 9 }, { midi: 60, tick: 0, dur: 100, vel: 90, ch: 0 });
  t.ctrl.push({ tick: 0, ch: 9, cc: 64, val: 127 }, { tick: 0, ch: 0, cc: 7, val: 127 }, { tick: 960, ch: 0, cc: 7, val: 64 }, { tick: 960, ch: 0, cc: 11, val: 64 }, { tick: 480, ch: 0, cc: 10, val: 127 }, { tick: 0, ch: 0, cc: 10, val: 0 });
  t.bends.push({ tick: 480, ch: 0, val: 16383 }, { tick: 960, ch: 0, val: 8192 }, { tick: 0, ch: 0, val: 0 });
  const us = C.songToUnits(s).units, d = us.find(u => u.drums), m = us.find(u => !u.drums);
  assert.strictEqual(d.notes[0].sus, undefined); assert.strictEqual(d.auto, undefined);
  assert.deepStrictEqual(m.auto.vol.map(e => +e.v.toFixed(3)), [1, 0.063, 0.004].slice(0, 1).concat([+(Math.pow(64 / 127, 2)).toFixed(3), +(Math.pow(64 / 127, 4)).toFixed(3)]));
  assert.deepStrictEqual(m.auto.pan.map(e => [+e.t.toFixed(2), +e.v.toFixed(2)]), [[0, -1], [0.5, 1]]);
  assert.deepStrictEqual(m.auto.bend.map(e => Math.round(e.c)), [-200, 200, 0]);
});
test('playback data: units without controller events carry no automation', () => {
  const s = C.newSong(480), t = C.newSongTrack('p'); s.tracks.push(t); t.notes.push({ midi: 60, tick: 0, dur: 100, vel: 90, ch: 0 }); t.ctrl.push({ tick: 0, ch: 0, cc: 1, val: 40 });
  assert.strictEqual(C.songToUnits(s).units[0].auto, undefined);
});
test('wav: header, 16-bit samples, clipping and silence trimming', () => {
  const l = Float32Array.from([0, 0.5, -0.5, 2, -2]), r = Float32Array.from([0, 0.25, 0, 0, 0]), w = C.encodeWav([l, r], 44100), dv = new DataView(w.buffer);
  const tag = o => String.fromCharCode(w[o], w[o + 1], w[o + 2], w[o + 3]);
  assert.strictEqual(tag(0), 'RIFF'); assert.strictEqual(tag(8), 'WAVE'); assert.strictEqual(tag(36), 'data'); assert.strictEqual(w.length, 44 + 5 * 2 * 2);
  assert.strictEqual(dv.getUint32(4, true), w.length - 8); assert.strictEqual(dv.getUint16(22, true), 2); assert.strictEqual(dv.getUint32(24, true), 44100); assert.strictEqual(dv.getUint32(40, true), 20);
  assert.strictEqual(dv.getInt16(44 + 4, true), 16384); assert.strictEqual(dv.getInt16(44 + 6, true), 8192); assert.strictEqual(dv.getInt16(44 + 8, true), -16384);
  assert.strictEqual(dv.getInt16(44 + 12, true), 32767); assert.strictEqual(dv.getInt16(44 + 16, true), -32768);   // clipped
  assert.strictEqual(C.encodeWav([l], 8000).length, 44 + 10);
  assert.strictEqual(C.lastLoud([Float32Array.from([0, 0.3, 0, 0.001, 0, 0])], 0.0005), 4); assert.strictEqual(C.lastLoud([new Float32Array(5)], 0.01), 0);
});

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
