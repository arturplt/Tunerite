"use strict";
/* Effect knobs for Compose. Each one is a continuous amount (0 to 1) stored in settings.fxK and read by Engine.setFx; a knob that has never been touched
   leaves the Piano screen's dropdown in charge. Drag up or down (or left and right), scroll, or use the arrow keys; double-tap resets. */
const Knobs = {
  list: [
    { k: 'reverb', n: 'Reverb', d: 0, tip: 'Room to hall: the space around the notes' },
    { k: 'echo', n: 'Echo', d: 0, tip: 'Repeats that fade away' },
    { k: 'etime', n: 'Echo time', d: 0.4, bi: false, steps: 5, tip: 'How long between the echo repeats, as a note length: 1/16, 1/8, dotted 1/8, 1/4, dotted 1/4 or 1/2', dv: v => Seq.ECHO_NAMES[Math.round(v * 5)] },
    { k: 'efb', n: 'Feedback', d: 0.4, bi: false, tip: 'How many repeats the echo makes' },
    { k: 'chorus', n: 'Chorus', d: 0, tip: 'Thickens the sound with slightly detuned copies' },
    { k: 'trem', n: 'Tremolo', d: 0, tip: 'Volume pulse' },
    { k: 'vib', n: 'Vibrato', d: 0, tip: 'Pitch wobble' },
    { k: 'phase', n: 'Phaser', d: 0, tip: 'Slow sweeping whoosh' },
    { k: 'wide', n: 'Width', d: 0, tip: 'Stereo widener' },
    { k: 'drive', n: 'Drive', d: 0, tip: 'Overdrive: warm to crunchy' },
    { k: 'tone', n: 'Tone', d: 0.5, tip: 'Dark on the left, bright on the right' },
  ],
  /* Reverb type and size live in the Piano tab's own row, not in the shared rack, but they are stored and read like the others. */
  extra: [
    { k: 'rvtype', n: 'Type', d: 0, bi: false, steps: 3, tip: 'The kind of space: room, hall, plate (bright and metallic) or shimmer (a tail that sings an octave higher)', dv: v => ['Room', 'Hall', 'Plate', 'Shimmer'][Math.round(v * 3)] },
    { k: 'rvsize', n: 'Size', d: 0.5, bi: false, steps: 4, tip: 'How long the reverb tail rings, from tiny to huge', dv: v => ['Tiny', 'Small', 'Medium', 'Large', 'Huge'][Math.round(v * 4)] }
  ],
  GROUPS: [['SPACE', ['reverb', 'echo', 'etime', 'efb', 'wide']], ['MODULATION', ['chorus', 'trem', 'vib', 'phase']], ['TONE', ['drive', 'tone']]],
  /* Knobs in labelled sections, like the blocks of a synth panel. */
  mountGroups(host) {
    host.innerHTML = this.GROUPS.map(g => `<div class="synsec"><span class="synlab">${g[0]}</span><div class="knobs"></div></div>`).join('');
    host.querySelectorAll('.knobs').forEach((el, i) => this.mount(el, this.list.filter(f => this.GROUPS[i][1].includes(f.k)), k => this.val(k), (k, v) => this.set(k, v)));
  },
  /* The Piano tab's effects as one panel: a bypass button on top, then the Space, Modulation, Tone and Display sections, split by printed lines. */
  mountRack(host) {
    const MODS = [['mod', 'MODULATION', ['chorus', 'trem', 'vib', 'phase', 'wide']], ['tone', 'TONE', ['drive', 'tone']]];
    host.innerHTML = '<div class="synbyp"><div class="bypcell"><button class="bigjack" id="synBypass" aria-pressed="false" aria-label="Bypass all effects" title="Bypass: hear the sound without effects. Your knobs stay where they are. Press again to turn the effects back on."><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 13H4A7 7 0 0 1 18 13H20" stroke-linecap="butt"/><path d="M20 10L23 13L20 16Z" fill="currentColor" stroke="none"/><circle cx="11" cy="14" r="4" fill="currentColor" stroke="none"/></svg></button><b>Bypass</b></div><div class="bypcell"><button class="bigjack panic" id="synPanic" aria-label="Panic" title="Panic: let go of every key and stop the sustain pedal"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z"/><path d="M12 8v5M12 16.5v.5"/></svg></button><b>Panic</b></div><div class="bypcell"><button class="bigjack red" id="synReset" aria-label="Reset all effects" title="Reset: put every effect back to zero"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v5h5"/></svg></button><b>Reset</b></div></div>' +
      MODS.map(m => `<div class="synsec synmod mod-${m[0]}"><span class="synlab">${m[1]}</span><div class="knobs"></div><i class="jack in" data-j="${m[0]}-in"></i><i class="jack out" data-j="${m[0]}-out"></i></div>`).join('');
    host.querySelectorAll('.synmod .knobs').forEach((el, i) => this.mount(el, this.list.filter(f => MODS[i][2].includes(f.k)), k => this.val(k), (k, v) => this.set(k, v)));
    this.mountQuality($('#pnDisplay') || host);
    $('#synBypass').onclick = () => this.bypass();
    $('#synReset').onclick = () => this.reset();
    $('#synPanic').onclick = () => { VKeys.setPedal(false); VKeys.releaseAll(); toast('All keys released.', 1200); };
  },
  /* Bypass only turns the effects off for listening; every knob keeps its value. */
  bypass(on) {
    Engine.fxBypass = on != null ? on : !Engine.fxBypass;
    const b = $('#synBypass'), pn = $('#pnKnobs'); if (b) b.setAttribute('aria-pressed', !!Engine.fxBypass); if (pn) pn.classList.toggle('byp', !!Engine.fxBypass); this.lightSoon();
    Engine.setFx();
  },
  cables() {},   // the effects are one unit now; kept as a no-op so callers need no change
  /* The panel under the keyboard: an envelope editor for the notes you play, the effects that have no knob in the rack (octave layer, humanize, sustain, flanger) and pitch. */
  ENV0: { a: 0.35, d: 0.5, s: 0.7, r: 0.45 },
  envState() { const st = Store.data.settings; if (!st.env) st.env = Object.assign({}, this.ENV0); return st.env; },
  envTimes() { const e = this.envState(); return { a: 0.003 * Math.pow(2 / 0.003, e.a), d: 0.02 * Math.pow(150, e.d), s: e.s, r: 0.03 * Math.pow(100, e.r) }; },
  fmtT(t) { return t < 1 ? Math.round(t * 1000) + ' ms' : t.toFixed(2) + ' s'; },
  mountLow(host) {
    const OCT = ['off', 'up', 'down', 'both'], OCTN = ['Off', 'Up', 'Down', 'Both'], st = () => Store.data.settings;
    const sw = (id, label, tip) => `<button class="synbtn pntgl" id="${id}" type="button" aria-pressed="false" title="${tip}"><i class="kylamp"></i>${label}</button>`;
    const ENVNAMES = ['Pluck', 'Pad', 'Organ', 'Bell', 'Swell', 'Stab'], PRE = [{ a: 0.1, d: 0.35, s: 0.15, r: 0.35 }, { a: 0.75, d: 0.6, s: 0.8, r: 0.8 }, { a: 0.15, d: 0.3, s: 1, r: 0.2 },
      { a: 0.05, d: 0.85, s: 0, r: 0.7 }, { a: 0.85, d: 0.4, s: 0.9, r: 0.65 }, { a: 0.05, d: 0.25, s: 0, r: 0.1 }];
    $('#pnEnv').innerHTML = `<div class="synsec lowsec lowenv"><div class="envhead"><span class="synlab">ENVELOPE</span><div class="envpre" role="group" aria-label="Envelope programs">${ENVNAMES.map((n, i) => `<button class="synbtn envp" type="button" data-i="${i}" aria-pressed="false" title="Program ${i + 1}, ${n}: click to recall. Hold, or Shift and click, to store the current shape here.">${i + 1}</button>`).join('')}<button class="synbtn envp envm" type="button" data-i="m" aria-pressed="false" title="M, your own shape: it remembers the last envelope you set by hand. Click to recall. Hold, or Shift and click, to store the current shape here.">M</button><button class="synbtn envp red" type="button" id="envReset" aria-label="Reset envelope" title="Reset the envelope to its default shape"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12a8 8 0 1 0 3-6.2"/><path d="M4 4v5h5"/></svg></button></div><button class="synbtn pntgl sq envsw" id="envOn" type="button" aria-pressed="false" aria-label="Envelope on" title="Use this envelope for the notes you play. Off keeps each sound as it is."><i class="kylamp"></i>On</button></div>
        <div class="envbox"><canvas id="envCv" aria-label="Envelope editor: drag the squares"></canvas></div>
        <div class="lcd envread" id="envRead"></div>
        <div class="envctl"><div id="envKnobs" class="knobs"></div></div></div>`;
    const tgc = (id, label, tip) => `<div class="tgcell"><button class="synbtn pntgl sq" id="${id}" type="button" aria-pressed="false" aria-label="${label}" title="${tip}"><i class="kylamp"></i></button><b>${label}</b></div>`;
    $('#pnArp').innerHTML = `<div class="synsec lowsec lowarp"><span class="synlab">ARPEGGIO</span><div class="mixrow">${tgc('arpOn', 'Arp', 'Play the keys you hold one at a time instead of together')}<div id="arpKnobs" class="knobs"></div></div></div>`;
    host.innerHTML = `<span class="lowbreak"></span><div class="synsec lowsec lowpitch"><span class="synlab">PITCH</span><div id="lowPitchKnobs" class="knobs"></div></div>
      <div class="synsec lowsec lowdyn"><span class="synlab">DYNAMICS</span><div id="lowDynKnobs" class="knobs"></div></div>
      <div class="synsec lowsec lowfilt"><span class="synlab">EQ</span><div id="lowFiltKnobs" class="knobs"></div></div>
      <div class="synsec lowsec lowflt"><span class="synlab">FILTER</span><div id="lowFltKnobs" class="knobs"></div></div>`;
    $('#pnRev').innerHTML = '<div class="synsec lowsec lowrev"><span class="synlab">REVERB</span><div id="lowRevKnobs" class="knobs"></div></div>';
    $('#pnVoice').innerHTML = '<div class="synsec lowsec lowvox"><span class="synlab">VOICE</span><div id="lowVoxKnobs" class="knobs"></div></div>';
    $('#pnEcho').innerHTML = '<div class="synsec lowsec lowecho"><span class="synlab">ECHO</span><div id="lowEchoKnobs" class="knobs"></div></div>';
    this.mount($('#lowEchoKnobs'), this.list.filter(f => ['echo', 'etime', 'efb'].includes(f.k)), k => this.val(k), (k, v) => this.set(k, v));
    $('#pnPlay').innerHTML = `<div class="synsec lowsec lowmix"><div class="mixrow"><div id="mx1" class="knobs"></div>${tgc('tgHuman', 'Humanize', 'Tiny timing and volume changes, only for notes you play yourself')}${tgc('tgSus', 'Sustain', 'Hold the sustain pedal')}${tgc('tgFlange', 'Flanger', 'A sweeping flanger instead of the phaser')}<div id="mx2" class="knobs"></div>${tgc('tgPing', 'Ping-pong', 'The echo repeats bounce from the left speaker to the right')}</div></div>`;
    /* envelope knobs: Attack, Decay, Sustain, Release, stored as 0 to 1 */
    const E = [{ k: 'a', n: 'Attack', d: this.ENV0.a, tip: 'How fast the note swells in', dv: v => this.fmtT(0.003 * Math.pow(2 / 0.003, v)) }, { k: 'd', n: 'Decay', d: this.ENV0.d, tip: 'How long it takes to settle to the sustain level', dv: v => this.fmtT(0.02 * Math.pow(150, v)) },
      { k: 's', n: 'Sustain', d: this.ENV0.s, tip: 'The level it holds while the key is down' }, { k: 'r', n: 'Release', d: this.ENV0.r, tip: 'How long the sound rings after you let go', dv: v => this.fmtT(0.03 * Math.pow(100, v)) }];
    const envOn = (on) => { st().envOn = !!on; $('#envOn').setAttribute('aria-pressed', !!on); $('#pnEnv').classList.toggle('envoff', !on); Store.save(); };
    const envPut = (k, v) => { const e = this.envState(); e[k] = clamp(Math.round(v * 100) / 100, 0, 1); st().envMem = Object.assign({}, e); if (!st().envOn) envOn(true); Store.save(); this.envDraw(); };
    this.mount($('#envKnobs'), E, k => this.envState()[k], (k, v) => { envPut(k, v); });
    $('#envOn').onclick = () => envOn(!st().envOn);
    /* three program slots: click recalls, hold or Shift+click stores the current shape; and a reset */
    const slots = () => { const S = st(); if (!S.envPre) S.envPre = []; PRE.forEach((p, i) => { if (!S.envPre[i]) S.envPre[i] = Object.assign({}, p); }); S.envPre.length = PRE.length; return S.envPre; };
    const getSlot = i => i === 'm' ? (st().envMem || Object.assign({}, this.ENV0)) : slots()[+i], setSlot = (i, v) => { if (i === 'm') st().envMem = v; else slots()[+i] = v; };
    this.envPaintPre = () => { const e = this.envState(); $$('#pnEnv .envp[data-i]').forEach(b => { const p = getSlot(b.dataset.i); b.setAttribute('aria-pressed', !!(st().envOn && p && ['a', 'd', 's', 'r'].every(k => Math.abs(p[k] - e[k]) < 0.005))); }); };
    $$('#pnEnv .envp[data-i]').forEach(b => {
      const i = b.dataset.i; let timer = null, held = false;
      const store = () => { setSlot(i, Object.assign({}, this.envState())); Store.save(); this.envPaintPre(); toast('Envelope stored in ' + (i === 'm' ? 'M' : 'program ' + (+i + 1)), 1500); };
      b.addEventListener('pointerdown', () => { held = false; clearTimeout(timer); timer = setTimeout(() => { held = true; store(); }, 700); });
      const stop = () => clearTimeout(timer); b.addEventListener('pointerleave', stop); b.addEventListener('pointercancel', stop);
      b.addEventListener('click', e => {
        clearTimeout(timer); if (held) { held = false; return; }
        if (e.shiftKey) return store();
        Object.assign(this.envState(), getSlot(i)); if (!st().envOn) envOn(true); Store.save(); this.envDraw();
      });
    });
    $('#envReset').onclick = () => { Object.assign(this.envState(), this.ENV0); Store.save(); this.envDraw(); toast('Envelope reset', 1200); };
    /* effects without a knob in the rack */
    const F = [{ k: 'oct', n: 'Octave', d: 0, bi: false, steps: 3, tip: 'Adds a quieter octave above, below or both, for notes you play', dv: v => OCTN[Math.round(v * 3)] }];
    this.mount($('#mx1'), F, k => k === 'oct' ? Math.max(0, OCT.indexOf(st().fxOct)) / 3 : this.val(k),
      (k, v) => { if (k === 'oct') { st().fxOct = OCT[Math.round(clamp(v, 0, 1) * 3)]; Store.save(); this.paintLow(); } else this.set(k, v); });
    /* the Compose track effects the Piano tab did not have, on the same wiring */
    const LV = (k) => { const L = st().liveFx || {}; return L[k] != null ? L[k] : Seq.FX.find(f => f.k === k).d; };
    const mountLive = (id, keys) => this.mount($(id), keys.map(k => Seq.FX.find(f => f.k === k)), LV, (k, v) => { st().liveFx = Object.assign({}, st().liveFx, { [k]: v }); Store.save(); Seq.liveFx(); });
    mountLive('#lowDynKnobs', ['gate', 'comp', 'deess']); mountLive('#lowFiltKnobs', ['lowcut', 'highcut', 'midgain', 'midfreq']); mountLive('#mx2', ['lofi', 'apan', 'apanrate']);
    mountLive('#lowFltKnobs', ['fcut', 'freso', 'fsweep', 'fswrate']);
    this.mount($('#lowRevKnobs'), this.list.filter(f => f.k === 'reverb').concat(this.extra), k => this.val(k), (k, v) => this.set(k, v));
    const VX = [{ k: 'uni', n: 'Unison', d: 0, tip: 'Stacks two or four slightly detuned copies of each note across the stereo field: thick and wide' }, { k: 'glide', n: 'Glide', d: 0, tip: 'Slides from the last note you played to the next one' },
      { k: 'bend', n: 'Bend', d: 0.5, bi: true, tip: 'Pitch wheel, two semitones each way. It springs back to the middle when you let go. A MIDI keyboard\'s wheel works too' }];
    this.bendV = 0.5; this.mount($('#lowVoxKnobs'), VX, k => k === 'uni' ? st().fxUni || 0 : k === 'glide' ? st().fxGlide || 0 : this.bendV, (k, v) => {
      if (k === 'bend') { this.bendV = v; Engine.setBend((v - 0.5) * 2); } else { st()[k === 'uni' ? 'fxUni' : 'fxGlide'] = v; clearTimeout(this.st); this.st = setTimeout(() => Store.save(), 300); }
    });
    { const bk = $('#lowVoxKnobs .knob[data-k="bend"]'), bf = VX[2], back = () => { this.bendV = 0.5; Engine.setBend(0); this.paintEl(bk, 0.5, bf); }; ['pointerup', 'pointercancel', 'keyup', 'blur'].forEach(ev => bk.addEventListener(ev, back)); this.bendBack = back; }
    const P = [{ k: 'tr', n: 'Transpose', d: 0.5, bi: true, steps: 24, tip: 'Shifts the notes you play up or down by semitones', dv: v => { const t = Math.round(v * 24 - 12); return (t > 0 ? '+' : '') + t + ' st'; } },
      { k: 'ft', n: 'Fine tune', d: 0.5, bi: true, tip: 'Shifts the notes you play by cents (a hundredth of a semitone)', dv: v => { const t = Math.round(v * 100 - 50); return (t > 0 ? '+' : '') + t + ' ct'; } }];
    this.mount($('#lowPitchKnobs'), P, k => k === 'tr' ? ((st().transpose || 0) + 12) / 24 : ((st().fineTune || 0) + 50) / 100, (k, v) => {
      if (k === 'tr') st().transpose = Math.round(clamp(v, 0, 1) * 24 - 12); else st().fineTune = Math.round(clamp(v, 0, 1) * 100 - 50); Store.save();
    });
    /* arpeggiator: stored in settings.arp, played by Arp */
    const ac = () => Arp.cfg(), asv = (k, v) => { const s = st(); s.arp = Object.assign({}, ac(), { [k]: v }); Store.save(); };
    const A = [{ k: 'rate', n: 'Rate', d: 1 / 7, bi: false, steps: 7, tip: 'How fast the notes come, as a note length like the Echo time. Echo follows the Echo time exactly, so every echo repeat lands on an arpeggio step', dv: v => Arp.RATES[Math.round(v * 7)][0] },
      { k: 'pat', n: 'Pattern', d: 0, bi: false, steps: 3, tip: 'The order of the notes: up, down, up and down, or random', dv: v => Arp.PATN[Math.round(v * 3)] },
      { k: 'gate', n: 'Gate', d: 0.5, bi: false, tip: 'How long each note rings before the next one', dv: v => Math.round((0.1 + 0.9 * v) * 100) + '%' },
      { k: 'oct', n: 'Range', d: 0, bi: false, steps: 2, tip: 'How many octaves the arpeggio climbs through', dv: v => (Math.round(v * 2) + 1) + ' oct' }];
    this.mount($('#arpKnobs'), A, k => { const c = ac(); return k === 'pat' ? c.pat / 3 : k === 'oct' ? c.oct / 2 : c[k]; },
      (k, v) => { asv(k, k === 'pat' ? Math.round(clamp(v, 0, 1) * 3) : k === 'oct' ? Math.round(clamp(v, 0, 1) * 2) : v); });
    $('#arpOn').onclick = () => { asv('on', !ac().on); if (!ac().on) Arp.clear(); this.paintLow(); };
    const tg = (id, get, put) => { const b = $(id); b.onclick = () => { put(!get()); this.paintLow(); Store.save(); }; };
    tg('#tgHuman', () => !!st().fxHuman, v => { st().fxHuman = v; });
    tg('#tgSus', () => !!VKeys.pedal, v => VKeys.setPedal(v));
    tg('#tgPing', () => !!st().fxPing, v => { st().fxPing = v; Engine.setFx(); });
    tg('#tgFlange', () => st().fxPhase === 'flanger', v => { st().fxPhase = v ? 'flanger' : 'off'; Engine.setFx(); this.sync(); });
    this.envWire(); this.paintLow(); this.envDraw();
  },
  /* the switches and the on/off look of the envelope section */
  paintLow() {
    const st = Store.data.settings, set = (id, on) => { const b = $(id); if (b) b.setAttribute('aria-pressed', !!on); };
    this.lightSoon(); set('#tgHuman', st.fxHuman); set('#arpOn', st.arp && st.arp.on); set('#tgSus', VKeys.pedal); set('#tgFlange', st.fxPhase === 'flanger'); set('#tgPing', st.fxPing); set('#envOn', st.envOn);
    const lw = $('#pnEnv'); if (lw) lw.classList.toggle('envoff', !st.envOn);
  },
  /* the envelope picture: four draggable squares (attack peak, end of decay, start of release, end) on an LCD grid */
  envPts(w, h) {
    const e = this.envState(), pad = 14, W = w - 2 * pad, H = h - 2 * pad, seg = W / 4, y = lvl => pad + H * (1 - lvl);
    const x1 = pad + seg * e.a, x2 = x1 + seg * (0.15 + e.d * 0.85), x3 = pad + seg * 2.9 + 0, x4 = x3 + seg * (0.1 + e.r * 1.1);
    return { start: [pad, y(0)], att: [x1, y(1)], dec: [Math.max(x2, x1 + 6), y(e.s)], rel: [Math.max(x3, x2 + 20), y(e.s)], end: [Math.max(x4, x3 + 20 + 6) , y(0)], pad, H, W };
  },
  envDraw() {
    const cv = $('#envCv'); if (!cv || !cv.clientWidth) return;
    const { g, w, h } = fitCanvas(cv), P = this.envPts(w, h), t = this.envTimes(), on = !!Store.data.settings.envOn, u = 1 / (window.devicePixelRatio || 1), f = n => n * u;
    g.clearRect(0, 0, w, h); g.fillStyle = '#1a120a'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,170,60,0.10)'; g.lineWidth = 1; g.beginPath(); for (let i = 1; i < 8; i++) { const x = Math.round(w * i / 8) + 0.5; g.moveTo(x, 0); g.lineTo(x, h); } for (let i = 1; i < 4; i++) { const y = Math.round(h * i / 4) + 0.5; g.moveTo(0, y); g.lineTo(w, y); } g.stroke();
    /* the real shape: a soft rise, an exponential fall to the sustain level, a flat hold, an exponential release */
    const E = this.envState(), Y = L => P.start[1] + (P.att[1] - P.start[1]) * L, col = on ? '#ffb347' : '#6b4513', pts = [], N = 14, ex = t => (Math.exp(-5 * t) - Math.exp(-5)) / (1 - Math.exp(-5));
    for (let i = 0; i <= N; i++) { const t = i / N; pts.push([P.start[0] + (P.att[0] - P.start[0]) * t, Y((1 - Math.cos(Math.PI * t)) / 2)]); }
    for (let i = 1; i <= N; i++) { const t = i / N; pts.push([P.att[0] + (P.dec[0] - P.att[0]) * t, Y(E.s + (1 - E.s) * ex(t))]); }
    pts.push(P.rel);
    for (let i = 1; i <= N; i++) { const t = i / N; pts.push([P.rel[0] + (P.end[0] - P.rel[0]) * t, Y(E.s * ex(t))]); }
    g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.lineTo(P.end[0], P.start[1]); g.lineTo(P.start[0], P.start[1]); g.closePath(); g.fillStyle = on ? 'rgba(255,150,40,0.18)' : 'rgba(120,80,20,0.12)'; g.fill();
    g.lineJoin = 'round'; g.lineWidth = 2; g.strokeStyle = col; g.shadowColor = on ? 'rgba(255,160,50,0.7)' : 'transparent'; g.shadowBlur = on ? 6 : 0; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke(); g.shadowBlur = 0;
    g.setLineDash([3, 4]); g.strokeStyle = 'rgba(255,170,60,0.35)'; g.beginPath(); g.moveTo(P.dec[0], P.dec[1]); g.lineTo(P.rel[0], P.rel[1]); g.stroke(); g.setLineDash([]);
    [['att', 'A'], ['dec', 'D'], ['rel', 'S'], ['end', 'R']].forEach(([k, l]) => { const p = P[k], s = 9; g.fillStyle = '#120c05'; g.fillRect(p[0] - s / 2 - 1, p[1] - s / 2 - 1, s + 2, s + 2); g.fillStyle = on ? '#ffd08a' : '#a8731f'; g.fillRect(p[0] - s / 2, p[1] - s / 2, s, s);
      g.font = f(16) + 'px Silkscreen, ui-monospace, monospace'; g.fillStyle = '#6b4513'; g.textAlign = 'center'; g.fillText(l, p[0], Math.min(h - 3, p[1] + s + 10)); });
    const rd = $('#envRead'); if (rd) rd.innerHTML = `<span>A <b>${this.fmtT(t.a)}</b></span><span>D <b>${this.fmtT(t.d)}</b></span><span>S <b>${Math.round(t.s * 100)}%</b></span><span>R <b>${this.fmtT(t.r)}</b></span>`;
    if (this.envSync) this.envSync(); if (this.envPaintPre) this.envPaintPre();
  },
  envWire() {
    const cv = $('#envCv'); let drag = null;
    const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('pointerdown', e => {
      const [x, y] = pos(e), P = this.envPts(cv.clientWidth, cv.clientHeight); let best = null, bd = 22 * 22;
      [['att', 'a'], ['dec', 'd'], ['rel', 's'], ['end', 'r']].forEach(([k, p]) => { const d = (P[k][0] - x) ** 2 + (P[k][1] - y) ** 2; if (d < bd) { bd = d; best = k; } });
      if (best) { drag = best; cv.setPointerCapture(e.pointerId); e.preventDefault(); }
    });
    cv.addEventListener('pointermove', e => {
      if (!drag) return; const [x, y] = pos(e), w = cv.clientWidth, h = cv.clientHeight, P = this.envPts(w, h), seg = P.W / 4, E = this.envState(), st = Store.data.settings;
      if (drag === 'att') E.a = clamp((x - P.pad) / seg, 0, 1);
      else if (drag === 'dec') { E.d = clamp(((x - (P.pad + seg * E.a)) / seg - 0.15) / 0.85, 0, 1); E.s = clamp(1 - (y - P.pad) / P.H, 0, 1); }
      else if (drag === 'rel') E.s = clamp(1 - (y - P.pad) / P.H, 0, 1);
      else if (drag === 'end') E.r = clamp(((x - (P.pad + seg * 2.9)) / seg - 0.1) / 1.1, 0, 1);
      ['a', 'd', 's', 'r'].forEach(k => { E[k] = Math.round(E[k] * 100) / 100; }); st.envMem = Object.assign({}, E); if (!st.envOn) { st.envOn = true; this.paintLow(); }
      this.envDraw(); clearTimeout(this.st); this.st = setTimeout(() => Store.save(), 300);
    });
    const end = () => { drag = null; }; cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    if (window.ResizeObserver) new ResizeObserver(() => this.envDraw()).observe(cv);
    /* keep the four knobs in step with the picture */
    const kn = $$('#envKnobs .knob'); this.envSync = () => { const E = this.envState(), f = [{ k: 'a', d: this.ENV0.a, dv: v => this.fmtT(0.003 * Math.pow(2 / 0.003, v)) }, { k: 'd', d: this.ENV0.d, dv: v => this.fmtT(0.02 * Math.pow(150, v)) }, { k: 's', d: this.ENV0.s }, { k: 'r', d: this.ENV0.r, dv: v => this.fmtT(0.03 * Math.pow(100, v)) }]; kn.forEach((el, i) => this.paintEl(el, E[f[i].k], f[i])); };
  },
  /* Spectrogram quality as a dial (seven steps from 512, fast and coarse, to 32768, fine and slow) next to a four-step colour dial. Only the Piano panel has one. */
  mountQuality(host) {
    const sec = document.createElement('div'); sec.className = 'synsec synmod mod-disp'; sec.innerHTML = '<span class="synlab">DISPLAY</span><div class="knobs"></div><div class="disprow"><button class="synbtn pntgl sq envsw noisebtn" id="noiseBtn" type="button" aria-pressed="false" aria-label="Noise filter"><i class="kylamp"></i>Noise</button><button class="synbtn sqfull" id="specFullBtn" type="button" aria-label="Full screen spectrogram" title="Full screen spectrogram"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg></button><div class="lcdpx" title="How finely the spectrogram splits pitch (Hz per row) and how much time each picture covers"><small>RESOLUTION</small><b id="specFftInfo"></b></div></div><div id="sandCtl" class="sandctl" hidden><button type="button" class="synbtn" data-s="turn" title="Turn the pane over: the sand sifts down into new shapes">Turn</button><button type="button" class="synbtn" data-s="shake" title="Two quick jolts: towers taller than 4 topple">Shake</button><button type="button" class="synbtn" data-s="clear" title="Empty the pane">Empty</button><button type="button" class="synbtn" data-s="motion" aria-pressed="false" title="Use the phone\'s motion: shake it to shake the pane, turn it upside down to turn the pane over, tilt it to lean the sand">Motion</button></div><i class="jack in" data-j="disp-in"></i><i class="jack out" data-j="disp-out"></i><i class="jack gl" data-j="disp-g"></i>'; host.appendChild(sec);
    const VIEWS = ['water', 'spectrum', 'scope', 'chroma', 'sand'], NS = Spec.SIZES.length - 1, PALS = ['amber', 'green', 'ice', 'mono'], save = () => { clearTimeout(this.st); this.st = setTimeout(() => Store.save(), 300); };
    const f = { k: 'quality', n: 'Quality', d: Spec.SIZES.indexOf(16384) / NS, bi: false, steps: NS, tip: 'Spectrogram detail: left is fast with coarse pitch, right is fine pitch but slower', dv: v => Spec.SIZES[Math.round(v * NS)] + '' };
    const c = { k: 'colour', n: 'Colour', d: 0, bi: false, steps: 3, tip: 'Display colour: amber, green phosphor, ice or grey', dv: v => ['Amber', 'Green', 'Ice', 'Grey'][Math.round(v * 3)] };
    const ty = { k: 'type', n: 'Type', d: 0, bi: false, steps: 4, tip: 'Display type: waterfall, spectrum, scope, chroma or sand', dv: v => ['Water', 'Spectr', 'Scope', 'Chroma', 'Sand'][Math.round(v * 4)] };
    this.mount(sec.querySelector('.knobs'), [f, c, ty], k => k === 'type' ? Math.max(0, VIEWS.indexOf(Store.data.settings.specView || 'water')) / 4 : k === 'colour' ? Math.max(0, PALS.indexOf(Spec.palName())) / 3 : Spec.SIZES.indexOf(Spec.fftSize()) / NS, (k, v) => {
      if (k === 'type') { Store.data.settings.specView = VIEWS[Math.round(clamp(v, 0, 1) * 4)]; save(); return; }
      if (k === 'colour') { Store.data.settings.specPal = PALS[Math.round(clamp(v, 0, 1) * 3)]; Spec.lut = null; Spec.key = ''; save(); return; }
      Store.data.settings.fft = Spec.SIZES[Math.round(clamp(v, 0, 1) * NS)]; save(); Spec.applyFft(); Spec.key = '';
    });
    sec.querySelector('#specFullBtn').onclick = () => Spec.openFull();
    const dpaint = () => { const S = Store.data.settings; sec.querySelectorAll('.dv').forEach(b => b.setAttribute('aria-pressed', b.dataset.v === (S.specView || 'water')));  };
    sec.querySelectorAll('.dv').forEach(b => b.onclick = () => { Store.data.settings.specView = b.dataset.v; Store.save(); dpaint(); });
        dpaint();
    { const nb = sec.querySelector('#noiseBtn'); let t = null, held = false; nb.addEventListener('pointerdown', () => { held = false; clearTimeout(t); t = setTimeout(() => { held = true; Noise.learn(); }, 700); }); ['pointerleave', 'pointercancel'].forEach(e => nb.addEventListener(e, () => clearTimeout(t)));
      nb.addEventListener('click', () => { clearTimeout(t); if (held) { held = false; return; } Noise.toggle(); }); Noise.paint(); }
    const el = sec.querySelector('.knob'); this.qSync = () => this.paintEl(el, Spec.SIZES.indexOf(Spec.fftSize()) / NS, f); if (window.Spec && Spec.applyFft) Spec.applyFft();
  },
  A0: -135, A1: 135, T: 28,
  /* What a knob shows when nobody has moved it: the level the Piano screen's dropdown gives. */
  base(k) {
    const s = Store.data.settings, lv = { off: 0, light: 1, medium: 2, deep: 3 };
    return { reverb: { off: 0, room: 0.3, hall: 0.75 }[s.reverb] || 0, echo: { short: 0.75, medium: 0.75, long: 0.75 }[s.fxDelay] || 0, chorus: s.chorus ? 1 : 0, trem: [0, 0.25, 0.58, 1][lv[s.fxTrem] || 0],
      vib: [0, 0.24, 0.5, 1][lv[s.fxVib] || 0], phase: s.fxPhase === 'phaser' ? 1 : 0, wide: s.fxWide ? 0.75 : 0, drive: { warm: 0.5, crunch: 1 }[s.fxDrive] || 0, tone: { dark: 0, warm: 0.25, neutral: 0.5, bright: 1 }[s.fxTone], etime: 0.4, efb: 0.4, rvtype: 0, rvsize: 0.5 }[k];
  },
  val(k) { const K = Store.data.settings.fxK || {}; return K[k] != null ? K[k] : this.base(k); },
  init() {
    const host = $('#fxKnobs'); if (!host) return;
    host.innerHTML = this.list.map(f => `<div class="knob" data-k="${f.k}" role="slider" tabindex="0" aria-label="${f.n}" aria-valuemin="0" aria-valuemax="100" title="${f.tip}. Drag, scroll or use the arrow keys; double-tap to reset.">
      <svg viewBox="-50 -50 100 100" aria-hidden="true">${this.ticks()}<circle class="kb" r="30"/><circle class="kr" r="30"/><circle class="kf" r="1"/><circle class="kh" r="30"/><rect class="kd" x="-1.7" y="-25" width="3.4" height="14" rx="1.7"/></svg><b>${f.n}</b></div>`).join('');
    $$('#fxKnobs .knob').forEach(el => this.wire(el));
    $('#fxKnobReset').onclick = () => this.reset();
    const pn = $('#pnKnobs'); if (pn) this.mountRack(pn);
    const lw = $('#pnLow'); if (lw) this.mountLow(lw);
    const ky = $('#kyKnobs'); if (ky) { this.mountGroups(ky); $('#kyKnobReset').onclick = () => this.reset(); }
    this.sync();
  },
  /* The segmented LED ring: 28 rounded segments, dim orange at the start of the sweep and bright amber at the end. */
  /* A stepped control shows only its notches, with the chosen one lit, instead of the ring of segments. */
  notchTicks(n) {
    let h = ''; for (let i = 0; i <= n; i++) { const a = (this.A0 + (this.A1 - this.A0) * i / n) * Math.PI / 180; h += `<line data-i="${i}" style="--c:#ffa23a" x1="${(Math.sin(a) * 39).toFixed(2)}" y1="${(-Math.cos(a) * 39).toFixed(2)}" x2="${(Math.sin(a) * 46).toFixed(2)}" y2="${(-Math.cos(a) * 46).toFixed(2)}"/>`; }
    return h;
  },
  ticks() {
    let h = ''; for (let i = 0; i < this.T; i++) {
      const a = (this.A0 + (this.A1 - this.A0) * i / (this.T - 1)) * Math.PI / 180, t = i / (this.T - 1), c = [194, 65, 12].map((x, j) => Math.round(x + ([255, 162, 58][j] - x) * t)), col = `rgb(${c})`;
      h += `<line data-i="${i}" style="--c:${col}" x1="${(Math.sin(a) * 37).toFixed(2)}" y1="${(-Math.cos(a) * 37).toFixed(2)}" x2="${(Math.sin(a) * 46).toFixed(2)}" y2="${(-Math.cos(a) * 46).toFixed(2)}"/>`;
    }
    return h;
  },
  set(k, v, quiet) {
    const s = Store.data.settings, sf = this.list.concat(this.extra).find(x => x.k === k); if (sf && sf.steps) v = Math.round(clamp(v, 0, 1) * sf.steps) / sf.steps;      // a stepped control only takes its notches
    s.fxK = Object.assign({}, s.fxK, { [k]: clamp(Math.round(v * 1000) / 1000, 0, 1) });      // a new object each time: DEFAULTS.fxK is shared
    this.paint(k); Engine.setFx(); if (!quiet) { clearTimeout(this.st); this.st = setTimeout(() => Store.save(), 300); }
  },
  wire(el, get, put, def, steps) {
    const k = el.dataset.k, stp = steps ? 1 / steps : 0; let drag = null; get = get || (() => this.val(k)); put = put || ((kk, v) => this.set(kk, v)); def = def != null ? def : this.list.find(f => f.k === k).d;
    /* A knob turns only when the press lands on its cap (the .khit disc over it), so a finger or pointer that merely crosses a panel while scrolling never moves a dial. The disc is the only part that blocks touch scrolling. */
    const svg = el.querySelector('svg');
    if (svg && !el.querySelector('.kwrap')) { const w = document.createElement('span'); w.className = 'kwrap'; svg.replaceWith(w); const hit = document.createElement('i'); hit.className = 'khit'; w.append(svg, hit); }
    el.addEventListener('pointerdown', e => { if (!e.target.closest('.khit')) return; e.preventDefault(); el.focus(); el.setPointerCapture(e.pointerId); drag = { x: e.clientX, y: e.clientY, v: get(), moved: false }; el.classList.add('drag'); });
    el.addEventListener('pointermove', e => { if (!drag) return; if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 4) drag.moved = true; put(k, drag.v + ((drag.y - e.clientY) + (e.clientX - drag.x)) / 150); });
    const end = () => { drag = null; el.classList.remove('drag'); };
    /* a notched control hops to its next position on a plain click, and round to the first after the last */
    el.addEventListener('pointerup', () => { const d = drag; end(); const n = +el.dataset.steps; if (d && !d.moved && n) { const cur = Math.round(get() * n); put(k, ((cur + 1) % (n + 1)) / n); } });
    el.addEventListener('pointercancel', end);
    el.addEventListener('wheel', e => { if (document.activeElement !== el) return; e.preventDefault(); put(k, get() + (e.deltaY < 0 ? 1 : -1) * (stp || 0.04)); }, { passive: false });      // the wheel turns a knob only after it has been clicked; otherwise it scrolls the panel
    el.addEventListener('dblclick', e => { if (e.target.closest('.khit')) put(k, def); });
    el.addEventListener('keydown', e => {
      const q = stp || 0.05, d = { ArrowUp: q, ArrowRight: q, ArrowDown: -q, ArrowLeft: -q, PageUp: stp || 0.2, PageDown: -(stp || 0.2) }[e.key];
      if (d != null) { e.preventDefault(); e.stopPropagation(); put(k, get() + d); } else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); e.stopPropagation(); put(k, e.key === 'Home' ? 0 : 1); }
    });
  },
  /* Bluish lights for the effects at work: a page key lights when one of its knobs is off its resting place (or one of its switches is on), and Bypass lights when any page does.
     Read from the knobs' own "lit" state, so it follows every knob and the Init and Reset buttons. Coalesced to one pass per frame. */
  lightSoon() { if (this.lightQ) return; this.lightQ = requestAnimationFrame(() => { this.lightQ = 0; this.lightFx(); }); },
  lightFx() {
    const tabs = $$('.pntabs button[data-pg]'); let any = false;
    tabs.forEach(t => {
      const pg = t.dataset.pg, sel = pg === 'arp' ? '#arpOn[aria-pressed="true"]' : '.knob.lit, .pntgl[aria-pressed="true"]:not(#tgSus)';      // Arp is its On switch: its knobs rest off their zero
      const on = pg !== 'view' && [...$$('.pnpages [data-pg="' + pg + '"]')].some(el => el.querySelector(sel));
      t.classList.toggle('fx', on && !Engine.fxBypass); if (on) any = true;       // bypassed: nothing is at work, so no blue
    });
    const b = $('#synBypass'); if (b) b.classList.toggle('fxlit', any && !Engine.fxBypass);
  },
  paint(k) { this.lightSoon(); $$(`#fxKnobs .knob[data-k="${k}"], #pnKnobs .knob[data-k="${k}"], #kyKnobs .knob[data-k="${k}"], #pnLow .knob[data-k="${k}"], #pnEnv .knob[data-k="${k}"]`).forEach(el => this.paintEl(el, this.val(k), this.list.concat(this.extra).find(x => x.k === k))); },
  /* Any set of knobs: host gets one per entry of `list`; get(k) reads an amount and put(k, v) stores one. Used by the Compose tracks, which have their own amounts. */
  mount(host, list, get, put) {
    const notch = f => f.steps && f.steps <= 8;
    host.innerHTML = list.map(f => `<div class="knob${notch(f) ? ' notched' : ''}" data-k="${f.k}"${notch(f) ? ' data-steps="' + f.steps + '"' : ''} role="slider" tabindex="0" aria-label="${f.n}" aria-valuemin="0" aria-valuemax="100" title="${f.tip ? f.tip + '. ' : ''}${f.n}: drag, scroll or use the arrow keys; double-tap to reset.">
      <svg viewBox="-50 -50 100 100" aria-hidden="true">${notch(f) ? this.notchTicks(f.steps) : this.ticks()}<circle class="kb" r="30"/><circle class="kr" r="30"/><circle class="kf" r="1"/><circle class="kh" r="30"/><rect class="kd" x="-1.7" y="-25" width="3.4" height="14" rx="1.7"/></svg><b>${f.n}</b></div>`).join('');
    host.querySelectorAll('.knob').forEach(el => {
      const f = list.find(x => x.k === el.dataset.k), paint = () => this.paintEl(el, get(f.k), f);
      this.wire(el, () => get(f.k), (kk, v) => { put(f.k, clamp(Math.round(v * 100) / 100, 0, 1)); paint(); }, f.d, f.steps); paint();
    });
    this.repaints = (this.repaints || []).filter(r => r.host.isConnected); this.repaints.push({ host, paint: () => host.querySelectorAll('.knob').forEach(el => { const f = list.find(x => x.k === el.dataset.k); if (f) this.paintEl(el, get(f.k), f); }) });
  },
  paintEl(el, v, f) {
    const a = this.A0 + (this.A1 - this.A0) * v, mid = f.bi != null ? f.bi : f.d > 0;
    el.querySelector('.kd').setAttribute('transform', `rotate(${a.toFixed(1)})`); el.querySelector('.kf').setAttribute('transform', `rotate(${a.toFixed(1)})`);
    const lit = v * (this.T - 1), from = mid ? (this.T - 1) / 2 : 0, ns = +el.dataset.steps || 0;
    if (ns) { const idx = Math.round(v * ns); el.querySelectorAll('line').forEach(l => l.classList.toggle('on', +l.dataset.i === idx)); }
    else el.querySelectorAll('line').forEach(l => { const i = +l.dataset.i; l.classList.toggle('on', mid ? (i >= Math.min(from, lit) - 1e-6 && i <= Math.max(from, lit) + 1e-6 && Math.abs(lit - from) > 0.05) : i <= lit + 1e-6 && v > 0.005); });
    el.dataset.v = f.dv ? f.dv(v) : Math.round(v * 100) + '%'; el.querySelector('b').dataset.v = el.dataset.v;
    if (f.txt) el.querySelector('b').textContent = f.txt(v);
    el.setAttribute('aria-valuenow', Math.round(v * 100)); el.setAttribute('aria-valuetext', mid ? (v < 0.45 ? 'darker' : v > 0.55 ? 'brighter' : 'neutral') : Math.round(v * 100) + '%'); el.classList.toggle('lit', Math.abs(v - (f.d || 0)) > (mid ? 0.03 : 0.005));
  },
  /* A dropdown on the Piano screen was changed: it takes over from that knob. */
  free(k) { const s = Store.data.settings; if (k && s.fxK && k in s.fxK) { s.fxK = Object.assign({}, s.fxK); delete s.fxK[k]; } this.sync(); },
  sync() { this.list.forEach(f => this.paint(f.k)); },
  /* Every knob to its resting position, and the dropdowns on the Piano screen go with them. */
  reset() {
    const s = Store.data.settings; Object.assign(s, { reverb: 'off', chorus: false, fxTrem: 'off', fxVib: 'off', fxDelay: 'off', fxWide: false, fxTone: 'neutral', fxPhase: 'off', fxDrive: 'off' }); s.fxK = {}; Object.assign(s, { fxUni: 0, fxGlide: 0, fxPing: false, liveFx: {}, transpose: 0, fineTune: 0 });      // Transpose and Fine tune go back to zero too, so no hidden shift is left on the keys
    $$('.fxRv').forEach(x => x.value = 'off'); $$('.fxCh').forEach(x => x.checked = false); $$('[data-fx]').forEach(el => { const v = s[el.dataset.fx]; if (v === undefined) return; if (el.type === 'checkbox') el.checked = !!v; else el.value = v; });
    Store.save(); Engine.applySettings(); Engine.setFx(); if (window.Seq) Seq.liveFx(); this.sync(); (this.repaints || []).forEach(r => { if (r.host.isConnected) r.paint(); }); this.paintLow();
  },
};
