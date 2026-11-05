// The person's needs: what's left of each, how fast it's going, and a running record of what's happened. All numbers come from gameConfig.js. Pure, tested in node.
import { GAME } from './gameConfig.js';
import { say as line } from './sayings.js';
import { newWalk } from './trip.js';

const STORE = 'geodrive_vitals_v1';
const STEP = 0.25;  // game hours at most in one go, so passing a night still crosses each warning in order

const clamp = (value) => Math.max(0, Math.min(100, value));
const blank = (config) => ({
  stats: Object.fromEntries([...Object.entries(config.stats).map(([name, stat]) => [name, stat.start]), ['health', config.health.start]]),
  hours: 0,           // game hours lived through
  totals: { food: 0, drink: 0, medicine: 0, supply: 0, restroom: 0, accidents: 0, collapses: 0, sleeps: 0, hoursAsleep: 0, charged: 0 },
  warned: {},         // the warning each stat last gave, so it says it once on the way down
  warnedAt: {},
  walked: newWalk(),  // every walk so far, for the pause screen
});

export class Vitals {
  constructor(storage, config = GAME) {
    this.config = config;
    this.state = blank(config);
    try {
      this.storage = storage === undefined ? localStorage : storage;
      const saved = JSON.parse(this.storage?.getItem(STORE) ?? 'null');
      if (saved) {
        const fresh = blank(config); // anything added to the config since this was saved starts as new
        this.state = { ...fresh, ...saved, stats: { ...fresh.stats, ...saved.stats }, totals: { ...fresh.totals, ...saved.totals } };
      }
    } catch (err) {
      console.warn('saved vitals:', err);
    }
  }

  save() {
    try {
      this.storage?.setItem(STORE, JSON.stringify(this.state));
    } catch (err) {
      console.warn('saving vitals:', err);
    }
  }

  get stats() {
    return this.state.stats;
  }

  // Start again from the start values, for testing and for tuning.
  reset() {
    this.state = blank(this.config);
    this.save();
  }

  // Each stat's change per game hour for what's happening. doing: { activity, screen, light, music, flash, charging }, the last four for what's on.
  rates(doing) {
    const { stats, health } = this.config, rates = {};
    for (const [name, stat] of Object.entries(stats)) {
      let rate = stat.perHour.all ?? stat.perHour[doing.activity === 'resting' ? 'sleeping' : doing.activity] ?? 0; // resting in bed uses up what sleep does
      if (name === 'energy' && rate > 0 && doing.energyShare !== undefined) rate *= doing.energyShare;
      if (name === 'phone') {
        if (doing.screen) rate += stat.using.screen;
        if (doing.light === 'phone') rate += stat.using.light;
        if (doing.music) rate += stat.using.music;
      }
      if (name === 'flashlight' && doing.light === 'flash') rate += stat.using.light;
      if (name === 'phone' && (doing.chargingPhone ?? doing.charging) && stat.charging) rate = stat.charging;
      if (name === 'flashlight' && doing.chargingFlashlight && stat.charging) rate = stat.charging;
      rates[name] = rate;
    }
    const empties = Object.entries(health.lossWhenEmpty).filter(([name]) => this.stats[name] <= 0);
    let healthRate = empties.reduce((sum, [, loss]) => sum + loss, 0);
    const needs = Object.keys(health.lossWhenEmpty);
    if (this.isCritical) {
      rates.health = healthRate + (empties.length ? 0 : doing.activity === 'resting' ? health.healInBed : health.healWhenCritical);
      return rates;
    }
    if (!empties.length && needs.every((name) => this.stats[name] > health.wellAbove)) healthRate += health.healWhenWell;
    if (!empties.length && doing.activity === 'sleeping') healthRate += health.healAsleep;
    rates.health = healthRate;
    return rates;
  }

  // How a stat is doing, from its own warnings: 'good' above the first, 'critical' at the last, 'caution' between.
  levelOf(name) {
    const levels = ((name === 'health' ? this.config.health : this.config.stats[name]).warn || []).map(([level]) => level), value = this.stats[name];
    if (!levels.length || value > Math.max(...levels)) return 'good';
    return value <= Math.min(...levels) ? 'critical' : 'caution';
  }

  // The pause screen's list, the most urgent first: lowest first, with the phone and flashlight after what the person needs to live.
  needRows(names, rates) {
    const gear = (name) => (name === 'phone' || name === 'flashlight' ? 1 : 0);
    return names.map((name) => {
      const { label, tip } = name === 'health' ? this.config.health : this.config.stats[name];
      return { name, label, tip, value: Math.round(this.stats[name]), level: this.levelOf(name), hoursLeft: this.hoursLeft(name, rates) };
    }).sort((a, b) => gear(a.name) - gear(b.name) || a.value - b.value);
  }

  // Hours until a stat runs out at this rate, or null if it isn't going down.
  hoursLeft(name, rates) {
    return rates[name] < 0 ? this.stats[name] / -rates[name] : null;
  }

  // Time passes. Returns what happened, oldest first: { type: 'warn', stat, say }, { type: 'accident', stat, say }, { type: 'empty', stat } or { type: 'collapse', why }.
  pass(hours, doing) {
    const events = [];
    let left = hours;
    while (left > 1e-9) {
      const chunk = Math.min(left, STEP);
      this.stepOnce(chunk, doing, events);
      left -= chunk;
    }
    return events;
  }

  get isCritical() {
    return this.stats.health <= this.config.health.criticalBelow;
  }

  // Hours left at this rate of being critical, or null if they aren't.
  criticalHoursLeft() {
    return this.isCritical ? Math.max(0, this.config.health.criticalHours - (this.state.criticalHours ?? 0)) : null;
  }

  // Too long in a bad way kills. Once, as it's up to the world what that means: in the sandbox, nothing.
  countCritical(hours, events) {
    const { state } = this;
    if (!this.isCritical) {
      state.criticalHours = 0;
      state.succumbed = false;
      return;
    }
    state.criticalHours = (state.criticalHours ?? 0) + hours;
    if (state.criticalHours >= this.config.health.criticalHours && !state.succumbed) {
      state.succumbed = true;
      events.push({ type: 'succumb' });
    }
  }

  stepOnce(hours, doing, events) {
    const { state, stats } = this, rates = this.rates(doing);
    state.hours += hours;
    this.countCritical(hours, events);
    if (doing.activity === 'sleeping') state.totals.hoursAsleep += hours;
    for (const [name, rate] of Object.entries(rates)) {
      const before = stats[name];
      stats[name] = clamp(before + rate * hours);
      if (rate > 0) {
        if ((name === 'phone' && (doing.chargingPhone ?? doing.charging)) || (name === 'flashlight' && doing.chargingFlashlight)) state.totals.charged += stats[name] - before;
        if (before < 100 && stats[name] >= 100 && (name === 'phone' || name === 'flashlight')) events.push({ type: 'full', stat: name });
      }
      if (before > 0 && stats[name] <= 0) this.ranOut(name, events);
    }
    for (const name of Object.keys(rates)) this.warnings(name, events);
    if ((stats.health <= 0 || stats.energy <= 0) && doing.activity !== 'sleeping') events.push({ type: 'collapse', why: stats.health <= 0 ? 'health' : 'energy' });
  }

  ranOut(name, events) {
    const accident = this.config.stats[name]?.accident;
    if (!accident) {
      events.push({ type: 'empty', stat: name });
      return;
    }
    this.stats[name] = accident.resetTo;
    this.stats.health = clamp(this.stats.health + accident.health);
    this.state.totals.accidents++;
    events.push({ type: 'accident', stat: name, say: line(accident.say) });
  }

  // Says each level once on the way down, and again only after the stat has come back above it.
  warnings(name, events) {
    const { warned, warnedAt, hours } = this.state, value = this.stats[name], levels = (name === 'health' ? this.config.health : this.config.stats[name]).warn || [];
    let reached = null;
    for (const [level, say] of levels) if (value <= level) reached = { level, say };
    if (!reached) {
      delete warned[name];
      return;
    }
    if (warned[name] !== undefined && warned[name] <= reached.level) {
      if (warned[name] < reached.level) warned[name] = reached.level; // came back up one level, can warn at the lower one again
      return;
    }
    warned[name] = reached.level;
    if (hours - (warnedAt[name] ?? -Infinity) < this.config.warnEveryHours / 8) return;
    warnedAt[name] = hours;
    events.push({ type: 'warn', stat: name, say: line(reached.say) });
  }

  // Applies a list of stat changes from the config, returning the same. A counted thing goes in the totals.
  apply(effect, count) {
    for (const [name, change] of Object.entries(effect)) {
      if (name in this.stats) this.stats[name] = clamp(this.stats[name] + change);
    }
    if (count) this.state.totals[count] = (this.state.totals[count] || 0) + 1;
    this.save();
  }

  // Whether a thing from the bag can be used up. What to say if it was, or null.
  consume(name) {
    const item = this.config.consumables[name];
    if (!item) return null;
    this.apply(item, item.kind);
    return item.say;
  }

  // A sleep in a bed from this hour. How long, by the config.
  sleepHours(hour) {
    const { wakeHour, mostHours, leastHours } = this.config.sleep;
    return Math.max(leastHours, Math.min(mostHours, ((wakeHour - hour) % 24 + 24) % 24));
  }

  sleep(hours) {
    this.state.totals.sleeps++;
    return this.pass(hours, { activity: 'sleeping' });
  }

  // A night with no bed: its own length, for less energy. Returns the hours and what happened.
  sleepRough() {
    const { sleepHours, energyShare } = this.config.rough;
    this.state.totals.sleeps++;
    return { hours: sleepHours, events: this.pass(sleepHours, { activity: 'sleeping', energyShare }) };
  }

  // Going with no toilet: this share of what's needed to feel fine.
  relieveRough() {
    const peed = this.levelOf('bladder') !== 'good', pooped = this.levelOf('bowels') !== 'good';
    for (const name of ['bladder', 'bowels']) this.stats[name] = clamp(this.stats[name] + (100 - this.stats[name]) * this.config.rough.reliefShare);
    this.state.totals.restroom++;
    this.save();
    return peed && pooped ? 'peed and pooped' : pooped ? 'pooped' : 'peed';
  }

  // Which of these a person could do with, by their first warning.
  roughNeeds() {
    return { sleep: this.levelOf('energy') !== 'good', relief: this.levelOf('bladder') !== 'good' || this.levelOf('bowels') !== 'good' };
  }

  // They've dropped: time passes asleep, and they come round at no less than the config says.
  collapse() {
    const { hours, reviveHealth, reviveEnergyAtLeast, say } = this.config.collapse, { stats } = this;
    this.state.totals.collapses++;
    const events = this.pass(hours, { activity: 'sleeping' });
    stats.health = Math.max(stats.health, reviveHealth);
    stats.energy = Math.max(stats.energy, reviveEnergyAtLeast);
    this.save();
    return { hours, say: line(say, { hours }), events };
  }

  canRun() {
    return this.levelOf('energy') !== 'critical';
  }

  // How fast a run is for someone this tired.
  runSpeed(walkSpeed, runSpeed) {
    return this.levelOf('energy') === 'caution' ? walkSpeed + (runSpeed - walkSpeed) * this.config.tiredRunShare : runSpeed;
  }
}

