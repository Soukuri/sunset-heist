// Missions and the short story of SUNSET HEIST: three jobs for fixer Mama June
// that take Rico from a stolen car to the Marlow crew's last stand.
import { S } from './state.js';
import { dist2, fmtCash, fmtTime } from './util.js';
import { createBeacon, removeBeacon, spawnBurst } from './city.js';
import { playMissionComplete, playMissionFail, playPickup } from './audio.js';
import { writeSave } from './save.js';
import { spawnRivals, rivalsAlive, clearRivals } from './combat.js';

export const MISSIONS = [
  {
    id: 'getaway',
    title: 'Job 1 — Sunset Getaway',
    briefing: 'Mama June: "The Marlows took your ride. Take one back — any car — and bring it to the pier before the patrol clocks you."',
    objective: 'Steal a car and reach the Harbor Pier marker',
    target: { x: 0, z: 195 },
    timer: 150,
    reward: 500,
    unlock: 'coupe',
  },
  {
    id: 'delivery',
    title: 'Job 2 — Harbor Delivery',
    briefing: 'Mama June: "A package for the north docks. The patrol is jumpy tonight — get it there in one piece, no questions."',
    objective: 'Deliver the package to the North Docks marker',
    target: { x: 100, z: -100 },
    timer: 120,
    reward: 750,
    unlock: 'sport',
  },
  {
    id: 'standoff',
    title: 'Job 3 — Rooftop Standoff',
    briefing: 'Mama June: "The Marlow crew is waiting at the plaza. End it on foot — then come home a legend."',
    objective: 'Defeat the Marlow crew at the Plaza marker',
    target: { x: 60, z: -60 },
    timer: 0,
    reward: 1000,
    unlock: null,
  },
];

let onMessage = null;
export function setMissionMessenger(fn) { onMessage = fn; }
function say(text) { if (onMessage) onMessage(text); }

function currentMission() {
  return S.missionIndex >= 0 && S.missionIndex < MISSIONS.length ? MISSIONS[S.missionIndex] : null;
}

export function missionObjectiveText() {
  const m = currentMission();
  if (!m) return S.missionsDone.length >= 3
    ? 'Story complete — Solmar City is yours. Free roam!'
    : 'Talk to Mama June — a new job is waiting.';
  if (S.missionState === 'idle') return m.title + ' — reach the marker to start';
  if (m.id === 'standoff' && S.missionState === 'active') {
    return m.title + ' — Marlow crew left: ' + rivalsAlive();
  }
  return m.title + ' — ' + m.objective;
}

export function startMission(index) {
  const m = MISSIONS[index];
  if (!m) return;
  S.missionIndex = index;
  S.missionState = 'active';
  S.missionTimer = m.timer;
  S.missionTarget = { x: m.target.x, z: m.target.z };
  if (S.missionBeacon) removeBeacon(S.missionBeacon);
  S.missionBeacon = createBeacon(m.target.x, m.target.z, 0xffd75e);
  say(m.briefing);
  if (m.id === 'standoff') spawnRivals(m.target.x, m.target.z, 4);
}

export function completeMission() {
  const m = currentMission();
  if (!m) return;
  S.missionState = 'done';
  S.cash += m.reward;
  if (!S.missionsDone.includes(m.id)) S.missionsDone.push(m.id);
  if (m.unlock && !S.unlockedCars.includes(m.unlock)) {
    S.unlockedCars.push(m.unlock);
    say('Unlocked: the ' + m.unlock.toUpperCase() + ' is now parked on the beachfront.');
  }
  if (S.missionBeacon) { removeBeacon(S.missionBeacon); S.missionBeacon = null; }
  if (m.id === 'standoff') clearRivals();
  playMissionComplete();
  spawnBurst(S.player.position.x, 2, S.player.position.z, 0xffd75e, 40, 9);
  say('Job complete! +' + fmtCash(m.reward) + ' — ' + m.title);
  writeSave();
  const next = S.missionIndex + 1;
  if (next < MISSIONS.length) {
    S.missionIndex = next;
    S.missionState = 'idle';
    S.missionTarget = { x: MISSIONS[next].target.x, z: MISSIONS[next].target.z };
    if (S.missionBeacon) removeBeacon(S.missionBeacon);
    S.missionBeacon = createBeacon(MISSIONS[next].target.x, MISSIONS[next].target.z, 0xffd75e);
    say('Next job: ' + MISSIONS[next].title + ' — reach the gold marker.');
  } else {
    S.missionIndex = -1;
    S.missionTarget = null;
    say('Story complete! Solmar City is yours, Rico. Free roam — the sunset is yours.');
  }
}

export function failMission(reason) {
  const m = currentMission();
  if (!m || S.missionState !== 'active') return;
  playMissionFail();
  say('Job failed — ' + reason + '. Head back to the marker to try again.');
  S.missionState = 'idle';
  S.missionTimer = 0;
  if (m.id === 'standoff') { clearRivals(); }
}

export function updateMissions(dt) {
  const m = currentMission();
  if (!m) return;
  const px = S.onFoot ? S.player.position.x : S.currentCar.x;
  const pz = S.onFoot ? S.player.position.z : S.currentCar.z;
  if (S.missionState === 'idle') {
    if (dist2(px, pz, m.target.x, m.target.z) < 6) startMission(S.missionIndex);
    return;
  }
  // Active mission.
  if (m.timer > 0) {
    S.missionTimer -= dt;
    if (S.missionTimer <= 0) { failMission('time ran out'); return; }
  }
  if (m.id === 'standoff') {
    if (rivalsAlive() === 0) { completeMission(); return; }
  } else if (dist2(px, pz, m.target.x, m.target.z) < 7) {
    playPickup();
    completeMission();
  }
}

export function missionTimerText() {
  const m = currentMission();
  if (!m || S.missionState !== 'active' || m.timer <= 0) return '';
  return '⏱ ' + fmtTime(S.missionTimer);
}
