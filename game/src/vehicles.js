// Vehicles for SUNSET HEIST: boxy original cars built from meshes, arcade
// driving physics, traffic that loops the road grid, and stealing parked cars.
import { S } from './state.js';
import { clamp, dist2, angleDiff, angleLerp, lerp, mulberry32, randRange, pick } from './util.js';
import { spawnBurst } from './city.js';
import { playCrash, playSkid, playHorn } from './audio.js';

const T = window.THREE;

export const CAR_MODELS = {
  sedan:   { name: 'Solmar Sedan',   color: 0x3d7ac9, topSpeed: 34, accel: 16, grip: 1.0, price: 0 },
  coupe:   { name: 'Coral Coupe',    color: 0xd43d5e, topSpeed: 40, accel: 19, grip: 1.1, price: 0 },
  taxi:    { name: 'Sun Cab',        color: 0xf2b705, topSpeed: 30, accel: 14, grip: 1.0, price: 0 },
  truck:   { name: 'Harbor Hauler',  color: 0x5e7a4a, topSpeed: 26, accel: 11, grip: 0.9, price: 0 },
  sport:   { name: 'Vesper GT',      color: 0x8a2be2, topSpeed: 46, accel: 22, grip: 1.25, price: 0 },
  police:  { name: 'Harbor Patrol',  color: 0x1a1a2e, topSpeed: 42, accel: 20, grip: 1.15, price: 0 },
};

function buildCarMesh(model, colorHex) {
  const group = new T.Group();
  const bodyMat = new T.MeshLambertMaterial({ color: colorHex });
  const glassMat = new T.MeshLambertMaterial({ color: 0x1a2436 });
  const darkMat = new T.MeshLambertMaterial({ color: 0x14141a });
  const body = new T.Mesh(new T.BoxGeometry(2.1, 0.75, 4.4), bodyMat);
  body.position.y = 0.65; group.add(body);
  const cabin = new T.Mesh(new T.BoxGeometry(1.8, 0.65, 2.2), glassMat);
  cabin.position.set(0, 1.3, -0.2); group.add(cabin);
  const roof = new T.Mesh(new T.BoxGeometry(1.85, 0.12, 2.0), bodyMat);
  roof.position.set(0, 1.66, -0.2); group.add(roof);
  // Headlights and taillights.
  const hl = new T.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const x of [-0.7, 0.7]) {
    const h = new T.Mesh(new T.BoxGeometry(0.4, 0.2, 0.1), hl);
    h.position.set(x, 0.7, 2.22); group.add(h);
    const t = new T.Mesh(new T.BoxGeometry(0.4, 0.2, 0.1), new T.MeshBasicMaterial({ color: 0xff2222 }));
    t.position.set(x, 0.7, -2.22); group.add(t);
  }
  // Wheels.
  const wheels = [];
  const wheelGeo = new T.CylinderGeometry(0.42, 0.42, 0.35, 12);
  for (const [x, z] of [[-1.0, 1.45], [1.0, 1.45], [-1.0, -1.45], [1.0, -1.45]]) {
    const w = new T.Mesh(wheelGeo, darkMat);
    w.rotation.z = Math.PI / 2; w.position.set(x, 0.42, z);
    group.add(w); wheels.push(w);
  }
  group.userData.wheels = wheels;
  return group;
}

// Police livery: white doors, light bar, "PATROL" stripe.
function buildPoliceMesh() {
  const group = buildCarMesh(CAR_MODELS.police, 0x1a1a2e);
  const doorMat = new T.MeshLambertMaterial({ color: 0xf2f2f2 });
  const door = new T.Mesh(new T.BoxGeometry(2.16, 0.5, 2.0), doorMat);
  door.position.set(0, 0.7, 0.2); group.add(door);
  const bar = new T.Mesh(new T.BoxGeometry(1.2, 0.22, 0.5),
    new T.MeshBasicMaterial({ color: 0xff2222 }));
  bar.position.set(0, 1.78, -0.2); group.add(bar);
  const bar2 = new T.Mesh(new T.BoxGeometry(0.55, 0.22, 0.5),
    new T.MeshBasicMaterial({ color: 0x2244ff }));
  bar2.position.set(0.35, 1.78, -0.2); group.add(bar2);
  return group;
}

export function makeCar(modelKey, x, z, heading, opts) {
  const o = opts || {};
  const model = CAR_MODELS[modelKey] || CAR_MODELS.sedan;
  const mesh = modelKey === 'police' ? buildPoliceMesh() : buildCarMesh(modelKey, o.color ?? model.color);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  S.scene.add(mesh);
  const car = {
    model: modelKey, modelDef: model, mesh, heading,
    speed: 0, steer: 0, x, z,
    kind: o.kind || 'traffic',   // 'traffic' | 'parked' | 'police' | 'player'
    health: 100,
    // traffic AI
    loop: o.loop || null, loopIndex: 0, cruiseSpeed: randRange(Math.random, 8, 13),
    stuckAt: 0,
    police: null,
  };
  S.cars.push(car);
  return car;
}

// Rectangular loops around city blocks, so traffic keeps circulating.
function makeLoop(cx, cz, half) {
  return [
    { x: cx - half, z: cz - half }, { x: cx + half, z: cz - half },
    { x: cx + half, z: cz + half }, { x: cx - half, z: cz + half },
  ];
}

export function spawnTraffic() {
  const rng = mulberry32(777);
  const loops = [];
  for (const cx of [-60, -20, 20, 60]) for (const cz of [-60, -20, 20, 60]) loops.push(makeLoop(cx, cz, 20));
  loops.push(makeLoop(0, 0, 60)); loops.push(makeLoop(0, 0, 100));
  const models = ['sedan', 'coupe', 'taxi', 'truck'];
  for (let i = 0; i < 12; i++) {
    const loop = pick(rng, loops);
    const wp = pick(rng, loop);
    const car = makeCar(pick(rng, models), wp.x + randRange(rng, -2, 2), wp.z + randRange(rng, -2, 2), randRange(rng, 0, Math.PI * 2), { kind: 'traffic', loop });
    car.loopIndex = Math.floor(rng() * loop.length);
  }
  // Parked cars along the avenue and the beachfront, free to steal.
  const parkedSpots = [
    ['sedan', -7, -30, 0], ['coupe', 7, 10, Math.PI], ['taxi', -7, 50, 0],
    ['truck', 7, -70, Math.PI], ['sedan', 47, -7, Math.PI / 2], ['coupe', -47, 7, -Math.PI / 2],
    ['sedan', 87, 30, Math.PI], ['taxi', -87, -50, 0],
  ];
  for (const [m, x, z, h] of parkedSpots) makeCar(m, x, z, h, { kind: 'parked' });
  // A special unlocked car appears once the story pays off.
  if (S.unlockedCars.includes('sport')) makeCar('sport', 7, 90, Math.PI, { kind: 'parked' });
  if (S.unlockedCars.includes('coupe')) makeCar('coupe', -7, 90, 0, { kind: 'parked' });
}

export function nearestCar(x, z, maxDist, kinds) {
  let best = null, bestD = maxDist;
  for (const car of S.cars) {
    if (kinds && !kinds.includes(car.kind)) continue;
    const d = dist2(x, z, car.x, car.z);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

function collideBuildings(x, z, r) {
  for (const c of S.colliders) {
    const cx = clamp(x, c.x - c.hx, c.x + c.hx);
    const cz = clamp(z, c.z - c.hz, c.z + c.hz);
    const dx = x - cx, dz = z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r) return { cx, cz, dx, dz, d: Math.sqrt(d2) || 0.01 };
  }
  return null;
}

export function resolveCarCollision(car) {
  const hit = collideBuildings(car.x, car.z, 1.6);
  if (hit) {
    const push = (1.6 - hit.d) + 0.05;
    car.x += (hit.dx / hit.d) * push;
    car.z += (hit.dz / hit.d) * push;
    if (Math.abs(car.speed) > 8) {
      spawnBurst(car.x, 1, car.z, 0xffcc66, 14, 7);
      playCrash();
      if (car === S.currentCar) damagePlayer(6);
    }
    car.speed *= 0.35;
  }
  car.x = clamp(car.x, -118, 118);
  car.z = clamp(car.z, -118, 228);
}

function damagePlayer(n) {
  S.playerHealth = Math.max(0, S.playerHealth - n);
}

// Arcade driving: accelerate, steer, brake, drift a little with the handbrake.
export function updatePlayerCar(dt, input) {
  const car = S.currentCar;
  if (!car) return;
  const m = car.modelDef;
  const fwd = input.KeyW || input.ArrowUp;
  const back = input.KeyS || input.ArrowDown;
  const left = input.KeyA || input.ArrowLeft;
  const right = input.KeyD || input.ArrowRight;
  const handbrake = input.Space;
  if (fwd) car.speed += m.accel * dt;
  if (back) car.speed -= (car.speed > 0.5 ? m.accel * 1.4 : m.accel * 0.7) * dt;
  if (!fwd && !back) car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 6 * dt);
  if (handbrake) {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 22 * dt);
    if (Math.abs(car.speed) > 10 && Math.random() < dt * 6) playSkid();
  }
  car.speed = clamp(car.speed, -m.topSpeed * 0.45, m.topSpeed);
  const steerTarget = (left ? 1 : 0) - (right ? 1 : 0);
  car.steer = angleLerp(car.steer, steerTarget * 0.55, Math.min(1, dt * 8));
  const dirSign = car.speed >= 0 ? 1 : -1;
  car.heading += car.steer * dirSign * Math.min(1, Math.abs(car.speed) / 12) * 1.9 * dt * m.grip;
  car.x += Math.sin(car.heading) * car.speed * dt;
  car.z += Math.cos(car.heading) * car.speed * dt;
  // Car-to-car bumps.
  for (const other of S.cars) {
    if (other === car) continue;
    const d = dist2(car.x, car.z, other.x, other.z);
    if (d < 3.2 && d > 0.01) {
      const push = (3.2 - d) / 2;
      const nx = (car.x - other.x) / d, nz = (car.z - other.z) / d;
      car.x += nx * push; car.z += nz * push;
      if (other.kind === 'traffic' || other.kind === 'parked') {
        other.x -= nx * push; other.z -= nz * push; other.speed = 0;
      }
      if (Math.abs(car.speed) > 10) {
        spawnBurst(car.x, 1, car.z, 0xffcc66, 12, 6);
        playCrash();
        if (other.kind === 'police') S.wantedHeat += 0.6;
      }
      car.speed *= 0.55;
    }
  }
  resolveCarCollision(car);
  car.mesh.position.set(car.x, 0, car.z);
  car.mesh.rotation.y = car.heading;
  const spin = car.speed * dt * 2.2;
  for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
  const front = car.mesh.userData.wheels.slice(0, 2);
  for (const w of front) w.rotation.y = -car.steer * 0.5;
}

export function updateTraffic(dt) {
  for (const car of S.cars) {
    if (car.kind !== 'traffic') continue;
    if (!car.loop) continue;
    const wp = car.loop[car.loopIndex];
    const d = dist2(car.x, car.z, wp.x, wp.z);
    if (d < 6) { car.loopIndex = (car.loopIndex + 1) % car.loop.length; continue; }
    const targetHeading = Math.atan2(wp.x - car.x, wp.z - car.z);
    car.heading = angleLerp(car.heading, targetHeading, Math.min(1, dt * 2.2));
    // Slow down if another car is right ahead.
    let blocked = false;
    for (const other of S.cars) {
      if (other === car) continue;
      const od = dist2(car.x, car.z, other.x, other.z);
      if (od < 7) {
        const ahead = Math.sin(car.heading) * (other.x - car.x) + Math.cos(car.heading) * (other.z - car.z);
        if (ahead > 0) { blocked = true; break; }
      }
    }
    const want = blocked ? 0 : car.cruiseSpeed;
    car.speed = lerp(car.speed, want, Math.min(1, dt * 1.2));
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    const hit = collideBuildings(car.x, car.z, 1.6);
    if (hit) { car.loopIndex = (car.loopIndex + 1) % car.loop.length; car.x -= Math.sin(car.heading) * 2; car.z -= Math.cos(car.heading) * 2; }
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    const spin = car.speed * dt * 2.2;
    for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
    // Honk if the player blocks the road.
    if (S.onFoot && dist2(car.x, car.z, S.player.position.x, S.player.position.z) < 6 && Math.random() < dt * 0.2) playHorn();
  }
}

export function enterCar(car) {
  S.currentCar = car;
  car.kind = 'player';
  S.onFoot = false;
  S.player.visible = false;
}
export function exitCar() {
  const car = S.currentCar;
  if (!car) return;
  const side = car.heading + Math.PI / 2;
  const px = car.x + Math.sin(side) * 3.2;
  const pz = car.z + Math.cos(side) * 3.2;
  S.player.position.set(px, 0, pz);
  S.player.visible = true;
  S.playerHeading = car.heading;
  car.kind = 'parked';
  S.currentCar = null;
  S.onFoot = true;
  car.speed = 0;
}
