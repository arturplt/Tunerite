"use strict";
/* ---- Solfège guide: wait for each note of the major scale, then for it to be held ---- */
const Guide = {
  on: false, mode: 'scale', echo: null, matched: 0, skips: 0, locks: [], runStart: 0, stepStart: 0, logged: false, i: 0, root: 60, holdMs: 0, lastT: 0, lastIn: 0, lastVoice: 0, armAt: 0, inZone: false, done: false,
  STEPS: [0, 2, 4, 5, 7, 9, 11, 12], HOLD: 1000,
  NAMES: { pl: ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si', 'Do'], so: ['Do', 'Re', 'Mi', 'Fa', 'So', 'La', 'Si', 'Do'] },
  names() { return this.NAMES[Store.data.settings.guideNames] || this.NAMES.pl; },
  tol() { return Math.max(15, TOLERANCE[Store.data.settings.diff] || 25); },
  pickRoot() {                                                  // put the whole octave inside the user's range, centred
    const R = getRange(), want = Store.data.settings.guideRoot, ideal = (R.lo + R.hi) / 2 - 6;
    const pick = pc => {
      let best = null;
      for (let m = R.lo - 2; m <= Math.max(R.lo, R.hi - 12) + 1; m++) {
        if (pc != null && ((m % 12) + 12) % 12 !== +pc) continue;
        if (best == null || Math.abs(m - ideal) < Math.abs(best - ideal)) best = m;
      }
      return best;
    };
    const r = want === 'auto' ? (pick(0) != null ? pick(0) : pick(null)) : pick(want);   // auto: Do = C when an octave of C fits the range
    return r == null ? R.lo : r;
  },
  target() { return this.mode === 'echo' ? this.echo : this.root + this.STEPS[this.i]; },
  setMode(m) {
    this.mode = m; const echo = m === 'echo';
    $('#gTitle').textContent = echo ? 'Play it, then sing it' : 'Do Re Mi guide';
    $('#gBack').hidden = $('#gSkip').hidden = echo; $('#gRoot').parentNode.hidden = $('#gNames').parentNode.hidden = echo; $('#gFirst').parentNode.hidden = echo;
  },
  open() {
    const st = Store.data.settings, sel = $('#gRoot');
    if (!sel.options.length) { const o = document.createElement('option'); o.value = 'auto'; o.textContent = 'auto'; sel.appendChild(o); NOTE_NAMES.forEach((n, p) => { const o2 = document.createElement('option'); o2.value = p; o2.textContent = n; sel.appendChild(o2); }); }
    sel.value = st.guideRoot; $('#gNames').value = st.guideNames; $('#gFirst').checked = st.guideFirst;
    this.setMode('scale'); this.on = true; this.done = false; this.root = this.pickRoot();
    $('#o-guide').classList.add('on'); this.go(0);
  },
  /* Keyboard mode: press a key, then sing that note. Needs headphones on the piano, otherwise the mic hears the piano. */
  openEcho() {
    this.setMode('echo'); this.on = true; this.done = false; this.echo = null; this.queue = []; this.chordKeys = null; this.chordBuf = []; this.matched = 0; this.holdMs = 0; this.lastT = performance.now();
    $('#o-guide').classList.add('on'); this.echoPrompt('Play a key, then sing it. Play a whole chord and sing its notes one by one.');
  },
  echoPrompt(hint) {
    const box = $('#gSteps'); box.textContent = ''; const c = document.createElement('span'); c.className = 'chip on'; c.textContent = 'MATCHED ' + this.matched; box.appendChild(c);
    $('#gName').textContent = 'PLAY'; $('#gName').style.color = ''; $('#gSub').textContent = 'a key'; $('#gDir').textContent = '🎹 Play a key'; $('#gDir').style.color = ''; $('#gHint').textContent = hint;
    $('#gHold').style.width = '0'; $('#gMark').style.opacity = 0.3; $('#gMark').style.left = '50%';
  },
  /* Keys pressed within 160 ms of each other count as one chord. A chord of 3+ notes is sung one note at a time, low to high. */
  chordBuf: [], chordTimer: 0, queue: [], chordKeys: null,
  onKey(n) {
    if (!this.on || this.mode !== 'echo') return;
    this.chordBuf.push(n); clearTimeout(this.chordTimer);
    this.chordTimer = setTimeout(() => {
      const ks = [...new Set(this.chordBuf)].sort((a, b) => a - b); this.chordBuf = [];
      this.chordKeys = ks.length >= 3 ? ks : null; this.queue = this.chordKeys ? ks.slice(1) : [];
      this.setEcho(ks[0], 1200);
    }, 160);
  },
  setEcho(n, wait) {
    const now = performance.now(), nm = noteName(n), ck = this.chordKeys;
    this.echo = n; this.holdMs = 0; this.inZone = false; this.lastIn = 0; this.lastT = now; this.lastVoice = now; this.armAt = now + wait;   // the piano's own sound fades before we listen
    const where = ck ? ' · ' + (chordName(ck) || 'chord') + ', note ' + (ck.length - this.queue.length) + ' of ' + ck.length : '';
    $('#gName').textContent = nm.replace(/\d+$/, ''); $('#gName').style.color = ''; $('#gSub').textContent = nm + ' · ' + midiToFreq(n, Store.data.settings.a4).toFixed(1) + ' Hz' + where;
    $('#gDir').textContent = 'Now sing ' + nm; $('#gDir').style.color = ''; $('#gHint').textContent = ck ? 'Sing the chord one note at a time, lowest first. Any octave is fine.' : 'Any octave is fine. Headphones on the piano keep the mic from hearing it.';
    $('#gHold').style.width = '0'; $('#gZone').style.cssText = 'left:' + (50 - this.tol() / 2) + '%;width:' + this.tol() + '%'; $('#gMark').style.opacity = 0.3;
  },
  close() { this.on = false; $('#o-guide').classList.remove('on'); },
  go(i) {
    this.i = clamp(i, 0, 8); this.holdMs = 0; this.inZone = false; this.lastIn = 0; this.lastT = performance.now(); this.lastVoice = this.lastT; this.stepStart = this.lastT;
    if (this.i === 0) { this.skips = 0; this.locks = []; this.runStart = this.lastT; this.logged = false; }
    this.done = this.i >= 8;
    const nm = this.names(), box = $('#gSteps'); box.textContent = '';
    nm.forEach((n, k) => { const c = document.createElement('span'); c.className = 'chip' + (k < this.i ? ' done' : k === this.i ? ' on' : ''); c.textContent = n.toUpperCase(); box.appendChild(c); });
    if (this.done) {
      $('#gName').textContent = '✔'; $('#gName').style.color = 'var(--good)'; $('#gSub').textContent = 'Scale complete'; $('#gDir').textContent = 'Well done!'; $('#gDir').style.color = 'var(--good)';
      $('#gHint').textContent = 'Press Back to go again, or change the starting note below.'; $('#gHold').style.width = '100%';
      if (!this.logged) {                                                // remember the run: time per note shows progress
        this.logged = true;
        (Store.data.guideLog = Store.data.guideLog || []).push({ ts: Date.now(), root: this.root, secs: Math.round((performance.now() - this.runStart) / 1000), skips: this.skips, avgLock: this.locks.length ? this.locks.reduce((a, b) => a + b, 0) / this.locks.length : 0 });
        Store.save();
      }
      if (Routine.active) setTimeout(() => { if (Guide.on && Guide.done && Routine.active) { Guide.close(); Routine.next(); } }, 1800);
      return;
    }
    const t = this.target(), f = midiToFreq(t, Store.data.settings.a4);
    $('#gName').textContent = nm[this.i].toUpperCase(); $('#gName').style.color = ''; $('#gSub').textContent = noteName(t) + ' · ' + f.toFixed(1) + ' Hz';
    $('#gDir').textContent = 'Sing ' + nm[this.i].toUpperCase(); $('#gDir').style.color = ''; $('#gHint').textContent = 'Any octave is fine. Hum or sing softly.';
    $('#gHold').style.width = '0'; $('#gZone').style.cssText = 'left:' + (50 - this.tol() / 2) + '%;width:' + this.tol() + '%'; $('#gMark').style.left = '50%'; $('#gMark').style.opacity = 0.3;
    this.armAt = 0;
    if (Store.data.settings.guideFirst) { this.hear(); this.armAt = performance.now() + 1700; }   // do not listen while our own tone is playing
  },
  hear() { if (Engine.ctx && !this.done && this.target() != null) Engine.playNote(this.target(), Engine.ctx.currentTime + 0.05, 1.3, { gain: 0.3 }); },
  /* d = semitones the singer is above the target, wrapped to the nearest octave */
  advise(d) {
    const c = Math.abs(d * 100), up = d < 0, w = up ? 'Higher' : 'Lower', arrow = up ? '▲' : '▼';
    const how = c < 50 ? 'a tiny bit' : c < 100 ? 'a little' : c < 150 ? 'about a semitone' : 'about ' + Math.round(c / 100) + ' semitones';
    return { dir: arrow + ' ' + w, hint: Math.round(c) + '¢ too ' + (up ? 'low' : 'high') + ': go ' + how + ' ' + w.toLowerCase() + (c >= 100 ? '. One piano key is one semitone.' : '.') };
  },
  onFrame(fr) {
    if (!this.on || this.done || (this.mode === 'echo' && this.echo == null)) return;
    const now = performance.now(), dt = Math.min(100, now - this.lastT); this.lastT = now;
    if (now < this.armAt) return;
    if (fr.midi == null) {
      if (now - this.lastVoice > 250) { this.holdMs = 0; this.inZone = false; $('#gMark').style.opacity = 0.3; }
      if (now - this.lastVoice > 4000) { $('#gDir').textContent = this.mode === 'echo' ? 'Sing ' + noteName(this.echo) : 'Sing ' + this.names()[this.i].toUpperCase(); $('#gDir').style.color = ''; $('#gHint').textContent = 'I cannot hear you. Sing a little louder or move closer to the mic.'; }
      $('#gHold').style.width = (this.holdMs / this.HOLD * 100) + '%'; return;
    }
    this.lastVoice = now;
    const t = this.target(), d = ((fr.midi - t + 6) % 12 + 12) % 12 - 6, c = d * 100, tol = this.tol() * (this.inZone ? 1.4 : 1);
    this.inZone = Math.abs(c) <= tol;
    $('#gMark').style.opacity = 1; $('#gMark').style.left = (50 + clamp(c, -100, 100) / 2) + '%';
    if (this.inZone) {
      this.lastIn = now; this.holdMs += dt;
      $('#gDir').textContent = '✔ Hold it'; $('#gDir').style.color = 'var(--good)'; $('#gHint').textContent = 'Right on. Keep the note steady.';
    } else {
      if (now - this.lastIn > 250) this.holdMs = 0;
      const a = this.advise(d); $('#gDir').textContent = a.dir; $('#gDir').style.color = Math.abs(c) < 50 ? 'var(--warn)' : 'var(--bad)'; $('#gHint').textContent = a.hint;
    }
    $('#gHold').style.width = Math.min(100, this.holdMs / this.HOLD * 100) + '%';
    if (this.holdMs >= this.HOLD) {
      if (Engine.ctx) Engine.click(Engine.ctx.currentTime, 1320, 0.15);
      if (this.mode === 'echo') {
        this.matched++;
        if (this.queue.length) { this.setEcho(this.queue.shift(), 500); return; }
        const done = this.chordKeys ? (chordName(this.chordKeys) || 'the chord') + ' complete. ' : '';
        this.echo = null; this.chordKeys = null; this.echoPrompt(done + 'Matched ' + this.matched + '. Play another key or a chord.'); return;
      }
      this.locks.push(Math.max(0, now - Math.max(this.stepStart, this.armAt) - this.HOLD)); this.go(this.i + 1);
    }
  }
};

