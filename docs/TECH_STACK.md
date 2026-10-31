# GeoDrive tech stack

A plain static website with no framework, no build step and no backend of its own. All game logic runs in the browser.

## Front end
- Plain JavaScript (ES modules), HTML and CSS
- No npm packages, in the game or its tooling
- Web Audio API for engine, road and wind sound (FLAC loops from the CC0 Muted.io pack), `<audio>` for radio, canvas for gauges and the nav screen

## Map and car
- 3D map: Google Maps JavaScript API, photorealistic 3D element (`Map3DElement`)
- Car: low-poly glTF model generated in the browser by `carModel.js`, shown with `Model3DElement`
- Route line: `Polyline3DElement`

## Outside services
| Service | Used for | Key | Cost |
| --- | --- | --- | --- |
| Google Map Tiles | The 3D map | Yes | Billed beyond the free allowance |
| Google Elevation API | Ground height for the camera pivot | Yes | Billed beyond the free allowance |
| Google Geocoding API | Addresses, and the state for the radio | Yes | Billed beyond the free allowance |
| Google Routes API | FSD routes | Yes | Billed beyond the free allowance |
| OpenFreeMap vector tiles (OpenStreetMap data) | Road shapes, one-way streets, bridges, nav screen | No | Free |
| Radio Browser (radio-browser.info) | Station directory | No | Free |

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
| `cars.js` | Car profiles: gearing and engine sound | Yes |
| `gearbox.js` | Speed to gear and revs | Yes |
| `engineSound.js` | Audio buses, recorded engine, road, wind, effects | Browser, by ear |
| `engineMix.js` | Layer blends and loudness by revs and load | Yes |
| `synthEngine.js` | Synth engine: electric, option, fallback | Browser, by ear |
| `session.js` | Saves the trip across a refresh | Browser |
| `radio.js` | Station search, bands, tuning, playback | Parsing yes, playback browser |
| `carModel.js` | Builds car models and pictures by type and colour | Yes |
| `daylight.js` | Time-of-day tint | Yes |
| `dash.js` | Draws the gauges and nav screen | Browser |

## Saved data
The browser's `localStorage` holds the start point, settings and current trip. There is no database.

## Hosting and tools
- Server: psistorm.com (Amazon Linux), Apache serving static files from `/var/www/html/psistorm/geodrive`
- Deploy: `npm run deploy` (`scripts/deploy.sh`, rsync over SSH)
- Local run: `npm start` (`scripts/serve.mjs`, port 8765)
- Tests: `npm test` (Node's built-in test runner)
- Version control: local git repo, no remote yet
