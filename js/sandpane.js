"use strict";
/* ---- The Sand display view (Piano tab): a sealed glass pane of sand on a low-res LCD grid. Every note you play or hold steady pours its own sand into it,
   so the pane slowly becomes a picture of what you played. Whole notes are solids (heavy to light), sharps are liquids of different weight. The same
   note three times in a row turns its sand heavy and glowing. Turn the pane over to let it sift down into new dunes; shake it to topple towers.
   The grid is high resolution: cells of 2 device pixels, so the picture is fine grained. It replaces the display's mesh overlay while it is on. The pane is saved as you go. ---- */
const Sand = (() => {
  const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'], SHARP = NAMES.map(n => n.includes('#'));
  const SW = 720, GHM = 420, CAP = SW * GHM, SAVE_KEY = 'tunerite.sand.v2';        // the arrays are the most the view can ever need; the grid in use is as big as the canvas
  const EMPTY = 0, SAND = 1, WATER = 2, GLIT = 3, LIQ = 4, GLOW = 16;                              // GLOW: a bit in a grain's V byte, set on "charged" sand
  const hue = n => (n * 30 + 355) % 360;
  /* Whole notes are solids and sharps are liquids; every note has its own weight.
     Solids, heavy to light: gravel, coarse, sand, sand, fine, dust, powder. speed: how fast it falls; R: how far a resting grain looks sideways for a lower spot (light ones level out flatter); l: how lightly it drifts.
     Liquids, like oils of different weight (dens, water is 1): heavy ones sink under water, light ones float on top. visc: how thick (0 flows freely). */
  const MAT = [
    { name: 'GRAVEL', kind: SAND, speed: 1.7, R: 3, l: 0 }, { name: 'TAR', kind: LIQ, dens: 1.25, visc: .55, l: .95 },
    { name: 'COARSE', kind: SAND, speed: 1.35, R: 4, l: .15 }, { name: 'SYRUP', kind: LIQ, dens: 1.1, visc: .4, l: .95 },
    { name: 'SAND', kind: SAND, speed: 1.1, R: 6, l: .3 },
    { name: 'SAND', kind: SAND, speed: 1, R: 6, l: .4 }, { name: 'OIL', kind: LIQ, dens: .92, visc: .25, l: .95 },
    { name: 'FINE', kind: SAND, speed: .8, R: 8, l: .55 }, { name: 'SPIRIT', kind: LIQ, dens: .82, visc: .15, l: .95 },
    { name: 'DUST', kind: SAND, speed: .6, R: 10, l: .75 }, { name: 'ETHER', kind: LIQ, dens: .7, visc: .08, l: .95 },
    { name: 'POWDER', kind: SAND, speed: .45, R: 14, l: .9 }];
  const PULSE = n => .9 * Math.pow(2, n / 6);                                                      // glow pulses per second: higher notes flicker faster
  const pack = (r, g, b) => (255 << 24 | b << 16 | g << 8 | r) >>> 0;
  const hsl = (h, s, l) => { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = n => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1)); return [f(0) * 255, f(8) * 255, f(4) * 255].map(Math.round); };
  /* three vividness levels (dull, normal, vivid) of four grain shades each: index = level * 4 + shade; sharps are deeper */
  const LEVELS = [[.4, -7], [1, 0], [1.2, 5]];
  const PAL = NAMES.map((_, n) => LEVELS.flatMap(([sm, dl]) => [-9, -2, 5, 12].map(d => pack(...hsl(hue(n), Math.min(100, (SHARP[n] ? 62 : 80) * sm), (SHARP[n] ? 40 : 56) + d + dl)))));
  const WATERC = [pack(40, 110, 200), pack(60, 140, 225), pack(30, 90, 170)], GLITC = pack(255, 220, 100), WHITE = pack(255, 255, 255);
  const css = n => 'rgb(' + hsl(hue(n), SHARP[n] ? 62 : 80, SHARP[n] ? 40 : 56).join(',') + ')';
  const bright = (c, k) => { const r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255; return pack(Math.round(r + (255 - r) * k), Math.round(g + (255 - g) * k), Math.round(b + (255 - b) * k)); };
  const hash = (x, y, t) => { let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(t, 1274126177); h = Math.imul(h ^ (h >>> 13), 1103515245); return (h ^ (h >>> 16)) >>> 0; };

  const T = new Uint8Array(CAP), N = new Uint8Array(CAP), V = new Uint8Array(CAP), P = new Uint8Array(CAP);   // material, note, vividness + glow, and each grain's own phase and pace (so no two grains move in step)
  const set = (i, t, n, v) => { T[i] = t; N[i] = n; V[i] = v; P[i] = (Math.random() * 256) | 0; };
  const swap = (a, b) => { const t = T[a], n = N[a], v = V[a], p = P[a]; T[a] = T[b]; N[a] = N[b]; V[a] = V[b]; P[a] = P[b]; T[b] = t; N[b] = n; V[b] = v; P[b] = p; };
  const fluid = t => t === WATER || t === LIQ, free = c => !T[c] || fluid(T[c]);
  const densF = i => T[i] === WATER ? 1 : MAT[N[i]].dens;

  let GW = 0, GH = 0, TOP = GHM, cell = 3, X0 = 0, Y0 = 0, img = null, px = null, gimg = null, gpx = null, gcv = null, glcv = null, gx = null, glx = null;
  let drift = false, air = 0, tick = 0, acc = 0, last = 0, fl = 0, pfall = 1, shk = 0, filled = 0, water = 0, topOcc = 0, streak = 0, rep = 0, lastN = null, banner = null, flash = 0, inv = false, flip = null, dirty = false, saveAt = 0, sung = [];
  const pours = [], FLOAT_S = 9, FULL_AT = .995;
  /* The grid is as fine as the canvas allows (cells of 2 device pixels, at most 480 across). Every length and count below was tuned on a 252 by 126 grid, so it scales with q (this grid's width against 252) and rs (against the 168 wide original). */
  let q = 1, rs = 1.5, ts = 1;                                                                    // ts: physics ticks run faster on a finer grid, so grains keep their visible speed
  let prevKeys = new Set(), ml = null, heard = null, trk = 0;                                                              // the keys held last frame, and the sung note being held steady
  const colX = n => (n + .5) / 12 * GW, idx = (x, y) => y * SW + x;

  /* which way a grain in the air is pushed this tick: a slow swing, plus two crossing waves of turbulence and a little noise. Lighter notes feel it more. */
  const sway = (x, y, t, l, p) => {
    const base = Math.sin(t * (.035 + p * .00009) + p * .0246 + y * .15 + x * .027), turb = Math.sin(t * .029 + x * .2 - y * .11) * Math.sin(t * .02 - x * .073 + y * .15);
    return base + turb * (.4 + .8 * l) + (Math.random() - .5) * .5 * (.3 + l) > 0 ? 1 : -1;
  };
  /* a slender vertical strand: grains stacked above this one (gaps allowed), taller than 4, with nothing beside them. Such a strand topples sideways. */
  const strand = (i, y) => y >= 6 && (T[i - SW] || T[i - 2 * SW]) && (T[i - 3 * SW] || T[i - 4 * SW]) && (T[i - 5 * SW] || T[i - 6 * SW]) && !T[i - 1] && !T[i + 1] && !T[i - SW - 1] && !T[i - SW + 1] && !T[i - 3 * SW - 1] && !T[i - 3 * SW + 1];
  /* shaking: two quick jolts. A grain with nothing above it hops to a spot nearby that is at least 4 cells lower, so towers taller than 4 topple and gentle slopes are left alone. */
  const shaking = () => shk > 0 && ((1 - shk) < .3 || ((1 - shk) > .45 && (1 - shk) < .75));
  const shakeHop = (i, x, y, d) => {
    if (T[i - SW] || y <= TOP + 3 || Math.random() > .6) return false;
    const xx = x + d * (1 + ((Math.random() * 14 * q) | 0)), dp = Math.max(3, Math.round(4 * q));
    if (xx < 0 || xx >= GW || y + dp >= GHM || T[idx(xx, y)]) return false;
    for (let j = 1; j <= dp; j++) if (!free(idx(xx, y + j))) return false;
    swap(i, idx(xx, y)); return true;
  };

  /* a grain in the air during a jolt is thrown one to three cells to either side */
  const scatter = (i, x) => {
    if (Math.random() > .9) return false;
    const d = Math.random() < .5 ? -1 : 1, n = Math.max(1, Math.round((1 + ((Math.random() * 3) | 0)) * q));
    for (let r = n; r >= 1; r--) { const xx = x + d * r; if (xx >= 0 && xx < GW && free(i + d * r)) { swap(i, i + d * r); return true; } }
    return false;
  };

  /* Tilting the phone leans the sand toward the low side. The surface does not stay flat on screen: it settles at the slope of the tilt, deeper on the low side. Gravity still points down
     on screen, so a grain on top of a column hops to the neighbouring column's surface when that column is lower than the tilt says it should be. */
  let lean = 0;                                                                                   // the slope of the tilt, signed: positive leans right (about tan of the angle, up to 1.2)
  const surf = new Int16Array(SW);
  function leanPass() {
    const sa = lean, Rm = Math.max(2, Math.round(24 * q));
    for (let x = 0; x < GW; x++) { let y = TOP; while (y < GHM && !(T[idx(x, y)] && (y === GHM - 1 || T[idx(x, y + 1)]))) y++; surf[x] = y; }          // the row of each column's settled top (grains still falling do not count)
    for (let x = 0; x < GW; x++) {
      if (Math.random() > .5) continue;
      const e = Math.random() < .5 ? -1 : 1, r = surf[x], dx = e * (1 + ((Math.random() * Rm) | 0)), xx = x + dx; if (xx < 0 || xx >= GW || r >= GHM) continue;
      const rn = surf[xx], dh = r - rn, dest = rn - 1;                                          // dh: how much higher the other column stands than this one
      if (!fluid(T[idx(x, r)]) && dh < sa * dx - 1 && dest >= TOP && dest > 0 && !T[idx(xx, dest)]) { swap(idx(x, r), idx(xx, dest)); surf[x] = r + 1; surf[xx] = dest; }       // hop to a column that is lower than the tilt says it should be
    }
  }

  function step(t) {
    const tt = t / ts; air = 0;
    for (let y = GHM - 2; y >= TOP; y--) {
      const ltr = ((y + t) & 1) === 0;
      for (let k = 0; k < GW; k++) {
        const x = ltr ? k : GW - 1 - k, i = idx(x, y), m0 = T[i];
        if (!m0) continue;
        const b = i + SW, d = Math.random() < .5 ? -1 : 1;
        if (fluid(m0)) {
          if (shaking() && shakeHop(i, x, y, d)) continue;                                           // liquids topple too
          if (m0 === LIQ && Math.random() < MAT[N[i]].visc) continue;                                // thick liquids move less often
          if (T[b] && fluid(T[b]) && densF(i) > densF(b) && Math.random() < .5) { swap(i, b); continue; }   // a heavier liquid sinks through a lighter one: oil ends up on top of water
          if (fl > 0 && m0 === LIQ && x + d >= 0 && x + d < GW && T[i + d] === WATER && Math.random() < .25) { swap(i, i + d); continue; }   // after a turn-over the liquids wander through the water
          if (!T[b]) {
            air++;
            if (shaking() && scatter(i, x)) continue;
            if (drift) {                                                                             // after a turn-over liquid floats down too, drifting a long way sideways; it still reaches the bottom in the end
              const l = m0 === WATER ? .85 : .97;
              if (Math.random() > pfall * (.5 + .4 * (1 - l))) continue;
              const dd = sway(x, y, tt, l, P[i]);
              if (strand(i, y) && x + dd >= 0 && x + dd < GW && !T[b + dd] && Math.random() < .75) { swap(i, b + dd); continue; }
              if (m0 === LIQ && Math.random() < .45 && x + dd >= 0 && x + dd < GW && free(i + dd)) { swap(i, i + dd); continue; }   // it flutters across without falling
              if (x + dd >= 0 && x + dd < GW && !T[b + dd] && Math.random() < .3 + .6 * l) swap(i, b + dd); else swap(i, b);
              continue;
            }
            if (Math.random() > .75 + .25 * P[i] / 255) continue;
            swap(i, b); continue;
          }
          const xa = x + d, xb = x - d;
          if (xa >= 0 && xa < GW && !T[b + d]) { swap(i, b + d); continue; }
          if (xb >= 0 && xb < GW && !T[b - d]) { swap(i, b - d); continue; }
          /* flow sideways only toward a spot where it can then drop; a surface with steps of one cell stays still, so liquid comes to rest instead of shuffling forever */
          const LR = Math.round((m0 === WATER ? 64 : 24) * q);                                           // water runs a long way along its surface, so it levels out flat
          for (let r = 1; r <= LR; r++) { const xx = x + d * r; if (xx < 0 || xx >= GW || T[idx(xx, y)]) break; if (!T[idx(xx, y + 1)]) { swap(i, idx(xx, y)); break; } }
        } else {                                                                                      // sand and glitter: down, or slide down a slope; it sinks through any liquid
          const m = MAT[N[i]], ch = V[i] & GLOW;
          if (free(b)) {
            if (!T[b]) air++;
            if (shaking() && scatter(i, x)) continue;                                                // a jolt in mid-air throws grains side to side
            if (drift) {                                                                              // just turned over: grains in the air drift down slowly, swinging side to side
              /* heavy notes drop almost straight down and quickly; light ones drift wide and linger (pfall climbs to 1, so every grain gets to the bottom) */
              const l = m.l;
              if (Math.random() > Math.min(1, pfall * (1.5 - .9 * l))) continue;
              const dd = sway(x, y, tt, l, P[i]), xd = x + dd;
              if (strand(i, y) && xd >= 0 && xd < GW && free(b + dd) && Math.random() < .75) { swap(i, b + dd); continue; }   // a strand taller than 4 topples either way, so no long thin lines
              if (l > .45 && Math.random() < .35 * (l - .3) && xd >= 0 && xd < GW && free(i + dd)) { swap(i, i + dd); continue; }   // light grains also flutter sideways without falling
              if (Math.random() < .1 + .85 * l && xd >= 0 && xd < GW && free(b + dd)) swap(i, b + dd); else swap(i, b);
              continue;
            }
            const wet = fluid(T[b]);
            if (wet && Math.random() < .3) continue;                                                  // water slows a grain down
            if (Math.random() > .7 + .3 * P[i] / 255) continue;                                       // each grain has its own pace, so a falling stream spreads out in time
            if (m.speed < 1 && Math.random() > m.speed) continue;                                     // dust hangs in the air
            let dst = b;
            const l = m.l, sw = sway(x, y, tt, l, P[i]);
            if (strand(i, y) && x + sw >= 0 && x + sw < GW && free(b + sw) && Math.random() < .5) dst = b + sw;           // a stream taller than 4 widens
            else if (Math.random() < (wet ? .25 + .3 * l : .03 + .1 * l) && x + sw >= 0 && x + sw < GW && free(b + sw)) dst = b + sw;           // a touch of turbulence even when just pouring
            else if (m.speed < 1 && Math.random() < .4 && x + d >= 0 && x + d < GW && free(b + d)) dst = b + d;          // dust drifts sideways
            swap(i, dst);
            if ((m.speed > 1 || ch) && y + 2 < GHM && Math.random() < (ch ? .8 : .6) && free(dst + SW)) swap(dst, dst + SW);   // gravel and charged sand fall faster
            continue;
          }
          if (ch && !fluid(T[b]) && !(V[b] & GLOW) && Math.random() < .2) { swap(i, b); continue; }   // charged sand is denser: it works down through ordinary sand
          const xa = x + d, xb = x - d;
          if (xa >= 0 && xa < GW && free(b + d) && !T[i + d]) { swap(i, b + d); continue; }
          if (xb >= 0 && xb < GW && free(b - d) && !T[i - d]) { swap(i, b - d); continue; }
          if (shaking() && shakeHop(i, x, y, d)) continue;
          /* settle: look a few cells sideways for a lower spot. Heavy notes barely do, light ones level out, so each note lays down its own kind of layer */
          const R = Math.max(1, Math.round((ch ? 4 : m.R) * q));
          for (let r = 2; r <= R; r++) { const xx = x + d * r; if (xx < 0 || xx >= GW || T[idx(xx, y)]) break; if (free(idx(xx, y + 1))) { swap(i, idx(xx, y)); break; } }
        }
      }
    }
    if (drift && fl <= 0 && !air) drift = false;                                                 // the drifting ends only when every grain has landed, never on a timer
  }

  function put(x, y, t, n, lvl, glow) {
    x = Math.round(x); y = Math.round(y); if (y < TOP || y >= GHM) return;
    if (x < 0) x = -x; if (x >= GW) x = 2 * (GW - 1) - x; x = Math.max(0, Math.min(GW - 1, x));      // a scattered grain bounces off the frame instead of vanishing
    for (let o = 0; o <= 12; o = o > 0 ? -o : 1 - o) {                                                // a blocked spot at the top: use the nearest free one
      const xx = x + o; if (xx < 0 || xx >= GW) continue; const i = idx(xx, y);
      if (!T[i]) { set(i, t, n, lvl * 4 + ((Math.random() * 4) | 0) + (glow ? GLOW : 0)); return; }
    }
  }

  /* how tall the sand already stands around a column, in cells */
  const pileHeight = cx => { let h = 0; for (let x = Math.max(0, cx - Math.round(10 * q)); x <= Math.min(GW - 1, cx + Math.round(10 * q)); x++) { let y = TOP; while (y < GHM && !T[idx(x, y)]) y++; h = Math.max(h, GHM - y); } return h; };
  /* the pane is full only when there is really no room left: the row where grains enter is almost all taken. Sand sinks through water, so a pane with room for water has room for sand. */
  const isFull = () => filled / (GW * GH || 1) > FULL_AT || topOcc > GW * .9;

  /* a note arrives: accuracy shapes the pour (tight, vivid and sparkly when close to pitch; wide and dull when not), and the nozzle sweeps a little, which lays the note down as a layer */
  function pour(n, a) {
    if (!GW) return;
    if (isFull()) { banner = { t: 0, text: 'PANE FULL', sub: 'TURN IT OVER', warn: true }; return; }
    const perfect = a >= .9; sung.push(n); dirty = true;
    rep = n === lastN ? rep + 1 : 1; lastN = n;
    const charged = rep % 3 === 0;                                                                  // the same note three times in a row
    if (charged) { flash = .5; banner = { t: 0, text: 'CHARGED!', sub: NAMES[n] + ' x3 - HEAVY, GLOWING', cyan: true }; }
    pours.push({ kind: 'sand', t: MAT[n].kind, n, acc: a, charged, left: Math.round((130 + 140 * a) * (charged ? 1.2 : 1) * rs * rs), x: colX(n), sweep: rs * 10 + pileHeight(Math.round(colX(n))) * .7, phase: Math.random() * 6.28,
      spread: rs * (1.5 + (1 - a) * (1 - a) * 26), glit: MAT[n].kind === LIQ || a < .6 ? 0 : (a - .6) / .4 * .22, lvl: charged ? 2 : a < .45 ? 0 : a < .85 ? 1 : 2 });
    if (perfect) {
      if (++streak >= 3) { streak = 0; flash = 1; banner = { t: 0, text: '3 PERFECT!', sub: 'WATER BONUS' }; setTimeout(() => pours.push({ kind: 'water', left: Math.round(520 * rs * rs), n, x: GW / 2 }), 700); }
    } else streak = 0;
  }

  /* the pane turns over top to bottom, so the rows swap places and every column keeps its own left-right position */
  function rotate() {
    for (let y = TOP, j = GHM - 1; y < j; y++, j--) for (let x = 0; x < GW; x++) {
      const a = idx(x, y), b = idx(x, j); let t = T[a]; T[a] = T[b]; T[b] = t; t = N[a]; N[a] = N[b]; N[b] = t; t = V[a]; V[a] = V[b]; V[b] = t; t = P[a]; P[a] = P[b]; P[b] = t;
    }
  }

  function update(dt) {
    if (flip) { flip.t += dt / .9; if (flip.t >= .5 && !flip.done) { rotate(); flip.done = true; fl = 1; drift = true; dirty = true; } if (flip.t >= 1) flip = null; }
    if (banner && (banner.t += dt) > 2) banner = null;
    flash = Math.max(0, flash - dt * 1.6);
    if (shk > 0) { shk = Math.max(0, shk - dt); dirty = true; }
    if (fl > 0) { fl = Math.max(0, fl - dt / FLOAT_S); pfall = .1 + .9 * (1 - fl) * (1 - fl); }
    if (pours.length || fl > 0 || drift || flip) dirty = true;
    acc += dt;
    const dtk = 1 / (90 * ts);
    while (acc >= dtk) {
      acc -= dtk;
      if (flip && !flip.done) continue;                                                              // the sand holds still while the pane is mid-turn
      for (let q = pours.length - 1; q >= 0; q--) {
        const p = pours[q], per = p.kind === 'water' ? 12 : p.t === LIQ ? 6 : 4;
        if (p.kind === 'sand') p.phase += .05;
        for (let k = 0; k < per && p.left > 0; k++, p.left--) {
          const y = TOP + ((Math.random() * 4) | 0);
          if (p.kind === 'water') {                                                                   // rain only around the notes that were sung, the last one a bit more often
            const m = sung.length ? (Math.random() < .3 ? sung[sung.length - 1] : sung[(Math.random() * sung.length) | 0]) : 5;
            put(colX(m) + (Math.random() + Math.random() + Math.random() - 1.5) * 9 * rs, y, WATER, 0, 1, 0);
          } else {
            const gl = Math.random() < p.glit, far = Math.random() < (1 - p.acc) * .3;                // a sloppy note also flings a few grains well outside its column
            const dx = (Math.random() + Math.random() + Math.random() - 1.5) * p.spread * (far ? 2.2 : 1) + Math.sin(p.phase) * p.sweep;
            const lv = Math.max(0, Math.min(2, p.lvl + (Math.random() < .12 ? (Math.random() < .5 ? -1 : 1) : 0)));
            p.nx = p.x + Math.sin(p.phase) * p.sweep; put(p.x + dx, y, gl ? GLIT : p.t, p.n, lv, p.charged);
          }
        }
        if (p.left <= 0) pours.splice(q, 1);
      }
      step(tick++); if (lean && tick % 2 === 0) leanPass();
    }
  }

  /* What is being played. Keys (MIDI, touch or the computer keyboard) pour at once. A sung or whistled note trickles in as you hold it, like treacle, at the spot your pitch is at right now
     (the trickle widens and dulls when you are off the note). Hold the same note for 3 seconds and it locks in: a full pour, scored by how close to the pitch you stayed.
     The microphone is only used while no key is down, so the pane never hears the app's own piano. */
  const LOCK_S = 3;
  function listen(dt) {
    const ks = Midi.keys(); ks.forEach(m => { if (!prevKeys.has(m)) pour(((m % 12) + 12) % 12, 1); }); prevKeys = new Set(ks);   // a key is exact, so it is a perfect note: three in a row make it rain
    if (ks.length) { ml = null; heard = null; return; }
    const voiced = performance.now() - Tuner.lastVoiced < 350 && Tuner.midi != null;
    if (!voiced) { heard = null; if (ml && (ml.gap += dt) > .4) ml = null; return; }
    const m = Tuner.midi, nr = Math.round(m), n = ((nr % 12) + 12) % 12, dev = Math.abs(m - nr) * 100, a = Math.max(0, Math.min(1, 1 - (dev - 3) / 40));
    heard = { n, c: (m - nr) * 100 };
    if (!ml || Math.abs(m - ml.m) > .75) ml = { m: nr, t: 0, sum: 0, cnt: 0, gap: 0 };                                          // a little wobble around the note keeps the hold; a new note starts again
    ml.t += dt; ml.sum += Math.abs(m - ml.m) * 100; ml.cnt++; ml.gap = 0;
    if (ml.t >= LOCK_S) { const avg = ml.sum / ml.cnt; ml.t = 0; ml.sum = 0; ml.cnt = 0; pour(n, Math.max(0, Math.min(1, 1 - (avg - 3) / 40))); return; }
    if (!GW || isFull() || (flip && !flip.done)) return;
    trk += dt * 40 * rs;                                                                                                        // the trickle: a few dozen grains a second, where the pitch is
    const x = ((((m % 12) + 12) % 12) + .5) / 12 * GW, lv = a < .45 ? 0 : a < .85 ? 1 : 2;
    while (trk >= 1) { trk--; put(x + (Math.random() + Math.random() - 1) * rs * (1 + (1 - a) * (1 - a) * 14), TOP + ((Math.random() * 4) | 0), MAT[n].kind, n, lv, false); }
  }

  function fit(Wd, Hd) {
    cell = Math.max(2, Math.ceil(Wd / 480)); const gw = Math.min(SW, Math.floor(Wd / cell)), gh = Math.min(GHM, Math.floor(Hd / cell));
    X0 = Math.floor((Wd - gw * cell) / 2); Y0 = Hd - gh * cell;
    if (gw !== GW || gh !== GH || !img) {
      GW = gw; GH = gh; TOP = GHM - gh; q = gw / 252; rs = gw / 168; ts = Math.min(q, 2.2);
      gcv = document.createElement('canvas'); gcv.width = gw; gcv.height = gh; gx = gcv.getContext('2d'); img = gx.createImageData(gw, gh); px = new Uint32Array(img.data.buffer);
      glcv = document.createElement('canvas'); glcv.width = gw; glcv.height = gh; glx = glcv.getContext('2d'); gimg = glx.createImageData(gw, gh); gpx = new Uint32Array(gimg.data.buffer);
    }
  }

  function render(now) {
    let all = 0, wet = 0; topOcc = 0; gpx.fill(0);
    for (let y = 0; y < GH; y++) {
      const ry = inv ? GHM - 1 - y : TOP + y, bg = pack(Math.max(0, 22 - y * .07 * 126 / GH) | 0, Math.max(0, 14 - y * .05 * 126 / GH) | 0, Math.max(0, 8 - y * .03 * 126 / GH) | 0);      // a smooth dark amber glass, a little darker toward the bottom
      for (let x = 0; x < GW; x++) {
        const i = idx(x, ry), o = y * GW + x, t = T[i];
        if (!t) { px[o] = hash(x, y, 7) % 5 === 0 ? bright(bg, .03) : bg; continue; }
        all++; if (ry === (inv ? GHM - 1 : TOP)) topOcc++;
        if (t === WATER) { wet++; const r = hash(x, y, now / 220 | 0) & 15; px[o] = r === 0 ? WATERC[1] : r < 6 ? WATERC[2] : WATERC[0]; continue; }   // shimmering at random, no pattern
        let c = t === GLIT ? ((hash(x, y, now / 160 | 0) & 7) === 0 ? WHITE : GLITC) : PAL[N[i]][V[i] & 15];
        if (t === LIQ && (hash(x, y, now / 200 | 0) & 15) === 0) c = bright(c, .35);                                          // liquid glints
        if (V[i] & GLOW) { const p = .5 + .5 * Math.sin(now / 1000 * Math.PI * 2 * PULSE(N[i]) + (x + y) * .03); gpx[o] = (((25 + 85 * p) | 0) << 24 | (c & 0xffffff)) >>> 0; c = bright(c, .06 + .16 * p); }
        px[o] = c;
      }
    }
    filled = all; water = wet;
    gx.putImageData(img, 0, 0); glx.putImageData(gimg, 0, 0);
    for (const p of pours) if (p.kind === 'sand' && p.nx != null) {                                   // a funnel in the note's colour over the spot it is pouring into
      const nx = Math.round(p.nx), fy = (r, h) => inv ? GH - r - h : r;      // the funnel sits where the sand enters: the top, or the bottom while gravity is upside down
      gx.fillStyle = '#050506'; gx.fillRect(nx - 6, fy(0, 1), 13, 1); gx.fillRect(nx - 5, fy(1, 1), 11, 1); gx.fillRect(nx - 3, fy(2, 1), 7, 1); gx.fillRect(nx - 1, fy(3, 1), 3, 1);
      gx.fillStyle = css(p.n); gx.fillRect(nx - 5, fy(0, 1), 11, 1); gx.fillRect(nx - 4, fy(1, 1), 9, 1); gx.fillRect(nx - 2, fy(2, 1), 5, 1); gx.fillRect(nx, fy(3, 1), 1, 1);
    }
  }

  /* the Spectrogram calls this in place of its own drawing when the Sand view is on. w and h are CSS pixels of the area above the keys. */
  function draw(g, w, h, dpr) {
    const now = performance.now(), dt = Math.min(.05, last ? (now - last) / 1000 : .016); last = now;
    const Wd = Math.round(w * dpr), Hd = Math.round(h * dpr); if (Wd < 40 || Hd < 40) return;
    fit(Wd, Hd); listen(dt); update(dt); render(now);
    if (dirty && now > saveAt && !pours.length && !(fl > 0) && !drift && !flip) { save(); dirty = false; }
    if (!dirty) saveAt = now + 2500;
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#0d0b09'; g.fillRect(0, 0, Wd, Hd);
    const jolt = shk > 0 ? Math.max(0, 1 - (1 - shk) / .22) + (1 - shk >= .45 ? Math.max(0, 1 - Math.abs(1 - shk - .45) / .22) : 0) : 0, jx = jolt ? Math.round((Math.random() < .5 ? -1 : 1) * 2 * cell * jolt) : 0;   // two jolts, pam pam
    const gw = GW * cell, gh = GH * cell, sq = !!flip, f = sq ? Math.cos(Math.min(1, flip.t) * Math.PI) : 1;   // 1 -> -1: the screen turns over
    g.translate(X0 + jx, Y0); g.beginPath(); g.rect(0, 0, gw, gh); g.clip();
    g.imageSmoothingEnabled = false;
    g.save(); if (sq) { g.translate(gw / 2, gh / 2); g.scale(1, f); g.translate(-gw / 2, -gh / 2); }
    g.drawImage(gcv, 0, 0, gw, gh);
    if (!sq && 'filter' in g) { g.save(); g.globalCompositeOperation = 'lighter'; g.filter = 'blur(' + cell * 1.6 + 'px)'; g.drawImage(glcv, 0, 0, gw, gh); g.restore(); }   // the glow of charged sand
    g.restore();
    if (flash) { g.fillStyle = 'rgba(255,255,255,' + flash * .5 + ')'; g.fillRect(0, 0, gw, gh); }
    {                                                                                                 // the mic level always, and the note being heard with how long it has been held
      const fs = 11 * dpr, bw = 90 * dpr, by = gh - 14 * dpr, bx = 8 * dpr, lv = Math.max(0, Math.min(1, (Engine.level + 60) / 50)), n = heard ? heard.n : -1;
      g.font = '700 ' + fs + 'px Silkscreen, ui-monospace, monospace'; g.textAlign = 'left';
      const txt = heard ? NAMES[n] + ' ' + (heard.c >= 0 ? '+' : '') + Math.round(heard.c) : 'MIC';
      g.fillStyle = '#050506'; g.fillText(txt, bx + 1, by - 5 * dpr + 1); g.fillStyle = heard ? css(n) : '#8f9096'; g.fillText(txt, bx, by - 5 * dpr);
      g.fillStyle = '#050506'; g.fillRect(bx - 2, by - 2, bw + 4, 8 * dpr + 4); g.fillStyle = '#26272c'; g.fillRect(bx, by, bw, 8 * dpr);
      g.fillStyle = heard ? css(n) : '#4a5575'; g.fillRect(bx, by, bw * (heard && ml ? Math.min(1, ml.t / LOCK_S) : lv), 8 * dpr);      // the bar is the lock-in while a note is held, the mic level otherwise
    }
    if (banner) {                                                                                     // announcements stay inside the screen
      const a = banner.t > 1.5 ? 1 - (banner.t - 1.5) / .5 : 1, k = (.6 + .4 * Math.min(1, banner.t / .2)) * dpr, fs = Math.min(26, gw / dpr / 14);
      g.globalAlpha = Math.max(0, a); g.translate(gw / 2, Math.min(gh * .3, 90 * dpr) - banner.t * 6); g.scale(k, k); g.textAlign = 'center';
      g.font = '700 ' + fs + 'px Silkscreen, ui-monospace, monospace'; g.fillStyle = '#050506'; g.fillText(banner.text, 2, 2); g.fillStyle = banner.warn ? '#ff6a4a' : banner.cyan ? '#5fe0ff' : 'hsl(' + (now / 4) % 360 + ' 95% 65%)'; g.fillText(banner.text, 0, 0);
      g.font = '700 ' + fs * .42 + 'px Silkscreen, ui-monospace, monospace'; g.fillStyle = '#050506'; g.fillText(banner.sub, 1, fs * .95); g.fillStyle = '#9fd8ff'; g.fillText(banner.sub, 0, fs * .92);
    }
    g.restore();
  }

  /* ---- saving: runs of equal cells are stored once (a cell is its material, note, vividness and glow), so layered sand stays small ---- */
  function encode() {
    const out = []; let prev = -1, run = 0;
    for (let i = 0; i < CAP; i++) {
      const v = T[i] ? T[i] | N[i] << 3 | ((V[i] >> 2) & 3) << 7 | (V[i] & GLOW ? 1 : 0) << 9 : 0;
      if (v === prev) run++; else { if (run) out.push(prev, run); prev = v; run = 1; }
    }
    out.push(prev, run); return out.join(',');
  }
  function decode(str) {
    T.fill(0); N.fill(0); V.fill(0); P.fill(0); const a = str.split(',').map(Number); let i = 0;
    for (let k = 0; k + 1 < a.length && i < CAP; k += 2) { const v = a[k], run = a[k + 1]; for (let r = 0; r < run && i < CAP; r++, i++) if (v) { P[i] = (Math.random() * 256) | 0; T[i] = v & 7; N[i] = (v >> 3) & 15; V[i] = ((v >> 7) & 3) * 4 + ((Math.random() * 4) | 0) + ((v >> 9) & 1 ? GLOW : 0); } }
  }
  function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ d: encode(), s: sung.slice(-80), u: inv ? 1 : 0 })); } catch (e) {} }
  function load() { try { const o = JSON.parse(localStorage.getItem(SAVE_KEY)); if (o && o.d) { decode(o.d); sung = o.s || []; inv = !!o.u; } } catch (e) {} }
  load();

  /* ---- Motion: shaking the phone shakes the pane, turning it upside down turns the pane over, and tilting it leans the sand. Needs a phone with motion sensors;
     iPhones ask for permission, and only on a tap, so this starts from the Motion button. ---- */
  const MOTION_KEY = 'tunerite.sandmotion', G = 9.81, ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  let mot = { on: false, inv: false, t: 0, shakeAt: 0, turnAt: 0, seen: false };
  /* Gravity up or down on the screen. The grains live in the "gravity down" frame the physics is written for; while gravity is up the picture is that frame mirrored top to bottom.
     Switching mirrors the grains and the picture together, so nothing on the screen moves at that moment: the sand just starts to fall the other way. */
  function setGravity(up) { if (up === inv) return; rotate(); inv = up; fl = 1; dirty = true; for (const p of pours) p.left = Math.min(p.left, 40); }
  function onMotion(e) {
    const a = e.accelerationIncludingGravity; if (!a || a.x == null) return;
    mot.seen = true; const now = performance.now(), k = ios ? -1 : 1;                              // iPhones report the opposite sign
    const ax = a.x * k, ay = a.y * k, az = (a.z || 0) * k, ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
    const sx = ang === 90 ? -ay : ang === 180 || ang === -180 ? -ax : ang === 270 || ang === -90 ? ay : ax, sy = ang === 90 ? ax : ang === 180 || ang === -180 ? -ay : ang === 270 || ang === -90 ? -ax : ay;   // gravity's pull as seen on the screen: x to the right, y up
    const lin = e.acceleration && e.acceleration.x != null ? Math.hypot(e.acceleration.x, e.acceleration.y, e.acceleration.z) : Math.abs(Math.hypot(ax, ay, az) - G);
    if (lin > 14 && now - mot.shakeAt > 1200) { mot.shakeAt = now; shk = 1; }                       // a sharp spike of acceleration is a shake
    const gm = Math.hypot(sx, sy, az) || G, up = sy / gm;                                           // up: 1 when the screen is upright, -1 when it is upside down
    if (!mot.inv && up < -.7 && now - mot.turnAt > 1200) { mot.inv = true; mot.turnAt = now; setGravity(true); }          // the phone itself is being turned: the picture stays where it is and gravity points up on the screen
    else if (mot.inv && up > .7 && now - mot.turnAt > 1200) { mot.inv = false; mot.turnAt = now; setGravity(false); }   // turned back: gravity points down again
    const L = Math.max(-1, Math.min(1, -sx / gm)); lean = Math.abs(L) < .06 || Math.abs(up) < .3 ? 0 : Math.max(-1.2, Math.min(1.2, L / Math.sqrt(Math.max(.02, 1 - L * L))));   // a flat phone does not lean the sand
  }
  async function motionOn() {
    if (mot.on) { mot.on = false; lean = 0; removeEventListener('devicemotion', onMotion); try { localStorage.removeItem(MOTION_KEY); } catch (e) {} paintMotion(); return; }
    try { if (typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission === 'function' && await DeviceMotionEvent.requestPermission() !== 'granted') { banner = { t: 0, text: 'MOTION BLOCKED', sub: 'ALLOW IT IN THE BROWSER', warn: true }; return; } } catch (e) { banner = { t: 0, text: 'MOTION BLOCKED', sub: 'OPEN THE PAGE OVER HTTPS', warn: true }; return; }
    mot = { on: true, inv: false, t: 0, shakeAt: 0, turnAt: 0, seen: false }; addEventListener('devicemotion', onMotion); paintMotion();
    try { localStorage.setItem(MOTION_KEY, '1'); } catch (e) {}
    setTimeout(() => { if (mot.on && !mot.seen) { mot.on = false; removeEventListener('devicemotion', onMotion); banner = { t: 0, text: 'NO MOTION SENSOR', sub: 'TRY A PHONE', warn: true }; paintMotion(); } }, 1500);
  }
  function paintMotion() { const b = $('#sandCtl [data-s="motion"]'); if (b) b.setAttribute('aria-pressed', mot.on); }
  try { if (localStorage.getItem(MOTION_KEY) && typeof DeviceMotionEvent !== 'undefined' && typeof DeviceMotionEvent.requestPermission !== 'function') setTimeout(motionOn, 0); } catch (e) {}   // where no permission is needed, it comes back on by itself

  return {
    draw, pour, hires: () => true,
    turn() { if (!flip) flip = { t: 0, done: false }; },
    motion: motionOn,
    /* what the motion sensors are doing, and how the sand is spread left to right (the share of grains in the right half) */
    motionState() { let r = 0, a = 0, tp = 0; for (let y = TOP; y < GHM; y++) for (let x = 0; x < GW; x++) if (T[idx(x, y)]) { a++; if (x >= GW / 2) r++; if (inv ? y >= (TOP + GHM) / 2 : y < (TOP + GHM) / 2) tp++; } return { on: mot.on, lean, inverted: mot.inv, shaking: shk > 0, turning: !!flip, squashed: !!flip, gravityUp: inv, top: a ? tp / a : 0, right: a ? r / a : .5 }; },
    shake() { shk = 1; },
    clear() { inv = false; T.fill(0); N.fill(0); V.fill(0); P.fill(0); streak = 0; sung = []; fl = 0; rep = 0; lastN = null; pours.length = 0; ml = null; dirty = true; },
    count: () => filled, water: () => water,
    /* how many grains are in mid-air, and how far apart sideways they are (standard deviation, in cells) */
    airborne() { let n = 0, s = 0, q = 0; for (let y = TOP; y < GHM - 1; y++) for (let x = 0; x < GW; x++) { const i = idx(x, y); if (T[i] && !T[i + SW]) { n++; s += x; q += x * x; } } return { n, sd: n ? Math.sqrt(Math.max(0, q / n - (s / n) * (s / n))) : 0 }; }, save, MAT, NAMES
  };
})();
$$('#sandCtl [data-s]').forEach(b => b.onclick = () => Sand[b.dataset.s]());
