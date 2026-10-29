"use strict";
/* ---- MIDI import ---- */
/* Returns {bpm, units:[{name, ch, drums, program, bank, notes:[{midi,start,dur,vel}]}]} with times in seconds. One unit per track and channel. */
function parseMidi(u8) {
  let p = 0;
  const tag = () => String.fromCharCode(u8[p], u8[p + 1], u8[p + 2], u8[p + 3]);
  const r32 = () => { const v = ((u8[p] << 24) | (u8[p + 1] << 16) | (u8[p + 2] << 8) | u8[p + 3]) >>> 0; p += 4; return v; };
  const r16 = () => { const v = (u8[p] << 8) | u8[p + 1]; p += 2; return v; };
  if (u8.length < 14 || tag() !== 'MThd') throw new Error('That does not look like a MIDI file.');
  p = 4; const hl = r32(); r16(); const ntr = r16(), div = r16(); p = 8 + hl;
  if (div & 0x8000 || !div) throw new Error('This MIDI file uses a timing format that is not supported.');
  const tempos = [], raw = [];
  for (let t = 0; t < ntr && p + 8 <= u8.length; t++) {
    const id = tag(); p += 4; const len = r32(), end = Math.min(u8.length, p + len);
    if (id !== 'MTrk') { p = end; continue; }
    const vlq = () => { let v = 0, b; do { b = u8[p++]; v = v * 128 + (b & 0x7f); } while ((b & 0x80) && p < end); return v; };
    let tick = 0, run = 0, name = ''; const open = {}, byCh = {}, prog = {}, bank = {};
    while (p < end) {
      tick += vlq();
      let st = u8[p];
      if (st < 0x80) st = run; else { p++; if (st < 0xf0) run = st; }
      if (st === 0xff) {
        const type = u8[p++], l = vlq();
        if (type === 0x51 && l === 3) tempos.push({ tick, us: (u8[p] << 16) | (u8[p + 1] << 8) | u8[p + 2] });
        if (type === 0x03 && !name) name = String.fromCharCode.apply(null, Array.from(u8.subarray(p, p + l))).replace(/[^\x20-\x7e]/g, '').trim();
        p += l;
      } else if (st === 0xf0 || st === 0xf7) { p += vlq(); }
      else {
        const hi = st & 0xf0, ch = st & 15, c1 = u8[p++], c2 = (hi === 0xc0 || hi === 0xd0) ? 0 : u8[p++];
        const key = ch * 128 + c1;
        if (hi === 0x90 && c2 > 0) (open[key] = open[key] || []).push({ tick, vel: c2 });
        else if (hi === 0x80 || hi === 0x90) {
          const a = open[key];
          if (a && a.length) { const o = a.shift(); (byCh[ch] = byCh[ch] || []).push({ midi: c1, t0: o.tick, t1: tick, vel: o.vel }); }
        } else if (hi === 0xc0 && prog[ch] == null) prog[ch] = c1;
        else if (hi === 0xb0 && c1 === 0 && bank[ch] == null) bank[ch] = c2;
      }
    }
    p = end;
    Object.keys(byCh).forEach(ch => raw.push({ name, ch: +ch, drums: +ch === 9, program: prog[ch] || 0, bank: bank[ch] || 0, ticks: byCh[ch] }));
  }
  tempos.sort((a, b) => a.tick - b.tick);
  const seg = [{ tick: 0, us: 500000, sec: 0 }];
  tempos.forEach(tp => {
    const l = seg[seg.length - 1];
    if (tp.tick === l.tick) { l.us = tp.us; return; }
    seg.push({ tick: tp.tick, us: tp.us, sec: l.sec + (tp.tick - l.tick) * l.us / 1e6 / div });
  });
  const sec = tk => { let i = seg.length - 1; while (i > 0 && seg[i].tick > tk) i--; return seg[i].sec + (tk - seg[i].tick) * seg[i].us / 1e6 / div; };
  const units = raw.map(u => ({ name: u.name, ch: u.ch, drums: u.drums, program: u.program, bank: u.bank,
    notes: u.ticks.map(n => ({ midi: n.midi, start: sec(n.t0), dur: sec(n.t1) - sec(n.t0), vel: n.vel })).sort((a, b) => a.start - b.start) }));
  return { bpm: Math.round(60e6 / seg[0].us), units };
}
