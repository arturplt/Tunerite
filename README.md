# Pitch Perfect

A mobile-first singing trainer that runs in the phone's browser. It plays a target note, you sing it, and you watch your pitch move in real time. It then scores accuracy, steadiness and attack.

Everything is one static page (`index.html`) plus plain script and style files in `js/` and `css/`. No build step, no server code, no accounts. Audio never leaves the device.

## Run it

The microphone only works on **HTTPS or `localhost`**, so do not just double-click a file on a phone.

```sh
# on your computer
python3 -m http.server 8000        # then open http://localhost:8000

# to try it on a phone, host the folder on any static HTTPS host
# (GitHub Pages, Netlify, Cloudflare Pages) and open the URL
```

Opening `index.html` directly from disk works in most desktop browsers. Use **headphones**, wired if possible: otherwise the mic hears the reference tone, and Bluetooth adds 150–300 ms of delay that wrecks attack timing.

## Using it

1. **Tap to start** (browsers need a tap before they allow audio and the microphone).
2. **Find your range** on first run: sing your lowest comfortable note and hold it for a second, then your highest. Skipping uses a default C3–C5. Redo it any time in Settings.
3. **Tuner**: free-sing; the needle shows note, octave and cents sharp or flat.
4. **Practice** (Train and Library in one tab): choose **Sing**, **Piano** or **Whistle** at the top, then switch between **Exercises** and the searchable **Library**. Whistle uses the singing exercises with the whistle detector and your whistle range (it switches the Sound source in Settings). Pick a difficulty (Easy ±50¢, Medium ±25¢, Hard ±10¢) and an exercise. The app plays the exercise, counts you in, and you sing along to the scrolling piano roll. Bars are as tall as your tolerance, so staying inside the bar means staying in tune.
   - **Wait for the right note** (Settings): the exercise pauses at each note and replays the target until you hold it.
   - **Time to find each note** (Settings): how long you have at the start of each note before scoring begins (default 1 s).
   - **Space bar** restarts the current exercise, or tries again from the results screen.
   - **Load MIDI file** (top of Practice): sing your own melody; pick the track with the tune.
   - The session bar shows the note to sing and the note you are singing.
5. **Mix** (sequencer, also a MIDI editor: **Edit notes** opens a piano roll with undo, copy/paste, quantize, a velocity lane and **● Rec** to record from a MIDI keyboard, the on-screen piano or your voice; **+ Drums** adds a drum track that you edit as a step grid (▦ Steps / ♪ Notes switches to the piano roll; patterns, copy bar, accents; plays with the song); **Track and song** adds/removes/reorders tracks and sets instrument, channel, tempo, time signature and key; **New song** starts from scratch; **Save .mid…** exports the song and **Export .wav…** renders it to audio with the sounds and effects you hear; volume, pan, sustain pedal and pitch bend events are played): load a MIDI file and hear every track with its own instrument (the loaded SoundFont, built-in voices, or a drum kit). Per-track volume, mute and solo, tempo, loop and a moving piano roll. Mark one track **SING** and the other tracks accompany you in Train > Your own melody.
6. **Results**: score, stars, your trace over the target, sharp/flat per note, and a replay of your take next to the reference tones.
7. **Progress**: streak, accuracy over the last 30 sessions, best scores, range growth.

## Project layout

| File | Purpose |
|---|---|
| `index.html` | The page: markup, and the script tags that load `js/` in order. |
| `css/app.css` | All styles. |
| `js/core/*.js` | Pure logic with no DOM or Web Audio (pitch, scoring, exercises, MIDI and song model, library, SoundFont reading). Unit tested. |
| `js/*.js` | The app: audio engine, tuner, practice, sequencer, editor, drum grid, wiring. Loaded in the order `index.html` lists. |
| `manifest.webmanifest`, `icon.svg`, `sw.js` | Optional: install to home screen and work offline. The app runs fine without them. |
| `tests/core.test.js` | Unit tests for the core (`node tests/core.test.js`, no dependencies). |
| `docs/ARCHITECTURE.md` | How the pieces fit, data flow, timing and latency. |
| `docs/SCORING.md` | Exact scoring formulas and how to tune them. |
| `docs/EXERCISES.md` | Exercise list, how to add exercises and melodies, content sourcing rules. |
| `docs/TESTING.md` | Automated tests and the manual device checklist. |

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| "Microphone permission was denied" | Allow the mic for the site in browser settings. If the page is shown inside another app's viewer, open it directly in the browser. |
| Nothing happens on iPhone | iOS needs the tap on **Tap to start**; also check the silent switch is off, since it mutes web audio. |
| Needle never moves | Raise **Mic sensitivity** in Settings until the level bar passes the orange line when you sing. |
| Notes jump an octave | Usually background noise or a very breathy tone. Move closer to the mic; brief jumps are filtered automatically. |
| "App seems to hear its own guide tone" | Put headphones on, or turn the guide tone off. |
| Scores feel harsh | Switch to Easy; the first 0.3 s of each note is a grace period but silence counts as a miss. |

## Status

Implements v1–v3 from the plan (tuner, range finder, single-note scoring, piano-roll trainer, exercise ladder, results, progress, take replay, offline install). Not yet done: Polish folk tunes (see `docs/EXERCISES.md`) and on-device testing on iOS Safari and Android Chrome (see `docs/TESTING.md`).


## Features added later
- **Sound source** (Voice / Piano / Whistle) on the Tuner screen, with a hint when the sound looks like a different source. Whistle tracks 400 Hz to 4.6 kHz; Piano A0 to C8.
- **Spectrogram detail** (Low / Mid / High FFT size, 4096 / 16384 / 32768 points): Low reacts fastest but blurs pitch, High separates close notes but is slower. It has its own analyser, so it never affects chord or source detection. Left on Auto it picks High for Piano and Max mic ranges and Mid otherwise.
- **Spectrogram** (open by default on the Piano screen (above the keys, rising from them), with a Full screen button that fills the display and tries to switch the phone to landscape) with Voice / Piano / Max mic / Whistle ranges, moving left to right, with a toggle for the note line.
- **USB MIDI keyboard** (Chrome desktop and Android): pressed keys and chord names on the keyboard strip, optional in-app keyboard sound with sustain pedal, and a "play a key, then sing it" mode.
- **Do Re Mi guide**: waits for each note to be held and tells you higher or lower. Runs are saved.
- **Routines**: Today's plan (adapts to recurring issues), four ready-made plans and your own routines.
- **Chords**: in Piano mode the app listens for several notes at once, names the chord and lights the keys. On a MIDI keyboard it names held chords, and "play a chord, then sing it" steps through its notes one at a time. Chord arpeggio exercises are under Chords.
- **Piano exercises** (Train > Piano): twelve scales and modes, arpeggios, chords with inversions in every key, finger patterns (thirds, broken thirds, turns…), harmonic intervals, chord progressions (smooth voice leading, or all twelve keys), random note flash and ear training (notes, intervals, scale degrees, chords). Play on a MIDI keyboard, or any piano through the microphone. The app waits for each note or chord, names mistakes and ends with tips.
- **Tempo and seeking**: exercises run at 50 to 150 % of their written speed (Train, Settings, or the − and + in a session, or ↑ ↓). During an exercise, ← and → (or ⏮ ⏭) jump to the previous or next note, in wait mode too. Runs where you skipped around are not saved to Progress.
- **Interface size** (Settings): Normal, Large (default) or Extra large. Every size in the page is in rem, so one setting scales text, buttons and canvases together.
- **Singing and Piano are separate** in Train and in Progress: a switch at the top (blue for singing, purple for piano), each with its own list, heading and statistics.
- **Library** (its own tab): every exercise in one place. 152 items: 63 singing and 89 piano. Search, filter by singing or piano, level and category, star favourites, and see your best score. It suggests exercises for what the coach keeps finding and lists what you practised recently.
- **Play the app's own piano**: tap the keyboard strip on the Piano tab (several fingers at once, slide between keys), open the big **🎹 Play on-screen piano** (2 to 4 octaves, octave buttons, sustain), or use your computer keyboard (A W S E D F T G Y H U J K O L P ; as piano keys, Z/X octave, C/V volume, Space sustain). It makes sound, names chords, and counts as keyboard input in the piano exercises.
- **Rhythm course** (Practice > RHYTHM): seven units from a steady beat through eighths, rests, syncopation, sixteenths, triplets and waltz time. Each round counts a bar in, plays a pattern, and you tap it back (Space or the pad); every hit is scored by how close it lands, 70% passes and opens the next level.
- **Effects** (Piano tab): Reverb and Chorus beside the SoundFont selector, and a **More effects** panel with Tremolo, Vibrato, Echo, Tone, Phaser/Flanger, Overdrive, Octave layer, Stereo widener, Humanize and a Sustain pedal. Octave layer and Humanize only affect notes you play, not exercise tones. Vibrato and the sweeping effects move the pitch around, so leave them off for ear training.
- **Built-in instruments** (no SoundFont needed): 42 synthesized voices in families (piano, mallets and bells, organ, guitar and plucked, bass, strings, choir, brass, reeds, pipes, synth leads and pads, percussive, effects). They are choices for the reference sound (Settings) and per track in the Mix tab, and stand in for every General MIDI program when the SoundFont has no match.
- **SoundFonts** (Settings > Reference sound): load a `.sf2` or `.sf3` file, choose an instrument from it, and it is used for the exercise tones, the guide tone, the on-screen piano and the keyboard sound. The file is kept in the browser's storage. "Load folder…" (Settings, or the SoundFont selector next to Reverb/Chorus) adds every `.sf2`/`.sf3` in a folder, and the selector switches between them. Loops, envelopes, key and velocity splits, tuning, stereo and glides are supported; filters and modulators are ignored. Free piano fonts: GeneralUser GS, FluidR3, Salamander (SF2 versions). `.sf3` (compressed) files need a browser that can decode Ogg.
- **Coach**: after each exercise it reads the whole pitch trace, gives tips and flags the notes on the graph. Recurring issues appear under Progress.
- **Sound options**: choice of microphone, reference tone sound (soft, piano-like, pure) and a mic level bar on every screen.

## MIDI keyboard on Linux (Snap or Flatpak browsers)
If **Connect** reports `InvalidStateError`, the browser cannot reach the sound system's MIDI port. Run the bridge instead and open the page it serves, in any browser:
```sh
python3 tools/midi_bridge.py        # needs alsa-utils (amidi); then open http://localhost:8000
```
It reads the keyboard with `amidi` and streams the notes to the page, listens on 127.0.0.1 only, and serves only the app files.
If keys appear one press late, stay lit, or a first press is ignored, an old copy of the bridge is still running. Stop it with Ctrl+C and start `tools/midi_bridge.py` again. Only one program can read the keyboard at a time, so the new bridge reports "in use by another program" until the old one is stopped, then connects by itself.
