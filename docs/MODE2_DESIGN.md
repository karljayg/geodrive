# Mode 2, the private shared world: detailed design

Status: design, not built. `docs/SHARED_WORLD.md` holds the decisions, the reasons, the test results and the stages. This document is the detail behind them: what a player experiences, then what's stored, what's sent and what the code does. Table columns, message names and small numbers not in that plan are proposals, and can change as they're built. Stage 0 is laying the groundwork (`world.js`, the building-centred layout, starting on foot), so names here may shift to match it.

## In one page
A creator makes a world and invites friends, one at a time, by one-use links. Up to 8 play at once. Everyone starts on foot, finds each other by phone, and takes cars from the roadside. What they do to buildings, cars and dropped things stays for everyone. Crashes can kill. Each player has 3 lives while testing, and after the last one, that character and name are gone for good.

| | Sandbox (mode 1) | Private world (mode 2) |
|---|---|---|
| Start | Your own car | On foot, no car |
| Cars | One, yours, with your choice of look | Planted on roads, shared by anyone |
| Clock | Yours, can be skipped | The world's, can't be skipped |
| Crashes | Nothing happens | Injure or kill |
| Saved in | This browser | The server, apart from sign-in and route |
| Others | Nobody | Up to 8 online, with chat and name tags |

## What a player experiences

### The creator
1. In the sandbox, presses `J`, then names the world.
2. Fills in their own name, male or female, and colours.
3. Chooses a start in the usual dialog, default or address.
4. The page reloads into the world. They stand on the nearest road, on foot, with a running car within a short walk.
5. Presses `J` again to get an invite link, and sends it to someone themselves. The game doesn't send anything.

### Someone invited
1. Opens the link. Before any map loads, a dialog says which world it is and asks for a name, male or female, and colours.
2. Accepts. The map loads and they stand on a road within about 300 m of someone.
3. Their phone shows the others on its map and compass, and they walk over.

The first person to join becomes the backup, and the creator is told. Either manager can pick a different backup later.

### Coming back
A browser that knows a world shows a small picker before the map loads: Sandbox, or a world's name. Choosing one goes straight in, at the place the player left. Changing world is a reload, so one map load.

### Death
| What happens | Speed | Result |
|---|---|---|
| Car hits a moving car | Under 5 mph closing | Stops, no harm |
| | 5 to 99 mph closing | Stops, and everyone in both cars drops to health 1 |
| | 100 mph or more closing | Both explode, and everyone in them dies |
| Car hits a parked car or wreck | The same limits, on the car's own speed | The same, for that car |
| Car hits a person | Under 5 mph | Stops, no harm |
| | 5 to 49 mph | Stops, and the person drops to health 1 |
| | 50 mph or more | The person dies. The car and driver carry on |
| Person walks into a person | Any | Blocked, no harm |

After a death:
- **Lives left:** a short notice, then they stand on a road near someone, with needs reset and only a flashlight. There's no page reload.
- **No lives left:** a screen shows how they died, their stats, and a message to ask the creator or backup, by name, to reinvite them as a new person. A button goes to the sandbox.
- **Either way:** what they carried is left as a parcel where they died, for anyone to take.

A new invite afterwards makes a new person, who must choose a name that has never been used in that world.

### Other things a player will notice
- `T`, the time slider, New start, Back to start, Forget interiors and the car's look in Settings aren't there in a world.
- Pausing stops their own needs only. Others see them as away, and can walk through them.
- If the connection drops, they can keep moving. Others fade after 5 s. Taking, dropping, using and getting in a car say the world can't be reached.

## Who can do what
| Action | Any member | Manager (creator or backup) |
|---|---|---|
| Change shared things, take from cars, drive | Yes | Yes |
| Chat | Yes | Yes |
| Make an invite or rejoin invite | No | Yes |
| Choose the backup | No | Yes |
| Save or load the world | No | Yes |
| Remove a player | Nobody can | Nobody can |

**If a manager runs out of lives:**
- Owner dies: the backup becomes owner, and the next living person by invite order becomes backup.
- Backup dies: the next living person by invite order becomes backup.
- Nobody left alive: nobody can invite. The world is over unless a save is loaded.

**Invites:**
- One use, gone after 24 hours.
- A normal invite makes a new person. A rejoin invite signs in as a named living member, keeping their bag, needs and lives, for someone who lost their browser.
- A name that's been refused doesn't use up the code.

**Names:** 2 to 16 letters, digits, `-` or `_`, with no spaces. `Karl` and `karl` count as the same. Every name stays taken for good, dead or alive. A load frees names taken since that save.

## What's stored

### Browser, per world
| Key | Holds |
|---|---|
| `geodrive_worlds_v1` | The worlds this browser knows: id and name |
| `geodrive_w_<id>_me_v1` | Player id and secret |
| `geodrive_w_<id>_view_v1` | Camera and zoom |
| `geodrive_w_<id>_route_v1` | Destination, its address and the route line |

Device settings such as volume and map quality stay in `geodrive_settings_v1`, shared with the sandbox. Sandbox keys are never touched.

### Server, one SQLite file per world
At `/var/lib/geodrive/worlds/<id>.sqlite`.

```sql
world     (id, name, creator, owner, backup, clock_hour, clock_at, schema)
members   (id, name, name_key UNIQUE, secret_hash, invite_order, lives, figure, colours, last_seen)
invites   (code_hash, made_by, expires, used_by, rejoin_of)
players   (member, bag, notes, messages, vitals, trip, lat, lng, inside)
chat      (id, thread, sender, text, at)            -- last 50 kept per thread
cars      (id, type, colour, lat, lng, heading, fuel, runs, driver, storage, wrecked)
buildings (id, plan, outline, seen)
floors    (building, floor, record, state)
drops     (id, name, lat, lng, building, floor, axis, u, v, facing)
marks     (id, what, lat, lng)                       -- "Someone peed here", never who
```

- `name_key` is the name in lower case, which is what makes names unique, including for the dead.
- `lives` at 0 means dead, and the row stays.
- `chat.thread` is `group`, or the two member ids in order for a DM.
- `floors.record` is the layout as first seen. `floors.state` is `taken`, `opened`, `moved`, `holes` and `lights`, as `plan.state` holds them today.
- `cars` only holds cars someone has touched.

**Never on the server:** addresses, geocoded positions, town names, route lines, or anything else from Google.

### Worked out by everyone, never stored
Roads, terrain and places come from the free tiles. Outlets, tap results and what a search finds come from a hash of the building's id. Cars nobody has touched and their hammers come from a hash of the place.

## The connection
A WebSocket to `/geodrive/ws`, proxied by Apache to the Node service on `127.0.0.1:5175`.

### Joining
```
client: { t: 'hello', protocol, world, player, secret }
server: { t: 'welcome', you, members, cars, clock, chat, drops... }
   or:  { t: 'refused', why: 'old-client' | 'unknown' | 'dead' | 'full' }
```
Invites are used over the same connection: `{ t: 'join', world, code, name, figure, colours }`, answered with an id and secret, or with `name-taken` or `invite-used`.

### Presence: binary, newest wins, 24 bytes
| Bytes | Field | Notes |
|---|---|---|
| 1 | Type | |
| 1 | Player | Their number in this world |
| 2 | Sequence | Later ones replace earlier ones |
| 4 | Latitude | Whole number, units of 1 cm |
| 4 | Longitude | The same |
| 2 | Heading | |
| 2 | Speed | cm/s, negative in reverse |
| 2 | Flags | On foot, away, indoors, headlights, brake, signal left and right, on a bridge, running |
| 1 | Gait frame | Which of the 17 |
| 1 | Floor | |
| 4 | u, v | Position in the building, 2 cm units, indoors only |

| Doing | Sent per second |
|---|---|
| Moving, within 100 m of another player | 20 |
| Driving | 10 |
| On foot | 5 |
| Still or away | 1 |
| Over 3 km from whoever's receiving | 0.2 |

### Operations: JSON, answered
The client sends `{ t: 'op', id, op, ... }`. The server saves it, answers `{ t: 'ok', id }` or `{ t: 'no', id, why }`, and tells whoever's nearby.

| Op | Decided | If refused |
|---|---|---|
| `take`, `open`, `pickUp`, `useItem` | First come, before anything reaches the bag | Says why |
| `takeFromCar`, `putInCar` | First come | Says why |
| `getIn`, `getOut` | First come, one driver | Says the car's taken |
| `push`, `hole`, `lights`, `drop`, `mark` | In order, shown at once | Put back |
| `claimPlan`, `claimFloor` | First to arrive is kept | The client uses what's kept |
| `invite`, `setBackup`, `save`, `load` | Managers only | Says why |
| `say` | Rate limit, 5 in 5 s, 400 characters | Stays in the chat line |

Other messages:
- `area`: the tiles the client is near, so the server sends only those buildings, drops and touched cars.
- `vitals`: needs and trip figures every 20 s, and on leaving.
- `bump`: a collision from one game, passed to the other. See below.

### The clock
The server sends `{ hour, rate, at }`. Every client works out the hour itself: `hour + rate × (serverNow − at)`. The rate starts at 12 game hours per real hour, which is one game hour per 5 real minutes. When the last person leaves, the server saves the hour and it stops. If everyone online is in bed, it sends a new starting point. Each person's needs run on their own body clock, at today's rates.

## How the hard parts work

### Taking something two people want
1. Dana presses F, and the game sends `take`.
2. The server, in one transaction, checks it's still there and the bag has room, marks it taken and adds it to Dana's bag.
3. It answers Dana, and tells others in the area, whose rooms update.
4. Mo's `take`, arriving next, gets `no`. Mo's game says it's gone.

### Entering a building
1. Near a building on foot, its plan and state have already arrived with `area`.
2. If a floor has a record, it's used. If not, the game lays it out at once, measured from the building's own centre, and sends `claimFloor`.
3. Two people arriving together make identical rooms, so neither sees a change. If code has changed between them, the second adopts what the server kept.
4. A plan made while a data source had failed is never sent, so one bad connection can't lock a building for everyone.
5. A new id whose outline mostly overlaps a known building counts as that building, so a map edit doesn't lose what happened there.

### A crash
1. Each frame, each game tests its own car along that frame's whole movement against where others are now: their last message, moved forward by their speed. Drawing uses a smoothed picture 150 ms old, and this test doesn't.
2. On contact the car stops and bounces back slightly. The game sends `bump` with the time, the other party and the speed.
3. The server passes it to the other driver, whose game stops too, so both agree it happened.
4. For an injury or death, the server checks the claim against its last few seconds of reported positions: within a few metres at that moment, and over the speed. A parked car or wreck only needs the driver's path.
5. If that holds up, it applies the harm, and takes a life only once per crash. If not, it's just a stop.
6. It announces the result. Nearby games show the explosion, and the wreck is saved as solid, for good.

This can't be perfect. Each player sees the others slightly in the past, so someone who swerves late may still be stopped. The server's check is there to keep that from costing a life.

### A car
- **Planted:** a hash of the place decides where cars are (`GAME.worldCars`, about one per 300 m of road), their type and colour, whether they run (about 2 in 5), why they don't, and whether a sledgehammer is in storage (1 in 4).
- **Recorded:** the first time someone drives it or changes its storage.
- **Never stranded:** with no running car within a short walk of where someone first appears, one is added.
- **Driver disconnects:** the car stops where it is, with no crash, and it's free after 10 s.

### Saving and loading
- **Save:** the server copies the world's file, compresses it, encrypts it with AES-256-GCM and a key from `/etc/geodrive/config.json`, and sends it as `<name> <date>.gdworld`. The world's id is inside the checked part.
- **Load:** the server checks the file before reading anything. An edited file or another world's file is refused. It then warns the manager that this effectively ends the world as it stands, and asks them to confirm.
- **After a load:** everything is back to the save, including bags, lives and the dead. Anyone who joined since is out. Everyone online gets a notice and a reload, up to 8 map loads.
- **World lost or all dead:** someone who was a manager in the file can load it.
- **Key lost:** every save file is unreadable, by the owner's decision. There are no automatic backups.

## What's on screen

### Join dialog
A name box, checked as it's typed. A male or female choice. A simple drawing of the person, with a colour picker for each of skin, jacket, jeans, shoes and hair. Female is the same body with longer hair for now. It comes before the map, so it costs no map load.

### Name tags
Dark rounded tags with white text, above people and driven cars, within 100 m. They stay the same size on screen and show faintly through buildings. Outdoors they're `Marker3DElement`s, and indoors small HTML labels.

### Phone
- **People:** a new app listing each person with a round initials badge, name and a line such as "1.2 mi NE · Driving", "In a building, floor 3" or "Last seen 2 hours ago".
- **Map:** badges at their positions, and tapping one centres on them.
- **Compass:** a badge per person around the dial, and a line for the nearest.
- **Messages:** the group first, then players, then the made-up contacts, keeping the last 50 per thread.
- **In a car:** the phone isn't out, so badges and messages show on the nav screen.
- **Dead phone:** none of this shows. Enter says the phone's dead, and messages wait until it's charged.

### Chat
| Press | Does |
|---|---|
| Enter | Opens the line |
| Enter again | Sends to the group |
| `/w name message`, Enter | Sends a DM |
| Tab | Finishes a name |
| Esc, or Enter on an empty line | Closes the line |

The game doesn't stop while typing. Keys are let go, so a car coasts with road following on.

Messages arrive as a card styled like an iPhone preview: rounded, a Messages icon, a bold title ("Chat with Dana, Mo, Priya" or one name), "now" at the right. It slides up, stays 4 to 10 s by length, then fades. Up to 3 show at once, long ones cut at two lines, and clicking opens the rest. Missed messages come as one "3 new messages" card. Cards are solid rather than frosted, as blur over the map is costly.

## The tunable numbers
All in `public/js/gameConfig.js`, the same for every player.

| Number | Starts at |
|---|---|
| Lives | 10 |
| Car deadly speed | 100 mph |
| Person deadly speed | 50 mph |
| Injury starts at | 5 mph |
| Health when injured | 1 |
| Clock | 1 game hour per 5 real minutes |
| Players online | 8 |
| Invite lasts | 24 hours |
| Appear within | 300 m |
| Cars planted | About 1 per 300 m of road |
| Cars that run | 2 in 5 |
| Cars with a hammer | 1 in 4 |
| Driver seat freed after disconnecting | 10 s |
| Name tags shown within | 100 m |
| People and driven cars shown within | 1.5 km |
| Parked cars shown | Within 300 m, nearest 20 |
| Chat kept per thread | 50 |
| World size limit | 100 MB |
| All worlds limit | 5 GB |

## When things go wrong
| Situation | What happens |
|---|---|
| Connection drops | Moving and needs carry on. Contested actions say the world can't be reached. Reconnects from 1 s backing off to 30 s, with no reload |
| Service restarts | The same as a dropped connection. Sandbox isn't affected |
| Tab hidden | Marked away and not solid. A driver's car stops |
| Client out of date | "Refresh to update" |
| Ninth player | Told the world is full |
| Used or expired link | Says so, and to ask a manager |
| Member opens a link | Goes in, and the code isn't used |
| Bag full | The take is refused, and the thing stays |
| Someone blocks a doorway | F can climb over them |
| Two things overlap | They ease apart. New players look for clear ground |
| Both managers lose their browsers | No more invites, ever. The world carries on |
| Anyone edits a save | Refused |

## Accepted limits
- Friends can grief each other, ram each other, and nobody can be removed.
- Needs are worked out in the browser, so they could be faked from the console.
- FSD doesn't brake for cars or people yet, so using it in a world is at your own risk. It's on the to-do list.
- Anyone with access to the server can read saves and DMs.
- A lost browser with no manager to reinvite means that character is gone.

## Still to decide
- What an injury leads to: whether someone at health 1 can die of it, and how soon.
- What passengers see and hear.
- Whether top speed should be lower in worlds.
- How many lives to settle on, and how many cars to plant, after testing.
