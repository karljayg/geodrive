// What a building is: its type, how many floors, its style, and a saved record so it stays that way. Pure, tested in node.
// Tiles have no building types, so the type comes from points of interest inside it, the land it stands on, and its size.
// See docs/INTERIORS.md, whose tables these follow.
import { fromLocal } from './footData.js';
import { CATEGORY_TYPE } from './overture.js';

const STORE = 'geodrive_rooms_v3'; // earlier ones hold guessed types, so they're dropped
const OLD_STORES = ['geodrive_rooms_v1', 'geodrive_rooms_v2'];
const TERMINAL_AREA = 5000, MALL_AREA = 3000, MALL_POIS = 3; // m², m², points of interest
const WAREHOUSE_AREA = 2000, LOW = 15, BIG_SHOP_AREA = 3000; // m², m, m²
const SHED_AREA = 40, HOME_AREA = 400, HOME_HEIGHT = 12;     // m², m², m
const APARTMENT_AREA = 2500; // m²; bigger and low is more likely offices, even on residential land
const TOWER_FLOORS = 5;      // from here up, a shop or restaurant has the ground floor only
const AREA_FOR_ALL = 3000;   // m²; below it, a type sized by footprint uses only the lower of its floor counts
const ID_GRID = 2e-5;        // degrees, about 2 m
const FLOOR_LIMIT = 1.5e6;   // characters of saved floors, as browsers allow about 5 MB and the performance log and Agecraft share it

export const STYLES = ['modern', 'traditional', 'cheap', 'luxury'];

// floor: metres per floor. min, max: floors when the height is known. unknown: the choices when it isn't, and bySize takes
// fewer of them for a small footprint.
export const TYPES = {
  home: { name: 'Home', floor: 3, min: 1, max: 4, unknown: [1, 1, 2, 2, 2, 3] },
  shed: { name: 'Shed', floor: 3, min: 1, max: 1, unknown: [1] },
  apartments: { name: 'Apartments', floor: 3, min: 2, max: 120, unknown: [3, 4, 5] },
  hotel: { name: 'Hotel', floor: 3.2, min: 2, max: 80, unknown: [3, 4, 5, 6, 7, 8] },
  office: { name: 'Office', floor: 3.8, min: 1, max: 120, unknown: [1, 2, 3, 4], bySize: true },
  bank: { name: 'Bank', floor: 4, min: 1, max: 60, unknown: [1, 2] },
  restaurant: { name: 'Restaurant', floor: 3.5, min: 1, max: 3, unknown: [1] },
  cafe: { name: 'Café', floor: 3.5, min: 1, max: 2, unknown: [1] },
  shop: { name: 'Shop', floor: 4, min: 1, max: 3, unknown: [1] },
  supermarket: { name: 'Supermarket', floor: 5, min: 1, max: 2, unknown: [1] },
  mall: { name: 'Mall', floor: 5, min: 1, max: 4, unknown: [2] },
  school: { name: 'School', floor: 3.8, min: 1, max: 6, unknown: [1, 2, 3], bySize: true },
  hospital: { name: 'Hospital', floor: 3.8, min: 1, max: 20, unknown: [1, 2, 3, 4], bySize: true },
  worship: { name: 'Place of worship', floor: 8, min: 1, max: 2, unknown: [1] },
  museum: { name: 'Museum', floor: 5, min: 1, max: 5, unknown: [1, 2] },
  warehouse: { name: 'Warehouse', floor: 9, min: 1, max: 1, unknown: [1] },
  factory: { name: 'Factory', floor: 6, min: 1, max: 3, unknown: [1] },
  hangar: { name: 'Hangar', floor: 12, min: 1, max: 1, unknown: [1] },
  terminal: { name: 'Airport terminal', floor: 6, min: 1, max: 4, unknown: [2] },
  vet: { name: 'Vet', floor: 3.5, min: 1, max: 3, unknown: [1] },
  nursingHome: { name: 'Care home', floor: 3.5, min: 1, max: 8, unknown: [2, 3] },
  kindergarten: { name: 'Nursery', floor: 3.5, min: 1, max: 2, unknown: [1] },
  dorm: { name: 'Dormitory', floor: 3.2, min: 2, max: 30, unknown: [3, 4, 5] },
  fastFood: { name: 'Fast food', floor: 3.5, min: 1, max: 2, unknown: [1] },
  bar: { name: 'Bar', floor: 3.5, min: 1, max: 2, unknown: [1] },
  bakery: { name: 'Bakery', floor: 3.5, min: 1, max: 1, unknown: [1] },
  laundromat: { name: 'Laundromat', floor: 3.5, min: 1, max: 1, unknown: [1] },
  departmentStore: { name: 'Department store', floor: 5, min: 1, max: 8, unknown: [2, 3] },
  station: { name: 'Station', floor: 6, min: 1, max: 4, unknown: [1, 2] },
  pool: { name: 'Swimming pool', floor: 6, min: 1, max: 2, unknown: [1] },
  // Nothing says what it is, so it stays locked rather than being shown as something it may not be.
  unknown: { name: '', floor: 3, min: 1, max: 1, unknown: [1] },
  // Types with no rooms yet, locked until they have some. docs/INTERIORS.md has the queue.
  parking: { name: 'Parking garage', floor: 3, min: 1, max: 12, unknown: [2, 3, 4, 5] },
  gasStation: { name: 'Gas station', floor: 4, min: 1, max: 1, unknown: [1] },
  fireStation: { name: 'Fire station', floor: 5, min: 1, max: 3, unknown: [1, 2] },
  police: { name: 'Police station', floor: 3.8, min: 1, max: 8, unknown: [1, 2] },
  clinic: { name: 'Clinic', floor: 3.5, min: 1, max: 6, unknown: [1, 2] },
  pharmacy: { name: 'Pharmacy', floor: 4, min: 1, max: 2, unknown: [1] },
  salon: { name: 'Hair and beauty salon', floor: 3.5, min: 1, max: 2, unknown: [1] },
  carGarage: { name: 'Car dealer or repair shop', floor: 5, min: 1, max: 2, unknown: [1] },
  gym: { name: 'Gym', floor: 5, min: 1, max: 4, unknown: [1, 2] },
  library: { name: 'Library', floor: 4, min: 1, max: 6, unknown: [1, 2] },
  cinema: { name: 'Cinema', floor: 6, min: 1, max: 3, unknown: [1] },
  theatre: { name: 'Theatre', floor: 8, min: 1, max: 4, unknown: [1, 2] },
  postOffice: { name: 'Post office', floor: 4, min: 1, max: 3, unknown: [1] },
  communityCentre: { name: 'Community centre or town hall', floor: 4, min: 1, max: 4, unknown: [1, 2] },
  stadium: { name: 'Stadium', floor: 10, min: 1, max: 6, unknown: [2] },
};

// The types you can go into. A type with rooms that aren't good enough yet can be left out too.
export const OPEN_TYPES = new Set(['gym', 'pool', 'cinema', 'theatre', 'stadium', 'bar', 'fastFood', 'bakery', 'laundromat', 'departmentStore', 'station', 'gasStation', 'carGarage', 'fireStation', 'police', 'postOffice', 'communityCentre', 'library', 'kindergarten', 'dorm', 'hospital', 'clinic', 'vet', 'pharmacy', 'salon', 'nursingHome', 'home', 'shed', 'apartments', 'parking', 'hotel', 'office', 'bank', 'restaurant', 'cafe', 'shop', 'supermarket', 'mall', 'school', 'worship', 'museum', 'warehouse', 'factory', 'hangar', 'terminal']);

// A building is judged by what's at its door, so a clinic at the foot of an office tower is locked.
export const isLocked = (plan) => !OPEN_TYPES.has(plan.ground || plan.type);
export const typeName = (plan) => plan.name || TYPES[plan.ground || plan.type]?.name || '';

// The tile's poi class, or its subclass where one class covers different things. Anything else says nothing about the building.
const POI_CLASS = {
  bank: 'bank', lodging: 'hotel', office: 'office', town_hall: 'communityCentre', police: 'police', fire_station: 'fireStation', parking: 'parking', fuel: 'gasStation',
  restaurant: 'restaurant', fast_food: 'fastFood', cafe: 'cafe', bar: 'bar', beer: 'bar', bakery: 'bakery', ice_cream: 'cafe', ferry_terminal: 'station', swimming_pool: 'pool',
  shop: 'shop', clothing_store: 'shop', butcher: 'shop', pharmacy: 'pharmacy', hairdresser: 'salon', laundry: 'laundromat', car: 'carGarage', bicycle: 'shop', music: 'shop',
  sports_centre: 'gym', gymnastics: 'gym', yoga: 'gym', stadium: 'stadium',
  alcohol_shop: 'supermarket', grocery: 'supermarket',
  school: 'school', college: 'school', hospital: 'hospital', dentist: 'clinic', doctors: 'clinic', veterinary: 'vet',
  place_of_worship: 'worship', museum: 'museum', theatre: 'theatre', cinema: 'cinema',
};
const POI_SUBCLASS = { kindergarten: 'kindergarten', dormitory: 'dorm', hostel: 'dorm', nursing_home: 'nursingHome', convenience: 'supermarket', department_store: 'departmentStore', station: 'station', halt: 'station', bus_station: 'station', library: 'library', books: 'shop', gallery: 'museum', post_office: 'postOffice', clinic: 'clinic', beauty: 'salon', cosmetics: 'shop' };
const RETAIL = new Set(['fastFood', 'bar', 'bakery', 'laundromat', 'departmentStore', 'restaurant', 'cafe', 'shop', 'supermarket', 'pharmacy', 'salon']);
const GROUND_ONLY = new Set([...RETAIL, 'bank', 'clinic', 'pharmacy', 'salon', 'gym', 'postOffice']);
const ALSO_OFFICES = new Set(['warehouse', 'factory', 'unknown']);
const LAND_TYPE = { school: 'school', university: 'school', college: 'school', hospital: 'hospital', library: 'library' };

export const poiType = ({ overture, category, cls, sub }) => (overture ? CATEGORY_TYPE[category] || null : POI_SUBCLASS[sub] || POI_CLASS[cls] || null);

export function hashText(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

// The dice for a building: the same seed always rolls the same.
export function dice(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (list, roll) => list[Math.floor(roll() * list.length)];

// What the land and size alone say. clues: { area, height, known, pois: [types], lands: [classes] }.
// What the land and size say when nothing names the building, or unknown if that would be a guess. Unknown buildings stay
// locked, as showing nothing is better than showing the wrong thing.
function typeFromLand({ area, height, known, lands }) {
  const low = !known || height < LOW, tall = known && height > HOME_HEIGHT, business = ['retail', 'commercial', 'industrial'].some((land) => lands.includes(land));
  for (const land of lands) if (LAND_TYPE[land]) return LAND_TYPE[land];
  if (lands.includes('industrial') && area > WAREHOUSE_AREA) return low ? 'warehouse' : 'factory';
  if (lands.includes('commercial') && tall) return 'office';
  if (area < SHED_AREA) return 'shed';
  if (business) return 'unknown';
  if (area <= HOME_AREA && !tall) return 'home';
  return lands.includes('residential') && (area <= APARTMENT_AREA || tall) ? 'apartments' : 'unknown';
}

// The most common kind of point of interest inside. A tie goes to the first found.
function commonest(pois) {
  const count = new Map();
  for (const type of pois) count.set(type, (count.get(type) || 0) + 1);
  return [...count].reduce((best, entry) => (entry[1] > best[1] ? entry : best), [null, 0])[0];
}

export function buildingType(clues) {
  const { area, lands } = clues, airport = lands.includes('aerodrome');
  // Businesses like these are often run from a house, so they only say something about a bigger building.
  const roomy = area > HOME_AREA || lands.includes('commercial') || lands.includes('retail') || lands.includes('industrial');
  const pois = clues.pois.flatMap((type) => (type !== 'weakOffice' ? [type] : roomy ? ['office'] : []));
  if (pois.length && pois.every((type) => type === 'parking')) return 'parking'; // before the airport, whose garages are huge
  if (pois.includes('mall') && area > MALL_AREA) return 'mall';
  if (airport && area > TERMINAL_AREA) return 'terminal';
  if (area > MALL_AREA && pois.filter((type) => RETAIL.has(type) || type === 'bank').length >= MALL_POIS) return 'mall'; // several tenants under one roof
  const named = commonest(pois.filter((type) => type !== 'parking' && type !== 'mall'));
  if (named) return named;
  return airport ? 'hangar' : typeFromLand(clues);
}

function floorCount(type, { area, height, known }, roll) {
  const t = TYPES[type];
  if (known) return Math.max(t.min, Math.min(t.max, Math.round(height / t.floor)));
  const usable = t.bySize ? Math.max(1, Math.ceil(t.unknown.length * Math.min(1, area / AREA_FOR_ALL))) : t.unknown.length;
  return pick(t.unknown.slice(0, usable), roll);
}

// A building's plan: { type, floors, style }, and ground when its ground floor is something else, like a bank in a tower.
export function planBuilding(clues, roll) {
  const type = buildingType(clues), style = pick(STYLES, roll), name = clues.names?.[type];
  const named = name ? { name } : {};
  if (GROUND_ONLY.has(type) && clues.known) {
    let above = typeFromLand(clues);
    if (ALSO_OFFICES.has(above)) above = 'office';
    else if (above === 'home' || above === 'shed') above = 'apartments';
    const floors = Math.round(clues.height / TYPES[above].floor);
    if (floors >= TOWER_FLOORS) return { type: above, ground: type, floors: Math.min(floors, TYPES[above].max), style, ...named };
  }
  return { type, floors: floorCount(type, clues, roll), style, ...named };
}

// The same for this building wherever the car is parked, which metres from the car are not.
export function buildingId(origin, { minX, maxX, minY, maxY }) {
  const { lat, lng } = fromLocal(origin, (minX + maxX) / 2, (minY + maxY) / 2);
  return `${Math.round(lat / ID_GRID)}_${Math.round(lng / ID_GRID)}`;
}

// What this browser remembers about the buildings entered, so they stay as they were found. It can always be lost: the
// same id rolls the same plan.
export class BuildingStore {
  constructor(storage) {
    this.buildings = {};
    try {
      this.storage = storage ?? localStorage;
      for (const name of OLD_STORES) {
        const old = JSON.parse(this.storage.getItem(name));
        if (!old) continue;
        for (const [id, building] of Object.entries(old)) for (const floor of Object.keys(building.saved || {})) this.storage.removeItem(`${name}_${id}_${floor}`);
        this.storage.removeItem(name);
      }
      this.buildings = JSON.parse(this.storage.getItem(STORE)) || {};
    } catch (err) {
      console.warn('saved buildings:', err);
    }
  }

  get(id) {
    return this.buildings[id] || null;
  }

  remember(id, plan, now = Date.now()) {
    this.buildings[id] = { ...plan, seen: now };
    this.saveIndex();
    return this.buildings[id];
  }

  saveIndex() {
    try {
      this.storage?.setItem(STORE, JSON.stringify(this.buildings));
    } catch (err) {
      console.warn('saving buildings:', err);
    }
  }

  // A floor as laid out when first visited, or null if it never has been or was dropped for room.
  floor(id, floor) {
    try {
      return JSON.parse(this.storage.getItem(`${STORE}_${id}_${floor}`));
    } catch (err) {
      console.warn('saved floor:', err);
      return null;
    }
  }

  saveFloor(id, floor, record) {
    const building = this.buildings[id];
    if (!building) return;
    const text = JSON.stringify(record);
    this.makeRoom(text.length, id);
    try {
      this.storage?.setItem(`${STORE}_${id}_${floor}`, text);
      (building.saved ||= {})[floor] = text.length;
      this.saveIndex();
    } catch (err) {
      console.warn('saving floor:', err); // it stays as it is for this visit, and the same dice lay it out the same next time
    }
  }

  // Drops the floors of the buildings seen longest ago until this much more fits. They come back the same from the dice.
  makeRoom(wanted, keep) {
    const size = (b) => Object.values(b.saved || {}).reduce((sum, n) => sum + n, 0);
    let total = Object.values(this.buildings).reduce((sum, b) => sum + size(b), 0) + wanted;
    const oldest = Object.entries(this.buildings).filter(([id, b]) => id !== keep && b.saved).sort((a, b) => a[1].seen - b[1].seen);
    for (const [id, building] of oldest) {
      if (total <= FLOOR_LIMIT) break;
      total -= size(building);
      for (const floor of Object.keys(building.saved)) this.storage?.removeItem(`${STORE}_${id}_${floor}`);
      delete building.saved;
    }
  }

  // Everything, from the button in Settings.
  forget() {
    for (const [id, building] of Object.entries(this.buildings)) {
      for (const floor of Object.keys(building.saved || {})) this.storage?.removeItem(`${STORE}_${id}_${floor}`);
    }
    this.buildings = {};
    this.storage?.removeItem(STORE);
  }
}

// The plan of the building this piece belongs to, saved at the first entry and shared by all its pieces. Null until every
// tile holding a piece of it has arrived, as its id depends on the whole of it.
// sure: false if a source of clues failed, when a building that comes out unknown isn't saved as unknown, and can be tried again.
export function identify(place, piece, store, now = Date.now(), sure = true) {
  if (piece.plan) return piece.plan;
  const { pieces, missing } = place.wholeOf(piece);
  if (missing.length) return null;
  const bounds = {
    minX: Math.min(...pieces.map((p) => p.minX)), maxX: Math.max(...pieces.map((p) => p.maxX)),
    minY: Math.min(...pieces.map((p) => p.minY)), maxY: Math.max(...pieces.map((p) => p.maxY)),
  };
  const id = buildingId(place.origin, bounds);
  const known = store.get(id);
  const worked = known || planBuilding(place.cluesFor(pieces, bounds, poiType), dice(hashText(id)));
  if (!sure && !known && isLocked(worked)) return worked;
  const plan = store.remember(id, worked, now);
  for (const p of pieces) {
    p.buildingId = id;
    p.plan = plan;
    p.pieces = pieces;
  }
  return plan;
}

// Metres from one floor to the next.
export const floorHeight = (plan) => TYPES[plan.type].floor;

// The line on screen: Bank · Floor 1 of 20.
export function planLabel(plan, floor = 1) {
  const type = floor === 1 && plan.ground ? plan.ground : plan.type, ownName = plan.name && (type === (plan.ground || plan.type));
  return `${ownName ? plan.name : TYPES[type].name} · Floor ${floor} of ${plan.floors}`;
}
