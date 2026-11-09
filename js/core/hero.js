"use strict";
/* ---- Beat Hero: the songs and the judging for the rhythm game. Pure functions, no audio and no DOM, so they can be tested.
   Notes fall down three lanes: CLAP (a short sound), SING (a held voice) and WHISTLE (a held, high whistle). A song is a list of bars of 8 slots, an eighth note each:
   'c' a clap, 's' the start of a sung note, 'w' the start of a whistled note, '-' holds the note before it for one more slot, '.' a rest.
   Every song starts after one count-in bar. Times here are in beats from the start of the song unless a name says seconds. ---- */
const HERO = {
  LANES: ['c', 's', 'w'], NAMES: { c: 'CLAP', s: 'SING', w: 'WHISTLE' }, LEAD: 4, SLOT: 0.5,
  WHISTLE_HZ: 600,            // a voice sits below this and a whistle above it
  SONGS: {
    h1: { title: 'First Claps', bpm: 80, bars: ['c.c.c.c.', 'c.c.c.c.', 'c...c...', 'c.c.c.c.', 'c.c...c.', 'c...c.c.', 'c.c.c.c.', 'c.......'] },
    h2: { title: 'Sing Along', bpm: 88, bars: ['s---s---', 's---c.c.', 's-s-s---', 'c.c.s---', 's---s-s-', 's---c.c.', 's-c.s-c.', 's-------'] },
    h3: { title: 'Whistle Up', bpm: 92, bars: ['w---w---', 'w---c.c.', 'w-w-w---', 'c.c.w---', 'w---w-w-', 'w---c.c.', 'w-c.w-c.', 'w-------'] },
    h4: { title: 'All Three', bpm: 100, bars: ['c.c.s---', 'w---c.c.', 's-w-s---', 'c.s-w-c.', 's---w---', 'c.c.c.c.', 's-s-w-w-', 'c.s-c.w-', 's---c.w-', 'w-w-c.c.', 's-w-s-w-', 'c.c.c.c.'] },
    h5: { title: 'Hero Anthem', bpm: 112, bars: ['c.c.c.c.', 'c.c.s---', 's-s-w---', 'w-c.c.c.', 's---w---', 's-w-s-w-', 'c.cc.c.c', 'c.c.w---', 'w---s---', 'w-s-w-s-', 'c.s-c.w-', 'c.c.s-w-', 's-s-w-w-', 'c.cc.c.c', 'c.c.c.c.', 's---w---', 'c.......'] }
  },
  /* the notes of a song: { b (beat), l (lane), d (length in beats, 0 for a clap), bar } in time order */
  build(song) {
    const notes = []; let cur = null;
    song.bars.forEach((bar, bi) => [...bar].forEach((ch, si) => {
      const b = this.LEAD + (bi * 8 + si) * this.SLOT;
      if (ch === 'c') { cur = null; notes.push({ b, l: 'c', d: 0, bar: bi }); }
      else if (ch === 's' || ch === 'w') { cur = { b, l: ch, d: this.SLOT, bar: bi }; notes.push(cur); }
      else if (ch === '-' && cur) cur.d += this.SLOT;
      else cur = null;
    }));
    return notes;
  },
  /* where the song ends, in beats, with a little room after the last note */
  endBeat(song) { return this.LEAD + song.bars.length * 8 * this.SLOT + 1; },
  /* ---- judging ---- */
  /* a clap this many seconds from its note: 1 perfect, 0.75 good, 0.5 ok, or 0 for too far off to count */
  clapQ(dt) { dt = Math.abs(dt); return dt <= 0.07 ? 1 : dt <= 0.13 ? 0.75 : dt <= 0.2 ? 0.5 : 0; },
  /* a held note by the share of its length that was sung or whistled */
  holdQ(ratio) { return ratio >= 0.8 ? 1 : ratio >= 0.6 ? 0.75 : ratio >= 0.35 ? 0.5 : 0; },
  /* which lane a pitched sound belongs to */
  laneOf(hz) { return hz >= this.WHISTLE_HZ ? 'w' : hz > 60 ? 's' : null; },
  word(q) { return q >= 1 ? 'PERFECT' : q >= 0.75 ? 'GOOD' : q >= 0.5 ? 'OK' : 'MISS'; },
  /* the score multiplier for a combo: x1, then one more for every ten in a row, up to x4 */
  mult(combo) { return Math.min(4, 1 + Math.floor(combo / 10)); },
  points(q) { return Math.round(100 * q); }
};
