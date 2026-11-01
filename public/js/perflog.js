// A rolling performance log, kept in chunks in localStorage so it survives a refresh or a crash, and sent to the
// server by the Send log button. Only the newest chunk is ever written, so logging doesn't cause the stutter it measures.
// Pure apart from observeBrowser, and tested in node.
const STORE = 'geodrive_log_v1';
const SAMPLE_EVERY = 5000;   // ms between rows
const ROWS_PER_CHUNK = 12;   // a minute of rows
const MAX_CHUNKS = 300;      // five hours
const MAX_EVENTS = 40;       // per chunk, so a repeating error can't fill the store
const SLOW_FRAME = 200;      // ms; a frame this long records which scripts it spent its time in

export const COLUMNS = [
  'time', 'state', 'lat', 'lng', 'mph',
  'fps', 'slowest', 'over50', 'over100',      // frame intervals in this sample, ms
  'jsAvg', 'jsMax',                           // ms per frame in our own code; the gap to the frame time is the map and the GPU
  'driveMs', 'sceneMs', 'dashMs', 'navWorst', // where that went: average per frame, except the slowest nav draw
  'longTasks', 'longMs',                      // main-thread tasks over 50 ms, from anyone including the map
  'heapMB', 'ways', 'tiles', 'tilesLoading', 'tileMs', 'navVertices',
  'mapRequests', 'mapReqMs', 'roadRequests',  // the 3D map's streaming, and road tiles
  'routePoints', 'lineVertices', 'range', 'cam', 'fsd', 'lights', 'dark',
  'geocodes', 'routes', 'elevations',         // billed Google calls in this sample
];

// Session totals for the HUD; keys match count() names.
export const API_STATS = [
  { key: 'geocodes', label: 'Geocoding', note: 'Billed · address and reverse geocode' },
  { key: 'routes', label: 'Routes', note: 'Billed · navigation and FSD' },
  { key: 'elevations', label: 'Elevation', note: 'Billed · fallback ground height' },
  { key: 'mapRequests', label: 'Map tiles', note: '3D map streaming requests' },
  { key: 'roadRequests', label: 'Road tiles', note: 'OpenFreeMap · free' },
];

const round = (n) => (Number.isFinite(n) ? Math.round(n * 10) / 10 : 0);

export class PerfLog {
  constructor(store) {
    this.store = store;
    this.events = [];
    this.rows = [];
    this.nextSample = 0;
    this.lastFrame = 0;
    this.chunk = this.readIndex().next;
    this.totals = {};
    this.reset();
  }

  reset() {
    Object.assign(this, { frames: 0, slowest: 0, over50: 0, over100: 0, js: 0, jsMax: 0, spent: {}, worst: {}, counts: {}, sampledAt: 0 });
  }

  readIndex() {
    try {
      const index = JSON.parse(this.store.getItem(STORE));
      if (Number.isInteger(index?.first) && Number.isInteger(index?.next)) return index;
    } catch (err) {
      console.warn('log index:', err);
    }
    return { first: 0, next: 0 };
  }

  // t: the frame's timestamp, ms. js: ms our code took on it.
  frame(t, js) {
    if (this.lastFrame) {
      const gap = t - this.lastFrame;
      this.slowest = Math.max(this.slowest, gap);
      if (gap > 50) this.over50++;
      if (gap > 100) this.over100++;
    }
    this.lastFrame = t;
    this.frames++;
    this.js += js;
    this.jsMax = Math.max(this.jsMax, js);
    if (!this.sampledAt) this.sampledAt = t;
  }

  spend(name, ms) {
    this.spent[name] = (this.spent[name] || 0) + ms;
    this.worst[name] = Math.max(this.worst[name] || 0, ms);
  }

  count(name, by = 1) {
    this.counts[name] = (this.counts[name] || 0) + by;
    this.totals[name] = (this.totals[name] || 0) + by;
  }

  // Compact string for the HUD; changes only when a count() runs.
  apiSummaryKey() {
    return API_STATS.map(({ key }) => `${key}:${this.totals[key] || 0}`).join('|');
  }

  billedTotal() {
    return (this.totals.geocodes || 0) + (this.totals.routes || 0) + (this.totals.elevations || 0);
  }

  event(type, detail = null) {
    if (this.events.length < MAX_EVENTS) this.events.push([Math.round(Date.now() / 1000), type, detail]);
  }

  due(t) {
    return this.sampledAt && t - this.sampledAt >= SAMPLE_EVERY;
  }

  // Adds a row from what the frames measured plus `state`, which holds the rest of COLUMNS.
  sample(t, state) {
    const seconds = (t - this.sampledAt) / 1000, frames = this.frames || 1;
    const measured = {
      time: Math.round(Date.now() / 1000),
      fps: this.frames / seconds,
      slowest: this.slowest,
      over50: this.over50,
      over100: this.over100,
      jsAvg: this.js / frames,
      jsMax: this.jsMax,
      driveMs: (this.spent.drive || 0) / frames,
      sceneMs: (this.spent.scene || 0) / frames,
      dashMs: (this.spent.dash || 0) / frames,
      navWorst: this.worst.nav || 0,
      tileMs: this.spent.tile || 0,
      ...this.counts,
    };
    const row = COLUMNS.map((name) => (name === 'lat' || name === 'lng' ? Math.round((state[name] ?? 0) * 1e5) / 1e5 : round(measured[name] ?? state[name] ?? 0)));
    this.rows.push(row);
    this.reset();
    if (this.rows.length >= ROWS_PER_CHUNK) this.flush(true);
    return row;
  }

  // Saves the chunk being filled. `finished` moves on to a new one.
  flush(finished = false) {
    if (!this.rows.length && !this.events.length) return;
    const text = JSON.stringify({ rows: this.rows, events: this.events });
    const index = this.readIndex();
    index.next = Math.max(index.next, this.chunk + 1);
    while (index.next - index.first > MAX_CHUNKS) this.store.removeItem(`${STORE}_${index.first++}`);
    if (!this.write(text, index)) {
      // Browser storage is full: the older half of the log goes first.
      const keepFrom = Math.min(this.chunk, index.first + Math.ceil((index.next - index.first) / 2));
      while (index.first < keepFrom) this.store.removeItem(`${STORE}_${index.first++}`);
      this.write(text, index);
    }
    if (finished) {
      this.chunk++;
      this.rows = [];
      this.events = [];
    }
  }

  write(text, index) {
    try {
      this.store.setItem(`${STORE}_${this.chunk}`, text);
      this.store.setItem(STORE, JSON.stringify(index));
      return true;
    } catch (err) {
      console.warn('saving log:', err.message);
      return false;
    }
  }

  // Everything held, oldest first.
  report(meta) {
    this.flush();
    const index = this.readIndex(), rows = [], events = [];
    for (let n = index.first; n < index.next; n++) {
      try {
        const chunk = JSON.parse(this.store.getItem(`${STORE}_${n}`));
        if (chunk) { rows.push(...chunk.rows); events.push(...chunk.events); }
      } catch (err) {
        console.warn('log chunk:', err); // lose that minute, not the log
      }
    }
    return { version: 1, sentAt: new Date().toISOString(), meta, columns: COLUMNS, rows, events };
  }

  // Forgets what has been sent, so the next log starts from here.
  clear() {
    const index = this.readIndex();
    for (let n = index.first; n < index.next; n++) this.store.removeItem(`${STORE}_${n}`);
    this.chunk = index.next;
    this.store.setItem(STORE, JSON.stringify({ first: index.next, next: index.next }));
    this.rows = [];
    this.events = [];
  }
}

// What the browser reports about work that isn't ours. Each kind is left out where the browser doesn't have it.
export function observeBrowser(log) {
  const watch = (type, onEntry) => {
    try {
      new PerformanceObserver((list) => list.getEntries().forEach(onEntry)).observe({ type, buffered: false });
    } catch (err) {
      log.event('unobserved', type);
    }
  };
  watch('longtask', (e) => {
    log.count('longTasks');
    log.count('longMs', e.duration);
  });
  watch('resource', (e) => {
    if (/keyhole-pa\.googleapis|maps\.googleapis\.com\/maps\/vt/.test(e.name)) {
      log.count('mapRequests');
      log.count('mapReqMs', e.duration);
    } else if (/openfreemap/.test(e.name)) {
      log.count('roadRequests');
    }
  });
  watch('long-animation-frame', (e) => {
    if (e.duration < SLOW_FRAME || document.hidden) return; // a hidden tab's frames are slow on purpose
    const scripts = (e.scripts || []).slice(0, 3).map((s) => ({ source: (s.sourceURL || '').split('?')[0].slice(-60), by: (s.invoker || '').slice(0, 60), ms: Math.round(s.duration) }));
    log.event('slowFrame', { ms: Math.round(e.duration), blocking: Math.round(e.blockingDuration || 0), scripts });
  });
  for (const level of ['warn', 'error']) {
    const original = console[level];
    console[level] = (...args) => {
      log.event(level, args.map((a) => (a instanceof Error ? a.message : String(a))).join(' ').slice(0, 200));
      original.apply(console, args);
    };
  }
  window.addEventListener('error', (e) => log.event('error', String(e.message).slice(0, 200)));
  window.addEventListener('unhandledrejection', (e) => log.event('error', String(e.reason?.message || e.reason).slice(0, 200)));
}

// The graphics chip and screen, which decide how much of the frame the 3D map can fill.
export function describeMachine() {
  let gpu = 'unknown';
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    if (info) gpu = gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
  } catch (err) {
    console.warn('gpu:', err);
  }
  return {
    gpu,
    userAgent: navigator.userAgent,
    cores: navigator.hardwareConcurrency,
    memoryGB: navigator.deviceMemory,
    screen: `${screen.width}x${screen.height}`,
    window: `${innerWidth}x${innerHeight}`,
    pixelRatio: devicePixelRatio,
  };
}
