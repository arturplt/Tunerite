"use strict";
/* ---- Canvas helpers ---- */
function fitCanvas(cv) {
  const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { g, w, h };
}
const isBlack = m => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12);

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

