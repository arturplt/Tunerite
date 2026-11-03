"use strict";
/* ---- Practice courses for singing, whistling and piano: the same idea as the Ear course. Units of levels; a level is an exercise you perform and the app scores.
   Singing and whistling score 0-100 from the pitch (70 passes, 85 and 95 earn more stars); piano scores the percent of steps right the first time (80, 90, 100).
   A level opens when the one before it has a star. Pure data and functions, no DOM, so they can be tested.
   A sing/whistle level is { ex } (an id in EXERCISES); a piano level is { px, o1, o2, key } (a PIANO_OPTS exercise with its two choices, key 0-11). ---- */
const COURSE = {
  KINDS: {
    sing: { name: 'Singing', ico: '🎤', thr: [70, 85, 95], what: 'score' },
    whistle: { name: 'Whistling', ico: '😗', thr: [70, 85, 95], what: 'score' },
    piano: { name: 'Piano', ico: '🎹', thr: [80, 90, 100], what: 'right first time' }
  },
  UNITS: {}, LEVELS: {},
  build() {
    const make = (kind, prefix, defs) => {
      const U = [];
      defs.forEach((d, n) => U.push({ id: prefix + (n + 1), title: d[0], blurb: d[1], levels: d[2].map((l, i) => Object.assign({ kind, unit: prefix + (n + 1), id: prefix + (n + 1) + 'l' + (i + 1) }, l)) }));
      this.UNITS[kind] = U; this.LEVELS[kind] = [].concat(...U.map(u => u.levels)); this.LEVELS[kind].forEach((l, i) => { l.i = i; });
    };
    /* a sing/whistle level: exercise id, then a title; the description is the exercise's own unless one is given */
    const E = (ex, title, desc) => ({ ex, title, desc: desc || (EXERCISES.find(e => e.id === ex) || {}).desc || '' });
    /* a piano level: exercise type, its two choices, the key (C = 0), a title and a description */
    const P = (px, o1, o2, key, title, desc) => ({ px, o1, o2, key, title, desc });
    make('sing', 's', [
      ['Find your voice', 'Single notes and smooth slides. Steady and in tune matters more than anything else.', [
        E('hold', 'Match a held note'), E('holdlong', 'Long tone'), E('glide5', 'Fifth glide'), E('siren', 'Siren'), E('glideslow', 'Slow siren')]],
      ['Warm-ups', 'The classic first exercises, on syllables that help you find the pitch.', [
        E('five', 'Five-note scale'), E('s-hum', 'Humming scale'), E('s-nay', 'Nay-nay scale'), E('arp', 'Arpeggio'), E('ladder', 'Semitone ladder')]],
      ['Scales', 'One octave up and down, centred in your range.', [
        E('major', 'Major scale'), E('pentmaj', 'Major pentatonic'), E('minor', 'Natural minor'), E('pentmin', 'Minor pentatonic'), E('blues', 'Blues scale'),
        E('harm', 'Harmonic minor'), E('dorian', 'Dorian mode'), E('mixo', 'Mixolydian mode'), E('whole', 'Whole-tone scale'), E('chrom', 'Chromatic scale')]],
      ['Intervals', 'Hear the jump in your head, then sing it.', [
        E('third', 'Thirds'), E('fifth', 'Fifths'), E('octave', 'Octaves'), E('second', 'Seconds'), E('fourth', 'Fourths'), E('sixth', 'Sixths')]],
      ['Chords', 'The notes of a chord, one after another.', [
        E('arpm', 'Minor arpeggio'), E('chords', 'Major, minor, major'), E('arp7', 'Dominant seventh'), E('r-chord', 'Random chord tones')]],
      ['Patterns', 'Short shapes that climb or fall, each a step higher. They build agility and pitch memory.', [
        E('p-three', 'Three-note steps'), E('p-descend', 'Five down'), E('p-home', 'Home base'), E('p-turn', 'Neighbour turn'), E('p-thirds', 'Scale in thirds'),
        E('p-leapback', 'Leap and walk down'), E('p-octdrop', 'Octave drop'), E('p-quick', 'Quick arpeggios')]],
      ['Patterns in minor', 'The same shapes with the darker minor scale.', [
        E('p-three-m', 'Three-note steps, minor'), E('p-descend-m', 'Five down, minor'), E('p-home-m', 'Home base, minor'), E('p-thirds-m', 'Scale in thirds, minor'), E('p-leapback-m', 'Leap and walk down, minor')]],
      ['Words and vowels', 'Keep the pitch steady while the mouth changes shape and the consonants fly.', [
        E('vowels', 'Vowels on one note'), E('vowelscale', 'Vowel scale'), E('s-zee', 'Zee arpeggio'), E('s-vowelarp', 'Vowel arpeggios'), E('s-gee', 'Gee-gee staccato'),
        E('d-mini', 'Mi-ni-mi-no'), E('d-ladana', 'La-da-na-ta scale'), E('d-taka', 'Ta-ka-ta-ka'), E('d-paba', 'Pa-ba lips'), E('d-leather', 'Red leather'), E('d-peter', 'Peter Piper')]],
      ['Tunes and surprises', 'Real melodies, and tunes that are new every time you play.', [
        E('mel-twinkle', 'Twinkle, Twinkle'), E('mel-frere', 'Frère Jacques'), E('mel-ode', 'Ode to Joy'), E('r-walk', 'Random melody'), E('r-leaps', 'Random leaps')]]
    ]);
    make('whistle', 'w', [
      ['First whistles', 'Clean single notes and slides. Whistling is steady by nature: aim for a pure, even tone.', [
        E('hold', 'Match a held note'), E('holdlong', 'Long tone'), E('glide5', 'Fifth glide'), E('siren', 'Siren'), E('glideslow', 'Slow siren')]],
      ['Warm-ups', 'The classic first shapes.', [
        E('five', 'Five-note scale'), E('arp', 'Arpeggio'), E('ladder', 'Semitone ladder'), E('arpm', 'Minor arpeggio')]],
      ['Scales', 'One octave up and down.', [
        E('major', 'Major scale'), E('pentmaj', 'Major pentatonic'), E('minor', 'Natural minor'), E('pentmin', 'Minor pentatonic'), E('blues', 'Blues scale'), E('dorian', 'Dorian mode'), E('chrom', 'Chromatic scale')]],
      ['Intervals', 'Jump to the right note without sliding into it.', [
        E('third', 'Thirds'), E('fifth', 'Fifths'), E('octave', 'Octaves'), E('second', 'Seconds'), E('fourth', 'Fourths'), E('sixth', 'Sixths')]],
      ['Patterns', 'Short shapes, each a step higher.', [
        E('p-three', 'Three-note steps'), E('p-descend', 'Five down'), E('p-home', 'Home base'), E('p-turn', 'Neighbour turn'), E('p-thirds', 'Scale in thirds'),
        E('p-leapback', 'Leap and walk down'), E('p-octdrop', 'Octave drop'), E('p-quick', 'Quick arpeggios')]],
      ['Chords and leaps', 'Chord tones and surprise jumps.', [
        E('arp7', 'Dominant seventh'), E('chords', 'Major, minor, major'), E('r-chord', 'Random chord tones'), E('r-leaps', 'Random leaps')]],
      ['Tunes', 'Whistle a tune, as you would for a friend.', [
        E('mel-twinkle', 'Twinkle, Twinkle'), E('mel-frere', 'Frère Jacques'), E('mel-ode', 'Ode to Joy'), E('r-walk', 'Random melody')]]
    ]);
    make('piano', 'p', [
      ['Find the keys', 'Learn where the notes live. Say each name as you play it.', [
        P('flash', 'white', '1', 0, 'White keys', 'Sixteen random white keys around middle C.'), P('flash', 'white', '2', 0, 'Two octaves', 'Sixteen random white keys over two octaves.'),
        P('flash', 'key', '1', 7, 'Notes of G major', 'Random notes of G major, with its F sharp.'), P('flash', 'all', '1', 0, 'Every key', 'Sixteen random notes, black keys too.'),
        P('flash', 'all', '2', 0, 'Every key, two octaves', 'Sixteen random notes over two octaves.')]],
      ['Scales and modes', 'One octave up and back down. The app waits for every note.', [
        P('scale', 'major', '1', 0, 'C major', 'All white keys: the starting scale.'), P('scale', 'pent', '1', 0, 'Major pentatonic', 'Five notes, no half steps.'),
        P('scale', 'major', '1', 7, 'G major', 'One black key: F sharp.'), P('scale', 'major', '1', 5, 'F major', 'One black key: B flat.'), P('scale', 'major', '2', 0, 'C major, two octaves', 'Watch your hand position at the turn.'),
        P('scale', 'minor', '1', 9, 'A natural minor', 'The white-key minor scale.'), P('scale', 'pentmin', '1', 9, 'Minor pentatonic', 'The backbone of blues and rock solos.'), P('scale', 'blues', '1', 0, 'Blues scale', 'Minor pentatonic plus the blue note.'),
        P('scale', 'harm', '1', 9, 'Harmonic minor', 'The raised seventh makes a three-semitone gap.'), P('scale', 'chrom', '1', 0, 'Chromatic scale', 'Every key in turn. Fingering and evenness.'),
        P('scale', 'dorian', '1', 2, 'Dorian from D', 'Minor with a bright sixth, on white keys.'), P('scale', 'mixo', '1', 7, 'Mixolydian from G', 'Major with a flat seventh, on white keys.')]],
      ['Chords', 'Play the whole chord at once. The lowest note has to match too.', [
        P('chords', 'major', '0', 0, 'Major triads', 'Root position, all twelve keys round the circle of fifths.'), P('chords', 'minor', '0', 0, 'Minor triads', 'Root position, all twelve keys.'),
        P('chords', 'major', '1', 0, 'First inversion', 'The third at the bottom. All twelve keys.'), P('chords', 'major', '2', 0, 'Second inversion', 'The fifth at the bottom. All twelve keys.'),
        P('chords', 'major', 'all', 0, 'Every major inversion', 'Root position, first and second inversion in C.'), P('chords', 'minor', 'all', 0, 'Every minor inversion', 'Root position, first and second inversion in C minor.'),
        P('chords', 'dim', '0', 0, 'Diminished triads', 'Two stacked minor thirds. Tense and unstable.'), P('chords', 'sus4', '0', 0, 'Suspended chords', 'Root, fourth and fifth. They want to resolve.'),
        P('chords', 'dom7', '0', 0, 'Dominant sevenths', 'Four-note chords with the flat seventh.'), P('chords', 'maj7', '0', 0, 'Major sevenths', 'Four-note chords with the major seventh.'),
        P('chords', 'min7', '0', 0, 'Minor sevenths', 'Four-note minor chords with the flat seventh.')]],
      ['Arpeggios', 'The notes of a chord one at a time, up and back down.', [
        P('arpeggio', 'major', '1', 0, 'Major arpeggio', 'Root, third, fifth and back.'), P('arpeggio', 'minor', '1', 0, 'Minor arpeggio', 'The notes of a minor chord.'),
        P('arpeggio', 'major', '2', 0, 'Major, two octaves', 'Smooth hand crossing is the goal.'), P('arpeggio', 'dom7', '1', 0, 'Dominant seventh', 'Four notes with the bluesy flat seventh.'),
        P('arpeggio', 'maj7', '1', 0, 'Major seventh', 'Four notes with the dreamy major seventh.'), P('arpeggio', 'min7', '1', 0, 'Minor seventh', 'Four notes of a mellow minor chord.')]],
      ['Finger patterns', 'Patterns played from every note of the scale. The classic finger exercises.', [
        P('sequence', 'fives', 'major', 0, 'Five-finger runs', 'Five notes up and back down from every degree.'), P('sequence', 'fours', 'major', 0, 'Four-note runs', '1-2-3-4, 2-3-4-5 and on.'),
        P('sequence', 'thirds', 'major', 0, 'Thirds', '1-3, 2-4, 3-5 and on.'), P('sequence', 'broken', 'major', 0, 'Broken thirds', '1-3-2-4 and on.'),
        P('sequence', 'triads', 'major', 0, 'Triads on every degree', '1-3-5, 2-4-6 and on.'), P('sequence', 'neighbour', 'major', 0, 'Turns', 'Around each note and home again.'),
        P('sequence', 'zigzag', 'major', 0, 'Zigzag', '1-3-2-4-3-5 and on.'), P('sequence', 'fives', 'minor', 9, 'Five-finger runs, minor', 'The same runs in A minor.'),
        P('sequence', 'thirds', 'minor', 9, 'Thirds, minor', 'Thirds in A minor.')]],
      ['Intervals', 'Two notes together, from every root. Learn the shape under your fingers.', [
        P('intervals', '7', '', 0, 'Fifths', 'The open, hollow sound.'), P('intervals', '12', '', 0, 'Octaves', 'The same note, higher.'), P('intervals', '4', '', 0, 'Major thirds', 'Bright and sweet.'),
        P('intervals', '5', '', 0, 'Fourths', 'Open, with a pull to resolve.'), P('intervals', '3', '', 0, 'Minor thirds', 'The darker third.'), P('intervals', '9', '', 0, 'Major sixths', 'A wide, warm interval.'),
        P('intervals', '8', '', 0, 'Minor sixths', 'A wide, yearning interval.'), P('intervals', 'mix', '', 0, 'Mixed intervals', 'A random interval above a random note each time.')]],
      ['Chord progressions', 'Chords in a row, in any key. Plan the next chord before the last one ends.', [
        P('progression', 'basic', '', 0, 'I – IV – V – I', 'The most common chord sequence in music.'), P('progression', 'pop', '', 0, 'I – V – vi – IV', 'The pop progression.'),
        P('progression', 'fifties', '', 0, 'I – vi – IV – V', 'The doo-wop progression.'), P('progression', 'rock', '', 0, 'I – ♭VII – IV – I', 'The rock cadence.'),
        P('progression', 'minor', '', 9, 'i – iv – V – i', 'The minor cadence, in A minor.'), P('progression', 'basic', 'smooth', 0, 'Smooth I – IV – V – I', 'Each chord inverted to move as little as possible.'),
        P('progression', 'pop', 'smooth', 7, 'Smooth pop chords in G', 'Pop chords with close voice leading.'), P('progression', 'blues', '', 0, 'Blues changes', 'The first six bars of a 12-bar blues.'),
        P('progression', 'jazz', '', 0, 'ii – V – I', 'The jazz cadence with seventh chords.'), P('progression', 'canon', '', 2, 'Canon progression', 'Eight chords in D.'),
        P('progression', 'basic', 'cycle', 0, 'I – IV – V – I in all 12 keys', 'The cadence round the circle of fourths.')]],
      ['Play what you hear', 'Listen first, then find it on the keys.', [
        P('ear', 'note', '', 0, 'Find the note', 'Hear a note, then find it. Ten notes.'), P('ear', 'interval', '', 0, 'Find the interval', 'You get the first note; play the second one you hear.'),
        P('ear', 'degree', '', 0, 'Find the scale degree', 'C is home. Hear a note of C major and play it.'), P('ear', 'chord', '', 0, 'Major or minor chords', 'Listen to a triad and play it back.'),
        P('ear', 'chordx', '', 0, 'Five chord types', 'Major, minor, diminished, augmented or suspended.')]]
    ]);
    return this;
  },
  level(kind, id) { return (this.LEVELS[kind] || []).find(l => l.id === id); },
  unitOf(kind, l) { return this.UNITS[kind].find(u => u.id === l.unit); },
  /* How many stars a result earns: 0 below a pass, then 1 to 3. pct is 0-100. */
  stars(kind, pct) { let s = 0; this.KINDS[kind].thr.forEach(t => { if (pct >= t - 1e-9) s++; }); return s; },
  /* progress: { levelId: { best, stars, tries } }. The first level is always open; the others open when the one before has a star. */
  unlocked(kind, progress, id) { const l = this.level(kind, id); if (!l) return false; if (l.i === 0) return true; const p = progress[this.LEVELS[kind][l.i - 1].id]; return !!(p && p.stars >= 1); },
  /* The level to carry on with: the first open level without a star, or the last one when everything is done. */
  next(kind, progress) { const L = this.LEVELS[kind]; return L.find(l => this.unlocked(kind, progress, l.id) && !(progress[l.id] && progress[l.id].stars >= 1)) || L[L.length - 1]; },
  summary(kind, progress) { const L = this.LEVELS[kind]; return { total: L.length, passed: L.filter(l => progress[l.id] && progress[l.id].stars >= 1).length, stars: L.reduce((a, l) => a + (progress[l.id] ? progress[l.id].stars : 0), 0) }; }
}.build();
