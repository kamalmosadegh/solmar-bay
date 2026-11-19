// Small math and collision helpers shared by every Solmar Bay system.
// Nothing here knows about the game itself: pure functions only.
export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function dist(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

export function dist2(ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

/** Shortest signed turn from angle `a` to angle `b`, in (-PI, PI]. */
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function angleLerp(a, b, t) {
  return a + angleDiff(a, b) * clamp(t, 0, 1);
}

/** Deterministic RNG so a seeded city always builds the same way. */
export function mulberry32(seed) {
  let s = seed >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

export function range(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

/** Random integer in [lo, hi]. */
export function randInt(rng, lo, hi) {
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function choice(rng, ...vals) {
  return vals[Math.floor(rng() * vals.length)];
}

/** True when circle (x, y, r) overlaps rect {x, y, w, h}. */
export function circleHitsRect(x, y, r, rect) {
  const cx = clamp(x, rect.x, rect.x + rect.w);
  const cy = clamp(y, rect.y, rect.y + rect.h);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy < r * r;
}

/**
 * Push a circle out of a rect it overlaps. Returns true when a push happened.
 * The push is axis-separated: it resolves along the smaller penetration axis,
 * which lets circles slide along walls instead of sticking to corners.
 */
export function pushCircleOutOfRect(pos, r, rect) {
  const cx = clamp(pos.x, rect.x, rect.x + rect.w);
  const cy = clamp(pos.y, rect.y, rect.y + rect.h);
  let dx = pos.x - cx;
  let dy = pos.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return false;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    const push = (r - d) / d;
    pos.x += dx * push;
    pos.y += dy * push;
    return true;
  }
  // Centre is inside the rect: shove out along the nearest face.
  const left = pos.x - rect.x;
  const right = rect.x + rect.w - pos.x;
  const top = pos.y - rect.y;
  const bottom = rect.y + rect.h - pos.y;
  const m = Math.min(left, right, top, bottom);
  if (m === left) pos.x = rect.x - r;
  else if (m === right) pos.x = rect.x + rect.w + r;
  else if (m === top) pos.y = rect.y - r;
  else pos.y = rect.y + rect.h + r;
  return true;
}

/** Point inside rect, with an optional margin. */
export function pointInRect(x, y, rect, margin = 0) {
  return x >= rect.x - margin && x <= rect.x + rect.w + margin &&
    y >= rect.y - margin && y <= rect.y + rect.h + margin;
}
