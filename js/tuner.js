"use strict";
/* ---- Tuner ---- */
const Tuner = {
  cents: 0, midi: null, flashUntil: 0, flashTxt: '', lastVoiced: 0, shown: 0,
  hint: { t: 0, n: 0, want: null, buf: null, dismissed: {} },
  chordNow: { t: 0, notes: [], prev: '', buf: null },
  /* Piano mode: listen for several notes at once. A set of notes is shown only when two checks in a row agree. */
  checkChord(now) {
    const c = this.chordNow, st = Store.data.settings, an = Engine.analyser;
    if (st.inst !== 'piano' || !an || !Engine.ready || Engine.level < st.gateDb) { c.notes = []; c.prev = ''; return; }
    if (now - c.t < 120) return; c.t = now;
    if (!c.buf || c.buf.length !== an.frequencyBinCount) c.buf = new Float32Array(an.frequencyBinCount);
    an.getFloatFrequencyData(c.buf);
    const ns = detectNotes(c.buf, Engine.ctx.sampleRate, an.fftSize, st.a4), key = ns.join(',');
    if (key === c.prev) c.notes = ns; else if (!ns.length) c.notes = [];
    c.prev = key;
  },
  /* Suggests a better sound source: keys pressed means piano, a lone high pure tone means whistle, a strong low tone while in whistle mode means voice. */
  checkHint(now) {
    const h = this.hint, st = Store.data.settings, an = Engine.analyser;
    if (now - h.t < 250 || !an) return; h.t = now;
    let want = null;
    if (st.inst === 'voice' && Midi.keys().length) want = 'piano';
    else {
      if (!h.buf || h.buf.length !== an.frequencyBinCount) h.buf = new Float32Array(an.frequencyBinCount);
      an.getFloatFrequencyData(h.buf);
      const hz = Engine.ctx.sampleRate / an.fftSize, D = h.buf, i0 = Math.floor(80 / hz), i1 = Math.floor(800 / hz);
      let pk = i0, pv = -200, lowv = -200;
      for (let i = i0; i < D.length; i++) if (D[i] > pv) { pv = D[i]; pk = i; }
      for (let i = i0; i < i1; i++) if (D[i] > lowv) lowv = D[i];
      const f = pk * hz;
      if (st.inst === 'voice' && pv > -75 && f >= 900 && f < 4500 && pv - lowv >= 25) want = 'whistle';
      else if (st.inst === 'whistle' && pv > -60 && f < 800) want = 'voice';
    }
    h.n = want && want === h.want ? h.n + 1 : want ? 1 : 0; if (want) h.want = want;
    const show = !!want && h.n >= 3 && !h.dismissed[want] && want !== st.inst;
    const box = $('#instHint'); if (box.hidden === show) box.hidden = !show;
    if (show) $('#instHintTxt').textContent = { whistle: 'That sounds like a whistle. Switch to Whistle mode?', piano: 'Keys are being played. Switch to Piano mode?', voice: 'That sounds like a voice. Switch to Voice mode?' }[want];
  },
  /* Finding the range on this screen: the three LCDs become LOW, HIGH and the size in octaves, the message line asks for the next note, and the keys become Next/Done, Redo and Exit.
     The dial, strip and lamps keep following the live note. After saving, the result stays up for a few seconds. */
  rangeShow: null, rangeMode: false, keyTxt: '',
  rangeOverride(now, voiced) {
    const rf = RangeFinder, on = rf.active && rf.onTuner, rs = !on && this.rangeShow && now < this.rangeShow.until ? this.rangeShow : null, mode = on || !!rs;
    if (mode !== this.rangeMode) { this.rangeMode = mode; ['LOW', 'HIGH', 'OCTAVES'].forEach((t, i) => { $$('#s-tuner .tnlcd small')[i].textContent = mode ? t : ['NOTE', 'CENTS', 'FREQ \u00b7 HZ'][i]; }); }
    const keys = on ? [rf.step === 0 ? 'NEXT' : 'DONE', 'REDO', 'EXIT'] : ['RANGE', 'A4 \u2212', 'A4 +'], kt = keys.join();
    if (kt !== this.keyTxt) { this.keyTxt = kt; $$('#s-tuner .tncap > span').forEach((s, i) => { s.textContent = keys[i]; }); }
    $('#tuRange').disabled = on && rf.best[rf.step] == null;
    if (!mode) return;
    const live = voiced ? Math.round(this.midi) : null, lo = on ? rf.best[0] : rs.lo, hi = on ? rf.best[1] : rs.hi, name = m => m == null ? '--' : noteName(m);
    const lt = lo != null ? name(lo) : on && rf.step === 0 ? name(live) : '--', ht = hi != null ? name(hi) : on && rf.step === 1 ? name(live) : '--', top = hi != null ? hi : on && rf.step === 1 ? live : null;
    $('#tunerNote').style.fontSize = ''; $('#ppNoteGhost').style.visibility = '';
    $('#tunerNote').textContent = lt; $('#tunerSign').textContent = ht[0]; $('#tunerCents').textContent = ht.slice(1) || ' ';
    $('#tunerHz').textContent = lo != null && top != null && top > lo ? ((top - lo) / 12).toFixed(1) : '--';
    $('#tunerMsg').textContent = rs ? (rs.hi - rs.lo) + ' SEMITONES SAVED' : rf.step === 0 ? (lo != null ? name(lo) + ' CAUGHT \u00b7 NEXT' : 'SING LOW, HOLD IT') : hi != null ? name(hi) + ' CAUGHT \u00b7 DONE' : 'SING HIGH, HOLD IT';
  },
  flash(txt) { this.flashTxt = txt; this.flashUntil = performance.now() + 1600; },
  onFrame(fr) { if (fr.midi != null) { this.midi = fr.midi; this.f = fr.f; this.lastVoiced = performance.now(); } },
  draw() {
    Midi.sweep(performance.now()); this.checkHint(performance.now()); this.checkChord(performance.now());
    const voiced = performance.now() - this.lastVoiced < 350 && this.midi != null;
    const now = performance.now(), target = voiced ? clamp(centsOff(this.midi), -50, 50) : 0;
    this.cents = target;
    TunerDial.fit(); TunerDial.paintInst(Math.max(0, TunerDial.INST.indexOf(Store.data.settings.inst)));
    TunerDial.update(target, Engine.ready ? Engine.level + 18 : null, now);      // the needles are springs; 0 VU sits at -18 dBFS
    $('#ppPower').classList.toggle('on', !!Engine.ready);
    const n = $('#tunerNote'), c = $('#tunerCents'), sg = $('#tunerSign'), hz = $('#tunerHz'), msg = $('#tunerMsg'), ks = Midi.keys(), hn = this.chordNow.notes, src = ks.length ? ks : hn.length >= 2 ? hn : [];
    const sz = s => { const v = s.length > 6 ? 'calc(var(--f8,64px)*.4)' : s.length > 3 ? 'calc(var(--f8,64px)*.75)' : ''; n.style.fontSize = v; $('#ppNoteGhost').style.visibility = v ? 'hidden' : ''; };
    let oct = null, zone = null;
    if (voiced) {
      const cn = centsOff(this.midi), rc = Math.round(cn);
      n.textContent = noteName(this.midi); sz(n.textContent); oct = Math.floor(Math.round(this.midi) / 12) - 1;
      sg.textContent = rc >= 0 ? '+' : '\u2212'; c.textContent = String(Math.abs(rc)).padStart(2, '0');
      zone = cn < -10 ? 'flat' : cn > 10 ? 'sharp' : 'tune';
      msg.textContent = Math.abs(cn) < 3 ? 'In tune' : Math.round(Math.abs(cn)) + '\u00a2 ' + (cn > 0 ? 'sharp \u25b2' : 'flat \u25bc');
      hz.textContent = this.f ? this.f.toFixed(1) : '\u2013\u2013';
    } else if (src.length) {                                       // keys pressed or a chord heard: name it large
      const dk = describeKeys(src); n.textContent = dk.name; sz(dk.name);
      sg.textContent = '+'; c.textContent = '00'; msg.textContent = dk.detail + ' \u00b7 ' + (ks.length ? 'Keys pressed' : 'Heard through the microphone'); hz.textContent = '\u2013\u2013';
    } else { n.textContent = '\u2013'; sz(''); sg.textContent = '+'; c.textContent = '00'; hz.textContent = '\u2013\u2013'; msg.textContent = Store.data.settings.inst === 'piano' ? 'Play a note' : Store.data.settings.inst === 'whistle' ? 'Whistle a note' : 'Sing a note'; }
    if (now < this.flashUntil) msg.textContent = this.flashTxt;                  // a short notice (the reference pitch) over the usual message
    this.rangeOverride(now, voiced);
    const pc = voiced ? ((Math.round(this.midi) % 12) + 12) % 12 : -1;
    [...$('#ppOcts').children].forEach((d, i) => d.classList.toggle('on', i === pc));
    $('#ppFlat').classList.toggle('on', zone === 'flat'); $('#ppTune').classList.toggle('on', zone === 'tune'); $('#ppSharp').classList.toggle('on', zone === 'sharp');
  }
};

