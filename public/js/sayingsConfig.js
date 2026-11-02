// What the game says, several ways, so the common ones don't get repetitive. Each key's lines take turns. Add, change or remove lines freely; deployed with the site, so it's the same for everyone.
// {name}, {found} and {hours} are filled in where a line uses them.
export const SAYINGS = {
  // F with nothing in reach
  nothingHere: [
    'There is nothing here to use.',
    'Nothing to do here. Relaxing, really.',
    'You reach out with purpose, and find air.',
    'Nothing here needs you.',
    'Just you and the floor here.',
    'You look around. Nope.',
    'If there is something to do here, it\'s hiding well.',
  ],

  // Light switches
  lightsOn: ['Lights on.', 'Click. Much better.', 'And there was light.', 'Ah, so that\'s what this room looks like.', 'Lights on. Nothing jumped out.'],
  lightsOff: ['Lights off.', 'Click. Dark again.', 'Lights off. Very economical.', 'Off they go.', 'Somewhere, a power bill sighs with relief.'],
  switchLocked: [
    'Light switch not enabled, find key.',
    'The switch has a keyhole. Find the key.',
    'Click. Nothing. This one needs a key.',
    'Someone locked the lights. Find a key.',
    'The switch won\'t budge without a key.',
  ],

  // Outlets
  charging: ['Charging. Stay close, or you\'ll unplug.', 'Plugged in. Don\'t wander off.', 'It\'s charging. Good time to stand around.', 'Charging. Your cable is not as long as you\'d like.'],
  unplugged: ['Unplugged.', 'Cable back in the bag.', 'Unplugged, and not a moment too soon.'],
  outletDead: ['This outlet has no power.', 'Dead outlet.', 'You plug in. Nothing. Worth a try.', 'No power here. Decorative, apparently.', 'This outlet retired years ago.'],
  charged: ['{name} fully charged.', '{name} is at 100%.', '{name} is full. Off you go.'],

  // Carried lights
  flashlightOn: ['Flashlight on. V turns it off.', 'Flashlight on.', 'Click. Now you can see what you were missing.'],
  phoneLightOn: ['Phone light on.', 'Phone light on. It\'s trying its best.', 'Phone light on. About as far as your feet.'],
  lightOff: ['Light off.', 'Click. Off.', 'Saving the battery.'],
  flashlightNotInBag: ['Your flashlight isn\'t in your bag. It may be in the car.', 'No flashlight in the bag. Did it stay in the car?', 'You pat your bag. No flashlight.'],
  flashlightDead: ['Your flashlight is dead.', 'Click. Click. Nothing.', 'The flashlight has given all it had.'],
  phoneDead: ['Your phone is dead. Find a working outlet.', 'The screen stays black. Find an outlet.', 'No battery, no phone. Find an outlet.', 'Your phone is now a small mirror. Find an outlet.'],
  flashlightDied: ['Your flashlight is dead. Batteries or a working outlet will fix it.', 'The flashlight fades out. It needs batteries or an outlet.', 'Out goes the flashlight. Batteries or an outlet will bring it back.'],

  // Searching things
  emptyThing: ['The {name} is empty.', 'Nothing in the {name}.', 'The {name} has let you down.', 'The {name} holds only disappointment.', 'Someone got to the {name} first.', 'Empty {name}. Typical.'],
  nothingElse: ['Nothing else in the {name}.', 'You already went through the {name}.', 'Still nothing new in the {name}.', 'Looking again won\'t help the {name}.'],
  foundIn: ['In the {name}: {found}.', 'The {name} had {found} in it.', 'Well now. {found}, in the {name}.', 'Found in the {name}: {found}.'],
  pickUp: ['You pick up the {name}.', 'The {name} is yours now. Probably fine.', 'Into the bag goes the {name}.', 'You take the {name}. Nobody saw.'],
  bagFull: ['Your bag is full.', 'No room in the bag.', 'The bag won\'t close as it is.', 'Your bag says no.'],
  carFull: ['The car is full.', 'No room left in the car.', 'The car is packed to the roof.'],
  noUse: ['There\'s no use for {name} right now.', 'You can\'t think what to do with {name} here.', 'Not sure {name} helps here.'],

  // Using things in rooms
  relief: ['That\'s better.', 'Much better.', 'A weight off your mind.', 'Crisis averted.', 'You feel like a new person.'],
  washHands: ['You wash your hands.', 'Clean hands, at least.'],
  drinkTap: ['You drink from the tap.', 'Tap water. Tastes of pipes.', 'You drink from the tap. Vintage: this morning.', 'Cold, wet and free.'],
  tapDry: ['Nothing comes out of the tap.', 'The tap coughs and gives up.', 'Dry. Not even a drip.', 'The tap has nothing to say.'],
  vendingGive: ['It drops a candy bar.', 'Clunk. A candy bar.', 'It actually worked. A candy bar.'],
  vendingEmpty: ['It\'s sold out.', 'Every row is empty.', 'It hums at you. Sold out.', 'The machine has nothing left to give.'],
  coffeeGive: ['You pour a coffee.', 'Coffee. Not good, but coffee.', 'It\'s been on a while, but it\'s coffee.'],
  coffeeEmpty: ['The coffee machine is out of beans.', 'It gurgles, and nothing comes.', 'No coffee. A dark moment.'],

  // Getting around
  stopFirst: ['Stop the car first, then press L to get out.', 'Best to stop before you get out.', 'Getting out at this speed is a bold choice. Stop first.'],
  walkUpFirst: ['Walk up to a building, or back to the car, then press L.', 'There\'s nothing to go into here. Try a building or the car.', 'L works by a building or the car. This is neither.'],
  backInCar: ['Get back in the car first.', 'That one\'s for the car. Get back in first.', 'You\'d need the car for that.'],
  locked: ['Sorry you can\'t get in. It\'s locked.', 'Locked. You rattle the door anyway.', 'Locked. Nobody\'s coming to let you in.', 'It\'s locked, and it means it.', 'The door has other plans. Locked.'],
  lightsAreOff: ['The lights are off. Look for a switch by a door and press F, or use your flashlight with V.'],
  slept: ['You sleep for {hours} hours.', 'You sleep {hours} hours, and don\'t remember your dreams.', '{hours} hours later, you wake up.', 'Out like a light for {hours} hours.'],

  // Needs getting low
  tired: ['You are getting tired.', 'Your eyelids have started negotiating.', 'You could do with a sit-down.', 'You yawn. Then you yawn about the yawn.'],
  exhausted: ['You are exhausted. Find a bed soon.', 'You\'re nearly asleep on your feet. Find a bed.', 'Any bed will do. Soon.'],
  peckish: ['You could eat something.', 'Your stomach makes a brief announcement.', 'A snack would be nice around now.'],
  hungry: ['You are hungry.', 'Your stomach is getting louder.', 'You\'d eat almost anything now.'],
  starving: ['You are starving.', 'You\'re eyeing the furniture. You need food.', 'You really have to eat something.'],
  thirsty: ['You are thirsty.', 'Your mouth is getting dry.', 'A drink would be good about now.'],
  parched: ['You badly need a drink.', 'Your tongue feels like carpet. Find a drink.', 'You\'d drink from a puddle. Find something better.'],
  needToGo: ['You need the restroom soon.', 'You\'re starting to think about restrooms.', 'A restroom would be good before long.'],
  reallyNeedToGo: ['You really need the restroom.', 'You\'re walking a little differently now. Restroom.', 'This is becoming urgent. Restroom.'],
  needToGoTwo: ['You will need the restroom before long.', 'Your stomach mentions the restroom.', 'A restroom visit is on the horizon.'],
  reallyNeedToGoTwo: ['You urgently need the restroom.', 'No sudden moves. Find a restroom.', 'This can\'t wait much longer. Restroom.'],
  phoneLow: ['Your phone is at 20%.', 'Your phone wants a charger.', '20% left on your phone.'],
  phoneVeryLow: ['Your phone is about to die.', 'Your phone is on its last 5%.', 'Your phone is saying its goodbyes.'],
  flashlightLow: ['Your flashlight is getting dim.', 'The flashlight is starting to yellow.', 'The flashlight has seen brighter days.'],
  flashlightVeryLow: ['Your flashlight is nearly out.', 'The flashlight is barely trying now.', 'You won\'t get much more out of that flashlight.'],
  unwell: ['You feel unwell.', 'You\'ve felt better than this.', 'Something is not right. Look after yourself.'],
  veryUnwell: ['You are in a bad way. Eat, drink and rest.', 'You feel terrible. Eat, drink and rest.', 'This is serious. Food, water, sleep.'],
  accidentOne: ['You could not hold it. Not your best moment.', 'Too late. Nobody needs to know.', 'Well, that settles that. Nobody saw.'],
  accidentTwo: ['That was an accident you won\'t forget.', 'We will never speak of this.', 'That was the worst one yet. Keep walking.'],
  collapsed: ['You collapsed, and came round {hours} hours later.', 'Everything goes black. {hours} hours later, you\'re back.', 'You wake up on the floor {hours} hours later. Not ideal.'],
};
