"use strict";
/* ---- Sequencer: every track of a MIDI file, each with its own instrument ----
   A lookahead scheduler: a 25 ms timer queues the notes of the next 0.35 s on the audio clock. Each track plays into its own gain "strip", so volume, mute and solo act at once.
   The Train screen reuses it as an accompaniment: start(from, { at, skip }) begins at a given audio time and leaves out the track you are singing. */
const GM_PROGRAMS = ['Acoustic Grand Piano','Bright Acoustic Piano','Electric Grand Piano','Honky-tonk Piano','Electric Piano 1','Electric Piano 2','Harpsichord','Clavinet','Celesta','Glockenspiel','Music Box','Vibraphone','Marimba','Xylophone','Tubular Bells','Dulcimer','Drawbar Organ','Percussive Organ','Rock Organ','Church Organ','Reed Organ','Accordion','Harmonica','Tango Accordion','Acoustic Guitar (nylon)','Acoustic Guitar (steel)','Electric Guitar (jazz)','Electric Guitar (clean)','Electric Guitar (muted)','Overdriven Guitar','Distortion Guitar','Guitar Harmonics','Acoustic Bass','Electric Bass (finger)','Electric Bass (pick)','Fretless Bass','Slap Bass 1','Slap Bass 2','Synth Bass 1','Synth Bass 2','Violin','Viola','Cello','Contrabass','Tremolo Strings','Pizzicato Strings','Orchestral Harp','Timpani','String Ensemble 1','String Ensemble 2','Synth Strings 1','Synth Strings 2','Choir Aahs','Voice Oohs','Synth Voice','Orchestra Hit','Trumpet','Trombone','Tuba','Muted Trumpet','French Horn','Brass Section','Synth Brass 1','Synth Brass 2','Soprano Sax','Alto Sax','Tenor Sax','Baritone Sax','Oboe','English Horn','Bassoon','Clarinet','Piccolo','Flute','Recorder','Pan Flute','Blown Bottle','Shakuhachi','Whistle','Ocarina','Lead 1 (square)','Lead 2 (sawtooth)','Lead 3 (calliope)','Lead 4 (chiff)','Lead 5 (charang)','Lead 6 (voice)','Lead 7 (fifths)','Lead 8 (bass + lead)','Pad 1 (new age)','Pad 2 (warm)','Pad 3 (polysynth)','Pad 4 (choir)','Pad 5 (bowed)','Pad 6 (metallic)','Pad 7 (halo)','Pad 8 (sweep)','FX 1 (rain)','FX 2 (soundtrack)','FX 3 (crystal)','FX 4 (atmosphere)','FX 5 (brightness)','FX 6 (goblins)','FX 7 (echoes)','FX 8 (sci-fi)','Sitar','Banjo','Shamisen','Koto','Kalimba','Bagpipe','Fiddle','Shehnai','Tinkle Bell','Agogo','Steel Drums','Woodblock','Taiko Drum','Melodic Tom','Synth Drum','Reverse Cymbal','Guitar Fret Noise','Breath Noise','Seashore','Bird Tweet','Telephone Ring','Helicopter','Applause','Gunshot'];
const GM_FAMILY = ['Piano', 'Chromatic percussion', 'Organ', 'Guitar', 'Bass', 'Strings', 'Ensemble', 'Brass', 'Reed', 'Pipe', 'Synth lead', 'Synth pad', 'Synth effects', 'Ethnic', 'Percussive', 'Sound effects'];
const SEQ_COLORS = ['#ffb347', '#7ee05a', '#5ac8e0', '#e05a8a', '#b48aff', '#e0d45a', '#ff7a5a', '#8ae0b4'];
/* The built-in voice that stands in for each General MIDI program (eight per row, one family per row) when no SoundFont has it. */
const GM_SYNTH = [
  'piano', 'piano', 'piano', 'piano', 'epiano', 'epiano', 'pluck', 'pluck',      // piano: grand, bright, electric grand, honky-tonk, e-pianos, harpsichord, clavinet
  'mallet', 'mallet', 'mallet', 'mallet', 'mallet', 'mallet', 'mallet', 'mallet',      // chromatic percussion
  'organ', 'organ', 'organ', 'organ', 'organ', 'reed', 'reed', 'reed',      // organ, then accordion and harmonica
  'nylon', 'pluck', 'pluck', 'pluck', 'muted', 'dist', 'dist', 'pluck',      // guitar
  'cello', 'bass', 'bass', 'bass', 'bass', 'bass', 'bass', 'bass',      // bass
  'strings', 'strings', 'cello', 'cello', 'strings', 'pizz', 'harp', 'timpani',      // strings
  'strings', 'strings', 'warmpad', 'warmpad', 'aah', 'ooh', 'aah', 'brassens',      // ensemble
  'trumpet', 'trombone', 'trombone', 'trumpet', 'brassens', 'brass', 'brass', 'brass',      // brass
  'sax', 'sax', 'sax', 'sax', 'oboe', 'oboe', 'reed', 'clarinet',      // reed
  'flute', 'flute', 'recorder', 'panflute', 'panflute', 'panflute', 'flute', 'flute',      // pipe
  'square', 'lead', 'recorder', 'recorder', 'dist', 'aah', 'sync', 'sync',      // synth lead
  'warmpad', 'warmpad', 'brightpad', 'aah', 'warmpad', 'brightpad', 'ooh', 'brightpad',      // synth pad
  'wind', 'warmpad', 'mallet', 'warmpad', 'brightpad', 'ooh', 'pad', 'sync',      // synth effects
  'sitar', 'pluck', 'pluck', 'harp', 'kalimba', 'bagpipe', 'strings', 'oboe',      // ethnic
  'mallet', 'mallet', 'steeldrum', 'mallet', 'taiko', 'timpani', 'timpani', 'wind',      // percussive
  'soft', 'wind', 'sea', 'flute', 'mallet', 'wind', 'sea', 'taiko'      // sound effects
];
const synthFor = p => GM_SYNTH[p] || 'soft';
const SeqStore = {
  db: null,
  open() { if (this.db) return Promise.resolve(this.db); return new Promise((res, rej) => { if (!window.indexedDB) return rej(new Error('no storage')); const rq = indexedDB.open('pitchperfect-seq', 1); rq.onupgradeneeded = () => rq.result.createObjectStore('songs', { keyPath: 'name' }); rq.onsuccess = () => { this.db = rq.result; res(this.db); }; rq.onerror = () => rej(rq.error); }); },
  async tx(mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('songs', mode), r = fn(t.objectStore('songs')); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); },
  put(file, bytes) { return this.tx('readwrite', s => s.put({ name: 'last', file, bytes, ts: Date.now() })); },
  get() { return this.tx('readonly', s => s.get('last')); },
  /* Projects: every song is also kept under its own name ('proj:' + title) so it can be reopened from the list. */
  putProj(title, bytes, meta) { return this.tx('readwrite', s => s.put({ name: 'proj:' + title, title, bytes, ts: Date.now(), tracks: meta.tracks, notes: meta.notes, dur: meta.dur })); },
  getKey(key) { return this.tx('readonly', s => s.get(key)); },
  del(key) { return this.tx('readwrite', s => s.delete(key)); },
  async list() { const all = await this.tx('readonly', s => s.getAll()); return (all || []).filter(r => String(r.name).startsWith('proj:')).sort((a, b) => b.ts - a.ts); }
};
const PLAY_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><path d="M7 5v14l11-7z"/></svg>', PAUSE_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>';
const Seq = {
  name: '', bpm: 100, tracks: [], vox: [], length: 0, lo: 48, hi: 84, playing: false, acc: false, loop: false, tempo: 1, base: 0, T0: 0, skip: -1, nodes: [], timer: 0, gen: 0, sing: -1, drag: false, loopA: null, loopB: null,
  get loaded() { return this.tracks.length > 0 || !!this.song; },
  get maxPos() { return Rec.state !== 'idle' ? 1e9 : Ed.on ? this.length + 600 : this.length; },   // a take, or the editor (tempo and time signature changes late in a short song), may go past the end
  /* parsed = the result of parseMidi. Saved choices are restored when the file name matches the last one used. */
  load(parsed, name, song, prev) {
    const units = parsed.units.filter(u => u.notes.length);
    if (!units.length && !song) throw new Error('No notes found in that file.');
    this.halt(); this.release();
    units.sort((a, b) => (a.drums ? 1 : 0) - (b.drums ? 1 : 0));
    const sv = Store.data.seq && Store.data.seq.name === name ? Store.data.seq : {};
    this.tracks = units.map((u, i) => {
      const ps = (prev ? prev(u) : (sv.tracks || [])[i]) || {}; let lo = 127, hi = 0, end = 0;
      u.notes.forEach(n => { if (n.midi < lo) lo = n.midi; if (n.midi > hi) hi = n.midi; if (n.start + n.dur > end) end = n.start + n.dur; });
      return { i, ti: u.ti, tid: u.tid, auto: u.auto || null, name: u.name || (u.drums ? 'Drums' : 'Track ' + (i + 1)), ch: u.ch, drums: u.drums, program: u.program || 0, bank: u.bank || 0, notes: u.notes, lo, hi, end,
        inst: ps.inst || 'auto', vol: ps.vol == null ? 0.8 : ps.vol, panv: ps.panv != null ? ps.panv : ps.pan || 0, fx: ps.fx || null, mute: !!ps.mute, solo: !!ps.solo, strip: null, ni: 0 };
    });
    this.song = song || null; this.name = name; this.bpm = parsed.bpm; this.length = Math.max.apply(null, [0].concat(this.tracks.map(t => t.end)));
    const mel = this.tracks.filter(t => !t.drums); this.lo = mel.length ? Math.min.apply(null, mel.map(t => t.lo)) - 1 : 48; this.hi = mel.length ? Math.max.apply(null, mel.map(t => t.hi)) + 1 : 84;
    if (this.hi - this.lo < 12) this.hi = this.lo + 12;
    if (!prev) { this.vox = []; Vox.restore(sv.vox); }      // an edit of the same song (prev given) keeps the recordings that are already loaded
    this.base = 0; this.tempo = sv.tempo || 1; this.sing = sv.sing != null && this.tracks[sv.sing] ? sv.sing : -1; this.loop = !!sv.loop; this.loopA = sv.loopA != null && sv.loopB > sv.loopA ? sv.loopA : null; this.loopB = this.loopA != null ? sv.loopB : null;
  },
  save() { Store.data.seq = Object.assign(Store.data.seq || {}, { name: this.name, sing: this.sing, tempo: this.tempo, loop: this.loop, loopA: this.loopA, loopB: this.loopB, vox: this.vox.map(v => ({ id: v.id, name: v.name, start: v.start, vol: v.vol, pan: v.panv || 0, mute: v.mute, solo: v.solo, fx: v.fx || null, tune: v.tune || null })), tracks: this.tracks.map(t => ({ inst: t.inst, vol: t.vol, pan: t.panv || 0, fx: t.fx || null, mute: t.mute, solo: t.solo })) }); Store.save(); },
  /* Which sound a track plays: a SoundFont preset (index), a built-in voice, or the drum kit. */
  res(t) {
    const c = t.inst;
    if (c.startsWith('sf:')) {   // 'sf:<font file>|<preset>' (a stored font of its own) or the older 'sf:<preset>' (the active font)
      const m = /^sf:(.*)\|(\d+)$/.exec(c), F = m ? SF.fontOf(m[1]) : SF, i = m ? +m[2] : +c.slice(3);
      if (F && F.sf && F.sf.presets[i]) return { preset: i, font: F };
    }
    else if (c === 'kit') return { kit: true };
    else if (c.startsWith('syn:')) return { synth: c.slice(4) };
    const pi = SF.sf ? SF.findPreset(t.bank, t.program, t.drums) : -1;
    return pi >= 0 ? { preset: pi } : t.drums ? { kit: true } : { synth: synthFor(t.program) };
  },
  /* Decodes the SoundFont instruments the tracks use (the first time can take a moment). */
  async prepare() {
    for (const t of this.tracks) { const m = /^sf:(.*)\|\d+$/.exec(t.inst); if (m && !SF.fontOf(m[1])) { try { await SF.fontLoad(m[1]); } catch (e) { console.warn('SoundFont skipped', e); } } }   // a track's own font may not be loaded yet
    const seen = [];
    this.tracks.forEach(t => { const r = this.res(t); if (r.preset != null) { const F = r.font || SF; if (!seen.some(x => x.F === F && x.i === r.preset)) seen.push({ F, i: r.preset }); } });
    for (const x of seen) { try { await SF.build(x.i, null, x.F); } catch (e) { console.warn('instrument skipped', e); } }
  },
  pos() { if (!this.playing) return this.base; return clamp(Math.max(this.base, this.base + (Engine.ctx.currentTime - this.T0) * this.tempo), 0, this.maxPos); },
  /* One chain per track: strip (the mixer's volume, mute and solo) -> ctl (volume events) -> pan -> master. Tracks without volume, pan or bend events have only the strip. */
  strips() {
    const c = Engine.ctx;
    this.all().forEach(t => {
      if (t.strip) return; t.strip = c.createGain(); t.strip.gain.value = 0; let last = t.strip;
      if (t.auto) { t.ctl = c.createGain(); last.connect(t.ctl); last = t.ctl; }
      if (c.createStereoPanner) { t.pan = c.createStereoPanner(); t.pan.pan.value = t.panv || 0; last.connect(t.pan); last = t.pan; }      // the mixer's pan; MIDI pan events move it too
      if (t.auto) {
        if (c.createConstantSource) { t.bendSrc = c.createConstantSource(); t.bendSrc.offset.value = 0; t.bendSrc.start(); }     // cents, connected to the detune of every voice of the track
      }
      t.an = c.createAnalyser(); t.an.fftSize = 256; last.connect(t.an);      // level meter tap
      t.tail = last; this.wireFx(t);
    });
    this.gains();
  },
  /* ---- per-track effects ----
     Each track has its own amounts (t.fx, 0 to 1) for the six effects below. An effect at rest is not in the signal path at all; a track with every effect at rest has only one gain node between it and the master.
     Reverb is a send into one convolver shared by the tracks (a convolver per track would be too heavy); the rest are built per track. */
  ECHO_BEATS: [0.25, 0.5, 0.75, 1, 1.5, 2], ECHO_NAMES: ['1/16', '1/8', '1/8.', '1/4', '1/4.', '1/2'],
  /* k: the key in t.fx; d: the resting value; sub: a setting of another effect (it never switches anything on by itself); bi: rests in the middle (lit either side); txt: a label that shows the value. */
  FX: [
    { k: 'reverb', n: 'Reverb', d: 0, tip: 'Room around the sound (shared by all tracks)' }, { k: 'echo', n: 'Echo', d: 0, tip: 'Repeats that fade away' },
    { k: 'etime', n: 'Echo time', d: 0.4, sub: 'echo', bi: false, tip: 'Echo time as a note length at the song tempo: 1/16, 1/8, dotted 1/8, 1/4, dotted 1/4, 1/2', txt: v => 'Echo ' + Seq.ECHO_NAMES[Math.round(v * 5)] },
    { k: 'efb', n: 'Feedback', d: 0.4, sub: 'echo', bi: false, tip: 'How many repeats the echo makes' }, { k: 'chorus', n: 'Chorus', d: 0, tip: 'Thickens the sound with slightly detuned copies' },
    { k: 'tone', n: 'Tone', d: 0.5, tip: 'Dark on the left, bright on the right' }, { k: 'midgain', n: 'Mid', d: 0.5, tip: 'Boost or cut one band of the middle (set where with Mid freq)' },
    { k: 'midfreq', n: 'Mid freq', d: 0.5, sub: 'midgain', bi: false, tip: 'Which frequency the Mid knob works on, 200 Hz to 5 kHz' },
    { k: 'lowcut', n: 'Low cut', d: 0, tip: 'High-pass filter: removes rumble and low body' }, { k: 'highcut', n: 'High cut', d: 0, tip: 'Low-pass filter: removes brightness' },
    { k: 'gate', n: 'Gate', d: 0, tip: 'Noise gate: silences the track between notes or phrases, so hiss and room noise disappear' },
    { k: 'comp', n: 'Compress', d: 0, tip: 'Compressor: evens out loud and quiet notes (threshold and ratio together, with make-up gain)' },
    { k: 'attack', n: 'Attack', d: 0.5, sub: 'comp', bi: false, tip: 'How fast the compressor grabs a loud note' }, { k: 'release', n: 'Release', d: 0.5, sub: 'comp', bi: false, tip: 'How fast the compressor lets go afterwards' },
    { k: 'deess', n: 'De-ess', d: 0, tip: 'Tames harsh "s" and "t" sounds in a voice' }, { k: 'drive', n: 'Drive', d: 0, tip: 'Overdrive: warm to crunchy' },
    { k: 'lofi', n: 'Lo-fi', d: 0, tip: 'Bit crusher with a telephone-like band' }, { k: 'trem', n: 'Tremolo', d: 0, tip: 'Volume pulse' },
    { k: 'apan', n: 'Auto-pan', d: 0, tip: 'Moves the sound from side to side' }, { k: 'apanrate', n: 'Pan rate', d: 0.5, sub: 'apan', bi: false, tip: 'How fast the auto-pan swings, 0.2 to 8 times a second' },
  ],
  fxVal(t, k) { const v = t.fx && t.fx[k]; return v != null ? v : this.FX.find(f => f.k === k).d; },
  isBi(f) { return f.bi != null ? f.bi : f.d > 0; },
  fxSig(t) { return this.FX.map(f => f.sub ? 0 : (this.isBi(f) ? Math.abs(this.fxVal(t, f.k) - f.d) > 0.02 : this.fxVal(t, f.k) > 0.01) ? 1 : 0).join(''); },
  sharedReverb(c) {
    if (this.rv && this.rv.ctx === c) return this.rv.conv;
    const n = Math.floor(c.sampleRate * 1.8), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.6) * Math.min(1, i / (c.sampleRate * 0.004)); }
    const conv = c.createConvolver(); conv.buffer = b; conv.connect(Engine.master); this.rv = { ctx: c, conv }; return conv;
  },
  /* Wires tail -> effects -> master. The wiring is only rebuilt when a different set of effects is on; moving an amount just updates the parameters. */
  wireFx(t) {
    const c = Engine.ctx, tail = t.tail; if (!c || !tail) return;
    const sig = this.fxSig(t); if (t.fxKey === sig && t.fxSet) return t.fxSet();
    (t.fxn || []).forEach(n => { try { if (n.stop) n.stop(); n.disconnect(); } catch (e) { /* already gone */ } });
    try { tail.disconnect(); } catch (e) { /* nothing was connected */ }
    if (t.an) tail.connect(t.an);
    const nodes = t.fxn = [], ups = [], mk = n => { nodes.push(n); return n; }, g = () => mk(c.createGain()), bq = (type, q) => { const f = mk(c.createBiquadFilter()); f.type = type; f.Q.value = q == null ? 0.7 : q; return f; }, on = k => sig[this.FX.findIndex(f => f.k === k)] === '1', V = k => this.fxVal(t, k);
    t.fxKey = sig; let cur = tail; const chain = n => { cur.connect(n); cur = n; };
    /* In signal order: gate, filters, tone and mid, de-esser, compressor, drive, lo-fi, tremolo, auto-pan; echo, chorus and reverb are sends from the end. */
    if (on('gate')) {
      if (this.gateReady(c)) { const gt = mk(new AudioWorkletNode(c, 'trk-gate', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] })); chain(gt); ups.push(() => { gt.parameters.get('thr').value = Math.pow(10, (-60 + 40 * V('gate')) / 20); }); }
      else this.loadGate(c).then(() => { if (t.tail && t.fxKey === sig) { t.fxKey = null; this.wireFx(t); } }).catch(() => toast('The noise gate is not available in this browser.', 3000));
    }
    if (on('lowcut')) { const hp = bq('highpass'); chain(hp); ups.push(() => { hp.frequency.value = 40 * Math.pow(50, V('lowcut')); }); }
    if (on('highcut')) { const lp = bq('lowpass'); chain(lp); ups.push(() => { lp.frequency.value = 16000 * Math.pow(250 / 16000, V('highcut')); }); }
    if (on('tone')) {
      const lo = bq('lowshelf'), hi = bq('highshelf'); lo.frequency.value = 250; hi.frequency.value = 3000; chain(lo); chain(hi);
      ups.push(() => { lo.gain.value = 3 - 6 * V('tone'); hi.gain.value = (V('tone') - 0.5) * 14; });
    }
    if (on('midgain')) { const pk = bq('peaking', 1); chain(pk); ups.push(() => { pk.gain.value = (V('midgain') - 0.5) * 24; pk.frequency.value = 200 * Math.pow(25, V('midfreq')); }); }
    if (on('deess')) {      // the highs are split off at 5.5 kHz, compressed on their own and added back (one band is inverted: a pair of 2nd-order filters then sums to a flat response)
      const lo = bq('lowpass', 0.5), hi = bq('highpass', 0.5), dc = mk(c.createDynamicsCompressor()), inv = g(), sum = g(); lo.frequency.value = hi.frequency.value = 5500; inv.gain.value = -1; dc.knee.value = 6; dc.attack.value = 0.002; dc.release.value = 0.05;
      cur.connect(lo); cur.connect(hi); lo.connect(sum); hi.connect(dc); dc.connect(inv); inv.connect(sum); cur = sum;
      ups.push(() => { const a = V('deess'); dc.threshold.value = -15 - 30 * a; dc.ratio.value = 3 + 9 * a; });
    }
    if (on('comp')) {
      const cp = mk(c.createDynamicsCompressor()), mu = g(); cp.knee.value = 10; chain(cp); chain(mu);
      ups.push(() => { const a = V('comp'), thr = -6 - 34 * a, ratio = 2 + 10 * a; cp.threshold.value = thr; cp.ratio.value = ratio; cp.attack.value = 0.001 * Math.pow(100, V('attack')); cp.release.value = 0.03 * Math.pow(30, V('release')); mu.gain.value = Math.pow(10, -thr * (1 - 1 / ratio) * 0.5 / 20); });
    }
    if (on('drive')) {
      const dry = g(), wet = g(), pre = g(), sum = g(), sh = mk(c.createWaveShaper()), K = 1024, cv = new Float32Array(K); for (let i = 0; i < K; i++) cv[i] = Math.tanh((i / (K - 1) * 2 - 1) * 2.2); sh.curve = cv; sh.oversample = '2x';
      cur.connect(dry); cur.connect(pre); pre.connect(sh); sh.connect(wet); dry.connect(sum); wet.connect(sum); cur = sum;
      ups.push(() => { const d = V('drive'); dry.gain.value = 1 - 0.6 * d; wet.gain.value = 0.7 * d; pre.gain.value = 1 + 7 * d; });
    }
    if (on('lofi')) {
      const hp = bq('highpass'), lp = bq('lowpass'), sh = mk(c.createWaveShaper()); chain(hp); chain(lp); chain(sh);
      ups.push(() => {
        const a = V('lofi'), L = Math.pow(2, 9 - 6 * a), K = 2048, cv = new Float32Array(K); for (let i = 0; i < K; i++) cv[i] = Math.round((i / (K - 1) * 2 - 1) * L) / L;
        sh.curve = cv; hp.frequency.value = 20 + 380 * a; lp.frequency.value = 14000 - 10800 * a;
      });
    }
    if (on('trem')) {
      const tr = g(), lfo = mk(c.createOscillator()), dep = g(); lfo.frequency.value = 5.5; lfo.connect(dep); dep.connect(tr.gain); lfo.start(); chain(tr);
      ups.push(() => { const d = V('trem') * 0.3; tr.gain.value = 1 - d; dep.gain.value = d; });
    }
    if (on('apan') && c.createStereoPanner) {
      const pn = mk(c.createStereoPanner()), lfo = mk(c.createOscillator()), dep = g(); pn.pan.value = 0; lfo.connect(dep); dep.connect(pn.pan); lfo.start(); chain(pn);
      ups.push(() => { dep.gain.value = V('apan'); lfo.frequency.value = 0.2 * Math.pow(40, V('apanrate')); });
    }
    const out = g(); cur.connect(out); out.connect(Engine.master);
    if (on('echo')) {
      const dl = mk(c.createDelay(4)), fb = g(), wet = g(); out.connect(dl); dl.connect(fb); fb.connect(dl); dl.connect(wet); wet.connect(Engine.master);
      ups.push(() => { dl.delayTime.value = Math.min(3.9, this.ECHO_BEATS[Math.round(V('etime') * 5)] * 60 / ((this.bpm || 100) * (this.tempo || 1))); fb.gain.value = V('efb') * 0.85; wet.gain.value = V('echo') * 0.6; });
    }
    if (on('chorus')) {
      const wet = g(); wet.connect(Engine.master);
      [[0.018, 0.4, -0.7], [0.026, 0.55, 0.7]].forEach(([base, hz, pan]) => {
        const d = mk(c.createDelay(0.1)), lfo = mk(c.createOscillator()), dep = g(), p = c.createStereoPanner ? mk(c.createStereoPanner()) : null;
        d.delayTime.value = base; lfo.frequency.value = hz; dep.gain.value = 0.0025; lfo.connect(dep); dep.connect(d.delayTime); lfo.start(); out.connect(d); if (p) { p.pan.value = pan; d.connect(p); p.connect(wet); } else d.connect(wet);
      });
      ups.push(() => { wet.gain.value = V('chorus') * 0.5; });
    }
    if (on('reverb')) { const snd = g(); out.connect(snd); snd.connect(this.sharedReverb(c)); ups.push(() => { snd.gain.value = V('reverb') * 0.7; }); }
    t.fxSet = () => ups.forEach(f => f());
    t.fxSet();
  },
  /* The noise gate is an audio worklet, so each audio context has to load it once before a gate can be wired in. */
  gateReady(c) { return !!(this.gc && this.gc.has(c)); },
  loadGate(c) {
    const code = `class Gate extends AudioWorkletProcessor {
      static get parameterDescriptors() { return [{ name: 'thr', defaultValue: 0.003, minValue: 0, maxValue: 1, automationRate: 'k-rate' }]; }
      constructor() { super(); this.e = 0; this.g = 0; this.hold = 0; }
      process(inp, out, par) {
        const a = inp[0], o = out[0]; if (!a || !a.length) return true; const n = a[0].length, thr = par.thr[0], ca = 1 - Math.exp(-1 / (0.002 * sampleRate)), cr = 1 - Math.exp(-1 / (0.12 * sampleRate)), dec = Math.exp(-1 / (0.03 * sampleRate));
        for (let i = 0; i < n; i++) {
          let m = 0; for (let k = 0; k < a.length; k++) { const x = Math.abs(a[k][i]); if (x > m) m = x; }
          this.e = Math.max(m, this.e * dec); if (this.e > thr) this.hold = 0.06 * sampleRate; else if (this.hold > 0) this.hold--;
          const target = this.hold > 0 ? 1 : 0; this.g += (target - this.g) * (target > this.g ? ca : cr);
          for (let k = 0; k < o.length; k++) o[k][i] = (a[Math.min(k, a.length - 1)][i]) * this.g;
        }
        return true;
      } }
      registerProcessor('trk-gate', Gate);`;
    this.gp = this.gp || new Map(); this.gc = this.gc || new Set(); if (this.gp.has(c)) return this.gp.get(c);
    const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' })), pr = c.audioWorklet.addModule(url).then(() => { URL.revokeObjectURL(url); this.gc.add(c); });
    this.gp.set(c, pr); return pr;
  },
  /* A track's effect amount was changed (or loaded): re-wire only if the set of active effects changed. */
  setFx(t, k, v) { t.fx = Object.assign({}, t.fx, { [k]: clamp(Math.round(v * 100) / 100, 0, 1) }); if (t.tail) this.wireFx(t); this.save(); },
  /* Starting values and event cursors for a track's volume, pan and bend at song time `base`. */
  autoInit(t, base) {
    const a = t.auto; if (!a || !t.ctl) return; t.ai = {};
    [['vol', t.ctl.gain, 'v', 1], ['pan', t.pan && t.pan.pan, 'v', t.panv || 0], ['bend', t.bendSrc && t.bendSrc.offset, 'c', 0]].forEach(([k, param, key, def]) => {
      const arr = a[k]; let i = 0, v = def; while (i < arr.length && arr[i].t < base - 1e-6) v = arr[i++][key];
      t.ai[k] = i; if (param) param.value = v;
    });
  },
  /* Schedules the events up to song time `hs`. */
  autoRun(t, hs, T0, base, tempo, now) {
    const a = t.auto; if (!a || !t.ctl || !t.ai) return;
    [['vol', t.ctl.gain, 'v'], ['pan', t.pan && t.pan.pan, 'v'], ['bend', t.bendSrc && t.bendSrc.offset, 'c']].forEach(([k, param, key]) => {
      if (!param) return; const arr = a[k];
      while (t.ai[k] < arr.length && arr[t.ai[k]].t < hs) { const e = arr[t.ai[k]++]; param.setTargetAtTime(e[key], Math.max(now, T0 + (e.t - base) / tempo), 0.006); }
    });
  },
  gains() {
    if (!Engine.ctx) return; const c = Engine.ctx, solo = this.all().some(t => t.solo);
    this.all().forEach(t => { if (t.strip) t.strip.gain.setTargetAtTime(t.mute || (solo && !t.solo) || t.i === this.skip ? 0 : t.vol, c.currentTime, 0.015); });
  },
  release() {
    const c = Engine.ctx; if (!c) return;
    this.all().forEach(t => {
      const s = t.strip; if (!s) return; const rest = [t.ctl, t.pan, t.bendSrc, t.an, t.tail].concat(t.fxn || []); t.strip = t.ctl = t.pan = t.bendSrc = t.an = t.tail = t.fxn = t.fxSet = t.fxKey = null;
      try { s.gain.cancelScheduledValues(c.currentTime); s.gain.setTargetAtTime(0, c.currentTime, 0.01); } catch (e) { /* node already gone */ }
      setTimeout(() => { [s].concat(rest).forEach(n => { if (!n) return; try { if (n.stop) n.stop(); n.disconnect(); } catch (e) { /* already stopped */ } }); }, 500);
    });
  },
  /* The mixer channels: the MIDI tracks, then the voice recordings (Vox). */
  all() { return this.vox.length ? this.tracks.concat(this.vox) : this.tracks; },
  halt() { Vox.stop(); this.gen++; this.playing = false; clearInterval(this.timer); this.timer = 0; this.nodes.forEach(n => { try { n.h.stop(); } catch (e) {} }); this.nodes = []; },
  async start(from, o) {
    o = o || {}; if (!this.loaded) return;
    if (!Engine.ctx || !Engine.master) return toast('Tap Start first, then play.', 2500);
    this.halt(); const gen = this.gen, c = Engine.ctx; if (c.state !== 'running') c.resume();
    this.release(); this.acc = o.at != null; this.skip = o.skip != null ? o.skip : -1; if (o.tempo) { if (this.keepTempo == null) this.keepTempo = this.tempo; this.tempo = o.tempo; }
    this.base = clamp(from == null ? this.base : from, 0, this.maxPos); this.sync();
    await this.prepare(); if (gen !== this.gen) return;
    this.strips(); this.T0 = o.at != null ? o.at : c.currentTime + 0.1;
    this.tracks.forEach(t => { let a = 0, b = t.notes.length; while (a < b) { const m = (a + b) >> 1; if (t.notes[m].start < this.base - 1e-6) a = m + 1; else b = m; } t.ni = a; this.autoInit(t, this.base); });
    Vox.play(this.base, this.T0, this.tempo);
    this.playing = true; this.timer = setInterval(() => this.tick(), 25); this.tick(); this.sync();
  },
  /* The part of the song that repeats: the loop region, or the whole song. Null when looping is off, during a take, or when this is a backing track for Train. */
  region() {
    if (!this.loop || this.acc || Rec.state !== 'idle') return null;
    const a = this.loopA != null ? this.loopA : 0, b = this.loopB != null ? this.loopB : this.length; return b - a > 0.05 ? { a, b } : null;
  },
  seekTracks() { this.tracks.forEach(t => { let a = 0, b = t.notes.length; while (a < b) { const m = (a + b) >> 1; if (t.notes[m].start < this.base - 1e-6) a = m + 1; else b = m; } t.ni = a; this.autoInit(t, this.base); }); },
  sched(hs, now) {
    this.tracks.forEach(t => {
      if (t.i === this.skip) return; const r = this.res(t);
      this.autoRun(t, hs, this.T0, this.base, this.tempo, now);
      while (t.ni < t.notes.length && t.notes[t.ni].start < hs) { const n = t.notes[t.ni++]; this.note(t, r, n, Math.max(now, this.T0 + (n.start - this.base) / this.tempo), Math.max(0.05, (n.sus || n.dur) / this.tempo)); }
    });
  },
  tick() {
    if (!this.playing) return; const c = Engine.ctx, now = c.currentTime; let hs = this.base + (now + 0.35 - this.T0) * this.tempo;
    this.nodes = this.nodes.filter(n => n.end > now);
    const reg = this.region();
    if (reg && this.base < reg.b) {      // wrap without a gap: schedule up to the end of the region, then carry on from its start on the same clock
      while (hs >= reg.b) { this.sched(reg.b, now); this.T0 += (reg.b - this.base) / this.tempo; Vox.stop(this.T0); this.base = reg.a; this.seekTracks(); Vox.play(this.base, this.T0, this.tempo); hs = this.base + (now + 0.35 - this.T0) * this.tempo; }
    }
    this.sched(hs, now);
    if (Rec.state === 'idle' && now - this.T0 > (Math.max(this.length, Vox.end()) - this.base) / this.tempo + 0.4) { if (this.loop && !this.acc) this.start(0); else { this.stop(); } }
  },
  /* Sets (or with null clears) the loop region, snapped to beats, and turns looping on. */
  setRegion(a, b) {
    if (a == null) { this.loopA = this.loopB = null; } else {
      const song = this.song, snap = t => song ? songSec(song, Math.round(songTick(song, t) / song.ppq) * song.ppq) : t; a = snap(a); b = snap(b); if (b < a) { const x = a; a = b; b = x; }
      if (b - a < 0.05) return; this.loopA = a; this.loopB = b; this.loop = true; $('#sqLoop').classList.add('on');
    }
    this.save();
  },
  note(t, r, n, when, dur) {
    if (t.drums && Steps.silent(t, n.midi)) return;
    const vel = n.vel || 90; let pre = -1, kit = !!r.kit, syn = r.synth; const F = r.font || SF;
    if (r.preset != null) { if (F.cache.has(r.preset)) pre = r.preset; else if (t.drums) kit = true; else syn = synthFor(t.program); }
    const h = kit ? Engine.drum(n.midi, when, vel, t.strip, this.rendering)
      : Engine.playNote(n.midi, when, t.drums ? Math.max(dur, 0.4) : dur, { preset: pre, font: pre >= 0 && F !== SF ? F : undefined, synth: syn || 'soft', vel, dest: t.strip, seq: true, bend: t.bendSrc || undefined, nopool: this.rendering, gain: pre >= 0 ? 0.2 : 0.2 * (0.45 + 0.55 * vel / 127) });
    if (h) this.nodes.push({ h, end: when + dur + 1.5 });
  },
  pause() { const p = this.pos(); this.halt(); this.release(); this.base = p; this.sync(); },
  stop() { this.halt(); this.release(); this.base = 0; this.acc = false; this.skip = -1; if (this.keepTempo != null) { this.tempo = this.keepTempo; this.keepTempo = null; } this.sync(); },
  toggle() { if (this.playing) this.pause(); else this.start(this.base >= this.length - 0.05 ? 0 : this.base); },
  seek(s) { s = clamp(s, 0, this.maxPos); if (this.playing && !this.acc) this.start(s); else this.base = s; },
  setTempo(x) { const p = this.pos(); this.tempo = x; if (this.playing && !this.acc) this.start(p); else this.all().forEach(t => { if (t.fxSet) t.fxSet(); }); this.save(); },
  setSing(i) {
    if (i === this.sing) { this.sing = -1; this.save(); return this.render(); }
    const mono = melodyFromNotes(this.tracks[i].notes);
    if (mono.length < 3) return toast('That track has no melody that can be sung.', 3000);
    this.sing = i; Store.data.midi = { name: this.name, bpm: this.bpm, notes: mono, t0: mono.t0 }; this.save(); this.render(); UI.refresh();
    toast('Now sing "' + this.tracks[i].name + '" in Train > Your own melody. The other tracks play with you.', 4500);
  },
  /* True when Train has this file's singing track loaded, so the other tracks can play along. */
  accompanies() { const M = Store.data.midi; return this.loaded && this.sing >= 0 && M && M.t0 != null && M.name === this.name && Store.data.settings.seqAcc !== false; },
  /* Saves the open song as the last one and as a project under its name; a renamed song replaces its old project. */
  keep() {
    if (!this.song) return;
    try {
      const bytes = writeSong(this.song).buffer, key = 'proj:' + this.name; if (this.projKey && this.projKey !== key) SeqStore.del(this.projKey).catch(() => {}); this.projKey = key;
      SeqStore.put(this.name + '.mid', bytes).catch(() => {}); SeqStore.putProj(this.name, bytes, { tracks: this.song.tracks.length, notes: this.song.tracks.reduce((a, t) => a + t.notes.length, 0), dur: this.length }).catch(() => {});
    } catch (e) { console.warn(e); }
  },
  async uniqueName(base) {
    let names = []; try { names = (await SeqStore.list()).map(r => r.title); } catch (e) { /* storage unavailable */ }
    if (this.song && this.name) names.push(this.name); if (!names.includes(base)) return base;
    for (let n = 2; ; n++) { const c = base + ' ' + n; if (!names.includes(c)) return c; }
  },
  async loadFile(file) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer()), name = await this.uniqueName(file.name.replace(/\.midi?$/i, ''));
      const song = parseSong(bytes); this.load(songToUnits(song), name, song); this.dirty = false; this.projKey = null; this.render(); this.sync(); this.keep();
      toast('Imported ' + name + ': ' + this.tracks.length + ' tracks.', 3000);
    } catch (e) { toast(e.message || 'Could not read that file.', 5000); }
  },
  async openProject(key) {
    try {
      const r = await SeqStore.getKey(key); if (!r) return toast('That project is gone.', 2500);
      const song = parseSong(new Uint8Array(r.bytes)); this.load(songToUnits(song), r.title, song); this.dirty = false; this.projKey = key; this.render(); this.sync(); $('#o-proj').classList.remove('on');
    } catch (e) { toast(e.message || 'Could not open that project.', 4000); }
  },
  async projects() {
    const box = $('#pjList'); $('#o-proj').classList.add('on'); box.textContent = '';
    let list = []; try { list = await SeqStore.list(); } catch (e) { box.textContent = 'Saved projects are not available in this browser.'; return; }
    if (!list.length) { box.innerHTML = '<p class="muted">No projects yet. Start a new song or import a MIDI file; every song is saved here automatically.</p>'; return; }
    const fmt = t => Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
    list.forEach(r => {
      const open = this.song && this.projKey === r.name, d = document.createElement('div'); d.className = 'pjrow' + (open ? ' cur' : '');
      d.innerHTML = '<div class="pjmain"><b></b><small></small></div><button class="sqb" data-a="open">Open</button><button class="sqb" data-a="ren" title="Rename">✎</button><button class="sqb" data-a="dup" title="Duplicate">⧉</button><button class="sqb" data-a="del" title="Delete">✕</button>';
      d.querySelector('b').textContent = r.title + (open ? '  · open' : ''); d.querySelector('small').textContent = (r.tracks || '?') + ' tracks · ' + (r.notes || 0) + ' notes · ' + fmt(r.dur || 0) + ' · ' + new Date(r.ts).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
      d.querySelector('[data-a=open]').onclick = () => this.openProject(r.name);
      d.querySelector('[data-a=ren]').onclick = async () => { const n = (prompt('Rename project', r.title) || '').trim(); if (n && n !== r.title) { await this.renameProject(r, await this.uniqueName(n)); this.projects(); } };
      d.querySelector('[data-a=dup]').onclick = async () => { const n = await this.uniqueName(r.title + ' copy'); await SeqStore.putProj(n, r.bytes, r); this.projects(); };
      d.querySelector('[data-a=del]').onclick = async () => { if (!confirm('Delete "' + r.title + '"? This cannot be undone.')) return; await SeqStore.del(r.name); if (this.projKey === r.name) this.projKey = null; this.projects(); };
      box.appendChild(d);
    });
  },
  async renameProject(r, title) {
    if (this.song && this.projKey === r.name) { this.name = title; this.song.name = title; if (Store.data.midi && Store.data.midi.name === r.title) Store.data.midi.name = title; this.save(); this.keep(); this.render(); return; }
    await SeqStore.putProj(title, r.bytes, r); await SeqStore.del(r.name);
  },
  /* Rebuilds the playable tracks after the song was edited, keeping each track's instrument, volume, mute, solo and SING choice. */
  rebuild() {
    if (!this.song) return; const was = this.playing, p = this.pos(), key = t => t.tid + ':' + t.ch, old = {}; this.tracks.forEach(t => { old[key(t)] = t; });
    const singKey = this.sing >= 0 && this.tracks[this.sing] ? key(this.tracks[this.sing]) : null, loop = this.loop, tempo = this.tempo, lA = this.loopA, lB = this.loopB;
    this.load(songToUnits(this.song), this.name, this.song, u => old[u.tid + ':' + u.ch]);
    this.loop = loop; this.loopA = lA; this.loopB = lB; this.tempo = tempo; this.sing = singKey ? this.tracks.findIndex(t => key(t) === singKey) : -1;
    if (this.sing >= 0) { const mono = melodyFromNotes(this.tracks[this.sing].notes); if (mono.length >= 3) { Store.data.midi = { name: this.name, bpm: this.bpm, notes: mono, t0: mono.t0 }; this.save(); } }
    this.base = clamp(p, 0, this.maxPos); this.render(); this.sync(); Vox.refollow(); if (was && this.length > 0) this.start(this.base);
  },
  /* Writes the (edited) song as a Standard MIDI File and offers it as a download. */
  exportMid() { if (!this.song) return toast('Load a MIDI file first.', 2500); this.download(writeSong(this.song), 'audio/midi', 'mid'); this.dirty = false; },
  /* Runs next() at once, or after asking whether to save when the song was changed since it was loaded or last saved. */
  guard(next) {
    if (!this.song || !this.dirty) return next();
    const o = $('#o-savechk'), done = go => { o.classList.remove('on'); if (go) next(); };
    $('#svText').textContent = '“' + this.name + '” stays in Projects, but has changes that are not saved to a .mid file.';
    $('#svSave').onclick = () => { this.exportMid(); done(true); }; $('#svDiscard').onclick = () => done(true); $('#svCancel').onclick = () => done(false);
    o.classList.add('on');
  },
  download(bytes, mime, ext) {
    const blob = new Blob([bytes], { type: mime }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = (this.name || 'song').replace(/[^\w\- ]+/g, '') + '.' + ext; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  },
  /* Schedules the whole song on Engine.ctx, which the caller has pointed at an OfflineAudioContext: every note at its own time, then the volume, pan and bend events. */
  renderAll() {
    this.rendering = true;
    try {
      this.all().forEach(t => { t.strip = t.ctl = t.pan = t.bendSrc = t.tail = t.fxn = t.fxSet = t.fxKey = null; }); this.strips();
      const solo = this.all().some(t => t.solo);
      this.vox.forEach(v => { const g = v.strip.gain; g.cancelScheduledValues(0); g.setValueAtTime(v.mute || (solo && !v.solo) ? 0 : v.vol, 0); });
      Vox.play(0, 0, 1);
      this.tracks.forEach(t => {
        const g = t.strip.gain; g.cancelScheduledValues(0); g.setValueAtTime(t.mute || (solo && !t.solo) ? 0 : t.vol, 0);
        const r = this.res(t); this.autoInit(t, 0);
        t.notes.forEach(n => this.note(t, r, n, n.start, Math.max(0.05, n.sus || n.dur)));
        this.autoRun(t, Infinity, 0, 0, 1, 0);
      });
    } finally { this.rendering = false; this.nodes = []; Vox.src = []; this.all().forEach(t => { t.strip = t.ctl = t.pan = t.bendSrc = t.tail = t.fxn = t.fxSet = t.fxKey = null; }); }
  },
  /* Renders the song faster than real time with the same sounds and effects as playback, at its written tempo, and saves it as a 16-bit stereo WAV file, or a 192 kbps MP3 when fmt is 'mp3'. */
  async exportWav(fmt) {
    if (!this.song || !this.length) return toast('Add some notes first.', 2500);
    if (Rec.state !== 'idle') return toast('Stop recording first.', 2500);
    if (!Engine.ctx || !Engine.master) return toast('Tap Start first, then export.', 2500);
    if (typeof OfflineAudioContext === 'undefined') return toast('This browser cannot render audio offline.', 4000);
    if (this.exporting) return; this.exporting = true;
    try {
      this.halt(); this.release(); toast('Rendering the song…', 120000);
      await this.prepare();
      const sr = Engine.ctx.sampleRate || 44100, off = new OfflineAudioContext(2, Math.ceil((Math.max(this.length, Vox.end()) + 4) * sr), sr), saved = Object.assign({}, Engine), base = this.base, skip = this.skip;
      if (this.all().some(t => this.fxVal(t, 'gate') > 0.01)) await this.loadGate(off);
      try { Engine.ctx = off; Engine.buildFx(); this.skip = -1; this.renderAll(); }      // everything is scheduled before the real context comes back
      finally { Object.assign(Engine, saved); this.base = base; this.skip = skip; }
      const buf = await off.startRendering(), chans = [buf.getChannelData(0), buf.getChannelData(1)], end = lastLoud(chans, 0.0005);
      if (!end) return toast('The song rendered as silence. Check the track volumes and mutes.', 5000);
      const n = Math.min(chans[0].length, end + Math.round(sr * 0.25));
      const out = chans.map(c => c.subarray(0, n));
      if (fmt === 'mp3') this.download(await encodeMp3(out, sr), 'audio/mpeg', 'mp3');
      else this.download(encodeWav(out, sr), 'audio/wav', 'wav');
      toast('Saved ' + (n / sr).toFixed(1) + ' seconds of audio.', 3500);
    } catch (e) { console.error(e); toast('Could not render the song: ' + (e.message || e), 6000); }
    finally { this.exporting = false; this.sync(); }
  },
  async restore() {
    try { const r = await SeqStore.get(); if (!r) return; const song = parseSong(new Uint8Array(r.bytes)); const nm = r.file.replace(/\.midi?$/i, ''); this.load(songToUnits(song), nm, song); this.projKey = 'proj:' + nm; } catch (e) { console.warn('could not restore the sequencer song', e); }
  },
  /* ---- interface ---- */
  fmt(s) { s = Math.max(0, Math.round(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); },
  instOptions() {
    const g = (l, h) => '<optgroup label="' + l + '">' + h + '</optgroup>', o = (v, l) => '<option value="' + v + '">' + l + '</option>';
    let h = o('auto', 'Auto (from the file)');
    if (SF.sf) h += g('SoundFont: ' + SF.name.replace(/[<>&"]/g, ''), SF.sf.presets.map((p, i) => ({ p, i })).sort((a, b) => a.p.bank - b.p.bank || a.p.program - b.p.program).map(x => o('sf:' + (Store.data.settings.sfName ? Store.data.settings.sfName + '|' : '') + x.i, (x.p.bank ? 'Bank ' + x.p.bank + ' · ' : '') + x.p.name.replace(/[<>&"]/g, ''))).join(''));
    return h + '<option value="\u0001sounds">🎼 Other SoundFonts…</option>' + timbreOptions().replace(/<optgroup label="/g, '<optgroup label="Built-in: ').replace(/value="/g, 'value="syn:') + g('Built-in: Drums', o('kit', 'Drum kit'));
  },
  render() {
    const box = $('#sqTracks'); if (!box) return; box.textContent = '';
    $('#sqSong').textContent = this.loaded ? this.name + ' · ' + this.tracks.length + ' tracks · ' + this.fmt(this.length) : 'No song loaded';
    $('#sqEmpty').hidden = this.loaded; $('#sqBody').hidden = !this.loaded; if (!this.loaded) return;
    $('#sqSeek').max = this.length.toFixed(2); $('#sqTempo').value = Math.round(this.tempo * 100); $('#sqTempoOut').textContent = Math.round(this.tempo * 100) + '%'; $('#sqLoop').classList.toggle('on', this.loop);
    if (!Ed.on) Ed.toggle();      // the editor is always open next to the track list
    const opts = this.instOptions();
    this.tracks.forEach(t => {
      const r = this.res(t), d = document.createElement('div'); d.className = 'sqtrack'; d.dataset.ti = t.ti; d.onclick = e => { if (e.target.closest('button,select,input') || Ed.busy()) return; Vox.sel = null; Ed.ti = t.ti; Ed.sel.clear(); Ed.needFit = true; Ed.ls = {}; }; d.style.setProperty('--tc', SEQ_COLORS[t.i % SEQ_COLORS.length]);
      const gm = t.drums ? 'Drums' : GM_FAMILY[t.program >> 3] + ' · program ' + (t.program + 1);
      d.innerHTML = '<div class="sqname"><b></b><small></small></div><button class="sqb" data-k="m" title="Mute">M</button><button class="sqb" data-k="s" title="Solo">S</button><button class="sqb sing" data-k="g" title="Sing this track in Train">SING</button><select class="sqinst"></select><input type="range" class="sqvol" min="0" max="100" aria-label="Volume" title="Volume"><div class="sqm" style="grid-column:1/4"><i></i></div><input type="range" class="sqpan" min="-100" max="100" aria-label="Pan" title="Pan (double-click to centre)"><button class="sqb sqfxb" title="Effects for this track">FX</button><div class="sqfx" hidden></div>';
      d.querySelector('b').textContent = t.name; d.querySelector('small').textContent = gm + ' · ' + t.notes.length + ' notes · ' + (t.drums ? 'kit' : noteName(t.lo) + '–' + noteName(t.hi));
      const sel = d.querySelector('select'); sel.innerHTML = opts;
      const nm = Store.data.settings.sfName; if (SF.sf && nm && /^sf:\d+$/.test(t.inst)) t.inst = 'sf:' + nm + '|' + t.inst.slice(3);      // the older form meant the active font: pin it to that font
      if (/^sf:.*\|\d+$/.test(t.inst) && ![...sel.options].some(x => x.value === t.inst)) { const m = /^sf:(.*)\|(\d+)$/.exec(t.inst), F = SF.fontOf(m[1]), p = F && F.sf.presets[+m[2]], x = document.createElement('option'); x.value = t.inst; x.textContent = m[1].replace(/\.sf[23]$/i, '') + ' · ' + (p ? p.name : '#' + (+m[2] + 1)); sel.insertBefore(x, sel.options[1]); }   // an instrument from another stored font
      sel.value = t.inst; if (sel.value !== t.inst) { t.inst = 'auto'; sel.value = 'auto'; }
      const vol = d.querySelector('.sqvol'); vol.value = Math.round(t.vol * 100);
      d.querySelector('[data-k=m]').classList.toggle('on', t.mute); d.querySelector('[data-k=s]').classList.toggle('on', t.solo); d.querySelector('[data-k=g]').classList.toggle('on', this.sing === t.i);
      d.querySelector('[data-k=m]').onclick = e => { t.mute = !t.mute; e.currentTarget.classList.toggle('on', t.mute); this.gains(); this.save(); };
      d.querySelector('[data-k=s]').onclick = e => { t.solo = !t.solo; e.currentTarget.classList.toggle('on', t.solo); this.gains(); this.save(); };
      d.querySelector('[data-k=g]').onclick = () => this.setSing(t.i);
      vol.oninput = () => { t.vol = vol.value / 100; this.gains(); }; vol.onchange = () => this.save();
      const pan = d.querySelector('.sqpan'); pan.value = Math.round((t.panv || 0) * 100);
      pan.oninput = () => { t.panv = pan.value / 100; if (t.pan) t.pan.pan.setTargetAtTime(t.panv, Engine.ctx.currentTime, 0.015); }; pan.onchange = () => this.save();
      pan.ondblclick = () => { pan.value = 0; pan.oninput(); this.save(); };
      this.fxUI(d, t);
      sel.onchange = async () => { if (sel.value === '\u0001sounds') { sel.value = t.inst; Ed.ti = t.ti; Ed.sel.clear(); $('#sfPop').hidden = false; SFMgr.refresh(true); return; } t.inst = sel.value; this.save(); await this.prepare(); };
      box.appendChild(d);
    });
    Vox.rows(box);
    this.markSel();
  },
  /* The FX button and knobs of a mixer row. */
  fxUI(d, t) {
    const fxb = d.querySelector('.sqfxb'), fxp = d.querySelector('.sqfx');
    Knobs.mount(fxp, this.FX, k => this.fxVal(t, k), (k, v) => { this.setFx(t, k, v); fxMark(); });
    const fxMark = () => fxb.classList.toggle('on', this.FX.some(f => this.fxVal(t, f.k) !== f.d));
    fxp.hidden = !t.fxOpen; fxMark(); fxb.onclick = () => { t.fxOpen = !t.fxOpen; fxp.hidden = !t.fxOpen; };
  },
  /* The track being edited is highlighted in the list. */
  markSel() { $$('#sqTracks .sqtrack').forEach(d => d.classList.toggle('sel', +d.dataset.ti === Ed.ti)); },
  sync() {
    const b = $('#sqPlay'); if (!b) return; const ic = this.playing ? 'pause' : 'play'; if (b.dataset.ic !== ic) { b.dataset.ic = ic; b.querySelector('span').innerHTML = this.playing ? PAUSE_SVG : PLAY_SVG; } $('#sqLed').classList.toggle('on', this.playing);
    $('#sqTime').textContent = this.fmt(this.pos()) + ' / ' + this.fmt(this.length);
  },
  /* Song overview: every track as a lane across the whole song, with the playhead. Click or drag to seek; clicking a lane also selects that track. The lanes are cached and only redrawn when the song or the mixer changed. */
  draw() {
    const cv = $('#seqCv'), { g, w, h } = fitCanvas(cv); if (!this.loaded || w < 40 || h < 20) return;
    const n = this.tracks.length, len = Math.max(0.001, this.length), RH = 16, lh = (h - RH) / Math.max(1, n), lab = 64, X = t => lab + t / len * (w - lab - 4), solo = this.tracks.some(t => t.solo);
    const sig = [w, h, len.toFixed(2), n, solo].concat(this.tracks.map(t => t.notes.length + (t.mute ? 'm' : '') + (t.solo ? 's' : '') + t.name)).join('|');
    if (sig !== this.ovSig || !this.ovCv) {
      this.ovSig = sig; const dpr = window.devicePixelRatio || 1, o = this.ovCv || (this.ovCv = document.createElement('canvas')); o.width = Math.round(w * dpr); o.height = Math.round(h * dpr);
      const c = o.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = '#141417'; c.fillRect(0, 0, w, h); c.fillStyle = '#26262c'; c.fillRect(0, 0, w, RH); c.fillStyle = '#6e6e7a'; c.font = Math.round(9 * UIK) + 'px system-ui,sans-serif'; c.textBaseline = 'middle'; c.fillText('LOOP', 8, RH / 2);
        if (this.song) songBarLines(this.song, 0, songTick(this.song, len) + 1).forEach(b => { const x = X(songSec(this.song, b.tick)); if (x >= lab) { c.fillStyle = '#3a3a42'; c.fillRect(Math.round(x), 0, 1, RH); if (b.bar % 4 === 1) { c.fillStyle = '#8a8a96'; c.fillText(String(b.bar), x + 2, RH / 2); } } });
      this.tracks.forEach((t, k) => {
        const y0 = RH + k * lh, col = SEQ_COLORS[t.i % SEQ_COLORS.length], dim = t.mute || (solo && !t.solo);
        c.fillStyle = k % 2 ? '#18181c' : '#1b1b20'; c.fillRect(0, y0, w, lh); c.fillStyle = '#0e0e10'; c.fillRect(0, y0 + lh - 1, w, 1);
        c.fillStyle = col; c.globalAlpha = dim ? 0.3 : 1; c.fillRect(0, y0, 4, lh - 1);
        c.fillStyle = '#b8b8c2'; c.font = '600 ' + Math.round(10 * UIK) + 'px system-ui,sans-serif'; c.textBaseline = 'middle'; c.fillText(t.name.length > 9 ? t.name.slice(0, 8) + '…' : t.name, 9, y0 + lh / 2);
        c.fillStyle = col; c.globalAlpha = dim ? 0.2 : 0.9;
        const span = Math.max(1, t.hi - t.lo), pad = 3, ph = Math.max(2, lh - 2 * pad);
        t.notes.forEach(nt => { const x = X(nt.start), nw = Math.max(1, nt.dur / len * (w - lab - 4)); if (t.drums) c.fillRect(x, y0 + pad + ((nt.midi * 7) % Math.max(1, ph - 2)), Math.max(1, nw), 2); else c.fillRect(x, y0 + pad + (1 - (nt.midi - t.lo) / span) * (ph - 3), nw, 3); });
        c.globalAlpha = 1;
      });
    }
    g.drawImage(this.ovCv, 0, 0, w, h);
    this.tracks.forEach((t, k) => { if (t.ti === Ed.ti) { g.strokeStyle = 'rgba(255,179,71,.8)'; g.lineWidth = 1; g.strokeRect(0.5, RH + k * lh + 0.5, w - 1, lh - 1); } });
    { const reg = this.ovReg || (this.loopA != null ? { a: this.loopA, b: this.loopB } : null);
      if (reg) { const x0 = X(reg.a), x1 = X(reg.b), on = this.loop; g.fillStyle = on ? 'rgba(255,179,71,.16)' : 'rgba(180,180,190,.1)'; g.fillRect(x0, RH, x1 - x0, h - RH); g.fillStyle = on ? '#ffb347' : '#8a8a96'; g.fillRect(x0, 0, x1 - x0, RH - 2); g.fillRect(x0, 0, 2, h); g.fillRect(x1 - 2, 0, 2, h); } }
    const x = X(this.ovDrag != null ? this.ovDrag : this.pos()); g.fillStyle = '#ffb347'; g.fillRect(x - 1, 0, 2, h);
    this.sync(); if (!this.drag) $('#sqSeek').value = this.pos().toFixed(2);
  },
  /* Keeps the lit part of every Compose slider in step with its value. */
  sliders() {
    $$('#s-seq input[type=range]').forEach(el => {
      const lo = +el.min, hi = +el.max, v = +el.value, key = lo + ':' + hi + ':' + v; if (el._k === key) return; el._k = key;
      const p = hi > lo ? (v - lo) / (hi - lo) * 100 : 0, mid = lo < 0 && hi > 0 ? -lo / (hi - lo) * 100 : 0;
      el.style.setProperty('--a', Math.min(p, mid).toFixed(1) + '%'); el.style.setProperty('--b', Math.max(p, mid).toFixed(1) + '%');
    });
  },
  /* Level meters: one per track plus the master, read from analyser taps; bars fall back smoothly. */
  meters() {
    const now = performance.now(), dt = now - (this.mAt || 0); if (dt < 50) return; this.mAt = now;       // reading the analysers costs a copy each: 20 times a second is smooth enough for a bar
    const fall = 0.03 * Math.min(dt, 200) / 16.7, level = (an, buf) => { an.getFloatTimeDomainData(buf); let m = 0; for (let i = 0; i < buf.length; i++) { const a = Math.abs(buf[i]); if (a > m) m = a; } return m; };
    const frac = pk => pk > 0.0005 ? clamp((20 * Math.log10(pk) + 54) / 54, 0, 1) : 0, show = (el, f) => { el.style.width = (f * 100).toFixed(1) + '%'; el.className = f > 0.93 ? 'clip' : f > 0.78 ? 'hot' : ''; };
    const cards = $$('#sqTracks .sqtrack'); if (!this.mbuf) this.mbuf = new Float32Array(256);
    this.tracks.forEach((t, k) => {
      const el = cards[k] && cards[k].querySelector('.sqm i'); if (!el) return;
      const f = this.playing && t.an ? frac(level(t.an, this.mbuf)) : 0; t.lvl = Math.max(f, (t.lvl || 0) - fall); show(el, t.lvl);
    });
    this.vox.forEach((v, k) => {
      const el = cards[this.tracks.length + k] && cards[this.tracks.length + k].querySelector('.sqm i'); if (!el) return;
      const f = this.playing && v.an ? frac(level(v.an, this.mbuf)) : 0; v.lvl = Math.max(f, (v.lvl || 0) - fall); show(el, v.lvl);
    });
    const an = Engine.outAn, mel = $('#sqMeter i'); if (!an || !mel) return; if (!this.obuf || this.obuf.length !== an.fftSize) this.obuf = new Float32Array(an.fftSize);
    const pk = level(an, this.obuf), f = frac(pk); this.mlvl = Math.max(f, (this.mlvl || 0) - fall); show(mel, this.mlvl);
    if (pk >= 0.98) { this.clipT = performance.now(); } $('#sqMeter').classList.toggle('clip', performance.now() - (this.clipT || -1e9) < 2000);
  },
  ovDown(e) {
    const cv = $('#seqCv'), r = cv.getBoundingClientRect(), n = this.tracks.length, y = e.clientY - r.top, RH = 16; if (!this.loaded) return;
    cv.setPointerCapture(e.pointerId);
    if (y < RH) { this.ovMode = 'loop'; this.ovStart = this.ovAt(e); this.ovReg = null; this.ovMoved = false; return; }
    this.ovMode = 'seek'; const k = clamp(Math.floor((y - RH) / ((r.height - RH) / Math.max(1, n))), 0, n - 1);
    if (this.tracks[k] && !Ed.busy()) { Ed.ti = this.tracks[k].ti; Ed.sel.clear(); Ed.needFit = true; Ed.ls = {}; }
    this.ovMove(e);
  },
  ovAt(e) { const r = $('#seqCv').getBoundingClientRect(), lab = 64; return clamp((e.clientX - r.left - lab) / (r.width - lab - 4), 0, 1) * Math.max(0.001, this.length); },
  ovMove(e) {
    if (!this.ovMode) return; const t = this.ovAt(e);
    if (this.ovMode === 'seek') this.ovDrag = t;
    else { if (Math.abs(t - this.ovStart) > 0.15) this.ovMoved = true; if (this.ovMoved) this.ovReg = { a: Math.min(t, this.ovStart), b: Math.max(t, this.ovStart) }; }
  },
  ovUp() {
    const mode = this.ovMode; this.ovMode = null; if (!mode) return;
    if (mode === 'seek') { const t = this.ovDrag; this.ovDrag = null; if (t != null) this.seek(t); return; }
    const reg = this.ovReg; this.ovReg = null;
    if (this.ovMoved && reg) this.setRegion(reg.a, reg.b); else if (this.loopA != null) { this.setRegion(null); toast('Loop region cleared. Drag in the strip above the tracks to set one.', 2500); }
  },
};

