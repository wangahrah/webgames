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


console.log('\nevery level is still winnable');

// A headless stand-in for coop.js's playback loop: walk the compiled queue in
// small steps and run each one through the same geometry the renderer uses.
// It is not the renderer, but it is the same rules, which is what a level
// table can actually be held to.
function simulate(level, program) {
  const queue = compileCluck(program);
  const walls = Levels.wallsOf(level);
  const eggs = new Set();
  const STEP = 5;
  let x = level.start.x, y = level.start.y, heading = level.start.heading || 0;
  let nestArmed = false;
  const nd = (px, py) => Math.hypot(px - level.nest.x, py - level.nest.y);

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
    const total = Math.abs(op.arg);
    const ux = sign * Math.cos(rad) * Math.sign(op.arg || 1);
    const uy = sign * Math.sin(rad) * Math.sign(op.arg || 1);

    for (let done = 0; done < total; done += STEP) {
      const len = Math.min(STEP, total - done);
      const nx = x + ux * len, ny = y + uy * len;

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
      consider(wall, 'bump');
      consider(fox, 'caught');
      consider(nest, 'win');

      const t = stop ? stop.t : 1;
      const ex = x + (nx - x) * t, ey = y + (ny - y) * t;
      for (const i of Levels.eggsCollectedBy(x, y, ex, ey, level.eggs, eggs)) {
        eggs.add(i);
      }
      if (!nestArmed && Math.max(nd(x, y), nd(ex, ey)) > Levels.NEST_R) {
        nestArmed = true;
      }
      x = ex; y = ey;
      if (stop) return { outcome: stop.outcome, eggs, x, y };
    }
  }
  return { outcome: 'unfinished', eggs, x, y };
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
