# GeoDrive features and behaviour

The record of what the game does and why. Update it when behaviour changes.

## Walking (L)
With the car stopped (under 1 mph), L gets out. A person stands on a clear side of the car. You stay on the driving map, so buildings, streets and everything else look the same and nothing loads again. FSD and signals turn off, so the car can't drive away on return. L is refused on a bridge, where the ground is the valley floor. The radio keeps playing; the engine goes quiet. Trip miles and the trip clock stop.

- **Moving:** the same angle as the closest driving camera (CHASE) at half its distance, with the person where the car would be on screen. Q and E turn the view left and right while held, which is how to see round a building; walls don't move the camera. The mouse also turns it after a click (Esc frees the mouse and leaves you on foot). WASD moves relative to the view, Shift runs. Walking and running speeds are in Settings, 3 and 8.4 m/s to start. On a touch screen, drag to turn and use the arrow buttons. The figure has knees, elbows and a torso that leans and twists, with an 8-frame walk and an 8-frame run, and stands when still.
- **The place:** the driving map itself. Real building footprints and water from the road map's tiles are invisible walls, so they can differ a little from the buildings you see. Trees and anything else the map only shows in its picture don't stop you. A tile that hasn't arrived never stops you.
- **What stops you:** building walls, water and the car, and any rise steeper than about 30°. A low step is fine, as is walking under a part of a building raised overhead.
- **Buildings:** there are no doors to find. Next to a wall, the hint says "Press L to go inside", and L puts you just inside, in a ground-floor room of that footprint, 3 m high and empty, seen from above. L inside returns you to where you went in. Next to the car as well, L gets in the car.
- **Back to the car:** the label at the bottom of the view gives the distance and direction to the car, and the nav screen marks it with a yellow dot. Within about 3 m of the car, press L.
- **While on foot:** Destination asks you to get back in first. Start and Reset put you back in the car. Time of day, radio, pause and settings all still work. A refresh puts you back in the driver's seat.

## Driving
- Top speed 500 mph, reached in about 30 seconds. A stopped car can't turn, and reverse steers the other way.
- The camera orbits a point ahead of the car at ground height, so the map rotates on the car rather than sliding under it.
- Space zooms out and Z zooms in, and the view stays where you let go. Car size stays in scale with the map.

## Roads and bridges
- With no steering key held, the car follows the road it's on. Holding a steering key overrides this, which is how to take a turn or leave the road.
- On a road marked as a bridge the car rides on the 3D surface. Elsewhere it stays on the ground, because the 3D surface includes trees and overpasses.
- Known limits: unmarked bridges and raised ramps aren't handled. At top speed on dense streets the car can briefly lose the road.

## Start point
On load the game offers the default start or an address. An address puts the car on the nearest road and becomes the new default in that browser. While driving, **Start** in the header opens that dialog again, and **Reset** puts the car back at the saved start (both menu-only, no hotkeys, so they aren't hit by accident). The header, the top of the nav screen and the browser tab name the town the car is in, looked up from Google at most every 8 km and once a minute, as each lookup is billed, so the name can lag a few minutes behind at speed. The answer is kept with the trip, so a refresh doesn't ask again.

## Signals (Q, E)
One press takes the next non-service road on that side, far enough ahead to brake and within about 12 seconds of driving. If there isn't one it changes lane. Pressing again cancels, and steering cancels. There's no lane data, so a lane change is a fixed 3.5 m shift, one lane either way, never across a two-way road's centre line.

## Destination and FSD (G, F)
- A destination gets a Google route, shown as a blue line, and FSD turns on.
- Steering or braking turns FSD off. F turns it back on, with a new route if the car has left the old one. Without F, a car that keeps leaving its route asks again after 8 seconds, then 16, doubling up to every 5 minutes, as each request is billed.
- W raises speed without turning FSD off, but curves still apply. - and = change cruise speed by 10 mph.
- Cruise speed is Google's trip time for each part of the route raised 40%, between 25 and 100 mph.
- FSD rounds corners into an arc that clips the inside, on a planned speed: it brakes firmly just early enough for each corner (about 20 mph for a 90 degree junction, more for wider bends) and accelerates once clear. Signalled turns use the same line.
- FSD ignores lights and signs, and there's no traffic. It brakes to a stop on arrival.

## Dashboard
A full-width panel below the map, which is sized to end above it.
- Left: speedometer, tachometer with gear, fuel bar, lights and horn. The speedometer tops out at 200 until past 150 mph, then steps to 300, 400 and 500, keeping the needle at or under 3/4 of the dial. Tachometers end at the round thousand above each car's redline. Electric cars show battery charge instead.
- Fuel and charge are placeholders: 4 hours of running from full to empty, saved with the trip, with no effect on the car. A new start refills.
- The nav screen carries FSD status and destination top left, and at the bottom left a muted analog clock with digital time showing the game's time of day (which only moves when changed).
- Centre: real-time clock, ETA when there's a destination (from Google's route times, assuming FSD cruise), trip figures, and the navigation screen.
- Right: radio with an LCD, PWR, bands, and volume and tune knobs (drag or scroll). Clicking the LCD opens the station list.
- Navigation screen: heading-up view from very high: the arrow points up and the map turns under it. It's drawn from the road data already loaded rather than a second Google map, which would add map charges. Click it to change the range.

## Engine sound and car profiles
- Real recordings from the CC0 Muted.io pack, blended by revs and load (`engineMix.js`). Sources and limits are in `public/audio/samples/SOURCES.md`. The pack names no cars, so the sets are chosen by measured pitch and tone.
- Designed to be quiet when cruising and strong only under real load. W eases up over about a second in the sound only; the car's acceleration doesn't change.
- The gearbox is for sound and the tachometer only: it shifts early on a light throttle and late on a heavy one, and doesn't affect the car.
- Road and wind are filtered noise that levels off at high speed.
- Profiles in `cars.js`: sports car, muscle V8, normal car, truck (recorded), electric (synth). "Classic synth" is an option for any car, and the fallback if recordings fail. They change sound and gearing only, not handling.
- Audio can only start after a click or key press, as browsers require.

## Car look, lights, horn and time of day
- Car type and colour are built in the browser (`carModel.js`), with a matching side-view picture in Settings.
- Time of day (Settings, or T for +1 hour) is a colour tint over the map (`daylight.js`). Google's 3D map is a photograph with fixed lighting and no lighting controls, so shadows don't move, and buildings and streets don't light up.
- Headlights (H or Lights button) are two forward beams (`headlights.js`) cut out of the tint: they begin about 3.5 car lengths past the nose (so they stay ahead when the overlay and the 3D car drift), brightest about 3.5 lengths into the beam, fading out by 6, with little side spill and nothing behind. They scale with the car's size and shape and turn with it. The car's body is also lifted slightly so it stays visible at night. Two tail lights are small lit dots, a fixed size on screen: on with the lights, bigger and brighter when braking or reversing, including with the lights off, so holding S keeps them bright through the stop and all the way back. It's a screen effect, so it doesn't fall on buildings or follow hills.
- Horn (hold B or the Horn button) is synthesised, with notes set per car in `cars.js`.

## Radio
- On by default at 35% on HOT 99.5 (WIHT Washington), starting at the first click or key press, as browsers require. Choosing another station or turning it off is remembered in that browser. Stations come from Radio Browser: within about 150 km of the car first, then the rest of the state. It searches again after about 50 km of driving.
- The display shows the song playing where the station sends one, which most do, and slides a title too long to fit. It's asked for every 30 seconds while the radio is on and the tab is showing, and shows nothing during adverts or on stations that send no title. It can run a few seconds ahead of what you hear.
- These are internet streams, so band and frequency are read from each station's name and tags. Stations that don't state one are listed under WEB, and tuning only reaches listed stations.
- Browsers block plain `http` streams on an `https` page, so only `https` stations are listed, which leaves out about half of them.

## Settings (O)
Clicking outside the panel closes it, and changes save as they're made. New players start from `public/data/defaults.json`; **Copy settings** produces the text for it. Start location, car size, car profile, engine sound (recorded or synth), sound mix (Quiet, Balanced, Sport), master volume, mute, volumes for engine, radio, road, wind and effects, engine pitch, and road following on or off. Saved in the browser.

## Pause and trip stats (P)
Pausing stops the car and the clock, and mutes the radio if it was on. Resuming brings the radio back if it was playing before the pause. The pause screen shows elapsed and moving time, miles, average and top speed, FSD miles, share and time, takeovers, signals, bridges and miles off road. A new start or Reset from the header begins a new trip.

## Saved trip
Position, heading, destination, FSD state and speed offset, trip stats, zoom, camera, nav range and radio station save to the browser's `localStorage` every 2 seconds and on leaving the page. A refresh skips the start dialog and carries on with the car stopped, and FSD drives on if it was on. The route is kept in the browser too, so a refresh doesn't pay for a new one unless the car is off it. The radio comes back at the first click or key press, as browsers require. Start or Reset in the header starts a new trip. Saved per browser, not across devices.

## Performance
The dashboard shows FPS, the slowest frame in the last second, and JavaScript memory (Chrome only). The API figure is billed calls since the page opened. Hovering it lists the other files loaded and, at the bottom, geocoding, routes and elevation. That list is drawn when the page opens and when the pointer moves onto it. Settings has map quality, a limit on the memory Google's 3D map keeps, map sharpness (80% by default: the map draws fewer pixels, which is the biggest single saving, and looks a little softer) and road and place names on the map. Beyond 60 road tiles the furthest are released. The map shows the next 8 km of a route; the nav screen shows the way beyond.

**Send log** in the header sends the performance log to the server for review. The game records frame rate, slow frames, where the time went, map and road loading, and the car's position every 5 seconds, keeping the last 5 hours in that browser across refreshes. Nothing leaves the browser until the button is pressed, and a sent log is cleared from it. Anyone playing can press the button, so the server caps what it holds at 200 MB.

## Sharing
The Share button copies a link holding the drive and settings: position, destination and FSD, trip stats, camera, start location, and any settings that differ from the defaults. It's compressed into the URL's # part, so no server stores it. Opening a link first shows what it holds, including the radio station and that music will start. Accepting replaces that browser's settings and trip, with the car stopped, and starts the radio if it was on. Declining, Escape or clicking outside leaves everything as it was. Links are checked on opening (`share.js`), because anyone can make one.

## Popups
Escape or a click outside closes every popup: start, destination, pause, settings, key list and notices. On first load the start dialog takes the default, because the game needs a start.

## All keys
| Key | Action |
| --- | --- |
| W / ↑ | Accelerate |
| S / ↓ | Brake, then reverse |
| A D / ← → | Steer |
| Shift | Handbrake |
| Space / Z | Zoom out / in |
| Q / E | Signal left / right. On foot: turn the view left / right |
| G | Destination |
| F | FSD on / off |
| - / = | FSD speed down / up |
| N | Radio on / off |
| [ / ] | Previous / next station |
| M | Mute all sound |
| H | Headlights on / off |
| B | Horn (hold) |
| T | Time of day +1 hour |
| C | Camera |
| O | Settings |
| P | Pause |
| K | Show or hide the key list |
| L | Get out of a stopped car, or back in when beside it |

Start (change start point) and Reset (back to the start) are header buttons only, not keys.
