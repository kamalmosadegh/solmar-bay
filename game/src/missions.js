// Story missions and side activities. Each mission is a list of steps; a
// step completes when its condition is met, then the next one begins.
// Rewards are paid in cash and the story ends with the marina heist.
import { dist } from './util.js';
import { randomRoadPoint, randomSidewalkPoint } from './city.js';
import { addWanted } from './police.js';
import { spawnEnemy, scatterPickups } from './combat.js';
import { sfx } from './audio.js';
import { toast } from './state.js';

export const MISSIONS = [
  {
    id: 'm1', title: 'Wheels Up', reward: 300,
    intro: 'Rico needs wheels. Steal any car, then bring it to the garage.',
    steps: [
      { type: 'stealCar', text: 'Steal a car (walk up and press E)' },
      { type: 'goto', x: 600, y: 600, radius: 90, text: 'Drive to Rico\'s Garage' },
    ],
  },
  {
    id: 'm2', title: 'The Drop', reward: 500,
    intro: 'A package for the crew. Pick it up, then deliver it — 90 seconds.',
    steps: [
      { type: 'goto', x: 1780, y: 620, radius: 70, text: 'Pick up the package at Calle Sol' },
      { type: 'timedGoto', x: 3380, y: 2580, radius: 80, seconds: 90, text: 'Deliver the package — beat the clock!' },
    ],
  },
  {
    id: 'm3', title: 'Hot Pursuit', reward: 600,
    intro: 'The crew needs a driver who can shake the law. Get 3 stars, then lose them.',
    steps: [
      { type: 'wanted', stars: 3, text: 'Cause trouble — reach 3 wanted stars' },
      { type: 'loseWanted', text: 'Lose the cops — get back to 0 stars' },
    ],
  },
  {
    id: 'm4', title: 'Dockside War', reward: 800,
    intro: 'The Vultures took the docks. Take them back — all six of them.',
    steps: [
      { type: 'goto', x: 4180, y: 2850, radius: 140, text: 'Go to the Marina Docks' },
      { type: 'kill', count: 6, x: 4180, y: 2850, text: 'Clear out the Vulture crew (0/6)' },
    ],
  },
  {
    id: 'm5', title: 'The Getaway', reward: 1000,
    intro: 'Lena is waiting at the hospital. Pick her up and get her to the safehouse — the cops will be on you.',
    steps: [
      { type: 'goto', x: 1000, y: 2600, radius: 80, text: 'Pick up Lena at the hospital' },
      { type: 'escort', x: 3800, y: 2600, radius: 90, text: 'Drive Lena to the Safehouse (cops incoming!)' },
    ],
  },
  {
    id: 'm6', title: 'The Big One', reward: 2500,
    intro: 'The marina bank. Hold the vault for 20 seconds, then run for the boat. This is the one, Marco.',
    steps: [
      { type: 'goto', x: 4180, y: 2680, radius: 90, text: 'Reach the Solmar Bay Bank' },
      { type: 'hold', seconds: 20, x: 4180, y: 2680, radius: 90, text: 'Hold the vault — stay inside the circle!' },
      { type: 'escape', x: 4180, y: 2920, radius: 80, text: 'Escape to the boat at the docks!' },
    ],
  },
];

/** Start (or restart) the current story mission. */
export function startMission(G, index) {
  const def = MISSIONS[index];
  if (!def) return;
  G.mission = {
    def, step: 0, timer: 0, kills: 0, spawned: false,
    escortSpawned: false, holdDone: 0,
  };
  toast(G, 'Mission: ' + def.title + ' — ' + def.intro, 5);
  sfx.mission();
}

/** The current objective text for the HUD. */
export function missionObjective(G) {
  if (!G.mission) return G.storyComplete ? 'Story complete — free roam! Find packages, drive taxis.' : 'Press Space to start the next mission';
  const step = G.mission.def.steps[G.mission.step];
  return step ? step.text : '';
}

/** World position of the current mission marker (or null). */
export function missionMarker(G) {
  if (!G.mission) return null;
  const step = G.mission.def.steps[G.mission.step];
  if (!step || step.x === undefined) return null;
  return { x: step.x, y: step.y };
}

function advance(G) {
  const m = G.mission;
  m.step += 1;
  m.timer = 0;
  m.holdDone = 0;
  if (m.step >= m.def.steps.length) completeMission(G);
}

function completeMission(G) {
  const m = G.mission;
  const p = G.player;
  p.cash += m.def.reward;
  G.stats.cashEarned += m.def.reward;
  G.stats.missionsDone += 1;
  G.missionDone.push(m.def.id);
  toast(G, 'Mission complete: ' + m.def.title + '  +$' + m.def.reward, 4);
  sfx.cash();
  G.mission = null;
  G.missionIndex += 1;
  if (G.missionIndex >= MISSIONS.length) {
    G.storyComplete = true;
    G.screen = 'complete';
    G.screenTimer = 0;
    sfx.mission();
  }
}

function failMission(G, why) {
  toast(G, 'Mission failed: ' + why + ' — press Space to retry', 4);
  sfx.fail();
  G.mission = null;
  // The player keeps their place; the mission restarts from step one.
}

export function updateMissions(G, dt) {
  const m = G.mission;
  if (!m) return;
  const step = m.def.steps[m.step];
  if (!step) return;
  const p = G.player;
  const px = p.inCar ? p.inCar.x : p.x;
  const py = p.inCar ? p.inCar.y : p.y;

  switch (step.type) {
    case 'stealCar':
      if (p.inCar) advance(G);
      break;
    case 'goto':
      if (dist(px, py, step.x, step.y) < step.radius) advance(G);
      break;
    case 'timedGoto': {
      if (m.timer === 0) m.timer = step.seconds;
      m.timer -= dt;
      if (dist(px, py, step.x, step.y) < step.radius) { advance(G); break; }
      if (m.timer <= 0) failMission(G, 'out of time');
      break;
    }
    case 'wanted':
      if (G.wanted >= step.stars) advance(G);
      break;
    case 'loseWanted':
      if (G.wanted <= 0) advance(G);
      break;
    case 'kill': {
      if (!m.spawned) {
        m.spawned = true;
        for (let i = 0; i < step.count; i += 1) {
          spawnEnemy(G, step.x + (G.rng() - 0.5) * 220, step.y + (G.rng() - 0.5) * 220);
        }
        scatterPickups(G, step.x, step.y, 3);
      }
      if (m.killsAtStart === undefined) m.killsAtStart = G.stats.enemiesDown;
      const done = G.stats.enemiesDown - m.killsAtStart;
      step.text = 'Clear out the Vulture crew (' + Math.min(done, step.count) + '/' + step.count + ')';
      if (done >= step.count) advance(G);
      break;
    }
    case 'escort': {
      if (!m.escortSpawned) {
        m.escortSpawned = true;
        addWanted(G, 3, 'The cops spotted Lena');
        toast(G, 'Lena: "Drive, Marco! Don\'t stop!"', 3);
      }
      if (dist(px, py, step.x, step.y) < step.radius) advance(G);
      break;
    }
    case 'hold': {
      if (dist(px, py, step.x, step.y) < step.radius) {
        m.holdDone += dt;
        step.text = 'Hold the vault — ' + Math.ceil(step.seconds - m.holdDone) + 's left';
        if (m.holdDone >= step.seconds) advance(G);
      } else {
        step.text = 'Hold the vault — stay inside the circle!';
      }
      // Cops keep arriving while the vault is being cracked.
      if (G.rng() < dt * 0.15 && G.wanted < 4) addWanted(G, 0.5, 'Bank alarm!');
      break;
    }
    case 'escape':
      if (dist(px, py, step.x, step.y) < step.radius) advance(G);
      break;
    default:
      break;
  }
}

/** Space starts the next mission when none is running. */
export function tryStartMission(G) {
  if (G.mission) return false;
  if (G.storyComplete) return false;
  if (G.missionIndex < MISSIONS.length) {
    startMission(G, G.missionIndex);
    return true;
  }
  return false;
}

// ---------- Side activities ----------

/** Accept a taxi fare: a waiting passenger rides to a random destination. */
export function tryTaxi(G) {
  const p = G.player;
  if (!p.inCar || G.taxiActive) return false;
  for (const pas of G.passengers) {
    if (!pas.waiting) continue;
    if (dist(pas.x, pas.y, p.x, p.y) < 90) {
      pas.waiting = false;
      const spot = randomRoadPoint(G.rng);
      const fare = 60 + Math.floor(G.rng() * 90);
      G.taxiActive = { passenger: pas, dest: { x: spot.x, y: spot.y }, fare, timer: 75 };
      toast(G, 'Taxi fare: $' + fare + ' — drive to the marker!', 3);
      sfx.pickup();
      return true;
    }
  }
  return false;
}

export function updateTaxi(G, dt) {
  const t = G.taxiActive;
  if (!t) return;
  const p = G.player;
  t.timer -= dt;
  const px = p.inCar ? p.inCar.x : p.x;
  const py = p.inCar ? p.inCar.y : p.y;
  if (dist(px, py, t.dest.x, t.dest.y) < 80) {
    p.cash += t.fare;
    G.stats.cashEarned += t.fare;
    G.taxiFares += 1;
    toast(G, 'Fare complete! +$' + t.fare, 2.5);
    sfx.cash();
    // The passenger hops out and a fresh customer appears elsewhere.
    const spot = randomSidewalkPoint(G.rng);
    t.passenger.x = spot.x; t.passenger.y = spot.y;
    t.passenger.waiting = true;
    t.passenger.timer = 0;
    G.taxiActive = null;
    return;
  }
  if (t.timer <= 0 || !p.inCar) {
    toast(G, 'Fare lost.', 2);
    t.passenger.waiting = true;
    G.taxiActive = null;
  }
}

/** Collect a hidden package by walking over it. */
export function updatePackages(G) {
  const p = G.player;
  if (p.inCar) return;
  for (let i = 0; i < G.city.packageSpots.length; i += 1) {
    if (G.packageTaken[i]) continue;
    const s = G.city.packageSpots[i];
    if (dist(p.x, p.y, s.x, s.y) < 36) {
      G.packageTaken[i] = true;
      G.packagesFound += 1;
      p.cash += 100;
      G.stats.cashEarned += 100;
      toast(G, 'Package found! +$100 (' + G.packagesFound + '/10)', 2.5);
      sfx.cash();
    }
  }
}
