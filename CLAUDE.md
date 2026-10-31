# GeoDrive

Drive a car over Google's photorealistic 3D map around any address, starting by default at Dulles, Virginia. Static site, no backend. Live at https://www.psistorm.com/geodrive/.

See `docs/FEATURES.md` for what the game does and `docs/TECH_STACK.md` for how it's built. Update them when behaviour changes.

## Workflow (owner, 2026-10-31)
Deploy with `npm run deploy` when a change is done, without being asked, so the owner can test it on the live URL.

## Run, test, deploy
- Local: `npm start`, then http://localhost:8765/ (the `geodrive` entry in `.claude/launch.json`). Don't open it from `file://`; it has to fetch `config.json`.
- Tests: `npm test` (physics, camera helpers and roads, no browser).
- Deploy: `npm run deploy` rsyncs `public/` to the server. Needs no service and no Apache change.

## Server
- SSH: `ssh -i ~/Downloads/"karl ptfs aws.pem" ec2-user@psistorm.com`. `scripts/deploy.sh` uses that key; override with `GEODRIVE_SSH_KEY`.
- Files: `/var/www/html/psistorm/geodrive`, served by the existing psistorm.com vhost.
- Agecraft shares this server (`/agecraft`, `/agecraft3d`, ports 5173/5174). Leave those alone.

## API key
`public/config.json` holds `googleMapsApiKey`. It is gitignored and deployed by rsync, so never paste the key into a tracked file. The browser has to read it, so it is public on the live site: its protection is the HTTP referrer list in Google Cloud. The key needs the Maps JavaScript, Map Tiles, Elevation, Geocoding and Routes APIs (the legacy Directions API is denied on this key). Usage and spend are only visible in Google Cloud Console.

## How the camera works (the part the POC got wrong)
- `Map3DElement` orbits `center`. `center` sits a fixed distance ahead of the car along the camera heading (`leadDistance` in `public/js/camera.js`), so the car keeps its place on screen for any heading and the world spins around it.
- `center.altitude` is metres above sea level. Altitude 0 orbits a point about 88 m underground and the world swings past the car, so `sampleGround` in `main.js` tracks ground height with the Elevation API.
- The car is a `Model3DElement` in the scene, not a canvas drawing, so it can't drift off its map position. Model axes: x east, y north, z up.
- Don't override `requestAnimationFrame` when debugging: Map3D needs it. Use `__geodrive.hold = true` from the console to stop the game loop.
- The map streams from Google as the camera moves; there is no separate load step.
- A hidden preview pane throttles to about 2 fps, so measure performance with the pane visible.

## Roads and bridges
- Road shapes, one-way and bridge tags come from OpenFreeMap vector tiles (OpenStreetMap data, zoom 14, decoded in `vector.js`; about 0.4 s, no key). The attribution on the HUD is required. Nothing may depend on tiles arriving: without one the car drives freely until a retry works. Public Overpass servers were tried first and are too often down. There is no lane data, so a lane change is a fixed sideways shift.
- `followRoad` in `main.js` matches the car to a road each frame and aims at a point further along it. Holding a steering key overrides it, and that is how to take a junction.
- On a way tagged as a bridge the model uses `RELATIVE_TO_MESH`, because ground height there is the valley floor. It stays `RELATIVE_TO_GROUND` elsewhere, because the mesh includes trees and overpasses the car would climb on to.

## Signals and FSD
- `Q`/`E` (`pressSignal`): `RoadNet.findTurn` looks for the next non-service road on that side, far enough ahead to brake and within about 12 s of driving. If found the car follows that `Path`, braking for the corner. If not it changes lane. Steering cancels.
- Destination (`G`): Geocoding, then Routes API `computeRoutes`, into a `Path` with cruise speeds from each step's distance and duration. FSD (`F`) follows it and works the pedals. Steering or braking drops FSD, W raises the cruise speed without dropping it, `-`/`=` shift cruise speed by 10 mph. Leaving the route by 40 m asks for a new route, at most every 8 s, because each one is billed.
- `Path` in `route.js` resamples to 8 m and precomputes a safe speed at every point, with a backward pass so braking starts in time.

## Start point
The dialog on load keeps the default or overrides it with an address (Google Geocoding), and an override is saved in the browser's `localStorage`. Every start is put on the nearest road.

## Files
- `public/js/road.js`: road network, matching, look-ahead, next turn. Pure, tested.
- `public/js/route.js`: `Path`, a line to drive with safe speeds. Pure, tested.
- `public/js/tiles.js`: loads road tiles around the car. `public/js/vector.js`: reads roads out of vector tiles. Pure, tested.
- `public/js/physics.js`: bicycle-model car. Pure, tested. Tune `CAR` here.
- `public/js/camera.js`: geo and camera maths. Pure, tested.
- `public/js/trip.js`: trip stats for the HUD and the pause screen (`P`). A new start or `R` begins a new trip. Pure, tested.
- `public/js/settings.js`: preferences saved in the browser. The panel is in `index.html`; new settings (the owner plans a choice of cars) go in `DEFAULTS` plus a `<section>` there. The car's `scale` is 1 for real size, 0.9 by default.
- `public/js/main.js`: input, game loop, map setup, HUD. Tune cameras, zoom and the start point here.
- `public/js/carModel.js`: the low-poly cars, built from code so there is no asset licence.
