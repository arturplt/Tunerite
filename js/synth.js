"use strict";
/* The Piano tab as a synth panel. Its LCD has four pages: Spectrum, Banks (stored SoundFonts), Instruments (the built-in voices, or the presets of the loaded font) and Presets.
   A preset keeps the sound (SoundFont and patch, or a built-in voice) together with every effect knob. Compose lists presets as instruments. */
const Presets = {
  list() { return Store.data.presets || (Store.data.presets = []); },
  get(id) { return this.list().find(p => p.id === id); },
  capture(name) {
    const s = Store.data.settings, sf = !!SF.sf && s.timbre === 'sf';
    return { name, timbre: s.timbre, font: sf ? s.sfName : '', patch: sf ? SF.preset : -1, fxK: Knobs.list.reduce((o, f) => (o[f.k] = Knobs.val(f.k), o), {}) };
  },
  /* Saves under a name: a preset with that name is replaced, otherwise a new one is added. */
  save(name) {
    name = name.trim(); if (!name) return null; const L = this.list(), p = this.capture(name), old = L.find(x => x.name.toLowerCase() === name.toLowerCase());
    if (old) { p.id = old.id; L[L.indexOf(old)] = p; } else { p.id = 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); L.push(p); }
    Store.data.settings.presetId = p.id; Store.save(); if (typeof Seq !== 'undefined' && Seq.loaded) Seq.render(); return p;
  },
  remove(id) { Store.data.presets = this.list().filter(p => p.id !== id); if (Store.data.settings.presetId === id) Store.data.settings.presetId = ''; Store.save(); if (typeof Seq !== 'undefined' && Seq.loaded) Seq.render(); },
  async apply(id) {
    const p = this.get(id); if (!p) return; const s = Store.data.settings;
    if (p.font) {
      if (!Engine.ctx) return toast('Start the app first (tap Start), then choose a preset.', 3000);
      if (!SF.sf || s.timbre !== 'sf' || s.sfName !== p.font) await SFUI.pick(p.font);
      if (SF.sf) { const i = SF.sf.presets[p.patch] ? p.patch : SF.defaultPreset(); if (SF.preset !== i || !SF.ready) await SFUI.prepare(i); }
    } else { s.timbre = p.timbre && p.timbre !== 'sf' ? p.timbre : 'soft'; $('#setTimbre').value = s.timbre; }
    s.fxK = Object.assign({}, p.fxK); s.presetId = id; Store.save(); Engine.applySettings(); Engine.setFx(); Knobs.sync(); SFUI.list(); toast(p.name, 1200);
  },
  /* The Compose effect settings a preset sets on a track (the knobs the mixer shares with the panel). */
  trackFx(p) { const o = {}; if (p) Seq.FX.forEach(f => { if (p.fxK[f.k] != null) o[f.k] = p.fxK[f.k]; }); return o; },
};
const Synth = {
  tab: 'spec', find: '',
  init() {
    if (!$('#pnFx')) return;
    $$('.syntabs button').forEach(b => b.onclick = () => this.show(b.dataset.t));
    $('#prSave').onclick = () => this.saveAs();
    $('#prInit').onclick = () => this.initPatch();
    $$('.prPP').forEach(b => b.onclick = () => this.step(-1)); $$('.prPN').forEach(b => b.onclick = () => this.step(1));
    $('#spFind').oninput = e => { this.find = e.target.value.trim().toLowerCase(); this.patches(); };
    $('#spAdd').onclick = () => $('#sfFile').click(); $('#spDir').onclick = () => $('#sfDir').click();
    ['sfFile', 'sfDir'].forEach(id => $('#' + id).addEventListener('change', () => setTimeout(() => SFUI.list(), 1500)));
    $('#spBuiltin').onclick = () => SFUI.pick('');
    this.refresh();
  },
  show(t) { this.tab = t; $$('.syntabs button').forEach(b => b.classList.toggle('on', b.dataset.t === t)); $$('.synpane').forEach(p => p.hidden = p.dataset.p !== t); this.refresh(); },
  /* Initialise: every knob to rest and no preset loaded (the sound stays). */
  initPatch() { Knobs.reset(); Store.data.settings.presetId = ''; Store.save(); this.refresh(); toast('Init: effects off.', 1200); },
  async saveAs() {
    const cur = Presets.get(Store.data.settings.presetId), name = prompt('Preset name', cur ? cur.name : (SF.sf && Store.data.settings.timbre === 'sf' && SF.sf.presets[SF.preset] ? SF.sf.presets[SF.preset].name : 'My sound'));
    if (name == null) return; const p = Presets.save(name); if (!p) return toast('Give the preset a name.', 2000); this.refresh(); toast('Saved: ' + p.name + ' (also an instrument in Compose)', 2500);
  },
  step(d) { const L = Presets.list(); if (!L.length) return toast('No presets yet. Press Save to keep this sound.', 2500); const i = L.findIndex(p => p.id === Store.data.settings.presetId); Presets.apply(L[(i < 0 ? (d > 0 ? 0 : L.length - 1) : (i + d + L.length) % L.length)].id); },
  /* Redraws what the screen shows: the preset line always, the list of the open page. */
  refresh() {
    if (!$('#pnFx')) return; const p = Presets.get(Store.data.settings.presetId); $$('.prOut').forEach(el => el.textContent = p ? p.name : 'Init');
    if (this.tab === 'banks') this.banks(); else if (this.tab === 'patch') this.patches(); else if (this.tab === 'user') this.presets();
  },
  row(list, text, tag, on, click) { const r = document.createElement('div'); r.className = 'lcdrow' + (on ? ' on' : ''); r.setAttribute('role', 'option'); r.innerHTML = '<span></span><i></i>'; r.firstChild.textContent = text; r.lastChild.textContent = tag || ''; r.onclick = click; list.appendChild(r); return r; },
  banks() {
    const box = $('#spBanks'), s = Store.data.settings, on = !!SF.sf && s.timbre === 'sf'; box.textContent = '';
    this.row(box, 'Built-in sound', 'GM', !on, () => SFUI.pick(''));
    (SFUI.names || []).forEach(n => this.row(box, n.replace(/\.sf[23]$/i, ''), 'SF2', on && n === s.sfName, async () => { await SFUI.pick(n); }));
    if (!(SFUI.names || []).length) { const d = document.createElement('div'); d.className = 'lcdnote'; d.textContent = 'No SoundFonts stored yet. Add a file or a whole folder below.'; box.appendChild(d); }
  },
  patches() {
    const box = $('#spPatches'); box.textContent = ''; if (this.tab !== 'patch') return;
    if (!SF.sf || Store.data.settings.timbre !== 'sf') {          // the built-in sound: its own voices, grouped by family
      const cur = Store.data.settings.timbre; let fam = '';
      Object.keys(TIMBRES).filter(k => !this.find || TIMBRES[k].label.toLowerCase().includes(this.find) || TIMBRES[k].fam.toLowerCase().includes(this.find)).forEach(k => {
        this.row(box, TIMBRES[k].label, TIMBRES[k].fam, k === cur || (cur === 'sf' && k === 'soft'), () => { const el = $('#setTimbre'); el.value = k; el.dispatchEvent(new Event('change')); this.refresh(); });
      });
      const on = box.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
      return;
    }
    const L = SF.sf.presets.map((p, i) => ({ p, i })).sort((a, b) => a.p.bank - b.p.bank || a.p.program - b.p.program).filter(x => !this.find || x.p.name.toLowerCase().includes(this.find));
    L.slice(0, 300).forEach(x => this.row(box, x.p.name, x.p.bank === 128 ? 'DRUMS' : x.p.bank ? 'B' + x.p.bank : String(x.p.program + 1).padStart(3, '0'), x.i === SF.preset, () => { SFUI.prepare(x.i).then(() => this.refresh()); }));
    if (L.length > 300) { const d = document.createElement('div'); d.className = 'lcdnote'; d.textContent = (L.length - 300) + ' more: type in the search box to narrow it down.'; box.appendChild(d); }
    const cur = box.querySelector('.on'); if (cur) cur.scrollIntoView({ block: 'nearest' });
  },
  presets() {
    const box = $('#spPresets'), L = Presets.list(), cur = Store.data.settings.presetId; box.textContent = '';
    if (!L.length) { const d = document.createElement('div'); d.className = 'lcdnote'; d.textContent = 'No presets yet. Choose a sound, turn the knobs, then press Save. Presets show up as instruments for every Compose track.'; box.appendChild(d); }
    L.forEach(p => {
      const r = this.row(box, p.name, p.font ? p.font.replace(/\.sf[23]$/i, '') : 'built-in', p.id === cur, () => Presets.apply(p.id).then(() => this.refresh()));
      const del = document.createElement('button'); del.className = 'synbtn mini'; del.textContent = '🗑'; del.title = 'Delete this preset'; del.onclick = e => { e.stopPropagation(); if (confirm('Delete preset ' + p.name + '?')) { Presets.remove(p.id); this.refresh(); } }; r.appendChild(del);
    });
  },
};
