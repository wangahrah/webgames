// Quest session + progress. Which level you are on, and how many stars each
// level has been beaten with. Pure logic — no DOM. Tests inject a fake storage
// via Quest._setStorage(stub), the same way saves.js does.

var Quest = (function () {
  const KEY = 'chicken.quest.v1';
  const DRAFT_PREFIX = 'chicken.quest.draft.';

  let storage = (typeof localStorage !== 'undefined') ? localStorage : null;
  function _setStorage(s) { storage = s; }

  // The level currently being played, or null for free draw. Session-only —
  // opening chicken always lands you in free draw.
  let activeId = null;

  function _read() {
    if (!storage) return {};
    const raw = storage.getItem(KEY);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
      const out = {};
      for (const [id, rec] of Object.entries(parsed)) {
        if (!rec || typeof rec !== 'object') continue;
        const stars = Number(rec.stars);
        if (!Number.isFinite(stars) || stars < 0) continue;
        const best = Number(rec.bestCommands);
        out[id] = {
          stars: Math.min(3, Math.floor(stars)),
          bestCommands: (Number.isFinite(best) && best > 0) ? Math.floor(best) : null,
        };
      }
      return out;
    } catch (e) {
      console.warn('chicken: corrupted quest progress, starting fresh');
      return {};
    }
  }

  function _write(all) {
    if (!storage) return;
    try { storage.setItem(KEY, JSON.stringify(all)); } catch (e) { /* non-fatal */ }
  }

  function progressFor(id) {
    const rec = _read()[id];
    return rec ? { stars: rec.stars, bestCommands: rec.bestCommands }
               : { stars: 0, bestCommands: null };
  }

  // Progress only ever improves: a sloppier second run never takes stars away.
  function record(id, result) {
    const stars = Levels.starsFor(result);
    const all = _read();
    const prev = all[id] || { stars: 0, bestCommands: null };
    const won = result && result.outcome === 'win';
    const commands = Number(result && result.commands);
    const next = {
      stars: Math.max(prev.stars, stars),
      bestCommands: prev.bestCommands,
    };
    if (won && Number.isFinite(commands) && commands > 0) {
      next.bestCommands = (prev.bestCommands === null)
        ? commands
        : Math.min(prev.bestCommands, commands);
    }
    all[id] = next;
    _write(all);
    return { stars, improved: next.stars > prev.stars, best: next };
  }

  function clearProgress() {
    if (!storage) return;
    try { storage.removeItem(KEY); } catch (e) { /* non-fatal */ }
  }

  // Every level, in table order, with its earned stars attached.
  function list() {
    return Levels.LEVELS.map(l => ({ level: l, progress: progressFor(l.id) }));
  }

  function totalStars() {
    return Levels.LEVELS.reduce((n, l) => n + progressFor(l.id).stars, 0);
  }

  // ---- session --------------------------------------------------------------

  function enter(id) {
    const lv = Levels.byId(id);
    if (!lv) return null;
    activeId = id;
    return lv;
  }

  function leave() { activeId = null; }
  function isActive() { return activeId !== null; }
  function current() { return activeId ? Levels.byId(activeId) : null; }

  // ---- per-level drafts -----------------------------------------------------
  // Each level remembers what you last typed for it, so wandering off to free
  // draw and back does not throw your attempt away. Free draw keeps its own
  // draft under chicken.cluck and is never touched by any of this.

  function draftKey(id) { return DRAFT_PREFIX + id; }

  function getDraft(id) {
    if (!storage) return null;
    try {
      const v = storage.getItem(draftKey(id));
      return (typeof v === 'string') ? v : null;
    } catch (e) { return null; }
  }

  function setDraft(id, code) {
    if (!storage) return;
    try { storage.setItem(draftKey(id), String(code)); } catch (e) { /* non-fatal */ }
  }

  function clearDraft(id) {
    if (!storage) return;
    try { storage.removeItem(draftKey(id)); } catch (e) { /* non-fatal */ }
  }

  return {
    list, totalStars, progressFor, record, clearProgress,
    enter, leave, isActive, current,
    getDraft, setDraft, clearDraft,
    _setStorage,
  };
})();
