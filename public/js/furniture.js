// The things in rooms: the catalogue, and the models in furniture.bin, which scripts/build-furniture.mjs makes from Kenney's
// Furniture Kit (CC0). Pure, tested in node. A model stands on z = 0, centred on x and y, with its front towards +y.
const MM = 1000;

export const KIT_SCALE = 2; // the kit is about half real size
// Where twice the kit's size would be wrong.
export const MODEL_SCALE = { bathtub: 1.45, trashcan: 1.3, tableCoffee: 1.7, tableCoffeeSquare: 1.7, tableCoffeeGlass: 1.7, tableCoffeeGlassSquare: 1.7 };

// Turned a quarter anticlockwise on the way in, as the kit's stairs climb sideways: this way you walk up from their front.
export const MODEL_TURNED = new Set(['stairs']);

// Parked cars, in each body and paint. Fabric colours come from the room's scheme, so they vary across a garage.
const CAR_BODIES = ['Sedan', 'Hatch', 'Suv'], CAR_PAINTS = ['carpet', 'carpetBlue', 'carpetWhite', 'metalLight', 'metalMedium', 'metalDark'];
const carName = (body, paint) => `car${body}_${paint}`;
const CAR_MODELS = CAR_BODIES.flatMap((body) => CAR_PAINTS.map((paint) => carName(body, paint)));

// models: the shapes it can be. solid: whether it stops you. flat: lies on the floor, under other things.
// use: what it could do later; nothing reads this yet, but saved buildings already say what each thing is.
export const ITEMS = {
  sofa: { models: ['loungeSofa', 'loungeSofaLong', 'loungeDesignSofa'], use: ['sit'] },
  armchair: { models: ['loungeChair', 'loungeChairRelax', 'loungeDesignChair'], use: ['sit'] },
  coffeeTable: { models: ['tableCoffee', 'tableCoffeeSquare', 'tableCoffeeGlass', 'tableCoffeeGlassSquare'] },
  tvStand: { models: ['cabinetTelevision', 'cabinetTelevisionDoors'], use: ['open'] },
  tv: { models: ['televisionModern', 'televisionVintage'], solid: false, use: ['switch'] },
  rug: { models: ['rugRectangle', 'rugRound', 'rugRounded', 'rugSquare'], solid: false, flat: true },
  mat: { models: ['rugDoormat'], solid: false, flat: true },
  floorLamp: { models: ['lampRoundFloor', 'lampSquareFloor'], use: ['switch'] },
  tableLamp: { models: ['lampRoundTable', 'lampSquareTable'], solid: false, use: ['switch', 'pick up'] },
  bookcase: { models: ['bookcaseOpen', 'bookcaseOpenLow', 'bookcaseClosed', 'bookcaseClosedWide'], use: ['search'] },
  plant: { models: ['pottedPlant'] },
  smallPlant: { models: ['plantSmall1', 'plantSmall2', 'plantSmall3'], solid: false, use: ['pick up'] },
  sideTable: { models: ['sideTable', 'sideTableDrawers'], use: ['open'] },
  books: { models: ['books'], solid: false, use: ['pick up'] },
  radio: { models: ['radio', 'speakerSmall'], solid: false, use: ['switch', 'pick up'] },
  counter: { models: ['kitchenCabinet', 'kitchenCabinetDrawer'], use: ['open'] },
  sink: { models: ['kitchenSink'], use: ['use'] },
  stove: { models: ['kitchenStove', 'kitchenStoveElectric'], use: ['use'] },
  fridge: { models: ['kitchenFridge', 'kitchenFridgeLarge', 'kitchenFridgeBuiltIn'], use: ['open'] },
  microwave: { models: ['kitchenMicrowave'], solid: false, use: ['use', 'pick up'] },
  coffeeMachine: { models: ['kitchenCoffeeMachine'], solid: false, use: ['use', 'pick up'] },
  toaster: { models: ['toaster', 'kitchenBlender'], solid: false, use: ['use', 'pick up'] },
  bin: { models: ['trashcan'], use: ['search'] },
  diningTable: { models: ['table', 'tableCloth', 'tableCross', 'tableCrossCloth', 'tableGlass', 'tableRound'] },
  chair: { models: ['chair', 'chairCushion', 'chairModernCushion', 'chairRounded'], use: ['sit', 'move'] },
  bed: { models: ['bedDouble', 'bedSingle'], use: ['sleep'] },
  nightstand: { models: ['cabinetBed', 'cabinetBedDrawer', 'cabinetBedDrawerTable'], use: ['open'] },
  wardrobe: { models: ['bookcaseClosedDoors', 'bookcaseClosedWide'], use: ['open'] },
  desk: { models: ['desk'], use: ['open'] },
  deskChair: { models: ['chairDesk', 'chairModernFrameCushion'], use: ['sit', 'move'] },
  screen: { models: ['computerScreen', 'laptop'], solid: false, use: ['use', 'pick up'] },
  toilet: { models: ['toilet', 'toiletSquare'], use: ['use'] },
  basin: { models: ['bathroomSink', 'bathroomSinkSquare'], use: ['use'] },
  bath: { models: ['bathtub', 'shower', 'showerRound'], use: ['use'] },
  bathCabinet: { models: ['bathroomCabinet', 'bathroomCabinetDrawer'], use: ['open'] },
  coatRack: { models: ['coatRackStanding'] },
  bench: { models: ['bench', 'benchCushion', 'benchCushionLow'], use: ['sit'] },
  washer: { models: ['washer', 'dryer', 'washerDryerStacked'], use: ['use'] },
  box: { models: ['cardboardBoxClosed', 'cardboardBoxOpen'], use: ['open', 'move'] },
  stairs: { models: ['stairs'], use: ['climb'] },
  stairwell: { models: ['stairwell'], built: true, use: ['climb'] },
  lift: { models: ['lift'], built: true, use: ['ride'] },
  // Things the kit doesn't have, made below from boxes.
  whiteboard: { models: ['whiteboard'], built: true, use: ['write'] },
  parkedCar: { models: CAR_MODELS, built: true, use: ['search'] },
  bayMark: { models: ['bayMark'], built: true, solid: false, flat: true },
  laneArrow: { models: ['laneArrow'], built: true, solid: false, flat: true },
  pillar: { models: ['pillar'], built: true },
  carRamp: { models: ['carRamp'], built: true },
  rampTop: { models: ['rampTop'], built: true },
  ticketMachine: { models: ['ticketMachine'], built: true, use: ['use'] },
  barrierGate: { models: ['barrierGate'], built: true, solid: false, use: ['use'] },
  cone: { models: ['cone'], built: true, use: ['move', 'pick up'] },
  examTable: { models: ['examTable'], built: true, use: ['sit'] },
  operatingTable: { models: ['operatingTable'], built: true },
  surgeryLamp: { models: ['surgeryLamp'], built: true, use: ['switch'] },
  medCart: { models: ['medCart'], built: true, use: ['search', 'move'] },
  scanner: { models: ['scanner'], built: true, use: ['use'] },
  wheelchair: { models: ['wheelchair'], built: true, use: ['sit', 'move'] },
  petCage: { models: ['petCage'], built: true, use: ['open'] },
  salonChair: { models: ['salonChair'], built: true, use: ['sit'] },
  salonMirror: { models: ['salonMirror'], built: true },
  fireEngine: { models: ['fireEngine'], built: true, use: ['search'] },
  gearRack: { models: ['gearRack'], built: true, use: ['search'] },
  bunk: { models: ['bedBunk'], use: ['sleep'] },
  policeCell: { models: ['policeCell'], built: true, use: ['open'] },
  bookStack: { models: ['bookStack'], built: true, use: ['search'] },
  stagePlatform: { models: ['stagePlatform'], built: true },
  tinyTable: { models: ['tinyTable'], built: true },
  tinyChair: { models: ['tinyChair'], built: true, use: ['sit', 'move'] },
  toyBox: { models: ['toyBox'], built: true, use: ['open', 'search'] },
  scales: { models: ['scales'], built: true, solid: false, use: ['use'] },
  weightRack: { models: ['weightRack'], built: true, use: ['use'] },
  benchPress: { models: ['benchPress'], built: true, use: ['use'] },
  punchBag: { models: ['punchBag'], built: true, use: ['use'] },
  poolWater: { models: ['poolWater', 'poolWaterSmall'], built: true },
  lounger: { models: ['lounger'], built: true, use: ['sit'] },
  cinemaScreen: { models: ['cinemaScreen'], built: true },
  fieldMarks: { models: ['fieldMarks'], built: true, solid: false, flat: true },
  bleacher: { models: ['bleacher'], built: true, use: ['sit'] },
  poolTable: { models: ['poolTable'], built: true, use: ['use'] },
  barStool: { models: ['stoolBar', 'stoolBarSquare'], use: ['sit'] },
  menuBoard: { models: ['menuBoard'], built: true },
  booth: { models: ['booth'], built: true, use: ['sit'] },
  carLift: { models: ['carLift'], built: true, use: ['use'] },
  tireStack: { models: ['tireStack'], built: true, use: ['move'] },
  railTrack: { models: ['railTrack'], built: true },
  turnstile: { models: ['turnstile'], built: true, use: ['use'] },
  vendingMachine: { models: ['vendingMachine'], built: true, use: ['use'] },
  breadRack: { models: ['breadRack'], built: true, use: ['search'] },
  speakerStand: { models: ['speakerSmall'], use: ['switch'] },
  mailboxes: { models: ['mailboxes'], built: true, use: ['open', 'search'] },
  noticeBoard: { models: ['noticeBoard'], built: true },
  frontDoor: { models: ['frontDoor'], built: true, solid: false },
  filingCabinet: { models: ['filingCabinet'], built: true, use: ['open', 'search'] },
  printer: { models: ['printer'], built: true, use: ['use'] },
  frontDesk: { models: ['frontDesk'], built: true },
  tellerCounter: { models: ['tellerCounter'], built: true, use: ['use'] },
  vaultDoor: { models: ['vaultDoor'], built: true, use: ['open'] },
  safeWall: { models: ['safeWall'], built: true, use: ['open', 'search'] },
  cashCart: { models: ['cashCart'], built: true, use: ['search', 'move'] },
  atm: { models: ['atm'], built: true, use: ['use'] },
  queueRope: { models: ['queueRope'], built: true },
  stall: { models: ['stall'], built: true, use: ['use'] },
  storeShelf: { models: ['storeShelf'], built: true, use: ['search'] },
  fridgeCase: { models: ['fridgeCase'], built: true, use: ['open'] },
  displayTable: { models: ['displayTable'], built: true, use: ['search'] },
  clothesRack: { models: ['clothesRack'], built: true, use: ['search'] },
  mannequin: { models: ['mannequin'], built: true, use: ['move'] },
  till: { models: ['till'], built: true, solid: false, use: ['use', 'open'] },
  barCounter: { models: ['barCounter'], built: true },
  proStove: { models: ['proStove'], built: true, use: ['use'] },
  prepTable: { models: ['prepTable'], built: true },
  walkInFridge: { models: ['walkInFridge'], built: true, use: ['open'] },
  pew: { models: ['pew'], built: true, use: ['sit'] },
  altar: { models: ['altar'], built: true },
  schoolDesk: { models: ['schoolDesk'], built: true, use: ['sit'] },
  locker: { models: ['locker'], built: true, use: ['open', 'search'] },
  hospitalBed: { models: ['hospitalBed'], built: true, use: ['sleep'] },
  dripStand: { models: ['dripStand'], built: true, use: ['move'] },
  displayCase: { models: ['displayCase'], built: true, use: ['search'] },
  plinth: { models: ['plinth'], built: true },
  palletRack: { models: ['palletRack'], built: true, use: ['search'] },
  pallet: { models: ['pallet'], built: true, use: ['move'] },
  forklift: { models: ['forklift'], built: true, use: ['drive'] },
  machine: { models: ['machine'], built: true, use: ['use'] },
  conveyor: { models: ['conveyor'], built: true },
  toolChest: { models: ['toolChest'], built: true, use: ['open', 'search'] },
  workbench: { models: ['workbench'], built: true, use: ['use'] },
  seatRow: { models: ['seatRow'], built: true, use: ['sit'] },
  checkInDesk: { models: ['checkInDesk'], built: true },
  departureBoard: { models: ['departureBoard'], built: true },
  plane: { models: ['plane'], built: true },
  treadmill: { models: ['treadmill'], built: true, use: ['use'] },
};

// Models made here rather than taken from the kit: lists of boxes, as x, y, the height from and to, half width, half depth, material.
const LIFT_W = 1.8, LIFT_D = 1.6;
const BUILT = {
  lift: () => [
    [0, 0, 0, 2.5, LIFT_W / 2, LIFT_D / 2, 'metalDark'],
    [-0.31, LIFT_D / 2 + 0.01, 0, 2.15, 0.29, 0.02, 'metalLight'],
    [0.31, LIFT_D / 2 + 0.01, 0, 2.15, 0.29, 0.02, 'metalLight'],
    [0, LIFT_D / 2 + 0.01, 2.2, 2.4, 0.2, 0.02, 'lamp'],
  ],
  bayMark: () => [[-1.28, 0, 0, 0.01, 0.05, 2.5, 'carpetWhite'], [1.28, 0, 0, 0.01, 0.05, 2.5, 'carpetWhite'], [0, -2.45, 0, 0.01, 1.28, 0.05, 'carpetWhite'], [0, -1.85, 0, 0.1, 0.8, 0.08, 'lamp']],
  laneArrow: () => [[0, -0.5, 0, 0.01, 0.1, 0.9, 'carpetWhite'], [0, 0.45, 0, 0.01, 0.1, 0.1, 'carpetWhite'], [0, 0.3, 0, 0.01, 0.25, 0.1, 'carpetWhite'], [0, 0.15, 0, 0.01, 0.4, 0.1, 'carpetWhite']],
  pillar: () => [[0, 0, 0, 2.95, 0.28, 0.28, 'metalMedium'], [0, 0, 0, 1, 0.3, 0.3, 'lamp']],
  carRamp: () => {
    const boxes = [];
    for (let n = 0; n < 12; n++) boxes.push([0, 3.7 - n * 0.67, 0, 0.25 * (n + 1), 1.7, 0.34, 'metalMedium']);
    boxes.push([-1.7, 0, 0, 3.6, 0.04, 4, 'lamp'], [1.7, 0, 0, 3.6, 0.04, 4, 'lamp']);
    return boxes;
  },
  rampTop: () => [[0, 0, 0.02, 0.05, 1.7, 4, 'metalDark'], [-1.7, 0, 0, 1.05, 0.04, 4, 'lamp'], [1.7, 0, 0, 1.05, 0.04, 4, 'lamp'], [0, -4, 0, 1.05, 1.7, 0.04, 'lamp']],
  ticketMachine: () => [[0, 0, 0, 1.45, 0.28, 0.24, 'metalLight'], [0, 0.25, 0.9, 1.3, 0.2, 0.01, 'metalDark'], [0, 0.26, 0.6, 0.75, 0.12, 0.02, 'carpetBlue'], [0, 0, 1.45, 1.75, 0.3, 0.26, 'carpetBlue']],
  barrierGate: () => [[-1.8, 0, 0, 1, 0.16, 0.16, 'lamp'], [-1.8, 0, 1, 1.12, 0.1, 0.1, 'metalDark'], [-1.8, 0, 1.12, 3, 0.03, 0.03, 'carpetWhite'], [-1.8, 0, 2.2, 2.45, 0.03, 0.03, 'carpet']],
  cone: () => [[0, 0, 0, 0.05, 0.17, 0.17, 'metalDark'], [0, 0, 0.05, 0.25, 0.1, 0.1, 'carpet'], [0, 0, 0.25, 0.35, 0.07, 0.07, 'carpetWhite'], [0, 0, 0.35, 0.55, 0.05, 0.05, 'carpet']],
  ...carBuilds(),
  examTable: () => [[0, 0, 0.75, 0.85, 0.35, 0.95, 'carpetBlue'], [0, -0.6, 0.85, 1, 0.33, 0.33, 'carpetBlue'], [0, 0, 0, 0.75, 0.3, 0.8, 'metalLight']],
  operatingTable: () => [[0, 0, 0.85, 0.95, 0.35, 1, 'carpetBlue'], [0, 0, 0, 0.85, 0.15, 0.3, 'metal'], [0, 0, 0, 0.1, 0.4, 0.5, 'metalDark']],
  surgeryLamp: () => [[0, 0, 0, 0.05, 0.25, 0.25, 'metalDark'], [0, 0, 0.05, 1.95, 0.03, 0.03, 'metal'], [0, 0.5, 1.9, 1.96, 0.03, 0.5, 'metal'], [0, 1, 1.75, 1.9, 0.35, 0.35, 'lamp']],
  medCart: () => [[0, 0, 0.1, 0.95, 0.3, 0.22, 'metalLight'], [0, 0.23, 0.65, 0.85, 0.26, 0.01, 'carpetBlue'], [0, 0.23, 0.35, 0.55, 0.26, 0.01, 'carpet'], [0, 0, 0, 0.1, 0.25, 0.18, 'metalDark'], [0.1, 0, 0.95, 1.08, 0.1, 0.1, 'carpetWhite']],
  scanner: () => [[0, -0.8, 0, 1.9, 0.95, 0.5, 'carpetWhite'], [0, -0.8, 0.5, 1.4, 0.45, 0.51, 'metalDark'], [0, 0.5, 0.55, 0.72, 0.32, 0.9, 'carpetBlue'], [0, 0.5, 0, 0.55, 0.26, 0.8, 'metalLight']],
  wheelchair: () => [[0, 0, 0.42, 0.5, 0.25, 0.22, 'carpetBlue'], [0, -0.2, 0.5, 0.95, 0.25, 0.02, 'carpetBlue'], [-0.28, 0, 0, 0.6, 0.02, 0.28, 'metalDark'], [0.28, 0, 0, 0.6, 0.02, 0.28, 'metalDark']],
  petCage: () => [[0, 0, 0, 0.04, 0.5, 0.35, 'metalDark'], [0, 0, 0.7, 0.74, 0.5, 0.35, 'metal'], [-0.48, 0, 0, 0.7, 0.02, 0.35, 'metal'], [0.48, 0, 0, 0.7, 0.02, 0.35, 'metal'], [0, -0.33, 0, 0.7, 0.5, 0.02, 'metal'], [0, 0.34, 0.05, 0.68, 0.46, 0.01, 'glass'], [0, 0, 0.74, 1.44, 0.5, 0.35, 'metal']],
  salonChair: () => [[0, 0, 0, 0.08, 0.28, 0.28, 'metalMedium'], [0, 0, 0.08, 0.45, 0.06, 0.06, 'metal'], [0, 0, 0.45, 0.58, 0.27, 0.27, 'carpet'], [0, -0.25, 0.58, 1.2, 0.27, 0.04, 'carpet'], [-0.28, 0, 0.58, 0.75, 0.04, 0.22, 'metalDark'], [0.28, 0, 0.58, 0.75, 0.04, 0.22, 'metalDark']],
  salonMirror: () => [[0, 0, 0, 0.75, 0.55, 0.2, 'woodDark'], [0, -0.18, 0.75, 2, 0.55, 0.03, 'glass'], [0, -0.15, 2, 2.08, 0.58, 0.05, 'lamp']],
  fireEngine: () => [[0, -0.6, 0.45, 2.6, 1.2, 2.7, 'carpet'], [0, 2.6, 0.45, 1.5, 1.2, 0.8, 'carpet'], [0, 2.6, 1.5, 2.6, 1.15, 0.75, 'glass'], [0, 3.42, 0.8, 1.1, 1, 0.02, 'metalLight'], [-0.5, 3.42, 1.1, 1.3, 0.2, 0.01, 'lamp'], [0.5, 3.42, 1.1, 1.3, 0.2, 0.01, 'lamp'], [0, -0.6, 2.6, 2.85, 0.5, 2, 'metalLight'], [1.21, -0.6, 1, 2.2, 0.02, 2.2, 'metalMedium'], [-1.21, -0.6, 1, 2.2, 0.02, 2.2, 'metalMedium'], [-1.15, 2.4, 0, 0.9, 0.18, 0.45, 'metalDark'], [1.15, 2.4, 0, 0.9, 0.18, 0.45, 'metalDark'], [-1.15, -2.2, 0, 0.9, 0.18, 0.45, 'metalDark'], [1.15, -2.2, 0, 0.9, 0.18, 0.45, 'metalDark']],
  gearRack: () => { const boxes = [[0, -0.22, 0, 2, 1.1, 0.03, 'metalDark'], [0, 0, 1.75, 1.8, 1.1, 0.22, 'metal']]; for (let i = 0; i < 4; i++) boxes.push([-0.8 + i * 0.53, 0, 0.7, 1.7, 0.22, 0.14, 'lamp'], [-0.8 + i * 0.53, 0, 1.8, 2.05, 0.15, 0.15, 'carpet'], [-0.8 + i * 0.53, 0, 0, 0.3, 0.16, 0.15, 'metalDark']); return boxes; },
  policeCell: () => { const boxes = [[0, -1.2, 0, 2.5, 1.5, 0.05, 'metalMedium'], [-1.5, 0, 0, 2.5, 0.05, 1.2, 'metalMedium'], [1.5, 0, 0, 2.5, 0.05, 1.2, 'metalMedium'], [0, 1.2, 2.3, 2.5, 1.5, 0.04, 'metalDark'], [0, -0.85, 0.4, 0.5, 0.9, 0.3, 'metalLight']]; for (let i = 0; i < 12; i++) boxes.push([-1.38 + i * 0.25, 1.2, 0, 2.3, 0.015, 0.015, 'metalDark']); return boxes; },
  bookStack: () => { const boxes = [[-1.2, 0, 0, 2, 0.04, 0.3, 'wood'], [1.2, 0, 0, 2, 0.04, 0.3, 'wood'], [0, 0, 0, 2, 1.2, 0.02, 'wood']]; for (let z = 0; z < 5; z++) { boxes.push([0, 0, 0.05 + z * 0.4, 0.09 + z * 0.4, 1.2, 0.3, 'wood']); for (let side = -1; side <= 1; side += 2) boxes.push([0, side * 0.16, 0.09 + z * 0.4, 0.38 + z * 0.4, 1.12, 0.12, z % 2 ? 'carpetBlue' : 'carpet']); } return boxes; },
  stagePlatform: () => [[0, 0, 0, 0.75, 3.5, 2, 'woodDark'], [0, 1.9, 0.75, 0.8, 3.5, 0.1, 'wood'], [0, -1.95, 0.75, 3.4, 3.5, 0.05, 'carpet'], [-3.45, 0, 0.75, 3.4, 0.05, 2, 'carpet'], [3.45, 0, 0.75, 3.4, 0.05, 2, 'carpet'], [0, 0, 3.4, 3.55, 3.5, 2, 'metalDark']],
  tinyTable: () => [[0, 0, 0.5, 0.54, 0.6, 0.45, 'carpetBlue'], [-0.55, -0.4, 0, 0.5, 0.03, 0.03, 'wood'], [0.55, -0.4, 0, 0.5, 0.03, 0.03, 'wood'], [-0.55, 0.4, 0, 0.5, 0.03, 0.03, 'wood'], [0.55, 0.4, 0, 0.5, 0.03, 0.03, 'wood']],
  tinyChair: () => [[0, 0, 0.27, 0.31, 0.15, 0.15, 'carpet'], [0, -0.14, 0.31, 0.58, 0.15, 0.02, 'carpet'], [-0.12, 0, 0, 0.27, 0.02, 0.12, 'wood'], [0.12, 0, 0, 0.27, 0.02, 0.12, 'wood']],
  toyBox: () => [[0, 0, 0, 0.45, 0.45, 0.3, 'carpetBlue'], [-0.2, 0, 0.45, 0.6, 0.1, 0.1, 'carpet'], [0.15, 0.08, 0.45, 0.65, 0.08, 0.08, 'lamp'], [0.25, -0.1, 0.45, 0.55, 0.08, 0.08, 'plant']],
  scales: () => [[0, 0, 0, 0.08, 0.2, 0.16, 'metalMedium'], [0, 0, 0.08, 0.12, 0.22, 0.2, 'metalLight']],
  weightRack: () => { const boxes = [[0, 0, 0, 1.1, 0.9, 0.2, 'metalDark']]; for (let z = 0; z < 3; z++) for (let i = 0; i < 5; i++) boxes.push([-0.7 + i * 0.35, 0.2, 0.15 + z * 0.33, 0.33 + z * 0.33, 0.12, 0.1, i % 2 ? 'metalMedium' : 'metalLight']); return boxes; },
  benchPress: () => [[0, 0, 0.4, 0.5, 0.15, 0.6, 'carpet'], [0, 0, 0, 0.4, 0.05, 0.5, 'metalDark'], [-0.45, -0.55, 0, 1.1, 0.03, 0.03, 'metal'], [0.45, -0.55, 0, 1.1, 0.03, 0.03, 'metal'], [0, -0.55, 1.05, 1.08, 0.9, 0.02, 'metalLight'], [-0.8, -0.55, 0.9, 1.25, 0.05, 0.18, 'metalDark'], [0.8, -0.55, 0.9, 1.25, 0.05, 0.18, 'metalDark']],
  punchBag: () => [[0, 0, 0, 0.05, 0.3, 0.3, 'metalDark'], [-0.27, 0, 0.05, 2.2, 0.03, 0.03, 'metal'], [0, 0, 2.15, 2.2, 0.3, 0.03, 'metal'], [0.05, 0, 0.8, 1.9, 0.17, 0.17, 'carpet']],
  poolWater: () => [[0, 0, 0, 0.12, 7.6, 3.6, 'carpetWhite'], [0, 0, 0.12, 0.14, 7, 3, 'glass'], [-7, 3.1, 0.14, 0.9, 0.04, 0.04, 'metal'], [7, -3.1, 0.14, 0.9, 0.04, 0.04, 'metal']],
  poolWaterSmall: () => [[0, 0, 0, 0.12, 4.6, 2.4, 'carpetWhite'], [0, 0, 0.12, 0.14, 4, 1.8, 'glass'], [-4, 1.9, 0.14, 0.9, 0.04, 0.04, 'metal']],
  lounger: () => [[0, 0, 0.28, 0.34, 0.3, 0.9, 'carpetWhite'], [0, -0.78, 0.34, 0.65, 0.3, 0.14, 'carpetWhite'], [-0.25, 0, 0, 0.28, 0.02, 0.8, 'metal'], [0.25, 0, 0, 0.28, 0.02, 0.8, 'metal']],
  cinemaScreen: () => [[0, -0.1, 0.8, 4.2, 4.2, 0.08, 'carpetWhite'], [0, -0.17, 0.7, 4.3, 4.3, 0.05, 'metalDark'], [0, -0.1, 0, 0.8, 4.2, 0.1, 'metalDark']],
  fieldMarks: () => [[0, 0, 0, 0.01, 0.06, 15, 'carpetWhite'], [-24, 0, 0, 0.01, 0.06, 15, 'carpetWhite'], [24, 0, 0, 0.01, 0.06, 15, 'carpetWhite'], [0, 15, 0, 0.01, 24, 0.06, 'carpetWhite'], [0, -15, 0, 0.01, 24, 0.06, 'carpetWhite'], [0, 0, 0, 0.01, 2.5, 0.06, 'carpetWhite'], [-23.8, -3, 0, 2.4, 0.06, 0.06, 'carpetWhite'], [-23.8, 3, 0, 2.4, 0.06, 0.06, 'carpetWhite'], [-23.8, 0, 2.4, 2.46, 0.06, 3, 'carpetWhite'], [23.8, -3, 0, 2.4, 0.06, 0.06, 'carpetWhite'], [23.8, 3, 0, 2.4, 0.06, 0.06, 'carpetWhite'], [23.8, 0, 2.4, 2.46, 0.06, 3, 'carpetWhite']],
  bleacher: () => { const boxes = []; for (let n = 0; n < 5; n++) { boxes.push([0, 1.6 - n * 0.8, 0, 0.45 * (n + 1), 4, 0.4, 'metalMedium']); for (let i = 0; i < 12; i++) boxes.push([-3.6 + i * 0.65, 1.75 - n * 0.8, 0.45 * (n + 1), 0.45 * (n + 1) + 0.1, 0.25, 0.2, i % 3 ? 'carpetBlue' : 'carpet']); } return boxes; },
  poolTable: () => [[0, 0, 0.75, 0.85, 0.65, 1.25, 'woodDark'], [0, 0, 0.85, 0.87, 0.57, 1.17, 'plant'], [-0.55, -1.1, 0, 0.75, 0.06, 0.06, 'woodDark'], [0.55, -1.1, 0, 0.75, 0.06, 0.06, 'woodDark'], [-0.55, 1.1, 0, 0.75, 0.06, 0.06, 'woodDark'], [0.55, 1.1, 0, 0.75, 0.06, 0.06, 'woodDark']],
  menuBoard: () => [[0, 0, 1.3, 2.3, 1.2, 0.04, 'metalDark'], [-0.6, 0.05, 1.4, 2.2, 0.5, 0.01, 'lamp'], [0.6, 0.05, 1.4, 2.2, 0.5, 0.01, 'carpet'], [-1.1, 0, 0, 1.3, 0.04, 0.04, 'metal'], [1.1, 0, 0, 1.3, 0.04, 0.04, 'metal']],
  booth: () => [[0, 0, 0.72, 0.77, 0.55, 0.4, 'wood'], [0, 0, 0, 0.72, 0.05, 0.05, 'metal'], [0, -0.75, 0.4, 0.5, 0.6, 0.25, 'carpet'], [0, -0.95, 0.5, 1.15, 0.6, 0.05, 'carpet'], [0, 0.75, 0.4, 0.5, 0.6, 0.25, 'carpet'], [0, 0.95, 0.5, 1.15, 0.6, 0.05, 'carpet'], [0, -0.75, 0, 0.4, 0.55, 0.2, 'woodDark'], [0, 0.75, 0, 0.4, 0.55, 0.2, 'woodDark']],
  carLift: () => [[-1.35, 0, 0, 2.8, 0.1, 0.1, 'carpet'], [1.35, 0, 0, 2.8, 0.1, 0.1, 'carpet'], [-1.1, 0, 1.5, 1.6, 0.25, 2.3, 'metalMedium'], [1.1, 0, 1.5, 1.6, 0.25, 2.3, 'metalMedium'], [0, 0, 2.7, 2.8, 1.35, 0.08, 'metalDark'], [0, 0, 1.6, 2.1, 0.8, 2.2, 'metalLight'], [0, 0.2, 2.1, 2.55, 0.72, 1.1, 'glass'], [-0.8, 1.3, 1.25, 1.65, 0.08, 0.3, 'metalDark'], [0.8, 1.3, 1.25, 1.65, 0.08, 0.3, 'metalDark'], [-0.8, -1.3, 1.25, 1.65, 0.08, 0.3, 'metalDark'], [0.8, -1.3, 1.25, 1.65, 0.08, 0.3, 'metalDark']],
  tireStack: () => [[0, 0, 0, 0.23, 0.33, 0.33, 'metalDark'], [0, 0, 0.23, 0.46, 0.33, 0.33, 'metalDark'], [0, 0, 0.46, 0.69, 0.33, 0.33, 'metalDark'], [0, 0, 0.69, 0.92, 0.33, 0.33, 'metalDark']],
  railTrack: () => { const boxes = [[0, 0, 0, 0.03, 8, 1.5, 'metalDark'], [0, -0.75, 0.03, 0.12, 8, 0.04, 'metalLight'], [0, 0.75, 0.03, 0.12, 8, 0.04, 'metalLight'], [0, 1.5, 0, 0.1, 8, 0.1, 'lamp']]; for (let i = 0; i < 16; i++) boxes.push([-7.5 + i, 0, 0.03, 0.07, 0.12, 1.1, 'wood']); return boxes; },
  turnstile: () => [[0, 0, 0, 1, 0.12, 0.5, 'metalLight'], [0.45, 0, 0.75, 0.85, 0.35, 0.02, 'metal'], [0.9, 0, 0, 1, 0.12, 0.5, 'metalLight']],
  vendingMachine: () => [[0, 0, 0, 1.9, 0.5, 0.4, 'carpet'], [-0.1, 0.41, 0.6, 1.8, 0.33, 0.01, 'glass'], [0.33, 0.41, 0.9, 1.6, 0.09, 0.01, 'metalDark'], [-0.1, 0.42, 0.2, 0.45, 0.33, 0.01, 'metalDark']],
  breadRack: () => { const boxes = [[-0.75, 0, 0, 1.7, 0.03, 0.25, 'wood'], [0.75, 0, 0, 1.7, 0.03, 0.25, 'wood']]; for (let z = 0; z < 4; z++) { boxes.push([0, 0, 0.2 + z * 0.45, 0.24 + z * 0.45, 0.75, 0.25, 'wood']); for (let i = 0; i < 4; i++) boxes.push([-0.5 + i * 0.33, 0, 0.24 + z * 0.45, 0.36 + z * 0.45, 0.13, 0.15, 'lamp']); } return boxes; },
  mailboxes: () => {
    const boxes = [[0, 0, 0.5, 1.75, 0.85, 0.12, 'metalMedium'], [-0.75, 0, 0, 0.5, 0.05, 0.1, 'metalDark'], [0.75, 0, 0, 0.5, 0.05, 0.1, 'metalDark']];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) boxes.push([-0.67 + i * 0.268, 0.13, 0.57 + j * 0.28, 0.82 + j * 0.28, 0.115, 0.01, 'metalLight']);
    return boxes;
  },
  noticeBoard: () => [[0, 0, 0.9, 1.75, 0.65, 0.02, 'wood'], [-0.6, 0, 0, 0.9, 0.03, 0.02, 'metal'], [0.6, 0, 0, 0.9, 0.03, 0.02, 'metal'], [-0.3, 0.03, 1.25, 1.6, 0.17, 0.01, 'carpetWhite'], [0.25, 0.03, 1.05, 1.4, 0.2, 0.01, 'carpetWhite']],
  // A front door standing open into the flat, with its frame in the wall. Its front is towards the corridor.
  frontDoor: () => [[-0.53, 0, 0, 2.1, 0.03, 0.07, 'woodDark'], [0.53, 0, 0, 2.1, 0.03, 0.07, 'woodDark'], [0, 0, 2.1, 2.2, 0.56, 0.07, 'woodDark'], [-0.47, -0.46, 0, 2.05, 0.025, 0.46, 'wood'], [-0.43, -0.82, 0.95, 1.05, 0.015, 0.03, 'metal']],
  whiteboard: () => [[0, 0, 0.85, 1.9, 0.85, 0.02, 'carpetWhite'], [-0.8, 0, 0, 0.85, 0.03, 0.02, 'metal'], [0.8, 0, 0, 0.85, 0.03, 0.02, 'metal']],
  filingCabinet: () => [[0, 0, 0, 1.3, 0.25, 0.3, 'metalMedium'], [0, 0.31, 0.95, 1.2, 0.2, 0.01, 'metalLight'], [0, 0.31, 0.6, 0.85, 0.2, 0.01, 'metalLight'], [0, 0.31, 0.25, 0.5, 0.2, 0.01, 'metalLight']],
  printer: () => [[0, 0, 0, 0.9, 0.35, 0.3, 'metalLight'], [0, 0, 0.9, 1.05, 0.3, 0.26, 'metalDark']],
  frontDesk: () => [[0, 0, 0, 1.05, 1.5, 0.35, 'woodDark'], [0, 0, 1.05, 1.1, 1.55, 0.4, 'wood']],
  tellerCounter: () => [[0, 0, 0, 1.05, 2, 0.4, 'woodDark'], [0, 0, 1.05, 1.1, 2.05, 0.45, 'wood'], [0, 0, 1.1, 1.9, 2.05, 0.02, 'glass'], [-1, 0, 1.1, 1.9, 0.03, 0.05, 'metal'], [1, 0, 1.1, 1.9, 0.03, 0.05, 'metal']],
  vaultDoor: () => [[0, 0, 0, 2.3, 1.1, 0.25, 'metalDark'], [0, 0.27, 0.3, 2, 0.7, 0.03, 'metalMedium'], [0, 0.32, 1, 1.3, 0.15, 0.03, 'metalLight']],
  safeWall: () => {
    const boxes = [[0, 0, 0, 2.2, 1.5, 0.22, 'metalDark']];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) boxes.push([-1.25 + i * 0.5, 0.23, 0.2 + j * 0.5, 0.6 + j * 0.5, 0.2, 0.01, 'metalMedium']);
    return boxes;
  },
  cashCart: () => [[0, 0, 0.15, 0.9, 0.4, 0.25, 'metal'], [0, 0, 0, 0.15, 0.35, 0.2, 'metalDark'], [0, 0, 0.9, 1, 0.3, 0.18, 'plant']],
  atm: () => [[0, 0, 0, 1.6, 0.35, 0.3, 'metalMedium'], [0, 0.31, 1, 1.4, 0.22, 0.01, 'metalDark'], [0, 0.32, 0.8, 0.9, 0.18, 0.05, 'metalLight']],
  queueRope: () => [[-0.95, 0, 0, 1, 0.04, 0.04, 'metal'], [0.95, 0, 0, 1, 0.04, 0.04, 'metal'], [0, 0, 0.85, 0.9, 0.95, 0.02, 'carpet']],
  stall: () => [[-0.48, 0, 0, 1.9, 0.02, 0.75, 'metalLight'], [0.48, 0, 0, 1.9, 0.02, 0.75, 'metalLight'], [0, -0.73, 0, 1.9, 0.5, 0.02, 'metalLight'], [0, -0.45, 0, 0.45, 0.2, 0.25, 'carpetWhite']],
  storeShelf: () => [[0, 0, 0, 0.1, 1.2, 0.35, 'metalDark'], [0, 0, 0, 1.8, 1.2, 0.03, 'metal'], [0, 0, 0.5, 0.55, 1.2, 0.35, 'metal'], [0, 0, 1.05, 1.1, 1.2, 0.35, 'metal'], [-0.6, 0.1, 0.1, 0.45, 0.5, 0.2, 'carpet'], [0.6, 0.1, 0.1, 0.45, 0.5, 0.2, 'carpetBlue'], [-0.5, 0.1, 0.55, 0.95, 0.6, 0.2, 'carpetBlue'], [0.6, 0.1, 0.55, 0.9, 0.45, 0.2, 'wood'], [0, 0.1, 1.1, 1.45, 1, 0.2, 'carpet']],
  fridgeCase: () => [[0, 0, 0, 2.05, 1.2, 0.4, 'metalLight'], [0, 0.41, 0.2, 1.9, 1.1, 0.01, 'glass'], [0, 0.42, 1.95, 2, 1.1, 0.01, 'lamp']],
  displayTable: () => [[0, 0, 0.7, 0.78, 0.8, 0.5, 'wood'], [-0.7, 0, 0, 0.7, 0.05, 0.4, 'woodDark'], [0.7, 0, 0, 0.7, 0.05, 0.4, 'woodDark'], [-0.3, 0, 0.78, 0.9, 0.25, 0.3, 'carpet'], [0.35, 0, 0.78, 0.86, 0.25, 0.3, 'carpetBlue']],
  clothesRack: () => {
    const boxes = [[-0.75, 0, 0, 1.5, 0.02, 0.2, 'metal'], [0.75, 0, 0, 1.5, 0.02, 0.2, 'metal'], [0, 0, 1.48, 1.5, 0.75, 0.02, 'metal']];
    for (let i = 0; i < 6; i++) boxes.push([-0.6 + i * 0.24, 0, 0.6, 1.45, 0.08, 0.18, i % 2 ? 'carpet' : 'carpetBlue']);
    return boxes;
  },
  mannequin: () => [[0, 0, 0, 0.05, 0.2, 0.2, 'metalDark'], [-0.09, 0, 0.05, 0.85, 0.06, 0.07, 'carpetWhite'], [0.09, 0, 0.05, 0.85, 0.06, 0.07, 'carpetWhite'], [0, 0, 0.85, 1.45, 0.17, 0.09, 'carpet'], [0, 0, 1.5, 1.72, 0.09, 0.1, 'carpetWhite']],
  till: () => [[0, 0, 0, 0.1, 0.2, 0.2, 'metalDark'], [0, 0, 0.1, 0.32, 0.17, 0.03, 'metalMedium']],
  barCounter: () => [[0, 0, 0, 1.05, 1.5, 0.3, 'woodDark'], [0, 0, 1.05, 1.1, 1.55, 0.35, 'wood'], [-1, 0, 1.1, 1.35, 0.05, 0.05, 'glass'], [-0.8, 0, 1.1, 1.3, 0.05, 0.05, 'plant'], [-0.6, 0, 1.1, 1.38, 0.05, 0.05, 'glass']],
  proStove: () => [[0, 0, 0, 0.9, 0.6, 0.4, 'metalMedium'], [0, 0, 0.9, 0.93, 0.55, 0.35, 'metalDark'], [0, 0.41, 0.2, 0.65, 0.45, 0.01, 'metalDark'], [0, -0.3, 0.9, 1.9, 0.6, 0.1, 'metal']],
  prepTable: () => [[0, 0, 0.85, 0.92, 0.8, 0.4, 'metalLight'], [0, 0, 0.25, 0.3, 0.75, 0.35, 'metal'], [-0.75, 0, 0, 0.85, 0.03, 0.35, 'metal'], [0.75, 0, 0, 0.85, 0.03, 0.35, 'metal']],
  walkInFridge: () => [[0, 0, 0, 2.5, 1.2, 1, 'metalLight'], [0, 1.01, 0.05, 2.15, 0.55, 0.02, 'metal'], [0.42, 1.04, 0.9, 1.3, 0.04, 0.02, 'metalDark']],
  pew: () => [[0, 0, 0.42, 0.48, 1.5, 0.22, 'wood'], [0, -0.2, 0.42, 0.95, 1.5, 0.03, 'wood'], [-1.45, 0, 0, 0.42, 0.04, 0.22, 'woodDark'], [1.45, 0, 0, 0.42, 0.04, 0.22, 'woodDark']],
  altar: () => [[0, 0, 0, 1, 1, 0.45, 'carpetWhite'], [0, 0, 1, 1.05, 1.05, 0.5, 'wood'], [0, 0, 1.05, 1.35, 0.03, 0.03, 'lamp']],
  schoolDesk: () => [[0, 0, 0.68, 0.72, 0.35, 0.25, 'wood'], [-0.3, 0, 0, 0.68, 0.02, 0.2, 'metal'], [0.3, 0, 0, 0.68, 0.02, 0.2, 'metal'], [0, 0.5, 0.42, 0.45, 0.2, 0.18, 'wood'], [0, 0.68, 0.42, 0.8, 0.2, 0.02, 'wood'], [-0.15, 0.5, 0, 0.42, 0.02, 0.15, 'metal'], [0.15, 0.5, 0, 0.42, 0.02, 0.15, 'metal']],
  locker: () => [[-0.3, 0, 0, 1.8, 0.28, 0.25, 'carpetBlue'], [0.3, 0, 0, 1.8, 0.28, 0.25, 'carpet'], [-0.3, 0.26, 1.3, 1.5, 0.2, 0.01, 'metalDark'], [0.3, 0.26, 1.3, 1.5, 0.2, 0.01, 'metalDark']],
  hospitalBed: () => [[0, 0, 0.55, 0.72, 0.5, 1, 'carpetWhite'], [0, 0, 0.45, 0.55, 0.52, 1.02, 'metal'], [0, -1, 0, 1, 0.5, 0.03, 'metal'], [-0.45, 0.9, 0, 0.45, 0.03, 0.03, 'metal'], [0.45, 0.9, 0, 0.45, 0.03, 0.03, 'metal'], [-0.45, -0.9, 0, 0.45, 0.03, 0.03, 'metal'], [0.45, -0.9, 0, 0.45, 0.03, 0.03, 'metal'], [0, 0.45, 0.72, 0.76, 0.5, 0.55, 'carpetBlue']],
  dripStand: () => [[0, 0, 0, 0.05, 0.2, 0.2, 'metal'], [0, 0, 0.05, 1.8, 0.015, 0.015, 'metal'], [0, 0, 1.55, 1.75, 0.05, 0.03, 'glass']],
  displayCase: () => [[0, 0, 0, 0.85, 0.6, 0.35, 'woodDark'], [0, 0, 0.85, 1.25, 0.6, 0.35, 'glass'], [0, 0, 0.85, 1, 0.15, 0.15, 'lamp']],
  plinth: () => [[0, 0, 0, 1, 0.3, 0.3, 'carpetWhite'], [0, 0, 1, 1.5, 0.15, 0.15, 'metalMedium']],
  palletRack: () => {
    const boxes = [];
    for (const x of [-1.3, 1.3]) for (const y of [-0.45, 0.45]) boxes.push([x, y, 0, 2.9, 0.04, 0.04, 'carpetBlue']);
    for (const z of [0.1, 1.45]) {
      boxes.push([0, 0, z, z + 0.1, 1.3, 0.5, 'carpet']);
      for (const x of [-0.65, 0.65]) boxes.push([x, 0, z + 0.1, z + 1, 0.55, 0.42, 'wood']);
    }
    return boxes;
  },
  pallet: () => [[0, 0, 0, 0.14, 0.6, 0.5, 'wood'], [0, 0, 0.14, 0.9, 0.5, 0.42, 'wood'], [0, 0, 0.9, 0.92, 0.5, 0.42, 'metal']],
  forklift: () => [[0, -0.2, 0.2, 1.1, 0.55, 0.8, 'lamp'], [0, -0.4, 1.1, 2.1, 0.5, 0.45, 'metalDark'], [0, 0.65, 0, 2.3, 0.4, 0.03, 'metalDark'], [-0.2, 0.9, 0.05, 0.1, 0.05, 0.3, 'metalDark'], [0.2, 0.9, 0.05, 0.1, 0.05, 0.3, 'metalDark']],
  machine: () => [[0, 0, 0, 1.6, 1.2, 0.7, 'metalMedium'], [0, 0, 1.6, 2.1, 0.8, 0.5, 'metalDark'], [0.8, 0.71, 0.9, 1.4, 0.25, 0.01, 'metalDark'], [0, 0.72, 0.1, 0.25, 1.2, 0.02, 'lamp']],
  conveyor: () => [[0, 0, 0.75, 0.9, 2, 0.4, 'metalDark'], [-1.8, 0, 0, 0.75, 0.05, 0.35, 'metal'], [1.8, 0, 0, 0.75, 0.05, 0.35, 'metal'], [-0.6, 0, 0.9, 1.2, 0.25, 0.25, 'wood'], [0.9, 0, 0.9, 1.1, 0.2, 0.2, 'wood']],
  toolChest: () => [[0, 0, 0, 1, 0.5, 0.25, 'carpet'], [0, 0.26, 0.65, 0.9, 0.45, 0.01, 'metal'], [0, 0.26, 0.35, 0.6, 0.45, 0.01, 'metal'], [0, 0.26, 0.05, 0.3, 0.45, 0.01, 'metal']],
  workbench: () => [[0, 0, 0.82, 0.92, 1, 0.35, 'wood'], [-0.9, 0, 0, 0.82, 0.05, 0.3, 'metalDark'], [0.9, 0, 0, 0.82, 0.05, 0.3, 'metalDark'], [0, 0, 0.2, 0.25, 0.9, 0.3, 'wood'], [-0.4, 0, 0.92, 1.1, 0.15, 0.12, 'carpet']],
  seatRow: () => {
    const boxes = [[0, 0, 0, 0.3, 0.05, 0.2, 'metal'], [-1, 0, 0, 0.3, 0.05, 0.2, 'metal'], [1, 0, 0, 0.3, 0.05, 0.2, 'metal'], [0, 0, 0.3, 0.33, 1.3, 0.1, 'metalDark']];
    for (let i = 0; i < 4; i++) boxes.push([-0.97 + i * 0.65, 0, 0.33, 0.45, 0.28, 0.24, 'carpetBlue'], [-0.97 + i * 0.65, -0.22, 0.45, 0.85, 0.28, 0.03, 'carpetBlue']);
    return boxes;
  },
  checkInDesk: () => [[0, 0, 0, 1.05, 0.9, 0.4, 'metalLight'], [0.5, 0.1, 1.05, 1.4, 0.2, 0.02, 'metalDark'], [-0.5, 0.45, 0, 0.5, 0.35, 0.05, 'metalDark'], [0, 0, 2.2, 2.5, 0.8, 0.03, 'carpetBlue'], [0.85, 0, 1.05, 2.2, 0.03, 0.03, 'metal']],
  departureBoard: () => [[0, 0, 1.6, 2.7, 1.2, 0.05, 'metalDark'], [0, 0.06, 1.7, 2.6, 1.1, 0.01, 'carpetBlue'], [-0.9, 0, 0, 1.6, 0.05, 0.05, 'metal'], [0.9, 0, 0, 1.6, 0.05, 0.05, 'metal']],
  plane: () => [[0, 0, 0.5, 2, 0.75, 4.5, 'carpetWhite'], [0, 0.5, 1.2, 1.4, 5.5, 0.8, 'carpetWhite'], [0, -4, 1.7, 2.1, 2, 0.5, 'carpetWhite'], [0, -4.2, 2, 3.2, 0.05, 0.5, 'carpetBlue'], [0, 3.5, 1.4, 1.9, 0.6, 0.5, 'glass'], [0, 4.6, 1, 1.5, 0.4, 0.15, 'metalDark'], [0, 3, 0, 0.5, 0.1, 0.1, 'metalDark'], [-2, -0.3, 0, 0.5, 0.1, 0.1, 'metalDark'], [2, -0.3, 0, 0.5, 0.1, 0.1, 'metalDark']],
  treadmill: () => [[0, 0, 0, 0.2, 0.4, 0.9, 'metalDark'], [0, 0.8, 0.2, 1.3, 0.35, 0.05, 'metal'], [0, 0.85, 1.1, 1.3, 0.3, 0.05, 'metalDark']],
  // The top of the stairs from the floor above: the opening, with a rail on three sides. It matches the stairs below, given their size.
  stairwell: ({ w, d }) => [
    [0, 0, 0.05, 0.07, w / 2, d / 2, 'metalDark'],
    [-w / 2 + 0.03, 0, 0, 1, 0.03, d / 2, 'wood'],
    [w / 2 - 0.03, 0, 0, 1, 0.03, d / 2, 'wood'],
    [0, -d / 2 + 0.03, 0, 1, w / 2, 0.03, 'wood'],
  ],
};

function carBuilds() {
  const shapes = {
    Sedan: { hw: 0.9, hd: 2.25, sill: 0.3, belt: 0.82, roof: 1.42, cabin: [0.15, 1.2] },
    Hatch: { hw: 0.87, hd: 1.95, sill: 0.3, belt: 0.86, roof: 1.5, cabin: [-0.3, 1.35] },
    Suv: { hw: 0.95, hd: 2.35, sill: 0.42, belt: 1.05, roof: 1.78, cabin: [-0.4, 1.65] },
  };
  const out = {};
  for (const [body, s] of Object.entries(shapes)) {
    for (const paint of CAR_PAINTS) {
      out[carName(body, paint)] = () => {
        const [middle, half] = s.cabin, wheel = [[-1, 1], [1, 1], [-1, -1], [1, -1]];
        return [
          [0, 0, s.sill, s.belt, s.hw, s.hd, paint],
          [0, middle, s.belt, s.roof, s.hw - 0.08, half, 'glass'],
          [0, middle, s.roof, s.roof + 0.04, s.hw - 0.1, half - 0.04, paint],
          [-0.55, s.hd + 0.01, s.belt - 0.22, s.belt - 0.08, 0.2, 0.01, 'lamp'],
          [0.55, s.hd + 0.01, s.belt - 0.22, s.belt - 0.08, 0.2, 0.01, 'lamp'],
          [-0.55, -s.hd - 0.01, s.belt - 0.22, s.belt - 0.08, 0.2, 0.01, 'carpet'],
          [0.55, -s.hd - 0.01, s.belt - 0.22, s.belt - 0.08, 0.2, 0.01, 'carpet'],
          ...wheel.map(([x, y]) => [x * (s.hw - 0.02), y * (s.hd - 0.72), 0, 0.62, 0.12, 0.31, 'metalDark']),
        ];
      };
    }
  }
  return out;
}

function builtModel(boxes) {
  const byMaterial = new Map();
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, top = 0;
  for (const [x, y, z0, z1, hx, hy, mat] of boxes) {
    const list = byMaterial.get(mat) || [];
    byMaterial.set(mat, list);
    const p = (sx, sy, z) => [Math.round((x + sx * hx) * MM), Math.round((y + sy * hy) * MM), Math.round(z * MM)];
    const quad = (a, b, c, d) => list.push(...a, ...b, ...c, ...a, ...c, ...d);
    quad(p(-1, -1, z1), p(1, -1, z1), p(1, 1, z1), p(-1, 1, z1));
    quad(p(-1, -1, z0), p(1, -1, z0), p(1, -1, z1), p(-1, -1, z1));
    quad(p(1, -1, z0), p(1, 1, z0), p(1, 1, z1), p(1, -1, z1));
    quad(p(1, 1, z0), p(-1, 1, z0), p(-1, 1, z1), p(1, 1, z1));
    quad(p(-1, 1, z0), p(-1, -1, z0), p(-1, -1, z1), p(-1, 1, z1));
    minX = Math.min(minX, x - hx); maxX = Math.max(maxX, x + hx); minY = Math.min(minY, y - hy); maxY = Math.max(maxY, y + hy); top = Math.max(top, z1);
  }
  return { w: maxX - minX, d: maxY - minY, h: top, parts: [...byMaterial].map(([mat, list]) => ({ mat, points: Int16Array.from(list) })) };
}

export const isSolid = (item) => ITEMS[item]?.solid !== false;

// Every model the catalogue can use.
export const usedModels = () => [...new Set(Object.values(ITEMS).filter((item) => !item.built).flatMap((item) => item.models))].sort();

// furniture.bin: the length of a JSON index, the index, then each model's triangles as millimetres in 16 bits.
export function parseFurniture(buffer) {
  const head = new DataView(buffer).getUint32(0, true), index = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 4, head)));
  const models = {};
  let at = 4 + head;
  for (const [name, { parts, min, max }] of Object.entries(index.models)) {
    models[name] = {
      w: (max[0] - min[0]) / MM, d: (max[1] - min[1]) / MM, h: max[2] / MM,
      parts: parts.map(({ mat, tris }) => {
        const part = { mat, points: new Int16Array(buffer, at, tris * 9) };
        at += tris * 18;
        return part;
      }),
    };
  }
  for (const [name, boxes] of Object.entries(BUILT)) models[name] = builtModel(boxes(models.stairs));
  return { models, colours: index.colours };
}

export const triangleCount = (model) => model.parts.reduce((sum, part) => sum + part.points.length / 9, 0);

// Adds a model to a mesh, standing at (x, y, z) and turned to a compass bearing. colourOf: material name to r, g, b.
export function bake(mesh, model, x, y, z, bearing, colourOf) {
  const c = Math.cos(bearing), s = Math.sin(bearing);
  const at = (p, i) => {
    const mx = p[i] / MM, my = p[i + 1] / MM;
    return [x + mx * c + my * s, y - mx * s + my * c, z + p[i + 2] / MM];
  };
  for (const { mat, points } of model.parts) {
    const colour = colourOf(mat);
    for (let i = 0; i < points.length; i += 9) mesh.tri(at(points, i), at(points, i + 3), at(points, i + 6), colour);
  }
}
