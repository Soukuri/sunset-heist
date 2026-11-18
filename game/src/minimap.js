// Minimap for SUNSET HEIST: a circular canvas 2D top-down view of Solmar City
// — roads, blocks, the player arrow, cars, police and the mission marker.
import { S } from './state.js';
import { ROAD_COORDS, CITY_HALF } from './city.js';

let ctx = null;
const SIZE = 190, RANGE = 260;

export function initMinimap() {
  const canvas = document.getElementById('minimap');
  ctx = canvas.getContext('2d');
}

function toMap(x, z) {
  return {
    x: SIZE / 2 + (x / RANGE) * SIZE,
    y: SIZE / 2 + (z / RANGE) * SIZE,
  };
}

export function drawMinimap() {
  if (!ctx) return;
  ctx.clearRect(0, 0, SIZE, SIZE);
  // Clip to the circle.
  ctx.save();
  ctx.beginPath(); ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = '#241a3d'; ctx.fillRect(0, 0, SIZE, SIZE);
  // City blocks.
  ctx.fillStyle = '#3a2f5e';
  for (const bx of [-100, -60, -20, 20, 60, 100]) {
    for (const bz of [-100, -60, -20, 20, 60, 100]) {
      const p = toMap(bx - 13, bz - 13);
      const s = (26 / RANGE) * SIZE;
      ctx.fillRect(p.x, p.y, s, s);
    }
  }
  // Roads.
  ctx.strokeStyle = '#6f6688'; ctx.lineWidth = 5;
  for (const c of ROAD_COORDS) {
    const a = toMap(c, -CITY_HALF), b = toMap(c, CITY_HALF);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    const c2 = toMap(-CITY_HALF, c), d2 = toMap(CITY_HALF, c);
    ctx.beginPath(); ctx.moveTo(c2.x, c2.y); ctx.lineTo(d2.x, d2.y); ctx.stroke();
  }
  // Beach + water to the south.
  const beach = toMap(-CITY_HALF, 118);
  ctx.fillStyle = '#c9a06a'; ctx.fillRect(0, beach.y, SIZE, 14);
  ctx.fillStyle = '#1d4e6e'; ctx.fillRect(0, beach.y + 14, SIZE, SIZE);
  // Mission marker (pulsing gold diamond).
  if (S.missionTarget) {
    const m = toMap(S.missionTarget.x, S.missionTarget.z);
    const r = 7 + Math.sin(S.time * 4) * 2;
    ctx.fillStyle = '#ffd75e';
    ctx.beginPath();
    ctx.moveTo(m.x, m.y - r); ctx.lineTo(m.x + r, m.y); ctx.lineTo(m.x, m.y + r); ctx.lineTo(m.x - r, m.y);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#7a5b00'; ctx.lineWidth = 1.5; ctx.stroke();
  }
  // Traffic and parked cars (white dots), police (red/blue flashing).
  for (const car of S.cars) {
    const p = toMap(car.x, car.z);
    if (car.kind === 'police') {
      ctx.fillStyle = Math.floor(S.time * 3) % 2 === 0 ? '#ff3333' : '#3388ff';
      ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2); ctx.fill();
    } else if (car === S.currentCar) {
      // Player's car is drawn with the player arrow below.
    } else {
      ctx.fillStyle = 'rgba(255,255,255,.75)';
      ctx.beginPath(); ctx.arc(p.x, p.y, 2.5, 0, Math.PI * 2); ctx.fill();
    }
  }
  // Rivals (red dots).
  for (const r of S.rivals) {
    if (r.health <= 0) continue;
    const p = toMap(r.x, r.z);
    ctx.fillStyle = '#ff5544';
    ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  // Player arrow (green, rotated to heading), centered on the player or the car.
  const px = S.onFoot ? S.player.position.x : S.currentCar.x;
  const pz = S.onFoot ? S.player.position.z : S.currentCar.z;
  const heading = S.onFoot ? S.playerHeading : S.currentCar.heading;
  const p = toMap(px, pz);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(heading);
  ctx.fillStyle = '#7dff8a';
  ctx.strokeStyle = '#14521c'; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
  // North indicator.
  ctx.fillStyle = '#ffe9b0'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('N', SIZE / 2, 14);
  ctx.restore();
}
