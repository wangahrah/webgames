// Mossway Valley itself. Run from smoosh/ dir: node tests/world.test.js
//
// world.js is pure data, which means the only way it can be wrong is by being
// inconsistent -- a path to a place that does not exist, two places sitting on
// top of each other, a region gate nobody can ever reach. Those are exactly
// the bugs a kid finds by walking into them, so they are checked here instead.

const Levels = require('../js/levels.js');
const World = require('../js/world.js');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); }
}
function ok(v, msg) { if (!v) throw new Error(msg || `expected truthy, got ${v}`); }

console.log('the valley');

test('every place has the fields the map reads', () => {
  for (const n of World.NODES) {
    ok(typeof n.id === 'string' && n.id, 'id');
    ok(typeof n.name === 'string' && n.name, n.id + ': name');
    ok(World.regionById(n.region), n.id + ': unknown region ' + n.region);
    ok(n.at && typeof n.at.x === 'number' && typeof n.at.y === 'number', n.id + ': at');
    ok(Array.isArray(n.requires), n.id + ': requires');
    ok(typeof n.blurb === 'string' && n.blurb, n.id + ': blurb');
    ok(typeof n.onSolve === 'string' && n.onSolve, n.id + ': onSolve');
    ok(n.level === null || typeof n.level === 'string', n.id + ': level');
  }
});

test('place ids are unique and findable', () => {
  const seen = new Set();
  for (const n of World.NODES) {
    ok(!seen.has(n.id), 'duplicate place id ' + n.id);
    seen.add(n.id);
    ok(World.nodeById(n.id) === n, n.id + ': nodeById missed it');
  }
  ok(World.nodeById('nowhere') === null, 'nodeById invented a place');
});

test('every built place points at a real board', () => {
  for (const n of World.NODES) {
    if (!n.level) continue;
    ok(Levels.byId(n.level), n.id + ': no such level ' + n.level);
  }
});

test('no two places share a board', () => {
  const seen = {};
  for (const n of World.NODES) {
    if (!n.level) continue;
    ok(!seen[n.level], n.level + ': used by both ' + seen[n.level] + ' and ' + n.id);
    seen[n.level] = n.id;
  }
});

test('every gift is a real item', () => {
  for (const n of World.NODES) {
    if (!n.gives) continue;
    ok(World.itemById(n.gives), n.id + ': unknown item ' + n.gives);
  }
  for (const i of World.ITEMS) {
    ok(World.NODES.some((n) => n.gives === i.id), i.id + ': nobody gives it out');
  }
});

console.log('the paths');

test('every path leads somewhere real', () => {
  for (const n of World.NODES) {
    for (const req of n.requires) {
      ok(World.nodeById(req), n.id + ': requires unknown place ' + req);
      ok(req !== n.id, n.id + ': requires itself');
    }
  }
});

test('exactly one place needs nothing, and it is the first', () => {
  const starts = World.NODES.filter((n) => n.requires.length === 0);
  ok(starts.length === 1, 'expected one starting place, got ' + starts.length);
  ok(starts[0] === World.NODES[0], 'the starting place is not first in the table');
});

test('the valley has no loops, and nowhere is unreachable', () => {
  // Walk outwards from the start: a place joins the reachable set once every
  // place it requires is already in it. If the fixed point does not cover
  // everything, what is left is either behind a cycle or behind nothing at all.
  const done = new Set();
  let moved = true;
  while (moved) {
    moved = false;
    for (const n of World.NODES) {
      if (done.has(n.id)) continue;
      if (n.requires.every((r) => done.has(r))) { done.add(n.id); moved = true; }
    }
  }
  const stranded = World.NODES.filter((n) => !done.has(n.id)).map((n) => n.id);
  ok(stranded.length === 0, 'unreachable or in a loop: ' + stranded.join(', '));
});

console.log('the drawing');

test('every place sits inside the map, with room for its label', () => {
  const V = World.VIEW;
  for (const n of World.NODES) {
    ok(n.at.x >= 30 && n.at.x <= V.w - 30, n.id + ': x ' + n.at.x + ' outside the map');
    ok(n.at.y >= 30 && n.at.y <= V.h - 30, n.id + ': y ' + n.at.y + ' outside the map');
  }
});

test('no two places are drawn on top of each other', () => {
  // A map node is about 6.6rem wide on screen, which is roughly 90 map units
  // at a typical canvas size. Anything closer than that and two labels overlap
  // into something a kid cannot read or reliably tap.
  const MIN = 90;
  for (let i = 0; i < World.NODES.length; i++) {
    for (let j = i + 1; j < World.NODES.length; j++) {
      const a = World.NODES[i], b = World.NODES[j];
      const d = Math.hypot(a.at.x - b.at.x, a.at.y - b.at.y);
      ok(d >= MIN, a.id + ' and ' + b.id + ' are only ' + Math.round(d) + ' apart');
    }
  }
});

console.log('the region gates');

test('every region has places in it', () => {
  for (const r of World.REGIONS) {
    ok(World.nodesIn(r.id).length > 0, r.id + ': no places');
    ok(typeof r.gateStars === 'number' && r.gateStars >= 0, r.id + ': gateStars');
  }
});

test('no region gate demands more stars than the valley can hand out first', () => {
  // And not merely reachable: a gate you can only pass by three-starring
  // everything before it is a wall with a star on it. Two thirds is the most
  // any gate may ask.
  let available = 0;
  for (const r of World.REGIONS) {
    ok(r.gateStars <= available,
       r.id + ': needs ' + r.gateStars + ' stars, only ' + available + ' exist before it');
    ok(r.gateStars <= available * 0.7 + 0.001,
       r.id + ': needs ' + r.gateStars + ' of ' + available + ' — too close to perfection');
    available += World.nodesIn(r.id).length * 3;
  }
});

test('no two region patches are drawn over each other', () => {
  // Four soft patches behind the places, one per region. If two of them
  // intersect, the map stops reading as four distinct stretches of valley and
  // starts reading as a smear -- and nothing but a screenshot ever notices.
  const boxes = World.REGIONS.map((r) => ({ r, b: World.regionBox(r.id) }));
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], c = boxes[j];
      const apart = a.b.x + a.b.w <= c.b.x || c.b.x + c.b.w <= a.b.x ||
                    a.b.y + a.b.h <= c.b.y || c.b.y + c.b.h <= a.b.y;
      ok(apart, a.r.id + ' overlaps ' + c.r.id);
    }
  }
});

test('every region patch fits on the map', () => {
  const V = World.VIEW;
  for (const r of World.REGIONS) {
    const b = World.regionBox(r.id);
    ok(b.x >= 0 && b.y >= 0, r.id + ': patch starts off the map');
    ok(b.x + b.w <= V.w && b.y + b.h <= V.h, r.id + ': patch runs off the map');
  }
});

test('no region label lands on top of a place', () => {
  // Labels are hand-placed, so the only thing to check is that the hand was
  // steady. A label sitting across a node is invisible to every assertion in
  // this file except this one.
  for (const r of World.REGIONS) {
    const at = r.labelAt;
    ok(at && typeof at.x === 'number' && typeof at.y === 'number', r.id + ': labelAt');
    ok(at.x >= 0 && at.y >= 12, r.id + ': label starts off the map');
    // Roughly how wide the text runs, at the 20px the stylesheet sets.
    const run = (r.glyph + '   ' + r.name + '   needs 00').length * 11;
    ok(at.x + run <= World.VIEW.w, r.id + ': label runs off the right edge');
    for (const n of World.NODES) {
      const overX = n.at.x > at.x - 40 && n.at.x < at.x + run;
      const overY = Math.abs(n.at.y - at.y) < 46;
      ok(!(overX && overY), r.id + ': label sits on ' + n.id);
    }
  }
});

test('regions are listed in the order you walk them', () => {
  // The first place of each region must depend on a place from an earlier one,
  // or the table order is lying about the shape of the valley.
  const rank = {};
  World.REGIONS.forEach((r, i) => { rank[r.id] = i; });
  for (const n of World.NODES) {
    for (const req of n.requires) {
      const from = World.nodeById(req);
      ok(rank[from.region] <= rank[n.region],
         n.id + ': path arrives from a later region (' + from.region + ')');
    }
  }
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
