// Optional offline support. Network first, so edits show up immediately; falls back to the cache when offline.
const CACHE = 'pitch-perfect-v3';
const FILES = ['./', 'index.html', 'css/app.css', 'js/core/pitch.js', 'js/core/scoring.js', 'js/core/exercises.js', 'js/core/midi-import.js', 'js/core/song.js', 'js/core/progress.js', 'js/core/library.js', 'js/core/soundfont-read.js', 'js/app-base.js', 'js/storage.js', 'js/engine.js', 'js/canvas.js', 'js/tuner.js', 'js/spectrogram.js', 'js/midi-input.js', 'js/guide.js', 'js/routines.js', 'js/piano.js', 'js/soundfont.js', 'js/library-ui.js', 'js/range-finder.js', 'js/session.js', 'js/ui.js', 'js/steps.js', 'js/meta.js', 'js/frame.js', 'js/sequencer.js', 'js/editor.js', 'js/recorder.js', 'js/midi-file.js', 'js/main.js', 'manifest.webmanifest', 'icon.svg', 'lame.min.js'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});
