"use strict";
/* ---- SoundFont sampler: plays the samples of one chosen instrument ---- */
const SF = {
  sf: null, buf: null, preset: 0, ready: false, bufs: new Map(), cache: new Map(), name: '', size: 0,      // cache: preset index -> its decoded samples (bufs is the current preset's entry)
  async load(buf, name) {
    const sf = parseSoundFont(buf); if (!sf.presets.length) throw new Error('This SoundFont has no instruments.');
    if (!sf.compressed && !sf.smpl) sf.smpl = new Int16Array(buf.slice(sf.smplOff, sf.smplOff + (sf.smplLen & ~1)));
    this.sf = sf; this.buf = buf; this.name = sf.name || name; this.size = buf.byteLength; this.ready = false; this.cache.clear(); this.bufs = new Map(); return sf;
  },
  defaultPreset() { const P = this.sf.presets; let i = P.findIndex(p => p.bank === 0 && /piano/i.test(p.name)); if (i < 0) i = P.findIndex(p => p.bank === 0 && p.program === 0); return i < 0 ? 0 : i; },
  /* GM lookup for the sequencer: the preset index for bank/program, or -1 when the font has none (the track then uses a built-in voice). Drums are bank 128. */
  findPreset(bank, program, drums) {
    const P = this.sf ? this.sf.presets : []; let i;
    if (drums) { i = P.findIndex(p => p.bank === 128 && p.program === 0); if (i < 0) i = P.findIndex(p => p.bank === 128); return i < 0 ? P.findIndex(p => /drum|kit/i.test(p.name)) : i; }
    i = P.findIndex(p => p.bank === bank && p.program === program); return i < 0 ? P.findIndex(p => p.bank === 0 && p.program === program) : i;
  },
  /* Makes AudioBuffers for every sample an instrument uses, so that playing a note later is instant. Other instruments stay ready (a few are kept for the sequencer). */
  async build(i, progress) {
    const have = this.cache.get(i); if (have) { this.cache.delete(i); this.cache.set(i, have); return have; }
    const sf = this.sf, c = Engine.ctx, P = sf.presets[i], map = new Map(); if (!P || !c) return map;
    const buf = this.buf;
    const ids = new Set(); P.zones.forEach(pz => { const I = sf.insts[pz.link]; if (I) I.zones.forEach(iz => ids.add(iz.link)); });
    let n = 0;
    for (const si of ids) {
      const S = sf.samples[si]; if (!S) continue; n++; if (progress && n % 4 === 0) { progress(n, ids.size); await new Promise(r => setTimeout(r, 0)); }
      try {
        if (S.compressed) map.set(si, await c.decodeAudioData(buf.slice(sf.smplOff + S.start, sf.smplOff + S.end)));
        else {
          const len = S.end - S.start; if (len < 2) continue;
          const b = c.createBuffer(1, len, clamp(S.rate || 44100, 3000, 768000)), d = b.getChannelData(0);
          for (let k = 0; k < len; k++) d[k] = sf.smpl[S.start + k] / 32768;
          map.set(si, b);
        }
      } catch (e) { console.warn('sample ' + S.name + ' skipped', e); }
    }
    if (this.buf !== buf) return map;                                    // the font was replaced while this was decoding
    this.cache.set(i, map);
    for (const k of this.cache.keys()) { if (this.cache.size <= 10) break; if (k !== this.preset) this.cache.delete(k); }
    return map;
  },
  async usePreset(i, progress) {
    if (!this.sf || !Engine.ctx || !this.sf.presets[i]) return;
    this.ready = false; this.preset = i;
    const m = await this.build(i, progress); if (this.preset !== i) return;
    this.bufs = m; this.ready = m.size > 0;
  },
  play(midi, when, dur, o) {
    const c = Engine.ctx, st = Store.data.settings, sf = this.sf, vel = clamp(Math.round(o.vel || 100), 1, 127), pi = o.preset != null ? o.preset : this.preset, bufs = pi === this.preset ? this.bufs : this.cache.get(pi), all = bufs ? soundFontVoices(sf, pi, Math.round(midi), vel) : [], vs = o.nopool ? all : all.slice(0, o.seq ? 2 : 4);      // each layer is a source, a gain and maybe a panner: a song of many tracks keeps a stereo pair, an offline render keeps all
    if (!vs.length) return null;
    const out = c.createGain(); out.gain.value = (o.gain == null ? 0.25 : o.gain) * 1.8 * (0.35 + 0.65 * Math.pow(vel / 127, 1.4)); out.connect(o.dest || Engine.master);
    const a4f = st.a4 / 440, parts = [];
    vs.forEach(v => {
      const buf = bufs.get(v.si), S = sf.samples[v.si]; if (!buf) return;
      const src = c.createBufferSource(); src.buffer = buf; if (Engine.fx && st.fxVib && st.fxVib !== 'off') Engine.fx.vibDepth.connect(src.detune); if (o.bend) o.bend.connect(src.detune);
      const rate = m => Math.pow(2, ((m - v.root) * v.scale / 100 + v.coarse + v.fine / 100) / 12) * a4f;
      src.playbackRate.setValueAtTime(rate(midi), when);
      if (o.midi2 != null) src.playbackRate.exponentialRampToValueAtTime(rate(o.midi2), when + dur);       // glides bend the sample
      if (v.loop) {
        const rel = S.compressed ? 0 : S.start, r = S.rate || buf.sampleRate, ls = (S.loopStart + v.loopStartOff - rel) / r, le = (S.loopEnd + v.loopEndOff - rel) / r;
        if (le > ls && le <= buf.duration + 0.01) { src.loop = true; src.loopStart = Math.max(0, ls); src.loopEnd = Math.min(le, buf.duration); }
      }
      const g = c.createGain(), e = v.env, t0 = when + e.delay, at = Math.max(0.002, e.attack), peak = Math.pow(10, -v.atten / 200), sus = peak * Math.pow(10, -e.sustain / 200), tD = t0 + at + e.hold, tR = when + dur;
      g.gain.setValueAtTime(0, when); g.gain.setValueAtTime(0, t0); g.gain.linearRampToValueAtTime(peak, t0 + at); g.gain.setValueAtTime(peak, tD); g.gain.setTargetAtTime(sus, tD, Math.max(0.01, e.decay / 3));
      g.gain.setTargetAtTime(0, tR, e.release / 4);
      let last = g; src.connect(g);
      if ((v.pan || (S.type & 7) === 2 || (S.type & 7) === 4) && c.createStereoPanner) { const p = c.createStereoPanner(); p.pan.value = clamp(v.pan / 500 || ((S.type & 7) === 2 ? -1 : (S.type & 7) === 4 ? 1 : 0), -1, 1); g.connect(p); last = p; }
      last.connect(out); src.start(when, Math.max(0, v.startOff / (S.rate || 44100))); src.stop(tR + e.release + 0.3);
      parts.push({ src, g, rel: e.release });
    });
    if (!parts.length) { out.disconnect(); return null; }
    parts[0].src.onended = () => { try { out.disconnect(); } catch (e) {} if (o.bend) parts.forEach(p => { try { o.bend.disconnect(p.src.detune); } catch (e) { /* already gone */ } }); };
    return {
      stop: () => { const n = c.currentTime; parts.forEach(p => { try { p.g.gain.cancelScheduledValues(n); p.g.gain.setValueAtTime(p.g.gain.value, n); p.g.gain.linearRampToValueAtTime(0, n + 0.02); p.src.stop(n + 0.03); } catch (e) {} }); },
      release: () => { const now = Math.max(c.currentTime, when); parts.forEach(p => { try { p.g.gain.cancelScheduledValues(now); p.g.gain.setValueAtTime(p.g.gain.value, now); p.g.gain.setTargetAtTime(0, now, p.rel / 4); p.src.stop(now + p.rel + 0.3); } catch (e) {} }); }
    };
  }
};
/* The SoundFont file is kept in the browser's own storage so it is still there next time. */
const SFStore = {
  db: null,
  open() { if (this.db) return Promise.resolve(this.db); return new Promise((res, rej) => { if (!window.indexedDB) return rej(new Error('no storage')); const rq = indexedDB.open('pitchperfect-fonts', 1); rq.onupgradeneeded = () => rq.result.createObjectStore('fonts', { keyPath: 'name' }); rq.onsuccess = () => { this.db = rq.result; res(this.db); }; rq.onerror = () => rej(rq.error); }); },
  async tx(mode, fn) { const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('fonts', mode), r = fn(t.objectStore('fonts')); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); },
  put(name, buf) { return this.tx('readwrite', s => s.put({ name, buf, ts: Date.now() })); },
  get(name) { return this.tx('readonly', s => s.get(name)); },
  keys() { return this.tx('readonly', s => s.getAllKeys()); },
  del(name) { return this.tx('readwrite', s => s.delete(name)); }
};
const SFUI = {
  fill() {
    const sel = $('#sfPreset'); sel.textContent = '';
    SF.sf.presets.map((p, i) => ({ p, i })).sort((a, b) => a.p.bank - b.p.bank || a.p.program - b.p.program).forEach(x => { const o = document.createElement('option'); o.value = x.i; o.textContent = (x.p.bank ? 'Bank ' + x.p.bank + ' · ' : '') + (x.p.program + 1) + '. ' + x.p.name; sel.appendChild(o); });
    sel.value = SF.preset; sel.hidden = false;
    $$('.sfQuickPre').forEach(q => { q.innerHTML = sel.innerHTML; q.value = SF.preset; });
  },
  status() {
    const on = !!SF.sf; $('#sfRemove').hidden = $('#sfTry').hidden = !on; $('#sfOpt').hidden = !on; $('#sfPreset').hidden = !on;
    this.list();
    $('#sfStatus').textContent = on ? SF.name + ' · ' + SF.sf.presets.length + ' instruments · ' + (SF.size / 1048576).toFixed(1) + ' MB' + (SF.ready ? '' : ' · preparing…') : 'None loaded. A piano SoundFont (.sf2 or .sf3) makes exercise tones, the on-screen piano and the keyboard sound realistic.';
  },
  /* The quick selectors (next to Reverb / Chorus): every stored font, plus loading a whole folder. */
  now() { const on = SF.sf && Store.data.settings.timbre === 'sf', P = on && SF.sf.presets[SF.preset]; return on ? '🎼 ' + SF.name + (P ? ' · ' + P.name : '') : '🎼 Built-in sound'; },
  async list() {
    this.label = this.now(); const el = $('#sfNow'); if (el) el.textContent = this.label;
    let names = []; try { names = ((await SFStore.keys()) || []).sort((a, b) => a.localeCompare(b)); } catch (e) {}
    const cur = Store.data.settings.sfName;
    $$('.sfQuick').forEach(sel => {
      sel.textContent = '';
      const add = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); };
      add('', 'Built-in sound'); names.forEach(n => add(n, n.replace(/\.sf[23]$/i, ''))); add('\u0001dir', '📁 Load folder…');
      sel.value = SF.sf && Store.data.settings.timbre === 'sf' && names.includes(cur) ? cur : '';
    });
    const on = !!SF.sf && Store.data.settings.timbre === 'sf' && names.includes(cur);
    $$('.sfQuickPre').forEach(q => { q.hidden = !on; if (on) q.value = SF.preset; });
  },
  async pick(name) {
    const st = Store.data.settings;
    if (!name) { if (st.timbre === 'sf') { st.timbre = 'soft'; $('#setTimbre').value = 'soft'; Store.save(); } return this.list(); }
    try {
      if (!Engine.ctx) throw new Error('Start the app first (tap Start), then choose a SoundFont.');
      const rec = await SFStore.get(name); if (!rec) throw new Error('That SoundFont is no longer stored.');
      $('#sfStatus').textContent = 'Reading ' + name + '…';
      await SF.load(rec.buf, name); this.fill(); st.sfName = name; const i = SF.defaultPreset(); $('#sfPreset').value = i; st.timbre = 'sf'; $('#setTimbre').value = 'sf'; await this.prepare(i);
    } catch (e) { toast(e.message || 'Could not use that SoundFont.', 5000); }
    this.list();
  },
  /* Stores every .sf2 / .sf3 found in a chosen folder (subfolders included), then uses the first if none is active. */
  /* Arrow keys on the Tune screen: up/down = next/previous SoundFont, left/right = next/previous instrument. */
  async stepFont(d) {
    let names = []; try { names = ((await SFStore.keys()) || []).sort((a, b) => a.localeCompare(b)); } catch (e) {}
    if (!names.length) return toast('No SoundFonts stored yet. Use Load folder…', 2500);
    const on = SF.sf && Store.data.settings.timbre === 'sf', i = on ? names.indexOf(Store.data.settings.sfName) : -1;
    const n = i < 0 ? (d > 0 ? 0 : names.length - 1) : (i + d + names.length) % names.length;
    await this.pick(names[n]); if (SF.sf) toast(SF.name, 1500);
  },
  stepPreset(d) {
    if (!SF.sf || Store.data.settings.timbre !== 'sf') return toast('Choose a SoundFont first (up/down arrows).', 2000);
    const o = [...$('#sfPreset').options].map(x => +x.value), j = o.indexOf(SF.preset), i = o[(j + d + o.length) % o.length];
    $('#sfPreset').value = i; this.prepare(i).then(() => toast(SF.sf.presets[i].name, 1500));
  },
  async onDir(files) {
    const fs = files.filter(f => /\.sf[23]$/i.test(f.name)); if (!fs.length) return toast('No .sf2 or .sf3 files found in that folder.', 4000);
    let n = 0, first = '';
    for (const f of fs) {
      $('#sfStatus').textContent = 'Storing ' + f.name + '… (' + (n + 1) + ' of ' + fs.length + ')';
      try { const b = await f.arrayBuffer(); parseSoundFont(b); await SFStore.put(f.name, b); first = first || f.name; n++; } catch (e) { console.warn(f.name + ' skipped', e); }
    }
    this.status(); await this.list();
    toast(n ? n + ' SoundFont' + (n > 1 ? 's' : '') + ' added' + (n < fs.length ? ' (' + (fs.length - n) + ' unreadable)' : '') + '.' : 'None of those files could be read.', 3500);
    if (n && !SF.sf) this.pick(first);
  },
  async prepare(i) {
    const st = $('#sfStatus'); SF.ready = false;
    await SF.usePreset(i, (n, t) => { st.textContent = 'Preparing the instrument… ' + n + ' of ' + t + ' samples'; });
    Store.data.settings.sfPreset = i; Store.save(); this.status();
  },
  async onFile(file) {
    if (!file) return; $('#sfStatus').textContent = 'Reading ' + file.name + '…';
    try {
      if (!Engine.ctx) throw new Error('Start the app first (tap Start), then load a SoundFont.');
      const buf = await file.arrayBuffer(); await SF.load(buf, file.name); SF.name = SF.sf.name || file.name.replace(/\.sf[23]$/i, '');
      this.fill(); const i = SF.defaultPreset(); $('#sfPreset').value = i; await this.prepare(i);
      const st = Store.data.settings; st.sfName = file.name; st.timbre = 'sf'; $('#setTimbre').value = 'sf'; Store.save();
      try { await SFStore.put(file.name, buf); } catch (e) { toast('The SoundFont works now, but could not be kept for next time (storage full?).', 5000); }
      this.list(); toast('SoundFont ready: ' + SF.sf.presets[i].name, 3000);
    } catch (e) { SF.sf = null; SF.ready = false; this.status(); toast(e.message || 'Could not read that file.', 6000); }
  },
  async restore() {
    const st = Store.data.settings; if (!st.sfName || SF.sf) return;
    try {
      const rec = await SFStore.get(st.sfName); if (!rec) return;
      await SF.load(rec.buf, st.sfName); this.fill(); const i = SF.sf.presets[st.sfPreset] ? st.sfPreset : SF.defaultPreset(); $('#sfPreset').value = i; await this.prepare(i);
    } catch (e) { console.warn('could not restore the SoundFont', e); }
  },
  async remove() {
    const st = Store.data.settings; try { await SFStore.del(st.sfName); } catch (e) {}
    SF.sf = null; SF.buf = null; SF.ready = false; SF.bufs = new Map(); SF.cache.clear(); st.sfName = ''; if (st.timbre === 'sf') { st.timbre = 'soft'; $('#setTimbre').value = 'soft'; } Store.save(); this.status(); toast('SoundFont removed.', 1800);
  },
  tryIt() { if (!Engine.ctx || !SF.ready) return; const t = Engine.ctx.currentTime + 0.05; [60, 64, 67, 72].forEach((m, k) => { const r = SF.play(m, t + k * 0.28, 1.6, { gain: 0.3, vel: 96 }); if (!r) toast('That instrument has no sound for note ' + noteName(m) + '.', 2500); }); }
};

