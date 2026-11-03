"use strict";
/* ---- UI ---- */
const UI = {
  lastIn: 0, screen: 'tuner', lastExercise: null, curSession: null,
  show(name) {
    if (name !== 'tuner' && name !== 'piano') VKeys.releaseAll();
    if (Session.s && name !== 'train') Session.stop();
    if (name !== 'seq' && Seq.playing && !Seq.acc) Seq.pause();
    this.screen = name; if (name === 'seq') Seq.render();
    $$('.screen').forEach(el => el.classList.toggle('on', el.id === 's-' + name));
    $$('#nav button').forEach(b => b.classList.toggle('on', b.dataset.s === name));
    this.refresh();
  },
  trainView(v) {
    $('#tr-menu').hidden = v !== 'menu'; $('#tr-sess').hidden = v !== 'sess'; $('#tr-res').hidden = v !== 'res';
    $('#s-train').classList.toggle('full', v === 'sess');
    if (v === 'menu') this.refresh();
  },
  refresh() {
    const S = Store.data, st = S.settings;
    const mode = st.trainMode === 'ear' ? 'ear' : st.trainMode === 'piano' ? 'piano' : st.inst === 'whistle' ? 'whistle' : 'sing', whistle = mode === 'whistle', view = st.prView === 'lib' ? 'lib' : st.prView === 'ex' ? 'ex' : 'course', course = view === 'course' && mode !== 'ear';
    $('#defaultRangeBanner').hidden = whistle ? !!S.rangeWhistle : !!S.range; $('#drbTxt').textContent = whistle ? 'Using a default whistle range.' : 'Using a default range.'; $('#btnFindRange2').textContent = whistle ? 'Find my whistle range' : 'Find my range';
    $('#trSingI').textContent = whistle ? '😗' : '🎤'; $('#trSingT').textContent = whistle ? 'Whistling' : 'Singing'; $('#trSingD').textContent = whistle ? 'The app listens to your whistle (400 Hz and up) and shows how close each note is.' : 'The app listens to your voice and shows how close each note is.';
    $('#trCourse').hidden = !course; if (course) Course.renderMap(mode); $('#trEx').hidden = view !== 'ex' || mode === 'ear'; $('#trLib').hidden = view !== 'lib' || mode === 'ear'; $('#trSing').hidden = mode === 'piano' || mode === 'ear'; $('#trPiano').hidden = mode !== 'piano'; $('#trEar').hidden = mode !== 'ear'; $('#prView').hidden = mode === 'ear'; if (mode === 'ear') Ear.renderMap();
    $$('#trMode button').forEach(b => b.classList.toggle('on', b.dataset.m === mode)); $$('#prView button').forEach(b => b.classList.toggle('on', b.dataset.v === view));
    Lib.f.kind = mode === 'piano' ? 'piano' : 'sing';
    const names = Midi.inputNames(), pin = $('#pxInput');
    pin.innerHTML = ''; const pt = document.createElement('div'); pt.textContent = names.length ? '🎹 Keyboard connected: ' + names.join(', ') : '🎤 No keyboard connected. I will listen through the microphone in Piano mode. Single notes work best, and chords need a quiet room.'; pin.appendChild(pt);
    if (!names.length) { const cb = document.createElement('button'); cb.className = 'btn'; cb.style.cssText = 'margin-top:0.5rem'; cb.textContent = 'Connect a keyboard'; cb.onclick = async () => { const ok = await Midi.connect(true); toast(ok ? Midi.lastMsg : Midi.lastMsg, 6000); UI.refresh(); }; pin.appendChild(cb); }
    renderPianoRecent($('#pxRecent'), 5);
    if (this.screen === 'train' && view === 'lib') Lib.render();
    $$('#menuDiff button').forEach(b => b.classList.toggle('on', b.dataset.d === st.diff));
    const rl = $('#rtList'); rl.textContent = '';
    const plan = adaptivePlan(countIssues(S.coachLog, 10));
    const today = { id: 'adaptive', name: "Today's plan", desc: plan.focus.length ? 'Warm-up, then drills for what the coach keeps finding: ' + plan.focus.join(', ') + '.' : 'Warm-up and a scale. As you practise, this adapts to your weak spots.', steps: plan.steps };
    const card = (r, edit) => {
      const b = document.createElement('button'); b.className = 'card';
      const bt = document.createElement('span'); bt.className = 'best'; bt.textContent = '≈ ' + Routine.minutes(r) + ' min · ' + r.steps.length + ' steps';
      const t = document.createElement('div'); t.className = 't'; t.textContent = r.name;
      const d = document.createElement('div'); d.className = 'muted small'; d.textContent = r.desc || r.steps.map(c => Routine.title(c)).join(' · ');
      b.append(bt, t, d); b.onclick = () => Routine.start(r); rl.appendChild(b);
      if (edit) { const e = document.createElement('button'); e.className = 'btn'; e.style.cssText = 'min-height:2rem;padding:2px 0.75rem;margin:-2px 0 0.5rem;font-size:.85rem'; e.textContent = 'Edit'; e.onclick = () => Builder.open(r); rl.appendChild(e); }
    };
    card(today); ROUTINES.forEach(r => card(r)); (S.customRoutines || []).forEach(r => card(r, true));
    const nb = document.createElement('button'); nb.className = 'card'; nb.innerHTML = '<div class="t">＋ Build your own routine</div><div class="muted small">Pick and order the steps you want.</div>'; nb.onclick = () => Builder.open(null); rl.appendChild(nb);
    // exercise list
    const best = {}; S.history.forEach(h => { best[h.ex] = Math.max(best[h.ex] || 0, h.score); });
    const list = $('#exList'); list.textContent = '';
    const hosts = new Map();      // one fold per group, even when a group's exercises are not next to each other in the list
    EXERCISES.forEach(e => {
      if (!hosts.has(e.group)) { const f = fold(e.group, 'ex:' + e.group); list.appendChild(f); hosts.set(e.group, f.body); }
      const host = hosts.get(e.group);
      const b = document.createElement('button'); b.className = 'card';
      const bt = document.createElement('span'); bt.className = 'best'; bt.textContent = best[e.id] != null ? 'Best ' + best[e.id] : '';
      const t = document.createElement('div'); t.className = 't'; t.textContent = e.name;
      const d = document.createElement('div'); d.className = 'muted small'; d.textContent = e.desc;
      b.append(bt, t, d); b.onclick = () => { this.lastExercise = e.id; Session.begin(e.id); }; host.appendChild(b);
    });
    // settings
    const M = S.midi, ml = $('#midiLoaded'); ml.hidden = !M;
    if (M) {
      $('#midiInfo').textContent = M.name + ' · ' + M.notes.length + ' notes · ' + Math.round(M.notes[M.notes.length - 1].start + M.notes[M.notes.length - 1].dur) + ' s';
      const sel = $('#midiTrack'); sel.hidden = MidiLib.units.length < 2;
      if (!sel.hidden && sel.options.length !== MidiLib.units.length) { sel.textContent = ''; MidiLib.units.forEach((u, i) => sel.add(new Option(u.label, i))); }
    }
    $('#setDiff').value = st.diff; $('#setHear').checked = st.hear; $('#setWait').checked = st.wait; $('#setFind').value = String(st.find); $('#setDrone').checked = st.drone; $('#setCues').checked = st.cues;
    $('#setGuide').value = st.guide; $('#setVol').value = st.vol; $('#setA4').value = st.a4; $('#setInst').value = st.inst; if (!SF.sf && st.timbre === 'sf') $('#setTimbre').value = 'soft'; $('#setKbPlay').checked = st.kbPlay !== false; $('#setUi').value = st.uiSize || 'large'; $('#setTempo').value = st.tempo || 100; $('#tempoVal').textContent = (st.tempo || 100) + '%'; $('#tmVal').textContent = (st.tempo || 100) + '%'; $('#setTimbre').value = st.timbre; $$('.fxRv').forEach(e => e.value = st.reverb || 'off'); $$('.fxCh').forEach(e => e.checked = !!st.chorus); $$('[data-fx]').forEach(el => { const v = st[el.dataset.fx]; if (el.type === 'checkbox') el.checked = !!v; else if (v != null) el.value = v; }); $('#setKb').checked = !!st.kbSound; $$('#instSeg button').forEach(b => b.classList.toggle('on', b.dataset.i === st.inst)); $('#specLine').checked = st.specLine !== false; $('#setGate').value = st.gateDb;
    $('#gateMark').style.left = clamp((st.gateDb + 80) / 80 * 100, 0, 100) + '%';
    // progress
    const H = S.history;
    const streak = computeStreak(H.concat(S.routines || [], S.guideLog || [], S.pianoLog || [], S.earLog || [])); $('#pStreak').textContent = streak + ' day' + (streak === 1 ? '' : 's');
    $('#pCount').textContent = H.length; $('#pRoutines').textContent = (S.routines || []).length;
    $('#pRange').textContent = (S.range ? noteName(S.range.lo) + '–' + noteName(S.range.hi) : 'not set') + (S.rangeWhistle ? ' · whistle ' + noteName(S.rangeWhistle.lo) + '–' + noteName(S.rangeWhistle.hi) : '');
    if (S.rangeLog.length > 1) {
      const a = S.rangeLog[0], b = S.rangeLog[S.rangeLog.length - 1], d = (b.hi - b.lo) - (a.hi - a.lo);
      $('#pGrowth').textContent = (d > 0 ? '+' : '') + d + ' semitones';
    } else $('#pGrowth').textContent = S.range ? 'measure again later' : '–';
    const iss = $('#pIssues'); iss.textContent = ''; const log = (S.coachLog || []).slice(-10), cnt = countIssues(log, 10);
    Object.keys(cnt).filter(id => ISSUES[id] && cnt[id] >= 2).sort((a, b) => cnt[b] - cnt[a]).forEach(id => {
      const d = document.createElement('div'); d.className = 'card'; d.style.marginTop = '0.375rem';
      d.innerHTML = '<span class="best"></span><div class="t"></div><div class="muted small"></div>'; d.children[0].textContent = cnt[id] + ' of last ' + log.length; d.children[1].textContent = ISSUES[id][0]; d.children[2].textContent = ISSUES[id][1]; iss.appendChild(d);
    });
    if (!iss.children.length) iss.innerHTML = '<p class="muted">' + (log.length < 3 ? 'Do a few exercises and the coach will start spotting habits.' : 'Nothing recurring. Nice.') + '</p>';
    { const P = Ear.prog(), el = S.earLog || []; $('#pEar').textContent = EAR.LEVELS.filter(l => P[l.id] && P[l.id].stars >= 1).length + ' / ' + EAR.LEVELS.length; $('#pEarStars').textContent = EAR.LEVELS.reduce((a, l) => a + (P[l.id] ? P[l.id].stars : 0), 0) + ' / ' + EAR.LEVELS.length * 3; $('#pEarPct').textContent = el.length ? Math.round(100 * el.reduce((a, e) => a + e.ok, 0) / Math.max(1, el.reduce((a, e) => a + e.n, 0))) + '%' : '–'; }
    { const cb = $('#pCourse'); cb.textContent = ''; Object.keys(COURSE.KINDS).forEach(k => { const m = COURSE.summary(k, Course.prog(k)), r = document.createElement('div'); r.className = 'stat'; r.innerHTML = '<span></span><b></b>'; r.children[0].textContent = COURSE.KINDS[k].ico + ' ' + COURSE.KINDS[k].name; r.children[1].textContent = m.passed + ' / ' + m.total + ' levels · ' + m.stars + ' ★'; cb.appendChild(r); }); cb.lastChild.style.border = '0'; }
    const pl = S.pianoLog || []; $('#pPiano').textContent = pl.length;
    $('#pPianoPct').textContent = pl.length ? Math.round(100 * pl.reduce((a, p) => a + p.firstTry, 0) / Math.max(1, pl.reduce((a, p) => a + p.steps, 0))) + '%' : '–';
    const pb = $('#pPianoBest'); pb.textContent = '';
    PXS.forEach(d => { const L = pl.filter(p => p.ex === d.id); if (!L.length) return; const best = Math.max.apply(null, L.map(p => Math.round(100 * p.firstTry / Math.max(1, p.steps)))); const r = document.createElement('div'); r.className = 'stat'; r.innerHTML = '<span></span><b></b>'; r.children[0].textContent = d.name + ' (' + L.length + 'x)'; r.children[1].textContent = best + '%'; pb.appendChild(r); });
    if (!pb.children.length) pb.innerHTML = '<p class="muted">Nothing yet. Try a piano exercise.</p>';
    renderPianoRecent($('#pPianoRecent'), 8);
    const gl = S.guideLog || [];
    $('#pGuide').textContent = gl.length ? gl.length + ' · ' + (gl.reduce((a, g) => a + g.avgLock, 0) / gl.length / 1000).toFixed(1) + ' s per note' : '0';
    const bl = $('#pBest'); bl.textContent = '';
    EXERCISES.filter(e => best[e.id] != null).forEach(e => { const r = document.createElement('div'); r.className = 'stat'; r.innerHTML = '<span></span><b></b>'; r.children[0].textContent = e.name; r.children[1].textContent = best[e.id]; bl.appendChild(r); });
    if (!bl.children.length) bl.innerHTML = '<p class="muted">Nothing yet. Try an exercise.</p>';
    this.renderRecent();
    if (this.screen === 'progress') this.drawChart();
  },
  async renderRecent() {
    const box = $('#pRecent'); box.textContent = '';
    let keys = []; try { keys = await Takes.keys(); } catch (e) {}
    Store.data.history.slice(-8).reverse().forEach(h => {
      const r = document.createElement('div'); r.className = 'stat';
      const l = document.createElement('span'); l.textContent = new Date(h.ts).toLocaleDateString() + ' · ' + h.name;
      const rt = document.createElement('b'); rt.textContent = h.score + ' ' + '★'.repeat(h.stars);
      r.append(l, rt);
      if (h.take && keys.includes(h.take)) { const b = document.createElement('button'); b.className = 'btn'; b.style.cssText = 'min-height:2.25rem;padding:2px 0.75rem'; b.textContent = '▶'; b.onclick = async () => { const t = await Takes.get(h.take); if (t) replay(t); }; r.appendChild(b); }
      box.appendChild(r);
    });
    if (!box.children.length) box.innerHTML = '<p class="muted">No sessions yet.</p>';
  },
  drawChart() {
    const { g, w, h } = fitCanvas($('#chartCv')), H = Store.data.history.slice(-30);
    g.clearRect(0, 0, w, h); g.strokeStyle = '#26314f'; g.fillStyle = '#8d99b5'; g.font = (11 * UIK) + 'px sans-serif'; g.lineWidth = 1;
    [0, 50, 100].forEach(v => { const y = 10 + (h - 30) * (1 - v / 100); g.beginPath(); g.moveTo(30, y); g.lineTo(w, y); g.stroke(); g.fillText(v + '%', 0, y + 4); });
    if (H.length < 2) { g.fillText('Complete two sessions to see a trend', 40, h / 2); return; }
    g.strokeStyle = '#ffb347'; g.lineWidth = 3; g.lineJoin = 'round'; g.beginPath();
    H.forEach((e, i) => { const x = 30 + (w - 40) * i / (H.length - 1), y = 10 + (h - 30) * (1 - e.acc); i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
  },
  showResults(s) {
    const r = s.result, tol = s.tol;
    $('#rTitle').textContent = s.ex.name; $('#rScore').textContent = r.agg.score;
    $('#rStars').textContent = '★'.repeat(r.agg.stars) + '☆'.repeat(3 - r.agg.stars);
    const stats = [['Accuracy', Math.round(r.agg.acc * 100) + '% within ±' + tol + '¢'],
      ['Average deviation', r.agg.dev == null ? '–' : describeDeviation(r.agg.dev, tol)],
      ['Stability', r.agg.sd == null ? '–' : r.agg.sd.toFixed(1) + '¢ wobble'],
      ['Attack', r.agg.attack == null ? 'never locked on' : r.agg.attack.toFixed(2) + ' s to lock on']];
    const box = $('#rStats'); box.textContent = '';
    stats.forEach(x => { const d = document.createElement('div'); d.className = 'stat'; d.innerHTML = '<span></span><b></b>'; d.children[0].textContent = x[0]; d.children[1].textContent = x[1]; box.appendChild(d); });
    const nl = $('#rNotes'); nl.textContent = '';
    s.ex.events.forEach((ev, i) => {
      const d = document.createElement('div'); d.className = 'stat'; d.innerHTML = '<span></span><b></b>';
      const sungName = ev.midi2 == null && r.per[i].dev != null ? noteName(ev.midi + r.per[i].dev / 100) : null;
      d.children[0].textContent = ev.midi2 == null ? 'Sing ' + noteName(ev.midi) + (sungName ? ' · you sang ' + sungName : ' · not heard') : noteName(ev.midi) + ' → ' + noteName(ev.midi2);
      d.children[1].textContent = describeDeviation(r.per[i].dev, tol) + ' · ' + Math.round(r.per[i].accuracy * 100) + '%';
      nl.appendChild(d);
    });
    const tips = analyseTake(s.ex.events, r.frames, r.per, tol, s.find), shown = tips.slice(0, 4), tb = $('#rTips'); tb.textContent = '';
    const seen = countIssues(Store.data.coachLog, 9);
    const prev = Store.data.history.filter(h => h.ex === s.ex.id && h.ts < r.rec.ts).pop();
    const lead = document.createElement('div'); lead.className = 'card';
    const bestI = r.per.reduce((b, p, i) => p.accuracy > r.per[b].accuracy ? i : b, 0), worstI = r.per.reduce((b, p, i) => p.accuracy < r.per[b].accuracy ? i : b, 0), nm = i => noteName(s.ex.events[i].midi) + (s.ex.events[i].v ? ' ' + s.ex.events[i].v : '');
    let lt = (prev ? (r.agg.score > prev.score ? 'Up ' + (r.agg.score - prev.score) + ' points from last time. ' : r.agg.score < prev.score ? 'Down ' + (prev.score - r.agg.score) + ' points from last time. ' : 'Same score as last time. ') : '');
    if (s.ex.events.length > 1 && r.per[bestI].accuracy - r.per[worstI].accuracy > 0.2) lt += 'Strongest note: ' + nm(bestI) + ' (' + Math.round(r.per[bestI].accuracy * 100) + '%). Weakest: ' + nm(worstI) + ' (' + Math.round(r.per[worstI].accuracy * 100) + '%).';
    if (s.practice) lt = 'Practice run: you skipped around, so this is not saved to Progress. ' + lt;
    if (s.tempo && s.tempo !== 1) lt += ' Tempo ' + Math.round(s.tempo * 100) + '%.';
    if (lt) { lead.textContent = lt; tb.appendChild(lead); }
    if (!shown.length) { const d = document.createElement('div'); d.className = 'card'; d.textContent = r.agg.score >= 85 ? 'Nothing stands out to fix. Clean, steady singing. Try a harder difficulty or a new exercise.' : 'No clear pattern in the mistakes. Try again and focus on starting each note cleanly and holding it steady.'; tb.appendChild(d); }
    shown.forEach(tp => {
      const d = document.createElement('div'); d.className = 'card'; const t = document.createElement('div'); t.className = 't'; t.textContent = tp.head;
      const p = document.createElement('div'); p.className = 'muted small'; p.textContent = tp.text; d.append(t, p);
      if (seen[tp.id] >= 2) { const q = document.createElement('div'); q.className = 'small'; q.style.cssText = 'color:var(--warn);margin-top:0.375rem'; q.textContent = 'Seen in ' + seen[tp.id] + ' of your last 9 exercises. This is worth working on.'; d.appendChild(q); }
      const ex = tp.ex && EXERCISES.find(e => e.id === tp.ex);
      if (ex && !Routine.active && ex.id !== s.ex.id) { const b = document.createElement('button'); b.className = 'btn'; b.style.cssText = 'min-height:2.25rem;padding:4px 0.75rem;margin-top:0.5rem'; b.textContent = 'Practise: ' + ex.name; b.onclick = () => { UI.lastExercise = ex.id; Session.begin(ex.id); }; d.appendChild(b); }
      tb.appendChild(d);
    });
    const flags = new Set(); shown.slice(0, 3).forEach(tp => tp.ev.forEach(i => flags.add(i)));
    if (!s.practice) (Store.data.coachLog = Store.data.coachLog || []).push({ ts: r.rec.ts, ex: s.ex.id, ids: [...new Set(tips.filter(t => t.p >= 60).slice(0, 3).map(t => t.id))] });
    if (Store.data.coachLog && Store.data.coachLog.length > 200) Store.data.coachLog.splice(0, Store.data.coachLog.length - 200);
    Store.save();
    s.flags = flags;
    $('#rReplay').disabled = true;
    $('#rAgain').textContent = 'Try again (space)';
    const nt = Routine.nextTitle(); $('#rNext').hidden = !Routine.active; $('#rNext').textContent = nt ? 'Next: ' + nt + ' ▶' : 'Finish ✔';
    this.trainView('res');
    requestAnimationFrame(() => drawRoll($('#resCv'), { events: s.ex.events, lo: s.ex.lo, hi: s.ex.hi, tol, frames: r.frames, static: true, total: s.ex.total, flags }));
    this.curSession = s;
  },
  enableReplay(take) { $('#rReplay').disabled = false; $('#rReplay').onclick = () => replay(take); },
  tickLevel() {
    const db = Engine.ready ? Engine.level : -90;
    $('#lvl').style.width = clamp((db + 80) / 80 * 100, 0, 100) + '%';
  }
};

