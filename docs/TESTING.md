# Testing

## Automated (no dependencies)
```sh
node tests/core.test.js
node tests/themes.test.js
```
`themes.test.js` checks that every theme in `css/themes.css` sets exactly the `--tn-*` variables the Tuner tab uses.

Loads the files in `js/core/` (the `CORE` block) and checks:
- Note maths and A4 reference handling.
- YIN accuracy (< 5¢) on sines from G2 to G5 at 48 kHz, plus 44.1 kHz; sawtooth waves (no octave errors); noise at ~20 dB SNR; silence.
- Tracker: gate, brief jumps to overtones (octave, twelfth, double octave) rejected and sustained ones accepted after 6 frames, real leaps accepted after 3, outlier smoothing.
- Scoring: ordering perfect > sharp > wobbly > late > silent, correct sharp/flat signs, vibrato not punished, attack timing, tolerance levels, glides, stars, weighting.
- Every exercise builds without gaps, the drum exercise stays fixed, narrow ranges do not crash.
- Streak calculation.
- SoundFont reading and zone choice, with a tiny SoundFont generated inside the test (key split, root key, loop, default envelope, error messages).
- Exercise library: metadata for every exercise, piano presets build, unique ids, search/kind/level/category/favourite filters.
- Editable song model: parse (running status, tempo changes, unclosed notes), write-then-parse round trip, tick/second conversion.
- Editing helpers (grid, undo history, transpose, quantize, copy/paste, bar lines), metronome beats across time signatures, and sung pitch to notes (vibrato, stray frames, blips, gaps).
- Tracks (add, delete, move, instrument, channel), tempo / time signature / key edits, controller events, new song.
- Playback data (sustain lengthening, volume/pan/bend curves, no automation when there are no events) and the WAV encoder (header, samples, clipping, silence trimming).
- Tempo scaling of exercises and custom (MIDI) exercises.
- High-note refinement (< 3¢ up to 2093 Hz) and the whistle range (900 Hz to 3.5 kHz, no octave errors).
- Chord naming from held keys: triads, sevenths, ninths, add9, sus, shell voicings and inversions; interval names for two keys.
- Coaching analysis: simulated singing (clean, flat, scooping, sagging, missed notes, vowel drift, glide lag) must produce the right tip ids and no false ones.
- Issue counting, the adaptive plan, and that every issue points to a real exercise.
- Piano exercises: step lists for scales, arpeggios, chords, inversions and progressions; chord matching (any octave, inversion-aware); the summary tips.
- Modular exercises: pattern ladders, minor copies and syllable cycling; random exercises repeat with the same seed, differ between seeds, and stay gapless and in range over 200 seeds; roman-numeral parsing; smooth voice leading stays close; finger patterns, intervals, note flash and new ear types; every piano preset's options exist in `PIANO_OPTS`.
- Chord hearing: synthetic piano chords go through a real FFT and `detectNotes` must return exactly the notes played (octave doublings are a known weak spot, so they are not tested).

## End-to-end smoke test (done once during development)
Headless Chromium with a fake microphone playing a 220 Hz tone:
`--use-fake-ui-for-media-stream --use-fake-device-for-media-stream --use-file-for-fake-audio-capture=tone.wav`.
Verified: start → mic opens → worklet runs → Tuner shows `A3 · In tune · 220.0 Hz` → range finder captures A3 → a full "Match a held note" session runs → results, history, and a stored take appear → replay enabled → no console errors. A constant wrong tone scores 25 (steady but never in tune).

This is not repeated automatically; the repo has no browser test harness.

## Manual device checklist (not yet done)
Run before calling a phase finished. At least one iPhone (Safari) and one Android (Chrome).

- [ ] Page served over HTTPS; **Tap to start** asks for the mic and starts audio (iOS: also with the silent switch on and off).
- [ ] Mic permission denied → readable message; allowing it and tapping again works.
- [ ] Tuner: sing A3 (220 Hz) from a tuning app or piano; needle and note agree within a few cents. Check low (G2) and high (G5) notes for octave errors.
- [ ] Range finder: lowest and highest captured; a cough or squeak does not widen the range.
- [ ] A scored exercise on each difficulty; trace looks aligned with what you hear (latency compensation).
- [ ] With Bluetooth headphones: latency warning appears.
- [ ] No headphones + guide tone: "hears its own guide tone" warning appears.
- [ ] Switching to another app mid-exercise stops it cleanly.
- [ ] Replay plays your voice and the reference together.
- [ ] Airplane mode after first load: app still opens (service worker).
- [ ] "Delete my data" empties history and takes.
- [ ] Portrait layout, nothing hidden behind the notch or the nav bar; all buttons at least 44 px.
- [ ] Try voices: low, high, falsetto, breathy; check the mic sensitivity slider is enough.

## Known gaps
- Scoring weights and the detector's gate defaults are untested on real voices.
- Embedded-viewer microphone blocking and iOS audio unlock are untested on real devices (the original plan's v1 risks).

## Audio checks that need a real browser
Rendering and the sound engine cannot run under Node. Headless Chromium has a real audio engine; a page that loads `index.html` and calls `Seq.exportWav()` (with `Seq.download` replaced to capture the bytes) can measure the result: a note at 440 Hz renders at 440 Hz, volume 40 is much quieter, pan 0 / 127 silences one channel, a full bend up gives about 494 Hz, and a note released under the sustain pedal is still sounding a second later. Use real time (no `--virtual-time-budget`), `--autoplay-policy=no-user-gesture-required`, and post the result to a small local server.
