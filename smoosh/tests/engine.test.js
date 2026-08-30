// Core rules. Run from smoosh/ dir: node tests/engine.test.js
// No deps -- engine.js is DOM-free on purpose, so it loads straight into Node.

const Engine = require('../js/engine.js');

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
function nope(v, msg) { if (v) throw new Error(msg || `expected falsy, got ${JSON.stringify(v)}`); }

const lvl = (over) => Object.assign({ tiles: [6, 4, 3], goal: { value: 27 } }, over || {});

console.log('arithmetic');

test('the four operators', () => {
  eq(Engine.apply(6, 4, '+'), 10);
  eq(Engine.apply(6, 4, '-'), 2);
  eq(Engine.apply(6, 4, '×'), 24);
  eq(Engine.apply(12, 4, '÷'), 3);
});

test('division must come out even', () => {
  eq(Engine.apply(7, 2, '÷'), null);
  eq(Engine.apply(7, 0, '÷'), null);
  eq(Engine.apply(8, 2, '÷'), 4);
});

test('negatives are refused unless the level allows them', () => {
  eq(Engine.apply(4, 6, '-'), null);
  eq(Engine.apply(4, 6, '-', { neg: true }), -2);
});

console.log('expressions');

test('a bare number never gets brackets', () => {
  const s = Engine.newState(lvl());
  const m = Engine.merge(s, 't0', 't1', '+');
  eq(m.tiles[0].expr, '6 + 4');
});

test('lower precedence gets bracketed under a higher one', () => {
  const s = Engine.newState(lvl());
  const plus = Engine.merge(s, 't0', 't1', '+');        // 6 + 4
  const times = Engine.merge(plus, plus.last, 't2', '×'); // (6 + 4) x 3
  eq(times.tiles[0].expr, '(6 + 4) × 3');
  eq(times.tiles[0].v, 30);
});

test('higher precedence does not get bracketed under a lower one', () => {
  const s = Engine.newState(lvl());
  const times = Engine.merge(s, 't0', 't1', '×');
  const plus = Engine.merge(times, times.last, 't2', '+');
  eq(plus.tiles[0].expr, '6 × 4 + 3');
});

test('minus and divide bracket their right side at equal precedence', () => {
  // 10 - (3 - 1) is not 10 - 3 - 1, and the readout must not lie about it.
  const s = Engine.newState({ tiles: [10, 3, 1], goal: { value: 8 } });
  const inner = Engine.merge(s, 't1', 't2', '-');        // 3 - 1
  const outer = Engine.merge(inner, 't0', inner.last, '-');
  eq(outer.tiles[0].expr, '10 - (3 - 1)');
  eq(outer.tiles[0].v, 8);
});

test('the expression always evaluates to the tile value', () => {
  // Walk a few random boards and check the printed string against the number.
  // A parenthesisation bug is invisible on the tile and fatal to the lesson.
  const ops = ['+', '-', '×', '÷'];
  let checked = 0;
  for (let seed = 0; seed < 300; seed++) {
    let s = Engine.newState({ tiles: [12, 6, 4, 2, 3], goal: { value: -1 }, neg: true });
    let r = seed;
    while (s.tiles.length > 1) {
      r = (r * 1103515245 + 12345) & 0x7fffffff;
      const i = r % s.tiles.length;
      const j = (i + 1 + (r >> 8) % (s.tiles.length - 1)) % s.tiles.length;
      const op = ops[(r >> 16) % 4];
      const next = Engine.merge(s, s.tiles[i].id, s.tiles[j].id, op);
      if (!next) break;
      s = next;
    }
    for (const t of s.tiles) {
      const js = t.expr.replace(/×/g, '*').replace(/÷/g, '/');
      // eslint-disable-next-line no-eval
      eq(eval(js), t.v, t.expr);
      checked++;
    }
  }
  ok(checked > 300, 'expected to have checked a good few, got ' + checked);
});

console.log('merging');

test('a merge eats one tile and leaves the fused one in place', () => {
  const s = Engine.newState({ tiles: [1, 2, 3, 4], goal: { value: 99 } });
  const m = Engine.merge(s, 't1', 't2', '+');
  eq(m.tiles.map((t) => t.v), [1, 5, 4], 'the fused tile takes the left slot');
  eq(m.moves, 1);
  eq(m.log.length, 1);
});

test('an illegal merge returns null and changes nothing', () => {
  const s = Engine.newState({ tiles: [7, 2], goal: { value: 3 } });
  eq(Engine.merge(s, 't0', 't1', '÷'), null);
  eq(s.tiles.length, 2);
});

test('a collar only fuses with its own operator, from either side', () => {
  const s = Engine.newState({ tiles: [{ v: 9, collar: '×' }, 4], goal: { value: 36 } });
  nope(Engine.legal(s, 't0', 't1', '+').ok);
  nope(Engine.legal(s, 't1', 't0', '+').ok, 'the collar is on the tile, not the slot');
  ok(Engine.legal(s, 't0', 't1', '×').ok);
});

test('fusing burns the collar off', () => {
  const s = Engine.newState({ tiles: [{ v: 9, collar: '×' }, 4, 5], goal: { value: 41 } });
  const m = Engine.merge(s, 't0', 't1', '×');
  eq(m.tiles[0].collar, null);
  ok(Engine.legal(m, m.last, 't2', '+').ok);
});

console.log('goals and stars');

test('exact, at-least and at-most goals', () => {
  ok(Engine.goalHit({ value: 24 }, 24));
  nope(Engine.goalHit({ value: 24 }, 25));
  ok(Engine.goalHit({ atLeast: 100 }, 200));
  nope(Engine.goalHit({ atLeast: 100 }, 99));
  ok(Engine.goalHit({ atMost: 10 }, 3));
  nope(Engine.goalHit({ atMost: 10 }, 11));
});

test('one star for the target, two for using everything', () => {
  const s = Engine.newState({ tiles: [6, 4, 3], goal: { value: 24 } });
  const two = Engine.merge(s, 't0', 't1', '×');            // 24, with a 3 left over
  eq(Engine.status(two).stars, 1);
  ok(Engine.status(two).solved);
  nope(Engine.status(two).usedAll);
});

test('the third star is the twist, and only the twist', () => {
  const level = { tiles: [6, 4, 3], goal: { value: 27 }, twist: { kind: 'banOp', op: '-' } };
  const s = Engine.newState(level);
  const a = Engine.merge(s, 't0', 't1', '×');
  const b = Engine.merge(a, a.last, 't2', '+');            // 6 x 4 + 3, no minus
  eq(Engine.status(b).stars, 3);

  const s2 = Engine.newState({ tiles: [6, 4, 3], goal: { value: 27 }, twist: { kind: 'mustUse', op: '÷' } });
  const c = Engine.merge(s2, 't0', 't1', '×');
  const d = Engine.merge(c, c.last, 't2', '+');
  eq(Engine.status(d).stars, 2, 'solved and used everything, but never divided');
});

test('every twist kind judges the log it is given', () => {
  const log = [{ a: 6, b: 4, op: '×', v: 24 }, { a: 24, b: 3, op: '+', v: 27 }];
  ok(Engine.twistMet({ kind: 'banOp', op: '-' }, log));
  nope(Engine.twistMet({ kind: 'banOp', op: '+' }, log));
  ok(Engine.twistMet({ kind: 'mustUse', op: '×' }, log));
  nope(Engine.twistMet({ kind: 'mustUse', op: '×', times: 2 }, log));
  ok(Engine.twistMet({ kind: 'cap', n: 27 }, log));
  nope(Engine.twistMet({ kind: 'cap', n: 26 }, log));
  ok(Engine.twistMet({ kind: 'endWith', op: '+' }, log));
  nope(Engine.twistMet({ kind: 'endWith', op: '×' }, log));
  ok(Engine.twistMet({ kind: 'grow' }, log));
  nope(Engine.twistMet({ kind: 'grow' }, [{ a: 6, b: 4, op: '-', v: 2 }]));
});

test('every twist kind has words for the chip', () => {
  for (const kind of Object.keys(Engine.TWISTS)) {
    const t = { kind, op: '÷', n: 50, times: 2 };
    ok(Engine.twistText(t).length > 0, kind + ' has no text');
  }
});

console.log('stuck');

test('stuck means no legal pairing is left, and is not a loss', () => {
  // 5 and 3, target 100: plus/minus/times/divide all miss, but moves exist.
  const alive = Engine.newState({ tiles: [5, 3], goal: { value: 100 } });
  ok(Engine.anyMoveLeft(alive));
  nope(Engine.status(alive).solved);

  // 3 and 5 with no negatives and no even division: only + and x are legal, so
  // still not stuck. A truly stuck board needs every option closed.
  const dead = Engine.newState({ tiles: [{ v: 3, collar: '÷' }, 5], goal: { value: 100 } });
  nope(Engine.anyMoveLeft(dead), '3 does not divide 5 evenly either way');
  ok(Engine.status(dead).stuck);
});

test('a single tile is never stuck-with-moves', () => {
  const s = Engine.newState({ tiles: [7], goal: { value: 99 } });
  nope(Engine.anyMoveLeft(s));
});

console.log('solver');

test('finds a three-star route when one exists', () => {
  const s = Engine.newState({ tiles: [2, 3, 4, 5], goal: { value: 24 }, twist: { kind: 'banOp', op: '-' } });
  const sol = Engine.solve(s, { useAll: true, twist: true });
  ok(sol, 'no solution found');
  eq(sol.length, 3, 'four tiles means three moves');
  ok(sol.every((m) => m.op !== '-'), 'the twist was ignored');
});

test('returns null rather than lying', () => {
  const s = Engine.newState({ tiles: [2, 2], goal: { value: 1000 } });
  eq(Engine.solve(s, { useAll: true }), null);
});

test('does not memo away a twist solution', () => {
  // Regression: the solver used to key its memo on tile values alone. Two
  // boards with the same numbers are NOT interchangeable once a twist judges
  // the move log -- one may have spent the banned operator already. This level
  // is solvable without a plus and the solver used to swear it was not.
  const s = Engine.newState({ tiles: [8, 7, 6, 5, 4], goal: { value: 210 }, twist: { kind: 'banOp', op: '+' } });
  const sol = Engine.solve(s, { useAll: true, twist: true });
  ok(sol, 'no plus-free route found');
  ok(sol.every((m) => m.op !== '+'));
});

console.log('two-lock gates');

test('a gate with two locks needs both showing at once', () => {
  const l = { tiles: [6, 9, 3], goals: [{ value: 6 }, { value: 12 }], twist: { kind: 'grow' } };
  let s = Engine.newState(l);
  ok(!Engine.status(s).solved, 'solved before anything was made');
  s = Engine.merge(s, s.tiles[1].id, s.tiles[2].id, '+');   // 9 + 3 = 12
  const st = Engine.status(s);
  ok(st.solved, 'both locks were satisfied and it said no');
  eq(st.winnerIds.length, 2, 'a two-lock gate reported one winner');
  ok(st.usedAll, 'one tile per lock IS using everything');
  eq(st.stars >= 2, true);
});

test('two locks cannot be satisfied by the same tile', () => {
  const l = { tiles: [12, 5], goals: [{ value: 12 }, { value: 12 }] };
  const s = Engine.newState(l);
  ok(!Engine.status(s).solved, 'one 12 answered for two locks');
});

test('matching backtracks rather than grabbing greedily', () => {
  // The greedy trap: the loose lock takes the tile the exact lock needed, and
  // a solved board reads as unsolved. Order the goals so greed picks wrong.
  const tiles = [{ id: 'a', v: 6 }, { id: 'b', v: 7 }];
  const m = Engine.matchGoals([{ atLeast: 5 }, { value: 6 }], tiles);
  ok(m, 'no assignment found where one plainly exists');
  eq(m, ['b', 'a']);
});

test('the target strip names every lock', () => {
  eq(Engine.goalsText(Engine.newState({ tiles: [1], goal: { value: 8 } })), '8');
  const two = Engine.newState({ tiles: [1], goals: [{ value: 8 }, { atLeast: 20 }] });
  ok(Engine.goalsText(two).indexOf('8') >= 0 && Engine.goalsText(two).indexOf('20') >= 0,
     'a two-lock gate did not show both numbers');
});

console.log('the Sap Shears');

test('an even seed halves, an odd one does not', () => {
  const s = Engine.newState({ tiles: [12, 7, 5], goal: { value: 4 }, shears: 1 });
  ok(Engine.canSplit(s, s.tiles[0].id).ok, '12 refused to halve');
  eq(Engine.canSplit(s, s.tiles[1].id).why, 'not even');
  const next = Engine.split(s, s.tiles[0].id);
  ok(next, 'the cut returned nothing');
  eq(next.tiles.map((t) => t.v), [6, 6, 7, 5], 'the halves are wrong or in the wrong place');
  eq(next.shears, 0, 'the shears were not spent');
  eq(s.tiles.map((t) => t.v), [12, 7, 5], 'the cut mutated the state it was given');
});

test('a cut seed forgets its expression', () => {
  // Two halves of (4 + 8) are two 6s, not two copies of "4 + 8". Printing an
  // expression that does not evaluate to the number above it is worse than
  // printing nothing.
  let s = Engine.newState({ tiles: [4, 8, 3], goal: { value: 6 }, shears: 1 });
  s = Engine.merge(s, s.tiles[0].id, s.tiles[1].id, '+');
  s = Engine.split(s, s.tiles[0].id);
  const halves = s.tiles.filter((t) => t.v === 6);
  eq(halves.length, 2);
  for (const h of halves) { eq(h.expr, '6'); eq(h.leaf, true); }
});

test('vine-bound seeds cannot be cut, and neither can nothing', () => {
  const s = Engine.newState({ tiles: [{ v: 12, collar: '×' }, 6, 5], goal: { value: 3 }, shears: 1 });
  eq(Engine.canSplit(s, s.tiles[0].id).why, 'collar');
  eq(Engine.split(s, s.tiles[0].id), null);
  const none = Engine.newState({ tiles: [12, 6, 5], goal: { value: 3 } });
  eq(Engine.canSplit(none, none.tiles[0].id).why, 'no shears');
});

test('cuts stay out of the move log, where the twists live', () => {
  // A twist is a rule about OPERATORS. Feeding it a move with no operator is
  // how you get a `grow` twist that can never be met for reasons nobody can
  // see on screen.
  let s = Engine.newState({ tiles: [10, 3, 4], goal: { value: 8 }, shears: 1,
                            twist: { kind: 'grow' } });
  s = Engine.split(s, s.tiles[0].id);
  eq(s.log.length, 0, 'a cut was logged as a move');
  eq(s.cuts.length, 1, 'the cut was not recorded anywhere');
  s = Engine.merge(s, s.tiles[0].id, s.tiles[2].id, '+');   // 5 + 3 = 8
  ok(Engine.twistMet(s.twist, s.log), 'a cut broke a twist it has no business judging');
});

test('a lone even seed is not stuck while shears remain', () => {
  const s = Engine.newState({ tiles: [8], goal: { value: 4 }, shears: 1 });
  ok(Engine.anyMoveLeft(s), 'called it stuck with a cut still available');
  const spent = Engine.newState({ tiles: [8], goal: { value: 4 } });
  ok(!Engine.anyMoveLeft(spent), 'found a move on a lone tile with no shears');
});

test('the solver knows how to use the shears', () => {
  const s = Engine.newState({ tiles: [10, 3, 9], goal: { value: 8 }, shears: 1 });
  const sol = Engine.solve(s, { budget: 500000 });
  ok(sol, 'no route found to 8');
  ok(sol.some((m) => m.cut !== undefined), 'solved 8 from 10, 3, 9 without cutting anything');
});


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
