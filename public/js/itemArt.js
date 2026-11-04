// A small picture of each thing that can be in the bag or the car, drawn here so there's no licence to think about. Flat shapes on a 32 by 32 grid. Pure, tested in node.
// A new item in gameConfig.js needs a line here, or it gets the plain parcel at the bottom (a test says which).
const svg = (inner) => `<svg viewBox="0 0 32 32" aria-hidden="true">${inner}</svg>`;
const rect = (x, y, w, h, fill, r = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}"/>`;
const circle = (x, y, r, fill) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}"/>`;
const path = (d, fill) => `<path d="${d}" fill="${fill}"/>`;
const line = (d, stroke, width = 2) => `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;

// Shapes that several things share, in their own colours.
const book = (cover, band = '#f3e9d2') => rect(7, 4, 18, 24, cover, 2) + rect(9, 4, 2, 24, '#0003') + rect(13, 9, 9, 3, band, 1);
const can = (body, label) => rect(9, 6, 14, 21, body, 2) + rect(9, 12, 14, 9, label) + rect(9, 5, 14, 2, '#c9d1d6', 1) + rect(9, 26, 14, 2, '#c9d1d6', 1);
const carton = (body, band) => path('M9 11l4-6h6l4 6v17H9z', body) + path('M13 5h6l4 6H9z', '#0002') + rect(9, 16, 14, 6, band);
const bottle = (body, cap) => rect(13, 3, 6, 4, cap, 1) + path('M13 7h6v3c3 1 4 3 4 5v11a2 2 0 0 1-2 2H11a2 2 0 0 1-2-2V15c0-2 1-4 4-5z', body);
const carrier = (body, top) => rect(6, 11, 20, 16, body, 2) + rect(5, 8, 22, 5, top, 1);
const paper = (fill = '#f4f1e6', ink = '#8a8f96') => path('M8 4h12l5 5v19H8z', fill) + path('M20 4l5 5h-5z', '#0002') + rect(11, 13, 11, 1.5, ink) + rect(11, 17, 11, 1.5, ink) + rect(11, 21, 7, 1.5, ink);
const jacket = (cloth, dark) => path('M11 5l5 3 5-3 6 4 2 14-4 1-1-8v13H8V16l-1 8-4-1 2-14z', cloth) + path('M16 8v20', dark) + line('M16 8v20', dark, 1.2) + path('M11 5l5 3-3 4zM21 5l-5 3 3 4z', dark);
const key = (metal, head = metal) => circle(10, 11, 6, head) + circle(10, 11, 2.4, '#00000055') + path('M13 14l14 12-3 3-3-2-1 2-3-2-1 2-6-11z', metal);
const notes = (fill, mark) => rect(4, 10, 24, 13, fill, 1) + circle(16, 16.5, 4, mark) + rect(6, 12, 3, 2, mark) + rect(23, 19, 3, 2, mark);
const tape = (roll, hole = '#2a2f35') => circle(16, 16, 11, roll) + circle(16, 16, 5, hole) + path('M23 24l6 3-1 3-7-3z', roll);
const cardboard = rect(5, 10, 22, 17, '#c49a63', 1) + path('M5 10l4-5h14l4 5z', '#d9b27e') + rect(14, 5, 4, 12, '#a87f4b');

const ICONS = {
  // To eat
  'Leftover pizza': path('M4 8c8-4 16-4 24 0L16 29z', '#e9b65c') + path('M4 8c8-4 16-4 24 0l-2 3c-7-3-13-3-20 0z', '#b7803a') + circle(13, 14, 2.2, '#c0392b') + circle(19, 15, 2.2, '#c0392b') + circle(16, 21, 2, '#c0392b'),
  'Can of soup': can('#d9dde0', '#c0392b'),
  'Box of cereal': rect(8, 3, 16, 26, '#f0a830', 1) + circle(16, 13, 5, '#fff3cf') + circle(14, 12, 1.2, '#b7803a') + circle(18, 14, 1.2, '#b7803a') + rect(10, 22, 12, 3, '#c0392b'),
  'Can of beans': can('#b8c0c6', '#d35e2b') + circle(13, 16.500, 1.6, '#7a3b1c') + circle(19, 16.500, 1.6, '#7a3b1c') + circle(16, 18, 1.6, '#7a3b1c'),
  'Tray of steaks': rect(3, 19, 26, 8, '#aab3ba', 2) + path('M7 10c3-4 9-4 11 0 2 3 0 9-5 9-4 0-8-5-6-9z', '#a83a32') + circle(12, 14, 2, '#f0d9c8') + path('M19 11c3-2 7-1 8 2 1 4-2 6-5 6-3 0-5-5-3-8z', '#a83a32'),
  Sandwich: path('M3 13L16 6l13 7z', '#e0b878') + rect(3, 13, 26, 3, '#7fb24a') + rect(3, 16, 26, 3, '#c0392b') + rect(3, 19, 26, 5, '#e0b878', 1),
  'Fresh loaf': path('M4 18c0-7 5-10 12-10s12 3 12 10v5a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z', '#c98a45') + line('M11 11l-2 6M17 10l-2 7M23 11l-2 6', '#8f5a25'),
  Croissant: path('M3 21C5 10 11 6 16 6s11 4 13 15c-3 1-5 0-6-3-1-3-4-5-7-5s-6 2-7 5c-1 3-3 4-6 3z', '#d9a04e') + line('M10 8l2 7M16 6v7M22 8l-2 7', '#a06f2c', 1.5),
  Apple: path('M16 10c-3-3-11-2-11 7 0 7 5 12 8 12 1 0 2-1 3-1s2 1 3 1c3 0 8-5 8-12 0-9-8-10-11-7z', '#c8332b') + line('M16 10c0-3 1-5 3-6', '#6b4423') + path('M18 7c2-3 5-3 7-2-1 3-4 4-7 2z', '#5fa53f'),
  Banana: path('M6 5c0 12 7 20 21 20 1 0 1 2 0 2C13 30 3 20 4 5c0-1 2-1 2 0z', '#f2cf3f') + path('M6 5C7 15 14 22 27 25c-6 3-19 0-23-20z', '#e0b520'),
  'Candy bar': rect(3, 11, 26, 10, '#6b3a22', 1) + rect(9, 10, 14, 12, '#d6332e') + rect(11, 14, 10, 4, '#fff'),
  'Dog biscuit': path('M9 12a4 4 0 1 0-4 4 4 4 0 1 0 4 4h14a4 4 0 1 0 4-4 4 4 0 1 0-4-4z', '#c99a5b'),
  Burger: path('M5 13c0-6 5-8 11-8s11 2 11 8z', '#d9a04e') + rect(4, 14, 24, 3, '#7fb24a', 1) + rect(5, 17, 22, 4, '#6b3a22', 1) + path('M5 21h22c0 4-3 6-6 6H11c-3 0-6-2-6-6z', '#d9a04e') + circle(12, 9, 0.8, '#f4e3b8') + circle(19, 8, 0.8, '#f4e3b8'),
  'Raw deer meat': path('M5 18c1-8 8-12 13-8 6 4 9 2 9 8 0 7-5 10-11 10C8 28 4 24 5 18z', '#c44a48') + path('M11 16c4 2 8 1 11-2', '#f2c9c4'),
  'Cooked deer meat': path('M6 17c0-7 7-11 12-7 5 4 8 2 8 7 0 7-4 11-10 11S6 24 6 17z', '#7a3e22') + line('M11 14c3 2 7 2 10-1', '#c9844a', 1.4) + circle(18, 18, 1.2, '#3a2416'),
  'Raw chicken': path('M8 20c2-9 10-12 16-6 2 2 3 6 1 9-3 4-8 6-13 4-4-1-6-4-4-7z', '#f4e4c4') + path('M22 12l6-4-2 6z', '#e8b86a'),
  'Cooked chicken': path('M8 20c2-9 10-12 16-6 2 2 3 6 1 9-3 4-8 6-13 4-4-1-6-4-4-7z', '#c4783a') + path('M22 12l6-4-2 6z', '#8a4e22'),
  'Raw rabbit': circle(16, 20, 7, '#d8c4b0') + circle(11, 9, 3.2, '#d8c4b0') + circle(21, 9, 3.2, '#d8c4b0') + circle(16, 20, 1.3, '#c46a6a'),
  'Cooked rabbit': circle(16, 20, 7, '#7a4630') + circle(11, 9, 3.2, '#7a4630') + circle(21, 9, 3.2, '#7a4630') + circle(16, 20, 1.3, '#3a2416'),
  'Half a burger': path('M16 5c-6 0-11 2-11 8h11z', '#d9a04e') + rect(4, 14, 12, 3, '#7fb24a') + rect(5, 17, 11, 4, '#6b3a22') + path('M5 21h11v6h-5c-3 0-6-2-6-6z', '#d9a04e'),
  Fries: path('M9 14h14l-2 15H11z', '#d6332e') + rect(10, 5, 2.5, 11, '#f2cf3f') + rect(13.500, 3, 2.5, 13, '#f2cf3f') + rect(17, 4, 2.5, 12, '#f2cf3f') + rect(20, 7, 2, 9, '#f2cf3f'),
  'Chicken wrap': path('M8 8l16 3-4 18H9z', '#e8d3a2') + path('M8 8l16 3-2 7-14-3z', '#7fb24a') + line('M9 14l13 3', '#d9a04e', 1.5),
  'Bowl of soup': path('M4 14h24c0 8-5 13-12 13S4 22 4 14z', '#f4f1e6') + path('M6 14h20l-1 3H7z', '#d9741a') + line('M12 10c-1-2 1-2 0-4M19 10c-1-2 1-2 0-4', '#cfd6db', 1.4),
  'Bread roll': path('M4 20c0-7 5-11 12-11s12 4 12 11c0 3-2 4-4 4H8c-2 0-4-1-4-4z', '#d9a04e') + line('M12 12c-1 3-1 5 0 7M20 12c1 3 1 5 0 7', '#a06f2c', 1.4),
  'Slice of pizza': path('M6 6c6-2 14-2 20 0L16 29z', '#f0c36b') + path('M6 6c6-2 14-2 20 0l-1 3c-6-2-12-2-18 0z', '#b7803a') + circle(14, 13, 2, '#c0392b') + circle(19, 15, 1.8, '#c0392b') + circle(16, 20, 1.5, '#c0392b'),
  'Slice of cake': path('M4 15l18-8 6 6v14H4z', '#f4e3b8') + path('M4 15l18-8 6 6z', '#f3a8c4') + rect(4, 19, 24, 3, '#c8488f') + circle(22, 6, 2, '#c0392b'),
  Muffin: path('M8 16h16l-2 12H10z', '#c8693c') + line('M12 17l1 10M16 17v10M20 17l-1 10', '#8f4a28', 1.2) + path('M6 16c-1-6 4-11 10-11s11 5 10 11c0 1-1 2-2 2H8c-1 0-2-1-2-2z', '#a8733c') + circle(12, 10, 1, '#3b2212') + circle(19, 11, 1, '#3b2212') + circle(15, 13, 1, '#3b2212'),
  Donut: circle(16, 16, 12, '#c98a45') + path('M4 16a12 12 0 0 1 24 0c-2 3-4 1-6 3s-4 0-6 1-5-2-7-1-4 0-5-3z', '#f3a8c4') + circle(16, 16, 4, '#2a1c13') + rect(9, 9, 3, 1, '#fff') + rect(21, 11, 3, 1, '#f2cf3f') + rect(19, 22, 1, 0.1, '#fff'),
  Yogurt: path('M8 10h16l-2 18H10z', '#f4f1e6') + rect(7, 6, 18, 4, '#3f8fd8', 1) + circle(16, 18, 4, '#d6547a'),
  Cheese: path('M3 18L22 7c4 1 7 5 7 11v8H3z', '#f2cf3f') + path('M3 18L22 7c4 1 7 5 7 11z', '#e0b520') + circle(10, 23, 2, '#c9a018') + circle(19, 22, 2.5, '#c9a018') + circle(25, 24, 1.4, '#c9a018'),
  'Bag of chips': path('M8 3h16l1 3-1 20 1 3H7l1-3L7 6z', '#d6332e') + circle(16, 16, 6, '#f2cf3f') + rect(7, 6, 18, 2, '#a82320') + rect(7, 24, 18, 2, '#a82320'),
  'Instant noodles': path('M7 10h18l-2 18H9z', '#f28c28') + rect(5, 6, 22, 5, '#fff3cf', 1) + line('M11 18c2 2 3-2 5 0s3-2 5 0', '#fff3cf'),
  'Peanut butter': rect(8, 11, 16, 17, '#b7803a', 3) + rect(8, 5, 16, 6, '#d6332e', 1) + rect(8, 15, 16, 8, '#f2e3bd'),
  'Granola bar': rect(3, 11, 26, 10, '#3f8f5a', 1) + rect(8, 13, 16, 6, '#d9a04e', 1) + circle(12, 16, 1, '#8f5a25') + circle(16, 15, 1, '#8f5a25') + circle(20, 17, 1, '#8f5a25'),
  'Protein bar': rect(3, 11, 26, 10, '#2f3a44', 1) + rect(9, 13, 14, 6, '#e6b422', 1) + rect(12, 15, 8, 2, '#2f3a44'),
  Orange: circle(16, 17, 11, '#f28c28') + circle(12, 13, 2, '#f9b86a') + path('M16 6c2-3 5-3 7-2-1 3-4 4-7 2z', '#5fa53f'),
  Grapes: circle(12, 11, 4, '#6b3a8f') + circle(20, 11, 4, '#6b3a8f') + circle(16, 16, 4, '#7e4aa6') + circle(9, 17, 4, '#7e4aa6') + circle(23, 17, 4, '#7e4aa6') + circle(13, 22, 4, '#6b3a8f') + circle(19, 22, 4, '#6b3a8f') + circle(16, 27, 3.5, '#7e4aa6') + line('M16 7c0-2 1-3 3-4', '#5fa53f'),
  // To drink
  'Energy drink': rect(10, 3, 12, 26, '#1e2933', 2) + rect(11, 2, 10, 2, '#c9d1d6', 1) + path('M18 7l-6 10h4l-2 8 7-11h-4z', '#7fe04a'),
  'Juice box': rect(7, 8, 18, 21, '#5fa53f', 1) + circle(16, 18, 5, '#f28c28') + line('M20 8l3-5h3', '#f4f1e6'),
  'Glass of water': path('M9 4h14l-2 24H11z', '#ffffff55') + path('M9.800 12h12.400l-1.300 16H11z', '#a9dcf5'),
  Milk: carton('#f6f8fa', '#3f8fd8'),
  'Crate of milk': carrier('#3f8fd8', '#2d6fae') + rect(8, 5, 5, 7, '#f6f8fa', 1) + rect(14, 5, 5, 7, '#f6f8fa', 1) + rect(20, 5, 5, 7, '#f6f8fa', 1) + line('M10 16v7M16 16v7M22 16v7', '#2d6fae'),
  'Orange juice': carton('#f28c28', '#fff3cf') + circle(16, 19, 2.5, '#f28c28'),
  'Cold soda': rect(10, 5, 12, 22, '#d6332e', 3) + rect(11, 4, 10, 2, '#c9d1d6', 1) + rect(11, 26, 10, 2, '#c9d1d6', 1) + line('M12 18c3-4 5 2 8-3', '#fff'),
  'Cold drink': rect(10, 5, 12, 22, '#2d9c8c', 3) + rect(11, 4, 10, 2, '#c9d1d6', 1) + rect(11, 26, 10, 2, '#c9d1d6', 1) + circle(16, 16, 3, '#dff5f0'),
  'Bottle of water': bottle('#a9dcf5', '#2d7fc2') + rect(9, 17, 14, 6, '#2d7fc2'),
  'Cup of coffee': path('M7 11h16v12a5 5 0 0 1-5 5h-6a5 5 0 0 1-5-5z', '#f4f1e6') + rect(7, 11, 16, 3, '#5a3a22') + line('M23 14c5-1 6 8-1 8', '#f4f1e6') + line('M12 8c-1-2 1-2 0-4M18 8c-1-2 1-2 0-4', '#cfd6db', 1.4),
  'Empty can': path('M9 12l13-6 3 6-1 11-7 5-7-5z', '#9aa3aa') + path('M9 12l13-6-5 11z', '#c9d1d6'),
  // Medicine
  Aspirin: bottle('#f2f2f2', '#d6332e') + rect(9, 15, 14, 9, '#d6332e') + rect(14.500, 16.500, 3, 6, '#fff') + rect(13, 18, 6, 3, '#fff'),
  'Band-Aids': rect(3, 11, 26, 10, '#e2b48c', 5) + rect(11, 11, 10, 10, '#f3d7bd') + circle(14, 14, 0.8, '#b98a62') + circle(18, 14, 0.8, '#b98a62') + circle(14, 18, 0.8, '#b98a62') + circle(18, 18, 0.8, '#b98a62'),
  Bandages: circle(16, 16, 11, '#f4f1e6') + circle(16, 16, 4, '#cfc8b4') + path('M25 22l5 2-1 5-7-3z', '#f4f1e6') + line('M9 11c4-4 10-4 14 0', '#cfc8b4', 1.4),
  Thermometer: rect(14, 3, 5, 19, '#e8edf0', 2.5) + circle(16.500, 24, 5, '#d6332e') + rect(15.500, 9, 2, 14, '#d6332e'),
  Toothpaste: path('M5 11h17l5 3v4l-5 3H5z', '#f2f6f8') + rect(5, 13, 12, 6, '#2d7fc2') + rect(27, 14, 3, 4, '#c0392b', 1),
  // Power and tools
  Flashlight: path('M10 4h12l-2 9v13a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V13z', '#8a97a3') + path('M10 4h12l-1 4H11z', '#ffd27a') + circle(16, 17, 2, '#d6332e'),
  Batteries: rect(5, 8, 10, 19, '#2f3a44', 1) + rect(5, 8, 10, 6, '#e6b422') + rect(8, 5, 4, 3, '#c9d1d6') + rect(17, 8, 10, 19, '#2f3a44', 1) + rect(17, 8, 10, 6, '#e6b422') + rect(20, 5, 4, 3, '#c9d1d6'),
  'Pack of batteries': rect(4, 5, 24, 23, '#d6332e', 2) + rect(7, 12, 5, 13, '#2f3a44') + rect(13.500, 12, 5, 13, '#2f3a44') + rect(20, 12, 5, 13, '#2f3a44') + rect(7, 8, 18, 2, '#fff'),
  'Holiday lights': line('M3 8c8 8 18 8 26 0', '#2f6b3a') + circle(8, 15, 3, '#d6332e') + circle(14, 19, 3, '#f2cf3f') + circle(20, 19, 3, '#3f8fd8') + circle(26, 14, 3, '#5fa53f'),
  Sledgehammer: path('M21 10l3 3L9 29l-3-3z', '#a9794a') + path('M17 4l8-1 5 6-1 6-5 1-8-7z', '#5d6770') + path('M17 4l8-1-1 3-5 3z', '#8a97a3'),
  Wrench: path('M22 3a7 7 0 0 0-6 10L4 25a3 3 0 0 0 4 4l12-12a7 7 0 0 0 9-9l-5 4-4-1-1-4z', '#9aa3aa'),
  Screwdriver: rect(13, 3, 6, 12, '#d6332e', 2) + rect(15, 15, 2, 10, '#c9d1d6') + path('M14.500 25h3l-1 4h-1z', '#9aa3aa'),
  'Tape measure': rect(4, 8, 19, 19, '#f2cf3f', 3) + circle(13, 17, 5, '#39424c') + rect(23, 22, 7, 3, '#f4f1e6') + rect(25, 22, 1, 2, '#39424c') + rect(28, 22, 1, 2, '#39424c'),
  'Packing tape': tape('#c49a63', '#7a5a33'),
  'Roll of tape': tape('#d9dde0'),
  'Box of parts': cardboard + circle(11, 21, 2.5, '#9aa3aa') + rect(18, 19, 5, 4, '#9aa3aa'),
  Shoebox: rect(4, 13, 24, 13, '#f28c28', 1) + rect(3, 9, 26, 5, '#d9741a', 1) + rect(12, 18, 8, 4, '#fff'),
  Padlock: line('M10 15V10a6 6 0 0 1 12 0v5', '#9aa3aa', 3) + rect(7, 14, 18, 14, '#e6b422', 2) + circle(16, 20, 2, '#39424c') + rect(15, 21, 2, 4, '#39424c'),
  'Spare keys': key('#c9d1d6'),
  'Building key': key('#e6b422', '#d09a12'),
  'USB stick': rect(6, 11, 16, 10, '#2f3a44', 2) + rect(22, 13, 7, 6, '#c9d1d6') + rect(24, 15, 1.5, 2, '#39424c') + rect(9, 14, 8, 4, '#3f8fd8'),
  'TV remote': rect(10, 2, 12, 28, '#2f3a44', 3) + circle(16, 7, 2, '#d6332e') + rect(13, 12, 2, 2, '#c9d1d6') + rect(17, 12, 2, 2, '#c9d1d6') + rect(13, 16, 2, 2, '#c9d1d6') + rect(17, 16, 2, 2, '#c9d1d6') + rect(13, 20, 6, 4, '#3f8fd8'),
  'Old DVD': circle(16, 16, 12, '#cfd6db') + path('M16 4a12 12 0 0 1 10 6l-10 6z', '#a6c9e6') + circle(16, 16, 3.5, '#2a2f35'),
  Stapler: path('M4 22h24v4H4z', '#39424c') + path('M4 19L22 9c3-1 6 2 6 5v3H9z', '#d6332e'),
  Paperclips: line('M12 8v14a4 4 0 0 0 8 0V7a3 3 0 0 0-6 0v14a1 1 0 0 0 2 0V9', '#9aa3aa'),
  // Paper and books
  Paperback: book('#3f8fd8'),
  Novel: book('#a83a32'),
  Atlas: rect(5, 5, 22, 22, '#2d7f6b', 2) + circle(16, 16, 7, '#a9dcf5') + path('M12 12c3-1 4 2 3 3s-3 1-3 3-1-5 0-6zM18 17c2-1 3 0 3 1s-3 3-3 3z', '#5fa53f'),
  'Old atlas': rect(5, 5, 22, 22, '#7a5a33', 2) + circle(16, 16, 7, '#d9c9a0') + line('M9 16h14M16 9v14', '#7a5a33', 1),
  'Photo album': rect(5, 4, 22, 24, '#6b3a5b', 2) + rect(9, 8, 14, 11, '#f4f1e6') + path('M10 18l4-5 3 3 2-2 3 4z', '#5fa53f') + circle(19, 11, 1.300, '#f2cf3f'),
  Notebook: rect(8, 4, 18, 24, '#3f6fa8', 1) + line('M6 8h4M6 13h4M6 18h4M6 23h4', '#c9d1d6') + rect(14, 9, 8, 3, '#f4f1e6'),
  'Library book': book('#5b7f3a') + rect(9, 21, 15, 4, '#f4f1e6'),
  'Museum guide': rect(7, 4, 18, 24, '#f4f1e6', 1) + path('M10 13l6-4 6 4z', '#6b3a5b') + rect(11, 14, 2, 6, '#6b3a5b') + rect(15, 14, 2, 6, '#6b3a5b') + rect(19, 14, 2, 6, '#6b3a5b') + rect(10, 21, 12, 2, '#6b3a5b'),
  'Old letters': rect(4, 11, 21, 14, '#d9c9a0', 1) + rect(7, 7, 21, 14, '#ebddb8', 1) + line('M7 7l10.500 8L28 7', '#b8a678', 1.3),
  'Sealed envelope': rect(4, 8, 24, 17, '#ebddb8', 1) + line('M4 8l12 9 12-9', '#b8a678', 1.3) + circle(16, 17, 3, '#a83a32'),
  'Old invoices': paper('#ece6d2', '#a83a32'),
  'Crumpled receipt': path('M8 5l5 2 5-2 6 3-2 6 3 6-4 7-6-2-5 2-5-4 2-6-2-6z', '#ecebe5') + line('M12 12h8M11 16h9M12 20h6', '#8a8f96', 1.2),
  'Old newspapers': rect(4, 6, 24, 20, '#dcd8cb', 1) + rect(7, 9, 18, 3, '#39424c') + rect(7, 14, 8, 8, '#8a8f96') + line('M18 15h7M18 18h7M18 21h7', '#8a8f96', 1.2),
  'Pack of cards': rect(5, 7, 16, 22, '#c7ccd1', 2) + rect(11, 3, 16, 22, '#f8f8f8', 2) + path('M19 8c2-3 6 0 3 4l-3 4-3-4c-3-4 1-7 3-4z', '#d6332e'),
  'Gift card': rect(3, 8, 26, 17, '#c8488f', 2) + rect(12, 8, 3, 17, '#f2cf3f') + rect(3, 15, 26, 3, '#f2cf3f'),
  Ticket: path('M3 9h26v5a2.500 2.500 0 0 0 0 5v5H3v-5a2.500 2.500 0 0 0 0-5z', '#e6b422') + line('M11 11v11', '#8a6a12', 1.2) + rect(15, 14, 10, 2, '#8a6a12') + rect(15, 18, 7, 2, '#8a6a12'),
  // Money and things worth keeping
  Cash: notes('#5fa53f', '#3a7026'),
  'Bundle of cash': notes('#4a8f30', '#2f5f1c') + rect(13, 8, 6, 17, '#f4f1e6') + rect(4, 7, 24, 3, '#3a7026', 1),
  'Old coin': circle(16, 16, 11, '#c9973a') + circle(16, 16, 8.500, '#dcb159') + path('M13 22v-9a3 3 0 0 1 6 0v9z', '#a87a22'),
  // To wear
  'Old jacket': jacket('#7a6a4f', '#4f4532'),
  'Denim jacket': jacket('#4a78a8', '#2d5078'),
  'Gym towel': rect(5, 6, 22, 20, '#3fa6c2', 2) + rect(5, 10, 22, 2, '#fff') + rect(5, 21, 22, 2, '#fff'),
  'Silk scarf': path('M9 4c5 4 9 4 14 0 2 4-1 8-4 10l5 14-5-2-3-9-3 9-5 2 5-14C10 12 7 8 9 4z', '#c8488f'),
  'Sneakers': path('M3 14l7-3 5 5 11 3c3 1 3 3 3 6H3z', '#f2f6f8') + rect(3, 24, 26, 3, '#3f8fd8', 1) + line('M11 15l3-2M14 17l3-2', '#8a8f96', 1.3),
  Gloves: path('M9 28V14l-3-5c-1-2 1-3 2-2l3 4V5c0-2 3-2 3 0v5V3c0-2 3-2 3 0v7V5c0-2 3-2 3 0v13l-2 10z', '#d9741a') + rect(9, 24, 10, 4, '#7a4a1c'),
  'Reading glasses': circle(9, 17, 6, '#a9dcf5') + circle(23, 17, 6, '#a9dcf5') + line('M9 11a6 6 0 1 0 .01 0M23 11a6 6 0 1 0 .01 0M15 16c1-1 1-1 2 0', '#39424c', 1.6),
  Sunglasses: path('M3 13h11v4a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5zM18 13h11v4a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z', '#4f7ba8') + line('M14 15h4', '#c9d1d6'),
  'Fire helmet': path('M4 21c0-9 5-14 12-14s12 5 12 14z', '#d6332e') + rect(1, 20, 30, 4, '#a82320', 2) + rect(13, 9, 6, 8, '#f2cf3f', 1),
  // Odds and ends
  'Silverware': line('M9 4v24M6 4v6a3 3 0 0 0 6 0V4', '#aab3ba') + path('M21 4c4 2 5 9 1 12v12h-2V4z', '#aab3ba'),
  'Toy car': path('M3 21v-3l4-1 3-5h10l4 5 5 1v3z', '#d6332e') + path('M11.500 13h3.500v4h-6zM17 13h2.500l2.500 4h-5z', '#a9dcf5') + circle(9, 22, 3, '#22282e') + circle(23, 22, 3, '#22282e'),
  'Teddy bear': circle(9, 7, 3.500, '#a8733c') + circle(23, 7, 3.500, '#a8733c') + circle(16, 11, 7.500, '#c08a4c') + circle(16, 24, 7, '#c08a4c') + circle(16, 24, 3.500, '#e0bd8c') + circle(13, 10, 1.1, '#22282e') + circle(19, 10, 1.1, '#22282e') + circle(16, 13, 1.300, '#22282e'),
  // Picked up in rooms
  Lamp: path('M10 5h12l4 11H6z', '#f2cf3f') + rect(15, 16, 2, 8, '#6b4423') + rect(9, 24, 14, 3, '#6b4423', 1),
  'Little plant': path('M9 19h14l-2 9H11z', '#c8693c') + path('M16 19C9 17 7 12 8 7c5 0 8 4 8 12zM16 19c7-2 9-7 8-12-5 0-8 4-8 12z', '#5fa53f'),
  Books: rect(5, 22, 22, 5, '#a83a32', 1) + rect(7, 16, 19, 6, '#3f8fd8', 1) + rect(6, 10, 18, 6, '#e6b422', 1) + rect(9, 5, 16, 5, '#5b7f3a', 1),
  Radio: rect(4, 11, 24, 16, '#7a5a33', 2) + line('M9 11L22 4', '#9aa3aa', 1.6) + circle(11, 19, 5, '#2f3a44') + rect(19, 15, 7, 3, '#f2cf3f') + circle(22, 23, 2, '#2f3a44'),
  Microwave: rect(3, 7, 26, 18, '#d9dde0', 2) + rect(6, 10, 15, 12, '#39424c', 1) + rect(23, 10, 3, 3, '#3f8fd8') + rect(23, 15, 3, 2, '#8a8f96') + rect(23, 19, 3, 2, '#8a8f96'),
  'Coffee machine': rect(7, 3, 18, 7, '#39424c', 1) + rect(7, 10, 5, 16, '#39424c') + rect(5, 25, 22, 3, '#22282e', 1) + path('M14 16h9v5a3 3 0 0 1-3 3h-3a3 3 0 0 1-3-3z', '#f4f1e6') + rect(16, 10, 5, 3, '#8a8f96'),
  Toaster: rect(4, 12, 24, 15, '#c9d1d6', 3) + rect(9, 8, 5, 5, '#d9a04e') + rect(18, 8, 5, 5, '#d9a04e') + rect(8, 12, 7, 2, '#39424c') + rect(17, 12, 7, 2, '#39424c') + rect(26, 17, 3, 4, '#39424c'),
  Computer: rect(3, 5, 26, 17, '#2f3a44', 2) + rect(5, 7, 22, 13, '#3f8fd8') + rect(14, 22, 4, 4, '#8a8f96') + rect(9, 26, 14, 2, '#8a8f96', 1),
  Cone: path('M16 3l7 22H9z', '#f28c28') + path('M13.700 10h4.600l1.300 4h-7.200z', '#fff') + rect(5, 25, 22, 4, '#d9741a', 1),
};

const PARCEL = cardboard;

export const ITEM_NAMES = Object.keys(ICONS);
export const hasItemIcon = (name) => name in ICONS;
export const itemIcon = (name) => svg(ICONS[name] ?? PARCEL);
