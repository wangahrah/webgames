// Named-script storage. Pure logic — no DOM. Tests inject a fake storage
// via Saves._setStorage(stub).

var SavesQuotaError = class extends Error {
  constructor() {
    super('localStorage quota exceeded');
    this.name = 'SavesQuotaError';
  }
};

var Saves = (function () {
  const KEY = 'chicken.saves.v1';
  const LAST_KEY = 'chicken.lastSaved';
  const NAME_MAX = 24;

  let storage = (typeof localStorage !== 'undefined') ? localStorage : null;

  function _setStorage(s) { storage = s; }

  function _readManifest() {
    if (!storage) return [];
    const raw = storage.getItem(KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed.filter(e =>
        e && typeof e.name === 'string' && typeof e.code === 'string'
      );
    } catch (e) {
      console.warn('chicken: corrupted saves manifest, starting fresh');
      return [];
    }
  }

  function _writeManifest(entries) {
    if (!storage) return;
    try {
      storage.setItem(KEY, JSON.stringify(entries));
    } catch (e) {
      throw new SavesQuotaError();
    }
  }

  function list() {
    return _readManifest().map(e => ({
      name: e.name,
      code: e.code,
      updatedAt: e.updatedAt,
    }));
  }

  function get(name) {
    if (typeof name !== 'string') return null;
    const target = name.toLowerCase();
    for (const e of _readManifest()) {
      if (e.name.toLowerCase() === target) {
        return { name: e.name, code: e.code, updatedAt: e.updatedAt };
      }
    }
    return null;
  }

  function put(name, code) {
    const entries = _readManifest();
    const target = name.toLowerCase();
    const idx = entries.findIndex(e => e.name.toLowerCase() === target);
    const now = new Date().toISOString();
    let created;
    if (idx === -1) {
      entries.unshift({ name, code, createdAt: now, updatedAt: now });
      created = true;
    } else {
      const existing = entries.splice(idx, 1)[0];
      entries.unshift({
        name,
        code,
        createdAt: existing.createdAt || now,
        updatedAt: now,
      });
      created = false;
    }
    _writeManifest(entries);
    return { created };
  }

  function remove(name) {
    if (typeof name !== 'string') return false;
    const target = name.toLowerCase();
    const entries = _readManifest();
    const idx = entries.findIndex(e => e.name.toLowerCase() === target);
    if (idx === -1) return false;
    entries.splice(idx, 1);
    _writeManifest(entries);
    return true;
  }

  function normalizeName(raw) {
    if (typeof raw !== 'string') return '';
    return raw.trim().replace(/\s+/g, ' ').slice(0, NAME_MAX);
  }

  function isValidName(name) {
    return normalizeName(name).length > 0;
  }

  function getLastSaved() {
    if (!storage) return null;
    const raw = storage.getItem(LAST_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      const nameOk = (typeof parsed.name === 'string' || parsed.name === null);
      if (parsed && nameOk && typeof parsed.code === 'string') {
        return { name: parsed.name, code: parsed.code };
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  function setLastSaved(name, code) {
    if (!storage) return;
    try {
      storage.setItem(LAST_KEY, JSON.stringify({ name, code }));
    } catch (e) { /* non-fatal */ }
  }

  function clearLastSaved() {
    if (!storage) return;
    try { storage.removeItem(LAST_KEY); } catch (e) { /* non-fatal */ }
  }

  return {
    list, get, put, remove,
    normalizeName, isValidName,
    getLastSaved, setLastSaved, clearLastSaved,
    _setStorage,
  };
})();
