# GeoDrive features and behaviour

The record of what the game does and why. Update it when behaviour changes.

## Driving
- Top speed 500 mph, reached in about 30 seconds. A stopped car can't turn, and reverse steers the other way.
- The camera orbits a point ahead of the car at ground height, so the map rotates on the car rather than sliding under it.
- Space zooms out and Z zooms in, and the view stays where you let go. Car size stays in scale with the map.

## Roads and bridges
- With no steering key held, the car follows the road it's on. Holding a steering key overrides this, which is how to take a turn or leave the road.
- On a road marked as a bridge the car rides on the 3D surface. Elsewhere it stays on the ground, because the 3D surface includes trees and overpasses.
- Known limits: unmarked bridges and raised ramps aren't handled. At top speed on dense streets the car can briefly lose the road.

## Start point
On load the game offers the default start or an address. An address puts the car on the nearest road and becomes the new default in that browser.

## Signals (Q, E)
One press takes the next non-service road on that side, far enough ahead to brake and within about 12 seconds of driving. If there isn't one it changes lane. Pressing again cancels, and steering cancels. There's no lane data, so a lane change is a fixed 3.5 m shift, one lane either way, never across a two-way road's centre line.

## Destination and FSD (G, F)
- A destination gets a Google route, shown as a blue line, and FSD turns on.
- Steering or braking turns FSD off. F turns it back on, with a new route if the car has left the old one (at most one request every 8 seconds, as each is billed).
- W raises speed without turning FSD off, but curves still apply. - and = change cruise speed by 10 mph.
- Cruise speed is Google's trip time for each part of the route raised 40%, between 25 and 100 mph.
- FSD ignores lights and signs, and there's no traffic. It brakes to a stop on arrival.

## Dashboard
A full-width panel below the map, which is sized to end above it.
- Speedometer and tachometer with the current gear
- Radio
- Trip figures: elapsed, miles, top and average speed, heading, road status, camera
- Navigation screen: heading-up view from very high. It's drawn from the road data already loaded rather than a second Google map, which would add map charges. Click it to change the range.

## Engine sound and car profiles
- Synthesised, not recorded, and approximate. Pitch follows the revs, which drop at each gear change, and power cuts briefly during a shift.
- Profiles in `cars.js`: sports car, muscle V8, small hatchback, diesel truck, electric. They change sound and gearing only, not handling.
- Audio can only start after a click or key press, as browsers require.

## Radio
- Off by default. Stations come from Radio Browser: within about 150 km of the car first, then the rest of the state. It searches again after about 50 km of driving.
- These are internet streams, so band and frequency are read from each station's name and tags. Stations that don't state one are listed under WEB, and the frequency dial is only as complete as that data.
- Browsers block plain `http` streams on an `https` page, so only `https` stations are listed, which leaves out about half of them.

## Settings (O)
Car size, car profile, master volume, mute, engine volume and pitch, radio volume, signal tick volume. Saved in the browser.

## Pause and trip stats (P)
Pausing stops the car and the clock. The pause screen shows elapsed and moving time, miles, average and top speed, FSD miles, share and time, takeovers, signals, bridges and miles off road. A new start or R begins a new trip.

## All keys
| Key | Action |
| --- | --- |
| W / ↑ | Accelerate |
| S / ↓ | Brake, then reverse |
| A D / ← → | Steer |
| Shift | Handbrake |
| Space / Z | Zoom out / in |
| Q / E | Signal left / right |
| G | Destination |
| F | FSD on / off |
| - / = | FSD speed down / up |
| N | Radio on / off |
| [ / ] | Previous / next station |
| M | Mute all sound |
| C | Camera |
| R | Back to the start |
| L | Change the start point |
| O | Settings |
| P | Pause |
| H | Show or hide the key list |
