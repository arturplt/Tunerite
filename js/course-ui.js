"use strict";
/* ---- Courses in Practice (Sing, Whistle, Piano): the level map, starting a level and keeping the stars. The levels are in core/course.js. ---- */
const Course = {
  prog(kind) { const s = Store.data; if (!s.course) s.course = {}; return s.course[kind] || (s.course[kind] = {}); },
  rule(kind) { const k = COURSE.KINDS[kind], t = k.thr; return kind === 'piano' ? t[0] + '% of the steps right the first time' : 'a score of ' + t[0]; },
  /* ---- the level map ---- */
  renderMap(kind) {
    const host = $('#courseMap'); if (!host) return; const P = this.prog(kind), K = COURSE.KINDS[kind], sm = COURSE.summary(kind, P), nxt = COURSE.next(kind, P), thr = K.thr; host.textContent = '';
    const head = document.createElement('div'); head.className = 'card earhead';
    head.innerHTML = '<div class="muted small"></div>';
    head.firstChild.textContent = (kind === 'piano' ? 'Play each exercise. ' : 'Do each exercise and the app scores your pitch. ') + 'Get ' + this.rule(kind) + ' to open the next level; ' + thr[1] + (kind === 'piano' ? '%' : '') + ' earns a second star and ' + thr[2] + (kind === 'piano' ? '%' : '') + ' a third.' + (kind === 'piano' ? '' : ' Tempo and difficulty come from the Exercises tab.');
    const st = document.createElement('div'); st.className = 'earstats'; st.innerHTML = '<span><b>' + sm.passed + ' / ' + sm.total + '</b>levels passed</span><span><b>' + sm.stars + ' / ' + sm.total * 3 + '</b>stars</span>'; head.appendChild(st);
    const go = document.createElement('button'); go.className = 'btn primary'; go.style.marginTop = '0.5rem'; go.textContent = (sm.passed ? 'Continue: ' : 'Start: ') + nxt.title; go.onclick = () => this.start(kind, nxt.id); head.appendChild(go); host.appendChild(head);
    COURSE.UNITS[kind].forEach(u => {
      const key = 'course-' + kind + '-' + u.id, sec = document.createElement('details'); sec.className = 'fold earunit'; sec.dataset.k = key; const done = u.levels.filter(l => P[l.id] && P[l.id].stars >= 1).length;
      if (FOLD_OPEN.has(key) || u.levels.some(l => l.id === nxt.id)) sec.open = true;
      const s = document.createElement('summary'); s.innerHTML = '<span></span><i></i>'; s.children[0].textContent = u.title; s.children[1].textContent = done + ' / ' + u.levels.length; sec.appendChild(s);
      const bl = document.createElement('div'); bl.className = 'muted small earblurb'; bl.textContent = u.blurb; sec.appendChild(bl);
      u.levels.forEach((l, i) => {
        const ok = COURSE.unlocked(kind, P, l.id), p = P[l.id], b = document.createElement('button'); b.className = 'card earlvl' + (ok ? '' : ' locked') + (l.id === nxt.id ? ' next' : ''); b.disabled = !ok; b.dataset.id = l.id;
        b.innerHTML = '<span class="num"></span><span class="txt"><span class="t"></span><span class="muted small"></span></span><span class="stars"></span>';
        b.querySelector('.num').textContent = ok ? (i + 1) : '🔒'; b.querySelector('.t').textContent = l.title; b.querySelector('.muted').textContent = l.desc;
        b.querySelector('.stars').textContent = p ? '★'.repeat(p.stars) + '☆'.repeat(3 - p.stars) : ok ? '☆☆☆' : '';
        b.title = ok ? (p ? 'Best ' + Math.round(p.best) + (kind === 'piano' ? '%' : '') : 'Not tried yet') : 'Pass the level before this one to open it'; b.onclick = () => this.start(kind, l.id); sec.appendChild(b);
      });
      host.appendChild(sec);
    });
  },
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
    return { kind, id, pct, stars, passed: stars >= 1, first, nxt, opened: stars >= 1 && first && nxt ? nxt : null };
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
  },
  /* the button on a result screen: the next course level, else the routine's next step */
  next() { const c = UI.curSession && UI.curSession.course; if (c && c.next && !Routine.active) this.start(c.kind, c.next); else Routine.next(); }
};
