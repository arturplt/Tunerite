"use strict";
/* ---- Section markers (strip above the piano roll) ---- tap empty space to name one, tap a marker to rename or remove it, drag to move, double-tap to jump there. ---- */
const Mark = {
  hits: [], drag: null, last: 0,
  init() { const cv = $('#edMk'); cv.onpointerdown = e => this.down(e); cv.onpointermove = e => this.move(e); cv.onpointerup = () => this.up(); cv.onpointercancel = () => { this.drag = null; }; },
  draw() {
    const cv = $('#edMk'), song = Ed.song; if (!song || !Ed.geo || cv.hidden) return;
    const { g, w, h } = fitCanvas(cv), G = Ed.geo; this.hits = [];
    g.fillStyle = '#1b1b20'; g.fillRect(0, 0, w, h); g.fillStyle = '#26262c'; g.fillRect(0, 0, G.keyW, h); g.fillStyle = '#6e6e7a'; g.font = '600 ' + Math.round(9 * UIK) + 'px system-ui,sans-serif'; g.textBaseline = 'middle'; g.fillText('MARKS', 3, h / 2);
    g.save(); g.beginPath(); g.rect(G.keyW, 0, w - G.keyW, h); g.clip(); g.font = '700 ' + Math.round(11 * UIK) + 'px system-ui,sans-serif';
    const d = this.drag && this.drag.moved ? this.drag : null;
    const flag = (tick, txt, ghost) => {
      const x = Ed.X(tick), tw = g.measureText(txt).width + 12; g.globalAlpha = ghost ? 0.5 : 1; g.fillStyle = '#7fd6a4'; g.fillRect(x, 2, 2, h - 4); g.fillRect(x, 2, tw, h - 4); g.fillStyle = '#17171a'; g.fillText(txt, x + 7, h / 2 + 0.5); g.globalAlpha = 1;
      if (!ghost) this.hits.push({ tick, x0: x, x1: x + tw });
    };
    songMarkers(song).forEach(m => { if (d && d.tick === m.tick) return; flag(m.tick, m.name || 'Marker'); });
    if (d) flag(d.to, d.name, true);
    g.restore();
  },
  snap(t) { return Meta.snapBar(Ed.song, t); },
  down(e) {
    const song = Ed.song; if (!song || !Ed.geo || Ed.busy()) return; const r = $('#edMk').getBoundingClientRect(), px = e.clientX - r.left; if (px < Ed.geo.keyW) return;
    $('#edMk').setPointerCapture(e.pointerId); const hit = this.hits.find(m => px >= m.x0 && px <= m.x1);
    if (hit) { const m = songMarkers(song).find(x => x.tick === hit.tick); this.drag = { tick: hit.tick, name: m.name, x: px, moved: false, to: hit.tick }; }
    else this.drag = { add: true, tick: this.snap(Ed.tickAt(px)), x: px, moved: false };
  },
  move(e) {
    const d = this.drag; if (!d || d.add) return; const px = e.clientX - $('#edMk').getBoundingClientRect().left;
    if (!d.moved && Math.abs(px - d.x) < 5) return; d.moved = true; d.to = Math.max(0, this.snap(Ed.tickAt(px)));
  },
  up() {
    const d = this.drag, song = Ed.song; this.drag = null; if (!d || !song) return;
    if (d.moved) { if (d.to === d.tick) return; return Ed.edit(() => { songRemoveMarker(song, d.tick); songSetMarker(song, d.to, d.name); }); }
    const now = performance.now(), dbl = !d.add && now - this.last < 350 && this.lastTick === d.tick; this.last = now; this.lastTick = d.tick;
    if (dbl) return Seq.seek(songSec(song, d.tick));
    if (d.add) { const name = window.prompt('Name this spot (Intro, Verse, Chorus…)', ''); if (name && name.trim()) Ed.edit(() => songSetMarker(song, d.tick, name.trim().slice(0, 40))); return; }
    setTimeout(() => {
      if (this.last !== now) return;      // tapped again: that was a double-tap jump
      const name = window.prompt('Rename this marker (empty removes it)', d.name); if (name == null) return;
      Ed.edit(() => { if (name.trim()) songSetMarker(song, d.tick, name.trim().slice(0, 40)); else songRemoveMarker(song, d.tick); });
    }, 360);
  }
};
