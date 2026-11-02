# GeoDrive tech stack

A plain static website with no framework and no build step. All game logic runs in the browser. The only server code is `nowplaying.php`, which reads song titles from radio streams, and `log.php`, which saves performance logs sent from the game.

## Front end
- Plain JavaScript (ES modules), HTML and CSS
- No npm packages, in the game or its tooling
- Web Audio API for engine, road and wind sound (FLAC loops from the CC0 Muted.io pack), `<audio>` for radio, canvas for gauges and the nav screen

## Map and car
- 3D map: Google Maps JavaScript API, photorealistic 3D element (`Map3DElement`)
- Car: low-poly glTF model generated in the browser by `carModel.js`, shown with `Model3DElement`
- Route line: `Polyline3DElement`
- Walking: hand-written WebGL2, no 3D library. Loaded only the first time someone gets out

## Outside services
| Service | Used for | Key | Cost |
| --- | --- | --- | --- |
| Google Maps JavaScript, 3D Maps (Immersive Maps SKU) | The 3D map | Yes | Per map load, so per page load: $7 per 1,000 after 5,000 free a month. Moving the camera isn't a billable event |
| Terrain Tiles on AWS Open Data (Mapzen) | Ground height for the camera pivot, and the ground when walking | No | Free. Attribution on the HUD; full list at https://github.com/tilezen/joerd/blob/master/docs/attribution.md |
| Google Elevation API | Fallback for the first height only, if terrain tiles aren't answering | Yes | $5 per 1,000 after 5,000 free a month |
| Google Geocoding API | Addresses, the current town, and the state for the radio | Yes | $5 per 1,000 after 10,000 free a month |
| Google Routes API | FSD routes (Compute Routes Essentials) | Yes | $5 per 1,000 after 10,000 free a month. Don't add traffic-aware routing, side-of-road or heading: they move it to Pro at $10 |
| OpenFreeMap vector tiles (OpenStreetMap data) | Road shapes, one-way streets, bridges, nav screen, and buildings, land, water and trees when walking | No | Free |
| Radio Browser (radio-browser.info) | Station directory | No | Free |
| Radio stations' own streams | Song titles, read by `nowplaying.php` (ICY metadata) | No | Free |

Google usage and spend can only be seen in Google Cloud Console; the API key can't read them. Budgets there only send alerts, so a hard limit needs daily request limits per API.

## Code (`public/js/`)
| File | What it does | Tested |
| --- | --- | --- |
| `main.js` | Game loop, input, camera, on-screen display, dialogs | Browser |
| `physics.js` | Car movement (bicycle model) | Yes |
| `camera.js` | Map position and camera maths | Yes |
| `road.js` | Road network: current road, look-ahead, next turn | Yes |
| `route.js` | Paths to follow, with safe speeds for curves | Yes |
| `tiles.js` | Loads road data around the car | Browser |
| `vector.js` | Reads the vector tile format | Yes |
| `trip.js` | Trip stats | Yes |
| `settings.js` | Preferences saved in the browser | Browser |
| `perflog.js` | Performance log kept in the browser and sent on request | Yes |
| `town.js` | Current town from a reverse geocode | Yes |
| `cars.js` | Car profiles: gearing and engine sound | Yes |
| `gearbox.js` | Speed to gear and revs | Yes |
| `engineSound.js` | Audio buses, recorded engine, road, wind, effects | Browser, by ear |
| `engineMix.js` | Layer blends and loudness by revs and load | Yes |
| `synthEngine.js` | Synth engine: electric, option, fallback | Browser, by ear |
| `share.js` | Share links | Yes |
| `session.js` | Saves the trip across a refresh | Browser |
| `radio.js` | Station search, bands, tuning, playback | Parsing yes, playback browser |
| `carModel.js` | Builds car models and pictures by type and colour | Yes |
| `daylight.js` | Time-of-day tint | Yes |
| `headlights.js` | Headlight beam pattern | Yes |
| `dash.js` | Draws the gauges and nav screen | Browser |
| `foot.js` | Walking: loads and drops chunks around the person | Browser |
| `footData.js` | Buildings, land, water, roads, trees and doors from tiles | Yes |
| `footWalker.js` | The person: movement, what blocks them, camera | Yes |
| `footScene.js` | Meshes and ground pictures for walking | Yes |
| `footGl.js` | WebGL2 renderer | Matrices yes, drawing browser |

## Saved data
The browser's `localStorage` holds the start point, settings, current trip and up to 5 hours of performance log. There is no database. Logs sent with the Send log button are JSON files on the server, in a folder closed to the web.

## Hosting and tools
- Server: psistorm.com (Amazon Linux), Apache serving static files from `/var/www/html/psistorm/geodrive`
- Deploy: `npm run deploy` (`scripts/deploy.sh`, rsync over SSH)
- Logs: `npm run logs` (`scripts/fetch-logs.sh`) copies sent logs into `logs/`
- Local run: `npm start` (`scripts/serve.mjs`, port 8765)
- Tests: `npm test` (Node's built-in test runner)
- Version control: local git repo, no remote yet
