"use strict";
/* ---- Storage: localStorage for small data, IndexedDB for recorded takes ---- */
/* Interface size: every size in the CSS is in rem, so one root font size scales text, buttons and canvases together.
   UIK is the same factor for the things drawn on canvases. */
let UIK = 1.35;
function applyUiSize() {
  UIK = { normal: 1, large: 1.35, xl: 1.6, xxl: 2 }[Store.data.settings.uiSize] || 1.35;
  document.documentElement.style.fontSize = (16 * UIK) + 'px';
  document.documentElement.style.setProperty('--k', UIK / 1.35);      // Compose is sized in px at the default (Large) size; this scales it with the setting
}
const DEFAULTS = { diff: 'medium', a4: 440, hear: true, drone: false, cues: true, guide: 'fade', vol: 0.8, gateDb: -42, wait: false, find: 1, inst: 'voice', midiOn: false, specLine: true, tempo: 100, uiSize: 'large', theme: 'classic', pxShow: true, pxAny: false, timbre: 'soft', micId: '', kbSound: true, kbPlay: true, sfName: '', sfPreset: 0, guideRoot: 'auto', guideNames: 'pl', guideFirst: true, reverb: 'off', chorus: false, specSynth: true, fxTrem: 'off', fxVib: 'off', fxDelay: 'off', fxWide: false, fxTone: 'neutral', fxPhase: 'off', fxDrive: 'off', fxOct: 'off', fxHuman: false, fxUni: 0, fxGlide: 0, fxPing: false, fxK: {} };
const Store = {
  /* the active profile's key; the first profile keeps the original key so nothing saved before profiles existed is lost */
  get key() { return Profiles.keyOf(Profiles.meta.active); },
  fresh() { return { settings: Object.assign({}, DEFAULTS), range: null, rangeLog: [], history: [], passes: {} }; },
  data: { settings: Object.assign({}, DEFAULTS), range: null, rangeLog: [], history: [], passes: {} },
  load() { try { const d = JSON.parse(localStorage.getItem(this.key)); if (d) { this.data = Object.assign(this.data, d); this.data.settings = Object.assign({}, DEFAULTS, d.settings); if (!d.settings || !d.settings.kbSoundOn) { this.data.settings.kbSound = true; this.data.settings.kbSoundOn = true; } /* one-time: MIDI keys sound like the computer keyboard by default */ } } catch (e) {} },
  /* If the browser's storage is full, the editor's snapshots (the bulkiest, rebuildable data) go first so course stars, history and settings still get saved. */
  save() {
    const put = () => localStorage.setItem(this.key, JSON.stringify(this.data));
    try { put(); this.failed = false; return; } catch (e) {}
    try { if (this.data.edSnaps) { this.data.edSnaps = {}; if (window.Ed && Ed.snapMem) Ed.snapMem = {}; put(); this.failed = false; if (typeof toast === 'function') toast('Storage was full: the editor snapshots were cleared to keep your progress.', 5000); return; } } catch (e) {}
    if (!this.failed && typeof toast === 'function') toast('Could not save your progress: the browser storage is full or blocked.', 6000);
    this.failed = true;
  },
  wipe() { try { localStorage.removeItem(this.key); } catch (e) {} }
};
/* ---- Profiles: each one keeps its own range, progress (scores, course stars, history) and settings ---- */
const Profiles = {
  mk: 'pitchperfect.profiles',
  meta: { active: 'default', list: [{ id: 'default', name: 'Me' }] },
  keyOf(id) { return id === 'default' ? 'pitchperfect.v1' : 'pitchperfect.p.' + id; },
  load() { try { const m = JSON.parse(localStorage.getItem(this.mk)); if (m && Array.isArray(m.list) && m.list.length) { this.meta = m; if (!m.list.some(p => p.id === m.active)) m.active = m.list[0].id; } } catch (e) {} },
  saveMeta() { try { localStorage.setItem(this.mk, JSON.stringify(this.meta)); } catch (e) {} },
  cur() { return this.meta.list.find(p => p.id === this.meta.active); },
  /* the app reloads after a switch, so every screen starts from the new profile's data */
  switchTo(id) { Store.save(); this.meta.active = id; this.saveMeta(); location.reload(); },
  add(name, data) {
    const id = Date.now().toString(36); this.meta.list.push({ id, name: name || 'Profile' });
    try { localStorage.setItem(this.keyOf(id), JSON.stringify(data || Store.fresh())); } catch (e) { this.meta.list.pop(); toast('Could not create the profile: the browser storage is full.', 5000); return null; }
    this.saveMeta(); return id;
  },
  rename(name) { const p = this.cur(); if (name && p) { p.name = name; this.saveMeta(); } },
  remove() {
    if (this.meta.list.length < 2) return false; const id = this.meta.active;
    try { localStorage.removeItem(this.keyOf(id)); } catch (e) {}
    this.meta.list = this.meta.list.filter(p => p.id !== id); this.meta.active = this.meta.list[0].id; this.saveMeta(); location.reload(); return true;
  },
  exportJson() { Store.save(); return JSON.stringify({ tunerite: 1, name: this.cur().name, data: Store.data }); },
  /* a file made by exportJson becomes a new profile */
  importJson(text) {
    let o; try { o = JSON.parse(text); } catch (e) { return null; }
    if (!o || !o.data || typeof o.data !== 'object' || !o.data.settings) return null;
    return this.add((o.name || 'Imported') + '', o.data);
  }
};
const Takes = {
  MAX: 20, db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((res, rej) => {
      if (!window.indexedDB) return rej();
      const rq = indexedDB.open('pitchperfect', 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore('takes', { keyPath: 'id' });
      rq.onsuccess = () => { this.db = rq.result; res(this.db); };
      rq.onerror = () => rej(rq.error);
    });
  },
  tx(mode, fn) { return this.open().then(db => new Promise((res, rej) => { const t = db.transaction('takes', mode), r = fn(t.objectStore('takes')); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); })); },
  async put(rec) { await this.tx('readwrite', s => s.put(rec)); const keys = await this.keys(); for (const k of keys.slice(0, Math.max(0, keys.length - this.MAX))) await this.tx('readwrite', s => s.delete(k)); },
  get(id) { return this.tx('readonly', s => s.get(id)); },
  keys() { return this.tx('readonly', s => s.getAllKeys()).then(k => (k || []).sort((a, b) => a - b)); },
  clear() { return this.tx('readwrite', s => s.clear()); }
};

