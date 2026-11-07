"use strict";
/* Key, scale and chords for the Piano tab. With a scale chosen, the keys outside it are greyed out (and can be locked, so they make no sound); with a chord mode on, each key you press plays the chord built on that scale degree, in the right intervals: C major gives C, Dm, Em, F, G, Am and B dim. */
const Scale = {
  SCALES: [['off', 'Off'], ['major', 'Major'], ['minor', 'Minor'], ['pentmaj', 'Pent maj'], ['pentmin', 'Pent min'], ['blues', 'Blues min'], ['bluesmaj', 'Blues maj'], ['dorian', 'Dorian'], ['mixo', 'Mixolydian'], ['harm', 'Harm. minor']],
  /* chord modes: the scale degrees stacked on the key you press (0 is the key itself) */
  CHORDS: [['off', 'Single'], ['triad', 'Triads', [0, 2, 4]], ['sus2', 'Sus 2', [0, 1, 4]], ['sus4', 'Sus 4', [0, 3, 4]], ['7sus4', '7sus4', [0, 3, 4, 6]], ['sus24', 'Sus 2+4', [0, 1, 3, 4]], ['dim', 'Dim', null, [0, 3, 6]], ['dim7', 'Dim 7', null, [0, 3, 6, 9]], ['hdim', 'Half-dim', null, [0, 3, 6, 10]], ['7th', '7ths', [0, 2, 4, 6]], ['9th', '9ths', [0, 2, 4, 6, 8]], ['power', 'Power', [0, 4]]],
  cfg() { const s = Store.data.settings; if (!s.pk) s.pk = { key: 0, scale: 'off', lock: true, chord: 'off' }; return s.pk; },
  /* Only the Piano tab and the on-screen piano use it, never Practice or Compose recording. */
  here() { return (typeof UI !== 'undefined' && UI.screen === 'piano') || (typeof Keys !== 'undefined' && Keys.on); },
  get on() { return this.cfg().scale !== 'off'; },
  get locked() { const c = this.cfg(); return this.here() && c.scale !== 'off' && c.lock; },
  pcs() { const c = this.cfg(); return c.scale === 'off' ? null : new Set((Ed.SCALES[c.scale] || Ed.SCALES.major).map(i => (i + c.key) % 12)); },
  has(m) { const p = this.pcs(); return !p || p.has(((m % 12) + 12) % 12); },
  blocked(m) { return this.locked && !this.has(m); },
  /* The notes a key plays: itself alone, or the chord stacked on its scale degree. */
  chordFor(m) {
    const c = this.cfg(), mode = this.CHORDS.find(x => x[0] === c.chord); if (!this.here() || !mode || (!mode[2] && !mode[3])) return [m];
    if (mode[3]) return mode[3].map(i => m + i).filter(x => x <= 127);      // diminished chords are fixed shapes: the same intervals above any key
    const p = this.pcs(); if (!p || !p.has(((m % 12) + 12) % 12)) return { power: [m, m + 7], sus2: [m, m + 2, m + 7], sus4: [m, m + 5, m + 7], '7sus4': [m, m + 5, m + 7, m + 10], sus24: [m, m + 2, m + 5, m + 7], '7th': [m, m + 4, m + 7, m + 10], '9th': [m, m + 4, m + 7, m + 10, m + 14] }[mode[0]] || [m, m + 4, m + 7];      // a key outside the scale gets a plain chord of the same kind
    const deg = []; for (let x = m; x <= m + 40; x++) if (p.has(((x % 12) + 12) % 12)) deg.push(x);
    return mode[2].map(i => deg[i]).filter(x => x != null && x <= 127);
  },
  /* Every key lit by what is held: with a chord mode on, the whole chord. */
  expand(list) { if (this.cfg().chord === 'off' || !this.here()) return list; const out = new Set(); list.forEach(m => this.chordFor(m).forEach(x => out.add(x))); return [...out]; },
  /* The name of a chord from its notes: C, Dm, Bdim, G7, Fmaj7 and so on. */
  nameOf(notes) {
    if (!notes.length) return ''; const r = notes[0], iv = notes.map(n => n - r).join(','), q = { '0,4,7': '', '0,3,7': 'min', '0,3,6': 'dim', '0,4,8': 'aug', '0,4,7,11': 'maj7', '0,3,7,10': 'min7', '0,4,7,10': '7', '0,3,6,10': 'min7b5', '0,3,6,9': 'dim7', '0,3,7,11': 'minMaj7', '0,2,7': 'sus2', '0,5,7': 'sus4', '0,5,7,10': '7sus4', '0,2,5,7': 'sus2+4', '0,7': '5' }[iv];
    return NOTE_NAMES[((r % 12) + 12) % 12] + (q != null ? q : '');
  },
  /* The chord of each degree of the scale, for the readout under the controls. */
  degrees() { const c = this.cfg(), p = this.pcs(); if (!p || c.chord === 'off') return null; const root = 60 + c.key, out = []; for (let m = root; m < root + 12; m++) if (p.has(m % 12)) out.push(this.nameOf(this.chordFor(m))); return out; },
  set(k, v) { this.cfg()[k] = v; Store.save(); this.paint(); if (k === 'scale' || k === 'key' || k === 'chord') { if (typeof Midi !== 'undefined' && Midi.panic) Midi.panic(); } },
  step(k, list, d) { const c = this.cfg(), i = list.findIndex(x => x[0] === c[k]); this.set(k, list[(i + d + list.length) % list.length][0]); },
  menu: null,
  /* Key, Scale and Chords are caps under the screen; each opens its list on the LCD, in place of the spectrogram, and the same cap (or the close key) puts the spectrogram back. */
  mount() {
    const host = $('#pnKey'); if (!host) return;
    const cap = (m, lab) => `<button class="synbtn kycap" type="button" data-m="${m}" aria-pressed="false" title="Choose the ${lab.toLowerCase()} on the screen">${lab}</button>`;
    host.innerHTML = `<div class="keycaps">${cap('key', 'Key')}${cap('scale', 'Scale')}${cap('chord', 'Chords')}<button class="synbtn kycap" id="pkLock" type="button" aria-pressed="true" aria-label="Lock" title="Lock: the keys outside the scale make no sound. Off, they are only greyed out.">Lock</button></div>`;
    const glass = $('.synglass'), spec = $('.synpane[data-p="spec"]');
    const pane = document.createElement('div'); pane.className = 'synpane lcdlist'; pane.dataset.p = 'scale'; pane.hidden = true;
    pane.innerHTML = '<div class="pkhead"><b id="pkTitle"></b><button class="synbtn" id="pkClose" type="button" aria-label="Close" title="Back to the spectrogram">✕</button></div><div id="pkRows" class="lcdrows"></div><div class="lcd keychords" id="pkDeg" hidden></div>';
    glass.insertBefore(pane, glass.querySelector('.synkeys'));
    const hud = document.createElement('div'); hud.className = 'pnkeyhud'; hud.id = 'pkHud'; hud.hidden = true; if (spec) spec.appendChild(hud);
    host.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b) this.open(b.dataset.m); });
    $('#pkClose').onclick = () => this.open(null);
    $$('.syntabs button').forEach(b => b.addEventListener('click', () => { this.menu = null; this.paint(); }));
    $('#pkLock').onclick = () => this.set('lock', !this.cfg().lock); this.paint();
  },
  open(m) {
    this.menu = m === this.menu ? null : m; if (typeof Synth !== 'undefined') Synth.show(this.menu ? 'scale' : 'spec'); this.rows(); this.paint();
  },
  rows() {
    const box = $('#pkRows'); if (!box || !this.menu) return; const c = this.cfg(), m = this.menu; box.textContent = ''; box.className = m === 'key' ? 'lcdrows' : 'lcdrows';
    $('#pkTitle').textContent = { key: 'Key', scale: 'Scale', chord: 'Chords' }[m];
    const mk = (text, on, click, parent) => { const r = document.createElement('div'); r.className = 'lcdrow' + (on ? ' on' : ''); r.setAttribute('role', 'option'); r.innerHTML = '<span></span>'; r.firstChild.textContent = text; r.onclick = click; parent.appendChild(r); };
    if (m === 'key') { const g = document.createElement('div'); g.className = 'pkgrid'; NOTE_NAMES.forEach((n, i) => mk(n, c.key === i, () => { this.set('key', i); this.rows(); }, g)); box.appendChild(g); }
    else (m === 'scale' ? this.SCALES : this.CHORDS).forEach(x => mk(x[1], c[m] === x[0], () => { this.set(m, x[0]); this.rows(); }, box));
  },
  paint() {
    const c = this.cfg(), set = (id, t) => { const el = $(id); if (el && el.textContent !== t) el.textContent = t; };
    
    const hud = $('#pkHud'); if (hud) { const parts = []; if (c.scale !== 'off') parts.push(NOTE_NAMES[c.key] + ' ' + this.SCALES.find(x => x[0] === c.scale)[1]); else if (c.key) parts.push('Key ' + NOTE_NAMES[c.key]); if (c.chord !== 'off') parts.push(this.CHORDS.find(x => x[0] === c.chord)[1]); hud.hidden = !parts.length; hud.textContent = parts.join(' · '); }
    $$('#pnKey [data-m]').forEach(b => b.setAttribute('aria-pressed', this.menu === b.dataset.m && typeof Synth !== 'undefined' && Synth.tab === 'scale'));
    const lk = $('#pkLock'); if (lk) { lk.setAttribute('aria-pressed', !!c.lock); lk.disabled = c.scale === 'off'; }
    const dg = this.degrees(), el = $('#pkDeg'); if (el) { el.hidden = !dg; if (dg) { el.textContent = ''; dg.forEach(n => { const s = document.createElement('span'); s.textContent = n; el.appendChild(s); }); } }
  }
};
