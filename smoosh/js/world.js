// Mossway Valley. Data only -- no DOM, no rules, no progress. This is the file
// you edit to grow the game: adding a place is one row in NODES, and adding a
// whole new stretch of valley is one row in REGIONS plus its nodes.
//
// The split of concerns, because it is the whole point of the file existing:
//
//   levels.js   what the BOARD is       (tiles, target, twist)
//   world.js    what the PLACE is       (name, position, what it opens, who
//                                        gives you what)
//   quest.js    what YOU have done      (stars, unlocks, items)
//
// A board can therefore be re-dressed as a gate, a bird or a shrine without
// levels.js changing a character, and the valley can be re-drawn without any
// board being re-checked. That separation is what makes level 21 cheap.
//
// A node with `level: null` is a place that exists on the map but has no
// puzzle behind it yet. It draws as not-yet-grown and cannot be entered. That
// is deliberate: the shape of the whole valley is visible from the first day,
// which is most of what makes a map feel like somewhere rather than a list.

var World = (function () {

  // ---- regions --------------------------------------------------------------
  //
  // labelAt is hand-placed, for the same reason node positions are: a label
  // auto-parked in the corner of its own patch lands on top of whichever place
  // happens to live there, and no assertion will ever see it happen.
  //
  // gateStars is a running TOTAL, checked against every star earned anywhere.
  // This is what stars 2 and 3 are for: they are never a gate on a single node
  // -- solving badly always lets you walk on -- but they open the next stretch
  // of valley sooner. Optional, and worth something.
  //
  // The totals below sit near half of what is available before them, on
  // purpose. A gate you can only pass by three-starring everything is a wall.

  const REGIONS = [
    {
      labelAt: { x: 46, y: 432 },
      id: 'home-clearing',
      name: 'Home Clearing',
      glyph: '🌱',
      gateStars: 0,
      tint: '#7cb342',
      blurb: 'Where you woke up. Everything here is small and nothing here bites.',
    },
    {
      labelAt: { x: 356, y: 96 },
      id: 'bramble-hollow',
      name: 'Bramble Hollow',
      glyph: '🍂',
      gateStars: 3,
      tint: '#558b2f',
      blurb: 'Thorns have grown over the old path. Some seeds are bound in vine — ' +
             'a bound seed will only come loose one way.',
    },
    {
      labelAt: { x: 426, y: 424 },
      id: 'lantern-bog',
      name: 'Lantern Bog',
      glyph: '💧',
      gateStars: 12,
      tint: '#00838f',
      blurb: 'Dark water and dead lanterns. The gates down here have two locks, ' +
             'and both must be lit at once.',
    },
    {
      labelAt: { x: 612, y: 32 },
      id: 'old-stone-grove',
      name: 'Old Stone Grove',
      glyph: '🗿',
      gateStars: 26,
      tint: '#5d4037',
      blurb: 'Older than the valley. The stones count downwards as happily as up, ' +
             'and they ask for more than one thing at a time.',
    },
  ];

  // ---- items ----------------------------------------------------------------
  //
  // An item is a NEW VERB and the mechanic that comes with it, which is the
  // trick the whole design leans on: a new rule never arrives as a paragraph
  // of instructions, it arrives as a present from somebody in a bog.
  //
  // Holding an item is derived from stars, not stored -- see quest.js. There is
  // no inventory to fall out of step with the map.

  const ITEMS = [
    { id: 'mossknife',  name: 'Mossknife',   glyph: '🌿',
      what: 'Cuts back the thorns. The Hollow will let you in now.' },
    { id: 'sap-shears', name: 'Sap Shears',  glyph: '✂',
      what: 'Cuts one even seed cleanly in half. Odd seeds just bend the blade.' },
    { id: 'bog-lantern', name: 'Bog Lantern', glyph: '🏮',
      what: 'Burns steady in the wet. The Grove path is walkable at last.' },
    { id: 'grovestone', name: 'Grovestone',  glyph: '🗿',
      what: 'The valley is awake. All of it, all the way back to the clearing.' },
  ];

  // ---- nodes ----------------------------------------------------------------
  //
  //   id        stable save key. Never renumber one; progress hangs off it.
  //   region    which stretch of valley it sits in
  //   name      what the kid reads over the bench
  //   level     a levels.js id, or null for "on the map, not built yet"
  //   at        {x,y} inside the fixed 1000x700 viewBox. Positions are hand-set
  //             so the paths read as a walk rather than a graph drawing.
  //   requires  node ids that each need at least ONE star before this opens.
  //             One star, not three -- the valley never asks for perfection to
  //             let you past, only for having actually been there.
  //   blurb     what the place wants, in its own voice
  //   onSolve   what happens when it gets it
  //   gives     an item id, or absent

  const NODES = [
    // ---- Home Clearing: the fuse, and nothing else ---------------------------
    {
      id: 'clearing-gate', region: 'home-clearing', name: 'The Knotted Gate',
      level: 'first-fuse', at: { x: 110, y: 600 }, requires: [],
      blurb: 'A gate grown shut with old vine. Carved into the post: 12.',
      onSolve: 'The knot slackens and falls open. Beyond it, the clearing keeps going.',
    },
    {
      id: 'clearing-bird', region: 'home-clearing', name: 'Berries for Hollowbeak',
      level: 'clearing-bird', at: { x: 230, y: 495 }, requires: ['clearing-gate'],
      blurb: 'A grey bird with an enormous beak. It wants exactly 14 berries and ' +
             'it is not going to explain why.',
      onSolve: 'Hollowbeak eats all 14 without a word, and walks — walks — off east.',
    },
    {
      id: 'clearing-step', region: 'home-clearing', name: 'The Sunken Step',
      level: 'clearing-step', at: { x: 330, y: 605 }, requires: ['clearing-bird'],
      blurb: 'One stepping stone has sunk. The brook will lift it back for 12.',
      onSolve: 'The stone rises. Wedged underneath it, still sharp, is a small green blade.',
      gives: 'mossknife',
    },

    // ---- Bramble Hollow: vine-bound seeds ------------------------------------
    {
      id: 'hollow-arch', region: 'bramble-hollow', name: 'The Vine Arch',
      level: 'golden-collar', at: { x: 410, y: 330 }, requires: ['clearing-step'],
      blurb: 'One seed here is wrapped in vine. Vine-bound seeds come loose ' +
             'one way and one way only — look at the ribbon.',
      onSolve: 'The arch unwinds itself, politely, like something remembering manners.',
    },
    {
      id: 'hollow-thorn', region: 'bramble-hollow', name: 'Thornway',
      level: 'twenty-four', at: { x: 500, y: 200 }, requires: ['hollow-arch'],
      blurb: 'The oldest number in the valley is carved here: 24.',
      onSolve: 'The thorns lie down flat and let you over.',
    },
    {
      id: 'hollow-nest', region: 'bramble-hollow', name: 'The High Nest',
      level: 'fifty-six', at: { x: 620, y: 155 }, requires: ['hollow-thorn'],
      blurb: 'Something enormous nested here once. The shell fragments read 56.',
      onSolve: 'The nest settles. Whatever left it is long gone, and left the path clear.',
    },
    {
      id: 'hollow-snare', region: 'bramble-hollow', name: 'The Nine Snare',
      level: 'four-nines', at: { x: 560, y: 320 }, requires: ['hollow-arch'],
      blurb: 'Four nines and nothing else. The snare only opens on 72.',
      onSolve: 'The snare springs harmlessly and rusts on the spot.',
    },
    {
      id: 'hollow-heart', region: 'bramble-hollow', name: 'Heart of the Hollow',
      level: 'two-collars', at: { x: 700, y: 245 }, requires: ['hollow-nest', 'hollow-snare'],
      blurb: 'Two seeds bound, not one. Plan around both or around neither.',
      onSolve: 'The whole Hollow exhales. Downhill from here, you can smell water.',
    },

    // ---- Lantern Bog: two-lock gates, and the Shears --------------------------
    {
      id: 'bog-boardwalk', region: 'lantern-bog', name: 'The Boardwalk',
      level: null, at: { x: 470, y: 500 }, requires: ['hollow-heart'],
      blurb: 'Rotten planks over black water. Two lanterns, both wanting a number.',
      onSolve: 'Both lanterns catch. The planks hold.',
    },
    {
      id: 'bog-reeds', region: 'lantern-bog', name: 'The Reedbeds',
      level: null, at: { x: 500, y: 640 }, requires: ['bog-boardwalk'],
      blurb: 'Reeds taller than you are, and something moving in them.',
      onSolve: 'The reeds part. It was only the wind. Probably.',
    },
    {
      id: 'bog-shears', region: 'lantern-bog', name: 'The Drowned Toolshed',
      level: null, at: { x: 630, y: 580 }, requires: ['bog-reeds'],
      blurb: 'A shed sunk to its eaves. Something metal is still hanging inside.',
      onSolve: 'A pair of shears, green with sap and perfectly sharp.',
      gives: 'sap-shears',
    },
    {
      id: 'bog-drowned', region: 'lantern-bog', name: 'The Drowned Gate',
      level: null, at: { x: 700, y: 490 }, requires: ['bog-shears'],
      blurb: 'Both locks are under water. One seed will have to be halved.',
      onSolve: 'The gate comes up out of the water in one piece, dripping.',
    },
    {
      id: 'bog-heron', region: 'lantern-bog', name: 'The Grey Heron',
      level: null, at: { x: 760, y: 620 }, requires: ['bog-drowned'],
      blurb: 'It has been standing here, motionless, since before the lanterns went out.',
      onSolve: 'The heron blinks once, which from a heron is a standing ovation.',
    },
    {
      id: 'bog-beacon', region: 'lantern-bog', name: 'The Last Beacon',
      level: null, at: { x: 800, y: 500 }, requires: ['bog-drowned'],
      blurb: 'The big one. Two locks, and neither of them small.',
      onSolve: 'Light goes up over the whole bog, and stays up.',
      gives: 'bog-lantern',
    },

    // ---- Old Stone Grove: the Deepdark, and everything at once ---------------
    {
      id: 'grove-arch', region: 'old-stone-grove', name: 'The Standing Arch',
      level: null, at: { x: 820, y: 390 }, requires: ['bog-beacon', 'bog-heron'],
      blurb: 'The stones here are not fussy about zero. You may go below it.',
      onSolve: 'The arch acknowledges you. It is hard to describe how.',
    },
    {
      id: 'grove-owl', region: 'old-stone-grove', name: 'The Stone Owl',
      level: null, at: { x: 950, y: 330 }, requires: ['grove-arch'],
      blurb: 'Carved, weathered, and asking for two numbers it will not repeat.',
      onSolve: 'The owl turns its head about a finger-width. That is the whole reward.',
    },
    {
      id: 'grove-pool', region: 'old-stone-grove', name: 'The Still Pool',
      level: null, at: { x: 820, y: 260 }, requires: ['grove-owl'],
      blurb: 'It shows the number you need upside down, which is its idea of a joke.',
      onSolve: 'The reflection finally agrees with you.',
    },
    {
      id: 'grove-lantern', region: 'old-stone-grove', name: 'The Cold Lantern',
      level: null, at: { x: 950, y: 200 }, requires: ['grove-arch'],
      blurb: 'It has never been lit. Not once. Not by anybody.',
      onSolve: 'It lights. The light is cold and perfectly steady.',
    },
    {
      id: 'grove-door', region: 'old-stone-grove', name: 'The Long Door',
      level: null, at: { x: 820, y: 130 }, requires: ['grove-owl'],
      blurb: 'A door in a hillside with no building attached to it.',
      onSolve: 'It opens onto exactly as much as you would expect. Which is nothing. ' +
               'But it opens.',
    },
    {
      id: 'grove-heart', region: 'old-stone-grove', name: 'The Whole Valley',
      level: null, at: { x: 950, y: 90 }, requires: ['grove-pool', 'grove-lantern', 'grove-door'],
      blurb: 'Vine, two locks, the shears and the dark, all in one place. ' +
             'Everything the valley taught you, asked for at once.',
      onSolve: 'Behind you, all the way back to the clearing, the lights come on one by one.',
      gives: 'grovestone',
    },
  ];

  // The map's own coordinate space. `pad` is how far a region's patch is drawn
  // beyond the places inside it -- it lives here rather than in map.js so the
  // test that proves two regions never overlap is measuring the same thing the
  // renderer draws.
  const VIEW = { w: 1000, h: 700, pad: 48 };

  // The patch drawn around a region: the bounding box of its places, padded.
  function regionBox(regionId) {
    const mine = nodesIn(regionId);
    if (!mine.length) return null;
    const xs = mine.map((n) => n.at.x), ys = mine.map((n) => n.at.y);
    const x = Math.min.apply(null, xs) - VIEW.pad, y = Math.min.apply(null, ys) - VIEW.pad;
    return {
      x, y,
      w: Math.max.apply(null, xs) - Math.min.apply(null, xs) + VIEW.pad * 2,
      h: Math.max.apply(null, ys) - Math.min.apply(null, ys) + VIEW.pad * 2,
    };
  }

  function nodeById(id) { return NODES.find((n) => n.id === id) || null; }
  function regionById(id) { return REGIONS.find((r) => r.id === id) || null; }
  function itemById(id) { return ITEMS.find((i) => i.id === id) || null; }
  function nodesIn(regionId) { return NODES.filter((n) => n.region === regionId); }

  // Every requires-edge, once, for drawing the paths between places.
  function edges() {
    const out = [];
    for (const n of NODES) {
      for (const req of (n.requires || [])) {
        const from = nodeById(req);
        if (from) out.push({ from, to: n });
      }
    }
    return out;
  }

  return { REGIONS, ITEMS, NODES, VIEW, nodeById, regionById, itemById, nodesIn, regionBox, edges };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = World;
