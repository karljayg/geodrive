# GeoDrive

Drive a car over Google's 3D map, starting at Dulles, Virginia or at any address you enter. The car follows the road and rides over bridges. Top speed is 500 mph.

Live: https://www.psistorm.com/geodrive/

## Controls

| Key | Action |
| --- | --- |
| W / ↑ | Accelerate |
| S / ↓ | Brake, then reverse |
| A D / ← → | Steer (only while moving). Holding a key overrides road following, which is how to take a turn |
| Space | Hold to zoom out; the view stays where you let go |
| Z | Hold to zoom back in |
| Shift | Handbrake |
| C | Switch camera |
| H | Headlights on / off |
| P | Pause, with the trip's time, miles and other stats. P or Esc resumes |
| O | Settings: car size, remembered in this browser |
| K | Show or hide the key list |
| L | Get out of a stopped car and walk (WASD, mouse to look, Shift to run). Beside a building, L goes in. On the ground floor, L leaves from anywhere. Beside the car, L gets back in |
| Q / E | One press signals left / right: takes the next turn that way, or changes lane if none is coming up. Press again to cancel |
| G | Enter a destination; the car drives there in FSD |
| F | FSD on / off. Steering or braking also turns it off |
| - / = | FSD cruise speed down / up by 10 mph. W also speeds up without turning FSD off |

**Start** and **Reset** are header buttons only (no hotkeys): change the start point, or put the car back at the saved start.

Full key list and behaviour: `docs/FEATURES.md`. Tech stack: `docs/TECH_STACK.md`.

## Run locally

Copy `public/config.example.json` to `public/config.json` and set `googleMapsApiKey`. The key needs the Maps JavaScript, Map Tiles, Elevation, Geocoding and Routes APIs, plus billing.

```bash
npm start
```

Then open http://localhost:8765/.

## Test and deploy

```bash
npm test
```

```bash
npm run deploy
```

See `CLAUDE.md` for the server, the API key and how the camera works.

Road data: OpenFreeMap, © OpenMapTiles, © OpenStreetMap contributors (ODbL).
