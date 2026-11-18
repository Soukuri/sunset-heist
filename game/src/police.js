// Wanted level and the Harbor Patrol for SUNSET HEIST. Crime raises heat,
// heat becomes stars, stars bring police cars that chase and ram the player,
// and staying clean lets the heat cool off.
import { S } from './state.js';
import { clamp, dist2, angleDiff, angleLerp } from './util.js';
import { makeCar } from './vehicles.js';
import { spawnBurst } from './city.js';
import { playCrash } from './audio.js';

export function addWanted(heat) {
  S.wantedHeat = clamp(S.wantedHeat + heat, 0, 5);
  S.lastCrimeAt = S.time;
  updateWantedLevel();
}

export function updateWantedLevel() {
  const stars = Math.floor(S.wantedHeat + 0.001);
  if (stars !== S.wanted) {
    S.wanted = stars;
    syncPoliceCars();
  }
}

function syncPoliceCars() {
  const want = S.wanted;
  while (S.policeCars.length < want) {
    const a = Math.random() * Math.PI * 2;
    const px = S.player ? S.player.position.x : 0;
    const pz = S.player ? S.player.position.z : 0;
    const x = clamp(px + Math.sin(a) * 55, -110, 110);
    const z = clamp(pz + Math.cos(a) * 55, -110, 110);
    const car = makeCar('police', x, z, 0, { kind: 'police' });
    car.police = { ramCooldown: 0, sirenPhase: Math.random() * 6 };
    S.policeCars.push(car);
  }
  while (S.policeCars.length > want) {
    const car = S.policeCars.pop();
    const i = S.cars.indexOf(car);
    if (i >= 0) S.cars.splice(i, 1);
    S.scene.remove(car.mesh);
  }
}

export function clearPoliceCars() {
  for (const car of S.policeCars) {
    const i = S.cars.indexOf(car);
    if (i >= 0) S.cars.splice(i, 1);
    S.scene.remove(car.mesh);
  }
  S.policeCars = [];
}

export function updatePolice(dt) {
  // Heat cools when the player stays out of trouble.
  if (S.wantedHeat > 0 && S.time - S.lastCrimeAt > 18) {
    S.wantedHeat = Math.max(0, S.wantedHeat - dt * 0.12);
    updateWantedLevel();
  }
  const target = S.onFoot ? S.player.position : (S.currentCar || S.player.position);
  const tx0 = target.position ? target.position.x : target.x;
  const tz0 = target.position ? target.position.z : target.z;
  for (let pi = 0; pi < S.policeCars.length; pi++) {
    const car = S.policeCars[pi];
    let tx = tx0, tz = tz0;
    // In a staged chase the patrol cars flank the getaway car instead of
    // piling onto it, so the chase stays in frame and keeps moving.
    let slotDist = 0;
    if (S.shotMode && S.currentCar) {
      // Flank slots: patrol cars ride ahead of the getaway car at its sides
      // (in frame, trying to cut it off), the third further up the road.
      // Lateral 4.5 keeps a 2.1-wide car inside the 12-wide road.
      const slots = [[-4.5, 7], [4.5, 7], [-4.5, 14]];
      const [lat, lon] = slots[pi % slots.length];
      const fx = Math.sin(S.currentCar.heading), fz = Math.cos(S.currentCar.heading);
      tx = S.currentCar.x + fz * lat + fx * lon;
      tz = S.currentCar.z - fx * lat + fz * lon;
      slotDist = dist2(car.x, car.z, tx, tz);
    }
    const d = dist2(car.x, car.z, tx, tz);
    const targetHeading = Math.atan2(tx - car.x, tz - car.z);
    const aggression = 0.5 + S.wanted * 0.25;
    car.heading = angleLerp(car.heading, targetHeading, Math.min(1, dt * 2.6 * aggression));
    let wantSpeed = d > 14 ? car.modelDef.topSpeed * (0.8 + S.wanted * 0.06) : car.modelDef.topSpeed * 0.55;
    if (S.shotMode && S.currentCar) {
      wantSpeed = Math.abs(S.currentCar.speed) + clamp(slotDist - 6, 0, 6);
    }
    car.speed = Math.min(wantSpeed, car.speed + car.modelDef.accel * dt);
    car.x += Math.sin(car.heading) * car.speed * dt;
    car.z += Math.cos(car.heading) * car.speed * dt;
    // Ram: bump the player's car, or shove the player on foot. In a staged
    // screenshot the ram is for show: it must not stop the getaway.
    const dPlayer = dist2(car.x, car.z, tx0, tz0);
    if (dPlayer < 4.6 && car.police.ramCooldown <= 0) {
      car.police.ramCooldown = 1.2;
      spawnBurst(tx0, 1, tz0, 0xffcc66, 12, 6);
      playCrash();
      if (S.shotMode) {
        // Show the hit, keep the chase rolling.
      } else if (S.currentCar) {
        S.currentCar.speed *= 0.5;
        S.playerHealth = Math.max(0, S.playerHealth - 4);
      } else {
        S.playerHealth = Math.max(0, S.playerHealth - 8);
        const a = Math.atan2(S.player.position.x - car.x, S.player.position.z - car.z);
        S.player.position.x += Math.sin(a) * 2.5;
        S.player.position.z += Math.cos(a) * 2.5;
      }
    }
    car.police.ramCooldown -= dt;
    // Push out of buildings along the shallow penetration axis, so a patrol
    // car slides around a corner instead of getting stuck on the wall.
    for (const c of S.colliders) {
      const dx = car.x - c.x, dz = car.z - c.z;
      const px = c.hx + 1.0 - Math.abs(dx), pz = c.hz + 1.0 - Math.abs(dz);
      if (px > 0 && pz > 0) {
        if (px < pz) car.x += (dx >= 0 ? 1 : -1) * px;
        else car.z += (dz >= 0 ? 1 : -1) * pz;
        car.speed *= 0.6;
      }
    }
    car.mesh.position.set(car.x, 0, car.z);
    car.mesh.rotation.y = car.heading;
    const spin = car.speed * dt * 2.2;
    for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
  }
}

// Busted: caught on foot by a police car at low health, or boxed in while wanted.
export function checkBusted() {
  if (S.wanted === 0 || S.onFoot === false) return false;
  if (S.playerHealth > 0) return false;
  return true;
}
