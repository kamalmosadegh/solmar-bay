// Screenshot staging: ?shot=chase|drive|street|start sets the game up in a
// real gameplay state (real cars, real cops, a real mission running) and the
// normal game loop then plays it forward, so each screenshot is a genuine
// frame of the game — never a mock-up. main.js calls stageShot once at boot
// when the query param is present.
import { makeCar, stealCar } from './traffic.js';
import { startMission } from './missions.js';
import { addWanted, maintainPolice } from './police.js';
import { spawnEnemy } from './combat.js';

function putPlayerInCar(G, x, y, angle, color) {
  const car = makeCar(x, y, angle, color, 'player');
  car.speed = 240;
  car.targetSpeed = 0;
  G.player.inCar = car;
  G.player.x = x;
  G.player.y = y;
  G.player.angle = angle;
  G.camera.x = x;
  G.camera.y = y;
  return car;
}

function surroundWithTraffic(G, cx, cy) {
  // A few traffic cars on the same road, ahead and behind.
  for (let i = 0; i < 4; i += 1) {
    const off = -260 + i * 170;
    const car = makeCar(cx + off, cy + 24, 0, ['#c0392b', '#2980b9', '#f1c40f', '#8e44ad'][i], 'traffic');
    car.speed = 150;
    car.targetSpeed = 150;
    car.axis = 'h';
    G.cars.push(car);
  }
}

/**
 * Stage a named scene and return the screen to show. The loop keeps running
 * afterwards (with the autopilot driving when staged), so particles, sirens
 * and traffic keep moving until the screenshot is taken.
 */
export function stageShot(name, G) {
  G.shotName = name;
  if (name === 'start') {
    G.screen = 'title';
    return;
  }
  G.screen = 'play';
  const p = G.player;

  if (name === 'chase') {
    // Police chase: Marco in a red car tearing down the beach road, three
    // stars, police cars closing in behind, mission 5 (The Getaway) active.
    putPlayerInCar(G, 1800, 1824, 0, '#c0392b');
    surroundWithTraffic(G, 1800, 1824);
    G.wanted = 3;
    G.wantedHeat = 0;
    startMission(G, 4);
    // Force the mission to its escort step so the objective reads as a chase.
    G.mission.step = 1;
    G.mission.escortSpawned = true;
    // Two police cars right on the player's tail, lights flashing.
    const tail1 = makeCar(1560, 1824, 0, '#1c2733', 'police');
    tail1.speed = 320; tail1.targetSpeed = 320;
    G.cops.push({ kind: 'car', car: tail1, stuck: 0 });
    const tail2 = makeCar(1380, 1776, 0, '#1c2733', 'police');
    tail2.speed = 320; tail2.targetSpeed = 320;
    G.cops.push({ kind: 'car', car: tail2, stuck: 0 });
    maintainPolice(G);
    G.autopilot = true;
    G.clock = 18.5 * 3600; // dusk: headlights + long shadows
  } else if (name === 'drive') {
    // Cruising the beach promenade at golden hour, mission 1 active.
    putPlayerInCar(G, 1400, 3024, 0, '#2980b9');
    surroundWithTraffic(G, 1400, 3024);
    startMission(G, 0);
    G.mission.step = 1; // already stole the car: drive to the garage
    G.autopilot = true;
    G.clock = 17.5 * 3600;
  } else if (name === 'street') {
    // On foot near the docks with the turf-war mission active, traffic and
    // pedestrians around, a couple of rivals visible.
    p.x = 4100; p.y = 2800; p.angle = Math.PI / 2;
    p.ammo = 48;
    G.camera.x = p.x; G.camera.y = p.y;
    startMission(G, 3);
    G.mission.step = 1;
    G.mission.spawned = true;
    G.mission.killsAtStart = 0;
    spawnEnemy(G, 4180, 2850);
    spawnEnemy(G, 4140, 2900);
    spawnEnemy(G, 4220, 2790);
    G.clock = 11 * 3600;
  } else {
    // Unknown name: plain free roam.
    G.autopilot = false;
  }
  return G.screen;
}

/** Screenshot autopilot: hold the accelerator and steer along the road. */
export function autopilotDrive(G, input) {
  const car = G.player.inCar;
  if (!car) return;
  input.keys.add('up');
  // Steer gently toward the nearest road centreline so the car stays on asphalt.
  const roadY = Math.round((car.y - 200) / 400) * 400 + 200;
  const dy = roadY - car.y;
  if (Math.abs(dy) > 24) {
    car.angle += (dy > 0 ? 1 : -1) * 0.10 * 0.016;
  } else {
    // On the centreline: ease the heading back to straight east/west.
    const target = car.angle > Math.PI / 2 || car.angle < -Math.PI / 2 ? Math.PI : 0;
    car.angle += (target - car.angle) * 0.02;
  }
}
