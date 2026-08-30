// Best-score + preference storage. Pure logic — no DOM; tests inject a fake
// storage via Best._setStorage. All keys namespaced `flapjack.*`.
(function (root) {
  'use strict';

  var PREFIX = 'flapjack.';
  var KEY_THEME = PREFIX + 'theme';
  var KEY_DIFFICULTY = PREFIX + 'difficulty';
  var KEY_MUTED = PREFIX + 'muted';

  var Best = (function () {
    var storage = (typeof localStorage !== 'undefined') ? localStorage : null;

    function _setStorage(s) { storage = s; }

    function best(themeId, diffId) {
      if (!storage) return 0;
      var raw;
      try { raw = storage.getItem(PREFIX + 'best.' + themeId + '.' + diffId); } catch (e) { return 0; }
      if (raw === null) return 0;
      var n = parseInt(raw, 10);
      if (isNaN(n) || n < 0) return 0;
      return n;
    }

    function isNewBest(themeId, diffId, score) {
      return score > best(themeId, diffId);
    }

    function saveBest(themeId, diffId, score) {
      if (score <= 0) return false;
      if (!isNewBest(themeId, diffId, score)) return false;
      if (!storage) return false;
      try {
        storage.setItem(PREFIX + 'best.' + themeId + '.' + diffId, String(score));
        return true;
      } catch (e) { return false; }
    }

    function getTheme() {
      if (!storage) return 'unicorn';
      try { return storage.getItem(KEY_THEME) || 'unicorn'; } catch (e) { return 'unicorn'; }
    }

    function setTheme(id) {
      if (!storage) return;
      try { storage.setItem(KEY_THEME, id); } catch (e) { /* non-fatal */ }
    }

    function getDifficulty() {
      if (!storage) return 'easy';
      try { return storage.getItem(KEY_DIFFICULTY) || 'easy'; } catch (e) { return 'easy'; }
    }

    function setDifficulty(id) {
      if (!storage) return;
      try { storage.setItem(KEY_DIFFICULTY, id); } catch (e) { /* non-fatal */ }
    }

    function getMuted() {
      if (!storage) return false;
      try { return storage.getItem(KEY_MUTED) === '1'; } catch (e) { return false; }
    }

    function setMuted(m) {
      if (!storage) return;
      try { storage.setItem(KEY_MUTED, m ? '1' : '0'); } catch (e) { /* non-fatal */ }
    }

    return {
      best: best,
      isNewBest: isNewBest,
      saveBest: saveBest,
      getTheme: getTheme, setTheme: setTheme,
      getDifficulty: getDifficulty, setDifficulty: setDifficulty,
      getMuted: getMuted, setMuted: setMuted,
      PREFIX: PREFIX,
      _setStorage: _setStorage,
    };
  })();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { Best: Best };
  } else {
    root.FlapjackScores = Best;
  }
})(typeof window !== 'undefined' ? window : globalThis);