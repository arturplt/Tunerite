"use strict";
/* ---- Beat Hero: the rhythm game, played inside the Practice screen of the Rhythm course (levels in core/rhythm.js unit r8, songs and judging in core/hero.js).
   Notes fall down three lanes toward a line: clap the CLAP notes, sing the SING notes and whistle the WHISTLE notes as they reach it.
   The microphone does the judging: a short loud sound that has no pitch is a clap, a pitch below 600 Hz is the voice and one above it is a whistle.
   Without a microphone, or in a noisy room, the keys Z (or Space) X and C, or a press on a lane, play the three lanes. All times are on the audio clock. ---- */
const Hero = {
  COL: { c: '#ffd23f', s: '#ff4f8b', w: '#3ee0ff' }, KEY: { c: 'Z', s: 'X', w: 'C' }, LOOK: 2.2,
  on: false, lv: null, song: null, notes: [], spb: 0, S: 0, hs: [], bleed: [], keys: {}, lit: { c: 0, s: 0, w: 0 }, pops: [], marks: [], trail: { c: [], s: [], w: [] }, at: null, raf: 0, combo: 0, maxCombo: 0, points: 0, meter: 0.5, fail: false, ended: false,
  floor: 0, prevRms: 0, lastOn: -9, cand: null, lastFt: 0, lastDraw: 0, W: 0, H: 0, dpr: 1, back: true, fn: null, cv: null, g: null, btns: [], held: null, endSec: 0,
  /* ---- the song clock: seconds the player is hearing now (0 is the first beat of the count-in) ---- */
  sec() { return this.at != null ? this.at : Engine.ctx.currentTime - Engine.outLatency() - this.S; },
  secOf(tc) { return tc - (Engine.ctx.baseLatency || 0) - Engine.outLatency() - this.S; },
  stop() { this.hs.forEach(h => { try { h.stop(); } catch (e) { /* already gone */ } }); this.hs = []; },
  /* ---- starting and leaving ---- */
  async open(lv) {
    try { await Engine.start(); } catch (e) { /* the browser may need a tap first */ } if (!Engine.ctx || !Engine.master) return toast('Start the app first (tap Start).', 2500);
    this.stop(); const song = HERO.SONGS[lv.game]; if (!song) return;
    this.lv = lv; this.song = song; this.notes = HERO.build(song).map(n => Object.assign(n, { t: n.b * 60 / song.bpm, len: n.d * 60 / song.bpm, q: null, cov: 0 })); this.spb = 60 / song.bpm;
    this.combo = this.maxCombo = this.points = 0; this.meter = 0.5; this.fail = this.ended = false; this.pops = []; this.marks = []; this.trail = { c: [], s: [], w: [] }; this.keys = {}; this.floor = this.prevRms = 0; this.cand = null; this.lastFt = 0; this.at = null; this.held = null; this.bleed = [];
    this.endSec = HERO.endBeat(song) * this.spb; this.back = Store.data.settings.heroBack !== false;
    this.S = Engine.ctx.currentTime + 0.6; this.schedule();
    $('#o-hero').classList.add('on'); this.on = true; PDev.sync(); this.cv = $('#heroCv'); this.g = this.cv.getContext('2d'); this.size();
    Engine.listeners.add(this.fn); this.raf = requestAnimationFrame(t => this.frame(t));
  },
  /* the count-in and, if it is on, a drum backing; only short unpitched sounds, so the microphone is not fooled for long */
  schedule(from) {
    const spb = this.spb, n = Math.ceil(HERO.endBeat(this.song)), add = (t, f, v, d, bleeds) => { const h = Engine.click(t, f, v, d); if (h) this.hs.push(h); if (bleeds) this.bleed.push(t); };
    for (let b = from || 0; b < n; b++) {
      const t = this.S + b * spb;
      if (b < HERO.LEAD) add(t, b === 0 ? 1300 : 900, 0.22, 0.06, true);
      else if (this.back) { if (b % 2 === 0) add(t, 85, 0.4, 0.16, true); else add(t, 210, 0.16, 0.1, true); add(t, 7000, 0.035, 0.03); add(t + spb / 2, 7000, 0.025, 0.03); }
    }
  },
  close() {
    this.on = false; cancelAnimationFrame(this.raf); this.raf = 0; this.stop(); Engine.listeners.delete(this.fn); $('#o-hero').classList.remove('on');
    PDev.refresh();
  },
  size() { const cv = this.cv; if (!cv) return; this.dpr = Math.min(2, window.devicePixelRatio || 1); this.W = cv.clientWidth || innerWidth; this.H = cv.clientHeight || innerHeight; cv.width = Math.round(this.W * this.dpr); cv.height = Math.round(this.H * this.dpr); },
  /* ---- the microphone ---- */
  heard(fr) {
    if (!this.on || this.ended) return; const r = fr.rms, tc = fr.t + (Engine.half || 0.02), dt = this.lastFt ? clamp(tc - this.lastFt, 0.005, 0.05) : 0.02; this.lastFt = tc;
    const lane = fr.midi != null && fr.f > 0 ? HERO.laneOf(fr.f) : null;
    if (this.cand) { if (lane) this.cand = null; else if (tc - this.cand.tc >= 0.07) { const c = this.cand; this.cand = null; this.clap(c.sec); } }      // a loud start that turned into a pitch was a voice, not a clap
    if (lane) { this.prevRms = r; this.voice(lane, this.secOf(tc), dt); return; }
    const jump = r > Math.max(0.02, this.floor * 3.5) && r > this.prevRms * 2 && tc - this.lastOn > 0.1; this.prevRms = r;
    if (!jump) { this.floor = this.floor ? this.floor * 0.95 + r * 0.05 : r; return; }
    this.lastOn = tc; const lat = Engine.outLatency(); if (this.bleed.some(x => tc >= x + lat - 0.02 && tc <= x + lat + 0.09)) return;      // our own count-in and drums
    this.cand = { tc, sec: this.secOf(fr.t + (Engine.half || 0.02) - 0.01) };
  },
  /* ---- playing a lane ---- */
  clap(sec) {
    this.lit.c = performance.now(); let best = null, bd = 0.2;
    this.notes.forEach(n => { if (n.l === 'c' && n.q == null && Math.abs(n.t - sec) <= bd) { bd = Math.abs(n.t - sec); best = n; } });
    if (best) { const q = HERO.clapQ(sec - best.t); this.resolve(best, q); const ms = Math.round((sec - best.t) * 1000); this.pops[this.pops.length - 1].sub = q >= 1 ? 'ON TIME' : (ms < 0 ? 'EARLY ' : 'LATE ') + Math.abs(ms) + ' MS'; this.marks.push({ l: 'c', t: sec, q }); }
    else this.marks.push({ l: 'c', t: sec, q: -1 });      // a clap with no note near it
  },
  /* sound in a lane for dt seconds, at song time sec: it fills the held note that is under way */
  voice(lane, sec, dt) {
    this.lit[lane] = performance.now(); const tr = this.trail[lane], last = tr[tr.length - 1];
    if (last && sec - last.b < 0.09) last.b = Math.max(last.b, sec + dt); else tr.push({ a: sec - dt, b: sec + dt }); while (tr.length && tr[0].b < sec - 4) tr.shift();
    const n = this.notes.find(x => x.l === lane && x.q == null && sec >= x.t - 0.15 && sec <= x.t + x.len + 0.05);
    if (n) n.cov = Math.min(n.len, n.cov + dt);
  },
  resolve(n, q) {
    n.q = q; const bad = q === 0;
    if (bad) this.combo = 0; else { this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo); this.points += HERO.points(q) * HERO.mult(this.combo); }
    this.meter = clamp(this.meter + (bad ? -0.08 : q >= 1 ? 0.04 : q >= 0.75 ? 0.03 : 0.015), 0, 1); this.pops.push({ l: n.l, w: HERO.word(q), q, t: performance.now() });
    if (this.meter <= 0) this.fail = true;
  },
  /* judge what has gone by, and end the song when it is over */
  update() {
    const sec = this.sec();
    this.notes.forEach(n => { if (n.q != null) return; if (n.l === 'c') { if (sec > n.t + 0.2) this.resolve(n, 0); } else if (sec > n.t + n.len + 0.15) this.resolve(n, HERO.holdQ(n.cov / n.len)); });
    if (!this.ended && (this.fail || sec > this.endSec)) this.finish();
  },
  finish() {
    this.ended = true; const N = this.notes.length, bars = this.song.bars.length, per = [], cnt = [];
    for (let i = 0; i < bars; i++) { per.push(0); cnt.push(0); } this.notes.forEach(n => { cnt[n.bar]++; per[n.bar] += n.q || 0; });
    const acc = this.notes.reduce((a, n) => a + (n.q || 0), 0) / N, pct = Math.round(acc * 100), strip = per.map((v, i) => cnt[i] ? v / cnt[i] : 1), lv = this.lv, pts = this.points, best = this.maxCombo;
    this.close(); Rhy.complete(lv, pct, [['SCORE', String(pct)], ['POINTS', String(pts)], ['BEST COMBO', String(best)]], strip, 'BAR BY BAR');
  },
  /* ---- the keys, and presses on the lanes ---- */
  press(l, down) {
    if (down) { if (l === 'c') this.clap(this.sec()); else this.keys[l] = 1; } else if (l !== 'c') delete this.keys[l];
  },
  laneAt(x, y) { const L = this.geo(), v = L.horiz ? y - L.y0 : x - L.x0, i = Math.floor(v / L.lw); return y >= L.top && i >= 0 && i < 3 ? HERO.LANES[i] : null; },
  key(e, down) {
    if (!this.on || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.code === 'Escape') { if (down) { e.preventDefault(); this.close(); } return; }
    const l = e.code === 'KeyZ' || e.code === 'Space' ? 'c' : e.code === 'KeyX' ? 's' : e.code === 'KeyC' ? 'w' : null; if (!l) return; e.preventDefault(); if (down && e.repeat) return; this.press(l, down);
  },
  /* ---- drawing ---- */
  /* The game sits in the Practice screen and follows its shape: on a wide screen the notes run from the right to a line on the left, one row to a lane; on a tall one they fall to a line near the bottom, one column to a lane. */
  geo() {
    const W = this.W, H = this.H, horiz = W > H * 1.1, sc = clamp(Math.min(W, H) / 430, 0.55, 1.2), top = Math.round(H < 300 ? 30 : 44 * sc + 4), bar = 6;
    if (horiz) { const area = H - top - bar - 8, lw = Math.min(120, area / 3), hx = Math.max(Math.round(104 * sc), Math.round(W * 0.17)); return { W, H, horiz, sc, top, bar, lw, x0: 0, y0: top + bar + Math.round((area - 3 * lw) / 2) + 4, hit: hx, far: W - 12 }; }
    const lw = Math.min(190, W / 3.2); return { W, H, horiz, sc, top, bar, lw, x0: Math.round((W - 3 * lw) / 2), y0: 0, hit: Math.round(H * 0.82), far: top + bar + 6 };
  },
  rr(x, y, w, h, r, fill, stroke) { const g = this.g; g.beginPath(); g.roundRect ? g.roundRect(x, y, w, h, r) : g.rect(x, y, w, h); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 2; g.stroke(); } },
  txt(s, x, y, size, col, al) { const g = this.g; g.font = '700 ' + Math.max(9, Math.round(size)) + 'px Silkscreen, ui-monospace, monospace'; g.textAlign = al || 'center'; g.fillStyle = col; g.fillText(s, x, y); },
  frame(ts) {
    this.raf = 0; if (!this.on) return; if (UI.screen !== 'train') return this.close();
    const dt = this.lastDraw ? Math.min(0.05, (ts - this.lastDraw) / 1000) : 0.016; this.lastDraw = ts;
    if (this.cv.clientWidth !== this.W || this.cv.clientHeight !== this.H) this.size();
    const sec = this.sec(); Object.keys(this.keys).forEach(l => this.voice(l, sec, dt)); this.update(); if (!this.on) return; this.draw(sec); this.raf = requestAnimationFrame(t => this.frame(t));
  },
  draw(sec) {
    const g = this.g, L = this.geo(), { W, H, lw, x0, y0, top, hit, far, horiz, sc, bar } = L, now = performance.now(), pps = (horiz ? far - hit : hit - far) / this.LOOK, f = n => n * sc; g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); this.btns = [];
    const bg = g.createLinearGradient(0, 0, horiz ? W : 0, horiz ? 0 : H); bg.addColorStop(0, '#0b0818'); bg.addColorStop(1, '#1b0f2e'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
    const pulse = Math.max(0, 1 - ((sec / this.spb) % 1) * 3), lane = i => horiz ? { x: 0, y: y0 + i * lw, w: W, h: lw } : { x: x0 + i * lw, y: top + bar, w: lw, h: H - top - bar };
    HERO.LANES.forEach((l, i) => {
      const r = lane(i), on = now - this.lit[l] < 140 || this.keys[l]; g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4); g.fillStyle = this.COL[l] + (on ? '33' : '14'); g.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
      g.fillStyle = this.COL[l] + '55'; if (horiz) { g.fillRect(0, r.y, W, 2); g.fillRect(0, r.y + r.h - 2, W, 2); } else { g.fillRect(r.x, r.y, 2, r.h); g.fillRect(r.x + r.w - 2, r.y, 2, r.h); }
    });
    g.fillStyle = 'rgba(255,255,255,' + (0.02 + 0.05 * pulse) + ')'; if (horiz) g.fillRect(0, y0, W, 3 * lw); else g.fillRect(x0, top + bar, 3 * lw, H - top - bar);
    for (let b = Math.ceil(sec / this.spb); b * this.spb < sec + this.LOOK; b++) {      // a line for every beat, brighter on the first of the bar
      const a = (b * this.spb - sec) * pps; if (a < 0) continue; g.fillStyle = b % 4 === 0 ? 'rgba(255,255,255,.22)' : 'rgba(255,255,255,.07)'; const th = b % 4 === 0 ? 3 : 1;
      if (horiz) g.fillRect(hit + a, y0, th, 3 * lw); else g.fillRect(x0, hit - a - th, 3 * lw, th);
    }
    this.notes.forEach(n => {
      const i = HERO.LANES.indexOf(n.l), r = lane(i), a = (n.t - sec) * pps, long = n.l !== 'c', ln = Math.max(f(26), n.len * pps); if (horiz ? hit + a > W + 4 || hit + a + (long ? ln : 0) < 0 : hit - a - (long ? ln : 0) > H || hit - a < far - 4) return;
      const col = n.q === 0 ? '#6b6577' : this.COL[n.l], pad = f(13);
      let bx, by, bw, bh; if (horiz) { bx = hit + a - (long ? 0 : f(12)); bw = long ? ln : f(24); by = r.y + pad; bh = r.h - 2 * pad; } else { bw = r.w - 2 * pad; bx = r.x + pad; bh = long ? ln : f(24); by = hit - a - (long ? ln : f(12)); }
      if (!horiz && by < far - 4) { bh -= far - 4 - by; by = far - 4; if (bh < 4) return; }
      const ghost = n.q != null && n.q > 0; g.globalAlpha = n.q === 0 ? 0.45 : ghost ? 0.3 : 1; g.shadowColor = col; g.shadowBlur = n.q === 0 || ghost ? 0 : 14; this.rr(bx, by, bw, bh, f(11), col, 'rgba(255,255,255,.6)'); g.shadowBlur = 0; g.globalAlpha = 1;
    });
    // where you actually hit: the sound you made along each lane, and a bar across the lane for every clap, so early and late show against the note
    HERO.LANES.forEach((l, i) => {
      const r = lane(i), c = this.COL[l]; if (l === 'c') return;
      this.trail[l].forEach(q => { const a0 = (q.a - sec) * pps, a1 = (q.b - sec) * pps; if (a1 < -f(40) || a0 > this.LOOK * pps) return; g.fillStyle = 'rgba(255,255,255,.92)'; g.shadowColor = c; g.shadowBlur = 8;
        if (horiz) g.fillRect(hit + a0, r.y + r.h / 2 - f(5), Math.max(2, a1 - a0), f(10)); else g.fillRect(r.x + r.w / 2 - f(5), hit - a1, f(10), Math.max(2, a1 - a0)); g.shadowBlur = 0; });
    });
    this.marks = this.marks.filter(m => m.t > sec - 3); this.marks.forEach(m => {
      const r = lane(0), a = (m.t - sec) * pps, col = m.q < 0 ? '#ff5d5d' : m.q >= 1 ? '#fff' : this.COL.c; g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 8;
      if (horiz) g.fillRect(hit + a - 2, r.y + f(4), 4, r.h - f(8)); else g.fillRect(r.x + f(4), hit - a - 2, r.w - f(8), 4); g.shadowBlur = 0;
    });
    HERO.LANES.forEach((l, i) => {      // the line to hit, and the name of each lane
      const r = lane(i), on = now - this.lit[l] < 140 || this.keys[l], c = this.COL[l];
      if (horiz) { this.rr(hit - f(16), r.y + f(8), f(32), r.h - f(16), f(12), on ? c : 'rgba(0,0,0,.5)', c); this.txt(HERO.NAMES[l], hit - f(28), r.y + r.h / 2 - 2, f(14), c, 'right'); this.txt(this.KEY[l], hit - f(28), r.y + r.h / 2 + f(14), f(11), 'rgba(255,255,255,.4)', 'right'); }
      else { this.rr(r.x + 8, hit - f(16), lw - 16, f(32), f(14), on ? c : 'rgba(0,0,0,.5)', c); this.txt(HERO.NAMES[l], r.x + lw / 2, hit + f(52), Math.min(f(18), lw / 9), c); this.txt(this.KEY[l] + (l === 'c' ? ' / SPACE' : ''), r.x + lw / 2, hit + f(74), f(11), 'rgba(255,255,255,.4)'); }
    });
    this.pops = this.pops.filter(p => now - p.t < 700); this.pops.forEach(p => {
      const k = (now - p.t) / 700, r = lane(HERO.LANES.indexOf(p.l)); g.globalAlpha = 1 - k; const col = p.q >= 1 ? '#fff' : p.q > 0 ? this.COL[p.l] : '#ff5d5d';
      if (horiz) { this.txt(p.w, hit + f(70), r.y + r.h / 2 + 5 - k * f(30), f(18), col); if (p.sub) this.txt(p.sub, hit + f(70), r.y + r.h / 2 + f(20) - k * f(30), f(11), col); } else { this.txt(p.w, r.x + r.w / 2, hit - f(34) - k * f(46), f(18), col); if (p.sub) this.txt(p.sub, r.x + r.w / 2, hit - f(16) - k * f(46), f(11), col); } g.globalAlpha = 1;
    });
    // header: title, score, the buttons, and the rock meter under it
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, W, top); const ty = Math.round(top / 2 + f(6)), bw = Math.round(f(74)), bh = Math.round(top * 0.68), by = Math.round((top - bh) / 2);
    this.txt((this.lv.boss ? 'BOSS · ' : '') + this.song.title.toUpperCase(), W / 2, ty, f(15), this.lv.boss ? '#ff5d5d' : '#fff'); this.txt(String(this.points), 10, ty, f(15), '#ffd23f', 'left');
    this.btn('QUIT ✕', W - bw - 6, by, bw, bh, () => this.close(), f(11)); this.btn(this.back ? 'BEAT ON' : 'BEAT OFF', W - 2 * bw - 12, by, bw, bh, () => { this.back = !this.back; Store.data.settings.heroBack = this.back; Store.save(); this.stop(); this.bleed = []; this.schedule(Math.max(0, Math.ceil((this.sec() + Engine.outLatency()) / this.spb + 0.1))); }, f(11));
    g.fillStyle = 'rgba(0,0,0,.6)'; g.fillRect(0, top, W, bar); g.fillStyle = this.meter > 0.66 ? '#59e36b' : this.meter > 0.33 ? '#ffd23f' : '#ff5d5d'; g.fillRect(0, top, W * this.meter, bar);
    const mult = HERO.mult(this.combo), cy = horiz ? y0 - 6 : top + bar + f(34); if (this.combo >= 3) this.txt(this.combo + ' COMBO  x' + mult, W / 2, horiz ? Math.max(top + bar + 14, cy) : cy, f(16), '#fff');
    if (sec < HERO.LEAD * this.spb) { const b = Math.floor(sec / this.spb); this.txt('GET READY', W / 2, H * 0.34, f(26), '#fff'); if (b >= 0) this.txt(String(HERO.LEAD - b), W / 2, H * 0.52, f(90), '#ffd23f'); this.txt(this.back ? 'HEADPHONES WORK BEST' : 'CLAP · SING · WHISTLE', W / 2, H * 0.6, f(12), 'rgba(255,255,255,.6)'); }
    if (this.fail) this.txt('SONG FAILED', W / 2, H * 0.45, f(38), '#ff5d5d');
  },
  /* the buttons are drawn on the canvas, so each one remembers where it is */
  btn(label, x, y, w, h, fn, size) { this.rr(x, y, w, h, 8, 'rgba(255,255,255,.12)', 'rgba(255,255,255,.4)'); this.txt(label, x + w / 2, y + h / 2 + (size || 12) * 0.4, size || 12, '#fff'); this.btns.push({ x, y, w, h, fn }); },
  init() {
    this.fn = fr => this.heard(fr); document.addEventListener('keydown', e => this.key(e, true)); document.addEventListener('keyup', e => this.key(e, false)); addEventListener('resize', () => this.on && this.size());
    const cv = $('#heroCv'), pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('pointerdown', e => {
      e.preventDefault(); const [x, y] = pos(e), b = this.btns.find(q => x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h); if (b) return b.fn();
      const l = this.laneAt(x, y); if (l) { this.held = [e.pointerId, l]; this.press(l, true); try { cv.setPointerCapture(e.pointerId); } catch (x2) { /* a synthetic pointer */ } }
    });
    const up = e => { if (this.held && this.held[0] === e.pointerId) { this.press(this.held[1], false); this.held = null; } }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  }
};
