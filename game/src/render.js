// Rendering: draws the whole city, cars, people, effects and lighting onto
// the canvas, plus the title, pause, busted, wasted and story-complete
// screens. Everything is drawn with Canvas 2D shapes — no images.
import { WORLD_W, WORLD_H, ROADS_X, ROADS_Y, BEACH_Y, WATER_Y, MARINA } from './city.js';
import { clamp } from './util.js';
import { daylight, headlightsOn } from './state.js';
import { missionMarker } from './missions.js';
import { drawHUD, roundRect } from './hud.js';

export function render(ctx, G, W, H) {
  ctx.clearRect(0, 0, W, H);
  if (G.screen === 'title') {
    drawTitle(ctx, G, W, H);
    return;
  }
  const cam = G.camera;
  const z = cam.zoom || 1;
  const shakeX = (Math.random() - 0.5) * cam.shake;
  const shakeY = (Math.random() - 0.5) * cam.shake;
  const ox = W / 2 - cam.x * z + shakeX;
  const oy = H / 2 - cam.y * z + shakeY;

  ctx.save();
  ctx.translate(ox, oy);
  ctx.scale(z, z);
  drawGround(ctx, G);
  drawRoads(ctx, G);
  drawParks(ctx, G);
  drawBuildings(ctx, G);
  drawMarina(ctx, G);
  drawSkids(ctx, G);
  drawPickups(ctx, G);
  drawParkedCars(ctx, G);
  drawTraffic(ctx, G);
  drawPeds(ctx, G);
  drawEnemies(ctx, G);
  drawCops(ctx, G);
  drawPlayer(ctx, G);
  drawBullets(ctx, G);
  drawParticles(ctx, G);
  drawMissionMarker(ctx, G);
  ctx.restore();

  drawLighting(ctx, G, W, H);
  if (G.screen === 'play' || G.screen === 'pause') drawHUD(ctx, G, W, H);
  if (G.screen === 'pause') drawPause(ctx, W, H);
  if (G.screen === 'busted') drawBusted(ctx, G, W, H, 'BUSTED', 'The cops hauled you in. Fine paid, heat gone.');
  if (G.screen === 'wasted') drawBusted(ctx, G, W, H, 'WASTED', 'You woke up at St. Marina Hospital, lighter in the wallet.');
  if (G.screen === 'complete') drawComplete(ctx, G, W, H);
}

function drawGround(ctx, G) {
  // Grass base.
  ctx.fillStyle = '#5d9a54';
  ctx.fillRect(-200, -200, WORLD_W + 400, WORLD_H + 400);
  // City blocks: pale pavement under the buildings.
  ctx.fillStyle = '#b9b3a4';
  ctx.fillRect(120, 120, WORLD_W - 240, 3060);
  // Beach sand.
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(-200, BEACH_Y, WORLD_W + 400, WORLD_H - BEACH_Y);
  // Sea with gentle wave lines.
  const grad = ctx.createLinearGradient(0, WATER_Y, 0, WORLD_H);
  grad.addColorStop(0, '#3f8fd2');
  grad.addColorStop(1, '#2a6cb0');
  ctx.fillStyle = grad;
  ctx.fillRect(-200, WATER_Y, WORLD_W + 400, WORLD_H - WATER_Y);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  for (let y = WATER_Y + 18; y < WORLD_H; y += 34) {
    ctx.beginPath();
    for (let x = 0; x <= WORLD_W; x += 90) {
      const yy = y + Math.sin(x * 0.01 + G.time * 0.8 + y) * 4;
      if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
    }
    ctx.stroke();
  }
  // Marina basin water.
  ctx.fillStyle = '#2f7fc0';
  ctx.fillRect(MARINA.x, MARINA.y, MARINA.w, MARINA.h);
}

function drawRoads(ctx, G) {
  ctx.fillStyle = '#3a3f46';
  for (const rx of ROADS_X) ctx.fillRect(rx - 48, 120, 96, 2960);
  for (const ry of ROADS_Y) ctx.fillRect(120, ry - 48, 4560, 96);
  // Sidewalks: light edging along every road.
  ctx.fillStyle = '#c9c4b6';
  for (const rx of ROADS_X) {
    ctx.fillRect(rx - 64, 120, 16, 2960);
    ctx.fillRect(rx + 48, 120, 16, 2960);
  }
  for (const ry of ROADS_Y) {
    ctx.fillRect(120, ry - 64, 4560, 16);
    ctx.fillRect(120, ry + 48, 4560, 16);
  }
  // Centre dashes.
  ctx.fillStyle = '#e8d44d';
  for (const rx of ROADS_X) {
    for (let y = 140; y < 3060; y += 70) ctx.fillRect(rx - 2, y, 4, 34);
  }
  for (const ry of ROADS_Y) {
    for (let x = 140; x < 4660; x += 70) ctx.fillRect(x, ry - 2, 34, 4);
  }
  // Beach promenade.
  ctx.fillStyle = '#c9b18a';
  ctx.fillRect(120, 3140, 4560, 40);
}

function drawParks(ctx, G) {
  for (const park of G.city.parks) {
    ctx.fillStyle = '#4c8a3f';
    ctx.fillRect(park.x, park.y, park.w, park.h);
    ctx.strokeStyle = '#3a6b32';
    ctx.lineWidth = 3;
    ctx.strokeRect(park.x, park.y, park.w, park.h);
  }
  for (const pond of G.city.ponds) {
    ctx.fillStyle = '#4a90c2';
    ctx.beginPath();
    ctx.ellipse(pond.x + pond.w / 2, pond.y + pond.h / 2, pond.w / 2, pond.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const t of G.city.trees) drawTree(ctx, t.x, t.y, t.r, t.shade);
  for (const p of G.city.palms) drawPalm(ctx, p.x, p.y, p.r);
}

function drawTree(ctx, x, y, r, shade) {
  ctx.fillStyle = '#6b4a2f';
  ctx.fillRect(x - 3, y - 2, 6, 12);
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.arc(x, y - 6, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - 6 - r * 0.3, r * 0.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawPalm(ctx, x, y, r) {
  ctx.strokeStyle = '#7a5a35';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(x, y + 10);
  ctx.quadraticCurveTo(x + 4, y, x + 2, y - 16);
  ctx.stroke();
  ctx.fillStyle = '#3f8a44';
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    ctx.beginPath();
    ctx.ellipse(x + 2 + Math.cos(a) * r, y - 16 + Math.sin(a) * r * 0.5, r * 0.9, 4, a, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawBuildings(ctx, G) {
  for (const b of G.city.buildings) {
    // Long afternoon shadow, cast to the south-east.
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(b.x + b.height * 0.4, b.y + b.height * 0.4, b.w, b.h);
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    // Roof inset + windows.
    ctx.fillStyle = b.roof;
    ctx.fillRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
    if (b.windows) {
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      const cols = Math.max(1, Math.floor(b.w / 34));
      const rows = Math.max(1, Math.floor(b.h / 34));
      for (let cx = 0; cx < cols; cx += 1) {
        for (let cy = 0; cy < rows; cy += 1) {
          ctx.fillRect(b.x + 16 + cx * 34, b.y + 16 + cy * 34, 12, 9);
        }
      }
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x, b.y, b.w, b.h);
  }
}

function drawMarina(ctx, G) {
  for (const pier of G.city.piers) {
    ctx.fillStyle = '#8a6f4d';
    ctx.fillRect(pier.x, pier.y, pier.w, pier.h);
    ctx.fillStyle = '#6b543a';
    for (let x = pier.x; x < pier.x + pier.w; x += 24) ctx.fillRect(x, pier.y, 3, pier.h);
  }
  for (const boat of G.city.boats) drawBoat(ctx, boat.x, boat.y, boat.angle, boat.color);
}

function drawBoat(ctx, x, y, angle, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(-26, 0);
  ctx.quadraticCurveTo(0, -14, 26, 0);
  ctx.quadraticCurveTo(0, 14, -26, 0);
  ctx.fill();
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.fillRect(-4, -6, 8, 12);
  ctx.restore();
}

function drawSkids(ctx, G) {
  ctx.strokeStyle = 'rgba(20,20,20,0.35)';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  for (const s of G.skids) {
    ctx.globalAlpha = clamp(s.life / 6, 0, 0.5);
    ctx.beginPath();
    ctx.moveTo(s.x1, s.y1);
    ctx.lineTo(s.x2, s.y2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function drawPickups(ctx, G) {
  for (const pk of G.pickups) {
    const bob = Math.sin(pk.t * 4) * 3;
    ctx.save();
    ctx.translate(pk.x, pk.y + bob);
    if (pk.kind === 'cash') {
      ctx.fillStyle = '#2ee06f';
      ctx.fillRect(-11, -7, 22, 14);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', 0, 4);
    } else if (pk.kind === 'ammo') {
      ctx.fillStyle = '#ffd94d';
      ctx.fillRect(-8, -8, 16, 16);
      ctx.fillStyle = '#222';
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('AMMO', 0, 4);
    } else {
      ctx.fillStyle = '#ff5a4d';
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(-2, -7, 4, 14);
      ctx.fillRect(-7, -2, 14, 4);
    }
    ctx.restore();
  }
  // Hidden packages glow green.
  for (let i = 0; i < G.city.packageSpots.length; i += 1) {
    if (G.packageTaken[i]) continue;
    const s = G.city.packageSpots[i];
    const glow = 0.5 + Math.sin(G.time * 4 + i) * 0.3;
    ctx.fillStyle = 'rgba(46,224,111,' + glow.toFixed(2) + ')';
    ctx.beginPath();
    ctx.arc(s.x, s.y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2ee06f';
    ctx.fillRect(s.x - 9, s.y - 7, 18, 14);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', s.x, s.y + 4);
  }
  ctx.textAlign = 'left';
}

function drawCarBody(ctx, G, car, isPolice) {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(-car.length / 2 + 4, -car.width / 2 + 5, car.length, car.width);
  // Body.
  ctx.fillStyle = car.color;
  roundRect(ctx, -car.length / 2, -car.width / 2, car.length, car.width, 8);
  ctx.fill();
  if (isPolice) {
    // Black doors on a white body.
    ctx.fillStyle = '#111';
    ctx.fillRect(-8, -car.width / 2, 22, car.width);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PD', 3, 3);
  }
  // Windshield + roof + rear window.
  ctx.fillStyle = 'rgba(20,30,40,0.85)';
  ctx.fillRect(10, -car.width / 2 + 4, 10, car.width - 8);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(-8, -car.width / 2 + 4, 18, car.width - 8);
  ctx.fillStyle = 'rgba(20,30,40,0.85)';
  ctx.fillRect(-26, -car.width / 2 + 4, 8, car.width - 8);
  // Wheels.
  ctx.fillStyle = '#111';
  ctx.fillRect(-22, -car.width / 2 - 3, 12, 6);
  ctx.fillRect(-22, car.width / 2 - 3, 12, 6);
  ctx.fillRect(14, -car.width / 2 - 3, 12, 6);
  ctx.fillRect(14, car.width / 2 - 3, 12, 6);
  // Headlights at dusk.
  if (headlightsOn(G)) {
    ctx.fillStyle = 'rgba(255,240,170,0.35)';
    ctx.beginPath();
    ctx.moveTo(car.length / 2, -8);
    ctx.lineTo(car.length / 2 + 90, -26);
    ctx.lineTo(car.length / 2 + 90, 26);
    ctx.lineTo(car.length / 2, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff8c0';
    ctx.fillRect(car.length / 2 - 2, -car.width / 2 + 2, 4, 6);
    ctx.fillRect(car.length / 2 - 2, car.width / 2 - 8, 4, 6);
  }
  ctx.restore();
  ctx.textAlign = 'left';
}

function drawParkedCars(ctx, G) {
  for (const car of G.parked) drawCarBody(ctx, G, car, false);
}

function drawTraffic(ctx, G) {
  for (const car of G.cars) drawCarBody(ctx, G, car, false);
}

function drawCops(ctx, G) {
  for (const c of G.cops) {
    if (c.kind === 'car') {
      drawCarBody(ctx, G, c.car, true);
      // Flashing light bar.
      const flash = Math.floor(G.time * 6) % 2 === 0;
      ctx.save();
      ctx.translate(c.car.x, c.car.y);
      ctx.rotate(c.car.angle);
      ctx.fillStyle = flash ? '#ff3b30' : '#2f7bff';
      ctx.fillRect(-6, -8, 12, 6);
      ctx.fillStyle = flash ? '#2f7bff' : '#ff3b30';
      ctx.fillRect(-6, 2, 12, 6);
      ctx.restore();
    } else {
      drawPerson(ctx, c.x, c.y, c.angle, '#1c2733', '#1c2733', '#e8b98a', true);
    }
  }
}

function drawPerson(ctx, x, y, angle, shirt, pants, skin, isCop) {
  ctx.save();
  ctx.translate(x, y);
  // Shadow.
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.beginPath();
  ctx.ellipse(2, 4, 13, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.rotate(angle);
  // Legs + body + head, top-down.
  ctx.fillStyle = pants;
  ctx.fillRect(-8, -7, 16, 6);
  ctx.fillRect(-8, 1, 16, 6);
  ctx.fillStyle = shirt;
  ctx.beginPath();
  ctx.arc(0, 0, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(3, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  if (isCop) {
    ctx.fillStyle = '#1c2733';
    ctx.beginPath();
    ctx.arc(3, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffd94d';
    ctx.font = 'bold 7px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PD', 3, 2);
  }
  ctx.restore();
  ctx.textAlign = 'left';
}

function drawPeds(ctx, G) {
  for (const ped of G.peds) {
    if (ped.dead) {
      ctx.save();
      ctx.translate(ped.x, ped.y);
      ctx.rotate(ped.angle + Math.PI / 2);
      ctx.fillStyle = ped.shirt;
      ctx.beginPath();
      ctx.ellipse(0, 0, 14, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      continue;
    }
    const bob = Math.sin(ped.walking * 6) * 2;
    drawPerson(ctx, ped.x, ped.y + bob * 0.3, ped.angle, ped.shirt, '#3a3f46', ped.skin, false);
  }
  // Taxi customers wave.
  for (const pas of G.passengers) {
    if (!pas.waiting) continue;
    const wave = Math.sin(G.time * 6) * 4;
    ctx.fillStyle = '#4dd2ff';
    ctx.beginPath();
    ctx.arc(pas.x, pas.y, 14, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', pas.x, pas.y - 20 + wave * 0.4);
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(pas.x, pas.y, 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.textAlign = 'left';
}

function drawEnemies(ctx, G) {
  for (const e of G.enemies) {
    drawPerson(ctx, e.x, e.y, e.angle, e.shirt, '#222', e.skin, false);
    // Health bar.
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(e.x - 16, e.y - 26, 32, 5);
    ctx.fillStyle = '#ff5a4d';
    ctx.fillRect(e.x - 16, e.y - 26, 32 * clamp(e.hp / e.maxHp, 0, 1), 5);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 9px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('VULTURE', e.x, e.y - 30);
  }
  ctx.textAlign = 'left';
}

function drawPlayer(ctx, G) {
  const p = G.player;
  if (p.inCar) {
    drawCarBody(ctx, G, p.inCar, false);
    return;
  }
  if (p.invulnerable > 0 && Math.floor(G.time * 8) % 2 === 0) return; // blink
  drawPerson(ctx, p.x, p.y, p.angle, '#14b8a6', '#1f2937', '#e8b98a', false);
  // The player wears a red cap — the one signature item.
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.fillStyle = '#c0392b';
  ctx.beginPath();
  ctx.arc(3, 0, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // Aim line while the mouse is held.
  if (G.aiming) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + Math.cos(p.angle) * 90, p.y + Math.sin(p.angle) * 90);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawBullets(ctx, G) {
  ctx.fillStyle = '#ffe08a';
  for (const b of G.bullets) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(Math.atan2(b.vy, b.vx));
    ctx.fillRect(-8, -2, 16, 4);
    ctx.restore();
  }
}

function drawParticles(ctx, G) {
  for (const pt of G.particles) {
    const f = clamp(pt.life / pt.maxLife, 0, 1);
    ctx.globalAlpha = f;
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size * f + 1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawMissionMarker(ctx, G) {
  const marker = missionMarker(G);
  if (!marker) return;
  const pulse = 1 + Math.sin(G.time * 5) * 0.15;
  ctx.save();
  ctx.translate(marker.x, marker.y);
  ctx.scale(pulse, pulse);
  ctx.strokeStyle = '#ffd94d';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, 34, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#ffd94d';
  ctx.beginPath();
  ctx.moveTo(0, -44);
  ctx.lineTo(-12, -22);
  ctx.lineTo(12, -22);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  if (G.taxiActive) {
    const t = G.taxiActive.dest;
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.strokeStyle = '#4dd2ff';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/** Warm sun tint by day, cool dark blue by night. */
function drawLighting(ctx, G, W, H) {
  const day = daylight(G);
  if (day >= 0.95) return;
  const alpha = (1 - day) * 0.34;
  const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.9);
  grad.addColorStop(0, 'rgba(20,30,60,0)');
  grad.addColorStop(1, 'rgba(20,30,60,' + alpha.toFixed(2) + ')');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  if (day < 0.55) {
    ctx.fillStyle = 'rgba(255,170,60,0.05)';
    ctx.fillRect(0, 0, W, H);
  }
}

// ---------- Screens ----------

function drawTitle(ctx, G, W, H) {
  // Sun-soaked backdrop: gradient sky + a slice of the city map.
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#ff9a3c');
  grad.addColorStop(0.55, '#ff6b6b');
  grad.addColorStop(1, '#2a1b4a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);
  // Sun.
  ctx.fillStyle = '#ffe9a8';
  ctx.beginPath();
  ctx.arc(W * 0.78, H * 0.22, 70, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,233,168,0.3)';
  ctx.beginPath();
  ctx.arc(W * 0.78, H * 0.22, 110, 0, Math.PI * 2);
  ctx.fill();
  // City skyline silhouette.
  ctx.fillStyle = 'rgba(30,16,50,0.85)';
  let x = 0;
  const heights = [120, 200, 150, 260, 180, 300, 160, 220, 140, 280, 190, 240];
  for (let i = 0; i < 12; i += 1) {
    const w = W / 12;
    ctx.fillRect(x, H - heights[i] - 60, w - 8, heights[i] + 60);
    x += w;
  }
  ctx.fillStyle = 'rgba(20,10,40,0.9)';
  ctx.fillRect(0, H - 60, W, 60);

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 84px system-ui, sans-serif';
  ctx.fillText('SOLMAR BAY', W / 2, H * 0.34);
  ctx.fillStyle = '#ffd94d';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.fillText('AN OPEN-WORLD CRIME STORY', W / 2, H * 0.34 + 44);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillText('Marco Vega came to Solmar Bay to drive. The crew had other plans.', W / 2, H * 0.48);
  ctx.fillText('Steal cars. Outrun the law. Take the city — one mission at a time.', W / 2, H * 0.48 + 26);

  // Start / Continue button.
  const bx = W / 2 - 130, by = H * 0.58, bw = 260, bh = 58;
  ctx.fillStyle = '#ffd94d';
  roundRect(ctx, bx, by, bw, bh, 12);
  ctx.fill();
  ctx.fillStyle = '#1a1a1a';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.fillText(G.hasSave ? 'CONTINUE  ▶' : 'START  ▶', W / 2, by + 38);

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '15px system-ui, sans-serif';
  const lines = [
    'WASD / Arrows — move & drive      E — steal / exit car',
    'Mouse — aim      Click — shoot      F — punch',
    'Shift — sprint / handbrake      Space — mission & taxi      P — pause      M — mute',
  ];
  lines.forEach((line, i) => ctx.fillText(line, W / 2, H * 0.58 + 100 + i * 24));
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText('An original game. No affiliation with any existing crime game series.', W / 2, H - 18);
  ctx.textAlign = 'left';
  G.titleButton = { x: bx, y: by, w: bw, h: bh };
}

function drawPause(ctx, W, H) {
  ctx.fillStyle = 'rgba(8,10,16,0.66)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 52px system-ui, sans-serif';
  ctx.fillText('PAUSED', W / 2, H / 2 - 40);
  ctx.font = '17px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillText('P — resume      M — mute      Enter — save & continue', W / 2, H / 2 + 8);
  ctx.fillText('Your progress saves automatically after every mission.', W / 2, H / 2 + 36);
  ctx.textAlign = 'left';
}

function drawBusted(ctx, G, W, H, title, sub) {
  ctx.fillStyle = 'rgba(8,10,16,0.72)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = title === 'BUSTED' ? '#5aa2ff' : '#ff5a4d';
  ctx.font = 'bold 72px system-ui, sans-serif';
  ctx.fillText(title, W / 2, H / 2 - 30);
  ctx.fillStyle = '#fff';
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillText(sub, W / 2, H / 2 + 12);
  ctx.fillStyle = '#ffd94d';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText('Press Enter to get back on the streets', W / 2, H / 2 + 56);
  ctx.textAlign = 'left';
}

function drawComplete(ctx, G, W, H) {
  ctx.fillStyle = 'rgba(8,10,16,0.78)';
  ctx.fillRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffd94d';
  ctx.font = 'bold 56px system-ui, sans-serif';
  ctx.fillText('THE CITY IS YOURS', W / 2, H / 2 - 60);
  ctx.fillStyle = '#fff';
  ctx.font = '18px system-ui, sans-serif';
  ctx.fillText('Marco pulled off the Big One. Solmar Bay belongs to the crew now.', W / 2, H / 2 - 16);
  ctx.fillText('Missions: ' + G.stats.missionsDone + '   •   Cars stolen: ' + G.stats.carsStolen +
    '   •   Cash earned: $' + G.stats.cashEarned.toLocaleString('en-US'), W / 2, H / 2 + 22);
  ctx.fillStyle = '#ffd94d';
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText('Press Enter to keep playing in free roam', W / 2, H / 2 + 66);
  ctx.textAlign = 'left';
}
