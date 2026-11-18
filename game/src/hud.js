// HUD for SUNSET HEIST: wanted stars, cash, health, speed, mission objective,
// timer, context hints and the message feed. All DOM, updated once a frame.
import { S } from './state.js';
import { fmtCash } from './util.js';
import { missionObjectiveText, missionTimerText } from './missions.js';
import { nearestCar } from './vehicles.js';

const el = {};
let feedTimer = null;

export function initHud() {
  for (const id of ['hud', 'stars', 'objective', 'timerBox', 'cash', 'healthBar',
    'speedBox', 'messageFeed', 'crosshair', 'hint', 'status']) {
    el[id] = document.getElementById(id);
  }
}

export function showHud(show) { el.hud.classList.toggle('hidden', !show); }

export function addMessage(text) {
  const div = document.createElement('div');
  div.textContent = text;
  el.messageFeed.appendChild(div);
  while (el.messageFeed.children.length > 4) el.messageFeed.removeChild(el.messageFeed.firstChild);
  if (feedTimer) clearTimeout(feedTimer);
  feedTimer = setTimeout(() => { el.messageFeed.innerHTML = ''; }, 30000);
}

export function announce(text) { el.status.textContent = text; }

export function updateHud() {
  // Wanted stars, top center.
  let stars = '';
  for (let i = 0; i < 5; i++) stars += i < S.wanted ? '★' : '<span class="off">★</span>';
  el.stars.innerHTML = stars;
  el.objective.textContent = missionObjectiveText();
  el.timerBox.textContent = missionTimerText();
  el.cash.textContent = fmtCash(S.cash);
  el.healthBar.style.width = Math.max(0, S.playerHealth) + '%';
  el.healthBar.style.background = S.playerHealth > 50
    ? 'linear-gradient(90deg,#ff5a5a,#ff9a3d)' : 'linear-gradient(90deg,#ff2222,#ff5a5a)';
  if (S.currentCar) {
    el.speedBox.textContent = Math.round(Math.abs(S.currentCar.speed) * 3.2) + ' km/h';
  } else {
    el.speedBox.textContent = '';
  }
  el.crosshair.classList.toggle('hidden', S.onFoot === false || S.mode !== 'playing');
  // Context hint at the bottom.
  let hint = '';
  if (S.mode === 'playing') {
    if (S.onFoot) {
      const car = nearestCar(S.player.position.x, S.player.position.z, 5, ['parked', 'traffic']);
      hint = car ? 'Press E to steal the ' + car.modelDef.name
        : 'WASD move · Shift run · Click shoot · Find a car and press E';
    } else {
      hint = 'WASD drive · Space handbrake · E exit car · Follow the gold marker';
    }
  }
  el.hint.textContent = hint;
}
