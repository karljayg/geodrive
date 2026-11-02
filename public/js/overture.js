// Places from Overture Maps: free, no key, with far more businesses than OpenStreetMap. It's one huge file of map tiles (PMTiles),
// of which only the parts wanted are fetched. Each monthly release has its own address, so the newest is looked up. Nothing here
// may be relied on: if it fails, the building is judged on OpenStreetMap alone. Pure apart from fetching, and tested in node.
import { decodeLines, readLayer } from './vector.js';

const BASE = 'https://overturemaps-extras-us-west-2.s3.amazonaws.com';
const ZOOM = 14;
const HEADER_BYTES = 16384; // holds the header and the first directory
const TIMEOUT = 8000;       // ms
export const MIN_CONFIDENCE = 0.7;

const groups = {
  bank: ['bank_or_credit_union'],
  restaurant: ['restaurant', 'casual_eatery', 'food_service', 'food_and_drink'],
  fastFood: ['fast_food_restaurant', 'food_court'],
  cafe: ['coffee_shop', 'cafe', 'smoothie_juice_bar', 'non_alcoholic_beverage_venue'],
  bar: ['bar', 'lounge', 'dance_club', 'nightlife_venue', 'alcoholic_beverage_venue', 'brewery', 'winery'],
  bakery: ['bakery'],
  hotel: ['hotel', 'lodging', 'resort', 'inn', 'bed_and_breakfast'],
  apartments: ['apartment', 'condominium'],
  nursingHome: ['senior_living_facility'],
  hospital: ['hospital', 'emergency_department', 'specialty_hospital'],
  clinic: ['health_care', 'dental_clinic', 'specialized_health_care', 'behavioral_or_mental_health_clinic', 'primary_care_or_general_clinic', 'vision_or_eye_care_clinic',
    'physical_medicine_and_rehabilitation', 'medical_service', 'diagnostics_imaging_or_lab_service', 'outpatient_care_facility', 'reproductive_perinatal_and_womens_care', 'walk_in_clinic',
    'urgent_care_clinic', 'emergency_or_urgent_care_facility', 'pediatric_clinic', 'specialized_medical_facility', 'surgery', 'complementary_and_alternative_medicine'],
  vet: ['animal_or_pet_service'],
  pharmacy: ['pharmacy_and_drug_store'],
  salon: ['personal_or_beauty_service', 'wellness_service'],
  shop: ['fashion_and_apparel_store', 'hardware_home_and_garden_store', 'electronics_store', 'arts_crafts_and_hobby_store', 'flowers_and_gifts_store', 'shopping', 'personal_care_and_beauty_store',
    'specialty_store', 'sporting_goods_store', 'books_music_and_video_store', 'office_supply_store', 'second_hand_store', 'animal_and_pet_store', 'toys_and_games_store',
    'musical_instrument_and_pro_audio_store', 'discount_store', 'vehicle_parts_store'],
  supermarket: ['food_and_beverage_store', 'convenience_store', 'warehouse_club_store', 'market', 'farmers_market'],
  departmentStore: ['department_store'],
  mall: ['shopping_mall'],
  school: ['college_university', 'specialty_school', 'place_of_learning', 'education', 'educational_facility', 'campus_building', 'elementary_school', 'high_school', 'middle_school', 'educational_service'],
  kindergarten: ['preschool'],
  office: ['corporate_or_business_office', 'government_office', 'government_department', 'embassy', 'civic_organization', 'research_institute', 'television_station', 'radio_station', 'labor_union',
    'political_organization', 'courthouse', 'community_and_government'],
  // Often run from someone's house, so these only count for a building too big to be a home.
  weakOffice: ['professional_service', 'real_estate_service', 'attorney_or_law_firm', 'technical_service', 'legal_service', 'media_service', 'design_service', 'b2b_service', 'travel_service',
    'building_or_construction_service', 'event_or_party_service', 'b2b_office_and_professional_service', 'printing_service', 'security_service', 'telecommunications_service', 'financial_service',
    'tutoring_service', 'home_service', 'b2b_science_and_technology_service'],
  communityCentre: ['community_center', 'social_or_community_service', 'social_club', 'cultural_center', 'youth_organization', 'family_service'],
  worship: ['christian_place_of_worship', 'jewish_place_of_worship', 'buddhist_place_of_worship', 'hindu_place_of_worship', 'muslim_place_of_worship', 'place_of_worship', 'religious_organization'],
  museum: ['museum', 'art_gallery', 'science_attraction'],
  theatre: ['theatre_venue', 'performing_arts_venue', 'music_venue', 'comedy_club'],
  cinema: ['movie_theater'],
  gym: ['gym', 'sport_or_fitness_facility', 'fitness_studio', 'sport_or_recreation_club', 'sports_and_recreation'],
  pool: ['swimming_pool'],
  stadium: ['stadium_arena'],
  library: ['library'],
  police: ['police_station'],
  fireStation: ['fire_station'],
  postOffice: ['shipping_or_delivery_service'],
  laundromat: ['laundry_service'],
  parking: ['parking_garage', 'parking'],
  carGarage: ['automotive_service', 'auto_dealer', 'vehicle_dealer', 'vehicle_service'],
  gasStation: ['gas_station'],
  station: ['train_station', 'public_transit_facility_or_service', 'rail_facility_or_service'],
  warehouse: ['storage_facility', 'supplier_or_distributor', 'b2b_transportation_and_storage_service', 'wholesaler'],
  factory: ['manufacturer', 'industrial_facility_or_service'],
};
export const CATEGORY_TYPE = Object.fromEntries(Object.entries(groups).flatMap(([type, list]) => list.map((category) => [category, type])));

const CLOSED = new Set(['closed', 'permanently_closed', 'temporarily_closed']);

// The place's category, in the older field if the newer is missing.
function categoryOf(tags) {
  if (tags.basic_category) return tags.basic_category;
  try {
    return JSON.parse(tags.taxonomy || '{}').primary || '';
  } catch {
    return '';
  }
}

// PMTiles numbers its tiles along a Hilbert curve, zoom by zoom.
export function tileId(z, x, y) {
  let id = 0;
  for (let t = 0; t < z; t++) id += 4 ** t;
  let d = 0;
  for (let s = 2 ** z / 2; s >= 1; s /= 2) {
    const rx = (x & s) > 0 ? 1 : 0, ry = (y & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    if (ry === 0) {
      if (rx === 1) { x = s * 2 - 1 - x; y = s * 2 - 1 - y; }
      [x, y] = [y, x];
    }
  }
  return id + d;
}

// A directory, once unzipped: its length, then each column of numbers in turn, each as varints.
export function readDirectory(bytes) {
  let at = 0;
  const varint = () => {
    let value = 0, scale = 1, b;
    do {
      b = bytes[at++];
      value += (b & 127) * scale;
      scale *= 128;
    } while (b & 128);
    return value;
  };
  const entries = Array.from({ length: varint() }, () => ({ id: 0, run: 0, length: 0, offset: 0 }));
  let id = 0;
  for (const entry of entries) entry.id = id += varint();
  for (const entry of entries) entry.run = varint();
  for (const entry of entries) entry.length = varint();
  entries.forEach((entry, i) => {
    const offset = varint();
    entry.offset = offset === 0 && i ? entries[i - 1].offset + entries[i - 1].length : offset - 1;
  });
  return entries;
}

// The entry for a tile: the last at or before it. It's a tile if its run covers the id, or a further directory if its run is 0.
export function findEntry(entries, id) {
  let found = null;
  for (const entry of entries) {
    if (entry.id > id) break;
    found = entry;
  }
  if (!found) return null;
  return found.run === 0 || id < found.id + found.run ? found : null;
}

// The useful places in a tile: open, sure enough, and of a kind that says something about a building.
export function parsePlaces(bytes, x, y) {
  const layer = readLayer(bytes, 'place');
  if (!layer) return [];
  const n = 2 ** ZOOM, out = [];
  for (const { type, tags, geometry } of layer.features) {
    const category = categoryOf(tags);
    if (type !== 1 || !CATEGORY_TYPE[category] || CLOSED.has(tags.operating_status) || !(tags.confidence >= MIN_CONFIDENCE)) continue;
    const [point] = decodeLines(geometry)[0] || [];
    if (!point) continue;
    out.push({
      lng: ((x + point[0] / layer.extent) / n) * 360 - 180,
      lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + point[1] / layer.extent)) / n))) * 180) / Math.PI,
      category,
      confidence: tags.confidence,
      name: tags['@name'] || '',
    });
  }
  return out.sort((a, b) => b.confidence - a.confidence);
}

async function gunzip(bytes) {
  if (bytes[0] !== 0x1f || bytes[1] !== 0x8b) return bytes;
  return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
}

export class Overture {
  constructor(fetcher = (...args) => fetch(...args)) {
    this.fetcher = fetcher;
    this.tiles = new Map(); // key: { places, failed } once settled
    this.loading = new Map();
    this.file = null;       // its address and header, once known
    this.directories = new Map();
  }

  async get(url, options) {
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), TIMEOUT);
    try {
      const res = await this.fetcher(url, { ...options, signal: controller.signal });
      if (!res.ok) throw new Error(`Overture answered ${res.status}`);
      return res;
    } finally {
      clearTimeout(timer);
    }
  }

  async range(start, length) {
    const res = await this.get(this.file.url, { headers: { Range: `bytes=${start}-${start + length - 1}` } });
    return new Uint8Array(await res.arrayBuffer());
  }

  // Finds the newest release, once, and reads where things are in its file.
  open() {
    this.opening ||= (async () => {
      const listing = await (await this.get(`${BASE}/?list-type=2&prefix=tiles/&delimiter=/`)).text();
      const newest = [...listing.matchAll(/<Prefix>tiles\/([^<]+)\/<\/Prefix>/g)].map((m) => m[1]).sort().at(-1);
      if (!newest) throw new Error('no Overture release listed');
      this.file = { url: `${BASE}/tiles/${newest}/places.pmtiles` };
      const head = await this.range(0, HEADER_BYTES), view = new DataView(head.buffer, head.byteOffset, head.byteLength);
      const number = (at) => Number(view.getBigUint64(at, true));
      if (new TextDecoder().decode(head.subarray(0, 7)) !== 'PMTiles') throw new Error('not a PMTiles file');
      Object.assign(this.file, { root: head.subarray(number(8), number(8) + number(16)), leaves: number(40), tilesAt: number(56) });
    })();
    this.opening.catch(() => { this.opening = null; }); // the next tile tries again
    return this.opening;
  }

  async directory(offset, length) {
    const key = `${offset}_${length}`;
    if (!this.directories.has(key)) this.directories.set(key, gunzip(await this.range(this.file.leaves + offset, length)).then(readDirectory));
    return this.directories.get(key);
  }

  async fetchTile(x, y) {
    await this.open();
    const id = tileId(ZOOM, x, y);
    this.file.rootEntries ||= readDirectory(await gunzip(this.file.root));
    let entries = this.file.rootEntries;
    for (let depth = 0; depth < 4; depth++) {
      const entry = findEntry(entries, id);
      if (!entry) return [];
      if (entry.run > 0) return parsePlaces(await gunzip(await this.range(this.file.tilesAt + entry.offset, entry.length)), x, y);
      entries = await this.directory(entry.offset, entry.length);
    }
    return [];
  }

  // Starts fetching a tile if it hasn't been. Afterwards tile() says how it went.
  want(x, y) {
    const key = `${x}_${y}`;
    if (this.tiles.has(key) || this.loading.has(key)) return;
    this.loading.set(key, this.fetchTile(x, y).then((places) => {
      this.tiles.set(key, { places, failed: false });
    }).catch((err) => {
      console.warn('Overture:', err.message);
      this.tiles.set(key, { places: [], failed: true });
    }).finally(() => this.loading.delete(key)));
  }

  tile(x, y) {
    return this.tiles.get(`${x}_${y}`) || null;
  }
}
