// The endless generator. Run from smoosh/ dir: node tests/gen.test.js
//
// One claim matters above all others: a generated puzzle is ALWAYS solvable to
// three stars. That is the payoff of building backwards from the answer, and
// it is checked here by running the real solver over a lot of seeds.

const Engine = require('../js/engine.js');
const Gen = require('../js/gen.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); }
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error((msg ? msg + ': ' : '') + `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
  }
}
function ok(v, msg) { if (!v) throw new Error(msg || `expected truthy, got ${v}`); }

const DIFFS = ['easy', 'medium', 'hard'];
const SEEDS = 60;

console.log('splitting');

test('every split rebuilds the value it came from', () => {
  const rand = Gen.rng(12345);
  for (let i = 0; i < 400; i++) {
    const v = 2 + Math.floor(rand() * 200);
    for (const op of ['+', '-', '×', '÷']) {
      const s = Gen.split(v, op, 20, rand);
      if (!s) continue;
      eq(Engine.apply(s[0], s[1], op, { neg: false }), v, op + ' on ' + v);
    }
  }
});

console.log('puzzles');

test('the same seed gives the same puzzle', () => {
  for (const d of DIFFS) {
    eq(Gen.puzzle(d, 7), Gen.puzzle(d, 7), d + ' is not deterministic');
  }
});

test('every difficulty produces a puzzle at every seed we try', () => {
  for (const d of DIFFS) {
    for (let s = 1; s <= SEEDS; s++) ok(Gen.puzzle(d, s), d + ' seed ' + s + ' gave up');
  }
});

test('tile counts match the difficulty', () => {
  for (const d of DIFFS) {
    for (let s = 1; s <= 20; s++) eq(Gen.puzzle(d, s).tiles.length, Gen.LEVELS[d].tiles, d);
  }
});

test('no free wins and no free moves on the bench', () => {
  for (const d of DIFFS) {
    for (let s = 1; s <= SEEDS; s++) {
      const p = Gen.puzzle(d, s);
      ok(!p.tiles.some((t) => t === p.goal.value), d + s + ': a tile already IS the target');
      ok(!p.tiles.some((t) => t === 1), d + s + ': a 1 on the bench invites x1 and /1');
      ok(!p.tiles.some((t) => t > Gen.LEVELS[d].maxLeaf), d + s + ': a tile ran away');
      ok(p.tiles.every((t) => Number.isInteger(t) && t > 0), d + s + ': non-positive tile');
    }
  }
});

test('EVERY generated puzzle can be three-starred', () => {
  let n = 0;
  for (const d of DIFFS) {
    for (let s = 1; s <= SEEDS; s++) {
      const p = Gen.puzzle(d, s);
      const sol = Engine.solve(Engine.newState(p), { useAll: true, twist: true, budget: 8000000 });
      ok(sol, d + ' seed ' + s + ': ' + JSON.stringify(p.tiles) + ' -> ' +
             p.goal.value + ' [' + Engine.twistText(p.twist) + '] has no three-star route');
      n++;
    }
  }
  ok(n === DIFFS.length * SEEDS, 'checked ' + n);
});

console.log('twists');

test('the twist is read off a real solution, not invented', () => {
  // Regression: endWith used to name the LAST split, but the player replays the
  // split log backwards, so their last move is the FIRST split. Every generated
  // "finish with a divide" puzzle was unsolvable to three stars.
  const log = [{ a: 6, b: 4, op: '×', v: 24 }, { a: 2, b: 2, op: '+', v: 4 }];
  const t = Gen.twistFrom(log, () => 0.99);   // pushes the draw to the last option
  ok(t.kind === 'cap' || t.kind === 'endWith', 'unexpected ' + t.kind);
  const endWith = Gen.twistFrom(log, () => 0.62);
  if (endWith.kind === 'endWith') eq(endWith.op, '×', 'endWith must name the first split');
});

test('twists vary across seeds', () => {
  const kinds = new Set();
  for (const d of DIFFS) for (let s = 1; s <= SEEDS; s++) kinds.add(Gen.puzzle(d, s).twist.kind);
  ok(kinds.size >= 4, 'only saw ' + [...kinds].join(', ') + ' — the generator is in a rut');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
