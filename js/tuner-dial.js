"use strict";
/* ---- The Tuner screen's analog parts and layout: the cents dial, the VU meter, the chromatic strip, the source slider and the theme switch.
   The screen is laid out at a fixed design size and scaled to fill the window (css/tuner.css); fit() sets the scale, and with it the device-pixel unit --dp
   and the pixel-font sizes --f2/--f4/--f8, so the LCD mesh and type stay on the grid at any size. Colours are CSS variables, so a theme change restyles the SVG. ---- */
const TunerDial = {
  CX: 300, CY: 392, CR: 300, VX: 300, VY: 312, VR: 270,
  VT: [[-20, -50], [-10, -28], [-5, -8], [0, 24], [3, 50]],     // VU scale: dB -> needle angle, piecewise
  c: { x: 0, v: 0, k: 150, d: 15 }, u: { x: -50, v: 0, k: 85, d: 11 },   // spring-driven needles: angle, speed, stiffness, damping
  last: 0, inst: -1, fw: 0, fh: 0, fd: 0,
  INST: ['voice', 'piano', 'whistle'],
  NAMES: ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'],
  vuAng(db) { const T = this.VT; db = clamp(db, -20, 3); for (let i = 1; i < T.length; i++) if (db <= T[i][0]) return T[i - 1][1] + (T[i][1] - T[i - 1][1]) * (db - T[i - 1][0]) / (T[i][0] - T[i - 1][0]); return 50; },
  pt(cx, cy, a, r) { const t = a * Math.PI / 180; return [cx + r * Math.sin(t), cy - r * Math.cos(t)]; },
  arc(a0, a1, r, cx, cy) { const p = this.pt(cx, cy, a0, r), q = this.pt(cx, cy, a1, r); return 'M' + p[0].toFixed(1) + ' ' + p[1].toFixed(1) + 'A' + r + ' ' + r + ' 0 0 1 ' + q[0].toFixed(1) + ' ' + q[1].toFixed(1); },

  /* The glass: a frame, the face, and over everything the bezel's shadow and two stripes of glare. */
  frame(w, h, id) {
    const face = 'var(--tn-face,var(--face))';
    return '<defs><clipPath id="' + id + '"><rect x="6" y="6" width="' + (w - 12) + '" height="' + (h - 12) + '" rx="10"/></clipPath></defs><rect width="' + w + '" height="' + h + '" fill="var(--tn-edge,#0a0a0c)"/>' +
      '<g clip-path="url(#' + id + ')"><rect x="6" y="6" width="' + (w - 12) + '" height="' + (h - 12) + '" fill="' + face + '"/><path d="M6 ' + (h * 0.62) + ' H' + (w - 6) + ' V' + (h - 6) + ' H6Z" fill="color-mix(in srgb,' + face + ' 91%,#000)"/>';
  },
  glass(w, h) {
    return '<path d="M' + w * 0.62 + ' 6 H' + w * 0.8 + ' L' + w * 0.5 + ' ' + (h - 6) + ' H' + w * 0.32 + 'Z" fill="#fff" opacity=".07"/><path d="M' + w * 0.84 + ' 6 H' + w * 0.88 + ' L' + w * 0.58 + ' ' + (h - 6) + ' H' + w * 0.54 + 'Z" fill="#fff" opacity=".05"/>' +
      '<rect x="6" y="6" width="' + (w - 12) + '" height="20" fill="#000" opacity=".4"/><rect x="6" y="26" width="' + (w - 12) + '" height="4" fill="#000" opacity=".18"/></g>' +
      '<rect x="6" y="6" width="' + (w - 12) + '" height="' + (h - 12) + '" rx="10" fill="none" stroke="var(--tn-edge,#0a0a0c)" stroke-width="3"/>';
  },
  build() {
    const { CX, CY, CR, VX, VY, VR } = this, f = n => n.toFixed(1), ink = 'var(--tn-ink,#241f1a)', hot = 'var(--tn-hot,#9a2a18)', arcc = 'var(--tn-arc,#a9a49b)', tip = 'var(--tn-tip,#c0321c)';
    const sh = 'var(--tn-shield,#2b2620)', sh2 = 'var(--tn-shield2,#5a5248)', ndl = 'var(--tn-needle,#1a1714)', txt = 'font-family="Silkscreen,monospace"';
    // cents dial: coloured bands, ticks every 2 cents, numbers every 10, flat and sharp signs
    let s = this.frame(600, 300, 'tnWinC');
    s += '<path d="' + this.arc(-45, -9, 322, CX, CY) + '" stroke="var(--tn-zone,#b8321f)" stroke-width="10" fill="none"/><path d="' + this.arc(9, 45, 322, CX, CY) + '" stroke="var(--tn-zone,#b8321f)" stroke-width="10" fill="none"/>' +
      '<path d="' + this.arc(-9, 9, 322, CX, CY) + '" stroke="var(--tn-zone2,#2f7d4a)" stroke-width="10" fill="none"/><path d="' + this.arc(-45, 45, CR - 10, CX, CY) + '" stroke="' + arcc + '" stroke-width="2.5" fill="none"/>';
    for (let c = -50; c <= 50; c += 2) { const a = c * 0.9, big = c % 10 === 0, p = this.pt(CX, CY, a, CR - 10), q = this.pt(CX, CY, a, CR - (big ? 36 : 22)); s += '<line x1="' + f(p[0]) + '" y1="' + f(p[1]) + '" x2="' + f(q[0]) + '" y2="' + f(q[1]) + '" stroke="' + ink + '" stroke-width="' + (big ? 4 : 2) + '" stroke-linecap="round"/>'; }
    for (let c = -50; c <= 50; c += 10) { const p = this.pt(CX, CY, c * 0.9, CR - 62); s += '<text x="' + f(p[0]) + '" y="' + f(p[1] + 7) + '" text-anchor="middle" ' + txt + ' font-size="' + (c ? 14 : 18) + '" font-weight="700" fill="' + (Math.abs(c) >= 40 ? hot : ink) + '">' + (c > 0 ? '+' + c : c < 0 ? '−' + -c : '0') + '</text>'; }
    s += '<text x="76" y="244" font-family="Georgia,serif" font-size="46" fill="' + ink + '" text-anchor="middle">♭</text><text x="524" y="244" font-family="Georgia,serif" font-size="46" fill="' + ink + '" text-anchor="middle">♯</text>' +
      '<text x="300" y="196" text-anchor="middle" ' + txt + ' font-size="13" letter-spacing="4" fill="' + arcc + '">CENTS</text>' +
      '<g id="tnCSh" style="opacity:var(--tn-shop,.3)"><line x1="' + CX + '" y1="' + CY + '" x2="' + CX + '" y2="' + (CY - CR + 4) + '" stroke="#000" stroke-width="4" stroke-linecap="round"/></g>' +
      '<g id="ppNeedle"><line x1="' + CX + '" y1="' + CY + '" x2="' + CX + '" y2="' + (CY - CR + 4) + '" stroke="' + ndl + '" stroke-width="4" stroke-linecap="round"/><line x1="' + CX + '" y1="' + (CY - CR + 50) + '" x2="' + CX + '" y2="' + (CY - CR + 4) + '" stroke="' + tip + '" stroke-width="4" stroke-linecap="round"/></g>' +
      '<path d="M190 300 V272 Q190 254 208 254 H392 Q410 254 410 272 V300Z" fill="' + sh + '"/><path d="M190 272 Q190 258 208 258 H392 Q410 258 410 272" fill="none" stroke="' + sh2 + '" stroke-width="3"/><rect x="190" y="290" width="220" height="10" fill="var(--tn-edge,#0a0a0c)"/>';
    $('#tnCents').innerHTML = s + this.glass(600, 300);
    // VU meter: mic level, 0 VU at -18 dBFS, red above zero
    let v = this.frame(600, 220, 'tnWinV');
    v += '<path d="' + this.arc(this.vuAng(0), 50, VR + 22, VX, VY) + '" stroke="' + tip + '" stroke-width="12" fill="none"/><path d="' + this.arc(-50, this.vuAng(0), VR + 22, VX, VY) + '" stroke="' + ink + '" stroke-width="2.5" fill="none"/>';
    for (const d of [-20, -15, -10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3]) { const big = [-20, -10, -5, 0, 3].includes(d), a = this.vuAng(d), p = this.pt(VX, VY, a, VR + 14), q = this.pt(VX, VY, a, VR - (big ? 24 : 12));
      v += '<line x1="' + f(p[0]) + '" y1="' + f(p[1]) + '" x2="' + f(q[0]) + '" y2="' + f(q[1]) + '" stroke="' + (d > 0 ? tip : ink) + '" stroke-width="' + (big ? 4 : 2.4) + '" stroke-linecap="round"/>'; }
    for (const d of [-20, -10, -5, 0, 3]) { const p = this.pt(VX, VY, this.vuAng(d), VR - 46); v += '<text x="' + f(p[0]) + '" y="' + f(p[1] + 6) + '" text-anchor="middle" ' + txt + ' font-size="17" font-weight="700" fill="' + (d > 0 ? tip : ink) + '">' + (d > 0 ? '+' + d : d < 0 ? '−' + -d : '0') + '</text>'; }
    v += '<text x="300" y="168" text-anchor="middle" ' + txt + ' font-size="26" font-weight="700" letter-spacing="6" fill="' + ink + '">VU</text><text x="300" y="190" text-anchor="middle" ' + txt + ' font-size="10" letter-spacing="4" fill="' + arcc + '">MIC LEVEL</text>' +
      '<g id="tnVSh" style="opacity:var(--tn-shop,.3)"><line x1="' + VX + '" y1="' + VY + '" x2="' + VX + '" y2="' + (VY - VR + 6) + '" stroke="#000" stroke-width="4" stroke-linecap="round"/></g>' +
      '<g id="tnVN"><line x1="' + VX + '" y1="' + VY + '" x2="' + VX + '" y2="' + (VY - VR + 6) + '" stroke="' + ndl + '" stroke-width="4" stroke-linecap="round"/></g>' +
      '<path d="M230 220 V196 Q230 182 244 182 H356 Q370 182 370 196 V220Z" fill="' + sh + '"/><path d="M230 196 Q230 186 244 186 H356 Q370 186 370 196" fill="none" stroke="' + sh2 + '" stroke-width="3"/>';
    $('#tnVu').innerHTML = v + this.glass(600, 220);
    this.nodes = { cn: $('#ppNeedle'), cs: $('#tnCSh'), vn: $('#tnVN'), vs: $('#tnVSh') };
  },
  /* A needle and the shadow it throws: the light is above, so the shadow is the same needle moved down the face. */
  place(n, sh, a, cx, cy, drop) { n.setAttribute('transform', 'rotate(' + a.toFixed(2) + ' ' + cx + ' ' + cy + ')'); sh.setAttribute('transform', 'translate(' + (a * 0.12).toFixed(2) + ' ' + drop + ') rotate(' + a.toFixed(2) + ' ' + cx + ' ' + cy + ')'); },
  spring(o, target, dt) { o.v += (o.k * (target - o.x) - o.d * o.v) * dt; o.x += o.v * dt; },
  /* Called every frame: cents (-50..50) swings the dial, vu (dB on the VU scale, or null for rest) the level meter. */
  update(cents, vu, now) {
    const dt = Math.min(0.033, Math.max(0.001, (now - (this.last || now)) / 1000)); this.last = now; if (!this.nodes) return;
    this.spring(this.c, clamp(cents, -50, 50) * 0.9, dt); this.spring(this.u, vu == null ? -50 : this.vuAng(vu), dt);
    this.place(this.nodes.cn, this.nodes.cs, this.c.x, this.CX, this.CY, 10); this.place(this.nodes.vn, this.nodes.vs, this.u.x, this.VX, this.VY, 8);
  },

  /* Scale the design to the screen. Portrait windows get the stacked layout. */
  fit(force) {
    const s = $('#s-tuner'), w = s.clientWidth, h = s.clientHeight, dpr = window.devicePixelRatio || 1; if (!w || !h) return;
    if (!force && w === this.fw && h === this.fh && dpr === this.fd) return; this.fw = w; this.fh = h; this.fd = dpr;
    const portrait = w / h < 1, DW = portrait ? 560 : 1280, DH = portrait ? 1380 : 720, sc = Math.min(w / DW, h / DH), st = s.style;
    st.setProperty('--sw', DW + 'px'); st.setProperty('--sh', DH + 'px'); st.setProperty('--s', sc.toFixed(4)); st.setProperty('--dp', (1 / (dpr * sc)).toFixed(4) + 'px');
    for (const p of [2, 4, 8]) { const v = p * sc * dpr, q = v >= 3.5 ? 2 * Math.floor(v / 2) : Math.max(1, Math.round(v)); st.setProperty('--f' + p, (q * 8 / (dpr * sc)).toFixed(3) + 'px'); }
    $('#tnStage').classList.toggle('portrait', portrait);
  },

  /* the source slider follows the setting (it is also changed from Settings and by the "switch?" hint) */
  paintInst(i) {
    if (i === this.inst) return; this.inst = i; const t = $('#tnInst');
    t.style.setProperty('--p', i / 2); t.setAttribute('aria-valuenow', i); t.setAttribute('aria-valuetext', ['Voice', 'Piano', 'Whistle'][i]);
  },
  sharpSvg: '<svg viewBox="0 0 5 5" aria-hidden="true"><path d="M1 0h1v5H1zM3 0h1v5H3zM0 1h5v1H0zM0 3h5v1H0z"/></svg>',
  init() {
    this.build();
    $('#ppOcts').innerHTML = this.NAMES.map(n => '<div' + (n.length > 1 ? ' class="sh"' : '') + '>' + n[0] + (n.length > 1 ? this.sharpSvg : '') + '</div>').join('');
    // source slider: tap or drag, it jumps between the three positions (the labels above work too)
    const tr = $('#tnInst'), pick = e => { const r = tr.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, i = clamp(Math.round((x - 0.1) / 0.4), 0, 2); if (this.INST[i] !== Store.data.settings.inst) setInst(this.INST[i]); };
    let drag = false;
    tr.addEventListener('pointerdown', e => { drag = true; try { tr.setPointerCapture(e.pointerId); } catch (x) { /* a synthetic pointer */ } pick(e); e.preventDefault(); });
    tr.addEventListener('pointermove', e => { if (drag) pick(e); });
    const end = () => { drag = false; }; tr.addEventListener('pointerup', end); tr.addEventListener('pointercancel', end);
    tr.addEventListener('keydown', e => { const d = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 }[e.key]; if (!d) return; e.preventDefault(); const i = clamp(this.INST.indexOf(Store.data.settings.inst) + d, 0, 2); setInst(this.INST[i]); });
    // keys: find my range for the current source, and the reference pitch down and up
    // while the range is being measured on this screen the three keys become Next/Done, Redo and Exit
    const ranging = () => RangeFinder.active && RangeFinder.onTuner;
    $('#tuRange').onclick = () => { if (ranging()) { RangeFinder.next(); return; } const st = Store.data.settings; if (st.inst === 'piano') setInst('voice'); Tuner.rangeShow = null; RangeFinder.open(st.inst === 'whistle', true); };
    const a4 = d => { const st = Store.data.settings; st.a4 = clamp((+st.a4 || 440) + d, 415, 466); Store.save(); Engine.applySettings(); UI.refresh(); Tuner.flash('A4 = ' + st.a4 + ' Hz'); };
    $('#tuDown').onclick = () => { if (ranging()) { RangeFinder.best[RangeFinder.step] = null; RangeFinder.buf = []; RangeFinder.render(); } else a4(-1); };
    $('#tuUp').onclick = () => { if (ranging()) RangeFinder.close(); else a4(1); };
    // theme switch: the same choice as Settings > Display
    const pop = $('#tnThemePop'), btn = $('#tnThemeBtn');
    pop.insertAdjacentHTML('beforeend', Themes.list.map(t => '<button class="tnopt" role="option" type="button" data-id="' + t.id + '"><span class="tnsw">' + t.sw.map(c => '<i style="background:' + c + '"></i>').join('') + '</span><span>' + t.name.toUpperCase() + '<small>' + t.note.toUpperCase() + '</small></span></button>').join(''));
    const open = o => { pop.hidden = !o; btn.setAttribute('aria-expanded', o); };
    btn.onclick = e => { e.stopPropagation(); open(pop.hidden); };
    pop.onclick = e => { e.stopPropagation(); const b = e.target.closest('.tnopt'); if (!b) return; Store.data.settings.theme = b.dataset.id; Store.save(); Themes.apply(b.dataset.id); $('#setTheme').value = b.dataset.id; open(false); };
    document.addEventListener('click', () => open(false)); document.addEventListener('keydown', e => { if (e.key === 'Escape') open(false); });
    window.addEventListener('resize', () => this.fit());
    this.fit(true);
  }
};
