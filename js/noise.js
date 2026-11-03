"use strict";
/* Learns the steady tones in a quiet room (fans, power hum, a monitor whine) and has the microphone path cut them with notch filters.
   Listening takes a few seconds of the raw microphone; a tone counts only if it is clearly above its surroundings in most of the frames. */
const Noise = {
  learning: false,
  /* frames: arrays of dB per bin. Returns the frequencies of the steady spikes, strongest first. */
  find(frames, binHz, o) {
    o = Object.assign({ fmin: 40, fmax: 5000, lift: 6, floor: -125, max: 8, win: 50 }, o);
    const n = frames[0].length, k0 = Math.max(3, Math.floor(o.fmin / binHz)), k1 = Math.min(n - 4, Math.ceil(o.fmax / binHz)), q = new Float32Array(n);
    const col = new Float32Array(frames.length);
    for (let k = k0 - o.win; k <= k1 + o.win; k++) { if (k < 0 || k >= n) continue; for (let i = 0; i < frames.length; i++) col[i] = frames[i][k]; const s = Array.from(col).sort((a, b) => a - b); q[k] = s[Math.floor(s.length * 0.3)]; }      // the 30th percentile: a tone that is there most of the time
    const out = [];
    for (let k = k0; k <= k1; k++) {
      if (!(q[k] > o.floor && q[k] >= q[k - 1] && q[k] > q[k + 1])) continue;
      const side = []; for (let j = k - o.win; j <= k + o.win; j++) if (Math.abs(j - k) > 4 && j >= 0 && j < n) side.push(q[j]);
      side.sort((a, b) => a - b); const base = side[Math.floor(side.length / 2)], lift = q[k] - base; if (lift < o.lift) continue;
      const a = q[k - 1], b = q[k], c = q[k + 1], d = a - 2 * b + c, off = d ? clamp(0.5 * (a - c) / d, -0.5, 0.5) : 0;      // where the peak really sits between two bins
      let l = k, r = k; while (l > 1 && q[l - 1] >= q[k] - 6 && k - l < 12) l--; while (r < n - 2 && q[r + 1] >= q[k] - 6 && r - k < 12) r++;      // how wide the spike is, 6 dB down: a wandering fan is wider than a power hum
      out.push({ hz: (k + off) * binHz, bw: Math.max(8, Math.min(30, (r - l + 1) * binHz * 1.4)), lift });
    }
    out.sort((a, b) => b.lift - a.lift); const keep = [];
    out.forEach(p => { if (keep.length < o.max && keep.every(x => Math.abs(x.hz - p.hz) > Math.max(6, p.hz * 0.02))) keep.push(p); });
    return keep.map(p => ({ hz: Math.round(p.hz * 10) / 10, bw: Math.round(p.bw) }));
  },
  async learn(ms, src) {
    if (this.learning) return; const c = Engine.ctx, mic = src || Engine.mic;
    if (!c || !mic) return toast('Turn the microphone on first.', 2500);
    this.learning = true; this.paint(); toast('Listening to the room for ' + Math.round((ms || 3000) / 1000) + ' seconds. Please keep quiet.', 3200);
    const an = c.createAnalyser(); an.fftSize = 8192; an.smoothingTimeConstant = 0; mic.connect(an);       // straight from the microphone, so tones already cut still show
    const frames = [], t0 = performance.now(); while (performance.now() - t0 < (ms || 3000)) { const f = new Float32Array(an.frequencyBinCount); an.getFloatFrequencyData(f); for (let i = 0; i < f.length; i++) if (!isFinite(f[i])) f[i] = -140; frames.push(f); await new Promise(r => setTimeout(r, 60)); }
    try { mic.disconnect(an); } catch (e) { /* gone */ }
    const bin = c.sampleRate / an.fftSize; let hz = this.find(frames, bin); if (!hz.length) hz = this.find(frames, bin, { lift: 3.5 });      // nothing clear: look again, more closely
    const S = Store.data.settings; this.learning = false; S.noise = hz; S.noiseOn = hz.length > 0; Store.save(); Engine.buildNoise(); this.paint();
    toast(hz.length ? 'Cut ' + hz.length + ' steady tone' + (hz.length > 1 ? 's' : '') + ': ' + this.names(hz) : 'No steady tones found. The room is already quiet.', 5000);
    return hz;
  },
  names(hz) { return hz.map(h => Math.round(h.hz) + ' Hz (' + noteName(Math.round(freqToMidi(h.hz, Store.data.settings.a4))) + ')').join(', '); },
  toggle() { const S = Store.data.settings; if (S.noiseOn) { S.noiseOn = false; Store.save(); Engine.buildNoise(); this.paint(); toast('Noise filter off.', 1200); } else if ((S.noise || []).length) { S.noiseOn = true; Store.save(); Engine.buildNoise(); this.paint(); toast('Noise filter on: ' + this.names(S.noise), 3000); } else this.learn(); },
  paint() {
    const b = $('#noiseBtn'); if (!b) return; const S = Store.data.settings, n = (S.noise || []).length;
    b.setAttribute('aria-pressed', !!S.noiseOn); b.classList.toggle('learn', this.learning);
    b.title = 'Noise filter: ' + (S.noiseOn ? 'on, cutting ' + n + ' tone' + (n > 1 ? 's' : '') + '. Click to turn off.' : n ? 'off. Click to turn on.' : 'listens to a quiet room for 3 seconds and cuts the steady tones in it, like fans and hums.') + ' Hold to listen again.';
  }
};
