"use strict";
/* ---- MIDI file loading ---- */
const MidiLib = { units: [], name: '', bpm: 100 };
function useMidiUnit(i) {
  const u = MidiLib.units[i];
  Store.data.midi = { name: MidiLib.name, bpm: MidiLib.bpm, notes: u.mono }; Store.save(); UI.refresh();
}
async function loadMidiFile(file) {
  try {
    const r = parseMidi(new Uint8Array(await file.arrayBuffer()));
    const units = r.units.map(u => Object.assign(u, { mono: melodyFromNotes(u.notes) })).filter(u => u.mono.length >= 3);
    if (!units.length) throw new Error('No singable notes found in that file.');
    units.sort((a, b) => (a.drums - b.drums) || (b.mono.length - a.mono.length));
    units.forEach((u, i) => {
      const ms = u.mono.map(n => n.midi), nm = (u.name || 'Track ' + (i + 1)) + (u.drums ? ' (drums)' : '');
      u.label = nm + ' · ' + u.mono.length + ' notes · ' + noteName(Math.min.apply(null, ms)) + '–' + noteName(Math.max.apply(null, ms));
    });
    MidiLib.units = units; MidiLib.name = file.name.replace(/\.midi?$/i, ''); MidiLib.bpm = r.bpm;
    useMidiUnit(0);
    toast(units.length > 1 ? 'Loaded. Pick the track that has the tune.' : 'Loaded ' + MidiLib.name + '.');
  } catch (e) { toast(e.message || 'Could not read that file.', 5000); }
}

