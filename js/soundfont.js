"use strict";
/* ---- SoundFont sampler: plays the samples of one chosen instrument ---- */
const SF = {
  sf: null, buf: null, preset: 0, ready: false, bufs: new Map(), cache: new Map(), name: '', size: 0,      // cache: preset index -> its decoded samples (bufs is the current preset's entry)
  async load(buf, name) {
    const sf = parseSoundFont(buf); if (!sf.presets.length) throw new Error('This SoundFont has no instruments.');
    if (!sf.compressed && !sf.smpl) sf.smpl = new Int16Array(buf.slice(sf.smplOff, sf.smplOff + (sf.smplLen & ~1)));
    this.sf = sf; this.buf = buf; this.name = sf.name || name; this.size = buf.byteLength; this.ready = false; this.cache.clear(); this.bufs = new Map(); return sf;
  },
  pool: new Map(),      // other stored fonts that tracks use: name -> { name, sf, buf, cache, preset, bufs } (same shape as this object, so build and play work on either)
  /* The font a track's instrument comes from: the active one, or one from the pool (null when it is not loaded yet). */
  fontOf(name) { if (!name || (this.sf && name === Store.data.settings.sfName)) return this.sf ? this : null; return this.pool.get(name) || null; },
  async fontLoad(name) {
    const have = this.fontOf(name); if (have) return have;
    const rec = await SFStore.get(name); if (!rec) return null;
    const sf = parseSoundFont(rec.buf); if (!sf.presets.length) return null; if (!sf.compressed && !sf.smpl) sf.smpl = new Int16Array(rec.buf.slice(sf.smplOff, sf.smplOff + (sf.smplLen & ~1)));
    const f = { name, sf, buf: rec.buf, cache: new Map(), preset: -1, bufs: new Map() }; this.pool.set(name, f); return f;
  },
  defaultPreset() { const P = this.sf.presets; let i = P.findIndex(p => p.bank === 0 && /piano/i.test(p.name)); if (i < 0) i = P.findIndex(p => p.bank === 0 && p.program === 0); return i < 0 ? 0 : i; },
  /* GM lookup for the sequencer: the preset index for bank/program, or -1 when the font has none (the track then uses a built-in voice). Drums are bank 128. */
  findPreset(bank, program, drums) {
    const P = this.sf ? this.sf.presets : []; let i;
    if (drums) { i = P.findIndex(p => p.bank === 128 && p.program === 0); if (i < 0) i = P.findIndex(p => p.bank === 128); return i < 0 ? P.findIndex(p => /drum|kit/i.test(p.name)) : i; }
    i = P.findIndex(p => p.bank === bank && p.program === program); return i < 0 ? P.findIndex(p => p.bank === 0 && p.program === program) : i;
  },
  /* Makes AudioBuffers for every sample an instrument uses, so that playing a note later is instant. Other instruments stay ready (a few are kept for the sequencer). */
  async build(i, progress, F = this) {
    const have = F.cache.get(i); if (have) { F.cache.delete(i); F.cache.set(i, have); return have; }
    const sf = F.sf, c = Engine.ctx, P = sf.presets[i], map = new Map(); if (!P || !c) return map;
    const buf = F.buf;
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
    if (F.buf !== buf) return map;                                    // the font was replaced while this was decoding
    F.cache.set(i, map);
    for (const k of F.cache.keys()) { if (F.cache.size <= 10) break; if (k !== F.preset) F.cache.delete(k); }
    return map;
  },
  async usePreset(i, progress) {
    if (!this.sf || !Engine.ctx || !this.sf.presets[i]) return;
    this.ready = false; this.preset = i;
    const m = await this.build(i, progress); if (this.preset !== i) return;
    this.bufs = m; this.ready = m.size > 0;
  },
  play(midi, when, dur, o) {
    const c = Engine.ctx, st = Store.data.settings, F = o.font || this, sf = F.sf, vel = clamp(Math.round(o.vel || 100), 1, 127), pi = o.preset != null ? o.preset : F.preset, bufs = pi === F.preset ? F.bufs : F.cache.get(pi), all = bufs ? soundFontVoices(sf, pi, Math.round(midi), vel) : [], vs = o.nopool ? all : all.slice(0, o.seq ? 2 : 4);      // each layer is a source, a gain and maybe a panner: a song of many tracks keeps a stereo pair, an offline render keeps all
    if (!vs.length) return null;
    const out = c.createGain(); out.gain.value = (o.gain == null ? 0.25 : o.gain) * 1.8 * (0.35 + 0.65 * Math.pow(vel / 127, 1.4)); out.connect(o.dest || Engine.master);
    const a4f = st.a4 / 440, parts = [];
    vs.forEach(v => {
      const buf = bufs.get(v.si), S = sf.samples[v.si]; if (!buf) return;
      const src = c.createBufferSource(); src.buffer = buf; if ((o.live && st.fineTune) || o.detune) src.detune.value = (o.live && st.fineTune || 0) + (o.detune || 0); if (Engine.fx && Engine.vibOn()) Engine.fx.vibDepth.connect(src.detune); if (o.bend) o.bend.connect(src.detune);
      const rate = m => Math.pow(2, ((m - v.root) * v.scale / 100 + v.coarse + v.fine / 100) / 12) * a4f;
      if (o.gfrom != null && o.midi2 == null) { src.playbackRate.setValueAtTime(rate(o.gfrom), when); src.playbackRate.exponentialRampToValueAtTime(rate(midi), when + o.gt); } else src.playbackRate.setValueAtTime(rate(midi), when);
      if (o.midi2 != null) src.playbackRate.exponentialRampToValueAtTime(rate(o.midi2), when + dur);       // glides bend the sample
      if (v.loop) {
        const rel = S.compressed ? 0 : S.start, r = S.rate || buf.sampleRate, ls = (S.loopStart + v.loopStartOff - rel) / r, le = (S.loopEnd + v.loopEndOff - rel) / r;
        if (le > ls && le <= buf.duration + 0.01) { src.loop = true; src.loopStart = Math.max(0, ls); src.loopEnd = Math.min(le, buf.duration); }
      }
      const ev = o.env || (o.live ? Engine.envCustom() : null), g = c.createGain(), e = ev ? Object.assign({}, v.env, { delay: 0, attack: Math.max(0.008, ev.a), hold: 0, decay: ev.d, sustain: (1 - ev.s) * 600, release: Math.max(0.025, ev.r) }) : v.env, t0 = when + e.delay, at = Math.max(0.002, e.attack), peak = Math.pow(10, -v.atten / 200), sus = peak * Math.pow(10, -e.sustain / 200), tD = t0 + at + e.hold, tR = when + dur;
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
    const cur = Store.data.settings.sfName; this.names = names;
    $$('.sfQuick').forEach(sel => {
      sel.textContent = '';
      const add = (v, t) => { const o = document.createElement('option'); o.value = v; o.textContent = t; sel.appendChild(o); };
      add('', 'Built-in sound'); names.forEach(n => add(n, n.replace(/\.sf[23]$/i, ''))); add('\u0001dir', '📁 Load folder…');
      sel.value = SF.sf && Store.data.settings.timbre === 'sf' && names.includes(cur) ? cur : '';
    });
    const on = !!SF.sf && Store.data.settings.timbre === 'sf' && names.includes(cur);
    const fn = on ? SF.name.replace(/\.sf[23]$/i, '') : 'Built-in sound', fp = on ? (SF.sf.presets[SF.preset] ? SF.sf.presets[SF.preset].name : '–') : timbreOf(Store.data.settings.timbre).label;
    $$('.sfOutN').forEach(el => el.textContent = fn); $$('.sfOutP').forEach(el => el.textContent = fp);
    $$('.sfQuickPre').forEach(q => { q.hidden = !on; if (on) q.value = SF.preset; });
    if (typeof Synth !== 'undefined') Synth.refresh();
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
    this.list(); if (typeof Seq !== 'undefined' && Seq.loaded) Seq.prepare();
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
    if (!SF.sf || Store.data.settings.timbre !== 'sf') {          // built-in sound: step through its own voices
      const keys = Object.keys(TIMBRES), cur = Store.data.settings.timbre === 'sf' ? 'soft' : Store.data.settings.timbre, k = keys[(Math.max(0, keys.indexOf(cur)) + d + keys.length) % keys.length], el = $('#setTimbre');
      el.value = k; el.dispatchEvent(new Event('change')); return toast(TIMBRES[k].label, 1500);
    }
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


/* ---- SoundFont manager inside the Composer: stored fonts, an instrument browser with preview, and the pick for the selected track.
   Every track keeps its own font and instrument ('sf:<file>|<preset>'), so several fonts can sound in one song. ---- */
const SFMgr = {
  font: '', pick: -1,      // the font being browsed (a stored file name) and the highlighted instrument in it
  open() { return !$('#sfPop').hidden; },
  init() {
    const pop = $('#sfPop'); if (!pop) return;
    $('#edSounds').onclick = () => { pop.hidden = !pop.hidden; if (!pop.hidden) this.refresh(true); };
    $('#sfpClose').onclick = () => { pop.hidden = true; };
    $('#sfpAdd').onclick = () => $('#sfFile').click(); $('#sfpDir').onclick = () => $('#sfDir').click();
    $('#sfpFind').oninput = () => this.rows();
    $('#sfpUse').onclick = () => this.use(this.pick); $('#sfpAuto').onclick = () => this.use(null);
    ['sfFile', 'sfDir'].forEach(id => $('#' + id).addEventListener('change', () => this.refreshSoon()));
  },
  refreshSoon() { const t = Date.now(), tick = () => { if (!this.open()) return; this.refresh(); if (Date.now() - t < 20000 && !(SF.sf && SF.ready)) setTimeout(tick, 800); }; setTimeout(tick, 400); },
  track() { return typeof Seq !== 'undefined' && Seq.tracks.find(t => t.ti === Ed.ti); },
  /* Which font and instrument the track plays now: { name, i } or null. */
  current(t) { if (!t) return null; const ti = Seq.alias(t.inst), m = /^sf:(.*)\|(\d+)$/.exec(ti); if (m) return { name: m[1], i: +m[2] }; return /^sf:\d+$/.test(t.inst) && Store.data.settings.sfName ? { name: Store.data.settings.sfName, i: +t.inst.slice(3) } : null; },
  async refresh(first) {
    const t = this.track(), cur = this.current(t), def = Store.data.settings.sfName, box = $('#sfpFonts'); $('#sfpTrack').textContent = t ? 'Track: ' + t.name : 'No track selected';
    let names = []; try { names = ((await SFStore.keys()) || []).sort((a, b) => a.localeCompare(b)); } catch (e) {}
    if (first || !names.includes(this.font)) this.font = cur && names.includes(cur.name) ? cur.name : names.includes(def) ? def : names[0] || '';
    box.textContent = ''; if (!names.length) box.innerHTML = '<div class="sfpRow"><span class="muted">No SoundFonts stored yet. Add a .sf2 or .sf3 file.</span></div>';
    names.forEach(n => {
      const r = document.createElement('div'); r.className = 'sfpRow' + (n === this.font ? ' on' : ''); r.title = 'Browse this SoundFont';
      const s = document.createElement('span'); s.textContent = n.replace(/\.sf[23]$/i, '');
      const star = document.createElement('button'); star.className = 'sqb' + (n === def && Store.data.settings.timbre === 'sf' ? ' on' : ''); star.textContent = '★'; star.title = 'Default for the piano, exercises and tracks left on Auto';
      const d = document.createElement('button'); d.className = 'sqb'; d.textContent = '🗑'; d.title = 'Delete from storage';
      r.append(s, star, d); r.onclick = () => { this.font = n; this.pick = cur && cur.name === n ? cur.i : -1; this.refresh(); };
      star.onclick = async e => { e.stopPropagation(); $('#sfpMsg').textContent = 'Loading…'; await SFUI.pick(n); $('#sfpMsg').textContent = ''; if (Seq.loaded) Seq.prepare(); this.refresh(); };
      d.onclick = async e => { e.stopPropagation(); if (!confirm('Delete ' + n + ' from storage?')) return; try { await SFStore.del(n); } catch (er) {} SF.pool.delete(n); if (n === def) await SFUI.remove(); this.refresh(); };
      box.appendChild(r);
    });
    this.pick = cur && cur.name === this.font ? cur.i : -1;
    this.rec = this.font ? SF.fontOf(this.font) : null;
    if (this.font && !this.rec) { $('#sfpMsg').textContent = 'Reading…'; try { this.rec = await SF.fontLoad(this.font); } catch (e) { this.rec = null; } $('#sfpMsg').textContent = this.rec ? '' : 'Could not read that SoundFont.'; }
    this.rows();
  },
  rows() {
    const list = $('#sfpList'), q = $('#sfpFind').value.trim().toLowerCase(), F = this.rec; list.textContent = '';
    if (!F || !F.sf) { list.innerHTML = '<div class="sfpRow"><span class="muted">Pick a SoundFont above to browse its instruments.</span></div>'; return; }
    F.sf.presets.map((p, i) => ({ p, i })).sort((a, b) => a.p.bank - b.p.bank || a.p.program - b.p.program).filter(x => !q || x.p.name.toLowerCase().includes(q)).forEach(x => {
      const r = document.createElement('div'); r.className = 'sfpRow' + (x.i === this.pick ? ' on' : ''); r.setAttribute('role', 'option');
      r.innerHTML = '<span></span><i></i>'; r.firstChild.textContent = x.p.name; r.lastChild.textContent = x.p.bank === 128 ? 'drums' : x.p.bank ? 'bank ' + x.p.bank : x.p.program + 1;
      r.onclick = () => { this.pick = x.i; list.querySelectorAll('.on').forEach(e => e.classList.remove('on')); r.classList.add('on'); this.preview(x.i, x.p.bank === 128); };
      r.ondblclick = () => this.use(x.i); list.appendChild(r);
    });
  },
  async preview(i, drums) {
    const F = this.rec; if (!Engine.ctx || !F) return; const msg = $('#sfpMsg'); msg.textContent = 'Preparing…';
    try { await SF.build(i, null, F); } catch (e) { msg.textContent = 'Could not load that instrument.'; return; }
    msg.textContent = ''; const t0 = Engine.ctx.currentTime + 0.05, o = { preset: i, font: F === SF ? undefined : F, seq: true };
    if (drums) { [36, 38, 42, 38].forEach((m, k) => Engine.playNote(m, t0 + k * 0.25, 0.4, Object.assign({ vel: 100, gain: 0.3 }, o))); return; }
    [60, 64, 67, 72].forEach((m, k) => Engine.playNote(m, t0 + k * 0.22, 0.9, Object.assign({ vel: 96, gain: 0.25 }, o)));
  },
  async use(i) {
    const t = this.track(); if (!t) return toast('Select a track first.', 1800);
    if (i == null) t.inst = 'auto'; else if (i < 0 || !this.font) return toast('Pick an instrument first.', 1800); else t.inst = 'sf:' + this.font + '|' + i;
    Seq.save(); Seq.render(); await Seq.prepare(); this.refresh(); toast(i == null ? 'Sound from the file.' : t.name + ': ' + this.rec.sf.presets[i].name, 1800);
  }
};
