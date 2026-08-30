// Progress through the valley. Run from smoosh/ dir: node tests/quest.test.js
//
// The claim that matters most is the last one: every place that has a board
// behind it can actually be REACHED by playing the game normally. A region
// gate set two stars too high does not crash anything -- it just quietly walls
// off half the valley, and the only person who finds out is a ten-year-old.

const Saves = require('../js/saves.js');
const World = require('../js/world.js');
const Quest = require('../js/quest.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); }
}
function ok(v, msg) { if (!v) throw new Error(msg || `expected truthy, got ${v}`); }
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error((msg ? msg + ': ' : '') + `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
  }
}

// A localStorage stand-in. Both modules take one, which is the whole reason
// this file can exist without a browser.
function memory(seed) {
  const d = Object.assign({}, seed || {});
  return {
    d,
    getItem(k) { return d[k] === undefined ? null : d[k]; },
    setItem(k, v) { d[k] = String(v); },
  };
}
function fresh(seed) {
  const m = memory(seed);
  Quest._setStorage(m);
  Saves._setStorage(m);
  return m;
}

const START = World.NODES[0].id;

console.log('a brand new valley');

test('only the first place is open', () => {
  fresh();
  ok(Quest.isUnlocked(START), 'the starting place is shut');
  ok(Quest.isPlayable(START), 'the starting place has no board');
  const open = Quest.list().filter((r) => r.unlocked).map((r) => r.node.id);
  eq(open, [START], 'more than the start is open on a fresh save');
  eq(Quest.totalStars(), 0);
  eq(Quest.items(), []);
});

test('a place with no board can never be played', () => {
  fresh();
  const unbuilt = World.NODES.filter((n) => !n.level);
  ok(unbuilt.length > 0, 'nothing left to build — update this test');
  for (const n of unbuilt) ok(!Quest.isPlayable(n.id), n.id + ': playable with no board');
});

console.log('earning stars');

test('one star is enough to walk on', () => {
  fresh();
  const next = World.NODES.find((n) => n.requires.indexOf(START) >= 0);
  ok(!Quest.isUnlocked(next.id), 'the next place was open before it was earned');
  Quest.record(START, 1);
  ok(Quest.isUnlocked(next.id), 'one star did not open the next place');
});

test('stars only ever go up', () => {
  fresh();
  eq(Quest.record(START, 2), 2);
  eq(Quest.record(START, 3), 3);
  eq(Quest.record(START, 1), 3, 'a worse run overwrote a better one');
  eq(Quest.starsFor(START), 3);
});

test('nonsense is refused rather than stored', () => {
  fresh();
  Quest.record(START, 0);
  Quest.record(START, -4);
  Quest.record('no-such-place', 3);
  Quest.record(START, 99);
  eq(Quest.starsFor(START), 3, 'a star count above three was kept');
  eq(Quest.starsFor('no-such-place'), 0);
  eq(Quest.totalStars(), 3);
});

console.log('regions and items');

test('a region stays shut until the valley has enough stars', () => {
  fresh();
  const gated = World.REGIONS.find((r) => r.gateStars > 0);
  ok(gated, 'no gated region — update this test');
  ok(!Quest.regionOpen(gated.id), gated.id + ': open with no stars');
  // Star up the earlier regions until the gate gives.
  for (const n of World.NODES) {
    if (n.region === gated.id) break;
    Quest.record(n.id, 3);
  }
  ok(Quest.regionOpen(gated.id), gated.id + ': still shut after clearing everything before it');
});

test('items are held exactly when their place has been solved', () => {
  fresh();
  const giver = World.NODES.find((n) => n.gives);
  ok(!Quest.hasItem(giver.gives), 'holding an item before earning it');
  Quest.record(giver.id, 1);
  ok(Quest.hasItem(giver.gives), 'did not receive the item');
  eq(Quest.items().map((i) => i.id), [giver.gives]);
});

console.log('coming back later');

test('a save from the old flat puzzle list is carried onto the map', () => {
  // Before the valley there was a list, and stars hung off level ids. A kid
  // who had already done half of it must not walk into an empty map.
  const withBoard = World.NODES.filter((n) => n.level).slice(0, 2);
  const old = {};
  old[withBoard[0].level] = 3;
  old[withBoard[1].level] = 2;
  fresh({ 'smoosh.progress.v1': JSON.stringify(old) });
  eq(Quest.starsFor(withBoard[0].id), 3, 'old stars were lost');
  eq(Quest.starsFor(withBoard[1].id), 2);
  eq(Quest.totalStars(), 5);
});

test('a corrupt or absent save costs progress, never the game', () => {
  fresh({ 'smoosh.quest.v1': '{not json at all' });
  eq(Quest.totalStars(), 0);
  ok(Quest.isUnlocked(START), 'a bad save locked the kid out of their own valley');

  fresh({ 'smoosh.quest.v1': JSON.stringify({ stars: { 'ghost-node': 3, [START]: 'banana' } }) });
  eq(Quest.totalStars(), 0, 'junk survived sanitising');
  ok(Quest.isUnlocked(START));

  Quest._setStorage(null);   // no storage at all, as in a locked-down browser
  ok(Quest.isUnlocked(START), 'no storage meant no game');
});

test('clearing progress puts the valley back to sleep', () => {
  fresh();
  Quest.record(START, 3);
  Quest.clearProgress();
  eq(Quest.totalStars(), 0);
  eq(Quest.list().filter((r) => r.unlocked).map((r) => r.node.id), [START]);
});

console.log('walking it');

test('onwards leads to the next place with a board, and stops when it runs out', () => {
  fresh();
  const built = World.NODES.filter((n) => n.level);
  Quest.record(built[0].id, 1);
  const after = Quest.nodeAfter(built[0].id);
  ok(after, 'nowhere to go after the first place');
  eq(after.node.id, built[1].id);
  // Star everything and the last built place has nothing after it.
  for (const n of built) Quest.record(n.id, 3);
  eq(Quest.nodeAfter(built[built.length - 1].id), null,
     'invented somewhere to go after the last built place');
});

test('every built place can actually be reached by playing', () => {
  // The real proof against a soft-lock: solve whatever is open, over and over,
  // and see whether the whole built valley eventually falls open. This runs
  // through the actual unlock rules, gates and all -- no shortcuts.
  fresh();
  const built = World.NODES.filter((n) => n.level).map((n) => n.id);
  const done = new Set();
  let moved = true;
  while (moved) {
    moved = false;
    for (const id of built) {
      if (done.has(id) || !Quest.isPlayable(id)) continue;
      Quest.record(id, 3);          // a strong player, three-starring as they go
      done.add(id);
      moved = true;
    }
  }
  const stranded = built.filter((id) => !done.has(id));
  ok(stranded.length === 0,
     'walled off from a one-star player: ' + stranded.join(', '));
});

test('and reached by a player who never gets more than one star', () => {
  // The same walk, but the region gates now have only one star per place to
  // work with. If a gate needs more than that, a kid who solves everything the
  // easy way still hits a wall -- which is the exact failure this catches.
  fresh();
  const built = World.NODES.filter((n) => n.level);
  const reached = new Set();
  let moved = true;
  while (moved) {
    moved = false;
    for (const n of built) {
      if (reached.has(n.id) || !Quest.isPlayable(n.id)) continue;
      reached.add(n.id);
      Quest.record(n.id, 1);
      moved = true;
    }
  }
  ok(reached.size === built.length,
     'a one-star player reaches only ' + reached.size + ' of ' + built.length + ' places');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
