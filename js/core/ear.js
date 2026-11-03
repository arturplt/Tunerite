"use strict";
/* ---- Ear training: the curriculum and the question maker. Pure functions, no audio and no DOM, so they can be tested.
   Eight units of levels, each a drill of ten questions. 80% passes a level and opens the next; 90% earns a second star, 100% a third.
   A question is { prompt, sub, options: [{ id, label, hint }], answer (an id) or seq (ids, tapped in order), events, explain }.
   events are { t, d, n: [midi...] } in seconds, ready to schedule: a cadence or reference first where the drill needs a key. ---- */
const EAR = {
  PASS: 0.8, STARS: [0.8, 0.9, 1],
  IVL: {
    1: ['Minor 2nd', 'the Jaws theme'], 2: ['Major 2nd', 'the start of Happy Birthday'], 3: ['Minor 3rd', 'the start of Greensleeves'], 4: ['Major 3rd', 'When the Saints Go Marching In'],
    5: ['Perfect 4th', 'Here Comes the Bride'], 6: ['Tritone', 'the Simpsons theme'], 7: ['Perfect 5th', 'Twinkle Twinkle Little Star'], 8: ['Minor 6th', 'The Entertainer'],
    9: ['Major 6th', 'My Bonnie Lies Over the Ocean'], 10: ['Minor 7th', 'Somewhere, from West Side Story'], 11: ['Major 7th', 'Take On Me'], 12: ['Octave', 'Somewhere Over the Rainbow']
  },
  CHORDS: {
    maj: ['Major', [0, 4, 7], 'bright and happy'], min: ['Minor', [0, 3, 7], 'darker, a little sad'], dim: ['Diminished', [0, 3, 6], 'tense and unstable'], aug: ['Augmented', [0, 4, 8], 'dreamy, going nowhere'],
    sus2: ['Sus 2', [0, 2, 7], 'open and floating'], sus4: ['Sus 4', [0, 5, 7], 'open, wants to resolve'], maj7: ['Major 7th', [0, 4, 7, 11], 'smooth and jazzy'], dom7: ['Dominant 7th', [0, 4, 7, 10], 'bluesy, wants to resolve'],
    min7: ['Minor 7th', [0, 3, 7, 10], 'mellow'], hdim: ['Half-diminished', [0, 3, 6, 10], 'dark and unsettled']
  },
  SCALES: {
    major: ['Major', [0, 2, 4, 5, 7, 9, 11], 'bright, the do-re-mi scale'], minor: ['Natural minor', [0, 2, 3, 5, 7, 8, 10], 'sad and serious'], harm: ['Harmonic minor', [0, 2, 3, 5, 7, 8, 11], 'minor with an exotic leap near the top'],
    dorian: ['Dorian', [0, 2, 3, 5, 7, 9, 10], 'minor with a bright 6th, funky'], mixo: ['Mixolydian', [0, 2, 4, 5, 7, 9, 10], 'major with a flat 7th, rock and blues'], lydian: ['Lydian', [0, 2, 4, 6, 7, 9, 11], 'major with a raised 4th, dreamy'],
    phryg: ['Phrygian', [0, 1, 3, 5, 7, 8, 10], 'minor with a flat 2nd, Spanish'], pentmaj: ['Major pentatonic', [0, 2, 4, 7, 9], 'five notes, open and folky'], pentmin: ['Minor pentatonic', [0, 3, 5, 7, 10], 'five notes, rock guitar'],
    blues: ['Blues', [0, 3, 5, 6, 7, 10], 'minor pentatonic plus the blue note']
  },
  /* Chords for the progression drills: a root (semitones above the key) and a quality of CHORDS. */
  RN: { I: [0, 'maj'], ii: [2, 'min'], iii: [4, 'min'], IV: [5, 'maj'], V: [7, 'maj'], vi: [9, 'min'], i: [0, 'min'], iv: [5, 'min'], III: [3, 'maj'], VI: [8, 'maj'], VII: [10, 'maj'] },
  DEG_MAJ: ['1', '♭2', '2', '♭3', '3', '4', '♯4', '5', '♭6', '6', '♭7', '7'],
  NAMES: ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'],
  UNITS: [], LEVELS: [],
  /* The curriculum. type picks the question maker; cfg is its settings. */
  build() {
    const U = [];
    const unit = (id, title, blurb, levels) => U.push({ id, title, blurb, levels: levels.map((l, i) => Object.assign({ unit: id, id: id + 'l' + (i + 1), n: 10 }, l)) });
    unit('u1', 'Higher or lower', 'Start here: is the second note above or below the first? Trains the most basic thing an ear does.', [
      { title: 'Far apart', desc: 'Two notes a fifth to an octave apart.', type: 'cmp', cfg: { gaps: [7, 8, 9, 10, 11, 12] } },
      { title: 'Closer', desc: 'A minor third up to a fourth.', type: 'cmp', cfg: { gaps: [3, 4, 5] } },
      { title: 'Neighbours', desc: 'One or two semitones apart. Listen closely.', type: 'cmp', cfg: { gaps: [1, 2] } }]);
    unit('u2', 'Intervals', 'The distance between two notes has a sound of its own. Each interval comes with a song to hang it on.', [
      { title: 'Fifths and octaves', desc: 'The two widest, most open sounds.', type: 'ivl', cfg: { set: [7, 12], mode: 'asc' } },
      { title: 'Add fourths and thirds', desc: 'Perfect 4th, major 3rd and perfect 5th.', type: 'ivl', cfg: { set: [4, 5, 7], mode: 'asc' } },
      { title: 'Major or minor third', desc: 'The two thirds, plus fourth and fifth.', type: 'ivl', cfg: { set: [3, 4, 5, 7], mode: 'asc' } },
      { title: 'Steps and thirds', desc: 'Major 2nd up to the octave.', type: 'ivl', cfg: { set: [2, 3, 4, 5, 7, 12], mode: 'asc' } },
      { title: 'Every interval going up', desc: 'All twelve, from minor 2nd to octave.', type: 'ivl', cfg: { set: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], mode: 'asc' } },
      { title: 'Going down', desc: 'The same intervals, but the second note is lower.', type: 'ivl', cfg: { set: [2, 3, 4, 5, 7, 8, 9, 12], mode: 'desc' } },
      { title: 'Played together', desc: 'Both notes at once: thirds, sixths, fourths, fifths, octaves.', type: 'ivl', cfg: { set: [3, 4, 5, 7, 8, 9, 12], mode: 'harm' } },
      { title: 'Everything mixed', desc: 'Any interval, up, down or together.', type: 'ivl', cfg: { set: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], mode: 'mix' } }]);
    unit('u3', 'Chord colours', 'Every chord has a mood. Learn to hear it before you can name the notes.', [
      { title: 'Major or minor', desc: 'Happy or sad, played as a block.', type: 'chq', cfg: { set: ['maj', 'min'], mode: 'block' } },
      { title: 'Spread out', desc: 'Major and minor, but the notes come one after another.', type: 'chq', cfg: { set: ['maj', 'min'], mode: 'arp' } },
      { title: 'Diminished and augmented', desc: 'The two unstable triads join in.', type: 'chq', cfg: { set: ['maj', 'min', 'dim', 'aug'], mode: 'block' } },
      { title: 'Suspended chords', desc: 'Sus 2 and sus 4 with major and minor.', type: 'chq', cfg: { set: ['maj', 'min', 'sus2', 'sus4'], mode: 'block' } },
      { title: 'Seventh chords', desc: 'Major 7th, dominant 7th, minor 7th and half-diminished.', type: 'chq', cfg: { set: ['maj7', 'dom7', 'min7', 'hdim'], mode: 'block' } }]);
    unit('u4', 'Scales and modes', 'Hear the whole mood of a scale as it climbs.', [
      { title: 'Major or minor scale', desc: 'The two everyday scales.', type: 'scl', cfg: { set: ['major', 'minor'] } },
      { title: 'Three minors and a major', desc: 'Natural and harmonic minor against major.', type: 'scl', cfg: { set: ['major', 'minor', 'harm'] } },
      { title: 'The modes', desc: 'Dorian, Mixolydian, Lydian and Phrygian, with major and minor.', type: 'scl', cfg: { set: ['major', 'minor', 'dorian', 'mixo', 'lydian', 'phryg'] } },
      { title: 'Five and six notes', desc: 'The pentatonic scales and the blues scale.', type: 'scl', cfg: { set: ['pentmaj', 'pentmin', 'blues', 'major', 'minor'] } }]);
    unit('u5', 'Scale degrees', 'In a key, every note has a role. First you hear the key, then one note: which degree is it?', [
      { title: '1 and 5', desc: 'Home and its strongest neighbour.', type: 'deg', cfg: { degs: [0, 7], minor: false } },
      { title: '1, 3 and 5', desc: 'The notes of the tonic chord.', type: 'deg', cfg: { degs: [0, 4, 7], minor: false } },
      { title: 'Degrees 1 to 5', desc: 'The first five notes of the major scale.', type: 'deg', cfg: { degs: [0, 2, 4, 5, 7], minor: false } },
      { title: 'The whole major scale', desc: 'Degrees 1 to 7.', type: 'deg', cfg: { degs: [0, 2, 4, 5, 7, 9, 11], minor: false } },
      { title: 'In a minor key', desc: 'Degrees 1 to 7 of the natural minor scale.', type: 'deg', cfg: { degs: [0, 2, 3, 5, 7, 8, 10], minor: true } },
      { title: 'All twelve notes', desc: 'Including the notes outside the scale.', type: 'deg', cfg: { degs: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], minor: false } }]);
    unit('u6', 'Progressions', 'Chords in a row tell a story. Learn the common ones by how they move.', [
      { title: 'Two classics', desc: 'I–IV–V–I against I–V–vi–IV.', type: 'prog', cfg: { set: ['I IV V I', 'I V vi IV'], minor: false } },
      { title: 'Five in a major key', desc: 'Add I–vi–IV–V, ii–V–I and I–IV–I–V.', type: 'prog', cfg: { set: ['I IV V I', 'I V vi IV', 'I vi IV V', 'ii V I', 'I IV I V'], minor: false } },
      { title: 'In a minor key', desc: 'i–iv–V–i, i–VI–III–VII and i–VII–VI–V.', type: 'prog', cfg: { set: ['i iv V i', 'i VI III VII', 'i VII VI V'], minor: true } }]);
    unit('u7', 'Melodies', 'Hear a short tune and tap the scale degrees in order.', [
      { title: 'Three notes, up to 5', desc: 'Degrees 1 to 5, three notes long.', type: 'mel', cfg: { degs: [0, 2, 4, 5, 7], len: 3 }, n: 8 },
      { title: 'Three notes, the full scale', desc: 'Degrees 1 to 7.', type: 'mel', cfg: { degs: [0, 2, 4, 5, 7, 9, 11], len: 3 }, n: 8 },
      { title: 'Four notes', desc: 'Four notes, any degree.', type: 'mel', cfg: { degs: [0, 2, 4, 5, 7, 9, 11], len: 4 }, n: 8 },
      { title: 'Five notes', desc: 'A short phrase to write down by ear.', type: 'mel', cfg: { degs: [0, 2, 4, 5, 7, 9, 11], len: 5 }, n: 8 }]);
    unit('u8', 'Note names', 'The last step: name the note itself, with only middle C to go on.', [
      { title: 'C or G', desc: 'Two notes against the C you are given.', type: 'nm', cfg: { pcs: [0, 7] } },
      { title: 'C D E F G', desc: 'Five white notes.', type: 'nm', cfg: { pcs: [0, 2, 4, 5, 7] } },
      { title: 'All the white notes', desc: 'C to B.', type: 'nm', cfg: { pcs: [0, 2, 4, 5, 7, 9, 11] } },
      { title: 'All twelve', desc: 'Every note, sharps included.', type: 'nm', cfg: { pcs: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] } }]);
    this.UNITS = U; this.LEVELS = [].concat(...U.map(u => u.levels)); this.LEVELS.forEach((l, i) => { l.i = i; });
    return this;
  },
  level(id) { return this.LEVELS.find(l => l.id === id); },
  unitOf(l) { return this.UNITS.find(u => u.id === l.unit); },
  /* How many stars a score earns: 0 below a pass, then 1 to 3. */
  stars(pct) { let s = 0; this.STARS.forEach(t => { if (pct >= t - 1e-9) s++; }); return s; },
  /* progress: { levelId: { best, stars, tries } }. The first level is always open; the others open when the one before has a star. */
  unlocked(progress, id) { const l = this.level(id); if (!l) return false; if (l.i === 0) return true; const p = progress[this.LEVELS[l.i - 1].id]; return !!(p && p.stars >= 1); },
  /* The level to carry on with: the first open level without a star, or the last one when everything is done. */
  next(progress) { return this.LEVELS.find(l => this.unlocked(progress, l.id) && !(progress[l.id] && progress[l.id].stars >= 1)) || this.LEVELS[this.LEVELS.length - 1]; },
  /* ---- question makers ---- */
  pick(rnd, list) { return list[Math.floor(rnd() * list.length)]; },
  chordNotes(root, q) { return this.CHORDS[q][1].map(i => root + i); },
  /* the key context: a cadence in the key, then a short pause. Returns events and the time at which the drill starts. */
  cadence(root, minor) {
    const ch = minor ? [['i'], ['iv'], ['V'], ['i']] : [['I'], ['IV'], ['V'], ['I']], ev = []; let t = 0;
    ch.forEach(c => { ev.push({ t, d: 0.62, n: this.rnChord(root, c[0]) }); t += 0.6; });
    return { ev, t: t + 0.7 };
  },
  /* the notes of a roman-numeral chord in a key, close position around the middle of the keyboard */
  rnChord(key, rn) {
    const [off, q] = this.RN[rn], r = 48 + ((key + off) % 12);
    return this.chordNotes(r, q);
  },
  make(level, rnd, prev) {
    rnd = rnd || Math.random; const f = this['q_' + level.type]; let q, tries = 0;
    do { q = f.call(this, level.cfg, rnd); tries++; } while (prev && q.key === prev.key && tries < 8);
    return q;
  },
  q_cmp(c, rnd) {
    const gap = this.pick(rnd, c.gaps), up = rnd() < 0.5, a = 52 + Math.floor(rnd() * 20), b = up ? a + gap : a - gap;
    return { key: a + ':' + b, prompt: 'Is the second note higher or lower?', sub: 'Two notes, one after the other.', options: [{ id: 'hi', label: 'Higher' }, { id: 'lo', label: 'Lower' }], answer: up ? 'hi' : 'lo',
      events: [{ t: 0, d: 0.8, n: [a] }, { t: 0.9, d: 0.9, n: [b] }], explain: 'The second note was ' + (up ? 'higher' : 'lower') + ', ' + gap + (gap === 1 ? ' semitone' : ' semitones') + ' away.' };
  },
  q_ivl(c, rnd) {
    let mode = c.mode; if (mode === 'mix') mode = this.pick(rnd, ['asc', 'desc', 'harm']);
    const s = this.pick(rnd, c.set), a = 50 + Math.floor(rnd() * 16), top = a + s;
    const ev = mode === 'asc' ? [{ t: 0, d: 0.8, n: [a] }, { t: 0.9, d: 1, n: [top] }] : mode === 'desc' ? [{ t: 0, d: 0.8, n: [top] }, { t: 0.9, d: 1, n: [a] }] : [{ t: 0, d: 1.6, n: [a, top] }];
    const sub = mode === 'asc' ? 'Two notes, going up.' : mode === 'desc' ? 'Two notes, going down.' : 'Two notes at the same time.';
    const hint = mode === 'asc' ? ' Going up it sounds like ' + this.IVL[s][1] + '.' : '';
    return { key: mode + ':' + a + ':' + s, prompt: 'Which interval is it?', sub, options: c.set.map(i => ({ id: String(i), label: this.IVL[i][0], hint: this.IVL[i][1] })), answer: String(s), events: ev, explain: 'That was a ' + this.IVL[s][0].toLowerCase() + '.' + hint };
  },
  q_chq(c, rnd) {
    const q = this.pick(rnd, c.set), r = 48 + Math.floor(rnd() * 14), notes = this.chordNotes(r, q);
    const ev = c.mode === 'arp' ? notes.map((m, i) => ({ t: i * 0.38, d: 1.4 - i * 0.2, n: [m] })).concat([{ t: notes.length * 0.38 + 0.15, d: 1.6, n: notes }]) : [{ t: 0, d: 1.8, n: notes }];
    return { key: q + ':' + r, prompt: 'What kind of chord is it?', sub: c.mode === 'arp' ? 'The notes come one at a time, then together.' : 'All the notes at once.', options: c.set.map(k => ({ id: k, label: this.CHORDS[k][0], hint: this.CHORDS[k][2] })), answer: q, events: ev, explain: 'That was a ' + this.CHORDS[q][0].toLowerCase() + ' chord: ' + this.CHORDS[q][2] + '.' };
  },
  q_scl(c, rnd) {
    const k = this.pick(rnd, c.set), r = 48 + Math.floor(rnd() * 12), iv = this.SCALES[k][1].concat([12]), ev = iv.map((i, n) => ({ t: n * 0.4, d: 0.5, n: [r + i] }));
    return { key: k + ':' + r, prompt: 'Which scale is it?', sub: 'Played upward, one note at a time.', options: c.set.map(s => ({ id: s, label: this.SCALES[s][0], hint: this.SCALES[s][2] })), answer: k, events: ev, explain: 'That was ' + this.SCALES[k][0] + ': ' + this.SCALES[k][2] + '.' };
  },
  /* the label of a pitch class relative to the key */
  degLabel(pc) { return this.DEG_MAJ[pc]; },
  q_deg(c, rnd) {
    const key = Math.floor(rnd() * 12), d = this.pick(rnd, c.degs), cad = this.cadence(key, c.minor), tgt = 60 + ((key + d) % 12);      // the target stays in the octave above middle C
    const ev = cad.ev.concat([{ t: cad.t, d: 1.4, n: [tgt] }]);
    return { key: key + ':' + d, prompt: 'Which scale degree is it?', sub: 'First the key, then one note.', options: c.degs.map(x => ({ id: String(x), label: this.degLabel(x) })), answer: String(d), events: ev, explain: 'That was degree ' + this.degLabel(d) + ' of the key.' };
  },
  q_prog(c, rnd) {
    const key = Math.floor(rnd() * 12), s = this.pick(rnd, c.set), ev = []; let t = 0;
    const cad = this.cadence(key, c.minor); cad.ev.forEach(e => ev.push(e)); t = cad.t;
    s.split(' ').forEach(rn => { ev.push({ t, d: 0.95, n: this.rnChord(key, rn) }); t += 0.9; });
    return { key: key + ':' + s, prompt: 'Which progression is it?', sub: 'The key first, then the chords.', options: c.set.map(x => ({ id: x, label: x.replace(/ /g, '–') })), answer: s, events: ev, explain: 'That was ' + s.replace(/ /g, '–') + '.' };
  },
  q_mel(c, rnd) {
    const key = Math.floor(rnd() * 12), cad = this.cadence(key, false), seq = []; let idx = Math.floor(rnd() * c.degs.length);
    for (let i = 0; i < c.len; i++) { seq.push(c.degs[idx]); const st = this.pick(rnd, [-3, -2, -1, 1, 2, 3]); idx = idx + st >= 0 && idx + st < c.degs.length ? idx + st : Math.max(0, Math.min(c.degs.length - 1, idx - st)); }      // a step or a small leap, never the same note twice in a row
    const ev = cad.ev.concat(seq.map((d, i) => ({ t: cad.t + i * 0.6, d: 0.7, n: [60 + ((key + d) % 12)] })));
    return { key: key + ':' + seq.join(','), prompt: 'Tap the notes in order', sub: 'Which scale degrees did you hear? ' + c.len + ' notes.', options: c.degs.map(x => ({ id: String(x), label: this.degLabel(x) })), seq: seq.map(String), events: ev, explain: 'That was ' + seq.map(d => this.degLabel(d)).join(' ') + '.' };
  },
  q_nm(c, rnd) {
    const pc = this.pick(rnd, c.pcs), oct = rnd() < 0.5 ? 60 : 72, tgt = oct + pc, ev = [{ t: 0, d: 1.2, n: [60] }, { t: 1.5, d: 1.4, n: [tgt] }];
    return { key: pc + ':' + oct, prompt: 'Which note is the second one?', sub: 'The first note is C.', options: c.pcs.map(p => ({ id: String(p), label: this.NAMES[p] })), answer: String(pc), events: ev, explain: 'That was ' + this.NAMES[pc] + '.' };
  }
}.build();
