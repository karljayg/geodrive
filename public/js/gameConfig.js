// Everything to tune about survival is here: nothing else holds these numbers. Rates are per hour of game time, on a 0 to 100 scale where 100 is good.
// Each stat's comment says what real figure its rate came from, so it can be judged against something.
// What the game says is in sayingsConfig.js; a say here is a key there, or plain text.
export const GAME = {
  clock: { onFootHoursPerMinute: 1 }, // game hours per real minute on foot: 24 minutes is a day. In the car it's always real time.

  // What a person is doing. The game picks one of these for every rate below.
  // still, walking, running, sitting, sleeping, driving
  stats: {
    energy: {
      label: 'Energy', start: 100,
      perHour: { still: -6, walking: -7, running: -16, sitting: -4.5, sleeping: 12.5, driving: -6 }, // awake about 16 h; 8 h asleep fills it
      warn: [[25, 'tired'], [10, 'exhausted']],
    },
    hunger: {
      label: 'Hunger', start: 90,
      perHour: { still: -4, walking: -4.5, running: -7, sitting: -3.8, sleeping: -2, driving: -4 }, // hungry after about 6 h, empty after a day; slower asleep
      warn: [[40, 'peckish'], [20, 'hungry'], [8, 'starving']],
    },
    thirst: {
      label: 'Thirst', start: 90,
      perHour: { still: -6, walking: -7, running: -12, sitting: -5.5, sleeping: -2.5, driving: -6 }, // about 2 litres a day: dry in about 16 h awake
      warn: [[40, 'thirsty'], [15, 'parched']],
    },
    bladder: {
      label: 'Restroom #1', start: 90,
      perHour: { still: -14, walking: -14, running: -14, sitting: -14, sleeping: -6, driving: -14 }, // every 4 h or so by choice, about 7 h at the limit; slower asleep
      warn: [[35, 'needToGo'], [15, 'reallyNeedToGo']],
      accident: { resetTo: 100, health: -1, say: 'accidentOne' },
    },
    bowels: {
      label: 'Restroom #2', start: 90,
      perHour: { still: -2.8, walking: -3, running: -3, sitting: -2.8, sleeping: -1.5, driving: -2.8 }, // about once a day, and a day and a half at the limit
      warn: [[30, 'needToGoTwo'], [12, 'reallyNeedToGoTwo']],
      accident: { resetTo: 100, health: -3, say: 'accidentTwo' },
    },
    phone: {
      label: 'Phone', start: 100,
      perHour: { all: -2.5 }, // about 40 h on standby
      using: { screen: -10, light: -15, music: -6 }, // added while these are on: 8 h of screen, 5 h of light, 12 h of music
      charging: 50,           // empty to full in 2 h
      warn: [[20, 'phoneLow'], [5, 'phoneVeryLow']],
    },
    flashlight: {
      label: 'Flashlight', start: 100,
      perHour: { all: -0.05 }, // keeps its charge for months when off
      using: { light: -20 },  // 5 h on a charge
      charging: 25,           // empty to full in 4 h
      warn: [[20, 'flashlightLow'], [5, 'flashlightVeryLow']],
    },
  },

  health: {
    label: 'Health', start: 100,
    // Lost per hour while a stat is at 0. A person lasts about 3 days without water and 3 weeks without food; food is much harsher here so it matters in play.
    lossWhenEmpty: { thirst: -1.4, hunger: -1, energy: -1 },
    healWhenWell: 0.5,        // per hour with nothing below wellAbove
    healAsleep: 2,            // per hour asleep, as well
    wellAbove: 25,
    warn: [[40, 'unwell'], [15, 'veryUnwell']],
  },

  // When energy or health reaches 0 you drop where you stand, and come round later, in the same state of need but alive. There's no game over.
  collapse: { hours: 6, reviveHealth: 25, reviveEnergyAtLeast: 30, say: 'collapsed' },
  sleep: { wakeHour: 7, mostHours: 10, leastHours: 1 }, // a bed sleeps until wakeHour, within these
  tiredRunShare: 0.5,         // with energy at caution, how much of the gap between walking and running speed is left; at critical there's no running

  // Things found: stat changes from using one from the bag, so nothing is edible unless it's listed.
  consumables: {
    Milk: { thirst: 25, hunger: 12, bladder: -6, say: 'You drink the milk.', kind: 'drink' },
    'Crate of milk': { thirst: 40, hunger: 20, bladder: -10, say: 'You drink a lot of milk.', kind: 'drink' },
    'Orange juice': { thirst: 28, hunger: 6, bladder: -7, say: 'You drink the juice.', kind: 'drink' },
    'Cold soda': { thirst: 22, energy: 4, bladder: -6, say: 'You drink the soda.', kind: 'drink' },
    'Cold drink': { thirst: 22, bladder: -6, say: 'You drink it.', kind: 'drink' },
    'Bottle of water': { thirst: 35, bladder: -9, say: 'You drink the water.', kind: 'drink' },
    'Cup of coffee': { thirst: 10, energy: 18, bladder: -8, say: 'You drink the coffee.', kind: 'drink' },
    'Leftover pizza': { hunger: 30, thirst: -4, bowels: -7, say: 'You eat the pizza.', kind: 'food' },
    'Can of soup': { hunger: 25, thirst: 8, bowels: -5, say: 'You eat the soup cold.', kind: 'food' },
    'Box of cereal': { hunger: 25, thirst: -5, bowels: -5, say: 'You eat the cereal dry.', kind: 'food' },
    'Tin of beans': { hunger: 30, bowels: -10, say: 'You eat the beans.', kind: 'food' },
    'Tray of steaks': { hunger: 55, bowels: -14, say: 'You eat more steak than you should.', kind: 'food' },
    Sandwich: { hunger: 30, bowels: -6, say: 'You eat the sandwich.', kind: 'food' },
    'Fresh loaf': { hunger: 35, thirst: -6, bowels: -8, say: 'You tear into the bread.', kind: 'food' },
    Croissant: { hunger: 15, bowels: -3, say: 'You eat the croissant.', kind: 'food' },
    Apple: { hunger: 10, thirst: 5, bowels: -2, say: 'You eat the apple.', kind: 'food' },
    Banana: { hunger: 12, bowels: -2, say: 'You eat the banana.', kind: 'food' },
    'Candy bar': { hunger: 10, energy: 6, say: 'You eat the candy bar.', kind: 'food' },
    'Dog biscuit': { hunger: 4, thirst: -3, say: 'It tastes as you would expect.', kind: 'food' },
    Aspirin: { health: 4, say: 'You take an aspirin.', kind: 'medicine' },
    Plasters: { health: 4, say: 'You patch yourself up.', kind: 'medicine' },
    Bandages: { health: 10, say: 'You bandage yourself up.', kind: 'medicine' },
    Batteries: { flashlight: 100, say: 'You put new batteries in the flashlight.', kind: 'supply' },
    'Pack of batteries': { flashlight: 100, say: 'You put new batteries in the flashlight.', kind: 'supply' },
  },

  // What opening or searching each thing can turn up. Anything that opens without a list is empty.
  finds: {
    fridge: ['Milk', 'Leftover pizza', 'Orange juice', 'Cold soda'], counter: ['Can of soup', 'Box of cereal', 'Cutlery'], wardrobe: ['Old jacket', 'Spare keys', 'Shoebox'],
    nightstand: ['Flashlight', 'Paperback', 'Reading glasses'], sideTable: ['Batteries', 'Pack of cards', 'Old letters'], tvStand: ['TV remote', 'Old DVD'], bathCabinet: ['Toothpaste', 'Plasters', 'Aspirin'],
    bookcase: ['Novel', 'Atlas', 'Photo album'], desk: ['Stapler', 'Notebook', 'USB stick', 'Building key'], filingCabinet: ['Old invoices', 'Paperclips', 'Sealed envelope', 'Building key'], locker: ['Gym towel', 'Padlock', 'Trainers', 'Building key'],
    box: ['Old newspapers', 'Packing tape', 'Holiday lights'], bin: ['Crumpled receipt', 'Empty can'], cashCart: ['Bundle of cash'], toolChest: ['Wrench', 'Screwdriver', 'Tape measure', 'Building key'], medCart: ['Bandages', 'Thermometer'],
    storeShelf: ['Tin of beans', 'Bottle of water', 'Pack of batteries'], clothesRack: ['Denim jacket', 'Silk scarf'], displayTable: ['Gift card', 'Sunglasses'], displayCase: ['Old coin', 'Museum guide'],
    palletRack: ['Box of parts', 'Roll of tape'], bookStack: ['Library book', 'Old atlas'], gearRack: ['Fire helmet', 'Gloves'], walkInFridge: ['Tray of steaks', 'Crate of milk'], toyBox: ['Toy car', 'Teddy bear'],
    produceStand: ['Apple', 'Banana'], fridgeCase: ['Sandwich', 'Cold drink'], breadRack: ['Fresh loaf', 'Croissant'], vendingMachine: ['Candy bar'], petCage: ['Dog biscuit'],
  },
  // The chance of finding anything at all, so food is never a sure thing. Each spot is decided once and stays that way for that building.
  findChance: {
    default: 0.7,
    fridge: 0.3, counter: 0.2, walkInFridge: 0.35, medCart: 0.4, bathCabinet: 0.4, sideTable: 0.4, desk: 0.3,
    storeShelf: 0.05, fridgeCase: 0.1, produceStand: 0.1, breadRack: 0.15, // shops have many of these: a big supermarket has about 190
  },

  // Machines that hand something over, once each, when they have it.
  machines: {
    vendingMachine: { chance: 0.4, give: 'Candy bar', say: 'vendingGive', empty: 'vendingEmpty' },
    coffeeMachine: { chance: 0.5, give: 'Cup of coffee', say: 'coffeeGive', empty: 'coffeeEmpty' },
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

  warnEveryHours: 2,          // the least game time between one stat's warnings
  saveEverySeconds: 20,
};
