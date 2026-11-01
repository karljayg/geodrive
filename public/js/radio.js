// Live radio from the community Radio Browser directory (radio-browser.info), found by where the car is.
// These are internet streams of stations, so a band and frequency come from reading the station's name and tags,
// and stations that don't state one are listed under WEB. Over https only plain https streams can play.
const SERVERS = ['de1.api.radio-browser.info', 'de2.api.radio-browser.info', 'fi1.api.radio-browser.info'];
const NEARBY = 150000;   // m around the car counted as local
const MAX_RETRIES = 6;   // dead streams skipped in a row before giving up
const SONG_EVERY = 30000;  // ms between asking what's playing
const SONG_RETRY = 180000; // ms for a station that sends no titles, or when the server didn't answer
const FM = /(?<![\d.])(8[7-9]|9\d|10[0-7])[.,]\d(?!\d)/;
const AM_NUMBER = /\b(5[3-9]\d|[6-9]\d\d|1[0-6]\d\d)\s*(?:AM|kHz)\b|\bAM\s*(5[3-9]\d|[6-9]\d\d|1[0-6]\d\d)\b/i;
const FM_WORD = /\b[KW][A-Z]{2,3}-?FM\b|(?<![\w.])FM\b/;
const AM_WORD = /\b[KW][A-Z]{2,3}-?AM\b/;

// { band: 'FM' | 'AM' | 'WEB', frequency: number | null } from what a station says about itself.
export function parseBand(station) {
  const text = `${station.name || ''} ${station.tags || ''}`;
  const am = text.match(AM_NUMBER);
  if (am) return { band: 'AM', frequency: Number(am[1] || am[2]) };
  const fm = text.match(FM);
  if (fm && !/\b(?:top|hits|the)\s*\d/i.test(station.name || '')) return { band: 'FM', frequency: Number(fm[0].replace(',', '.')) };
  if (AM_WORD.test(text)) return { band: 'AM', frequency: null };
  if (FM_WORD.test(station.name || '')) return { band: 'FM', frequency: null };
  return { band: 'WEB', frequency: null };
}

// Playable, one per stream, closest first as given, then sorted by frequency within a band.
export function organise(lists) {
  const seen = new Set(), stations = [];
  for (const [rank, list] of lists.entries()) {
    for (const s of list) {
      const url = s.url_resolved || s.url || '';
      const key = (s.name || '').trim().toLowerCase();
      if (!url.startsWith('https://') || seen.has(s.stationuuid) || seen.has(key)) continue;
      seen.add(s.stationuuid);
      seen.add(key);
      stations.push({ id: s.stationuuid, name: (s.name || 'Unnamed').trim(), url, local: rank === 0, ...parseBand(s) });
    }
  }
  return stations;
}

export function inBand(stations, band) {
  return stations.filter((s) => s.band === band).sort((a, b) => (a.frequency ?? 1e6) - (b.frequency ?? 1e6) || b.local - a.local || a.name.localeCompare(b.name));
}

export const frequencyText = (s) => (s.frequency ? `${s.band === 'FM' ? s.frequency.toFixed(1) : s.frequency} ${s.band}` : s.band);

// The song from a stream's metadata, or null for an advert, silence or a station that sends nothing useful.
// Mostly StreamTitle='Artist - Title'; iHeart's is Artist - text="Title" song_spot="M" ... with M for music.
export function songFrom(metadata) {
  let song = /StreamTitle='(.*?)'(?:;|$)/s.exec(metadata || '')?.[1] || '';
  const tagged = /^(.*?)\s*-\s*text="([^"]*)"(.*)$/s.exec(song);
  if (tagged) {
    const spot = /song_spot="(\w*)"/.exec(tagged[3])?.[1];
    if ((spot && spot !== 'M') || /^spot block/i.test(tagged[2])) return null;
    song = `${tagged[1]} - ${tagged[2]}`;
  }
  song = song.replace(/\s+/g, ' ').replace(/^[\s-]+|[\s-]+$/g, '').replace(/&amp;/g, '&');
  return song && !/^https?:/i.test(song) ? song.slice(0, 120) : null;
}

export class Radio {
  // onSong(song) is separate from onChange, which redoes the station list and needn't run for each new song.
  constructor(onChange, onSong = () => {}) {
    this.onChange = onChange;
    this.onSong = onSong;
    this.song = null;
    this.songStation = null; // the station being asked about
    this.songTimer = 0;
    this.audio = new Audio();
    this.audio.preload = 'none';
    this.on = false;
    this.band = 'FM';
    this.stations = [];
    this.current = null;
    this.status = 'Off';
    this.area = '';
    this.retries = 0;
    this.searchedAt = null;
    this.audio.addEventListener('playing', () => {
      this.retries = 0;
      this.say('Playing');
      if (this.songStation !== this.current?.id) this.askSong(this.current?.id);
    });
    this.audio.addEventListener('waiting', () => this.say('Buffering…'));
    this.audio.addEventListener('error', () => { if (this.on && this.current) this.skipDead(); });
  }

  say(status) {
    this.status = status;
    this.onChange();
  }

  stopSong() {
    clearTimeout(this.songTimer);
    this.songStation = null;
    this.setSong(null);
  }

  setSong(song) {
    if (song === this.song) return;
    this.song = song;
    this.onSong(song);
  }

  // Asks the server what's playing, while the station is on and someone can see the answer. A station that
  // sends no titles is asked far less often, in case that was a passing failure.
  async askSong(id) {
    clearTimeout(this.songTimer);
    this.songStation = id;
    if (!id) return;
    let wait = SONG_EVERY;
    if (!document.hidden) {
      try {
        const res = await fetch(`nowplaying.php?id=${encodeURIComponent(id)}`);
        const answer = res.ok ? await res.json() : null;
        if (this.songStation !== id) return; // retuned while waiting
        if (!answer?.supported) wait = SONG_RETRY;
        this.setSong(songFrom(answer?.metadata));
      } catch (err) {
        wait = SONG_RETRY; // no song shown is fine; the radio plays on
        if (this.songStation !== id) return;
      }
    }
    this.songTimer = setTimeout(() => this.askSong(id), wait);
  }

  list() {
    return inBand(this.stations, this.band);
  }

  // Where to land on a band: the lowest station nearby, if there is one.
  firstStation() {
    const list = this.list();
    return list.find((s) => s.local) || list[0];
  }

  async api(path) {
    for (const host of SERVERS) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 9000);
      try {
        const res = await fetch(`https://${host}/json/${path}`, { signal: controller.signal });
        if (res.ok) return await res.json();
      } catch (err) {
        console.warn('radio server:', host, err.message);
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error('no radio server answered');
  }

  // Nearby stations first, then the rest of the state, then the country's most played to fill any gaps.
  async search(lat, lng, state, countryCode) {
    this.searchedAt = { lat, lng };
    this.say('Finding stations…');
    const common = 'hidebroken=true&order=clickcount&reverse=true';
    const jobs = [this.api(`stations/search?geo_lat=${lat}&geo_long=${lng}&geo_distance=${NEARBY}&${common}&limit=150`)];
    if (state) jobs.push(this.api(`stations/search?countrycode=${countryCode || 'US'}&state=${encodeURIComponent(state)}&${common}&limit=200`));
    const results = await Promise.allSettled(jobs);
    const lists = results.map((r) => (r.status === 'fulfilled' ? r.value : []));
    if (results.every((r) => r.status === 'rejected')) {
      if (this.on) this.say('Radio directory unavailable');
      return;
    }
    this.stations = organise(lists);
    this.area = state || 'Nearby';
    if (!this.list().length) this.band = ['FM', 'AM', 'WEB'].find((b) => inBand(this.stations, b).length) || 'FM';
    // The chosen station stays on the list wherever the car goes, until the driver picks another.
    if (this.current && !this.stations.some((s) => s.id === this.current.id)) this.stations.unshift(this.current);
    if (!this.on) return this.onChange();
    if (!this.current || !this.stations.some((s) => s.id === this.current.id)) this.tune(this.firstStation());
    else if (this.audio.paused) this.tune(this.current);
    else this.onChange();
  }

  // Starts from a saved station without playing it yet.
  restore(station) {
    if (!station) return;
    this.current = station;
    this.band = station.band;
    this.stations = [station];
  }

  setPower(on) {
    this.on = on;
    if (on) {
      if (this.current) this.tune(this.current);
      else if (this.stations.length) this.tune(this.firstStation());
      else this.say('Finding stations…');
      return;
    }
    this.stopSong();
    this.audio.pause();
    this.audio.removeAttribute('src');
    this.audio.load();
    this.say('Off');
  }

  // Stops sound without turning the radio off, for the pause screen. Leaves the station and UI as they were.
  hold() {
    if (!this.on) return;
    this.stopSong();
    this.audio.pause();
  }

  // Plays again after hold(), retuning so a live stream catches up rather than buffering silence.
  release() {
    if (!this.on || !this.current) return;
    this.tune(this.current);
  }

  setBand(band) {
    this.band = band;
    const first = this.firstStation();
    if (this.on && first) this.tune(first);
    else {
      if (!first) this.current = this.on ? this.current : null;
      this.onChange();
    }
  }

  seek(step) {
    const list = this.list();
    if (!list.length) return;
    const at = list.findIndex((s) => this.current && s.id === this.current.id);
    const next = list[(at + step + list.length) % list.length];
    if (this.on) this.tune(next);
    else { this.current = next; this.onChange(); }
  }

  tuneId(id) {
    const station = this.stations.find((s) => s.id === id);
    if (station) { if (this.on) this.tune(station); else { this.current = station; this.onChange(); } }
  }

  tune(station) {
    if (!station) return this.say('No stations on this band here');
    this.current = station;
    this.stopSong();
    this.say('Tuning…');
    this.audio.src = station.url;
    this.audio.play().catch((err) => {
      if (err.name !== 'AbortError' && err.name !== 'NotAllowedError') this.skipDead();
      else if (err.name === 'NotAllowedError') this.say('Click the page to start the radio');
    });
    this.api(`url/${station.id}`).catch(() => {}); // the directory ranks stations by these counts
  }

  skipDead() {
    if (++this.retries > MAX_RETRIES) {
      this.retries = 0;
      return this.say('Those stations are not responding');
    }
    this.say('No signal, trying the next…');
    this.seek(1);
  }

  setVolume(volume) {
    this.audio.volume = Math.max(0, Math.min(1, volume));
  }
}
