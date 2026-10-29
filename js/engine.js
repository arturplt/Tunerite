"use strict";
/* ---- Audio engine ---- */
const Engine = {
  ctx: null, stream: null, master: null, node: null, inst: 'voice', tracker: null, listeners: new Set(), ready: false, level: -90, lat: 0,
  async start() {
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
    this.analyser = this.ctx.createAnalyser(); this.analyser.fftSize = 16384; this.analyser.smoothingTimeConstant = 0.3; mic.connect(this.analyser);
    this.specAn = this.ctx.createAnalyser(); this.specAn.smoothingTimeConstant = 0.3; mic.connect(this.specAn);     // the spectrogram has its own analyser, so its detail setting never disturbs chord and source detection
    const node = new AudioWorkletNode(this.ctx, 'pitch-proc', { numberOfOutputs: 1, outputChannelCount: [1] });
    const mute = this.ctx.createGain(); mute.gain.value = 0;      // keeps the node pulled by the graph without playing the mic
    mic.connect(node); node.connect(mute); mute.connect(this.ctx.destination);
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
  async getStream(id) {
    const base = { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 };
    try { return await navigator.mediaDevices.getUserMedia({ audio: id ? Object.assign({ deviceId: { exact: id } }, base) : base }); }
    catch (e) { if (id && e && e.name === 'OverconstrainedError') { Store.data.settings.micId = ''; Store.save(); return navigator.mediaDevices.getUserMedia({ audio: base }); } throw e; }
  },
  /* Switches the microphone while running: new stream into the same analyser and pitch worklet. */
  async setMic(id) {
    if (!this.ready) return;
    const st = await this.getStream(id); this.stream.getTracks().forEach(t => t.stop()); this.mic.disconnect();
    this.stream = st; this.mic = this.ctx.createMediaStreamSource(st); this.mic.connect(this.analyser); this.mic.connect(this.specAn); this.mic.connect(this.node);
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
    if (this.master) { this.master.gain.setTargetAtTime(s.vol, this.ctx.currentTime, 0.02); this.clickBus.gain.setTargetAtTime(s.vol, this.ctx.currentTime, 0.02); this.setFx(); }      // eased, so dragging the slider does not click
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
    this.master = mk(); this.master.gain.value = Store.data.settings.vol;
    this.clickBus = mk(); this.clickBus.gain.value = Store.data.settings.vol; /* connected below, after the compressor exists */
    this.outAn = c.createAnalyser(); this.outAn.smoothingTimeConstant = 0.3; this.master.connect(this.outAn);      // taps the app's own sound before the speakers, for the blue half of the spectrogram
    comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 6; comp.attack.value = 0.004; comp.release.value = 0.2;
    const N = 4096, cv = new Float32Array(N);
    for (let i = 0; i < N; i++) { const x = i / (N - 1) * 2 - 1, a = Math.abs(x), y = a < 0.8 ? a : 0.8 + 0.2 * Math.tanh((a - 0.8) / 0.2); cv[i] = x < 0 ? -y : y; }
    sat.curve = cv; sat.oversample = '2x';
    this.master.connect(bus); this.chainFx(bus, comp); comp.connect(sat); sat.connect(c.destination);
    this.clickBus.connect(comp);      // metronome and cues skip every effect but share the same output stage as the notes
    this.rvSend = mk(); this.rvWet = mk(); this.conv = c.createConvolver(); this.rvKind = '';
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
    F.dl = c.createDelay(1.5); F.dlFb = mk(); F.dlWet = mk(); F.dlFb.gain.value = 0.4; F.dlWet.gain.value = 0;
    F.L.echo = [this.master, F.dl]; F.dl.connect(F.dlFb); F.dlFb.connect(F.dl); F.dl.connect(F.dlWet); F.dlWet.connect(bus);
    F.vibLfo = c.createOscillator(); F.vibDepth = mk(); F.vibLfo.frequency.value = 5.6; F.vibDepth.gain.value = 0; F.vibLfo.connect(F.vibDepth); F.vibLfo.start();      // cents; each voice connects it to its own detune
  },
  /* Noise with an exponential decay is a good enough room: a short one for 'room', a long one for 'hall'. */
  impulse(sec, decay) {
    const c = this.ctx, n = Math.floor(c.sampleRate * sec), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay) * Math.min(1, i / (c.sampleRate * 0.004)); }
    return b;
  },
  setFx() {
    if (!this.conv) return;
    const s = Store.data.settings, t = this.ctx.currentTime, F = this.fx, lv = { off: 0, light: 1, medium: 2, deep: 3 };
    if (F) {
      const tr = [0, 0.15, 0.35, 0.6][lv[s.fxTrem] || 0], tn = { dark: [3, -9], warm: [4, -4], neutral: [0, 0], bright: [-3, 6] }[s.fxTone] || [0, 0];
      F.tr.gain.setTargetAtTime(1 - tr / 2, t, 0.05); F.trDepth.gain.setTargetAtTime(tr / 2, t, 0.05);
      F.vibDepth.gain.setTargetAtTime([0, 12, 25, 50][lv[s.fxVib] || 0], t, 0.05);
      F.lo.gain.setTargetAtTime(tn[0], t, 0.05); F.hi.gain.setTargetAtTime(tn[1], t, 0.05);
      const dl = { short: 0.18, medium: 0.35, long: 0.6 }[s.fxDelay]; if (dl) F.dl.delayTime.setTargetAtTime(dl, t, 0.05); F.dlWet.gain.setTargetAtTime(dl ? 0.45 : 0, t, 0.05);
      F.wdWet.gain.setTargetAtTime(s.fxWide ? 0.6 : 0, t, 0.05);
      F.phWet.gain.setTargetAtTime(s.fxPhase === 'phaser' ? 0.8 : 0, t, 0.05); F.flWet.gain.setTargetAtTime(s.fxPhase === 'flanger' ? 0.7 : 0, t, 0.05);
      const dr = { warm: [0.8, 0.35, 3], crunch: [0.4, 0.7, 8] }[s.fxDrive] || [1, 0, 1]; F.drDry.gain.setTargetAtTime(dr[0], t, 0.05); F.drWet.gain.setTargetAtTime(dr[1], t, 0.05); F.drPre.gain.setTargetAtTime(dr[2], t, 0.05);
    }
    if (F) {      // an effect that is off is not in the signal path at all: idle delays, filters and an oversampled shaper cost the audio thread even when silent
      const link = (k, on) => {
        const L = F.L[k], list = Array.isArray(L[0]) ? L : [L]; F.want = F.want || {}; F.want[k] = on;
        if (on) { if (!F.on[k]) { F.on[k] = true; list.forEach(([a, b]) => a.connect(b)); } }
        else if (F.on[k]) setTimeout(() => { if (!F.want[k] && F.on[k]) { F.on[k] = false; list.forEach(([a, b]) => { try { a.disconnect(b); } catch (e) { /* already gone */ } }); } }, 600);
      };
      link('drive', !!({ warm: 1, crunch: 1 }[s.fxDrive])); link('phase', s.fxPhase === 'phaser'); link('flange', s.fxPhase === 'flanger'); link('wide', !!s.fxWide); link('echo', !!{ short: 1, medium: 1, long: 1 }[s.fxDelay]); link('chorus', !!s.chorus);
    }
    const kind = s.reverb === 'room' || s.reverb === 'hall' ? s.reverb : '';
    if (kind !== this.rvKind) {
      this.rvKind = kind;
      if (kind) this.conv.buffer = this.impulse(kind === 'hall' ? 2.4 : 0.9, kind === 'hall' ? 2.5 : 3);
      this.rvSend.gain.setTargetAtTime(kind ? 1 : 0, t, 0.02);
    }
    this.rvWet.gain.setTargetAtTime(kind === 'hall' ? 0.55 : kind === 'room' ? 0.4 : 0, t, 0.02);
    this.chWet.gain.setTargetAtTime(s.chorus ? 0.5 : 0, t, 0.05);
  },
  outLatency() { const c = this.ctx; return (c.outputLatency || c.baseLatency || 0); },
  /* Soft piano-like tone: a few harmonics with a gentle decay. sustain=true gives a steady tone (guide, glides). */
  playNote(midi, when, dur, o) {
    o = o || {}; const st = Store.data.settings;
    if (o.live && st.fxHuman) { when += Math.random() * 0.012; o = Object.assign({}, o, { gain: (o.gain == null ? 0.25 : o.gain) * (0.85 + Math.random() * 0.3), vel: clamp(Math.round((o.vel || 100) * (0.9 + Math.random() * 0.2)), 1, 127) }); }
    let h = this._playNote(midi, when, dur, o); if (!h) return h;
    const lay = o.live ? { up: [12], down: [-12], both: [-12, 12] }[st.fxOct] : null;       // the octave layer is only for notes you play, never for exercise tones
    if (lay) {
      const hs = [h]; lay.forEach(e => { const x = this._playNote(midi + e, when, dur, Object.assign({}, o, { gain: (o.gain == null ? 0.25 : o.gain) * 0.4, midi2: o.midi2 != null ? o.midi2 + e : undefined })); if (x) hs.push(x); });
      h = { stop: () => hs.forEach(x => { try { x.stop(); } catch (e) {} }), release: () => hs.forEach(x => { try { x.release(); } catch (e) {} }) };
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
    const amps = tb === 'pure' ? [1] : tb === 'organ' ? [1, 0.8, 0.55, 0.4, 0.25] : tb === 'piano' ? [1, 0.6, 0.38, 0.22, 0.14, 0.09] : [1, 0.45, 0.2, 0.1], sum = amps.reduce((a, b) => a + b, 0);
    const real = new Float32Array(amps.length + 1), imag = new Float32Array(amps.length + 1); amps.forEach((a, i) => { imag[i + 1] = a / sum; });
    let peak = 0; for (let k = 0; k < 2048; k++) { const th = k / 2048 * 2 * Math.PI; let v = 0; amps.forEach((a, i) => { v += a / sum * Math.sin((i + 1) * th); }); peak = Math.max(peak, Math.abs(v)); }
    return cache[tb] = { ctx: c, wave: c.createPeriodicWave(real, imag), k: peak };      // a periodic wave is normalised to a peak of 1, the stack peaked at `peak`
  },
  _playNote(midi, when, dur, o) {
    if (o.preset != null ? SF.cache.has(o.preset) : Store.data.settings.timbre === 'sf' && SF.ready) { try { const r = SF.play(midi, when, dur, o); if (r) return r; } catch (e) { console.error(e); } }   // notes the font has no sample for fall back to the built-in sound
    const c = this.ctx, a4 = Store.data.settings.a4;
    const g = c.createGain(); g.connect(o.dest || this.master);
    const tb = o.synth || Store.data.settings.timbre, W = this.voiceWave(tb), vib = Store.data.settings.fxVib;
    const osc = c.createOscillator(); osc.setPeriodicWave(W.wave);      // the whole timbre is one oscillator: a stack of sine partials cost four to six
    osc.frequency.setValueAtTime(midiToFreq(midi, a4), when);
    if (o.midi2 != null) osc.frequency.exponentialRampToValueAtTime(midiToFreq(o.midi2, a4), when + dur);
    if (this.fx && vib && vib !== 'off') this.fx.vibDepth.connect(osc.detune);      // a connected detune makes every oscillator compute its pitch per sample, so only when vibrato is on
    if (o.bend) o.bend.connect(osc.detune);      // pitch wheel of the sequencer track
    g.gain.value = 0; osc.connect(g); osc.start(when); osc.stop(when + dur + 0.15); const oscs = [osc], gain = (o.gain == null ? 0.25 : o.gain) * W.k;
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain, when + 0.01);
    if (o.sustain || o.midi2 != null) { g.gain.setValueAtTime(gain, Math.max(when + 0.02, when + dur - 0.05)); g.gain.linearRampToValueAtTime(0, when + dur + 0.05); }
    else { g.gain.exponentialRampToValueAtTime(gain * (tb === 'piano' ? 0.08 : 0.35), when + Math.min(dur, tb === 'piano' ? 2.2 : 1.5)); g.gain.linearRampToValueAtTime(0, when + dur + 0.08); }
    oscs[0].onended = () => { g.disconnect(); if (o.bend) oscs.forEach(x => { try { o.bend.disconnect(x.detune); } catch (e) { /* already gone */ } }); };
    return {
      stop: () => { try { const n = c.currentTime; g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n); g.gain.linearRampToValueAtTime(0, n + 0.02); oscs.forEach(x => x.stop(n + 0.03)); } catch (e) {} },      // short fade: cutting a sine mid-wave clicks
      release: () => { try { const n = c.currentTime; g.gain.cancelScheduledValues(n); g.gain.setValueAtTime(g.gain.value, n); g.gain.linearRampToValueAtTime(0, n + 0.15); oscs.forEach(x => x.stop(n + 0.2)); } catch (e) {} }
    };
  },
  /* Built-in General MIDI drum kit for when no SoundFont drums are available: every sound is a pitched sine sweep and/or filtered noise. */
  drum(note, when, vel, dest) {
    const c = this.ctx, v = Math.pow(clamp(vel || 100, 1, 127) / 127, 1.3), out = dest || this.master;
    if (!this.noiseBuf) { const b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; this.noiseBuf = b; }
    const env = (g, peak, dur) => { g.gain.setValueAtTime(0.0001, when); g.gain.linearRampToValueAtTime(peak, when + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, when + dur); };
    const tone = (f0, f1, dur, peak) => { const o = c.createOscillator(), g = c.createGain(); o.frequency.setValueAtTime(f0, when); o.frequency.exponentialRampToValueAtTime(f1, when + dur); env(g, peak * v, dur); o.connect(g); g.connect(out); o.start(when); o.stop(when + dur + 0.05); };
    const noise = (type, f, dur, peak) => { const s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.noiseBuf; fl.type = type; fl.frequency.value = f; env(g, peak * v, dur); s.connect(fl); fl.connect(g); g.connect(out); s.start(when, Math.random() * 0.5); s.stop(when + dur + 0.05); };
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
    return { stop() {}, release() {} };
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

