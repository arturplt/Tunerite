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
const DEFAULTS = { diff: 'medium', a4: 440, hear: true, drone: false, cues: true, guide: 'fade', vol: 0.8, gateDb: -42, wait: false, find: 1, inst: 'voice', midiOn: false, specLine: true, tempo: 100, uiSize: 'large', pxShow: true, pxAny: false, timbre: 'soft', micId: '', kbSound: true, kbPlay: true, sfName: '', sfPreset: 0, guideRoot: 'auto', guideNames: 'pl', guideFirst: true, reverb: 'off', chorus: false, specSynth: true, fxTrem: 'off', fxVib: 'off', fxDelay: 'off', fxWide: false, fxTone: 'neutral', fxPhase: 'off', fxDrive: 'off', fxOct: 'off', fxHuman: false, fxK: {} };
const Store = {
  key: 'pitchperfect.v1',
  data: { settings: Object.assign({}, DEFAULTS), range: null, rangeLog: [], history: [], passes: {} },
  load() { try { const d = JSON.parse(localStorage.getItem(this.key)); if (d) { this.data = Object.assign(this.data, d); this.data.settings = Object.assign({}, DEFAULTS, d.settings); if (!d.settings || !d.settings.kbSoundOn) { this.data.settings.kbSound = true; this.data.settings.kbSoundOn = true; } /* one-time: MIDI keys sound like the computer keyboard by default */ } } catch (e) {} },
  save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch (e) {} },
  wipe() { try { localStorage.removeItem(this.key); } catch (e) {} }
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

