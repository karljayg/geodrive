// The windows from the Testing tab: spawn, config values, players, and setting up a scene. They stay open over the game and stop nothing. What they do to the game comes in as calls from main.js.
import { GAME } from './gameConfig.js';
import { LIVES_MOST, SPAWN_MOST, fileValue, spawnCatalog, spawnMatches, tunables } from './testTools.js';

const CONFIG_SHOWN = 80;
const STATS = () => [...Object.entries(GAME.stats).map(([key, stat]) => [key, stat.label]), ['health', GAME.health.label]];
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const times = (v) => `${Number(v.toFixed(1))}×`;
const metres = (v) => `${v} m`;
const countText = (v) => `${v}`;
const snap = (value, step) => Number((Math.round(value / step) * step).toFixed(6));
const near = (a, b) => Math.abs(a - b) < 1e-4;

// The How often window. spacing is a browser setting; path is a world override. also is set to the same number.
const APPEAR = [
  { group: 'Along the road', note: 'How far apart, and how far off the road an animal stands. Only the nearest few of each are drawn. Spacing is this browser. Letting go of a slider replants them.' },
  { label: 'Parked cars', spacing: 'carEvery', min: 100, max: 2000, step: 50, text: metres },
  { label: 'Deer', spacing: 'deerEvery', min: 200, max: 4000, step: 100, text: metres },
  { label: 'Deer, off the road', path: 'deer.verge', min: 2, max: 40, step: 1, text: metres, replant: true },
  { label: 'Chickens', spacing: 'chickenEvery', min: 200, max: 4000, step: 100, text: metres },
  { label: 'Chickens, off the road', path: 'chicken.verge', min: 2, max: 40, step: 1, text: metres, replant: true },
  { label: 'Rabbits', spacing: 'rabbitEvery', min: 200, max: 4000, step: 100, text: metres },
  { label: 'Rabbits, off the road', path: 'rabbit.verge', min: 2, max: 40, step: 1, text: metres, replant: true },
  { group: 'Food and supplies', note: '1 is the usual chance for that fridge, shelf or drawer. 0 finds none of that kind. The item is a random one of the kind.' },
  { label: 'Food', path: 'loot.food', min: 0, max: 4, step: 0.1, text: times },
  { label: 'Drink', path: 'loot.drink', min: 0, max: 4, step: 0.1, text: times },
  { label: 'Medicine', path: 'loot.medicine', min: 0, max: 4, step: 0.1, text: times },
  { label: 'Other finds', path: 'loot.other', min: 0, max: 4, step: 0.1, text: times, hint: 'Clothes, keys, cash, tools and anything that is not food, drink or medicine.' },
  { group: 'Guns', note: 'Handguns are a pistol, revolver or .45. Advanced guns are an SMG, shotgun, hunting rifle, AR-15 or sniper. A home is checked for a handgun first, then an advanced gun. The particular gun of that type is random.' },
  { label: 'Handguns in homes', path: 'houseGun.handgunChance', min: 0, max: 1, step: 0.01, text: (v) => `${pct(v)} of homes` },
  { label: 'Advanced guns in homes', path: 'houseGun.advancedChance', min: 0, max: 1, step: 0.01, text: (v) => `${pct(v)} of homes` },
  { label: 'Boxes with a box-fed gun', path: 'houseGun.boxes', min: 0, max: 40, step: 1, text: countText },
  { label: 'Rounds with a shotgun or sniper', path: 'houseGun.rounds', min: 0, max: 40, step: 1, text: countText },
  { label: 'Shops that sell guns', path: 'armory.gunShopChance', min: 0, max: 1, step: 0.01, text: pct },
  { label: 'Malls that sell guns', path: 'armory.mallChance', min: 0, max: 1, step: 0.01, text: pct },
  { label: 'Handguns in those places', path: 'armory.handgunShare', min: 0, max: 1, step: 0.01, text: (v) => `${pct(v)} handguns` },
  { label: 'Guns at a police station', path: 'armory.police.guns', min: 0, max: 12, step: 1, text: countText },
  { label: 'Guns at a gun shop', path: 'armory.gunShop.guns', min: 0, max: 12, step: 1, text: countText },
  { label: 'Guns at a mall', path: 'armory.mall.guns', min: 0, max: 12, step: 1, text: countText },
  { group: 'Water and machines', note: 'A machine still hands over a random item of whatever kinds are turned up above. A place you already searched stays as it was.' },
  { label: 'Vending machines stocked', path: 'machines.vendingMachine.chance', min: 0, max: 1, step: 0.01, text: pct },
  { label: 'Coffee machines stocked', path: 'machines.coffeeMachine.chance', min: 0, max: 1, step: 0.01, text: pct },
  { label: 'Working taps', path: 'uses.sink.works', also: ['uses.basin.works'], min: 0, max: 1, step: 0.01, text: pct },
  { label: 'Working outlets', path: 'outlets.workingChance', min: 0, max: 1, step: 0.01, text: pct },
];

function make(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}
const button = (text, onClick, className = '') => make('button', { type: 'button', textContent: text, className, onclick: (e) => { e.currentTarget.blur(); onClick(); } }); // focus left on it would catch the game's Space
const row = (...children) => make('div', { className: 'row' }, ...children);

export class TestWindows {
  // calls: spawnItem(name, count), spawnCar(type, count), setStat(key, value), stat(key), setHour(hour), hour(), repairCar(), teleport(lat, lng), where(), dieNow(), say(text).
  constructor(world, calls) {
    Object.assign(this, { world, calls });
    this.open = new Map(); // name: { box, refresh }
    this.opened = 0;
    this.front = null;
    this.z = 60;
  }

  // One of each. Asking again brings it forward.
  show(name) {
    const known = this.open.get(name);
    if (known) { this.raise(name); return known.box.querySelector('input')?.focus(); }
    const { title, body, refresh, wide } = this[name]();
    const box = make('div', { className: `testWin${wide ? ' wide' : ''}`, role: 'dialog', ariaLabel: title });
    box.style.top = `${70 + this.opened * 26}px`;
    box.style.right = `${16 + this.opened * 26}px`;
    this.opened = (this.opened + 1) % 5;
    const head = make('div', { className: 'testHead' }, title, button('×', () => this.close(name)));
    box.append(head, ...body);
    this.drag(head, box);
    box.addEventListener('pointerdown', () => this.raise(name));
    document.body.append(box);
    this.open.set(name, { box, refresh });
    this.raise(name);
    refresh?.();
    box.querySelector('input')?.focus();
  }

  close(name) {
    this.open.get(name)?.box.remove();
    this.open.delete(name);
    if (this.front === name) this.front = [...this.open.keys()].at(-1) ?? null;
  }

  // The one Esc closes: the window with the keyboard, or else the one last clicked.
  closeFront() {
    const focused = [...this.open.entries()].find(([, known]) => known.box.contains(document.activeElement));
    const name = focused?.[0] ?? (this.open.has(this.front) ? this.front : [...this.open.keys()].at(-1));
    if (!name) return false;
    this.close(name);
    return true;
  }

  raise(name) {
    const known = this.open.get(name);
    if (!known) return;
    this.z += 1;
    known.box.style.zIndex = String(this.z);
    this.front = name;
  }

  // Something changed that a window may be showing.
  changed(...names) {
    for (const name of names) this.open.get(name)?.refresh?.();
  }

  drag(head, box) {
    head.addEventListener('pointerdown', (e) => {
      if (e.target !== head) return;
      head.setPointerCapture(e.pointerId);
      const rect = box.getBoundingClientRect(), dx = e.clientX - rect.left, dy = e.clientY - rect.top;
      const moved = (m) => { box.style.left = `${Math.max(0, Math.min(innerWidth - 60, m.clientX - dx))}px`; box.style.top = `${Math.max(0, Math.min(innerHeight - 30, m.clientY - dy))}px`; box.style.right = 'auto'; };
      head.addEventListener('pointermove', moved);
      head.addEventListener('pointerup', () => head.removeEventListener('pointermove', moved), { once: true });
    });
  }

  spawn() {
    const catalog = spawnCatalog(), input = make('input', { type: 'text', placeholder: 'Type 2 letters', autocomplete: 'off', spellcheck: false, className: 'grow', ariaLabel: 'What to spawn' });
    const count = make('input', { type: 'number', min: 1, max: SPAWN_MOST, value: 1, ariaLabel: 'How many' });
    const list = make('div', { className: 'list' }), status = make('p');
    let matches = [], chosen = 0;
    const draw = () => {
      list.replaceChildren(...matches.map((entry, i) => make('div', { className: `match${i === chosen ? ' on' : ''}`, textContent: entry.label, onclick: () => { chosen = i; go(); } })));
    };
    const go = async () => {
      const entry = matches[chosen], many = Math.max(1, Math.min(SPAWN_MOST, Math.round(Number(count.value)) || 1));
      if (!entry) return;
      status.textContent = await (entry.kind === 'car' ? this.calls.spawnCar(entry.type, many) : this.calls.spawnItem(entry.name, many));
      input.focus();
      input.select();
    };
    input.addEventListener('input', () => { matches = spawnMatches(input.value, catalog); chosen = 0; draw(); });
    for (const box of [input, count]) {
      box.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') box.blur();
        if (e.key === 'Enter') go();
        if (box === input && (e.key === 'ArrowDown' || e.key === 'ArrowUp') && matches.length) {
          e.preventDefault();
          chosen = (chosen + (e.key === 'ArrowDown' ? 1 : -1) + matches.length) % matches.length;
          draw();
        }
      });
    }
    return { title: 'Spawn', body: [row(input, count, button('Spawn', go, 'primary')), list, status] };
  }

  config() {
    const all = tunables(), search = make('input', { type: 'text', placeholder: 'Search, such as crash or hunger', spellcheck: false, autocomplete: 'off' });
    const onlyChanged = make('input', { type: 'checkbox' }), list = make('div', { className: 'list' }), status = make('p');
    const set = async (path, value) => {
      const answer = await this.world.tune(path, value);
      if (answer.why) status.textContent = `Not changed: ${answer.why}.`;
      refresh();
    };
    const refresh = () => {
      const typed = search.value.trim().toLowerCase(), overrides = this.world.overrides, changed = Object.keys(overrides).length;
      const found = all.filter(({ path }) => (!typed || path.toLowerCase().includes(typed)) && (!onlyChanged.checked || path in overrides));
      status.textContent = `${found.length} of ${all.length} values, ${changed} changed. ${this.world.rules.people ? 'Changes apply to everyone in this world.' : 'Changes apply to this world in this browser.'}${found.length > CONFIG_SHOWN ? ` Showing the first ${CONFIG_SHOWN}.` : ''}`;
      const focused = document.activeElement?.dataset?.path;
      list.replaceChildren(...found.slice(0, CONFIG_SHOWN).map(({ path }) => {
        const isChanged = path in overrides, box = make('input', { type: 'number', step: 'any', value: overrides[path] ?? fileValue(path), ariaLabel: path });
        box.dataset.path = path;
        box.addEventListener('keydown', (e) => { if (e.key === 'Escape') box.blur(); if (e.key === 'Enter') box.blur(); });
        box.addEventListener('change', () => { if (Number.isFinite(box.valueAsNumber)) set(path, box.valueAsNumber === fileValue(path) ? null : box.valueAsNumber); });
        const parts = [make('span', { className: `grow${isChanged ? ' changed' : ''}`, textContent: path, title: `In the files: ${fileValue(path)}` }), box];
        if (isChanged) parts.push(button('↺', () => set(path, null)));
        return row(...parts);
      }));
      if (focused) [...list.querySelectorAll('input')].find((box) => box.dataset.path === focused)?.focus();
    };
    search.addEventListener('input', refresh);
    search.addEventListener('keydown', (e) => { if (e.key === 'Escape') search.blur(); });
    onlyChanged.addEventListener('change', refresh);
    const resetAll = button('Put all back', async () => { for (const path of Object.keys(this.world.overrides)) await this.world.tune(path, null); refresh(); });
    return { title: 'Config values', refresh, body: [search, row(make('label', { className: 'grow' }, onlyChanged, ' Only changed ones'), resetAll), status, list] };
  }

  players() {
    const list = make('div', { className: 'list' }), status = make('p');
    const ask = async (message, done) => {
      const answer = await this.world.link.ask(message);
      status.textContent = answer.why ? `Not done: ${answer.why}.` : done(answer);
    };
    const refresh = () => {
      if (!this.world.rules.people) {
        status.textContent = 'Lives only exist in a shared world.';
        return;
      }
      if (list.contains(document.activeElement)) return; // don't pull a box away from someone typing
      list.replaceChildren(...[...this.world.people.members.values()].sort((a, b) => a.order - b.order).map((member) => {
        const lives = make('input', { type: 'number', min: 0, max: LIVES_MOST, value: member.lives, ariaLabel: `${member.name}'s lives` }), mine = member.id === this.world.you.id;
        const setTo = (value) => ask({ t: 'setLives', member: member.id, lives: value }, (answer) => `${member.name} now has ${answer.lives}.${member.lives <= 0 && answer.lives > 0 && !mine ? ' Their browser forgot this world when they died, so they need a link.' : ''}`);
        lives.addEventListener('keydown', (e) => { if (e.key === 'Escape') lives.blur(); if (e.key === 'Enter') { lives.blur(); setTo(lives.valueAsNumber); } });
        const name = `${member.name}${mine ? ' (you)' : ''}${member.online ? '' : ' · away'}${member.lives <= 0 ? ' · dead' : ''}`;
        return row(make('span', { className: 'grow', textContent: name }), lives, button('Set', () => setTo(lives.valueAsNumber)), button('Reset', () => setTo('reset')),
          ...(mine ? [] : [button('Link', () => ask({ t: 'testRejoin', member: member.id }, (answer) => { this.calls.copyInvite(answer); return `Rejoin link for ${member.name} copied.`; }))]));
      }));
    };
    return { title: 'Players and lives', refresh, body: [status, list] };
  }

  scene() {
    const statBoxes = new Map(), shared = this.world.rules.people, status = make('p');
    const stats = STATS().map(([key, label]) => {
      const slider = make('input', { type: 'range', min: 0, max: 100, step: 1, ariaLabel: label }), figure = make('span', { style: 'width:28px;text-align:right' });
      slider.addEventListener('input', () => { this.calls.setStat(key, slider.valueAsNumber); figure.textContent = slider.value; });
      statBoxes.set(key, { slider, figure });
      return row(make('span', { style: 'width:72px', textContent: label }), slider, figure);
    });
    const hour = make('input', { type: 'range', min: 0, max: 24, step: 0.25, ariaLabel: 'Hour' }), hourShown = make('span', { style: 'width:36px;text-align:right' });
    hour.addEventListener('input', () => { hourShown.textContent = hour.value; this.calls.setHour(hour.valueAsNumber); });
    const lat = make('input', { type: 'text', placeholder: 'Latitude', className: 'grow' }), lng = make('input', { type: 'text', placeholder: 'Longitude', className: 'grow' });
    const people = make('select', { ariaLabel: 'Go to someone' });
    for (const box of [lat, lng]) box.addEventListener('keydown', (e) => { if (e.key === 'Escape') box.blur(); });
    const refresh = () => {
      for (const [key, { slider, figure }] of statBoxes) {
        if (document.activeElement === slider) continue;
        slider.value = this.calls.stat(key);
        figure.textContent = Math.round(this.calls.stat(key));
      }
      if (document.activeElement !== hour) { hour.value = this.calls.hour(); hourShown.textContent = hour.value; }
      if (shared) people.replaceChildren(make('option', { value: '', textContent: 'Someone…' }), ...this.calls.peopleWithPlaces().map(({ id, name }) => make('option', { value: id, textContent: name })));
    };
    const here = () => { const { lat: a, lng: b } = this.calls.where(); lat.value = a.toFixed(6); lng.value = b.toFixed(6); };
    const go = async (a, b) => {
      if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) { status.textContent = 'That isn\'t a place.'; return; }
      status.textContent = await this.calls.teleport(a, b);
    };
    const body = [
      make('h4', { textContent: 'Needs' }), ...stats,
      row(button('Fill all', () => { for (const [key] of statBoxes) this.calls.setStat(key, 100); refresh(); }), button('Nearly out', () => { for (const [key] of statBoxes) if (key !== 'health') this.calls.setStat(key, 5); refresh(); }), button('Critical', () => { this.calls.setStat('health', 10); refresh(); })),
      make('h4', { textContent: 'Time' }), row(hour, hourShown),
      make('h4', { textContent: 'Car' }), row(button('Repair and refuel', async () => { status.textContent = await this.calls.repairCar(); })),
      make('h4', { textContent: 'Teleport' }), row(lat, lng), row(button('Here', here), button('Go', () => go(Number(lat.value), Number(lng.value)), 'primary'), ...(shared ? [people, button('Go to them', () => { const place = this.calls.peopleWithPlaces().find(({ id }) => id === people.value); if (place) go(place.lat, place.lng); })] : [])),
      ...(shared ? [make('h4', { textContent: 'Dying' }), row(button('Die now (loses a life)', () => this.calls.dieNow()))] : []),
      status,
    ];
    return { title: 'Set up a scene', refresh, body: [make('div', { className: 'scroll' }, ...body)] };
  }

  appear() {
    const status = make('p');
    const fields = [];
    const blocks = [];
    const read = (spec) => spec.spacing ? this.calls.spacing(spec.spacing) : (this.world.overrides[spec.path] ?? fileValue(spec.path));
    for (const spec of APPEAR) {
      if (spec.group) {
        blocks.push(make('h4', { textContent: spec.group }), make('p', { textContent: spec.note }));
        continue;
      }
      const figure = make('span', { className: 'fig' });
      const input = make('input', { type: 'range', min: spec.min, max: spec.max, step: spec.step, ariaLabel: spec.label, title: spec.hint || spec.label });
      const show = () => {
        const value = Number(read(spec));
        input.value = value;
        figure.textContent = spec.text(value);
      };
      input.addEventListener('input', () => { figure.textContent = spec.text(snap(input.valueAsNumber, spec.step)); });
      input.addEventListener('change', () => this.commitAppear(spec, snap(input.valueAsNumber, spec.step), status));
      fields.push({ input, show });
      blocks.push(make('label', { className: 'slide' }, make('span', { textContent: spec.label }), figure, input));
    }
    const refresh = () => {
      status.textContent = this.world.rules.people
        ? 'Spacing is this browser. The rest applies to everyone in this world. Somewhere you already searched stays as it was.'
        : 'Somewhere you already searched stays as it was.';
      for (const field of fields) if (document.activeElement !== field.input) field.show();
    };
    const reset = button('Put these back', async () => {
      for (const spec of APPEAR) {
        if (spec.group) continue;
        if (spec.spacing) this.calls.setSpacing(spec.spacing, this.calls.spacingDefault(spec.spacing));
        else for (const path of [spec.path, ...(spec.also || [])]) if (path in this.world.overrides) await this.world.tune(path, null);
      }
      this.calls.replant();
      refresh();
    });
    return { title: 'How often', wide: true, refresh, body: [status, make('div', { className: 'scroll' }, ...blocks, reset)] };
  }

  async commitAppear(spec, value, status) {
    if (spec.spacing) {
      this.calls.setSpacing(spec.spacing, value);
      return;
    }
    for (const path of [spec.path, ...(spec.also || [])]) {
      const answer = await this.world.tune(path, near(value, fileValue(path)) ? null : value);
      if (answer?.why) status.textContent = `Not changed: ${answer.why}.`;
    }
    if (spec.replant) this.calls.replant();
  }
}
