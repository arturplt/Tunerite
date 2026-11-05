# Architecture

Three layers. The page is `index.html`; its code is split into plain script files under `js/` (pure logic in `js/core/`), loaded in order by script tags, sharing one global scope as the single file did.

```
 microphone ─▶ AudioWorklet (analyse: decimate + YIN, 50×/s) ─▶ main thread
                                                                   │ PitchTracker (gate, confidence, median, octave filter)
                                                                   ▼
                              Tuner · RangeFinder · Session (frames, cues) ─▶ scoring ─▶ Results / Store
```

## 1. CORE (`/* CORE:BEGIN */ … /* CORE:END */`)
Pure functions and classes, no DOM and no Web Audio, so `tests/core.test.js` can load exactly this text with `new Function`. Contains: note maths, `yin`/`decimate`/`analyse`, `PitchTracker`, scoring, exercise builders, `computeStreak`. Keep it free of browser APIs.

## 2. Audio engine (`Engine`)
- Microphone is opened with `echoCancellation`, `noiseSuppression` and `autoGainControl` **off**. Phone defaults flatten pitch and distort level.
- `analyse` is stringified (`fn.toString()`) into a Blob-URL AudioWorklet, so the *same tested code* runs on the audio thread. It keeps a 2048-sample ring buffer, and every `sampleRate/50` samples it decimates to ~16 kHz (cheap box filter) and runs YIN (65–1100 Hz, threshold 0.2). Decimating cuts the CPU cost about 8× so the audio thread, which also renders playback, does not glitch.
- Each message `{t, f, conf, rms}` goes to `PitchTracker` on the main thread. `t` is shifted back half a window because a pitch estimate describes the middle of its window.
- Listeners (`Tuner`, `RangeFinder`, the active `Session`) subscribe to frames.
- Playback: `playNote` (4 sine harmonics, soft decay; `sustain` or a glide uses a flat envelope), `click`, `chime`, `tick`, `drone`. All are scheduled on the audio clock, not with timers.

## 3. UI and sessions
- Screens are `<section class="screen">` toggled by the bottom nav. The Train screen has three sub-views: menu, live session, results.
- `drawRoll` draws the piano roll with `x(t) = nowX + (t − rel)·pps`. Setting `static: true` makes the same function draw the whole take on the results screen.
- `Session` timeline (all on `AudioContext.currentTime`):
  `tL` listen start → `listenEnd` → three count-in clicks → `t0` (singing starts) → `t0 + total`. If "hear first" is off, a single start tone replaces the listen phase.
- **Latency compensation:** the user hears the target `outputLatency` after it is scheduled, so every frame is placed at `rel = frame.t − t0 − outputLatency`, and the roll's "now" is `currentTime − outputLatency`. Safari reports no `outputLatency`, so `baseLatency` is the fallback. A warning appears above 150 ms.
- **Cues:** a chime after 8 consecutive in-tolerance frames (0.16 s); a tick after 15 consecutive out-of-tolerance frames (0.3 s) once locked.
- **Headphone check:** with the guide tone on, if 40 consecutive frames vary by < 4 cents, the app assumes it is hearing itself and shows a toast.
- **Replay:** a `MediaRecorder` on the same mic stream starts at the beginning of the count-in. The blob and the offset from `t0` are stored in IndexedDB (newest 20 kept). Replay plays the blob and schedules the reference tones at `offset` later. Alignment is approximate (tens of ms).

## Storage
| Where | What |
|---|---|
| `localStorage["pitchperfect.v1"]` | settings, range, range log, history (one entry per session), pass counts |
| IndexedDB `pitchperfect/takes` | recorded takes, max 20 |

"Delete my data" clears both. If storage is unavailable (private mode) the app still works but forgets everything on reload.

## Why these choices
- **Single file**: easy to host anywhere and to open from a file manager.
- **YIN**: robust for voice and simple to test with synthetic tones; octave errors are handled by its absolute threshold plus the tracker's octave filter.
- **Tracker filters octave jumps instead of trusting the detector**: a real octave leap is accepted only after it persists for 4 frames (80 ms).


## Later additions (all in index.html)
- Core (tested): `refine`, `chordName`, `analyseTake`, `ISSUES`, `countIssues`, `adaptivePlan`.
- `Engine` owns the microphone (`getStream`, `setMic`, `listMics`) and the pitch worklet, which is reconfigured with `{N, fmin, fmax, dec}` per sound source.
- `Spec` (spectrogram), `Piano` (keyboard strip), `Midi` (Web MIDI, pedal, in-app voices), `Guide` (Do Re Mi and play-then-sing modes), `Routine` and `Builder` (plans), `Tuner.checkHint` (source suggestion).
- Stored in `localStorage` next to the old data: `coachLog`, `routines`, `guideLog`, `customRoutines`.
- `tools/midi_bridge.py` serves the app on localhost and streams keyboard notes over Server-Sent Events (`/midi`, status at `/midi/status`). `Midi.tryBridge` uses it before Web MIDI.
- `detectNotes` (core) finds simultaneous notes from a dB spectrum: semitone grid, strongest note first, expected overtones subtracted. `Tuner.checkChord` runs it in Piano mode every 120 ms and `Piano.draw` shows the result.
- Piano exercises: `buildPianoSteps`, `chordMatches` and `pianoSummary` (core, tested) feed `PX` (overlay, keyboard drawing, judging every 30 ms) which reads notes from `Played.now()` (MIDI keys, else the microphone). Results go to `pianoLog`.
- Sizes: all CSS lengths are rem; `applyUiSize()` sets the root font size and `UIK` (same factor) for geometry drawn on canvases. Keep new CSS in rem (1-4 px hairlines excepted).
- Train and Progress have a singing zone (`.zone-sing`, blue) and a piano zone (`.zone-piano`, purple); the Train choice is `settings.trainMode`.
- The spectrogram reads `Engine.specAn` (its own AnalyserNode, size set by `settings.fft`); chord and source detection read `Engine.analyser` (sized by the sound source).
- Library: `SING_META` (level and skills per singing exercise), `PIANO_LIB` (piano presets), `libraryItems` and `libraryFilter` are core and tested; `Lib` renders the Library tab. Add an exercise to `EXERCISES` and give it an entry in `SING_META`, and it appears in the library.
- On-screen playing: `VKeys` turns touch, mouse and computer-key presses into `Midi.msg(..., true)` (so everything downstream treats them as a MIDI keyboard) and plays its own sound; drawing code stores key rectangles in `canvas._kb` (`kbGeom`) and `kbHit` finds the key under a finger. `Keys` is the big full-screen piano. Computer keys are active only on the Tuner, in the big piano and in piano exercises.
- SoundFonts: `parseSoundFont` and `soundFontVoices` (core, tested with a generated font) read the file and resolve a note to samples; `SF` plays them with Web Audio (buffers made when the instrument is chosen, so playing is instant); `SFStore` keeps the file in IndexedDB; `SFUI` is the Settings part. `Engine.playNote` uses `SF.play` when `timbre` is `sf`. SF3 decoding (via `decodeAudioData`) has not been tested with a real SF3 file.

## Sequencer (`Seq`, the Mix tab)
Plays every track of a MIDI file, each with its own instrument. `parseMidi` returns per track and channel the GM `program`/`bank` and each note's velocity.
- **Scheduling:** a 25 ms timer queues the notes of the next 0.35 s on the audio clock (`start`, `tick`). Position is `base + (currentTime − T0) × tempo`, so pause, seek, loop and tempo are just a new `base`/`T0`.
- **Per-track strip:** each track plays into its own `GainNode` that feeds `Engine.master`; mute, solo and volume change that gain live. Pausing releases the strips.
- **Instruments:** `Auto` uses `SF.findPreset(bank, program)` (drums = bank 128) and falls back to a built-in voice (`synthFor` maps all 128 programs onto the `TIMBRES` table in `engine.js` through `GM_SYNTH`: partials, attack, hold or decay, and optional low-pass, clipping, vowel filters, breath noise or pitch drop; the menus group them by `fam`) or the drum kit (`Engine.drum`) when the SoundFont has no match. Any preset can be picked per track. `SF.cache` keeps several presets decoded at once (the 10 most recently used); a track whose preset was evicted plays a built-in voice instead.
- **Engine options:** `playNote` takes `dest` (output node), `synth` (voice), `preset` (SoundFont preset index, `-1` = none) and `seq` (own 64-voice pool instead of the 16 used for live keys).
- **Sing along:** marking a track SING stores its melody in `Store.data.midi` with `t0`, the time the melody starts in the file. `Session.begin` then calls `Seq.start(t0, { at, skip })`, so the other tracks begin exactly when singing begins, at the exercise tempo, without the sung track. Not used in "wait for the note" mode.
- **Storage:** per-track choices in `Store.data.seq`; the last MIDI file in IndexedDB `pitchperfect-seq`.

## Editable song model (MIDI editor, step 1)
`parseSong` / `writeSong` (core, tested) read and write a tick-based song: tempo, time and key signatures, and per track notes (with channel and velocity), controllers, pitch bend, program changes and text/marker events. `songSegs`, `songSec` and `songTick` convert between ticks and seconds through the tempo map; `songToUnits` gives the seconds-based shape `Seq` plays. `Seq.song` holds the loaded song, `Seq.rebuild()` re-derives the tracks after an edit (keeping instrument, volume, mute, solo and SING), and `Seq.exportMid()` saves it as a `.mid` file. `parseMidi` is still used by Train's "Load MIDI file".

## Note editor (`Ed`, MIDI editor step 2)
Mix tab > **Edit notes**. `Ed` edits `Seq.song` in place on its own canvas (`#edCv`): pitch rows with a key column, a bar ruler (tap to seek), a velocity lane at the bottom and a horizontal scroll slider. Tools: Draw (tap to add, drag to set length), Select (box), Pan. Notes can be moved, resized, double-tapped to delete; the grid (1/4 to 1/32, triplets, or none) snaps starts and lengths.
- Pure helpers in CORE (tested): `gridTicks`, `snapTick`, `songSnapshot`/`songRestore`, `EditHistory`, `notesTranspose`, `notesQuantize`, `notesCopy`/`notesPaste`, `songEndTick`, `songBarLines`.
- Undo/redo keep whole-song JSON snapshots (60 deep). A gesture pushes one snapshot, at its first change. `songRestore` rewrites the song object in place, so note objects held elsewhere are stale after an undo (the selection is cleared for that reason).
- `commit()` ends every edit: sorts the track, calls `Seq.rebuild()` (playback and the SING melody follow the edit) and, 0.7 s later, stores the song in `SeqStore`, so edits survive a reload.
- Keys (Mix tab, editor open): Delete, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y, Ctrl+A/C/V/D, arrows to transpose (Shift = octave) or nudge by the grid.

## Recorder (`Rec`, MIDI editor step 3)
`● Rec` in the editor records into the edited track from the playhead (rounded to a beat). Options: count-in bar, metronome, snap to the grid. The other tracks play along through `Seq.start(base, {at})`, so everything shares one start time `T0` on the audio clock.
- **Keyboard / piano:** `Midi.msg` calls `Midi.rec(d)` first, so a real keyboard, the on-screen piano and the computer keys all record. Computer keys are enabled on the Mix tab while a take is running. Notes, sustain pedal (CC 64) and pitch bend are kept.
- **Voice:** pitch frames are collected and turned into notes by `framesToNotes` (core, tested): vibrato stays one note, a stray frame does not split a note, short blips and silences are dropped.
- **Timing:** event time is `songTick(base + (currentTime - outputLatency - T0) * tempo)`. The latency shift is the same one `Session` applies, because the player hears the click that much after it was scheduled.
- **Metronome:** `songBeats` (core, tested) gives the beats, following time-signature changes; a 25 ms timer schedules the next 0.35 s of clicks.
- The whole take is one undo step. The editor is locked while a take is running.

## Tracks, tempo and controllers (MIDI editor step 4)
Editor > **Track and song** (a collapsible section) and the lane selector under the roll.
- **Tracks:** add, delete, rename, reorder; instrument (all 128 GM names, `GM_PROGRAMS`) and channel per track. `songSetProgram` writes a program change at tick 0, `songSetChannel` moves a single-channel track (it refuses a track that already uses several channels). Every track has an `id` (not written to the file) so the mixer's choices (instrument, volume, mute, solo, SING) follow a track when it is moved, and survive undo; `Seq.rebuild` keys them by `tid:channel`.
- **Song:** name, key signature (metadata only), tempo changes (`songSetTempo`, set at the playhead, rounded to a quarter note) and time-signature changes (`songSetTimeSig`, always at the start of a bar). Tempo and signature changes show as small buttons; the ones after the start have a ✕.
- **New song:** `songNew` makes an empty song with one piano track. `Seq.load` accepts a song without notes (`Seq.loaded` is true as soon as a song exists), so you can record or draw into an empty song. While the editor is open the playhead may go up to 10 minutes past the end (`Seq.maxPos`), and during a take without limit.
- **Lanes:** Velocity, Sustain (CC 64), Volume (7), Expression (11), Pan (10), Modulation (1) and Pitch bend. Drag in the lane to draw values (sustain snaps to on/off, bend snaps to the centre), double-tap a point to remove it, "Clear lane" removes the controller from the track. Volume (7), expression (11), pan (10), sustain (64) and pitch bend are played back and rendered; modulation is saved in the file but not played (see below).

## Controller playback and WAV export (MIDI editor step 5)
- **Curves:** `songToUnits` gives a unit `auto` = `{vol, pan, bend}` in seconds (`songAutomation`): volume is CC 7 x CC 11, each squared like General MIDI; pan is CC 10; bend is the pitch wheel in cents (+-200 at full deflection, the General MIDI default range; RPN changes are ignored). A note released while the sustain pedal is down gets `sus`, the time until the pedal comes up (at most 16 beats); drums ignore the pedal.
- **Playback:** a track with `auto` gets the chain strip -> `ctl` (gain) -> `pan` (StereoPanner) -> master, plus a `bendSrc` ConstantSource whose output is connected to the `detune` of every voice of the track (`o.bend` in `Engine._playNote` and `SF.play`, the same way the vibrato effect is). `Seq.autoInit` sets the values at the start position, `Seq.autoRun` schedules events inside the 0.35 s look-ahead in `tick()`. Tracks without such events keep the single strip.
- **WAV export:** `Seq.exportWav` renders the whole song at its written tempo into an `OfflineAudioContext`, faster than real time. It swaps `Engine.ctx` for the offline context only while it schedules (`Engine.buildFx()` builds the same reverb/chorus/tone chain; the real engine is restored with `Object.assign(Engine, saved)` before the render is awaited), `Seq.renderAll` schedules every note and event, and `o.nopool` stops the voice pool from cutting notes that are all scheduled at once. SoundFont buffers are decoded beforehand (`Seq.prepare`) and are shared with the live context. The silent tail is trimmed (`lastLoud`), `encodeWav` writes 16-bit stereo. Mixer volume, mute and solo and the current effect settings are applied.
- Not played back: modulation (CC 1) and RPN pitch-bend-range changes.

## Tuner screen
- `index.html` holds the markup (`#tnStage`), `css/tuner.css` the look, `js/tuner-dial.js` (`TunerDial`) the analog parts and layout, `js/tuner.js` (`Tuner.draw`, every frame) the readings.
- The instrument has a fixed design size (1280x720 landscape, 560x1380 portrait, chosen by the screen's aspect ratio) scaled to fit, so nothing scrolls. `TunerDial.fit` sets `--s`, and with it `--dp` (one device pixel) and the pixel-font sizes `--f2/--f4/--f8`, so the LCD mesh and type stay on the grid at any scale.
- Two SVG meters are built by `TunerDial.build`: the cents dial (±50¢ over ±45°) and a VU meter fed by `Engine.level` (0 VU = -18 dBFS). Both needles are springs, and each throws a shadow (the same needle moved down the face; light is above).
- The slider is the sound source (Voice, Piano, Whistle): a three-position track that jumps between detents and sets `settings.inst` through `setInst`. The three keys are Find my range, and the reference pitch A4 down and up. Find my range runs on the screen itself (`RangeFinder.open(whistle, true)`, shown by `Tuner.rangeOverride`): the LCDs become LOW, HIGH and the size in octaves, the message asks for each note, and the keys turn into Next/Done, Redo and Exit; the pop-up is only used from the Practice menu and the first run. The chromatic strip is `#ppOcts`.

- Knobs (`Knobs.wire`) turn only when the press lands on the cap: `wire` wraps each knob's SVG in `.kwrap` and adds a `.khit` disc (66% of the knob, the only part with `touch-action:none`), so touching or crossing the rest of a panel scrolls it. The mouse wheel turns a knob only while it has focus (after a click); otherwise it scrolls the panel.

## Themes
- `Themes` (`js/themes.js`) lists the looks and sets `<html data-theme>`; the id is the `theme` setting, so each profile keeps its own. It is picked in Settings > Display or from the THEME switch on the Tuner screen.
- The Tuner's CSS and meter SVGs, and the Piano tab's synth panels (`css/app.css`, from "Synth look" to the Settings section), read their colours from `--tn-*` variables with Classic as the fallback. The Compose tab and the canvases (spectrogram, keys) keep fixed colours. `css/themes.css` has one rule per theme setting all of them; Classic has no rule. A new theme is one rule, one entry in `Themes.list` (with its four swatch colours) and one key in the Settings picker.
## Piano tab layout
- `js/piano-ui.js` (`PianoUI`) only moves things: it groups the knob panels into pages (Sound, Filter, Space, Dyn, Arp, Env, View), puts the page keys, the selected page, Bypass/Panic/Reset and the NOW screen in a right-hand column with the sound selectors above, and moves Save, Init and Full screen next to the selectors and key row. Every panel keeps its id and handlers (so `Knobs.paint`'s `#pnKnobs ...` selectors still work); a page is shown by toggling `hidden` on its `[data-pg]` panels.
- `css/piano.css` has the look (the Tuner's matte case and hardware caps, `--tn-*` colours). Its last sections restyle everything inside the case with `#s-piano` selectors so they beat the older neumorphic rules: the groups are recessed wells with pixel-font names, the knob SVGs (built by `Knobs`, classes `kb kh kd` and `line.on`) get a flat cap with a hard shadow and a ring lit in the LCD colour, and every `.synbtn` / `.bigjack` becomes a raised cap that drops when pressed and two layouts: wide windows fill the screen with no page scrolling (the knob page scrolls inside its column if needed); narrow or portrait windows stack everything in one column, selectors first, then the screen and keys, then the pages.
