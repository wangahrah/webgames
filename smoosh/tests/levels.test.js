// The authored level table. Run from smoosh/ dir: node tests/levels.test.js
//
// The important test here is the last one: every level is walked through the
// real engine by brute force to prove all three stars are reachable at once.
// That is why no solution is authored in levels.js -- a hand-written solution
// proves only that one route works, and it rots the moment a tile changes.

const Engine = require('../js/engine.js');
const Levels = require('../js/levels.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); }
}
function ok(v, msg) { if (!v) throw new Error(msg || `expected truthy, got ${v}`); }

console.log('level table');

test('every level has the fields the board reads', () => {
  for (const l of Levels.LEVELS) {
    ok(typeof l.id === 'string' && l.id, 'id');
    ok(typeof l.name === 'string' && l.name, l.id + ': name');
    ok(typeof l.hint === 'string' && l.hint, l.id + ': hint');
    ok(Array.isArray(l.tiles) && l.tiles.length >= 3, l.id + ': tiles');
    ok(l.goal && (l.goal.value !== undefined || l.goal.atLeast !== undefined ||
                  l.goal.atMost !== undefined), l.id + ': goal');
    ok(l.twist && Engine.TWISTS[l.twist.kind], l.id + ': twist kind');
    ok(Engine.twistText(l.twist).length > 0, l.id + ': twist has words');
  }
});

test('ids are unique and byId finds them', () => {
  const seen = new Set();
  for (const l of Levels.LEVELS) {
    ok(!seen.has(l.id), 'duplicate id ' + l.id);
    seen.add(l.id);
    ok(Levels.byId(l.id) === l, l.id + ': byId');
  }
  ok(Levels.byId('nope') === null);
});

test('no level hands out a star for free', () => {
  for (const l of Levels.LEVELS) {
    const s = Engine.newState(l);
    ok(Engine.status(s).stars === 0, l.id + ': starts already solved');
    ok(Engine.anyMoveLeft(s), l.id + ': starts stuck');
  }
});

test('collars only ever name a real operator', () => {
  for (const l of Levels.LEVELS) {
    for (const t of l.tiles) {
      if (typeof t === 'number') continue;
      ok(Engine.OPS.indexOf(t.collar) >= 0, l.id + ': bad collar ' + t.collar);
    }
  }
});

console.log('solvability');

// Walk a solver route back through the real engine. The solver could in
// principle agree with itself and still be wrong about the rules, so nothing
// is believed until the engine itself has re-made every move.
function replay(level, sol, label) {
  let s = Engine.newState(level);
  for (const m of sol) {
    if (m.cut !== undefined) {                       // a Sap Shears halving
      const t = s.tiles.find((x) => x.v === m.cut);
      ok(t, label + ': replay lost the tile to cut');
      const next = Engine.split(s, t.id);
      ok(next, label + ': replay hit an illegal cut of ' + m.cut);
      s = next;
      continue;
    }
    const a = s.tiles.find((t) => t.v === m.a);
    const b = s.tiles.find((t) => t.id !== (a && a.id) && t.v === m.b);
    ok(a && b, label + ': replay lost a tile');
    const next = Engine.merge(s, a.id, b.id, m.op);
    ok(next, label + ': replay hit an illegal move ' + m.a + m.op + m.b);
    s = next;
  }
  return s;
}

test('every level can be three-starred', () => {
  for (const l of Levels.LEVELS) {
    const sol = Engine.solve(Engine.newState(l), { useAll: true, twist: true, budget: 20000000 });
    ok(sol, l.id + ': no route hits the target using every tile with the twist held');
    const st = Engine.status(replay(l, sol, l.id));
    ok(st.stars === 3, l.id + ': replay scored ' + st.stars + ' stars, not 3');
  }
});

test('every level has a low floor as well as a high ceiling', () => {
  // Star 1 must be winnable WITHOUT also collecting star 2, otherwise the two
  // are the same star and the ramp is a cliff. Asked of the replayed BOARD
  // rather than of the move count, because "used everything" stops meaning
  // "one tile left" the moment a gate has two locks or a level hands out
  // shears.
  for (const l of Levels.LEVELS) {
    const sol = Engine.solve(Engine.newState(l), { budget: 20000000 });
    ok(sol, l.id + ': cannot hit the target at all');
    const st = Engine.status(replay(l, sol, l.id));
    ok(st.solved, l.id + ': the shortest route does not actually solve it');
    ok(!st.usedAll,
       l.id + ': the only way to the target uses every seed — no easy first star');
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
