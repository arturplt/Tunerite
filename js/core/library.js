"use strict";
/* ---- Piano exercises (played on a keyboard, or heard through the microphone) ---- */
const PIANO_SCALES = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10], harm: [0, 2, 3, 5, 7, 8, 11], pent: [0, 2, 4, 7, 9],
  dorian: [0, 2, 3, 5, 7, 9, 10], mixo: [0, 2, 4, 5, 7, 9, 10], lydian: [0, 2, 4, 6, 7, 9, 11], phrygian: [0, 1, 3, 5, 7, 8, 10],
  pentmin: [0, 3, 5, 7, 10], blues: [0, 3, 5, 6, 7, 10], whole: [0, 2, 4, 6, 8, 10], chrom: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] };
const PIANO_CHORDS = { major: [0, 4, 7], minor: [0, 3, 7], dim: [0, 3, 6], aug: [0, 4, 8], sus2: [0, 2, 7], sus4: [0, 5, 7],
  dom7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dim7: [0, 3, 6, 9], m7b5: [0, 3, 6, 10] };
/* Note patterns for the 'sequence' exercise: scale-degree offsets played from every degree of the scale in turn (the classic finger exercises). */
const PIANO_PATTERNS = { thirds: [0, 2], fours: [0, 1, 2, 3], broken: [0, 2, 1, 3], triads: [0, 2, 4], neighbour: [0, 1, 0, -1], zigzag: [0, 2, 1, 3, 2, 4], fives: [0, 1, 2, 3, 4, 3, 2, 1] };
/* Harmonic intervals for the 'intervals' exercise: semitones as the option value. */
const PIANO_INTERVALS = ['3', '4', '5', '7', '8', '9', '12'];
/* Roman numerals to chords: 'ii7 V7 Imaj7' -> [[semitones above the key, chord type, label]]. Capitals are major, lower case minor,
   ° diminished, ø7 half-diminished, 7 a seventh (dominant on a capital, minor on lower case), maj7 a major seventh, a leading b lowers the root. */
const ROMAN_DEG = { I: 0, II: 2, III: 4, IV: 5, V: 7, VI: 9, VII: 11 };
function romanChords(str) {
  return str.split(/\s+/).map(tok => {
    const m = /^(b?)([ivIV]+)(maj7|ø7|°|7)?$/.exec(tok), up = m[2] === m[2].toUpperCase(), k = m[3];
    return [ROMAN_DEG[m[2].toUpperCase()] - (m[1] ? 1 : 0), k === 'maj7' ? 'maj7' : k === 'ø7' ? 'm7b5' : k === '°' ? 'dim' : k === '7' ? (up ? 'dom7' : 'min7') : up ? 'major' : 'minor', tok];
  });
}
const prog = (romans, label) => ({ label, chords: romanChords(romans) });
const PIANO_PROGS = {
  basic: prog('I IV V I', 'I – IV – V – I'),
  pop: prog('I V vi IV', 'I – V – vi – IV'),
  fifties: prog('I vi IV V', 'I – vi – IV – V (the 50s)'),
  sad: prog('vi IV I V', 'vi – IV – I – V'),
  canon: prog('I V vi iii IV I IV V', 'Canon: I V vi iii IV I IV V'),
  rock: prog('I bVII IV I', 'I – ♭VII – IV – I (rock)'),
  jazz: prog('ii7 V7 Imaj7', 'ii – V – I (sevenths)'),
  jazzminor: prog('iiø7 V7 i7', 'iiø – V – i (minor ii–V–I)'),
  minor: prog('i iv V i', 'i – iv – V – i (minor)'),
  andalusian: prog('i bVII bVI V', 'i – ♭VII – ♭VI – V (Andalusian)'),
  blues: prog('I7 IV7 I7 V7 IV7 I7', '12-bar blues, first 6 bars'),
  blues12: prog('I7 I7 I7 I7 IV7 IV7 I7 I7 V7 IV7 I7 V7', 'Full 12-bar blues'),
  diatonic: prog('I ii iii IV V vi vii° I', 'Every triad of the major key'),
  diatonic7: prog('Imaj7 ii7 iii7 IVmaj7 V7 vi7 viiø7 Imaj7', 'Every seventh chord of the major key')
};
/* Names for the option menus (the piano screen builds them from these, so a new entry only needs adding here and in the table above). */
const PIANO_NAMES = {
  scale: { major: 'Major', minor: 'Natural minor', harm: 'Harmonic minor', pent: 'Major pentatonic', dorian: 'Dorian', mixo: 'Mixolydian', lydian: 'Lydian', phrygian: 'Phrygian',
    pentmin: 'Minor pentatonic', blues: 'Blues', whole: 'Whole-tone', chrom: 'Chromatic' },
  chord: { major: 'Major', minor: 'Minor', dim: 'Diminished', aug: 'Augmented', sus2: 'Suspended 2nd', sus4: 'Suspended 4th', dom7: 'Dominant 7th', maj7: 'Major 7th', min7: 'Minor 7th', dim7: 'Diminished 7th', m7b5: 'Half-diminished 7th' },
  pattern: { thirds: 'Thirds (1-3, 2-4, 3-5…)', fours: 'Four-note runs (1-2-3-4, 2-3-4-5…)', broken: 'Broken thirds (1-3-2-4…)', triads: 'Triads on every degree (1-3-5, 2-4-6…)',
    neighbour: 'Turns (1-2-1-7, 2-3-2-1…)', zigzag: 'Zigzag (1-3-2-4-3-5…)', fives: 'Five-finger runs up and down (1-2-3-4-5-4-3-2…)' }
};
const pcOf = m => ((m % 12) + 12) % 12;
function pianoRoot(pc) { return 60 + ((pc + 6) % 12) - 6; }           // the octave around middle C: C4..F4 and F#3..B3
function chordVoicing(root, ivs, inv) { const n = ivs.map(i => root + i); for (let k = 0; k < inv; k++) n.push(n.shift() + 12); return n; }
/* Steps of a piano exercise. id: scale | arpeggio | chords | progression | sequence | intervals | flash | ear; pc: key 0-11 (C=0); o1/o2: options; rnd: random source.
   A step is {kind:'note'|'chord', notes:[midi], name, sub?, sound?:[midi] (what the app plays for ear exercises), given?:midi}. */
function buildPianoSteps(id, pc, o1, o2, rnd) {
  rnd = rnd || Math.random;
  const root = pianoRoot(pc), steps = [], note = (m, x) => Object.assign({ kind: 'note', notes: [m], name: noteName(m) }, x || {});
  const chord = (rt, ivs, inv, sub) => { const n = chordVoicing(rt, ivs, inv); return { kind: 'chord', notes: n, name: chordName(n) || n.map(noteName).join(' '), sub }; };
  const upDown = up => up.concat(up.slice(0, -1).reverse());
  if (id === 'scale') {
    const iv = PIANO_SCALES[o1] || PIANO_SCALES.major, oct = +o2 || 1, up = [];
    for (let o = 0; o < oct; o++) iv.forEach(i => up.push(root + 12 * o + i)); up.push(root + 12 * oct);
    upDown(up).forEach(m => steps.push(note(m)));
  } else if (id === 'arpeggio') {
    const iv = PIANO_CHORDS[o1] || PIANO_CHORDS.major, oct = +o2 || 1, up = [];
    for (let o = 0; o < oct; o++) iv.forEach(i => up.push(root + 12 * o + i)); up.push(root + 12 * oct);
    upDown(up).forEach(m => steps.push(note(m)));
  } else if (id === 'chords') {
    const iv = PIANO_CHORDS[o1] || PIANO_CHORDS.major;
    if (o2 === 'all') for (let k = 0; k < iv.length; k++) steps.push(chord(root, iv, k, k === 0 ? 'root position' : k + (k === 1 ? 'st' : k === 2 ? 'nd' : 'rd') + ' inversion'));
    else for (let k = 0; k < 12; k++) steps.push(chord(pianoRoot((pc + 7 * k) % 12), iv, +o2 || 0, k === 0 ? 'then around the circle of fifths' : undefined));
  } else if (id === 'progression') {
    /* o2: '' root position | 'smooth' each chord inverted to sit close to the one before | 'cycle' smooth, and then the whole progression in all twelve keys (round the circle of fourths) */
    const chs = (PIANO_PROGS[o1] || PIANO_PROGS.basic).chords, smooth = o2 === 'smooth' || o2 === 'cycle', mean = a => a.reduce((x, y) => x + y, 0) / a.length;
    let prev = null;
    for (let k = 0; k < (o2 === 'cycle' ? 12 : 1); k++) chs.forEach((c, j) => {
      const kpc = (pc + 5 * k) % 12, rt = pianoRoot((kpc + c[0]) % 12), ivs = PIANO_CHORDS[c[1]];
      let inv = 0, sh = 0;
      if (smooth && prev) {
        let best = 1e9;
        for (let n = 0; n < ivs.length; n++) [-12, 0, 12].forEach(h => { const m = mean(chordVoicing(rt + h, ivs, n)), cost = Math.abs(m - mean(prev)) + (m < 52 || m > 74 ? 20 : 0); if (cost < best - 1e-9) { best = cost; inv = n; sh = h; } });
      }
      const st = chord(rt + sh, ivs, inv, o2 === 'cycle' && j === 0 ? c[2] + ' · key of ' + NOTE_NAMES[kpc] : c[2]); steps.push(st); prev = st.notes;
    });
  } else if (id === 'ear') {
    for (let k = 0; k < 10; k++) {
      if (o1 === 'interval') { const base = 55 + Math.floor(rnd() * 15), d = 2 + Math.floor(rnd() * 8), t = base + d; steps.push(note(t, { ear: true, given: base, sound: [base, t], interval: d })); }
      else if (o1 === 'degree') { const d = pick([2, 4, 5, 7, 9, 11, 12], rnd), t = 60 + d; steps.push(note(t, { ear: true, given: 60, sound: [60, t], interval: d })); }   // C is the tonic, name the degree by ear
      else if (o1 === 'chord' || o1 === 'chordx') { const q = pick(o1 === 'chord' ? ['major', 'minor'] : ['major', 'minor', 'dim', 'aug', 'sus4'], rnd), c = chord(53 + Math.floor(rnd() * 12), PIANO_CHORDS[q], 0); c.ear = true; steps.push(c); }
      else { const t = 48 + Math.floor(rnd() * 37); steps.push(note(t, { ear: true, sound: [t] })); }
    }
  } else if (id === 'sequence') {
    /* o1: pattern, o2: scale. The pattern is played from every degree of the scale in turn, then the octave. A note never repeats the one before it. */
    const sc = PIANO_SCALES[o2] || PIANO_SCALES.major, pat = PIANO_PATTERNS[o1] || PIANO_PATTERNS.thirds, ms = [];
    for (let k = 0; k < sc.length; k++) pat.forEach(d => ms.push(root + degSemis(sc, k + d)));
    ms.push(root + 12);
    ms.forEach((m, i) => { if (!i || m !== ms[i - 1]) steps.push(note(m)); });
  } else if (id === 'intervals') {
    /* o1: semitones of the interval, or 'mix' for a random one each time. Both notes together, root first, round the circle of fifths. */
    for (let k = 0; k < 12; k++) {
      const d = o1 === 'mix' ? +pick(PIANO_INTERVALS, rnd) : +o1 || 7, rt = pianoRoot(o1 === 'mix' ? Math.floor(rnd() * 12) : (pc + 7 * k) % 12);
      steps.push({ kind: 'chord', notes: [rt, rt + d], name: noteName(rt) + ' + ' + intervalName(d), sub: 'both together' });
    }
  } else if (id === 'flash') {
    /* o1: white keys | notes of the chosen key | all keys; o2: one or two octaves. 16 random notes, never the same one twice running. */
    const oct = +o2 || 1, lo = oct === 2 ? 55 : 60, ok = o1 === 'all' ? () => true : o1 === 'key' ? m => PIANO_SCALES.major.includes(pcOf(m - pc)) : m => PIANO_SCALES.major.includes(pcOf(m)), pool = [];
    for (let m = lo; m <= lo + 12 * oct; m++) if (ok(m)) pool.push(m);
    for (let k = 0; k < 16; k++) { let m; do m = pick(pool, rnd); while (k && m === steps[k - 1].notes[0]); steps.push(note(m)); }
  }
  return steps;
}
/* Does a set of held notes match a chord step? Same pitch classes, and the same lowest note (so inversions count). */
function chordMatches(want, played) {
  if (!played.length) return false;
  const w = new Set(want.map(pcOf)), p = new Set(played.map(pcOf));
  if (w.size !== p.size || [...w].some(x => !p.has(x))) return false;
  return pcOf(Math.min.apply(null, want)) === pcOf(Math.min.apply(null, played));
}
/* rec: [{name, kind, target (midi, notes only), notes, ms, wrong: [{played:[midi], ...}] }] -> numbers and tips. */
function pianoSummary(rec) {
  const n = rec.length, first = rec.filter(r => !r.wrong.length).length, mistakes = rec.reduce((a, r) => a + r.wrong.length, 0);
  const ms = rec.map(r => r.ms).sort((a, b) => a - b), med = ms.length ? ms[Math.floor(ms.length / 2)] : 0;
  const tips = [], missed = {};
  rec.forEach(r => { if (r.wrong.length) missed[r.name] = (missed[r.name] || 0) + r.wrong.length; });
  const top = Object.keys(missed).sort((a, b) => missed[b] - missed[a]).slice(0, 3);
  if (top.length) tips.push('Most missed: ' + top.map(k => k + (missed[k] > 1 ? ' (' + missed[k] + ' times)' : '')).join(', ') + '. Play those slowly a few times on their own.');
  let semi = 0, oct = 0, inv = 0;
  rec.forEach(r => r.wrong.forEach(w => {
    if (r.kind === 'note' && w.played.length === 1) { const d = Math.abs(w.played[0] - r.target); if (d === 1) semi++; else if (d > 0 && d % 12 === 0) oct++; }
    if (r.kind === 'chord') { const a = new Set(r.notes.map(pcOf)), b = new Set(w.played.map(pcOf)); if (a.size === b.size && [...a].every(x => b.has(x)) && !chordMatches(r.notes, w.played)) inv++; }
  }));
  if (semi >= 2) tips.push('Several misses were one key away (' + semi + '). Check the sharps and flats of this key before you start, and say the notes as you play.');
  if (oct >= 1) tips.push('You found the right note in the wrong octave ' + oct + (oct > 1 ? ' times' : ' time') + '. Look at where your hand sits before moving on.');
  if (inv >= 1) tips.push('The right chord but the wrong lowest note ' + inv + (inv > 1 ? ' times' : ' time') + '. Check which note should be at the bottom for this inversion.');
  const slow = rec.filter(r => r.ms > Math.max(3000, med * 2.2)).slice(0, 3);
  if (slow.length) tips.push('You hesitated on ' + slow.map(r => r.name + ' (' + (r.ms / 1000).toFixed(1) + ' s)').join(', ') + '. Hesitations show where to practise slowly.');
  if (!tips.length) tips.push(n >= 8 && mistakes === 0 ? 'Clean run. Try the next key, two octaves, or a harder exercise.' : 'No clear weak spot. Do another key to build fluency.');
  return { steps: n, firstTry: first, firstTryPct: n ? Math.round(100 * first / n) : 0, mistakes, medianMs: med, tips };
}

/* ---- Exercise library: one catalog of every singing exercise and every piano preset ---- */
const LEVELS = ['', 'Beginner', 'Intermediate', 'Advanced'];
/* Singing exercises: [level, what it trains]. Anything not listed (the melodies) is Intermediate. */
const SING_META = {
  hold: [1, ['steady pitch', 'pitch accuracy']], holdlong: [1, ['breath control', 'steady pitch']], siren: [1, ['smooth glides', 'range']], glide5: [1, ['smooth glides']], glideslow: [2, ['breath control', 'smooth glides']],
  five: [1, ['warm-up', 'pitch accuracy']], arp: [1, ['chord tones', 'warm-up']], ladder: [2, ['range', 'warm-up']], arpm: [2, ['chord tones', 'minor']], arp7: [3, ['chord tones', 'sevenths']], chords: [2, ['chord tones', 'major vs minor']],
  vowels: [2, ['vowel consistency', 'steady pitch']], vowelscale: [2, ['vowel consistency', 'scales']],
  second: [2, ['intervals', 'small steps']], third: [1, ['intervals']], fourth: [2, ['intervals']], fifth: [2, ['intervals']], sixth: [3, ['intervals', 'leaps']], octave: [2, ['intervals', 'leaps']],
  major: [1, ['scales', 'pitch accuracy']], minor: [2, ['scales', 'minor']], harm: [3, ['scales', 'minor', 'leaps']], pentmaj: [1, ['scales', 'pentatonic']], pentmin: [1, ['scales', 'pentatonic', 'blues']], blues: [2, ['scales', 'blues']],
  dorian: [3, ['modes', 'ear']], mixo: [3, ['modes', 'ear']], whole: [3, ['ear', 'tuning']], chrom: [3, ['tuning', 'semitones']], drum: [2, ['pentatonic', 'play along']],
  'p-three': [1, ['small steps', 'warm-up']], 'p-three-m': [2, ['small steps', 'minor']], 'p-descend': [1, ['pitch accuracy', 'descending']], 'p-descend-m': [2, ['descending', 'minor']],
  'p-thirds': [2, ['intervals', 'scales']], 'p-thirds-m': [3, ['intervals', 'minor']], 'p-home': [2, ['pitch memory', 'intervals']], 'p-home-m': [3, ['pitch memory', 'minor']],
  'p-turn': [2, ['agility', 'small steps']], 'p-turn-m': [3, ['agility', 'minor']], 'p-leapback': [2, ['leaps', 'descending']], 'p-leapback-m': [3, ['leaps', 'minor']],
  'p-octdrop': [3, ['leaps', 'chord tones']], 'p-octdrop-m': [3, ['leaps', 'minor']], 'p-quick': [2, ['agility', 'chord tones']], 'p-quick-m': [3, ['agility', 'minor']],
  's-nay': [1, ['warm-up', 'placement']], 's-hum': [1, ['warm-up', 'placement']], 's-zee': [2, ['breath control', 'chord tones']], 's-vowelarp': [3, ['vowel consistency', 'chord tones']], 's-gee': [2, ['agility', 'staccato']],
  'd-taka': [2, ['diction', 'steady pitch']], 'd-paba': [2, ['diction', 'steady pitch']], 'd-ladana': [2, ['diction', 'agility']], 'd-mini': [1, ['diction', 'vowel consistency']], 'd-leather': [3, ['diction', 'agility']], 'd-peter': [3, ['diction', 'agility']],
  'r-walk': [2, ['ear', 'scales', 'new every time']], 'r-leaps': [3, ['intervals', 'leaps', 'new every time']], 'r-chord': [2, ['chord tones', 'new every time']]
};
/* Piano presets: an exercise type (px) with its options. Key is chosen when you start. */
const PIANO_LIB = [
  { id: 'scale-major', px: 'scale', o1: 'major', o2: '1', cat: 'Scales', level: 1, name: 'Major scale', desc: 'One octave up and down. Start in C, then move round the keys.', skills: ['scales', 'key signatures'] },
  { id: 'scale-major2', px: 'scale', o1: 'major', o2: '2', cat: 'Scales', level: 2, name: 'Major scale, two octaves', desc: 'Two octaves up and down. Watch your hand position at the turn.', skills: ['scales', 'hand position'] },
  { id: 'scale-pent', px: 'scale', o1: 'pent', o2: '1', cat: 'Scales', level: 1, name: 'Major pentatonic', desc: 'Five notes, no half steps. A friendly first scale in any key.', skills: ['scales', 'pentatonic'] },
  { id: 'scale-minor', px: 'scale', o1: 'minor', o2: '1', cat: 'Scales', level: 2, name: 'Natural minor scale', desc: 'One octave up and down.', skills: ['scales', 'minor'] },
  { id: 'scale-harm', px: 'scale', o1: 'harm', o2: '1', cat: 'Scales', level: 3, name: 'Harmonic minor scale', desc: 'The raised seventh makes a three-semitone gap.', skills: ['scales', 'minor'] },
  { id: 'arp-major', px: 'arpeggio', o1: 'major', o2: '1', cat: 'Arpeggios', level: 1, name: 'Major arpeggio', desc: 'The notes of a major chord one at a time, up and back down.', skills: ['chord tones', 'finger memory'] },
  { id: 'arp-minor', px: 'arpeggio', o1: 'minor', o2: '1', cat: 'Arpeggios', level: 2, name: 'Minor arpeggio', desc: 'The notes of a minor chord, up and back down.', skills: ['chord tones', 'minor'] },
  { id: 'arp-major2', px: 'arpeggio', o1: 'major', o2: '2', cat: 'Arpeggios', level: 3, name: 'Major arpeggio, two octaves', desc: 'Two octaves of broken chord. Smooth hand crossing is the goal.', skills: ['chord tones', 'hand position'] },
  { id: 'arp-dom7', px: 'arpeggio', o1: 'dom7', o2: '1', cat: 'Arpeggios', level: 3, name: 'Dominant 7th arpeggio', desc: 'Four notes with the bluesy flat seventh.', skills: ['sevenths'] },
  { id: 'arp-maj7', px: 'arpeggio', o1: 'maj7', o2: '1', cat: 'Arpeggios', level: 3, name: 'Major 7th arpeggio', desc: 'Four notes with the dreamy major seventh.', skills: ['sevenths'] },
  { id: 'ch-major', px: 'chords', o1: 'major', o2: '0', cat: 'Chords', level: 1, name: 'Major triads, root position', desc: 'Play a major chord in all twelve keys, round the circle of fifths.', skills: ['chords', 'all keys'] },
  { id: 'ch-minor', px: 'chords', o1: 'minor', o2: '0', cat: 'Chords', level: 1, name: 'Minor triads, root position', desc: 'A minor chord in all twelve keys.', skills: ['chords', 'minor'] },
  { id: 'ch-major1', px: 'chords', o1: 'major', o2: '1', cat: 'Chords', level: 2, name: 'Major triads, 1st inversion', desc: 'The third at the bottom. All twelve keys.', skills: ['inversions'] },
  { id: 'ch-major2', px: 'chords', o1: 'major', o2: '2', cat: 'Chords', level: 2, name: 'Major triads, 2nd inversion', desc: 'The fifth at the bottom. All twelve keys.', skills: ['inversions'] },
  { id: 'ch-majorall', px: 'chords', o1: 'major', o2: 'all', cat: 'Chords', level: 2, name: 'Every inversion of a major triad', desc: 'Root position, 1st and 2nd inversion in the key you choose.', skills: ['inversions'] },
  { id: 'ch-minorall', px: 'chords', o1: 'minor', o2: 'all', cat: 'Chords', level: 2, name: 'Every inversion of a minor triad', desc: 'Root position, 1st and 2nd inversion in the key you choose.', skills: ['inversions', 'minor'] },
  { id: 'ch-dim', px: 'chords', o1: 'dim', o2: '0', cat: 'Chords', level: 3, name: 'Diminished triads', desc: 'Two stacked minor thirds. Tense and unstable.', skills: ['chords', 'ear'] },
  { id: 'ch-dom7', px: 'chords', o1: 'dom7', o2: '0', cat: 'Chords', level: 3, name: 'Dominant 7th chords', desc: 'Four-note chords with the flat seventh, in all keys.', skills: ['sevenths'] },
  { id: 'ch-maj7', px: 'chords', o1: 'maj7', o2: '0', cat: 'Chords', level: 3, name: 'Major 7th chords', desc: 'Four-note chords with the major seventh, in all keys.', skills: ['sevenths'] },
  { id: 'ch-min7', px: 'chords', o1: 'min7', o2: '0', cat: 'Chords', level: 3, name: 'Minor 7th chords', desc: 'Four-note minor chords with the flat seventh, in all keys.', skills: ['sevenths', 'minor'] },
  { id: 'pr-basic', px: 'progression', o1: 'basic', o2: '', cat: 'Progressions', level: 1, name: 'I – IV – V – I', desc: 'The most common chord sequence in music, in any key.', skills: ['chord changes'] },
  { id: 'pr-pop', px: 'progression', o1: 'pop', o2: '', cat: 'Progressions', level: 1, name: 'I – V – vi – IV', desc: 'The pop progression behind hundreds of songs.', skills: ['chord changes'] },
  { id: 'pr-blues', px: 'progression', o1: 'blues', o2: '', cat: 'Progressions', level: 2, name: 'Blues changes', desc: 'The first six bars of a 12-bar blues, with seventh chords.', skills: ['chord changes', 'sevenths'] },
  { id: 'pr-jazz', px: 'progression', o1: 'jazz', o2: '', cat: 'Progressions', level: 3, name: 'ii – V – I', desc: 'The jazz cadence with seventh chords, in any key.', skills: ['chord changes', 'sevenths'] },
  { id: 'ear-note', px: 'ear', o1: 'note', o2: '', cat: 'Ear training', level: 1, name: 'Find the note', desc: 'Listen to a note, then find it on the keys. Ten notes.', skills: ['ear', 'keyboard geography'] },
  { id: 'ear-interval', px: 'ear', o1: 'interval', o2: '', cat: 'Ear training', level: 2, name: 'Find the interval', desc: 'You get the first note; play the second one you hear. It names the interval.', skills: ['ear', 'intervals'] }
];
/* More presets, generated from the tables above: a new scale, chord type, pattern, progression or interval only needs a row here. */
const preset = (id, px, o1, o2, cat, level, name, desc, skills) => ({ id, px, o1, o2, cat, level, name, desc, skills });
const cap = t => t[0].toUpperCase() + t.slice(1);
PIANO_LIB.push(...[].concat(
  /* scales: [key, level, description, skills] */
  [['dorian', 3, 'Minor with a bright sixth. Play it from D on white keys to hear the mode.', ['modes']], ['mixo', 3, 'Major with a flat seventh.', ['modes']], ['lydian', 3, 'Major with a raised fourth, a floating sound.', ['modes']],
   ['phrygian', 3, 'Minor with a flat second, the sound of flamenco.', ['modes']], ['pentmin', 1, 'Five notes. The backbone of blues and rock solos.', ['pentatonic', 'blues']],
   ['blues', 2, 'Minor pentatonic plus the blue note.', ['blues']], ['whole', 3, 'Six equal steps. No home note, so keep your place.', ['ear', 'hand position']],
   ['chrom', 2, 'Every key in turn, up and back down. Fingering and evenness.', ['finger independence']]]
    .map(x => preset('scale-' + x[0], 'scale', x[0], '1', 'Scales', x[1], PIANO_NAMES.scale[x[0]] + ' scale', x[2], ['scales'].concat(x[3]))),
  /* finger patterns: every pattern in major (level l) and natural minor (l+1) */
  [['fours', 1, 'Four-note runs'], ['fives', 1, 'Five-finger runs'], ['thirds', 2, 'Thirds'], ['broken', 2, 'Broken thirds'], ['triads', 2, 'Triads on every degree'], ['neighbour', 2, 'Turns'], ['zigzag', 3, 'Zigzag']]
    .reduce((a, x) => a.concat([['major', 0, 'major'], ['minor', 1, 'natural minor']].map(m => preset('seq-' + x[0] + (m[0] === 'minor' ? '-m' : ''), 'sequence', x[0], m[0], 'Patterns', Math.min(3, x[1] + m[1]), x[2] + ', ' + m[2],
      'The pattern from every note of the ' + m[2] + ' scale, climbing a step each time. The classic finger exercise.', ['finger independence', 'scales']))), []),
  /* chord types in all twelve keys */
  [['sus2', 2, 'Suspended 2nd chords', 'Root, second and fifth. Open and unresolved.'], ['sus4', 2, 'Suspended 4th chords', 'Root, fourth and fifth. They want to resolve to major.'], ['aug', 3, 'Augmented triads', 'Two stacked major thirds. Only four different chords exist.'],
   ['dim7', 3, 'Diminished 7th chords', 'Three stacked minor thirds. Every note could be the root.'], ['m7b5', 3, 'Half-diminished 7th chords', 'The ii chord of a minor ii–V–I.']]
    .map(x => preset('ch-' + x[0], 'chords', x[0], '0', 'Chords', x[1], x[2], x[3] + ' All twelve keys.', ['chords', 'all keys'])),
  [['sus4', 2, 'Suspended arpeggio'], ['dim', 3, 'Diminished arpeggio'], ['min7', 3, 'Minor 7th arpeggio'], ['m7b5', 3, 'Half-diminished arpeggio'], ['dim7', 3, 'Diminished 7th arpeggio']]
    .map(x => preset('arp-' + x[0], 'arpeggio', x[0], '1', 'Arpeggios', x[1], x[2], 'The notes of the chord one at a time, up and back down.', ['chord tones'])),
  /* progressions: [key, voicing, level, name, description] */
  [['fifties', '', 1, 'I – vi – IV – V', 'The doo-wop progression.'], ['sad', '', 1, 'vi – IV – I – V', 'The pop progression starting on the minor chord.'], ['canon', '', 2, 'Canon progression', 'Eight chords: I V vi iii IV I IV V.'],
   ['rock', '', 1, 'I – ♭VII – IV – I', 'The rock cadence: a major chord a whole step below the key.'], ['minor', '', 2, 'i – iv – V – i', 'The minor cadence with a major dominant.'], ['andalusian', '', 2, 'Andalusian cadence', 'i – ♭VII – ♭VI – V, a descending flamenco line.'],
   ['jazzminor', '', 3, 'Minor ii – V – i', 'Half-diminished, dominant and minor seventh chords.'], ['blues12', '', 3, 'Full 12-bar blues', 'All twelve bars with seventh chords.'],
   ['diatonic', '', 2, 'Every triad of the key', 'I ii iii IV V vi vii° I: the seven chords built on the major scale.'], ['diatonic7', '', 3, 'Every seventh chord of the key', 'The seven seventh chords built on the major scale.'],
   ['basic', 'smooth', 2, 'I – IV – V – I, smooth voicing', 'Each chord is inverted to move as little as possible from the last one.'], ['pop', 'smooth', 2, 'I – V – vi – IV, smooth voicing', 'Pop chords with close voice leading, like a pianist would play them.'],
   ['jazz', 'smooth', 3, 'ii – V – I, smooth voicing', 'Seventh chords with the smallest possible movement.'], ['jazz', 'cycle', 3, 'ii – V – I in all 12 keys', 'The jazz cadence in every key, round the circle of fourths, with smooth voicing.'],
   ['basic', 'cycle', 3, 'I – IV – V – I in all 12 keys', 'The cadence in every key, round the circle of fourths.']]
    .map(x => preset('pr-' + x[0] + (x[1] ? '-' + x[1] : ''), 'progression', x[0], x[1], 'Progressions', x[2], x[3], x[4], ['chord changes'].concat(x[1] ? ['voice leading'] : []))),
  /* intervals played together */
  PIANO_INTERVALS.map(d => preset('iv-' + d, 'intervals', d, '', 'Intervals', +d === 7 || +d === 12 || +d === 4 ? 1 : 2, 'Play the ' + intervalName(+d), 'Both notes at once, from every root round the circle of fifths.', ['intervals'])),
  [preset('iv-mix', 'intervals', 'mix', '', 'Intervals', 3, 'Mixed intervals', 'A random interval above a random note each time. Know the shape under your fingers.', ['intervals', 'keyboard geography'])],
  /* reading and note finding */
  [preset('fl-white', 'flash', 'white', '1', 'Note finding', 1, 'Note flash, white keys', 'Sixteen random white keys around middle C. Name and find them fast.', ['keyboard geography']),
   preset('fl-white2', 'flash', 'white', '2', 'Note finding', 2, 'Note flash, two octaves', 'Sixteen random white keys over two octaves.', ['keyboard geography']),
   preset('fl-key', 'flash', 'key', '1', 'Note finding', 2, 'Note flash in a key', 'Random notes of the key you choose. Sharps and flats included.', ['key signatures', 'keyboard geography']),
   preset('fl-all', 'flash', 'all', '1', 'Note finding', 2, 'Note flash, every key', 'Sixteen random notes, black keys too.', ['keyboard geography']),
   preset('fl-all2', 'flash', 'all', '2', 'Note finding', 3, 'Note flash, every key, two octaves', 'Sixteen random notes over two octaves.', ['keyboard geography'])],
  /* ear */
  [preset('ear-degree', 'ear', 'degree', '', 'Ear training', 2, 'Find the scale degree', 'C is home. Hear a note of the C major scale and play it.', ['ear', 'scale degrees']),
   preset('ear-chord', 'ear', 'chord', '', 'Ear training', 2, 'Find the chord: major or minor', 'Listen to a triad and play it back. Is it bright or dark?', ['ear', 'major vs minor']),
   preset('ear-chordx', 'ear', 'chordx', '', 'Ear training', 3, 'Find the chord: five types', 'Major, minor, diminished, augmented or suspended. Listen, then play it.', ['ear', 'chords'])]
));
/* Menus of the piano screen: the choices for the first and second option of each exercise type. */
const PIANO_OPTS = (() => {
  const L = o => Object.keys(o).map(k => [k, o[k]]), oct = [['1', 'One octave'], ['2', 'Two octaves']];
  return {
    scale: { o1: L(PIANO_NAMES.scale), o2: oct },
    arpeggio: { o1: L(PIANO_NAMES.chord), o2: oct },
    chords: { o1: L(PIANO_NAMES.chord), o2: [['0', 'Root position, all keys'], ['1', '1st inversion, all keys'], ['2', '2nd inversion, all keys'], ['all', 'All inversions, this key']] },
    progression: { o1: Object.keys(PIANO_PROGS).map(k => [k, PIANO_PROGS[k].label]), o2: [['', 'Root position'], ['smooth', 'Smooth voice leading'], ['cycle', 'All 12 keys, smooth']] },
    sequence: { o1: L(PIANO_NAMES.pattern), o2: L(PIANO_NAMES.scale) },
    intervals: { o1: PIANO_INTERVALS.map(d => [d, cap(intervalName(+d))]).concat([['mix', 'Mixed, random']]), o2: [] },
    flash: { o1: [['white', 'White keys'], ['key', 'Notes of the chosen key'], ['all', 'All keys']], o2: oct },
    ear: { o1: [['note', 'Single notes'], ['interval', 'Intervals'], ['degree', 'Scale degrees (C is home)'], ['chord', 'Major or minor chords'], ['chordx', 'Five chord types']], o2: [] }
  };
})();
function libraryItems() {
  const sing = EXERCISES.map(e => { const m = SING_META[e.id] || [2, e.group === 'Melodies' ? ['melody', 'rhythm'] : []]; return { id: 's:' + e.id, kind: 'sing', ex: e.id, name: e.name, desc: e.desc, cat: e.group, level: m[0], skills: m[1] }; });
  const piano = PIANO_LIB.map(p => ({ id: 'p:' + p.id, kind: 'piano', px: p.px, o1: p.o1, o2: p.o2, name: p.name, desc: p.desc, cat: p.cat, level: p.level, skills: p.skills }));
  return sing.concat(piano);
}
/* f: {q, kind: all|sing|piano, level: 0-3, cat, fav (only favourites), favs: [ids]} */
function libraryFilter(items, f) {
  const q = (f.q || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  return items.filter(it => {
    if (f.kind && f.kind !== 'all' && it.kind !== f.kind) return false;
    if (f.level && it.level !== +f.level) return false;
    if (f.cat && it.cat !== f.cat) return false;
    if (f.fav && !(f.favs || []).includes(it.id)) return false;
    const hay = (it.name + ' ' + it.desc + ' ' + it.cat + ' ' + it.skills.join(' ') + ' ' + (it.kind === 'sing' ? 'singing voice sing' : 'piano keys keyboard play')).toLowerCase();
    return q.every(w => hay.includes(w));
  });
}

