"use strict";
/* ---- SoundFont (.sf2 / .sf3) reading. Pure functions: an ArrayBuffer in, plain data out. ---- */
function parseSoundFont(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf), str = (o, n) => { let t = ''; for (let i = 0; i < n && u8[o + i]; i++) t += String.fromCharCode(u8[o + i]); return t; };
  if (u8.length < 12 || str(0, 4) !== 'RIFF' || str(8, 4) !== 'sfbk') throw new Error('That does not look like a SoundFont file (.sf2 or .sf3).');
  const ch = {};
  const walk = (p, end) => {
    while (p + 8 <= end) {
      const id = str(p, 4), size = dv.getUint32(p + 4, true), body = p + 8;
      if (id === 'LIST') walk(body + 4, Math.min(end, body + size)); else ch[id] = { off: body, size: Math.min(size, end - body) };
      p = body + size + (size & 1);
    }
  };
  walk(12, u8.length);
  for (const need of ['smpl', 'phdr', 'pbag', 'pgen', 'inst', 'ibag', 'igen', 'shdr']) if (!ch[need]) throw new Error('This SoundFont is missing its "' + need + '" data.');
  const major = ch.ifil ? dv.getUint16(ch.ifil.off, true) : 2, name = ch.INAM ? str(ch.INAM.off, ch.INAM.size) : '';
  const rec = (c, sz) => Math.floor(ch[c].size / sz);
  const gens = (c) => { const n = rec(c, 4), out = []; for (let i = 0; i < n; i++) { const o = ch[c].off + i * 4, amt = dv.getUint16(o + 2, true); out.push({ op: dv.getUint16(o, true), lo: amt & 255, hi: amt >> 8, v: amt > 32767 ? amt - 65536 : amt }); } return out; };
  const bags = c => { const n = rec(c, 4), out = []; for (let i = 0; i < n; i++) out.push(dv.getUint16(ch[c].off + i * 4, true)); return out; };
  const pgen = gens('pgen'), igen = gens('igen'), pbag = bags('pbag'), ibag = bags('ibag');
  /* zones: the generators of each bag; a first zone without instrument/sample is the global zone */
  const zones = (bag, gen, start, end, key) => {
    const list = []; let global = null;
    for (let b = start; b < end; b++) {
      const z = { g: {}, key: [0, 127], vel: [0, 127], link: null };
      for (let k = bag[b]; k < bag[b + 1]; k++) { const G = gen[k]; if (G.op === 43) z.key = [G.lo, G.hi]; else if (G.op === 44) z.vel = [G.lo, G.hi]; else if (G.op === key) z.link = G.v; else z.g[G.op] = G.v; }
      if (z.link == null && b === start) global = z; else if (z.link != null) list.push(z);
    }
    return { global, zones: list };
  };
  const nP = rec('phdr', 38) - 1, presets = [];
  for (let i = 0; i < nP; i++) {
    const o = ch.phdr.off + i * 38, o2 = o + 38, z = zones(pbag, pgen, dv.getUint16(o + 24, true), dv.getUint16(o2 + 24, true), 41);
    presets.push({ name: str(o, 20), program: dv.getUint16(o + 20, true), bank: dv.getUint16(o + 22, true), global: z.global, zones: z.zones });
  }
  const nI = rec('inst', 22) - 1, insts = [];
  for (let i = 0; i < nI; i++) {
    const o = ch.inst.off + i * 22, z = zones(ibag, igen, dv.getUint16(o + 20, true), dv.getUint16(o + 22 + 20, true), 53);
    insts.push({ name: str(o, 20), global: z.global, zones: z.zones });
  }
  const nS = rec('shdr', 46) - 1, samples = [];
  for (let i = 0; i < nS; i++) {
    const o = ch.shdr.off + i * 46, type = dv.getUint16(o + 44, true);
    samples.push({ name: str(o, 20), start: dv.getUint32(o + 20, true), end: dv.getUint32(o + 24, true), loopStart: dv.getUint32(o + 28, true), loopEnd: dv.getUint32(o + 32, true), rate: dv.getUint32(o + 36, true), pitch: u8[o + 40], corr: dv.getInt8(o + 41), type, compressed: !!(type & 0x10) });
  }
  const smplLen = ch.smpl.size, even = ch.smpl.off % 2 === 0;
  return { name, major, compressed: major >= 3, presets, insts, samples, smpl: even && major < 3 ? new Int16Array(buf, ch.smpl.off, Math.floor(smplLen / 2)) : null, smplOff: ch.smpl.off, smplLen };
}
/* Everything needed to sound one note: the samples (several for stereo or layers) with pitch, loop, envelope and level. */
function soundFontVoices(sf, pi, note, vel) {
  const P = sf.presets[pi], out = []; if (!P) return out;
  const inR = (z, n, v) => n >= z.key[0] && n <= z.key[1] && v >= z.vel[0] && v <= z.vel[1];
  const tc = x => Math.pow(2, x / 1200);
  P.zones.forEach(pz => {
    if (!inR(pz, note, vel)) return; const I = sf.insts[pz.link]; if (!I) return;
    const pg = op => (pz.g[op] != null ? pz.g[op] : P.global && P.global.g[op] != null ? P.global.g[op] : 0);
    I.zones.forEach(iz => {
      if (!inR(iz, note, vel)) return; const S = sf.samples[iz.link]; if (!S) return;
      const ig = (op, d) => (iz.g[op] != null ? iz.g[op] : I.global && I.global.g[op] != null ? I.global.g[op] : d), val = (op, d) => ig(op, d) + pg(op);
      const root = ig(58, -1) >= 0 ? ig(58, -1) : (S.pitch >= 0 && S.pitch <= 127 ? S.pitch : 60), mode = ig(54, 0) & 3;
      out.push({
        si: iz.link, root, scale: ig(56, 100), coarse: val(51, 0), fine: val(52, 0) + S.corr, loop: mode === 1 || mode === 3,
        startOff: ig(0, 0) + 32768 * ig(4, 0), loopStartOff: ig(2, 0) + 32768 * ig(45, 0), loopEndOff: ig(3, 0) + 32768 * ig(50, 0),
        atten: Math.max(0, val(48, 0)), pan: clamp(val(17, 0), -500, 500), sampleType: S.type & 7,
        env: { delay: tc(val(33, -12000)), attack: tc(val(34, -12000)), hold: tc(val(35, -12000)), decay: tc(val(36, -12000)), sustain: clamp(val(37, 0), 0, 1440), release: Math.max(0.03, tc(val(38, -12000))) },
        exclusive: ig(57, 0)
      });
    });
  });
  return out;
}
/* CORE:END */
