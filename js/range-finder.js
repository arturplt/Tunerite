"use strict";
/* ---- Range finder ---- */
const RangeFinder = {
  active: false, step: 0, buf: [], best: [null, null], whistle: false,
  open(whistle) {
    if (whistle != null) this.whistle = !!whistle;
    this.active = true; this.step = 0; this.best = [null, null]; this.buf = [];
    $('#o-range').classList.add('on'); this.render();
  },
  close() { this.active = false; $('#o-range').classList.remove('on'); },
  render() {
    const v = this.whistle ? 'whistle' : 'sing';
    $('#rgStep').textContent = this.step === 0 ? 'Step 1 of 2: ' + v + ' down to your LOWEST comfortable note and hold it.' : 'Step 2 of 2: now ' + v + ' up to your HIGHEST comfortable note and hold it.';
    const b = this.best[this.step];
    $('#rgBest').textContent = b == null ? 'Nothing captured yet' : (this.step === 0 ? 'Lowest so far: ' : 'Highest so far: ') + noteName(b);
    $('#rgNext').disabled = b == null; $('#rgNext').textContent = this.step === 0 ? 'Next' : 'Done';
  },
  onFrame(fr) {
    if (!this.active) return;
    if (fr.midi == null) { this.buf = []; return; }
    this.buf.push(fr.midi); if (this.buf.length > 25) this.buf.shift();
    $('#rgNote').textContent = noteName(fr.midi);
    if (this.buf.length === 25 && Math.max.apply(null, this.buf) - Math.min.apply(null, this.buf) < 1) {
      const c = Math.round(median(this.buf)), b = this.best[this.step];
      if (b == null || (this.step === 0 ? c < b : c > b)) { this.best[this.step] = c; this.render(); }
    }
  },
  next() {
    if (this.step === 0) { this.step = 1; this.buf = []; this.render(); return; }
    const lo = this.best[0], hi = this.best[1];
    if (hi - lo < 7) { toast('That range looks very narrow. Let\'s try again.'); this.open(); return; }
    if (this.whistle) Store.data.rangeWhistle = { lo, hi }; else { Store.data.range = { lo, hi }; Store.data.rangeLog.push({ ts: Date.now(), lo, hi }); }
    Store.save();
    this.close(); toast('Range saved: ' + noteName(lo) + '–' + noteName(hi)); UI.refresh();
  }
};
const getRange = () => Store.data.settings.inst === 'whistle' ? Store.data.rangeWhistle || { lo: 72, hi: 96 } : Store.data.range || { lo: 48, hi: 72 };

