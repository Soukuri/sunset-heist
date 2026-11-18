// Boot and the one loop for SUNSET HEIST: builds the world, runs the game
// between title / play / paused / game over, and stages the ?shot= scenes
// used for the entry screenshots.
import { S, resetRunState } from './state.js';
import { buildCity, updateParticles, createBeacon, removeBeacon } from './city.js';
import { spawnTraffic, updateTraffic, updatePlayerCar, enterCar, exitCar, nearestCar, CAR_MODELS } from './vehicles.js';
import { spawnPedestrians, updatePedestrians } from './pedestrians.js';
import { updatePolice, addWanted, updateWantedLevel, clearPoliceCars } from './police.js';
import { initCombat, updateCombat, playerShoot, updateTracers, updateRivals } from './combat.js';
import { MISSIONS, startMission, updateMissions, setMissionMessenger } from './missions.js';
import { initHud, showHud, addMessage, updateHud, announce } from './hud.js';
import { initMinimap, drawMinimap } from './minimap.js';
import { buildPlayerMesh, updatePlayerOnFoot, updateCamera } from './player.js';
import { initInput, keys, mouse, exitPointerLock } from './input.js';
import { initAudio, updateEngineSound, updateSirenSound, setMuted, playClick } from './audio.js';
import { loadSave, writeSave } from './save.js';

const T = window.THREE;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const canvas = document.getElementById('game');

const SPAWN = { x: 0, z: 40 };

function setupInitialMission() {
  if (S.missionBeacon) { removeBeacon(S.missionBeacon); S.missionBeacon = null; }
  // Resume the story at the first job not yet finished.
  let idx = 0;
  for (let i = 0; i < MISSIONS.length; i++) {
    if (!S.missionsDone.includes(MISSIONS[i].id)) { idx = i; break; }
    idx = MISSIONS.length;
  }
  if (idx >= MISSIONS.length) {
    S.missionIndex = -1; S.missionState = 'idle'; S.missionTarget = null;
    return;
  }
  S.missionIndex = idx;
  S.missionState = 'idle';
  S.missionTarget = { x: MISSIONS[idx].target.x, z: MISSIONS[idx].target.z };
  S.missionBeacon = createBeacon(MISSIONS[idx].target.x, MISSIONS[idx].target.z, 0xffd75e);
}

function buildWorld() {
  S.renderer = new T.WebGLRenderer({ canvas, antialias: true });
  S.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  S.renderer.setSize(window.innerWidth, window.innerHeight);
  S.scene = new T.Scene();
  S.camera = new T.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 600);
  S.camera.position.set(0, 20, 60);
  window.addEventListener('resize', () => {
    S.camera.aspect = window.innerWidth / window.innerHeight;
    S.camera.updateProjectionMatrix();
    S.renderer.setSize(window.innerWidth, window.innerHeight);
  });
  buildCity();
  S.player = buildPlayerMesh();
  S.player.position.set(SPAWN.x, 0, SPAWN.z);
  S.scene.add(S.player);
  spawnTraffic();
  spawnPedestrians();
  initCombat();
}

function startGame() {
  initAudio();
  resetRunState();
  clearPoliceCars();
  S.playerHealth = 100;
  S.player.position.set(SPAWN.x, 0, SPAWN.z);
  S.player.visible = true;
  S.onFoot = true;
  S.currentCar = null;
  S.camYaw = Math.PI; // look south down the avenue toward the pier
  S.camPitch = 0.32;
  document.getElementById('startScreen').classList.add('hidden');
  document.getElementById('gameOverScreen').classList.add('hidden');
  document.getElementById('pauseScreen').classList.add('hidden');
  mouse.clicked = false; mouse.down = false; // the Start click is not a shot
  showHud(true);
  S.mode = 'playing';
  setupInitialMission();
  addMessage('Welcome to Solmar City, Rico. Reach the gold marker to start Job 1.');
  announce('Playing SUNSET HEIST.');
  playClick();
}

function pauseGame() {
  if (S.mode !== 'playing') return;
  S.mode = 'paused';
  exitPointerLock();
  document.getElementById('pauseScreen').classList.remove('hidden');
  announce('Paused.');
}
function resumeGame() {
  if (S.mode !== 'paused') return;
  S.mode = 'playing';
  document.getElementById('pauseScreen').classList.add('hidden');
  announce('Playing.');
}
function quitToTitle() {
  S.mode = 'menu';
  exitPointerLock();
  document.getElementById('pauseScreen').classList.add('hidden');
  document.getElementById('gameOverScreen').classList.add('hidden');
  document.getElementById('startScreen').classList.remove('hidden');
  showHud(false);
  updateSaveLine();
}
function gameOver(busted) {
  S.mode = 'gameover';
  exitPointerLock();
  showHud(false);
  document.getElementById('gameOverTitle').textContent = busted ? 'BUSTED' : 'FLATLINED';
  document.getElementById('gameOverText').textContent = busted
    ? 'The Harbor Patrol caught up with you. Mama June is not impressed.'
    : 'Solmar City chewed you up, Rico. Dust yourself off and try again.';
  document.getElementById('gameOverScreen').classList.remove('hidden');
  announce('Game over.');
}

function updateSaveLine() {
  const line = document.getElementById('saveLine');
  if (S.missionsDone.length > 0 || S.cash > 0) {
    line.textContent = 'Saved progress: $' + S.cash.toLocaleString('en-US') + ' · '
      + S.missionsDone.length + ' of 3 jobs done · ' + S.unlockedCars.join(', ') + ' unlocked';
  } else {
    line.textContent = 'New game — no save yet. Progress saves automatically after each job.';
  }
}

// --- Staged scenes for screenshots (?shot=start|onfoot|drive|chase) ---
function stageShot(name) {
  S.shotMode = name;
  if (name === 'start') {
    S.mode = 'menu';
    showHud(false);
    updateSaveLine();
    window.__shotReady = true;
    return;
  }
  document.getElementById('startScreen').classList.add('hidden');
  showHud(true);
  S.mode = 'playing';
  setupInitialMission();
  if (name === 'onfoot') {
    S.player.position.set(0, 0, 55);
    S.playerHeading = Math.PI;
    S.camYaw = Math.PI;
    S.camPitch = 0.3;
    addMessage('Mama June: "Take a car — any car — and bring it to the pier."');
  } else if (name === 'drive' || name === 'chase') {
    const car = nearestCar(0, 40, 60, ['parked']) || S.cars[0];
    car.x = 0; car.z = 40; car.heading = 0; car.speed = 22;
    car.mesh.position.set(0, 0, 40); car.mesh.rotation.y = 0;
    enterCar(car);
    S.camYaw = Math.PI;
    S.camPitch = 0.28;
    if (name === 'drive') {
      addMessage('Mama June: "Nice wheels. Now get to the pier before sunset."');
    } else {
      startMission(0);
      S.missionTimer = 96;
      addWanted(3);
      updateWantedLevel();
      // Park the patrol cars in their flank slots right away, so the chase
      // is already in formation when the screenshot is taken.
      const chaseSlots = [[-4.5, 7], [4.5, 7], [-4.5, 14]];
      for (let i = 0; i < S.policeCars.length; i++) {
        const pc = S.policeCars[i];
        const [lat, lon] = chaseSlots[i % chaseSlots.length];
        pc.x = lat;
        pc.z = 40 + lon;
        pc.heading = 0;
        pc.speed = 22;
        pc.mesh.position.set(pc.x, 0, pc.z);
        pc.mesh.rotation.y = 0;
      }
      addMessage('WANTED — Lose the Harbor Patrol and reach the pier!');
    }
  }
  // Let traffic, pedestrians and police settle for a moment before the shot.
  // The chase stays frantic: only a few steps, so the patrol cars are closing
  // in behind the player instead of already piled on top of the car.
  const settleSteps = name === 'chase' ? 12 : 40;
  for (let i = 0; i < settleSteps; i++) stepWorld(1 / 30);
  updateCamera(1 / 30);
  updateHud();
  drawMinimap();
  S.renderer.render(S.scene, S.camera);
  window.__shotReady = true;
}

// One simulation step (dt seconds) while playing.
let prevE = false;
function stepWorld(dt) {
  S.time += dt;
  S.elapsed += dt;
  if (S.mode !== 'playing') return;
  if (S.onFoot) {
    updatePlayerOnFoot(dt, keys);
    if (mouse.down || mouse.clicked) playerShoot();
    if (keys.KeyE && !prevE) {
      const car = nearestCar(S.player.position.x, S.player.position.z, 5, ['parked', 'traffic']);
      if (car) {
        enterCar(car);
        addWanted(1.0); // stealing a car is a crime, even in Solmar City
        addMessage('You took the ' + car.modelDef.name + '. The owner will not be pleased.');
        playClick();
      }
    }
  } else {
    // In a staged shot the getaway keeps rolling: pretend W is held.
    updatePlayerCar(dt, S.shotMode ? { ...keys, KeyW: true } : keys);
    if (keys.KeyE && !prevE) exitCar();
  }
  prevE = keys.KeyE;
  updateTraffic(dt);
  updatePedestrians(dt);
  updatePolice(dt);
  updateRivals(dt);
  updateMissions(dt);
  updateCombat(dt);
  updateParticles(dt);
  updateTracers(dt);
  updateEngineSound(S.currentCar ? S.currentCar.speed : 0, !!S.currentCar);
  updateSirenSound();
  if (S.playerHealth <= 0) gameOver(S.wanted > 0);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastNow) / 1000 || 0.016);
  lastNow = now;
  if (S.mode === 'playing') {
    stepWorld(dt);
    updateCamera(dt);
    updateHud();
    drawMinimap();
  } else if (S.mode === 'menu') {
    // Slow cinematic orbit over the city behind the title screen.
    S.time += dt;
    const a = S.time * 0.05;
    S.camera.position.set(Math.sin(a) * 70, 34, Math.cos(a) * 70);
    S.camera.lookAt(0, 12, 0);
    updateTraffic(dt * 0.5);
    updatePedestrians(dt * 0.5);
    updateParticles(dt);
  } else if (S.mode === 'paused' || S.mode === 'gameover') {
    updateParticles(dt);
  }
  S.renderer.render(S.scene, S.camera);
}

let lastNow = performance.now();

// --- Wire up menus and global keys ---
function initMenus() {
  document.getElementById('playBtn').addEventListener('click', () => { initAudio(); startGame(); });
  document.getElementById('resumeBtn').addEventListener('click', resumeGame);
  document.getElementById('restartBtn').addEventListener('click', () => {
    resetRunState();
    clearPoliceCars();
    S.playerHealth = 100;
    S.player.position.set(SPAWN.x, 0, SPAWN.z);
    S.player.visible = true;
    S.onFoot = true; S.currentCar = null;
    document.getElementById('gameOverScreen').classList.add('hidden');
    showHud(true);
    S.mode = 'playing';
    setupInitialMission();
    writeSave();
  });
  document.getElementById('menuBtn').addEventListener('click', quitToTitle);
  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'KeyP' && (S.mode === 'playing' || S.mode === 'paused')) {
      if (S.mode === 'playing') pauseGame(); else resumeGame();
    }
    if (e.code === 'KeyM') { initAudio(); setMuted(!S.muted); addMessage(S.muted ? 'Sound muted.' : 'Sound on.'); }
    if (e.code === 'Escape' && S.mode === 'playing') pauseGame();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && S.mode === 'playing') pauseGame();
  });
}

function boot() {
  if (!window.THREE) {
    document.getElementById('status').textContent = '3D engine failed to load.';
    return;
  }
  window.__game = S; // debug hook: inspect live state from the console
  loadSave();
  buildWorld();
  initInput(canvas);
  initHud();
  initMinimap();
  setMissionMessenger(addMessage);
  initMenus();
  updateSaveLine();
  if (shot) {
    stageShot(shot);
    // Keep rendering so headless screenshots catch a settled frame.
    requestAnimationFrame(frame);
  } else {
    S.mode = 'menu';
    showHud(false);
    requestAnimationFrame(frame);
  }
}

boot();
