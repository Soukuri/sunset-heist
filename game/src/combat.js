// Combat for SUNSET HEIST: hitscan shooting with a muzzle flash and tracer,
// and the rival Marlow crew gunmen who fight back in the final mission.
import { S } from './state.js';
import { clamp, dist2, mulberry32, randRange } from './util.js';
import { spawnBurst } from './city.js';
import { playGunshot, playRivalShot } from './audio.js';
import { hurtPedestrian } from './pedestrians.js';
import { addWanted } from './police.js';

const T = window.THREE;
let fireCooldown = 0;
let muzzleLight = null;

export function initCombat() {
  muzzleLight = new T.PointLight(0xffcc66, 0, 18);
  S.scene.add(muzzleLight);
}

// Ray vs sphere test for hitscan targets.
function raySphere(origin, dir, center, radius) {
  const ox = center.x - origin.x, oy = center.y - origin.y, oz = center.z - origin.z;
  const t = ox * dir.x + oy * dir.y + oz * dir.z;
  if (t < 0) return -1;
  const d2 = ox * ox + oy * oy + oz * oz - t * t;
  if (d2 > radius * radius) return -1;
  return t - Math.sqrt(radius * radius - d2);
}

function addTracer(from, to) {
  const geo = new T.BufferGeometry().setFromPoints([from, to]);
  const line = new T.Line(geo, new T.LineBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.9 }));
  S.scene.add(line);
  S.tracers.push({ line, life: 0.09 });
}

export function updateTracers(dt) {
  for (let i = S.tracers.length - 1; i >= 0; i--) {
    const t = S.tracers[i];
    t.life -= dt;
    t.line.material.opacity = Math.max(0, t.life / 0.09);
    if (t.life <= 0) { S.scene.remove(t.line); t.line.geometry.dispose(); S.tracers.splice(i, 1); }
  }
  if (muzzleLight) muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 60);
}

function gunTipPosition() {
  const p = S.player.position;
  const a = S.playerHeading;
  return new T.Vector3(p.x + Math.sin(a) * 0.6, 1.45, p.z + Math.cos(a) * 0.6);
}

// Fire one hitscan shot from the camera through the crosshair.
export function playerShoot() {
  if (fireCooldown > 0 || !S.onFoot || S.mode !== 'playing') return;
  fireCooldown = 0.18;
  const cam = S.camera;
  const origin = cam.position.clone();
  const dir = new T.Vector3();
  cam.getWorldDirection(dir);
  const tip = gunTipPosition();
  muzzleLight.position.copy(tip);
  muzzleLight.intensity = 4;
  playGunshot();
  addWanted(0.12);
  let bestT = 220, bestHit = null, bestKind = null;
  // Pedestrians.
  for (const p of S.pedestrians) {
    if (p.state === 'down') continue;
    const t = raySphere(origin, dir, new T.Vector3(p.x, 1.2, p.z), 1.0);
    if (t > 0 && t < bestT) { bestT = t; bestHit = p; bestKind = 'ped'; }
  }
  // Rivals.
  for (const r of S.rivals) {
    if (r.health <= 0) continue;
    const t = raySphere(origin, dir, new T.Vector3(r.x, 1.2, r.z), 1.0);
    if (t > 0 && t < bestT) { bestT = t; bestHit = r; bestKind = 'rival'; }
  }
  // Cars (police and traffic).
  for (const car of S.cars) {
    const t = raySphere(origin, dir, new T.Vector3(car.x, 1.0, car.z), 2.6);
    if (t > 0 && t < bestT) { bestT = t; bestHit = car; bestKind = 'car'; }
  }
  // Buildings block shots: clamp the tracer at the first collider hit.
  let endT = bestT;
  for (const c of S.colliders) {
    const cx = clamp(origin.x, c.x - c.hx, c.x + c.hx);
    const cz = clamp(origin.z, c.z - c.hz, c.z + c.hz);
    const dx = origin.x - cx, dz = origin.z - cz;
    if (dx * dx + dz * dz < 1) continue;
    const t = raySphere(origin, dir, new T.Vector3(cx, 8, cz), 6);
    if (t > 0 && t < endT) endT = t;
  }
  const end = origin.clone().add(dir.clone().multiplyScalar(Math.min(bestT, endT)));
  addTracer(tip, end);
  if (!bestHit) { spawnBurst(end.x, end.y, end.z, 0xcccccc, 4, 2); return; }
  if (bestKind === 'ped') {
    const killed = hurtPedestrian(bestHit, 60, S.player.position);
    if (killed) { addWanted(1); S.cash = Math.max(0, S.cash); }
  } else if (bestKind === 'rival') {
    bestHit.health -= 34;
    spawnBurst(bestHit.x, 1.3, bestHit.z, 0xff4444, 10, 4);
    if (bestHit.health <= 0) {
      bestHit.mesh.rotation.x = -Math.PI / 2;
      bestHit.mesh.position.y = 0.3;
      S.cash += 50;
    }
  } else if (bestKind === 'car') {
    bestHit.health -= 25;
    spawnBurst(end.x, end.y, end.z, 0xffcc66, 10, 5);
    if (bestHit.kind === 'police') addWanted(0.5);
    if (bestHit.health <= 0 && bestHit.kind === 'police') {
      spawnBurst(bestHit.x, 1.5, bestHit.z, 0xff7722, 40, 10);
      const i = S.policeCars.indexOf(bestHit);
      if (i >= 0) S.policeCars.splice(i, 1);
      const j = S.cars.indexOf(bestHit);
      if (j >= 0) S.cars.splice(j, 1);
      S.scene.remove(bestHit.mesh);
      S.wantedHeat = Math.max(0, S.wantedHeat - 0.5);
    }
  }
}

export function updateCombat(dt) {
  fireCooldown = Math.max(0, fireCooldown - dt);
}

// --- Rival gunmen (Marlow crew) ---
function buildRivalMesh() {
  const g = new T.Group();
  const coat = new T.MeshLambertMaterial({ color: 0x1f1f2e });
  const skin = new T.MeshLambertMaterial({ color: 0xf2c89b });
  const legs = new T.Mesh(new T.BoxGeometry(0.5, 0.85, 0.3), new T.MeshLambertMaterial({ color: 0x111111 }));
  legs.position.y = 0.43; g.add(legs);
  const torso = new T.Mesh(new T.BoxGeometry(0.66, 0.8, 0.36), coat);
  torso.position.y = 1.22; g.add(torso);
  const head = new T.Mesh(new T.BoxGeometry(0.42, 0.42, 0.42), skin);
  head.position.y = 1.85; g.add(head);
  const cap = new T.Mesh(new T.BoxGeometry(0.46, 0.14, 0.46), new T.MeshLambertMaterial({ color: 0x8a1a2a }));
  cap.position.y = 2.1; g.add(cap);
  const gun = new T.Mesh(new T.BoxGeometry(0.1, 0.1, 0.6), new T.MeshLambertMaterial({ color: 0x222222 }));
  gun.position.set(0.3, 1.35, 0.4); g.add(gun);
  return g;
}

export function spawnRivals(x, z, count) {
  const rng = mulberry32(99);
  for (let i = 0; i < count; i++) {
    const mesh = buildRivalMesh();
    const rx = x + randRange(rng, -14, 14);
    const rz = z + randRange(rng, -14, 14);
    mesh.position.set(rx, 0, rz);
    S.scene.add(mesh);
    S.rivals.push({ mesh, x: rx, z: rz, heading: 0, health: 100, shootAt: S.time + randRange(rng, 0.5, 2) });
  }
}

export function updateRivals(dt) {
  if (!S.player) return;
  const px = S.player.position.x, pz = S.player.position.z;
  for (const r of S.rivals) {
    if (r.health <= 0) continue;
    const d = dist2(r.x, r.z, px, pz);
    r.heading = Math.atan2(px - r.x, pz - r.z);
    r.mesh.rotation.y = r.heading;
    if (d > 12) {
      r.x += Math.sin(r.heading) * 3.4 * dt;
      r.z += Math.cos(r.heading) * 3.4 * dt;
      r.mesh.position.set(r.x, 0, r.z);
    } else if (d < 6) {
      r.x -= Math.sin(r.heading) * 2 * dt;
      r.z -= Math.cos(r.heading) * 2 * dt;
      r.mesh.position.set(r.x, 0, r.z);
    }
    if (S.time >= r.shootAt && d < 45 && S.mode === 'playing') {
      r.shootAt = S.time + randRange(Math.random, 1.4, 2.6);
      playRivalShot();
      const tip = new T.Vector3(r.x + Math.sin(r.heading) * 0.5, 1.4, r.z + Math.cos(r.heading) * 0.5);
      addTracer(tip, new T.Vector3(px + randRange(Math.random, -1, 1), 1.2, pz + randRange(Math.random, -1, 1)));
      // Inaccurate at range; closer gunmen hit more often.
      const hitChance = clamp(0.55 - d / 90, 0.12, 0.55);
      if (Math.random() < hitChance) {
        S.playerHealth = Math.max(0, S.playerHealth - randRange(Math.random, 5, 9));
        spawnBurst(px, 1.3, pz, 0xff4444, 6, 3);
      }
    }
  }
}

export function rivalsAlive() { return S.rivals.filter((r) => r.health > 0).length; }
export function clearRivals() {
  for (const r of S.rivals) S.scene.remove(r.mesh);
  S.rivals = [];
}
