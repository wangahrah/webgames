// Pure physics / collision / scoring. No DOM, no randomness without a seed.
// Browser global `FlapjackEngine`; node via require (module.exports guard).
(function (root) {
  'use strict';

  // Logical playfield is fixed at 420x640; the canvas scales to fit the window.
  var WIDTH = 420;
  var HEIGHT = 640;
  var GROUND_H = 72;
  var BIRD_X = 0.32 * WIDTH;      // bird's fixed horizontal position
  var BIRD_HALF_W = 15;
  var BIRD_HALF_H = 13;
  var OBSTACLE_W = 64;
  var CEILING_Y = 0;

  // Physics (identical across difficulties so kids graduate without re-learning).
  var GRAVITY = 1500;             // px/s^2
  var FLAP = -380;                // px/s impulse
  var TERM_RISE = -260;           // px/s cap while rising
  var TERM_FALL = 600;            // px/s cap while falling
  var PERFECT_BAND = 0.12;        // fraction of gap considered dead-center
  var PERFECT_BONUS = 2;          // points a perfect pass is worth
  var MILESTONE_EVERY = 10;
  var MILESTONE_CAP = 100;
  var MOVE_AMP = 28;              // px, hard-mode gap oscillation
  var MOVE_PERIOD = 2.8;          // s, hard-mode gap oscillation
  var INVINCIBLE_TIME = 1.5;      // s of blinking immunity on Easy after a hit
  var FIRE_STREAK = 3;            // perfects in a row to earn ON FIRE!

  // Deterministic PRNG so identical seeds produce identical games.
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createBird() {
    return { y: HEIGHT * 0.42, vy: 0, rot: 0, squash: 0, alive: true, fire: false };
  }

  function flap(bird) {
    bird.vy = FLAP;
    bird.squash = 1;
  }

  function integrateBird(bird, dt) {
    bird.vy += GRAVITY * dt;
    if (bird.vy < TERM_RISE) bird.vy = TERM_RISE;
    if (bird.vy > TERM_FALL) bird.vy = TERM_FALL;
    bird.y += bird.vy * dt;
  }

  function updateBird(bird, dt) {
    integrateBird(bird, dt);
    var target;
    if (bird.vy < 0) {
      target = 0.44; // ~25deg nose-up right after a flap
    } else {
      target = 0.44 - 2.01 * Math.min(1, bird.vy / TERM_FALL); // lerps toward -90deg
    }
    bird.rot += (target - bird.rot) * Math.min(1, dt * 10);
    bird.squash = Math.max(0, bird.squash - dt * 3);
  }

  // Ceiling is a soft bounce: never a death, just a gentle push back down.
  function bounceCeiling(bird) {
    var top = bird.y - BIRD_HALF_H;
    if (top < CEILING_Y) {
      bird.y = CEILING_Y + BIRD_HALF_H;
      if (bird.vy < 0) bird.vy = 0;
    }
  }

  // Floor is always a crash (no mercy).
  function hitsFloor(bird) {
    return bird.y + BIRD_HALF_H >= HEIGHT - GROUND_H;
  }

  function createObstacle(x, gapY, gap, phase) {
    return { x: x, gapY: gapY, gap: gap, phase: phase, passed: false };
  }

  // Hard mode: after score >= 10 the gap center oscillates. Easy/medium: static.
  function gapCenterY(obstacle, time, moving) {
    if (!moving) return obstacle.gapY;
    return obstacle.gapY + MOVE_AMP * Math.sin((2 * Math.PI * time) / MOVE_PERIOD + obstacle.phase);
  }

  function birdBox(bird) {
    return {
      x0: BIRD_X - BIRD_HALF_W, y0: bird.y - BIRD_HALF_H,
      x1: BIRD_X + BIRD_HALF_W, y1: bird.y + BIRD_HALF_H,
    };
  }

  function aabb(a, b) {
    return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  }

  // Hitbox scale narrows the collision box only (width); the visual gap is
  // unchanged, so a smaller hitbox is strictly more forgiving.
  function obstacleBoxes(obstacle, hitbox, time, moving) {
    var cy = gapCenterY(obstacle, time, moving);
    var half = (OBSTACLE_W / 2) * hitbox;
    var topY1 = cy - obstacle.gap / 2;
    var bottomY0 = cy + obstacle.gap / 2;
    return {
      top: { x0: obstacle.x - half, y0: 0, x1: obstacle.x + half, y1: topY1 },
      bottom: { x0: obstacle.x - half, y0: bottomY0, x1: obstacle.x + half, y1: HEIGHT - GROUND_H },
    };
  }

  function collides(bird, obstacle, hitbox, time, moving) {
    var bb = birdBox(bird);
    var ob = obstacleBoxes(obstacle, hitbox, time, moving);
    return aabb(bb, ob.top) || aabb(bb, ob.bottom);
  }

  function isPerfect(bird, obstacle, time, moving) {
    var cy = gapCenterY(obstacle, time, moving);
    return Math.abs(bird.y - cy) <= PERFECT_BAND * obstacle.gap;
  }

  function createWorld(diff, seed) {
    return {
      diff: diff,
      bird: createBird(),
      obstacles: [],
      score: 0,
      perfectStreak: 0,
      fire: false,
      hearts: diff.lives,
      invincible: 0,
      over: false,
      time: 0,
      spawnTimer: 0,
      firstSpawn: true,
      rng: mulberry32(seed >>> 0 || 1),
      lastEvents: [],
    };
  }

  function spawnObstacle(world) {
    var gap = world.diff.gap;
    var groundY = HEIGHT - GROUND_H;
    var margin = 44;
    var minCY = margin + gap / 2;
    var maxCY = groundY - margin - gap / 2;
    var cy = minCY + world.rng() * (maxCY - minCY);
    var x;
    if (world.firstSpawn) {
      x = BIRD_X + 1.5 * WIDTH; // first obstacle at least 1.5 screen-widths ahead
      world.firstSpawn = false;
    } else {
      var last = world.obstacles[world.obstacles.length - 1];
      x = last ? Math.max(WIDTH, last.x + world.diff.spacing) : BIRD_X + 1.5 * WIDTH;
    }
    world.obstacles.push(createObstacle(x, cy, gap, world.rng() * Math.PI * 2));
    world.spawnTimer = 0.6;
  }

  function hitObstacle(world, obstacle, events) {
    if (world.diff.lives > 1) {
      world.hearts--;
      world.invincible = INVINCIBLE_TIME;
      world.perfectStreak = 0;
      world.fire = false;
      var idx = world.obstacles.indexOf(obstacle);
      if (idx !== -1) world.obstacles.splice(idx, 1); // cleared: no double punishment
      events.push({ type: 'heartLost', hearts: world.hearts });
      if (world.hearts <= 0) {
        world.over = true;
        world.bird.alive = false;
        events.push({ type: 'over', cause: 'hit' });
      }
    } else {
      world.over = true;
      world.bird.alive = false;
      events.push({ type: 'over', cause: 'hit' });
    }
  }

  function worldStep(world, dt) {
    world.lastEvents = [];
    if (world.over) return world;
    var events = world.lastEvents;

    world.time += dt;
    if (world.invincible > 0) world.invincible -= dt;

    updateBird(world.bird, dt);
    bounceCeiling(world.bird);

    var moving = world.diff.moving && world.score >= 10;

    world.spawnTimer -= dt;
    if (world.spawnTimer <= 0) spawnObstacle(world);

    for (var i = world.obstacles.length - 1; i >= 0; i--) {
      var o = world.obstacles[i];
      o.x -= world.diff.scroll * dt;

      if (!o.passed && o.x + OBSTACLE_W / 2 < BIRD_X) {
        o.passed = true;
        var prev = world.score;
        if (isPerfect(world.bird, o, world.time, moving)) {
          world.perfectStreak++;
          world.score += PERFECT_BONUS;
          world.fire = world.perfectStreak >= FIRE_STREAK;
          events.push({ type: 'perfect', score: world.score });
        } else {
          world.perfectStreak = 0;
          world.fire = false;
          world.score += 1;
          events.push({ type: 'point', score: world.score });
        }
        if (Math.floor(world.score / MILESTONE_EVERY) > Math.floor(prev / MILESTONE_EVERY) &&
            world.score <= MILESTONE_CAP) {
          events.push({ type: 'milestone', n: Math.floor(world.score / MILESTONE_EVERY) * MILESTONE_EVERY });
        }
      }

      if (world.invincible <= 0 && collides(world.bird, o, world.diff.hitbox, world.time, moving)) {
        hitObstacle(world, o, events);
      }

      if (o.x + OBSTACLE_W < 0) world.obstacles.splice(i, 1);
    }

    if (hitsFloor(world.bird)) {
      world.over = true;
      world.bird.alive = false;
      events.push({ type: 'over', cause: 'floor' });
    }

    return world;
  }

  var FlapjackEngine = {
    WIDTH: WIDTH, HEIGHT: HEIGHT, GROUND_H: GROUND_H,
    BIRD_X: BIRD_X, BIRD_HALF_W: BIRD_HALF_W, BIRD_HALF_H: BIRD_HALF_H,
    OBSTACLE_W: OBSTACLE_W, CEILING_Y: CEILING_Y,
    GRAVITY: GRAVITY, FLAP: FLAP, TERM_RISE: TERM_RISE, TERM_FALL: TERM_FALL,
    PERFECT_BAND: PERFECT_BAND, PERFECT_BONUS: PERFECT_BONUS,
    MILESTONE_EVERY: MILESTONE_EVERY, MILESTONE_CAP: MILESTONE_CAP,
    MOVE_AMP: MOVE_AMP, MOVE_PERIOD: MOVE_PERIOD,
    INVINCIBLE_TIME: INVINCIBLE_TIME, FIRE_STREAK: FIRE_STREAK,
    createBird: createBird,
    flap: flap,
    integrateBird: integrateBird,
    updateBird: updateBird,
    bounceCeiling: bounceCeiling,
    hitsFloor: hitsFloor,
    createObstacle: createObstacle,
    gapCenterY: gapCenterY,
    birdBox: birdBox,
    aabb: aabb,
    obstacleBoxes: obstacleBoxes,
    collides: collides,
    isPerfect: isPerfect,
    createWorld: createWorld,
    spawnObstacle: spawnObstacle,
    hitObstacle: hitObstacle,
    worldStep: worldStep,
    mulberry32: mulberry32,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FlapjackEngine;
  } else {
    root.FlapjackEngine = FlapjackEngine;
  }
})(typeof window !== 'undefined' ? window : globalThis);