// Quest levels: the level table and the pure geometry that decides what the
// animal ran into. No DOM, no canvas, no browser APIs — everything here is a
// plain function over numbers so tests/levels.test.js can run it in Node.
//
// COORDINATES: quest levels live in a fixed 1000 x 750 "world", never in CSS
// pixels. The canvas has no fixed size (see coop.js), so a level authored in
// screen pixels would be unsolvable at one window shape and trivial at
// another. coop.js letterboxes the world into whatever the canvas currently
// is; `fd 100` therefore means the same thing on every machine.

var Levels = (function () {
  const WORLD = { w: 1000, h: 750 };

  // Collision sizes, world units. The animal is a circle; walls are rects.
  const ANIMAL_R = 18;   // how fat the walker is
  const FOX_R = 30;      // fox danger radius (added to ANIMAL_R when testing)
  const NEST_R = 35;     // how close counts as "arrived"
  const EGG_R = 26;      // how close counts as "picked up"
  const KEY_R = 26;      // how close counts as "key grabbed"

  // ---- levels ---------------------------------------------------------------
  //
  // Adding a level is one row here — the picker, the renderer and the tests
  // all read this table, the same way OPS and ANIMALS work in ops.js.
  //
  //   start   where the animal begins, and where `home` returns to
  //   nest    the basket to reach. Reaching it ends the run as a win.
  //   eggs    optional pickups; collecting every one is the second star
  //   walls   axis-aligned rects {x,y,w,h}. Bumping one stops the run gently.
  //   foxes   points. Touching one ends the run.
  //   keys    optional points. Grabbed like eggs; when every key is held, all
  //           `gates` open (see coop.js — the renderer owns the state).
  //   gates   optional rects, shaped like walls but drawn as locked gates.
  //           Solid until every key has been grabbed, then gone. Bumping one
  //           reports its own "locked" outcome so the level teaches itself.
  //   ice     optional rects of slippery pond. A move that would END on the
  //           ice keeps gliding in its movement direction until it is off
  //           every pond — the renderer extends its move target with
  //           slideDestination() before animating. Walls, foxes and the
  //           basket are still checked per frame along the glide.
  //   par     source-statement count for the third star. `repeat 4 [...]`
  //           counts as 3 statements, eight flat lines as 8 — that is the
  //           whole point of par.
  //   starter code the editor is seeded with. A hint, not the answer
  //           (except level 1, which is the tutorial).
  //   solution one program that solves it. Not shown anywhere in the UI — it
  //           exists so tests/levels.test.js can walk every level through the
  //           real collision code and prove it is still winnable. Change a
  //           wall, break the test. (Kid reading this in devtools: cheating
  //           is allowed, but it is more fun to work it out.)
  //
  // Everything is snapped to 25-unit multiples so round numbers solve them.

  const LEVELS = [
    {
      id: 'firststeps',
      name: 'First Steps',
      hint: 'the basket is straight ahead',
      start: { x: 150, y: 375, heading: 0 },
      nest: { x: 850, y: 375 },
      eggs: [],
      walls: [],
      foxes: [],
      par: 1,
      solution: 'fd 700\n',
      starter:
        '# Walk to the basket!\n' +
        'fd 700\n',
    },
    {
      id: 'corner',
      name: 'Around the Corner',
      hint: 'east, then turn left and go north',
      start: { x: 150, y: 600, heading: 0 },
      nest: { x: 850, y: 150 },
      eggs: [{ x: 850, y: 375 }],
      walls: [],
      foxes: [],
      par: 3,
      solution: 'fd 700\nlt 90\nfd 450\n',
      starter:
        '# Go east, then turn and go north.\n' +
        '# lt 90 turns left. Grab the egg on the way!\n' +
        'fd 700\n',
    },
    {
      id: 'fence',
      name: 'The Fence',
      hint: 'you cannot go through it — go over the top',
      start: { x: 150, y: 500, heading: 0 },
      nest: { x: 850, y: 500 },
      eggs: [{ x: 650, y: 100 }],
      walls: [{ x: 475, y: 225, w: 50, h: 525 }],
      foxes: [],
      par: 7,
      solution: 'fd 250\nlt 90\nfd 400\nrt 90\nfd 450\nrt 90\nfd 400\n',
      starter:
        '# A fence! It runs down to the bottom,\n' +
        '# so the only way past is over the top.\n' +
        'fd 250\n',
    },
    {
      id: 'roundabout',
      name: 'Round and Round',
      hint: 'four sides, four turns — that is a repeat',
      start: { x: 275, y: 150, heading: 0 },
      nest: { x: 275, y: 150 },
      eggs: [
        { x: 500, y: 150 },
        { x: 725, y: 150 },
        { x: 725, y: 600 },
        { x: 275, y: 600 },
      ],
      walls: [],
      foxes: [],
      par: 3,
      solution: 'repeat 4 [\n  fd 450\n  rt 90\n]\n',
      starter:
        '# The basket is right where you start —\n' +
        '# collect every egg and come back to it.\n' +
        '# You could write eight lines... or use repeat.\n' +
        'fd 450\n' +
        'rt 90\n',
    },
    {
      id: 'detour',
      name: 'The Detour',
      hint: 'the eggs are not on the way — go and get them anyway',
      start: { x: 125, y: 375, heading: 0 },
      nest: { x: 875, y: 375 },
      eggs: [
        { x: 375, y: 600 },
        { x: 600, y: 600 },
      ],
      walls: [{ x: 450, y: 0, w: 50, h: 475 }],
      foxes: [],
      par: 9,
      solution: 'fd 250\nrt 90\nfd 225\nlt 90\nfd 225\nlt 90\nfd 225\nrt 90\nfd 275\n',
      starter:
        '# This fence hangs down from the top.\n' +
        '# The gap is underneath — and so are the eggs.\n',
    },
    {
      id: 'fox',
      name: 'Fox in the Yard',
      hint: 'foxes end the run — keep your distance',
      start: { x: 125, y: 625, heading: 0 },
      nest: { x: 875, y: 125 },
      eggs: [
        { x: 500, y: 625 },
        { x: 875, y: 375 },
      ],
      walls: [],
      foxes: [
        { x: 500, y: 375 },
        { x: 300, y: 300 },
      ],
      par: 3,
      solution: 'fd 750\nlt 90\nfd 500\n',
      starter:
        '# Two foxes. Touch one and the run is over.\n' +
        '# Hug the bottom, then the right-hand side.\n',
    },
    {
      id: 'maze',
      name: 'The Comb',
      hint: 'down, up, down — the gaps alternate',
      start: { x: 125, y: 625, heading: 0 },
      nest: { x: 925, y: 625 },
      eggs: [
        { x: 200, y: 625 },
        { x: 400, y: 375 },
        { x: 650, y: 375 },
      ],
      walls: [
        { x: 275, y: 0, w: 50, h: 500 },
        { x: 525, y: 250, w: 50, h: 500 },
        { x: 775, y: 0, w: 50, h: 500 },
      ],
      foxes: [],
      par: 9,
      solution: 'fd 275\nlt 90\nfd 500\nrt 90\nfd 250\nrt 90\nfd 500\nlt 90\nfd 275\n',
      starter:
        '# Three fences. The first and last have a gap\n' +
        '# at the BOTTOM, the middle one at the TOP.\n',
    },
    {
      id: 'farm',
      name: 'The Whole Farm',
      hint: 'a big square lap, past the foxes, back to the basket',
      start: { x: 250, y: 125, heading: 0 },
      nest: { x: 250, y: 125 },
      eggs: [
        { x: 500, y: 125 },
        { x: 750, y: 125 },
        { x: 750, y: 625 },
        { x: 250, y: 625 },
      ],
      walls: [{ x: 400, y: 275, w: 200, h: 200 }],
      foxes: [
        { x: 500, y: 200 },
        { x: 500, y: 550 },
      ],
      par: 3,
      solution: 'repeat 4 [\n  fd 500\n  rt 90\n]\n',
      starter:
        '# Everything at once: a barn in the middle,\n' +
        '# two foxes, four eggs, and the basket back\n' +
        '# where you started. One lap should do it.\n',
    },
    {
      id: 'gate',
      name: 'The Locked Gate',
      hint: 'the gate is locked — somewhere a key is waiting',
      start: { x: 125, y: 375, heading: 0 },
      nest: { x: 875, y: 375 },
      eggs: [{ x: 625, y: 650 }],
      walls: [],
      gates: [{ x: 500, y: 0, w: 50, h: 750 }],
      keys: [{ x: 375, y: 650 }],
      foxes: [],
      par: 9,
      solution:
        'fd 250\nrt 90\nfd 275\nlt 90\nfd 250\nlt 90\nfd 275\nrt 90\nfd 250\n',
      starter:
        '# A purple gate! It is LOCKED.\n' +
        '# They say the key is somewhere down south...\n' +
        'fd 250\n',
    },
    {
      id: 'pond',
      name: 'Slippery Pond',
      hint: 'you cannot stop on the ice — plan where your glide ends',
      start: { x: 125, y: 375, heading: 0 },
      nest: { x: 875, y: 475 },
      eggs: [
        { x: 500, y: 275 },
        { x: 500, y: 475 },
      ],
      ice: [{ x: 300, y: 225, w: 400, h: 300 }],
      walls: [{ x: 750, y: 325, w: 50, h: 125 }],
      foxes: [],
      par: 10,
      solution:
        'lt 90\nfd 100\nrt 90\nfd 500\nrt 90\nfd 200\nrt 90\nfd 500\nlt 180\nfd 675\n',
      starter:
        '# Brrr! The pond is ICE. Whatever ends a move on the\n' +
        '# pond keeps sliding to the far edge...\n',
    },
  ];

  function byId(id) {
    return LEVELS.find(l => l.id === id) || null;
  }

  // ---- geometry -------------------------------------------------------------

  // Four slabs sitting just outside the world, so walking off the edge is an
  // ordinary wall bump rather than the animal silently vanishing.
  function borderWalls() {
    const T = 400;
    return [
      { x: -T, y: -T, w: WORLD.w + 2 * T, h: T },            // above
      { x: -T, y: WORLD.h, w: WORLD.w + 2 * T, h: T },       // below
      { x: -T, y: -T, w: T, h: WORLD.h + 2 * T },            // left
      { x: WORLD.w, y: -T, w: T, h: WORLD.h + 2 * T },       // right
    ];
  }

  function wallsOf(level) {
    return (level.walls || []).concat(borderWalls());
  }

  // Earliest t in [0,1] at which the segment enters the rect grown by r
  // (a Minkowski sum: a circle of radius r sweeping the rect). Slab method.
  // Returns null for a miss, 0 if it starts already inside.
  function segmentRectT(x0, y0, x1, y1, rect, r) {
    const minx = rect.x - r, maxx = rect.x + rect.w + r;
    const miny = rect.y - r, maxy = rect.y + rect.h + r;
    const dx = x1 - x0, dy = y1 - y0;
    let t0 = 0, t1 = 1;
    const EPS = 1e-9;

    for (const [p, d, lo, hi] of [[x0, dx, minx, maxx], [y0, dy, miny, maxy]]) {
      if (Math.abs(d) < EPS) {
        if (p < lo || p > hi) return null;
        continue;
      }
      let ta = (lo - p) / d;
      let tb = (hi - p) / d;
      if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; }
      if (ta > t0) t0 = ta;
      if (tb < t1) t1 = tb;
      if (t0 > t1) return null;
    }
    return t0;
  }

  // Earliest wall the segment runs into. { t, wall } or null.
  function segmentHitsWalls(x0, y0, x1, y1, walls, r = ANIMAL_R) {
    let best = null;
    for (const w of walls) {
      const t = segmentRectT(x0, y0, x1, y1, w, r);
      if (t === null) continue;
      if (!best || t < best.t) best = { t, wall: w };
    }
    return best;
  }

  // Earliest t at which the segment comes within `radius` of a point.
  // { t, index, point } or null.
  function segmentHitsCircles(x0, y0, x1, y1, points, radius) {
    const dx = x1 - x0, dy = y1 - y0;
    const a = dx * dx + dy * dy;
    let best = null;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const fx = x0 - p.x, fy = y0 - p.y;
      const c = fx * fx + fy * fy - radius * radius;
      let t = null;

      if (c <= 0) {
        t = 0; // already inside
      } else if (a > 1e-9) {
        const b = 2 * (fx * dx + fy * dy);
        const disc = b * b - 4 * a * c;
        if (disc >= 0) {
          const root = Math.sqrt(disc);
          const ta = (-b - root) / (2 * a);
          const tb = (-b + root) / (2 * a);
          if (ta >= 0 && ta <= 1) t = ta;
          else if (tb >= 0 && tb <= 1) t = tb;
        }
      }
      if (t === null) continue;
      if (!best || t < best.t) best = { t, index: i, point: p };
    }
    return best;
  }

  // Shortest distance from a point to a segment — used for egg pickup, which
  // does not need a time, only "did we brush past it".
  function pointSegmentDistance(px, py, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0;
    const len2 = dx * dx + dy * dy;
    let t = 0;
    if (len2 > 1e-9) {
      t = ((px - x0) * dx + (py - y0) * dy) / len2;
      t = Math.max(0, Math.min(1, t));
    }
    const cx = x0 + t * dx, cy = y0 + t * dy;
    return Math.hypot(px - cx, py - cy);
  }

  // Indices of eggs this segment newly collects. `got` is a Set or array of
  // indices already collected.
  function eggsCollectedBy(x0, y0, x1, y1, eggs, got, radius = EGG_R) {
    // Duck-typed rather than `instanceof Set`: the tests build the Set in a
    // different realm from this file's, and cross-realm instanceof is false.
    const has = (got && typeof got.has === 'function')
      ? (i => got.has(i))
      : (i => Array.prototype.indexOf.call(got || [], i) !== -1);
    const out = [];
    for (let i = 0; i < eggs.length; i++) {
      if (has(i)) continue;
      if (pointSegmentDistance(eggs[i].x, eggs[i].y, x0, y0, x1, y1) <= radius) {
        out.push(i);
      }
    }
    return out;
  }

  // ---- ice -------------------------------------------------------------------
  //
  // A move that ends on ice does not get to stop there: it keeps gliding in
  // the direction it was already moving until it is off every pond. Pure
  // geometry — the renderer extends its move target with this before
  // animating, so the existing per-frame collision still catches walls, foxes
  // and the basket anywhere along the glide.

  const SLIDE_EPS = 0.5;
  const MAX_SLIDE_HOPS = 10; // ponds are never adjacent x10; belt and braces

  // eps shrinks the rect: with SLIDE_EPS, a move ending right at the pond
  // edge counts as "stopped at the edge", not "stopped on the ice". Once a
  // glide is underway we test against the true edge (eps 0), so chained
  // ponds hand off cleanly and the animal can never come to rest on ice.
  function pointInIce(x, y, iceRects, eps) {
    for (const r of iceRects) {
      if (x > r.x + eps && x < r.x + r.w - eps &&
          y > r.y + eps && y < r.y + r.h - eps) {
        return r;
      }
    }
    return null;
  }

  // Where a move from (x0,y0) to (x1,y1) really ends on `iceRects`. Returns
  // the extended end point, or null when no slide is needed.
  function slideDestination(x0, y0, x1, y1, iceRects) {
    const dx = x1 - x0, dy = y1 - y0;
    if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return null;
    if (!pointInIce(x1, y1, iceRects, SLIDE_EPS)) return null;
    let px = x1, py = y1;
    for (let hops = 0; hops < MAX_SLIDE_HOPS; hops++) {
      const r = pointInIce(px, py, iceRects, 0);
      if (!r) return { x: px, y: py };
      // Distance along the move direction to just past the far edge.
      let t = Infinity;
      if (dx > 1e-9) t = Math.min(t, (r.x + r.w + SLIDE_EPS - px) / dx);
      if (dx < -1e-9) t = Math.min(t, (r.x - SLIDE_EPS - px) / dx);
      if (dy > 1e-9) t = Math.min(t, (r.y + r.h + SLIDE_EPS - py) / dy);
      if (dy < -1e-9) t = Math.min(t, (r.y - SLIDE_EPS - py) / dy);
      if (!Number.isFinite(t)) return null;
      px += dx * t;
      py += dy * t;
    }
    return { x: px, y: py };
  }

  // ---- scoring --------------------------------------------------------------
  //
  // Reaching the basket always wins — collecting every egg is a bonus star,
  // not a gate. Otherwise a level with eggs could never score one star, and a
  // level without eggs would hand out the second star for nothing.

  function starsFor(result) {
    const { outcome, eggsGot = 0, eggsTotal = 0, commands = 0, par = 0 } = result || {};
    if (outcome !== 'win') return 0;
    let stars = 1;
    if (eggsTotal === 0 || eggsGot >= eggsTotal) stars++;
    if (par > 0 && commands > 0 && commands <= par) stars++;
    return stars;
  }

  return {
    WORLD, LEVELS, byId,
    ANIMAL_R, FOX_R, NEST_R, EGG_R, KEY_R,
    borderWalls, wallsOf,
    segmentRectT, segmentHitsWalls, segmentHitsCircles,
    pointSegmentDistance, eggsCollectedBy,
    slideDestination,
    starsFor,
  };
})();
