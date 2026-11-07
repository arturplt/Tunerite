"use strict";
/* ---- The Piano tab's layout. The spectrogram and keyboard fill the left; the right has the sound selectors, a strip of page keys, one page of knob panels at a time, and Bypass / Panic / Reset beside the NOW screen.
   Only placement changes: every panel keeps its own id and handlers, so the knobs, the envelope and the display behave as before. On a phone the same parts stack in one column (css/piano.css). ---- */
const PianoUI = {
  PAGES: [['sound', 'Sound'], ['filter', 'Filter'], ['space', 'Space'], ['dyn', 'Dyn'], ['arp', 'Arp'], ['env', 'Env'], ['view', 'View']],
  page: 'sound',
  init() {
    const fx = $('#pnFx'); if (!fx || fx.querySelector('.pnright')) return;
    const mk = cls => { const e = document.createElement('div'); e.className = cls; return e; };
    const head = fx.querySelector(':scope > .synhead'), area = fx.querySelector(':scope > .synknobarea'), right = mk('pnright'), tabs = mk('pntabs'), pages = mk('pnpages'), bot = mk('pnbot');
    const tag = (el, pg) => { if (el) el.dataset.pg = pg; };
    ['.mod-mod', '.mod-tone'].forEach(s => tag(area.querySelector(s), 'sound')); tag($('#pnVoice'), 'sound');
    ['.lowflt', '.lowfilt'].forEach(s => tag(area.querySelector(s), 'filter'));
    tag($('#pnRev'), 'space'); tag($('#pnEcho'), 'space');
    ['.lowdyn', '.lowpitch'].forEach(s => tag(area.querySelector(s), 'dyn')); tag($('#pnPlay'), 'dyn');
    tag($('#pnArp'), 'arp'); tag($('#pnEnv'), 'env'); tag($('#pnDisplay'), 'view');
    pages.append(area, $('#pnRev'), $('#pnVoice'), $('#pnEcho'), $('#pnPlay'), $('#pnArp'), $('#pnEnv'), $('#pnDisplay'));
    this.byp = area.querySelector('.synbyp'); this.bot = bot; this.cells = [...this.byp.querySelectorAll('.bypcell')]; this.tabs = tabs; bot.append(this.byp); const now = fx.querySelector('.synnow'); if (now) now.hidden = true;      // the played notes are drawn on the graph itself; the element stays so its text can still be set
    tabs.setAttribute('role', 'tablist');
    tabs.innerHTML = this.PAGES.map(([id, name]) => '<button type="button" role="tab" data-pg="' + id + '">' + name + '</button>').join('');
    tabs.onclick = e => { const b = e.target.closest('button'); if (b && b.dataset.pg) this.show(b.dataset.pg); };
    // Save, Init and Full screen: wide layout puts the first two on the preset row and the third on the key row; the stacked layout keeps the three together in their own row (see place)
    this.hb = head.querySelector('.synhbtns');
    // Preset, SoundFont and Instrument sit on the spectrogram's LCD, top left
    const row = head.querySelector('.synlcdrow'), spec = fx.querySelector('.synpane[data-p="spec"]'), hud = mk('pnhud');
    if (row && spec) { [...row.children].forEach(c => hud.appendChild(c)); row.remove(); spec.appendChild(hud); }
    // a short buzz on every hardware key, where the phone has a motor
    fx.closest('.screen').addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' && navigator.vibrate && e.target.closest('.synbtn,.bigjack,.pntabs button,.syntabs button,.lcdrow')) { try { navigator.vibrate(8); } catch (x) { /* no motor */ } } });
    right.append(head, tabs, pages, bot); fx.appendChild(right);
    this.pages = pages; this.tabs = tabs; this.show(this.page);
    new MutationObserver(() => Knobs.lightSoon()).observe(pages, { subtree: true, attributes: true, attributeFilter: ['class', 'aria-pressed'] }); Knobs.lightSoon();      // knobs and switches light the page keys and Bypass
    this.fit(); window.addEventListener('resize', () => this.fit());
  },
  /* The LCD text and boxes are sized in "device pixels" (--dp), which makes them tiny on a high-density phone. In the stacked layout --dp is raised for this screen to a whole number of device
     pixels that comes to about a CSS pixel (more on wider screens), so the readouts are as big as the Tuner's; in the wide layout it is left alone. */
  place(narrow) {
    if (this.narrow === narrow || !this.hb) return; this.narrow = narrow;
    const b = id => this.hb.querySelector(id);
    const jack = this.cells.map(c => c.querySelector('button'));      // Bypass, Panic, Reset
    this.cells.forEach((c, i) => { if (jack[i].parentNode !== c) c.insertBefore(jack[i], c.firstChild); });
    if (narrow) { if (this.byp) this.hb.appendChild(this.byp); }
    else {
      /* wide: Panic and Reset follow Full screen on the button row, and Bypass leads the page keys (Init already has a power icon, so Bypass sits with the effects) */
      this.hb.appendChild(jack[1]); this.hb.appendChild(jack[2]); this.tabs.insertBefore(jack[0], this.tabs.firstChild); if (this.byp) this.bot.appendChild(this.byp); }
  },
  fit() {
    const s = $('#s-piano'), narrow = window.matchMedia('(max-width:899px),(max-aspect-ratio:5/4)').matches;
    this.place(narrow);
    if (!narrow) { s.style.removeProperty('--dp'); return; }
    const dpr = window.devicePixelRatio || 1, n = Math.max(1, Math.round(clamp(innerWidth / 390, 0.9, 1.4) * dpr));
    s.style.setProperty('--dp', (n / dpr).toFixed(4) + 'px');
  },
  show(pg) {
    this.page = pg;
    $$('#pnFx [data-pg]').forEach(el => { if (el.parentNode !== this.tabs) el.hidden = el.dataset.pg !== pg; });
    [...this.tabs.children].filter(b => b.dataset.pg).forEach(b => { const on = b.dataset.pg === pg; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
    this.pages.scrollTop = 0;
    if (pg === 'env') requestAnimationFrame(() => Knobs.envDraw());           // its canvas has no size while the page is hidden
  }
};
