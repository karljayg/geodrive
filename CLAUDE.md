# GeoDrive

Drive a car over Google's photorealistic 3D map around any address, starting by default at Dulles, Virginia. Static site; its only server code is `log.php`, which saves performance logs, `nowplaying.php`, which reads song titles, and `places.php`, which keeps copies of Overture's place data. Live at https://www.psistorm.com/geodrive/.

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
- Overture's data, as asked for: `/var/www/html/psistorm/geodrive-cache`, made by `deploy.sh` and closed to the web, up to 3 GB.
- Logs: `/var/www/html/psistorm/geodrive-logs`, beside the deployed folder because rsync `--delete` empties that one. `deploy.sh` creates it and closes it to the web. `public/log.php` writes there and refuses more than 200 MB in all.
- Agecraft shares this server (`/agecraft`, `/agecraft3d`, ports 5173/5174). Leave those alone.

## API key
`public/config.json` holds `googleMapsApiKey`. It is gitignored and deployed by rsync, so never paste the key into a tracked file. The browser has to read it, so it is public on the live site: its protection is the HTTP referrer list in Google Cloud. The key needs the Maps JavaScript, Map Tiles, Elevation, Geocoding and Routes APIs (the legacy Directions API is denied on this key). Usage and spend are only visible in Google Cloud Console.

## API costs (the owner's top priority)
Prices are in `docs/TECH_STACK.md`. Before adding any Google call, work out what it costs per hour of driving and whether something free or a saved answer will do. Anything that repeats while driving must have a distance or time limit, and anything automatic must back off. The log's `geocodes`, `routes` and `elevations` columns count billed calls.
- Each page load is one billed map load, which nothing avoids.
- Building types and names come from free data: Overture Maps (`overture.js`, no key), then OpenStreetMap. Google Places, even once per building on first entry, was offered and the owner declined (2026-11-02). Don't OCR the map's labels: its canvas is sealed, and Google's terms forbid extracting them.
- Ground height uses free terrain tiles (`terrain.js`). Google Elevation is only for a first height when they fail. Comparing the two needs care: Google's own answer for a ridge moved 22 to 37 m between requests.
- The town is looked up at most every 8 km and 60 s, shared with the radio, and saved with the trip (`lookUpPlace`). Free services were tried: BigDataCloud's policy requires the device's own location and Nominatim's discourages periodic requests, so neither may be used. Place names in the road tiles matched Google on only 6 of 20 points of a real drive.
- Routes are saved in the browser, so a refresh doesn't pay again (`resumeRoute`). Automatic re-routes back off to one every 5 minutes (`rerouteWait`); a driver's own request is always answered.
- Walking adds no Google call: outdoors it shows the driving map, already loaded, and moving its camera isn't billed. What you can bump into comes from the free terrain tiles and the same OpenFreeMap tiles as the roads. The map element stays in the page, hidden and untouched, so getting back in the car is not another map load.

## How the camera works (the part the POC got wrong)
- `Map3DElement` orbits `center`. `center` sits a fixed distance ahead of the car along the camera heading (`leadDistance` in `public/js/camera.js`), so the car keeps its place on screen for any heading and the world spins around it.
- `center.altitude` is metres above sea level. Altitude 0 orbits a point about 88 m underground and the world swings past the car, so `sampleGround` in `main.js` tracks ground height from terrain tiles (`terrain.js`).
- The car is a `Model3DElement` in the scene, not a canvas drawing, so it can't drift off its map position. Model axes: x east, y north, z up.
- Don't override `requestAnimationFrame` when debugging: Map3D needs it. Use `__geodrive.hold = true` from the console to stop the game loop.
- The map streams from Google as the camera moves; there is no separate load step.
- A hidden preview pane throttles to about 2 fps, so measure performance with the pane visible.

## Performance log
- `perflog.js` adds a row every 5 s, saved to `localStorage` a minute at a time, keeping 5 hours across refreshes. `COLUMNS` names the fields; `state` 2 rows are a hidden tab and mean little, and `state` 3 rows are on foot, when `driveMs` is the walk and `footChunks` and `footTriangles` show its size.
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

## Walking (`L`)
- Rooms are drawn with hand-written WebGL2 (`footGl.js`), loaded only at the first L. There is no 3D library. Don't destroy the WebGL context on leaving: a canvas can never get another, so L would fail the second time. `footGl` keeps one for the visit and only the meshes are freed.
- Axes are x east, y north, z up in metres from the parked car, right-handed, the same as the car model. Bearings run the same way as `car.heading`. Tests check that facing north has east on screen-right, that D walks screen-right, and that faces point the right way. A mirrored world or a ground drawn from underneath passes any test that only checks numbers, so keep those.
- Tile polygons: a positive ring in tile pixels is an outer ring, a negative one is a hole of the outer ring before it, and one feature often holds hundreds of buildings (`polygonsOf`). These tiles have no building types; `render_height`, `render_min_height` and `colour` are all there is, and a `render_height` of 5 means nobody mapped it. `buildings.js` works out type and floors from places in or just outside a footprint, land use and size, without Google, and saves them per building. A building nothing identifies is locked rather than guessed, at the owner's request (plan and tables in `docs/INTERIORS.md`). Buildings are cut to their own tile (`clipRing`): that removes the copies a tile holds of its neighbour's buildings, and edges along the cut (`seam`) are not walls.
- Being indoors is worked out from where the person stands (`footprintAt`). There are no doors: L beside a wall moves the person through it (`enterBuilding`, `leaveBuilding`). A building that fills in around someone just puts them inside it, and L takes them out by its nearest wall.
- Nothing about moving depends on the height the person was last at. Slope is the ground 1 m ahead against the ground here, which is why a terrain tile arriving late can't strand anyone.
- Inside, a floor is worked out in the building's own frame (u along its longest wall, v across it, metres from its centre), because metres from the car change with every parking spot. `layoutFloor` makes plain numbers, saved per building and floor by `BuildingStore`; `roomMesh` draws them and `solidsOf` makes them block. Only `OPEN_TYPES` (`buildings.js`) can be entered; the rest say they're locked, and the queue of what each needs is in `docs/INTERIORS.md`. Floors with corridors and garages have their own layouts in `corridorFloor` (see `CORRIDORS`) and `parkingFloor` (`furnish.js`). The rules layouts follow are at the top of `docs/INTERIORS.md`. A building's `look` is saved in its plan. Don't wipe saved buildings for a layout change: see "Saved buildings survive updates" in `docs/INTERIORS.md`. Overture tiles are read in `overtureWorker.js`, as a Manhattan tile would stop the game. `public/_rooms.html` (not deployed) draws any type with no map and no map charge: `/_rooms.html?t=office:36x24:2,bank:20x15:1` is type:size:floor. Each other type's rooms are in `TYPE_ZONES` and each room's contents in `RECIPES`; items the kit lacks are boxes in `BUILT` (`furniture.js`). `CHECK_BUDGET`, `MOST_SOLIDS` and `WINDOW` keep a first visit quick. Stairs and lifts (`coreOf`) are saved in the building's plan, as they must stand in one place on every floor; `Foot.level` is the floor, and only the current floor is drawn or blocks.
- Furniture is Kenney's kit (CC0). After changing which models `ITEMS` uses, run `node scripts/build-furniture.mjs`. Models are z up with fronts towards +y, standing on z = 0. The conversion is a rotation, not a mirror, so winding holds; keep the tests on it.
- Outdoors nothing is drawn by us: the person is 17 `Model3DElement`s on the map (`footPerson.js`: standing, 8 walking, 8 running), and only the current one has any size. Footprints are invisible walls, so they can differ a little from the 3D map's buildings. Rooms are the only thing `footGl.js` draws, on a canvas that is clear otherwise.
- Rooms are dark unless lit: `roomLight.js` bakes each floor's windows and the sun's position into a small map, redone every half hour of game time and sampled in `footGl.js`, along with room lights (F at a switch by a door, `switchSpots`, kept per floor in `plan.state`; about a quarter of large buildings need a building key, `switchNeedsKey`) and a carried light. Beams don't stop at walls. Outdoors a carried light is drawn on the same `#night` and `#beam` canvases as the headlights.
- `settings.hour` is the one game clock, moved by `tickClock` in `main.js`: real time at the wheel, `GAME.clock.onFootHoursPerMinute` game hours a real minute on foot. Anything shown from it must key on `clockText`, not the raw hour, which changes every frame.
- The camera on foot is the driving camera at half its range (`placeCamera`, `syncFootScene`), so it doesn't dodge walls.

## F on foot
F is the one key for anything within reach: anything a player can do by standing somewhere gets a question in `Foot.choices`, even if it has its own key too. With no question to ask, `lookHere` says what the thing is (`look_` lines in `sayingsConfig.js`). New interactions go there. Outdoors it says what `Place.whatsAround` finds. Pushed things are kept in `plan.state[floor].moved` by where they started, and an entry's ninth value is that name, so what has happened to a thing follows it. In the car F stays self-driving, except stopped with no destination, when it offers a short list (`pressCarF`).

## Needs and the clock
Tunable numbers belong in server files, the same for every player, never in `localStorage`. All of these are in `public/js/gameConfig.js`, per game hour, each with the real figure it came from; tune there and nowhere else. `vitals.js` (pure, tested) holds the stats, 100 being good, and `pass` returns events for `sayEvents` in `main.js`. `advanceTime` runs the clock, an hour a real minute on foot and real time in the car, while nothing is paused. Stats are saved in `geodrive_vitals_v1` every 20 s. To tune from play: the performance log has a column for each stat and the hour, `vital` events mark accidents, collapses, sleeps and what was used, and the phone's Health app shows rates and totals. `__geodrive.vitals` is there in the console. Outlets (`outletSpots`) and tap and machine results are decided by hash, so they don't change between visits and aren't saved.

## Start point
The header, nav screen and tab title show the current town (`refreshTown`: a billed reverse geocode, see API costs). The dialog on load keeps the default or overrides it with an address (Google Geocoding), and an override is saved in the browser's `localStorage`. Every start is put on the nearest road.

## Files
- `public/js/road.js`: road network, matching, look-ahead, next turn. Pure, tested.
- `public/js/route.js`: `Path`, a line to drive with safe speeds. Pure, tested.
- `public/js/tiles.js`: loads road tiles around the car. `public/js/vector.js`: reads roads out of vector tiles. Pure, tested.
- `public/js/streets.js`: where street names go on the phone's Map, only where they fit. Pure, tested. The names are the same free tiles' `transportation_name` layer, read only while that app is open (`RoadTiles.streetNames`), so driving doesn't pay for them.
- `public/js/terrain.js`: ground height from free terrain tiles. Pure apart from loading a tile, tested.
- `public/js/physics.js`: bicycle-model car. Pure, tested. Tune `CAR` here.
- `public/js/camera.js`: geo and camera maths. Pure, tested.
- `public/js/trip.js`: trip stats for the HUD and the pause screen (`P`). A new start or Reset from the header begins a new trip. Pure, tested.
- `public/js/perflog.js`: the performance log. Pure apart from `observeBrowser`, tested. `public/js/town.js`: the town name from a reverse geocode. Pure, tested.
- `public/js/settings.js`: preferences saved in the browser. The panel is in `index.html`; new settings (the owner plans a choice of cars) go in `DEFAULTS` plus a `<section>` there. The car's `scale` is 1 for real size, 0.9 by default.
- `public/js/main.js`: input, game loop, map setup, HUD. Tune cameras, zoom and the start point here.
- `public/js/carModel.js`: the low-poly cars, built from code so there is no asset licence.
- `public/js/drops.js`: things left behind, saved per browser in `geodrive_drops_v1`, indoors in the building's frame and outdoors by lat/lng, shown in `roomMesh` and as `Model3DElement`s by `syncDrops`. No Google cost: moving nothing and adding models to the loaded map isn't billed. Pure, tested.
- `public/js/itemArt.js`: a picture for each thing in the bag or car. A new item needs one, and a test checks that. Pure, tested.
- `public/js/pocket.js`: the phone, compass, notepad and bag on foot, and `pocketData.js` (pure, tested) and `pocketArt.js`. To add one: an entry in `TRAY` or `APPS`, a picture in `ART`, and for an app a render function.
- `public/js/footActions.js`: what F does to things, and what they hold. Pure, tested. What has happened is in `plan.state` by floor, not the saved layout.
- `public/js/roomLight.js`: light in a room from its windows and the sun, and what a carried light reaches. Pure, tested.
- `public/js/sounds.js`: the sound of using each thing, made from tones and filtered noise, and which sound goes with what (`USED`, `SWITCHED`, `BAG_ITEMS`); anything unlisted plays `ack`. Pure apart from `play`, tested. They go through `engine.effect`, on the same bus and volume as the signal tick, played from buffers `bakeSounds` renders as soon as audio starts. `sfx` in `main.js` is the way to play one and logs a `sound` event every 30 s (`outputMs`, `behindMs`, and `clockMs` against `wallMs`, which shows a stalled audio clock). `audio` events mark the browser stopping or starting audio. `public/_sounds.html` (not deployed) has a button for each. Nothing here can hear them, so check by ear after changing one.
- `public/js/keyList.js`: the K list, one for the car and one for on foot. Pure, tested. Change it when a key changes.
- `public/js/sayingsConfig.js`: everything the game says, several ways for the common ones; `public/js/sayings.js` takes turns through them. Pure, tested. A `say` in the config is a key there or plain text. New common messages go there rather than in code.
- `public/js/gameConfig.js`: every survival number. `public/js/vitals.js`: the person's needs. Pure, tested.
- `public/js/buildings.js`: what a building is, its floors and the saved record. Pure, tested.
- `public/js/furnish.js`: lays out a floor. `public/js/furniture.js`: the item catalogue and models. Pure, tested. `scripts/build-furniture.mjs`: makes `public/furniture.bin` from `assets/kenney-furniture`.
- `public/js/footData.js`: buildings, land, water, roads, POIs and trees from a tile, in metres. Pure, tested. `public/js/footWalker.js`: the person, what stops them, the camera. Pure, tested. `public/js/footScene.js`: room meshes. `public/js/footPerson.js`: the person's joints, gaits and baked frames. Pure, tested. Pure, tested. `public/js/footGl.js`: the renderer, with tested matrix helpers. `public/js/foot.js`: streams chunks and ties these together.
