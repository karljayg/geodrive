// One world's saved data, in one SQLite file. Nothing else knows it's SQLite, so a much larger world could keep its data another way. Never holds anything from
// Google: no addresses, town names or routes. Stage 1 has what people need to meet; shared buildings, cars and drops add tables when they arrive (MIGRATIONS).
import Database from 'better-sqlite3';

const MIGRATIONS = [`
  CREATE TABLE world (id TEXT PRIMARY KEY, mode TEXT NOT NULL, name TEXT NOT NULL, creator TEXT NOT NULL, owner TEXT, backup TEXT, clock_hour REAL NOT NULL, created INTEGER NOT NULL);
  CREATE TABLE members (id TEXT PRIMARY KEY, name TEXT NOT NULL, name_key TEXT NOT NULL UNIQUE, secret_hash TEXT NOT NULL, invite_order INTEGER NOT NULL UNIQUE, lives INTEGER NOT NULL, figure TEXT NOT NULL, colours TEXT NOT NULL, last_seen INTEGER NOT NULL);
  CREATE TABLE invites (code_hash TEXT PRIMARY KEY, made_by TEXT NOT NULL, expires INTEGER NOT NULL, used_by TEXT, rejoin_of TEXT);
  CREATE TABLE players (member TEXT PRIMARY KEY, pocket TEXT, vitals TEXT, trip TEXT, lat REAL, lng REAL);
  CREATE TABLE chat (id INTEGER PRIMARY KEY AUTOINCREMENT, thread TEXT NOT NULL, sender TEXT NOT NULL, text TEXT NOT NULL, at INTEGER NOT NULL);
  CREATE INDEX chat_thread ON chat (thread, id);
`, `
  CREATE TABLE buildings (id TEXT PRIMARY KEY, tile TEXT NOT NULL, plan TEXT NOT NULL, switches_on INTEGER NOT NULL DEFAULT 0);
  CREATE INDEX buildings_tile ON buildings (tile);
  CREATE TABLE floors (building TEXT NOT NULL, floor INTEGER NOT NULL, record TEXT, state TEXT NOT NULL, PRIMARY KEY (building, floor));
  CREATE TABLE drops (id TEXT PRIMARY KEY, data TEXT NOT NULL);
`, `
  CREATE TABLE cars (id TEXT PRIMARY KEY, data TEXT NOT NULL);
`];

const memberFrom = (row) => row && { id: row.id, name: row.name, secretHash: row.secret_hash, order: row.invite_order, lives: row.lives, figure: row.figure, colours: JSON.parse(row.colours), lastSeen: row.last_seen, lat: row.lat ?? null, lng: row.lng ?? null };
const parsed = (text) => (text ? JSON.parse(text) : null);

export class WorldStore {
  constructor(path) {
    this.db = new Database(path);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    const version = this.db.pragma('user_version', { simple: true });
    for (let i = version; i < MIGRATIONS.length; i++) {
      this.db.transaction(() => {
        this.db.exec(MIGRATIONS[i]);
        this.db.pragma(`user_version = ${i + 1}`);
      })();
    }
  }

  // All of fn or none of it.
  transaction(fn) {
    return this.db.transaction(fn)();
  }

  close() {
    this.db.close();
  }

  // --- The world ------------------------------------------------------------------------------------------------

  createWorld({ id, mode, name, creator, hour, now }) {
    this.db.prepare('INSERT INTO world (id, mode, name, creator, owner, backup, clock_hour, created) VALUES (?, ?, ?, ?, ?, NULL, ?, ?)').run(id, mode, name, creator, creator, hour, now);
  }

  world() {
    const row = this.db.prepare('SELECT * FROM world').get();
    return row && { id: row.id, mode: row.mode, name: row.name, creator: row.creator, owner: row.owner, backup: row.backup, clockHour: row.clock_hour, created: row.created };
  }

  setClockHour(hour) {
    this.db.prepare('UPDATE world SET clock_hour = ?').run(hour);
  }

  setManagers(owner, backup) {
    this.db.prepare('UPDATE world SET owner = ?, backup = ?').run(owner, backup);
  }

  // --- Members --------------------------------------------------------------------------------------------------

  addMember({ id, name, nameKey, secretHash, lives, figure, colours, now }) {
    const order = this.db.prepare('SELECT COALESCE(MAX(invite_order), 0) + 1 AS next FROM members').get().next;
    this.db.prepare('INSERT INTO members (id, name, name_key, secret_hash, invite_order, lives, figure, colours, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, name, nameKey, secretHash, order, lives, figure, JSON.stringify(colours), now);
    this.db.prepare('INSERT INTO players (member) VALUES (?)').run(id);
    return order;
  }

  members() {
    return this.db.prepare('SELECT m.*, p.lat, p.lng FROM members m LEFT JOIN players p ON p.member = m.id ORDER BY m.invite_order').all().map(memberFrom);
  }

  member(id) {
    return memberFrom(this.db.prepare('SELECT m.*, p.lat, p.lng FROM members m LEFT JOIN players p ON p.member = m.id WHERE m.id = ?').get(id));
  }

  // True if anyone has ever had this name here, dead or alive.
  nameTaken(nameKey) {
    return !!this.db.prepare('SELECT 1 FROM members WHERE name_key = ?').get(nameKey);
  }

  setSecret(id, secretHash) {
    this.db.prepare('UPDATE members SET secret_hash = ? WHERE id = ?').run(secretHash, id);
  }

  setLives(id, lives) {
    this.db.prepare('UPDATE members SET lives = ? WHERE id = ?').run(lives, id);
  }

  touchMember(id, now) {
    this.db.prepare('UPDATE members SET last_seen = ? WHERE id = ?').run(now, id);
  }

  // --- Invites --------------------------------------------------------------------------------------------------

  addInvite({ codeHash, madeBy, expires, rejoinOf = null }) {
    this.db.prepare('INSERT INTO invites (code_hash, made_by, expires, rejoin_of) VALUES (?, ?, ?, ?)').run(codeHash, madeBy, expires, rejoinOf);
  }

  invite(codeHash) {
    const row = this.db.prepare('SELECT * FROM invites WHERE code_hash = ?').get(codeHash);
    return row && { codeHash: row.code_hash, madeBy: row.made_by, expires: row.expires, usedBy: row.used_by, rejoinOf: row.rejoin_of };
  }

  useInvite(codeHash, usedBy) {
    this.db.prepare('UPDATE invites SET used_by = ? WHERE code_hash = ?').run(usedBy, codeHash);
  }

  // --- What each person has -------------------------------------------------------------------------------------

  player(member) {
    const row = this.db.prepare('SELECT * FROM players WHERE member = ?').get(member);
    return row ? { pocket: parsed(row.pocket), vitals: parsed(row.vitals), trip: parsed(row.trip), lat: row.lat, lng: row.lng } : null;
  }

  // Only what's given changes.
  savePlayer(member, { pocket, vitals, trip, lat, lng }) {
    const db = this.db;
    if (pocket !== undefined) db.prepare('UPDATE players SET pocket = ? WHERE member = ?').run(JSON.stringify(pocket), member);
    if (vitals !== undefined) db.prepare('UPDATE players SET vitals = ? WHERE member = ?').run(JSON.stringify(vitals), member);
    if (trip !== undefined) db.prepare('UPDATE players SET trip = ? WHERE member = ?').run(JSON.stringify(trip), member);
    if (lat !== undefined && lng !== undefined) db.prepare('UPDATE players SET lat = ?, lng = ? WHERE member = ?').run(lat, lng, member);
  }

  // --- Buildings ------------------------------------------------------------------------------------------------

  plan(id) {
    return parsed(this.db.prepare('SELECT plan FROM buildings WHERE id = ?').get(id)?.plan);
  }

  savePlan(id, tile, plan) {
    this.db.prepare('INSERT INTO buildings (id, tile, plan) VALUES (?, ?, ?) ON CONFLICT (id) DO UPDATE SET plan = excluded.plan').run(id, tile, JSON.stringify(plan));
  }

  setSwitchesOn(id) {
    this.db.prepare('UPDATE buildings SET switches_on = 1 WHERE id = ?').run(id);
  }

  floorRow(building, floor) {
    const row = this.db.prepare('SELECT record, state FROM floors WHERE building = ? AND floor = ?').get(building, floor);
    return row ? { record: parsed(row.record), state: parsed(row.state) } : null;
  }

  // Whatever's given changes; a new row needs a state.
  saveFloorRow(building, floor, { record, state }) {
    const known = this.floorRow(building, floor);
    this.db.prepare('INSERT INTO floors (building, floor, record, state) VALUES (?, ?, ?, ?) ON CONFLICT (building, floor) DO UPDATE SET record = excluded.record, state = excluded.state')
      .run(building, floor, JSON.stringify(record ?? known?.record ?? null), JSON.stringify(state ?? known?.state));
  }

  // Everything known about the buildings in these tiles.
  buildingsIn(tiles) {
    const marks = tiles.map(() => '?').join(), rows = this.db.prepare(`SELECT * FROM buildings WHERE tile IN (${marks})`).all(...tiles);
    const floors = this.db.prepare('SELECT floor, record, state FROM floors WHERE building = ?');
    return rows.map((row) => ({ id: row.id, plan: JSON.parse(row.plan), switchesOn: !!row.switches_on, floors: floors.all(row.id).map((f) => ({ floor: f.floor, record: parsed(f.record), state: JSON.parse(f.state) })) }));
  }

  // --- Dropped things -------------------------------------------------------------------------------------------

  drops() {
    return this.db.prepare('SELECT data FROM drops').all().map((row) => JSON.parse(row.data));
  }

  addDrop(drop) {
    return this.db.prepare('INSERT OR IGNORE INTO drops (id, data) VALUES (?, ?)').run(drop.id, JSON.stringify(drop)).changes > 0;
  }

  // True if it was there to take: exactly one person gets it.
  takeDrop(id) {
    return this.db.prepare('DELETE FROM drops WHERE id = ?').run(id).changes > 0;
  }

  // --- Cars: only those someone has touched ----------------------------------------------------------------------

  cars() {
    return this.db.prepare('SELECT data FROM cars').all().map((row) => JSON.parse(row.data));
  }

  car(id) {
    return parsed(this.db.prepare('SELECT data FROM cars WHERE id = ?').get(id)?.data);
  }

  // Each save counts up, so a browser can tell an older word about a car from a newer one when they cross.
  saveCar(car) {
    car.rev = (car.rev ?? 0) + 1;
    this.db.prepare('INSERT INTO cars (id, data) VALUES (?, ?) ON CONFLICT (id) DO UPDATE SET data = excluded.data').run(car.id, JSON.stringify(car));
  }

  // --- Chat -----------------------------------------------------------------------------------------------------

  addChat({ thread, sender, text, at }, kept) {
    const { lastInsertRowid } = this.db.prepare('INSERT INTO chat (thread, sender, text, at) VALUES (?, ?, ?, ?)').run(thread, sender, text, at);
    this.db.prepare('DELETE FROM chat WHERE thread = ? AND id NOT IN (SELECT id FROM chat WHERE thread = ? ORDER BY id DESC LIMIT ?)').run(thread, thread, kept);
    return Number(lastInsertRowid);
  }

  // The group's messages and this person's DMs, oldest first.
  chatFor(member) {
    return this.db.prepare(`SELECT * FROM chat WHERE thread = 'group' OR thread LIKE ? OR thread LIKE ? ORDER BY id`).all(`${member}:%`, `%:${member}`);
  }
}
