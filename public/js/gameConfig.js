// Everything to tune about survival is here: nothing else holds these numbers. Rates are per hour of game time, on a 0 to 100 scale where 100 is good.
// Each stat's comment says what real figure its rate came from, so it can be judged against something.
// What the game says is in sayingsConfig.js; a say here is a key there, or plain text.
export const GAME = {
  // What a crash does in a shared world: closing speeds in mph. Below injuredFromMph, nothing. Lives are in world. What an injury leads to is still to be decided.
  // strikeHealthLoss is the most a deer, or the driver who hit a person, takes, at carDeadlyMph, scaled by the square of the speed.
  crash: { carDeadlyMph: 100, personDeadlyMph: 50, injuredFromMph: 5, carHealthLoss: 95, personHealthLoss: 90, strikeHealthLoss: 25, respawnSeconds: 3, withinMetres: 20, sameCrashSeconds: 3, runOverKeep: 0.7, strikeKeep: 0.5 },
  // A car's condition, 100 to 0. carDamage.js has the formula. offRoadPerKm: condition lost per km off road. offRoadDrag: speed lost per second there, as a share.
  // Where things on the ground don't stop a car: within bridgeClear of a bridge or tunnel, or highwayClear of a motorway or trunk road (buildings and water only). Metres from the mapped line.
  // tilesKept: how many tiles' worth are held at once, as a long drive would otherwise keep them all. lookAhead: metres ahead a tile is fetched before the car reaches it.
  // waterRoadClear: metres from any road that water doesn't stop a car, as docks and causeways are mapped with water all round.
  levels: { bridgeClear: 30, highwayClear: 15, waterRoadClear: 12, tilesKept: 12, lookAhead: 400 },
  damage: { notDrivableAt: 10, unreliableBelow: 30, wornBelow: 70, leastPower: 0.4, mostCutOut: 0.35, offRoadPerKm: 2, offRoadDrag: 0.09, coastBrake: 1.5, reportEvery: 5, buildingInset: 1, buildingClearance: 3, onRoadWithin: 5 },
  stations: { workingChance: 0.5, within: 55 }, // m from a gas station or charger's point on the map that a car can use it
  worldCars: { every: 60, shoulderEvery: 400, clearOfEnds: 20, bay: 2.6, bayOut: 5.6, bayTaken: 0.25, driveMin: 8, driveBack: 4, driveTaken: 0.6, runningChance: 0.4, hammerChance: 0.25, kerb: 5, shownWithin: 300, mostShown: 20, rescueWithin: 150, driverFreeAfter: 10, seats: 4 }, // m along a quiet kerb between them, and along a bigger road's shoulder, pulled over; kept 20 m from junctions; a car park's bays are 2.6 m wide and centred 5.6 m off the aisle, 25% taken; 60% of driveways 8 m or longer hold one, 4 m short of the house; a rescue car stands 5 m right of its road's line; and a car's chance of running or holding a sledgehammer
  // Shared worlds. See docs/MODE2_DESIGN.md. clockRate: game hours per real hour, so 12 is an hour every 5 minutes.
  world: {
    clockRate: 12, playersOnline: 8, lives: 10, inviteHours: 24, appearWithin: 300, nameTagsWithin: 100, peopleShownWithin: 1500,
    chatKept: 50, chatLength: 400, hearWithin: 30, chatBurst: 5, chatBurstSeconds: 5, newWorldsPerDay: 5, allWorldsBytes: 5e9,
  },
  clock: { onFootHoursPerMinute: 1 }, // game hours per real minute on foot: 24 minutes is a day. In the car it's always real time.

  // What a person is doing. The game picks one of these for every rate below.
  // still, walking, running, sitting, sleeping, driving
  stats: {
    energy: {
      label: 'Energy', tip: 'Find a bed.', start: 100,
      perHour: { still: -6, walking: -7, running: -16, sitting: -4.5, sleeping: 12.5, driving: -6 }, // awake about 16 h; 8 h asleep fills it
      warn: [[25, 'tired'], [10, 'exhausted']],
    },
    hunger: {
      label: 'Food', tip: 'Try fridges, shop shelves and machines.', start: 90,
      perHour: { still: -4, walking: -4.5, running: -7, sitting: -3.8, sleeping: -2, driving: -4 }, // hungry after about 6 h, empty after a day; slower asleep
      warn: [[40, 'peckish'], [20, 'hungry'], [8, 'starving']],
    },
    thirst: {
      label: 'Water', tip: 'Try a tap, fridge or machine.', start: 90,
      perHour: { still: -6, walking: -7, running: -12, sitting: -5.5, sleeping: -2.5, driving: -6 }, // about 2 litres a day: dry in about 16 h awake
      warn: [[40, 'thirsty'], [15, 'parched']],
    },
    bladder: {
      label: 'Bladder', tip: 'Find a toilet.', start: 90,
      perHour: { still: -14, walking: -14, running: -14, sitting: -14, sleeping: -6, driving: -14 }, // every 4 h or so by choice, about 7 h at the limit; slower asleep
      warn: [[35, 'needToGo'], [15, 'reallyNeedToGo']],
      accident: { resetTo: 100, health: -1, say: 'accidentOne' },
    },
    bowels: {
      label: 'Bowels', tip: 'Find a toilet.', start: 90,
      perHour: { still: -2.8, walking: -3, running: -3, sitting: -2.8, sleeping: -1.5, driving: -2.8 }, // about once a day, and a day and a half at the limit
      warn: [[30, 'needToGoTwo'], [12, 'reallyNeedToGoTwo']],
      accident: { resetTo: 100, health: -3, say: 'accidentTwo' },
    },
    phone: {
      label: 'Phone', tip: 'Leave it at a blue outlet and come back for it.', start: 100,
      perHour: { all: -2.5 }, // about 40 h on standby
      using: { screen: -10, light: -15, music: -6 }, // added while these are on: 8 h of screen, 5 h of light, 12 h of music
      charging: 50,           // empty to full in 2 h
      warn: [[20, 'phoneLow'], [5, 'phoneVeryLow']],
    },
    flashlight: {
      label: 'Flashlight', tip: 'Leave it at a blue outlet, or use batteries.', start: 100,
      perHour: { all: -0.05 }, // keeps its charge for months when off
      using: { light: -20 },  // 5 h on a charge
      charging: 25,           // empty to full in 4 h
      warn: [[20, 'flashlightLow'], [5, 'flashlightVeryLow']],
    },
  },

  health: {
    label: 'Health', tip: 'Eat, drink and sleep to recover.', start: 100,
    // Lost per hour while a stat is at 0. A person lasts about 3 days without water and 3 weeks without food; food is much harsher here so it matters in play.
    lossWhenEmpty: { thirst: -1.4, hunger: -1, energy: -1 },
    healWhenWell: 0.5,        // per hour with nothing below wellAbove
    healAsleep: 2,            // per hour asleep, as well
    wellAbove: 25,
    // At or below criticalBelow someone is in a bad way. They heal only a little on their feet, faster lying in a bed if they don't run out of food and water, and criticalHours of it kills them.
    criticalBelow: 15, criticalHours: 24, healWhenCritical: 0.1, healInBed: 1,
    warn: [[40, 'unwell'], [15, 'veryUnwell']],
  },

  // When energy or health reaches 0 you drop where you stand, and come round later, in the same state of need but alive. There's no game over.
  collapse: { hours: 6, reviveHealth: 25, reviveEnergyAtLeast: 30, say: 'collapsed' },
  sleep: { wakeHour: 7, mostHours: 10, leastHours: 1 }, // a bed sleeps until wakeHour, within these
  // With no bed or toilet: offered by F once the need has given its first warning. A night on the ground is a fixed length and gives back this share of the energy; going anywhere gives this share of the relief.
  rough: { sleepHours: 7, energyShare: 0.5, reliefShare: 0.5, marksShownWithin: 100, marksShown: 20, marksKept: 500 }, // going outdoors also leaves a label on the map, for as long as it's among the newest marksKept
  tiredRunShare: 0.5,         // with energy at caution, how much of the gap between walking and running speed is left; at critical there's no running

  // Things found: stat changes from using one from the bag, so nothing is edible unless it's listed.
  consumables: {
    Milk: { thirst: 25, hunger: 12, bladder: -6, say: 'You drink the milk.', kind: 'drink' },
    'Crate of milk': { thirst: 40, hunger: 20, bladder: -10, say: 'You drink a lot of milk.', kind: 'drink' },
    'Orange juice': { thirst: 28, hunger: 6, bladder: -7, say: 'You drink the juice.', kind: 'drink' },
    'Cold soda': { thirst: 22, energy: 4, bladder: -6, say: 'You drink the soda.', kind: 'drink' },
    'Cold drink': { thirst: 22, bladder: -6, say: 'You drink it.', kind: 'drink' },
    'Bottle of water': { thirst: 35, bladder: -9, say: 'You drink the water.', kind: 'drink', leaves: 'Water bottle' },
    'Cup of coffee': { thirst: 10, energy: 18, bladder: -8, say: 'You drink the coffee.', kind: 'drink' },
    'Leftover pizza': { hunger: 30, thirst: -4, bowels: -7, say: 'You eat the pizza.', kind: 'food' },
    'Can of soup': { hunger: 25, thirst: 8, bowels: -5, say: 'You eat the soup cold.', kind: 'food' },
    'Box of cereal': { hunger: 25, thirst: -5, bowels: -5, say: 'You eat the cereal dry.', kind: 'food' },
    'Can of beans': { hunger: 30, bowels: -10, say: 'You eat the beans.', kind: 'food' },
    'Tray of steaks': { hunger: 55, bowels: -14, say: 'You eat more steak than you should.', kind: 'food' },
    Sandwich: { hunger: 30, bowels: -6, say: 'You eat the sandwich.', kind: 'food' },
    'Fresh loaf': { hunger: 35, thirst: -6, bowels: -8, say: 'You tear into the bread.', kind: 'food' },
    Croissant: { hunger: 15, bowels: -3, say: 'You eat the croissant.', kind: 'food' },
    Apple: { hunger: 10, thirst: 5, bowels: -2, say: 'You eat the apple.', kind: 'food' },
    Banana: { hunger: 12, bowels: -2, say: 'You eat the banana.', kind: 'food' },
    'Candy bar': { hunger: 10, energy: 6, say: 'You eat the candy bar.', kind: 'food' },
    'Dog biscuit': { hunger: 4, thirst: -3, say: 'It tastes as you would expect.', kind: 'food' },
    Burger: { hunger: 40, thirst: -4, bowels: -9, say: 'You eat the burger. It\'s cold, and still great.', kind: 'food' },
    'Raw deer meat': { hunger: 14, health: -8, thirst: -4, bowels: -8, say: 'You eat it raw. It sits badly.', kind: 'food' },
    'Cooked deer meat': { hunger: 42, bowels: -6, say: 'You eat the cooked deer.', kind: 'food' },
    'Raw chicken': { hunger: 12, health: -6, thirst: -3, bowels: -5, say: 'You eat it raw. It sits badly.', kind: 'food' },
    'Cooked chicken': { hunger: 32, bowels: -4, say: 'You eat the cooked chicken.', kind: 'food' },
    'Raw rabbit': { hunger: 10, health: -6, thirst: -3, bowels: -5, say: 'You eat it raw. It sits badly.', kind: 'food' },
    'Cooked rabbit': { hunger: 30, bowels: -4, say: 'You eat the cooked rabbit.', kind: 'food' },
    'Half a burger': { hunger: 20, bowels: -5, say: 'You finish someone\'s burger. Nobody needs to know.', kind: 'food' },
    Fries: { hunger: 18, thirst: -7, bowels: -4, say: 'You eat the fries.', kind: 'food' },
    'Chicken wrap': { hunger: 35, bowels: -7, say: 'You eat the wrap.', kind: 'food' },
    'Bowl of soup': { hunger: 28, thirst: 12, bowels: -5, say: 'You drink down the soup.', kind: 'food' },
    'Bread roll': { hunger: 12, thirst: -3, bowels: -3, say: 'You eat the roll.', kind: 'food' },
    'Slice of pizza': { hunger: 18, thirst: -3, bowels: -4, say: 'You eat the slice.', kind: 'food' },
    'Slice of cake': { hunger: 16, energy: 6, bowels: -3, say: 'You eat the cake. Happy birthday to someone.', kind: 'food' },
    Muffin: { hunger: 15, energy: 3, bowels: -3, say: 'You eat the muffin.', kind: 'food' },
    Donut: { hunger: 12, energy: 6, say: 'You eat the donut.', kind: 'food' },
    Yogurt: { hunger: 12, thirst: 6, bowels: -3, say: 'You eat the yogurt, no spoon.', kind: 'food' },
    Cheese: { hunger: 18, thirst: -3, bowels: -3, say: 'You eat the cheese.', kind: 'food' },
    'Bag of chips': { hunger: 12, thirst: -6, say: 'You eat the chips.', kind: 'food' },
    'Instant noodles': { hunger: 25, thirst: -4, bowels: -5, say: 'You crunch through the noodles dry.', kind: 'food' },
    'Peanut butter': { hunger: 30, thirst: -9, bowels: -5, say: 'You eat the peanut butter with a finger.', kind: 'food' },
    'Granola bar': { hunger: 14, energy: 4, bowels: -2, say: 'You eat the granola bar.', kind: 'food' },
    'Protein bar': { hunger: 18, energy: 7, bowels: -2, say: 'You eat the protein bar. It\'s chewy.', kind: 'food' },
    Orange: { hunger: 10, thirst: 9, bowels: -2, say: 'You eat the orange.', kind: 'food' },
    Grapes: { hunger: 8, thirst: 7, bowels: -2, say: 'You eat the grapes.', kind: 'food' },
    'Energy drink': { thirst: 15, energy: 24, bladder: -7, say: 'You drink it. Your eyelids reconsider.', kind: 'drink' },
    'Juice box': { thirst: 18, hunger: 4, bladder: -5, say: 'You finish the juice box, with the noise.', kind: 'drink' },
    'Glass of water': { thirst: 20, bladder: -5, say: 'You drink the water.', kind: 'drink' },
    Aspirin: { health: 4, say: 'You take an aspirin.', kind: 'medicine' },
    'Band-Aids': { health: 4, say: 'You patch yourself up.', kind: 'medicine' },
    Bandages: { health: 10, say: 'You bandage yourself up.', kind: 'medicine' },
    Batteries: { flashlight: 100, say: 'You put new batteries in the flashlight.', kind: 'supply' },
    'Pack of batteries': { flashlight: 100, say: 'You put new batteries in the flashlight.', kind: 'supply' },
  },

  // An empty bottle is filled at a working tap and comes back empty after you drink. A full one is Bottle of water.
  vessels: { empty: 'Water bottle', full: 'Bottle of water' },

  // What opening or searching each thing can turn up. Anything that opens without a list is empty.
  finds: {
    fridge: ['Milk', 'Leftover pizza', 'Orange juice', 'Cold soda', 'Yogurt', 'Cheese', 'Juice box', 'Slice of cake', 'Water bottle', 'Bottle of water'], counter: ['Can of soup', 'Box of cereal', 'Silverware', 'Instant noodles', 'Peanut butter', 'Bag of chips', 'Can of beans', 'Water bottle', 'Bottle of water'], wardrobe: ['Old jacket', 'Spare keys', 'Shoebox'],
    nightstand: ['Flashlight', 'Paperback', 'Reading glasses', 'Water bottle'], sideTable: ['Batteries', 'Pack of cards', 'Old letters', 'Candy bar'], tvStand: ['TV remote', 'Old DVD'], bathCabinet: ['Toothpaste', 'Band-Aids', 'Aspirin'],
    bookcase: ['Novel', 'Atlas', 'Photo album'], desk: ['Stapler', 'Notebook', 'USB stick', 'Building key', 'Granola bar', 'Bag of chips'], filingCabinet: ['Old invoices', 'Paperclips', 'Sealed envelope', 'Building key'], locker: ['Gym towel', 'Padlock', 'Sneakers', 'Building key', 'Protein bar', 'Energy drink'],
    box: ['Old newspapers', 'Packing tape', 'Holiday lights'], bin: ['Crumpled receipt', 'Empty can'], cashCart: ['Bundle of cash'], toolChest: ['Wrench', 'Screwdriver', 'Tape measure', 'Building key'], medCart: ['Bandages', 'Thermometer'],
    storeShelf: ['Can of beans', 'Bottle of water', 'Pack of batteries', 'Bag of chips', 'Instant noodles', 'Can of soup', 'Box of cereal', 'Granola bar', 'Peanut butter'], clothesRack: ['Denim jacket', 'Silk scarf'], displayTable: ['Gift card', 'Sunglasses'], displayCase: ['Old coin', 'Museum guide'],
    palletRack: ['Box of parts', 'Roll of tape'], bookStack: ['Library book', 'Old atlas'], gearRack: ['Fire helmet', 'Gloves'], walkInFridge: ['Tray of steaks', 'Crate of milk', 'Cheese', 'Bowl of soup', 'Chicken wrap'], toyBox: ['Toy car', 'Teddy bear'],
till: ['Cash', 'Bundle of cash'], produceStand: ['Apple', 'Banana', 'Orange', 'Grapes'], fridgeCase: ['Sandwich', 'Cold drink', 'Yogurt', 'Energy drink', 'Juice box', 'Cheese'], breadRack: ['Fresh loaf', 'Croissant', 'Muffin', 'Donut', 'Bread roll', 'Slice of cake'], petCage: ['Dog biscuit'],
    barCounter: ['Burger', 'Fries', 'Slice of pizza', 'Chicken wrap', 'Glass of water', 'Cold soda'], prepTable: ['Burger', 'Chicken wrap', 'Bowl of soup', 'Bread roll', 'Fries'], diningTable: ['Half a burger', 'Fries', 'Bread roll', 'Glass of water'],
  },
  // The chance of finding anything at all, so food is never a sure thing. Each spot is decided once and stays that way for that building.
  findChance: {
    default: 0.7,
    till: 0.25, fridge: 0.55, counter: 0.4, walkInFridge: 0.7, medCart: 0.4, bathCabinet: 0.4, sideTable: 0.4, desk: 0.3, barCounter: 0.5, prepTable: 0.55,
    storeShelf: 0.15, fridgeCase: 0.3, produceStand: 0.3, breadRack: 0.4, diningTable: 0.12, // shops have many of these: a big supermarket has about 190 shelves, and a restaurant a dozen tables
  },
  // Times that container's own chance, per kind. 1 is as written above. The item is still a random one of that kind from the container.
  // other is clothes, keys, cash, tools and the rest.
  loot: { food: 1, drink: 1, medicine: 1, other: 1 },

  // Machines that hand something over, once each, when they have it.
  machines: {
    vendingMachine: { chance: 0.65, give: ['Candy bar', 'Bag of chips', 'Cold soda', 'Granola bar'], say: 'vendingGive', empty: 'vendingEmpty' },
    coffeeMachine: { chance: 0.7, give: ['Cup of coffee'], say: 'coffeeGive', empty: 'coffeeEmpty' },
  },

  // Stat changes from using things where they stand, without taking them anywhere. works: the chance this one does, decided once.
  uses: {
    toilet: { bladder: 100, bowels: 100, say: 'relief', count: 'restroom' },
    stall: { bladder: 100, bowels: 100, say: 'relief', count: 'restroom' },
    sink: { works: 0.5, thirst: 25, bladder: -6, say: 'drinkTap', dry: 'tapDry', count: 'drink' },
    basin: { works: 0.5, thirst: 25, bladder: -6, say: 'drinkTap', dry: 'tapDry', count: 'drink' },
    bath: { energy: 4, say: 'You run the water for a moment and rinse your face.' },
    treadmill: { energy: -6, thirst: -5, say: 'You jog for a minute.' },
    benchPress: { energy: -5, thirst: -3, say: 'You lift it twice and put it down.' },
  },

  // Power points on the walls of rooms. Finding one that works is the only way to charge anything.
  outlets: {
    reach: 1.4,               // m
    wallChance: 0.22,         // of an inner wall having one
    leastWall: 1.8,           // m long to have one
    mostPerFloor: 6,
    workingChance: 0.55,      // of an outlet having power, decided once
  },

  // Shoving things around rooms.
  push: { step: 0.8, driveStep: 2 }, // m a push moves a thing, and a go on a forklift
  climb: { seconds: 0.6, energy: -1, leastHeight: 0.35 }, // over furniture with F: how long, what it takes out of you, and what's too low to bother with (m)
  hammer: { item: 'Sledgehammer', width: 1.3, reach: 1, swings: 3, swingEvery: 0.7, energy: -10 }, // m wide a hole is, m from a wall it can be swung, and what a hole takes out of you

  // On foot, a weapon in either hand. backPace: walking or running backward while facing the scope, as a share of that speed.
  // indoorRange: of the outdoor camera distance inside, as furniture is small from there.
  // Past effectiveRangeFeet, a lined-up shot's chance halves for each further complete rangeStepFeet. feetPerMetre turns the world's metres into that.
  aim: { backPace: 0.5, indoorRange: 0.45, rangeStepFeet: 50, feetPerMetre: 3.28084 },
  // A shot at another person. hearMetres: who hears it, outdoors. The body is the cylinder a shot can meet.
  // aimSlack: how far they can stand from where it was aimed, for lag. rangeSlack: extra metres on the gun's range, for the same reason.
  shots: { hearMetres: 100, bodyRadius: 0.9, bodyHeight: 1.9, aimSlack: 4, rangeSlack: 8 },
  // magazine: rounds it holds. spare: boxes of its caliber given with the starter gun, in the car. A box fills whichever gun of that caliber you load, and only when it is empty.
  // Shells and precision rounds are one each. fireMode auto repeats while the button is held. damage is how hard one round hits a person: 1 takes four shots, 2 takes three, 3 takes two, and 4 or more takes one. An animal still goes down in one.
  weapons: {
    handgun: { item: 'Handgun', kind: 'gun', category: 'handgun', caliber: '9mm', magazine: 8, effectiveRangeFeet: 50, damage: 1, fireMode: 'single', fireIntervalMs: 280, spare: 3, sound: 'shot9mm' },
    handgun45: { item: '.45 Handgun', kind: 'gun', category: 'handgun', caliber: '.45', magazine: 8, effectiveRangeFeet: 50, damage: 2, fireMode: 'single', fireIntervalMs: 320, spare: 0, sound: 'shot45' },
    revolver: { item: 'Revolver', kind: 'gun', category: 'revolver', caliber: 'revolver', magazine: 6, effectiveRangeFeet: 60, damage: 2, fireMode: 'single', fireIntervalMs: 450, spare: 0, sound: 'shotRevolver' },
    smg: { item: 'SMG', kind: 'gun', category: 'smg', caliber: '9mm', magazine: 30, effectiveRangeFeet: 80, damage: 1, fireMode: 'auto', fireIntervalMs: 90, spare: 0, sound: 'shotSmg' },
    shotgun: { item: 'Shotgun', kind: 'gun', category: 'shotgun', caliber: 'shells', magazine: 6, effectiveRangeFeet: 40, damage: 4, fireMode: 'single', fireIntervalMs: 700, spare: 0, sound: 'shotShotgun' },
    huntingRifle: { item: 'Hunting Rifle', kind: 'gun', category: 'rifle', caliber: 'rifle', magazine: 5, effectiveRangeFeet: 200, damage: 3, fireMode: 'single', fireIntervalMs: 900, spare: 0, sound: 'shotRifle' },
    ar15: { item: 'AR-15', kind: 'gun', category: 'assaultRifle', caliber: 'rifle', magazine: 30, effectiveRangeFeet: 150, damage: 2, fireMode: 'auto', fireIntervalMs: 100, spare: 0, sound: 'shotAr' },
    sniper: { item: 'Sniper Rifle', kind: 'gun', category: 'sniperRifle', caliber: 'precision', magazine: 5, effectiveRangeFeet: 400, damage: 5, fireMode: 'single', fireIntervalMs: 1100, spare: 0, sound: 'shotSniper' },
  },
  calibers: {
    '9mm': { item: '9mm bullets', feed: 'box' },
    '.45': { item: '.45 bullets', feed: 'box' },
    revolver: { item: 'Revolver rounds', feed: 'box' },
    rifle: { item: 'Rifle rounds', feed: 'box' },
    shells: { item: 'Shells', feed: 'round' },
    precision: { item: 'Precision rounds', feed: 'round' },
  },
  // Homes. handgunChance and advancedChance are separate, and a home is checked for a handgun first.
  // Together they are the old one home in four, split 12:5 the way the old weights did. Within a type the gun is random.
  // common is a pistol, revolver or .45. rare is an SMG, shotgun, hunting rifle, AR-15 or sniper.
  // boxes: of a box-fed caliber. rounds: shells or precision rounds. commonWeight still applies when the two chances aren't set.
  houseGun: {
    handgunChance: 0.25 * 12 / 17,
    advancedChance: 0.25 * 5 / 17,
    boxes: 10,
    rounds: 12,
    hideIn: ['wardrobe', 'nightstand', 'bathCabinet'],
    common: ['handgun', 'revolver', 'handgun45'],
    rare: ['smg', 'shotgun', 'huntingRifle', 'ar15', 'sniper'],
    commonWeight: 4,
    rareWeight: 1,
  },
  // Police always. About one shop in ten stands in for a gun shop, since the map has no shop of that name. About one mall in four.
  // guns: how many lockers, cabinets or shelves on a floor hold one. amount: boxes, or rounds, with it.
  // handgunShare of those guns are handguns; the rest are advanced. Which one of the type is random.
  armory: {
    gunShopChance: 0.1,
    mallChance: 0.25,
    handgunShare: 3 / 8,
    police: { guns: 4, amount: 24, hideIn: ['filingCabinet', 'locker', 'desk'] },
    gunShop: { guns: 6, amount: 30, hideIn: ['storeShelf', 'desk', 'counter'] },
    mall: { guns: 4, amount: 20, hideIn: ['storeShelf', 'counter', 'desk'] },
  },

  // Things dropped, which stay where they're left.
  drops: {
    ahead: 1.3,               // m in front of the person that a thing lands, far enough not to be hidden behind them
    apart: 0.6,               // m kept from the last thing dropped, so they don't land in one pile
    reach: 1.6,               // m to pick it up again
    beside: 2.6,              // m from the middle of the car, dropped from inside it
    shownWithin: 300,         // m outdoors, as each is a model on the map
    mostShown: 24,
  },

  warnEveryHours: 2,          // the least game time between one stat's warnings
  saveEverySeconds: 20,

  // Deer, from Agecraft's Test-3D herd. A block there is a metre here. Sight and hearing are the deer in hunting.json;
  // the stroll and the gait speeds are game3d/animals3d.js and public3d/animals-view.js. The chase is half again their 6.5 m/s.
  // Planted like worldCars along roads (spotsAlongRoads), half as often by default (every 600 vs 300), farther off the verge.
  // Clips are the Quaternius lengths, in seconds. Nothing is saved or shared.
  deer: {
    every: 600, verge: 14, shownWithin: 300, mostShown: 4, stagChance: 0.4,
    idPrefix: 'd', seed: 'deer', dir: 'deer', model: 'deer', stagModel: 'stag', down: 'The deer is down.',
    hitRadius: 0.7, body: 1.6, shotRadius: 1.4, shotBody: 3.2, meat: 20, meatReach: 4, // pieces off one deer; metres from the car that F can load them. A shot uses the wider box
    raw: 'Raw deer meat', cooked: 'Cooked deer meat',
    vision: 7.1, hearing: 4.7, wanderSpeed: 0.78, fleeSpeed: 9.75, wanderRadius: 2.8,
    alarmMs: 4000, fearEveryMs: 250, boltStep: 3, wanderWaitMs: 4000,
    idleBelow: 0.2, runAbove: 2.5, walkPace: 1, runPace: 4.5,
    clips: { idle: 3.333, walk: 1.167, gallop: 0.533 },
    frames: { idle: 4, walk: 6, gallop: 4 },
  },
  // Same planting and the same run-over as deer. No gallop clip, so a flee plays the walk faster. Flee is 75% of the deer's 9.75.
  chicken: {
    every: 1200, verge: 9, shownWithin: 300, mostShown: 3, stagChance: 0,
    idPrefix: 'c', seed: 'chicken', dir: 'chicken', model: 'chicken', down: 'The chicken is down.',
    hitRadius: 0.35, body: 0.5, shotRadius: 3, shotBody: 3.6, meat: 2, meatReach: 4, // a shot's box is wider than the car's: the little model sits above where the ground mark lands
    raw: 'Raw chicken', cooked: 'Cooked chicken',
    vision: 5, hearing: 3.3, wanderSpeed: 0.7, fleeSpeed: 7.3125, wanderRadius: 2.2,
    alarmMs: 4000, fearEveryMs: 250, boltStep: 3, wanderWaitMs: 4000,
    idleBelow: 0.2, runAbove: 99, walkPace: 0.8, runPace: 1,
    clips: { idle: 2, walk: 0.417, gallop: 0.417 },
    frames: { idle: 4, walk: 4, gallop: 0 },
  },
  rabbit: {
    every: 1200, verge: 12, shownWithin: 300, mostShown: 3, stagChance: 0,
    idPrefix: 'r', seed: 'rabbit', dir: 'rabbit', model: 'rabbit', down: 'The rabbit is down.',
    hitRadius: 0.35, body: 0.45, shotRadius: 3, shotBody: 3.6, meat: 2, meatReach: 4,
    raw: 'Raw rabbit', cooked: 'Cooked rabbit',
    vision: 4.5, hearing: 2.9, wanderSpeed: 0.55, fleeSpeed: 7.3125, wanderRadius: 2,
    alarmMs: 4000, fearEveryMs: 250, boltStep: 3, wanderWaitMs: 4000,
    idleBelow: 0.2, runAbove: 99, walkPace: 1, runPace: 1,
    clips: { idle: 2.375, walk: 1, gallop: 1 },
    frames: { idle: 4, walk: 4, gallop: 0 },
  },
};
