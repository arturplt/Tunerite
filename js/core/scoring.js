"use strict";
/* ---- Scoring ---- */
const WEIGHTS = { acc: 0.5, stab: 0.25, att: 0.15, dev: 0.10 };
const STAR_AT = [50, 70, 90];
const TOLERANCE = { easy: 50, medium: 25, hard: 10 };
const HOP = 0.02;               // seconds between frames (50 per second)
function targetAt(events, t) {
  for (const ev of events) {
    if (t >= ev.start && t < ev.start + ev.dur)
      return ev.midi2 == null ? ev.midi : ev.midi + (ev.midi2 - ev.midi) * ((t - ev.start) / ev.dur);
  }
  return null;
}
/* frames: [{t, m}] with t in seconds from exercise start and m = midi or null (unvoiced). */
function scoreEvent(frames, ev, tol, find) {
  find = find == null ? 0.3 : find;                 // seconds allowed to find the note before it counts
  const grace = Math.min(find, (find > 0.3 ? 0.7 : 0.4) * ev.dur);
  const inEv = frames.filter(f => f.t >= ev.start && f.t < ev.start + ev.dur);
  const tgt = t => ev.midi2 == null ? ev.midi : ev.midi + (ev.midi2 - ev.midi) * ((t - ev.start) / ev.dur);
  const need = Math.ceil(0.15 / HOP);
  let attack = null, run = 0, runStart = 0;
  for (const f of inEv) {
    const ok = f.m != null && Math.abs(f.m - tgt(f.t)) * 100 <= tol;
    if (ok) { if (run++ === 0) runStart = f.t; if (run >= need) { attack = runStart - ev.start; break; } } else run = 0;
  }
  const scored = inEv.filter(f => f.t - ev.start >= grace);
  const errs = [];
  let within = 0;
  for (const f of scored) {
    if (f.m == null) continue;
    const e = (f.m - tgt(f.t)) * 100;
    errs.push(e);
    if (Math.abs(e) <= tol) within++;
  }
  const accuracy = scored.length ? within / scored.length : 0;
  const dev = errs.length ? median(errs) : null;
  let sd = null;
  if (errs.length >= 5) {                       // moving average over ~9 frames (~180 ms) cancels 4-7 Hz vibrato
    const k = 9, sm = [];
    for (let i = 0; i + k <= errs.length; i++) { let s = 0; for (let j = 0; j < k; j++) s += errs[i + j]; sm.push(s / k); }
    const arr = sm.length ? sm : errs, mean = arr.reduce((a, b) => a + b, 0) / arr.length;
    sd = Math.sqrt(arr.reduce((a, b) => a + (b - mean) * (b - mean), 0) / arr.length);
  }
  const parts = {
    acc: accuracy * 100,
    stab: sd == null ? 0 : 100 * clamp(1 - sd / 40, 0, 1),
    att: attack == null ? 0 : (attack <= find ? 100 : 100 * clamp(1 - (attack - find) / 1.2, 0, 1)),
    dev: dev == null ? 0 : 100 * clamp(1 - Math.abs(dev) / (2 * tol), 0, 1)
  };
  const score = parts.acc * WEIGHTS.acc + parts.stab * WEIGHTS.stab + parts.att * WEIGHTS.att + parts.dev * WEIGHTS.dev;
  return { score, accuracy, dev, sd, attack, parts, voiced: errs.length };
}
function starsFor(score) { return STAR_AT.filter(s => score >= s).length; }
function aggregate(results, events) {
  let wsum = 0, score = 0, acc = 0, dev = 0, devW = 0, sd = 0, sdW = 0, att = 0, attN = 0;
  results.forEach((r, i) => {
    const w = events[i].dur; wsum += w; score += r.score * w; acc += r.accuracy * w;
    if (r.dev != null) { dev += r.dev * w; devW += w; }
    if (r.sd != null) { sd += r.sd * w; sdW += w; }
    if (r.attack != null) { att += r.attack; attN++; }
  });
  const s = wsum ? score / wsum : 0;
  return { score: Math.round(s), stars: starsFor(s), acc: wsum ? acc / wsum : 0, dev: devW ? dev / devW : null, sd: sdW ? sd / sdW : null, attack: attN ? att / attN : null };
}

/* Reads the whole pitch trace after an exercise and turns recurring patterns into coaching tips.
   events: exercise notes, frames: [{t, m}] (t in seconds from the start, m = midi or null), per: scoreEvent results.
   Returns tips sorted by importance: {p, head, text, ev: [event indexes to flag on the graph], ex: exercise id to practise next}. */
function analyseTake(events, frames, per, tol, find) {
  find = find == null ? 0.3 : find;
  const tips = [], add = (id, p, head, text, ev, ex) => tips.push({ id, p, head, text, ev: ev || [], ex: ex || null });
  const fmt = v => Math.round(Math.abs(v)), th = Math.max(12, tol * 0.5);
  const label = r => noteName(r.ev.midi) + (r.ev.v ? ' ' + r.ev.v : '');
  const rows = events.map((ev, i) => {
    const tgt = t => ev.midi2 == null ? ev.midi : ev.midi + (ev.midi2 - ev.midi) * ((t - ev.start) / ev.dur);
    const pts = frames.filter(f => f.t >= ev.start && f.t < ev.start + ev.dur && f.m != null).map(f => ({ t: f.t - ev.start, e: (f.m - tgt(f.t)) * 100 }));
    const early = pts.filter(p => p.t < 0.3).map(p => p.e), late = pts.filter(p => p.t >= Math.min(0.5, ev.dur * 0.4));
    let slope = null;
    if (late.length >= 15 && ev.dur >= 1.5) {
      const mt = late.reduce((a, p) => a + p.t, 0) / late.length, me = late.reduce((a, p) => a + p.e, 0) / late.length;
      let nu = 0, de = 0; late.forEach(p => { nu += (p.t - mt) * (p.e - me); de += (p.t - mt) * (p.t - mt); });
      if (de > 0) slope = nu / de;
    }
    const expect = Math.max(0, (ev.dur - 0.4) / HOP);
    return { ev, i, n: pts.length, expect, glide: ev.midi2 != null, start: early.length >= 3 ? median(early) : null,
      settled: late.length >= 5 ? median(late.map(p => p.e)) : null, drift: slope == null ? null : slope * (ev.dur - 0.5), pts, sd: per[i] ? per[i].sd : null, attack: per[i] ? per[i].attack : null };
  });
  const steady = rows.filter(r => !r.glide);
  const idx = a => a.map(r => r.i), names = a => a.slice(0, 3).map(label).join(', ') + (a.length > 3 ? ' and ' + (a.length - 3) + ' more' : '');
  // 1. notes that were not heard at all
  const missed = rows.filter(r => r.expect > 5 && r.n < 0.4 * r.expect);
  if (missed.length && (missed.length >= 2 || missed.length >= rows.length * 0.25))
    add('missed', 95, 'Some notes were not heard', 'I could not hear you on ' + names(missed) + '. Sing a little louder, bring the phone closer, or lower the mic sensitivity in Settings. If you were out of range, try a lower or higher start via "Find my range".', idx(missed), 'hold');
  const heard = steady.filter(r => r.settled != null);
  // 2. constant flat or sharp bias
  if (heard.length >= 3) {
    const bias = median(heard.map(r => r.settled));
    if (Math.abs(bias) >= th) add(bias < 0 ? 'flat' : 'sharp', 80, bias < 0 ? 'You sing flat overall' : 'You sing sharp overall',
      bias < 0 ? 'Your notes sit about ' + fmt(bias) + '¢ under the target. Lift the pitch from inside: stand tall, raise the soft palate as in a yawn, and give the note more breath support. Aim "up and over" the note.'
        : 'Your notes sit about ' + fmt(bias) + '¢ above the target. This usually means pressure or tension. Relax the jaw and throat, sing a little softer, and let the note settle instead of pushing it up.', idx(heard), 'hold');
  }
  // 3. pitch sagging or creeping during long notes
  const drift = steady.filter(r => r.drift != null && Math.abs(r.drift) >= 15);
  const sag = drift.filter(r => r.drift < 0), creep = drift.filter(r => r.drift > 0);
  if (sag.length >= 2 || (sag.length && sag.length >= steady.length * 0.3)) {
    const avg = median(sag.map(r => r.drift));
    add('sag', 78, 'Long notes sag flat', 'On ' + names(sag) + ' the pitch drops about ' + fmt(avg) + '¢ before the note ends. That is the breath running out of support. Keep the ribs open as you sing, use a steady stream of air, and only start a long note on a full breath.', idx(sag), 'hold');
  }
  if (creep.length >= 2 || (creep.length && creep.length >= steady.length * 0.3)) {
    const avg = median(creep.map(r => r.drift));
    add('creep', 74, 'Long notes creep sharp', 'On ' + names(creep) + ' the pitch rises about ' + fmt(avg) + '¢ as you hold. Tension is building. Soften the jaw and tongue, and let the volume stay constant instead of pushing.', idx(creep), 'hold');
  }
  // 4. approaching notes from below or above
  const starts = steady.filter(r => r.start != null && r.settled != null && !(r.drift != null && Math.abs(r.drift) >= 15));   // drifting notes are explained by the drift tip
  const scoop = starts.filter(r => r.start - r.settled <= -22), over = starts.filter(r => r.start - r.settled >= 30);
  if (scoop.length >= 2 && scoop.length >= starts.length * 0.25)
    add('scoop', 70, 'You slide up into notes', 'On ' + names(scoop) + ' you start about ' + fmt(median(scoop.map(r => r.start - r.settled))) + '¢ low and slide up. Hear the note in your head before you sing it, and start the sound right on the pitch with a small clean breath, not a swoop.', idx(scoop), 'hold');
  else if (over.length >= 2 && over.length >= starts.length * 0.25)
    add('over', 70, 'You overshoot the start of notes', 'On ' + names(over) + ' you begin about ' + fmt(median(over.map(r => r.start - r.settled))) + '¢ high and settle down. Start gently and imagine the pitch before you sing it. A softer onset helps.', idx(over), 'hold');
  // 5. late lock-on
  const late = steady.filter(r => r.attack != null ? r.attack > find + 0.6 : r.settled != null && Math.abs(r.settled) <= tol);
  if (late.length >= 2 && late.length >= steady.length * 0.3 && missed.length < late.length)
    add('late', 55, 'You find the notes late', names(late) + ' took more than half a second to land. Use the half beat before each note to prepare: breathe, shape the vowel and imagine the pitch, then sing straight onto it.', idx(late), 'five');
  // 6. wobble
  const wob = steady.filter(r => r.sd != null && r.sd > 18 && !(r.drift != null && Math.abs(r.drift) >= 15));
  if (wob.length >= 2 && wob.length >= steady.length * 0.25)
    add('wobble', 60, 'The pitch wobbles', 'On ' + names(wob) + ' the pitch moves around by about ' + fmt(median(wob.map(r => r.sd))) + '¢. Aim for a steady stream of air. Lip trills and humming one note are the best fix, and a relaxed jaw helps.', idx(wob), 'hold');
  // 7. high versus low register
  const reg = heard.slice().sort((a, b) => a.ev.midi - b.ev.midi), pitches = new Set(reg.map(r => r.ev.midi));
  if (pitches.size >= 4 && reg.length >= 6) {
    const k = Math.max(2, Math.floor(reg.length / 3)), lo = reg.slice(0, k), hi = reg.slice(-k);
    const ml = median(lo.map(r => r.settled)), mh = median(hi.map(r => r.settled));
    if (mh <= -th && mh - ml <= -10) add('highflat', 68, 'High notes go flat', 'Your top notes (' + names(hi) + ') are about ' + fmt(mh) + '¢ flat. Do not reach up with the chin. Stay tall, open the throat and give the high notes more air, thinking "over" the note instead of "up to" it.', idx(hi), 'siren');
    else if (mh >= th && mh - ml >= 10) add('highsharp', 68, 'High notes go sharp', 'Your top notes (' + names(hi) + ') are about ' + fmt(mh) + '¢ sharp. That is squeezing. Lighten the voice as you go up and keep the throat relaxed.', idx(hi), 'siren');
    else if (ml >= th && ml - mh >= 10) add('lowsharp', 66, 'Low notes go sharp', 'Your low notes (' + names(lo) + ') are about ' + fmt(ml) + '¢ sharp. Do not push down into them. Relax and let the pitch drop with the breath.', idx(lo), 'siren');
    else if (ml <= -th && ml - mh <= -10) add('lowflat', 66, 'Low notes go flat', 'Your low notes (' + names(lo) + ') are about ' + fmt(ml) + '¢ flat. Keep the energy up even on low notes: stand tall, keep the same support and brighten the vowel slightly.', idx(lo), 'siren');
  }
  // 8. leaps: the landing note compared with the direction of the jump
  const landing = [];
  for (let i = 1; i < steady.length; i++) {
    const a = steady[i - 1], b = steady[i], d = b.ev.midi - a.ev.midi;
    if (rows[b.i - 1] === a && Math.abs(d) >= 3 && b.start != null && b.settled != null && !(b.drift != null && Math.abs(b.drift) >= 15)) landing.push({ r: b, d, short: -(b.start - b.settled) * Math.sign(d) });
  }
  if (landing.length >= 2) {
    const m = median(landing.map(x => x.short));
    if (m >= 20) add('short', 64, 'You land short on jumps', 'After a leap you start about ' + fmt(m) + '¢ short of the new note. Hear the interval before you sing it, open the jaw slightly on leaps up, and commit to the full distance instead of stepping toward it.', landing.map(x => x.r.i), 'fifth');
    else if (m <= -20) add('long', 64, 'You overshoot jumps', 'After a leap you start about ' + fmt(m) + '¢ beyond the new note. Aim for the exact landing: hear the target first and make the jump smaller and lighter.', landing.map(x => x.r.i), 'third');
  }
  // 9. vowel colour
  const byV = {};
  heard.filter(r => r.ev.v).forEach(r => { (byV[r.ev.v] = byV[r.ev.v] || []).push(r); });
  const vs = Object.keys(byV);
  if (vs.length >= 3) {
    const all = median(heard.filter(r => r.ev.v).map(r => r.settled));
    vs.forEach(v => {
      const d = median(byV[v].map(r => r.settled)) - all;
      if (Math.abs(d) >= 15 && byV[v].length >= 2) add('vowel', 72, '"' + v + '" drifts ' + (d > 0 ? 'sharp' : 'flat'), 'Your "' + v + '" is about ' + fmt(d) + '¢ ' + (d > 0 ? 'above' : 'below') + ' your average. ' + (d > 0 ? 'Narrow vowels like "i" and "e" tend to pull sharp: drop the jaw a touch, keep the tongue relaxed and keep the same pitch inside.' : 'Rounded vowels like "o" and "u" tend to sag: keep the energy and breath the same as on "a", and think the pitch slightly forward.'), idx(byV[v]), 'vowels');
    });
  }
  // 10. glides
  const gl = rows.filter(r => r.glide && r.pts.length >= 10);
  if (gl.length) {
    const lag = median(gl.map(r => median(r.pts.map(p => p.e)) * Math.sign(r.ev.midi2 - r.ev.midi)));
    if (lag <= -25) add('lag', 62, 'You trail behind the glide', 'During the slides you are about ' + fmt(lag) + '¢ behind the moving bar. Lead the movement: think of the end note and keep the airflow smooth, with no stop-start in the sound.', idx(gl), 'siren');
    else if (lag >= 25) add('ahead', 62, 'You run ahead of the glide', 'During the slides you are about ' + fmt(lag) + '¢ ahead of the bar. Slow the movement and spread it evenly from start to end.', idx(gl), 'siren');
  }
  tips.sort((a, b) => b.p - a.p);
  return tips;
}

