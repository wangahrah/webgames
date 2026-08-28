// Quest level + geometry tests. Run from chicken/ dir: node tests/levels.test.js
// No deps — plain Node, vm sandbox to load the browser source. levels.js is
// deliberately DOM-free so all of this runs headless; the drawing on top of it
// is verified by play (see the smoke checklist in README.md).

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { console };
vm.createContext(ctx);
for (const f of ['js/ops.js', 'js/cluck.js', 'js/levels.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx);
}
const { Levels, compileCluck, cluckStatementCount } = ctx;

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); }
}
function eq(a, b) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
  }
}
function ok(v, msg) { if (!v) throw new Error(msg || `expected truthy, got ${v}`); }
function nope(v, msg) { if (v) throw new Error(msg || `expected falsy, got ${JSON.stringify(v)}`); }
function near(a, b, tol, msg) {
  if (Math.abs(a - b) > tol) throw new Error(`${msg || ''} got ${a} want ~${b}`);
}

console.log('level table');

test('every level has the fields the renderer reads', () => {
  for (const l of Levels.LEVELS) {
    ok(typeof l.id === 'string' && l.id, `${l.name}: id`);
    ok(typeof l.name === 'string' && l.name, `${l.id}: name`);
    ok(typeof l.hint === 'string' && l.hint, `${l.id}: hint`);
    ok(l.start && typeof l.start.x === 'number' && typeof l.start.y === 'number',
       `${l.id}: start`);
    ok(l.nest && typeof l.nest.x === 'number', `${l.id}: nest`);
    ok(Array.isArray(l.eggs) && Array.isArray(l.walls) && Array.isArray(l.foxes),
       `${l.id}: arrays`);
    ok(typeof l.par === 'number' && l.par > 0, `${l.id}: par`);
    ok(typeof l.starter === 'string', `${l.id}: starter`);
  }
});

test('level ids are unique', () => {
  const ids = Levels.LEVELS.map(l => l.id);
  eq(ids.length, new Set(ids).size);
});

test('byId finds a level and misses gracefully', () => {
  ok(Levels.byId('fence'));
  eq(Levels.byId('nope'), null);
});

test('everything sits inside the world', () => {
  const { w, h } = Levels.WORLD;
  const inside = (p, what) => {
    ok(p.x >= 0 && p.x <= w && p.y >= 0 && p.y <= h, what);
  };
  for (const l of Levels.LEVELS) {
    inside(l.start, `${l.id}: start`);
    inside(l.nest, `${l.id}: nest`);
    l.eggs.forEach((e, i) => inside(e, `${l.id}: egg ${i}`));
    l.foxes.forEach((f, i) => inside(f, `${l.id}: fox ${i}`));
  }
});

test('nobody starts inside a wall or on a fox', () => {
  for (const l of Levels.LEVELS) {
    const r = Levels.ANIMAL_R;
    for (const w of l.walls) {
      const t = Levels.segmentRectT(l.start.x, l.start.y, l.start.x, l.start.y, w, r);
      eq(t === null, true, `${l.id}: start inside a wall`);
    }
    const fox = Levels.segmentHitsCircles(
      l.start.x, l.start.y, l.start.x, l.start.y, l.foxes,
      Levels.FOX_R + Levels.ANIMAL_R);
    eq(fox, null);
  }
});

test('no egg or basket is buried inside a fence', () => {
  for (const l of Levels.LEVELS) {
    for (const w of l.walls) {
      for (const p of l.eggs.concat([l.nest])) {
        const t = Levels.segmentRectT(p.x, p.y, p.x, p.y, w, 0);
        eq(t === null, true, `${l.id}: (${p.x},${p.y}) is inside a wall`);
      }
    }
  }
});

test('optional mechanic fields are well-formed', () => {
  for (const l of Levels.LEVELS) {
    const pt = (p, what) =>
      ok(p && typeof p.x === 'number' && typeof p.y === 'number', `${l.id}: ${what}`);
    const rect = (r, what) =>
      ok(r && typeof r.x === 'number' && typeof r.w === 'number' &&
         typeof r.h === 'number', `${l.id}: ${what}`);
    if (l.keys !== undefined) {
      ok(Array.isArray(l.keys), `${l.id}: keys is an array`);
      l.keys.forEach((k, i) => pt(k, `key ${i}`));
    }
    if (l.gates !== undefined) {
      ok(Array.isArray(l.gates), `${l.id}: gates is an array`);
      l.gates.forEach((g, i) => rect(g, `gate ${i}`));
    }
    if (l.ice !== undefined) {
      ok(Array.isArray(l.ice), `${l.id}: ice is an array`);
      l.ice.forEach((r, i) => rect(r, `ice ${i}`));
    }
    if (l.pads !== undefined) {
      ok(Array.isArray(l.pads), `${l.id}: pads is an array`);
      l.pads.forEach((p, i) => { pt(p.a, `pad ${i} a`); pt(p.b, `pad ${i} b`); });
    }
  }
});

test('gates always come with keys, and nothing starts inside one', () => {
  for (const l of Levels.LEVELS) {
    if (!l.gates || l.gates.length === 0) continue;
    ok(l.keys && l.keys.length > 0, `${l.id}: a gate with no key is just a wall`);
    const blocked = [l.start, l.nest, ...l.eggs, ...l.keys];
    for (const g of l.gates) {
      for (const p of blocked) {
        const t = Levels.segmentRectT(p.x, p.y, p.x, p.y, g, 0);
        eq(t === null, true, `${l.id}: (${p.x},${p.y}) sits inside a gate`);
      }
      for (const w of l.walls) {
        const t = Levels.segmentRectT(w.x, w.y, w.x, w.y, g, 0);
        eq(t === null, true, `${l.id}: a gate overlaps a wall`);
      }
    }
  }
});

test('ice never sits under a wall or a gate', () => {
  for (const l of Levels.LEVELS) {
    if (!l.ice || l.ice.length === 0) continue;
    for (const r of l.ice) {
      for (const w of (l.walls || []).concat(l.gates || [])) {
        const overlap = w.x < r.x + r.w && r.x < w.x + w.w &&
                        w.y < r.y + r.h && r.y < w.y + w.h;
        eq(overlap, false, `${l.id}: ice rect overlaps a wall`);
      }
    }
  }
});

test('pads sit clear of walls, ice, and each other', () => {
  for (const l of Levels.LEVELS) {
    if (!l.pads || l.pads.length === 0) continue;
    const ends = [];
    for (const p of l.pads) ends.push(p.a, p.b);
    for (const p of ends) {
      const rects = (l.walls || []).concat(l.gates || []).concat(l.ice || []);
      for (const w of rects) {
        eq(Levels.segmentRectT(p.x, p.y, p.x, p.y, w, Levels.PAD_R), null,
           `${l.id}: pad ring overlaps a rect`);
      }
      for (const q of [l.start, l.nest, ...l.eggs, ...(l.keys || [])]) {
        ok(Math.hypot(p.x - q.x, p.y - q.y) > Levels.PAD_R,
           `${l.id}: something sits inside a pad ring`);
      }
    }
    for (let i = 0; i < ends.length; i++) {
      for (let j = i + 1; j < ends.length; j++) {
        ok(Math.hypot(ends[i].x - ends[j].x, ends[i].y - ends[j].y) > 2 * Levels.PAD_R,
           `${l.id}: two pad rings overlap`);
      }
    }
  }
});

console.log('\nwall geometry');

const WALL = { x: 100, y: 0, w: 20, h: 200 };

test('a wall across the path is hit', () => {
  const hit = Levels.segmentHitsWalls(0, 100, 300, 100, [WALL], 0);
  ok(hit);
  near(hit.t, 100 / 300, 1e-6, 'contact time');
});

test('a wall beside the path is missed', () => {
  nope(Levels.segmentHitsWalls(0, 400, 300, 400, [WALL], 0));
});

test('the animal is fat: it stops short of the wall by its radius', () => {
  const hit = Levels.segmentHitsWalls(0, 100, 300, 100, [WALL], 20);
  ok(hit);
  near(hit.t * 300, 80, 1e-6, 'contact x');
});

test('a path that stops before the wall never reaches it', () => {
  nope(Levels.segmentHitsWalls(0, 100, 70, 100, [WALL], 0));
});

test('grazing past the end of a wall is not a hit', () => {
  // The wall stops at y=200; walking along y=260 with r=20 clears it.
  nope(Levels.segmentHitsWalls(0, 260, 300, 260, [WALL], 20));
});

test('the earliest of several walls wins', () => {
  const far = { x: 200, y: 0, w: 20, h: 200 };
  const hit = Levels.segmentHitsWalls(0, 100, 300, 100, [far, WALL], 0);
  eq(hit.wall.x, 100);
});

test('the world border is a wall you can bump', () => {
  const walls = Levels.borderWalls();
  const hit = Levels.segmentHitsWalls(500, 375, 5000, 375, walls, Levels.ANIMAL_R);
  ok(hit);
  const x = 500 + (5000 - 500) * hit.t;
  near(x, Levels.WORLD.w - Levels.ANIMAL_R, 1e-6, 'stops at the fence line');
});

test('wallsOf appends the border to a level\'s own walls', () => {
  const lv = Levels.byId('fence');
  eq(Levels.wallsOf(lv).length, lv.walls.length + 4);
});

console.log('\nfoxes and eggs');

test('a fox on the path ends the run, one off it does not', () => {
  const foxes = [{ x: 200, y: 100 }];
  const r = Levels.FOX_R + Levels.ANIMAL_R;
  ok(Levels.segmentHitsCircles(0, 100, 400, 100, foxes, r));
  nope(Levels.segmentHitsCircles(0, 300, 400, 300, foxes, r));
});

test('the fox is caught on approach, not at its centre', () => {
  const hit = Levels.segmentHitsCircles(0, 0, 400, 0, [{ x: 200, y: 0 }], 50);
  near(hit.t * 400, 150, 1e-6, 'contact x');
});

test('starting already inside the danger circle is an immediate hit', () => {
  const hit = Levels.segmentHitsCircles(200, 0, 400, 0, [{ x: 200, y: 0 }], 50);
  eq(hit.t, 0);
});

test('eggs are collected by brushing past mid-segment', () => {
  const eggs = [{ x: 200, y: 0 }, { x: 200, y: 500 }];
  eq(Levels.eggsCollectedBy(0, 0, 400, 0, eggs, new Set()), [0]);
});

test('an egg already collected is not collected twice', () => {
  const eggs = [{ x: 200, y: 0 }];
  eq(Levels.eggsCollectedBy(0, 0, 400, 0, eggs, new Set([0])), []);
});

test('eggsCollectedBy takes an array as well as a Set', () => {
  const eggs = [{ x: 200, y: 0 }];
  eq(Levels.eggsCollectedBy(0, 0, 400, 0, eggs, [0]), []);
  eq(Levels.eggsCollectedBy(0, 0, 400, 0, eggs, []), [0]);
});

test('point-to-segment distance clamps to the ends', () => {
  near(Levels.pointSegmentDistance(500, 0, 0, 0, 100, 0), 400, 1e-6);
  near(Levels.pointSegmentDistance(50, 30, 0, 0, 100, 0), 30, 1e-6);
});

console.log('\nice');

const POND = [{ x: 300, y: 225, w: 400, h: 300 }];

test('a move ending on ice glides to the far edge', () => {
  const out = Levels.slideDestination(0, 275, 400, 275, POND);
  near(out.x, 700.5, 1e-6, 'exit x');
  near(out.y, 275, 1e-6, 'exit y');
});

test('a move clearing the pond in one stride does not slide', () => {
  eq(Levels.slideDestination(0, 275, 800, 275, POND), null);
});

test('a move ending off the ice never slides', () => {
  eq(Levels.slideDestination(0, 100, 400, 100, POND), null);
});

test('a move ending just short of the pond does not slide', () => {
  eq(Levels.slideDestination(0, 275, 299, 275, POND), null);
});

test('slides chain across adjacent ponds', () => {
  const twin = [
    { x: 300, y: 225, w: 400, h: 300 },
    { x: 700, y: 225, w: 200, h: 300 },
  ];
  const out = Levels.slideDestination(0, 375, 500, 375, twin);
  near(out.x, 900.5, 1e-6, 'chained exit x');
  near(out.y, 375, 1e-6, 'chained exit y');
});

test('diagonal glides exit along the same slope', () => {
  const square = [{ x: 300, y: 300, w: 400, h: 400 }];
  const out = Levels.slideDestination(0, 0, 500, 500, square);
  ok(out.x > 700 && out.y > 700, `exited past the far corner: ${out.x},${out.y}`);
  near(out.y / out.x, 1, 1e-6, 'slope preserved');
});

console.log('\nwarp pads');

const PADS = [{ a: { x: 300, y: 600 }, b: { x: 650, y: 375 } }];

test('a pad fires when the path enters its ring', () => {
  const hit = Levels.padHit(125, 600, 350, 600, PADS, null);
  ok(hit);
  eq(hit.pair, 0);
  eq(hit.end, 'a');
  near(hit.x, 300, 1e-6, 'pad centre x');
});

test('a path that stops short of the ring does not fire', () => {
  eq(Levels.padHit(125, 600, 260, 600, PADS, null), null);
});

test('the pair you just came through is inert', () => {
  eq(Levels.padHit(650, 375, 660, 375, PADS, 0), null);
  ok(Levels.padHit(600, 375, 700, 375, PADS, null), 'fires once re-armed');
});

test('pads fire in both directions', () => {
  const hit = Levels.padHit(700, 375, 500, 375, PADS, null);
  ok(hit);
  eq(hit.end, 'b');
});


console.log('\nevery level is still winnable');

// A headless stand-in for coop.js's playback loop: walk the compiled queue in
// small steps and run each one through the same geometry the renderer uses.
// It is not the renderer, but it is the same rules, which is what a level
// table can actually be held to.
function simulate(level, program) {
  const queue = compileCluck(program);
  const eggs = new Set();
  const keys = new Set();
  const keyTotal = (level.keys || []).length;
  const STEP = 5;
  let x = level.start.x, y = level.start.y, heading = level.start.heading || 0;
  let nestArmed = false;
  const nd = (px, py) => Math.hypot(px - level.nest.x, py - level.nest.y);

  // Gates stand only while their key is missing — re-checked every step, the
  // same way the renderer rebuilds its wall list the moment a key is grabbed.
  function wallsNow() {
    const w = Levels.wallsOf(level);
    if (level.gates && level.gates.length > 0 && keys.size < keyTotal) {
      return w.concat(level.gates);
    }
    return w;
  }
  const isGate = w => !!level.gates && level.gates.indexOf(w) !== -1;

  let lastPad = null;

  // Walk from (x0,y0) toward (x1,y1) in small steps; the shared (x, y) tracks
  // the walker. Walls, gates, foxes, the nest, eggs, keys and warp pads all
  // apply per step; ice is folded into the endpoint by the caller. Returns
  // the outcome that stopped the walk, or null when it completed.
  function walk(x0, y0, x1, y1, depth) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    if (len < 1e-9) return null;
    const sx = (x1 - x0) / len, sy = (y1 - y0) / len;
    let travelled = 0;
    while (travelled < len - 1e-9) {
      const stepLen = Math.min(STEP, len - travelled);
      travelled += stepLen;
      const nx = x0 + sx * travelled, ny = y0 + sy * travelled;
      const walls = wallsNow();

      const wall = Levels.segmentHitsWalls(x, y, nx, ny, walls, Levels.ANIMAL_R);
      const fox = level.foxes.length
        ? Levels.segmentHitsCircles(x, y, nx, ny, level.foxes,
                                    Levels.FOX_R + Levels.ANIMAL_R)
        : null;
      const nest = nestArmed
        ? Levels.segmentHitsCircles(x, y, nx, ny, [level.nest], Levels.NEST_R)
        : null;

      let stop = null;
      const consider = (h, outcome) => {
        if (h && (!stop || h.t < stop.t)) stop = { t: h.t, outcome };
      };
      consider(wall, wall && isGate(wall.wall) ? 'locked' : 'bump');
      consider(fox, 'caught');
      consider(nest, 'win');

      const t = stop ? stop.t : 1;
      let ex = x + (nx - x) * t, ey = y + (ny - y) * t;

      // Warp pads truncate the step at the ring's centre.
      let warped = null;
      if (level.pads && level.pads.length > 0 && depth < 16 && !stop) {
        warped = Levels.padHit(x, y, ex, ey, level.pads, lastPad);
        if (warped) { ex = warped.x; ey = warped.y; }
      }

      for (const i of Levels.eggsCollectedBy(x, y, ex, ey, level.eggs, eggs)) {
        eggs.add(i);
      }
      for (const i of Levels.eggsCollectedBy(x, y, ex, ey, level.keys || [],
                                             keys, Levels.KEY_R)) {
        keys.add(i);
      }
      if (!nestArmed && Math.max(nd(x, y), nd(ex, ey)) > Levels.NEST_R) {
        nestArmed = true;
      }

      // The pair just used stays inert until its rings are left behind.
      if (lastPad !== null) {
        const pair = level.pads[lastPad];
        const d = Math.min(
          Math.hypot(ex - pair.a.x, ey - pair.a.y),
          Math.hypot(ex - pair.b.x, ey - pair.b.y));
        if (d > Levels.PAD_R + 6) lastPad = null;
      }

      x = ex; y = ey;
      if (stop) return stop.outcome;

      if (warped) {
        const twin = warped.end === 'a'
          ? level.pads[warped.pair].b
          : level.pads[warped.pair].a;
        lastPad = warped.pair;
        let rx = twin.x + (x1 - warped.x), ry = twin.y + (y1 - warped.y);
        if (level.ice && level.ice.length > 0) {
          const slid = Levels.slideDestination(twin.x, twin.y, rx, ry, level.ice);
          if (slid) { rx = slid.x; ry = slid.y; }
        }
        x = twin.x; y = twin.y;
        return walk(twin.x, twin.y, rx, ry, depth + 1);
      }
    }
    return null;
  }

  for (const op of queue) {
    if (op.op === 'right') { heading += op.arg; continue; }
    if (op.op === 'left') { heading -= op.arg; continue; }
    if (op.op === 'home') {
      x = level.start.x; y = level.start.y; heading = level.start.heading || 0;
      nestArmed = nd(x, y) > Levels.NEST_R;
      continue;
    }
    if (op.op !== 'forward' && op.op !== 'back') continue;

    const sign = op.op === 'forward' ? 1 : -1;
    const rad = heading * Math.PI / 180;
    const total0 = Math.abs(op.arg);
    const ux = sign * Math.cos(rad) * Math.sign(op.arg || 1);
    const uy = sign * Math.sin(rad) * Math.sign(op.arg || 1);

    // Ice: a move that would end on the pond glides on to the far edge.
    // Same direction, longer stride — collisions below still apply per step.
    let total = total0;
    if (level.ice && level.ice.length > 0) {
      const slid = Levels.slideDestination(x, y, x + ux * total0, y + uy * total0,
                                           level.ice);
      if (slid) total = Math.hypot(slid.x - x, slid.y - y);
    }

    const outcome = walk(x, y, x + ux * total, y + uy * total, 0);
    if (outcome) return { outcome, eggs, keys, x, y };
  }
  return { outcome: 'unfinished', eggs, keys, x, y };
}

for (const level of Levels.LEVELS) {
  test(`"${level.name}" solution reaches the basket`, () => {
    const r = simulate(level, level.solution);
    eq(r.outcome, 'win');
  });
  test(`"${level.name}" solution collects every egg`, () => {
    const r = simulate(level, level.solution);
    eq(r.eggs.size, level.eggs.length);
  });
  test(`"${level.name}" solution is within par (${level.par})`, () => {
    const n = cluckStatementCount(level.solution);
    ok(n <= level.par, `solution is ${n} statements, par is ${level.par}`);
  });
  test(`"${level.name}" solution earns three stars`, () => {
    const r = simulate(level, level.solution);
    eq(Levels.starsFor({
      outcome: r.outcome,
      eggsGot: r.eggs.size,
      eggsTotal: level.eggs.length,
      commands: cluckStatementCount(level.solution),
      par: level.par,
    }), 3);
  });
  test(`"${level.name}" starter code compiles`, () => {
    compileCluck(level.starter);
  });
}

test('walking straight into the world edge bumps rather than escapes', () => {
  const lv = Levels.byId('firststeps');
  const r = simulate(lv, 'lt 90\nfd 5000\n');
  eq(r.outcome, 'bump');
  ok(r.y >= 0, 'stayed inside the world');
});

test('the fox level punishes the direct diagonal-ish route', () => {
  const lv = Levels.byId('fox');
  // Straight up the middle, right through the first fox.
  const r = simulate(lv, 'fd 375\nlt 90\nfd 250\nrt 90\nfd 375\n');
  eq(r.outcome, 'caught');
});

test('the fence really does block', () => {
  const lv = Levels.byId('fence');
  const r = simulate(lv, 'fd 700\n');
  eq(r.outcome, 'bump');
});

test('the locked gate reports its own outcome, not a plain bump', () => {
  const lv = Levels.byId('gate');
  const r = simulate(lv, 'fd 750\n');
  eq(r.outcome, 'locked');
});

test('grabbing the key opens the gate mid-program', () => {
  const lv = Levels.byId('gate');
  // South to the key, then straight east through where the gate stood.
  const r = simulate(lv, 'fd 250\nrt 90\nfd 275\nlt 90\nfd 500\nlt 90\nfd 275\n');
  eq(r.outcome, 'win');
  eq(r.keys.size, 1);
});

test('an open gate lets you walk through the gap it left', () => {
  const lv = Levels.byId('gate');
  // Cross the gate line on the key run AND again on the way to the nest.
  const r = simulate(lv, lv.solution);
  eq(r.outcome, 'win');
  eq(r.keys.size, lv.keys.length);
  eq(r.eggs.size, lv.eggs.length);
});

test('a move that would stop mid-pond glides to the far edge instead', () => {
  const lv = Levels.byId('pond');
  const r = simulate(lv, 'fd 250\n');
  eq(r.outcome, 'unfinished');
  near(r.x, 700.5, 0.01, 'glided to the pond edge');
  near(r.y, 375, 0.01, 'row unchanged');
});

test('the lazy row glides you straight into the fence pocket', () => {
  const lv = Levels.byId('pond');
  // Glide east on the start row, then keep walking into the fence.
  const r = simulate(lv, 'fd 250\nfd 100\n');
  eq(r.outcome, 'bump');
});

test('the wormhole carries you across the divider mid-stride', () => {
  const lv = Levels.byId('warp');
  // The naive walk at the egg: the pad eats the stride, egg untouched,
  // and you pop out the far side still heading east.
  const r = simulate(lv, 'fd 225\n');
  eq(r.outcome, 'unfinished');
  ok(r.x > 500, `ended east of the divider: x=${r.x}`);
  eq(r.eggs.size, 0, 'the egg past the pad was never reached');
});

test('you do not bounce straight back out of the far pad', () => {
  const lv = Levels.byId('warp');
  // A long stride east crosses pad A with plenty left over. If landing on
  // the twin re-triggered its ring, you would pop straight back west.
  const r = simulate(lv, 'fd 500\n');
  eq(r.outcome, 'unfinished');
  ok(r.x > 600, `travelled east of the twin: x=${r.x}`);
});

test('a stride emerging onto ice glides too', () => {
  const lv = Levels.byId('warp');
  // Cross the pad with a long stride that would come to rest in the pond.
  const r = simulate(lv, 'fd 400\n');
  eq(r.outcome, 'unfinished');
  ok(r.x > 940, `glided off the pond\'s far edge: x=${r.x}`);
});

test('a basket sitting on the start square is not won at t=0', () => {
  const lv = Levels.byId('roundabout');
  eq(lv.nest.x, lv.start.x);
  eq(lv.nest.y, lv.start.y);
  const r = simulate(lv, 'fd 10\n');
  eq(r.outcome, 'unfinished');
});

console.log('\nstars');

const WIN = { outcome: 'win', eggsGot: 3, eggsTotal: 3, commands: 3, par: 3 };

test('a perfect run is three stars', () => eq(Levels.starsFor(WIN), 3));
test('missing an egg costs the second star', () =>
  eq(Levels.starsFor({ ...WIN, eggsGot: 2 }), 2));
test('going over par costs the third star', () =>
  eq(Levels.starsFor({ ...WIN, commands: 4 }), 2));
test('sloppy but finished is still one star', () =>
  eq(Levels.starsFor({ ...WIN, eggsGot: 0, commands: 40 }), 1));
test('a level with no eggs hands out the egg star', () =>
  eq(Levels.starsFor({ outcome: 'win', eggsGot: 0, eggsTotal: 0, commands: 1, par: 1 }), 3));
test('not reaching the basket is no stars, however tidy', () => {
  eq(Levels.starsFor({ ...WIN, outcome: 'bump' }), 0);
  eq(Levels.starsFor({ ...WIN, outcome: 'caught' }), 0);
  eq(Levels.starsFor({ ...WIN, outcome: 'unfinished' }), 0);
});
test('starsFor survives being handed nothing', () => eq(Levels.starsFor(), 0));

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
