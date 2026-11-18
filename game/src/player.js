// Rico Vane, the player on foot: his character mesh, third-person movement
// relative to the orbit camera, and the camera that follows him or his car.
import { S } from './state.js';
import { clamp, dist2, angleLerp } from './util.js';
import { consumeMouse } from './input.js';

const T = window.THREE;

export function buildPlayerMesh() {
  const g = new T.Group();
  const jacket = new T.MeshLambertMaterial({ color: 0xe8641c }); // sunset-orange jacket
  const skin = new T.MeshLambertMaterial({ color: 0xf2c89b });
  const jeans = new T.MeshLambertMaterial({ color: 0x2b3a5e });
  const legL = new T.Mesh(new T.BoxGeometry(0.22, 0.85, 0.26), jeans);
  legL.position.set(-0.14, 0.43, 0); g.add(legL);
  const legR = legL.clone(); legR.position.x = 0.14; g.add(legR);
  const torso = new T.Mesh(new T.BoxGeometry(0.64, 0.78, 0.36), jacket);
  torso.position.y = 1.24; g.add(torso);
  const head = new T.Mesh(new T.BoxGeometry(0.44, 0.44, 0.44), skin);
  head.position.y = 1.88; g.add(head);
  const hair = new T.Mesh(new T.BoxGeometry(0.48, 0.16, 0.48),
    new T.MeshLambertMaterial({ color: 0x1a1a1a }));
  hair.position.y = 2.12; g.add(hair);
  const armL = new T.Mesh(new T.BoxGeometry(0.15, 0.72, 0.15), jacket);
  armL.position.set(-0.42, 1.22, 0); g.add(armL);
  const armR = armL.clone(); armR.position.x = 0.42; g.add(armR);
  // A small pistol in the right hand.
  const gun = new T.Mesh(new T.BoxGeometry(0.09, 0.09, 0.42),
    new T.MeshLambertMaterial({ color: 0x1a1a1a }));
  gun.position.set(0.42, 0.9, 0.25); g.add(gun);
  g.userData = { legL, legR, armL, armR };
  return g;
}

function collideCircle(x, z, r) {
  let px = x, pz = z;
  for (const c of S.colliders) {
    const cx = clamp(px, c.x - c.hx, c.x + c.hx);
    const cz = clamp(pz, c.z - c.hz, c.z + c.hz);
    const dx = px - cx, dz = pz - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 < r * r && d2 > 0.0001) {
      const d = Math.sqrt(d2);
      px = cx + (dx / d) * r;
      pz = cz + (dz / d) * r;
    } else if (d2 <= 0.0001) {
      px += r; // dead center of a building: push out along x
    }
  }
  return { x: clamp(px, -114, 114), z: clamp(pz, -114, 226) };
}

let walkPhase = 0;

export function updatePlayerOnFoot(dt, input) {
  const p = S.player;
  const fwd = (input.KeyW || input.ArrowUp ? 1 : 0) - (input.KeyS || input.ArrowDown ? 1 : 0);
  const strafe = (input.KeyD || input.ArrowRight ? 1 : 0) - (input.KeyA || input.ArrowLeft ? 1 : 0);
  const running = input.ShiftLeft || input.ShiftRight;
  const speed = running ? 9.5 : 5.2;
  // Movement is relative to the camera yaw.
  const sin = Math.sin(S.camYaw), cos = Math.cos(S.camYaw);
  let mx = 0, mz = 0;
  if (fwd !== 0 || strafe !== 0) {
    mx = (-sin * fwd + cos * strafe);
    mz = (-cos * fwd - sin * strafe);
    const len = Math.hypot(mx, mz);
    mx /= len; mz /= len;
    const targetHeading = Math.atan2(mx, mz);
    S.playerHeading = angleLerp(S.playerHeading, targetHeading, Math.min(1, dt * 12));
    const pos = collideCircle(p.position.x + mx * speed * dt, p.position.z + mz * speed * dt, 0.7);
    p.position.x = pos.x; p.position.z = pos.z;
    S.playerSpeed = speed;
    walkPhase += dt * speed * 1.6;
  } else {
    S.playerSpeed = 0;
    walkPhase = 0;
  }
  p.rotation.y = S.playerHeading;
  const swing = S.playerSpeed > 0 ? Math.sin(walkPhase) * 0.55 : 0;
  p.userData.legL.rotation.x = swing;
  p.userData.legR.rotation.x = -swing;
  p.userData.armL.rotation.x = -swing * 0.8;
  p.userData.armR.rotation.x = swing * 0.8;
  // Slow health regen when calm and unwounded by the law.
  if (S.wanted === 0 && S.playerHealth > 0 && S.playerHealth < 100) {
    S.playerHealth = Math.min(100, S.playerHealth + dt * 1.5);
  }
}

// Third-person orbit camera: mouse orbits, wheel zooms, and it swings behind
// the car while driving. Shot mode pins it to a staged angle instead.
export function updateCamera(dt) {
  const m = consumeMouse();
  if (!S.shotMode) {
    S.camYaw -= m.dx * 0.0032;
    S.camPitch = clamp(S.camPitch + m.dy * 0.0026, -0.15, 1.1);
  }
  let target, baseYaw;
  if (S.onFoot) {
    target = S.player.position.clone(); target.y += 1.7;
    baseYaw = S.camYaw;
  } else {
    const car = S.currentCar;
    target = new T.Vector3(car.x, 1.6, car.z);
    // Ease the orbit yaw toward behind-the-car while driving.
    const behind = car.heading + Math.PI;
    S.camYaw = angleLerp(S.camYaw, behind, Math.min(1, dt * 1.4));
    baseYaw = S.camYaw;
  }
  const dist = S.onFoot ? S.camDist : S.camDist + 3.5;
  // Pull the camera in toward the target until it is out of any building,
  // instead of jumping above the roofs.
  let camPos = null;
  for (let f = 1; f >= 0.25; f -= 0.25) {
    const d = dist * f;
    const cx2 = target.x + Math.sin(baseYaw) * Math.cos(S.camPitch) * d;
    const cy2 = target.y + Math.sin(S.camPitch) * d + 1.2;
    const cz2 = target.z + Math.cos(baseYaw) * Math.cos(S.camPitch) * d;
    const inside = S.colliders.some((c) =>
      Math.abs(cx2 - c.x) < c.hx + 0.5 && Math.abs(cz2 - c.z) < c.hz + 0.5 && cy2 < 44);
    camPos = new T.Vector3(cx2, Math.max(cy2, 1.2), cz2);
    if (!inside) break;
  }
  S.camera.position.lerp(camPos, S.shotMode ? 1 : Math.min(1, dt * 14));
  S.camera.lookAt(target);
}
