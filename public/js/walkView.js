// The walking view. The only file here that touches the page or the renderer. The Google map stays
// in the page, hidden, so leaving the car and getting back in does not load the map a second time.
import * as THREE from '../vendor/three.module.js';
import { heightsFromPixels, sampleHeights, tilePoint } from './terrain.js';
import { vectorTileAt } from './vector.js';
import {
  COLOR, buildingColor, coverAt, fromLocal, mergeTile, newArea, toLocal, treesForChunk, triangulate, wallSegments,
} from './place.js';
import {
  CHUNK, VIEW_RADIUS, cameraBack, carRing, chunkChanges, chunksAround, indoorDistance, nearCar, newWalker, poseOf, stepWalker,
} from './walker.js';

const TERRAIN_ZOOM = 15; // about 5 m a sample. The drive stays on zoom 12; a person needs the finer one.
const GRID = 16; // quads on a side of one chunk
const TILEJSON = 'https://tiles.openfreemap.org/planet';
const WAIT = 8000;

export function createWalkView({ canvas, origin, heading, shape, color }) {
  const walker = newWalker(heading);
  const area = newArea();
  const parked = carRing(heading, shape);
  const loaded = new Set();
  const dirty = new Set();
  const treeCache = new Map();
  const terrain = new Map();
  const terrainFailed = new Map();
  const vectorFailed = new Map();
  const terrainLoading = new Map();
  const vectorLoading = new Map();
  const gotVector = new Set();
  const materials = [];
  const matCache = new Map();
  let alive = true, zero = null, templatePromise = null, interior = null, interiorFor = null, interiorY = null, sized = '';
  const abort = new AbortController();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xb7c4ce);
  scene.fog = new THREE.Fog(0xb7c4ce, VIEW_RADIUS * 0.62, VIEW_RADIUS);
  scene.add(new THREE.HemisphereLight(0xdde7f0, 0x6b7d55, 0.72));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.15);
  sun.position.set(50, 90, 24);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(60, 1, 0.15, VIEW_RADIUS);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

  const outside = new THREE.Group();
  scene.add(outside);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(VIEW_RADIUS, 28), material(COLOR.ground));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.2;
  scene.add(ground);
  const terrainMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  materials.push(terrainMat);
  const trunkMat = material(0x5a4634);
  const leafMat = material(0x2f6a32);
  const floorMat = material(0x8a8175, true);
  const ceilMat = material(0xcfc6b8, true);

  const car = buildCar();
  const person = buildPerson();
  scene.add(car, person.group);

  const onResize = () => fit();
  const observer = new ResizeObserver(onResize);
  observer.observe(canvas);
  fit();

  function material(hex, both = false) {
    const key = `${hex}:${both ? 1 : 0}`;
    let mat = matCache.get(key);
    if (!mat) {
      mat = new THREE.MeshLambertMaterial({ color: hex, side: both ? THREE.DoubleSide : THREE.FrontSide });
      matCache.set(key, mat);
      materials.push(mat);
    }
    return mat;
  }

  function fit() {
    const w = canvas.clientWidth, h = canvas.clientHeight, key = `${w}x${h}`;
    if (w < 2 || h < 2 || key === sized) return;
    sized = key;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  }

  function timedSignal() {
    return typeof AbortSignal.any === 'function' ? AbortSignal.any([abort.signal, AbortSignal.timeout(WAIT)]) : abort.signal;
  }

  function rawAt(lat, lng) {
    const tile = tilePoint(lat, lng, TERRAIN_ZOOM);
    const heights = terrain.get(`${tile.x}_${tile.y}`);
    return heights ? sampleHeights(heights, tile.px, tile.py) : null;
  }

  // Heights are metres above the ground under the parked car, so the car sits at y = 0.
  function sample(x, z) {
    if (zero == null) return null;
    const geo = fromLocal(origin, x, z);
    const raw = rawAt(geo.lat, geo.lng);
    return raw == null ? null : raw - zero;
  }

  function floorOf(building) {
    let y = Infinity;
    for (const p of building.ring) {
      const h = sample(p.x, p.z);
      if (h != null && h < y) y = h;
    }
    if (Number.isFinite(y)) building.floorY = y;
    return building.floorY || 0;
  }

  function refreshFloors() {
    for (const building of area.buildings) if ((building.lift || 0) <= 2.2) floorOf(building);
  }

  function tileTemplate() {
    if (!templatePromise) {
      templatePromise = fetch(TILEJSON, { signal: timedSignal() }).then(async (res) => {
        if (!res.ok) throw new Error(`tile index answered ${res.status}`);
        return (await res.json()).tiles[0];
      }).catch((err) => { templatePromise = null; throw err; });
    }
    return templatePromise;
  }

  function wantVector(x, y) {
    const key = `${x}_${y}`;
    if (!alive || gotVector.has(key) || vectorLoading.has(key)) return;
    if (Date.now() - (vectorFailed.get(key) ?? -Infinity) < 15000) return;
    const job = (async () => {
      const template = await tileTemplate();
      const res = await fetch(template.replace('{z}', 14).replace('{x}', x).replace('{y}', y), { signal: timedSignal() });
      if (res.status === 204 || res.status === 404) return null;
      if (!res.ok) throw new Error(`vector tile answered ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    })().then((bytes) => {
      if (!alive) return;
      gotVector.add(key);
      vectorFailed.delete(key);
      if (bytes) mergeTile(area, bytes, x, y, origin);
      refreshFloors();
      for (const loadedKey of loaded) dirty.add(loadedKey);
    }).catch((err) => {
      if (!alive || err.name === 'AbortError') return;
      console.warn(`walk tile ${key}:`, err.message);
      vectorFailed.set(key, Date.now());
    }).finally(() => vectorLoading.delete(key));
    vectorLoading.set(key, job);
  }

  function wantTerrain(x, y) {
    const key = `${x}_${y}`;
    if (!alive || terrain.has(key) || terrainLoading.has(key)) return;
    if (Date.now() - (terrainFailed.get(key) ?? -Infinity) < 15000) return;
    const job = fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${TERRAIN_ZOOM}/${x}/${y}.png`, { signal: timedSignal() })
      .then(async (res) => {
        if (!res.ok) throw new Error(`terrain tile answered ${res.status}`);
        const image = await createImageBitmap(await res.blob(), { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
        const ctx = new OffscreenCanvas(256, 256).getContext('2d', { willReadFrequently: true });
        ctx.drawImage(image, 0, 0);
        image.close();
        return heightsFromPixels(ctx.getImageData(0, 0, 256, 256).data);
      }).then((heights) => {
        if (!alive) return;
        terrain.set(key, heights);
        terrainFailed.delete(key);
        if (zero == null) zero = rawAt(origin.lat, origin.lng);
        refreshFloors();
        markTerrain(x, y);
      }).catch((err) => {
        if (!alive || err.name === 'AbortError') return;
        console.warn(`walk terrain ${key}:`, err.message);
        terrainFailed.set(key, Date.now());
      }).finally(() => terrainLoading.delete(key));
    terrainLoading.set(key, job);
  }

  function markTerrain(tx, ty) {
    const n = 2 ** TERRAIN_ZOOM;
    const west = (tx / n) * 360 - 180, east = ((tx + 1) / n) * 360 - 180;
    const north = (Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / n))) * 180) / Math.PI;
    const south = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (ty + 1)) / n))) * 180) / Math.PI;
    const corners = [toLocal(origin, north, west), toLocal(origin, south, east)];
    const minX = Math.min(corners[0].x, corners[1].x), maxX = Math.max(corners[0].x, corners[1].x);
    const minZ = Math.min(corners[0].z, corners[1].z), maxZ = Math.max(corners[0].z, corners[1].z);
    for (let iz = Math.floor(minZ / CHUNK); iz <= Math.floor(maxZ / CHUNK); iz++) {
      for (let ix = Math.floor(minX / CHUNK); ix <= Math.floor(maxX / CHUNK); ix++) {
        if (loaded.has(`${ix}_${iz}`)) dirty.add(`${ix}_${iz}`);
      }
    }
  }

  function requestChunk(key) {
    const [ix, iz] = key.split('_').map(Number);
    const spots = [[0, 0], [1, 0], [0, 1], [1, 1], [0.5, 0.5]];
    for (const [sx, sz] of spots) {
      const geo = fromLocal(origin, (ix + sx) * CHUNK, (iz + sz) * CHUNK);
      const vector = vectorTileAt(geo.lat, geo.lng);
      wantVector(vector.x, vector.y);
      const tile = tilePoint(geo.lat, geo.lng, TERRAIN_ZOOM);
      wantTerrain(tile.x, tile.y);
    }
  }

  function disposeGroup(obj) {
    const seen = new Set();
    obj.traverse((child) => {
      if (child.geometry && !seen.has(child.geometry)) { seen.add(child.geometry); child.geometry.dispose(); }
    });
  }

  function dropChunk(key) {
    const group = outside.getObjectByName(key);
    if (group) { outside.remove(group); disposeGroup(group); }
    treeCache.delete(key);
    loaded.delete(key);
    dirty.delete(key);
  }

  function wallGeo(ring, door, y0, y1) {
    const positions = [];
    for (const [a, b] of wallSegments(ring, door)) {
      positions.push(a.x, y0, a.z, b.x, y0, b.z, b.x, y1, b.z, a.x, y0, a.z, b.x, y1, b.z, a.x, y1, a.z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return geo;
  }

  function flatGeo(ring, y) {
    const { verts, tris } = triangulate(ring);
    const positions = [];
    for (let i = 0; i < tris.length; i += 3) {
      for (const k of [tris[i], tris[i + 1], tris[i + 2]]) positions.push(verts[k].x, y, verts[k].z);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geo.computeVertexNormals();
    return geo;
  }

  function terrainMesh(x0, z0) {
    const n = GRID, count = n + 1;
    const positions = new Float32Array(count * count * 3);
    const colors = new Float32Array(count * count * 3);
    const index = [];
    const color = new THREE.Color();
    for (let j = 0; j < count; j++) {
      for (let i = 0; i < count; i++) {
        const x = x0 + (i / n) * CHUNK, z = z0 + (j / n) * CHUNK, v = j * count + i;
        const h = sample(x, z);
        positions[v * 3] = x;
        positions[v * 3 + 1] = h == null ? 0 : h;
        positions[v * 3 + 2] = z;
        color.set(coverAt(area, x, z));
        colors[v * 3] = color.r;
        colors[v * 3 + 1] = color.g;
        colors[v * 3 + 2] = color.b;
      }
    }
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const a = j * count + i;
        index.push(a, a + 1, a + count, a + 1, a + count + 1, a + count);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.setIndex(index);
    geo.computeVertexNormals();
    return new THREE.Mesh(geo, terrainMat);
  }

  function treeMesh(trees) {
    const group = new THREE.Group();
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.26, 1, 5), trunkMat, trees.length);
    const leaves = new THREE.InstancedMesh(new THREE.ConeGeometry(1.15, 1, 6), leafMat, trees.length);
    const dummy = new THREE.Object3D();
    trees.forEach((tree, i) => {
      const y = sample(tree.x, tree.z) || 0;
      const trunkH = tree.h * 0.45;
      dummy.rotation.set(0, 0, 0);
      dummy.position.set(tree.x, y + trunkH / 2, tree.z);
      dummy.scale.set(1, trunkH, 1);
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.set(tree.x, y + trunkH + tree.h * 0.4, tree.z);
      dummy.scale.set(1, tree.h * 0.8, 1);
      dummy.updateMatrix();
      leaves.setMatrixAt(i, dummy.matrix);
    });
    trunks.instanceMatrix.needsUpdate = true;
    leaves.instanceMatrix.needsUpdate = true;
    // The cylinder sits at the origin; the instances carry it out into the chunk. Culling the mesh would drop them.
    trunks.frustumCulled = false;
    leaves.frustumCulled = false;
    group.add(trunks, leaves);
    return group;
  }

  function doorMark(door, y0) {
    const width = Math.hypot(door.bx - door.ax, door.bz - door.az);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, 2.3), material(0x241910, true));
    mesh.position.set(door.mx - door.nx * 0.06, y0 + 1.15, door.mz - door.nz * 0.06);
    mesh.rotation.y = Math.atan2(door.nx, door.nz);
    return mesh;
  }

  function buildingMesh(building) {
    const base = floorOf(building);
    const y0 = base + (building.lift || 0);
    const y1 = base + building.height;
    const group = new THREE.Group();
    const paint = material(buildingColor(building.cls), true);
    group.add(new THREE.Mesh(wallGeo(building.ring, building.door, y0, y1), paint));
    group.add(new THREE.Mesh(flatGeo(building.ring, y1), paint));
    if (building.door && (building.lift || 0) <= 2.2) group.add(doorMark(building.door, y0));
    return group;
  }

  function centroidChunk(ring) {
    let x = 0, z = 0;
    for (const p of ring) { x += p.x; z += p.z; }
    return `${Math.floor(x / ring.length / CHUNK)}_${Math.floor(z / ring.length / CHUNK)}`;
  }

  function buildChunk(key) {
    dropChunk(key);
    const [ix, iz] = key.split('_').map(Number);
    const group = new THREE.Group();
    group.name = key;
    group.add(terrainMesh(ix * CHUNK, iz * CHUNK));
    const trees = treesForChunk(key, area);
    treeCache.set(key, trees);
    if (trees.length) group.add(treeMesh(trees));
    for (const building of area.buildings) if (centroidChunk(building.ring) === key) group.add(buildingMesh(building));
    outside.add(group);
    loaded.add(key);
    dirty.delete(key);
  }

  function syncChunks() {
    const wanted = chunksAround(walker.x, walker.z, VIEW_RADIUS);
    wanted.sort((a, b) => {
      const [ax, az] = a.split('_').map(Number), [bx, bz] = b.split('_').map(Number);
      const da = (ax * CHUNK + CHUNK / 2 - walker.x) ** 2 + (az * CHUNK + CHUNK / 2 - walker.z) ** 2;
      const db = (bx * CHUNK + CHUNK / 2 - walker.x) ** 2 + (bz * CHUNK + CHUNK / 2 - walker.z) ** 2;
      return da - db;
    });
    for (const key of chunkChanges(loaded, wanted, 3).leave) dropChunk(key);
    let budget = 3;
    for (const key of wanted) {
      if (budget <= 0) break;
      if (!loaded.has(key) || dirty.has(key)) { buildChunk(key); budget--; }
    }
    for (const key of wanted) requestChunk(key);
  }

  function buildInterior(building) {
    const y0 = building.floorY || 0, y1 = y0 + 3;
    const group = new THREE.Group();
    // `building.objects` is the list later interaction adds to. The room starts empty.
    group.add(new THREE.Mesh(flatGeo(building.ring, y0), floorMat));
    group.add(new THREE.Mesh(flatGeo(building.ring, y1), ceilMat));
    group.add(new THREE.Mesh(wallGeo(building.ring, building.door, y0, y1), material(buildingColor(building.cls), true)));
    return group;
  }

  function syncInterior() {
    if (interior) { scene.remove(interior); disposeGroup(interior); interior = null; }
    interiorFor = walker.inside;
    const building = walker.inside ? area.buildings.find((b) => b.id === walker.inside) : null;
    const inside = !!building;
    outside.visible = !inside;
    car.visible = !inside;
    ground.visible = !inside;
    interiorY = building ? building.floorY : null;
    if (!building) return;
    interior = buildInterior(building);
    scene.add(interior);
  }

  function world() {
    const trees = [];
    for (const key of chunksAround(walker.x, walker.z, 20)) trees.push(...(treeCache.get(key) || treesForChunk(key, area)));
    return {
      heightAt(x, z) {
        if (walker.inside) return area.buildings.find((b) => b.id === walker.inside)?.floorY ?? walker.y;
        return sample(x, z);
      },
      buildings: area.buildings, waters: area.waters, trees, carRing: parked,
    };
  }

  function updatePerson() {
    const pose = poseOf(walker);
    person.group.position.set(walker.x, walker.y + pose.bob, walker.z);
    person.group.rotation.y = walker.facing;
    const swing = pose.swing * 0.55;
    person.legL.rotation.x = swing;
    person.legR.rotation.x = -swing;
    person.armL.rotation.x = -swing * 0.75;
    person.armR.rotation.x = swing * 0.75;
  }

  function placeCamera() {
    const building = walker.inside ? area.buildings.find((b) => b.id === walker.inside) : null;
    const dist = building ? indoorDistance(building.ring, walker.x, walker.z, walker.yaw, 2.6) : 4.4;
    const back = cameraBack(walker.yaw, walker.pitch, dist);
    camera.position.set(walker.x + back.x, walker.y + back.y, walker.z + back.z);
    if (building) camera.position.y = Math.min(camera.position.y, walker.y + 2.45);
    else {
      const g = sample(camera.position.x, camera.position.z);
      if (g != null && camera.position.y < g + 0.35) camera.position.y = g + 0.35;
    }
    camera.lookAt(walker.x, walker.y + 1.35, walker.z);
  }

  function limb(width, height, depth, mat) {
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), mat);
    mesh.position.y = -height / 2;
    pivot.add(mesh);
    return pivot;
  }

  function buildPerson() {
    const skin = material(0xe0b090), shirt = material(0x3a6ea5), pants = material(0x2c3338), shoes = material(0x1b1b1b);
    const group = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.52, 0.2), shirt);
    torso.position.y = 1.14;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.26, 0.23), skin);
    head.position.y = 1.62;
    const legL = limb(0.14, 0.78, 0.14, pants);
    const legR = limb(0.14, 0.78, 0.14, pants);
    legL.position.set(-0.1, 0.88, 0);
    legR.position.set(0.1, 0.88, 0);
    const shoeL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.2), shoes);
    const shoeR = shoeL.clone();
    shoeL.position.y = -0.78;
    shoeR.position.y = -0.78;
    legL.add(shoeL);
    legR.add(shoeR);
    const armL = limb(0.1, 0.5, 0.1, shirt);
    const armR = limb(0.1, 0.5, 0.1, shirt);
    armL.position.set(-0.26, 1.36, 0);
    armR.position.set(0.26, 1.36, 0);
    const handL = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.09), skin);
    const handR = handL.clone();
    handL.position.y = -0.54;
    handR.position.y = -0.54;
    armL.add(handL);
    armR.add(handR);
    group.add(torso, head, legL, legR, armL, armR);
    return { group, legL, legR, armL, armR };
  }

  function buildCar() {
    const paint = material(new THREE.Color(color).getHex());
    const glass = material(0x9ec4d4);
    const tyre = material(0x222222);
    const group = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(shape.w * 2, shape.body, shape.l * 2), paint);
    body.position.y = shape.wheel + shape.body / 2;
    const cab = new THREE.Mesh(new THREE.BoxGeometry(shape.w * 1.55, shape.cabin, Math.max(0.5, shape.cabinL * 2)), glass);
    cab.position.set(0, shape.wheel + shape.body + shape.cabin / 2, shape.cabinZ || 0);
    group.add(body, cab);
    const wheelGeo = new THREE.CylinderGeometry(shape.wheel, shape.wheel, 0.16, 8);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const wheel = new THREE.Mesh(wheelGeo, tyre);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(sx * (shape.w + 0.02), shape.wheel, sz * shape.l * 0.68);
      group.add(wheel);
    }
    group.rotation.y = heading * Math.PI / 180;
    return group;
  }

  function update(dt, input) {
    if (!alive) return;
    stepWalker(walker, input, dt, world());
    ground.position.x = walker.x;
    ground.position.z = walker.z;
    syncChunks();
    const building = walker.inside ? area.buildings.find((b) => b.id === walker.inside) : null;
    if (walker.inside !== interiorFor || (building && interiorY !== building.floorY)) syncInterior();
    updatePerson();
    placeCamera();
    fit();
    renderer.render(scene, camera);
  }

  function stop() {
    if (!alive) return;
    alive = false;
    abort.abort();
    observer.disconnect();
    disposeGroup(outside);
    disposeGroup(person.group);
    disposeGroup(car);
    if (interior) disposeGroup(interior);
    ground.geometry.dispose();
    for (const mat of materials) mat.dispose();
    renderer.dispose();
    try { renderer.forceContextLoss(); } catch (err) { /* the context is already gone */ }
  }

  return {
    update,
    stop,
    nearCar: () => nearCar(walker),
    label: () => (walker.inside ? 'INSIDE' : 'ON FOOT'),
  };
}
