"use strict";
/* ---- Courses in Practice (Sing, Whistle, Piano): starting a level and keeping the stars (the level map is on the Practice device, js/practice-device.js). The levels are in core/course.js. ---- */
const Course = {
  prog(kind) { const s = Store.data; if (!s.course) s.course = {}; return s.course[kind] || (s.course[kind] = {}); },
  rule(kind) { const k = COURSE.KINDS[kind], t = k.thr; return kind === 'piano' ? t[0] + '% of the steps right the first time' : 'a score of ' + t[0]; },
  /* ---- running a level ---- */
  start(kind, id) {
    const lv = COURSE.level(kind, id); if (!lv || !COURSE.unlocked(kind, this.prog(kind), id)) return;
    const c = { kind, id };
    if (kind === 'piano') PX.open(lv.px, { o1: lv.o1, o2: lv.o2, key: lv.key, course: c });
    else { UI.show('train'); UI.lastExercise = lv.ex; Session.begin(lv.ex, { course: c }); }
  },
  /* Keeps the best result of a level and says what it earned. pct is 0-100. */
  record(kind, id, pct) {
    const P = this.prog(kind), old = P[id], stars = COURSE.stars(kind, pct), first = !(old && old.stars >= 1), nxt = COURSE.LEVELS[kind][COURSE.level(kind, id).i + 1] || null;
    P[id] = { best: Math.max(old ? old.best : 0, pct), stars: Math.max(old ? old.stars : 0, stars), tries: (old ? old.tries : 0) + 1, ts: Date.now() }; Store.save();
    return { kind, id, pct, stars, passed: stars >= 1, first, nxt, opened: stars >= 1 && first && nxt ? nxt : null, improved: !!old && pct > old.best + 1e-9 || !old, gain: Math.max(0, stars - (old ? old.stars : 0)) };
  },
  /* the line shown under a result: the course stars, and what was opened */
  note(r) {
    const star = '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars), lv = COURSE.level(r.kind, r.id);
    if (!r.passed) return 'Course level ' + star + '. Not yet: ' + this.rule(r.kind) + ' opens the next level.';
    return 'Course level ' + star + ' ' + (r.stars === 3 ? 'Perfect.' : r.stars === 2 ? 'Very good.' : 'Passed.') + (r.opened ? ' Opened: ' + r.opened.title + '.' : r.nxt ? '' : ' That was the last level of the ' + COURSE.KINDS[r.kind].name.toLowerCase() + ' course.') + ' (' + lv.title + ')';
  },
  /* A sing or whistle level just finished: record it and put the stars, and a way on, on the results screen. */
  sessionDone(s) {
    const c = s.course, box = $('#rCourse'); if (!c || s.practice) { box.hidden = true; return; }
    const r = this.record(c.kind, c.id, s.result.agg.score); c.next = r.passed && r.nxt ? r.nxt.id : null;
    box.textContent = this.note(r); box.hidden = false;
    if (c.next) { $('#rNext').hidden = false; $('#rNext').textContent = 'Next level: ' + r.nxt.title + ' ▶'; }
    const a = s.result.agg, per = s.result.per || [];
    PDev.showResult({ kind: c.kind, id: c.id, pct: a.score, r, rows: [['SCORE', String(a.score)], ['ACCURACY', Math.round((a.acc || 0) * 100) + '%'], ['WOBBLE', a.sd == null ? '--' : a.sd.toFixed(1) + 'c']], strip: per.map(p => p.accuracy), stripLabel: 'NOTE BY NOTE', details: () => UI.trainView('res') });
  },
  /* the button on a result screen: the next course level, else the routine's next step */
  next() { const c = UI.curSession && UI.curSession.course; if (c && c.next && !Routine.active) this.start(c.kind, c.next); else Routine.next(); }
};
