// localStorage save for SUNSET HEIST: cash, missions completed and cars
// unlocked by the story. Progress survives a reload; a fresh browser starts clean.
import { S } from './state.js';

const KEY = 'sunsetHeistSaveV1';

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    S.cash = typeof data.cash === 'number' ? data.cash : 0;
    S.missionsDone = Array.isArray(data.missionsDone) ? data.missionsDone : [];
    S.unlockedCars = Array.isArray(data.unlockedCars) && data.unlockedCars.length
      ? data.unlockedCars : ['sedan'];
    return data;
  } catch (e) { return null; }
}

export function writeSave() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      cash: S.cash,
      missionsDone: S.missionsDone,
      unlockedCars: S.unlockedCars,
      savedAt: new Date().toISOString(),
    }));
  } catch (e) { /* storage unavailable (private mode, quota) */ }
}

export function clearSave() {
  try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  S.cash = 0; S.missionsDone = []; S.unlockedCars = ['sedan'];
}
