// Pedestrians for SUNSET HEIST: original Solmar City walkers who stroll the
// sidewalks, scatter when a car or a gunshot comes near, and react to crime.
import { S } from './state.js';
import { clamp, dist2, mulberry32, randRange, pick } from './util.js';
import { spawnBurst } from './city.js';

const T = window.THREE;
const SHIRTS = [0xe84a5f, 0x3da5d9, 0xf2b705, 0x7ac74f, 0x9b5de5, 0xef8354, 0xffffff, 0x2ec4b6];
const SKINS = [0xf2c89b, 0xc98d5f, 0x8a5a34, 0xffd9b0];

function buildPedestrianMesh(shirt, skin) {
  const g = new T.Group();
  const shirtMat = new T.MeshLambertMaterial({ color: shirt });
  const skinMat = new T.MeshLambertMaterial({ color: skin });
  const pantsMat = new T.MeshLambertMaterial({ color: 0x2b2f45 });
  const legs = new T.Mesh(new T.BoxGeometry(0.5, 0.85, 0.3), pantsMat);
  legs.position.y = 0.43; g.add(legs);
  const torso = new T.Mesh(new T.BoxGeometry(0.62, 0.75, 0.34), shirtMat);
  torso.position.y = 1.22; g.add(torso);
  const head = new T.Mesh(new T.BoxGeometry(0.42, 0.42, 0.42), skinMat);
  head.position.y = 1.85; g.add(head);
  const hair = new T.Mesh(new T.BoxGeometry(0.46, 0.16, 0.46),
    new T.MeshLambertMaterial({ color: pick(Math.random, [0x1a1a1a, 0x5a3a1a, 0x888888, 0x3a2a1a]) }));
  hair.position.y = 2.08; g.add(hair);
  const armL = new T.Mesh(new T.BoxGeometry(0.14, 0.7, 0.14), shirtMat);
  armL.position.set(-0.4, 1.2, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.4; g.add(armR);
  g.userData.armL = armL; g.userData.armR = armR;
  return g;
}

export function spawnPedestrians() {
  const rng = mulberry32(4242);
  for (let i = 0; i < 16; i++) {
    const road = pick(rng, [-80, -40, 0, 40, 80]);
    const along = randRange(rng, -105, 105);
    const side = rng() < 0.5 ? -8 : 8;
    const horizontal = rng() < 0.5;
    const x = horizontal ? along : road + side;
    const z = horizontal ? road + side : along;
    const mesh = buildPedestrianMesh(pick(rng, SHIRTS), pick(rng, SKINS));
    mesh.position.set(x, 0, z);
    S.scene.add(mesh);
    S.pedestrians.push({
      mesh, x, z, heading: randRange(rng, 0, Math.PI * 2),
      speed: randRange(rng, 1.2, 2.2), walkPhase: randRange(rng, 0, 6),
      state: 'walk', // 'walk' | 'flee' | 'down'
      health: 100, targetX: x, targetZ: z, retargetAt: 0,
    });
  }
}

function pickSidewalkTarget(p) {
  // Wander to a nearby point on a random road's sidewalk.
  const road = pick(Math.random, [-80, -40, 0, 40, 80]);
  const along = clamp(p.x + randRange(Math.random, -40, 40), -105, 105);
  const side = Math.random() < 0.5 ? -8 : 8;
  if (Math.random() < 0.5) { p.targetX = along; p.targetZ = road + side; }
  else { p.targetX = road + side; p.targetZ = clamp(p.z + randRange(Math.random, -40, 40), -105, 105); }
}

export function updatePedestrians(dt) {
  const px = S.player ? S.player.position.x : 0;
  const pz = S.player ? S.player.position.z : 0;
  for (const p of S.pedestrians) {
    if (p.state === 'down') continue;
    const dPlayer = dist2(p.x, p.z, px, pz);
    let run = false;
    if (p.state === 'flee') run = true;
    else if (dPlayer < 4 && !S.onFoot && S.currentCar && Math.abs(S.currentCar.speed) > 6) { p.state = 'flee'; run = true; }
    else if (dPlayer < 3 && S.onFoot) { /* strolling past the player */ }
    if (p.state === 'flee' && dPlayer > 30) p.state = 'walk';
    const speed = run ? 5.2 : p.speed;
    if (S.time > p.retargetAt || dist2(p.x, p.z, p.targetX, p.targetZ) < 2) {
      if (run) {
        // Flee directly away from the player.
        const a = Math.atan2(p.x - px, p.z - pz);
        p.targetX = p.x + Math.sin(a) * 30; p.targetZ = p.z + Math.cos(a) * 30;
      } else pickSidewalkTarget(p);
      p.retargetAt = S.time + 4;
    }
    const targetHeading = Math.atan2(p.targetX - p.x, p.targetZ - p.z);
    let dh = targetHeading - p.heading;
    while (dh > Math.PI) dh -= Math.PI * 2;
    while (dh < -Math.PI) dh += Math.PI * 2;
    p.heading += clamp(dh, -2.4 * dt, 2.4 * dt);
    p.x += Math.sin(p.heading) * speed * dt;
    p.z += Math.cos(p.heading) * speed * dt;
    p.x = clamp(p.x, -112, 112); p.z = clamp(p.z, -112, 112);
    // Don't walk through buildings.
    for (const c of S.colliders) {
      if (Math.abs(p.x - c.x) < c.hx + 0.4 && Math.abs(p.z - c.z) < c.hz + 0.4) {
        p.x -= Math.sin(p.heading) * speed * dt * 2;
        p.z -= Math.cos(p.heading) * speed * dt * 2;
        p.heading += Math.PI / 2;
      }
    }
    p.walkPhase += dt * speed * 3.2;
    p.mesh.position.set(p.x, 0, p.z);
    p.mesh.rotation.y = p.heading;
    p.mesh.rotation.z = run ? 0.08 : 0;
    const swing = Math.sin(p.walkPhase) * (run ? 0.7 : 0.4);
    p.mesh.userData.armL.rotation.x = swing;
    p.mesh.userData.armR.rotation.x = -swing;
  }
}

// A pedestrian hit by gunfire: falls, bursts particles, and the law notices.
export function hurtPedestrian(p, damage, shooterPos) {
  p.health -= damage;
  spawnBurst(p.x, 1.2, p.z, 0xff4444, 10, 4);
  if (p.health <= 0) {
    p.state = 'down';
    p.mesh.rotation.x = -Math.PI / 2;
    p.mesh.position.y = 0.3;
    return true; // killed
  }
  p.state = 'flee';
  return false;
}
