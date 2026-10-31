# Engine recordings

All loops come from **Performance Cars** by muted.io (https://muted.io/performance-cars/), a free pack listed as CC0: 68 stereo WAV field recordings, 96 kHz, 24-bit. The zip has no licence file or notes beyond that page, and files are only numbered.

**The recordings aren't labelled with a car, engine or RPM.** The set names below describe how they measure (pitch and tone), chosen without listening. They don't claim to be a particular vehicle. Reference RPM is an estimate: the note measured in the stretch, scaled from an assumed idle.

| Loop | Source file | From | Source length | Loop length | Note | Reference RPM (estimate) |
| --- | --- | --- | --- | --- | --- | --- |
| sports/idle | 002 | 3.48 s | 18.3 s | 2.59 s | 63 Hz | 950 |
| sports/load | 003 | 3.08 s | 10.5 s | 1.03 s | 63 Hz | 950 |
| sports/mid | 034 | 28.16 s | 38.0 s | 0.59 s | 164 Hz | 2473 |
| sports/high | 012 | 0.5 s | 3.0 s | 1.91 s | 340 Hz | 5127 |
| muscle/idle | 019 | 13.24 s | 15.4 s | 1.30 s | 58 Hz | 750 |
| muscle/load | 019 | 0.0 s | 15.4 s | 0.61 s | 58 Hz | 750 |
| muscle/mid | 025 | 0.48 s | 7.7 s | 0.37 s | 90 Hz | 1164 |
| muscle/high | 028 | 2.0 s | 6.0 s | 1.08 s | 333 Hz | 4306 |
| normal/idle | 022 | 1.92 s | 29.7 s | 0.91 s | 60 Hz | 850 |
| normal/load | 022 | 8.44 s | 29.7 s | 2.05 s | 64 Hz | 907 |
| normal/mid | 035 | 9.75 s | 28.7 s | 0.67 s | 145 Hz | 2054 |
| normal/high | 043 | 6.25 s | 8.3 s | 0.82 s | 307 Hz | 4350 |
| truck/idle | 016 | 4.04 s | 12.3 s | 1.29 s | 43 Hz | 650 |
| truck/load | 016 | 9.08 s | 12.3 s | 1.47 s | 47 Hz | 710 |
| truck/mid | 007 | 12.04 s | 14.4 s | 0.62 s | 76 Hz | 1149 |

Source files are `NNN-performance-cars-mutedio.wav`. Originals aren't kept in this repo (266 MB zip).

## How they were made
`scripts/prepare-engine-audio.py`: mixed to mono, 44.1 kHz, 28 Hz high-pass, cut where the waveform repeats best, 0.12 s equal-power crossfade, level-matched, saved as 16-bit FLAC. FLAC rather than OGG because it adds no padding that would click at a loop point, and at under 1 MB in total the size is no problem.

## Limits
- Within each set only layers from the same recording are the same car. Others are matched by pitch and tone.
- No set has loud and quiet recordings at every rev level, and none has a separate coast recording: off-throttle is the same loops with less level and treble.
- The truck has no high-rev layer. It was the lowest-pitched material available.
- Weakest loops by measurement: `normal/mid` (noisy, poor loop match), `muscle/high` (7 dB level swing), `sports/high` (5 dB swing).
- Road and wind are filtered noise, not recordings. The electric car and "Classic synth" stay synthesised, and synth is the fallback if recordings can't load.
