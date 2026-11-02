// One world while it's open: who's connected, what they may do, and who hears what. Talks to players only through { send, sendBytes, close } given for each, so
// it can be tested without a network. See docs/MODE2_DESIGN.md.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { GAME } from '../public/js/gameConfig.js';
import { FLAGS, GROUP_THREAD, cleanLook, clockHour, dmThread, metresApart, nameKey, nameProblem, stampPresence, unpackPresence } from '../public/js/protocol.js';
import { cleanCar, cleanStorage } from '../public/js/worldCars.js';
import { carDamageAt, coastDistance, coastPlace, drivable, healthLossHit, healthLossInCar } from '../public/js/carDamage.js';
import { applyFloorOp, cleanDrop, crashHoldsUp, crashOutcome, emptyFloorState, mergePlan, nextManagers, tileOfBuilding } from '../public/js/worldOps.js';

const FAR = 3000;          // m; past this someone is only a dot on a phone
const FAR_EVERY = 5000;    // ms between passing on the place of someone that far off
const MOST_MESSAGES = 30;  // a second of presence from one person, well above what the game sends
const BUILDING_ID = /^-?\d{1,9}_-?\d{1,9}$/;
const FLOOR_MOST = 300;    // floors up or down
const TILES_MOST = 200;    // that one person can be watching
const DROPS_MOST = 5000;   // left around one world
const TRACK_KEPT = 5000;     // ms of where someone says they've been, to check a crash against
const STARTING_HOUR = 8;   // a morning, so a new world doesn't begin in the dark
const KEPT_FROM_TRIP = ['elapsed', 'moving', 'meters', 'fsdMeters', 'offRoadMeters', 'fsdSeconds', 'topSpeed', 'bridges', 'takeovers', 'signals']; // never an address or a town

export const hashOf = (text) => createHash('sha256').update(String(text)).digest('hex');
export const newToken = (bytes = 24) => randomBytes(bytes).toString('base64url');
const sameHash = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

const okBuilding = (id) => typeof id === 'string' && BUILDING_ID.test(id);
const okFloor = (floor) => Number.isInteger(floor) && Math.abs(floor) <= FLOOR_MOST;
const publicMember = (member, online, building = null) => ({ building, id: member.id, name: member.name, order: member.order, lives: member.lives, figure: member.figure, colours: member.colours, lastSeen: member.lastSeen, online, lat: member.lat, lng: member.lng });

export class Room {
  constructor(store, { now = Date.now, config = GAME.world } = {}) {
    Object.assign(this, { store, now, config });
    this.clients = new Map();      // member id: { id, send, sendBytes, close, order, at, said, sentAt, count, countFrom, asleep }
    this.clockAt = now();          // when the saved hour was true
    this.world = store.world();
    this.crashes = new Map();      // a pair of ids: when they last crashed, as both games report the same one
  }

  // --- The clock: runs while anyone's here ----------------------------------------------------------------------

  clock() {
    const running = this.clients.size > 0;
    return { hour: this.store.world().clockHour, rate: running ? this.config.clockRate : 0, at: this.clockAt, now: this.now() };
  }

  hourNow() {
    return clockHour(this.clock(), this.now());
  }

  // Keeps the hour as it is now and counts on from here.
  settleClock(running) {
    const now = this.now(), hour = running ? this.hourNow() : this.store.world().clockHour;
    this.store.setClockHour(hour);
    this.clockAt = now;
  }

  // --- Coming and going -----------------------------------------------------------------------------------------

  // A new world's first person.
  static create(store, { id, mode = 'private', name, player, now, config = GAME.world }) {
    const look = cleanLook(player.figure, player.colours), secret = newToken(), memberId = newToken(9);
    store.transaction(() => {
      store.createWorld({ id, mode, name, creator: memberId, hour: STARTING_HOUR, now });
      store.addMember({ id: memberId, name: player.name, nameKey: nameKey(player.name), secretHash: hashOf(secret), lives: config.lives, ...look, now });
    });
    return { memberId, secret };
  }

  // Why someone can't come in right now, or null.
  whyNotIn(member) {
    if (!member) return 'unknown';
    if (member.lives <= 0) return 'dead';
    if (!this.clients.has(member.id) && this.clients.size >= this.config.playersOnline) return 'full';
    return null;
  }

  // Signs in with a saved id and secret. Null if it worked, or why it didn't.
  hello(connection, { player, secret }) {
    const member = typeof player === 'string' ? this.store.member(player) : null;
    if (member && (typeof secret !== 'string' || !sameHash(member.secretHash, hashOf(secret)))) return 'unknown';
    const why = this.whyNotIn(member);
    if (why) return why;
    this.admit(connection, member);
    return null;
  }

  // Uses an invite. { why } if it can't, leaving the invite as it was, or { id, secret }.
  join(connection, { code, name, figure, colours }) {
    const codeHash = hashOf(code), invite = typeof code === 'string' ? this.store.invite(codeHash) : null, now = this.now();
    if (!invite || invite.usedBy || invite.expires <= now) return { why: 'invite-used' };
    let member, secret = newToken();
    if (invite.rejoinOf) {
      member = this.store.member(invite.rejoinOf);
      const why = this.whyNotIn(member);
      if (why) return { why };
      this.store.transaction(() => {
        this.store.setSecret(member.id, hashOf(secret));
        this.store.useInvite(codeHash, member.id);
      });
    } else {
      const problem = nameProblem(name), look = cleanLook(figure, colours);
      if (problem) return { why: problem };
      if (!look) return { why: 'bad-look' };
      if (this.clients.size >= this.config.playersOnline) return { why: 'full' };
      const id = newToken(9), key = nameKey(name);
      const taken = this.store.transaction(() => {
        if (this.store.nameTaken(key)) return true;
        this.store.addMember({ id, name, nameKey: key, secretHash: hashOf(secret), lives: this.config.lives, ...look, now });
        this.store.useInvite(codeHash, id);
        const world = this.store.world();
        if (!world.backup && id !== world.owner) this.store.setManagers(world.owner, id); // the first to join is the backup, until a manager chooses another
        return false;
      });
      if (taken) return { why: 'name-taken' };
      member = this.store.member(id);
    }
    this.admit(connection, member, secret);
    this.tellManagers(); // after they're known to everyone, so the name can be said
    return { id: member.id, secret };
  }

  admit(connection, member, secret) {
    const old = this.clients.get(member.id);
    if (old) { // the same person in another tab or after a dropped line: the newest wins
      old.replaced = true;
      old.send({ t: 'replaced' });
      old.close();
    } else if (this.clients.size === 0) this.settleClock(false);
    const client = { ...connection, id: member.id, order: member.order, at: member.lat === null ? null : { lat: member.lat, lng: member.lng }, said: [], sentAt: new Map(), count: 0, countFrom: this.now(), asleep: false, tiles: new Set(), building: null, track: [], car: this.store.cars().find((car) => car.driver === member.id || car.seats?.includes(member.id))?.id ?? null };
    connection.client = client;
    this.clients.set(member.id, client);
    this.store.touchMember(member.id, this.now());
    client.send(this.welcome(member, secret));
    this.tellOthers(member.id, { t: 'member', member: publicMember(this.store.member(member.id), true) });
    this.tellClock();
  }

  welcome(member, secret) {
    const world = this.store.world(), player = this.store.player(member.id);
    const members = this.store.members().map((m) => publicMember(m, this.clients.has(m.id), this.clients.get(m.id)?.building ?? null));
    return {
      t: 'welcome', you: { id: member.id, order: member.order, name: member.name, lives: member.lives, ...(secret ? { secret } : {}) },
      world: { id: world.id, name: world.name, mode: world.mode, creator: world.creator, owner: world.owner, backup: world.backup },
      members, clock: this.clock(), player: { pocket: player.pocket, vitals: player.vitals, trip: player.trip, lat: player.lat, lng: player.lng },
      chat: this.store.chatFor(member.id), near: this.appearNear(member.id), drops: this.store.drops(), cars: this.store.cars(),
    };
  }

  // Where a new person should appear around, as no start is kept: someone online, or whoever was here last.
  appearNear(except) {
    for (const client of this.clients.values()) if (client.id !== except && client.at) return client.at;
    const last = this.store.members().filter((m) => m.id !== except && m.lat !== null).sort((a, b) => b.lastSeen - a.lastSeen)[0];
    return last ? { lat: last.lat, lng: last.lng } : null;
  }

  leave(connection) {
    const client = connection.client;
    if (!client) return;
    connection.client = null;
    if (this.clients.get(client.id) !== client) return; // already replaced by a newer connection
    this.settleClock(true);
    this.clients.delete(client.id);
    const saved = client.at ? { lat: client.at.lat, lng: client.at.lng } : {};
    this.store.savePlayer(client.id, saved);
    this.driverLeft(client);
    this.store.touchMember(client.id, this.now());
    this.tellOthers(client.id, { t: 'member', member: publicMember(this.store.member(client.id), false) });
    this.tellClock();
  }

  get empty() {
    return this.clients.size === 0;
  }

  // --- Telling people -------------------------------------------------------------------------------------------

  tellAll(message) {
    for (const client of this.clients.values()) client.send(message);
  }

  tellOthers(except, message) {
    for (const client of this.clients.values()) if (client.id !== except) client.send(message);
  }

  tellClock() {
    this.tellAll({ t: 'clock', clock: this.clock() });
  }

  tellManagers() {
    const { owner, backup } = this.store.world();
    this.tellAll({ t: 'managers', owner, backup });
  }

  // --- What people send -----------------------------------------------------------------------------------------

  // Passes it on straight away, to those it matters to. Newest wins, so nothing is kept but the last place.
  presence(connection, bytes) {
    const client = connection.client;
    if (!client) return;
    const now = this.now();
    if (now - client.countFrom >= 1000) {
      client.count = 0;
      client.countFrom = now;
    }
    if (++client.count > MOST_MESSAGES) return;
    const place = unpackPresence(bytes);
    if (!place) return;
    client.at = { lat: place.lat, lng: place.lng };
    client.flags = place.flags;
    client.heading = place.heading;
    client.floor = place.floor;
    client.track.push({ at: now, lat: place.lat, lng: place.lng, speed: place.speed });
    while (client.track.length && now - client.track[0].at > TRACK_KEPT) client.track.shift();
    stampPresence(bytes, client.order);
    for (const other of this.clients.values()) {
      if (other === client) continue;
      if (other.at && metresApart(client.at, other.at) > FAR) {
        if (now - (client.sentAt.get(other.id) ?? -Infinity) < FAR_EVERY) continue;
        client.sentAt.set(other.id, now);
      }
      other.sendBytes(bytes);
    }
  }

  // A JSON message from someone signed in. Answers { t: 'ok' } or { t: 'no', why } if it has an id.
  message(connection, message) {
    const client = connection.client;
    if (!client || !message || typeof message !== 'object') return;
    const answer = (result) => { if (message.id !== undefined) client.send({ t: result.why ? 'no' : 'ok', id: message.id, ...result }); };
    const handler = { invite: 'makeInvite', setBackup: 'chooseBackup', say: 'say', sleep: 'sleep', save: 'savePlayer', where: 'where', area: 'area', claimPlan: 'claimPlan', claimFloor: 'claimFloor', floorOp: 'floorOp', switchesOn: 'switchesOn', dropAdd: 'dropAdd', dropTake: 'dropTake', getIn: 'getIn', getOut: 'getOut', carStore: 'carStore', plantCar: 'plantCar', bump: 'bump', crash: 'crash', slide: 'slide', speak: 'speak', carWear: 'carWear', succumb: 'succumb' }[message.t];
    if (!handler) return answer({ why: 'unknown' });
    answer(this[handler](client, message) ?? {});
  }

  // Which building someone's in, for those on the same floor. Places say where in it.
  where(client, { building }) {
    if (building !== null && !okBuilding(building)) return { why: 'bad' };
    client.building = building;
    this.tellOthers(client.id, { t: 'where', member: client.id, building });
    return {};
  }

  // Those watching the tile a building's in, besides whoever did it.
  tellArea(building, except, message) {
    const tile = tileOfBuilding(building);
    for (const client of this.clients.values()) if (client.id !== except && client.tiles.has(tile)) client.send(message);
  }

  // Everything known about these tiles, and from now on what happens in them.
  area(client, { tiles }) {
    if (!Array.isArray(tiles) || !tiles.every((tile) => typeof tile === 'string' && /^\d{1,6}_\d{1,6}$/.test(tile))) return { why: 'bad' };
    if (client.tiles.size + tiles.length > TILES_MOST) client.tiles.clear(); // the oldest are the furthest, and asking again costs little
    for (const tile of tiles) client.tiles.add(tile);
    return { buildings: this.store.buildingsIn(tiles) };
  }

  // What a building is. The first to say keeps it, and later ones only fill in what's missing. Answers with what's kept.
  claimPlan(client, { building, plan }) {
    if (!okBuilding(building) || !plan || typeof plan !== 'object' || Array.isArray(plan)) return { why: 'bad' };
    const known = this.store.plan(building), merged = known ? mergePlan(known, plan) : plan;
    if (!known || JSON.stringify(known) !== JSON.stringify(merged)) {
      this.store.savePlan(building, tileOfBuilding(building), merged);
      this.tellArea(building, client.id, { t: 'plan', building, plan: merged });
    }
    return { plan: merged };
  }

  // A floor as first laid out, kept for good. Answers with what's kept.
  claimFloor(client, { building, floor, record }) {
    if (!okBuilding(building) || !okFloor(floor) || !record || typeof record !== 'object') return { why: 'bad' };
    const known = this.store.floorRow(building, floor);
    if (known?.record) return { record: known.record };
    this.store.saveFloorRow(building, floor, { record, state: known?.state ?? emptyFloorState() });
    this.tellArea(building, client.id, { t: 'floor', building, floor, record });
    return { record };
  }

  floorOp(client, { building, floor, op, key, u, v, hole, on }) {
    if (!okBuilding(building) || !okFloor(floor)) return { why: 'bad' };
    const state = this.store.floorRow(building, floor)?.state ?? emptyFloorState(), change = { op, key, u, v, hole, on };
    const why = applyFloorOp(state, change);
    if (why) return { why };
    this.store.saveFloorRow(building, floor, { state });
    this.tellArea(building, client.id, { t: 'floorOp', building, floor, ...change });
    return {};
  }

  switchesOn(client, { building }) {
    if (!okBuilding(building)) return { why: 'bad' };
    this.store.setSwitchesOn(building);
    this.tellArea(building, client.id, { t: 'switchesOn', building });
    return {};
  }

  dropAdd(client, { drop }) {
    const clean = cleanDrop(drop);
    if (!clean) return { why: 'bad' };
    if (this.store.drops().length >= DROPS_MOST) return { why: 'too-many' };
    if (this.store.addDrop(clean)) this.tellOthers(client.id, { t: 'dropAdded', drop: clean });
    return {};
  }

  dropTake(client, { drop }) {
    if (typeof drop !== 'string' || !this.store.takeDrop(drop)) return { why: 'gone' };
    this.tellOthers(client.id, { t: 'dropTaken', id: drop });
    return {};
  }

  // Spoken aloud: heard by those in the same car, or close by in the same place. Passed on and forgotten, with nothing saved.
  speak(client, { text }) {
    const now = this.now(), { chatLength, chatBurst, chatBurstSeconds, hearWithin } = this.config;
    if (typeof text !== 'string' || !text.trim()) return { why: 'empty' };
    if (text.length > chatLength) return { why: 'too-long' };
    client.said = client.said.filter((at) => now - at < chatBurstSeconds * 1000);
    if (client.said.length >= chatBurst) return { why: 'too-fast' };
    client.said.push(now);
    let heard = 0;
    for (const other of this.clients.values()) {
      if (other === client) continue;
      const sameCar = client.car && other.car === client.car;
      const near = client.at && other.at && metresApart(client.at, other.at) <= hearWithin && (other.building ?? null) === (client.building ?? null) && (!client.building || other.floor === client.floor);
      if (!sameCar && (!near || client.car || other.car)) continue; // through a car's windows nobody hears
      other.send({ t: 'spoken', from: client.id, text, inCar: !!sameCar });
      heard++;
    }
    return { heard };
  }

  // My game saw a hit: the other game hears, so that both agree it happened and both stop.
  bump(client, { to, closing }) {
    const other = typeof to === 'string' ? this.clients.get(to) : null;
    if (!Number.isFinite(closing) || closing < 0 || closing > 1000) return { why: 'bad' };
    other?.send({ t: 'bumped', by: client.id, closing });
    return {};
  }

  // Where someone was in the last while, however they said so.
  recent(client) {
    const now = this.now();
    return client.track.filter((place) => now - place.at <= TRACK_KEPT);
  }

  // A game says it crashed. A wrong death can't be undone, so its word isn't enough: both reported paths have to back it up, or it's only a stop. One crash once, though both games report it.
  crash(client, { kind, other, closing, lat, lng, planted }) {
    if (!['car', 'parked', 'person'].includes(kind) || !Number.isFinite(closing) || closing < 0 || closing > 1000 || !Number.isFinite(lat) || !Number.isFinite(lng)) return { why: 'bad' };
    const config = GAME.crash, now = this.now(), target = kind === 'parked' ? null : this.clients.get(other);
    if (kind !== 'parked' && !target) return { outcome: 'stop' };
    const pairKey = kind === 'parked' ? `${client.id}|${other}` : [client.id, other].sort().join('|');
    if (now - (this.crashes.get(pairKey) ?? -Infinity) < config.sameCrashSeconds * 1000) return { outcome: 'same' };
    const at = { lat, lng }, outcome = crashOutcome(kind, closing, config);
    if (!outcome.kill.length && !outcome.hurt.length) return { outcome: 'stop' };
    if (!crashHoldsUp({ mine: this.recent(client), theirs: target ? this.recent(target) : null, at, closing, withinMetres: config.withinMetres }, metresApart)) return { outcome: 'stop' };
    this.crashes.set(pairKey, now);
    // Everyone in a car shares what happens to it. Worked out before a wreck empties it.
    const inside = (person) => {
      const car = person?.car && kind !== 'person' ? this.store.car(person.car) : null, riders = (car?.seats ?? []).map((id) => this.clients.get(id)).filter(Boolean);
      return person ? [person, ...riders] : [];
    };
    const whose = (who) => inside(who === 'me' ? client : target);
    const hurt = outcome.hurt.flatMap(whose), killed = outcome.kill.flatMap(whose);
    for (const who of outcome.wreck) this.wreck(who === 'me' ? client.car : kind === 'parked' ? other : target?.car, planted, at);
    const how = kind === 'person' ? 'hit' : 'crash';
    // What's left of the cars, if they survive it.
    if (!outcome.wreck.length && kind !== 'person') {
      const amount = carDamageAt(outcome.mph);
      this.damageCar(client.car, amount);
      this.damageCar(kind === 'parked' ? other : target?.car, amount, planted);
    }
    const lost = kind === 'person' ? healthLossHit(outcome.mph) : healthLossInCar(outcome.mph);
    for (const person of hurt) person.send({ t: 'injured', how, lost });
    for (const person of killed) this.killMember(person, { how, by: kind === 'person' ? client.id : null, at });
    return { outcome: outcome.kill.length ? 'dead' : 'hurt' };
  }

  // Burnt out, for good, where it stands.
  wreck(id, planted, at) {
    const car = this.known(id, planted);
    if (!car) return;
    Object.assign(car, { wrecked: true, driver: null, seats: [], lat: car.driver ? at.lat : car.lat, lng: car.driver ? at.lng : car.lng, runs: false, why: 'carWrecked', storage: [] });
    this.store.saveCar(car);
    this.tellAll({ t: 'car', car });
  }

  damageCar(id, amount, planted) {
    const car = this.known(id, planted);
    if (!car || car.wrecked) return;
    car.condition = Math.max(0, (car.condition ?? 100) - amount);
    this.store.saveCar(car);
    this.tellAll({ t: 'car', car });
  }

  // Wear the driver's game has noticed, such as from driving off road. It can only go down.
  carWear(client, { car: id, condition }) {
    const car = typeof id === 'string' ? this.store.car(id) : null;
    if (!car || car.driver !== client.id || !Number.isFinite(condition)) return { why: 'bad' };
    if (condition < (car.condition ?? 100)) {
      car.condition = Math.max(0, condition);
      this.store.saveCar(car);
      this.tellOthers(client.id, { t: 'car', car });
    }
    return {};
  }

  // Their game says their injuries have killed them. Needs are worked out in the browser, as for anything else about their body.
  succumb(client) {
    this.killMember(client, { how: 'injuries', by: null, at: client.at });
    return {};
  }

  killMember(client, { how, by, at }) {
    const member = this.store.member(client.id), lives = Math.max(0, member.lives - 1);
    this.store.setLives(client.id, lives);
    client.car = null;
    client.planted = false; // a new life can have a car near it too
    const dead = this.store.member(client.id);
    this.tellAll({ t: 'died', member: client.id, lives, how, by, at });
    this.tellAll({ t: 'member', member: publicMember(dead, this.clients.has(client.id), null) });
    if (lives > 0) return;
    const before = this.store.world(), { owner, backup } = nextManagers(before, this.store.members());
    if (owner !== before.owner || backup !== before.backup) {
      this.store.setManagers(owner, backup);
      this.tellManagers();
    }
  }

  // --- Cars ----------------------------------------------------------------------------------------------------

  // A car whose driver has gone stays where it stopped, and stays theirs for a few seconds in case the line just dropped.
  driverLeft(client) {
    const car = client.car && this.store.car(client.car);
    if (!car) return;
    if (car.seats?.includes(client.id)) { // someone riding is simply gone
      car.seats = car.seats.filter((seat) => seat !== client.id);
      this.store.saveCar(car);
      this.tellAll({ t: 'car', car });
      return;
    }
    if (car.driver !== client.id) return;
    // The engine's off and it rolls on until it stops, in a straight line, as nobody is there to steer.
    const last = client.track.at(-1), heading = client.heading ?? car.heading;
    if (client.at) {
      car.coast = { ...client.at, heading, speed: last?.speed ?? 0, at: this.now() };
      const end = coastPlace(car.coast, this.now() + coastDistance(last?.speed ?? 0).seconds * 1000 + 1000);
      Object.assign(car, { lat: end.lat, lng: end.lng, heading });
    }
    car.driverLeftAt = this.now();
    this.store.saveCar(car);
    this.tellAll({ t: 'car', car });
  }

  // Whether this car's driver is still its driver: here, or gone so recently the line may only have dropped.
  hasDriver(car) {
    if (!car.driver) return false;
    return this.clients.has(car.driver) || this.now() - (car.driverLeftAt ?? 0) <= GAME.worldCars.driverFreeAfter * 1000;
  }

  // planted: the car as this browser worked it out, used if nobody has touched it yet.
  known(id, planted) {
    if (typeof id === 'string') {
      const car = this.store.car(id);
      if (car) return car;
    }
    const clean = cleanCar(planted);
    return clean && clean.id === id ? clean : null;
  }

  // First in takes the wheel of a car that runs, and anyone after takes a seat beside them. One driver, and four people in all.
  getIn(client, { car: id, planted }) {
    const car = this.known(id, planted);
    if (!car) return { why: 'bad' };
    if (car.wrecked) return { why: 'carWrecked' };
    car.seats ||= [];
    if (car.driver === client.id || car.seats.includes(client.id)) {
      client.car = car.id;
      return { car };
    }
    if (this.hasDriver(car)) {
      if (car.seats.length + 1 >= GAME.worldCars.seats) return { why: 'carFull' };
      car.seats.push(client.id);
    } else {
      if (!car.runs) return { why: car.why ?? 'carBroken' };
      if (!drivable(car.condition)) return { why: 'carDead' };
      Object.assign(car, { driver: client.id, driverLeftAt: null, coast: null });
    }
    this.store.saveCar(car);
    client.car = car.id;
    this.tellOthers(client.id, { t: 'car', car });
    return { car };
  }

  // A driver leaves it where it stopped, with whoever's still in it. Someone riding just gets out.
  getOut(client, { car: id, lat, lng, heading, fuel }) {
    const car = typeof id === 'string' ? this.store.car(id) : null;
    if (!car) return { why: 'not-yours' };
    if (car.seats?.includes(client.id)) {
      car.seats = car.seats.filter((seat) => seat !== client.id);
    } else if (car.driver === client.id) {
      if ([lat, lng, heading].every(Number.isFinite) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) Object.assign(car, { lat, lng, heading });
      if (Number.isFinite(fuel)) car.fuel = Math.max(0, Math.min(100, fuel));
      car.driver = null;
    } else return { why: 'not-yours' };
    this.store.saveCar(car);
    client.car = null;
    this.tellOthers(client.id, { t: 'car', car });
    return { car };
  }

  // Someone riding takes the wheel of a car with nobody at it.
  slide(client, { car: id }) {
    const car = typeof id === 'string' ? this.store.car(id) : null;
    if (!car || !car.seats?.includes(client.id)) return { why: 'not-yours' };
    if (this.hasDriver(car)) return { why: 'carTaken' };
    if (car.wrecked) return { why: 'carWrecked' };
    if (!car.runs) return { why: car.why ?? 'carBroken' };
    if (!drivable(car.condition)) return { why: 'carDead' };
    car.seats = car.seats.filter((seat) => seat !== client.id);
    Object.assign(car, { driver: client.id, driverLeftAt: null });
    this.store.saveCar(car);
    this.tellOthers(client.id, { t: 'car', car });
    return { car };
  }

  // A car's storage changes as a whole, only if nobody else has changed it since this browser saw it.
  carStore(client, { car: id, planted, storage, version }) {
    const car = this.known(id, planted), clean = cleanStorage(storage);
    if (!car || !clean) return { why: 'bad' };
    if (car.wrecked) return { why: 'carWrecked' };
    if ((car.version ?? 0) !== version) return { why: 'stale', car };
    Object.assign(car, { storage: clean, version: (car.version ?? 0) + 1 });
    this.store.saveCar(car);
    this.tellOthers(client.id, { t: 'car', car });
    return { car };
  }

  // A running car for someone who'd otherwise be stranded. Once per person, each time they sign in.
  plantCar(client, { planted }) {
    const car = cleanCar(planted);
    if (!car || !car.id.startsWith('x_') || !car.runs || client.planted) return { why: 'bad' };
    client.planted = true;
    this.store.saveCar(car);
    this.tellOthers(client.id, { t: 'car', car });
    return { car };
  }

  isManager(id) {
    const { owner, backup } = this.store.world();
    return id === owner || id === backup;
  }

  makeInvite(client, { rejoinOf }) {
    if (!this.isManager(client.id)) return { why: 'not-manager' };
    if (rejoinOf !== undefined) {
      const member = typeof rejoinOf === 'string' ? this.store.member(rejoinOf) : null;
      if (!member) return { why: 'unknown' };
      if (member.lives <= 0) return { why: 'dead' };
    }
    const code = newToken(), expires = this.now() + this.config.inviteHours * 3600000;
    this.store.addInvite({ codeHash: hashOf(code), madeBy: client.id, expires, rejoinOf: rejoinOf ?? null });
    return { code, expires, world: this.store.world().id };
  }

  chooseBackup(client, { member }) {
    if (!this.isManager(client.id)) return { why: 'not-manager' };
    const chosen = typeof member === 'string' ? this.store.member(member) : null, { owner } = this.store.world();
    if (!chosen) return { why: 'unknown' };
    if (chosen.lives <= 0) return { why: 'dead' };
    if (chosen.id === owner) return { why: 'already-owner' };
    this.store.setManagers(owner, chosen.id);
    this.tellManagers();
    return {};
  }

  say(client, { to, text }) {
    const now = this.now(), { chatLength, chatBurst, chatBurstSeconds, chatKept } = this.config;
    if (typeof text !== 'string' || !text.trim()) return { why: 'empty' };
    if (text.length > chatLength) return { why: 'too-long' };
    client.said = client.said.filter((at) => now - at < chatBurstSeconds * 1000);
    if (client.said.length >= chatBurst) return { why: 'too-fast' };
    let thread = GROUP_THREAD, target = null;
    if (to !== undefined && to !== null) {
      target = typeof to === 'string' ? this.store.member(to) : null;
      if (!target) return { why: 'unknown' };
      if (target.lives <= 0) return { why: 'dead' };
      thread = dmThread(client.id, target.id);
    }
    client.said.push(now);
    const line = { thread, sender: client.id, text, at: now };
    const id = this.store.addChat(line, chatKept), said = { t: 'said', id, ...line };
    if (target) {
      client.send(said);
      if (target.id !== client.id) this.clients.get(target.id)?.send(said);
      return { offline: !this.clients.has(target.id) };
    }
    this.tellAll(said);
    return {};
  }

  // Someone sleeps. Only their body skips ahead, unless everyone else here is in bed too, when the world does as well.
  sleep(client, { hours }) {
    if (!Number.isFinite(hours) || hours <= 0 || hours > 24) return { why: 'bad-hours' };
    const allAsleep = [...this.clients.values()].every((other) => other === client || (other.flags ?? 0) & FLAGS.asleep);
    if (!allAsleep) return { worldMoved: false };
    const hour = (this.hourNow() + hours) % 24;
    this.store.setClockHour(hour);
    this.clockAt = this.now();
    this.tellClock();
    return { worldMoved: true };
  }

  // Needs, the bag, notes and trip figures, as they stand. Only what was sent changes.
  savePlayer(client, { pocket, vitals, trip, lat, lng }) {
    const saved = {};
    if (pocket && typeof pocket === 'object') saved.pocket = pocket;
    if (vitals && typeof vitals === 'object') saved.vitals = vitals;
    if (trip && typeof trip === 'object') saved.trip = Object.fromEntries(KEPT_FROM_TRIP.filter((key) => Number.isFinite(trip[key])).map((key) => [key, trip[key]]));
    if (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) {
      saved.lat = lat;
      saved.lng = lng;
      client.at = { lat, lng };
    }
    this.store.savePlayer(client.id, saved);
    return {};
  }
}
