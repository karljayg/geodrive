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
