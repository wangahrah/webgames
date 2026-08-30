// What you have actually done in Mossway Valley: stars per node, which places
// are open, which items you are carrying. No DOM, no rules, no level data --
// just the answer to "can I go there yet".
//
// Two decisions worth defending, because they are what keep this file small:
//
// ITEMS ARE DERIVED, NOT STORED. You hold the Sap Shears if and only if the
// node that gives them has at least one star. There is no inventory array, so
// there is nothing to fall out of step with the map, nothing to migrate, and
// no way to end up holding a lantern for a bog you have never been to.
//
// UNLOCKING ASKS FOR ONE STAR, NEVER THREE. Getting past a place only requires
// having actually solved it. Stars 2 and 3 feed the REGION totals instead, so
// doing a puzzle properly opens the next stretch of valley sooner without ever
// standing between a kid and the next thing to play. Nothing in this valley is
// ever lost and nothing is ever a wall; that rule is inherited from the board
// and it applies just as hard up here.

if (typeof World === 'undefined' && typeof require === 'function') { var World = require('./world.js'); }
if (typeof Saves === 'undefined' && typeof require === 'function') { var Saves = require('./saves.js'); }

var Quest = (function () {
  const KEY = 'smoosh.quest.v1';

  let store = null;
  function backing() {
    if (store) return store;
    try { return localStorage; } catch (e) { return null; }
  }
  function _setStorage(s) { store = s; }

  // ---- reading --------------------------------------------------------------
  //
  // Everything that comes back off disk is treated as hostile: a half-written
  // record, a node id from a version of the valley that no longer exists, a
  // star count of "banana". Warn and drop, never throw -- a corrupt save should
  // cost a kid their progress at worst, never the ability to open the game.

  function sanitize(raw) {
    const stars = {};
    const src = (raw && raw.stars && typeof raw.stars === 'object') ? raw.stars : {};
    for (const id of Object.keys(src)) {
      if (!World.nodeById(id)) continue;                  // a place that is gone
      const n = Math.floor(Number(src[id]));
      if (!isFinite(n) || n <= 0) continue;
      stars[id] = Math.min(3, n);
    }
    return { stars };
  }

  // The old flat {levelId: stars} map, carried onto whichever nodes use those
  // boards. A kid who three-starred half the game before there was a valley
  // should walk into one that already knows them.
  function migrate() {
    const stars = {};
    for (const n of World.NODES) {
      if (!n.level) continue;
      const had = Saves.starsFor(n.level);
      if (had > 0) stars[n.id] = Math.min(3, had);
    }
    const p = { stars };
    write(p);
    return p;
  }

  function read() {
    const b = backing();
    let raw = null;
    if (b) {
      try { raw = JSON.parse(b.getItem(KEY)); }
      catch (e) { raw = null; }
    }
    if (!raw || typeof raw !== 'object') return migrate();
    return sanitize(raw);
  }

  function write(p) {
    const b = backing();
    if (!b) return;
    try { b.setItem(KEY, JSON.stringify(p)); } catch (e) { /* private mode */ }
  }

  // ---- the questions, asked of one already-loaded progress object -----------
  //
  // The public functions below each read once and then use these, so drawing a
  // twenty-node map is one trip to storage rather than sixty.

  function starsIn(p, id) { return p.stars[id] || 0; }

  function totalIn(p) {
    return Object.keys(p.stars).reduce((n, k) => n + p.stars[k], 0);
  }

  function regionOpenIn(p, regionId) {
    const r = World.regionById(regionId);
    if (!r) return false;
    return totalIn(p) >= (r.gateStars || 0);
  }

  function unlockedIn(p, node) {
    if (!node) return false;
    if (!regionOpenIn(p, node.region)) return false;
    return (node.requires || []).every((id) => starsIn(p, id) >= 1);
  }

  // ---- the public shape -----------------------------------------------------

  function starsFor(id) { return starsIn(read(), id); }
  function totalStars() { return totalIn(read()); }
  function regionOpen(id) { return regionOpenIn(read(), id); }
  function isUnlocked(id) { return unlockedIn(read(), World.nodeById(id)); }

  function isPlayable(id) {
    const n = World.nodeById(id);
    return !!(n && n.level && unlockedIn(read(), n));
  }

  // Best-ever, never downwards -- poking at a solved puzzle must not cost you
  // anything, or the poking stops and so does the practice.
  function record(id, stars) {
    const n = World.nodeById(id);
    if (!n || !(stars > 0)) return starsFor(id);
    const p = read();
    const best = Math.min(3, Math.floor(stars));
    if (starsIn(p, id) >= best) return starsIn(p, id);
    p.stars[id] = best;
    write(p);
    return best;
  }

  function items() {
    const p = read();
    return World.NODES
      .filter((n) => n.gives && starsIn(p, n.id) >= 1)
      .map((n) => World.itemById(n.gives))
      .filter(Boolean);
  }

  function hasItem(itemId) { return items().some((i) => i.id === itemId); }

  // The map's whole data source: every node, joined to what you have done.
  function list() {
    const p = read();
    return World.NODES.map((n) => {
      const unlocked = unlockedIn(p, n);
      return {
        node: n,
        region: World.regionById(n.region),
        stars: starsIn(p, n.id),
        unlocked,
        playable: unlocked && !!n.level,
        built: !!n.level,
      };
    });
  }

  // Where a returning kid should land: their edge, not the beginning.
  function nextNode() {
    const rows = list().filter((r) => r.playable);
    return (rows.find((r) => r.stars < 3) || rows[rows.length - 1] || null);
  }

  // The next place along after this one -- what the "onwards" button means.
  // Deliberately not nextNode(): after solving something you want the next
  // door, not to be sent back to the one you only one-starred.
  function nodeAfter(id) {
    const rows = list();
    const at = rows.findIndex((r) => r.node.id === id);
    for (let i = at + 1; i < rows.length; i++) {
      if (rows[i].playable) return rows[i];
    }
    return null;
  }

  function clearProgress() { write({ stars: {} }); }

  return {
    KEY, _setStorage,
    read, record, clearProgress,
    starsFor, totalStars, regionOpen, isUnlocked, isPlayable,
    items, hasItem, list, nextNode, nodeAfter,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Quest;
