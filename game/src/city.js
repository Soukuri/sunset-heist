// Solmar City: the sunset-lit open world — road grid, buildings with lit
// windows, streetlights, palms, the harbor pier, and the particle system
// used for crashes, pickups and muzzle sparks.
import { S } from './state.js';
import { mulberry32, randRange, pick } from './util.js';

const T = window.THREE;
export const ROAD_COORDS = [-80, -40, 0, 40, 80];
export const CITY_HALF = 115;

let particleGeo = null, particlePts = null;
const particlePool = []; // {pos, vel, life, maxLife, color}

function makeWindowTexture(rng, litRatio) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3d4252'; g.fillRect(0, 0, 128, 256);
  for (let y = 8; y < 248; y += 18) {
    for (let x = 8; x < 120; x += 16) {
      const lit = rng() < litRatio;
      g.fillStyle = lit ? (rng() < 0.7 ? '#ffd27a' : '#9fd8ff') : '#141821';
      g.fillRect(x, y, 10, 12);
    }
  }
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  return tex;
}

export function buildCity() {
  const rng = mulberry32(20261118);
  const scene = S.scene;
  // Sunset sky: warm orange horizon fading up, matching fog.
  scene.background = new T.Color(0x2e1a4d);
  scene.fog = new T.Fog(0xdb7a4a, 90, 260);
  const hemi = new T.HemisphereLight(0xffb36b, 0x3a2a4a, 1.05);
  scene.add(hemi);
  const sun = new T.DirectionalLight(0xff9a3d, 2.0);
  sun.position.set(-60, 55, -80);
  scene.add(sun);
  const fill = new T.DirectionalLight(0x7a86ff, 0.35);
  fill.position.set(50, 40, 60);
  scene.add(fill);

  // Low sun disc on the horizon + a few flat sunset clouds.
  const sunDisc = new T.Mesh(
    new T.CircleGeometry(16, 32),
    new T.MeshBasicMaterial({ color: 0xffd27a, fog: false })
  );
  sunDisc.position.set(-140, 26, -190); sunDisc.lookAt(0, 26, 0);
  scene.add(sunDisc);
  const cloudMat = new T.MeshBasicMaterial({ color: 0xffb38a, transparent: true, opacity: 0.55, fog: false });
  for (let i = 0; i < 7; i++) {
    const cl = new T.Mesh(new T.BoxGeometry(randRange(rng, 24, 48), 2.5, randRange(rng, 8, 14)), cloudMat);
    cl.position.set(randRange(rng, -160, 160), randRange(rng, 55, 85), randRange(rng, -190, -120));
    scene.add(cl);
  }

  // Ground: dark city base, with a sand beach and water to the south (pier side).
  const ground = new T.Mesh(
    new T.PlaneGeometry(560, 560),
    new T.MeshLambertMaterial({ color: 0x322e42 })
  );
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, 40);
  scene.add(ground);
  const beach = new T.Mesh(
    new T.PlaneGeometry(560, 46),
    new T.MeshLambertMaterial({ color: 0xc9a06a })
  );
  beach.rotation.x = -Math.PI / 2; beach.position.set(0, 0.05, 132);
  scene.add(beach);
  const water = new T.Mesh(
    new T.PlaneGeometry(560, 200),
    new T.MeshLambertMaterial({ color: 0x1d4e6e })
  );
  water.rotation.x = -Math.PI / 2; water.position.set(0, 0.02, 255);
  scene.add(water);

  // Roads: asphalt strips with pale center dashes, plus sidewalks.
  const roadMat = new T.MeshLambertMaterial({ color: 0x413e52 });
  const sideMat = new T.MeshLambertMaterial({ color: 0x55506a });
  const dashMat = new T.MeshBasicMaterial({ color: 0xd8c98a });
  for (const c of ROAD_COORDS) {
    for (const horizontal of [true, false]) {
      const road = new T.Mesh(new T.PlaneGeometry(240, 12), roadMat);
      road.rotation.x = -Math.PI / 2;
      if (horizontal) { road.position.set(0, 0.1, c); }
      else { road.rotation.z = Math.PI / 2; road.position.set(c, 0.1, 0); }
      scene.add(road);
      for (let d = -110; d <= 110; d += 12) {
        const dash = new T.Mesh(new T.PlaneGeometry(4, 0.5), dashMat);
        dash.rotation.x = -Math.PI / 2;
        if (horizontal) dash.position.set(d, 0.12, c);
        else { dash.rotation.z = Math.PI / 2; dash.position.set(c, 0.12, d); }
        scene.add(dash);
      }
      // Sidewalk strips flanking each road.
      for (const off of [-8, 8]) {
        const sw = new T.Mesh(new T.PlaneGeometry(240, 3.4), sideMat);
        sw.rotation.x = -Math.PI / 2;
        if (horizontal) sw.position.set(0, 0.08, c + off);
        else { sw.rotation.z = Math.PI / 2; sw.position.set(c + off, 0.08, 0); }
        scene.add(sw);
      }
    }
  }

  // Buildings: one or four per block, heights vary, windows glow at sunset.
  const texA = makeWindowTexture(mulberry32(11), 0.55);
  const texB = makeWindowTexture(mulberry32(22), 0.4);
  const texC = makeWindowTexture(mulberry32(33), 0.65);
  const texs = [texA, texB, texC];
  const roofColors = [0x3a2b4d, 0x27324a, 0x4a2b33, 0x2f4038];
  const blockCenters = [-100, -60, -20, 20, 60, 100];
  for (const bx of blockCenters) {
    for (const bz of blockCenters) {
      if (Math.abs(bx) > 105 || Math.abs(bz) > 105) continue;
      // The south row near the beach stays low (boardwalk shops).
      const lowRow = bz === 100;
      const big = rng() < 0.35;
      const spots = big ? [[0, 0, 26]] : [[-7, -7, 13], [7, -7, 13], [-7, 7, 13], [7, 7, 13]];
      for (const [ox, oz, size] of spots) {
        const h = lowRow ? randRange(rng, 6, 12) : randRange(rng, 10, 42);
        const tex = pick(rng, texs);
        const mat = new T.MeshLambertMaterial({
          map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.75,
        });
        const b = new T.Mesh(new T.BoxGeometry(size, h, size), mat);
        b.position.set(bx + ox, h / 2, bz + oz);
        scene.add(b);
        const roof = new T.Mesh(
          new T.BoxGeometry(size + 0.6, 0.8, size + 0.6),
          new T.MeshLambertMaterial({ color: pick(rng, roofColors) })
        );
        roof.position.set(bx + ox, h + 0.4, bz + oz);
        scene.add(roof);
        S.colliders.push({ x: bx + ox, z: bz + oz, hx: size / 2 + 0.4, hz: size / 2 + 0.4 });
        // Rooftop beacon light on tall towers.
        if (h > 30) {
          const beacon = new T.Mesh(
            new T.SphereGeometry(0.7, 8, 8),
            new T.MeshBasicMaterial({ color: 0xff4040 })
          );
          beacon.position.set(bx + ox, h + 1.4, bz + oz);
          scene.add(beacon);
        }
      }
    }
  }

  // Streetlights along the main avenue (x = 0) and the harbor road (z = 80).
  const poleMat = new T.MeshLambertMaterial({ color: 0x222222 });
  const lampMat = new T.MeshBasicMaterial({ color: 0xffe9a8 });
  for (let d = -100; d <= 100; d += 20) {
    for (const [x, z] of [[-7, d], [7, d], [d, 73]]) {
      const pole = new T.Mesh(new T.CylinderGeometry(0.12, 0.16, 6, 6), poleMat);
      pole.position.set(x, 3, z); scene.add(pole);
      const lamp = new T.Mesh(new T.SphereGeometry(0.45, 8, 8), lampMat);
      lamp.position.set(x, 6.2, z); scene.add(lamp);
    }
  }

  // Palm trees along the beachfront and the pier approach.
  const trunkMat = new T.MeshLambertMaterial({ color: 0x6b4a2a });
  const leafMat = new T.MeshLambertMaterial({ color: 0x2f7a3d });
  for (let x = -100; x <= 100; x += 14) {
    if (Math.abs(x) < 6) continue;
    const trunk = new T.Mesh(new T.CylinderGeometry(0.25, 0.4, 6, 6), trunkMat);
    trunk.position.set(x + randRange(rng, -2, 2), 3, 108);
    trunk.rotation.z = randRange(rng, -0.12, 0.12);
    scene.add(trunk);
    for (let i = 0; i < 5; i++) {
      const leaf = new T.Mesh(new T.ConeGeometry(0.9, 4.5, 4), leafMat);
      const a = (i / 5) * Math.PI * 2;
      leaf.position.set(trunk.position.x + Math.cos(a) * 1.6, 6.4, 108 + Math.sin(a) * 1.6);
      leaf.rotation.z = Math.cos(a) * 1.1; leaf.rotation.x = -Math.sin(a) * 1.1;
      scene.add(leaf);
    }
  }

  // Harbor pier: wooden deck stretching into the water, with posts and lamps.
  const deckMat = new T.MeshLambertMaterial({ color: 0x7a5230 });
  const deck = new T.Mesh(new T.BoxGeometry(10, 1, 70), deckMat);
  deck.position.set(0, 0.8, 185); scene.add(deck);
  for (let z = 155; z <= 215; z += 10) {
    for (const x of [-4.5, 4.5]) {
      const post = new T.Mesh(new T.CylinderGeometry(0.3, 0.3, 3, 6), poleMat);
      post.position.set(x, 0.4, z); scene.add(post);
    }
  }
  const pierLamp = new T.PointLight(0xffc36b, 1.2, 40);
  pierLamp.position.set(0, 6, 185); scene.add(pierLamp);

  // Landmark: the Solmar Tower sign (glowing letters made of boxes) at the center.
  const signMat = new T.MeshBasicMaterial({ color: 0xff5a8a });
  const sign = new T.Mesh(new T.BoxGeometry(22, 3, 1), signMat);
  sign.position.set(0, 34, -20); scene.add(sign);

  // Particle points (one shared geometry, positions updated per frame).
  particleGeo = new T.BufferGeometry();
  particleGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(600 * 3), 3));
  particleGeo.setAttribute('color', new T.BufferAttribute(new Float32Array(600 * 3), 3));
  particlePts = new T.Points(particleGeo, new T.PointsMaterial({
    size: 0.7, vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false,
  }));
  particlePts.frustumCulled = false;
  scene.add(particlePts);
}

export function spawnBurst(x, y, z, colorHex, count, speed) {
  const c = new T.Color(colorHex);
  for (let i = 0; i < count; i++) {
    if (particlePool.length >= 600) particlePool.shift();
    const a = Math.random() * Math.PI * 2, b = Math.random() * Math.PI - Math.PI / 2;
    particlePool.push({
      x, y, z,
      vx: Math.cos(a) * Math.cos(b) * speed * (0.4 + Math.random() * 0.6),
      vy: Math.abs(Math.sin(b)) * speed * 0.7 + 2,
      vz: Math.sin(a) * Math.cos(b) * speed * (0.4 + Math.random() * 0.6),
      life: 0.6 + Math.random() * 0.5, maxLife: 1.1,
      r: c.r, g: c.g, b: c.b,
    });
  }
}

export function updateParticles(dt) {
  const pos = particleGeo.attributes.position.array;
  const col = particleGeo.attributes.color.array;
  for (let i = 0; i < 600; i++) {
    const p = particlePool[i];
    if (p) {
      p.life -= dt; p.vy -= 14 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.1) { p.y = 0.1; p.vy *= -0.3; }
      if (p.life <= 0) particlePool.splice(i, 1);
    }
    const q = particlePool[i];
    if (q) {
      pos[i * 3] = q.x; pos[i * 3 + 1] = q.y; pos[i * 3 + 2] = q.z;
      const f = Math.max(0, q.life / q.maxLife);
      col[i * 3] = q.r * f; col[i * 3 + 1] = q.g * f; col[i * 3 + 2] = q.b * f;
    } else {
      pos[i * 3 + 1] = -100; col[i * 3] = 0; col[i * 3 + 1] = 0; col[i * 3 + 2] = 0;
    }
  }
  particleGeo.attributes.position.needsUpdate = true;
  particleGeo.attributes.color.needsUpdate = true;
}

// Mission beacon: a tall glowing column marking the current objective.
export function createBeacon(x, z, colorHex) {
  const T2 = window.THREE;
  const group = new T2.Group();
  const beam = new T2.Mesh(
    new T2.CylinderGeometry(1.6, 2.4, 60, 12, 1, true),
    new T2.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0.28, side: T2.DoubleSide, depthWrite: false })
  );
  beam.position.y = 30;
  const ring = new T2.Mesh(
    new T2.TorusGeometry(3, 0.35, 8, 32),
    new T2.MeshBasicMaterial({ color: colorHex })
  );
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.4;
  group.add(beam); group.add(ring);
  group.position.set(x, 0, z);
  S.scene.add(group);
  return group;
}
export function removeBeacon(b) { if (b) S.scene.remove(b); }
