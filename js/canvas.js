"use strict";
/* ---- Canvas helpers ---- */
function fitCanvas(cv) {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, w, h };
}
const isBlack = m => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);

/* Piano keys with some depth: ivory white keys that are darker under the felt and shaded along the front edge, black keys with a sloped front and a
   shadow on their neighbours, and a pressed key that sinks a little. begin() builds the gradients once per frame; state is null, 'on' (held) or 'heard'. */
const KeyArt = {
  begin(g, top, kh, bh) {
    const v = (len, stops) => { const gr = g.createLinearGradient(0, top, 0, top + len); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
    const lip = Math.max(5, Math.round(kh * 0.07)), lv = (len, stops) => { const gr = g.createLinearGradient(0, top + kh - len, 0, top + kh); stops.forEach(([o, c]) => gr.addColorStop(o, c)); return gr; };
    return {
      white: v(kh, [[0, '#bdb7a3'], [0.06, '#ece6d4'], [0.82, '#f6f2e6'], [1, '#d6cfba']]),
      on: v(kh, [[0, '#b97a1f'], [0.06, '#ffb347'], [1, '#ffd48a']]),
      heard: v(kh, [[0, '#6f9a3c'], [0.06, '#9ccc65'], [1, '#c5e39d']]),
      black: v(bh, [[0, '#050505'], [0.8, '#1b1b1c'], [1, '#080808']]),
      blackOn: v(bh, [[0, '#b97a1f'], [1, '#ffb347']]),
      blackHeard: v(bh, [[0, '#6f9a3c'], [1, '#9ccc65']]),
      front: lv(lip, [[0, '#cfc9b4'], [0.18, '#e6e0cd'], [1, '#a29c88']]),
      frontOn: lv(lip, [[0, '#b97a1f'], [0.18, '#f0a640'], [1, '#8a5712']]),
      frontHeard: lv(lip, [[0, '#6f9a3c'], [0.18, '#a7d66f'], [1, '#4f7326']]),
      lip
    };
  },
  /* A white key is a top surface and a front face under it. Pressed, the key dips: the top moves down toward the front edge and the face gets shorter. */
  white(g, a, x, top, w, kh, st) {
    const d = st ? 2.5 : 0, lip = a.lip, faceTop = top + kh - lip + d, r = Math.min(3, w / 3);
    if (d) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x, top, w, d); }
    g.fillStyle = st === 'on' ? a.on : st === 'heard' ? a.heard : a.white; g.fillRect(x, top + d, w, faceTop - top - d);
    g.beginPath(); g.moveTo(x, faceTop); g.lineTo(x + w, faceTop); g.lineTo(x + w, top + kh - r); g.quadraticCurveTo(x + w, top + kh, x + w - r, top + kh); g.lineTo(x + r, top + kh); g.quadraticCurveTo(x, top + kh, x, top + kh - r); g.closePath();
    g.fillStyle = st === 'on' ? a.frontOn : st === 'heard' ? a.frontHeard : a.front; g.fill();
    g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x, faceTop - 1, w, 1);
    g.fillStyle = 'rgba(255,255,255,0.55)'; g.fillRect(x + 1, faceTop, w - 2, 1);
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(x, top + d, 1, kh - lip); g.fillRect(x + w - 1, top + d, 1, kh - lip); g.fillRect(x, faceTop, 1, lip - r); g.fillRect(x + w - 1, faceTop, 1, lip - r);
  },
  black(g, a, x, top, w, bh, st) {
    const d = st ? 2 : 0, h = bh - d, r = Math.min(3, w / 4);
    const path = () => { g.beginPath(); g.moveTo(x, top); g.lineTo(x + w, top); g.lineTo(x + w, top + h - r); g.quadraticCurveTo(x + w, top + h, x + w - r, top + h); g.lineTo(x + r, top + h); g.quadraticCurveTo(x, top + h, x, top + h - r); g.closePath(); };
    g.save(); path(); g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 5; g.shadowOffsetX = 2; g.shadowOffsetY = st ? 1 : 4; g.fillStyle = '#0a0a0a'; g.fill(); g.restore();
    path(); g.fillStyle = st === 'on' ? a.blackOn : st === 'heard' ? a.blackHeard : a.black; g.fill();
    g.fillStyle = st ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.06)'; g.fillRect(x + w * 0.16, top, w * 0.68, h * 0.78);
    g.beginPath(); g.moveTo(x + w * 0.16, top + h * 0.78); g.lineTo(x + w * 0.84, top + h * 0.78); g.lineTo(x + w - 1, top + h - 1); g.lineTo(x + 1, top + h - 1); g.closePath(); g.fillStyle = st ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.17)'; g.fill();
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x + 2, top + h - 2, w - 4, 1);
    path(); g.strokeStyle = '#000'; g.lineWidth = 1; g.stroke();
  }
};

/* Piano roll. x(t) = nowX + (t - rel) * pps, so one function draws both the live scroll and the static results view. */
function drawRoll(cv, o) {
  const { g, w, h } = fitCanvas(cv), keyW = Math.min(52 * UIK, w * 0.15), tol = o.tol;
  let lo = o.lo - 2, hi = o.hi + 2;
  if (hi - lo < 12) { const c = (hi + lo) / 2; lo = c - 6; hi = c + 6; }
  const top = hi + 0.5, bot = lo - 0.5, rowH = h / (top - bot), y = m => h * (top - m) / (top - bot);
  g.fillStyle = '#24211e'; g.fillRect(0, 0, w, h);
  for (let m = Math.ceil(lo); m <= Math.floor(hi); m++) {
    g.fillStyle = isBlack(m) ? '#28241f' : '#2e2a26'; g.fillRect(keyW, y(m) - rowH / 2, w - keyW, rowH);
    if (m % 12 === 0) { g.fillStyle = '#2a3658'; g.fillRect(keyW, y(m) + rowH / 2 - 1, w - keyW, 1); }
  }
  const tgt = o.rel != null && !o.static ? targetAt(o.events, o.rel) : null;
  const sung = o.sung;
  for (let m = Math.ceil(lo); m <= Math.floor(hi); m++) {
    const on = tgt != null && Math.round(tgt) === m, sg = sung != null && Math.round(sung) === m;
    g.fillStyle = on ? '#ffb347' : sg ? '#9ccc65' : isBlack(m) ? '#141210' : '#f3ead6';
    g.fillRect(0, y(m) - rowH / 2 + 0.5, isBlack(m) && !on && !sg ? keyW * 0.62 : keyW - 2, rowH - 1);
    if (m % 12 === 0) { g.fillStyle = '#333'; g.font = (10 * UIK) + 'px sans-serif'; g.fillText('C' + (m / 12 - 1), 3, y(m) + 3 * UIK); }
  }
  const nowX = o.static ? keyW + 8 : keyW + (w - keyW) * 0.28;
  const pps = o.static ? (w - keyW - 16) / o.total : (w - nowX) / 4;
  const x = t => nowX + (t - (o.static ? 0 : o.rel)) * pps;
  g.save(); g.beginPath(); g.rect(keyW, 0, w - keyW, h); g.clip();
  const barH = Math.max(rowH * 2 * tol / 100, 6);
  o.events.forEach((ev, evI) => {
    const x0 = x(ev.start), x1 = x(ev.start + ev.dur) - 3;
    if (x1 < keyW || x0 > w) return;
    const active = !o.static && o.rel >= ev.start && o.rel < ev.start + ev.dur;
    g.fillStyle = active ? 'rgba(106,166,255,.95)' : 'rgba(106,166,255,.55)';
    g.strokeStyle = g.fillStyle;
    if (ev.midi2 == null) { g.beginPath(); g.roundRect ? g.roundRect(x0, y(ev.midi) - barH / 2, Math.max(x1 - x0, 2), barH, 5) : g.rect(x0, y(ev.midi) - barH / 2, x1 - x0, barH); g.fill(); }
    else { g.lineWidth = barH; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0 + barH / 2, y(ev.midi)); g.lineTo(x1 - barH / 2, y(ev.midi2)); g.stroke(); }
    if (o.flags && o.flags.has(evI)) { g.strokeStyle = '#ffb020'; g.lineWidth = 2; g.setLineDash([4, 3]); const yy = ev.midi2 == null ? y(ev.midi) : (y(ev.midi) + y(ev.midi2)) / 2, hh = ev.midi2 == null ? barH + 8 : Math.abs(y(ev.midi) - y(ev.midi2)) + barH + 8; g.strokeRect(x0 - 3, yy - hh / 2, Math.max(x1 - x0, 2) + 6, hh); g.setLineDash([]); }
    if (ev.v) { g.fillStyle = active ? '#fff' : '#cdd6ee'; g.font = '700 ' + (active ? 20 : 15) * UIK + 'px sans-serif'; g.textAlign = 'left'; g.fillText(ev.v.toUpperCase(), Math.max(x0 + 4, keyW + 4), y(ev.midi) - barH / 2 - 6); }
  });
  g.textAlign = 'start';
  if (!o.static) { g.setLineDash([4, 5]); g.strokeStyle = '#8d99b5'; g.beginPath(); g.moveTo(nowX, 0); g.lineTo(nowX, h); g.stroke(); g.setLineDash([]); }
  const fr = o.frames || [];
  g.lineWidth = 4; g.lineCap = 'round'; g.shadowBlur = 10;
  for (let i = 1; i < fr.length; i++) {
    const a = fr[i - 1], b = fr[i];
    if (a.m == null || b.m == null || b.t - a.t > 0.08) continue;
    if (!o.static && b.t > o.rel + 0.05) break;
    const tv = targetAt(o.events, b.t), col = tv == null ? '#8d99b5' : (Math.abs(b.m - tv) * 100 <= tol ? '#9ccc65' : '#ffb020');
    g.strokeStyle = col; g.shadowColor = col;
    g.beginPath(); g.moveTo(x(a.t), y(a.m)); g.lineTo(x(b.t), y(b.m)); g.stroke();
  }
  g.restore();
}

