// Central game state for SUNSET HEIST. Every system reads and writes this one
// object, so main.js can wire the whole game together without globals leaking.
export const S = {
  // three.js core
  scene: null, camera: null, renderer: null, clock: null,
  // flow: 'menu' | 'playing' | 'paused' | 'gameover'
  mode: 'menu',
  time: 0, elapsed: 0,
  // player on foot
  player: null,           // THREE.Group (the Rico Vane character)
  playerHeading: 0,       // facing angle
  playerSpeed: 0,
  playerHealth: 100,
  onFoot: true,
  // camera orbit
  camYaw: 0, camPitch: 0.32, camDist: 8,
  // driving
  currentCar: null,       // vehicle object the player is driving, or null
  // economy + progression
  cash: 0,
  missionsDone: [],       // mission ids completed
  unlockedCars: ['sedan'],
  // wanted level 0..5 (stars shown)
  wanted: 0, wantedHeat: 0, lastCrimeAt: -999,
  // world registries
  colliders: [],          // {x, z, hx, hz} building AABBs
  cars: [],               // all vehicles (traffic, parked, police, player-driven)
  pedestrians: [],
  policeCars: [],
  rivals: [],
  particles: [],
  tracers: [],
  pickups: [],
  // mission runtime
  missionIndex: 0,        // index into MISSIONS (0-based), -1 when story done
  missionState: 'idle',   // 'idle' | 'active' | 'done'
  missionTimer: 0,
  missionTarget: null,    // THREE.Vector3 marker position
  missionBeacon: null,    // beacon mesh
  // misc
  muted: false,
  shotMode: null,         // 'start' | 'onfoot' | 'drive' | 'chase' when ?shot= is set
  rng: Math.random,
};
export function resetRunState() {
  S.playerHealth = 100;
  S.wanted = 0; S.wantedHeat = 0; S.lastCrimeAt = -999;
  S.onFoot = true; S.currentCar = null;
  S.missionIndex = 0; S.missionState = 'idle'; S.missionTimer = 0; S.missionTarget = null;
  S.rivals = []; S.policeCars = [];
}
