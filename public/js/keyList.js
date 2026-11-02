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
        [['J'], 'Share this drive'],
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
      { name: 'Doing things', keys: [
        [['L'], 'Car, doors, stairs and lifts'],
        [['Shift', 'L'], 'Downstairs, between floors'],
        [['F'], 'Use what\'s near. It asks: F or a number says yes, walking away or Esc says no. At the car, it offers to load it'],
        [['G'], 'Flashlight'],
      ] },
      { name: 'What you carry', keys: [
        [['H'], 'Phone'],
        [['C'], 'Compass'],
        [['U'], 'Notepad'],
        [['B'], 'Bag, and the car\'s storage beside the car'],
      ] },
      { name: 'Phone', keys: [
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
        [['1–0'], 'Use or move that slot'],
        [['Shift', '1–0'], 'Drop that slot'],
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
        [['J'], 'Share this drive'],
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
