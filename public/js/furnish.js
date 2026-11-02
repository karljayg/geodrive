// Lays out one floor of a building: rooms, inner walls with doorways, and what stands in each room. Pure, tested in node.
// It works in the building's own frame, u along its longest wall and v across it, in metres from its centre, because
// footprints are rarely square to the compass and metres from the car change with every parking spot. The result is plain
// numbers, made to be saved. See docs/INTERIORS.md, whose tables these follow.
import { inRings, signedArea } from './footData.js';
import { ITEMS, isSolid } from './furniture.js';

const FINE_CELL = 0.5, COARSE_CELL = 1; // m a side of the grid used for rooms and for checking you can get about
const COARSE_FROM = 1500;  // m² of floor from which the grid is coarse, as checks cost by the cell
const MIN_ROOM = 2;        // m wide
const DOOR_WIDTH = 1;      // m
const DOOR_CLEAR = 0.9;    // m each side of a doorway kept free
const CLEARANCE = 0.35;    // m around a thing that a person can't stand, as they are that wide
const SIDE_GAPS = [0.08, 0.3, 0.55]; // m from a wall to try; a wall the grid doesn't line up with can be further off
const STRANDED = 2;        // m² that may end up boxed in, as a gap behind a sofa is harmless
const FLOOR_LIFT = 0.05;   // m a rug lies above the floor
const BEDROOM = 16;
const USABLE = 0.75;       // of a floor's area goes to rooms' targets; the rest makes them roomier
const MIN_SHARE = 0.5;     // of its target, the least a part of the floor can have

// target: m² it would like, which also decides if there's room for it at all. The first few always get a try, as a home needs them.
const GROUND_ZONES = [['living', 28], ['kitchen', 15], ['bathroom', 6], ['hall', 6], ['dining', 14], ['study', 10], ['laundry', 6]];
const SINGLE_ZONES = [['living', 28], ['kitchen', 15], ['bathroom', 6], ['bedroom', BEDROOM], ['hall', 6], ['bedroom', BEDROOM], ['dining', 14], ['study', 10], ['laundry', 6], ['bedroom', BEDROOM]];
// A home's rooms from the front door in: what guests see first, and the bedrooms furthest. Dividing keeps this order, so they end up at opposite ends.
const HOME_ORDER = { hall: 0, living: 1, dining: 2, kitchen: 3, study: 4, laundry: 5, bathroom: 6, bedroom: 7 };
const UPPER_ZONES = [['bedroom', BEDROOM], ['bathroom', 6], ['bedroom', BEDROOM], ['study', 10], ['bedroom', BEDROOM], ['bathroom', 6]];
const TOILETS = ['toilets', 14], STOCK = ['stock', 16], DESKS = ['openPlan', 60], MEETING = ['meeting', 22], OFFICE = ['privateOffice', 14], BREAK = ['breakRoom', 16];
// For each type: the zones of a ground floor, then of those above, in order of need. first: how many it always tries. then: repeated
// for as long as there's room, which is how a big floor gets more of them. A type with one list has it on every floor.
const TYPE_ZONES = {
  fireStation: { ground: [['engineBay', 90], ['gearRoom', 18], BREAK], upper: [['bunkRoom', 30], BREAK, TOILETS] },
  police: { ground: [['policeFront', 30], ['cells', 30], OFFICE, TOILETS], upper: [DESKS, MEETING, TOILETS], then: [OFFICE, ['records', 18], ['cells', 30]] },
  postOffice: { ground: [['postCounter', 40], ['sorting', 30]], upper: [['sorting', 40]] },
  communityCentre: { ground: [['eventHall', 80], ['lobby', 25], BREAK, TOILETS], upper: [MEETING, OFFICE], then: [MEETING, ['eventHall', 60]] },
  library: { ground: [['stacks', 90], ['lobby', 22], TOILETS], upper: [['stacks', 90], ['readingRoom', 40]], then: [['stacks', 90], ['readingRoom', 40]] },
  kindergarten: { ground: [['playRoom', 45], ['playRoom', 45], ['schoolOffice', 14], TOILETS], then: [['playRoom', 45]] },
  dorm: { ground: [['lobby', 25], ['laundry', 12], ['lounge', 40], TOILETS], upper: [['dormRoom', 20], ['dormRoom', 20], ['bathroom', 12]], then: [['dormRoom', 20], ['dormRoom', 20], ['bathroom', 12]] },
  gym: { ground: [['gymFloor', 80], ['lockerRoom', 20], TOILETS], upper: [['gymFloor', 80], ['studio', 30]], then: [['gymFloor', 80]] },
  pool: { ground: [['poolHall', 180], ['lockerRoom', 22], TOILETS], upper: [['gymFloor', 60]] },
  cinema: { ground: [['foyer', 50], ['auditorium', 120], TOILETS], upper: [['auditorium', 120]], then: [['auditorium', 120]] },
  theatre: { ground: [['foyer', 60], ['auditorium2', 220], TOILETS], upper: [['auditorium2', 200], ['foyer', 30]] },
  stadium: { ground: [['pitch', 1800], ['stand', 300], ['stand', 300], ['foyer', 100], TOILETS], upper: [['stand', 400], ['stand', 400], ['foyer', 80]], then: [['stand', 300]] },
  bar: { ground: [['barRoom', 50], TOILETS, STOCK], upper: [['barRoom', 50]] },
  fastFood: { ground: [['fastFoodFloor', 60], ['restaurantKitchen', 20], TOILETS], upper: [['fastFoodFloor', 50]] },
  bakery: { ground: [['bakeryShop', 30], ['bakeryKitchen', 24]] },
  laundromat: { ground: [['laundryRoom', 40]] },
  departmentStore: { ground: [['salesFloor', 200], ['salesFloor', 200], TOILETS], upper: [['salesFloor', 300], STOCK], then: [['salesFloor', 200]] },
  station: { ground: [['concourse', 150], ['platform', 200], TOILETS], upper: [['platform', 200], ['concourse', 80]], then: [['platform', 200]] },
  gasStation: { ground: [['gasShop', 40], STOCK, TOILETS] },
  carGarage: { ground: [['workBay', 70], ['showroom', 60], ['privateOffice', 14]], upper: [['showroom', 60]], then: [['workBay', 70]] },
  shed: { ground: [['workshop', 20]] },
  parking: { ground: [['parkingDeck', 40]] }, // for one too small for lanes; otherwise see parkingFloor
  apartments: { ground: [['lobby', 30], ['laundry', 12], ['gym', 30]], upper: [['living', 28], ['kitchen', 15], ['bathroom', 6], ['bedroom', BEDROOM]], then: [['living', 24], ['kitchen', 12], ['bathroom', 6], ['bedroom', BEDROOM]] },
  hotel: { ground: [['lobby', 50], ['barRoom', 40], ['restaurantDining', 60], ['restaurantKitchen', 25], TOILETS], upper: [['hotelRoom', 26], ['hotelRoom', 26]], then: [['hotelRoom', 26]] },
  office: { ground: [['lobby', 40], BREAK, TOILETS], upper: [DESKS, TOILETS, MEETING, BREAK], then: [OFFICE, MEETING, DESKS] },
  bank: { ground: [['bankLobby', 35], ['bankHall', 60], ['vault', 18], ['privateOffice', 10], ['privateOffice', 10], TOILETS], upper: [DESKS, MEETING, TOILETS], then: [['privateOffice', 10], ['privateOffice', 10], ['records', 14]] },
  restaurant: { ground: [['restaurantDining', 60], ['restaurantKitchen', 25], TOILETS], upper: [['restaurantDining', 60], STOCK], then: [['restaurantDining', 50]] },
  cafe: { ground: [['cafe', 40], TOILETS, STOCK], upper: [['cafe', 40]] },
  shop: { ground: [['salesFloor', 60], STOCK], upper: [['salesFloor', 60], STOCK], then: [['salesFloor', 80]] },
  supermarket: { ground: [['produce', 80], ['aisles', 300], STOCK], upper: [STOCK], then: [['aisles', 300]] },
  mall: { ground: [['salesFloor', 200], ['foodCourt', 300], TOILETS], then: [['salesFloor', 200], ['salesFloor', 300], STOCK] }, // only if too small for a walkway; see CORRIDORS
  school: { ground: [['classroom', 55], ['cafeteria', 120], ['schoolOffice', 20], TOILETS], upper: [['classroom', 55], ['classroom', 55], TOILETS], then: [['classroom', 55]] },
  hospital: { ground: [['hospitalWaiting', 60], ['examRoom', 16], ['examRoom', 16], ['scanRoom', 25], TOILETS], upper: [['ward', 50], ['nurseStation', 18], ['operatingRoom', 35], TOILETS], then: [['ward', 50], ['examRoom', 16], ['operatingRoom', 35], OFFICE] },
  clinic: { ground: [['clinicWaiting', 25], ['examRoom', 14], TOILETS], upper: [['examRoom', 14], ['examRoom', 14]], then: [['examRoom', 14], OFFICE] },
  vet: { ground: [['clinicWaiting', 22], ['examRoom', 14], ['kennels', 18]], then: [['examRoom', 14]] },
  pharmacy: { ground: [['pharmacyFloor', 60], STOCK], upper: [STOCK] },
  salon: { ground: [['salonFloor', 45], STOCK], upper: [['salonFloor', 45]] },
  nursingHome: { ground: [['lobby', 30], ['lounge', 50], ['restaurantDining', 50], ['restaurantKitchen', 22], TOILETS], upper: [['careRoom', 20], ['careRoom', 20], ['nurseStation', 16], TOILETS], then: [['careRoom', 20]] },
  worship: { ground: [['worshipHall', 120]], upper: [['worshipHall', 80]] },
  museum: { ground: [['gallery', 120], TOILETS], upper: [['gallery', 120]], then: [['gallery', 150]] },
  warehouse: { ground: [['loadingBay', 150], ['racking', 300], ['schoolOffice', 20]], then: [['racking', 400], ['loadingBay', 120]] },
  factory: { ground: [['machines', 200], ['workshop', 25], ['schoolOffice', 20]], upper: [DESKS, STOCK], then: [['machines', 300]] },
  hangar: { ground: [['hangarBay', 200], ['workshop', 25]] },
  terminal: { ground: [['checkIn', 300], ['security', 120], ['baggage', 200], ['foodCourt', 200], TOILETS], upper: [['gates', 400], ['foodCourt', 200], TOILETS], then: [['gates', 400], ['salesFloor', 120]] },
};
export const FURNISHED = new Set(['home', ...Object.keys(TYPE_ZONES)]); // the types that have rooms
const MOST_ZONES = 12;     // on a floor; past this it's just bigger rooms
const ROOM_ITEMS_LEAST = 12; // a small room can always hold this many, even late on a full floor
const MOST_SOLIDS = 200;   // things on a floor that stop you, which is also what it costs to walk there
const CHECK_BUDGET = 4e6; // grid cells a floor may look at to check nothing is shut off, which is what bounds how long it takes
const WINDOW = 45;         // m from the centre that a huge floor is furnished; past that it's an open hall, for now
const ROOM_WIDTH = {
  gymFloor: 5, poolHall: 7, auditorium: 7, auditorium2: 8, pitch: 12, stand: 6, barRoom: 4, fastFoodFloor: 4, bakeryShop: 3, laundryRoom: 3, concourse: 6, platform: 6, gasShop: 3.5, workBay: 7, showroom: 6, foyer: 4, bankLobby: 3.5,
  engineBay: 8, eventHall: 7, stacks: 5, readingRoom: 4, playRoom: 4, cells: 3.5, bunkRoom: 4, dormRoom: 3,
  living: 3, bedroom: 2.8, dining: 2.8, kitchen: 2.5, hotelRoom: 3, openPlan: 4, meeting: 3, privateOffice: 2.5, breakRoom: 2.5, bankHall: 5, vault: 3, restaurantDining: 4, restaurantKitchen: 3, cafe: 3.5,
  salesFloor: 3.5, aisles: 6, foodCourt: 6, classroom: 5, cafeteria: 5, hospitalWaiting: 4, ward: 4, worshipHall: 6, gallery: 5, racking: 7, machines: 6, hangarBay: 12, checkIn: 6, gates: 6, lobby: 4, gym: 4,
}; // m a room needs for what must go in it
const BAY_WIDTH = 2.6, BAY_DEPTH = 5, LANE = 6, CROSS_LANE = 3.5, MOST_BAYS = 130; // m, m, m, m, on a floor
const PILLAR_EVERY = 3;    // bays
const RAMP_BAYS = 4;       // bays a ramp takes the place of
const CORRIDOR = 2;        // m wide
const FLAT_DEPTH_MIN = 5.5, BAND_DEPTH = 22; // m, m
// Types with rooms off corridors. unit: a flat of four rooms, a suite of a room and bathroom, or one room. width: of each, in m.
// most: on a floor. shared: rooms that come first on the ground floor, then upper: on those above. upperOnly: the ground floor is laid out like any other.
const CORRIDORS = {
  apartments: { unit: 'flat', width: 8, most: 9, shared: ['lobby', 'mailroom', 'laundry', 'gym'], upper: [] },
  hotel: { unit: 'suite', room: 'hotelRoom', width: 5, most: 16, upperOnly: true, upper: ['stock'] },
  dorm: { unit: 'room', room: 'dormRoom', width: 4.5, most: 14, upperOnly: true, upper: ['bathroom'] },
  nursingHome: { unit: 'room', room: 'careRoom', width: 5, most: 12, upperOnly: true, upper: ['nurseStation', 'toilets'] },
  mall: { unit: 'room', room: ['shopUnit', 'shopUnit', 'shopUnit', 'cafe', 'salonFloor', 'pharmacyFloor', 'bakeryShop', 'fastFoodFloor'], width: 11, most: 14, walkway: 6, shared: ['foodCourt', 'toilets'], upper: ['foodCourt', 'toilets'] },
  school: { unit: 'room', room: 'classroom', width: 8, most: 12, shared: ['lobby', 'cafeteria', 'schoolOffice', 'toilets'], upper: ['toilets'] },
};
const LIFT_FROM = 4;       // floors from which a building has a lift as well as stairs, and a lobby to take it from
const CORE_IN_MIDDLE = new Set(['office', 'hotel', 'apartments', 'hospital', 'dorm', 'nursingHome']);
const CORE_IN_CORNER = new Set(['parking', 'warehouse', 'factory', 'hangar', 'stadium', 'carGarage', 'fireStation', 'supermarket', 'mall', 'departmentStore', 'terminal', 'station', 'cinema', 'theatre', 'worship', 'museum', 'pool', 'gym']);
const ASPECT_MOST = 4.5;   // of a room's length to its width
const LIFT_GAP = 0.3;      // m between the stairs and the lift
const CORE_CLEAR = 1.4;    // m in front of the stairs and lift kept free on every floor
const CORE_REACH = 1.2;    // m from them that L uses them
// Layouts can improve without this changing: a saved floor stays as it was found. Only for a change a saved floor can't work without,
// add a step to upgradeFloor rather than raising FLOOR_OLDEST, which throws saved floors away.
export const FLOOR_VERSION = 3;
const FLOOR_OLDEST = 3;

// A saved floor brought up to date, or null if it's from before this game could read them.
export function upgradeFloor(record) {
  if (!record || !(record.v >= FLOOR_OLDEST)) return null;
  return record;
}
const ESSENTIAL = { ground: 4, single: 5, upper: 2 };
const ENTRANCES = ['lobby', 'bankLobby', 'hall', 'foyer', 'hospitalWaiting', 'clinicWaiting', 'policeFront', 'concourse', 'landing', 'corridor'];
const SEALED = new Set(['vault']); // no way in for the public
const BACK_ROOMS = new Set(['vault', 'bedroom', 'bathroom', 'toilets', 'stock', 'restaurantKitchen', 'bakeryKitchen', 'laundry', 'cells']); // nobody comes in this way

// In the order they're placed. must: always tried. name: what later steps call it, and a later step can take the name over.
// at: wall, across (the far wall from of), front (of of), beside (of), on (top of of), centre, around (of).
const RECIPES = {
  lobby: [
    { item: 'rug', at: 'centre', must: true },
    { item: 'frontDesk', at: 'wall', name: 'desk', must: true },
    { item: 'screen', at: 'on', of: 'desk' },
    { item: 'deskChair', at: 'front', of: 'desk', must: true, loose: true },
    { item: 'sofa', at: 'wall', name: 'seat', must: true },
    { item: 'coffeeTable', at: 'front', of: 'seat', name: 'low', must: true },
    { item: 'books', at: 'on', of: 'low' },
    { item: 'armchair', at: 'wall', loose: true, must: true },
    { item: 'armchair', at: 'wall', loose: true },
    { item: 'floorLamp', at: 'beside', of: 'seat' },
    { item: 'noticeBoard', at: 'wall', must: true },
    { item: 'plant', at: 'wall', loose: true, must: true },
    { item: 'plant', at: 'wall', loose: true },
    { item: 'bin', at: 'wall' },
  ],
  corridor: [],
  shopUnit: [
    { item: 'frontDesk', at: 'wall', name: 'desk', must: true },
    { item: 'till', at: 'on', of: 'desk', must: true },
    { item: 'clothesRack', at: 'rows', count: 6, must: true, aisle: 1.4, gap: 0.6 },
    { item: 'mannequin', at: 'wall', loose: true, must: true },
    { item: 'mannequin', at: 'wall', loose: true },
    { item: 'storeShelf', at: 'wall' },
    { item: 'displayTable', at: 'centre' },
  ],
  security: [
    { item: 'securityArch', at: 'rows', count: 3, must: true, aisle: 4, gap: 3.5, with: [{ item: 'xrayBelt', at: 'beside', must: true }] },
    { item: 'queueRope', at: 'rows', count: 6, aisle: 1, gap: 0.1 },
    { item: 'frontDesk', at: 'wall', must: true },
    { item: 'bin', at: 'wall' },
  ],
  baggage: [
    { item: 'baggageBelt', at: 'rows', count: 3, must: true, aisle: 4, gap: 3 },
    { item: 'luggageCart', at: 'wall', loose: true, must: true },
    { item: 'luggageCart', at: 'wall', loose: true },
    { item: 'departureBoard', at: 'wall', must: true },
    { item: 'seatRow', at: 'wall' },
  ],
  loadingBay: [
    { item: 'rollerDoor', at: 'wall', name: 'dock', must: true },
    { item: 'rollerDoor', at: 'beside', of: 'dock', name: 'dock', must: true },
    { item: 'rollerDoor', at: 'beside', of: 'dock', name: 'dock' },
    { item: 'forklift', at: 'centre', must: true },
    { item: 'pallet', at: 'wall', must: true },
    { item: 'pallet', at: 'wall' },
    { item: 'pallet', at: 'wall' },
    { item: 'box', at: 'wall', loose: true },
    { item: 'toolChest', at: 'wall' },
  ],
  produce: [
    { item: 'produceStand', at: 'rows', count: 12, must: true, aisle: 1.6, gap: 0.5 },
    { item: 'fridgeCase', at: 'wall' },
    { item: 'bin', at: 'wall' },
  ],
  bankLobby: [
    { item: 'rug', at: 'centre', must: true },
    { item: 'frontDesk', at: 'wall', name: 'desk', must: true },
    { item: 'screen', at: 'on', of: 'desk', must: true },
    { item: 'deskChair', at: 'front', of: 'desk', must: true, loose: true },
    { item: 'atm', at: 'wall', name: 'atms', must: true },
    { item: 'atm', at: 'beside', of: 'atms' },
    { item: 'armchair', at: 'wall', must: true, loose: true },
    { item: 'armchair', at: 'wall', loose: true },
    { item: 'noticeBoard', at: 'wall' },
    { item: 'plant', at: 'wall', must: true, loose: true },
    { item: 'plant', at: 'wall', loose: true },
  ],
  gymFloor: [
    { item: 'treadmill', at: 'rows', count: 6, must: true, aisle: 1, gap: 0.6 },
    { item: 'weightRack', at: 'wall', must: true },
    { item: 'benchPress', at: 'wall', must: true },
    { item: 'benchPress', at: 'wall' },
    { item: 'punchBag', at: 'wall' },
    { item: 'mat', at: 'centre' },
    { item: 'whiteboard', at: 'wall' },
  ],
  studio: [
    { item: 'rug', at: 'centre', must: true },
    { item: 'mat', at: 'wall' },
    { item: 'mat', at: 'wall' },
    { item: 'bench', at: 'wall' },
    { item: 'speakerStand', at: 'wall' },
  ],
  lockerRoom: [
    { item: 'locker', at: 'wall', name: 'row', must: true },
    { item: 'locker', at: 'beside', of: 'row', name: 'row', must: true },
    { item: 'locker', at: 'beside', of: 'row', name: 'row' },
    { item: 'bench', at: 'centre', must: true },
    { item: 'basin', at: 'wall', must: true },
    { item: 'bath', at: 'wall' },
  ],
  poolHall: [
    { item: 'poolWater', at: 'centre', must: true },
    { item: 'lounger', at: 'wall', must: true },
    { item: 'lounger', at: 'wall', must: true },
    { item: 'lounger', at: 'wall' },
    { item: 'lounger', at: 'wall' },
    { item: 'bench', at: 'wall' },
    { item: 'plant', at: 'wall', loose: true },
  ],
  foyer: [
    { item: 'rug', at: 'centre', must: true },
    { item: 'frontDesk', at: 'wall', name: 'desk', must: true },
    { item: 'till', at: 'on', of: 'desk', must: true },
    { item: 'barCounter', at: 'wall', name: 'bar', must: true },
    { item: 'menuBoard', at: 'wall', must: true },
    { item: 'noticeBoard', at: 'wall' },
    { item: 'sofa', at: 'wall' },
    { item: 'bin', at: 'wall' },
    { item: 'plant', at: 'wall', loose: true },
  ],
  auditorium: [
    { item: 'cinemaScreen', at: 'wall', name: 'screen', must: true },
    { item: 'seatRow', at: 'rows', towards: 'screen', count: 30, must: true, aisle: 0.8, gap: 0.05 },
  ],
  auditorium2: [
    { item: 'stagePlatform', at: 'wall', name: 'stage', must: true },
    { item: 'seatRow', at: 'rows', towards: 'stage', count: 40, must: true, aisle: 0.8, gap: 0.05 },
  ],
  pitch: [
    { item: 'fieldMarks', at: 'centre', must: true },
    { item: 'bench', at: 'wall', must: true },
    { item: 'bench', at: 'wall' },
  ],
  stand: [
    { item: 'bleacher', at: 'rows', count: 16, must: true, aisle: 1.2, gap: 0.3 },
    { item: 'bin', at: 'wall' },
    { item: 'vendingMachine', at: 'wall' },
  ],
  barRoom: [
    { item: 'barCounter', at: 'wall', name: 'bar', must: true },
    { item: 'barCounter', at: 'beside', of: 'bar', name: 'bar2' },
    { item: 'barStool', at: 'front', of: 'bar', face: true, must: true, gap: 0.1 },
    { item: 'barStool', at: 'front', of: 'bar2', face: true, gap: 0.1 },
    { item: 'till', at: 'on', of: 'bar', must: true },
    { item: 'poolTable', at: 'centre' },
    { item: 'diningTable', at: 'rows', count: 5, aisle: 1.6, gap: 1.1, with: [{ item: 'chair', at: 'around', count: 4 }] },
    { item: 'bookcase', at: 'wall' },
  ],
  fastFoodFloor: [
    { item: 'barCounter', at: 'wall', name: 'bar', must: true },
    { item: 'till', at: 'on', of: 'bar', must: true },
    { item: 'menuBoard', at: 'wall', must: true },
    { item: 'queueRope', at: 'front', of: 'bar' },
    { item: 'booth', at: 'rows', count: 10, must: true, aisle: 1.5, gap: 0.7 },
    { item: 'bin', at: 'wall', must: true },
    { item: 'vendingMachine', at: 'wall' },
  ],
  bakeryShop: [
    { item: 'displayCase', at: 'wall', name: 'cases', must: true },
    { item: 'displayCase', at: 'beside', of: 'cases', name: 'cases', must: true },
    { item: 'barCounter', at: 'wall', name: 'bar', must: true },
    { item: 'till', at: 'on', of: 'bar', must: true },
    { item: 'coffeeMachine', at: 'on', of: 'bar' },
    { item: 'breadRack', at: 'wall', must: true },
    { item: 'breadRack', at: 'wall' },
    { item: 'diningTable', at: 'centre', name: 'table' },
    { item: 'chair', at: 'around', of: 'table', count: 2 },
  ],
  bakeryKitchen: [
    { item: 'proStove', at: 'wall', name: 'run', must: true },
    { item: 'proStove', at: 'beside', of: 'run', name: 'run' },
    { item: 'prepTable', at: 'centre', must: true },
    { item: 'breadRack', at: 'wall', must: true },
    { item: 'sink', at: 'wall', must: true },
    { item: 'box', at: 'wall', loose: true },
  ],
  laundryRoom: [
    { item: 'washer', at: 'wall', name: 'run', must: true },
    { item: 'washer', at: 'beside', of: 'run', name: 'run', must: true },
    { item: 'washer', at: 'beside', of: 'run', name: 'run', must: true },
    { item: 'washer', at: 'beside', of: 'run', name: 'run' },
    { item: 'washer', at: 'wall', name: 'run2' },
    { item: 'washer', at: 'beside', of: 'run2', name: 'run2' },
    { item: 'prepTable', at: 'centre', must: true },
    { item: 'bench', at: 'wall', must: true },
    { item: 'vendingMachine', at: 'wall' },
    { item: 'bin', at: 'wall' },
  ],
  concourse: [
    { item: 'departureBoard', at: 'wall', must: true },
    { item: 'frontDesk', at: 'wall', name: 'desk', must: true },
    { item: 'till', at: 'on', of: 'desk' },
    { item: 'ticketMachine', at: 'wall', name: 'machines', must: true },
    { item: 'ticketMachine', at: 'beside', of: 'machines', name: 'machines' },
    { item: 'turnstile', at: 'centre', must: true },
    { item: 'seatRow', at: 'rows', count: 6, aisle: 2, gap: 1 },
    { item: 'vendingMachine', at: 'wall' },
    { item: 'bin', at: 'wall' },
  ],
  platform: [
    { item: 'railTrack', at: 'wall', name: 'line', must: true },
    { item: 'railTrack', at: 'beside', of: 'line', name: 'line' },
    { item: 'departureBoard', at: 'wall', must: true },
    { item: 'seatRow', at: 'wall' },
    { item: 'seatRow', at: 'wall' },
    { item: 'bin', at: 'wall' },
    { item: 'vendingMachine', at: 'wall' },
  ],
  gasShop: [
    { item: 'frontDesk', at: 'wall', name: 'desk', must: true },
    { item: 'till', at: 'on', of: 'desk', must: true },
    { item: 'fridgeCase', at: 'wall', name: 'cold', must: true },
    { item: 'fridgeCase', at: 'beside', of: 'cold' },
    { item: 'storeShelf', at: 'rows', count: 8, must: true, aisle: 1.4, gap: 0.05 },
    { item: 'coffeeMachine', at: 'on', of: 'desk' },
    { item: 'bin', at: 'wall' },
  ],
  workBay: [
    { item: 'carLift', at: 'rows', count: 3, must: true, aisle: 2, gap: 1 },
    { item: 'toolChest', at: 'wall', must: true },
    { item: 'workbench', at: 'wall', must: true },
    { item: 'tireStack', at: 'wall', loose: true, must: true },
    { item: 'tireStack', at: 'wall', loose: true },
    { item: 'tireStack', at: 'wall', loose: true },
    { item: 'parkedCar', at: 'wall' },
  ],
  showroom: [
    { item: 'parkedCar', at: 'rows', count: 6, must: true, aisle: 2, gap: 1.5 },
    { item: 'desk', at: 'wall', name: 'desk', must: true },
    { item: 'chair', at: 'front', of: 'desk', face: true, must: true },
    { item: 'plant', at: 'wall', loose: true },
    { item: 'armchair', at: 'wall', loose: true },
  ],
  engineBay: [
    { item: 'fireEngine', at: 'rows', count: 3, must: true, aisle: 1.6, gap: 1.8, along: false },
    { item: 'gearRack', at: 'wall', must: true },
    { item: 'toolChest', at: 'wall', must: true },
    { item: 'workbench', at: 'wall' },
    { item: 'pallet', at: 'wall' },
  ],
  gearRoom: [
    { item: 'gearRack', at: 'wall', must: true },
    { item: 'gearRack', at: 'wall', must: true },
    { item: 'locker', at: 'wall', must: true },
    { item: 'bench', at: 'wall' },
    { item: 'box', at: 'wall', loose: true },
  ],
  bunkRoom: [
    { item: 'bunk', at: 'rows', count: 6, must: true, aisle: 1.2, gap: 0.8 },
    { item: 'locker', at: 'wall', must: true },
    { item: 'locker', at: 'wall' },
    { item: 'bench', at: 'wall' },
  ],
  policeFront: [
    { item: 'frontDesk', at: 'wall', name: 'desk', must: true },
    { item: 'screen', at: 'on', of: 'desk', must: true },
    { item: 'deskChair', at: 'front', of: 'desk', must: true, loose: true },
    { item: 'seatRow', at: 'wall', must: true },
    { item: 'noticeBoard', at: 'wall', must: true },
    { item: 'filingCabinet', at: 'wall' },
    { item: 'plant', at: 'wall', loose: true },
  ],
  cells: [
    { item: 'policeCell', at: 'wall', name: 'cell', must: true },
    { item: 'policeCell', at: 'beside', of: 'cell', name: 'cell', must: true },
    { item: 'policeCell', at: 'beside', of: 'cell', name: 'cell' },
    { item: 'chair', at: 'wall', loose: true },
  ],
  postCounter: [
    { item: 'tellerCounter', at: 'wall', name: 'counter', must: true },
    { item: 'scales', at: 'on', of: 'counter', must: true },
    { item: 'mailboxes', at: 'wall', must: true },
    { item: 'mailboxes', at: 'wall' },
    { item: 'queueRope', at: 'front', of: 'counter' },
    { item: 'noticeBoard', at: 'wall' },
    { item: 'bench', at: 'wall' },
  ],
  sorting: [
    { item: 'storeShelf', at: 'rows', count: 8, must: true, aisle: 1.6, gap: 0.1 },
    { item: 'prepTable', at: 'centre', must: true },
    { item: 'box', at: 'wall', loose: true, must: true },
    { item: 'box', at: 'wall', loose: true },
    { item: 'box', at: 'wall', loose: true },
    { item: 'pallet', at: 'wall' },
  ],
  eventHall: [
    { item: 'stagePlatform', at: 'wall', name: 'stage', must: true },
    { item: 'seatRow', at: 'rows', towards: 'stage', count: 16, must: true, aisle: 1, gap: 0.3 },
    { item: 'noticeBoard', at: 'wall' },
    { item: 'plant', at: 'wall', loose: true },
  ],
  stacks: [
    { item: 'bookStack', at: 'rows', count: 24, must: true, aisle: 1.4, gap: 0.1 },
    { item: 'frontDesk', at: 'wall', name: 'desk', must: true },
    { item: 'screen', at: 'on', of: 'desk' },
    { item: 'bench', at: 'wall' },
    { item: 'plant', at: 'wall', loose: true },
  ],
  readingRoom: [
    { item: 'diningTable', at: 'rows', count: 8, must: true, aisle: 1.8, gap: 1.2, with: [{ item: 'chair', at: 'around', count: 4 }] },
    { item: 'bookcase', at: 'wall', must: true },
    { item: 'bookcase', at: 'wall' },
    { item: 'armchair', at: 'wall', loose: true },
    { item: 'floorLamp', at: 'wall' },
  ],
  playRoom: [
    { item: 'rug', at: 'centre', must: true },
    { item: 'tinyTable', at: 'rows', count: 4, must: true, aisle: 1.2, gap: 1, with: [{ item: 'tinyChair', at: 'around', count: 4 }] },
    { item: 'toyBox', at: 'wall', must: true, loose: true },
    { item: 'toyBox', at: 'wall', loose: true },
    { item: 'locker', at: 'wall', must: true },
    { item: 'bookcase', at: 'wall' },
    { item: 'whiteboard', at: 'wall' },
  ],
  dormRoom: [
    { item: 'bunk', at: 'wall', name: 'bed', must: true },
    { item: 'bed', at: 'wall' },
    { item: 'desk', at: 'wall', name: 'desk', must: true },
    { item: 'chair', at: 'front', of: 'desk', face: true, must: true },
    { item: 'screen', at: 'on', of: 'desk' },
    { item: 'wardrobe', at: 'wall', must: true },
    { item: 'box', at: 'wall', loose: true },
  ],
  examRoom: [
    { item: 'examTable', at: 'wall', must: true },
    { item: 'desk', at: 'wall', name: 'desk', must: true },
    { item: 'chair', at: 'front', of: 'desk', face: true, must: true },
    { item: 'screen', at: 'on', of: 'desk' },
    { item: 'basin', at: 'wall', must: true },
    { item: 'medCart', at: 'wall', loose: true },
    { item: 'chair', at: 'wall', loose: true },
  ],
  operatingRoom: [
    { item: 'operatingTable', at: 'centre', name: 'table', must: true },
    { item: 'surgeryLamp', at: 'beside', of: 'table', must: true },
    { item: 'medCart', at: 'wall', must: true, loose: true },
    { item: 'medCart', at: 'wall', loose: true },
    { item: 'dripStand', at: 'wall', must: true },
    { item: 'basin', at: 'wall', must: true },
    { item: 'filingCabinet', at: 'wall' },
  ],
  scanRoom: [
    { item: 'scanner', at: 'wall', must: true },
    { item: 'desk', at: 'wall', name: 'desk', must: true },
    { item: 'screen', at: 'on', of: 'desk', must: true },
    { item: 'chair', at: 'front', of: 'desk', face: true },
    { item: 'wheelchair', at: 'wall', loose: true },
  ],
  nurseStation: [
    { item: 'frontDesk', at: 'wall', name: 'desk', must: true },
    { item: 'screen', at: 'on', of: 'desk', must: true },
    { item: 'deskChair', at: 'front', of: 'desk', must: true, loose: true },
    { item: 'filingCabinet', at: 'wall', must: true },
    { item: 'medCart', at: 'wall', loose: true },
    { item: 'wheelchair', at: 'wall', loose: true },
  ],
  clinicWaiting: [
    { item: 'frontDesk', at: 'wall', name: 'desk', must: true },
    { item: 'screen', at: 'on', of: 'desk', must: true },
    { item: 'seatRow', at: 'wall', must: true },
    { item: 'seatRow', at: 'wall' },
    { item: 'noticeBoard', at: 'wall' },
    { item: 'plant', at: 'wall', loose: true },
    { item: 'coffeeTable', at: 'centre' },
  ],
  kennels: [
    { item: 'petCage', at: 'wall', name: 'cages', must: true },
    { item: 'petCage', at: 'beside', of: 'cages', name: 'cages', must: true },
    { item: 'petCage', at: 'beside', of: 'cages', name: 'cages' },
    { item: 'petCage', at: 'wall' },
    { item: 'basin', at: 'wall' },
    { item: 'box', at: 'wall', loose: true },
  ],
  pharmacyFloor: [
    { item: 'frontDesk', at: 'wall', name: 'desk', must: true },
    { item: 'till', at: 'on', of: 'desk', must: true },
    { item: 'filingCabinet', at: 'wall', must: true },
    { item: 'storeShelf', at: 'rows', count: 12, must: true, aisle: 1.5, gap: 0.05 },
    { item: 'fridgeCase', at: 'wall' },
    { item: 'seatRow', at: 'wall' },
  ],
  salonFloor: [
    { item: 'frontDesk', at: 'wall', name: 'desk', must: true },
    { item: 'till', at: 'on', of: 'desk', must: true },
    { item: 'basin', at: 'wall', must: true },
    { item: 'salonMirror', at: 'rows', count: 6, must: true, aisle: 1.8, gap: 0.5, with: [{ item: 'salonChair', at: 'front', face: true, gap: 0.3 }] },
    { item: 'bench', at: 'wall' },
    { item: 'plant', at: 'wall', loose: true },
  ],
  careRoom: [
    { item: 'hospitalBed', at: 'wall', name: 'bed', must: true },
    { item: 'nightstand', at: 'beside', of: 'bed', name: 'stand', must: true },
    { item: 'tableLamp', at: 'on', of: 'stand' },
    { item: 'armchair', at: 'wall', must: true, loose: true },
    { item: 'wheelchair', at: 'wall', loose: true },
    { item: 'wardrobe', at: 'wall' },
    { item: 'plant', at: 'wall', loose: true },
  ],
  lounge: [
    { item: 'rug', at: 'centre' },
    { item: 'sofa', at: 'wall', name: 'seat', must: true },
    { item: 'armchair', at: 'wall', must: true, loose: true },
    { item: 'armchair', at: 'wall', loose: true },
    { item: 'tvStand', at: 'wall', name: 'stand', must: true },
    { item: 'tv', at: 'on', of: 'stand', must: true },
    { item: 'bookcase', at: 'wall' },
    { item: 'diningTable', at: 'centre', name: 'table' },
    { item: 'chair', at: 'around', of: 'table', count: 4 },
    { item: 'plant', at: 'wall', loose: true },
  ],
  parkingDeck: [
    { item: 'parkedCar', at: 'wall', must: true },
    { item: 'parkedCar', at: 'wall' },
    { item: 'ticketMachine', at: 'wall', must: true },
    { item: 'cone', at: 'wall', loose: true },
  ],
  landing: [
    { item: 'plant', at: 'wall', loose: true },
    { item: 'noticeBoard', at: 'wall' },
  ],
  mailroom: [
    { item: 'mailboxes', at: 'wall', name: 'boxes', must: true },
    { item: 'mailboxes', at: 'beside', of: 'boxes' },
    { item: 'noticeBoard', at: 'wall', must: true },
    { item: 'bench', at: 'wall' },
    { item: 'box', at: 'wall', loose: true },
    { item: 'bin', at: 'wall' },
  ],
  gym: [
    { item: 'treadmill', at: 'rows', count: 6, must: true },
    { item: 'bench', at: 'wall' },
    { item: 'mat', at: 'centre' },
    { item: 'locker', at: 'wall' },
  ],
  workshop: [
    { item: 'workbench', at: 'wall', must: true },
    { item: 'toolChest', at: 'wall', must: true },
    { item: 'bookcase', at: 'wall' },
    { item: 'box', at: 'wall', loose: true },
    { item: 'box', at: 'wall', loose: true },
    { item: 'bin', at: 'wall' },
  ],
  hotelRoom: [
    { item: 'rug', at: 'centre', chance: 0.5 },
    { item: 'bed', at: 'wall', name: 'bed', must: true },
    { item: 'nightstand', at: 'beside', of: 'bed', name: 'stand', must: true },
    { item: 'tableLamp', at: 'on', of: 'stand' },
    { item: 'nightstand', at: 'beside', of: 'bed' },
    { item: 'tvStand', at: 'across', of: 'bed', name: 'stand2', must: true },
    { item: 'tv', at: 'on', of: 'stand2', must: true },
    { item: 'armchair', at: 'wall', loose: true },
    { item: 'wardrobe', at: 'wall' },
  ],
  openPlan: [
    { item: 'desk', at: 'rows', count: 24, must: true, aisle: 1.5, with: [{ item: 'chair', at: 'front', face: true, loose: true }, { item: 'screen', at: 'on', must: true }] },
    { item: 'filingCabinet', at: 'wall' },
    { item: 'filingCabinet', at: 'wall' },
    { item: 'printer', at: 'wall' },
    { item: 'whiteboard', at: 'wall' },
    { item: 'plant', at: 'wall', loose: true },
    { item: 'bin', at: 'wall' },
  ],
  privateOffice: [
    { item: 'desk', at: 'wall', name: 'desk', must: true },
    { item: 'deskChair', at: 'front', of: 'desk', face: true, must: true, loose: true },
    { item: 'screen', at: 'on', of: 'desk', must: true },
    { item: 'filingCabinet', at: 'wall' },
    { item: 'bookcase', at: 'wall' },
    { item: 'armchair', at: 'wall', loose: true },
    { item: 'plant', at: 'wall', loose: true },
  ],
  meeting: [
    { item: 'diningTable', at: 'centre', name: 'table', must: true },
    { item: 'chair', at: 'around', of: 'table', must: true, count: 8 },
    { item: 'whiteboard', at: 'wall', must: true },
    { item: 'tvStand', at: 'wall', name: 'stand' },
    { item: 'tv', at: 'on', of: 'stand' },
  ],
  breakRoom: [
    { item: 'counter', at: 'wall', name: 'run', also: 'top', must: true },
    { item: 'sink', at: 'beside', of: 'run', name: 'run', must: true },
    { item: 'fridge', at: 'beside', of: 'run', name: 'run', must: true },
    { item: 'coffeeMachine', at: 'on', of: 'top', must: true },
    { item: 'microwave', at: 'on', of: 'top' },
    { item: 'diningTable', at: 'centre', name: 'table' },
    { item: 'chair', at: 'around', of: 'table', count: 6 },
    { item: 'bin', at: 'wall' },
  ],
  toilets: [
    { item: 'stall', at: 'rows', count: 4, must: true, along: true },
    { item: 'basin', at: 'wall', must: true },
    { item: 'basin', at: 'wall' },
    { item: 'bin', at: 'wall' },
  ],
  bankHall: [
    { item: 'tellerCounter', at: 'wall', name: 'counter', must: true, faceIn: true },
    { item: 'screen', at: 'on', of: 'counter' },
    { item: 'tellerCounter', at: 'beside', of: 'counter', name: 'counter', must: true },
    { item: 'queueRope', at: 'front', of: 'counter', must: true },
    { item: 'bench', at: 'wall' },
    { item: 'plant', at: 'wall', loose: true },
  ],
  vault: [
    { item: 'safeWall', at: 'wall', must: true },
    { item: 'safeWall', at: 'wall' },
    { item: 'vaultDoor', at: 'wall', must: true },
    { item: 'cashCart', at: 'wall', loose: true },
    { item: 'prepTable', at: 'centre' },
  ],
  records: [
    { item: 'filingCabinet', at: 'rows', count: 16, must: true, aisle: 1.2 },
    { item: 'box', at: 'wall', loose: true },
  ],
  restaurantDining: [
    { item: 'diningTable', at: 'rows', count: 12, must: true, aisle: 1.6, gap: 1.2, with: [{ item: 'chair', at: 'around', count: 4 }] },
    { item: 'frontDesk', at: 'wall' },
    { item: 'plant', at: 'wall', loose: true },
    { item: 'plant', at: 'wall', loose: true },
  ],
  restaurantKitchen: [
    { item: 'proStove', at: 'wall', name: 'run', must: true },
    { item: 'proStove', at: 'beside', of: 'run', name: 'run' },
    { item: 'sink', at: 'beside', of: 'run', name: 'run', must: true },
    { item: 'prepTable', at: 'centre', must: true },
    { item: 'walkInFridge', at: 'wall', must: true },
    { item: 'bookcase', at: 'wall' },
    { item: 'bin', at: 'wall' },
  ],
  cafe: [
    { item: 'barCounter', at: 'wall', name: 'bar', must: true },
    { item: 'coffeeMachine', at: 'on', of: 'bar', must: true },
    { item: 'till', at: 'on', of: 'bar', must: true },
    { item: 'diningTable', at: 'rows', count: 8, aisle: 1.6, gap: 1.2, must: true, with: [{ item: 'chair', at: 'around', count: 4 }] },
    { item: 'plant', at: 'wall', loose: true },
  ],
  salesFloor: [
    { item: 'frontDesk', at: 'wall', name: 'desk', must: true },
    { item: 'till', at: 'on', of: 'desk', must: true },
    { item: 'clothesRack', at: 'rows', count: 10, must: true, aisle: 1.5, gap: 0.8 },
    { item: 'displayTable', at: 'centre' },
    { item: 'mannequin', at: 'wall', loose: true },
    { item: 'mannequin', at: 'wall', loose: true },
    { item: 'storeShelf', at: 'wall' },
    { item: 'storeShelf', at: 'wall' },
  ],
  stock: [
    { item: 'storeShelf', at: 'wall', must: true },
    { item: 'storeShelf', at: 'wall' },
    { item: 'box', at: 'wall', loose: true },
    { item: 'box', at: 'wall', loose: true },
    { item: 'box', at: 'wall', loose: true },
  ],
  aisles: [
    { item: 'frontDesk', at: 'wall', name: 'desk', must: true },
    { item: 'till', at: 'on', of: 'desk', must: true },
    { item: 'fridgeCase', at: 'wall', name: 'cold', must: true },
    { item: 'fridgeCase', at: 'beside', of: 'cold', name: 'cold' },
    { item: 'storeShelf', at: 'rows', count: 60, must: true, aisle: 1.8, gap: 0.05 },
    { item: 'bin', at: 'wall' },
  ],
  foodCourt: [
    { item: 'barCounter', at: 'wall', name: 'bar', must: true },
    { item: 'barCounter', at: 'beside', of: 'bar', name: 'bar', must: true },
    { item: 'proStove', at: 'beside', of: 'bar', name: 'bar' },
    { item: 'diningTable', at: 'rows', count: 16, aisle: 1.8, gap: 1.4, must: true, with: [{ item: 'chair', at: 'around', count: 4 }] },
    { item: 'bin', at: 'wall' },
    { item: 'plant', at: 'wall', loose: true },
  ],
  classroom: [
    { item: 'whiteboard', at: 'wall', name: 'board', must: true },
    { item: 'desk', at: 'front', of: 'board', must: true },
    { item: 'schoolDesk', at: 'rows', towards: 'board', count: 24, aisle: 0.9, gap: 0.5, must: true },
    { item: 'bookcase', at: 'wall' },
    { item: 'locker', at: 'wall' },
    { item: 'bin', at: 'wall' },
  ],
  cafeteria: [
    { item: 'barCounter', at: 'wall', name: 'bar', must: true },
    { item: 'barCounter', at: 'beside', of: 'bar', name: 'bar' },
    { item: 'pew', at: 'rows', count: 20, must: true, aisle: 1.3, gap: 0.3 },
    { item: 'bin', at: 'wall' },
  ],
  schoolOffice: [
    { item: 'desk', at: 'wall', name: 'desk', must: true },
    { item: 'chair', at: 'front', of: 'desk', face: true, must: true },
    { item: 'screen', at: 'on', of: 'desk' },
    { item: 'filingCabinet', at: 'wall' },
    { item: 'filingCabinet', at: 'wall' },
    { item: 'bookcase', at: 'wall' },
  ],
  hospitalWaiting: [
    { item: 'frontDesk', at: 'wall', name: 'desk', must: true },
    { item: 'screen', at: 'on', of: 'desk', must: true },
    { item: 'deskChair', at: 'front', of: 'desk', must: true, loose: true },
    { item: 'seatRow', at: 'rows', count: 8, must: true, aisle: 1.5, gap: 0.3 },
    { item: 'wheelchair', at: 'wall', must: true, loose: true },
    { item: 'noticeBoard', at: 'wall' },
    { item: 'plant', at: 'wall', loose: true },
  ],
  ward: [
    { item: 'hospitalBed', at: 'rows', count: 8, must: true, aisle: 1.6, gap: 0.9, with: [{ item: 'dripStand', at: 'beside' }, { item: 'medCart', at: 'beside', chance: 0.25 }] },
    { item: 'basin', at: 'wall' },
    { item: 'filingCabinet', at: 'wall' },
    { item: 'chair', at: 'wall', loose: true },
    { item: 'wheelchair', at: 'wall', loose: true },
  ],
  worshipHall: [
    { item: 'altar', at: 'wall', name: 'front', must: true },
    { item: 'pew', at: 'rows', towards: 'front', count: 24, must: true, aisle: 0.9, gap: 0.2 },
    { item: 'plant', at: 'wall', loose: true },
    { item: 'plant', at: 'wall', loose: true },
    { item: 'sideTable', at: 'wall' },
  ],
  gallery: [
    { item: 'wallPicture', at: 'wall', must: true },
    { item: 'wallPicture', at: 'wall', must: true },
    { item: 'wallPicture', at: 'wall' },
    { item: 'wallPicture', at: 'wall' },
    { item: 'displayCase', at: 'rows', count: 12, must: true, aisle: 2.2, gap: 2 },
    { item: 'plinth', at: 'wall' },
    { item: 'plinth', at: 'wall' },
    { item: 'bench', at: 'centre' },
    { item: 'bookcase', at: 'wall' },
  ],
  racking: [
    { item: 'palletRack', at: 'rows', count: 70, must: true, aisle: 2.8, gap: 0.05 },
    { item: 'forklift', at: 'wall', must: true },
    { item: 'pallet', at: 'wall' },
    { item: 'pallet', at: 'wall' },
    { item: 'pallet', at: 'wall' },
  ],
  machines: [
    { item: 'machine', at: 'rows', count: 20, must: true, aisle: 2.5, gap: 1.5 },
    { item: 'conveyor', at: 'wall', name: 'line', must: true },
    { item: 'conveyor', at: 'beside', of: 'line', name: 'line' },
    { item: 'toolChest', at: 'wall' },
    { item: 'pallet', at: 'wall' },
  ],
  hangarBay: [
    { item: 'plane', at: 'centre', must: true },
    { item: 'toolChest', at: 'wall', must: true },
    { item: 'workbench', at: 'wall' },
    { item: 'box', at: 'wall', loose: true },
  ],
  checkIn: [
    { item: 'checkInDesk', at: 'wall', name: 'line', must: true },
    { item: 'checkInDesk', at: 'beside', of: 'line', name: 'line', must: true },
    { item: 'checkInDesk', at: 'beside', of: 'line', name: 'line' },
    { item: 'checkInDesk', at: 'beside', of: 'line', name: 'line' },
    { item: 'departureBoard', at: 'wall', must: true },
    { item: 'queueRope', at: 'rows', count: 8, aisle: 1, gap: 0.1 },
    { item: 'seatRow', at: 'wall' },
    { item: 'plant', at: 'wall', loose: true },
  ],
  gates: [
    { item: 'checkInDesk', at: 'wall', must: true },
    { item: 'departureBoard', at: 'wall', must: true },
    { item: 'seatRow', at: 'rows', count: 40, must: true, aisle: 1.4, gap: 0.3 },
    { item: 'bin', at: 'wall' },
    { item: 'plant', at: 'wall', loose: true },
  ],
  living: [
    { item: 'rug', at: 'centre', chance: 0.7 },
    { item: 'sofa', at: 'wall', name: 'seat', must: true },
    { item: 'tvStand', at: 'across', of: 'seat', name: 'stand', must: true },
    { item: 'tv', at: 'on', of: 'stand', must: true },
    { item: 'coffeeTable', at: 'front', of: 'seat', name: 'low' },
    { item: 'books', at: 'on', of: 'low' },
    { item: 'armchair', at: 'wall', loose: true },
    { item: 'floorLamp', at: 'beside', of: 'seat' },
    { item: 'bookcase', at: 'wall' },
    { item: 'sideTable', at: 'wall', name: 'side' },
    { item: 'tableLamp', at: 'on', of: 'side' },
    { item: 'radio', at: 'on', of: 'side' },
    { item: 'plant', at: 'wall', loose: true },
  ],
  kitchen: [
    { item: 'fridge', at: 'wall', name: 'run', must: true },
    { item: 'stove', at: 'beside', of: 'run', name: 'run', must: true },
    { item: 'sink', at: 'beside', of: 'run', name: 'run', must: true },
    { item: 'counter', at: 'beside', of: 'run', name: 'run', also: 'top', must: true },
    { item: 'microwave', at: 'on', of: 'top' },
    { item: 'counter', at: 'beside', of: 'run', name: 'run', also: 'top' },
    { item: 'coffeeMachine', at: 'on', of: 'top' },
    { item: 'toaster', at: 'on', of: 'top' },
    { item: 'bin', at: 'wall' },
    { item: 'smallPlant', at: 'on', of: 'top' },
  ],
  dining: [
    { item: 'rug', at: 'centre', chance: 0.5 },
    { item: 'diningTable', at: 'centre', name: 'table', must: true },
    { item: 'chair', at: 'around', of: 'table', must: true, count: 6 },
    { item: 'smallPlant', at: 'on', of: 'table' },
    { item: 'sideTable', at: 'wall', name: 'side' },
    { item: 'tableLamp', at: 'on', of: 'side' },
    { item: 'plant', at: 'wall', loose: true },
  ],
  bedroom: [
    { item: 'rug', at: 'centre', chance: 0.6 },
    { item: 'bed', at: 'wall', name: 'bed', must: true },
    { item: 'nightstand', at: 'beside', of: 'bed', name: 'stand', must: true },
    { item: 'tableLamp', at: 'on', of: 'stand' },
    { item: 'nightstand', at: 'beside', of: 'bed' },
    { item: 'wardrobe', at: 'wall', must: true },
    { item: 'desk', at: 'wall', name: 'desk', chance: 0.4 },
    { item: 'chair', at: 'front', of: 'desk', face: true },
    { item: 'plant', at: 'wall', loose: true },
  ],
  bathroom: [
    { item: 'toilet', at: 'wall', must: true },
    { item: 'basin', at: 'wall', must: true },
    { item: 'bath', at: 'wall', must: true },
    { item: 'bathCabinet', at: 'wall' },
    { item: 'mat', at: 'centre' },
    { item: 'bin', at: 'wall' },
  ],
  hall: [
    { item: 'mat', at: 'centre', must: true },
    { item: 'coatRack', at: 'wall', must: true },
    { item: 'bench', at: 'wall' },
    { item: 'plant', at: 'wall', loose: true },
  ],
  study: [
    { item: 'desk', at: 'wall', name: 'desk', must: true },
    { item: 'deskChair', at: 'front', of: 'desk', face: true, must: true, loose: true },
    { item: 'screen', at: 'on', of: 'desk', must: true },
    { item: 'bookcase', at: 'wall', must: true },
    { item: 'rug', at: 'centre', chance: 0.4 },
    { item: 'plant', at: 'wall', loose: true },
    { item: 'box', at: 'wall', loose: true },
  ],
  laundry: [
    { item: 'washer', at: 'wall', name: 'machine', must: true },
    { item: 'washer', at: 'beside', of: 'machine' },
    { item: 'counter', at: 'beside', of: 'machine', name: 'top' },
    { item: 'bin', at: 'wall' },
    { item: 'box', at: 'wall', loose: true },
  ],
};

// A colour for each thing that varies, by the building's style. Metal, glass, plants and lamps keep the kit's own.
const WOODS = { modern: ['c8a982', 'a58a6c', 'dcd0bb'], traditional: ['9a6a42', '7d5233', 'b07f52'], cheap: ['c79a68', 'b78d62', 'd0ae85'], luxury: ['5e3d29', '6f4630', '3f2a1e'] };
const FABRICS = { modern: ['4a6a8a', '6f7a80', '3f7a72', 'c9b79c', 'b4533f'], traditional: ['8c3f36', '4f6b45', '7b5a3a', '3f4f73', 'b08c58'], cheap: ['a56f50', '8d8a78', '6b7a8c', '9c5a52', '7c8a62'], luxury: ['2f3e5c', '6d2b36', '2f5a4f', 'c4a35a', '4a3550'] };
const FLOORS = {
  dark: ['2f3338', '35302f', '2b2f3a'], grass: ['5c8f4a', '568a46', '629650'], tile: ['bfd8e0', 'c9dfe4', 'b4d0da'],
  hard: ['9a9a96', '8f8f8a', 'a5a29a'], office: ['6d7680', '7b7f86', '5f6a73', '857f76'], smart: ['c8c2b6', 'b9b4a8', 'd6d0c2', 'a8a59c'],
  wet: ['c6ccce', 'b3bec2', 'd6d2c8', '9fb0b5'], kitchen: ['bdb6a8', 'c9c3b4', 'a9a9a4', 'b8a58a'], room: ['b79b7b', 'a8926f', 'c4ab8a', '96795a'],
  bedroom: ['a79c8e', '8f9aa3', 'b5a795', '9c8d86'],
};
const FLOOR_KIND = {
  engineBay: 'hard', gearRoom: 'hard', bunkRoom: 'bedroom', policeFront: 'smart', cells: 'hard', postCounter: 'smart', sorting: 'hard', eventHall: 'room', stacks: 'room', readingRoom: 'bedroom', playRoom: 'bedroom', dormRoom: 'bedroom', bankLobby: 'smart', gymFloor: 'hard', studio: 'room', lockerRoom: 'wet', poolHall: 'tile', foyer: 'smart', auditorium: 'dark', auditorium2: 'dark', pitch: 'grass', stand: 'hard', barRoom: 'room', fastFoodFloor: 'kitchen', bakeryShop: 'kitchen', bakeryKitchen: 'kitchen', laundryRoom: 'wet', concourse: 'smart', platform: 'hard', gasShop: 'smart', workBay: 'hard', showroom: 'smart', shopUnit: 'smart', security: 'smart', baggage: 'smart', loadingBay: 'hard', produce: 'smart', corridor: 'office', landing: 'smart', mailroom: 'smart', parkingDeck: 'hard', examRoom: 'wet', operatingRoom: 'wet', scanRoom: 'wet', nurseStation: 'wet', clinicWaiting: 'smart', kennels: 'wet', pharmacyFloor: 'smart', salonFloor: 'smart', careRoom: 'bedroom', lounge: 'room',
  bathroom: 'wet', laundry: 'wet', toilets: 'wet', ward: 'wet', hospitalWaiting: 'wet', kitchen: 'kitchen', breakRoom: 'kitchen', restaurantKitchen: 'kitchen', cafeteria: 'kitchen', bedroom: 'bedroom', hotelRoom: 'bedroom',
  openPlan: 'office', privateOffice: 'office', meeting: 'office', schoolOffice: 'office', records: 'office', classroom: 'office', workshop: 'hard', racking: 'hard', machines: 'hard', hangarBay: 'hard', stock: 'hard', vault: 'hard', gym: 'hard',
  lobby: 'smart', bankHall: 'smart', salesFloor: 'smart', aisles: 'smart', foodCourt: 'smart', checkIn: 'smart', gates: 'smart', gallery: 'smart', worshipHall: 'smart', cafe: 'room', restaurantDining: 'room',
};

const pick = (list, roll) => list[Math.floor(roll() * list.length)];
const round = (n) => Math.round(n * 100) / 100 + 0; // + 0, as -0 would not survive saving

function shuffled(list, roll) {
  const out = list.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(roll() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const toHex = (n) => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, '0');

function hsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l), f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return toHex(f(0)) + toHex(f(8)) + toHex(f(4));
}

const between = ([lo, hi], roll) => lo + (hi - lo) * roll();
const nudged = (hex, roll, by = 0.1) => {
  const shift = 1 + (roll() - 0.5) * by * 2;
  return toHex((parseInt(hex.slice(0, 2), 16) / 255) * shift) + toHex((parseInt(hex.slice(2, 4), 16) / 255) * shift) + toHex((parseInt(hex.slice(4, 6), 16) / 255) * shift);
};

// Colours by style. fabric: saturation and lightness. hues: where its colours come from, or any.
const LOOKS = {
  modern: { fabric: [[0.12, 0.4], [0.34, 0.6]], wall: [[0.02, 0.12], [0.82, 0.94]] },
  traditional: { fabric: [[0.25, 0.5], [0.3, 0.5]], wall: [[0.15, 0.35], [0.75, 0.88]], hues: [10, 55] },
  cheap: { fabric: [[0.1, 0.3], [0.4, 0.58]], wall: [[0.05, 0.2], [0.72, 0.86]] },
  luxury: { fabric: [[0.3, 0.6], [0.2, 0.38]], wall: [[0.05, 0.2], [0.68, 0.9]] },
};

// How one building looks, chosen once and saved with it, so no two are alike and it stays as it was found. Rooms draw on this, so a home holds together.
export function makeLook(style, roll) {
  const spec = LOOKS[style] || LOOKS.modern, hue = () => (spec.hues ? between(spec.hues, roll) : roll() * 360), wallHue = hue();
  const fabric = () => hsl(hue(), between(spec.fabric[0], roll), between(spec.fabric[1], roll));
  const wallS = between(spec.wall[0], roll), wallL = between(spec.wall[1], roll), floors = {};
  for (const [kind, list] of Object.entries(FLOORS)) floors[kind] = nudged(pick(list, roll), roll);
  return {
    wood: nudged(pick(WOODS[style] || WOODS.modern, roll), roll, 0.14),
    fabrics: [fabric(), fabric(), fabric()],
    wall: hsl(wallHue, wallS, wallL),
    outer: hsl(wallHue, wallS, Math.max(0.5, wallL - 0.1)),
    floors,
  };
}

function schemeFor(zone, look, roll) {
  return { wood: look.wood, fabric: pick(look.fabrics, roll), accent: pick(look.fabrics, roll), floor: nudged(look.floors[FLOOR_KIND[zone] || 'room'], roll, 0.04) };
}

export const hexColour = (hex) => [parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255];

// A material's colour in a room with this scheme, slightly different per thing by shade. kit: the kit's own colours.
export function colourFor(mat, scheme, shade, kit) {
  const tone = (hex, by = 1) => hexColour(hex).map((v) => Math.min(1, v * by * shade));
  if (mat === 'wood') return tone(scheme.wood);
  if (mat === 'woodDark') return tone(scheme.wood, 0.7);
  if (mat === 'carpet') return tone(scheme.fabric);
  if (mat === 'carpetDarker') return tone(scheme.fabric, 0.72);
  if (mat === 'carpetBlue') return tone(scheme.accent);
  return kit[mat] || [0.8, 0.8, 0.8];
}

// --- The building's frame --------------------------------------------------------------------------------------

// The angle of its longest real wall, as anticlockwise radians from east, between 0 and a right angle.
export function axisOf(pieces) {
  let best = 0, angle = 0;
  for (const piece of pieces) {
    const { pts, seam } = piece.rings[0];
    pts.forEach((a, i) => {
      const b = pts[(i + 1) % pts.length], length = Math.hypot(b.x - a.x, b.y - a.y);
      if (seam[i] || length <= best) return;
      best = length;
      angle = Math.atan2(b.y - a.y, b.x - a.x);
    });
  }
  const quarter = Math.PI / 2;
  return Math.round((((angle % quarter) + quarter) % quarter) * 1e5) / 1e5;
}

// Turns the frame's u, v into metres from the car and back. axis is saved with the floor, so it can't drift.
export function frameOf(pieces, axis) {
  const x = (Math.min(...pieces.map((p) => p.minX)) + Math.max(...pieces.map((p) => p.maxX))) / 2;
  const y = (Math.min(...pieces.map((p) => p.minY)) + Math.max(...pieces.map((p) => p.maxY))) / 2;
  const c = Math.cos(axis), s = Math.sin(axis);
  return {
    axis,
    toWorld: (u, v) => ({ x: x + u * c - v * s, y: y + u * s + v * c }),
    toFrame: (px, py) => ({ u: (px - x) * c + (py - y) * s, v: -(px - x) * s + (py - y) * c }),
  };
}

// A compass bearing in the frame, in degrees, as a bearing in the world, in radians. u is east of north by the axis.
export const worldBearing = (degrees, axis) => (degrees * Math.PI) / 180 - axis;

// --- Rooms -----------------------------------------------------------------------------------------------------

const CELL_OF = (grid) => grid.cell;

function makeGrid(pieces, frame, cell) {
  const rings = pieces.map((p) => p.rings.map((r) => r.pts));
  const isIn = (u, v) => {
    const { x, y } = frame.toWorld(u, v);
    return rings.some((r) => inRings(r, x, y));
  };
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const piece of pieces) {
    for (const p of piece.rings[0].pts) {
      const { u, v } = frame.toFrame(p.x, p.y);
      minU = Math.min(minU, u); maxU = Math.max(maxU, u); minV = Math.min(minV, v); maxV = Math.max(maxV, v);
    }
  }
  minU = Math.max(minU, -WINDOW); maxU = Math.min(maxU, WINDOW); minV = Math.max(minV, -WINDOW); maxV = Math.min(maxV, WINDOW);
  const nu = Math.max(1, Math.ceil((maxU - minU) / cell)), nv = Math.max(1, Math.ceil((maxV - minV) / cell));
  const inside = new Uint8Array(nu * nv), area = (i, j) => i + j * nu;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) inside[area(i, j)] = isIn(minU + (i + 0.5) * cell, minV + (j + 0.5) * cell) ? 1 : 0;
  return {
    cell, minU, minV, nu, nv, inside, isIn, at: area,
    wallEast: new Uint8Array(nu * nv), // a wall between this cell and the one to its east (+u)
    wallNorth: new Uint8Array(nu * nv), // and to its north (+v)
    has: (i, j) => i >= 0 && j >= 0 && i < nu && j < nv && inside[area(i, j)] === 1,
  };
}

function trim(grid, r) {
  let { i0, i1, j0, j1 } = r;
  const rowHas = (j) => { for (let i = i0; i <= i1; i++) if (grid.has(i, j)) return true; return false; };
  const colHas = (i) => { for (let j = j0; j <= j1; j++) if (grid.has(i, j)) return true; return false; };
  while (i0 <= i1 && !colHas(i0)) i0++;
  while (i0 <= i1 && !colHas(i1)) i1--;
  while (j0 <= j1 && !rowHas(j0)) j0++;
  while (j0 <= j1 && !rowHas(j1)) j1--;
  return i0 > i1 || j0 > j1 ? null : { i0, i1, j0, j1 };
}

// Cuts the floor in two again and again, each side getting about its share of the zones' targets. False if they don't all fit.
function divide(grid, rect, zones, cuts, rooms, roll) {
  const r = trim(grid, rect);
  if (!r) return false;
  if (zones.length === 1) {
    const narrowest = Math.min(r.i1 - r.i0 + 1, r.j1 - r.j0 + 1) * grid.cell;
    if (narrowest < (ROOM_WIDTH[zones[0][0]] ?? MIN_ROOM)) return false;
    if (grid.shapely && (Math.max(r.i1 - r.i0, r.j1 - r.j0) + 1) * CELL_OF(grid) > narrowest * ASPECT_MOST && zones[0][1] < 200) return false;
    rooms.push({ zone: zones[0][0], rect: r });
    return true;
  }
  const total = zones.reduce((sum, z) => sum + z[1], 0);
  let split = 1, sum = zones[0][1];
  while (split < zones.length - 1 && sum + zones[split][1] / 2 < total / 2) sum += zones[split++][1];
  const alongU = r.i1 - r.i0 >= r.j1 - r.j0, lo = alongU ? r.i0 : r.j0, hi = alongU ? r.i1 : r.j1, spanLo = alongU ? r.j0 : r.i0, spanHi = alongU ? r.j1 : r.i1;
  const has = (line, across) => (alongU ? grid.has(line, across) : grid.has(across, line));
  const minCells = Math.ceil(MIN_ROOM / grid.cell), counts = [], cellArea = grid.cell * grid.cell;
  let all = 0;
  for (let line = lo; line <= hi; line++) {
    let n = 0;
    for (let k = spanLo; k <= spanHi; k++) if (has(line, k)) n++;
    counts.push(all += n);
  }
  const wide = (part) => part && part.i1 - part.i0 + 1 >= minCells && part.j1 - part.j0 + 1 >= minCells;
  const firstZonesLow = roll() < 0.5, lowShare = firstZonesLow ? sum : total - sum; // which end of the floor gets which zones
  let cut = -1, bestMiss = Infinity;
  for (let line = lo + 1; line <= hi; line++) {
    const below = counts[line - lo - 1], above = all - below, miss = Math.abs(below / all - lowShare / total);
    if (miss >= bestMiss || below * cellArea < lowShare * MIN_SHARE || above * cellArea < (total - lowShare) * MIN_SHARE) continue;
    const a = trim(grid, alongU ? { ...r, i1: line - 1 } : { ...r, j1: line - 1 }), b = trim(grid, alongU ? { ...r, i0: line } : { ...r, j0: line });
    if (wide(a) && wide(b)) { bestMiss = miss; cut = line; }
  }
  if (cut < 0) return false;
  const edges = [];
  for (let k = spanLo; k <= spanHi; k++) {
    if (!has(cut - 1, k) || !has(cut, k)) continue;
    const index = alongU ? grid.at(cut - 1, k) : grid.at(k, cut - 1);
    (alongU ? grid.wallEast : grid.wallNorth)[index] = 1;
    edges.push({ k, index });
  }
  cuts.push({ alongU, edges });
  const first = alongU ? { ...r, i1: cut - 1 } : { ...r, j1: cut - 1 }, second = alongU ? { ...r, i0: cut } : { ...r, j0: cut };
  const [a, b] = firstZonesLow ? [first, second] : [second, first];
  return divide(grid, a, zones.slice(0, split), cuts, rooms, roll) && divide(grid, b, zones.slice(split), cuts, rooms, roll);
}

// Everyone can get from any cell they reach to any other, walls allowing and things in the way not. Gives each cell a group.
function flood(grid, blocked) {
  const group = new Int32Array(grid.nu * grid.nv).fill(-1), sizes = [];
  for (let j0 = 0; j0 < grid.nv; j0++) {
    for (let i0 = 0; i0 < grid.nu; i0++) {
      if (!grid.has(i0, j0) || group[grid.at(i0, j0)] >= 0 || blocked?.[grid.at(i0, j0)]) continue;
      const id = sizes.length, stack = [[i0, j0]];
      let size = 0;
      group[grid.at(i0, j0)] = id;
      while (stack.length) {
        const [i, j] = stack.pop();
        size++;
        const go = (ni, nj, walled) => {
          if (walled || !grid.has(ni, nj) || blocked?.[grid.at(ni, nj)] || group[grid.at(ni, nj)] >= 0) return;
          group[grid.at(ni, nj)] = id;
          stack.push([ni, nj]);
        };
        go(i + 1, j, grid.wallEast[grid.at(i, j)]);
        go(i, j + 1, grid.wallNorth[grid.at(i, j)]);
        if (i > 0) go(i - 1, j, grid.wallEast[grid.at(i - 1, j)]);
        if (j > 0) go(i, j - 1, grid.wallNorth[grid.at(i, j - 1)]);
      }
      sizes.push(size);
    }
  }
  return { group, sizes };
}

function openDoor(grid, alongU, edges, doors) {
  for (const { index } of edges) (alongU ? grid.wallEast : grid.wallNorth)[index] = 0;
  const first = edges[0].index, i = first % grid.nu, j = Math.floor(first / grid.nu), width = edges.length * grid.cell;
  const line = alongU ? grid.minU + (i + 1) * grid.cell : grid.minV + (j + 1) * grid.cell;
  const from = alongU ? grid.minV + j * grid.cell : grid.minU + i * grid.cell;
  doors.push(alongU
    ? { u0: line - DOOR_CLEAR, u1: line + DOOR_CLEAR, v0: from, v1: from + width }
    : { u0: from, u1: from + width, v0: line - DOOR_CLEAR, v1: line + DOOR_CLEAR });
}

// One doorway in each cut, on its longest unbroken stretch.
function addDoors(grid, cuts, doors, roll) {
  for (const { alongU, edges } of cuts) {
    const runs = [];
    for (const edge of edges) {
      const last = runs.at(-1);
      if (last && last.at(-1).k === edge.k - 1) last.push(edge);
      else runs.push([edge]);
    }
    const longest = runs.reduce((best, run) => (run.length > best.length ? run : best), []);
    if (!longest.length) continue;
    const edges2 = Math.ceil(DOOR_WIDTH / grid.cell), start = Math.floor(roll() * Math.max(1, longest.length - edges2 + 1));
    openDoor(grid, alongU, longest.slice(start, start + edges2), doors);
  }
}

// A cut can leave a piece of a bent building shut off. Each such piece gets a doorway too.
function joinUp(grid, cuts, doors, sealed = [], blocked = null) {
  const inSealed = (i, j) => sealed.some((r) => i >= r.i0 && i <= r.i1 && j >= r.j0 && j <= r.j1);
  for (let tries = 0; tries < 50; tries++) {
    const { group, sizes } = flood(grid, blocked);
    if (sizes.length < 2) return;
    const main = sizes.indexOf(Math.max(...sizes));
    let opened = false;
    for (const { alongU, edges } of cuts) {
      const across = (edge) => {
        const i = edge.index % grid.nu, j = Math.floor(edge.index / grid.nu);
        return [group[edge.index], alongU ? group[grid.at(i + 1, j)] : group[grid.at(i, j + 1)]];
      };
      const wall = alongU ? grid.wallEast : grid.wallNorth;
      const at = edges.findIndex((edge) => {
        const [a, b] = across(edge);
        const i = edge.index % grid.nu, j = Math.floor(edge.index / grid.nu), [ni, nj] = alongU ? [i + 1, j] : [i, j + 1];
        return wall[edge.index] && a !== b && a >= 0 && b >= 0 && (a === main || b === main) && !inSealed(i, j) && !inSealed(ni, nj);
      });
      if (at < 0) continue;
      const next = edges[at + 1]?.k === edges[at].k + 1 ? at + 1 : edges[at - 1]?.k === edges[at].k - 1 ? at - 1 : at;
      openDoor(grid, alongU, [edges[Math.min(at, next)], edges[Math.max(at, next)]].filter((e, n, list) => n === 0 || e !== list[0]), doors);
      opened = true;
      break;
    }
    if (!opened) return; // what's left can't be reached through any cut, so it's the shape of the building
  }
}

// No walls where the stairs and lift and the way to them are, as those are the same on every floor and the rooms are not.
function clearWalls(grid, { u0, v0, u1, v1 }) {
  for (let j = 0; j < grid.nv; j++) {
    for (let i = 0; i < grid.nu; i++) {
      const west = grid.minU + i * grid.cell, east = west + grid.cell, south = grid.minV + j * grid.cell, north = south + grid.cell;
      if (east >= u0 && east <= u1 && north > v0 && south < v1) grid.wallEast[grid.at(i, j)] = 0;
      if (north >= v0 && north <= v1 && east > u0 && west < u1) grid.wallNorth[grid.at(i, j)] = 0;
    }
  }
}

// The walls left, joined into straight lengths.
function wallLengths(grid) {
  const out = [];
  const run = (outer, inner, wallAt, make) => {
    for (let a = 0; a < outer; a++) {
      let start = -1;
      for (let b = 0; b <= inner; b++) {
        const on = b < inner && wallAt(a, b);
        if (on && start < 0) start = b;
        if (!on && start >= 0) {
          out.push(make(a, start, b));
          start = -1;
        }
      }
    }
  };
  run(grid.nu, grid.nv, (i, j) => grid.wallEast[grid.at(i, j)], (i, a, b) => {
    const u = grid.minU + (i + 1) * grid.cell;
    return [round(u), round(grid.minV + a * grid.cell), round(u), round(grid.minV + b * grid.cell)];
  });
  run(grid.nv, grid.nu, (j, i) => grid.wallNorth[grid.at(i, j)], (j, a, b) => {
    const v = grid.minV + (j + 1) * grid.cell;
    return [round(grid.minU + a * grid.cell), round(v), round(grid.minU + b * grid.cell), round(v)];
  });
  return out;
}

// --- Things ----------------------------------------------------------------------------------------------------

const SIDES = [
  { rot: 0, axis: 'v', low: true },     // south wall, facing north
  { rot: 180, axis: 'v', low: false },  // north wall, facing south
  { rot: 90, axis: 'u', low: true },    // west wall, facing east
  { rot: 270, axis: 'u', low: false },  // east wall, facing west
];
const FRONT = { 0: [0, 1], 180: [0, -1], 90: [1, 0], 270: [-1, 0] };

// How far a thing reaches along u and v when turned this way.
const reach = (model, rot) => (rot % 180 === 0 ? { hu: model.w / 2, hv: model.d / 2 } : { hu: model.d / 2, hv: model.w / 2 });
const boxAt = (u, v, { hu, hv }) => ({ u0: u - hu, u1: u + hu, v0: v - hv, v1: v + hv });
const overlaps = (a, b) => a.u0 < b.u1 && a.u1 > b.u0 && a.v0 < b.v1 && a.v1 > b.v0;

function blockCells(grid, was, box) {
  const blocked = was.slice();
  for (let j = 0; j < grid.nv; j++) {
    for (let i = 0; i < grid.nu; i++) {
      const u = grid.minU + (i + 0.5) * grid.cell, v = grid.minV + (j + 0.5) * grid.cell;
      if (u > box.u0 - CLEARANCE && u < box.u1 + CLEARANCE && v > box.v0 - CLEARANCE && v < box.v1 + CLEARANCE) blocked[grid.at(i, j)] = 1;
    }
  }
  return blocked;
}

class Furnisher {
  constructor(grid, doors, models, roll) {
    Object.assign(this, { grid, doors, models, roll });
    this.solids = [];
    this.flats = [];
    this.tops = new Map(); // what already stands on each thing
    this.blocked = new Uint8Array(grid.nu * grid.nv);
    this.items = [];
    this.checksLeft = Math.floor(CHECK_BUDGET / (grid.nu * grid.nv));
    this.stranded = 0;
  }

  // The stairs and lift stand where they do on every floor, whatever else that gets in the way of.
  addCore(parts) {
    const { grid } = this;
    for (const { item, model: name, u, v, rot } of parts) {
      const box = boxAt(u, v, reach(this.models[name], rot));
      this.solids.push(box);
      this.blocked = blockCells(grid, this.blocked, box);
      this.items.push([item, name, u, v, 0, rot, -1, 1]);
    }
    this.stranded = this.strandedBy(this.blocked);
  }

  // Cells that stay free: a way from the entrance to every doorway and the stairs, so nobody needs to jump to get about.
  keepRoutes(from, targets) {
    const { grid } = this, cellAt = ([u, v]) => {
      const i = Math.floor((u - grid.minU) / grid.cell), j = Math.floor((v - grid.minV) / grid.cell);
      return grid.has(i, j) && !this.blocked[grid.at(i, j)] ? grid.at(i, j) : -1;
    };
    const route = new Set(), goals = new Set(targets.map(cellAt).filter((at) => at >= 0)), start = cellAt(from);
    if (start < 0) return;
    route.add(start);
    goals.delete(start);
    while (goals.size) {
      // From everything already on the route, out to the nearest doorway not yet on it.
      const came = new Map(), queue = [...route];
      for (const at of queue) came.set(at, -1);
      let found = -1;
      for (let n = 0; n < queue.length && found < 0; n++) {
        const at = queue[n], i = at % grid.nu, j = Math.floor(at / grid.nu);
        const go = (ni, nj, walled) => {
          if (walled || !grid.has(ni, nj)) return;
          const next = grid.at(ni, nj);
          if (came.has(next) || this.blocked[next]) return;
          came.set(next, at);
          queue.push(next);
          if (goals.has(next) && found < 0) found = next;
        };
        go(i + 1, j, grid.wallEast[at]);
        go(i, j + 1, grid.wallNorth[at]);
        if (i > 0) go(i - 1, j, grid.wallEast[grid.at(i - 1, j)]);
        if (j > 0) go(i, j - 1, grid.wallNorth[grid.at(i, j - 1)]);
      }
      if (found < 0) break; // the rest can't be reached anyway, as with a sealed room
      goals.delete(found);
      for (let at = found; at !== -1 && !route.has(at); at = came.get(at)) route.add(at);
    }
    this.route = [...route];
  }

  // Grid cells cut off from the main part of the floor. Stairs can leave a pocket behind them, which is no reason to refuse everything after.
  strandedBy(blocked) {
    const { grid } = this, { sizes } = flood(grid, blocked);
    const open = blocked.reduce((n, b, at) => n + (b || !grid.inside[at] ? 0 : 1), 0);
    return open - Math.max(0, ...sizes);
  }

  // Blocks the cells a box stops a person standing in. Null if that would shut off more of the floor.
  blockFor(box) {
    if (this.checksLeft-- <= 0) return null; // full enough, for what a first visit should take
    const { grid } = this, blocked = blockCells(grid, this.blocked, box);
    if (this.route?.some((at) => blocked[at])) return null; // it would stand in the way between doors
    const stranded = this.strandedBy(blocked);
    if ((stranded - this.stranded) * grid.cell * grid.cell > STRANDED) return null;
    this.stranded = stranded;
    return blocked;
  }

  inside(box, room) {
    const { isIn } = this.grid, inRoom = box.u0 >= room.u0 && box.u1 <= room.u1 && box.v0 >= room.v0 && box.v1 <= room.v1;
    if (!inRoom) return false;
    for (let f = 0; f <= 1; f += 0.25) {
      const u = box.u0 + (box.u1 - box.u0) * f, v = box.v0 + (box.v1 - box.v0) * f;
      if (!isIn(u, box.v0) || !isIn(u, box.v1) || !isIn(box.u0, v) || !isIn(box.u1, v)) return false;
    }
    return isIn((box.u0 + box.u1) / 2, (box.v0 + box.v1) / 2);
  }

  // Puts it there if it fits, and returns what was placed.
  tryAt(step, modelName, model, u, v, rot, room, zoneIndex, z = 0) {
    const box = boxAt(u, v, reach(model, rot)), solid = isSolid(step.item), flat = ITEMS[step.item].flat;
    if (!z && !this.inside(box, room)) return null;
    if (solid) {
      if (this.solids.length >= Math.min(MOST_SOLIDS * 1.2, this.quota ?? MOST_SOLIDS)) return null;
      if (this.solids.some((other) => overlaps(box, other)) || this.doors.some((door) => overlaps(box, door))) return null;
      const blocked = this.blockFor(box);
      if (!blocked) return null;
      this.blocked = blocked;
      this.solids.push(box);
    } else if (flat) {
      if (this.flats.some((other) => overlaps(box, other)) || this.solids.some((other) => overlaps(box, other))) return null;
      this.flats.push(box);
    }
    const jitter = step.loose ? (this.roll() - 0.5) * 10 : 0;
    const placed = { item: step.item, model: modelName, u, v, z: flat ? FLOOR_LIFT : z, rot, height: model.h, size: reach(model, rot), raw: model };
    this.items.push([step.item, modelName, round(u), round(v), round(placed.z), round(rot + jitter), zoneIndex, round(0.94 + this.roll() * 0.12)]);
    return placed;
  }

  * wallSpots(model, room, sides = shuffled(SIDES, this.roll)) {
    for (const gap of SIDE_GAPS) {
      for (const side of sides) {
        const { hu, hv } = reach(model, side.rot);
        const across = side.axis === 'v' ? (side.low ? room.v0 + gap + hv : room.v1 - gap - hv) : (side.low ? room.u0 + gap + hu : room.u1 - gap - hu);
        const lo = (side.axis === 'v' ? room.u0 + hu : room.v0 + hv) + 0.05, hi = (side.axis === 'v' ? room.u1 - hu : room.v1 - hv) - 0.05;
        if (hi < lo) continue;
        const stops = shuffled([0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1], this.roll);
        for (const f of stops) {
          const along = lo + (hi - lo) * f;
          yield side.axis === 'v' ? { u: along, v: across, rot: side.rot } : { u: across, v: along, rot: side.rot };
        }
      }
    }
  }

  * spots(step, model, room, parent) {
    if (step.at === 'wall') yield* this.wallSpots(model, room);
    else if (step.at === 'across') {
      const opposite = (parent.rot + 180) % 360;
      yield* this.wallSpots(model, room, SIDES.filter((side) => side.rot === opposite));
    } else if (step.at === 'centre') {
      const u = (room.u0 + room.u1) / 2, v = (room.v0 + room.v1) / 2, along = room.u1 - room.u0 >= room.v1 - room.v0, rots = along ? [0, 90] : [90, 0];
      for (const [du, dv] of [[0, 0], [0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4], [0.8, 0], [-0.8, 0], [0, 0.8], [0, -0.8]]) for (const rot of rots) yield { u: u + du, v: v + dv, rot };
    } else if (step.at === 'front') {
      const [fu, fv] = FRONT[parent.rot], rot = step.face ? (parent.rot + 180) % 360 : parent.rot, mine = reach(model, rot);
      const out = fu ? parent.size.hu + mine.hu : parent.size.hv + mine.hv;
      for (const gap of step.gap ? [step.gap] : step.face ? [0.02, 0.15] : [0.45, 0.65, 0.3]) yield { u: parent.u + fu * (out + gap), v: parent.v + fv * (out + gap), rot };
    } else if (step.at === 'beside') {
      for (const neighbour of parent.chain) {
        const [fu, fv] = FRONT[neighbour.rot], mine = reach(model, neighbour.rot);
        const back = fu ? neighbour.size.hu - mine.hu : neighbour.size.hv - mine.hv; // lines up the backs along the wall
        const out = fu ? neighbour.size.hv + mine.hv + 0.03 : neighbour.size.hu + mine.hu + 0.03;
        for (const dir of this.roll() < 0.5 ? [1, -1] : [-1, 1]) {
          yield fu
            ? { u: neighbour.u - fu * back, v: neighbour.v + dir * out, rot: neighbour.rot }
            : { u: neighbour.u + dir * out, v: neighbour.v - fv * back, rot: neighbour.rot };
        }
      }
    }
    // What a room can't do without goes against any wall if the place it wanted is taken.
    if (step.must && step.at !== 'wall' && step.at !== 'front') yield* this.wallSpots(model, room);
  }

  // Puts down what the layout has already made room for, which needs no check that it shuts anything off.
  place(item, name, u, v, rot, zoneIndex) {
    const model = this.models[name], box = boxAt(u, v, reach(model, rot));
    if (isSolid(item)) {
      if (this.solids.length >= MOST_SOLIDS || this.solids.some((other) => overlaps(box, other)) || this.doors.some((door) => overlaps(box, door))) return false;
      this.solids.push(box);
    }
    this.items.push([item, name, round(u), round(v), ITEMS[item].flat ? FLOOR_LIFT : 0, rot, zoneIndex, round(0.94 + this.roll() * 0.12)]);
    return true;
  }

  // Things on top of another, which take up room there and never stop anyone.
  placeOn(step, parent, zoneIndex) {
    const used = this.tops.get(parent) || [];
    this.tops.set(parent, used);
    for (const name of shuffled(ITEMS[step.item].models, this.roll)) {
      const model = this.models[name];
      if (!model) continue;
      const mine = reach(model, parent.rot), roomU = parent.size.hu - mine.hu, roomV = parent.size.hv - mine.hv;
      if (roomU < 0 || roomV < 0) continue;
      for (let tries = 0; tries < 8; tries++) {
        const u = parent.u + (tries === 0 && step.item === 'tv' ? 0 : (this.roll() * 2 - 1) * roomU), v = parent.v + (this.roll() * 2 - 1) * roomV;
        const box = boxAt(u, v, mine);
        if (used.some((other) => overlaps(box, other))) continue;
        used.push(box);
        return this.tryAt(step, name, model, u, v, parent.rot, null, zoneIndex, parent.height);
      }
    }
    return null;
  }

  // A set of the same chair round a table, each facing it.
  placeAround(step, parent, room, zoneIndex) {
    const name = pick(ITEMS[step.item].models, this.roll), model = this.models[name];
    if (!model) return;
    const { hu, hv } = parent.size, spots = [], spacing = 0.65;
    const along = (from, half, fixed, rot, makeU) => {
      const count = Math.max(1, Math.floor((half * 2) / spacing));
      for (let n = 0; n < count; n++) {
        const at = from + ((n + 0.5) / count - 0.5) * half * 2;
        spots.push(makeU ? { u: at, v: fixed, rot } : { u: fixed, v: at, rot });
      }
    };
    const out = model.d / 2 + 0.02;
    along(parent.u, hu, parent.v - hv - out, 0, true);
    along(parent.u, hu, parent.v + hv + out, 180, true);
    if (hv >= hu) along(parent.v, hv, parent.u - hu - out, 90, false);
    if (hv >= hu) along(parent.v, hv, parent.u + hu + out, 270, false);
    if (hu > hv) { spots.push({ u: parent.u - hu - out, v: parent.v, rot: 90 }, { u: parent.u + hu + out, v: parent.v, rot: 270 }); }
    let placed = 0;
    for (const spot of shuffled(spots, this.roll)) {
      if (placed >= step.count) break;
      if (this.tryAt({ ...step, loose: true }, name, model, spot.u, spot.v, spot.rot, room, zoneIndex)) placed++;
    }
  }

  // Many of the same, in lines across the room with aisles between. with: what goes with each, such as a chair with a desk.
  placeRows(step, room, zoneIndex, named = {}) {
    const name = pick(ITEMS[step.item].models, this.roll), model = this.models[name];
    if (!model) return;
    const facing = step.towards ? named[step.towards] : null, along = room.u1 - room.u0 >= room.v1 - room.v0;
    const rot = facing ? (facing.rot + 180) % 360 : step.along ? (along ? 0 : 90) : (along ? 90 : 0), { hu, hv } = reach(model, rot);
    // Rows facing something run across the way they face, with the aisles between them.
    const wideU = facing ? rot % 180 === 0 : along, stepU = hu * 2 + (wideU ? step.gap ?? 0.3 : step.aisle ?? 1.2), stepV = hv * 2 + (wideU ? step.aisle ?? 1.2 : step.gap ?? 0.3);
    const margin = 0.5, oppositeEdge = (lo, hi, half) => hi - lo - half * 2 - margin * 2;
    let placed = 0;
    for (let row = 0; row * stepV <= oppositeEdge(room.v0, room.v1, hv); row++) {
      for (let col = 0; col * stepU <= oppositeEdge(room.u0, room.u1, hu); col++) {
        if (placed >= step.count) return;
        const at = this.tryAt(step, name, model, room.u0 + margin + hu + col * stepU, room.v0 + margin + hv + row * stepV, rot, room, zoneIndex);
        if (!at) continue;
        at.chain = [at];
        placed++;
        for (const child of step.with || []) this.doStep({ ...child, of: 'it' }, { it: at }, room, zoneIndex);
      }
    }
  }

  doStep(step, named, room, zoneIndex) {
    if (step.chance !== undefined && step.of === 'it' && this.roll() > step.chance) return;
    const parent = step.of ? named[step.of] : null;
    if (step.of && !parent) return;
    if (step.at === 'around') return this.placeAround(step, parent, room, zoneIndex);
    if (step.at === 'rows') return this.placeRows(step, room, zoneIndex, named);
    let placed = null;
    if (step.at === 'on') placed = this.placeOn(step, parent, zoneIndex);
    else {
      search: for (const name of shuffled(ITEMS[step.item].models, this.roll)) {
        const model = this.models[name];
        if (!model) continue;
        for (const spot of this.spots(step, model, room, parent)) {
          placed = this.tryAt(step, name, model, spot.u, spot.v, spot.rot, room, zoneIndex);
          if (placed) break search;
        }
      }
    }
    if (!placed) return;
    placed.chain = [...(step.of && step.of === step.name ? parent.chain : []), placed];
    if (step.name) named[step.name] = placed;
    if (step.also) named[step.also] = placed;
  }

  // floorShare: how much of the floor this room is, so it takes its share of what a floor can hold and leaves some for the others.
  fill(zone, room, zoneIndex, floorShare = 1) {
    const named = {}, fullness = 0.5 + this.roll() * 0.5;
    this.quota = this.solids.length + Math.max(ROOM_ITEMS_LEAST, Math.ceil(MOST_SOLIDS * floorShare));
    for (const step of RECIPES[zone]) {
      if (!step.must && this.roll() > (step.chance ?? fullness)) continue;
      this.doStep(step, named, room, zoneIndex);
    }
  }
}

function zonesFor(plan, floor, area) {
  const type = floor === 1 && plan.ground ? plan.ground : plan.type, own = TYPE_ZONES[type];
  if (own) {
    const list = (floor > 1 && own.upper) || own.ground, then = own.then || [], zones = [...list];
    if (floor === 1 && plan.floors >= LIFT_FROM && !zones.some((z) => z[0] === 'lobby' || z[0] === 'bankLobby' || z[0] === 'foyer')) zones.unshift(['lobby', 40]);
    let total = zones.reduce((sum, z) => sum + z[1], 0);
    for (let i = 0; then.length && zones.length < MOST_ZONES && i < MOST_ZONES; i++) {
      const zone = then[i % then.length];
      if (total + zone[1] > area * USABLE) break;
      zones.push(zone);
      total += zone[1];
    }
    return zones;
  }
  const { floors } = plan, [list, essential] = floor > 1 ? [UPPER_ZONES, ESSENTIAL.upper] : floors > 1 ? [GROUND_ZONES, ESSENTIAL.ground] : [SINGLE_ZONES, ESSENTIAL.single];
  const zones = list.slice(0, essential);
  let total = zones.reduce((sum, z) => sum + z[1], 0);
  for (const zone of list.slice(essential)) {
    if (total + zone[1] > area * USABLE) continue;
    zones.push(zone);
    total += zone[1];
  }
  return zones;
}

// Where the stairs and lift stand on every floor: as near the middle as they fit, with room in front. Null if they don't fit.
export function coreOf(pieces, plan, models, roll) {
  const axis = axisOf(pieces), frame = frameOf(pieces, axis), rings = pieces.map((p) => p.rings.map((r) => r.pts));
  const isIn = (u, v) => {
    const { x, y } = frame.toWorld(u, v);
    return rings.some((r) => inRings(r, x, y));
  };
  const filled = (box) => {
    for (let u = box.u0; u < box.u1 + 0.25; u += 0.5) for (let v = box.v0; v < box.v1 + 0.25; v += 0.5) if (!isIn(Math.min(u, box.u1), Math.min(v, box.v1))) return false;
    return true;
  };
  const corners = pieces.flatMap((p) => p.rings[0].pts.map((q) => frame.toFrame(q.x, q.y)));
  const far = Math.max(...corners.map((q) => Math.hypot(q.u, q.v))), withLift = plan.floors >= LIFT_FROM;
  const coreAt = (u, v, rot) => {
    const [fu, fv] = FRONT[rot], stair = reach(models.stairs, rot), lift = withLift ? reach(models.lift, rot) : null;
    const parts = [{ item: 'stairs', model: 'stairs', u: round(u), v: round(v), rot }];
    if (withLift) {
      const out = (fu ? stair.hv + lift.hv : stair.hu + lift.hu) + LIFT_GAP;
      parts.push({ item: 'lift', model: 'lift', u: round(u + (fu ? 0 : out)), v: round(v + (fu ? out : 0)), rot });
    }
    const boxes = parts.map((part) => boxAt(part.u, part.v, reach(models[part.model], rot)));
    const whole = { u0: Math.min(...boxes.map((b) => b.u0)), u1: Math.max(...boxes.map((b) => b.u1)), v0: Math.min(...boxes.map((b) => b.v0)), v1: Math.max(...boxes.map((b) => b.v1)) };
    const clear = { u0: whole.u0 + Math.min(0, fu) * CORE_CLEAR, u1: whole.u1 + Math.max(0, fu) * CORE_CLEAR, v0: whole.v0 + Math.min(0, fv) * CORE_CLEAR, v1: whole.v1 + Math.max(0, fv) * CORE_CLEAR };
    return filled(clear) ? { axis, parts, clear: [round(clear.u0), round(clear.v0), round(clear.u1), round(clear.v1)] } : null;
  };
  // Most buildings have them at a wall, a garage or warehouse in a corner out of the way, and only towers in the middle.
  if (!CORE_IN_MIDDLE.has(plan.type)) {
    const minU = Math.min(...corners.map((q) => q.u)), maxU = Math.max(...corners.map((q) => q.u)), minV = Math.min(...corners.map((q) => q.v)), maxV = Math.max(...corners.map((q) => q.v));
    const stops = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1], order = CORE_IN_CORNER.has(plan.type) ? stops.slice().sort((a, b) => Math.abs(b - 0.5) - Math.abs(a - 0.5)) : shuffled(stops, roll);
    for (const inset of [0.15, 1, 2.5, 5]) {
      for (const side of shuffled(SIDES, roll)) {
        const { hu, hv } = reach(models.stairs, side.rot), alongV = side.axis === 'u';
        const across = alongV ? (side.low ? minU + inset + hu : maxU - inset - hu) : (side.low ? minV + inset + hv : maxV - inset - hv);
        const lo = (alongV ? minV + hv : minU + hu) + 0.2, hi = (alongV ? maxV - hv : maxU - hu) - 0.2;
        for (const f of order) {
          const along = lo + (hi - lo) * f, found = alongV ? coreAt(across, along, side.rot) : coreAt(along, across, side.rot);
          if (found) return found;
        }
      }
    }
  }
  for (let distance = 0; distance <= far; distance += 1) {
    const start = roll();
    for (let k = 0; k < (distance ? 12 : 1); k++) {
      const a = ((k + start) / 12) * Math.PI * 2, u = Math.cos(a) * distance, v = Math.sin(a) * distance;
      for (const rot of shuffled([0, 90, 180, 270], roll)) {
        const found = coreAt(u, v, rot);
        if (found) return found;
      }
    }
  }
  return null;
}

// The parts as they are on this floor: the top one has the head of the stairs rather than a flight going up.
function coreOnFloor(plan, floor) {
  return (plan.core?.parts || []).map((part) => (part.item === 'stairs' && floor === plan.floors ? { ...part, item: 'stairwell', model: 'stairwell' } : part));
}

// The stairs or lift within reach of someone here, or null, as 'stairs' or 'lift'. x, y in metres from the car.
export function coreNear(plan, frame, models, x, y) {
  const { u, v } = frame.toFrame(x, y);
  let best = null, bestDistance = CORE_REACH;
  for (const part of plan.core?.parts || []) {
    const box = boxAt(part.u, part.v, reach(models[part.model], part.rot));
    const distance = Math.hypot(Math.max(box.u0 - u, 0, u - box.u1), Math.max(box.v0 - v, 0, v - box.v1));
    if (distance < bestDistance) { best = part.item; bestDistance = distance; }
  }
  return best;
}

// A floor with nothing on it yet but the stairs and lift, for types not furnished so far.
export function plainFloor(plan, floor) {
  return { v: FLOOR_VERSION, axis: plan.core.axis, zones: [], walls: [], items: coreOnFloor(plan, floor).map(({ item, model, u, v, rot }) => [item, model, u, v, 0, rot, -1, 1]) };
}

// An apartment building's floor: a corridor down each band of the building, a landing across them where the stairs are,
// and either side separate flats, each with a front door and its own kitchen, bathroom, living room and bedroom.
// Null if the building is too small for that, and it's then divided like any other. a runs along the building and b across it.
function corridorFloor(grid, plan, floor, roll, doors, spec) {
  const FLAT_WIDTH = spec.width, FLAT_WIDTH_MIN = spec.width * 0.8, MOST_FLATS = spec.most;
  const whole = trim(grid, { i0: 0, i1: grid.nu - 1, j0: 0, j1: grid.nv - 1 });
  if (!whole) return null;
  const { cell } = grid, along = whole.i1 - whole.i0 >= whole.j1 - whole.j0, cells = (metres) => Math.round(metres / cell);
  const aLo = along ? whole.i0 : whole.j0, aHi = along ? whole.i1 : whole.j1, bLo = along ? whole.j0 : whole.i0, bHi = along ? whole.j1 : whole.i1;
  const corridor = cells(spec.walkway ?? CORRIDOR), side = cells(FLAT_DEPTH_MIN);
  if (bHi - bLo + 1 < corridor + side || aHi - aLo + 1 < cells(FLAT_WIDTH)) return null;
  const rectOf = (a0, a1, b0, b1) => trim(grid, along ? { i0: a0, i1: a1, j0: b0, j1: b1 } : { i0: b0, i1: b1, j0: a0, j1: a1 });
  const cuts = [], rooms = [], frontDoors = [];
  // A wall on line c between from and to, wherever there's floor both sides. acrossA: it crosses the a axis.
  const wall = (acrossA, c, from, to) => {
    const alongU = acrossA ? along : !along, edges = [];
    for (let k = from; k <= to; k++) {
      const [first, second] = alongU ? [[c - 1, k], [c, k]] : [[k, c - 1], [k, c]];
      if (!grid.has(...first) || !grid.has(...second)) continue;
      const index = grid.at(...first);
      (alongU ? grid.wallEast : grid.wallNorth)[index] = 1;
      edges.push({ k, index });
    }
    const made = { alongU, edges };
    cuts.push(made);
    return made;
  };
  const door = ({ alongU, edges }) => {
    let run = [];
    for (const edge of edges) {
      run = run.at(-1)?.k === edge.k - 1 ? [...run, edge] : [edge];
      if (run.length >= Math.ceil(DOOR_WIDTH / cell) && roll() < 0.5) break;
    }
    const used = run.slice(-Math.ceil(DOOR_WIDTH / cell));
    if (used.length) openDoor(grid, alongU, used, doors);
    return used;
  };
  const room = (zone, a0, a1, b0, b1) => {
    const rect = rectOf(a0, a1, b0, b1);
    if (rect) rooms.push({ zone, rect });
  };
  // The landing crosses the building where the stairs and lift are, or at its middle if it has none.
  let spineLo = Math.round((aLo + aHi - corridor) / 2), spineHi = spineLo + corridor - 1;
  if (plan.core) {
    const [u0, v0, u1, v1] = plan.core.clear, origin = along ? grid.minU : grid.minV, [lo, hi] = along ? [u0, u1] : [v0, v1];
    spineLo = Math.floor((lo - origin) / cell) - 1;
    spineHi = Math.ceil((hi - origin) / cell);
  }
  spineLo = Math.max(aLo, spineLo);
  spineHi = Math.min(aHi, Math.max(spineHi, spineLo + corridor - 1));
  room('landing', spineLo, spineHi, bLo, bHi);
  const parts = [[aLo, spineLo - 1], [spineHi + 1, aHi]].filter(([a0, a1]) => a1 - a0 + 1 >= cells(FLAT_WIDTH_MIN));
  // Bands of flats either side of a corridor, as many as the depth of the building takes.
  const depth = bHi - bLo + 1, bandCount = Math.max(1, Math.round(depth / cells(BAND_DEPTH))), sides = [];
  for (let n = 0; n < bandCount; n++) {
    const b0 = bLo + Math.round((depth * n) / bandCount), b1 = bLo + Math.round((depth * (n + 1)) / bandCount) - 1;
    if (n) for (const [a0, a1] of parts) wall(false, b0, a0, a1);
    const two = b1 - b0 + 1 >= corridor + side * 2;
    const cLo = two ? Math.round((b0 + b1 + 1 - corridor) / 2) : n ? b0 : b1 - corridor + 1, cHi = cLo + corridor - 1;
    for (const [a0, a1] of parts) room('corridor', a0, a1, cLo, cHi);
    if (cLo > b0) sides.push({ b0, b1: cLo - 1, near: cLo, towards: 1 });
    if (cHi < b1) sides.push({ b0: cHi + 1, b1, near: cHi + 1, towards: -1 });
  }
  // Flats as wide as they should be, or wider if there would be too many to furnish.
  const lengths = parts.reduce((sum, [a0, a1]) => sum + (a1 - a0 + 1) * cell, 0) * sides.length, width = Math.max(FLAT_WIDTH, lengths / MOST_FLATS);
  const units = [];
  for (const unit of sides) {
    for (const [a0, a1] of parts) {
      wall(true, a1 === spineLo - 1 ? spineLo : a0, unit.b0, unit.b1); // the side towards the landing
      const count = Math.max(1, Math.round(((a1 - a0 + 1) * cell) / width));
      for (let n = 0; n < count; n++) {
        const u0 = a0 + Math.round(((a1 - a0 + 1) * n) / count), u1 = a0 + Math.round(((a1 - a0 + 1) * (n + 1)) / count) - 1;
        if (n) wall(true, u0, unit.b0, unit.b1);
        units.push({ ...unit, a0: u0, a1: u1, far: Math.min(Math.abs(u0 - spineHi), Math.abs(u1 - spineLo)) });
      }
    }
  }
  units.sort((x, y) => x.far - y.far);
  const shared = [...(floor === 1 ? spec.shared || [] : spec.upper || [])];
  const addFrontDoor = (front, line, towards) => {
    if (!front.length) return;
    const k = (front[0].k + front.at(-1).k + 1) / 2, aAt = (along ? grid.minU : grid.minV) + k * cell, bAt = (along ? grid.minV : grid.minU) + line * cell;
    // Facing the corridor, which is towards +b or -b of the wall.
    frontDoors.push({ u: along ? aAt : bAt, v: along ? bAt : aAt, rot: along ? (towards > 0 ? 0 : 180) : (towards > 0 ? 90 : 270) });
  };
  for (const unit of units) {
    const { a0, a1, b0, b1, near, towards } = unit, line = near;
    const entry = wall(false, line, a0, a1), wide = (a1 - a0 + 1) * cell, deep = (b1 - b0 + 1) * cell, special = shared.shift();
    if (special || wide < FLAT_WIDTH_MIN || deep < FLAT_DEPTH_MIN) {
      door(entry);
      room(special || 'stock', a0, a1, b0, b1);
      continue;
    }
    if (spec.unit === 'room') {
      addFrontDoor(door(entry), line, towards);
      room(Array.isArray(spec.room) ? pick(spec.room, roll) : spec.room, a0, a1, b0, b1);
      continue;
    }
    if (spec.unit === 'suite') {
      // In from the corridor to the room, with its bathroom at the far end.
      const parting = towards > 0 ? b0 + cells(2.5) : b1 - cells(2.5) + 1, [roomB0, roomB1, bathB0, bathB1] = towards > 0 ? [parting, near - 1, b0, parting - 1] : [near, parting - 1, parting, b1];
      addFrontDoor(door(entry), line, towards);
      const backWall = wall(false, parting, a0, a1);
      door(backWall);
      room(spec.room, a0, a1, roomB0, roomB1);
      room('bathroom', a0, a1, bathB0, bathB1);
      continue;
    }
    // The kitchen and bathroom on the corridor side, and the living room and bedroom past them.
    const nearDepth = Math.max(cells(2.5), Math.min(cells(3.5), Math.round((b1 - b0 + 1) * 0.4)));
    const parting = towards > 0 ? near - nearDepth : near + nearDepth;
    const split = roll() < 0.5 ? a0 + Math.round((a1 - a0 + 1) * 0.58) : a0 + Math.round((a1 - a0 + 1) * 0.42);
    const kitchenLow = split - a0 > a1 - split + 1; // the larger end has the kitchen and living room
    const [mainA0, mainA1, sideA0, sideA1] = kitchenLow ? [a0, split - 1, split, a1] : [split, a1, a0, split - 1];
    const [nearB0, nearB1, farB0, farB1] = towards > 0 ? [parting, near - 1, b0, parting - 1] : [near, parting - 1, parting, b1];
    wall(false, parting, a0, a1);
    wall(true, split, b0, b1);
    room('kitchen', mainA0, mainA1, nearB0, nearB1);
    room('bathroom', sideA0, sideA1, nearB0, nearB1);
    room('living', mainA0, mainA1, farB0, farB1);
    room('bedroom', sideA0, sideA1, farB0, farB1);
    // One door each way, on just the part of each wall that belongs to the room.
    const part = (made, from, to) => ({ alongU: made.alongU, edges: made.edges.filter((edge) => edge.k >= from && edge.k <= to) });
    const front = door(part(entry, mainA0, mainA1));
    const between = cuts.at(-2), across = cuts.at(-1);
    door(part(between, mainA0, mainA1));  // kitchen to living room
    door(part(across, nearB0, nearB1));   // kitchen to bathroom
    door(part(across, farB0, farB1));     // living room to bedroom
    addFrontDoor(front, line, towards);
  }
  return { cuts, rooms, frontDoors };
}

// A parking garage's floor: rows of bays either side of lanes down the building, with lanes across each end so nobody is
// shut in by parked cars. False if it's too small, and it's then furnished like any other. a runs along the building and b across it.
function parkingFloor(furnisher, grid, plan, floor, zones, roll) {
  const whole = trim(grid, { i0: 0, i1: grid.nu - 1, j0: 0, j1: grid.nv - 1 });
  if (!whole) return false;
  const u0 = grid.minU + whole.i0 * grid.cell, u1 = grid.minU + (whole.i1 + 1) * grid.cell, v0 = grid.minV + whole.j0 * grid.cell, v1 = grid.minV + (whole.j1 + 1) * grid.cell;
  const along = u1 - u0 >= v1 - v0, aLo = along ? u0 : v0, aHi = along ? u1 : v1, bLo = along ? v0 : u0, bHi = along ? v1 : u1;
  const single = BAY_DEPTH + LANE, double = BAY_DEPTH * 2 + LANE;
  if (bHi - bLo < single || aHi - aLo < CROSS_LANE * 2 + BAY_WIDTH * 2) return false;
  const uv = (a, b) => (along ? [a, b] : [b, a]), room = { u0, u1, v0, v1 };
  const facing = (towardsHighB) => (along ? (towardsHighB ? 0 : 180) : (towardsHighB ? 90 : 270)), running = along ? 90 : 0;
  // Lanes with a row of bays each side, then one with a row on just one side if there's room left over.
  const decks = [];
  let b = bLo + (bHi - bLo - Math.floor((bHi - bLo) / double) * double) / 2;
  if (bHi - bLo < double) b = bLo;
  while (b + double <= bHi + 0.01) {
    decks.push({ b0: b, lane: b + BAY_DEPTH, rows: [[b, true], [b + BAY_DEPTH + LANE, false]] });
    b += double;
  }
  if (!decks.length) decks.push({ b0: bLo, lane: bLo + BAY_DEPTH, rows: [[bLo, true]] });
  const first = aLo + CROSS_LANE, count = Math.floor((aHi - CROSS_LANE - first) / BAY_WIDTH), offset = first + (aHi - CROSS_LANE - first - count * BAY_WIDTH) / 2;
  const occupied = 0.5 + roll() * 0.35, bodies = ITEMS.parkedCar.models;
  const rowCount = decks.reduce((sum, deck) => sum + deck.rows.length, 0), everyBay = Math.min(count, Math.floor(MOST_BAYS / rowCount));
  const top = floor >= plan.floors, hasRamp = plan.floors > 1;
  let rampDone = false;
  decks.forEach((deck, index) => {
    const zoneIndex = zones.length, [zu0, zv0] = uv(aLo, deck.b0), [zu1, zv1] = uv(aHi, deck.b0 + (deck.rows.length > 1 ? double : single));
    zones.push(['parkingDeck', round(Math.min(zu0, zu1)), round(Math.min(zv0, zv1)), round(Math.max(zu0, zu1)), round(Math.max(zv0, zv1)), schemeFor('parkingDeck', plan.look, roll)]);
    // Arrows down the lane, the way the traffic goes.
    for (let a = aLo + CROSS_LANE + 2; a < aHi - CROSS_LANE; a += 12) {
      const [u, v] = uv(a, deck.lane + LANE / 2), box = boxAt(u, v, reach(furnisher.models.laneArrow, running));
      if (!furnisher.doors.some((door) => overlaps(box, door))) furnisher.place('laneArrow', 'laneArrow', u, v, (running + (index % 2 ? 180 : 0)) % 360, zoneIndex);
    }
    for (const [rowB, opensHigh] of deck.rows) {
      const centreB = rowB + BAY_DEPTH / 2, nose = facing(opensHigh);
      for (let n = 0; n < everyBay; n++) {
        const a = offset + (n + 0.5) * BAY_WIDTH, [u, v] = uv(a, centreB), box = boxAt(u, v, reach(furnisher.models.bayMark, nose));
        if (!furnisher.inside(box, room) || furnisher.doors.some((door) => overlaps(box, door)) || furnisher.solids.some((other) => overlaps(box, other))) continue;
        // A ramp up takes the last few bays of the last row.
        if (hasRamp && !rampDone && index === decks.length - 1 && !opensHigh === (deck.rows.length > 1) && n >= everyBay - RAMP_BAYS) {
          const rampName = top ? 'rampTop' : 'carRamp', rampA = offset + (everyBay - RAMP_BAYS / 2) * BAY_WIDTH, [ru, rv] = uv(rampA, centreB);
          if (furnisher.place(rampName, rampName, ru, rv, running, zoneIndex)) rampDone = true;
        }
        const rampHere = furnisher.solids.some((other) => overlaps(box, other));
        if (rampHere) continue;
        furnisher.place('bayMark', 'bayMark', u, v, nose, zoneIndex);
        if (n % PILLAR_EVERY === 0) {
          const [pu, pv] = uv(a - BAY_WIDTH / 2, opensHigh ? rowB + 0.3 : rowB + BAY_DEPTH - 0.3);
          furnisher.place('pillar', 'pillar', pu, pv, 0, zoneIndex);
        }
        if (roll() < occupied) {
          const name = pick(bodies, roll);
          furnisher.place('parkedCar', name, u, v, roll() < 0.8 ? nose : (nose + 180) % 360, zoneIndex);
        } else if (roll() < 0.08) furnisher.place('cone', 'cone', u, v, 0, zoneIndex);
      }
    }
  });
  // The way in, at the end of the first lane, on the ground floor. Ticket machines on every floor, for the way back to the car.
  const laneB = decks[0].lane + LANE / 2;
  const [eu, ev] = uv(aLo + 3.2, laneB);
  furnisher.entry = [round(eu), round(ev)];
  const [mu, mv] = uv(aLo + 1.2, decks[0].lane + 0.5);
  furnisher.place('ticketMachine', 'ticketMachine', mu, mv, facing(true), 0);
  if (floor === 1) {
    const [gu, gv] = uv(aLo + 2.2, laneB);
    furnisher.place('barrierGate', 'barrierGate', gu, gv, running, 0);
    const [hu, hv] = uv(aHi - 1.2, decks[0].lane + 0.5);
    furnisher.place('ticketMachine', 'ticketMachine', hu, hv, facing(true), 0);
  }
  return true;
}

const roomBox = (grid, { i0, i1, j0, j1 }) => ({ u0: grid.minU + i0 * grid.cell, u1: grid.minU + (i1 + 1) * grid.cell, v0: grid.minV + j0 * grid.cell, v1: grid.minV + (j1 + 1) * grid.cell });

// The lobby is where the stairs and lift are, so the rooms swap names if they aren't, with one of about its size.
function putEntranceAtCore(rooms, plan, grid) {
  const part = plan.core?.parts[0], lobby = rooms.find((r) => ENTRANCES.includes(r.zone));
  if (!part || !lobby || lobby.zone === 'landing' || lobby.zone === 'corridor') return;
  const areaOf = (r) => { const b = roomBox(grid, r.rect); return (b.u1 - b.u0) * (b.v1 - b.v0); }, size = areaOf(lobby);
  let best = lobby, bestDistance = Infinity;
  for (const r of rooms) {
    if (SEALED.has(r.zone) || areaOf(r) < size * 0.4 || areaOf(r) > size * 2.5 || !hasOutsideWall(grid, r) || !swapFits(grid, lobby, r)) continue; // people come in through it
    const b = roomBox(grid, r.rect), distance = Math.hypot(Math.max(b.u0 - part.u, 0, part.u - b.u1), Math.max(b.v0 - part.v, 0, part.v - b.v1));
    if (distance < bestDistance) { bestDistance = distance; best = r; }
  }
  [lobby.zone, best.zone] = [best.zone, lobby.zone];
}

// Whether two rooms can swap names, as a kitchen needs its width wherever it goes.
function swapFits(grid, a, b) {
  const narrow = (r) => Math.min(r.rect.i1 - r.rect.i0 + 1, r.rect.j1 - r.rect.j0 + 1) * grid.cell;
  return narrow(b) >= (ROOM_WIDTH[a.zone] ?? MIN_ROOM) && narrow(a) >= (ROOM_WIDTH[b.zone] ?? MIN_ROOM);
}

// Nobody takes the stairs through the toilets: that room swaps names with the nearest one that isn't a back room.
function keepCoreOutOfBackRooms(rooms, plan, grid) {
  const part = plan.core?.parts[0];
  if (!part) return;
  const distanceTo = (r) => { const b = roomBox(grid, r.rect); return Math.hypot(Math.max(b.u0 - part.u, 0, part.u - b.u1), Math.max(b.v0 - part.v, 0, part.v - b.v1)); };
  const nearest = rooms.reduce((best, r) => (distanceTo(r) < distanceTo(best) ? r : best), rooms[0]);
  if (!nearest || !BACK_ROOMS.has(nearest.zone) || SEALED.has(nearest.zone)) return;
  const other = rooms.filter((r) => !BACK_ROOMS.has(r.zone) && !ENTRANCES.includes(r.zone) && swapFits(grid, nearest, r)).sort((a, b) => distanceTo(a) - distanceTo(b))[0];
  if (other) [nearest.zone, other.zone] = [other.zone, nearest.zone];
}

function hasOutsideWall(grid, room) {
  const b = roomBox(grid, room.rect), mid = (x, y) => [(x + y) / 2];
  return [[mid(b.u0, b.u1)[0], b.v0 - 1], [mid(b.u0, b.u1)[0], b.v1 + 1], [b.u0 - 1, mid(b.v0, b.v1)[0]], [b.u1 + 1, mid(b.v0, b.v1)[0]]].some(([u, v]) => !grid.isIn(u, v));
}

// Closes every side of a room.
function sealRoom(grid, { i0, i1, j0, j1 }) {
  for (let j = j0; j <= j1; j++) {
    if (grid.has(i0 - 1, j) && grid.has(i0, j)) grid.wallEast[grid.at(i0 - 1, j)] = 1;
    if (grid.has(i1, j) && grid.has(i1 + 1, j)) grid.wallEast[grid.at(i1, j)] = 1;
  }
  for (let i = i0; i <= i1; i++) {
    if (grid.has(i, j0 - 1) && grid.has(i, j0)) grid.wallNorth[grid.at(i, j0 - 1)] = 1;
    if (grid.has(i, j1) && grid.has(i, j1 + 1)) grid.wallNorth[grid.at(i, j1)] = 1;
  }
}

// The way in: a door in an outside wall of the entrance room, or the next room that has one. Rooms are tried in the order they were wanted.
function entranceOf(rooms, grid, roll, isFree) {
  const named = ENTRANCES.flatMap((zone) => rooms.filter((r) => r.zone === zone)), order = [...named, ...rooms.filter((r) => !named.includes(r) && !BACK_ROOMS.has(r.zone))];
  for (const room of order) {
    const b = roomBox(grid, room.rect);
    for (const side of shuffled(SIDES, roll)) {
      const alongU = side.axis === 'v', [lo, hi] = alongU ? [b.u0, b.u1] : [b.v0, b.v1], edge = side.axis === 'v' ? (side.low ? b.v0 : b.v1) : (side.low ? b.u0 : b.u1), inward = side.low ? 1 : -1;
      for (const f of shuffled([0.5, 0.3, 0.7], roll)) {
        const along = lo + (hi - lo) * f, point = (depth) => (alongU ? [along, edge + inward * depth] : [edge + inward * depth, along]);
        if (grid.isIn(...point(-1)) || !grid.isIn(...point(0.9)) || !isFree(...point(1.1)) || !isFree(...point(0.2))) continue;
        const [u, v] = point(1.1), [doorU, doorV] = point(0);
        return {
          u, v, doorU, doorV, rot: (side.rot + 180) % 360,
          clear: alongU ? { u0: along - 0.8, u1: along + 0.8, v0: Math.min(edge, edge + inward * 1.8), v1: Math.max(edge, edge + inward * 1.8) } : { u0: Math.min(edge, edge + inward * 1.8), u1: Math.max(edge, edge + inward * 1.8), v0: along - 0.8, v1: along + 0.8 },
        };
      }
    }
  }
  return null;
}

// One floor, as plain data for saving. models: what parseFurniture read. roll: the building's dice for this floor.
export function layoutFloor(pieces, plan, floor, models, roll) {
  plan.look ||= makeLook(plan.style, roll);
  const axis = plan.core?.axis ?? axisOf(pieces), frame = frameOf(pieces, axis);
  const area = pieces.reduce((sum, p) => sum + p.rings.reduce((inner, ring) => inner + signedArea(ring.pts), 0), 0);
  // The zones are in order of need, so when they don't all fit, the last one goes and the whole floor is tried again.
  const window = (WINDOW * 2) ** 2, wanted = zonesFor(plan, floor, Math.min(area, window)), doors = [], cell = area >= COARSE_FROM ? COARSE_CELL : FINE_CELL;
  let grid, cuts, rooms;
  const whole = () => ({ i0: 0, i1: grid.nu - 1, j0: 0, j1: grid.nv - 1 });
  let fitted = false, frontDoors = [];
  const garage = (floor === 1 && plan.ground ? plan.ground : plan.type) === 'parking';
  const corridors = CORRIDORS[floor === 1 && plan.ground ? plan.ground : plan.type];
  if (corridors && !(corridors.upperOnly && floor === 1)) {
    grid = makeGrid(pieces, frame, cell);
    const flats = corridorFloor(grid, plan, floor, roll, doors, corridors);
    if (flats) {
      ({ cuts, rooms, frontDoors } = flats);
      fitted = true;
    }
  }
  // First for well-shaped rooms, giving up some of the rooms if it must, then for any shape rather than lose the ones that matter.
  const attempts = [...Array.from({ length: Math.max(0, wanted.length - 2) }, (_, i) => [wanted.length - i, true]), ...wanted.map((_, i) => [wanted.length - i, false])];
  for (const [count, shapely] of attempts) {
    if (fitted) break;
    grid = makeGrid(pieces, frame, cell);
    grid.shapely = shapely;
    cuts = [];
    rooms = [];
    const list = wanted.slice(0, count);
    fitted = divide(grid, whole(), TYPE_ZONES[plan.type] ? list : list.sort((a, b) => (HOME_ORDER[a[0]] ?? 5) - (HOME_ORDER[b[0]] ?? 5)), cuts, rooms, roll);
  }
  if (!fitted) { // somewhere narrower than any room: one space, whatever its shape
    grid = makeGrid(pieces, frame, cell);
    cuts = [];
    const rect = trim(grid, whole());
    rooms = rect ? [{ zone: wanted[0][0], rect }] : [];
  }
  if (!frontDoors.length && !(fitted && rooms.some((r) => r.zone === 'landing'))) addDoors(grid, cuts, doors, roll);
  if (plan.core) {
    const [u0, v0, u1, v1] = plan.core.clear;
    doors.push({ u0, v0, u1, v1 });
    clearWalls(grid, { u0, v0, u1, v1 });
  }
  if (floor === 1) putEntranceAtCore(rooms, plan, grid);
  keepCoreOutOfBackRooms(rooms, plan, grid);
  joinUp(grid, cuts, doors);
  const sealed = rooms.filter((r) => SEALED.has(r.zone)).map((r) => r.rect);
  if (sealed.length) {
    for (const rect of sealed) sealRoom(grid, rect);
    joinUp(grid, cuts, doors, sealed);
  }
  const furnisher = new Furnisher(grid, doors, models, roll), zones = [];
  furnisher.addCore(coreOnFloor(plan, floor));
  // The stairs can stand across a doorway, so anything they cut off gets another.
  if (plan.core && !garage) {
    joinUp(grid, cuts, doors, sealed, furnisher.blocked);
    furnisher.stranded = furnisher.strandedBy(furnisher.blocked);
  }
  if (garage && parkingFloor(furnisher, grid, plan, floor, zones, roll)) rooms = [];
  let entry = furnisher.entry || null;
  if (floor === 1 && rooms.length) {
    const found = entranceOf(rooms, grid, roll, (u, v) => !furnisher.solids.some((box) => overlaps({ u0: u - 0.6, u1: u + 0.6, v0: v - 0.6, v1: v + 0.6 }, box)));
    if (found) {
      entry = [round(found.u), round(found.v)];
      doors.push(found.clear);
      furnisher.items.push(['frontDoor', 'frontDoor', round(found.doorU), round(found.doorV), 0, found.rot, -1, 1]);
    }
  }
  for (const { u, v, rot } of frontDoors) furnisher.items.push(['frontDoor', 'frontDoor', round(u), round(v), 0, rot, -1, 1]);
  if (rooms.length) {
    const start = entry || (plan.core ? [plan.core.clear[0] + 0.3, plan.core.clear[1] + 0.3] : null), ends = doors.flatMap(({ u0, u1, v0, v1 }) => {
      const u = (u0 + u1) / 2, v = (v0 + v1) / 2, reach = grid.cell * 0.8;
      return [[u - reach, v], [u + reach, v], [u, v - reach], [u, v + reach]];
    });
    if (start) furnisher.keepRoutes(start, ends);
  }
  rooms.forEach(({ zone, rect }, index) => {
    const room = {
      u0: grid.minU + rect.i0 * grid.cell, u1: grid.minU + (rect.i1 + 1) * grid.cell,
      v0: grid.minV + rect.j0 * grid.cell, v1: grid.minV + (rect.j1 + 1) * grid.cell,
    };
    zones.push([zone, round(room.u0), round(room.v0), round(room.u1), round(room.v1), schemeFor(zone, plan.look, roll)]);
    const share = (room.u1 - room.u0) * (room.v1 - room.v0) / Math.max(1, grid.nu * grid.nv * grid.cell * grid.cell);
    furnisher.fill(zone, room, index, share);
  });
  return { v: FLOOR_VERSION, axis, zones, walls: wallLengths(grid), items: furnisher.items, look: { wall: plan.look.wall, outer: plan.look.outer }, ...(entry ? { entry } : {}) };
}

// What stops a person on this floor, in metres from the car: wall lengths, and each solid thing's outline and box. A thing has
// a top, as it can be jumped over or stood on, and a wall hasn't, as walls really go to the ceiling.
export function solidsOf(record, frame, models) {
  const walls = record.walls.map(([u0, v0, u1, v1]) => {
    const a = frame.toWorld(u0, v0), b = frame.toWorld(u1, v1);
    return { ax: a.x, ay: a.y, bx: b.x, by: b.y };
  });
  const boxes = [];
  for (const [item, name, u, v, , rot] of record.items) {
    const model = models[name];
    if (!model || !ITEMS[item] || !isSolid(item)) continue;
    const { x, y } = frame.toWorld(u, v), b = worldBearing(rot, frame.axis), c = Math.cos(b), s = Math.sin(b);
    const corner = (mx, my) => ({ x: x + mx * c + my * s, y: y - mx * s + my * c });
    const pts = [corner(-model.w / 2, -model.d / 2), corner(model.w / 2, -model.d / 2), corner(model.w / 2, model.d / 2), corner(-model.w / 2, model.d / 2)];
    pts.forEach((p, i) => walls.push({ ax: p.x, ay: p.y, bx: pts[(i + 1) % 4].x, by: pts[(i + 1) % 4].y, top: model.h }));
    boxes.push({ x, y, c, s, hw: model.w / 2, hd: model.d / 2, top: model.h });
  }
  return { walls, boxes };
}
