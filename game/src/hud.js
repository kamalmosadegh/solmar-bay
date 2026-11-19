// The HUD: health bar, cash, wanted stars, clock, mission objective, and a
// live minimap drawn from the real world state every frame.
import { WORLD_W, WORLD_H, ROADS_X, ROADS_Y } from './city.js';
import { clamp, dist } from './util.js';
import { clockText, daylight } from './state.js';
import { missionObjective, missionMarker } from './missions.js';

const MINIMAP_SIZE = 168;

export function drawHUD(ctx, G, W, H) {
  const p = G.player;
  ctx.save();
  ctx.textBaseline = 'alphabetic';

  // --- Top left: health bar + cash + ammo ---
  ctx.fillStyle = 'rgba(10, 14, 20, 0.62)';
  roundRect(ctx, 14, 12, 250, 84, 10);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText('MARCO VEGA', 26, 34);
  // Health bar
  ctx.fillStyle = '#222';
  roundRect(ctx, 26, 42, 180, 12, 6);
  ctx.fill();
  const hpFrac = clamp(p.hp / p.maxHp, 0, 1);
  ctx.fillStyle = hpFrac > 0.5 ? '#2ecc71' : hpFrac > 0.25 ? '#f39c12' : '#e74c3c';
  roundRect(ctx, 26, 42, 180 * hpFrac, 12, 6);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('HP ' + Math.ceil(p.hp), 212, 53);
  ctx.fillStyle = '#2ee06f';
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.fillText('$' + p.cash.toLocaleString('en-US'), 26, 80);
  ctx.fillStyle = '#ffd94d';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('Ammo ' + p.ammo + (p.inCar ? '   •   IN CAR' : ''), 130, 80);

  // --- Top centre: wanted stars ---
  const stars = Math.ceil(G.wanted);
  ctx.fillStyle = 'rgba(10, 14, 20, 0.62)';
  roundRect(ctx, W / 2 - 105, 12, 210, 40, 10);
  ctx.fill();
  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = i < stars ? '#ffd94d' : 'rgba(255,255,255,0.25)';
    ctx.font = '24px system-ui, sans-serif';
    ctx.fillText('★', W / 2 - 88 + i * 38, 41);
  }

  // --- Clock + day phase, top right next to the minimap ---
  ctx.fillStyle = 'rgba(10, 14, 20, 0.62)';
  roundRect(ctx, W - MINIMAP_SIZE - 26, 12, 120, 34, 8);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText(clockText(G), W - MINIMAP_SIZE - 12, 35);
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = '#ffd94d';
  const hour = (G.clock / 3600) % 24;
  const phase = hour < 6 ? 'Night' : hour < 12 ? 'Morning' : hour < 18 ? 'Afternoon' : hour < 21 ? 'Dusk' : 'Night';
  ctx.fillText(phase, W - MINIMAP_SIZE + 44, 35);

  // --- Minimap (top right, below the clock) ---
  drawMinimap(ctx, G, W - MINIMAP_SIZE - 14, 56, MINIMAP_SIZE);

  // --- Bottom left: mission objective ---
  const objective = missionObjective(G);
  ctx.fillStyle = 'rgba(10, 14, 20, 0.62)';
  const objW = Math.min(520, 40 + ctx.measureText(objective).width);
  roundRect(ctx, 14, H - 62, objW, 48, 10);
  ctx.fill();
  ctx.fillStyle = '#ffd94d';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText(G.mission ? 'MISSION: ' + G.mission.def.title : 'SOLMAR BAY', 26, H - 44);
  ctx.fillStyle = '#fff';
  ctx.font = '14px system-ui, sans-serif';
  ctx.fillText(objective, 26, H - 24);

  // --- Bottom right: taxi / package counters ---
  ctx.fillStyle = 'rgba(10, 14, 20, 0.62)';
  roundRect(ctx, W - 218, H - 62, 204, 48, 10);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('Packages ' + G.packagesFound + '/10', W - 206, H - 42);
  ctx.fillText('Taxi fares: ' + G.taxiFares + ' done', W - 206, H - 22);
  if (G.taxiActive) {
    ctx.fillStyle = '#4dd2ff';
    ctx.fillText('Fare: $' + G.taxiActive.fare + ' — ' + Math.ceil(G.taxiActive.timer) + 's', W - 206, H - 22);
  }

  // --- Toast message ---
  if (G.message && G.messageTimer > 0) {
    ctx.font = 'bold 17px system-ui, sans-serif';
    const tw = ctx.measureText(G.message).width;
    ctx.fillStyle = 'rgba(10, 14, 20, 0.72)';
    roundRect(ctx, W / 2 - tw / 2 - 16, 66, tw + 32, 34, 9);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillText(G.message, W / 2 - tw / 2, 89);
  }

  // --- Controls hint (first seconds of play) ---
  if (G.time < 12 && G.screen === 'play') {
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('WASD move/drive • E steal car • Mouse aim + click shoot • Space action • P pause • M mute',
      14, H - 76);
  }

  ctx.restore();
}

function drawMinimap(ctx, G, x, y, size) {
  const scale = size / WORLD_W;
  const h = WORLD_H * scale;
  ctx.save();
  ctx.fillStyle = 'rgba(10, 14, 20, 0.72)';
  roundRect(ctx, x - 6, y - 6, size + 12, h + 12, 10);
  ctx.fill();
  ctx.beginPath();
  ctx.rect(x, y, size, h);
  ctx.clip();

  // Land: grass, beach, sea.
  ctx.fillStyle = '#4d8a4f';
  ctx.fillRect(x, y, size, h);
  ctx.fillStyle = '#e8d29a';
  ctx.fillRect(x, y + (3200 * scale), size, h - 3200 * scale);
  ctx.fillStyle = '#3f8fd2';
  ctx.fillRect(x, y + (3460 * scale), size, h - 3460 * scale);
  ctx.fillStyle = '#3f8fd2';
  ctx.fillRect(x + 4300 * scale, y + 2500 * scale, 500 * scale, 700 * scale);

  // Roads.
  ctx.fillStyle = '#5a5f66';
  for (const rx of ROADS_X) ctx.fillRect(x + (rx - 48) * scale, y, 96 * scale, h);
  for (const ry of ROADS_Y) ctx.fillRect(x, y + (ry - 48) * scale, size, 96 * scale);

  // Buildings.
  ctx.fillStyle = 'rgba(30, 34, 40, 0.85)';
  for (const b of G.city.buildings) {
    ctx.fillRect(x + b.x * scale, y + b.y * scale, Math.max(2, b.w * scale), Math.max(2, b.h * scale));
  }

  const dot = (wx, wy, color, r = 3) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x + wx * scale, y + wy * scale, r, 0, Math.PI * 2);
    ctx.fill();
  };

  // Packages.
  for (let i = 0; i < G.city.packageSpots.length; i += 1) {
    if (!G.packageTaken[i]) dot(G.city.packageSpots[i].x, G.city.packageSpots[i].y, '#2ee06f', 2.5);
  }
  // Taxi customers.
  for (const pas of G.passengers) {
    if (pas.waiting) dot(pas.x, pas.y, '#4dd2ff', 3);
  }
  // Mission + taxi destination markers (pulsing).
  const marker = missionMarker(G);
  const pulse = 3 + Math.sin(G.time * 5) * 1.2;
  if (marker) dot(marker.x, marker.y, '#ffd94d', pulse);
  if (G.taxiActive) dot(G.taxiActive.dest.x, G.taxiActive.dest.y, '#4dd2ff', pulse);
  // Police (flashing red/blue).
  const flash = Math.floor(G.time * 4) % 2 === 0;
  for (const c of G.cops) {
    const cx = c.kind === 'car' ? c.car.x : c.x;
    const cy = c.kind === 'car' ? c.car.y : c.y;
    dot(cx, cy, flash ? '#ff3b30' : '#2f7bff', 3.5);
  }
  // Enemies.
  for (const e of G.enemies) dot(e.x, e.y, '#ff5a4d', 3);
  // Player: white arrow.
  const p = G.player;
  const px = p.inCar ? p.inCar.x : p.x;
  const py = p.inCar ? p.inCar.y : p.y;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x + px * scale, y + py * scale, 4.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.restore();
  // North label, tucked inside the minimap's top edge.
  ctx.fillStyle = 'rgba(10, 14, 20, 0.72)';
  ctx.fillRect(x + size / 2 - 8, y + 2, 16, 14);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.fillText('N', x + size / 2 - 3, y + 13);
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
