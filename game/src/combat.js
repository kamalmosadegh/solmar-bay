// Combat: the player's pistol and fists, rival crew AI, bullets, and the
// ammo/health/cash pickups scattered around the city.
import { clamp, dist } from './util.js';
import { collideBuildings } from './city.js';
import { addWanted } from './police.js';
import { sfx } from './audio.js';
import { toast } from './state.js';

const BULLET_SPEED = 950;
const BULLET_RANGE = 620;
const PISTOL_DAMAGE = 34;

/** Fire the pistol toward a world point, or punch when out of ammo. */
export function playerShoot(G, wx, wy) {
  const p = G.player;
  if (p.shootCooldown > 0 || G.screen !== 'play') return;
  if (p.inCar) return; // no drive-by shooting in this build
  if (p.ammo <= 0) {
    playerPunch(G, wx, wy);
    return;
  }
  p.ammo -= 1;
  p.shootCooldown = 0.28;
  const angle = Math.atan2(wy - p.y, wx - p.x);
  p.angle = angle;
  G.bullets.push({
    x: p.x + Math.cos(angle) * 22, y: p.y + Math.sin(angle) * 22,
    vx: Math.cos(angle) * BULLET_SPEED, vy: Math.sin(angle) * BULLET_SPEED,
    travelled: 0, fromPlayer: true, damage: PISTOL_DAMAGE,
  });
  muzzle(G, p.x + Math.cos(angle) * 26, p.y + Math.sin(angle) * 26);
  G.stats.shotsFired += 1;
  sfx.shoot();
  if (G.wanted < 1) addWanted(G, 1, 'Shots fired');
}

export function playerPunch(G, wx, wy) {
  const p = G.player;
  if (p.punchCooldown > 0) return;
  p.punchCooldown = 0.45;
  const angle = Math.atan2(wy - p.y, wx - p.x);
  p.angle = angle;
  sfx.punch();
  // Hit anything hostile within arm's reach in front of the player.
  const reach = 46;
  const hx = p.x + Math.cos(angle) * reach;
  const hy = p.y + Math.sin(angle) * reach;
  for (const e of G.enemies) {
    if (e.hp > 0 && dist(hx, hy, e.x, e.y) < 34) damageEnemy(G, e, 25);
  }
  for (const c of G.cops) {
    if (c.kind === 'foot' && dist(hx, hy, c.x, c.y) < 34) {
      c.hp -= 25;
      if (c.hp <= 0) {
        G.cops.splice(G.cops.indexOf(c), 1);
        addWanted(G, 1, 'Cop down');
      }
    }
  }
  for (const ped of G.peds) {
    if (!ped.dead && dist(hx, hy, ped.x, ped.y) < 30) {
      ped.dead = true; ped.downTimer = 6;
      addWanted(G, 1, 'Pedestrian hurt');
    }
  }
}

export function muzzle(G, x, y) {
  for (let i = 0; i < 5; i += 1) {
    G.particles.push({
      kind: 'flash', x, y,
      vx: (G.rng() - 0.5) * 160, vy: (G.rng() - 0.5) * 160,
      life: 0.12, maxLife: 0.12, size: 5 + G.rng() * 4, color: '#ffd94d',
    });
  }
}

export function spawnEnemy(G, x, y) {
  G.enemies.push({
    x, y, angle: G.rng() * Math.PI * 2,
    hp: 60, maxHp: 60, speed: 130,
    shootCooldown: 1 + G.rng(), state: 'hunt',
    shirt: '#b3392e', skin: '#c98d5f',
  });
}

export function damageEnemy(G, e, dmg) {
  e.hp -= dmg;
  sfx.hit();
  G.particles.push({
    kind: 'hit', x: e.x, y: e.y, vx: 0, vy: -30,
    life: 0.3, maxLife: 0.3, size: 8, color: '#ff5a4d',
  });
  if (e.hp <= 0) {
    G.stats.enemiesDown += 1;
    const cash = 20 + Math.floor(G.rng() * 40);
    G.pickups.push({ kind: 'cash', x: e.x, y: e.y, value: cash, t: 0 });
    if (G.rng() < 0.5) G.pickups.push({ kind: 'ammo', x: e.x + 14, y: e.y + 8, value: 12, t: 0 });
  }
}

export function updateCombat(G, dt) {
  const p = G.player;
  p.shootCooldown = Math.max(0, p.shootCooldown - dt);
  p.punchCooldown = Math.max(0, p.punchCooldown - dt);
  p.invulnerable = Math.max(0, p.invulnerable - dt);

  // Bullets fly, hit buildings, cars, enemies, cops and peds.
  for (let i = G.bullets.length - 1; i >= 0; i -= 1) {
    const b = G.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.travelled += BULLET_SPEED * dt;
    let dead = b.travelled > BULLET_RANGE;
    if (!dead) {
      const probe = { x: b.x, y: b.y };
      if (collideBuildings(G.city, probe, 2)) dead = true;
    }
    if (!dead && b.fromPlayer) {
      for (const e of G.enemies) {
        if (e.hp > 0 && dist(b.x, b.y, e.x, e.y) < 20) { damageEnemy(G, e, b.damage); dead = true; break; }
      }
      if (!dead) {
        for (const c of G.cops) {
          const cx = c.kind === 'car' ? c.car.x : c.x;
          const cy = c.kind === 'car' ? c.car.y : c.y;
          if (dist(b.x, b.y, cx, cy) < 24) {
            if (c.kind === 'foot') {
              c.hp -= b.damage;
              if (c.hp <= 0) G.cops.splice(G.cops.indexOf(c), 1);
            } else {
              // Shooting a police car dents it and slows the pursuit.
              c.car.speed *= 0.7;
              G.particles.push({ kind: 'hit', x: b.x, y: b.y, vx: 0, vy: 0, life: 0.25, maxLife: 0.25, size: 6, color: '#ffd94d' });
            }
            addWanted(G, 0.5, 'Cop shot');
            dead = true; break;
          }
        }
      }
      if (!dead) {
        for (const ped of G.peds) {
          if (!ped.dead && dist(b.x, b.y, ped.x, ped.y) < 16) {
            ped.dead = true; ped.downTimer = 6;
            addWanted(G, 1, 'Pedestrian shot');
            dead = true; break;
          }
        }
      }
    } else if (!dead && !b.fromPlayer) {
      if (p.invulnerable <= 0 && !p.inCar && dist(b.x, b.y, p.x, p.y) < 16) {
        p.hp -= b.damage;
        sfx.hit();
        dead = true;
        if (p.hp <= 0) {
          p.hp = 0;
          // wastePlayer is called by main.js so the death screen is clean.
          p.dead = true;
        }
      }
      if (!dead && p.inCar && dist(b.x, b.y, p.inCar.x, p.inCar.y) < 34) {
        dead = true;
      }
    }
    if (dead) G.bullets.splice(i, 1);
  }

  // Rival crew: hunt the player, shoot when in range and line of sight.
  for (let i = G.enemies.length - 1; i >= 0; i -= 1) {
    const e = G.enemies[i];
    if (e.hp <= 0) { G.enemies.splice(i, 1); continue; }
    const d = dist(e.x, e.y, p.x, p.y);
    e.angle = Math.atan2(p.y - e.y, p.x - e.x);
    e.shootCooldown -= dt;
    if (d > 320) {
      e.x += Math.cos(e.angle) * e.speed * dt;
      e.y += Math.sin(e.angle) * e.speed * dt;
    } else if (d > 160) {
      e.x += Math.cos(e.angle) * e.speed * 0.5 * dt;
      e.y += Math.sin(e.angle) * e.speed * 0.5 * dt;
    }
    if (d < 460 && e.shootCooldown <= 0 && !p.inCar) {
      e.shootCooldown = 1.1 + G.rng() * 0.8;
      const aim = e.angle + (G.rng() - 0.5) * 0.35;
      G.bullets.push({
        x: e.x + Math.cos(aim) * 22, y: e.y + Math.sin(aim) * 22,
        vx: Math.cos(aim) * BULLET_SPEED * 0.85, vy: Math.sin(aim) * BULLET_SPEED * 0.85,
        travelled: 0, fromPlayer: false, damage: 9,
      });
      muzzle(G, e.x + Math.cos(aim) * 26, e.y + Math.sin(aim) * 26);
      sfx.shoot();
    }
    const probe = { x: e.x, y: e.y };
    collideBuildings(G.city, probe, 14);
    e.x = probe.x; e.y = probe.y;
  }

  // Pickups: bob, expire after a while, collect on touch.
  for (let i = G.pickups.length - 1; i >= 0; i -= 1) {
    const pk = G.pickups[i];
    pk.t += dt;
    if (pk.t > 30) { G.pickups.splice(i, 1); continue; }
    if (dist(pk.x, pk.y, p.x, p.y) < 34) {
      if (pk.kind === 'cash') {
        p.cash += pk.value;
        G.stats.cashEarned += pk.value;
        toast(G, '+$' + pk.value, 1.5);
        sfx.cash();
      } else if (pk.kind === 'ammo') {
        p.ammo += pk.value;
        toast(G, '+' + pk.value + ' ammo', 1.5);
        sfx.pickup();
      } else if (pk.kind === 'health') {
        p.hp = clamp(p.hp + 40, 0, p.maxHp);
        toast(G, '+40 health', 1.5);
        sfx.pickup();
      }
      G.pickups.splice(i, 1);
    }
  }
}

/** Drop a few pickups near a spot (used when missions start). */
export function scatterPickups(G, x, y, n = 3) {
  for (let i = 0; i < n; i += 1) {
    const kind = G.rng() < 0.5 ? 'ammo' : 'health';
    G.pickups.push({
      kind, x: x + (G.rng() - 0.5) * 160, y: y + (G.rng() - 0.5) * 160,
      value: kind === 'ammo' ? 12 : 0, t: 0,
    });
  }
}
