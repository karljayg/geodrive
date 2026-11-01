# GeoDrive

Drive a car over Google's photorealistic 3D map around any address, starting by default at Dulles, Virginia. Static site; its only server code is `log.php`, which saves performance logs, and `nowplaying.php`, which reads song titles. Live at https://www.psistorm.com/geodrive/.

See `docs/FEATURES.md` for what the game does and `docs/TECH_STACK.md` for how it's built. Update them when behaviour changes.

## Workflow (owner, 2026-10-31)
Deploy with `npm run deploy` when a change is done, without being asked, so the owner can test it on the live URL.

## Run, test, deploy
- Local: `npm start`, then http://localhost:8765/ (the `geodrive` entry in `.claude/launch.json`). Don't open it from `file://`; it has to fetch `config.json`.
- Tests: `npm test` (physics, camera helpers and roads, no browser).
- Deploy: `npm run deploy` rsyncs `public/` to the server. Needs no service and no Apache change.
- Logs: `npm run logs` copies what players sent with the Send log button into `logs/` (gitignored).

## Server
- SSH: `ssh -i ~/Downloads/"karl ptfs aws.pem" ec2-user@psistorm.com`. `scripts/deploy.sh` uses that key; override with `GEODRIVE_SSH_KEY`.
- Files: `/var/www/html/psistorm/geodrive`, served by the existing psistorm.com vhost.
- Logs: `/var/www/html/psistorm/geodrive-logs`, beside the deployed folder because rsync `--delete` empties that one. `deploy.sh` creates it and closes it to the web. `public/log.php` writes there and refuses more than 200 MB in all.
- Agecraft shares this server (`/agecraft`, `/agecraft3d`, ports 5173/5174). Leave those alone.

## API key
`public/config.json` holds `googleMapsApiKey`. It is gitignored and deployed by rsync, so never paste the key into a tracked file. The browser has to read it, so it is public on the live site: its protection is the HTTP referrer list in Google Cloud. The key needs the Maps JavaScript, Map Tiles, Elevation, Geocoding and Routes APIs (the legacy Directions API is denied on this key). Usage and spend are only visible in Google Cloud Console.

## API costs (the owner's top priority)
Prices are in `docs/TECH_STACK.md`. Before adding any Google call, work out what it costs per hour of driving and whether something free or a saved answer will do. Anything that repeats while driving must have a distance or time limit, and anything automatic must back off. The log's `geocodes`, `routes` and `elevations` columns count billed calls.
- Each page load is one billed map load, which nothing avoids.
- Ground height uses free terrain tiles (`terrain.js`). Google Elevation is only for a first height when they fail. Comparing the two needs care: Google's own answer for a ridge moved 22 to 37 m between requests.
- The town is looked up at most every 8 km and 60 s, shared with the radio, and saved with the trip (`lookUpPlace`). Free services were tried: BigDataCloud's policy requires the device's own location and Nominatim's discourages periodic requests, so neither may be used. Place names in the road tiles matched Google on only 6 of 20 points of a real drive.
- Routes are saved in the browser, so a refresh doesn't pay again (`resumeRoute`). Automatic re-routes back off to one every 5 minutes (`rerouteWait`); a driver's own request is always answered.

## How the camera works (the part the POC got wrong)
- `Map3DElement` orbits `center`. `center` sits a fixed distance ahead of the car along the camera heading (`leadDistance` in `public/js/camera.js`), so the car keeps its place on screen for any heading and the world spins around it.
- `center.altitude` is metres above sea level. Altitude 0 orbits a point about 88 m underground and the world swings past the car, so `sampleGround` in `main.js` tracks ground height from terrain tiles (`terrain.js`).
- The car is a `Model3DElement` in the scene, not a canvas drawing, so it can't drift off its map position. Model axes: x east, y north, z up.
- Don't override `requestAnimationFrame` when debugging: Map3D needs it. Use `__geodrive.hold = true` from the console to stop the game loop.
- The map streams from Google as the camera moves; there is no separate load step.
- A hidden preview pane throttles to about 2 fps, so measure performance with the pane visible.

## Performance log
- `perflog.js` adds a row every 5 s, saved to `localStorage` a minute at a time, keeping 5 hours across refreshes. `COLUMNS` names the fields; `state` 2 rows are a hidden tab and mean little.
- To read a log: `fps` low with `jsAvg` small means the map or GPU, not our code. `driveMs`, `sceneMs`, `dashMs` and `navWorst` split our share. Compare `fps` against `mapRequests`, `lineVertices`, `navVertices` and position. `slowFrame` events name the scripts behind frames over 200 ms; `town`, `route`, `graphics`, `load` and `sent` events mark what happened.
- Idle costs: `syncScene` writes to the map only when a value has really moved (`moved`), so a parked car leaves it alone, and the nav screen redraws only when something on it changed. A refresh rebuilds the saved route (`resumeRoute`) rather than paying for another.
- Costs that scale with place or trip length, and how they're kept down: the map draws only `ROUTE_DRAWN` metres of route, the nav screen caches its roads on a layer in `dash.js`, `RoadTiles.evict` releases the furthest tiles one at a time rather than everything at once, and the HUD (`show`, `gauge` in `main.js`, `fit` in `dash.js`) writes only what changed, updates its figures at 10 Hz and reads element sizes only after a resize. `settings.mapScale` lays the map out larger or smaller and CSS-scales it to fit, which is the main lever on GPU load. Avoid `backdrop-filter` over the map.

## Roads and bridges
- Road shapes, one-way and bridge tags come from OpenFreeMap vector tiles (OpenStreetMap data, zoom 14, decoded in `vector.js`; about 0.4 s, no key). The attribution on the HUD is required. Nothing may depend on tiles arriving: without one the car drives freely until a retry works. Public Overpass servers were tried first and are too often down. There is no lane data, so a lane change is a fixed sideways shift.
- `followRoad` in `main.js` matches the car to a road each frame and aims at a point further along it. Holding a steering key overrides it, and that is how to take a junction.
- On a way tagged as a bridge the model uses `RELATIVE_TO_MESH`, because ground height there is the valley floor. It stays `RELATIVE_TO_GROUND` elsewhere, because the mesh includes trees and overpasses the car would climb on to.

## Signals and FSD
- `Q`/`E` (`pressSignal`): `RoadNet.findTurn` looks for the next non-service road on that side, far enough ahead to brake and within about 12 s of driving. If found the car follows that `Path`, braking for the corner. If not it changes lane. Steering cancels.
- Destination (`G`): Geocoding, then Routes API `computeRoutes`, into a `Path` with cruise speeds from each step's distance and duration. FSD (`F`) follows it and works the pedals. Steering or braking drops FSD, W raises the cruise speed without dropping it, `-`/`=` shift cruise speed by 10 mph. Leaving the route by 40 m asks for a new route, 8 s after the last at first and backing off to every 5 minutes, because each one is billed.
- `Path` in `route.js` simplifies the line, merges bends mapped a few metres apart, rounds each corner into an arc (`APEX_CUT` metres inside the mapped corner), resamples to 8 m and sets a safe speed from each arc's radius, with a backward pass so braking starts in time. The car drives it with pure pursuit (`pursuitYaw`).

## Radio song titles
Titles travel in the stream as ICY metadata, which `<audio>` hides and most stations' CORS rules keep from `fetch` (7 of 34 nearby ones allowed it, 27 sent titles). So `public/nowplaying.php` opens the stream, reads to the first title and hangs up, sharing each answer for 15 s and opening at most 60 streams a minute. It takes a Radio Browser station id, never a URL, and refuses non-public addresses. `songFrom` in `radio.js` turns the raw text into a song. `npm start` forwards these requests to the live server, so restart it after changing `serve.mjs`.

## Start point
The header, nav screen and tab title show the current town (`refreshTown`: a billed reverse geocode, see API costs). The dialog on load keeps the default or overrides it with an address (Google Geocoding), and an override is saved in the browser's `localStorage`. Every start is put on the nearest road.

## Files
- `public/js/road.js`: road network, matching, look-ahead, next turn. Pure, tested.
- `public/js/route.js`: `Path`, a line to drive with safe speeds. Pure, tested.
- `public/js/tiles.js`: loads road tiles around the car. `public/js/vector.js`: reads roads out of vector tiles. Pure, tested.
- `public/js/terrain.js`: ground height from free terrain tiles. Pure apart from loading a tile, tested.
- `public/js/physics.js`: bicycle-model car. Pure, tested. Tune `CAR` here.
- `public/js/camera.js`: geo and camera maths. Pure, tested.
- `public/js/trip.js`: trip stats for the HUD and the pause screen (`P`). A new start or `R` begins a new trip. Pure, tested.
- `public/js/perflog.js`: the performance log. Pure apart from `observeBrowser`, tested. `public/js/town.js`: the town name from a reverse geocode. Pure, tested.
- `public/js/settings.js`: preferences saved in the browser. The panel is in `index.html`; new settings (the owner plans a choice of cars) go in `DEFAULTS` plus a `<section>` there. The car's `scale` is 1 for real size, 0.9 by default.
- `public/js/main.js`: input, game loop, map setup, HUD. Tune cameras, zoom and the start point here.
- `public/js/carModel.js`: the low-poly cars, built from code so there is no asset licence.
