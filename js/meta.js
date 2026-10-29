"use strict";
/* ---- Tempo and time-signature markers (strip above the piano roll) ---- tap empty space to add, tap a marker to edit, drag to move. ---- */
const Meta = {
  hits: [], drag: null, pop: null,
  snapBeat(song, t) { return Math.max(0, Math.round(t / song.ppq) * song.ppq); },
  snapBar(song, t) {
    t = Math.max(0, t); const bars = songBarLines(song, 0, t + 1), last = bars.length ? bars[bars.length - 1].tick : 0, next = last + Steps.lenAt(song, last);
    return t - last <= next - t ? last : next;
  },
  snap(kind, t) { return kind === 'tempo' ? this.snapBeat(Ed.song, t) : this.snapBar(Ed.song, t); },
  init() {
    const cv = $('#edMeta'); for (let n = 1; n <= 16; n++) { const o = document.createElement('option'); o.value = o.textContent = n; $('#mpNum').appendChild(o); }
    cv.onpointerdown = e => this.down(e); cv.onpointermove = e => this.move(e); cv.onpointerup = e => this.up(e); cv.onpointercancel = () => { this.drag = null; };
    $('#mpOk').onclick = () => this.commit(false); $('#mpDel').onclick = () => this.commit(true); $('#mpCancel').onclick = () => { this.pop = null; $('#metaPop').hidden = true; };
  },
  draw() {
    const cv = $('#edMeta'), song = Ed.song; if (!song || !Ed.geo || cv.hidden) return;
    const { g, w, h } = fitCanvas(cv), G = Ed.geo, X = t => Ed.X(t); this.hits = [];
    g.fillStyle = '#1b1b20'; g.fillRect(0, 0, w, h); g.fillStyle = '#26262c'; g.fillRect(0, 0, G.keyW, h); g.fillStyle = '#6e6e7a'; g.font = '600 9px system-ui,sans-serif'; g.textBaseline = 'middle'; g.fillText('TEMPO', 3, h / 4); g.fillText('METER', 3, h * 3 / 4);
    g.fillStyle = '#0e0e10'; g.fillRect(0, h / 2, w, 1);
    g.save(); g.beginPath(); g.rect(G.keyW, 0, w - G.keyW, h); g.clip(); g.font = '700 11px system-ui,sans-serif';
    const flag = (kind, tick, txt, row, col, ghost) => {
      const x = X(tick), tw = g.measureText(txt).width + 12, y = row * h / 2 + 2, hh = h / 2 - 4;
      g.globalAlpha = ghost ? 0.5 : 1; g.fillStyle = col; g.fillRect(x, y, 2, hh); g.fillRect(x, y, tw, hh); g.fillStyle = '#17171a'; g.fillText(txt, x + 7, y + hh / 2 + 0.5); g.globalAlpha = 1;
      if (!ghost) this.hits.push({ kind, tick, x0: x, x1: x + tw, row });
    };
    const d = this.drag && this.drag.moved ? this.drag : null;
    song.tempos.forEach(t => { if (d && d.kind === 'tempo' && d.tick === t.tick) return; flag('tempo', t.tick, '♩ ' + Math.round(60e6 / t.us), 0, '#ffb347'); });
    song.timeSigs.forEach(t => { if (d && d.kind === 'sig' && d.tick === t.tick) return; flag('sig', t.tick, t.num + '/' + t.den, 1, '#8ab4ff'); });
    if (d) flag(d.kind, d.to, d.kind === 'tempo' ? '♩ ' + d.bpm : d.num + '/' + d.den, d.kind === 'tempo' ? 0 : 1, d.kind === 'tempo' ? '#ffb347' : '#8ab4ff', true);
    g.restore();
  },
  pos(e) { const r = $('#edMeta').getBoundingClientRect(); return { px: e.clientX - r.left, py: e.clientY - r.top, h: r.height }; },
  down(e) {
    const song = Ed.song; if (!song || !Ed.geo || Ed.busy()) return; const { px, py, h } = this.pos(e), row = py < h / 2 ? 0 : 1;
    if (px < Ed.geo.keyW) return; $('#edMeta').setPointerCapture(e.pointerId);
    const hit = this.hits.find(m => m.row === row && px >= m.x0 && px <= m.x1);
    if (hit) { const v = hit.kind === 'tempo' ? song.tempos.find(t => t.tick === hit.tick) : song.timeSigs.find(t => t.tick === hit.tick); this.drag = { kind: hit.kind, tick: hit.tick, x: px, moved: false, to: hit.tick, v, bpm: hit.kind === 'tempo' ? Math.round(60e6 / v.us) : 0, num: v.num, den: v.den }; }
    else this.drag = { kind: row === 0 ? 'tempo' : 'sig', add: true, x: px, tick: this.snap(row === 0 ? 'tempo' : 'sig', Ed.tickAt(px)), moved: false };
  },
  move(e) {
    const d = this.drag; if (!d || d.add) return; const { px } = this.pos(e);
    if (!d.moved && Math.abs(px - d.x) < 5) return; if (d.tick === 0) return; d.moved = true; d.to = Math.max(1, this.snap(d.kind, Ed.tickAt(px)));
  },
  up() {
    const d = this.drag, song = Ed.song; this.drag = null; if (!d || !song) return;
    if (d.moved) {
      if (d.to === d.tick || d.to <= 0) return;
      return Ed.edit(() => { if (d.kind === 'tempo') { const us = d.v.us; songRemoveTempo(song, d.tick); songSetTempo(song, d.to, 60e6 / us); } else { songRemoveTimeSig(song, d.tick); songSetTimeSig(song, d.to, d.num, d.den); } });
    }
    const tick = d.tick, cur = d.kind === 'tempo' ? (d.v || { us: songTempoAt(song, tick) }) : (d.v || song.timeSigs.filter(t => t.tick <= tick).pop() || song.timeSigs[0]);
    this.open(d.kind, tick, d.kind === 'tempo' ? Math.round(60e6 / cur.us) : 0, cur.num, cur.den, !!d.add);
  },
  open(kind, tick, bpm, num, den, isNew) {
    this.pop = { kind, tick, isNew }; const pop = $('#metaPop'); $('#mpTempo').hidden = kind !== 'tempo'; $('#mpSig').hidden = kind !== 'sig';
    if (kind === 'tempo') $('#mpBpm').value = bpm; else { $('#mpNum').value = num; $('#mpDen').value = den; }
    $('#mpDel').hidden = isNew || tick === 0; pop.hidden = false; pop.style.left = clamp(Ed.X(tick), 8, Math.max(8, $('#sqEdit').clientWidth - 220)) + 'px';
    const inp = kind === 'tempo' ? $('#mpBpm') : $('#mpNum'); inp.focus();
  },
  commit(del) {
    const p = this.pop, song = Ed.song; if (!p || !song) return; this.pop = null; $('#metaPop').hidden = true;
    Ed.edit(() => {
      if (p.kind === 'tempo') { if (del) songRemoveTempo(song, p.tick); else songSetTempo(song, p.tick, clamp(Math.round(+$('#mpBpm').value) || 120, 20, 300)); }
      else if (del) songRemoveTimeSig(song, p.tick); else songSetTimeSig(song, p.tick, +$('#mpNum').value, +$('#mpDen').value);
    });
  }
};

