// Solmar Bay: the city itself. A procedural grid of roads, blocks, buildings,
// parks, a beach and a marina, built once from a seed so every run has the
// same streets. All collision and placement queries live here too.
import { clamp, mulberry32, pick, pushCircleOutOfRect, randInt, range } from './util.js';

export const WORLD_W = 4800;
export const WORLD_H = 3600;
export const ROAD_W = 96;
export const BLOCK_PITCH = 400;

// Road centrelines. Vertical roads run x = 200, 600, ... 4600;
// horizontal roads run y = 200, 600, ... 3000. South of y = 3200 is beach.
export const ROADS_X = [];
for (let i = 0; i < 12; i += 1) ROADS_X.push(200 + i * BLOCK_PITCH);
export const ROADS_Y = [];
for (let j = 0; j < 8; j += 1) ROADS_Y.push(200 + j * BLOCK_PITCH);

export const BEACH_Y = 3200;      // sand starts here
export const WATER_Y = 3460;      // sea starts here
export const MARINA = { x: 4300, y: 2500, w: 500, h: 700 }; // marina basin

const BUILDING_COLORS = [
  '#e8b98a', '#d99a6c', '#c97e5a', '#e5d3a8', '#b8c4c9',
  '#8fb3c7', '#d9a05b', '#a8b89a', '#e0c9a6', '#7fa3b8',
];
const ROOF_COLORS = ['#8a6f5c', '#6f7d84', '#a85f43', '#7d8a6a', '#5d7a8c'];

function nearestRoadLine(value, roads) {
  let best = roads[0];
  let bestD = Math.abs(value - best);
  for (const r of roads) {
    const d = Math.abs(value - r);
    if (d < bestD) { bestD = d; best = r; }
  }
  return best;
}

/** Is (x, y) on asphalt? Roads are the strips around each centreline. */
export function isOnRoad(x, y) {
  for (const rx of ROADS_X) {
    if (Math.abs(x - rx) <= ROAD_W / 2 && y >= 120 && y <= 3080) return true;
  }
  for (const ry of ROADS_Y) {
    if (Math.abs(y - ry) <= ROAD_W / 2 && x >= 120 && x <= 4680) return true;
  }
  return false;
}

/** Is (x, y) on a sidewalk (the ring just outside a road)? */
export function isOnSidewalk(x, y) {
  const m = ROAD_W / 2 + 16;
  for (const rx of ROADS_X) {
    if (Math.abs(x - rx) <= m && Math.abs(x - rx) > ROAD_W / 2 && y >= 120 && y <= 3080) return true;
  }
  for (const ry of ROADS_Y) {
    if (Math.abs(y - ry) <= m && Math.abs(y - ry) > ROAD_W / 2 && x >= 120 && x <= 4680) return true;
  }
  return false;
}

/** Build the whole city from a seed. Returns every static feature. */
export function buildCity(seed) {
  const rng = mulberry32(seed);
  const buildings = [];
  const trees = [];
  const palms = [];
  const parks = [];
  const ponds = [];

  // Pick three blocks to be parks, spread across the map.
  const parkBlocks = [[2, 1], [7, 3], [4, 5]];

  for (let ix = 0; ix < ROADS_X.length - 1; ix += 1) {
    for (let iy = 0; iy < ROADS_Y.length - 1; iy += 1) {
      const x0 = ROADS_X[ix] + ROAD_W / 2 + 14;
      const x1 = ROADS_X[ix + 1] - ROAD_W / 2 - 14;
      const y0 = ROADS_Y[iy] + ROAD_W / 2 + 14;
      const y1 = ROADS_Y[iy + 1] - ROAD_W / 2 - 14;
      const isPark = parkBlocks.some(([px, py]) => px === ix && py === iy);
      const isMarinaBlock = ix >= 10 && iy >= 5; // marina basin block, no buildings
      if (isMarinaBlock) continue;
      if (isPark) {
        parks.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
        const nTrees = randInt(rng, 7, 11);
        for (let t = 0; t < nTrees; t += 1) {
          trees.push({
            x: range(rng, x0 + 20, x1 - 20),
            y: range(rng, y0 + 20, y1 - 20),
            r: range(rng, 12, 20),
            shade: pick(rng, ['#3f7a44', '#4c8a3f', '#35703c']),
          });
        }
        if (rng() < 0.6) {
          ponds.push({
            x: x0 + (x1 - x0) * 0.3, y: y0 + (y1 - y0) * 0.3,
            w: (x1 - x0) * 0.4, h: (y1 - y0) * 0.35,
          });
        }
        continue;
      }
      // A block holds one or two buildings, split along its longer side.
      const splitV = (x1 - x0) > (y1 - y0) ? rng() < 0.7 : rng() < 0.3;
      const count = rng() < 0.45 ? 2 : 1;
      for (let b = 0; b < count; b += 1) {
        let bx = x0, by = y0, bw = x1 - x0, bh = y1 - y0;
        if (count === 2) {
          if (splitV) { bw = (x1 - x0) / 2 - 10; if (b === 1) bx = x0 + (x1 - x0) / 2 + 10; }
          else { bh = (y1 - y0) / 2 - 10; if (b === 1) by = y0 + (y1 - y0) / 2 + 10; }
        }
        const inset = 8 + rng() * 14;
        buildings.push({
          x: bx + inset, y: by + inset,
          w: bw - inset * 2, h: bh - inset * 2,
          color: pick(rng, BUILDING_COLORS),
          roof: pick(rng, ROOF_COLORS),
          height: 14 + Math.floor(rng() * 26),
          windows: rng() < 0.7,
        });
      }
      // A street tree or two on the block corners.
      if (rng() < 0.5) {
        trees.push({
          x: range(rng, x0 + 16, x1 - 16), y: range(rng, y0 + 16, y1 - 16),
          r: range(rng, 10, 16), shade: pick(rng, ['#3f7a44', '#4c8a3f']),
        });
      }
    }
  }

  // Palm trees along the beach promenade and the marina.
  for (let x = 260; x < WORLD_W - 200; x += 130) {
    palms.push({ x: x + range(rng, -30, 30), y: 3260 + range(rng, -20, 60), r: 12 });
  }
  for (let y = 2600; y < 3100; y += 120) {
    palms.push({ x: 4360 + range(rng, -20, 20), y, r: 11 });
  }

  // Marina piers and moored boats.
  const piers = [];
  const boats = [];
  for (let i = 0; i < 3; i += 1) {
    const py = 2580 + i * 200;
    piers.push({ x: 4360, y: py, w: 220, h: 14 });
    for (let b = 0; b < 3; b += 1) {
      boats.push({
        x: 4420 + b * 110, y: py + 40,
        angle: Math.PI / 2, color: pick(rng, ['#e8e4da', '#c75b4a', '#4a7fb5', '#e8b13c']),
      });
    }
  }

  // Named landmarks the story and missions use.
  const landmarks = {
    garage: { x: 600, y: 600, name: "Rico's Garage" },
    safehouse: { x: 3800, y: 2600, name: 'Safehouse' },
    docks: { x: 4180, y: 2850, name: 'Marina Docks' },
    bank: { x: 4180, y: 2680, name: 'Solmar Bay Bank' },
    hospital: { x: 1000, y: 2600, name: 'St. Marina Hospital' },
    policeStation: { x: 3000, y: 600, name: 'Solmar PD HQ' },
    start: { x: 600, y: 1400, name: 'Calle Sol' },
  };

  // Ten hidden packages for the collector side activity.
  const packageSpots = [
    { x: 760, y: 1560 }, { x: 1780, y: 620 }, { x: 2980, y: 1780 },
    { x: 980, y: 2580 }, { x: 4180, y: 620 }, { x: 3380, y: 2580 },
    { x: 2180, y: 2980 }, { x: 620, y: 2980 }, { x: 4580, y: 1420 },
    { x: 1780, y: 2180 },
  ];

  return {
    buildings, trees, palms, parks, ponds, piers, boats, landmarks, packageSpots,
    beach: { y0: BEACH_Y, y1: WORLD_H },
    water: { y0: WATER_Y },
    marina: MARINA,
  };
}

/** Solid ground test: buildings, water, marina basin and the map edge. */
export function solidAt(city, x, y) {
  if (x < 24 || y < 24 || x > WORLD_W - 24 || y > WORLD_H - 24) return true;
  if (y >= WATER_Y) return true;
  if (x >= MARINA.x && y >= MARINA.y && y <= MARINA.y + MARINA.h) return true;
  for (const b of city.buildings) {
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
  }
  return false;
}

/** Push a circle out of every solid it touches. Returns true if pushed. */
export function collideWorld(city, pos, r) {
  let hit = false;
  if (pos.x < 24 + r) { pos.x = 24 + r; hit = true; }
  if (pos.y < 24 + r) { pos.y = 24 + r; hit = true; }
  if (pos.x > WORLD_W - 24 - r) { pos.x = WORLD_W - 24 - r; hit = true; }
  if (pos.y > WORLD_H - 24 - r) { pos.y = WORLD_H - 24 - r; hit = true; }
  return hit;
}

/** Push a circle out of buildings only (cars and people use this). */
export function collideBuildings(city, pos, r) {
  let hit = false;
  for (const b of city.buildings) {
    if (pos.x > b.x - r && pos.x < b.x + b.w + r && pos.y > b.y - r && pos.y < b.y + b.h + r) {
      if (pushCircleOutOfRect(pos, r, b)) hit = true;
    }
  }
  return hit;
}

/** A random point on a road, far enough from the map edge to drive on. */
export function randomRoadPoint(rng) {
  if (rng() < 0.5) {
    const rx = pick(rng, ROADS_X);
    return { x: rx + (rng() < 0.5 ? -24 : 24), y: range(rng, 300, 3000), axis: 'v', road: rx };
  }
  const ry = pick(rng, ROADS_Y);
  return { x: range(rng, 300, 4600), y: ry + (rng() < 0.5 ? -24 : 24), axis: 'h', road: ry };
}

/** A random point on a sidewalk near a road. */
export function randomSidewalkPoint(rng) {
  if (rng() < 0.5) {
    const rx = pick(rng, ROADS_X);
    return { x: rx + (rng() < 0.5 ? -62 : 62), y: range(rng, 300, 3000) };
  }
  const ry = pick(rng, ROADS_Y);
  return { x: range(rng, 300, 4600), y: ry + (rng() < 0.5 ? -62 : 62) };
}

/** Snap a point to the nearest road centreline (used for spawn placement). */
export function snapToRoad(x, y) {
  const rx = nearestRoadLine(x, ROADS_X);
  const ry = nearestRoadLine(y, ROADS_Y);
  if (Math.abs(x - rx) < Math.abs(y - ry)) return { x: rx, y, axis: 'v' };
  return { x, y: ry, axis: 'h' };
}

export function clampToWorld(x, y, margin = 30) {
  return {
    x: clamp(x, margin, WORLD_W - margin),
    y: clamp(y, margin, WORLD_H - margin),
  };
}
