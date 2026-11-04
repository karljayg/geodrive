// A shared world's buildings and dropped things, standing in for BuildingStore and Drops so that foot.js and main.js needn't care: everything still reads at once,
// from what's arrived so far. What this player does is shown here straight away and sent, and the server decides anything two people could want. Pure, tested in node.
import { Drops } from './drops.js';
import { GAME } from './gameConfig.js';
import { plantCars, rescueCar } from './worldCars.js';
import { metresApart } from './protocol.js';
import { applyFloorOp, emptyFloorState, floorOpsBetween, planToShare, tileOfBuilding, undoFloorOp } from './worldOps.js';

const copy = (value) => JSON.parse(JSON.stringify(value));

export class SharedBuildings {
  // link: { ask(message): a promise of the answer }.
  constructor(link) {
    this.link = link;
    this.buildings = {};      // id: its plan, with state, as here
    this.floors = new Map();  // `${id}_${floor}`: the layout
    this.agreed = new Map();  // id: the state as the server last knew it, to see what's changed
    this.sharedPlans = new Map(); // id: the plan as last sent
    this.watching = new Set();
    this.onChange = null;     // (id, floor): something changed here that wasn't this player's doing
    this.onRefused = null;    // (id, floor, op): someone else got to it first
  }

  get(id) {
    return this.buildings[id] ?? null;
  }

  // The building's plan, the first time anyone here works it out. The server keeps whoever's came first.
  remember(id, plan) {
    const known = this.buildings[id];
    this.buildings[id] = known ? Object.assign(known, plan) : { ...plan };
    this.watch(tileOfBuilding(id));
    this.sendPlan(id);
    return this.buildings[id];
  }

  sendPlan(id) {
    const shared = planToShare(this.buildings[id]), text = JSON.stringify(shared);
    if (this.sharedPlans.get(id) === text) return;
    this.sharedPlans.set(id, text);
    this.link.ask({ t: 'claimPlan', building: id, plan: shared }).then((answer) => {
      if (answer.plan) this.adoptPlan(id, answer.plan);
    });
  }

  adoptPlan(id, kept) {
    const plan = this.buildings[id];
    if (!plan) return;
    const before = JSON.stringify(planToShare(plan));
    Object.assign(plan, kept);
    const text = JSON.stringify(planToShare(plan));
    this.sharedPlans.set(id, text);
    if (text !== before) this.onChange?.(id, null);
  }

  // A floor as first laid out, or null if nobody here has seen it.
  floor(id, floor) {
    return this.floors.get(`${id}_${floor}`) ?? null;
  }

  saveFloor(id, floor, record) {
    this.floors.set(`${id}_${floor}`, record);
    this.sendPlan(id); // its look was worked out along with this
    this.link.ask({ t: 'claimFloor', building: id, floor, record }).then((answer) => {
      if (answer.record && JSON.stringify(answer.record) !== JSON.stringify(record)) { // someone else's came first, with different code
        this.floors.set(`${id}_${floor}`, answer.record);
        this.onChange?.(id, floor);
      }
    });
  }

  // Called after anything changes a plan: sends what's different.
  saveIndex() {
    for (const [id, plan] of Object.entries(this.buildings)) {
      this.sendPlan(id);
      if (plan.switchesOn && !this.agreed.get(id)?.switchesOn) {
        this.agreedFor(id).switchesOn = true;
        this.link.ask({ t: 'switchesOn', building: id });
      }
      for (const [floor, state] of Object.entries(plan.state ?? {})) this.sendFloor(id, Number(floor), state);
    }
  }

  agreedFor(id) {
    if (!this.agreed.has(id)) this.agreed.set(id, { floors: {} });
    return this.agreed.get(id);
  }

  sendFloor(id, floor, state) {
    const agreed = this.agreedFor(id).floors;
    const ops = floorOpsBetween(agreed[floor], state);
    if (!ops.length) return;
    agreed[floor] = copy(state);
    for (const op of ops) {
      this.link.ask({ t: 'floorOp', building: id, floor, ...op }).then((answer) => {
        if (answer.t === 'ok') return;
        if (answer.why !== 'gone') { // gone means it's gone for this person too: someone else has it
          undoFloorOp(state, op);
          undoFloorOp(agreed[floor], op);
        }
        this.onRefused?.(id, floor, op, answer.why);
        this.onChange?.(id, floor);
      });
    }
  }

  // Someone else did something on a floor.
  heardFloorOp({ building, floor, ...op }) {
    const plan = this.buildings[building];
    if (!plan) return; // it comes with the plan, if this browser ever asks
    const state = ((plan.state ||= {})[floor] ||= emptyFloorState());
    applyFloorOp(state, op);
    const agreed = this.agreedFor(building).floors;
    applyFloorOp((agreed[floor] ||= emptyFloorState()), op);
    this.onChange?.(building, floor);
  }

  heardSwitchesOn({ building }) {
    if (this.buildings[building]) this.buildings[building].switchesOn = true;
    this.agreedFor(building).switchesOn = true;
    this.onChange?.(building, null);
  }

  // A building someone else has just worked out, or more of it.
  heardPlan({ building, plan }) {
    if (this.buildings[building]) return this.adoptPlan(building, plan);
    this.buildings[building] = plan;
    this.sharedPlans.set(building, JSON.stringify(planToShare(plan)));
    this.onChange?.(building, null);
  }

  heardFloor({ building, floor, record }) {
    if (!this.floors.has(`${building}_${floor}`)) {
      this.floors.set(`${building}_${floor}`, record);
      this.onChange?.(building, floor);
    }
  }

  // Asks about the buildings in these map tiles, and from then on hears what happens in them.
  async watch(...tiles) {
    const fresh = tiles.filter((tile) => !this.watching.has(tile));
    if (!fresh.length) return;
    for (const tile of fresh) this.watching.add(tile);
    const answer = await this.link.ask({ t: 'area', tiles: fresh });
    if (answer.t !== 'ok') {
      for (const tile of fresh) this.watching.delete(tile);
      return;
    }
    this.takeArea(answer.buildings ?? []);
  }

  takeArea(buildings) {
    for (const { id, plan, switchesOn, floors } of buildings) {
      const here = this.buildings[id];
      if (here) Object.assign(here, plan);
      else this.buildings[id] = plan;
      this.buildings[id].state ||= {};
      this.sharedPlans.set(id, JSON.stringify(planToShare(this.buildings[id])));
      const agreed = this.agreedFor(id);
      if (switchesOn) {
        this.buildings[id].switchesOn = true;
        agreed.switchesOn = true;
      }
      for (const { floor, record, state } of floors) {
        if (record) this.floors.set(`${id}_${floor}`, record);
        this.buildings[id].state[floor] = state;
        agreed.floors[floor] = copy(state);
      }
      this.onChange?.(id, null);
    }
  }

  // After the line comes back: everything is asked for again, as things may have happened meanwhile.
  rejoined() {
    const tiles = [...this.watching];
    this.watching.clear();
    return this.watch(...tiles);
  }

  forget() { /* nobody can forget a shared world's buildings */ }
}

export class SharedDrops extends Drops {
  constructor(link, me, list = []) {
    super(null);
    Object.assign(this, { link, me });
    this.list = list;
    this.counter = 0;
    this.onChange = null;   // something was left or taken, by someone else
    this.onLost = null;     // (drop): someone else picked it up first
  }

  save() { /* the server keeps them */ }

  // An id of its own making, so it can be shown at once. Includes who, so two people can't make the same one.
  add(drop) {
    const id = `${this.me}-${Date.now().toString(36)}-${this.counter++}`, whole = { ...drop, id };
    this.list.push(whole);
    this.link.ask({ t: 'dropAdd', drop: whole }).then((answer) => {
      if (answer.t === 'ok') return;
      this.list = this.list.filter((other) => other.id !== id);
      this.onChange?.();
    });
    return id;
  }

  remove(id) {
    const drop = this.list.find((other) => other.id === id);
    if (!drop) return false;
    this.list = this.list.filter((other) => other !== drop);
    this.link.ask({ t: 'dropTake', drop: id }).then((answer) => {
      if (answer.t !== 'ok' && answer.why !== 'offline') this.onLost?.(drop);
      if (answer.why === 'offline') this.list.push(drop); // it's still there for everyone else
    });
    return true;
  }

  heardAdded(drop) {
    if (this.list.some((other) => other.id === drop.id)) return;
    this.list.push(drop);
    this.onChange?.();
  }

  heardTaken(id) {
    const before = this.list.length;
    this.list = this.list.filter((other) => other.id !== id);
    if (this.list.length !== before) this.onChange?.();
  }

  setAll(list) {
    this.list = list;
    this.onChange?.();
  }
}

// The cars around: planted ones from the road tiles this browser has, with whatever the server says about those someone has touched. Reads at once.
export class SharedCars {
  constructor(link, me, records = []) {
    Object.assign(this, { link, me });
    this.records = new Map(records.map((car) => [car.id, car]));
    this.plantedTiles = new Map(); // road tile key: its planted cars
    this.onChange = null;
  }

  // New road tiles' cars, once each, from where each lets cars be left (RoadTiles.parkingOf). Tiles let go of aren't missed: their cars are out of sight.
  plantFrom(parkingOf, config = GAME.worldCars) {
    for (const [key, parking] of parkingOf) if (!this.plantedTiles.has(key)) this.plantedTiles.set(key, plantCars(parking, config));
    for (const key of this.plantedTiles.keys()) if (!parkingOf.has(key)) this.plantedTiles.delete(key);
  }

  // Wipe planted tiles so a new every re-rolls the roads. Touched cars in records stay.
  replant(parkingOf, config = GAME.worldCars) {
    this.plantedTiles.clear();
    this.plantFrom(parkingOf, config);
  }

  // News can cross: an answer and a later change can arrive together, so only something newer counts.
  keep(car) {
    const known = this.records.get(car.id);
    if (!known || (car.rev ?? 0) >= (known.rev ?? 0)) this.records.set(car.id, car);
    return this.records.get(car.id);
  }

  heard(car) {
    this.keep(car);
    this.onChange?.(car);
  }

  setAll(list) {
    this.records = new Map(list.map((car) => [car.id, car]));
    this.onChange?.(null);
  }

  // A car as it now is, planted or touched. A touched one may have been driven far from where it was planted.
  get(id) {
    const record = this.records.get(id);
    if (record) return record;
    for (const cars of this.plantedTiles.values()) {
      const found = cars.find((car) => car.id === id);
      if (found) return found;
    }
    return null;
  }

  // Parked cars within this far, nearest first. Those being driven aren't parked: they're where their drivers are.
  around(at, within, most = Infinity) {
    // Car parks hold thousands, and this runs every frame, so a cheap box comes first.
    const found = [], dLat = within / 111000, dLng = dLat / Math.max(0.01, Math.cos((at.lat * Math.PI) / 180));
    const consider = (car) => {
      if (Math.abs(car.lat - at.lat) > dLat || Math.abs(car.lng - at.lng) > dLng) return;
      const away = metresApart(at, car);
      if (away <= within) found.push({ car, away });
    };
    for (const cars of this.plantedTiles.values()) for (const car of cars) if (!this.records.has(car.id)) consider(car);
    for (const car of this.records.values()) if (!car.driver) consider(car);
    return found.sort((a, b) => a.away - b.away).slice(0, most).map(({ car }) => car);
  }

  // The car this person is driving, if any: they may have refreshed the page.
  mine() {
    for (const car of this.records.values()) if (car.driver === this.me || car.seats?.includes(this.me)) return car;
    return null;
  }

  // Take the wheel, from a seat beside it.
  async slide(car) {
    const answer = await this.link.ask({ t: 'slide', car: car.id });
    if (answer.car) answer.car = this.keep(answer.car);
    return answer;
  }

  async getIn(car) {
    const answer = await this.link.ask({ t: 'getIn', car: car.id, planted: car });
    if (answer.car) answer.car = this.keep(answer.car);
    return answer;
  }

  async getOut(car, place) {
    const answer = await this.link.ask({ t: 'getOut', car: car.id, ...place });
    if (answer.car) answer.car = this.keep(answer.car);
    return answer;
  }

  // What's in a car, sent whole. Refused if someone else changed it first, when what's here is put right.
  async setStorage(car, storage) {
    const answer = await this.link.ask({ t: 'carStore', car: car.id, planted: car, storage, version: car.version ?? 0 });
    if (answer.car) answer.car = this.keep(answer.car);
    return answer;
  }

  // Nobody should be stranded: a running car within walking distance of where someone first appears, added if the dice left none. road: the nearest road to them.
  async makeSureOfOne(at, road, config = GAME.worldCars) {
    if (this.around(at, config.rescueWithin).some((car) => car.runs && !car.wrecked)) return null;
    const answer = await this.link.ask({ t: 'plantCar', planted: rescueCar(road.lat, road.lng, road.heading, `${this.me}-${Date.now().toString(36)}`) });
    if (answer.car) answer.car = this.keep(answer.car);
    this.onChange?.(answer.car ?? null);
    return answer.car ?? null;
  }
}
