# Building interiors: plan

Status: steps 1 and 2 are built. Every building knows its type and floors (`buildings.js`). Homes have rooms, doorways and furniture on the ground floor (`furnish.js`, `furniture.js`), saved per building. Every building of 2 or more floors has stairs, and from 5 floors a lift, in the same place on every floor (`coreOf`). All 19 types are furnished from `TYPE_ZONES` and `RECIPES` in `furnish.js`, using the kit's models and about 40 made from boxes in `furniture.js` (`BUILT`).

## How it works, start to finish
1. **Identify.** The first time someone enters, work out the building's id, type and floor count, then save them.
2. **Lay out a floor.** The first time someone reaches a floor, split it into zones and fill them from the tables below, then save the result.
3. **Return.** Every later visit reads the saved floor, so nothing moves or changes colour.

Floors nobody visits are never generated, so a 100-floor tower costs almost nothing until someone climbs it.

## What the map can tell us
Measured on 2026-11-01 from one zoom-14 OpenFreeMap tile per place, counting footprints.

| Place | Footprints | Has a POI inside | Land use only | Neither | Tallest |
|---|---:|---:|---:|---:|---:|
| Dulles terminal | 171 | 23 (13%) | 148 | 0 | 59 m |
| Ashburn suburb | 1305 | 25 (2%) | 1218 | 62 | 11 m |
| Sterling | 2162 | 27 (1%) | 1999 | 136 | 8 m |
| Tysons | 603 | 133 (22%) | 454 | 16 | 118 m |
| Downtown DC | 1632 | 465 (28%) | 1097 | 70 | 63 m |
| Midtown Manhattan | 4309 | 1474 (34%) | 1038 | 1797 | 444 m |

- The tiles have a `poi` layer the game doesn't read yet, naming banks, restaurants, hotels, shops and more. Its `subclass` is the best clue available, and it is free. Most suburban houses have none, so land use and size decide those.
- Buildings have no type tag. Google Places could name more of them, but it is billed per building, so this plan does not use it.
- A height of **5 m** means "unknown": it is the median in all five places outside Manhattan, where few buildings have height data. It must not be read as one floor. Other heights are usable.
- Footprints can be huge: bounding boxes reach 196,000 m² at Tysons and 100,000 m² at Dulles. Those need a limit on how much gets furnished.

## Working out the type
First match wins. Rules 1 and 2 come first because a terminal or mall holds many POIs, and it must not become a "restaurant" because of one of them. POIs come before hangars so a café or hotel on airport land is what it says.

| # | Clue | Type |
|---:|---|---|
| 1 | In `aerodrome` land, footprint over 5,000 m² | Airport terminal |
| 2 | 4 or more shop or food POIs inside, footprint over 3,000 m² | Mall |
| 3 | A POI inside that the table below lists (others, like toilets, are ignored); the commonest wins | Its type |
| 4 | In `aerodrome` land, smaller | Hangar |
| 5 | `school`, `university`, `college`, `hospital`, `library` land | That type |
| 6 | `commercial` land | Office |
| 7 | `industrial` land: footprint over 2,000 m² and under 15 m or unknown, otherwise | Warehouse, otherwise factory |
| 8 | `retail` land: over 3,000 m², otherwise | Supermarket, otherwise shop |
| 9 | Anything else: under 40 m², 40 to 400 m², over 400 m² or over 12 m tall | Shed, home, apartments |

### Tried on real buildings
The classifier run over the tile at each place, with its neighbours loaded, on 2026-11-01. About 0.03 to 0.4 ms a building.

| Place | Most common types | Cut pieces joined | Ground floor only | Tallest |
|---|---|---:|---:|---:|
| Dulles | hangar 143, terminal 19, office 3, shop 3 | 13 | 0 | 4 floors |
| Ashburn | home 1093, apartments 119, shed 57, shop 11, school 6 | 50 | 0 | 5 floors |
| Tysons | home 242, office 135, apartments 131, shop 31, supermarket 14 | 59 | 15 | 31 floors |
| Downtown DC | home 658, office 325, shed 139, school 136, apartments 134 | 47 | 101 | 16 floors |
| Midtown Manhattan | apartments 2338, office 488, shed 276, home 261, hotel 130 | 194 | 765 | 120 floors |

Known weak spots, all from what the map holds:
- A building mapped as many small parts, like some of the Dulles terminal and much of Manhattan, is judged part by part. A 25 m part of a terminal can come out as a shop, and tiny Manhattan parts as sheds.
- Every large building on airport land counts as a terminal, including cargo sheds.
- Downtown row houses with no POI come out as homes, even if they are really offices.

## Building types and floors
"Floors" uses the real height when it isn't 5 m, as height ÷ floor height, rounded, within the limits shown. When the height is unknown, the last column applies.

| Type | POI classes, with subclasses in brackets | Floor height | Floor limits | Height unknown |
|---|---|---:|---:|---|
| Home | | 3 m | 1 to 4 | 1 or 2, sometimes 3 |
| Shed / garage | | 3 m | 1 | 1 |
| Apartments | | 3 m | 2 to 120 | 3 to 5 |
| Hotel | lodging | 3.2 m | 2 to 80 | 3 to 8 |
| Office | office, town_hall, police, fire_station (post_office) | 3.8 m | 1 to 120 | 1 to 4 by footprint |
| Bank | bank | 4 m | 1 to 60 | 1 or 2 |
| Restaurant | restaurant, fast_food | 3.5 m | 1 to 3 | 1 |
| Café / bar | cafe, bar, beer, bakery, ice_cream | 3.5 m | 1 to 2 | 1 |
| Shop | shop, clothing_store, butcher, pharmacy, hairdresser, laundry, car, bicycle, music (department_store, books) | 4 m | 1 to 3 | 1 |
| Supermarket | alcohol_shop, grocery (convenience) | 5 m | 1 to 2 | 1 |
| Mall | | 5 m | 1 to 4 | 2 |
| School | school, college | 3.8 m | 1 to 6 | 1 to 3 by footprint |
| Hospital | hospital, dentist, doctors, veterinary | 3.8 m | 1 to 20 | 1 to 4 by footprint |
| Worship | place_of_worship | 8 m | 1 to 2 | 1 |
| Museum / library | museum, theatre, cinema (library, gallery) | 5 m | 1 to 5 | 1 to 2 |
| Warehouse | | 9 m | 1 | 1 |
| Factory | | 6 m | 1 to 3 | 1 |
| Hangar | | 12 m | 1 | 1 |
| Airport terminal | | 6 m | 1 to 4 | 2 |

A shop or restaurant POI in a building of 5 or more floors fills the ground floor only, and the floors above follow the land use. A bank in a tower is a bank downstairs and offices upstairs.

## The queue
Which types you can go into, and what each still needs. A locked building says "Sorry you can't get in. It's locked." To open a type, add it to `OPEN_TYPES` in `buildings.js`; it also needs rooms in `TYPE_ZONES` and `RECIPES` in `furnish.js`.

| Status | Type | Has rooms? | What it needs |
|---|---|---|---|
| Locked | Hospital | Basic | Real wards, reception, exam rooms, operating room, nurses' station |
| Locked | Clinic, dentist, vet | No | Waiting room, reception, exam rooms. Was counted as a hospital |
| Locked | Pharmacy | No | Shelves, counter. Was counted as a shop |
| Locked | Hair and beauty salon | No | Chairs, mirrors, basins. Was counted as a shop |
| Locked | Car dealer or repair shop | No | Cars, lifts, tools. Was counted as a shop |
| Locked | Gas station | No | Shop, counter, fridges. New type |
| Locked | Fire station | No | Engine bay, fire engines, bunks. Was counted as an office |
| Locked | Police station | No | Front desk, offices, cells. Was counted as an office |
| Locked | Post office | No | Counter, parcels, boxes. Was counted as an office |
| Locked | Community centre or town hall | No | Hall, chairs, offices. Was counted as an office |
| Locked | Gym | No | Machines, weights, mats, lockers. New type |
| Locked | Library | No | Stacks, reading tables, desk. Was counted as a museum |
| Locked | Cinema | No | Screens, seat rows, ticket desk, snacks. Was counted as a museum |
| Locked | Theatre | No | Stage, seat rows, foyer. Was counted as a museum |
| Locked | Stadium | No | Seating, concourse, field. New type |
| Open, could be better | Lobbies, in offices, hotels and apartments | Better | Now has a desk with a chair, sofa, armchairs, rug, notice board and plants. A lift lobby and signs would help |
| Open, could be better | Hotel, mall, airport terminal, museum, place of worship, school, supermarket, warehouse, factory, hangar | Basic | Made from boxes and only checked by tests, apart from the school's layout. Walk round them and lock any that disappoint |
| Open | Parking garage | Yes | Done: bays, parked cars, pillars, lanes with arrows, ramps, ticket machines, a barrier on the ground floor. Also found from parking aisles mapped inside a footprint |
| Open | Apartment building | Yes | Done: corridors, a landing at the stairs, up to 9 flats a floor with front doors, each with a kitchen, bathroom, living room and bedroom. Lobby, mailroom, laundry and gym downstairs. Very large footprints get oversized flats |
| Open | Home, shed, office, bank, restaurant, café, shop | Yes | Homes and rooms in them are due an adjustment pass |

Buildings already visited keep the type they were saved with until "Forget building interiors" in Settings, so a pharmacy saved as a shop stays open.

## What is on each floor
Zones are chosen in order until the floor's area runs out, so a small home gets the essentials and a big one gets the extras. Every floor above the first also has stairs, and buildings of 5 or more floors have a lift.

| Type | Ground floor zones | Upper floor zones |
|---|---|---|
| Home | Hall, living room, kitchen, dining, bathroom; extras: study, laundry, garage | Bedrooms, bathroom; extras: nursery, office, closet |
| Shed / garage | Workshop or car bay | |
| Apartments | Lobby, mailroom, laundry, gym | Corridor with flats: living-kitchen, bedroom, bathroom |
| Hotel | Lobby, reception, restaurant, luggage | Corridor with rooms: bed, ensuite; housekeeping closet |
| Office | Lobby, reception, security desk | Open plan, meeting rooms, private offices, break room, toilets, copy room |
| Bank | Lobby, teller counter, waiting area, advisor offices, vault | Offices, records, meeting rooms |
| Restaurant | Dining room, bar or counter, kitchen, toilets | More dining, storage, staff room |
| Café / bar | Seating, counter, toilets, storeroom | More seating |
| Shop | Sales floor, tills, fitting rooms, stock room | Sales floor, stock room |
| Supermarket | Aisles, tills, produce, fridges, bakery, stock room | Storage, staff room |
| Mall | Central walkway, shop units, food court, toilets | Walkway, shop units, cinema if big |
| School | Entrance, classrooms, cafeteria, gym, office | Classrooms, lab, library, staff room |
| Hospital | Reception, waiting, emergency, exam rooms | Wards, operating room, nurses' station |
| Worship | Hall with rows of seats, front altar, side room | Balcony |
| Museum / library | Entrance, galleries or stacks, gift shop, toilets | Galleries or stacks, reading room |
| Warehouse | Rows of racking, loading bays, small office | |
| Factory | Machine lines, conveyors, stores, office | Offices, stores |
| Hangar | Aircraft bay, tools, office | |
| Airport terminal | Check-in, security, baggage claim, shops | Gates with seat rows, shops, food court, lounge |

### How a home's floor is divided
Each room has a target in m²: living 28, kitchen 15, dining 14, bedroom 16, study 10, bathroom, hall and laundry 6. Targets add up to at most 75% of the floor, and the rest makes rooms roomier. The floor is cut in two again and again by those shares. Rooms are in order of need, so when they don't all fit, the last goes and the floor is tried again; living rooms, kitchens and bedrooms also need a minimum width. A single-storey home gets its bedrooms downstairs. Measured over 200 layouts each of 5 shapes, about 1 to 3 ms a floor and 2 to 5 KB saved.

Known gaps in those layouts: a very small home (30 m²) misses a sink in about 1 in 6, and about 1 L-shaped home in 12 has a bedroom with no bed. The likely reason for the second is that a bent room's rectangle includes space outside the footprint, but that hasn't been confirmed.

## What is in each zone
**Bold** items are always placed. Others are picked at random until the zone reaches its target fullness. The recipes for homes are in `RECIPES` in `furnish.js`.

| Zone | Items |
|---|---|
| Living room | **Sofa, TV and stand,** armchair, coffee table, rug, floor lamp, bookshelf, plant, side table |
| Kitchen | **Counter run, sink, stove, fridge,** table, stools, microwave, bin |
| Dining | **Table, chairs,** sideboard, rug, plant |
| Bedroom | **Bed, wardrobe,** nightstands, dresser, desk and chair, lamp, rug, laundry basket |
| Bathroom | **Toilet, sink,** bath or shower, cabinet, towel rail, mat |
| Hall / lobby | **Rug or mat,** coat rack, console table, bench, plant, stairs |
| Laundry | **Washer, dryer,** shelves, basket |
| Garage / workshop | **Workbench, shelving,** tool chest, boxes, bicycle, mower, oil drum |
| Open-plan office | **Rows of desks with chair and monitor,** filing cabinets, printers, plants, whiteboard, bins |
| Private office | **Desk, chair, monitor,** guest chairs, bookcase, plant, cabinet |
| Meeting room | **Long table, chairs, screen,** whiteboard, phone |
| Break room | **Counter, sink, fridge, coffee machine,** table, chairs, vending machine |
| Reception | **Desk, chair, waiting seats,** plant, sign, security gate |
| Toilets | **Stalls, sinks,** hand dryer, bin |
| Teller counter | **Long counter, teller chairs, monitors, queue ropes,** check-writing stand, ATM |
| Vault | **Vault door, safe deposit wall,** cash carts, table, chair |
| Restaurant dining | **Tables, chairs,** booths, host stand, plants |
| Restaurant kitchen | **Stoves, prep tables, sinks, walk-in fridge,** shelves, bins |
| Bar / counter | **Counter, stools, shelves of bottles,** till, taps, coffee machine, pastry case |
| Sales floor | **Display racks, till counter,** mannequins, shelves, mirror, display tables |
| Supermarket aisles | **Shelf rows, tills,** fridges, freezers, produce stands, trolleys, baskets |
| Food court | **Food counters, tables, chairs,** bins, plants |
| Hotel room | **Bed, nightstands, desk, chair, TV,** armchair, wardrobe, luggage stand |
| Classroom | **Rows of desks and chairs, teacher's desk, whiteboard,** bookshelves, lockers, globe |
| Cafeteria | **Long tables, benches, serving counter,** bins, vending machine |
| Gym | **Benches, basketball hoops** or **treadmills, weights, mats** |
| Ward / exam room | **Hospital bed, curtain, monitor,** chair, cart, sink, drip stand |
| Warehouse racking | **Pallet racks in rows,** pallets, boxes, forklift, trolley, drums |
| Machine line | **Machines, conveyors, workbenches,** drums, control panels, safety rails |
| Hangar bay | **Small plane or helicopter,** tool chests, steps, drums, tug |
| Gate / check-in | **Seat rows, desk, departure board,** bins, kiosks, luggage carts, rope lines |
| Gallery / stacks | **Display cases, plinths, wall pictures** or **bookshelves in rows,** benches, reading tables |
| Worship hall | **Rows of pews, altar or front platform,** lectern, candles, side tables |

## How the randomness works
| What varies | How it is chosen | When |
|---|---|---|
| Style | One per building, such as modern, traditional, cheap or luxury. It sets colours and which item shapes are allowed | First entry |
| Colour scheme | One per zone, from the style, so a room looks chosen rather than scattered | Floor generated |
| Item shape | 2 to 4 versions of each item, such as a 2 or 3 seat sofa, or a round or square table | Floor generated |
| Item colour | From the zone's scheme, slightly varied | Floor generated |
| Rotation | Square to the nearest wall or to its table; loose items like chairs get up to ±5° | Floor generated |
| Fullness | Each zone gets 50 to 100% of what fits | Floor generated |

The dice come from a seed made from the building's id, so a building comes out the same even if its saved copy is lost.

Footprints are often not square to the compass, so each floor is laid out along the building's longest wall.

## The item catalogue
Items come from two places: [Kenney's Furniture Kit](https://kenney.nl/assets/furniture-kit) where it has them, and boxes and simple shapes built from code, like the cars, where it doesn't. Both end up in the same catalogue and the same kind of mesh.

### Kenney Furniture Kit: use it
Inspected on 2026-11-01 from the download. The page says version 1.0 and the kit's own licence file says 2.0, both from 2018.

| Check | Result | What it means |
|---|---|---|
| Licence | CC0; credit is welcome but not required | Free to ship. Credit goes in `docs/TECH_STACK.md` anyway |
| Models | 140, each in GLB, OBJ, FBX, DAE and STL | GLB is the one to read |
| Textures | None; plain colours on named materials | Fits `footGl.js`, which draws vertex colours |
| Recolouring | Materials are named: `wood`, `woodDark`, `carpet`, `carpetBlue`, `carpetWhite`, `carpetDarker`, `metal` and 3 shades, `glass`, `plant`, `lamp`, `fur`, `_defaultMat`; median 2 per model, 6 at most | Each name becomes a colour from the zone's scheme, so a sofa's fabric changes and its wooden feet stay wood |
| Triangles | Median 152, 90% under 338, 46 over 200, 10 over 500 | Mostly within budget. The heavy ones need care: `washerDryerStacked` 992, `showerRound` 960, `kitchenStove` 830, `shower` 810, `washer` 720, `bathtub` 602, `chairDesk` 588, `bedBunk` 580, `stairsOpen` 558, `bathroomCabinetDrawer` 508 |
| Faces | 9 of 26,737 triangles disagree with their stored normal; `kitchenCabinetUpperCorner` looks inside out | Back-face culling works. Check or drop that one model |
| Scale | About half real size: most need ×1.8 to ×2.1 | ×2 everywhere, with tweaks for the few that come out wrong (`bathtub` would be 2.4 m long and `trashcan` 0.86 m tall) |
| Axes | y up, with origin at a corner, and backs of seats and beds toward −z | The converter turns to z up, centres each model and sets a single front direction. Backs were measured on 9 models; the rest need checking by eye |
| Size | 1.9 MB as GLBs; about 0.1 MB gzipped for positions at 16 bits, before material data | Small, and loaded only at the first building entered |

**How it goes in:** a script run ahead of time, not in the browser, reads the GLBs and writes one small data file into `public/`, so nothing parses GLB at runtime. Only models the catalogue uses are included.

**What it covers:**

| Coverage | Zones | Built from code |
|---|---|---|
| Nearly all | Living room, kitchen, dining, bedroom, bathroom, hall, laundry, hotel room, private office, meeting room, break room, café counter | |
| Part | Open-plan office, reception, restaurant dining and kitchen, garage, classroom, cafeteria, library stacks, toilets | Printers, filing cabinets, whiteboards, stalls, tool chests, shelving |
| None | Teller counter, vault, ATM, supermarket aisles, sales floor, warehouse racking, machine lines, wards, hangar, gates and check-in, galleries, worship hall | Everything in these |

**Handy extras:** several shapes of most things, such as about 10 tables, 6 chairs, 6 sofas, 4 fridges and 3 beds, which is the variety the randomness needs. `stairs`, `stairsCorner` and `stairsOpen` can be the floor-change spots.

**Left out:**
- The kit's walls, doors and floors, because inner walls are drawn waist high and floors come from the footprint.
- `ceilingFan` and `lampSquareCeiling`, which would hang between the camera and the room.
- `bear`, until someone has looked at what it is. It has a `fur` material and its name, and that's all that was checked.

**Watch:** a floor of 100 desks with `chairDesk` costs about 86,000 triangles, so big open-plan floors use a lighter chair and a capped desk count. Tall items like wardrobes can hide what's behind them from the overhead camera, as they stand at full height while walls are cut; the first test room will show how much that matters.

One line of the catalogue looks like this:

| Id | Size (m) | Shapes | Colours | Placement | Blocks you | Use (later) |
|---|---|---|---|---|---|---|
| sofa | 2.1 × 0.9 × 0.8 | 2 seat, 3 seat, corner | fabric | against wall | yes | sit |
| dining_chair | 0.5 × 0.5 × 0.9 | plain, padded | wood, metal | around parent | yes | sit, move |
| fridge | 0.8 × 0.7 × 1.9 | single, double door | white, steel, black | against wall | yes | open |
| laptop | 0.35 × 0.25 × 0.03 | one | grey, black | on a surface | no | pick up |
| safe_box_wall | 3 × 0.5 × 2.2 | one | steel | against wall | yes | open |
| atm | 0.7 × 0.7 × 1.6 | one | steel, bank colour | against wall | yes | use |

`Use` is only recorded for now, so later features can find what they need without any saved building changing.

## What gets saved
One short record per building, then one per floor the first time it is visited, all in `localStorage`:

```
geodrive_rooms_v1            { "<id>": { type, floors, style, seen }, ... }
geodrive_rooms_v1_<id>_<n>   [ [item, x, y, rotation, shape, colour, state], ... ]
```

- **Id:** the whole building's centre in lat/lng, rounded to about 2 m. It can't use metres from the car, because those change with every parking spot. A building cut by a tile edge arrives as pieces, which are joined (`Place.wholeOf`) so they share one id and one plan; it waits until every tile holding a piece is here, and the hint says just "Inside" until then.
- **Size:** about 25 bytes an item. A home floor is about 1 KB, a busy office floor about 8 KB, and a capped warehouse about 10 KB.
- **Space:** browsers allow about 5 MB per site, and that is shared with the 5-hour performance log and with Agecraft, which lives on the same domain. Saved rooms get a 1.5 MB limit. Over it, the floors visited longest ago are dropped and rebuilt from the seed when next seen.
- **Map updates:** if OpenStreetMap redraws a footprint so its centre moves, it counts as a new building. That should be rare, and a small loss.
- **Catalogue changes:** visited floors keep what they have, including items later removed from the catalogue, which are skipped when drawn.
- **Limits:** saved in one browser only. A "Forget building interiors" button goes in Settings.

## What has to change in the game
| Today | Needed |
|---|---|
| One room per footprint | Interior walls and doorways per floor, with footprint shapes that aren't rectangles handled |
| One floor; `ROOM_HEIGHT` fixed at 3 m | Floors at their own heights, with the person's height following |
| Only outer walls block you | Inner walls and furniture block you too, inside only |
| One mesh per room, rebuilt on entry | One mesh per floor, with only the current floor drawn; furniture adds roughly 200 triangles an item |
| Camera looks in from above through walls that are culled | Same camera; inner walls drawn about waist high so they can't hide the person |
| Hint says "Inside" | "Bank · Floor 2 of 5" |
| No limit on size | Huge footprints furnish only around the person, and the rest generates as they walk |

## Order of work
1. Done: read POIs, classify buildings, make ids, and show the type and floor count in the hint. Saved from the start.
2. Done: Kenney models converted (`scripts/build-furniture.mjs` makes `public/furniture.bin` from `assets/kenney-furniture`), item catalogue, placement and saved floors for homes. Inner walls and doorways moved here from step 3, because "against a wall" means nothing without them.
3. Done: stairs and lifts, and the floors above. L beside stairs goes up, or down from the top floor; on a floor between, Shift+L goes down. L beside a lift lets W and S choose a floor (Shift for 10), and L goes. You can only leave a building from its ground floor. A building too narrow for stairs becomes one floor. Saved floors from before stairs existed are laid out again once.
4. Done, all at once rather than in groups: the remaining types. Limits that keep a first visit to about 160 ms at most: at most 200 solid things and 16 rooms a floor, a 1 m grid from 1,500 m² rather than 0.5 m, a budget for checking nothing is shut off, and only `WINDOW` (45 m each way from the centre) is furnished. Past that, a huge floor is an open hall, rather than the walk-as-you-go generation planned earlier. Tall halls still have the 3 m outer walls.

## Decisions
| Question | Decision |
|---|---|
| How to see inside | Cutaway: today's overhead camera with the roof off, and inner walls drawn about waist high |
| Changing floors | Stairs and lifts are real spots on the plan. L beside stairs goes one floor, with Shift+L for down on a floor between; L beside a lift picks a floor. No climbing animation |
| What items do at first | Visible and solid. Each records what it could do later, with no interaction yet |
| Which types first | All of them, as one first version |

Left out of the first version unless the owner says otherwise: people in buildings, basements, locked rooms (a vault is open) and closing times.
