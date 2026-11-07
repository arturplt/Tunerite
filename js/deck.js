"use strict";
/* ---- Device frame: top bar (volume, key mode, mic light) and the six keys. NAV mode: the keys switch tabs. FUNC mode: the same keys run jobs for the current tab, each labelled on its own LCD. The casing stays put whether the phone is held upright or sideways; only the screen inside turns. ---- */
const Deck = {
  mode: 'nav',
  tabs: [['tuner', 'TUNER', 'Tuner'], ['piano', 'PIANO', 'Piano'], ['train', 'DRILL', 'Practice'], ['seq', 'COMP', 'Compose'], ['progress', 'STATS', 'Progress'], ['settings', 'SETUP', 'Settings']],
  /* symbols for the keys when the screen is too short for words (landscape) */
  icons: {
    tuner: '<path d="M3 17a9 9 0 0 1 18 0"/><path d="M12 17l4-7"/><path d="M3 20h18"/>',
    piano: '<rect x="3" y="5" width="18" height="14"/><path d="M9 5v14M15 5v14"/><path d="M7.5 5v7M13 5v7M18.5 5v7" stroke-width="3"/>',
    train: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><path d="M12 12h.01" stroke-width="3"/>',
    seq: '<path d="M4 7h10M4 12h16M4 17h7"/><path d="M17 6v4M14 17v-3"/>',
    progress: '<path d="M3 20h18"/><path d="M5 16l5-5 3 3 6-8"/><path d="M15 6h4v4"/>',
    settings: '<path d="M4 7h16M4 12h16M4 17h16"/><path d="M9 5v4M15 10v4M8 15v4" stroke-width="3"/>'
  },
  st: () => Store.data.settings,
  /* a function key: top label, bottom text (or fn), lamp state (or fn), action */
  fnKeys(tab) {
    const st = this.st(), theme = { top: 'THEME', bot: () => Themes.get(st.theme).name.slice(0, 6).toUpperCase(), act: () => this.click('#setTheme [data-v="' + Themes.step(st.theme) + '"]') };
    const full = { top: 'FULL', bot: () => document.fullscreenElement ? 'ON' : 'OFF', on: () => !!document.fullscreenElement, act: () => this.click('#btnFs') };
    const inst = { top: 'SOUND', bot: () => ({ voice: 'VOICE', piano: 'PIANO', whistle: 'WHISTL' })[st.inst] || '', act: () => setInst({ voice: 'piano', piano: 'whistle', whistle: 'voice' }[st.inst] || 'voice') };
    const a4 = d => ({ top: 'A4', bot: () => (d < 0 ? '-' : '+') + ' ' + st.a4, act: () => { st.a4 = Math.max(415, Math.min(466, st.a4 + d)); Store.save(); Engine.applySettings(); UI.refresh(); } });
    const oct = d => ({ top: 'KEYS', bot: () => (d < 0 ? '-' : '+') + ' ' + (st.pxOct || 'all'), act: () => { const v = ['2', '3', '4', '5', 'all'], i = Math.max(0, Math.min(4, v.indexOf(String(st.pxOct || 'all')) + d)); st.pxOct = v[i]; Store.save(); Spec.key = null; UI.refresh(); } });
    const btn = (top, sel, bot) => ({ top, bot: () => bot || '', act: () => this.click(sel) });
    const loop = { top: 'LOOP', bot: () => ($('#sqLoop').getAttribute('aria-pressed') === 'true' || $('#sqLoop').classList.contains('on')) ? 'ON' : 'OFF', on: () => $('#sqLoop').getAttribute('aria-pressed') === 'true' || $('#sqLoop').classList.contains('on'), act: () => this.click('#sqLoop') };
    return ({
      tuner: [inst, a4(-1), a4(1), theme, full, null],
      piano: [oct(-1), oct(1), inst, theme, full, null],
      train: [inst, a4(-1), a4(1), theme, full, null],
      seq: [btn('REW', '#sqRew'), btn('PLAY', '#sqPlay'), btn('STOP', '#sqStop'), loop, theme, full],
      progress: [theme, full, null, null, null, null],
      settings: [theme, full, inst, a4(-1), a4(1), null]
    })[tab];
  },
  /* Neighbouring tabs are laid out but hidden, so their look is ready before the slide starts. Nothing in them runs until the tab is really entered (UI.show). */
  warm(extra) {
    const i = this.tabs.findIndex(t => t[0] === UI.screen), want = new Set([i - 1, i + 1, extra].filter(k => k >= 0 && k < this.tabs.length && k !== i).map(k => 's-' + this.tabs[k][0]));
    $$('.screen').forEach(el => el.classList.toggle('dk-warm', want.has(el.id) && !el.classList.contains('on')));
  },
  click(sel) { const el = $(sel); if (el) el.click(); },
  val(v) { return typeof v === 'function' ? v() : v; },
  render() {
    const tab = UI.screen, keys = $$('#nav button'), nav = this.mode === 'nav', fk = nav ? null : this.fnKeys(tab);
    const mb = $('#dkMode'), word = nav ? 'NAV' : 'FUNC', up = !!this.rot.side, key = word + (up ? this.rot.side : ''), cur = mb.querySelector('.w:not(.out)');
    /* sideways, the word is set as separate letters, each turned upright for the person holding the phone; the order flips with the turn so it reads N-A-V downwards */
    const html = up ? [...word].map(c => '<i>' + c + '</i>')[this.rot.side === 'ccw' ? 'reverse' : 'slice']().join('') : word;
    if (!cur) mb.innerHTML = '<span class="w' + (up ? ' v' : '') + '" data-k="' + key + '">' + html + '</span>';
    else if (cur.dataset.k !== key) {
      mb.querySelectorAll('.out').forEach(o => o.remove());
      cur.classList.add('out'); setTimeout(() => cur.remove(), 330);
      const w = document.createElement('span'); w.className = 'w in' + (up ? ' v' : ''); w.dataset.k = key; w.innerHTML = html; mb.appendChild(w);
    }
    if (this.lastUp !== up && this.lastUp !== undefined) { document.body.classList.add('dkflip'); clearTimeout(this.flip); this.flip = setTimeout(() => document.body.classList.remove('dkflip'), 350); }
    this.lastUp = up;
    keys.forEach((b, i) => {
      const t = this.tabs[i];
      if (nav) { b.innerHTML = '<span class="klcd"><svg class="ic" viewBox="0 0 24 24" aria-hidden="true">' + this.icons[t[0]] + '</svg><b>' + t[1] + '</b></span>'; b.classList.remove('off'); b.classList.add('tab'); b.classList.toggle('on', t[0] === tab); b.setAttribute('aria-label', t[2]); b.title = t[2]; return; }
      const f = fk[i]; b.classList.remove('tab');
      b.innerHTML = '<span class="klcd"><b>' + (f ? f.top : '·') + '</b><em>' + (f ? this.val(f.bot) || '' : '') + '</em></span>';
      b.classList.toggle('off', !f); b.classList.toggle('on', !!(f && f.on && f.on())); b.setAttribute('aria-label', f ? f.top : 'Unused'); b.title = f ? f.top : '';
    });
  },
  vol: { set(p) { const st = Deck.st(), v = Math.max(10, Math.min(100, Math.round(p / 5) * 5)) / 100; st.vol = v; const sv = $('#setVol'); if (sv) { sv.value = v; sv.dispatchEvent(new Event('input')); } Deck.paintVol(); } },
  paintVol() {
    const v = Math.round(this.st().vol * 100), e = $('#dkVol');
    e.style.setProperty('--p', (v - 10) / 90); e.setAttribute('aria-valuenow', v);
  },
  micOn() { const s = Engine.stream; return !!(s && s.getAudioTracks().some(t => t.readyState === 'live' && t.enabled)); },
  /* ---- Portrait-locked casing with the screen turned: the screen sits in #dkRot, which turns 90 degrees when the phone is held sideways. Pointer coordinates and element rectangles inside it are reported in the screen's own (turned) space, so the app's touch maths keeps working. ---- */
  rot: { side: null }, win: null, g: { gx: 0, gy: 0, gw: 0, gh: 0 }, drag: false,
  /* the window itself turned (not locked to portrait): the whole app is turned back, so the casing sits where it does in portrait */
  toB(X, Y) { return this.win === 90 ? [innerHeight - Y, X] : this.win === 270 ? [Y, innerWidth - X] : [X, Y]; },
  toV(X, Y) {
    const { gx, gy, gw, gh } = this.g;
    return this.rot.side === 'cw' ? [gx + gh - (Y - gy), gy + X - gx] : [gx + Y - gy, gy + gw - (X - gx)];
  },
  point(X, Y, inHost) { const p = this.toB(X, Y); return inHost && this.rot.side ? this.toV(p[0], p[1]) : p; },
  rectOf(r, inHost) {
    if (!this.win && !(inHost && this.rot.side)) return r;
    const [x1, y1] = this.point(r.left, r.top, inHost), [x2, y2] = this.point(r.right, r.bottom, inHost);
    return new DOMRect(Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1));
  },
  /* the body's own turn is pure CSS (see deck.css), so it is there in the very frame the window turns; this only tracks which way (for the touch maths and the 270 case) */
  applyWin() {
    const ang = (screen.orientation && screen.orientation.angle != null) ? screen.orientation.angle : (window.orientation || 0);
    const win = innerWidth > innerHeight && innerHeight <= 520 ? (ang === 270 || ang === -90 ? 270 : 90) : null;
    document.documentElement.classList.toggle('w270', win === 270);
    if (win === this.win) return false;
    this.win = win; return true;
  },
  sizeRot() {
    const g = $('#dkGlass'), r = this.rectOf(this.nativeRect.call(g), false), rt = $('#dkRot'), s = this.rot.side;
    this.g = { gx: r.left, gy: r.top, gw: r.width, gh: r.height };
    if (!s) { rt.style.width = rt.style.height = rt.style.transform = ''; rt.style.transformOrigin = ''; return; }
    rt.style.width = r.height + 'px'; rt.style.height = r.width + 'px'; rt.style.transformOrigin = '0 0';
    rt.style.transform = s === 'cw' ? 'translateY(' + r.height + 'px) rotate(-90deg)' : 'translateX(' + r.width + 'px) rotate(90deg)';
  },
  setSide(side) {
    this.rot.side = side; document.body.classList.toggle('dkvland', !!side); document.body.classList.toggle('cw', side === 'cw'); document.body.classList.toggle('ccw', side === 'ccw');
    this.sizeRot(); this.render();
  },
  /* The casing never moves. Going sideways the screen slides off to the right and the landscape layout comes in from the left; going back it drops down and the portrait layout comes in from above. instant: the window itself already turned, so there is nothing to slide. */
  async turn(side, instant) {
    if (side === this.rot.side) return;
    if (this.turning) { this.want = side; return; }
    this.turning = true; this.want = undefined;
    const m = $('main'), toLand = !!side, opt = { duration: 340, easing: 'cubic-bezier(.5,0,.2,1)' }, anim = !instant && !matchMedia('(prefers-reduced-motion: reduce)').matches && !document.hidden;
    try {
      if (anim) await m.animate([{ transform: 'none' }, { transform: toLand ? 'translateX(105%)' : 'translateY(105%)' }], { ...opt, fill: 'forwards' }).finished;
      this.setSide(side);
      if (anim) await m.animate([{ transform: toLand ? 'translateX(-105%)' : 'translateY(-105%)' }, { transform: 'none' }], opt).finished;
    } catch (e) { /* an animation was cancelled */ }
    m.getAnimations().forEach(a => a.cancel()); this.turning = false;
    if (this.want !== undefined && this.want !== this.rot.side) this.turn(this.want);
  },
  /* the window turned: set the body's own turn first, then the screen's */
  windowTurned() {
    const changed = this.applyWin();
    if (this.win) this.turn(this.win === 90 ? 'ccw' : 'cw', true); else if (changed) this.turn(null, true);
    this.sizeRot();
  },
  initRot() {
    const host = () => $('#dkRot'), inHost = t => !!(t && t.nodeType === 1 && host().contains(t)), inBody = t => !!(t && t.nodeType === 1 && document.body.contains(t)), self = this;
    this.nativeRect = Element.prototype.getBoundingClientRect; const nr = this.nativeRect;
    Element.prototype.getBoundingClientRect = function () {
      const r = nr.call(this); if (!self.win && !self.rot.side) return r;
      if (this === document.documentElement || !document.body.contains(this)) return r;
      return self.rectOf(r, this !== host() && host().contains(this));
    };
    for (const proto of [MouseEvent.prototype, window.Touch && Touch.prototype].filter(Boolean)) {
      const gx = Object.getOwnPropertyDescriptor(proto, 'clientX').get, gy = Object.getOwnPropertyDescriptor(proto, 'clientY').get;
      const live = e => (self.win || self.rot.side) && (self.drag || inBody(e.target)), host_ = e => self.drag ? self.dragHost : inHost(e.target);
      Object.defineProperty(proto, 'clientX', { configurable: true, get() { const X = gx.call(this); return live(this) ? self.point(X, gy.call(this), host_(this))[0] : X; } });
      Object.defineProperty(proto, 'clientY', { configurable: true, get() { const Y = gy.call(this); return live(this) ? self.point(gx.call(this), Y, host_(this))[1] : Y; } });
    }
    addEventListener('pointerdown', e => { this.drag = true; this.dragHost = inHost(e.target); }, true);
    addEventListener('pointerup', () => { this.drag = false; }, true); addEventListener('pointercancel', () => { this.drag = false; }, true);
    new ResizeObserver(() => this.sizeRot()).observe($('#dkGlass'));
    addEventListener('resize', () => this.windowTurned()); addEventListener('orientationchange', () => setTimeout(() => this.windowTurned(), 120));
    this.windowTurned();
    /* locked to portrait (installed app or full screen): the window never turns, so gravity in the device's own axes says which way the phone is held */
    const lock = () => { try { screen.orientation.lock('portrait').catch(() => {}); } catch (e) { /* only some browsers allow it */ } };
    lock(); addEventListener('pointerdown', lock, { once: true });      // some phones only allow it from a tap, and only installed or in full screen
    let t = 0;
    addEventListener('devicemotion', e => {
      if (this.win) return;
      const a = e.accelerationIncludingGravity; if (!a || a.x == null || a.y == null) return;
      let want = this.want !== undefined ? this.want : this.rot.side;
      if (Math.abs(a.y) > 6.8) want = null;
      else if (Math.abs(a.x) > 6.8 && Math.abs(a.x) > Math.abs(a.y) + 2) want = a.x > 0 ? 'ccw' : 'cw';
      clearTimeout(t); if (want !== this.rot.side) t = setTimeout(() => this.turn(want), 350);
    });
  },
  init() {
    const glass = document.createElement('div'), rt = document.createElement('div'), mn = $('main'); glass.id = 'dkGlass'; rt.id = 'dkRot';
    mn.before(glass); glass.appendChild(rt); rt.appendChild(mn);
    const top = document.createElement('div'); top.id = 'dkTop';
    top.innerHTML = '<span>TUNERITE</span><button id="dkMode" type="button" aria-label="Key mode"></button><i id="dkHole" aria-hidden="true"></i><div id="dkVolW"><span id="dkVolL">VOL</span><div id="dkVol" role="slider" tabindex="0" aria-label="Volume" aria-valuemin="10" aria-valuemax="100">' +
      [9, 30, 50, 70, 91].map(x => '<i class="dot" style="left:' + x + '%"></i>').join('') + '<u></u></div></div>';
    const mic = document.createElement('i'); mic.id = 'dkMic'; mic.title = 'Microphone on';
    document.body.prepend(mic); document.body.insertBefore(top, glass);
    $('#dkMode').onclick = () => { this.mode = this.mode === 'nav' ? 'func' : 'nav'; this.render(); };
    const vol = $('#dkVol'), from = (x, y) => { const r = vol.getBoundingClientRect(); return 10 + (x - r.left) / r.width * 90; };
    vol.onpointerdown = e => { vol.setPointerCapture(e.pointerId); this.vol.set(from(e.clientX, e.clientY)); };
    vol.onpointermove = e => { if (vol.hasPointerCapture(e.pointerId)) this.vol.set(from(e.clientX, e.clientY)); };
    vol.onpointerup = vol.onpointercancel = () => Store.save();
    vol.onkeydown = e => { const d = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5 }[e.key]; if (d) { this.vol.set(this.st().vol * 100 + d); Store.save(); e.preventDefault(); } };
    /* in FUNC mode a key runs its job instead of switching tab */
    $('#nav').addEventListener('click', e => {
      if (this.mode !== 'func') return;
      const b = e.target.closest('button'); if (!b) return;
      e.stopPropagation(); e.stopImmediatePropagation();
      const f = this.fnKeys(UI.screen)[$$('#nav button').indexOf(b)]; if (f) { f.act(); setTimeout(() => this.render(), 60); }
    }, true);
    const show = UI.show.bind(UI), still = matchMedia('(prefers-reduced-motion: reduce)');
    /* between tabs: a carousel. Both screens stay fully visible and travel together, the old one off the glass and the new one on, from the side the tab key is on */
    UI.show = n => {
      const from = UI.screen, old = document.querySelector('.screen.on'), cur = document.getElementById('s-' + n);
      this.run && this.run.forEach(a => a.finish());
      show(n); this.render(); this.warm();
      if (!old || !cur || old === cur || still.matches) return;
      const idx = s => this.tabs.findIndex(t => t[0] === s), d = idx(n) >= idx(from) ? 1 : -1, ax = 'X', opt = { duration: 600, easing: 'cubic-bezier(.65,0,.25,1)', fill: 'both' };
      old.classList.add('dk-leave'); cur.classList.add('dk-enter');
      const ao = old.animate([{ transform: 'none' }, { transform: 'translate' + ax + '(' + -100 * d + '%)' }], opt),
        an = cur.animate([{ transform: 'translate' + ax + '(' + 100 * d + '%)' }, { transform: 'none' }], opt);
      this.run = [ao, an];
      an.onfinish = () => { [ao, an].forEach(x => x.cancel()); old.classList.remove('dk-leave'); cur.classList.remove('dk-enter'); this.run = null; };
    };
    setInterval(() => { $('#dkMic').classList.toggle('on', this.micOn()); this.paintVol(); if (this.mode === 'func') this.render(); }, 500);
    $('#nav').addEventListener('pointerdown', e => { const b = e.target.closest('button'); if (b && this.mode === 'nav') this.warm($$('#nav button').indexOf(b)); });
    this.paintVol(); this.render(); this.warm(); this.initRot();
  }
};
Deck.init();
