// Progress: how many stars each authored level has ever been worth. Best-ever,
// never overwritten downwards -- a kid who three-stars a level and then pokes
// at it again should not be punished for playing.
//
// Endless puzzles are deliberately not recorded. They are infinite; a score
// against them would mean nothing, and the point of endless mode is that
// nothing is at stake.

var Saves = (function () {
  const KEY = 'smoosh.progress.v1';

  // Storage is injectable so progression logic can be tested in Node without a
  // browser. Reaching straight for localStorage is why this file had no test
  // file for its whole first life; quest.js is not going to inherit that.
  let store = null;
  function backing() {
    if (store) return store;
    try { return localStorage; } catch (e) { return null; }   // Node, or private mode
  }
  function _setStorage(s) { store = s; }

  function read() {
    const b = backing();
    if (!b) return {};
    try { return JSON.parse(b.getItem(KEY)) || {}; }
    catch (e) { return {}; }
  }

  function write(obj) {
    const b = backing();
    if (!b) return;
    try { b.setItem(KEY, JSON.stringify(obj)); } catch (e) { /* private mode */ }
  }

  function starsFor(id) { return read()[id] || 0; }

  function record(id, stars) {
    if (!id || stars <= 0) return starsFor(id);
    const all = read();
    if ((all[id] || 0) >= stars) return all[id];
    all[id] = stars;
    write(all);
    return stars;
  }

  function total() {
    const all = read();
    return Object.keys(all).reduce((n, k) => n + all[k], 0);
  }

  return { read, starsFor, record, total, KEY, _setStorage };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Saves;
