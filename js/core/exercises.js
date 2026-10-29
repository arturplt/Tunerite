"use strict";
/* ---- Exercises ---- */
function layout(items, bpm) {
  const beat = 60 / bpm; let t = 0;
  const events = items.map(it => { const e = { midi: it.midi, midi2: it.midi2, start: t, dur: it.beats * beat }; if (it.v) e.v = it.v; t += e.dur; return e; });
  return { events, total: t, bpm, beat };
}
function fitTonic(offsets, lo, hi) {
  const mn = Math.min.apply(null, offsets), mx = Math.max.apply(null, offsets);
  const t = Math.round((lo + hi) / 2 - (mn + mx) / 2);
  return { tonic: t, fits: t + mn >= lo && t + mx <= hi };
}
function seqItems(offs, tonic, beats) { return offs.map((o, i) => ({ midi: tonic + o, beats: Array.isArray(beats) ? beats[i] : beats })); }
function upDown(up) { return up.concat(up.slice(0, -1).reverse()); }

/* Melodies: offsets in semitones from the tonic, durations in beats. Only add tunes whose transcription you can cite
   and that are in the public domain (see docs/EXERCISES.md). */
const MELODIES = [
  { id: 'ode', name: 'Ode to Joy (Beethoven)', bpm: 84,
    notes: [[4,1],[4,1],[5,1],[7,1],[7,1],[5,1],[4,1],[2,1],[0,1],[0,1],[2,1],[4,1],[4,1.5],[2,.5],[2,2],
            [4,1],[4,1],[5,1],[7,1],[7,1],[5,1],[4,1],[2,1],[0,1],[0,1],[2,1],[4,1],[2,1.5],[0,.5],[0,2]] },
  { id: 'frere', name: 'Frère Jacques (traditional)', bpm: 84,
    notes: [[0,1],[2,1],[4,1],[0,1],[0,1],[2,1],[4,1],[0,1],[4,1],[5,1],[7,2],[4,1],[5,1],[7,2],
            [7,.5],[9,.5],[7,.5],[5,.5],[4,1],[0,1],[7,.5],[9,.5],[7,.5],[5,.5],[4,1],[0,1],[0,1],[-5,1],[0,2],[0,1],[-5,1],[0,2]] },
  { id: 'twinkle', name: 'Twinkle, Twinkle (traditional)', bpm: 84,
    notes: [[0,1],[0,1],[7,1],[7,1],[9,1],[9,1],[7,2],[5,1],[5,1],[4,1],[4,1],[2,1],[2,1],[0,2],
            [7,1],[7,1],[5,1],[5,1],[4,1],[4,1],[2,2],[7,1],[7,1],[5,1],[5,1],[4,1],[4,1],[2,2],
            [0,1],[0,1],[7,1],[7,1],[9,1],[9,1],[7,2],[5,1],[5,1],[4,1],[4,1],[2,1],[2,1],[0,2]] }
];
const DRUM_NOTES = [55, 58, 60, 62, 65, 67, 70, 72, 74];   // G minor pentatonic, G3-D5
const SCALES = { major: [0,2,4,5,7,9,11,12], minor: [0,2,3,5,7,8,10,12] };

function intervalDef(id, name, semis) {
  return { id, group: 'Intervals', name, desc: 'Sing the root, then jump up. Repeats from three starting notes.',
    build(r) {
      const offs = []; [0, 2, 4].forEach(root => { offs.push(root, root + semis); });
      const f = fitTonic(offs, r.lo, r.hi);
      return { items: seqItems(offs, f.tonic, 2), bpm: 72, tonic: f.tonic, fits: f.fits };
    } };
}
/* A scale given as semitone offsets (without the octave): up one octave and back down, the top note held twice as long. */
function scaleDef(id, name, offs, desc, bpm) {
  return { id, group: 'Scales', name, desc: desc || 'Up and down one octave.',
    build(r) { const up = offs.concat([12]), o = upDown(up), f = fitTonic(o, r.lo, r.hi);
      return { items: seqItems(o, f.tonic, o.map((x, i) => i === up.length - 1 ? 2 : 1)), bpm: bpm || 72, tonic: f.tonic, fits: f.fits }; } };
}
/* Modular exercises. A pattern (scale degrees, 0 = tonic) is sung in a scale, repeated up or down a ladder of rungs, with optional syllables.
   spec: {id, group, name, desc, pat, beats (a number, or one per pattern note), scale: 'major'|'minor', rungs, step (semitones between rungs, negative goes down),
          syl (syllables, cycled over the notes), bpm}. Keep the whole span under about 20 semitones so it fits a normal range. */
const SING_SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
function degSemis(scale, d) { const n = scale.length, o = Math.floor(d / n); return scale[d - o * n] + 12 * o; }
function patternDef(s) {
  return { id: s.id, group: s.group, name: s.name, desc: s.desc,
    build(r) {
      const sc = SING_SCALES[s.scale || 'major'], base = s.pat.map(d => degSemis(sc, d)), offs = [], beats = [], syl = [];
      for (let k = 0; k < (s.rungs || 1); k++) base.forEach((o, i) => { offs.push(o + k * (s.step || 1)); beats.push(Array.isArray(s.beats) ? s.beats[i] : s.beats || 1); syl.push(s.syl ? s.syl[syl.length % s.syl.length] : undefined); });
      const f = fitTonic(offs, r.lo, r.hi);
      return { items: seqItems(offs, f.tonic, beats).map((it, i) => { if (syl[i]) it.v = syl[i]; return it; }), bpm: s.bpm || 72, tonic: f.tonic, fits: f.fits };
    } };
}
/* The same pattern in the major and in the minor scale: the minor copy gets the id suffix '-m' and the name suffix. */
function majorMinor(s) { return [s, Object.assign({}, s, { id: s.id + '-m', name: s.name + ' (minor)', scale: 'minor' })]; }
const SING_PATTERNS = [].concat(
  majorMinor({ id: 'p-three', group: 'Patterns', name: 'Three-note steps', desc: 'Do Re Mi Re Do, one half step higher each time, five times.', pat: [0, 1, 2, 1, 0], beats: [1, 1, 1, 1, 2], rungs: 5 }),
  majorMinor({ id: 'p-descend', group: 'Patterns', name: 'Five down', desc: 'Sol Fa Mi Re Do from the top of the scale, then a whole step higher, four times.', pat: [4, 3, 2, 1, 0], beats: [1, 1, 1, 1, 2], rungs: 4, step: 2 }),
  majorMinor({ id: 'p-thirds', group: 'Patterns', name: 'Scale in thirds', desc: 'Do-Mi, Re-Fa, Mi-Sol… climb the scale in jumps of a third, with a step back each time.', pat: [0, 2, 1, 3, 2, 4, 3, 5, 4, 6, 5, 7], beats: 1 }),
  majorMinor({ id: 'p-home', group: 'Patterns', name: 'Home base', desc: 'Always return to the tonic: Do Re Do Mi Do Fa Do Sol Do. Trains the pitch memory.', pat: [0, 1, 0, 2, 0, 3, 0, 4, 0], beats: [1, 1, 1, 1, 1, 1, 1, 1, 2] }),
  majorMinor({ id: 'p-turn', group: 'Patterns', name: 'Neighbour turn', desc: 'Circle around the note: up a step, back, down a step, back. Moves up by whole steps.', pat: [0, 1, 0, -1, 0], beats: [1, 1, 1, 1, 2], rungs: 4, step: 2 }),
  majorMinor({ id: 'p-leapback', group: 'Patterns', name: 'Leap and walk down', desc: 'Jump up a fifth, then walk back down the scale: Do Sol Fa Mi Re Do.', pat: [0, 4, 3, 2, 1, 0], beats: [1, 1, 1, 1, 1, 2], rungs: 3 }),
  majorMinor({ id: 'p-octdrop', group: 'Patterns', name: 'Octave drop', desc: 'Start an octave up and step down in chord tones: Do Sol Mi Do.', pat: [7, 4, 2, 0], beats: [1, 1, 1, 2], rungs: 3, bpm: 66 }),
  majorMinor({ id: 'p-quick', group: 'Patterns', name: 'Quick arpeggios', desc: 'Short, light notes: Do Mi Sol Do Sol Mi Do. Keep it clean when it gets fast.', pat: [0, 2, 4, 7, 4, 2, 0], beats: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1], rungs: 3, step: 2, bpm: 84 }),
  [{ id: 's-nay', group: 'Syllables', name: 'Nay-nay scale', desc: 'The five-note scale on "nay". The bright, forward sound helps find the pitch.', pat: [0, 1, 2, 3, 4, 3, 2, 1, 0], beats: [1, 1, 1, 1, 1, 1, 1, 1, 2], syl: ['nay'] },
   { id: 's-hum', group: 'Syllables', name: 'Humming scale', desc: 'The five-note scale on a closed-mouth hum. Feel the buzz in your face.', pat: [0, 1, 2, 3, 4, 3, 2, 1, 0], beats: [1, 1, 1, 1, 1, 1, 1, 1, 2], syl: ['mm'] },
   { id: 's-zee', group: 'Syllables', name: 'Zee arpeggio', desc: 'Do Mi Sol Mi Do on "zee", one half step higher each time. Keeps the air steady.', pat: [0, 2, 4, 2, 0], beats: [1, 1, 1, 1, 2], rungs: 4, syl: ['zee'] },
   { id: 's-vowelarp', group: 'Syllables', name: 'Vowel arpeggios', desc: 'Chord tones with a new vowel on each note: ah eh ee oh oo. Keep the pitch while the mouth changes.', pat: [0, 2, 4, 7, 4, 2, 0], beats: [1, 1, 1, 2, 1, 1, 2], syl: ['ah', 'eh', 'ee', 'oh', 'oo'], bpm: 66 },
   { id: 'd-taka', group: 'Diction', name: 'Ta-ka-ta-ka', desc: 'Crisp tongue-tip and back-of-tongue consonants on one note. Keep the pitch dead steady while the consonants fly. A whole step higher each round.', pat: [0, 0, 0, 0, 0, 0, 0, 0], beats: 0.5, rungs: 3, step: 2, syl: ['ta', 'ka'], bpm: 84 },
   { id: 'd-paba', group: 'Diction', name: 'Pa-ba lips', desc: 'Lip consonants, unvoiced then voiced: pa ba pa ba. The pitch should not dip on the voiced "b".', pat: [0, 0, 0, 0, 0, 0, 0, 0], beats: 0.5, rungs: 3, step: 2, syl: ['pa', 'ba'], bpm: 84 },
   { id: 'd-ladana', group: 'Diction', name: 'La-da-na-ta scale', desc: 'Four tongue consonants on a five-note scale up and down. Light tongue, clear vowels.', pat: [0, 1, 2, 3, 4, 3, 2, 1, 0], beats: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1], syl: ['la', 'da', 'na', 'ta'], bpm: 84 },
   { id: 'd-mini', group: 'Diction', name: 'Mi-ni-mi-no', desc: 'Nasal and vowel changes: me ne mi no. Keep every vowel pure and the pitch even.', pat: [0, 2, 4, 2, 0, 2, 4, 2, 0], beats: [1, 1, 1, 1, 1, 1, 1, 1, 2], syl: ['me', 'ne', 'mi', 'no'], bpm: 72 },
   { id: 'd-leather', group: 'Diction', name: 'Tongue twister: red leather', desc: 'Red leather, yellow leather, on one note. Say every consonant clearly without rushing.', pat: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], beats: 0.5, rungs: 2, step: 2, syl: ['red', 'leath', 'er', 'yel', 'low', 'leath', 'er', 'red', 'leath', 'er', 'yel', 'low'], bpm: 84 },
   { id: 'd-peter', group: 'Diction', name: 'Tongue twister: Peter Piper', desc: 'Peter Piper picked a peck, on a rising scale. The hard "p" and "k" sounds must not move the pitch.', pat: [0, 0, 1, 1, 2, 2, 3, 3], beats: 0.5, syl: ['Pe', 'ter', 'Pi', 'per', 'picked', 'a', 'peck', 'of'], bpm: 84 },
   { id: 's-gee', group: 'Syllables', name: 'Gee-gee staccato', desc: 'Short, springy notes on "gee": five-note scale up and down, a whole step higher each time.', pat: [0, 1, 2, 3, 4, 3, 2, 1, 0], beats: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 1], rungs: 3, step: 2, syl: ['gee'], bpm: 84 }]
).map(patternDef);

/* Procedural exercises: a new tune every time. build(range, rnd), rnd() returns [0,1). Tests pass a seeded generator. */
function pick(a, rnd) { return a[Math.floor(rnd() * a.length) % a.length]; }
function mulberry32(a) { return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const SING_RANDOM = [
  { id: 'r-walk', group: 'Random', name: 'Random melody, steps', desc: 'A new stepwise tune in the major scale every time. It starts and ends on the tonic. Good for reading by ear.',
    build(r, rnd) {
      let d = 0; const degs = [0];
      for (let i = 0; i < 10; i++) { const st = pick([-2, -1, -1, 1, 1, 2], rnd); d = Math.max(0, Math.min(7, d + st)); if (d === degs[degs.length - 1]) d = d === 7 ? 6 : d + 1; degs.push(d); }
      while (degs[degs.length - 1] !== 0) { const l = degs[degs.length - 1]; degs.push(l - Math.min(2, l)); }   // walk home
      const o = degs.map(x => degSemis(SING_SCALES.major, x)), f = fitTonic(o, r.lo, r.hi);
      return { items: seqItems(o, f.tonic, o.map((x, i) => i === o.length - 1 ? 2 : 1)), bpm: 72, tonic: f.tonic, fits: f.fits };
    } },
  { id: 'r-leaps', group: 'Random', name: 'Random leaps', desc: 'Sing the home note, then a leap to a random interval, six times. Think of the interval before you sing it.',
    build(r, rnd) {
      const o = [], b = [];
      for (let i = 0; i < 6; i++) { const up = rnd() < 0.7, d = up ? pick([3, 4, 5, 7, 9, 12], rnd) : -pick([3, 4, 5, 7], rnd); o.push(0, d); b.push(1, 2); }
      const f = fitTonic(o, r.lo, r.hi);
      return { items: seqItems(o, f.tonic, b), bpm: 72, tonic: f.tonic, fits: f.fits };
    } },
  { id: 'r-chord', group: 'Random', name: 'Random chord tones', desc: 'Jump around the notes of a major or minor chord in a new order every time, then land on the root.',
    build(r, rnd) {
      const tones = pick([[0, 4, 7, 12], [0, 3, 7, 12]], rnd), o = [0];
      for (let i = 0; i < 9; i++) { let t; do t = pick(tones, rnd); while (t === o[o.length - 1]); o.push(t); }
      if (o[o.length - 1] !== 0) o.push(0);
      const f = fitTonic(o, r.lo, r.hi);
      return { items: seqItems(o, f.tonic, o.map((x, i) => i === o.length - 1 ? 2 : 1)), bpm: 72, tonic: f.tonic, fits: f.fits };
    } }
];
const EXERCISES = [
  { id: 'hold', group: 'Single notes', name: 'Match a held note', desc: 'Three notes, low, middle and high in your range. Hold each for three seconds.',
    build(r) {
      const span = r.hi - r.lo;
      const notes = span < 6 ? [Math.round((r.lo + r.hi) / 2)] : [0.25, 0.5, 0.75].map(p => r.lo + Math.round(span * p));
      return { items: notes.map(m => ({ midi: m, beats: 3 })), bpm: 60, tonic: r.lo, fits: true };
    } },
  { id: 'holdlong', group: 'Single notes', name: 'Long tone', desc: 'One comfortable note held for eight slow beats. Keep the pitch dead steady.',
    build(r) { const m = Math.round((r.lo + r.hi) / 2); return { items: [{ midi: m, beats: 8 }], bpm: 60, tonic: m, fits: true }; } },
  { id: 'glide5', group: 'Slides', name: 'Fifth glide', desc: 'Slide up a fifth and back down, smoothly, with no steps in the sound.',
    build(r) { const span = r.hi - r.lo, top = Math.min(7, Math.max(3, span - 2)), s = r.lo + Math.round((span - top) / 2);
      return { items: [{ midi: s, midi2: s + top, beats: 3 }, { midi: s + top, midi2: s, beats: 3 }], bpm: 60, tonic: s, fits: span >= top }; } },
  { id: 'glideslow', group: 'Slides', name: 'Slow siren', desc: 'The siren at half speed: eight beats up and eight back down. Good for breath control.',
    build(r) { const span = r.hi - r.lo, top = Math.min(12, Math.max(4, span - 2)), s = r.lo + Math.round((span - top) / 2);
      return { items: [{ midi: s, midi2: s + top, beats: 8 }, { midi: s + top, midi2: s, beats: 8 }], bpm: 60, tonic: s, fits: span >= top }; } },
  { id: 'siren', group: 'Slides', name: 'Siren', desc: 'Glide smoothly up an octave and back down, following the moving bar.',
    build(r) {
      const span = r.hi - r.lo, top = Math.min(12, Math.max(4, span - 2));
      const s = r.lo + Math.round((span - top) / 2);
      return { items: [{ midi: s, midi2: s + top, beats: 4 }, { midi: s + top, midi2: s, beats: 4 }], bpm: 60, tonic: s, fits: span >= top };
    } },
  { id: 'five', group: 'Warm-up', name: 'Five-note scale', desc: 'Do Re Mi Fa Sol and back. The classic first warm-up.',
    build(r) { const o = [0, 2, 4, 5, 7, 5, 4, 2, 0], f = fitTonic(o, r.lo, r.hi);
      return { items: seqItems(o, f.tonic, o.map((x, i) => i === 8 ? 2 : 1)), bpm: 72, tonic: f.tonic, fits: f.fits }; } },
  { id: 'vowels', group: 'Vowels', name: 'Vowels on one note', desc: 'Hold one comfortable note and change the vowel: ma me mi mo mu. Keep the pitch steady while the mouth shape changes. Repeats a tone higher.',
    build(r) {
      const m = Math.round((r.lo + r.hi) / 2) - 2, items = [];
      [0, 2].forEach(k => ['ma', 'me', 'mi', 'mo', 'mu'].forEach(v => items.push({ midi: m + k, beats: 3, v })));
      return { items, bpm: 60, tonic: m, fits: r.hi - r.lo >= 4 };
    } },
  { id: 'vowelscale', group: 'Vowels', name: 'Vowel scale', desc: 'Five-note scale with a new vowel on every note: ma me mi mo mu and back.',
    build(r) {
      const o = [0, 2, 4, 5, 7, 5, 4, 2, 0], V = ['ma', 'me', 'mi', 'mo', 'mu', 'mo', 'mi', 'me', 'ma'], f = fitTonic(o, r.lo, r.hi);
      return { items: o.map((x, i) => ({ midi: f.tonic + x, beats: i === 8 ? 2 : 1, v: V[i] })), bpm: 66, tonic: f.tonic, fits: f.fits };
    } },
  { id: 'arp', group: 'Warm-up', name: 'Arpeggio', desc: 'Do Mi Sol Do and back down, smooth and connected.',
    build(r) { const o = [0, 4, 7, 12, 7, 4, 0], f = fitTonic(o, r.lo, r.hi);
      return { items: seqItems(o, f.tonic, [1, 1, 1, 2, 1, 1, 2]), bpm: 72, tonic: f.tonic, fits: f.fits }; } },
  { id: 'arpm', group: 'Chords', name: 'Minor arpeggio', desc: 'La Do Mi La and back, the notes of a minor chord.',
    build(r) { const o = [0, 3, 7, 12, 7, 3, 0], f = fitTonic(o, r.lo, r.hi);
      return { items: seqItems(o, f.tonic, [1, 1, 1, 2, 1, 1, 2]), bpm: 72, tonic: f.tonic, fits: f.fits }; } },
  { id: 'arp7', group: 'Chords', name: 'Dominant seventh arpeggio', desc: 'The four notes of a seventh chord, up and back down.',
    build(r) { const o = [0, 4, 7, 10, 7, 4, 0], f = fitTonic(o, r.lo, r.hi);
      return { items: seqItems(o, f.tonic, [1, 1, 1, 2, 1, 1, 2]), bpm: 72, tonic: f.tonic, fits: f.fits }; } },
  { id: 'chords', group: 'Chords', name: 'Major, minor, major', desc: 'Sing a major triad, then the minor version, then major again. Hear how one note changes the colour.',
    build(r) { const o = [0, 4, 7, 7, 3, 0, 0, 4, 7], f = fitTonic(o, r.lo, r.hi);
      return { items: seqItems(o, f.tonic, [1, 1, 2, 1, 1, 2, 1, 1, 2]), bpm: 66, tonic: f.tonic, fits: f.fits }; } },
  { id: 'ladder', group: 'Warm-up', name: 'Semitone ladder', desc: 'Do Re Mi Re Do, then the same pattern one semitone higher, four times.',
    build(r) { const o = []; [0, 1, 2, 3].forEach(k => [0, 2, 4, 2, 0].forEach(x => o.push(k + x))); const f = fitTonic(o, r.lo, r.hi);
      return { items: seqItems(o, f.tonic, 1), bpm: 80, tonic: f.tonic, fits: f.fits }; } },
  intervalDef('third', 'Thirds', 4),
  intervalDef('fifth', 'Fifths', 7),
  intervalDef('octave', 'Octaves', 12),
  intervalDef('second', 'Seconds', 2),
  intervalDef('fourth', 'Fourths', 5),
  intervalDef('sixth', 'Sixths', 9),
  { id: 'major', group: 'Scales', name: 'Major scale', desc: 'Up and down one octave.',
    build(r) { const o = upDown(SCALES.major), f = fitTonic(o, r.lo, r.hi);
      return { items: seqItems(o, f.tonic, o.map((x, i) => i === 7 ? 2 : 1)), bpm: 72, tonic: f.tonic, fits: f.fits }; } },
  { id: 'minor', group: 'Scales', name: 'Natural minor scale', desc: 'Up and down one octave.',
    build(r) { const o = upDown(SCALES.minor), f = fitTonic(o, r.lo, r.hi);
      return { items: seqItems(o, f.tonic, o.map((x, i) => i === 7 ? 2 : 1)), bpm: 72, tonic: f.tonic, fits: f.fits }; } },
  scaleDef('harm', 'Harmonic minor scale', [0, 2, 3, 5, 7, 8, 11], 'Minor with a raised seventh: the leap of three semitones is the tricky part.'),
  scaleDef('pentmaj', 'Major pentatonic', [0, 2, 4, 7, 9], 'Five notes, no half steps. Easy to sing in tune.'),
  scaleDef('pentmin', 'Minor pentatonic', [0, 3, 5, 7, 10], 'The five-note scale behind rock and blues melodies.'),
  scaleDef('blues', 'Blues scale', [0, 3, 5, 6, 7, 10], 'Minor pentatonic plus the "blue note". Slow and bendy.', 66),
  scaleDef('dorian', 'Dorian mode', [0, 2, 3, 5, 7, 9, 10], 'Minor with a bright sixth. Hear how it differs from natural minor.'),
  scaleDef('mixo', 'Mixolydian mode', [0, 2, 4, 5, 7, 9, 10], 'Major with a flat seventh, the sound of many folk and rock tunes.'),
  scaleDef('whole', 'Whole-tone scale', [0, 2, 4, 6, 8, 10], 'Six equal steps. Dreamy, and a good test of your ear.'),
  scaleDef('chrom', 'Chromatic scale', [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], 'Every semitone up and down. The ultimate tuning test.', 96),
  { id: 'drum', group: 'Scales', fixed: true, name: 'G minor pentatonic (tongue drum)', desc: 'Fixed pitches G3–D5 so you can play along with your drum. Not transposed.',
    build(r) {
      let best = 0, bestIn = -1;
      [0, -12, 12].forEach(sh => { const n = DRUM_NOTES.filter(m => m + sh >= r.lo && m + sh <= r.hi).length; if (n > bestIn) { bestIn = n; best = sh; } });
      const notes = upDown(DRUM_NOTES.map(m => m + best));
      return { items: notes.map(m => ({ midi: m, beats: 1 })), bpm: 72, tonic: 55 + best, fits: bestIn === DRUM_NOTES.length };
    } }
].concat(SING_PATTERNS, SING_RANDOM, MELODIES.map(m => ({
  id: 'mel-' + m.id, group: 'Melodies', name: m.name, desc: 'Sing the tune. Transposed to fit your range.',
  build(r) {
    const f = fitTonic(m.notes.map(n => n[0]), r.lo, r.hi);
    return { items: m.notes.map(n => ({ midi: f.tonic + n[0], beats: n[1] })), bpm: m.bpm, tonic: f.tonic, fits: f.fits };
  } })));

function buildExercise(id, range, tempo, rnd) {
  tempo = tempo || 1;                                               // 1 = written speed, 0.5 = half speed
  const def = EXERCISES.find(e => e.id === id);
  const b = def.build(range, rnd || Math.random), l = layout(b.items, b.bpm * tempo);
  const all = []; l.events.forEach(e => { all.push(e.midi); if (e.midi2 != null) all.push(e.midi2); });
  return { id, name: def.name, group: def.group, events: l.events, total: l.total, bpm: b.bpm * tempo, tempo, beat: l.beat,
    tonic: b.tonic, fits: b.fits, lo: Math.min.apply(null, all), hi: Math.max.apply(null, all) };
}

