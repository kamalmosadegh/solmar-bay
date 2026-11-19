// The whole game state in one factory: the player, every car, pedestrian,
// cop, bullet, particle and mission tracker. Systems in other files take this
// object and mutate it; main.js owns the loop that calls them in order.
import { buildCity } from './city.js';
import { mulberry32 } from './util.js';

export const CAR_COLORS = [
  '#c0392b', '#2980b9', '#f1c40f', '#ecf0f1', '#2c3e50', '#e67e22',
  '#8e44ad', '#1abc9c', '#95a5a6', '#d35400', '#7f8c8d', '#16a085',
];

export const PED_SHIRTS = [
  '#e74c3c', '#3498db', '#f39c12', '#2ecc71', '#9b59b6',
  '#e67e22', '#1abc9c', '#fd79a8', '#6c5ce7', '#00b894',
];

export function createGame(seed = 1337) {
  const rng = mulberry32(seed);
  const city = buildCity(seed);
  const start = city.landmarks.start;
  return {
    seed,
    rng,
    city,
    time: 0,               // seconds since the run started
    clock: 10 * 3600,      // in-game seconds since midnight (10:00 AM)
    screen: 'title',       // title | play | pause | busted | wasted | complete
    screenTimer: 0,
    muted: false,

    player: {
      x: start.x, y: start.y, angle: -Math.PI / 2,
      hp: 100, maxHp: 100,
      cash: 250, ammo: 24,
      inCar: null,         // the car object the player drives, or null
      speed: 0,
      sprinting: false,
      punchCooldown: 0,
      shootCooldown: 0,
      invulnerable: 0,
      dead: false,
    },

    cars: [],              // traffic cars (driven by the city)
    parked: [],            // parked cars (stealable)
    peds: [],              // pedestrians on sidewalks
    cops: [],              // police cars + foot cops chasing the player
    enemies: [],           // rival crew members (mission combat)
    bullets: [],           // player + enemy bullets
    particles: [],         // dust, muzzle flash, sparks, smoke
    skids: [],             // fading tyre marks
    pickups: [],           // ammo / health / cash on the ground
    passengers: [],        // taxi customers waiting on sidewalks

    wanted: 0,             // 0..5 stars (float; HUD rounds up)
    wantedHeat: 0,         // seconds since the last crime
    bustTimer: 0,          // seconds a cop has been close enough to arrest
    respawnAt: null,       // landmark key to respawn at after busted/wasted

    missionIndex: 0,       // which story mission is active
    mission: null,         // live mission runtime state (see missions.js)
    missionDone: [],       // ids of completed story missions
    packagesFound: 0,
    packageTaken: new Array(10).fill(false),
    taxiFares: 0,
    taxiActive: null,      // live taxi job {passenger, dest, timer}
    storyComplete: false,

    camera: { x: start.x, y: start.y, shake: 0, zoom: 1.25 },
    stats: {
      carsStolen: 0, shotsFired: 0, enemiesDown: 0,
      missionsDone: 0, cashEarned: 0, distanceDriven: 0,
    },
    message: null,         // {text, t} toast shown above the HUD
    messageTimer: 0,
    autopilot: false,      // screenshot staging drives the car for us
    shotName: null,
  };
}

/** Reset a run to the title screen without rebuilding the city. */
export function resetRun(G) {
  const fresh = createGame(G.seed);
  // Keep the same city object so the map never changes mid-session.
  fresh.city = G.city;
  const keep = { city: G.city, muted: G.muted };
  Object.assign(G, fresh, keep);
  G.screen = 'title';
}

/** Show a short toast message above the HUD. */
export function toast(G, text, seconds = 3) {
  G.message = text;
  G.messageTimer = seconds;
}

/** In-game clock as "HH:MM". */
export function clockText(G) {
  const total = Math.floor(G.clock / 60) % (24 * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

/** 0 = deep night, 1 = bright midday. Drives the lighting overlay. */
export function daylight(G) {
  const hour = (G.clock / 3600) % 24;
  // Dawn 6-8, dusk 18-20, night 21-5.
  if (hour < 5 || hour >= 21) return 0.15;
  if (hour < 7) return 0.15 + (hour - 5) * 0.35;
  if (hour < 17) return 1;
  if (hour < 20) return 1 - (hour - 17) * 0.28;
  return 0.16;
}

/** Headlights come on once the light drops below this. */
export function headlightsOn(G) {
  return daylight(G) < 0.55;
}
