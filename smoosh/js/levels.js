// smoosh levels. Data only — no DOM, no logic. The picker, the board and the
// tests all read this one table, the same way chicken's Levels.LEVELS works.
//
// Adding a level is one row. The fields:
//
//   id      stable key for saved progress. Never renumber an existing one.
//   name    shown in the picker
//   hint    one line, shown under the target. A nudge, never the answer.
//   tiles   the starting numbers. Either a bare number, or {v, collar} where
//           collar is an operator that tile MUST be fused with — a lock that
//           forces a shape onto the solution without narrowing it to one path.
//   goal    {value: n} for an exact target, or {atLeast} / {atMost} for a
//           range. Ranges are the loosest floor there is; good for late levels
//           where "get enormous" is more fun than "land on 210".
//   twist   the third star. See Engine.TWISTS. Always solvable together with
//           the second star — tests/levels.test.js proves it by brute force,
//           which is why no solution is authored here.
//   neg     allow results below zero. Off by default: for most levels a
//           negative is a wrong turn, and forbidding it makes the greyed-out
//           minus button teach something.
//
// TARGET CHOICE IS NOT FREEHAND. Every target below was picked from the
// intersection of two sets, computed by exhaustive search: values reachable by
// SOME subset of the tiles (so star 1 is an easy win — the low floor) and
// values reachable using EVERY tile with the twist held (so stars 2 and 3 are
// both live — the high ceiling). Change a tile and you must re-check the
// target; the test will tell you off if you don't.

var Levels = (function () {
  const LEVELS = [
    {
      id: 'first-fuse',
      name: 'First Fuse',
      hint: 'Tap two tiles, then pick an operator. Three tiles, one target.',
      tiles: [3, 4, 5],
      goal: { value: 12 },
      twist: { kind: 'banOp', op: '-' },
    },
    {
      id: 'twenty-four',
      name: 'Twenty-Four',
      hint: 'The oldest number puzzle there is. Make 24.',
      tiles: [2, 3, 4, 5],
      goal: { value: 24 },
      twist: { kind: 'banOp', op: '-' },
    },
    {
      id: 'fifty-six',
      name: 'Fifty-Six',
      hint: 'Two of these tiles get you most of the way in one move.',
      tiles: [7, 8, 3, 2],
      goal: { value: 56 },
      twist: { kind: 'cap', n: 60 },
    },
    {
      id: 'share-it-out',
      name: 'Share It Out',
      hint: 'Divide only works when it comes out even. What goes into 36?',
      tiles: [36, 6, 4, 2],
      goal: { value: 18 },
      twist: { kind: 'mustUse', op: '÷', times: 2 },
    },
    {
      id: 'four-nines',
      name: 'Four Nines',
      hint: 'Four nines and nothing else. No plus for the last star.',
      tiles: [9, 9, 9, 9],
      goal: { value: 72 },
      twist: { kind: 'banOp', op: '+' },
    },
    {
      id: 'split-the-difference',
      name: 'Split the Difference',
      hint: 'Build something big and chop it down. The last move divides.',
      tiles: [5, 7, 2, 10],
      goal: { value: 60 },
      twist: { kind: 'endWith', op: '÷' },
    },
    {
      id: 'golden-collar',
      name: 'The Golden Collar',
      hint: 'The collared 9 can only ever be multiplied. Plan around it.',
      tiles: [{ v: 9, collar: '×' }, 4, 7, 2],
      goal: { value: 126 },
      twist: { kind: 'cap', n: 200 },
    },
    {
      id: 'ninety-nine',
      name: 'Ninety-Nine',
      hint: 'Five tiles. Getting to 99 is easy; getting there using all five is not.',
      tiles: [12, 3, 5, 4, 2],
      goal: { value: 99 },
      twist: { kind: 'cap', n: 100 },
    },
    {
      id: 'below-zero',
      name: 'Below Zero',
      hint: 'This one lets you go negative. Sometimes that is the short way round.',
      tiles: [3, 8, 5, 2],
      goal: { value: 12 },
      neg: true,
      twist: { kind: 'mustUse', op: '-', times: 2 },
    },
    {
      id: 'snowball',
      name: 'Snowball',
      hint: 'For the last star every single step has to make a bigger number.',
      tiles: [6, 6, 4, 3, 2],
      goal: { value: 108 },
      twist: { kind: 'grow' },
    },
    {
      id: 'two-collars',
      name: 'Two Collars',
      hint: 'The 12 only divides. The 5 only adds. Everything else is free.',
      tiles: [{ v: 12, collar: '÷' }, { v: 5, collar: '+' }, 6, 3],
      goal: { value: 11 },
      twist: { kind: 'cap', n: 90 },
    },
    {
      id: 'quarter-pounder',
      name: 'Quarter Pounder',
      hint: 'Land on a clean hundred. Somewhere in there, something divides.',
      tiles: [25, 5, 4, 3, 2],
      goal: { value: 100 },
      twist: { kind: 'mustUse', op: '÷' },
    },
    {
      id: 'over-the-top',
      name: 'Over the Top',
      hint: 'No exact number to hit — just get past 180. Big is the whole idea.',
      tiles: [4, 5, 6, 7],
      goal: { atLeast: 180 },
      twist: { kind: 'banOp', op: '+' },
    },
    {
      id: 'no-plus-allowed',
      name: 'No Plus Allowed',
      hint: 'Five tiles, one target, and for the last star the plus is off limits.',
      tiles: [8, 7, 6, 5, 4],
      goal: { value: 210 },
      twist: { kind: 'banOp', op: '+' },
    },
  ];

  function byId(id) { return LEVELS.find((l) => l.id === id) || null; }

  return { LEVELS, byId };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Levels;
