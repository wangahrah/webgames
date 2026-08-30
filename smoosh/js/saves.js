// Progress: how many stars each authored level has ever been worth. Best-ever,
// never overwritten downwards -- a kid who three-stars a level and then pokes
// at it again should not be punished for playing.
//
// Endless puzzles are deliberately not recorded. They are infinite; a score
// against them would mean nothing, and the point of endless mode is that
// nothing is at stake.

var Saves = (function () {
  const KEY = 'smoosh.progress.v1';

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch (e) { return {}; }
  }

  function write(obj) {
    try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch (e) { /* private mode */ }
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

  return { read, starsFor, record, total, KEY };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Saves;
