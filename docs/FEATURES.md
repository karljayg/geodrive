# GeoDrive features and behaviour

The record of what the game does and why. Update it when behaviour changes.

## Walking (L)
Indoors, the building's name and floor show just above the health panel, at the bottom right.
With the car stopped (under 1 mph), L gets out. A person stands on a clear side of the car. You stay on the driving map, so buildings, streets and everything else look the same and nothing loads again. FSD and signals turn off, so the car can't drive away on return. L is refused on a bridge, where the ground is the valley floor. The dashboard goes, and the radio, road and wind noise and the horn stay in the car. Back in the car, the radio is as it was: same station, on or off, whatever the phone played. The engine keeps idling, full within about 3 m of the car and fading to silence at 40 m. Trip miles and the trip clock stop.

- **Moving:** the same angle as the closest driving camera (CHASE) at half its distance, with the person where the car would be on screen. Q and E turn the view left and right while held, which is how to see round a building; walls don't move the camera. The mouse also turns it after a click (Esc frees the mouse and leaves you on foot). WASD moves relative to the view, Shift runs, and Space jumps: about 1.3 m, enough to get over or on to chairs, tables, beds and counters, though not wardrobes, fridges or walls. Walking and running speeds are in Settings, 3 and 8.4 m/s to start. On a touch screen, drag to turn and use the arrow buttons. The figure has knees, elbows and a torso that leans and twists, with an 8-frame walk and an 8-frame run, and stands when still.
- **The place:** the driving map itself. Real building footprints and water from the road map's tiles are invisible walls, so they can differ a little from the buildings you see. Trees and anything else the map only shows in its picture don't stop you. A tile that hasn't arrived never stops you.
- **What stops you:** building walls, water and the car, and any rise steeper than about 30°. A low step is fine, as is walking under a part of a building raised overhead.
- **Buildings:** there are no doors to find. Next to a wall, the hint says "Press L to go inside", and L puts you just inside, unless nothing says what the building is: then a big message says "Sorry you can't get in. It's locked." Types and names come from free Overture Maps and OpenStreetMap data, looked up the first time you press L at a building (`docs/INTERIORS.md`). Rooms are lit by their windows: sky light that fades into the room and stops at inner walls, and patches of sun through windows that face it, east in the morning and west in the afternoon, so a room with no window is dark. Each floor has light switches on the wall by its doors, and by the stairs on upper floors; F at one switches that floor's lights on and off, remembered with the building, and with them on windows matter much less. About a quarter of large buildings (homes never) say "Light switch not enabled, find key". A building key can turn up in desks, filing cabinets, lockers and tool chests; with one in your bag the switch works, and that building's switches stay working afterwards. Headlights left on stay on when you get out, and stay where the car is. G is the flashlight, which has to be in your bag, and the tray's Flashlight lights up while it's on, a wide beam reaching about 13 m indoors and 22 m out. The phone's Flashlight app (7) is a small beam reaching about a person's height ahead. Both work outdoors at night too. Otherwise you come in by its door, into its lobby or hall, on the ground floor of that footprint, seen from above with the camera closer than outdoors. The hint names what the building is and its floors, such as "Bank · Floor 1 of 5", worked out from the map on your first visit and saved in the browser so it stays the same (`docs/INTERIORS.md`). Every building has rooms with waist-high walls and doorways, and things in them that suit its type and block you, such as desks in an office, a lobby, tellers and a vault in a bank, wards and operating rooms in a hospital, flats off corridors in apartments, bays and parked cars in a garage, seats facing the screen in a cinema, racking in a warehouse. Some are busy and some sparse, as they would be. Colours and shapes differ building to building but stay the same on every visit. Past 45 m from the middle, a huge building is an open hall. Buildings of 2 or more floors have stairs and from 4 floors a lift, in the same place on every floor: the hint says when you're beside them. L goes upstairs, or down from the top floor, and Shift+L goes down from a floor between. In a lift, L opens a panel of floor buttons: click one and you're there, or type the number and press L, or use W and S (Shift for 10). Buildings of 4 floors or more have a lift and a lobby. You can only leave from the ground floor. Settings has "Forget building interiors" to start over. L inside returns you to where you went in. Next to the car as well, L gets in the car.
- **Back to the car:** the label at the bottom of the view gives the distance and direction to the car, Within about 3 m of the car, press L. F there asks "Load into car?": F or L says yes and opens the bag beside the car's storage. L only means Load while that's being asked.
- **While on foot:** Go to asks you to get back in first. New start and Back to start put you back in the car. Time of day, pause and settings all still work. A refresh puts you back in the driver's seat.

## Driving
- Until you first drive, a thought bubble gives the driving keys, as the first walk does for walking.
- Top speed 500 mph, reached in about 30 seconds. A stopped car can't turn, and reverse steers the other way.
- The camera orbits a point ahead of the car at ground height, so the map rotates on the car rather than sliding under it.
- Space zooms out and Z zooms in, and the view stays where you let go. Car size stays in scale with the map.

## Roads and bridges
- With no steering key held, the car follows the road it's on. Holding a steering key overrides this, which is how to take a turn or leave the road.
- On a road marked as a bridge the car rides on the 3D surface. Elsewhere it stays on the ground, because the 3D surface includes trees and overpasses.
- Known limits: unmarked bridges and raised ramps aren't handled. At top speed on dense streets the car can briefly lose the road.

## Start point
On load the game offers the default start or an address. An address puts the car on the nearest road and becomes the new default in that browser. While driving, **New start** in the header opens that dialog again, and **Back to start** puts the car back at the saved start (both menu-only, no hotkeys, so they aren't hit by accident). The header, the top of the nav screen and the browser tab name the town the car is in, looked up from Google at most every 8 km and once a minute, as each lookup is billed, so the name can lag a few minutes behind at speed. The answer is kept with the trip, so a refresh doesn't ask again.

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
- Left: speedometer, tachometer with gear, fuel bar, and six buttons: Headlights, Beep and Storage, then Leave car, FSD and Mute. The speedometer tops out at 200 until past 150 mph, then steps to 300, 400 and 500, keeping the needle at or under 3/4 of the dial. Tachometers end at the round thousand above each car's redline. Electric cars show battery charge instead.
- Fuel and charge are placeholders: 4 hours of running from full to empty, saved with the trip, with no effect on the car. A new start refills.
- The nav screen carries FSD status and destination top left, and at the bottom left a muted analog clock with digital time labelled NOW, always the game's time of day. The arrival time is only in the ETA above the screen.
- Centre: ETA with time and miles left when there's a destination (from Google's route times, assuming FSD cruise), which keys signal, zoom and change FSD speed, a Time +1h button, trip figures with a clickable Camera, and the navigation screen. TIME in the trip figures is time since the trip's first movement, stops included, and stops while you're out of the car.
- Right: radio with an LCD, PWR, bands, and volume and tune knobs (drag or scroll). Clicking the LCD opens the station list.
- Navigation screen: heading-up view from very high: the arrow points up and the map turns under it. It's drawn from the road data already loaded rather than a second Google map, which would add map charges. Click it or press V to change the range, shown at its bottom right.

## Engine sound and car profiles
- Real recordings from the CC0 Muted.io pack, blended by revs and load (`engineMix.js`). Sources and limits are in `public/audio/samples/SOURCES.md`. The pack names no cars, so the sets are chosen by measured pitch and tone.
- Designed to be quiet when cruising and strong only under real load. W eases up over about a second in the sound only; the car's acceleration doesn't change.
- The gearbox is for sound and the tachometer only: it shifts early on a light throttle and late on a heavy one, and doesn't affect the car.
- Road and wind are filtered noise that levels off at high speed.
- Profiles in `cars.js`: sports car, muscle V8, normal car, truck (recorded), electric (synth). "Classic synth" is an option for any car, and the fallback if recordings fail. They change sound and gearing only, not handling.
- Audio can only start after a click or key press, as browsers require.

## Car look, lights, horn and time of day
- Car type and colour are built in the browser (`carModel.js`), with a matching side-view picture in Settings.
- There is one game clock, and every clock labelled NOW shows it. It keeps real time at the wheel and runs at 1 minute = 1 hour on foot, and stops while paused. Settings or T (+1 hour) set it. Time of day is a colour tint over the map (`daylight.js`). Google's 3D map is a photograph with fixed lighting and no lighting controls, so shadows don't move, and buildings and streets don't light up.
- Headlights (H or the Headlights button) are two forward beams (`headlights.js`) cut out of the tint: they begin about 3.5 car lengths past the nose (so they stay ahead when the overlay and the 3D car drift), brightest about 3.5 lengths into the beam, fading out by 6, with little side spill and nothing behind. They scale with the car's size and shape and turn with it. The car's body is also lifted slightly so it stays visible at night. Two tail lights are small lit dots, a fixed size on screen: on with the lights, bigger and brighter when braking or reversing, including with the lights off, so holding S keeps them bright through the stop and all the way back. It's a screen effect, so it doesn't fall on buildings or follow hills.
- Horn (hold B or the Beep button) is synthesised, with notes set per car in `cars.js`.

## Radio
- Off for new players, so the soundtrack is what they hear first. N turns it on, at 35% on HOT 99.5 (WIHT Washington) unless they've chosen another station. Choosing another station or turning it on or off is remembered in that browser. Stations come from Radio Browser: within about 150 km of the car first, then the rest of the state. It searches again after about 50 km of driving.
- The display shows the song playing where the station sends one, which most do, and slides a title too long to fit. It's asked for every 30 seconds while the radio is on and the tab is showing, and shows nothing during adverts or on stations that send no title. It can run a few seconds ahead of what you hear.
- These are internet streams, so band and frequency are read from each station's name and tags. Stations that don't state one are listed under WEB, and tuning only reaches listed stations.
- Browsers block plain `http` streams on an `https` page, so only `https` stations are listed, which leaves out about half of them.

## Soundtrack
Background music follows the game clock when the radio and phone are silent: daytime from 6:00, late afternoon from 16:30, dusk from 18:30 (no song yet, so late afternoon carries on), night from 19:30, and an uneasy late night from 23:00 to 4:30. A change of mood crossfades at once, over 4 seconds for the time of day, including when the clock is moved by hand. Songs in a mood play in turn and crossfade into each other, and a mood with one song loops. Scenes (foreboding, suspense, danger, chase) stop the radio or phone and cut in within seconds, the most urgent winning, and the radio comes back when they end. Standing in a dark room indoors plays foreboding: the room's lights are off and the windows give too little. After 2 seconds there it comes in, and only daylight or turning on the room's lights ends it, at once. A flashlight or phone light doesn't. What was playing before comes back, the same song from where it stopped, or the radio. Enemies will ask for the other scenes. Pausing stops the music, and it resumes with the mood's next song. Settings has a Music volume, **All music off** (soundtrack, radio and phone, leaving engine and effects), **Keep music playing in another tab or window**, and **Test a mood** for hearing any mood over the radio, which lasts for that visit. M mutes everything as before.

## Settings (O)
Tabs for Car, On foot, World, Sound, Graphics and Diagnostics, picked with 1 to 6, with Done always on screen. Each link's underlined letter works on its tab. Clicking outside the panel closes it, and changes save as they're made. New players start from `public/data/defaults.json`; **Copy settings** produces the text for it. Start location, car size, car profile, engine sound (recorded or synth), sound mix (Quiet, Balanced, Sport), master volume, mute, volumes for engine, radio, music, road, wind and effects, engine pitch, and road following on or off. Saved in the browser.

## Pause and trip stats (P)
Pausing stops the car and the clock, and mutes the radio if it was on. Resuming brings the radio back if it was playing before the pause. On foot the screen is about the person: each need, the most urgent first, with time left and what to do about a low one; distance, time, running share, buildings and floors for this walk and all walks; what's been eaten and drunk; and the way to the car and how full the bag is. All walks are saved with the needs, so Start over in the Health app clears them. In the car the pause screen shows elapsed and moving time, miles, average and top speed, FSD miles, share and time, takeovers, signals, bridges and miles off road. A new start or Reset from the header begins a new trip.

## Saved trip
Position, heading, destination, FSD state and speed offset, trip stats, zoom, camera, nav range and radio station save to the browser's `localStorage` every 2 seconds and on leaving the page. Anything a click would lose asks first: Back to start, Reset trip, Reset all settings, Forget building interiors and the Health app's Start over. A refresh skips the start dialog and carries on with the car stopped, and FSD drives on if it was on. The route is kept in the browser too, so a refresh doesn't pay for a new one unless the car is off it. The radio comes back at the first click or key press, as browsers require. Start or Reset in the header starts a new trip. Saved per browser, not across devices.

## Performance
Settings' Diagnostics tab shows FPS, the slowest frame in the last second, and JavaScript memory (Chrome only), then the API figure, which is billed calls since the page opened, and the list of other files loaded with geocoding, routes and elevation. That list is drawn when the page opens and when the tab is shown. Settings has map quality, a limit on the memory Google's 3D map keeps, map sharpness (80% by default: the map draws fewer pixels, which is the biggest single saving, and looks a little softer) and road and place names on the map. Beyond 60 road tiles the furthest are released. The map shows the next 8 km of a route; the nav screen shows the way beyond.

**Send log** in Settings' Diagnostics tab sends the performance log to the server for review. The game records frame rate, slow frames, where the time went, map and road loading, and the car's position every 5 seconds, keeping the last 5 hours in that browser across refreshes. Nothing leaves the browser until the button is pressed, and a sent log is cleared from it. Anyone playing can press the button, so the server caps what it holds at 200 MB.

## Shared worlds
`J` in the sandbox makes a shared world: a name for it, then your own name, male or female, and a colour for each part of your person. The sandbox stays as it is. Your start is chosen once, in the usual dialog, and only places you: it isn't kept. In a world, New start, Back to start, the time slider, `T` and Forget interiors aren't there, and everyone starts on foot.

Cars in a world belong to the world. They're planted along the roads, the same for everyone: about 2 in 5 run, and the rest say why not when you try. Walk up to one and press L. One driver at a time, first come first served, and anyone can take a car that's been left. Each car has its own fuel and storage, and about 1 in 4 has a sledgehammer in it. Others see your car move as you drive. If there's no running car near where someone first appears, or comes back after dying, one is added.

Nothing passes through anything. A car stops dead at another car, parked or moving, or at a person, bouncing back slightly, and the other driver's car stops too. People can't walk through cars, moving or parked.

A crash can hurt or kill, going by how fast the two were closing, so two at 50 mph head on is 100. A car hitting a car, parked or moving, at 100 mph or more explodes: the cars stay as burnt-out wrecks for good, and whoever was driving dies. A car hitting a person at 50 mph or more kills them, and the driver carries on. Anything from 5 mph up to those speeds drops health to 1, and below that nothing happens. What injury leads to is still to be decided. The server checks a deadly crash against where each game said it was, and if that doesn't hold up it's only a stop.

Each person has 3 lives (`GAME.world.lives`). What they carried is left at the spot, for anyone. With lives left they're back a few seconds later, on foot near someone, with needs reset and only a flashlight. With none left they see how they died and who to ask for another invite, and they come back as someone new under a new name. If a manager runs out of lives the backup becomes owner, and the next living person by invite order becomes backup.

`J` in a world copies an invite link, if you're a manager: the creator or the backup. The first person to join becomes the backup, and either can choose another in the People app, which also makes a rejoin link for someone who has lost their browser. An invite works once and lasts a day. Whoever opens one chooses a name, unique in that world for good, and a look, then appears on a road within about 300 m of someone. A browser that knows a world asks where to play when it opens.

Buildings are shared: whoever goes in first decides what's there, and from then on everyone sees the same rooms, what's been taken or moved, holes, lights and things dropped, as they happen. If two people grab one thing, the first to reach the server gets it. People on your floor are drawn with their names, and block you.

Others appear as people in their own colours, with a name tag within 100 m. Each person's walking models arrive about 6 s apart, as the map froze when they all went on at once. The phone gets a People app, and badges on its Map and Compass. Nobody can walk through anyone, except someone away.

The world has one clock, 1 game hour per 5 real minutes, stopped when nobody is online. Needs keep their rates. Sleeping skips only your own body unless everyone else online is in bed.

Enter opens a chat line and Enter sends to everyone. `/w name message` is a DM, and Tab finishes a name. Messages come as a card like an iPhone preview: on the dashboard in a car, above the tray on foot, 4 to 10 s by length, click to read a long one. The phone's Messages keeps the last 50 of each thread. A dead phone shows none of this.

Bag, notes, needs and where you are live on the server. Your sign-in, route and addresses stay in the browser. Lose that browser and you need a rejoin link. If the line drops, you carry on and it comes back by itself, with no reload.

## Popups
A dialog with an address box takes the letters, so its other button is Alt and a letter: Alt+C clears a destination and Alt+D goes back to the original default.

Each press of Escape closes only the thing on top, in this order: shared-drive question, destination or start, settings, key list, pause, lift panel, the F question, phone or bag (or the car's storage), the locked message, then a message. With nothing open it pauses. A click outside also closes the start, destination, pause and settings popups and the key list. On first load the start dialog takes the default, because the game needs a start. While the mouse is held for looking the browser takes Escape to free it, so that press closes nothing.

## All keys
| Key | Action |
| --- | --- |
| W / ↑ | Accelerate |
| S / ↓ | Brake, then reverse |
| A D / ← → | Steer |
| Shift | Handbrake |
| Space / Z | Zoom out / in |
| Q / E | Signal left / right. On foot: turn the view left / right |
| G | Go to a destination. On foot: flashlight |
| F | FSD on / off |
| - / = | FSD speed down / up |
| N | Radio on / off |
| [ / ] | Previous / next station |
| M | Mute all sound |
| H | Headlights on / off. On foot: phone |
| B | Beep (hold). On foot: bag |
| R | Car storage |
| T | Time of day +1 hour |
| C | Camera. On foot: compass |
| U | On foot: notepad |
| J | Share this drive |
| V | Nav screen range |
| , / . | Radio volume |
| / | Radio band |
| \\ | Station list |
| Z | With the bag open: undo a drop |
| O | Settings |
| P | Pause |
| K or ? | Show or hide the key list, which lists only the keys for where you are: in the car or on foot (`keyList.js`) |
| L | Get out of a stopped car, or back in when beside it |

New start and Back to start are header buttons only, not keys.

## What you carry on foot
Using things makes a sound, under the Sound effects volume: drinking, eating, pills, bandages and batteries from the bag; taps, toilets, machines, switches, drawers, searching, picking up and dropping. So does moving about: footsteps that differ indoors and out and when running, jumping and landing, stairs, lifts, going through a building's door or finding it locked, and the car door. The phone, bag and new notes make small sounds, and warnings, charging, a dead battery, an accident and collapsing each have one. In the car, headlights click, FSD chimes on and off, and arriving at a destination plays a short tune. Anything without a sound of its own, or that has nothing to give, plays a short two-note acknowledgement.

Out of the car, the dashboard is replaced by a tray at the bottom left, under a line of the keys for moving and sound: Phone (H), Compass (C), Notepad (U), Bag (B) and Flashlight (G). A hotkey is underlined where it's a letter of the word, and in brackets where it can't be. Opening any of them frees the mouse so you can click. Esc puts everything away. The tray's compass is live, its card turning as you do.
- **Inside the apps:** keys are shown where they work. Numbers dial in the Phone app and pick from the list in Notes and Messages, so they don't switch app there. 0 steps back. Enter calls and hangs up, N starts a note, Delete deletes an open one after asking (Esc first if the cursor is in it), - and = zoom the Map, comma and full stop set Music's volume, and X starts Health over after asking.
- **Phone:** a home screen of apps, with room for more. Click one, or press its number, shown on each icon (from anywhere on foot, except in the Phone app, where numbers dial, Enter calls and Backspace deletes). 0, ‹ Home or the bar at the bottom go back.
- **Music:** a music player that plays live FM, so there are no playlists to make. It starts when opened, on the car's station if that's FM. Back and forward change station ([ and ]), play/pause is N, and it shows the current song and what played earlier on that station. A station that sends no titles shows its own name.
- **Recent:** what the game has said lately, newest first, as messages leave the screen after a few seconds. Passing figures such as the time aren't kept.
- **Compass:** a large dial with the car marked on its rim, plus your heading and how far and which way the car is.
- **Notes:** as many as you like, saved in the browser. The Notepad in the tray opens this too.
- **Phone app and Messages:** dial or pick a contact, or text one. The contacts are made up and nothing leaves the game: a call rings and nobody answers, and a text gets a stock reply.
- **Map:** the nav screen's map with your heading up, the car as a yellow dot and zoom buttons. Street names run along the roads where the whole name fits on a straight stretch, shortened if that's what it takes (Boulevard to Blvd), and bigger roads choose first. A name that doesn't fit is left off, so which names show changes as you zoom and turn. Service roads are named only when zoomed in, as they're too faint to see further out.
- **Dropping things:** a dropped item stays where you left it, for good: in a room on that floor, or outdoors on the map, including beside the car if dropped from inside it. It looks like itself if it came from a room's furniture, such as a microwave, and like a taped parcel otherwise. F within reach offers to pick it up again.
- **Shopping centres:** a big building holding different kinds of business (over 1,500 m²) is a mall, whose units mix shops, groceries, restaurants, cafes and more. A big single shop, restaurant, cafe or supermarket also gets a market hall with shelves, fridges, a food counter and some clothes. Buildings already visited stay as found until forgotten in Settings.
- **Messages:** what the game tells you appears in a thought bubble over the person or car. Common ones come in several wordings that take turns, all in `public/js/sayingsConfig.js`.
- **With no bed or toilet:** once tired, or once you need to go, F offers "Sleep here?" or "Go here?" anywhere, on foot or stopped in the car. Sleeping takes 7 hours and gives half the energy of a bed. Going gives half the relief. Outdoors it also leaves a label on the map, "Someone peed here", "Someone pooped here" or both, seen within 100 m, so it pays to be discreet. The numbers are `GAME.rough`.
- **Needs:** with energy yellow you can't run as fast, and with it red you can only walk. Bars in the corner, green when fine, yellow from a need's first warning and red at its last, full being good, so a full Bladder or Bowels bar means no need to go: Health, Energy, Food, Water, Bladder, Bowels, Phone and Flashlight charge. Clicking a bar opens the Health app on foot and says how that need is doing in the car. A warning also says what to look for. They fall at real hourly rates that depend on what you're doing, faster running, slower sitting or asleep. Warnings come as each gets low. Holding on too long is an accident; going without food, water or sleep costs health; at no energy or no health you collapse and come round 6 hours later. Food and drink turn up in fridges, kitchen and bar counters, prep tables, shop shelves, produce stands, bread racks and machines, and now and then on a dining table; each has something only sometimes, settled once per spot, and some taps run. A number or click in the bag eats or drinks it. A toilet relieves both needs. Beds sleep until 7 AM, for up to 10 hours. Phone and flashlight charge by pressing F at a blue outlet low on a wall, while you stay close; about half have power. Batteries also refill the flashlight. A dead phone won't open. The phone's Health app (8) shows each rate, the time left and a running record. All the numbers are in `public/js/gameConfig.js`.
- **Bag:** 12 slots for what you collect, each shown with a picture and its name, saved in the browser, starting with a flashlight. The ✕ on a slot, or Shift and its number, drops one for good, with an Undo (Z) until the bag next changes. In or right next to the car, B (or R and Storage on the dash) also shows the car's 60 slots: click something or press its number to move it across, one at a time. With the bag open, a number uses that slot on foot, so B then the flashlight's number turns it on. Away from the car its storage can't be reached, so bring what you need.

Inside, the hint names what's in reach. F doesn't do anything straight away: it asks in the thought bubble ("Open the fridge?"), and F again says yes while walking away says no. F is the one key for anything on foot: stairs, elevators, going in and out of buildings, getting in the car and its storage, as well as what's in rooms. L and the other keys still work as shortcuts. At something with no use, F says what it is, and outdoors what's around: a road, a tree, the water, or a named place nearby. Chairs, boxes, carts, pallets and the like can be pushed, and stay where they're pushed, unless a wall or something else is in the way. The first time you walk into one, the bubble says so. Something you're facing that a push can't shift, F climbs over, landing on the far side if there's clear floor and no wall between. A sledgehammer starts in the car's storage: with it in your bag, F or its number in the bag at an inner wall breaks a door-wide hole after three swings, which costs 10 energy. The hole stays with the building, with rubble on the floor. It keeps clear of light switches and outlets, and outer walls can't be broken, as L and F already go through those. In a stopped car with no destination, F offers a destination, getting out, storage and headlights; otherwise it's self-driving. With several things in reach, each use is a numbered choice, picked with its number or a click. You can sit on chairs and sofas, lie on beds, which sleeps until morning, open fridges, wardrobes and drawers and search bins and shelves, which may hold something for your bag and stay searched. You can pick up small things, take cash from a cash machine or coffee from a machine, and try most other things for a line of what happens. What you've taken stays gone.
