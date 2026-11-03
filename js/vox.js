"use strict";
/* ---- Voice tracks (Compose) ----
   A voice track is a raw microphone recording that sits at a position on the song's timeline (Seq.vox). It goes through the same mixer channel as a MIDI track
   (volume, pan, mute, solo, effects) and is kept in IndexedDB under 'vox:' + id, next to the song. Recording runs through Rec (source "Voice (audio)"), which gives the count-in,
   the click and the backing tracks; this file only captures the samples and plays them back. Played at another tempo the clip is sped up or slowed down, pitch included. */
const Vox = {
  sel: null, view: null, drag: false, node: null, ctx: null, chunks: [], src: [], n: 0,
  /* Loads the capture worklet once per audio context. */
  async prep() {
    const c = Engine.ctx; if (this.node && this.ctx === c) return;
    const code = `class Cap extends AudioWorkletProcessor { constructor() { super(); this.on = false; this.port.onmessage = e => { this.on = e.data; }; }
      process(i) { const x = i[0] && i[0][0]; if (this.on && x) this.port.postMessage({ t: currentTime, d: x.slice() }); return true; } }
      registerProcessor('vox-cap', Cap);`;
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
    await c.audioWorklet.addModule(url); URL.revokeObjectURL(url);
    const node = new AudioWorkletNode(c, 'vox-cap', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] }), mute = c.createGain(); mute.gain.value = 0; node.connect(mute); mute.connect(c.destination);
    node.port.onmessage = e => { if (!this.live) return; this.chunks.push(e.data); this.feed(e.data.d); };
    this.node = node; this.ctx = c;
  },
  begin() { this.chunks = []; this.pcm = new Float32Array(1 << 18); this.pn = 0; this.lv = null; this.live = true; this.node.port.postMessage(true); (Engine.nOut || Engine.mic).connect(this.node); },
  /* Ends the capture. `from` is the audio time of the first sample to keep; returns { data, sr } or null. */
  finish(from) {
    this.live = false; if (this.node) { this.node.port.postMessage(false); try { (Engine.nOut || Engine.mic).disconnect(this.node); } catch (e) { /* the mic was swapped */ } }
    const ch = this.chunks; this.chunks = []; if (!ch.length) return null;
    const sr = Engine.ctx.sampleRate, skip = Math.round((from - ch[0].t) * sr), total = ch.reduce((a, c) => a + c.d.length, 0), all = new Float32Array(total);
    let o = 0; ch.forEach(c => { all.set(c.d, o); o += c.d.length; });
    const data = skip >= 0 ? all.subarray(Math.min(skip, total)) : Float32Array.from(Array(-skip).fill(0).concat(Array.from(all)));
    return data.length > sr * 0.1 ? { data, sr } : null;
  },
  /* A finished take becomes a new track at song time `start`. */
  add(clip, start) {
    const buf = new AudioBuffer({ length: clip.data.length, sampleRate: clip.sr, numberOfChannels: 1 }); buf.copyToChannel(clip.data, 0);
    const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6), v = this.make({ id, name: 'Voice ' + (Seq.vox.length + 1), start, buf });
    Seq.vox.push(v); SeqStore.tx('readwrite', s => s.put({ name: 'vox:' + id, ch: clip.data.slice(), sr: clip.sr })).catch(() => toast('The recording could not be stored; it will be gone after a reload.', 4000));
    Seq.save(); Seq.render(); this.select(v); return v;
  },
  make(m) { return { i: 1000 + this.n++, id: m.id, name: m.name || 'Voice', buf: m.buf, start: m.start || 0, vol: m.vol == null ? 0.9 : m.vol, panv: m.pan || 0, mute: !!m.mute, solo: !!m.solo, fx: m.fx || null, tune: m.tune || null, strip: null }; },
  /* What plays and what the spectrogram shows: the pitch-corrected copy when there is one. */
  pb(v) { return v.bypass ? v.buf : (v.tuned || v.buf); },
  remove(v) {
    Seq.halt(); Seq.release(); Seq.vox = Seq.vox.filter(x => x !== v); SeqStore.del('vox:' + v.id).catch(() => {}); Seq.save(); Seq.render(); Seq.sync();
  },
  /* The recordings of a song that was just loaded, from the list kept in Store.data.seq. */
  async restore(list) {
    const want = Seq.name;
    for (const m of list || []) {
      try {
        const r = await SeqStore.getKey('vox:' + m.id); if (!r || Seq.name !== want) continue;
        const buf = new AudioBuffer({ length: r.ch.length, sampleRate: r.sr, numberOfChannels: 1 }); buf.copyToChannel(r.ch, 0); Seq.vox.push(this.make(Object.assign({}, m, { buf })));
      } catch (e) { console.warn('voice track skipped', e); }
    }
    (Seq.vox || []).forEach(v => { if (v.tune && v.tune.amt > 0.005) this.runTune(v); });
    if (list && list.length) Seq.render();
  },
  /* ---- pitch correction ---- */
  TKEYS: ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'], TSCALES: [['chrom', 'Chromatic'], ['follow', 'Editor scale / song key'], ['major', 'Major'], ['minor', 'Minor'], ['pentmaj', 'Pentatonic major'], ['pentmin', 'Pentatonic minor'], ['blues', 'Minor blues'], ['bluesmaj', 'Major blues'], ['dorian', 'Dorian'], ['mixo', 'Mixolydian'], ['harm', 'Harmonic minor']],
  /* The tuning knobs. d: resting value; txt: the label shows the value in real units. */
  TKNOBS: [
    { k: 'amt', n: 'Tune', d: 0, bi: false, tip: 'How far the voice is pulled to the nearest note' },
    { k: 'spd', n: 'Speed', d: 0.35, bi: false, tip: 'Slow keeps the natural slides; fast is the robotic hard-tune sound' },
    { k: 'rng', n: 'Range', d: 0, bi: false, tip: 'Dead zone: a note within this many cents of its target is only pulled to the edge of the zone, so the natural wobble stays (0 to 50 cents)', txt: v => v < 0.02 ? 'Range off' : 'Range ±' + Math.round(v * 50) + 'c' },
    { k: 'hum', n: 'Vibrato', d: 0, bi: false, tip: 'Keep the singer\'s vibrato: the centre of the note is corrected, the wobble around it stays. 0 flattens it, 1 keeps all of it', txt: v => v < 0.02 ? 'Vibrato flat' : 'Keep vib ' + Math.round(v * 100) + '%' },
    { k: 'sld', n: 'Slides', d: 0, bi: false, tip: 'Protect fast slides and scoops between notes from the correction; only the held parts snap', txt: v => v < 0.02 ? 'Slides off' : 'Keep slides ' + Math.round(v * 100) + '%' },
    { k: 'mix', n: 'Dry', d: 0, bi: false, tip: 'Blend some of the original voice back in, up to 60%. Hides small artifacts; too much sounds phasey', txt: v => v < 0.02 ? 'Dry off' : 'Dry ' + Math.round(v * 60) + '%' },
    { k: 'mxs', n: 'Max', d: 0.4, bi: false, tip: 'The largest correction in semitones (1 to 6). Lower is safer on a rough recording', txt: v => 'Max ' + (1 + 5 * v).toFixed(1) + ' st' },
    { k: 'fin', n: 'Fine', d: 0.5, bi: true, tip: 'Moves every target note up or down by up to 50 cents, for a backing that is slightly out of tune', txt: v => Math.abs(v - 0.5) < 0.01 ? 'Fine 0' : 'Fine ' + ((v - 0.5) * 100 > 0 ? '+' : '') + Math.round((v - 0.5) * 100) + 'c' },
  ],
  /* The scale list, then one entry per melodic track of the song: "follow this track". */
  scaleOptions() {
    const esc = x => String(x).replace(/[<>&"]/g, ''), trk = Seq.tracks.filter(t => !t.drums && t.notes.length);
    return this.TSCALES.map(([k, n]) => '<option value="' + k + '">' + n + '</option>').join('') + (trk.length ? '<optgroup label="Follow a track\'s notes">' + trk.map(t => '<option value="trk:' + t.tid + ':' + t.ch + '">' + esc(t.name) + '</option>').join('') + '</optgroup>' : '');
  },
  /* The song was edited: voices that follow a track are corrected again against its new notes. */
  refollow() { Seq.vox.forEach(v => { const t = this.tuneOf(v); if (/^trk:/.test(t.scale) && t.amt > 0.005) this.retune(v); }); },
  tuneOf(v) { const t = v.tune || (v.tune = {}), d = { root: 0, scale: 'chrom', amt: 0, spd: 0.35, rng: 0, hum: 0, sld: 0, mix: 0, mxs: 0.4, fin: 0.5 }; Object.keys(d).forEach(k => { if (t[k] == null) t[k] = d[k]; }); return t; },
  /* Settings changed: correct again a moment after the last change. */
  retune(v) { clearTimeout(v.tt); v.tt = setTimeout(() => this.runTune(v), 350); },
  async runTune(v) {
    const t = this.tuneOf(v), job = v.tjob = (v.tjob || 0) + 1;
    if (!(t.amt > 0.005)) { v.tuned = null; v.spec = null; v.dbg = null; this.mark(v, ''); return; }
    this.mark(v, 'Tuning…');
    try { const b = await Tune.process(v.buf, this.tuneOpts(v)); if (job !== v.tjob) return; v.tuned = b; v.dbg = b.dbg; v.spec = null; }
    catch (e) { console.error(e); toast('Pitch correction failed: ' + (e.message || e), 4000); }
    if (job === v.tjob) this.mark(v, '');
  },
  mark(v, msg) { const d = $(`#sqTracks .sqvox[data-vid="${v.id}"] .sqtunb`); if (d) { d.textContent = msg || 'TUNE'; d.classList.toggle('on', !msg && this.tuneOf(v).amt > 0.005); } },
  /* Song time where the last recording ends. */
  end() { return Seq.vox.reduce((a, v) => Math.max(a, v.start + v.buf.duration), 0); },
  /* Starts every recording that is still ahead of song time `base`, with song time `base` heard at audio time T0. */
  play(base, T0, tempo) {
    const c = Engine.ctx; if (!c) return;
    Seq.vox.forEach(v => {
      if (!v.strip || v.start + v.buf.duration <= base) return;
      const s = c.createBufferSource(); s.buffer = this.pb(v); s.playbackRate.value = tempo; s.connect(v.strip);
      let when = T0 + (Math.max(v.start, base) - base) / tempo, off = Math.max(0, base - v.start); const late = c.currentTime - when;
      if (late > 0) { off += late * tempo; when = c.currentTime; }
      if (off >= v.buf.duration) return; s.start(when, off); this.src.push(s);
    });
  },
  /* Stops them now, or at audio time `at` (the end of a loop region). */
  stop(at) { this.src.forEach(s => { try { s.stop(at); } catch (e) { /* never started */ } }); this.src = []; },
  /* Mixer rows, after the MIDI tracks. */
  rows(box) {
    Seq.vox.forEach(v => {
      const d = document.createElement('div'); d.className = 'sqtrack sqvox'; d.style.setProperty('--tc', this.colour(v));
      d.innerHTML = '<div class="sqname"><b></b><small></small></div><button class="sqb" data-k="m" title="Mute">M</button><button class="sqb" data-k="s" title="Solo">S</button><button class="sqb" data-k="x" title="Delete this recording">✕</button><input class="sqvname" aria-label="Name" title="Rename"><input type="range" class="sqvol" min="0" max="100" aria-label="Volume" title="Volume"><div class="sqm" style="grid-column:1/4"><i></i></div><input type="range" class="sqpan" min="-100" max="100" aria-label="Pan" title="Pan (double-click to centre)"><button class="sqb sqfxb" title="Effects for this track">FX</button><button class="sqb sqtunb" title="Pitch correction: pull the voice towards the notes of a scale">TUNE</button><div class="sqtune" hidden><select class="tkey" aria-label="Key"></select><select class="tscale" aria-label="Scale"></select><button class="sqb sqab" title="Hear the original or the corrected voice (plays again from where you are)">TUNED</button><div class="sqtk"></div></div><div class="sqfx" hidden></div>';
      d.querySelector('b').textContent = 'Voice recording'; d.querySelector('small').textContent = 'starts at ' + Seq.fmt(v.start) + ' · ' + v.buf.duration.toFixed(1) + ' s';
      const nm = d.querySelector('.sqvname'); nm.value = v.name; nm.onchange = () => { v.name = nm.value.trim() || 'Voice'; Seq.save(); };
      const vol = d.querySelector('.sqvol'); vol.value = Math.round(v.vol * 100); vol.oninput = () => { v.vol = vol.value / 100; Seq.gains(); }; vol.onchange = () => Seq.save();
      const pan = d.querySelector('.sqpan'); pan.value = Math.round(v.panv * 100);
      pan.oninput = () => { v.panv = pan.value / 100; if (v.pan) v.pan.pan.setTargetAtTime(v.panv, Engine.ctx.currentTime, 0.015); }; pan.onchange = () => Seq.save(); pan.ondblclick = () => { pan.value = 0; pan.oninput(); Seq.save(); };
      const m = d.querySelector('[data-k=m]'), s = d.querySelector('[data-k=s]'); m.classList.toggle('on', v.mute); s.classList.toggle('on', v.solo);
      m.onclick = () => { v.mute = !v.mute; m.classList.toggle('on', v.mute); Seq.gains(); Seq.save(); }; s.onclick = () => { v.solo = !v.solo; s.classList.toggle('on', v.solo); Seq.gains(); Seq.save(); };
      d.querySelector('[data-k=x]').onclick = () => { if (confirm('Delete "' + v.name + '"?')) this.remove(v); };
      d.dataset.vid = v.id; d.onclick = e => { if (e.target.closest('button,select,input,.knob')) return; this.select(v); };
      const tn = this.tuneOf(v), tp = d.querySelector('.sqtune'), tb = d.querySelector('.sqtunb'), key = d.querySelector('.tkey'), sc = d.querySelector('.tscale');
      key.innerHTML = this.TKEYS.map((k, i) => '<option value="' + i + '">' + k + '</option>').join(''); key.value = tn.root; sc.innerHTML = this.scaleOptions(); if (![...sc.options].some(o => o.value === tn.scale)) sc.insertAdjacentHTML('beforeend', '<option value="' + tn.scale + '">(track not found)</option>'); sc.value = tn.scale; key.disabled = !/^(major|minor|pent|blues|dorian|mixo|harm)/.test(tn.scale);
      key.onchange = () => { tn.root = +key.value; Seq.save(); this.retune(v); }; sc.onchange = () => { tn.scale = sc.value; key.disabled = !/^(major|minor|pent|blues|dorian|mixo|harm)/.test(tn.scale); Seq.save(); this.retune(v); };
      Knobs.mount(d.querySelector('.sqtk'), this.TKNOBS, k => tn[k], (k, x) => { tn[k] = x; this.mark(v, ''); this.retune(v); });
      const ab = d.querySelector('.sqab'); ab.classList.toggle('on', !!v.bypass); ab.textContent = v.bypass ? 'ORIGINAL' : 'TUNED';
      ab.onclick = () => { v.bypass = !v.bypass; ab.classList.toggle('on', v.bypass); ab.textContent = v.bypass ? 'ORIGINAL' : 'TUNED'; v.spec = null; if (Seq.playing && !Seq.acc) Seq.start(Seq.pos()); };      // plays the untouched recording or the corrected one, from where you are
      tp.hidden = !v.tuneOpen; tb.onclick = () => { v.tuneOpen = !v.tuneOpen; tp.hidden = !v.tuneOpen; }; this.mark(v, '');
      Seq.fxUI(d, v); box.appendChild(d);
    });
  },
  /* ---- the voice view: a spectrogram in place of the piano roll or the drum grid ----
     Time runs left to right in song seconds (so it lines up with the playhead), pitch bottom to top on a log scale from C2 to C7 with a line at every C. */
  FMIN: 65.41, FMAX: 2093, ROWS: 260, q: 3, dbgOn: false,
  /* Spectrogram detail: the analysis window is 512 << q samples (512, 1024, 2048, 4096, 8192), moved a quarter window at a time. */
  get N() { return 512 << this.q; }, get HOP() { return this.N / 4; },
  setDetail(q) {
    q = clamp(Math.round(q), 0, 4); if (q === this.q) return; this.q = q; Store.data.settings.voxQ = q; Store.save(); this.lv = null; Seq.vox.forEach(v => { v.spec = null; v.ospec = null; });
    const lab = $('#voxQv'); if (lab) lab.textContent = this.N;
  },
  select(v) { this.sel = v; this.selTi = Ed.ti; this.view = null; if (!v.spec) this.analyse(v); },
  active() { if (this.sel && (Ed.ti !== this.selTi || !Seq.vox.includes(this.sel) || !Ed.on)) this.sel = null; return this.sel; },
  /* The samples of the take so far, for the live spectrogram. */
  feed(d) {
    if (this.pn + d.length > this.pcm.length) { const b = new Float32Array(this.pcm.length * 2); b.set(this.pcm.subarray(0, this.pn)); this.pcm = b; }
    this.pcm.set(d, this.pn); this.pn += d.length;
  },
  /* Draws the frames that have become available into the live picture (a few per call, so the screen stays smooth). */
  advance() {
    const c = Engine.ctx, sr = c.sampleRate, R = this.ROWS; if (!this.chunks.length) return null;
    if (this.lv && this.lv.N !== this.N) this.lv = null;
    const N = this.N, H = this.HOP; let L = this.lv; if (!L) { const cv = document.createElement('canvas'); cv.width = 1024; cv.height = R; L = this.lv = { N, H, cv, F: 0, cap: 1024, t0: this.chunks[0].t, re: new Float64Array(N), im: new Float64Array(N), mag: new Float64Array(N / 2), win: new Float64Array(N).map((_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1))), bin: new Float64Array(R).map((_, r) => this.FMIN * Math.pow(this.FMAX / this.FMIN, r / (R - 1)) * N / sr) }; }
    for (let n = 0; n < (this.pn - L.F * H > H * 80 ? 60 : 6) && (L.F * H + N) <= this.pn; n++) {      // catches up faster after the detail was changed

      if (L.F >= L.cap) { const nc = document.createElement('canvas'); nc.width = L.cap * 2; nc.height = R; nc.getContext('2d').drawImage(L.cv, 0, 0); L.cv = nc; L.cap *= 2; }
      const { re, im, mag, win, bin } = L; for (let i = 0; i < N; i++) { re[i] = this.pcm[L.F * H + i] * win[i]; im[i] = 0; }
      this.fft(re, im); for (let k = 0; k < N / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
      const col = L.cv.getContext('2d').createImageData(1, R);
      for (let r = 0; r < R; r++) { const b = bin[r], k = Math.min(N / 2 - 2, Math.floor(b)), m = mag[k] + (mag[k + 1] - mag[k]) * (b - k), x = clamp((20 * Math.log10(Math.max(m, 1e-9) / (N / 4)) + 85) / 60, 0, 1); this.rgb(x, col.data, (R - 1 - r) * 4); }
      L.cv.getContext('2d').putImageData(col, L.F, 0); L.F++;
    }
    return L;
  },
  rgb(x, d, o) { d[o] = clamp(x * 2.2 * 255, 0, 255); d[o + 1] = clamp((x - 0.35) * 2.2 * 255, 0, 255); d[o + 2] = clamp(60 + x * 120 - Math.max(0, x - 0.6) * 300, 0, 255); d[o + 3] = 255; },
  /* Builds the picture a slice at a time so a long recording does not freeze the page. */
  analyse(v, orig) {      // orig: the picture of the untouched recording (v.ospec), used for the line that shows what was sung
    const key = orig ? 'ospec' : 'spec', pb = orig ? v.buf : this.pb(v), ch = pb.getChannelData(0), sr = pb.sampleRate, N = this.N, H = Math.max(this.HOP, Math.ceil(ch.length / 16000)), F = Math.max(1, Math.floor((ch.length - N) / H) + 1), R = this.ROWS;      // very long recordings get a coarser hop: a picture wider than the canvas limit cannot be made
    const cv = document.createElement('canvas'); cv.width = F; cv.height = R; const g = cv.getContext('2d'), spec = v[key] = { cv, F, N, H, hop: H / sr, win: N / sr, done: 0, peak: 0, mags: new Float32Array(F * R), at: new Int16Array(F), top: new Float32Array(F) };
    const win = new Float64Array(N); for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1));
    const bin = new Float64Array(R); for (let r = 0; r < R; r++) bin[r] = this.FMIN * Math.pow(this.FMAX / this.FMIN, r / (R - 1)) * N / sr;
    const re = new Float64Array(N), im = new Float64Array(N), mag = new Float64Array(N / 2);
    const step = () => {
      if (v[key] !== spec) return; const end = Math.min(F, spec.done + 120);
      for (let f = spec.done; f < end; f++) {
        for (let i = 0; i < N; i++) { re[i] = (ch[f * H + i] || 0) * win[i]; im[i] = 0; }
        this.fft(re, im); for (let k = 0; k < N / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
        let bm = 0; for (let r = 0; r < R; r++) { const b = bin[r], k = Math.min(N / 2 - 2, Math.floor(b)), m = mag[k] + (mag[k + 1] - mag[k]) * (b - k); spec.mags[f * R + r] = m; if (m > spec.peak) spec.peak = m; if (m > bm) { bm = m; spec.at[f] = r; } }
        spec.top[f] = bm;
      }
      spec.done = end; if (end < F) setTimeout(step, 0); else this.paintSpec(spec);
    };
    step();
  },
  fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let len = 2; len <= n; len <<= 1) {
      const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
      for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const u = i + k, w = u + len / 2, xr = re[w] * cr - im[w] * ci, xi = re[w] * ci + im[w] * cr; re[w] = re[u] - xr; im[w] = im[u] - xi; re[u] += xr; im[u] += xi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
    }
  },
  /* Magnitudes to colour: 60 dB below the loudest point is black, then through purple and amber to white. */
  paintSpec(spec) {
    const R = this.ROWS, g = spec.cv.getContext('2d'), img = g.createImageData(spec.F, R), top = Math.max(spec.peak, 1e-9);
    for (let f = 0; f < spec.F; f++) for (let r = 0; r < R; r++) {
      const db = 20 * Math.log10(Math.max(spec.mags[f * R + r], 1e-12) / top), x = clamp((db + 60) / 60, 0, 1), o = ((R - 1 - r) * spec.F + f) * 4;      // low notes at the bottom
      this.rgb(x, img.data, o);
    }
    g.putImageData(img, 0, 0); spec.mags = null; spec.ready = true;
    for (let f = 0; f < spec.F; f++) if (spec.top[f] < top * 0.1) spec.at[f] = -1;      // too quiet to follow: the line breaks here
  },
  draw() {
    const rec = Rec.state !== 'idle' && Rec.src === 'audio' && Rec.song === Ed.song, v = rec ? null : this.active(), cv = $('#voxCv'); if (!cv) return;
    $$('#sqTracks .sqvox').forEach(d => d.classList.toggle('sel', !!v && d.dataset.vid === v.id)); cv.hidden = !v && !rec; $('#voxBar').hidden = cv.hidden; $('#voxGhost').classList.toggle('on', Ed.ghost); $('#voxDbg').classList.toggle('on', this.dbgOn); $('#voxSave').hidden = !(v && this.dbgOn && v.dbg); $('#voxQ').value = this.q; $('#voxQv').textContent = this.N;
    if (!v && !rec) return; if (v && !v.spec) this.analyse(v); if (v && v.tuned && !v.ospec) this.analyse(v, true);
    $('#edCv').hidden = true; $('#edSteps').hidden = true; $$('#sqEdit .pr').forEach(el => { el.hidden = true; }); $$('#sqTracks .sqtrack:not(.sqvox)').forEach(d => d.classList.remove('sel'));
    const { g, w, h } = fitCanvas(cv); if (w < 60 || h < 60) return; const U = UIK, lab = 40 * U, top = 20 * U;
    /* What is drawn: the finished recording, or the take in progress (placed where it will land on the song's timeline). */
    let img = null, start = 0, dur = 0;
    if (rec) {
      const L = this.advance(); if (!this.view || this.view.rec !== Rec.T0) this.view = { x0: Math.max(0, Rec.base - 1), pps: (w - lab) / 15, rec: Rec.T0 };
      if (L && L.F) { start = Rec.base + (L.t0 + (L.N / 2 - L.H / 2) / Engine.ctx.sampleRate - Rec.lat - Rec.T0) * Rec.tempo; dur = L.F * L.H / Engine.ctx.sampleRate * Rec.tempo; img = { cv: L.cv, F: L.F }; }
    } else {
      const spec = v.spec; dur = v.buf.duration; start = v.start; if (spec && spec.ready) img = { cv: spec.cv, F: spec.F };
      if (!this.view || this.view.rec) this.view = { x0: v.start - dur * 0.02, pps: (w - lab) / (dur * 1.04) };
    }
    const V = this.view, X = t => lab + (t - V.x0) * V.pps, pos = Seq.pos();
    if ((Seq.playing || rec) && !this.drag && (X(pos) > w - 8 || X(pos) < lab)) V.x0 = pos - (w - lab) * 0.1 / V.pps;
    g.fillStyle = '#0d0c10'; g.fillRect(0, 0, w, h);
    const x0 = X(start), x1 = X(start + dur);
    if (img) { g.imageSmoothingEnabled = true; g.drawImage(img.cv, 0, 0, img.F, this.ROWS, x0, top, Math.max(1, x1 - x0), h - top); }
    else if (!rec) { g.fillStyle = '#8a8a96'; g.font = 12 * U + 'px system-ui,sans-serif'; g.textAlign = 'center'; g.fillText('Analysing the recording…', w / 2, h / 2); }
    const Y = f => top + (h - top) * (1 - Math.log(f / this.FMIN) / Math.log(this.FMAX / this.FMIN));
    g.font = 10 * U + 'px system-ui,sans-serif'; g.textAlign = 'right'; g.textBaseline = 'middle';
    for (let o = 2; o <= 7; o++) { const f = 16.3516 * Math.pow(2, o), y = Y(f); g.strokeStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.moveTo(lab, y); g.lineTo(w, y); g.stroke(); g.fillStyle = '#9a9aa6'; g.fillText('C' + o, lab - 5 * U, y); }
    if (Ed.ghost) this.overlay(g, X, Y, w, h, top, lab, v);
    if (v && this.dbgOn) { if (!v.dbg) this.loadDbg(v); else this.debugDraw(g, v, X, Y, w, h, top, lab, pos); }
    if (v && v.tuned && v.ospec && v.ospec.ready) { g.save(); g.beginPath(); g.rect(lab, top, w - lab, h - top); g.clip(); g.lineWidth = 2 * UIK; g.lineJoin = 'round'; this.contour(g, v.ospec, v.start, v.buf.sampleRate, '#ffffff', X, w, h, top, lab); g.restore(); }      // white: what was sung; the picture underneath is the corrected voice
    g.fillStyle = '#17171a'; g.fillRect(0, 0, w, top); g.fillStyle = '#9a9aa6'; g.textAlign = 'left'; g.textBaseline = 'middle';
    const span = (w - lab) / V.pps, st = [0.1, 0.2, 0.5, 1, 2, 5, 10, 30, 60].find(s => span / s < 12) || 60;
    for (let t = Math.ceil(V.x0 / st) * st; X(t) < w; t += st) { const x = X(t); if (x < lab) continue; g.fillRect(x, top - 5 * U, 1, 5 * U); g.fillText(Seq.fmt(t) + (st < 1 ? '.' + Math.round((t % 1) * 10) : ''), x + 3 * U, top / 2 - 1); }
    g.fillStyle = '#17171a'; g.fillRect(0, top, lab, h - top);
    for (let o = 2; o <= 7; o++) { const y = Y(16.3516 * Math.pow(2, o)); g.fillStyle = '#9a9aa6'; g.textAlign = 'right'; g.fillText('C' + o, lab - 5 * U, y); }
    const px = X(pos); if (px >= lab && px <= w) { g.fillStyle = '#ffb347'; g.fillRect(px - 1, 0, 2, h); }
  },
  colour(v) { return SEQ_COLORS[(Seq.tracks.length + Math.max(0, Seq.vox.indexOf(v))) % SEQ_COLORS.length]; },
  /* The other tracks, in their own colours over the picture, like the faint notes in the piano roll: MIDI notes as bars, other voices as the line of their loudest pitch. */
  overlay(g, X, Y, w, h, top, lab, cur) {
    g.save(); g.beginPath(); g.rect(lab, top, w - lab, h - top); g.clip();
    const song = Ed.song, fr = m => 440 * Math.pow(2, (m - 69) / 12);
    if (song) song.tracks.forEach((t, ti) => {
      if (Steps.isDrum(t) || !t.notes.length) return; g.fillStyle = SEQ_COLORS[ti % SEQ_COLORS.length]; g.globalAlpha = 0.5;
      t.notes.forEach(n => { const a = X(songSec(song, n.tick)), b = X(songSec(song, n.tick + n.dur)); if (b < lab || a > w) return; const y0 = Y(fr(n.midi + 0.5)), y1 = Y(fr(n.midi - 0.5)); g.fillRect(a, y0, Math.max(2, b - a), Math.max(2, y1 - y0)); });
    });
    g.globalAlpha = 1; g.lineWidth = 2 * UIK; g.lineJoin = 'round';
    Seq.vox.forEach(o => {
      if (o === cur) return; if (!o.spec) return this.analyse(o); const s = o.spec; if (!s.ready) return;
      this.contour(g, s, o.start, o.buf.sampleRate, this.colour(o), X, w, h, top, lab);
    });
    g.restore();
  },
  /* ---- pitch debug ---- */
  /* The notes of the track a voice follows, in seconds from the start of the recording (null when the track is gone or has no notes). */
  followNotes(v) {
    const m = /^trk:(.*)$/.exec(this.tuneOf(v).scale); if (!m) return null; const tr = Seq.tracks.find(t => !t.drums && t.tid + ':' + t.ch === m[1]); if (!tr || !tr.notes.length) return null;
    const ns = tr.notes.map(n => ({ s: n.start - v.start, e: n.start + n.dur - v.start, m: n.midi })).sort((a, b) => a.s - b.s); ns.maxLen = ns.reduce((a, n) => Math.max(a, n.e - n.s), 0); return ns;
  },
  tuneOpts(v) {
    const t = this.tuneOf(v), o = this.scaleOpts(v);
    return Object.assign(o, { amount: t.amt, speed: t.spd, a4: Store.data.settings.a4, range: t.rng * 50, human: t.hum, slides: t.sld, dry: t.mix * 0.6, maxShift: 1 + 5 * t.mxs, fine: (t.fin - 0.5) * 100 });
  },
  /* Which notes the voice is pulled to: a followed track, or a scale. */
  scaleOpts(v) {
    const t = this.tuneOf(v); let set = null, root = t.root; const notes = this.followNotes(v);
    if (notes) return { set: null, root: 0, notes, maxLen: notes.maxLen };
    if (t.scale === 'follow') { const sc = Ed.scaleInfo(); if (sc) { set = sc.set; root = sc.root; } } else if (t.scale !== 'chrom') set = new Set(Ed.SCALES[t.scale]);
    return { set, root };
  },
  /* The pitch data of a recording that has not been corrected (a corrected one gets it from the correction). */
  loadDbg(v) {
    if (v.dbgBusy) return; v.dbgBusy = true;
    Tune.inspect(v.buf, this.tuneOpts(v)).then(d => { v.dbg = d; }).catch(e => console.error(e)).finally(() => { v.dbgBusy = false; });
  },
  /* Counts of sudden jumps (a quarter of an octave or more between neighbouring frames) in a pitch track. */
  jumps(a) { let n = 0, prev = 0; for (let f = 0; f < a.length; f++) if (a[f] > 0) { if (prev && Math.abs(12 * Math.log2(a[f] / prev)) >= 9) n++; prev = a[f]; } return n; },
  debugDraw(g, v, X, Y, w, h, top, lab, pos) {
    const d = v.dbg, U = UIK, t0 = v.start, fx = f => X(t0 + f * d.H / d.sr), hz = m => 440 * Math.pow(2, (m - 69) / 12);
    g.save(); g.beginPath(); g.rect(lab, top, w - lab, h - top); g.clip();
    g.fillStyle = 'rgba(255,80,80,.9)'; for (let f = 0; f < d.F; f++) { const x = fx(f); if (x < lab - 4 || x > w + 4 || !(d.raw[f] > 0)) continue; g.fillRect(x - U, Y(d.raw[f]) - U, 2 * U, 2 * U); }      // red: the plain detector, frame by frame
    g.strokeStyle = '#7ee05a'; g.lineWidth = 2 * U; g.beginPath(); let pen = false;      // green: the pitch the correction works from
    for (let f = 0; f < d.F; f++) { const x = fx(f); if (!(d.f0[f] > 0)) { pen = false; continue; } const y = Y(d.f0[f]); if (pen) g.lineTo(x, y); else { g.moveTo(x, y); pen = true; } } g.stroke();
    g.strokeStyle = '#ffd84a'; g.lineWidth = 2 * U; g.beginPath(); pen = false;      // yellow: the note it is pulled to
    for (let f = 0; f < d.F; f++) { const x = fx(f); if (!(d.target && d.target[f] > 0)) { pen = false; continue; } const y = Y(hz(d.target[f])); if (pen) g.lineTo(x, y); else { g.moveTo(x, y); pen = true; } } g.stroke();
    g.restore();
    const vr = Array.from(d.raw).filter(f => f > 0).length, vf = Array.from(d.f0).filter(f => f > 0).length, moved = d.shift ? Array.from(d.shift).filter((c, f) => d.f0[f] > 0 && Math.abs(c) > 10).length : 0, fi = Math.max(0, Math.min(d.F - 1, Math.round((pos - t0) * d.sr / d.H)));
    const nm = f => f > 0 ? noteName(Math.round(69 + 12 * Math.log2(f / 440))) : '–', ln = [
      `PITCH DEBUG  ${d.F} frames of ${(d.H / d.sr * 1000).toFixed(1)} ms`, `pitched: detector ${vr}, used ${vf}   ·   jumps of 9+ semitones: detector ${this.jumps(d.raw)}, used ${this.jumps(d.f0)}`,
      `pulled by more than 10 cents: ${moved} frames`, `at the playhead:  detector ${d.raw[fi] > 0 ? d.raw[fi].toFixed(1) + ' Hz ' + nm(d.raw[fi]) : '–'}   used ${d.f0[fi] > 0 ? d.f0[fi].toFixed(1) + ' Hz ' + nm(d.f0[fi]) : '–'}   →  ${d.target && d.target[fi] > 0 ? noteName(d.target[fi]) + ' (' + (d.shift[fi] >= 0 ? '+' : '') + d.shift[fi].toFixed(0) + ' cents)' : '–'}`,
      'red = detector   green = used   yellow = target note'];
    g.font = 11 * U + 'px ui-monospace,monospace'; g.textAlign = 'left'; g.textBaseline = 'top'; const bw = Math.max(...ln.map(l => g.measureText(l).width)) + 12 * U;
    g.fillStyle = 'rgba(13,12,16,.82)'; g.fillRect(lab + 6 * U, top + 6 * U, bw, ln.length * 15 * U + 8 * U); g.fillStyle = '#e8e8ee'; ln.forEach((l, i) => g.fillText(l, lab + 12 * U, top + 10 * U + i * 15 * U));
  },
  saveDbg(v) {
    const d = v.dbg; if (!d) return; const r = (a, k) => Array.from(a, x => Math.round(x * k) / k);
    const json = JSON.stringify({ name: v.name, sampleRate: d.sr, hop: d.H, frames: d.F, start: v.start, tune: this.tuneOf(v), raw: r(d.raw, 10), path: r(d.path, 10), used: r(d.f0, 10), conf: r(d.conf, 100), rms: r(d.rms, 10000), targetMidi: d.target ? r(d.target, 1) : null, shiftCents: d.shift ? r(d.shift, 10) : null });
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = 'pitch-debug-' + (v.name || 'voice').replace(/[^\w\-]+/g, '_') + '.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  },
  /* The line of the loudest pitch of an analysed recording. */
  contour(g, s, start, sr, colour, X, w, h, top, lab) {
    g.strokeStyle = colour; g.beginPath(); let pen = false;
    for (let f = 0; f < s.F; f++) {
      const r = s.at[f], x = X(start + (f * s.H + s.N / 2) / sr); if (x < lab - 4 || x > w + 4) { pen = false; continue; }
      if (r < 0) { pen = false; continue; } const y = top + (h - top) * (1 - r / (this.ROWS - 1)); if (pen) g.lineTo(x, y); else { g.moveTo(x, y); pen = true; }
    }
    g.stroke();
  },
  wire() {
    const cv = $('#voxCv'); if (!cv) return; let d = null;
    const t2x = e => e.clientX - cv.getBoundingClientRect().left;
    cv.addEventListener('pointerdown', e => { if (!this.view) return; cv.setPointerCapture(e.pointerId); d = { x: e.clientX, x0: this.view.x0, moved: false }; this.drag = true; });
    cv.addEventListener('pointermove', e => { if (!d) return; if (Math.abs(e.clientX - d.x) > 4) d.moved = true; if (d.moved) this.view.x0 = d.x0 - (e.clientX - d.x) / this.view.pps; });
    const up = e => { if (!d) return; if (!d.moved && Rec.state === 'idle') { const lab = 40 * UIK, t = this.view.x0 + (t2x(e) - lab) / this.view.pps; if (t2x(e) >= lab) Seq.seek(Math.max(0, t)); } d = null; this.drag = false; };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => { d = null; this.drag = false; });
    cv.addEventListener('wheel', e => { e.preventDefault(); const V = this.view; if (!V) return; const lab = 40 * UIK, t = V.x0 + (t2x(e) - lab) / V.pps; V.pps = clamp(V.pps * (e.deltaY < 0 ? 1.2 : 1 / 1.2), 2, 4000); V.x0 = t - (t2x(e) - lab) / V.pps; }, { passive: false });
  },
  init() { this.wire(); try { this.q = clamp(Store.data.settings.voxQ == null ? 3 : Store.data.settings.voxQ, 0, 4); } catch (e) { /* default */ } $('#voxQ').oninput = e => this.setDetail(+e.target.value); $('#voxDbg').onclick = () => { this.dbgOn = !this.dbgOn; }; $('#voxSave').onclick = () => { if (this.active()) this.saveDbg(this.active()); };
    $('#voxGhost').onclick = e => { Ed.ghost = !Ed.ghost; Store.data.settings.edGhost = Ed.ghost; Store.save(); e.currentTarget.classList.toggle('on', Ed.ghost); const b = $('#edGhost'); if (b) b.classList.toggle('on', Ed.ghost); }; const b = $('#sqAddVox'); if (b) b.onclick = () => { if (Rec.state !== 'idle') return; Rec.src = 'audio'; const sel = $('#edSrc'); if (sel) sel.value = 'audio'; Rec.start(); }; },
};
