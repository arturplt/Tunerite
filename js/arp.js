"use strict";
/* Live arpeggiator for the notes you play on the Piano tab. While it is on, a held key is not sounded straight away: Engine.playNote hands it to Arp.add, and a
   small scheduler plays the held notes one at a time, in the chosen order, a little ahead of the audio clock. The patterns are the same as the Compose editor's. */
const Arp = {
  PATS: ['up', 'down', 'updown', 'random'], PATN: ['Up', 'Down', 'Up-down', 'Random'], held: new Map(), n: 0, timer: null, nextT: 0, i: 0,
  cfg() { const s = Store.data.settings; return Object.assign({ on: false, rate: 0.5, pat: 0, gate: 0.6, oct: 0 }, s.arp); },
  get on() { return !!this.cfg().on; },
  stepSec() { return 1 / (2 * Math.pow(8, this.cfg().rate)); },      // two to sixteen notes a second
  add(midi, o) {
    const id = ++this.n; this.held.set(id, { midi, vel: o.vel || 100, gain: o.gain }); this.start();
    return { release: () => this.drop(id), stop: () => this.drop(id) };
  },
  drop(id) { this.held.delete(id); if (!this.held.size) this.halt(); },
  start() { if (this.timer || !Engine.ctx) return; if (Engine.ctx.state !== 'running') Engine.ctx.resume().catch(() => {}); this.nextT = Engine.ctx.currentTime + 0.01; this.i = 0; this.timer = setInterval(() => this.tick(), 25); this.tick(); },
  halt() { clearInterval(this.timer); this.timer = null; },
  clear() { this.held.clear(); this.halt(); },
  /* The order the next notes come in: every held pitch, repeated an octave higher for each extra octave of range. */
  order() {
    const c = this.cfg(), ps = Array.from(new Set(Array.from(this.held.values()).map(h => h.midi))).sort((a, b) => a - b); let all = [];
    for (let o = 0; o <= c.oct; o++) ps.forEach(m => all.push(m + 12 * o));
    const p = this.PATS[c.pat] || 'up';
    if (p === 'down') all.reverse(); else if (p === 'updown') all = all.concat(all.slice(1, -1).reverse());
    return all;
  },
  /* each step blinks the lamp on the Arp switch, so you can see it running even before you hear it */
  flash() { const b = document.getElementById('arpOn'); if (!b) return; b.classList.add('step'); clearTimeout(this.ft); this.ft = setTimeout(() => b.classList.remove('step'), 70); },
  tick() {
    const c = Engine.ctx; if (!c) return;
    if (!this.on) { this.halt(); return; }
    const step = this.stepSec(), cf = this.cfg();
    while (this.nextT < c.currentTime + 0.12) {
      const seq = this.order(); if (!seq.length) return;
      const m = this.PATS[cf.pat] === 'random' ? seq[Math.floor(Math.random() * seq.length)] : seq[this.i % seq.length], any = Array.from(this.held.values())[0];
      this.i++; this.flash();
      /* each step is a real key press and release, so slow attacks, SoundFont envelopes and the envelope editor all behave as they do when you play */
      try {
        const when = Math.max(this.nextT, c.currentTime), len = Math.max(0.04, step * (0.1 + 0.9 * cf.gate)), h = Engine.playNote(m, when, 30, { gain: any.gain, vel: any.vel, live: true, arp: true, sustain: true });
        if (h && h.release) setTimeout(() => { try { h.release(); } catch (e) { /* already gone */ } }, Math.max(0, (when + len - c.currentTime) * 1000));
      } catch (e) { console.error('Arpeggio:', e); if (!this.warned) { this.warned = true; toast('Arpeggio problem: ' + (e && e.message || e), 5000); } }
      this.nextT += step;
    }
  }
};
