"use strict";
/* ---- Routines: warm-up and practice plans that chain coach steps, the solfège guide and scored exercises ---- */
const COACH = {
  breath: { title: 'Breathing', secs: 36, pace: [4, 8], text: 'Stand tall with loose shoulders. Breathe in through the nose, then out slowly on a soft "ssss".', tips: ['Let the belly expand, not the shoulders', 'Keep the out-breath long, steady and quiet'] },
  relax: { title: 'Release tension', secs: 30, text: 'Roll your shoulders back, circle your neck gently and open and close your jaw. Yawn if you can.', tips: ['Jaw loose, tongue resting behind the lower teeth', 'Never force it. Stop if anything hurts'] },
  trill: { title: 'Lip trill', secs: 45, text: 'Blow air through relaxed lips so they flutter, then add voice. Slide gently up and down in a comfortable range.', tips: ['Support the air from the belly, keep the cheeks loose', 'If it will not trill, press a finger lightly on each cheek'] },
  hum: { title: 'Humming', secs: 40, text: 'Close the lips lightly and hum "mmm" on easy pitches. Feel the buzz in the lips and nose, and slide around.', tips: ['Teeth apart, lips together', 'The buzz should tickle, not strain'] },
  vowel: { title: 'Vowel shapes', secs: 45, text: 'Sing one easy note on "ah". Without moving the pitch, slowly change the shape: ah, eh, ee, oh, oo, and back. Only the lips and tongue move.', tips: ['Keep the jaw loose and the pitch the same on every vowel', 'Watch "Heard": the note should not wander. Ee tends to go sharp, oo flat'] },
  cool: { title: 'Cool-down sigh', secs: 30, text: 'Sigh softly from a comfortable high note down to a low one, on "ahh" or a hum. Finish with one slow breath.', tips: ['Stay soft and easy', 'Drink some water afterwards'] }
};
const ROUTINES = [
  { id: 'quick', name: 'Quick warm-up', desc: 'Breathe, trill, hum, then a siren, a five-note scale and Do Re Mi.', steps: ['c:breath', 'c:trill', 'c:hum', 'x:siren', 'x:five', 'g'] },
  { id: 'daily', name: 'Daily practice', desc: 'Full warm-up, then scales, arpeggio, intervals, held notes and a cool-down.', steps: ['c:breath', 'c:relax', 'c:trill', 'c:hum', 'x:siren', 'x:five', 'x:ladder', 'x:arp', 'c:vowel', 'x:vowelscale', 'g', 'x:major', 'x:fifth', 'x:hold', 'c:cool'] },
  { id: 'range', name: 'Range stretch', desc: 'Warm up, then reach high and low with the siren, ladder and octaves.', steps: ['c:breath', 'c:trill', 'x:siren', 'x:hold', 'x:ladder', 'x:octave', 'c:cool'] },
  { id: 'vowels', name: 'Vowel work', desc: 'Warm up, then keep a steady pitch while you change vowels, on one note and across a scale.', steps: ['c:breath', 'c:trill', 'c:hum', 'c:vowel', 'x:vowels', 'x:vowelscale', 'c:cool'] },
  { id: 'cool', name: 'Cool-down', desc: 'Two minutes to relax the voice after singing.', steps: ['c:relax', 'c:cool', 'c:breath'] }
];
const Routine = {
  active: null, i: 0, t0: 0, timer: 0, results: [],
  parse(code) { const p = code.split(':'); return { k: p[0], id: p[1] }; },
  title(code) { const q = this.parse(code); return q.k === 'c' ? COACH[q.id].title : q.k === 'g' ? 'Do Re Mi guide' : EXERCISES.find(e => e.id === q.id).name; },
  secsOf(code) {
    const q = this.parse(code); if (q.k === 'c') return COACH[q.id].secs; if (q.k === 'g') return 90;
    try { return buildExercise(q.id, getRange()).total + 12; } catch (e) { return 40; }
  },
  minutes(r) { return Math.max(1, Math.round(r.steps.reduce((a, c) => a + this.secsOf(c), 0) / 60)); },
  start(id) {
    this.active = typeof id === 'object' ? id : ROUTINES.find(r => r.id === id) || (Store.data.customRoutines || []).find(r => r.id === id); if (!this.active) return; this.i = -1; this.results = []; this.started = Date.now();
    this.next();
  },
  next() {
    clearInterval(this.timer); $('#o-routine').classList.remove('on');
    if (!this.active) return;
    if (++this.i >= this.active.steps.length) return this.finish();
    const q = this.parse(this.active.steps[this.i]);
    if (q.k === 'c') this.coach(q.id);
    else if (q.k === 'g') { UI.show('train'); Guide.open(); }
    else { UI.lastExercise = q.id; UI.show('train'); Session.begin(q.id); }
  },
  nextTitle() { const a = this.active; return a && this.i + 1 < a.steps.length ? this.title(a.steps[this.i + 1]) : null; },
  coach(id) {
    const c = COACH[id], n = this.active.steps.length;
    $('#rtTitle').textContent = this.active.name; $('#rtStep').textContent = 'Step ' + (this.i + 1) + ' of ' + n;
    $('#rtName').textContent = c.title; $('#rtText').textContent = c.text;
    const tips = $('#rtTips'); tips.textContent = ''; c.tips.forEach(t => { const li = document.createElement('li'); li.textContent = t; tips.appendChild(li); });
    this.renderDots(); $('#o-routine').classList.add('on'); this.t0 = performance.now();
    const circle = $('#rtCircle'), time = $('#rtTime'), cue = $('#rtCue');
    const tick = () => {
      const el = (performance.now() - this.t0) / 1000, left = Math.max(0, Math.ceil(c.secs - el));
      time.textContent = Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
      if (c.pace) {                                               // breathing pacer: circle grows on the in-breath and shrinks on the out-breath
        const cyc = c.pace[0] + c.pace[1], p = el % cyc, inh = p < c.pace[0];
        const k = inh ? p / c.pace[0] : 1 - (p - c.pace[0]) / c.pace[1];
        circle.style.transform = 'scale(' + (0.7 + 0.3 * k) + ')'; cue.textContent = inh ? 'Breathe in' : 'Breathe out';
      } else { circle.style.transform = 'scale(1)'; cue.textContent = 'Keep it easy'; }
      if (el >= c.secs) { if (Engine.ctx) Engine.click(Engine.ctx.currentTime, 1320, 0.15); this.next(); }
    };
    clearInterval(this.timer); this.timer = setInterval(tick, 100); tick();
  },
  renderDots() {
    const box = $('#rtDots'); box.textContent = '';
    this.active.steps.forEach((c, k) => { const d = document.createElement('span'); d.className = 'chip' + (k < this.i ? ' done' : k === this.i ? ' on' : ''); d.textContent = k < this.i ? '✔' : k + 1; box.appendChild(d); });
  },
  abort(msg) {
    if (!this.active) return; clearInterval(this.timer); this.active = null; $('#o-routine').classList.remove('on');
    if (msg) toast(msg); UI.show('train'); UI.trainView('menu');
  },
  finish() {
    const a = this.active; this.active = null; clearInterval(this.timer);
    (Store.data.routines = Store.data.routines || []).push({ ts: Date.now(), id: a.id, name: a.name, steps: a.steps.length, secs: Math.round((Date.now() - this.started) / 1000) });
    Store.save(); UI.show('train'); UI.trainView('menu'); toast(a.name + ' complete. Nice work!', 4000);
  },
  onFrame(fr) { if ($('#o-routine').classList.contains('on')) { const n = fr.midi == null ? '–' : noteName(fr.midi); if ($('#rtNote').textContent !== n) $('#rtNote').textContent = n; } }
};

/* ---- Routine builder ---- */
const Builder = {
  cur: null,
  open(r) {
    this.cur = r ? { id: r.id, name: r.name, steps: r.steps.slice() } : { id: null, name: '', steps: [] };
    const sel = $('#rbAdd');
    if (!sel.options.length) {
      const grp = (label, items) => { const g = document.createElement('optgroup'); g.label = label; items.forEach(i => { const o = document.createElement('option'); o.value = i[0]; o.textContent = i[1]; g.appendChild(o); }); sel.appendChild(g); };
      grp('Warm-up and rest', Object.keys(COACH).map(k => ['c:' + k, COACH[k].title]));
      grp('Guide', [['g', 'Do Re Mi guide']]);
      [...new Set(EXERCISES.map(e => e.group))].forEach(gn => grp(gn, EXERCISES.filter(e => e.group === gn).map(e => ['x:' + e.id, e.name])));
    }
    $('#rbName').value = this.cur.name; $('#rbDel').hidden = !r || r.id === 'adaptive'; this.render(); $('#o-rbuild').classList.add('on');
  },
  render() {
    const box = $('#rbSteps'); box.textContent = ''; const st = this.cur.steps;
    st.forEach((c, i) => {
      const row = document.createElement('div'); row.className = 'stat'; row.style.alignItems = 'center';
      const l = document.createElement('span'); l.textContent = (i + 1) + '. ' + Routine.title(c); const bx = document.createElement('span');
      [['↑', -1], ['↓', 1], ['✕', 0]].forEach(a => { const b = document.createElement('button'); b.className = 'btn'; b.style.cssText = 'min-height:2.125rem;padding:2px 0.625rem;margin-left:4px'; b.textContent = a[0];
        b.onclick = () => { if (a[1] === 0) st.splice(i, 1); else if (i + a[1] >= 0 && i + a[1] < st.length) { const t = st[i]; st[i] = st[i + a[1]]; st[i + a[1]] = t; } this.render(); }; bx.appendChild(b); });
      row.append(l, bx); box.appendChild(row);
    });
    if (!st.length) box.innerHTML = '<p class="muted small">No steps yet. Add some below.</p>';
    $('#rbTime').textContent = st.length ? '≈ ' + Routine.minutes({ steps: st }) + ' min · ' + st.length + ' steps' : '';
  },
  save() {
    if (!this.cur.steps.length) { toast('Add at least one step.'); return; }
    const r = { id: this.cur.id || 'c' + Date.now(), name: $('#rbName').value.trim() || 'My routine', steps: this.cur.steps }, L = Store.data.customRoutines = Store.data.customRoutines || [];
    const i = L.findIndex(x => x.id === r.id); if (i >= 0) L[i] = r; else L.push(r);
    Store.save(); this.close(); UI.refresh(); toast('Routine saved.');
  },
  del() { Store.data.customRoutines = (Store.data.customRoutines || []).filter(x => x.id !== this.cur.id); Store.save(); this.close(); UI.refresh(); },
  close() { $('#o-rbuild').classList.remove('on'); }
};

