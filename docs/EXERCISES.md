# Exercises

| Group | Exercise | Notes |
|---|---|---|
| Single notes | Match a held note, Long tone | 3 notes at 3 s each; one note for 8 beats |
| Slides | Siren, Slow siren, Fifth glide | glides with no steps in the sound |
| Warm-up | Five-note scale, Arpeggio, Semitone ladder | the classic first exercises |
| Chords | Minor arpeggio, Dominant 7th arpeggio, Major minor major | chord tones |
| Vowels | Vowels on one note, Vowel scale | ma me mi mo mu |
| Intervals | Seconds, Thirds, Fourths, Fifths, Sixths, Octaves | root then interval, from three starting notes |
| Scales | Major, Natural minor, Harmonic minor, Major and minor pentatonic, Blues, Dorian, Mixolydian, Whole-tone, Chromatic | one octave up and down |
| Scales | G minor pentatonic (tongue drum) | **fixed** G3–D5, not transposed |
| Melodies | Ode to Joy, Frère Jacques, Twinkle Twinkle | transposed to your range |

| Patterns | Three-note steps, Five down, Scale in thirds, Home base, Neighbour turn, Leap and walk down, Octave drop, Quick arpeggios | each in major and minor (`-m` id) |
| Syllables | Nay-nay, Humming, Zee arpeggio, Vowel arpeggios, Gee-gee staccato | a syllable shown on every note |
| Diction | Ta-ka-ta-ka, Pa-ba lips, La-da-na-ta scale, Mi-ni-mi-no, two tongue twisters | consonant drills; scored on pitch, the words show on the roll |
| Random | Random melody (steps), Random leaps, Random chord tones | a new tune every time you start |

Piano exercises (scales and modes, arpeggios, chords and inversions, finger patterns, intervals, progressions, note flash, ear training) are presets in `PIANO_LIB`; the Library tab lists both kinds with levels and skills.

## Fit-to-range
Most exercises are written as semitone offsets from a tonic. `fitTonic` centres the pattern in your range. If the pattern is wider than your range, the exercise still runs and the app warns "your range is narrower than this exercise".

The **drum** exercise is never transposed by pitch class. It is only shifted by a whole octave (−12, 0 or +12) if that puts more of its nine notes inside your range, and it warns if some are still out of reach.

## Adding an exercise
Add an object to `EXERCISES` (in CORE):

```js
{ id: 'my-id', group: 'Scales', name: 'Dorian scale', desc: 'Up and down.',
  build(range) {                       // range = {lo, hi} in MIDI numbers
    const offs = upDown([0,2,3,5,7,9,10,12]);
    const f = fitTonic(offs, range.lo, range.hi);
    return { items: seqItems(offs, f.tonic, 1), bpm: 72, tonic: f.tonic, fits: f.fits };
  } }
```
`items` are `{midi, beats}` (add `midi2` for a glide). `tests/core.test.js` automatically checks every exercise builds and is gapless.

## Modular exercises (singing)
Instead of writing `build` by hand, describe the exercise and let `patternDef` build it. A spec combines four independent parts:

| Part | Field | Meaning |
|---|---|---|
| Pattern | `pat` | scale degrees, 0 = tonic, may go below 0 or past 6 |
| Scale | `scale` | `'major'` (default) or `'minor'` |
| Ladder | `rungs`, `step` | repeat the pattern `rungs` times, each `step` semitones higher (negative goes down) |
| Syllables | `syl` | cycled over the notes, shown on the piano roll |

```js
{ id: 's-nay', group: 'Syllables', name: 'Nay-nay scale', desc: '…',
  pat: [0,1,2,3,4,3,2,1,0], beats: [1,1,1,1,1,1,1,1,2], syl: ['nay'] }
```
Put it in `SING_PATTERNS` (wrap it in `majorMinor(...)` to get the minor copy as well) and add a row to `SING_META`. Keep the whole span under about 20 semitones.

### Random exercises
`SING_RANDOM` entries have `build(range, rnd)`. `rnd()` returns a number in [0,1); `buildExercise(id, range, tempo, rnd)` defaults it to `Math.random`, and tests pass `mulberry32(seed)` so a run can be repeated. Every random exercise must stay gapless, start and end sensibly, and fit a 21-semitone range for any seed (the tests try 200 seeds).

## Modular piano exercises
`buildPianoSteps(id, key, o1, o2, rnd)` makes the steps; `o1` and `o2` are the two menu choices. Everything is driven by tables near `PIANO_SCALES`:

| Table | Adds |
|---|---|
| `PIANO_SCALES` | a scale or mode for the `scale` and `sequence` exercises |
| `PIANO_CHORDS` | a chord type for `arpeggio`, `chords`, progressions and ear chords |
| `PIANO_PATTERNS` | a finger pattern for `sequence` (degree offsets, played from every degree) |
| `PIANO_PROGS` | a progression, written as roman numerals: `prog('I V vi IV', 'label')` |
| `PIANO_INTERVALS` | an interval (semitones) for `intervals` |

Add the display name to `PIANO_NAMES` (a test fails if you forget), then a preset row in the `PIANO_LIB.push(...)` block. `PIANO_OPTS` builds the piano menus from these tables and a test checks every preset's options exist in them.

Roman numerals: capital = major, lower case = minor, `°` diminished, `ø7` half-diminished, `7` seventh (dominant on a capital, minor on lower case), `maj7`, and a leading `b` lowers the root (`bVII`).
Progression `o2`: empty = root position, `smooth` = each chord inverted to stay close to the one before, `cycle` = smooth, in all twelve keys round the circle of fourths.

## Adding a melody
Add to `MELODIES`: `notes` is `[semitones above the tonic, beats]` and `bpm` is the tempo. Ode to Joy in C starts `[[4,1],[4,1],[5,1],[7,1]…`. There are no rests; if you need one, hold the previous note.

## Polish folk tunes (still to do)
The plan asks for public-domain Polish folk tunes. **None are shipped yet.** I did not want to type melodies from memory and risk teaching someone a wrong tune. The three shipped melodies are well documented traditional/classical tunes in the public domain.

To add a Polish tune properly:
1. Find a notated source you can cite (for example a digitised 19th-century collection such as Oskar Kolberg's *Lud*, or a library scan) and confirm the work is out of copyright. The tune being old is not enough: a modern arrangement or transcription can still be protected.
2. Transcribe pitch and rhythm into the `notes` format above, and put the source in a comment beside the entry.
3. Check it by playing it back with the app's "Hear it first" and comparing against a recording.

## Content rules
Only ship melodies you can show are in the public domain, and keep the source in the code comment.
