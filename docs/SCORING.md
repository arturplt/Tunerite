# Scoring

Implemented in `scoreEvent` / `aggregate` (CORE). All thresholds are constants near the top of the scoring section, so they are easy to tune.

## Per note (event)
Frames arrive every 20 ms. A frame is **unvoiced** (`null`) when the mic is below the gate, the detector is not confident, or no pitch is found.

- **Grace period:** the first `min(0.3 s, 40% of the note)` is not counted for accuracy, deviation or stability, so reaction time is not punished twice. It counts only toward Attack.
- **Accuracy** = frames within tolerance ÷ all frames after the grace period. Unvoiced frames are misses, so silence scores zero.
- **Deviation** = *median* signed error in cents (positive = sharp). Median, so one stray frame cannot skew it.
- **Stability** = standard deviation of the error after a 9-frame (~180 ms) moving average. The average cancels 4–7 Hz vibrato, so normal vibrato is not treated as wobble, while slower drift still is.
- **Attack** = time from note start until the pitch stays within tolerance for 0.15 s.

Sub-scores (0–100):

| Part | Formula |
|---|---|
| acc | accuracy × 100 |
| stab | 100 × (1 − sd / 40¢), floored at 0 |
| att | 100 if ≤ 0.3 s, then linear down to 0 at 1.5 s; 0 if never locked |
| dev | 100 × (1 − \|dev\| / (2 × tolerance)), floored at 0 |

**Note score** = 0.50·acc + 0.25·stab + 0.15·att + 0.10·dev.

Glides (sirens) use the same formulas but the target moves linearly from `midi` to `midi2` over the note.

## Whole exercise
Duration-weighted mean of note scores, rounded. **Stars:** 1 at ≥ 50, 2 at ≥ 70, 3 at ≥ 90.

Tolerance: Easy ±50¢, Medium ±25¢, Hard ±10¢.

## Known quirks
- A *steady but wrong* note still earns the stability points (up to 25). The score stays low and the star count is 0, but it is not zero. If that bothers you, multiply stab by `accuracy` in `scoreEvent`.
- The weights are a first guess. Tune them by singing real takes, watching the Results screen, and adjusting `WEIGHTS`, `STAR_AT`, and the `40` / `0.3` / `1.2` constants. Run `node tests/core.test.js` afterwards; the ordering tests tell you if you broke the intended ranking (perfect > sharp > wobbly > late > silent).

## Progress
- **Streak:** consecutive days with at least one session. Not having practised *yet today* does not break it. The accuracy chart is never reset by a missed day.
- **Range growth:** current range span minus the span of the first measurement.
- **Guide tone fade:** each score ≥ 70 on an exercise lowers its guide-tone volume by 25%; after four passes it is silent (Settings → Guide tone → "Fades as you improve").
