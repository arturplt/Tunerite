"use strict";
/* ---- Rhythm training: the curriculum and the scoring. Pure functions, no audio and no DOM, so they can be tested.
   A level is a drill of a few rounds. In each round the app counts a bar in, plays a pattern, and you tap it back in the next bar.
   A pattern is a grid string, one character per step of the bar: 'x' is a hit, '.' is a rest. The bar is `beats` long, so a step lasts beats / pattern length.
   Each hit is scored by how close the tap lands. 70% passes a level and opens the next; 85% and 95% earn more stars. ---- */
const RHYTHM = {
  STARS: [70, 85, 95],
  /* timing in seconds: a tap this close is perfect, and it earns nothing at the far limit (never more than 45% of the smallest gap between hits) */
  FULL: 0.06, LIMIT: 0.22, EXTRA: 0.5,
  UNITS: [], LEVELS: [],
  build() {
    const U = [];
    /* a level: a title, a line about it, the tempo, the patterns it draws from (all the same length), and optionally a bar of 3 beats or a different number of rounds */
    const L = (title, desc, bpm, pats, o) => Object.assign({ title, desc, bpm, pats, beats: 4, n: 5 }, o);
    const unit = (id, title, blurb, levels) => U.push({ id, title, blurb, levels: levels.map((l, i) => Object.assign({ unit: id, id: id + 'l' + (i + 1) }, l)) });
    unit('r1', 'Steady beat', 'Start here: tap on the beat and keep it even. Everything else in music hangs on this.', [
      L('Four on the beat', 'Tap every beat of the bar.', 70, ['x.x.x.x.']),
      L('Half notes', 'Tap on one and three. Count the beat in between.', 70, ['x...x...']),
      L('Beats and halves', 'Mixing short and long.', 76, ['x.x.x...', 'x...x.x.', 'x.x...x.', 'x...x...']),
      L('A little faster', 'The same beats at a quicker pace.', 96, ['x.x.x.x.', 'x...x.x.', 'x.x.x...'])]);
    unit('r2', 'Eighth notes', 'Two taps to every beat. Say "one-and-two-and" to yourself.', [
      L('Running eighths', 'Eight even taps, two to every beat.', 70, ['xxxxxxxx']),
      L('Beat and double', 'Single taps and pairs of taps.', 72, ['x.xxx.xx', 'xxx.xxx.', 'x.x.xxxx', 'xxxxx.x.']),
      L('First half busy', 'Four fast taps, then a calmer half.', 76, ['xxxxx.x.', 'xxxx.x.x', 'xxxxx...', 'xxxx..x.']),
      L('Eighths, quicker', 'Mixed eighths at a faster tempo.', 92, ['x.xxx.xx', 'xxx.xxx.', 'xxxxx.x.', 'x.x.xxxx'])]);
    unit('r3', 'Rests', 'The silence counts as much as the taps. Keep counting through the gaps.', [
      L('Skip a beat', 'One beat of the bar is empty.', 70, ['x.x...x.', 'x...x.x.', 'x.x.x...', '..x.x.x.']),
      L('Off the beat', 'Tap between the beats, on the "and".', 70, ['.x.x.x.x', '.x...x..', '.x.x....', '.x.x.x..']),
      L('Eighth rests', 'Rests the length of one eighth note.', 76, ['x.x..xx.', 'xx.xx.x.', 'x..xx.xx', 'xx.x.xx.']),
      L('Sparse bar', 'Only a couple of taps. Hold your count.', 80, ['x.......', 'x.....x.', '....x...', '..x.....'])]);
    unit('r4', 'Syncopation', 'Hits that land away from the beat. This is where the groove lives.', [
      L('Dotted beats', 'A long note and a short one, as in many a march.', 76, ['x..x..x.', 'x..x.x..', 'x.x..x..']),
      L('Pushed notes', 'A note just before the beat.', 76, ['x.x.xx.x', 'x.xx.x.x', 'x..xx.x.']),
      L('Backbeat', 'The accent comes on two and four.', 82, ['..x...x.', 'x.x...x.', 'x.xx..x.', '..x.x.xx']),
      L('Off-beat groove', 'Tap the gaps between the beats.', 86, ['.x.x.x.x', '.xx.x.xx', 'x..xx..x', '.x..x.x.'])]);
    unit('r5', 'Sixteenths', 'Four taps to a beat. Slow and precise before it gets quick.', [
      L('Four to a beat', 'One beat of four quick taps, the rest steady.', 60, ['xxxx............', 'x...xxxx........', 'x...x...xxxx....']),
      L('Eighths and sixteenths', 'Both together in one bar.', 64, ['x.x.xxxxx.x.....', 'xxxxx.x.xxxx....', 'x.xxxxx.x.x.xxxx']),
      L('Gallop', 'Long-short-short, over and over.', 68, ['x..xx..xx..xx..x', 'x.xxx.xxx.xxx.xx', 'x..xx..xx...x...'])]);
    unit('r6', 'Triplets', 'Three taps to a beat. A rolling, swinging feel.', [
      L('Triplet beat', 'Three even taps on one beat.', 64, ['xxx.........', '...xxx......', '......xxx...']),
      L('Triplet bars', 'Triplets on some beats, a single tap on others.', 64, ['xxx...xxx...', 'x..xxx.xxx..', 'xxxxxx......', 'xxx.x..xxx.x']),
      L('Shuffle', 'Long-short, the feel of a swing rhythm.', 72, ['x.xx.xx.xx.x', 'x.xx.xx.x...', 'x.xx.x..xx.x'])]);
    unit('r7', 'Three in a bar', 'Waltz time: one-two-three, one-two-three.', [
      L('Waltz beat', 'Tap every beat of a three-beat bar.', 72, ['x.x.x.'], { beats: 3 }),
      L('Oom-pah-pah', 'A strong beat, then two lighter ones.', 76, ['x...x.', 'x.x...', 'x.xxx.'], { beats: 3 }),
      L('Waltz with eighths', 'Eighth notes in three-four.', 80, ['xxx.xx', 'x.xxxx', 'xxxxx.', 'x..xx.'], { beats: 3 })]);
    /* Beat Hero: a full-screen game (js/hero-ui.js, songs in core/hero.js). Its levels open on their own, in order from the first, so the game can be played at any time. */
    const G = (id, desc, o) => L(HERO.SONGS[id].title, desc, HERO.SONGS[id].bpm, [], Object.assign({ game: id }, o));
    unit('r8', 'Beat Hero', 'The rhythm game. Notes fall down three lanes: clap, sing and whistle them as they reach the line.', [
      G('h1', 'Clap on the beat as the notes land. Nothing else to do.'), G('h2', 'Sung notes join the claps. Hold your voice for as long as the bar is long.'),
      G('h3', 'Whistle the long notes, clap the short ones.'), G('h4', 'Clap, sing and whistle in one song.'),
      G('h5', 'The boss song: the longest chart, the fastest tempo, and all three lanes.', { boss: true, title: 'Boss: Hero Anthem' })]);
    this.UNITS = U; this.LEVELS = [].concat(...U.map(u => u.levels)); this.LEVELS.forEach((l, i) => { l.i = i; });
    return this;
  },
  level(id) { return this.LEVELS.find(l => l.id === id); },
  unitOf(l) { return this.UNITS.find(u => u.id === l.unit); },
  /* How many stars a score (0-100) earns: 0 below a pass, then 1 to 3. */
  stars(pct) { let s = 0; this.STARS.forEach(t => { if (pct >= t - 1e-9) s++; }); return s; },
  /* progress: { levelId: { best, stars, tries } }. The first level is always open; the others open when the one before has a star. */
  unlocked(progress, id) { const l = this.level(id); if (!l) return false; if (l.i === 0) return true; if (l.game && !this.LEVELS[l.i - 1].game) return true; const p = progress[this.LEVELS[l.i - 1].id]; return !!(p && p.stars >= 1); },
  /* The level to carry on with: the first open level without a star, or the last one when everything is done. */
  next(progress) { return this.LEVELS.find(l => this.unlocked(progress, l.id) && !(progress[l.id] && progress[l.id].stars >= 1)) || this.LEVELS[this.LEVELS.length - 1]; },
  /* ---- one round ---- */
  /* a pattern from the level's pool, not the one just played when there is a choice */
  pick(level, rnd, prev) {
    rnd = rnd || Math.random; const pool = level.pats.length > 1 ? level.pats.filter(p => p !== prev) : level.pats;
    return pool[Math.floor(rnd() * pool.length)];
  },
  /* where the hits of a pattern fall, in beats from the start of the bar */
  onsets(pat, beats) { const out = []; [...pat].forEach((c, i) => { if (c === 'x') out.push(i * beats / pat.length); }); return out; },
  /* How well taps match hits. Both are times in seconds from the start of the bar. Each hit takes the nearest free tap inside the window and scores 1 for a tap
     within FULL, falling to 0 at the window's edge; a hit with no tap scores 0 and every tap left over costs EXTRA of a hit. The round's score is 0-1.
     per[i] is { t (the hit), tap (its tap or null), err (tap - t, seconds), pts }. */
  score(exp, taps) {
    let gap = Infinity; for (let i = 1; i < exp.length; i++) gap = Math.min(gap, exp[i] - exp[i - 1]);
    const win = Math.min(this.LIMIT, gap * 0.45), full = Math.min(this.FULL, win * 0.4), pairs = [];
    exp.forEach((t, i) => taps.forEach((s, j) => { const d = Math.abs(s - t); if (d <= win) pairs.push([d, i, j]); }));
    pairs.sort((a, b) => a[0] - b[0]);
    const per = exp.map(t => ({ t, tap: null, err: null, pts: 0 })), used = new Set();
    pairs.forEach(([d, i, j]) => { if (per[i].tap != null || used.has(j)) return; used.add(j); per[i].tap = taps[j]; per[i].err = taps[j] - exp[i]; per[i].pts = d <= full ? 1 : 1 - (d - full) / (win - full); });
    const extras = taps.length - used.size, n = exp.length || 1, raw = per.reduce((a, p) => a + p.pts, 0) / n - extras * this.EXTRA / n;
    return { score: Math.max(0, Math.min(1, raw)), per, extras };
  }
}.build();
