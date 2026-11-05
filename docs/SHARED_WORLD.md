# Shared worlds: plan

Status: stage 0 built and measured on the owner's machine. Stages 1 and 3 are built and live (2026-11-02), apart from what's listed under them and saving worlds. Stage 3 came before stage 2 at the owner's request, after two people in one room couldn't see each other. Stage 2 is live: planted cars, fuel, storage and hammers, collisions, crashes, wrecks, lives and next man up. So is what the owner added on 2026-11-02: passengers, spoken chat, car condition, critical injuries with bed care, gas stations and chargers, and solid buildings. Still to do: saving and loading worlds, and the rest of stage 4. Written 2026-11-02. Numbers marked "measured" were tested on the code and server as they stood that day.

## The idea
Today every browser is its own world. This adds worlds that several people play in together, reached by invite. The invite replaces the Share button (`J`) and its link.

| Mode | What it is | When |
|---|---|---|
| 1. Sandbox | Everything in this browser, no server, your own car. Works exactly as it does today | Stays |
| 2. Private world | Shared by the people invited to it | This plan |
| 3. Universal world | One world for everybody | Not for a while. The seam is built for it; see "What mode 3 will need" |

## Decisions

### The owner's (2026-11-02)
- **Trust.** Anyone in a world can change anything shared. There are no permissions, and nobody can be removed.
- **Managers.** The creator must have a backup. Both are managers, and can make invites and save or load the world. Anything like this added later belongs to them as well.
- **Next man up.** If a manager is out of lives, the next person takes their place (see the defaults for who). That person has to invite the dead back, as new players.
- **Invites are one use and expire,** and only managers can make them.
- **Lazy by nature.** The creator goes in and the world exists. They invite people one at a time and each loads when they join. There's no lobby and nothing is prepared in advance.
- **Everything about a player in a world is on the server,** as there's little of it. A browser keeps only what it must.
- **Save and load.** A manager can save a world to a file and load it again. A file belongs to that one world and is encrypted so it can't be edited. Loading rewinds everything, which effectively ends the world as it stood, so whoever does it is warned first. Anyone can also start a new world.
- **The creator chooses the start, once.** It's the usual start dialog, default or address, when the world is made. After that nobody can change it or start somewhere else, invited or not. Only the sandbox can.
- **Everyone starts on foot, creator included, with no car, in the same vicinity as the others, not beside them.** They find each other by phone map and compass. Cars belong to the world: some run, most don't, and anyone can take a free one.
- **Sledgehammers.** One car in four has one in its storage.
- **Collisions kill.** Cars and people can't pass through each other. A car in any crash at 100 mph or more explodes, whether it hits a moving car, a parked car or a wreck. A person hit by a car at 50 mph or more dies.
- **Lives.** For testing, each player has 3 lives and respawns after each death but the last, tunable in `gameConfig.js`. Out of lives means dead for good: they can only come back through a new invite, as new players. Setting it to 1 is the permanent death first described.
- **FSD stays as it is for now,** with its improvements on the to-do list.
- **Phones show the others,** on the compass and map, as shared contacts, in the style of Find My on an iPhone.
- **Chat.** A group chat of everyone, and separate DMs, on the phone. Enter, the message, Enter, as in Minecraft, goes to the group, and `/w name message` is a DM. New messages appear like an iPhone preview, on the car's dashboard or from the phone on foot, then go. The phone keeps the last 50.
- **Names above people,** Minecraft style.
- **Choosing a look.** On accepting an invite, a player enters a name, picks male or female, and picks colours for each part of the body with a colour picker. For now female is the same body with longer hair.
- **A name is used once in a world, for good.** Dead people's names are tracked and can never be reused there, which makes the consequence permanent. Someone reinvited after dying has to choose a different name.
- **One clock per world,** as below. **8 players.**

### Defaults, as the owner didn't choose. Say if any is wrong
| Question | Default | Why |
|---|---|---|
| How is a backup "required"? | The first person to join becomes the backup, and the creator is told. Either manager can change it later, among members | Nobody else exists before that, so this can't fail |
| A player loses their browser | A manager makes a rejoin invite for them: one use, same character. Not for the dead | Managers stay the only way in, with no accounts |
| 8 players | 8 online at once. A ninth is told the world is full | Members lost for good must not use up seats for ever |
| How long an invite lasts | 24 hours, tunable | Long enough to reach a friend |
| Who takes over | If the owner is out of lives, the backup becomes owner. The next living person by invite order becomes the new backup | Keeps the creator's choice, and two managers while two people live |
| What's carried at death | Left at the spot as a parcel, for anyone to take, from a crash too | Friends can recover it, using the drops that already exist |
| A respawn | On foot near the others, with needs reset and only a flashlight, without reloading the page | No map charge for dying |
| Out of lives | A screen with how they died, their stats, and a message to ask the creator or backup, by name, to reinvite them as a new person. A button goes to the sandbox, so the screen isn't a dead end. No spectating for now | Costs nothing, and spectating can be added later |
| Names | 2 to 16 letters, digits, `-` or `_`, with no spaces, so `/w` can read them. `Karl` and `karl` count as the same | Keeps whispers simple and stops look-alikes |
| When the look can change | Only on joining, for now | Stated for invites. The creator gets the same dialog. Changing later can be added |
| A dead phone | Enter says the phone's dead, and no previews show. Messages wait and appear once it's charged | Fits the Phone need, and "phones show the others" |
| Which name tags show | People and the cars they drive, within 100 m, tunable, faint through buildings | The test below shows that as it looked |
| Which car has a hammer | Each car, by hash, with a 25% chance, moving or not | Reads "every 4th car, 25%" as one chance, not 1 in 16 |
| Clock rate | 1 game hour per 5 real minutes, in `gameConfig.js`. It stops when nobody is online | Agreed in principle; the number is a starting point |
| Needs | Keep today's rates, on each person's own body clock | Survival tuning stays as it is |
| Sleeping and collapsing | Skip that person's body clock. The world jumps only if everyone online is in bed. `T` is off | One player must not move the sun for everyone |
| Pause | Stops your needs. The world carries on and others see you as away | A shared world can't stop |

The owner's "build order" answer describes how a world starts, which is now the first decision above. The order of development is under "Stages".

## What is saved where
Nothing moves for the sandbox: its keys and data stay as they are.

### Device: every mode, stays in `geodrive_settings_v1`
Volumes, mute, engine sound, audio preset, map quality, memory and scale, map labels, road follow, music choices, radio. Also the performance log and the driving tip.

### In the browser, per world, under `geodrive_w_<worldId>_...`
| Data | Why here |
|---|---|
| Player id and secret | Proves who you are. Lost means asking a manager for a rejoin invite |
| Camera choice and zoom | Only matters on this screen |
| Destination, its address and the route line (`session.js`) | These are Google's answers, so they stay out of the server. A refresh still doesn't pay for the route |

`geodrive_worlds_v1` lists this browser's worlds for the picker.

### On the server, per world
| Data | Today | Notes |
|---|---|---|
| World: id, name, creator, backup, clock, version | new | The start isn't kept: see "Starting a world" |
| Members: id, name, hash of secret, invite order, lives left, last seen, figure, five colours | new | A member stays for ever, and one out of lives stays dead. Their record is what keeps their name taken. A dead player's name appears as dead in the phone's list |
| Invites: hash of code, made by, expires, used by, for whom if a rejoin | new | |
| Chat: the group thread and each DM, last 50 each | new | Under 20 KB a thread at 400 characters a message. A DM is readable by anyone with server access |
| Each player's bag, notes, messages to the made-up contacts | `geodrive_pocket_v1` | Under 1 MB at the very worst (200 long notes), usually a few KB |
| Each player's needs, body clock, walks, trip figures, where they are | `geodrive_vitals_v1`, part of `geodrive_session_v1` | Sent every 20 s, as they're saved today, and on leaving |
| Cars: id, type, colour, position, fuel, who's driving, whether it runs, storage, wrecked | `car`, `trip.fuel` and the `car` list in `geodrive_pocket_v1`, one per player | Only cars someone has touched. See "Cars" |
| Building plan: type, floors, style, `core`, `look`, outline in lat/lng | `geodrive_rooms_v3` | |
| Floor layouts as first seen | `geodrive_rooms_v3_<id>_<floor>` | Measured 2 to 6 KB typical, 12 KB largest |
| Floor state: `taken`, `opened`, `moved`, `holes`, `lights` | `plan.state` | |
| Dropped things, indoors and out | `geodrive_drops_v1` | Ids come from the server, as each browser's count would clash |

### Live only, never saved: presence
Position, heading, speed, altitude mode, lights, brake, signal, on foot or in a car, which car, gait, pose, floor, away.

### Neither: everyone works it out
Roads, terrain and place data come from the same free tiles. Outlets, tap results, what a search finds and which switches need a key come from a hash of the building's id, so they already agree. Cars nobody has touched do too (see "Cars").

### Settings that change meaning
- `settings.hour`: read in 20 lines of `main.js` and written in 4. It becomes the world's clock, and stays a setting only in the sandbox. Settings' time slider and `T` go in a shared world.
- `walkSpeed`, `runSpeed`: the On foot sliders move this person, and that speed is what others are told. A shared world used to ignore them.
- `carProfile`, `carColor`, `carScale`: the car is the world's now, so these do nothing. Sounds follow the car's type.
- Forget building interiors: sandbox only.

## The in-between layer
Today's code reaches for storage directly. Everything goes through one object instead, chosen at load:

```
world = await openWorld()   // from the picker or the invite, before the map loads
world.mode                  // 'sandbox' | 'private' | later 'universal'
world.me                    // bag, notes, needs: PocketData and Vitals over this world's store
world.clock                 // hour(), canSkip, sleep(hours)
world.buildings             // plan(id), floor(id, n), and change(op)
world.drops                 // around(), inBuilding(), add(), take()
world.cars                  // near(), getIn(), getOut(). The sandbox has one, always yours
world.people                // the other players, empty in the sandbox
world.rules                 // what this mode allows: skipping time, forgetting interiors, inviting, saving
```

- **`SandboxWorld`** uses today's keys and saved data. It opens no connection and doesn't even load the network code, so a sandbox player has no new request and no new cost.
- **`PrivateWorld`** keeps the same shape over the connection.
- **Universal, later,** is another class behind the same shape.

Only `world.rules` may answer "what am I allowed here?", so that "am I shared?" isn't asked all over the game. "The three modes" below says what differs.

Swapping only the storage isn't enough, even though most classes already take one. Today's saves rewrite a whole list or object, so two players would overwrite each other. So changes become small named operations: `take`, `open`, `push`, `hole`, `lights`, `drop`, `pickUp`, `useItem`, `getIn`, `getOut`. These are pure functions in a new `worldOps.js`, tested in node and run by both the browser and the server, so the two can't disagree about what an operation means.

## The three modes
The game asks for data and asks for things to be done. Which of the three modes it's in decides where that data comes from and where the work happens, and nothing else in the game knows.

**Reading is the same in every mode.** The game reads only from `world`, and reads are instant, from memory, because a frame can't wait for a network. Things come into memory through `await world.load(area)` and through updates. In the sandbox that's `localStorage`, and in a shared world it's the server. So the game loop, collisions and drawing can't tell the difference.

**Doing is the same in every mode.** The game calls `world.apply(op)` and is told what happened. The operation is always handled by the same pure functions in `worldOps.js`. Only where they run changes.

| | 1. Sandbox | 2. Private world | 3. Universal, later |
|---|---|---|---|
| Who gets in | Whoever owns the browser | By invite | Everyone, with an account |
| Who's in charge | The player | Owner and backup | Us |
| `world.apply` runs | In the browser | On the server | On the server |
| Player data from | `localStorage` | Server, by world | Server, by account |
| World data from | `localStorage` | Server, one SQLite file per world | Server, split by area |
| Who's nearby | Nobody | Everyone, up to 8 | Those nearby, from a limit by distance |
| Checks on players | None needed | Sizes, ranges and deaths | Movement, needs and actions too |

**And `world.rules` holds what differs in play,** so that it's data rather than `if` statements across the game:

| Rule | 1 | 2 | 3 |
|---|---|---|---|
| Start in | Your own car | On foot | On foot |
| Choose or change the start | Any time | Creator, once, at creation | No |
| Cars | One, yours | Planted, shared | Planted, shared |
| Crashes kill, lives | No | Yes, 3 lives while testing | Yes |
| Skip time, `T`, time slider | Yes | No | No |
| Pause | Stops everything | Stops only your needs | Stops only your needs |
| Invites, managers, save and load | No | Yes | No |
| Forget interiors | Yes | No | No |
| Chat, name tags, choosing a look | No | Yes | To decide: strangers need moderation |

**The server works the same way.** A world's record holds its mode. All data on the server goes through one store interface, so mode 3 can change what's behind it, from SQLite files to whatever a much larger world needs, without changing `worldOps.js`, the protocol or the game.

**What keeps it honest:**
- The same test script of operations runs against the sandbox and against a real server, and both must end in the same state. A difference is a bug.
- Mode 3 gets a small stand-in from the start, used only in that test: a world with the universal rules and no invites. If the seam leaks, it fails early, without building mode 3.
- Interest by area is used in mode 2 from the start, even though 8 players don't need it, because it's the part that would be hardest to add later.

**An honest limit.** The seam makes mode 3 possible, not free. See "What mode 3 will need".

## Who decides what
| Thing | Decided by | How |
|---|---|---|
| The car I'm driving, my person | Me, instantly | Driving must not wait on a network. The server limits speeds and sizes, no more |
| Other people | Them | Drawn about 150 ms in the past, smoothly. A jump over 100 m is a teleport, not a glide |
| Getting in a car | Server, first come first served | One driver, always |
| Taking, opening, picking up, using | Server, first come first served | Opening shows what's there and asks. Taking it is one step, off the world and into the bag, so nothing can be lost or doubled. A full bag, or saying no, leaves it there |
| Pushing, holes, lights, dropping | Server, in order | Shown at once and sent. If refused, it's put back |
| First layout of a floor | First to arrive | The server keeps it, and everyone uses that from then on |
| Clock | Server | It sends a starting point and a rate, not a stream of times |
| A collision | Whoever's game saw it | See "Collisions" |

`useEntry` undoes a take when the bag is full, and a container stays unsearched until its find is actually taken.

Needs are worked out in the browser and sent, so someone determined could fake theirs in the console. That's fine among friends.

## Starting a world
```
J in the sandbox       -> asks for a name -> the usual start dialog -> server makes the world there -> reloads into it, on foot
Manager presses J      -> a one-use code, 24 hours -> link: .../geodrive/#w=<world>.<code>
Friend opens the link  -> says what they're joining, asks for a name and colours -> code used up, id and secret returned
                       -> their map loads, on foot, on a road within about 300 m of someone
```
- Creating doesn't copy anything from the sandbox, which isn't touched. Nothing is prepared: buildings exist on the server when someone first goes in.
- **The start is only used once and isn't kept.** It places the creator. After that, a new or respawning player appears on a road within about 300 m (`GAME.world.appearWithin`, tunable) of someone online, or else of whoever was seen last. That's a player's position in the game, not a Google answer, and everyone's kept on the server already. So the world drifts with its people, and they walk the last stretch by phone map and compass.
- The start can't be changed. Invited players never see the start dialog. New start and Back to start aren't there in a world, as they'd also be a way to teleport. Go to stays, as that's driving somewhere.
- The code goes in the `#` part, so it doesn't reach server logs, as with the old link. The server keeps hashes of codes and secrets.
- **The join dialog** comes before the map, so it costs no map load. Name is checked as it's typed, and again by the server in the same step that uses up the code, so a name that's just been taken doesn't waste an invite. A name that any member has ever had is refused, dead or alive, with the reason given. Beside it, a male or female choice and a simple drawing of the person with a colour picker for each of its five parts (`SKIN`, `JACKET`, `JEANS`, `SHOES`, `HAIR` in `footPerson.js`), starting from today's colours.
- A used or expired link says so, and to ask a manager for a new one.
- Someone already a member who opens a link just goes in, and the code isn't used up. Someone out of lives isn't a member any more, so the link makes them a new person, with a different name, empty bag and full lives. Their old name stays on the list, marked as dead. As loading a save rewinds everything, names taken since that save become free again.
- `J` for anyone who isn't a manager says who the managers are.
- A browser that knows a world gets a small picker before the map loads: Sandbox or a world. Changing world is a reload, so one map load.
- `share.js`, its test and its dialog go. An old `#d=` link says that sharing has changed, and opens as normal.

**What follows from these rules:**
- Each manager can give the other a rejoin invite, so a world only loses its invites if both lose their browsers at once. It then carries on for those already in it, with no way to add anyone.
- Anyone can press `J`, so the server limits new worlds per address per day, and refuses new ones past a total size (5 GB to begin with), as `log.php` does. Each world is capped too (100 MB).

## Saving and loading a world
- **Encrypted on the server, which is the point.** The server packs the world's data and encrypts it with AES-256-GCM, with a key only it holds, in its config file, `/etc/geodrive/config.json`, which is never deployed or in this repo. A key in the browser could be read out by anyone, so that wouldn't stop editing. Any change to the file makes the check fail and it's refused.
- **Tied to its world.** The world's id is inside the checked part. A file only loads into that world, and can't make a copy or a new one.
- **Only living managers.** A file also brings back a world lost from the server, under the same id, if the person loading it was a manager in that file. The same goes for a world where everyone is dead.
- **Loading rewinds everything,** bags and the dead included, and effectively ends the world as it stood. The manager is warned first, in those words, and has to confirm: everything since the save is gone for everyone, and anyone who joined since is out. Then everyone online gets a notice and a reload, so up to 8 map loads. Old invites die.
- A file is `<world name> <date>.gdworld`, usually a few MB by the sizes above. It's limited to the 100 MB per world, and to one save or load a minute.

**If the key is gone, it's gone,** by the owner's decision: there's no copy elsewhere, so a lost config file makes every save file unreadable. Anyone with access to the server can read saves, as the encryption is there to stop players.

There's no automatic backup. A disk failure loses what no manager has saved.

## Cars
The biggest change for the game. Designed here in outline; passengers and the rest are planned later.

**What exists.** Cars are planted as tiles load, decided by a hash of the place: `GAME.worldCars`. Since 2026-11-02 that's only where cars are left (`parkingFromTile` in `vector.js`): bays either side of parking aisles, the top of driveways, the kerb of minor streets, about one per 60 m and 20 m clear of their ends, and on bigger roads' shoulders about one per 400 m, each set off its road by a width for its class plus 1.6 m, and none kept that would stand within any road's width plus half a car, its own or another (`offRoads`). Never on bridges, tunnels or covered ways. The rescue car is pulled in to the kerb. Before, it was one per 300 m along every road, 3.4 m from its middle, which on a wide road is a lane, with about 2 in 5 running (raised from 1 in 4 after the owner tried five in a row that wouldn't start). So everybody sees the same cars with nothing stored and nothing prepared, and the server records one only once someone touches it. A car that won't start says why in `sayingsConfig.js` (no key, flat battery, and so on), by the same hash. If there's no running car within a short walk of where someone first appears, one is added there, so nobody's left stranded by the hash.

**Getting in.** F at any free car asks to get in. The server gives the seat to the first to ask. Getting out leaves the car there for anyone. If a driver disconnects, the car stops, and after 10 s it's free.

**In a world, a car has its own fuel,** and its type and colour come from the planting, not from Settings.

**Storage belongs to the car,** so anyone can take from it. 25% of planted cars, running or not, start with a sledgehammer, by hash. That gives a reason to open cars that won't start. The first change to a car's storage is what makes the server record it. Taking is first come first served.

**What the code assumes today.** There's one `car`, and walking is built around it:
- `getOut` starts walking from the car, and `Foot` takes its `origin` from there. Nothing can begin on foot, so a new path is needed: map loaded, no car, person standing. Stage 0.
- The outline of the parked car is one solid (`foot.js`), `GET_IN_REACH` and "Get in the car?" are about that one car, and `nearCar` opens its storage.
- The compass's car mark and the nav screen's `parked` assume there is one. In a world, it's the car you last drove, if any.

**Planned later, left room for:**
- **Passengers.** The car's record has seats. A passenger's camera rides on the driver's presence, with no physics of their own. What they see and hear needs its own design.
- **Keys, damage short of death, repairs, and stealing a car from someone in it.**

## Collisions
The owner has ruled that nothing passes through anything. Here's how, without physics on the server, and what it costs.

**Each game stops its own car.** Cars are rectangles and people are circles. Each frame I test my car, along the whole of this frame's movement, against where the others are now, which means their last message moved forward by their speed, not the smoothed picture drawn 150 ms ago. On contact my car stops and bounces back slightly, and my game sends a `bump` that goes to the other driver, whose game does the same. So both always agree that it happened.

**Near each other, messages go faster:** 20 a second within 100 m, against 10 elsewhere. See the rates below.

**What this can't do.** At normal internet delays each player is seeing the other a little in the past. Two cars closing at 100 mph each cover about 13 m in 150 ms, so one player may see the hit a little before the cars seem to touch, and someone who swerves at the last moment may still be bumped. It's far better than passing through, and it's less glitchy than correcting one car from another's game, but it won't be perfect. It needs real play to judge. The fastest cars (500 mph today) make it worse, so a lower top speed in shared worlds may be needed.

**Death has to be checked, as a life is at stake.** A wrong stop is a nuisance, and a wrong death costs a life, or a character on the last one. So a game's report of a deadly crash is only a claim. The server keeps the last few seconds of everyone's reported positions, and it decides: for a moving car or a person, both reported paths have to bring the two within a few metres at that moment, and the speed has to be over the limit. For a parked car or a wreck only the driver's path counts, as the other doesn't move. If it doesn't hold up, it's an ordinary stop. Worlds shouldn't lose someone to a lag spike that way, though the check can't catch every case.

**What death does (`GAME.crash`, in `gameConfig.js`, tunable):**
- `carDeadlyMph: 100`. A car hitting a moving car, parked car or wreck explodes at that speed or more. Between two moving cars the speed is how fast they were coming together, so two at 50 mph head-on is 100, and both explode. Below it the car stops and everyone in it is injured.
- `personDeadlyMph: 50`. A person hit at that speed or more dies. Either way the car slows by half, takes damage, and the driver is hurt a bit, and the car is not wrecked. Below 5 mph nothing happens. Friends can run each other over, which trust accepts.
- **Injured means health goes to its lowest, `injuredHealth: 1`,** not dead. What it leads to is still to be decided (the owner: "might... soon"). It's 1 rather than 0 because 0 health makes someone collapse today, and they wake at 25 (`GAME.collapse`), so a crash would end up healing them. For now they recover as they do from anything: slowly when their needs are met, faster asleep.
- `injuredFromMph: 5`. Slower contact does nothing, so a touch while parking or two things easing apart can't cripple anyone. It uses the same speed as above and the same check by the server. A person walking into a person never hurts.
- `lives: 3`. The server counts them, read from the same config. A new invite after dying for good starts with the full number, and a rejoin invite keeps what's left.
- The explosion is a fireball, then flames on the wreck for a few seconds, and a sound, on every nearby player's screen, with no map or Google cost. The wreck stays as a solid, burnt-out car, for good. It can't be driven or searched.
- The server is the only place that decides a death. With lives left, the player gets a short notice and respawns. With none left, their secret no longer signs in as anyone, their badge goes from phones, and the name stays on the list, marked as dead.
- If a manager runs out of lives, the next person up takes over, and everyone's told. If nobody's alive, nobody can invite, so the world is over unless a save is loaded.
- Death at 0 health stays later, and uses the same path.

**Also needed:**
- **Parked cars are solid and don't move** for now, so they're exact: everybody agrees where they are.
- **FSD** still drives into things, and in a world that can kill you. The improvement is on the to-do list, and until then using it is at your own risk.
- **Road following:** planted cars sit by the kerb, using a fixed offset, as roads have no lane data. Some will be in the way.
- **A driver who disconnects** at speed: the car stops where it is, with no crash.
- **Being unstuck.** Two things that end up overlapped (a late message, a load) ease apart. Nobody appears on top of someone: starting points look for clear ground.
- **People block each other.** A person can be used to block a doorway: F's climbing (`climbOver`) should work over people too, and someone marked away isn't solid, so a person who's gone for lunch can't seal a room.

## Finding the same building: tested
Everything depends on two players meaning the same building and seeing the same rooms.

**Ids agree.** Three z14 tiles (Dulles, Manhattan, Reston, about 4,800 pieces), with origins from 50 m to 10 km away: no mismatches. At 40 km one Manhattan tile dropped one piece, and the test, which compares by position in the list, then reported 4,268 mismatches. That case is unproven either way until it's compared by outline.

**Layouts do not agree, today.** The same building from different parking spots:

| Parked away | Identical layouts of 40 (Reston) | With a frame centred on the building |
|---|---|---|
| 500 m | 11 | 40 |
| 2 km | 5 | 40 |
| 10 km | 0 | 40 |

`toLocal` scales east-west by the cosine of the parking spot's latitude, and a few centimetres can tip a layout decision. This contradicts the line in `BuildingStore` that "the same id rolls the same plan", so a sandbox floor dropped for room can already come back different.

**The fix:** before laying out a floor, turn its outline into metres from the building's own id, rounded to a millimetre. That gave 40 of 40 in the test (one tile, joined parts not covered). So even two people entering in the same instant get the same rooms. It's worth doing first, and it helps the sandbox.

**The server still keeps the first layout.** Layout code changes between deploys, and a visited building must stay as found.

**Map edits:** if OpenStreetMap redraws a footprint so that its centre moves, it gets a new id and its state is orphaned. `docs/INTERIORS.md` calls that a small loss, but in a permanent shared world it's a real one. Two players may also briefly hold different versions of a tile. So the server keeps each building's outline, and a new id whose outline mostly overlaps a known building is treated as that building.

**Other things the code assumes:**
- `plan.floors`, `plan.core`, `plan.look` and `plan.homeKind` are filled in late, as a side effect of first use. They must be settled and sent as one step, or two players could disagree.
- A building is only saved as unknown when the sources answered (`sure`). The server must refuse a plan from a client whose sources failed, or one bad connection would lock a building for everybody for good.
- Positions in shared data are always lat/lng outdoors and the building's `u, v` indoors, never metres from a car.

## The connection
**Server:** a Node service, as PHP can't hold open connections.
- `server/` in this repo, deployed to `/opt/geodrive`, outside the web folder. systemd service on `127.0.0.1:5175`, with a memory limit so it can't crowd out Agecraft.
- One Apache file, `/etc/httpd/conf.d/geodrive-proxy.conf`, sending `/geodrive/ws` to it as Agecraft 3D does. Adding it needs one graceful reload, and the owner is asked first.
- Its own copy of Node, not Agecraft's in `/opt/agecraft`, so that their upgrades don't touch each other.
- `ws` and `better-sqlite3` from npm, on the server only. The game stays free of packages.
- One SQLite file per world in `/var/lib/geodrive/worlds`, which also makes saving simple.

**Measured headroom:** 2 CPUs, 3.8 GB with 2.4 GB available, 71 GB disk free, load average 0.1. Node 20, `proxy_wstunnel` and `mpm_event` are in place.

**Messages:**
- *Presence* is small and binary, and newest wins. About 24 bytes: lat and lng as whole numbers (1 cm), heading, speed, flags, gait, floor.
- *Operations* are JSON with an id, each answered. Saved before the answer goes out.
- *Interest:* the browser says which tiles it's near. The server sends plans, states, drops and touched cars for those only.

**Rates:**
| Doing | Sent per second |
|---|---|
| Within 100 m of another player, moving | 20 |
| Driving, moving | 10 |
| On foot, moving | 5 |
| Still or away | 1 |
| Over 3 km from the person receiving | 0.2, for phones and the nav screen only |

Worst case, all eight close together and moving, at about 60 bytes on the wire each: 1.2 KB/s up and 8.4 KB/s down per player, and 67 KB/s out of the server per world.

**When the connection drops:** driving, walking and needs carry on, and collisions stop against people who've gone quiet. Other people fade after 5 s. Reconnecting backs off from 1 s to 30 s, and never reloads the page, since a page load is the one thing that costs money. Taking, dropping, using and getting in a car say the world can't be reached, rather than guessing, so nothing can come apart.

**A hidden tab** stops the game loop, as it does today. Presence goes from a timer, marks you as away, and your person stands still. A hidden driver's car stops.

**Mixed versions:** the connection carries a protocol number. A client that's too old gets "Refresh to update". Most deploys don't change it, and deploys that don't touch `server/` don't restart the service.

## Phones: finding each other
Others in the world are shared contacts, in the style of Find My, all from presence, with no Google call.
- **People,** a new phone app (an entry in `APPS` and a picture in `ART`), lists each person: a round badge with initials, name, then a line such as "1.2 mi NE · Driving", "300 ft W · On foot", "In a building, floor 3", or "Last seen 2 hours ago".
- **Map** shows the badges at their positions, on the phone's existing map, and picking one centres on them. The same badges go on the nav screen in a car.
- **Compass** gets a badge per person around the dial, as `carMark` does for the car, and a line under it for the nearest.
- **Phone and Messages** (`CONTACTS`): real players are listed above the made-up ones, with the location line.
- The phone is only out on foot today (`pocket.js`), so in a car the nav screen is where you see them.
- **A dead phone shows nothing,** which suits the Phone need: charge it to find your friends.
- Location sharing is always on in this version, as everyone was invited by a friend.

## Chat
**Typing, as in Minecraft.**
- Enter opens a line at the bottom. Enter sends, and Esc or an empty line closes it. It goes to the group unless it starts with `/w`.
- `/w name message` sends a DM. Tab finishes a name. An unknown name says so and keeps what was typed. Someone offline gets it when they're back, and the sender is told.
- Up to 400 characters, as the phone allows today, and 5 messages in 5 s. Sent over the connection, saved before it's passed on. If the world can't be reached, what's typed stays in the line.

**Enter is free today** in driving and walking. It only means something when something else is open: the phone's dialler (`pocket.js`), the lift's floors and confirm questions, and those keep it. The sandbox has no chat, so nothing changes there.

**The game doesn't stop while typing.** It can't, in a shared world. Keys are let go (`keys.clear()`), so a car coasts with road following on, and a person stands still. With crashes that kill, typing at speed is its own risk. On foot the mouse is held for looking (`requestPointerLock`), so opening the line lets it go, and clicking is possible.

**Previews.** Styled as an iPhone message banner: a rounded card, a small Messages icon, the title in bold, "now" at the right, and the text below.
- The title is "Chat with Dana, Mo, Priya" for the group, or the name for a DM.
- **In a car** it shows as a dashboard notification at the top of the nav screen, in the same style. **On foot** it comes up from the phone, above the tray.
- It slides up, stays for a time depending on its length (4 to 10 s), then fades and slides out. No more than 3 at once, the newest at the bottom, and a burst from one chat folds into one card, as a phone does.
- Long ones are cut at two lines, and clicking opens the whole message, which then stays until it's clicked away or times out after that.
- Coming back to a world doesn't flash everything missed: one card says "3 new messages".
- With the Messages thread open on the phone, nothing pops up, and it just appears in the thread.
- A soft text tone in `sounds.js`, through `sfx` like the others.

**Keeping it light on the map:** solid cards, not frosted glass, as `backdrop-filter` over the map is costly (see "Performance log" in `CLAUDE.md`), and that's the one part of the iPhone look to fake. Movement only by `transform` and `opacity`. Nothing is drawn or written while there's nothing to show. Text always goes in as text, never HTML.

**On the phone.** The Messages app lists the group first, then players, then the made-up contacts, with iMessage bubbles as it has today. Each thread keeps the last 50, kept on the server, so they survive a refresh or a rejoin invite. The dead drop out of the group's name. Loading a save rewinds chat too.

## Names and colours on the map
**Name tags, tested on the real map.** A model can't show text, and nothing projects a map position to the screen. `Marker3DElement` does: given an SVG instead of its pin, it's a dark rounded tag with white text, that stays the same size on screen, and fades when behind things. Eight of them moved every frame held 119 fps (slowest frame 17 ms), and adding all eight lost nothing measurable, in the same small-window conditions as the table in "Drawing other people". The default red pin and label was tried first, and it looks wrong.

- Written with `textContent`, so a name can't inject anything.
- Moved with its person, using the same `moved` test.
- Markers add no Google call. I expect no charge beyond the map load, which should be confirmed in Cloud Console during stage 1.
- **Indoors,** the map's hidden. Rooms are ours, and `footGl.js` has the camera's numbers, so it's a small HTML label placed from them.

**Colours are cheap.** Tested: all 17 frames of a person in new colours took 9 ms to build, 1.5 ms for the slowest, on top of 14 ms once for the shapes. So each player's set is built when needed. The cost is holding them: 3 MB of model text a person, so 21 MB with seven others, shared between people with the same colours. It's the reason models are only built within 300 m.

**Male and female,** for now, are the same body with different hair. `personParts(frame)` gets a figure, and female adds a longer block of hair down the back of the head and neck, in the `HAIR` colour, with a few more triangles and no new part. The sandbox stays as it is today. Indoors uses the same parts, so it follows. A real second body is on the to-do list. A test checks that long hair stays with the head through every frame.

## Drawing other people
**Measured on the real map, 2026-11-02**, moving models every frame while spinning the camera:

| On the map | Frame rate | Slowest frame | Script per frame |
|---|---|---|---|
| Nothing | 119 fps | 10 ms | |
| 8 cars | 119 fps | 14 ms | 0.07 ms |
| 32 cars | 119 fps | 15 ms | 0.18 ms |
| 8 people (136 models) | 119 fps | 13 ms | 0.07 ms |

Adding them is the catch: 8 people's 136 models at once lost about 400 ms, worked out from frames missing over the test, and 1 person about 60 ms.

**These numbers flatter it.** It was a pane of 449 x 742 at an already-loaded spot on this Mac, with the car parked so no new map streamed in, and the frame rate may not see all of the map's own graphics work. They say script cost is no concern. They don't settle graphics cost. Stage 0 repeats them full screen, on a weak machine too. World cars make this matter more.

**So:**
- Each car look is built once, and its 69 KB model shared.
- A person's 17 frames are 174 KB each, 3 MB in all, one set per look. Add a person's models only when they come within 300 m, one per frame and one person at a time, about 6 s apart, never in one go. See the second run under "Stages".
- Show people and driven cars within 1.5 km, and parked cars within 300 m, the nearest 20. Beyond that a person is a badge on the phone and nav screen.
- Write to a model only when it has moved, using the same `moved` test as `syncScene`.
- Bridges: the same `RELATIVE_TO_MESH` switch as your own car, sent in presence.
- Altitude: remote cars follow the map's ground (`RELATIVE_TO_GROUND`) rather than a sent height, or they'd float, as each player samples ground for themselves.
- Headlights are a screen effect drawn for your own car (`#night`, `#beam`). Other cars' lights need a small lit part on the model, not those canvases.
- Indoors: `footGl.js` draws someone on your floor from the same frames, positioned by `u, v`. Someone in a building isn't drawn outdoors at all.
- A remote change marks the room stale as a push does already, at most a few times a second, and the solids are rebuilt with it. If a thing is pushed onto someone standing there, they must be able to walk out of it. A test covers that.

## Cost
No Google call is added per hour of driving. Other players, world cars and phone badges cost nothing, as moving models on a loaded map isn't billed.

- The one real change: more people means more map loads, one per page load, at $7 per 1,000 after 5,000 free a month. Eight friends with a few refreshes each in a night is about 30. Reconnecting never reloads, for this reason. Loading a save does, and is rare.
- Town lookups, routes and geocodes stay per player, on today's limits.
- **"Go to friend" must make one route when asked, not chase them.** A moving destination would pay for re-routes.
- Nothing from Google goes on the server or to other players. Each person's town and any address label stay in their own browser. A friend is shown as a distance and direction. This avoids storing or passing on Google's answers, which their terms limit.
- **The start stays in the creator's browser.** An address goes through Google Geocoding once, at creation, as it does today. The server never receives the address or the geocoded position. It only sees where the creator's person goes from there, once placed on a road from the free tiles, the same as any player's position. The world's name is what the creator typed.

## Stages
Each ends deployed, with the sandbox unchanged.

**Stage 0. No visible change.**
1. Frame centred on the building, with a test comparing layouts across origins.
2. The `world` object and `SandboxWorld`, with the clock and everything saved going through it.
3. The game able to begin on foot with no car, and `car` no longer assumed to be the only one.
4. Repeat the map measurement, full screen and on a weak machine. This tests the 8-player cap and the distances above.

Done so far: 1 to 3. `world.js` holds the world object. The sandbox uses the same keys and the same behaviour as before. `?world=walktest` is a practice world in the browser, with its own saves and no server: it starts on foot with no car, keeps its own clock and hides what a shared world won't allow.

Measured below on the owner's machine. To repeat 4 on another machine, open `?world=walktest` (or the sandbox, parked), put the window full screen and in front, and run `__geodrive.crowdTest()` in the console. It adds seven people with name tags, seven driven cars and twenty parked ones the way the game will, one a frame, prints a table, logs a `crowd` event and removes them all, with no Google call beyond the page's map load. It sets `notInView` if the browser was throttling it. A run from a window out of sight on 2026-11-02 placed all 153 models and cleaned up, but its frame rates were meaningless.

**First real run, the owner's machine, 2026-11-02:** 120 fps with nobody and adding all 153 models never dropped below 15 ms a frame. Everyone moving held 77 fps (p95 17 ms), and with the camera turning 56 fps (p95 32 ms, slowest frame 90 ms). But the game froze once for 8.8 s, after everything was on, and once more for 750 ms. So adding one model a frame doesn't protect anything: the map does its work on the models later, in one go. Until that's understood, the plan's "17 frames per person" and 8 players aren't proven. The test now adds each person in turn, three with all 17 frames and four with 5, and has a baseline with the camera turning, to find the cause.

**Second run, same machine (32 threads, window 1061 x 901), adding people in turn, about 6 s apart:**

| On the map | fps | p95 | Slowest frame |
|---|---|---|---|
| Nobody | 120 | 8.5 ms | 11 ms |
| Nobody, camera turning | 105 | 15.7 ms | 58 ms |
| Adding 27 cars | 116 | 11 ms | 35 ms |
| Adding a person with 17 models (3 of them) | 103 to 119 | 9 to 16 ms | 17 to 69 ms |
| Adding a person with 5 models (4 of them) | 115 to 120 | 9 ms | 15 to 78 ms |
| All 105 models, moving | 84 | 15.9 ms | 21 ms |
| All 105 moving, camera turning | 76 | 19.5 ms | 25 ms |

No freeze. Sets of 17 cost no more than sets of 5 when added, so the number of frames isn't the trouble, and people keep all 17. What changed from the first run is the pace: all 153 models within about 5 s froze for 8.8 s, and spaced out they didn't. That's two runs, one with 48 fewer models, so it points at pace rather than proves it. **Rule for stage 1: only one person's models are added at a time, about 6 s after the last.** A name tag and standing model show at once, so nobody is invisible while waiting. This suits a world where people join one at a time; the hard case is walking up to a group, which is the one to watch. The moving figures show 7 others cost about 30 fps here, from 105 to 76 with the camera turning, which leaves room.

**Stage 0's gate is met on the owner's machine, and 8 players stands.** A weak machine is still untested, as this one is strong. The performance log's `peers` and `fps` will show it as soon as someone joins on one.

**Stage 1. People.** On foot only, so for testing rather than for inviting friends yet.
1. Service, Apache file, key and deploy changes (after asking).
2. Creating a world, invites, the join dialog with names and colours, managers, rejoin invites, the picker, and removing the old share.
3. Player data on the server, presence, drawing people in their colours, the world clock, name tags.
4. People solid to each other. The People app, Map and compass badges.
5. Chat: the Enter line, `/w`, previews, the phone's threads.

Stage 1 done so far: all of the above, tried with bots and by the owner and a friend. Not done yet: F climbing over someone blocking a doorway, and moving badges on the nav screen, which only matter once there are cars.

**Stage 2. Cars.** A world's ready for friends from here.
1. Planted cars, getting in and out, one driver, each car's fuel and storage, sledgehammers.
2. Drawing others' cars, collisions and bumps.
3. Injury and death: the server's check, explosions, wrecks, lives and respawning, next man up.

**Stage 3. A shared place.**
1. `worldOps.js` for the bag, with buildings and floors on the server, and matching by outline.
2. Taking, opening, pushing, holes and lights, live for people in the room.
3. Drops, indoors and out.
4. Saving and loading.

Stage 3 done so far: buildings, floor layouts, what's been taken, opened, pushed and broken, lights and dropped things are on the server, through `sharedWorld.js`, which stands in for `BuildingStore` and `Drops`, and `worldOps.js`, used by both sides. People on your floor are drawn with name labels and are solid. Tried in a browser against a scripted second player. Still to do: saving and loading. What differs from the plan: taking something shows at once and is taken back if someone else got there first, rather than waiting for the server, as the game's actions don't wait; and the bag is still saved whole from the browser rather than in one step with the take, so someone who loses a race for a split second has the thing in their bag, and it's then removed. All dropped things are sent on joining rather than by area, as there are few, limited to 5,000.

**Stage 4. Doing things together.** Passengers, horns heard at a distance, go to friend.

**To do, later:**
- FSD: brake for cars and people ahead, and steer round them.
- Damage short of death, repairs, keys.
- Killing players by other means, and death at 0 health.
- Changing your colours after joining, and a real female body and other bodies.
- Stealing a car with someone in it.
- Mode 3.

## Testing
- **Pure and in node, as now:** `worldOps.js`, invite and manager rules, smoothing, clock maths, the layout frame, collisions (rectangles at speed, no tunnelling), which cars get planted, reading chat lines and `/w`, name rules, keeping the last 50.
- **Two fake players against a real server, in `npm test`:** both take one thing and exactly one gets it; both get in one car and exactly one does; a used or expired invite refused; reconnect mid-action; a stale client refused; an edited save refused; another world's save refused; a deadly claim that paths don't back up becomes a stop; a life is taken only once per crash; a player out of lives can't sign in; the backup takes over, then invite order; two people claiming one name, where one is refused and keeps their invite; a dead person's name refused for good; a DM reaches only its two people.
- **The same tests against every mode:** see "The three modes".
- **Bots:** `scripts/bots.mjs` drives N fake players, for load and for testing drawing without a second person.
- **In the performance log:** `peers`, `peerModels`, `netInKB`, `rttMs`, `opsWaiting`, plus events for connecting, bumps and refusals. The log already says when `fps` drops; this says whether others are the reason.
- **Two real browsers,** before each stage is called done, as that's the only proof of what people see. Collisions need real play with real delays.
- **Sandbox guard:** a test that the sandbox makes no connection and uses today's storage keys.

## Reviewed from each side
**Architect.** The main risk is the seam leaking, and the second is that world cars touch more of `main.js` than anything else here: it has one `car`, one `pos`, one `model`. That's why stage 0 changes it before anything shared exists. Module-level state like `saved` in `foot.js` has to go too.

**Gamer.** What sells this is finding a friend on your phone, walking over, and getting a car that starts after trying three that don't. Then arriving somewhere they've been: the hole in the wall, the missing food. The rough spots to watch:
- Starting on foot is a slower opening than today, so it needs a running car within a short walk of where someone first appears.
- Someone can empty a building before you arrive, and loot doesn't come back. Over a long world, food could run out near popular spots. Worth watching, with no fix now.
- At 1 game hour per 5 minutes, needs run faster than the sky when walking, and a sleeper wakes to the same sky. It may feel odd, and the number is there to try.
- Death raises the stakes of everything else here, which is the fun of it, but it makes a wrong death hard to forgive. That's why the server checks them, and why 3 lives is a good place to begin. Friends can also ram each other on purpose, which trust accepts.

**Performance.** Sandbox gets no new work. Costs in a shared world are bounded by distance limits and player caps. The open question is graphics on weak machines, which is why stage 0 measures first. Collision checks are 7 others and up to 20 parked cars per frame, which is nothing beside what a frame does now.

**Security.** Names and messages reach other players' screens, so they're always written as text and limited in length. Colours must be plain `#rrggbb`. The server checks sizes, ranges and rates on everything, checks the origin, and takes no URLs. Save files are checked before anything in them is read. The worst a member can do is what the owner has accepted: wreck a world they were invited to. Nobody can get in without an invite.

**Operations.** First always-on GeoDrive service. If it dies, worlds lose others and their saves until systemd restarts it, and driving and the sandbox carry on. Disk failure loses whatever nobody saved. Losing the config file loses all save files.

**Accuracy.** The layout frame, late-filled plan fields and collisions at speed are the known weak points, each with a test above. Collisions are the only one that can't be made exact, only good, so deaths get a check of their own.

## What mode 3 will need
The `world` object carries over, and with bags on the server, more does than before. These don't, and should not be promised:
- Accounts, as strangers need more than a secret in a browser.
- The server has to check movement, needs and actions.
- A real answer to griefing, as trust stops working.
- Splitting by area, across more than one process, and likely more than this server. Collisions and interest are by distance already, which helps.
- Map load costs at a scale that needs a budget before launch.

## Still open
None of these block stage 0.
1. How many cars get planted, and how many run. Numbers to try in play.
2. Whether top speed should be lower in shared worlds, once collisions can be tried.
3. How many lives to settle on after testing.
4. What happens to someone injured: whether they can die from it, and how soon.
