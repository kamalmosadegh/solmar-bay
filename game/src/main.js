// Solmar Bay — boot and the one game loop. Input is read every frame, the
// world advances in fixed steps, and render.js paints what is there.
// Screens: title, play, pause, busted, wasted, complete.
//
// ?shot=chase|drive|street|start stages that scene for screenshots.
import { createGame, resetRun, toast, clockText } from './state.js';
import { createInput, wasPressed, endFrame } from './input.js';
import { populateStreets, maintainTraffic, updateTraffic, nearestStealableCar, stealCar, exitCar, makeCar } from './traffic.js';
import { addWanted, maintainPolice, updatePolice, bustPlayer, wastePlayer, respawn } from './police.js';
import { playerShoot, playerPunch, updateCombat } from './combat.js';
import { startMission, updateMissions, tryStartMission, tryTaxi, updateTaxi, updatePackages, MISSIONS } from './missions.js';
import { saveGame, loadSave, saveExists, applySave } from './save.js';
import { ensureAudio, setMuted, isMuted, sfx, setSiren, setEngine, startMusic } from './audio.js';
import { stageShot, autopilotDrive } from './shots.js';
import { render } from './render.js';
import { collideBuildings, solidAt, isOnRoad, WORLD_W, WORLD_H, WATER_Y, MARINA } from './city.js';
import { clamp, dist, angleDiff } from './util.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let W = 0, H = 0;

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W;
  canvas.height = H;
}
window.addEventListener('resize', resize);
resize();

const input = createInput(canvas);
const G = createGame(1337);
G.hasSave = saveExists();
populateStreets(G);

// Debug hook for screenshots and play-testing: stage a real scene.
window.__stage = (name) => stageShot(name, G);
window.__game = G;

// Stage a screenshot scene straight from the URL, if asked.
const params = new URLSearchParams(location.search);
const shotParam = params.get('shot');
if (shotParam) {
  stageShot(shotParam, G);
  ensureAudio();
}

let last = performance.now();
let savedMissions = 0;

function startGame() {
  ensureAudio();
  startMusic();
  if (G.hasSave && !G.saveApplied) {
    const data = loadSave();
    if (data) {
      applySave(G, data);
      G.saveApplied = true;
      toast(G, 'Welcome back, Marco. The city missed you.', 3);
    }
  }
  G.screen = 'play';
  sfx.click();
}

function updateTitle(dt) {
  const confirm = wasPressed(input, 'confirm');
  const b = G.titleButton;
  const clicked = input.mouseClicked && b &&
    input.mouseX >= b.x && input.mouseX <= b.x + b.w &&
    input.mouseY >= b.y && input.mouseY <= b.y + b.h;
  if (confirm || clicked) startGame();
}

function updatePlay(dt) {
  const p = G.player;
  G.time += dt;
  G.clock += dt * 40; // one in-game hour per 90 real seconds
  if (G.messageTimer > 0) G.messageTimer -= dt;

  // --- Global keys ---
  if (wasPressed(input, 'pause')) {
    G.screen = 'pause';
    saveGame(G);
    return;
  }
  if (wasPressed(input, 'mute')) {
    setMuted(!isMuted());
    toast(G, isMuted() ? 'Sound muted' : 'Sound on', 1.5);
  }

  // --- Screenshot autopilot ---
  if (G.autopilot) autopilotDrive(G, input);

  // --- Player ---
  if (p.inCar) updateDriving(G, dt);
  else updateOnFoot(G, dt);

  // --- World systems ---
  maintainTraffic(G);
  updateTraffic(G, dt);
  maintainPolice(G);
  updatePolice(G, dt);
  updateCombat(G, dt);
  updateMissions(G, dt);
  updateTaxi(G, dt);
  updatePackages(G);
  updateParticles(G, dt);

  // Bust timer cools when no cop is close.
  let nearestCop = Infinity;
  for (const c of G.cops) {
    const cx = c.kind === 'car' ? c.car.x : c.x;
    const cy = c.kind === 'car' ? c.car.y : c.y;
    nearestCop = Math.min(nearestCop, dist(cx, cy, p.x, p.y));
  }
  if (nearestCop > 90) G.bustTimer = Math.max(0, G.bustTimer - dt * 2);

  // --- Camera ---
  const tx = p.inCar ? p.inCar.x : p.x;
  const ty = p.inCar ? p.inCar.y : p.y;
  G.camera.x += (tx - G.camera.x) * Math.min(1, dt * 5);
  G.camera.y += (ty - G.camera.y) * Math.min(1, dt * 5);
  G.camera.shake = Math.max(0, G.camera.shake - dt * 22);

  // --- Audio ---
  setSiren(G.wanted > 0 && G.screen === 'play');
  setEngine(p.inCar ? Math.abs(p.inCar.speed) / 520 : 0, !!p.inCar);

  // --- Death ---
  if (p.dead || p.hp <= 0) {
    p.hp = 0;
    wastePlayer(G);
    return;
  }

  // --- Autosave after each mission ---
  if (G.stats.missionsDone > savedMissions) {
    savedMissions = G.stats.missionsDone;
    saveGame(G);
  }
}

function updateOnFoot(G, dt) {
  const p = G.player;
  const ix = (input.keys.has('right') ? 1 : 0) - (input.keys.has('left') ? 1 : 0);
  const iy = (input.keys.has('down') ? 1 : 0) - (input.keys.has('up') ? 1 : 0);
  const sprint = input.keys.has('sprint');
  const speed = sprint ? 330 : 210;
  p.sprinting = sprint && (ix !== 0 || iy !== 0);
  if (ix !== 0 || iy !== 0) {
    const len = Math.hypot(ix, iy);
    const nx = p.x + (ix / len) * speed * dt;
    const ny = p.y + (iy / len) * speed * dt;
    moveWithCollision(G, p, nx - p.x, ny - p.y, 14);
    p.angle = Math.atan2(iy, ix);
    if (sprint && G.rng() < dt * 8) {
      G.particles.push({ kind: 'dust', x: p.x, y: p.y + 10, vx: (G.rng() - 0.5) * 40, vy: 20, life: 0.4, maxLife: 0.4, size: 4, color: '#cbb98a' });
    }
  }
  // Aim at the mouse (screen space -> world space, through the camera zoom).
  const z = G.camera.zoom || 1;
  const wx = G.camera.x + (input.mouseX - W / 2) / z;
  const wy = G.camera.y + (input.mouseY - H / 2) / z;
  if (input.mouseDown) {
    p.angle = Math.atan2(wy - p.y, wx - p.x);
    G.aiming = true;
    playerShoot(G, wx, wy);
  } else {
    G.aiming = false;
  }
  if (wasPressed(input, 'punch')) playerPunch(G, wx, wy);

  // Enter / exit a car.
  if (wasPressed(input, 'enter')) {
    const car = nearestStealableCar(G, p.x, p.y, 76);
    if (car) {
      stealCar(G, car);
      addWanted(G, 1, 'Car stolen');
      sfx.door();
      toast(G, 'Nice wheels. The owner won\'t miss it. Probably.', 2.5);
    }
  }
  // Space: start a mission, or hail a taxi job when driving (handled in car).
  if (wasPressed(input, 'action')) {
    if (!tryStartMission(G)) {
      // No mission to start: nothing on foot.
    }
  }
}

/** Move a circle, axis by axis, refusing to enter solid ground or water. */
function moveWithCollision(G, pos, dx, dy, r) {
  const tryX = { x: pos.x + dx, y: pos.y };
  if (!hitsSolid(G, tryX.x, tryX.y, r)) pos.x = tryX.x;
  const tryY = { x: pos.x, y: pos.y + dy };
  if (!hitsSolid(G, tryY.x, tryY.y, r)) pos.y = tryY.y;
}

function hitsSolid(G, x, y, r) {
  if (x < 24 + r || y < 24 + r || x > WORLD_W - 24 - r || y > WORLD_H - 24 - r) return true;
  if (y + r >= WATER_Y) return true;
  if (x + r >= MARINA.x && x - r <= MARINA.x + MARINA.w && y + r >= MARINA.y && y - r <= MARINA.y + MARINA.h) return true;
  const probe = { x, y };
  return collideBuildings(G.city, probe, r) && (probe.x !== x || probe.y !== y);
}

function updateDriving(G, dt) {
  const p = G.player;
  const car = p.inCar;
  const up = input.keys.has('up');
  const down = input.keys.has('down');
  const left = input.keys.has('left');
  const right = input.keys.has('right');
  const handbrake = input.keys.has('sprint');

  const onRoad = isOnRoad(car.x, car.y);
  const topSpeed = onRoad ? 520 : 300;
  if (up) car.speed += 420 * dt;
  if (down) car.speed -= car.speed > 20 ? 620 * dt : 260 * dt;
  if (!up && !down) car.speed -= Math.sign(car.speed) * 160 * dt;
  if (handbrake) car.speed -= Math.sign(car.speed) * 500 * dt;
  car.speed = clamp(car.speed, -150, topSpeed);

  const steer = (right ? 1 : 0) - (left ? 1 : 0);
  const grip = handbrake ? 0.45 : 1;
  if (Math.abs(car.speed) > 12) {
    car.angle += steer * dt * 2.1 * clamp(Math.abs(car.speed) / 200, 0.3, 1) * Math.sign(car.speed) * grip;
  }
  const prevX = car.x, prevY = car.y;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  G.stats.distanceDriven += Math.abs(car.speed) * dt;

  // Skid marks + dust on hard turns and handbrake.
  if ((handbrake && Math.abs(car.speed) > 120) || (Math.abs(steer) > 0 && Math.abs(car.speed) > 380)) {
    const bx = car.x - Math.cos(car.angle) * 26;
    const by = car.y - Math.sin(car.angle) * 26;
    G.skids.push({ x1: bx, y1: by, x2: bx + Math.cos(car.angle + Math.PI / 2) * 6, y2: by + Math.sin(car.angle + Math.PI / 2) * 6, life: 6 });
    if (G.skids.length > 220) G.skids.splice(0, G.skids.length - 220);
    if (G.rng() < dt * 20) {
      G.particles.push({ kind: 'dust', x: bx, y: by, vx: (G.rng() - 0.5) * 60, vy: (G.rng() - 0.5) * 60, life: 0.5, maxLife: 0.5, size: 6, color: '#b8b0a0' });
    }
    if (G.rng() < dt * 2) sfx.skid();
  }

  // Buildings: bounce off, lose speed, shake.
  const probe = { x: car.x, y: car.y };
  if (collideBuildings(G.city, probe, 20)) {
    car.x = probe.x; car.y = probe.y;
    if (Math.abs(car.speed) > 120) {
      G.camera.shake = Math.max(G.camera.shake, 7);
      sfx.crash();
      addWanted(G, 0.2, 'Reckless driving');
    }
    car.speed *= 0.45;
  }
  // Water and marina are not drivable.
  if (car.y >= WATER_Y - 10 || (car.x >= MARINA.x - 10 && car.y >= MARINA.y - 10 && car.y <= MARINA.y + MARINA.h + 10)) {
    car.x = prevX; car.y = prevY;
    car.speed *= -0.3;
  }
  if (car.x < 40 || car.x > WORLD_W - 40 || car.y < 40 || car.y > WORLD_H - 40) {
    car.x = clamp(car.x, 40, WORLD_W - 40);
    car.y = clamp(car.y, 40, WORLD_H - 40);
    car.speed *= 0.5;
  }

  // Traffic cars: shove each other, crash when fast.
  for (const other of G.cars) {
    const d = dist(car.x, car.y, other.x, other.y);
    if (d < 58 && d > 0.01) {
      const push = (58 - d) / 2;
      const nx = (other.x - car.x) / d, ny = (other.y - car.y) / d;
      other.x += nx * push; other.y += ny * push;
      car.x -= nx * push * 0.5; car.y -= ny * push * 0.5;
      if (Math.abs(car.speed) > 150) {
        G.camera.shake = Math.max(G.camera.shake, 6);
        sfx.crash();
        other.speed = Math.max(0, other.speed - 60);
        car.speed *= 0.7;
      }
    }
  }
  // Pedestrians in the way: a hit is a crime, a slow nudge is not.
  for (const ped of G.peds) {
    if (ped.dead) continue;
    const d = dist(car.x, car.y, ped.x, ped.y);
    if (d < 34) {
      if (Math.abs(car.speed) > 90) {
        ped.dead = true; ped.downTimer = 6;
        addWanted(G, 1, 'Pedestrian hit');
        G.camera.shake = Math.max(G.camera.shake, 5);
        sfx.hit();
        for (let i = 0; i < 6; i += 1) {
          G.particles.push({ kind: 'hit', x: ped.x, y: ped.y, vx: (G.rng() - 0.5) * 120, vy: (G.rng() - 0.5) * 120, life: 0.4, maxLife: 0.4, size: 5, color: '#ff5a4d' });
        }
      } else {
        ped.x += (ped.x - car.x) * 0.1 + 2;
        ped.fleeing = 2;
      }
    }
  }

  p.x = car.x; p.y = car.y; p.angle = car.angle;

  // Exit the car.
  if (wasPressed(input, 'enter')) {
    exitCar(G);
    sfx.door();
  }
  // Space: taxi fare while driving.
  if (wasPressed(input, 'action')) {
    if (!tryTaxi(G)) tryStartMission(G);
  }
}

function updateParticles(G, dt) {
  for (let i = G.particles.length - 1; i >= 0; i -= 1) {
    const pt = G.particles[i];
    pt.life -= dt;
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    if (pt.life <= 0) G.particles.splice(i, 1);
  }
  for (let i = G.skids.length - 1; i >= 0; i -= 1) {
    G.skids[i].life -= dt;
    if (G.skids[i].life <= 0) G.skids.splice(i, 1);
  }
}

function updateOtherScreens(dt) {
  if (G.screen === 'pause') {
    if (wasPressed(input, 'pause') || wasPressed(input, 'confirm')) {
      G.screen = 'play';
      sfx.click();
    }
    if (wasPressed(input, 'mute')) setMuted(!isMuted());
    return;
  }
  if (G.screen === 'busted' || G.screen === 'wasted') {
    if (wasPressed(input, 'confirm')) {
      respawn(G);
      sfx.click();
    }
    return;
  }
  if (G.screen === 'complete') {
    if (wasPressed(input, 'confirm')) {
      G.screen = 'play';
      sfx.click();
    }
  }
}

function frame(now) {
  const dt = clamp((now - last) / 1000, 0, 0.05);
  last = now;
  try {
    if (G.screen === 'title') updateTitle(dt);
    else if (G.screen === 'play') updatePlay(dt);
    else updateOtherScreens(dt);
  } catch (err) {
    // A single bad frame must never freeze the game: log it and keep going.
    console.error('frame error:', err);
  }
  render(ctx, G, W, H);
  endFrame(input);
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
