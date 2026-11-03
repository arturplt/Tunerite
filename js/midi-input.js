"use strict";
/* ---- Web MIDI keyboard input (Chrome / Android; iOS Safari has no Web MIDI) ---- */
const Midi = {
  down: new Map(), access: null,
  keys() { return [...this.down.keys()].sort((a, b) => a - b); },
  chord() { return chordName(this.keys()); },

  lastMsg: '',
  describe(d) {
    const st = d[0] & 0xf0, n = d[1], nn = noteName(n);
    if (st === 0x90 && d[2] > 0) return 'note on ' + nn + ', velocity ' + d[2];
    if (st === 0x80 || st === 0x90) return 'note off ' + nn;
    if (st === 0xb0 && n === 64) return 'sustain pedal ' + (d[2] >= 64 ? 'down' : 'up');
    if (st === 0xb0) return 'controller ' + n + ' = ' + d[2];
    return 'message ' + Array.from(d).map(x => x.toString(16)).join(' ');
  },
  status(t) { this.lastMsg = t; const el = $('#midiStatus'); if (el) el.textContent = t; },
  /* Returns true when MIDI access was granted. On failure the status line says why and what to change. */
  bridge: null, bridgeName: null, poll: 0,
  /* tools/midi_bridge.py streams the keyboard over HTTP, for browsers whose own Web MIDI fails (Snap/Flatpak on Linux). */
  async tryBridge() {
    if (!location.protocol.startsWith('http')) return false;
    try {
      const ctl = new AbortController(), tm = setTimeout(() => ctl.abort(), 1200);
      const r = await fetch('/midi/status', { cache: 'no-store', signal: ctl.signal }); clearTimeout(tm);
      const j = r.ok ? await r.json() : null; if (!j || !j.bridge) return false;
      if (this.bridge) this.bridge.close();
      this.bridgeName = j.device; this.bridge = new EventSource('/midi'); this.bridge.onopen = () => this.panic();   // never keep notes from before a reconnect
      this.bridge.onmessage = e => this.msg(e.data.split(' ').map(h => parseInt(h, 16)));
      this.bridge.onerror = () => this.status('Lost the connection to the bridge. Is tools/midi_bridge.py still running?');
      this.stale = !(j.v >= 2);
      this.bridgeErr = j.error;
      const show = () => this.status(this.bridgeErr ? 'The bridge cannot read the keyboard: ' + this.bridgeErr + '.' : this.stale ? 'The MIDI bridge is an old version: it shows every key one press late. Stop it with Ctrl+C in its terminal and start it again: python3 tools/midi_bridge.py' : this.bridgeName ? 'Connected through the local bridge: ' + this.bridgeName : 'Bridge is running but sees no keyboard. Plug it in and switch it on.');
      show(); if (this.stale) toast('Old MIDI bridge running: restart it (Ctrl+C, then python3 tools/midi_bridge.py).', 8000); clearInterval(this.poll);
      this.poll = setInterval(async () => { try { const k = await (await fetch('/midi/status', { cache: 'no-store' })).json(); if (k.device !== this.bridgeName || k.error !== this.bridgeErr) { this.bridgeName = k.device; this.bridgeErr = k.error; show(); } } catch (e) {} }, 3000);
      Store.data.settings.midiOn = true; Store.save(); return true;
    } catch (e) { return false; }
  },
  inputNames() { return this.bridge ? (this.bridgeName ? [this.bridgeName] : []) : this.access ? [...this.access.inputs.values()].map(i => i.name) : []; },
  inputCount() { return this.bridge ? (this.bridgeName ? 1 : 0) : this.access ? this.access.inputs.size : 0; },
  async connect(user) {
    if (await this.tryBridge()) return true;
    if (!navigator.requestMIDIAccess) { this.status('This browser has no Web MIDI. Use Chrome or Edge on desktop or Android, or Firefox 108 or newer. iPhone Safari cannot do it.'); return false; }
    if (!window.isSecureContext) { this.status('The browser only allows MIDI on HTTPS or localhost, and this page is neither. Open it from https:// or http://localhost.'); return false; }
    try {
      this.access = this.access || await navigator.requestMIDIAccess();
      this.access.onstatechange = () => this.bind();
      Store.data.settings.midiOn = true; Store.save(); this.bind(); return true;
    } catch (e) {
      let state = ''; try { state = (await navigator.permissions.query({ name: 'midi' })).state; } catch (x) {}
      const n = e && e.name || 'error';
      if (n === 'InvalidStateError') { this.status('The browser could not start its MIDI system (InvalidStateError). On Linux this happens with Snap or Flatpak browsers, which are blocked from the sound system\'s MIDI port. Easiest fix: run python3 tools/midi_bridge.py, then open http://localhost:8000 (works in any browser). Or use Firefox after: sudo snap connect firefox:alsa. On Windows, restart the computer or unplug and replug the keyboard.'); return false; }
      this.status(state === 'denied' || n === 'SecurityError' || n === 'NotAllowedError'
        ? 'MIDI is blocked for this site (' + n + '). Click the lock icon in the address bar, set "MIDI devices" to Allow, reload the page and press Connect again. If the page uses a self-signed certificate, install the certificate or use mkcert, because Chrome refuses MIDI on pages with certificate errors.'
        : 'Could not open MIDI (' + n + (e && e.message ? ': ' + e.message : '') + ').');
      return false;
    }
  },
  bind() {
    const ins = [...this.access.inputs.values()];
    ins.forEach(i => { i.onmidimessage = e => this.msg(e.data); });
    this.down.clear(); this.at.clear();
    this.status(ins.length ? 'Connected: ' + ins.map(i => i.name).join(', ') : 'No keyboard found. Plug it in with the USB-to-Host port.');
  },
  voices: new Map(), pedal: false, held: new Set(), onNote: null, at: new Map(),
  /* Safety nets against a lost note-off: keys older than 25 s are released, and tapping the keyboard strip releases everything. */
  sweep(now) { this.at.forEach((t, n) => { if (now - t > 25000) { this.down.delete(n); this.at.delete(n); this.stopVoice(n); if (typeof VKeys !== 'undefined' && VKeys.voices.has(n)) { VKeys.voices.get(n).release(); VKeys.voices.delete(n); VKeys.sus.delete(n); } } }); },
  panic() {
    const had = this.down.size; this.down.clear(); this.at.clear(); this.held.clear(); this.pedal = false; this.voices.forEach((v, k) => this.stopVoice(k));
    if (typeof VKeys !== 'undefined') { VKeys.voices.forEach(v => v.release()); VKeys.voices.clear(); VKeys.sus.clear(); VKeys.keys.clear(); }      // the on-screen keys too
    if (typeof Engine !== 'undefined' && Engine.live) { Engine.live.forEach(v => { try { v.h.release(); } catch (e) { /* already gone */ } }); Engine.live.length = 0; }      // and any voice that lost its key
    if (typeof Arp !== 'undefined') Arp.clear();
    return had;
  },
  sound(n, vel) { if (Store.data.settings.kbSound && Engine.ctx && Engine.master) { this.stopVoice(n); this.voices.set(n, Engine.playNote(n, Engine.ctx.currentTime, 25, { gain: 0.04 + 0.26 * vel / 127, sustain: true, vel, live: true })); } },
  stopVoice(n) { const v = this.voices.get(n); if (v) { v.release(); this.voices.delete(n); } },
  msg(d, virtual) {
    if (this.rec) this.rec(d);
    const st = d[0] & 0xf0, n = d[1], lm = $('#midiLast'); if (lm) lm.textContent = 'Last received: ' + this.describe(d);
    if (st === 0x90 && d[2] > 0) { this.down.set(n, d[2]); this.at.set(n, performance.now()); this.held.delete(n); if (!virtual) this.sound(n, d[2]); if (this.onNote) this.onNote(n, d[2]); }
    else if (st === 0x80 || st === 0x90) { this.down.delete(n); this.at.delete(n); if (this.pedal) this.held.add(n); else this.stopVoice(n); }
    else if (st === 0xe0) { const x = (((d[2] << 7) | d[1]) - 8192) / 8192; Engine.setBend(x); if (window.Knobs && Knobs.bendV != null) { Knobs.bendV = 0.5 + x / 2; const bk = document.querySelector('#lowVoxKnobs .knob[data-k="bend"]'); if (bk) Knobs.paintEl(bk, Knobs.bendV, { bi: true, d: 0.5, k: 'bend', n: 'Bend' }); } }      // the pitch wheel
    else if (st === 0xb0 && n === 64) {                                    // sustain pedal
      this.pedal = d[2] >= 64;
      if (!this.pedal) { this.held.forEach(k => this.stopVoice(k)); this.held.clear(); }
    }
    else if (st === 0xb0 && (n === 123 || n === 120)) this.panic();   // all notes off
  }
};

