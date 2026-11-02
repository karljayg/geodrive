// What the person has on them once out of the car: a phone, a compass, a notepad and a bag, along the bottom of the view.
// The tray and the phone are plain DOM. To add something later, add it to TRAY (and ART), or to APPS for a phone app and its open function.
import { clockText } from './daylight.js';
import { say } from './sayings.js';
import { drawNav } from './dash.js';
import { GAME } from './gameConfig.js';
import { itemIcon } from './itemArt.js';
import { ART } from './pocketArt.js';
import { BAG_SLOTS, CAR_SLOTS, CONTACTS, PocketData, addRecent, bearingToCar, compassName, distanceText, noteTitle, songParts, turnToCar } from './pocketData.js';
import { frequencyText } from './radio.js';
import { SERVICE_RANK } from './vector.js';

const TRAY = [
  { id: 'phone', label: 'Phone', html: 'P<u>h</u>one', key: 'h', art: 'phone' },
  { id: 'compass', label: 'Compass', html: '<u>C</u>ompass', key: 'c', art: 'compass' },
  { id: 'notepad', label: 'Notepad', html: 'Notepad <span class="keyHint">(U)</span>', key: 'u', art: 'notepad' },
  { id: 'bag', label: 'Bag', html: '<u>B</u>ag', key: 'b', art: 'bag' },
  { id: 'flash', label: 'Flashlight', html: 'Flashli<u>g</u>ht', key: 'g', art: 'torch' },
];
const APPS = [
  { id: 'music', label: 'Music', art: 'music' },
  { id: 'compass', label: 'Compass', art: 'compassApp' },
  { id: 'notes', label: 'Notes', art: 'notes' },
  { id: 'call', label: 'Phone', art: 'call' },
  { id: 'messages', label: 'Messages', art: 'messages' },
  { id: 'map', label: 'Map', art: 'map' },
  { id: 'torch', label: 'Flashlight', art: 'torch' },
  { id: 'health', label: 'Health', art: 'health' },
  { id: 'recent', label: 'Recent', art: 'recent' },
];
const at_parked_note = (world) => (world ? '' : '<i class="dot"></i> your car · ');
const REFRESH = 100;       // ms between updates of the live figures
const MAP_REFRESH = 333;   // ms, as for the nav screen
const RING_TIME = 5000;    // ms a call rings before nobody answers
const REPLY_TIME = 2500;   // ms before a text gets its answer
const MAP_RADII = [150, 400, 1000, 3000]; // m from the person to the top of the map
const MAP_REACH = 1.2;    // of that, out to the screen's corners
const SERVICE_NAMES_FROM = 1000; // m of that from which service roads are too faint to see, so a name would float on nothing
const MAP_BUTTONS = [{ fromRight: 22, y: 49, r: 18 }, { fromRight: 22, y: 82, r: 18 }]; // the zoom buttons, which street names stay clear of

let art = 0;
const picture = (name) => ART[name](`pk${art++}`);
const hashHue = (text) => [...text].reduce((sum, c) => (sum * 31 + c.charCodeAt(0)) % 360, 0);
const esc = (text) => String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export class Pocket {
  // radio: the car's radio, which the Music app works. calls: music(on), setRadioVolume(v), radioVolume(), muted(), onOpen(), onTyping().
  constructor(root, radio, calls) {
    Object.assign(this, { root, radio, calls });
    this.data = new PocketData(calls.store);
    this.apps = calls.world ? [{ id: 'people', label: 'People', art: 'people' }, ...APPS] : APPS; // in a shared world, those you're playing with
    this.app = null;       // the open app, or 'home', or null with the phone away
    this.bagOpen = false;
    this.lastUpdate = 0;
    this.mapDrawn = 0;
    this.mapRadius = 1;
    this.musicPaused = false;
    this.recent = [];
    this.recentStation = null;
    this.shown = {};       // what the live figures last said, so nothing is written that hasn't changed
    root.innerHTML = `
      <div class="footKeys">Walk (W A S D) · Run (Shift) · Jump (Space) · View (Q E) · Use (F) · Mute (M) · Radio (N)${calls.world ? '' : ' · Time (T)'}</div>
      <div class="tray"><button class="trayClock" data-tray="clock" title="The time here. Click or press T to move it on an hour."><span class="trayDial"><i class="hour"></i><i class="minute"></i></span><span class="trayLabel" data-tray-clock></span></button>${TRAY.map((item) => `<button class="trayItem" data-tray="${item.id}" title="${item.label} (${item.key.toUpperCase()})"><span class="trayArt">${picture(item.art)}</span><span class="trayLabel">${item.html}</span></button>`).join('')}</div>
      <div class="device" hidden>
        <div class="screen">
          <div class="statusBar"><span data-clock></span><span class="island"></span><button data-close aria-label="Put the phone away" title="Put the phone away (Esc)"><span class="keyHint">Esc</span> ✕</button></div>
          <div class="appArea"></div>
          <button class="homeBar" data-home aria-label="Home screen"></button>
        </div>
      </div>
      <div class="bagPanel" hidden></div>`;
    this.device = root.querySelector('.device');
    this.area = root.querySelector('.appArea');
    this.bagPanel = root.querySelector('.bagPanel');
    this.card = root.querySelector('[data-tray="compass"] [data-card]');
    this.flashTray = root.querySelector('[data-tray="flash"]');
    root.addEventListener('click', (e) => this.onClick(e));
    root.addEventListener('focusin', (e) => { if (e.target.matches('textarea, input[type=text]')) calls.onTyping(); });
    // Keys and pointers on the phone don't reach the game underneath.
    for (const kind of ['pointerdown', 'wheel']) root.addEventListener(kind, (e) => e.stopPropagation());
  }

  // A new walk: Music will start by itself when first opened.
  start() {
    this.musicPaused = false;
    this.recent = [];
    this.recentStation = null;
  }

  // --- Opening and closing --------------------------------------------------------------------------------------

  openApp(id) {
    if (this.calls.phoneDead()) return this.calls.say('phoneDead');
    if (id === 'torch') return this.calls.phoneLight(); // it does its one job, rather than opening
    this.calls.sound('tap');
    if (this.app === 'notes' && this.note) this.data.closeNote(this.note);
    this.note = null;
    this.bagOpen = false;
    this.app = id;
    this.shown = {};
    this.device.hidden = false;
    this.bagPanel.hidden = true;
    this.calls.onOpen();
    if (id === 'music' && !this.radio.on && !this.musicPaused) this.calls.music(true);
    this.render();
  }

  closePhone() {
    if (this.app === 'notes' && this.note) this.data.closeNote(this.note);
    this.note = null;
    this.endCall();
    this.app = null;
    this.device.hidden = true;
    this.area.innerHTML = '';
  }

  toggleBag() {
    this.bagOpen = !this.bagOpen;
    this.calls.sound('zip');
    if (this.bagOpen) {
      this.closePhone();
      this.renderBag();
      this.calls.onOpen();
    }
    this.bagPanel.hidden = !this.bagOpen;
  }

  // Everything away, for getting back in the car. True if anything was open.
  close() {
    const was = !!this.app || this.bagOpen;
    this.root.classList.remove('storageOnly');
    this.closePhone();
    this.bagOpen = false;
    this.bagPanel.hidden = true;
    return was;
  }

  press(id) {
    if (id === 'phone' && this.app) this.calls.sound('tap');
    if (id === 'phone') return this.app ? this.closePhone() : this.openApp('home');
    if (id === 'bag') return this.toggleBag();
    if (id === 'flash') return this.calls.flashlight();
    if (id === 'clock') return this.calls.addHour();
    const app = id === 'notepad' ? 'notes' : id;
    return this.app === app ? this.closePhone() : this.openApp(app);
  }

  // A number with the bag open: the thing in that slot. The flashlight turns on and the bag closes, so B then a number is all it takes while walking.
  pressBagNumber(key) {
    const item = this.data.bag[key === '0' ? 9 : Number(key) - 1];
    if (!item) return;
    if (item.id === 'Flashlight' && this.calls.onFoot()) {
      this.calls.flashlight();
      this.close();
    } else if (item.id === GAME.hammer.item && this.calls.onFoot() && this.calls.swingHammer()) this.close();
    else if (!this.useItem(item.id)) this.pressSlot(item.id, 'bag');
  }

  pressSlot(id, side) {
    if (!this.calls.nearCar()) {
      if (id === 'Flashlight') this.calls.flashlight();
      else if (id === GAME.hammer.item) {
        if (this.calls.swingHammer()) return this.close();
        this.calls.sound('ack');
        this.bagPanel.querySelector('.empty').textContent = say('hammerNoWall');
      } else if (!this.useItem(id)) {
        this.calls.sound('ack');
        this.bagPanel.querySelector('.empty').textContent = say('noUse', { name: id.toLowerCase() });
      }
      return;
    }
    const moved = this.data.move(id, side === 'bag');
    this.calls.sound(moved ? 'rustle' : 'ack');
    if (moved && id === 'Flashlight' && side === 'bag') this.calls.stowed();
    if (!moved) this.bagPanel.querySelector('.empty').textContent = say(side === 'bag' ? 'carFull' : 'bagFull');
    else this.renderBag();
  }

  // Leaves one behind, with a chance to change your mind until the bag next changes or closes.
  dropItem(id, side) {
    const item = (side === 'car' ? this.data.car : this.data.bag).find((i) => i.id === id);
    if (!item || !this.data.drop(id, side === 'car')) return;
    this.calls.sound('drop');
    this.dropped = { id: item.id, name: item.name, side, world: this.calls.dropped(item.name) };
    if (id === 'Flashlight' && !this.data.bagHas(id)) this.calls.stowed();
    this.renderBag();
    this.bagPanel.querySelector('.empty').innerHTML = `You dropped the ${esc(item.name.toLowerCase())}. It's where you left it. <button class="undoDrop" data-undo-drop>Undo <span class="keyHint">(Z)</span></button>`;
  }

  undoDrop() {
    if (this.dropped) {
      this.data.putBack(this.dropped, this.dropped.side === 'car');
      this.calls.undropped(this.dropped.world);
    }
    this.dropped = null;
    this.renderBag();
  }

  // Shift and a number, with the bag open.
  dropNumber(key) {
    const item = this.data.bag[(Number(key) + 9) % 10];
    if (item) this.dropItem(item.id, 'bag');
  }

  // Eats, drinks or takes one of it, if it's that sort of thing.
  useItem(id) {
    if (!this.calls.useItem(id)) return false;
    this.data.takeFromBag(id);
    this.renderBag();
    return true;
  }

  // Something found, for the bag. False if the bag is full.
  collect(name) {
    const added = this.data.addToBag({ id: name, name });
    if (added && this.bagOpen) this.renderBag();
    return added;
  }

  bagText() {
    return `${this.data.bag.length} of ${BAG_SLOTS}`;
  }

  // A hotkey. True if it was one of these. 1 to 9 open the phone's apps, and 0 goes back to its home screen.
  pressKey(key) {
    if (this.bagOpen && /^[0-9]$/.test(key)) {
      this.pressBagNumber(key);
      return true;
    }
    if (key === 'z') {
      if (!this.bagOpen || !this.dropped) return false;
      this.undoDrop();
      return true;
    }
    if (this.app === 'call' && this.pressDialKey(key)) return true;
    if (this.app === 'notes' && this.pressNotesKey(key)) return true;
    if (this.app === 'messages' && this.pressMessagesKey(key)) return true;
    if (this.app === 'health' && key === 'x') {
      this.startOver();
      return true;
    }
    if (this.app === 'music' && (key === ',' || key === '.')) {
      const volume = Math.max(0, Math.min(1, this.calls.radioVolume() + (key === ',' ? -0.05 : 0.05)));
      this.calls.setRadioVolume(volume);
      this.area.querySelector('[data-volume]').value = volume;
      return true;
    }
    if (this.app === 'map' && (key === '-' || key === '=' || key === '+')) {
      this.zoomMap(key === '-' ? 1 : -1);
      return true;
    }
    if (key === 'n') {
      this.toggleMusic();
      return true;
    }
    if (key === '0') {
      this.openApp('home');
      return true;
    }
    const app = this.apps[Number(key) - 1];
    if (app && /^[1-9]$/.test(key)) {
      this.openApp(app.id);
      return true;
    }
    const item = TRAY.find((t) => t.key === key);
    if (item) this.press(item.id);
    return !!item;
  }

  // In Notes, numbers open the list's notes, and 0 and Delete work on an open one (Esc first if the cursor is in it). True if it used the key.
  pressNotesKey(key) {
    if (this.note) {
      if (key === '0') this.openApp('notes');
      else if (key === 'delete') this.deleteNote();
      else return false;
      return true;
    }
    if (key === 'n') {
      this.calls.sound('paper');
      this.openNote(this.data.addNote().id);
      return true;
    }
    const note = /^[1-9]$/.test(key) && this.data.notes[Number(key) - 1];
    if (!note) return /^[1-9]$/.test(key);
    this.openNote(note.id);
    return true;
  }

  async deleteNote() {
    const id = this.note;
    if (!await this.calls.confirm('Delete this note?', 'It can\'t be brought back.', 'Delete')) return;
    this.note = null;
    this.data.deleteNote(id);
    this.openApp('notes');
  }

  // In Messages, numbers pick a contact, and 0 goes back to the list from a conversation. True if it used the key.
  pressMessagesKey(key) {
    if (this.contact) {
      if (key !== '0') return false;
      this.contact = null;
      this.render();
      return true;
    }
    if (!/^[1-9]$/.test(key)) return false;
    const thread = this.threadIds()[Number(key) - 1];
    if (thread) this.openThread(thread);
    return true;
  }

  // In the Phone app, the keyboard is its dial pad. True if it used the key.
  pressDialKey(key) {
    if (this.calling) {
      if (key !== 'enter') return false;
      this.endCall();
      this.renderCall();
      return true;
    }
    if (/^[0-9*#]$/.test(key)) this.dial(key);
    else if (key === 'backspace') { this.dialled = (this.dialled || '').slice(0, -1); this.renderCall(); }
    else if (key === 'enter') this.startCall(this.dialled);
    else return false;
    return true;
  }

  zoomMap(change) {
    this.mapRadius = Math.max(0, Math.min(MAP_RADII.length - 1, this.mapRadius + change));
    this.mapDrawn = 0;
  }

  async startOver() {
    if (!await this.calls.confirm('Start over?', 'Every need goes back to its start, and the record of what you\'ve eaten, slept and walked is cleared.', 'Start over')) return;
    this.calls.vitals().vitals.reset();
    if (this.app === 'health') this.renderHealth();
  }

  // --- Clicks ---------------------------------------------------------------------------------------------------

  onClick(e) {
    const button = e.target.closest('button, [data-open-note], [data-thread], [data-dial-contact]');
    if (!button) return;
    if (button.dataset.drop) return this.dropItem(button.dataset.drop, button.dataset.side);
    if ('undoDrop' in button.dataset) return this.undoDrop();
    if (button.dataset.slot) return this.pressSlot(button.dataset.slot, button.dataset.side);
    if ('healthReset' in button.dataset) return this.startOver();
    const { tray, app, thread, digit, dialContact, radius } = button.dataset;
    if (tray) this.press(tray);
    else if ('close' in button.dataset) this.closePhone();
    else if ('home' in button.dataset) this.openApp('home');
    else if ('closeBag' in button.dataset) { this.root.classList.remove('storageOnly'); this.toggleBag(); }
    else if (app) this.openApp(app);
    else if ('toggleMusic' in button.dataset) this.toggleMusic();
    else if ('prev' in button.dataset) this.radio.seek(-1);
    else if ('next' in button.dataset) this.radio.seek(1);
    else if ('newNote' in button.dataset) { this.calls.sound('paper'); this.openNote(this.data.addNote().id); }
    else if ('openNote' in button.dataset) this.openNote(button.dataset.openNote);
    else if ('notesBack' in button.dataset) this.openApp('notes');
    else if ('deleteNote' in button.dataset) this.deleteNote();
    else if (thread) this.openThread(thread);
    else if (button.dataset.rejoin) this.calls.world.rejoinLink(button.dataset.rejoin);
    else if (button.dataset.backup) this.calls.world.makeBackup(button.dataset.backup).then(() => this.renderPeople());
    else if ('threadsBack' in button.dataset) { this.contact = null; this.render(); }
    else if ('send' in button.dataset) this.sendText();
    else if (digit) this.dial(digit);
    else if ('dialClear' in button.dataset) { this.dialled = (this.dialled || '').slice(0, -1); this.renderCall(); }
    else if ('dialGo' in button.dataset) this.startCall(this.dialled);
    else if (dialContact) this.startCall(dialContact);
    else if ('hangUp' in button.dataset) { this.endCall(); this.renderCall(); }
    else if (radius) this.zoomMap(Number(radius));
    if (button.tagName === 'BUTTON' && document.contains(button)) button.blur(); // or Space and Enter would press it again
  }

  // --- Drawing the apps -----------------------------------------------------------------------------------------

  render() {
    const { app } = this;
    if (app === 'home') this.renderHome();
    else if (app === 'music') this.renderMusic();
    else if (app === 'compass') this.renderCompass();
    else if (app === 'notes') this.renderNotes();
    else if (app === 'call') this.renderCall();
    else if (app === 'messages') this.renderMessages();
    else if (app === 'people') this.renderPeople();
    else if (app === 'map') this.renderMap();
    else if (app === 'health') this.renderHealth();
    else if (app === 'recent') this.renderRecent();
  }

  title(text, extra = '', zeroGoesHome = true) {
    return `<button class="appBack homeLink" data-home>‹ Home${zeroGoesHome ? ' <kbd>0</kbd>' : ''}</button><div class="appTitle"><h2>${esc(text)}</h2>${extra}</div>`;
  }

  // Room for two more rows of apps, for what comes later.
  // Each need, how fast it's going and how long is left, and what's happened so far. Numbers are all from the vitals, for fine-tuning as much as for playing.
  renderHealth() {
    const { vitals, rates, rows } = this.calls.vitals(), { config, stats, state } = vitals, t = state.totals;
    const span = (hours) => (hours === null ? '—' : hours >= 48 ? `${Math.round(hours / 24)} days` : `${hours.toFixed(1)} h`);
    const row = (name) => {
      const { label, tip } = name === 'health' ? config.health : config.stats[name], rate = rates[name];
      return `<tr class="${vitals.levelOf(name)}" title="${vitals.levelOf(name) === 'good' ? '' : esc(tip)}"><th>${label}</th><td>${Math.round(stats[name])}%</td><td>${rate > 0 ? '+' : ''}${rate.toFixed(1)}/h</td><td>${span(vitals.hoursLeft(name, rates))}</td></tr>`;
    };
    this.area.innerHTML = `${this.title('Health')}<table class="healthTable"><tr><td></td><td>Now</td><td>Rate</td><td>Left</td></tr>${rows.map(row).join('')}</table>
      <p class="healthTotals">Day ${Math.floor(state.hours / 24) + 1}. Eaten ${t.food}, drinks ${t.drink}, restroom ${t.restroom}, accidents ${t.accidents}, slept ${t.sleeps} times, collapsed ${t.collapses}.</p>
      <button class="healthReset" data-health-reset>Start over <span class="keyHint">(X)</span></button>`;
  }

  // What the game has said, newest first, as a message on screen goes after a few seconds.
  renderRecent() {
    const said = this.calls.recentSaid();
    this.recentShown = said[0];
    this.area.innerHTML = `${this.title('Recent')}<div class="list">${said.length
      ? said.map(({ at, text }) => `<div class="row said"><small>${esc(at)}</small><b>${esc(text)}</b></div>`).join('')
      : '<p class="empty">Nothing yet. Messages stay here after they leave the screen.</p>'}</div>`;
  }

  renderHome() {
    this.area.innerHTML = `<div class="homeGrid">${this.apps.map((a, i) => `<button class="appIcon" data-app="${a.id}" title="${a.label} (${i + 1})">${picture(a.art)}${i < 9 ? `<kbd>${i + 1}</kbd>` : ''}<span>${a.label}</span></button>`).join('')}</div>
      <p class="homeHelp">Click an app, or press its number.<br>Press <kbd>0</kbd> to come back here.</p>`;
  }

  // A music player, though what it plays is live FM radio, which saves making playlists. It works the car's player, and the car gets its own station back (main.js).
  renderMusic() {
    this.area.innerHTML = `${this.title('Music')}<div class="musicApp">
      <div class="albumArt" data-art>${picture('music')}</div>
      <div class="trackName" data-song></div>
      <div class="trackArtist" data-artist></div>
      <div class="trackStation"><i>LIVE</i><span data-station></span></div>
      <div class="transport">
        <button data-prev title="Previous station ( [ )" aria-label="Previous station">${ART.prev()}</button>
        <button class="play" data-toggle-music title="Play or pause (N)" aria-label="Play or pause"></button>
        <button data-next title="Next station ( ] )" aria-label="Next station">${ART.next()}</button>
      </div>
      <label class="volume">Volume <span class="keyHint">(, .)</span> <input type="range" min="0" max="1" step="0.05" data-volume></label>
      <p class="small" data-music-note></p>
      <div class="recent" data-recent></div></div>`;
    const volume = this.area.querySelector('[data-volume]');
    volume.value = this.calls.radioVolume();
    volume.addEventListener('input', () => this.calls.setRadioVolume(Number(volume.value)));
  }

  // Pausing a live stream just stops it, and play catches up with what's on now.
  toggleMusic() {
    this.musicPaused = this.radio.on;
    this.calls.music(!this.radio.on);
  }

  // Those in this world, as a phone's Find My lists them. Managers also get what only they can do.
  renderPeople() {
    const { world } = this.calls, rows = world.peopleRows();
    this.peopleShown = rows.map((row) => row.line).join();
    this.area.innerHTML = `${this.title('People')}<div class="list people">${rows.map((row) => `<div class="person"><span class="badge" style="background:${esc(row.colour)}">${esc(row.initials)}</span><div class="personText"><b>${esc(row.name)}${row.role ? ` <small>${esc(row.role)}</small>` : ''}</b><small data-person-line="${esc(row.id)}">${esc(row.line)}</small></div>${row.canRejoin ? `<button class="quiet" data-rejoin="${esc(row.id)}" title="For someone who has lost their browser">Rejoin link</button>` : ''}${row.canBackup ? `<button class="quiet" data-backup="${esc(row.id)}">Make backup</button>` : ''}</div>`).join('') || '<p class="empty">Nobody else yet. Press J for an invite link.</p>'}</div><p class="small">${esc(world.managerLine())}</p>`;
  }

  renderCompass() {
    this.area.innerHTML = `${this.title('Compass')}<div class="compassApp">
      <div class="bigDial">${picture('compass')}<div class="carMark" data-car-mark><span>${ART.car()}</span></div>${(this.calls.world?.peopleRows() ?? []).filter((row) => row.at).map((row) => `<div class="carMark personMark" data-person-mark="${esc(row.id)}"><span class="badge" style="background:${esc(row.colour)}">${esc(row.initials)}</span></div>`).join('')}</div>
      <div class="heading" data-heading></div>
      <div class="carLine" data-car-line></div>
      <p class="small">The red needle points north, and the white mark at the top is the way you face. ${this.calls.world ? 'The badges on the rim are the others: turn until one is at the top and walk.' : 'The car on the rim is where you parked: turn until it\'s at the top and walk.'}</p></div>`;
  }

  renderNotes() {
    const { notes } = this.data;
    this.area.innerHTML = `${this.title('Notes', '<button class="appAction" data-new-note>+ <u>N</u>ew</button>')}<div class="list">${notes.length
      ? notes.map((n, i) => `<button class="row" data-open-note="${esc(n.id)}"><b>${i < 9 ? `<kbd>${i + 1}</kbd> ` : ''}${esc(noteTitle(n))}</b><small>${esc(new Date(n.at).toLocaleDateString())}</small></button>`).join('')
      : '<p class="empty">No notes yet. Press + New to write one.</p>'}</div>`;
  }

  openNote(id) {
    const note = this.data.notes.find((n) => n.id === id);
    if (!note) return;
    this.note = id;
    this.area.innerHTML = `<div class="appTitle"><button class="appBack homeLink" data-notes-back>‹ Notes <kbd>0</kbd></button><button class="appAction danger" data-delete-note>Delete <span class="keyHint">(Del)</span></button></div><textarea class="noteText" placeholder="Write anything here. Esc to stop typing." aria-label="Note"></textarea>`;
    const box = this.area.querySelector('textarea');
    box.value = note.text;
    box.addEventListener('input', () => this.data.setNote(id, box.value));
    box.focus();
  }

  // Real people first, the group at the top, then the made-up ones.
  threadIds() {
    return [...(this.calls.world?.threads() ?? []).map((thread) => thread.id), ...CONTACTS.map((c) => c.id)];
  }

  renderMessages() {
    if (this.contact) return this.openThread(this.contact);
    const key = (i) => (i < 9 ? `<kbd>${i + 1}</kbd> ` : '');
    const real = this.calls.world?.threads() ?? [];
    this.area.innerHTML = `${this.title('Messages')}<div class="list">${real.map((thread, i) => `<button class="row" data-thread="${esc(thread.id)}"><b>${key(i)}${esc(thread.title)}</b><small>${thread.last ? esc(thread.last.slice(0, 34)) : 'No messages yet'}</small></button>`).join('')}${CONTACTS.map((c, n) => {
      const last = this.data.thread(c.id).at(-1);
      return `<button class="row" data-thread="${c.id}"><b>${key(real.length + n)}${esc(c.name)}</b><small>${last ? esc(last.text.slice(0, 34)) : 'No messages yet'}</small></button>`;
    }).join('')}</div>`;
  }

  // A thread with real people, kept on the server. Whatever is being typed stays when a new message comes in.
  openRealThread(thread) {
    const box = this.area.querySelector('.sendBox input'), typed = this.contact === thread.id ? box?.value ?? '' : '', focused = !!box && document.activeElement === box;
    this.contact = thread.id;
    const lines = this.calls.world.messages(thread.id);
    this.area.innerHTML = `<div class="appTitle"><button class="appBack homeLink" data-threads-back>‹ Messages <kbd>0</kbd></button><h2>${esc(thread.title)}</h2></div>
      <div class="bubbles">${lines.map((m) => `<div class="bubble ${m.mine ? 'mine' : ''}">${m.from ? `<small>${esc(m.from)}</small>` : ''}${esc(m.text)}</div>`).join('') || '<p class="empty">Say something.</p>'}</div>
      <form class="sendBox"><input type="text" placeholder="Text message" aria-label="Text message" maxlength="${GAME.world.chatLength}"><button data-send aria-label="Send">↑</button></form>`;
    const list = this.area.querySelector('.bubbles'), input = this.area.querySelector('.sendBox input');
    list.scrollTop = list.scrollHeight;
    input.value = typed;
    if (focused) input.focus();
    this.area.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); this.sendText(); });
  }

  // A new message, if it belongs on what's showing.
  chatChanged() {
    if (this.app !== 'messages') return;
    const open = this.calls.world?.threads().find((thread) => thread.id === this.contact);
    if (open) this.openRealThread(open);
    else if (!this.contact) this.renderMessages();
  }

  openThread(id) {
    const real = this.calls.world?.threads().find((thread) => thread.id === id);
    if (real) return this.openRealThread(real);
    const contact = CONTACTS.find((c) => c.id === id);
    this.contact = id;
    this.area.innerHTML = `<div class="appTitle"><button class="appBack homeLink" data-threads-back>‹ Messages <kbd>0</kbd></button><h2>${esc(contact.name)}</h2></div>
      <div class="bubbles">${this.data.thread(id).map((m) => `<div class="bubble ${m.mine ? 'mine' : ''}">${esc(m.text)}</div>`).join('') || '<p class="empty">Say something.</p>'}</div>
      <form class="sendBox"><input type="text" placeholder="Text message" aria-label="Text message" maxlength="400"><button data-send aria-label="Send">↑</button></form>`;
    const list = this.area.querySelector('.bubbles');
    list.scrollTop = list.scrollHeight;
    this.area.querySelector('form').addEventListener('submit', (e) => { e.preventDefault(); this.sendText(); });
  }

  sendText() {
    const box = this.area.querySelector('.sendBox input');
    const text = box?.value.trim(), id = this.contact;
    if (!text) return;
    if (this.calls.world?.threads().some((thread) => thread.id === id)) {
      box.value = '';
      this.calls.world.send(id, text).then((why) => { if (why) box.value = text; });
      return;
    }
    this.data.addMessage(id, text, true);
    this.openThread(id);
    this.area.querySelector('.sendBox input').focus();
    clearTimeout(this.replyTimer);
    this.replyTimer = setTimeout(() => {
      this.data.addMessage(id, this.data.replyFrom(id), false);
      if (this.app === 'messages') this.renderMessages();
    }, REPLY_TIME);
  }

  dial(digit) {
    this.dialled = `${this.dialled || ''}${digit}`.slice(0, 14);
    this.renderCall();
  }

  startCall(number) {
    if (!number) return;
    const contact = CONTACTS.find((c) => c.number === number);
    this.calling = { name: contact?.name || number, state: 'Calling…' };
    clearTimeout(this.callTimer);
    this.callTimer = setTimeout(() => {
      if (!this.calling) return;
      this.calling.state = 'No answer';
      if (this.app === 'call') this.renderCall();
    }, RING_TIME);
    this.renderCall();
  }

  endCall() {
    clearTimeout(this.callTimer);
    this.calling = null;
  }

  renderCall() {
    if (this.calling) {
      this.area.innerHTML = `<div class="callScreen"><div class="caller">${esc(this.calling.name)}</div><div class="callState">${esc(this.calling.state)}</div><button class="hangUp" data-hang-up aria-label="Hang up">${picture('call')}</button><span>Hang up <span class="keyHint">(Enter)</span></span></div>`;
      return;
    }
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
    this.area.innerHTML = `${this.title('Phone', '', false)}<div class="dialled">${esc(this.dialled || '') || '&nbsp;'}</div>
      <div class="dialPad">${keys.map((k) => `<button data-digit="${k}">${k}</button>`).join('')}</div>
      <p class="small">Type to dial · Enter calls · Backspace deletes</p><div class="dialActions"><button class="dialGo" data-dial-go aria-label="Call" title="Call (Enter)">${picture('call')}</button><button class="dialClear" data-dial-clear title="Delete a digit (Backspace)" aria-label="Delete a digit">⌫</button></div>
      <div class="list short">${CONTACTS.map((c) => `<button class="row" data-dial-contact="${c.number}"><b>${esc(c.name)}</b><small>${c.number}</small></button>`).join('')}</div>`;
  }

  renderMap() {
    this.area.innerHTML = `${this.title('Map')}<div class="mapApp"><canvas data-map></canvas>
      <div class="mapZoom"><button data-radius="1" aria-label="Zoom out" title="Zoom out (-)">−</button><button data-radius="-1" aria-label="Zoom in" title="Zoom in (=)">+</button></div></div>
      <div class="carLine" data-car-line></div>
      <p class="small">${at_parked_note(this.calls.world)}▲ you · zoom (- =)</p>`;
    this.mapDrawn = 0;
  }

  // Your bag, and the car's storage beside it when you're in or next to the car. Clicking something moves it across; the flashlight, away from the car, turns on.
  renderBag() {
    const { bag, car } = this.data, near = this.calls.nearCar(), slots = (list, size, side) => Array.from({ length: size }, (_, i) => list[i]).map((item, i) => (item
      ? `<div class="slotBox"><button class="bagSlot full" data-slot="${esc(item.id)}" data-side="${side}" title="${esc(item.name)}">${side === 'bag' && i < 10 ? `<kbd>${(i + 1) % 10}</kbd>` : ''}<i class="itemIcon">${itemIcon(item.id)}</i><span>${esc(item.name)}</span>${item.count > 1 ? `<b>${item.count}</b>` : ''}</button><button class="slotDrop" data-drop="${esc(item.id)}" data-side="${side}" title="Drop ${esc(item.name)}" aria-label="Drop ${esc(item.name)}">✕</button></div>`
      : '<div class="bagSlot"></div>')).join('');
    this.nearShown = near;
    this.bagPanel.classList.toggle('withCar', near);
    this.bagPanel.innerHTML = `<div class="bagHead"><span class="bagArt">${picture('bag')}</span><h2>Bag</h2><small>${bag.length} of ${BAG_SLOTS}</small><button data-close-bag aria-label="Close" title="Close (Esc)"><span class="keyHint">Esc</span> ✕</button></div>
      <div class="bagGrid">${slots(bag, BAG_SLOTS, 'bag')}</div>
      <p class="empty">${near ? 'Click something, or press its number, to move it between your bag and the car.' : 'Stand next to the car to reach its storage.'}${this.data.bagHas('Flashlight') ? ` Press ${(this.data.bag.findIndex((i) => i.id === 'Flashlight') + 1) % 10} or G to turn on the flashlight.` : ''} A number eats, drinks or uses what's in that slot, and Shift and a number drops it.</p>
      ${near ? `<div class="bagHead carHead"><h2>Car storage</h2><small>${car.length} of ${CAR_SLOTS}</small></div><div class="bagGrid carGrid">${slots(car, CAR_SLOTS, 'car')}</div>` : ''}`;
  }

  // From the dash in the car, or R.
  openStorage() {
    this.root.classList.add('storageOnly');
    if (!this.bagOpen) this.toggleBag();
  }

  // --- Live figures ---------------------------------------------------------------------------------------------

  write(key, element, text) {
    if (this.shown[key] === text || !element) return;
    this.shown[key] = text;
    element.textContent = text;
  }

  turnCard(card, facing) {
    if (card) card.setAttribute('transform', `rotate(${(-facing).toFixed(1)} 50 50)`);
  }

  // on: { x, y, facing, where } of the person. at: { roads, tiles, parked, hour } for the map.
  update(now, on, at) {
    if (now - this.lastUpdate < REFRESH) return;
    this.lastUpdate = now;
    this.flashTray.classList.toggle('on', this.calls.flashlightOn());
    const facing = Math.round(on.facing);
    if (this.shown.tray !== facing) {
      this.shown.tray = facing;
      this.turnCard(this.card, facing);
    }
    if (this.bagOpen && this.calls.nearCar() !== this.nearShown) this.renderBag();
    const time = clockText(at.hour);
    if (this.shown.trayClock !== time) {
      this.write('trayClock', this.root.querySelector('[data-tray-clock]'), time);
      this.root.querySelector('.trayDial .hour').style.transform = `rotate(${(at.hour % 12) * 30}deg)`;
      this.root.querySelector('.trayDial .minute').style.transform = `rotate(${(at.hour % 1) * 360}deg)`;
    }
    if (this.app === 'recent' && this.calls.recentSaid()[0] !== this.recentShown) this.renderRecent();
    if (this.app === 'health' && now - (this.healthDrawn || 0) > 1000) {
      this.healthDrawn = now;
      this.renderHealth();
    }
    if (this.app) this.write('clock', this.root.querySelector('[data-clock]'), clockText(at.hour));
    const metres = Math.hypot(on.x, on.y), bearing = bearingToCar(on.x, on.y);
    const carLine = !at.parked ? '' : metres < 3 ? 'Your car is right here' : `Car ${distanceText(metres)} ${compassName(bearing)}`;
    if (this.app === 'compass') {
      this.turnCard(this.area.querySelector('[data-card]'), facing);
      const mark = this.area.querySelector('[data-car-mark]');
      if (mark) mark.style.display = at.parked ? '' : 'none';
      if (mark && at.parked) {
        const turn = turnToCar(on.x, on.y, facing).toFixed(1);
        mark.style.transform = `rotate(${turn}deg)`;
        mark.firstElementChild.style.transform = `rotate(${-turn}deg)`; // the car stays upright as it goes round
      }
      this.write('heading', this.area.querySelector('[data-heading]'), `${String(facing % 360).padStart(3, '0')}° ${compassName(facing)}`);
      this.write('carLine', this.area.querySelector('[data-car-line]'), carLine);
      for (const row of this.calls.world?.peopleRows() ?? []) {
        const badge = this.area.querySelector(`[data-person-mark="${CSS.escape(row.id)}"]`);
        if (!badge || !row.at) continue;
        const turn = ((row.bearing - facing + 540) % 360 - 180).toFixed(1);
        badge.style.transform = `rotate(${turn}deg)`;
        badge.firstElementChild.style.transform = `rotate(${-turn}deg)`;
      }
    }
    if (this.app === 'people') {
      for (const row of this.calls.world.peopleRows()) this.write(`person${row.id}`, this.area.querySelector(`[data-person-line="${CSS.escape(row.id)}"]`), row.line);
    }
    const stationId = this.radio.current?.id;
    if (stationId !== this.recentStation) {
      this.recentStation = stationId;
      this.recent = [];
    }
    if (this.radio.on) this.recent = addRecent(this.recent, this.radio.song);
    if (this.app === 'music') this.updateMusic();
    if (this.app === 'map') {
      this.write('carLine', this.area.querySelector('[data-car-line]'), carLine);
      if (now - this.mapDrawn >= MAP_REFRESH) {
        this.mapDrawn = now;
        const canvas = this.area.querySelector('[data-map]');
        if (canvas) {
          const radius = MAP_RADII[this.mapRadius];
          const lines = at.tiles.streetNames(on.where.lat, on.where.lng, radius * MAP_REACH);
          drawNav(canvas, { roads: at.roads, pos: on.where, heading: on.facing, parked: at.parked, route: null, routeIndex: 0, radius, hour: at.hour, clock: clockText(at.hour), badges: this.calls.world?.badges(), streets: { lines: radius < SERVICE_NAMES_FROM ? lines : lines.filter((line) => line.rank < SERVICE_RANK), avoid: MAP_BUTTONS } });
        }
      }
    }
  }

  updateMusic() {
    const { radio, area } = this, station = radio.current, { title, artist } = songParts(radio.song);
    const name = station?.name || '', playing = radio.on;
    // A station that sends no song titles shows its own name, and anything but Playing says what's happening.
    this.write('song', area.querySelector('[data-song]'), !playing ? 'Paused' : title || name || radio.status);
    this.write('artist', area.querySelector('[data-artist]'), !playing ? 'Press play' : artist || (radio.status === 'Playing' ? (title ? '' : 'Live radio') : radio.status));
    this.write('station', area.querySelector('[data-station]'), station ? `${frequencyText(station)} · ${name}` : 'Finding stations…');
    this.write('note', area.querySelector('[data-music-note]'), this.calls.muted() ? 'All sound is muted. Press M to turn it back on.' : '[ and ] change station · N plays and pauses');
    const button = area.querySelector('[data-toggle-music]');
    if (button && this.shown.play !== playing) {
      this.shown.play = playing;
      button.innerHTML = playing ? ART.pause() : ART.play();
    }
    const art = area.querySelector('[data-art]');
    if (art && this.shown.art !== station?.id) {
      this.shown.art = station?.id;
      art.style.filter = `hue-rotate(${hashHue(station?.id || '')}deg)`; // a cover of its own for each station
    }
    const earlier = this.recent.filter((song) => song !== radio.song), text = earlier.join('|');
    if (this.shown.recent !== text) {
      this.shown.recent = text;
      area.querySelector('[data-recent]').innerHTML = earlier.length ? `<h3>Played earlier</h3>${earlier.map((song) => `<div>${esc(song)}</div>`).join('')}` : '';
    }
  }
}

