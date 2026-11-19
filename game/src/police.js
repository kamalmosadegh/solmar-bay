// The wanted system: crimes raise the heat, police cars and foot cops spawn
// in proportion to the stars, chase the player, and arrest or ram them.
// Escape their sight and the heat cools off.
import { makeCar } from './traffic.js';
import { clamp, dist, mulberry32 } from './util.js';
import { randomRoadPoint, snapToRoad, collideBuildings } from './city.js';
import { sfx } from './audio.js';
import { toast } from './state.js';

export const WANTED_MAX = 5;

/** Raise the wanted level by `stars` (fractional is fine) and mark the heat. */
export function addWanted(G, stars, reason) {
  const before = Math.ceil(G.wanted);
  G.wanted = clamp(G.wanted + stars, 0, WANTED_MAX);
  G.wantedHeat = 0;
  const now = Math.ceil(G.wanted);
  if (now > before) {
    toast(G, reason + ' — Wanted level ' + now + '★', 3);
    sfx.arrest();
  }
}

/** How many police units the current stars call for. */
function wantedUnits(stars) {
  if (stars <= 0) return { cars: 0, foot: 0 };
  if (stars < 2) return { cars: 1, foot: 1 };
  if (stars < 3) return { cars: 2, foot: 2 };
  if (stars < 4) return { cars: 3, foot: 3 };
  if (stars < 5) return { cars: 4, foot: 4 };
  return { cars: 6, foot: 5 };
}

function spawnPoliceCar(G) {
  const p = G.player;
  // Spawn on a road 500-800 away from the player, out of immediate sight.
  let spot = randomRoadPoint(G.rng);
  for (let tries = 0; tries < 8; tries += 1) {
    spot = randomRoadPoint(G.rng);
    const d = dist(spot.x, spot.y, p.x, p.y);
    if (d > 450 && d < 900) break;
  }
  const car = makeCar(spot.x, spot.y, Math.atan2(p.y - spot.y, p.x - spot.x), '#1c2733', 'police');
  car.speed = 200;
  car.targetSpeed = 260;
  car.siren = true;
  G.cops.push({ kind: 'car', car, stuck: 0 });
}

function spawnFootCop(G) {
  const p = G.player;
  const angle = G.rng() * Math.PI * 2;
  const d = 380 + G.rng() * 250;
  const x = clamp(p.x + Math.cos(angle) * d, 100, 4700);
  const y = clamp(p.y + Math.sin(angle) * d, 100, 3100);
  G.cops.push({
    kind: 'foot', x, y, angle: Math.atan2(p.y - y, p.x - x),
    speed: 0, hp: 100, arrest: 0,
  });
}

/** Keep the police presence matched to the wanted level. */
export function maintainPolice(G) {
  const want = wantedUnits(Math.ceil(G.wanted));
  let cars = 0, foot = 0;
  for (const c of G.cops) { if (c.kind === 'car') cars += 1; else foot += 1; }
  if (cars < want.cars) spawnPoliceCar(G);
  if (foot < want.foot) spawnFootCop(G);
  // Cops give up and drive off once the heat is gone.
  if (G.wanted <= 0) {
    for (let i = G.cops.length - 1; i >= 0; i -= 1) {
      if (dist(G.cops[i].x ?? G.cops[i].car.x, G.cops[i].y ?? G.cops[i].car.y, G.player.x, G.player.y) > 1200) {
        G.cops.splice(i, 1);
      }
    }
  }
}

export function updatePolice(G, dt) {
  const p = G.player;
  // Heat cools when the player stays clean and unseen.
  if (G.wanted > 0) {
    G.wantedHeat += dt;
    let nearestCop = Infinity;
    for (const c of G.cops) {
      const cx = c.kind === 'car' ? c.car.x : c.x;
      const cy = c.kind === 'car' ? c.car.y : c.y;
      nearestCop = Math.min(nearestCop, dist(cx, cy, p.x, p.y));
    }
    if (G.wantedHeat > 14 && nearestCop > 700) {
      G.wanted = Math.max(0, G.wanted - dt * 0.25);
      if (G.wanted === 0) toast(G, 'You lost the cops.', 2.5);
    }
  }

  // Iterate a snapshot: bustPlayer() clears G.cops mid-chase, and the loop
  // must not read past the new array's end once that happens.
  const cops = G.cops.slice();
  for (const cop of cops) {
    if (G.screen !== 'play') break;
    if (cop.kind === 'car') updatePoliceCar(G, cop, dt);
    else updateFootCop(G, cop, dt);
  }
}

function updatePoliceCar(G, cop, dt) {
  const car = cop.car;
  const p = G.player;
  const targetX = p.inCar ? p.inCar.x : p.x;
  const targetY = p.inCar ? p.inCar.y : p.y;
  const d = dist(car.x, car.y, targetX, targetY);
  const wantAngle = Math.atan2(targetY - car.y, targetX - car.x);
  // Police steer toward the player but follow roads when far away.
  let steer = wantAngle;
  if (d > 500) {
    const snap = snapToRoad(car.x, car.y);
    const roadAngle = car.axis === 'v' ? (targetY > car.y ? Math.PI / 2 : -Math.PI / 2) : (targetX > car.x ? 0 : Math.PI);
    void snap;
    steer = roadAngle;
  }
  let diff = steer - car.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  car.angle += clamp(diff, -2.2 * dt, 2.2 * dt);
  const top = d < 300 ? 300 : 260;
  car.speed = clamp(car.speed + (top - car.speed) * dt, 0, 340);
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  // Police bounce off buildings instead of driving through them.
  const hit = G.city.buildings.some((b) =>
    nx > b.x - 20 && nx < b.x + b.w + 20 && ny > b.y - 20 && ny < b.y + b.h + 20);
  if (hit) {
    car.angle += Math.PI * 0.5 * dt * 8;
    car.speed *= 0.6;
  } else {
    car.x = nx; car.y = ny;
  }
  // Ram the player's car: damage + shake.
  const pc = p.inCar;
  if (pc && d < 70) {
    pc.speed *= 0.85;
    car.speed *= 0.8;
    G.camera.shake = Math.max(G.camera.shake, 6);
    sfx.crash();
    if (G.rng() < dt * 2) p.hp = Math.max(1, p.hp - 2);
  }
  // A police car that touches the player on foot arrests them.
  if (!pc && d < 46) {
    G.bustTimer += dt;
    if (G.bustTimer > 1.2) bustPlayer(G);
  }
}

function updateFootCop(G, cop, dt) {
  const p = G.player;
  const d = dist(cop.x, cop.y, p.x, p.y);
  cop.angle = Math.atan2(p.y - cop.y, p.x - cop.x);
  const speed = p.inCar ? 0 : 210;
  if (d > 40) {
    cop.x += Math.cos(cop.angle) * speed * dt;
    cop.y += Math.sin(cop.angle) * speed * dt;
    // Foot cops run around buildings, not through them.
    const probe = { x: cop.x, y: cop.y };
    collideBuildings(G.city, probe, 14);
    cop.x = probe.x; cop.y = probe.y;
  }
  if (!p.inCar && d < 40) {
    cop.arrest += dt;
    G.bustTimer += dt * 0.5;
    if (G.bustTimer > 1.2) bustPlayer(G);
  } else {
    cop.arrest = Math.max(0, cop.arrest - dt);
  }
  // Foot cops fade out when the player is far and the heat is gone.
  if (G.wanted <= 0 && d > 1100) {
    const idx = G.cops.indexOf(cop);
    if (idx >= 0) G.cops.splice(idx, 1);
  }
}

export function bustPlayer(G) {
  const p = G.player;
  if (G.screen !== 'play') return;
  const fine = Math.min(200, Math.floor(p.cash * 0.2));
  p.cash -= fine;
  if (p.inCar) {
    p.inCar.kind = 'parked';
    G.parked.push(p.inCar);
    p.inCar = null;
  }
  G.wanted = 0;
  G.cops = [];
  G.bustTimer = 0;
  G.respawnAt = 'policeStation';
  G.screen = 'busted';
  G.screenTimer = 0;
  sfx.fail();
  toast(G, 'Busted! Fine: $' + fine, 3);
}

export function wastePlayer(G) {
  const p = G.player;
  if (G.screen !== 'play') return;
  const bill = Math.min(150, Math.floor(p.cash * 0.15));
  p.cash -= bill;
  if (p.inCar) {
    p.inCar.kind = 'parked';
    G.parked.push(p.inCar);
    p.inCar = null;
  }
  p.hp = 100;
  G.wanted = Math.max(0, G.wanted - 1);
  G.cops = [];
  G.bustTimer = 0;
  G.respawnAt = 'hospital';
  G.screen = 'wasted';
  G.screenTimer = 0;
  sfx.fail();
  toast(G, 'Wasted! Hospital bill: $' + bill, 3);
}

/** Drop the player at the respawn landmark with full health. */
export function respawn(G) {
  const p = G.player;
  const spot = G.city.landmarks[G.respawnAt || 'hospital'];
  p.x = spot.x; p.y = spot.y;
  p.hp = p.maxHp;
  p.ammo = Math.max(p.ammo, 12);
  p.invulnerable = 2;
  p.dead = false;
  G.camera.x = p.x; G.camera.y = p.y;
  G.screen = 'play';
}
