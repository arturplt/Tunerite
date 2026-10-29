"use strict";
/* ---- Progress helpers ---- */
function dayKey(ts) { const d = new Date(ts); return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
function computeStreak(history, now) {
  const days = new Set(history.map(h => dayKey(h.ts)));
  const d = new Date(now == null ? Date.now() : now); d.setHours(12, 0, 0, 0);
  if (!days.has(dayKey(d))) d.setDate(d.getDate() - 1);     // not having practised yet today does not break the streak
  let n = 0;
  while (days.has(dayKey(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}
function describeDeviation(dev, tol) {
  if (dev == null) return 'not heard';
  if (Math.abs(dev) <= tol * 0.3) return 'on pitch';
  return Math.round(Math.abs(dev)) + '¢ ' + (dev > 0 ? 'sharp' : 'flat');
}

/* Names the chord held on a keyboard, or '' when it is not a common one. keys: midi numbers. */
function chordName(keys) {
  const ks = keys.slice().sort((a, b) => a - b);
  if (ks.length < 2) return '';
  const pcs = [...new Set(ks.map(k => k % 12))], bass = ks[0] % 12, nm = p => NOTE_NAMES[p];
  const T = [['', [0, 4, 7]], ['m', [0, 3, 7]], ['dim', [0, 3, 6]], ['aug', [0, 4, 8]], ['sus2', [0, 2, 7]], ['sus4', [0, 5, 7]], ['maj7', [0, 4, 7, 11]], ['7', [0, 4, 7, 10]], ['m7', [0, 3, 7, 10]], ['m7b5', [0, 3, 6, 10]], ['dim7', [0, 3, 6, 9]], ['6', [0, 4, 7, 9]], ['m6', [0, 3, 7, 9]], ['5', [0, 7]],
    ['add9', [0, 2, 4, 7]], ['madd9', [0, 2, 3, 7]], ['9', [0, 2, 4, 7, 10]], ['maj9', [0, 2, 4, 7, 11]], ['m9', [0, 2, 3, 7, 10]], ['7sus4', [0, 5, 7, 10]], ['6/9', [0, 2, 4, 7, 9]], ['m11', [0, 2, 3, 5, 7, 10]],
    ['maj7(no5)', [0, 4, 11]], ['7(no5)', [0, 4, 10]], ['m7(no5)', [0, 3, 10]]];
  for (const r of [bass].concat(pcs.filter(p => p !== bass))) {      // the lowest note is tried as the root first
    const iv = pcs.map(p => (p - r + 12) % 12).sort((a, b) => a - b);
    for (const t of T) if (t[1].length === iv.length && t[1].every((x, i) => x === iv[i])) return nm(r) + t[0] + (r !== bass ? '/' + nm(bass) : '');
  }
  return '';
}
/* Name of the distance between two notes, e.g. 4 -> "major third", 16 -> "major tenth". */
function intervalName(semis) {
  const N = ['unison', 'minor second', 'major second', 'minor third', 'major third', 'perfect fourth', 'tritone', 'perfect fifth', 'minor sixth', 'major sixth', 'minor seventh', 'major seventh', 'octave',
    'minor ninth', 'major ninth', 'minor tenth', 'major tenth', 'perfect eleventh', 'augmented eleventh', 'perfect twelfth', 'minor thirteenth', 'major thirteenth', 'minor fourteenth', 'major fourteenth', 'two octaves'];
  const d = Math.abs(Math.round(semis)); return d < N.length ? N[d] : d + ' semitones';
}
/* What to call a set of notes: one key, two keys (interval), three or more (chord, or the plain note names). */
function describeKeys(midis) {
  const ks = [...new Set(midis)].sort((a, b) => a - b), pn = m => NOTE_NAMES[((m % 12) + 12) % 12];
  if (!ks.length) return { name: '', detail: '' };
  if (ks.length === 1) return { name: noteName(ks[0]), detail: 'one key' };
  const pcs = [...new Set(ks.map(k => ((k % 12) + 12) % 12))];
  if (pcs.length === 1) return { name: pn(ks[0]), detail: intervalName(ks[ks.length - 1] - ks[0]) };
  if (ks.length === 2) return { name: pn(ks[0]) + '–' + pn(ks[1]), detail: intervalName(ks[1] - ks[0]) };
  const c = chordName(ks);
  return c ? { name: c, detail: ks.map(noteName).join(' ') } : { name: ks.map(pn).join(' '), detail: 'no common chord name' };
}
/* Coaching issues the analysis can report: label, one-line remedy, and the exercise that trains it. */
const ISSUES = {
  missed: ['Notes not heard', 'Sing a little louder or closer to the mic.', 'hold'],
  flat: ['Singing flat', 'Stand tall, lift the soft palate and support the breath.', 'hold'],
  sharp: ['Singing sharp', 'Release throat and jaw tension, sing softer.', 'hold'],
  sag: ['Long notes sag', 'Keep the ribs open and the airflow steady.', 'hold'],
  creep: ['Long notes creep sharp', 'Ease the pressure and keep the volume constant.', 'hold'],
  scoop: ['Sliding up into notes', 'Hear the pitch first and start right on it.', 'hold'],
  over: ['Overshooting note starts', 'Start softer and imagine the pitch before singing.', 'hold'],
  late: ['Finding notes late', 'Use the beat before the note to prepare it.', 'five'],
  wobble: ['Unsteady pitch', 'Steady airflow. Lip trills and humming help.', 'hold'],
  highflat: ['High notes flat', 'Stay tall, give high notes more air.', 'siren'],
  highsharp: ['High notes sharp', 'Lighten the voice, do not squeeze.', 'siren'],
  lowsharp: ['Low notes sharp', 'Relax into low notes, do not push.', 'siren'],
  lowflat: ['Low notes flat', 'Keep the energy up on low notes.', 'siren'],
  short: ['Landing short on jumps', 'Hear the interval first and commit to it.', 'fifth'],
  long: ['Overshooting jumps', 'Aim for the exact landing, lighter.', 'third'],
  vowel: ['Vowel changes the pitch', 'Keep the same breath and pitch on every vowel.', 'vowels'],
  lag: ['Trailing glides', 'Lead the slide with the end note.', 'siren'],
  ahead: ['Rushing glides', 'Spread the movement evenly.', 'siren']
};
/* log: [{ids:[...]}] newest last. Counts how often each issue appeared in the last n analysed exercises. */
function countIssues(log, n) {
  const c = {}; (log || []).slice(-(n || 10)).forEach(e => (e.ids || []).forEach(id => { c[id] = (c[id] || 0) + 1; }));
  return c;
}
/* A practice plan from recurring issues (seen at least twice): warm-up, the drills that train them, cool-down. */
function adaptivePlan(counts) {
  const top = Object.keys(counts).filter(id => ISSUES[id] && counts[id] >= 2).sort((a, b) => counts[b] - counts[a]).slice(0, 3);
  const exs = [...new Set(top.map(id => ISSUES[id][2]))].slice(0, 2);
  if (!exs.length) exs.push('major');
  return { focus: top.map(id => ISSUES[id][0]), steps: ['c:breath', 'c:trill', 'c:hum', 'x:five'].concat(exs.map(x => 'x:' + x), ['c:cool']) };
}

/* Finds the notes sounding together in a magnitude spectrum (dB per FFT bin, as AnalyserNode.getFloatFrequencyData gives).
   Works on a semitone grid, picks the strongest note, subtracts its expected overtones and repeats. Returns midi numbers, low to high. */
function detectNotes(db, sr, fftSize, a4, maxNotes) {
  a4 = a4 || 440; maxNotes = maxNotes || 6;
  const hz = sr / fftSize, LO = 28, HI = 100, TOP = HI + 31, OFF = [0, 12, 19, 24, 28, 31], W8 = [1, 0.8, 0.6, 0.45, 0.35, 0.25];
  const S = new Float32Array(TOP - LO + 1);
  for (let m = LO; m <= TOP; m++) {
    const f = midiToFreq(m, a4); if (f >= sr / 2 - hz) break;
    const a = Math.max(1, Math.round(f * Math.pow(2, -1 / 24) / hz)), b = Math.max(a, Math.round(f * Math.pow(2, 1 / 24) / hz));
    let v = 0; for (let i = a; i <= b && i < db.length; i++) { const x = Math.pow(10, db[i] / 20); if (x > v) v = x; }
    S[m - LO] = v;
  }
  const floor = median(Array.from(S.subarray(0, HI - LO + 1)));
  const out = []; let first = 0;
  for (let k = 0; k < maxNotes; k++) {
    let best = -1, bt = 0;
    for (let m = LO; m <= HI; m++) {
      const i = m - LO, v = S[i];
      if (!(v > floor * 6) || v < S[i - 1] || v < S[i + 1]) continue;       // the fundamental must stand clear of the noise and be a local peak
      let t = 0; for (let h = 0; h < OFF.length; h++) t += W8[h] * S[i + OFF[h]];
      if (t > bt) { bt = t; best = m; }
    }
    if (best < 0) break;
    if (k === 0) first = bt; else if (bt < 0.3 * first) break;
    out.push(best);
    const a0 = S[best - LO];
    for (let h = 0; h < OFF.length; h++) { const p = best - LO + OFF[h]; S[p] = h === 0 ? 0 : Math.max(0, S[p] - a0 * Math.pow(0.7, h)); }
    for (const d of [-1, 1]) { const p = best - LO + d; if (S[p] < a0) S[p] = 0; }   // spectral leakage next to the note
  }
  return out.sort((a, b) => a - b);
}

