// Save / continue via localStorage. Progress autosaves after every mission
// and whenever the player pauses; the title screen offers Continue when a
// save exists.
const SAVE_KEY = 'solmar-bay-save-v1';

export function saveGame(G) {
  try {
    const p = G.player;
    const data = {
      version: 1,
      cash: p.cash,
      hp: p.hp,
      ammo: p.ammo,
      x: p.x, y: p.y,
      missionIndex: G.missionIndex,
      missionDone: G.missionDone,
      packagesFound: G.packagesFound,
      packageTaken: G.packageTaken,
      taxiFares: G.taxiFares,
      storyComplete: G.storyComplete,
      clock: G.clock,
      stats: G.stats,
      savedAt: Date.now(),
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.version !== 1) return null;
    return data;
  } catch (e) {
    return null;
  }
}

/** True when a valid save is waiting on the title screen. */
export function saveExists() {
  return loadSave() !== null;
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* storage unavailable */ }
}

/** Apply a loaded save onto a fresh game state. */
export function applySave(G, data) {
  const p = G.player;
  p.cash = data.cash;
  p.hp = data.hp;
  p.ammo = data.ammo;
  p.x = data.x;
  p.y = data.y;
  G.missionIndex = data.missionIndex;
  G.missionDone = data.missionDone || [];
  G.packagesFound = data.packagesFound || 0;
  G.packageTaken = data.packageTaken || new Array(10).fill(false);
  G.taxiFares = data.taxiFares || 0;
  G.storyComplete = !!data.storyComplete;
  G.clock = data.clock || 10 * 3600;
  if (data.stats) G.stats = data.stats;
  G.camera.x = p.x;
  G.camera.y = p.y;
}
