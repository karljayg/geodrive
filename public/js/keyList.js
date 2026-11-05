// What the key list shows: only the keys that work where you are, in the car or on foot. Pure, tested.
export const KEY_LIST = {
  car: {
    title: 'In the car',
    groups: [
      { name: 'Driving', keys: [
        [['W', '↑'], 'Accelerate'],
        [['S', '↓'], 'Brake, then reverse'],
        [['A', 'D', '←', '→'], 'Steer'],
        [['Shift'], 'Handbrake'],
        [['Q', 'E'], 'Signal: next turn or lane change'],
        [['L'], 'Get out, when stopped'],
      ] },
      { name: 'Going somewhere', keys: [
        [['G'], 'Go to a destination'],
        [['F'], 'FSD on or off'],
        [['-', '='], 'FSD speed'],
      ] },
      { name: 'Car', keys: [
        [['H'], 'Headlights'],
        [['B'], 'Beep (hold)'],
        [['R'], 'Storage'],
      ] },
      { name: 'View', keys: [
        [['C'], 'Camera'],
        [['Space', 'Z'], 'Zoom out, zoom in'],
        [['V'], 'Nav screen range'],
        [['T'], 'Time +1 hour'],
      ] },
      { name: 'Radio', keys: [
        [['N'], 'On or off'],
        [['[', ']'], 'Station'],
        [[',', '.'], 'Volume'],
        [['/'], 'Band'],
        [['\\'], 'Station list'],
        [['M'], 'Mute all sound'],
      ] },
      { name: 'Game', keys: [
        [['P'], 'Pause'],
        [['O'], 'Settings'],
        [['J'], 'Invite to a shared world, or make one'],
        [['K'], 'This list'],
        [['Esc'], 'Close what\'s open'],
      ] },
    ],
  },
  foot: {
    title: 'On foot',
    groups: [
      { name: 'Moving', keys: [
        [['W', 'A', 'S', 'D'], 'Walk'],
        [['Shift'], 'Run'],
        [['Space'], 'Jump'],
        [['Q', 'E'], 'Turn the view (or click, then use the mouse)'],
      ] },
      { name: 'Weapon in hand', keys: [
        [['Mouse'], 'Click once to bring the mark up. Then it follows the mouse, and the next click shoots. Hold it on an AR-15 or an SMG. Green means the shot will hit'],
        [['Right click'], 'Use the right hand. A gun there shoots, and the mark stays'],
        [['Esc'], 'Put the mark away'],
        [['S'], 'Step back at half speed, still facing the mark'],
        [['Shift', 'S'], 'Run back at half speed'],
        [['Ammunition'], 'Select it in the bag, or the slot it\'s on. A box fills an empty gun. Shells and precision rounds load one at a time'],
        [['R'], 'Load the gun in your hand'],
      ] },
      { name: 'Doing things', keys: [
        [['L'], 'Leave on the ground floor. Above that: stairs and lifts'],
        [['Shift', 'L'], 'Downstairs, between floors'],
        [['F'], 'Use what\'s near. It asks: F or a number says yes, walking away or Esc says no. That number is used before your hands. At the car, it offers to load it. At an outlet, leave your phone or flashlight charging and come back for it. At a tap, fill an empty water bottle'],
        [['0–9'], 'In a lift: the floor, while its panel is open'],
        [['G'], 'Flashlight'],
      ] },
      { name: 'What you carry', keys: [
        [['1'], 'Left hand'],
        [['2'], 'Right hand'],
        [['3–9', '0'], 'Quick slots, set from the bag'],
        [['H'], 'Phone. Then 1–9 opens an app, and 0 is home'],
        [['C'], 'Compass'],
        [['U'], 'Notepad'],
        [['B'], 'Bag, and the car\'s storage beside the car'],
      ] },
      { name: 'Phone, once open', keys: [
        [['1–9'], 'Open an app'],
        [['0'], 'Home screen, or back a step'],
        [['1–9'], 'In Phone: dial. In Notes and Messages: pick from the list'],
        [['Enter'], 'In Phone: call or hang up'],
        [['N'], 'In Notes: new note'],
        [['Del'], 'In a note: delete it'],
        [['-', '='], 'In Map: zoom'],
        [[',', '.'], 'In Music: volume'],
        [['X'], 'In Health: start over'],
      ] },
      { name: 'Bag open', keys: [
        [['1–0'], 'Use what\'s on that hand or slot'],
        [['Shift', '1–0'], 'Drop what\'s on that hand or slot'],
        [['Z'], 'Undo a drop'],
      ] },
      { name: 'Music', keys: [
        [['N'], 'Play or pause'],
        [['[', ']'], 'Station'],
        [['M'], 'Mute all sound'],
      ] },
      { name: 'Game', keys: [
        [['T'], 'Time +1 hour'],
        [['P'], 'Pause'],
        [['O'], 'Settings'],
        [['J'], 'Invite to a shared world, or make one'],
        [['K'], 'This list'],
        [['Esc'], 'Close what\'s open'],
      ] },
    ],
  },
};

const esc = (text) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export function keyListHtml(onFoot) {
  const { title, groups } = KEY_LIST[onFoot ? 'foot' : 'car'];
  return `<h2>${title}</h2><div class="keyGroups">${groups.map(({ name, keys }) => `<section><h3>${name}</h3>${keys.map(([pressed, what]) => `<div class="keyRow"><span>${pressed.map((key) => `<kbd>${esc(key)}</kbd>`).join('')}</span><span>${esc(what)}</span></div>`).join('')}</section>`).join('')}</div>`;
}
