// Traffic, parked cars and pedestrians. Traffic cars cruise the road grid
// and turn at intersections; pedestrians stroll the sidewalks and flee from
// gunfire. Parked cars sit at the kerb waiting to be stolen.
import { CAR_COLORS, PED_SHIRTS } from './state.js';
import { sfx } from './audio.js';
import { ROADS_X, ROADS_Y, WORLD_W, WORLD_H, isOnRoad, isOnSidewalk, randomRoadPoint, randomSidewalkPoint, snapToRoad } from './city.js';
import { angleDiff, clamp, dist, mulberry32, pick, range } from './util.js';

const TRAFFIC_TARGET = 14;
const PED_TARGET = 22;

export function makeCar(x, y, angle, color, kind = 'traffic') {
  return {
    x, y, angle, speed: 0, color,
    kind, // 'traffic' | 'parked' | 'player' | 'police'
    length: 64, width: 30,
    targetSpeed: 0,
    driver: null,      // a ped object when a traffic car has a driver
    honkTimer: 0,
    stuckTimer: 0,
  };
}

export function makePed(x, y, rng) {
  return {
    x, y, angle: rng() * Math.PI * 2,
    speed: range(rng, 45, 75),
    shirt: pick(rng, PED_SHIRTS),
    skin: pick(rng, ['#e8b98a', '#c98d5f', '#8a5a3b', '#f0c8a0']),
    walking: rng(),
    fleeing: 0,
    dead: false,
    downTimer: 0,
    axis: rng() < 0.5 ? 'v' : 'h',
    dir: rng() < 0.5 ? 1 : -1,
    waitTimer: 0,
  };
}

/** Fill the streets with traffic, parked cars and pedestrians. */
export function populateStreets(G) {
  const rng = G.rng;
  G.cars = [];
  G.parked = [];
  G.peds = [];
  for (let i = 0; i < TRAFFIC_TARGET; i += 1) G.cars.push(spawnTrafficCar(G, true));
  for (let i = 0; i < 12; i += 1) G.parked.push(spawnParkedCar(G));
  for (let i = 0; i < PED_TARGET; i += 1) {
    const p = randomSidewalkPoint(rng);
    G.peds.push(makePed(p.x, p.y, rng));
  }
  // A few taxi customers wait at kerbs around town.
  G.passengers = [];
  for (let i = 0; i < 4; i += 1) {
    const p = randomSidewalkPoint(rng);
    G.passengers.push({ x: p.x, y: p.y, waiting: true, timer: 0, fare: 0 });
  }
}

function spawnTrafficCar(G, anywhere) {
  const rng = G.rng;
  const p = randomRoadPoint(rng);
  const angle = p.axis === 'v' ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI);
  const car = makeCar(p.x, p.y, angle, pick(rng, CAR_COLORS));
  car.speed = range(rng, 110, 170);
  car.targetSpeed = car.speed;
  car.axis = p.axis;
  car.road = p.road;
  return car;
}

function spawnParkedCar(G) {
  const rng = G.rng;
  const p = randomRoadPoint(rng);
  // Parked cars hug the kerb: offset to the road edge, parallel to the road.
  const angle = p.axis === 'v' ? (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) : (rng() < 0.5 ? 0 : Math.PI);
  const off = (rng() < 0.5 ? -1 : 1) * 38;
  const x = p.axis === 'v' ? p.x + off : p.x;
  const y = p.axis === 'v' ? p.y : p.y + off;
  const car = makeCar(x, y, angle, pick(rng, CAR_COLORS), 'parked');
  car.axis = p.axis;
  return car;
}

/** Keep the streets busy: replace cars that drove too far from the player. */
export function maintainTraffic(G) {
  const p = G.player;
  for (let i = G.cars.length - 1; i >= 0; i -= 1) {
    if (dist(G.cars[i].x, G.cars[i].y, p.x, p.y) > 1600) {
      G.cars.splice(i, 1);
      G.cars.push(spawnTrafficCar(G, true));
    }
  }
  while (G.cars.length < TRAFFIC_TARGET) G.cars.push(spawnTrafficCar(G, true));
  for (let i = G.peds.length - 1; i >= 0; i -= 1) {
    if (G.peds[i].dead && G.peds[i].downTimer <= 0) G.peds.splice(i, 1);
    else if (!G.peds[i].dead && dist(G.peds[i].x, G.peds[i].y, p.x, p.y) > 1500) {
      const spot = randomSidewalkPoint(G.rng);
      G.peds[i].x = spot.x; G.peds[i].y = spot.y;
    }
  }
  while (G.peds.length < PED_TARGET) {
    const spot = randomSidewalkPoint(G.rng);
    G.peds.push(makePed(spot.x, spot.y, G.rng));
  }
}

/** Drive one traffic car along its road, turning at intersections. */
function updateTrafficCar(G, car, dt) {
  const ahead = car.speed * dt;
  const nx = car.x + Math.cos(car.angle) * ahead;
  const ny = car.y + Math.sin(car.angle) * ahead;
  // Slow down for a car right ahead.
  let slow = false;
  for (const other of G.cars) {
    if (other === car) continue;
    const dx = other.x - car.x, dy = other.y - car.y;
    const along = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
    if (along > 0 && along < 90 && side < 26) { slow = true; break; }
  }
  const playerCar = G.player.inCar;
  if (playerCar && playerCar !== car) {
    const dx = playerCar.x - car.x, dy = playerCar.y - car.y;
    const along = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
    if (along > 0 && along < 100 && side < 30) slow = true;
  }
  car.speed = clamp(car.speed + ((slow ? 0 : car.targetSpeed) - car.speed) * dt * 1.5, 0, 200);
  car.honkTimer -= dt;
  if (slow && car.honkTimer <= 0) {
    car.honkTimer = 2.5 + G.rng() * 2;
    // Only honk when the player is close enough to hear it.
    if (dist(car.x, car.y, G.player.x, G.player.y) < 500) sfx.horn();
  }
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;

  // At an intersection, sometimes turn onto the crossing road.
  const snap = snapToRoad(car.x, car.y);
  const nearCentre = car.axis === 'v'
    ? Math.abs(car.y - snap.y) < 30
    : Math.abs(car.x - snap.x) < 30;
  if (nearCentre && G.rng() < dt * 0.5) {
    const turn = G.rng();
    if (turn < 0.3) {
      // Turn left or right onto the crossing road.
      const dir = G.rng() < 0.5 ? 1 : -1;
      if (car.axis === 'v') {
        car.axis = 'h';
        car.angle = dir > 0 ? 0 : Math.PI;
        car.y = snap.y + dir * 0; // keep lane
        car.x = clamp(car.x, 200, WORLD_W - 200);
      } else {
        car.axis = 'v';
        car.angle = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        car.x = snap.x;
      }
    }
  }
  // Stay inside the drivable grid; wrap around the far edge.
  if (car.x < 140) { car.x = 140; car.angle = 0; car.axis = 'h'; }
  if (car.x > WORLD_W - 140) { car.x = WORLD_W - 140; car.angle = Math.PI; car.axis = 'h'; }
  if (car.y < 140) { car.y = 140; car.angle = Math.PI / 2; car.axis = 'v'; }
  if (car.y > 3100) { car.y = 3100; car.angle = -Math.PI / 2; car.axis = 'v'; }
  void nx; void ny;
}

export function updateTraffic(G, dt) {
  for (const car of G.cars) updateTrafficCar(G, car, dt);
  for (const ped of G.peds) updatePed(G, ped, dt);
  for (const pas of G.passengers) {
    if (!pas.waiting) continue;
    pas.timer += dt;
    if (pas.timer > 45) {
      // Customer gives up and a new one appears elsewhere.
      const spot = randomSidewalkPoint(G.rng);
      pas.x = spot.x; pas.y = spot.y; pas.timer = 0;
    }
  }
}

function updatePed(G, ped, dt) {
  if (ped.dead) { ped.downTimer -= dt; return; }
  if (ped.waitTimer > 0) { ped.waitTimer -= dt; return; }
  let speed = ped.speed;
  if (ped.fleeing > 0) {
    ped.fleeing -= dt;
    speed = 190;
    // Run away from the player.
    ped.angle = Math.atan2(ped.y - G.player.y, ped.x - G.player.x);
  } else {
    // Stroll along the sidewalk; turn at intersections.
    const snap = snapToRoad(ped.x, ped.y);
    const onCross = ped.axis === 'v'
      ? Math.abs(ped.y - snap.y) < 40
      : Math.abs(ped.x - snap.x) < 40;
    if (onCross && G.rng() < dt * 0.4) {
      ped.axis = ped.axis === 'v' ? 'h' : 'v';
      ped.dir = G.rng() < 0.5 ? 1 : -1;
    }
    ped.angle = ped.axis === 'v' ? (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (ped.dir > 0 ? 0 : Math.PI);
  }
  ped.x += Math.cos(ped.angle) * speed * dt;
  ped.y += Math.sin(ped.angle) * speed * dt;
  ped.walking += dt * speed * 0.05;
  // Keep pedestrians on the pavements, not inside buildings or the sea.
  if (!isOnSidewalk(ped.x, ped.y) && !isOnRoad(ped.x, ped.y)) {
    const s = snapToRoad(ped.x, ped.y);
    ped.x = s.axis === 'v' ? s.x + (ped.dir > 0 ? 62 : -62) : ped.x;
    ped.y = s.axis === 'h' ? s.y + (ped.dir > 0 ? 62 : -62) : ped.y;
    ped.dir *= -1;
  }
  if (ped.x < 150 || ped.x > WORLD_W - 150 || ped.y < 150 || ped.y > 3150) ped.dir *= -1;
}

/** The nearest stealable car (parked or traffic) within range. */
export function nearestStealableCar(G, x, y, maxD = 70) {
  let best = null;
  let bestD = maxD;
  for (const car of G.parked) {
    const d = dist(x, y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  for (const car of G.cars) {
    const d = dist(x, y, car.x, car.y);
    if (d < bestD) { bestD = d; best = car; }
  }
  return best;
}

/** The player steals a car: parked cars are free, traffic drivers bail out. */
export function stealCar(G, car) {
  const p = G.player;
  if (car.kind === 'traffic') {
    // The driver jumps out and runs away screaming.
    const driver = makePed(car.x + 40, car.y, G.rng);
    driver.fleeing = 4;
    G.peds.push(driver);
    const idx = G.cars.indexOf(car);
    if (idx >= 0) G.cars.splice(idx, 1);
  } else {
    const idx = G.parked.indexOf(car);
    if (idx >= 0) G.parked.splice(idx, 1);
  }
  car.kind = 'player';
  car.speed = 0;
  car.targetSpeed = 0;
  p.inCar = car;
  p.x = car.x; p.y = car.y; p.angle = car.angle;
  G.stats.carsStolen += 1;
  return car;
}

/** The player steps out of their car, leaving it parked where it stops. */
export function exitCar(G) {
  const p = G.player;
  const car = p.inCar;
  if (!car) return;
  car.kind = 'parked';
  car.speed = 0;
  G.parked.push(car);
  const side = Math.cos(car.angle + Math.PI / 2);
  const sideY = Math.sin(car.angle + Math.PI / 2);
  p.x = car.x + side * 42;
  p.y = car.y + sideY * 42;
  p.inCar = null;
}
