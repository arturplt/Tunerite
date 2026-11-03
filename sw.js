// Optional offline support. Network first, so edits show up immediately; falls back to the cache when offline or when the server is slow.
const CACHE = 'pitch-perfect-v60';
const FILES = ['./', 'index.html', 'css/app.css', 'js/core/pitch.js', 'js/core/scoring.js', 'js/core/exercises.js', 'js/core/midi-import.js', 'js/core/song.js', 'js/core/progress.js', 'js/core/library.js', 'js/core/soundfont-read.js', 'js/app-base.js', 'js/storage.js', 'js/engine.js', 'js/canvas.js', 'js/tuner.js', 'js/spectrogram.js', 'js/midi-input.js', 'js/guide.js', 'js/routines.js', 'js/piano.js', 'js/soundfont.js', 'js/library-ui.js', 'js/range-finder.js', 'js/session.js', 'js/ui.js', 'js/steps.js', 'js/meta.js', 'js/markers.js', 'js/frame.js', 'js/sequencer.js', 'js/arp.js', 'js/noise.js', 'js/knobs.js', 'js/synth.js', 'js/editor.js', 'js/tune.js', 'js/vox.js', 'js/recorder.js', 'js/midi-file.js', 'js/main.js', 'manifest.webmanifest', 'icon.svg', 'fonts/Silkscreen-Regular.ttf', 'fonts/Silkscreen-Bold.ttf', 'lame.min.js'];
const SLOW_MS = 4000;
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Leave alone anything that is not an app file: other sites, the MIDI bridge's live stream and status, partial (Range) requests.
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/midi') || e.request.headers.has('range')) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const fromNet = fetch(e.request, { cache: 'no-store' }).then(r => { if (r.ok) cache.put(e.request, r.clone()); return r; });
    const slow = new Promise(res => setTimeout(() => res(null), SLOW_MS));
    try {
      const r = await Promise.race([fromNet, slow]);
      if (r) return r;
      return (await cache.match(e.request, { ignoreSearch: true })) || fromNet;
    } catch (err) {
      return (await cache.match(e.request, { ignoreSearch: true })) || Response.error();
    }
  })());
});
