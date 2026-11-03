"use strict";
/* The volume slider is squared, so the quiet half of it has fine steps, and the output stage sits 6 dB under full scale: earbuds were too loud at the old default. */
const volGain = v => v * v, OUT_TRIM = 0.5;
/* ---- Audio engine ---- */
/* The built-in instruments. Each is one oscillator with a stack of partials (amps), grouped by family (fam) for the menus.
   a = attack in seconds; hold = sustains for the whole note, otherwise it decays to the fraction f of its level over T seconds;
   lp = low-pass at that many times the pitch; drive = clipping; formants = [[Hz, Q, level]...] band-passes that give a vowel;
   noise = [level, band-pass at that many times the pitch (or fixed Hz in noise[3]), Q] breath or wind mixed in; noOsc = noise only;
   glide = [start multiple of the pitch, seconds] for a drum that drops in pitch; trim = loudness correction (the tests check every voice against 'soft'). */
const saw = n => Array.from({ length: n }, (_, i) => 1 / (i + 1));
const odd = n => Array.from({ length: n }, (_, i) => i % 2 ? 0 : 1 / (i + 1));
const TIMBRES = {
  soft: { fam: 'Basic', label: 'Soft', amps: [1, 0.45, 0.2, 0.1] },
  pure: { fam: 'Basic', label: 'Pure sine', amps: [1] },
  piano: { fam: 'Piano', label: 'Piano-like', amps: [1, 0.6, 0.38, 0.22, 0.14, 0.09], f: 0.08, T: 2.2 },
  epiano: { fam: 'Piano', label: 'Electric piano', amps: [1, 0.25, 0.05, 0.18, 0.03], f: 0.1, T: 2.5 },
  mallet: { fam: 'Mallets and bells', label: 'Mallet / bell', amps: [1, 0, 0, 0.35, 0, 0, 0.12], f: 0.03, T: 1.4 },
  kalimba: { fam: 'Mallets and bells', label: 'Kalimba', amps: [1, 0, 0, 0, 0.35, 0, 0, 0, 0, 0.1], f: 0.03, T: 1.2 },
  steeldrum: { fam: 'Mallets and bells', label: 'Steel drum', amps: [1, 0, 0.5, 0, 0, 0.25], f: 0.03, T: 1.2 },
  organ: { fam: 'Organ', label: 'Organ', amps: [1, 0.8, 0.55, 0.4, 0.25], hold: true },
  pluck: { fam: 'Guitar and plucked', label: 'Plucked string', amps: saw(9), f: 0.04, T: 1.2, lp: 7 },
  nylon: { fam: 'Guitar and plucked', label: 'Nylon guitar', amps: saw(7), f: 0.05, T: 1.6, lp: 5 },
  muted: { fam: 'Guitar and plucked', label: 'Muted guitar', amps: saw(6), f: 0.02, T: 0.4, lp: 3 },
  dist: { fam: 'Guitar and plucked', label: 'Distortion guitar', amps: saw(14), f: 0.2, T: 2.5, lp: 6, drive: 8 },
  harp: { fam: 'Guitar and plucked', label: 'Harp', amps: [1, 0.5, 0.25, 0.12, 0.06, 0.03], f: 0.04, T: 2.5 },
  sitar: { fam: 'Guitar and plucked', label: 'Sitar', amps: [1, 0.8, 0.9, 0.7, 0.8, 0.6, 0.5, 0.45, 0.35, 0.3, 0.2], f: 0.05, T: 2, lp: 12, drive: 3 },
  bass: { fam: 'Bass', label: 'Synth bass', amps: saw(8), f: 0.45, T: 1.5, lp: 4 },
  strings: { fam: 'Strings', label: 'Strings', amps: saw(12), a: 0.12, hold: true, lp: 9 },
  cello: { fam: 'Strings', label: 'Cello / bowed bass', amps: saw(12), a: 0.09, hold: true, lp: 5 },
  pizz: { fam: 'Strings', label: 'Pizzicato', amps: saw(6), f: 0.02, T: 0.35, lp: 6 },
  aah: { fam: 'Voices', label: 'Choir "aah"', amps: saw(16), a: 0.12, hold: true, trim: 4.5, formants: [[800, 6, 1], [1150, 6, 0.7], [2900, 8, 0.3]] },
  ooh: { fam: 'Voices', label: 'Choir "ooh"', amps: saw(16), a: 0.12, hold: true, trim: 5, formants: [[330, 6, 1], [800, 6, 0.4], [2700, 8, 0.1]] },
  trumpet: { fam: 'Brass', label: 'Trumpet', amps: [1, 0.95, 0.85, 0.7, 0.55, 0.4, 0.3, 0.2, 0.12, 0.08], a: 0.04, hold: true, lp: 10 },
  trombone: { fam: 'Brass', label: 'Trombone / tuba', amps: [1, 0.8, 0.6, 0.45, 0.3, 0.2, 0.12, 0.07], a: 0.07, hold: true, lp: 4 },
  brassens: { fam: 'Brass', label: 'Soft brass', amps: [1, 0.7, 0.5, 0.35, 0.22, 0.14, 0.08], a: 0.12, hold: true, lp: 5 },
  brass: { fam: 'Brass', label: 'Brass section', amps: [1, 0.9, 0.8, 0.6, 0.5, 0.35, 0.25, 0.15, 0.1], a: 0.05, hold: true, lp: 8 },
  sax: { fam: 'Reeds', label: 'Saxophone', amps: [1, 0.8, 0.6, 0.55, 0.4, 0.3, 0.25, 0.15, 0.1, 0.06], a: 0.05, hold: true, lp: 9, noise: [0.04, 3, 1] },
  oboe: { fam: 'Reeds', label: 'Oboe', amps: [0.6, 1, 0.9, 0.6, 0.4, 0.3, 0.2, 0.1], a: 0.04, hold: true, lp: 12 },
  clarinet: { fam: 'Reeds', label: 'Clarinet', amps: odd(10), a: 0.04, hold: true, lp: 8 },
  reed: { fam: 'Reeds', label: 'Reed', amps: [1, 0, 0.5, 0, 0.3, 0, 0.15, 0, 0.08], a: 0.03, hold: true },
  flute: { fam: 'Pipes', label: 'Flute', amps: [1, 0.2, 0.08, 0.03], a: 0.06, hold: true },
  recorder: { fam: 'Pipes', label: 'Recorder', amps: [1, 0.05, 0.12, 0.02], a: 0.05, hold: true, noise: [0.05, 2, 2] },
  panflute: { fam: 'Pipes', label: 'Pan flute', amps: [1, 0.1, 0.04], a: 0.08, hold: true, noise: [0.14, 1, 3] },
  bagpipe: { fam: 'Pipes', label: 'Bagpipe', amps: [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2, 0.1], a: 0.03, hold: true, lp: 9 },
  lead: { fam: 'Synth lead', label: 'Sawtooth lead', amps: saw(14), a: 0.015, hold: true },
  square: { fam: 'Synth lead', label: 'Square lead', amps: odd(15), a: 0.01, hold: true },
  sync: { fam: 'Synth lead', label: 'Sync lead', amps: [1, 0.3, 0.9, 0.25, 0.7, 0.2, 0.5, 0.2, 0.35, 0.15, 0.25], a: 0.01, hold: true },
  pad: { fam: 'Synth pad', label: 'Pad', amps: [1, 0.5, 0.33, 0.25, 0.2, 0.15], a: 0.3, hold: true },
  warmpad: { fam: 'Synth pad', label: 'Warm pad', amps: saw(8), a: 0.5, hold: true, lp: 3 },
  brightpad: { fam: 'Synth pad', label: 'Bright pad', amps: saw(14), a: 0.35, hold: true, lp: 7 },
  timpani: { fam: 'Percussive', label: 'Timpani', amps: [1, 0.3, 0.1], f: 0.02, T: 0.9, glide: [1.25, 0.06] },
  taiko: { fam: 'Percussive', label: 'Taiko', amps: [1, 0.4, 0.1], f: 0.01, T: 0.5, glide: [2, 0.1], noise: [0.2, 2, 0.7] },
  wind: { fam: 'Effects', label: 'Wind', amps: [1], noOsc: true, trim: 14, a: 0.4, hold: true, noise: [0.5, 1, 4] },
  sea: { fam: 'Effects', label: 'Sea', amps: [1], noOsc: true, trim: 4, a: 0.6, hold: true, noise: [0.5, 0, 0.5, 600] }
};
const timbreOf = tb => TIMBRES[tb] || TIMBRES.soft;      // anything else ('sf' while the font is still loading) sounds soft
/* The built-in voices as <optgroup>s, one per family, for the instrument menus. */
const timbreOptions = () => { const fams = []; Object.keys(TIMBRES).forEach(k => { const f = TIMBRES[k].fam; let g = fams.find(x => x.f === f); if (!g) fams.push(g = { f, o: [] }); g.o.push('<option value="' + k + '">' + TIMBRES[k].label + '</option>'); }); return fams.map(g => '<optgroup label="' + g.f + '">' + g.o.join('') + '</optgroup>').join(''); };
const Engine = {
  ctx: null, stream: null, master: null, node: null, inst: 'voice', tracker: null, listeners: new Set(), ready: false, level: -90, lat: 0,
  async start() {
    try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch (e) {}      // iOS: keeps the volume buttons on the app's sound while the microphone is open
    if (this.ready) { await this.ctx.resume(); return; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error('This browser has no microphone support (it needs HTTPS or localhost).');
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const resumed = this.ctx.resume();             // must be called inside the tap handler for iOS
    try {
      this.stream = await this.getStream(Store.data.settings.micId);
    } catch (e) { throw new Error(micMessage(e)); }
    await resumed;
    const src = `${yin.toString()}\n${decimate.toString()}\n${refine.toString()}\n${analyse.toString()}
      class PitchProc extends AudioWorkletProcessor {
        constructor() { super(); this.hop = Math.round(sampleRate / 50); this.cfg({ N: 2048, fmin: 65, fmax: 1100, dec: 0 }); this.port.onmessage = e => this.cfg(e.data); }
        cfg(c) { this.N = c.N; this.fmin = c.fmin; this.fmax = c.fmax; this.dec = c.dec; this.buf = new Float32Array(this.N); this.pos = 0; this.filled = 0; this.since = 0; }
        process(inputs) {
          const ch = inputs[0] && inputs[0][0]; if (!ch) return true;
          for (let i = 0; i < ch.length; i++) { this.buf[this.pos] = ch[i]; this.pos = (this.pos + 1) % this.N; }
          this.filled = Math.min(this.N, this.filled + ch.length); this.since += ch.length;
          if (this.since >= this.hop && this.filled >= this.N) {
            this.since -= this.hop;
            const w = new Float32Array(this.N);
            for (let i = 0; i < this.N; i++) w[i] = this.buf[(this.pos + i) % this.N];
            const r = analyse(w, sampleRate, this.fmin, this.fmax, this.dec);
            this.port.postMessage({ t: currentTime, f: r.f, conf: r.conf, rms: r.rms });
          }
          return true;
        }
      }
      registerProcessor('pitch-proc', PitchProc);`;
    const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
    await this.ctx.audioWorklet.addModule(url);
    const mic = this.mic = this.ctx.createMediaStreamSource(this.stream);
    this.buildNoise(); mic.connect(this.nIn);
    this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 16384; this.analyser.smoothingTimeConstant = 0.3; this.nOut.connect(this.analyser);
    this.specAn = this.ctx.createAnalyser(); this.specAn.smoothingTimeConstant = 0.3; this.nOut.connect(this.specAn);     // the spectrogram has its own analyser, so its detail setting never disturbs chord and source detection
    const node = new AudioWorkletNode(this.ctx, 'pitch-proc', { numberOfOutputs: 1, outputChannelCount: [1] });
    const mute = this.ctx.createGain(); mute.gain.value = 0;      // keeps the node pulled by the graph without playing the mic
    this.nOut.connect(node); node.connect(mute); mute.connect(this.ctx.destination);
    this.buildFx();
    this.tracker = new PitchTracker();
    this.applySettings();
    this.node = node; this.half = 1024 / this.ctx.sampleRate; this.applySettings();      // window centre is half a window before the message time
    node.port.onmessage = e => {
      const d = e.data, m = this.tracker.push(d.f, d.conf, d.rms);
      this.level = 20 * Math.log10(Math.max(d.rms, 1e-5));
      const mb = $('#micBar'); if (mb) { mb.style.width = clamp((this.level + 60) / 50, 0, 1) * 100 + '%'; mb.style.background = this.level >= Store.data.settings.gateDb ? 'var(--good)' : '#4a5575'; }
      const fr = { t: d.t - this.half, f: d.f, rms: d.rms, midi: m };
      this.listeners.forEach(fn => fn(fr));
    };
    document.addEventListener('visibilitychange', () => { if (!document.hidden && this.ctx && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); });
    this.ready = true;
  },
  /* The room's steady tones (fans, hums) are cut by narrow notch filters between the microphone and everything that listens to it. */
  buildNoise() {
    const c = this.ctx, S = Store.data.settings; if (!c) return;
    if (!this.nIn) { this.nIn = c.createGain(); this.nOut = c.createGain(); }
    try { this.nIn.disconnect(); } catch (e) { /* nothing connected yet */ } (this.nNodes || []).forEach(n => { try { n.disconnect(); } catch (e) { /* already gone */ } });
    const hz = S.noiseOn ? (S.noise || []).slice(0, 10) : []; let cur = this.nIn;
    this.nNodes = []; hz.forEach(t => { for (let i = 0; i < 2; i++) { const b = c.createBiquadFilter(); b.type = 'notch'; b.frequency.value = t.hz; b.Q.value = clamp(t.hz / (t.bw || 8), 3, 40); cur.connect(b); cur = b; this.nNodes.push(b); } });      // two stages about 8 Hz wide: deep enough to vanish on the spectrogram, narrow enough to leave the music alone
    cur.connect(this.nOut);
  },
  async getStream(id) {
    const base = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 };
    try { return await navigator.mediaDevices.getUserMedia({ audio: id ? Object.assign({ deviceId: { exact: id } }, base) : base }); }
    catch (e) { if (id && e && e.name === 'OverconstrainedError') { Store.data.settings.micId = ''; Store.save(); return navigator.mediaDevices.getUserMedia({ audio: base }); } throw e; }
  },
  /* Switches the microphone while running: new stream into the same analyser and pitch worklet. */
  async setMic(id) {
    if (!this.ready) return;
    const st = await this.getStream(id); this.stream.getTracks().forEach(t => t.stop()); this.mic.disconnect();
    this.stream = st; this.mic = this.ctx.createMediaStreamSource(st); this.mic.connect(this.nIn);
    this.listMics();
  },
  async listMics() {
    const sel = $('#setMic'); if (!sel || !navigator.mediaDevices.enumerateDevices) return;
    const devs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput'), cur = this.stream && this.stream.getAudioTracks()[0] ? this.stream.getAudioTracks()[0].getSettings().deviceId : '';
    sel.textContent = ''; const d0 = document.createElement('option'); d0.value = ''; d0.textContent = 'System default'; sel.appendChild(d0);
    devs.forEach((d, i) => { if (!d.deviceId || d.deviceId === 'default') return; const o = document.createElement('option'); o.value = d.deviceId; o.textContent = d.label || 'Microphone ' + (i + 1); sel.appendChild(o); });
    sel.value = Store.data.settings.micId && [...sel.options].some(o => o.value === Store.data.settings.micId) ? Store.data.settings.micId : '';
  },
  applySettings() {
    const s = Store.data.settings;
    if (this.master) { this.master.gain.setTargetAtTime(volGain(s.vol), this.ctx.currentTime, 0.02); this.clickBus.gain.setTargetAtTime(volGain(s.vol), this.ctx.currentTime, 0.02); this.setFx(); }      // eased, so dragging the slider does not click
    if (this.tracker) { this.tracker.a4 = s.a4; this.tracker.gate = Math.pow(10, s.gateDb / 20); }
    if (this.node && this.inst !== s.inst) {                       // piano: wider pitch range (A0 to C8) and a 2x longer window so bass notes fit
      this.inst = s.inst; const cfg = { voice: { N: 2048, fmin: 65, fmax: 1100, dec: 0 }, piano: { N: 4096, fmin: 26, fmax: 4400, dec: 0 }, whistle: { N: 2048, fmin: 400, fmax: 4600, dec: 1 } }[s.inst] || { N: 2048, fmin: 65, fmax: 1100, dec: 0 }, N = cfg.N;
      this.node.port.postMessage(cfg);
      this.half = (N / 2) / this.ctx.sampleRate; this.tracker.reset();
    }
  },
  /* Output chain: master -> (dry + reverb + chorus) -> compressor -> soft clipper -> speakers.
     Many voices add up past full scale; the compressor and clipper keep that smooth instead of hard-clipping (the crackle). */
  buildFx() {
    const c = this.ctx, mk = n => c.createGain(), bus = mk(), comp = c.createDynamicsCompressor(), sat = c.createWaveShaper();
    this.master = mk(); this.master.gain.value = volGain(Store.data.settings.vol);
    this.clickBus = mk(); this.clickBus.gain.value = volGain(Store.data.settings.vol); /* connected below, after the compressor exists */
    this.outAn = c.createAnalyser(); this.outAn.smoothingTimeConstant = 0.3; this.master.connect(this.outAn);      // taps the app's own sound before the speakers, for the blue half of the spectrogram
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2;
    const N = 4096, cv = new Float32Array(N);
    for (let i = 0; i < N; i++) { const x = i / (N - 1) * 2 - 1, a = Math.abs(x), y = a < 0.8 ? a : 0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2); cv[i] = x < 0 ? -y : y; }
    sat.curve = cv; sat.oversample = '2x';
    this.master.connect(bus); this.chainFx(bus, comp); comp.connect(sat); const trim = mk(); trim.gain.value = OUT_TRIM; sat.connect(trim); trim.connect(c.destination);
    this.clickBus.connect(comp);      // metronome and cues skip every effect but share the same output stage as the notes
    this.rvSend = mk(); this.rvWet = mk(); this.conv = c.createConvolver(); this.rvKind = ''; this.shim = null; this.bend = null; this.lastLive = null;
    this.master.connect(this.rvSend); this.rvSend.connect(this.conv); this.conv.connect(this.rvWet); this.rvWet.connect(bus);
    this.chWet = mk(); this.chWet.gain.value = 0; this.chOn = false;
    [[0.018, 0.4, -0.7], [0.026, 0.55, 0.7]].forEach(([base, hz, pan]) => {
      const d = c.createDelay(0.1), lfo = c.createOscillator(), depth = mk(), p = c.createStereoPanner ? c.createStereoPanner() : null;
      d.delayTime.value = base; lfo.frequency.value = hz; depth.gain.value = 0.0025; lfo.connect(depth); depth.connect(d.delayTime); lfo.start();
      (this.fx.L.chorus = this.fx.L.chorus || []).push([this.master, d]); if (p) { p.pan.value = pan; d.connect(p); p.connect(this.chWet); } else d.connect(this.chWet);
    });
    this.chWet.connect(bus);
    this.setFx();
  },
  /* Effects that sit after the mix: tone, overdrive, tremolo, phaser/flanger, widener, plus echo and a shared vibrato oscillator. All start neutral; setFx() sets them. */
  chainFx(bus, comp) {
    const c = this.ctx, mk = () => c.createGain(), F = this.fx = {};
    F.lo = c.createBiquadFilter(); F.lo.type = 'lowshelf'; F.lo.frequency.value = 250; F.hi = c.createBiquadFilter(); F.hi.type = 'highshelf'; F.hi.frequency.value = 3000;
    bus.connect(F.lo); F.lo.connect(F.hi);
    const dOut = mk(), pre = mk(), sh = c.createWaveShaper(), K = 1024, cv = new Float32Array(K); F.drDry = mk(); F.drWet = mk(); F.drPre = pre;
    for (let i = 0; i < K; i++) cv[i] = Math.tanh((i / (K - 1) * 2 - 1) * 2.2); sh.curve = cv; sh.oversample = '4x'; F.drWet.gain.value = 0;
    F.L = {}; F.on = {}; F.hi.connect(F.drDry); F.drDry.connect(dOut); F.L.drive = [F.hi, pre]; pre.connect(sh); sh.connect(F.drWet); F.drWet.connect(dOut);
    F.tr = mk(); F.trLfo = c.createOscillator(); F.trDepth = mk(); F.trLfo.frequency.value = 5.5; F.trDepth.gain.value = 0; F.trLfo.connect(F.trDepth); F.trDepth.connect(F.tr.gain); F.trLfo.start(); dOut.connect(F.tr);
    const pOut = mk(), pDry = mk(); F.tr.connect(pDry); pDry.connect(pOut);
    F.phWet = mk(); F.phWet.gain.value = 0; F.phLfo = c.createOscillator(); F.phLfo.frequency.value = 0.45; const phD = mk(); phD.gain.value = 600; F.phLfo.connect(phD); F.phLfo.start();
    let n = F.tr; for (let i = 0; i < 4; i++) { const ap = c.createBiquadFilter(); ap.type = 'allpass'; ap.frequency.value = 800; ap.Q.value = 0.7; phD.connect(ap.frequency); if (i) n.connect(ap); else F.L.phase = [n, ap]; n = ap; } n.connect(F.phWet); F.phWet.connect(pOut);
    F.flWet = mk(); F.flWet.gain.value = 0; const fd = c.createDelay(0.02), fl = c.createOscillator(), fD = mk(), fb = mk(); fd.delayTime.value = 0.004; fl.frequency.value = 0.3; fD.gain.value = 0.002; fb.gain.value = 0.5;
    fl.connect(fD); fD.connect(fd.delayTime); fl.start(); F.L.flange = [F.tr, fd]; fd.connect(F.flWet); fd.connect(fb); fb.connect(fd); F.flWet.connect(pOut);
    F.wdWet = mk(); F.wdWet.gain.value = 0; pOut.connect(comp);
    F.L.wide = [];
    [[0.013, 1], [0.021, -1]].forEach(([t, pan]) => { const d = c.createDelay(0.05), p = c.createStereoPanner ? c.createStereoPanner() : null; d.delayTime.value = t; F.L.wide.push([pOut, d]); if (p) { p.pan.value = pan; d.connect(p); p.connect(F.wdWet); } else d.connect(F.wdWet); });
    F.wdWet.connect(comp);
    /* Echo is a pair of delays. Plain: one repeat every step, from the first delay. Ping-pong: the first repeat goes left, then the second delay sends the next to the right, and so on. */
    F.dl = c.createDelay(1.5); F.dl2 = c.createDelay(1.5); F.dlFb = mk(); F.dlFb2 = mk(); F.dlWet = mk(); F.dlWet2 = mk(); F.dlFb.gain.value = 0.4; F.dlFb2.gain.value = 0; F.dlWet.gain.value = 0; F.dlWet2.gain.value = 0;
    F.pnL = c.createStereoPanner ? c.createStereoPanner() : mk(); F.pnR = c.createStereoPanner ? c.createStereoPanner() : mk();
    F.L.echo = [this.master, F.dl]; F.dl.connect(F.dlFb); F.dlFb.connect(F.dl); F.dl.connect(F.pnL); F.pnL.connect(F.dlWet); F.dlWet.connect(bus);
    F.dl.connect(F.dl2); F.dl2.connect(F.dlFb2); F.dlFb2.connect(F.dl); F.dl2.connect(F.pnR); F.pnR.connect(F.dlWet2); F.dlWet2.connect(bus);
    F.vibLfo = c.createOscillator(); F.vibDepth = mk(); F.vibLfo.frequency.value = 5.6; F.vibDepth.gain.value = 0; F.vibLfo.connect(F.vibDepth); F.vibLfo.start();      // cents; each voice connects it to its own detune
  },
  /* Noise with an exponential decay is a good enough room: a short one for 'room', a long one for 'hall'. */
  impulse(sec, decay, bright) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); let prev = 0; for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; d[i] = (bright ? (w - 0.6 * prev) * 0.8 : w) * Math.pow(1 - i / n, decay) * Math.min(1, i / (c.sampleRate * (bright ? 0.0005 : 0.004))); prev = w; } }      // bright: the noise is differenced, which lifts the highs like a metal plate
    return b;
  },
  setFx() {
    if (!this.conv) return;
    const s0 = Store.data.settings, t = this.ctx.currentTime, F = this.fx, lv = { off: 0, light: 1, medium: 2, deep: 3 };
    /* Bypass keeps every setting and knob where it is, but sends the sound through with all effects off. */
    const s = this.fxBypass ? Object.assign({}, s0, { reverb: 'off', chorus: false, fxTrem: 'off', fxVib: 'off', fxDelay: 'off', fxWide: false, fxTone: 'neutral', fxPhase: 'off', fxDrive: 'off', fxK: {}, fxPing: false }) : s0;
    /* The Compose knobs (settings.fxK, 0 to 1) win over the dropdowns for any effect they have touched; an untouched knob falls back to the dropdown's level. */
    const K = s.fxK || {}, kv = (k, d) => K[k] != null ? K[k] : d, dl = { short: 0.18, medium: 0.35, long: 0.6 }[s.fxDelay];
    const kTrem = kv('trem', [0, 0.25, 0.58, 1][lv[s.fxTrem] || 0]), kVib = kv('vib', [0, 0.24, 0.5, 1][lv[s.fxVib] || 0]), kEcho = kv('echo', dl ? 0.75 : 0), kWide = kv('wide', s.fxWide ? 0.75 : 0);
    const kPhase = kv('phase', s.fxPhase === 'phaser' ? 1 : 0), kChor = kv('chorus', s.chorus ? 1 : 0), kDrive = K.drive;
    if (F) {
      const tn = K.tone != null ? [3 - 6 * K.tone, (K.tone - 0.5) * 14] : { dark: [3, -9], warm: [4, -4], neutral: [0, 0], bright: [-3, 6] }[s.fxTone] || [0, 0];
      F.tr.gain.setTargetAtTime(1 - kTrem * 0.3, t, 0.05); F.trDepth.gain.setTargetAtTime(kTrem * 0.3, t, 0.05);
      F.vibDepth.gain.setTargetAtTime(kVib * 50, t, 0.05);
      F.lo.gain.setTargetAtTime(tn[0], t, 0.05); F.hi.gain.setTargetAtTime(tn[1], t, 0.05);
      const dtm = K.etime != null ? Seq.ECHO_BEATS[Math.round(K.etime * 5)] * 0.6 /* a note length at 100 beats a minute */ : dl || 0.35;
      if (kEcho > 0.01) { F.dl.delayTime.setTargetAtTime(dtm, t, 0.05); F.dl2.delayTime.setTargetAtTime(dtm, t, 0.05); }
      const fbv = K.efb != null ? K.efb * 0.85 : 0.4, pp = !!s.fxPing;      // ping-pong feeds back through the second delay, so the repeats alternate sides
      F.dlWet.gain.setTargetAtTime(kEcho * 0.6, t, 0.05); F.dlWet2.gain.setTargetAtTime(pp ? kEcho * 0.6 : 0, t, 0.05); F.dlFb.gain.setTargetAtTime(pp ? 0 : fbv, t, 0.05); F.dlFb2.gain.setTargetAtTime(pp ? fbv : 0, t, 0.05);
      if (F.pnL.pan) { F.pnL.pan.setTargetAtTime(pp ? -0.85 : 0, t, 0.05); F.pnR.pan.setTargetAtTime(pp ? 0.85 : 0, t, 0.05); }
      F.wdWet.gain.setTargetAtTime(kWide * 0.8, t, 0.05);
      F.phWet.gain.setTargetAtTime(kPhase * 0.8, t, 0.05); F.flWet.gain.setTargetAtTime(s.fxPhase === 'flanger' ? 0.7 : 0, t, 0.05);
      const dr = kDrive != null ? [1 - 0.6 * kDrive, 0.7 * kDrive, 1 + 7 * kDrive] : { warm: [0.8, 0.35, 3], crunch: [0.4, 0.7, 8] }[s.fxDrive] || [1, 0, 1]; F.drDry.gain.setTargetAtTime(dr[0], t, 0.05); F.drWet.gain.setTargetAtTime(dr[1], t, 0.05); F.drPre.gain.setTargetAtTime(dr[2], t, 0.05);
    }
    if (F) {      // an effect that is off is not in the signal path at all: idle delays, filters and an oversampled shaper cost the audio thread even when silent
      const link = (k, on) => {
        const L = F.L[k], list = Array.isArray(L[0]) ? L : [L]; F.want = F.want || {}; F.want[k] = on;
        if (on) { if (!F.on[k]) { F.on[k] = true; list.forEach(([a, b]) => a.connect(b)); } }
        else if (F.on[k]) setTimeout(() => { if (!F.want[k] && F.on[k]) { F.on[k] = false; list.forEach(([a, b]) => { try { a.disconnect(b); } catch (e) { /* already gone */ } }); } }, 600);
      };
      link('drive', kDrive != null ? kDrive > 0.01 : !!({ warm: 1, crunch: 1 }[s.fxDrive])); link('phase', kPhase > 0.01); link('flange', s.fxPhase === 'flanger'); link('wide', kWide > 0.01); link('echo', kEcho > 0.01); link('chorus', kChor > 0.01);
    }
    const rk = K.reverb, TYPES = ['room', 'hall', 'plate', 'shimmer'], SIZES = [0.5, 0.75, 1, 1.5, 2.2], sz = Math.round((K.rvsize != null ? K.rvsize : 0.5) * 4);
    let kind = rk != null ? (rk > 0.01 ? (rk < 0.5 ? 'room' : 'hall') : '') : s.reverb === 'room' || s.reverb === 'hall' ? s.reverb : '';
    if (rk != null && rk > 0.01 && K.rvtype != null) kind = TYPES[Math.round(K.rvtype * 3)];      // the type knob picks the space; untouched, the amount alone chooses room or hall
    const custom = K.rvtype != null || K.rvsize != null, rkey = kind ? kind + (custom ? sz : '') : '';
    if (rkey !== this.rvKind) {
      this.rvKind = rkey;
      if (kind) { const m = custom ? SIZES[sz] : 1; this.conv.buffer = kind === 'plate' ? this.impulse(1.8 * m, 2, true) : kind === 'shimmer' ? this.impulse(3 * m, 2.2) : this.impulse((kind === 'hall' ? 2.4 : 0.9) * m, kind === 'hall' ? 2.5 : 3); }
      this.rvSend.gain.setTargetAtTime(kind ? 1 : 0, t, 0.02);
      this.shimmer(kind === 'shimmer');
    }
    this.rvWet.gain.setTargetAtTime(rk != null ? rk * 0.7 : kind === 'hall' ? 0.55 : kind === 'room' ? 0.4 : 0, t, 0.02);
    this.chWet.gain.setTargetAtTime(kChor * 0.5, t, 0.05);
  },
  /* Shimmer: the reverb also hears a rough octave-up copy of the sound (a rectified signal doubles its pitch), so the tail sings an octave above. Only connected while the type is on. */
  shimmer(on) {
    const c = this.ctx; if (!c || !this.master) return;
    if (!this.shim) { const sh = c.createWaveShaper(), hp = c.createBiquadFilter(), g = c.createGain(), cv = new Float32Array(1024); for (let i = 0; i < 1024; i++) cv[i] = Math.abs(i / 1023 * 2 - 1); sh.curve = cv; hp.type = 'highpass'; hp.frequency.value = 350; g.gain.value = 0.45; sh.connect(hp); hp.connect(g); g.connect(this.conv); this.shim = { sh, on: false }; }
    if (on && !this.shim.on) { this.master.connect(this.shim.sh); this.shim.on = true; } else if (!on && this.shim.on) { try { this.master.disconnect(this.shim.sh); } catch (e) { /* already gone */ } this.shim.on = false; }
  },
  /* Pitch bend of the notes you play: one shared source in cents, connected to the detune of each live note. x is -1 to 1, two semitones each way. */
  bendSrc() { if (!this.bend || this.bend.ctx !== this.ctx) { const b = this.ctx.createConstantSource(); b.offset.value = 0; b.start(); this.bend = Object.assign(b, { ctx: this.ctx }); } return this.bend; },
  setBend(x) { if (!this.ctx) return; this.bendSrc().offset.setTargetAtTime(clamp(x, -1, 1) * 200, this.ctx.currentTime, 0.015); },
  /* The envelope editor's shape for notes you play yourself: seconds and a sustain level, or null while the editor is off. */
  envCustom() { const s = Store.data.settings; return s.envOn && s.env ? this.envOf(s.env) : null; },
  /* Envelope amounts (0 to 1 each) as seconds and a sustain level; shared by the Piano tab's editor and each Compose track. */
  envOf(e) {
    return { a: 0.003 * Math.pow(2 / 0.003, e.a), d: 0.02 * Math.pow(150, e.d), s: e.s, r: 0.03 * Math.pow(100, e.r) };
  },
  /* Vibrato is wired into each voice as it starts, so it is only connected while the effect is on. */
  vibOn() { if (this.fxBypass) return false; const s = Store.data.settings; return !!((s.fxK && s.fxK.vib > 0.01) || (s.fxVib && s.fxVib !== 'off')); },
  outLatency() { const c = this.ctx; return (c.outputLatency || c.baseLatency || 0); },
  /* Soft piano-like tone: a few harmonics with a gentle decay. sustain=true gives a steady tone (guide, glides). */
  playNote(midi, when, dur, o) {
    o = o || {}; const st = Store.data.settings;
    if (o.live && o.sustain && !o.arp && typeof Arp !== 'undefined' && Arp.on) return Arp.add(midi, o);      // the arpeggiator plays held keys one at a time
    if (o.live && st.transpose) midi = clamp(midi + st.transpose, 0, 127);
    if (o.live && !o.dest && typeof Seq !== 'undefined') { const lt = Seq.liveTail(); if (lt) o = Object.assign({}, o, { dest: lt }); }      // notes you play go through the same per-track effects as Compose
    if (o.live && st.fxHuman) { when += Math.random() * 0.012; o = Object.assign({}, o, { gain: (o.gain == null ? 0.25 : o.gain) * (0.85 + Math.random() * 0.3), vel: clamp(Math.round((o.vel || 100) * (0.9 + Math.random() * 0.2)), 1, 127) }); }
    if (o.live) {      // glide slides in from the last note you played; bend is the shared pitch wheel
      const gl = st.fxGlide || 0; o = Object.assign({}, o, { bend: o.bend || this.bendSrc() });
      if (gl > 0.01 && this.lastLive != null && when - this.lastLiveT < 2) o = Object.assign(o, { gfrom: this.lastLive, gt: 0.03 + 0.6 * gl });
      this.lastLive = midi; this.lastLiveT = when;
    }
    /* Layers: the octave above or below, and unison (extra copies of the note, detuned and spread across the stereo field). Louder stacks are turned down to keep the level. */
    const lay = o.live ? { up: [12], down: [-12], both: [-12, 12] }[st.fxOct] : null, uni = o.live ? clamp(st.fxUni || 0, 0, 1) : 0, c = this.ctx;      // the octave layer is only for notes you play, never for exercise tones
    const un = uni > 0.01 ? (uni > 0.6 ? [-1, 1, -0.5, 0.5] : [-1, 1]) : [], base = o.gain == null ? 0.25 : o.gain, pans = [];
    if (un.length) o = Object.assign({}, o, { gain: base * (un.length > 2 ? 0.5 : 0.68) });
    let h = this._playNote(midi, when, dur, o); if (!h) return h;
    if (lay || un.length) {
      const hs = [h], dest = o.dest || this.master, g0 = o.gain == null ? 0.25 : o.gain;
      if (lay) lay.forEach(e => { const x = this._playNote(midi + e, when, dur, Object.assign({}, o, { gain: g0 * 0.4, midi2: o.midi2 != null ? o.midi2 + e : undefined, gfrom: o.gfrom != null ? o.gfrom + e : undefined })); if (x) hs.push(x); });
      un.forEach(u => {
        let d = dest; if (c.createStereoPanner) { const sp = c.createStereoPanner(); sp.pan.value = u * 0.7; sp.connect(dest); pans.push(sp); d = sp; }
        const x = this._playNote(midi, when, dur, Object.assign({}, o, { dest: d, detune: u * (4 + 26 * uni) })); if (x) hs.push(x);
      });
      const done = () => { if (pans.length) setTimeout(() => pans.forEach(sp => { try { sp.disconnect(); } catch (e) { /* already gone */ } }), 4000); };
      h = { stop: () => { hs.forEach(x => { try { x.stop(); } catch (e) {} }); done(); }, release: () => { hs.forEach(x => { try { x.release(); } catch (e) {} }); done(); } };
    }
    if (o.nopool) return h;       // an offline render schedules the whole song at once: no voice is ever cut
    /* Past MAX_VOICES the oldest note is faded out quickly rather than letting the audio thread overload and drop samples. */
    const now = this.ctx.currentTime, V = o.seq ? (this.seqLive || (this.seqLive = [])) : (this.live || (this.live = []));     // the sequencer has its own, larger pool so chords are not cut
    for (let i = V.length - 1; i >= 0; i--) if (V[i].end < now) V.splice(i, 1);
    V.push({ h, end: when + dur + 1 });
    while (V.length > (o.seq ? 48 : 16)) { const old = V.shift(); try { old.h.release(); } catch (e) {} }
    return h;
  },
  /* The partial amplitudes of each built-in timbre as a cached periodic wave, plus the factor that gives it the loudness of the old stack of weighted sines. */
  voiceWave(tb) {
    const cache = this.waves || (this.waves = {}), c = this.ctx; if (cache[tb] && cache[tb].ctx === c) return cache[tb];
    const amps = timbreOf(tb).amps, sum = amps.reduce((a, b) => a + b, 0);
    const real = new Float32Array(amps.length + 1), imag = new Float32Array(amps.length + 1); amps.forEach((a, i) => { imag[i + 1] = a / sum; });
    let peak = 0; for (let k = 0; k < 2048; k++) { const th = k / 2048 * 2 * Math.PI; let v = 0; amps.forEach((a, i) => { v += a / sum * Math.sin((i + 1) * th); }); peak = Math.max(peak, Math.abs(v)); }
    return cache[tb] = { ctx: c, wave: c.createPeriodicWave(real, imag), k: peak };      // a periodic wave is normalised to a peak of 1, the stack peaked at `peak`
  },
  /* One second of white noise, made once and shared by the drum kit and the breathy voices. */
  noiseBuffer() {
    if (!this.noiseBuf) { const c = this.ctx, b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this.noiseBuf = b; }
    return this.noiseBuf;
  },
  driveCurve(k) { const m = this.curves || (this.curves = {}); if (!m[k]) { const n = 1024, a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = Math.tanh(k * (i / (n - 1) * 2 - 1)) / Math.tanh(k); m[k] = a; } return m[k]; },
  _playNote(midi, when, dur, o) {
    if (o.preset != null ? (o.font || SF).cache.has(o.preset) : Store.data.settings.timbre === 'sf' && SF.ready) { try { const r = SF.play(midi, when, dur, o); if (r) return r; } catch (e) { console.error(e); } }   // notes the font has no sample for fall back to the built-in sound
    const c = this.ctx, a4 = Store.data.settings.a4;
    const g = c.createGain(); g.connect(o.dest || this.master);
    const tb = o.synth || Store.data.settings.timbre, TB = timbreOf(tb), W = this.voiceWave(tb), vib = this.vibOn(), freq = midiToFreq(midi, a4);
    const osc = c.createOscillator(); osc.setPeriodicWave(W.wave);      // the whole timbre is one oscillator: a stack of sine partials cost four to six
    if (o.gfrom != null && o.midi2 == null) { osc.frequency.setValueAtTime(midiToFreq(o.gfrom, a4), when); osc.frequency.exponentialRampToValueAtTime(freq, when + o.gt); }
    else if (TB.glide && o.midi2 == null) { osc.frequency.setValueAtTime(freq * TB.glide[0], when); osc.frequency.exponentialRampToValueAtTime(freq, when + TB.glide[1]); } else osc.frequency.setValueAtTime(freq, when);
    if (o.midi2 != null) osc.frequency.exponentialRampToValueAtTime(midiToFreq(o.midi2, a4), when + dur);
    if (this.fx && vib) this.fx.vibDepth.connect(osc.detune);      // a connected detune makes every oscillator compute its pitch per sample, so only when vibrato is on
    if (o.bend) o.bend.connect(osc.detune);      // pitch wheel of the sequencer track
    g.gain.value = 0; const nodes = [g], oscs = [osc], gain = (o.gain == null ? 0.25 : o.gain) * W.k * (TB.trim || 1);
    const bq = (type, hz, q) => { const f = c.createBiquadFilter(); f.type = type; f.frequency.value = hz; if (q) f.Q.value = q; nodes.push(f); return f; };
    if (!TB.noOsc) {      // the oscillator's route: low-pass, clipping, then straight on or through the vowel filters
      let src = osc; const chain = n => { src.connect(n); src = n; };
      if (TB.lp) chain(bq('lowpass', Math.min(freq * TB.lp, 16000)));
      if (TB.drive) { const sh = c.createWaveShaper(); sh.curve = this.driveCurve(TB.drive); nodes.push(sh); chain(sh); }
      if (TB.formants) TB.formants.forEach(F => { const b = bq('bandpass', F[0], F[1]), fg = c.createGain(); fg.gain.value = F[2]; nodes.push(fg); src.connect(b); b.connect(fg); fg.connect(g); });
      else src.connect(g);
    }
    const ev = o.env || (o.live ? this.envCustom() : null), tail = ev ? ev.r + 0.4 : 0.15;
    if (o.live || o.detune) osc.detune.value = (o.live ? Store.data.settings.fineTune || 0 : 0) + (o.detune || 0);
    osc.start(when); osc.stop(when + dur + tail);
    if (TB.noise) {      // breath or wind: looped noise through a band-pass, shaped by the same envelope
      const N = TB.noise, ns = c.createBufferSource(), nf = bq('bandpass', N[3] || clamp(freq * N[1], 80, 12000), N[2]), ng = c.createGain(); ng.gain.value = N[0]; nodes.push(ng);
      ns.buffer = this.noiseBuffer(); ns.loop = true; ns.connect(nf); nf.connect(ng); ng.connect(g); ns.start(when, Math.random() * 0.5); ns.stop(when + dur + tail); oscs.push(ns);
    }
    const at = Math.min(TB.a || 0.01, Math.max(0.01, dur * 0.4));      // attack: a bowed or blown sound swells, a struck one starts at once
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain, when + at);
    if (ev) try { const a2 = Math.max(0.008, ev.a); g.gain.cancelScheduledValues(when); g.gain.setValueAtTime(0, when); for (let i = 1; i <= 8; i++) g.gain.linearRampToValueAtTime(gain * (1 - Math.cos(Math.PI * i / 8)) / 2, when + a2 * i / 8); g.gain.setTargetAtTime(gain * ev.s, when + a2, Math.max(0.005, ev.d / 3)); g.gain.setTargetAtTime(0, when + dur, Math.max(0.02, ev.r / 6)); } catch (e) { g.gain.cancelScheduledValues(when); g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain, when + 0.01); }      // a raised-cosine rise in small steps (a value curve can clash with the next event and throw, which left the note playing with no handle) and exponential tails
    else if (o.sustain || o.midi2 != null || TB.hold) { g.gain.setValueAtTime(gain, Math.max(when + at + 0.01, when + dur - 0.05)); g.gain.linearRampToValueAtTime(0, when + dur + 0.05); }
    else { g.gain.exponentialRampToValueAtTime(gain * (TB.f || 0.35), when + Math.max(at + 0.01, Math.min(dur, TB.T || 1.5))); g.gain.linearRampToValueAtTime(0, when + dur + 0.08); }
    const cut = () => { try { g.gain.cancelScheduledValues(0); g.gain.value = 0; } catch (e) {} oscs.forEach(x => { try { x.stop(); } catch (e) {} }); };      // last resort: silence the note whatever the timeline says
    osc.onended = () => { nodes.forEach(n => { try { n.disconnect(); } catch (e) {} }); if (o.bend) try { o.bend.disconnect(osc.detune); } catch (e) { /* already gone */ } };
    return {
      stop: () => { try { const n = c.currentTime; g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n); g.gain.linearRampToValueAtTime(0, n + 0.02); oscs.forEach(x => x.stop(n + 0.03)); } catch (e) { cut(); } },      // short fade: cutting a sine mid-wave clicks
      release: () => { try { const n = c.currentTime; g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n); const rr = ev ? Math.max(0.025, ev.r) : 0.15; if (ev) g.gain.setTargetAtTime(0, n, rr / 6); else g.gain.linearRampToValueAtTime(0, n + rr); oscs.forEach(x => x.stop(n + rr + (ev ? 0.1 : 0.05))); } catch (e) { cut(); } }
    };
  },
  /* Built-in General MIDI drum kit for when no SoundFont drums are available: every sound is a pitched sine sweep and/or filtered noise. */
  drum(note, when, vel, dest, nopool) {
    const c = this.ctx, parts = [], tail = { t: when }, v = Math.pow(clamp(vel || 100, 1, 127) / 127, 1.3), out = dest || this.master;
    this.noiseBuffer();
    const env = (g, peak, dur) => { g.gain.setValueAtTime(0.0001, when); g.gain.linearRampToValueAtTime(peak, when + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, when + dur); };
    const tone = (f0, f1, dur, peak) => { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(f0, when); o.frequency.exponentialRampToValueAtTime(f1, when + dur); env(g, peak * v, dur); o.connect(g); g.connect(out); o.start(when); o.stop(when + dur + 0.05); parts.push({ g, s: o }); tail.t = Math.max(tail.t, when + dur + 0.05); };
    const noise = (type, f, dur, peak) => { const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.noiseBuf; fl.type = type; fl.frequency.value = f; env(g, peak * v, dur); s.connect(fl); fl.connect(g); g.connect(out); s.start(when, Math.random() * 0.5); s.stop(when + dur + 0.05); parts.push({ g, s }); tail.t = Math.max(tail.t, when + dur + 0.05); };
    if (note === 35 || note === 36) { tone(150, 45, 0.28, 0.9); noise('lowpass', 400, 0.03, 0.3); }
    else if (note === 38 || note === 40) { tone(220, 120, 0.12, 0.35); noise('highpass', 1800, 0.18, 0.5); }
    else if (note === 37) { tone(800, 600, 0.03, 0.4); noise('highpass', 3000, 0.03, 0.3); }
    else if (note === 39) { noise('bandpass', 1500, 0.2, 0.7); }
    else if (note === 42 || note === 44) noise('highpass', 7000, 0.05, 0.35);
    else if (note === 46) noise('highpass', 7000, 0.35, 0.35);
    else if (note === 49 || note === 52 || note === 55 || note === 57) noise('highpass', 5000, 1.1, 0.4);
    else if (note === 51 || note === 53 || note === 59) { noise('highpass', 8000, 0.5, 0.25); tone(5000, 4800, 0.3, 0.05); }
    else if (note >= 41 && note <= 50) { const f = 90 + (note - 41) * 18; tone(f * 1.6, f, 0.25, 0.7); }
    else if (note === 56) { tone(800, 790, 0.15, 0.4); tone(540, 535, 0.15, 0.4); }
    else tone(1000, 900, 0.04, 0.3);
    const h = { stop() { const n = c.currentTime; parts.forEach(p => { try { p.g.gain.cancelScheduledValues(n); p.g.gain.setValueAtTime(p.g.gain.value, n); p.g.gain.linearRampToValueAtTime(0, n + 0.04); p.s.stop(n + 0.05); } catch (e) {} }); }, release() {} };
    if (nopool) return h;       // an offline render keeps every hit
    /* Like the pitched notes: past 32 hits still sounding (each counted until its own tail ends), the oldest is faded out. */
    const now = c.currentTime, V = this.drumLive || (this.drumLive = []);
    for (let i = V.length - 1; i >= 0; i--) if (V[i].end < now) V.splice(i, 1);
    V.push({ h, end: tail.t });
    while (V.length > 32) { try { V.shift().h.stop(); } catch (e) {} }
    return h;
  },
  click(when, freq, vol, dur) {
    const c = this.ctx, osc = c.createOscillator(), g = c.createGain(); dur = dur || 0.06;
    osc.frequency.value = freq || 880; g.gain.setValueAtTime(vol || 0.15, when); g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    osc.connect(g); g.connect(this.clickBus); osc.start(when); osc.stop(when + dur + 0.02);
    return { stop: () => { try { osc.stop(); } catch (e) {} } };
  },
  /* Some sound systems put an idle output to sleep, and the first short click after silence is lost. A tone far below hearing keeps it awake. */
  keepAwake(on) {
    if (this.awake) { try { this.awake.stop(); } catch (e) {} this.awake = null; }
    if (!on || !this.ctx || !this.clickBus) return;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain(); o.frequency.value = 40; g.gain.value = 0.0005; o.connect(g); g.connect(this.clickBus); o.start(); this.awake = o;
  },
  chime() { const t = this.ctx.currentTime; this.click(t, 1318, 0.12, 0.25); this.click(t + 0.08, 1760, 0.08, 0.25); },
  tick() { this.click(this.ctx.currentTime, 260, 0.12, 0.05); },
  drone(midi, from, to) {
    const c = this.ctx, osc = c.createOscillator(), g = c.createGain();
    osc.type = 'triangle'; osc.frequency.value = midiToFreq(midi, Store.data.settings.a4);
    g.gain.setValueAtTime(0, from); g.gain.linearRampToValueAtTime(0.06, from + 0.3); g.gain.setValueAtTime(0.06, to - 0.3); g.gain.linearRampToValueAtTime(0, to);
    osc.connect(g); g.connect(this.master); osc.start(from); osc.stop(to + 0.1);
    return { stop: () => { try { const n = c.currentTime; g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n); g.gain.linearRampToValueAtTime(0, n + 0.03); osc.stop(n + 0.04); } catch (e) {} } };
  }
};
function micMessage(e) {
  const n = e && e.name;
  if (n === 'NotAllowedError' || n === 'PermissionDeniedError') return 'Microphone permission was denied. Allow it in the browser settings and tap again. (If this page is embedded in another app, open it directly in the browser.)';
  if (n === 'NotFoundError') return 'No microphone was found.';
  if (n === 'NotReadableError') return 'The microphone is in use by another app. Close it and try again.';
  return 'Could not open the microphone (' + (n || 'unknown error') + '). The page needs HTTPS or localhost.';
}

