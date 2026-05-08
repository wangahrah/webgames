// Saves storage tests. Run from chicken/ dir: node tests/saves.test.js
// No deps — plain Node, vm sandbox; an in-memory storage stub stands in
// for browser localStorage.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeMemoryStorage() {
  const data = new Map();
  return {
    _data: data,
    getItem(k) { return data.has(k) ? data.get(k) : null; },
    setItem(k, v) { data.set(k, String(v)); },
    removeItem(k) { data.delete(k); },
    clear() { data.clear(); },
  };
}

const ctx = { console };
vm.createContext(ctx);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'js', 'saves.js'), 'utf8'),
  ctx
);
const { Saves, SavesQuotaError } = ctx;

let pass = 0, fail = 0;
function test(name, fn) {
  try {
    Saves._setStorage(makeMemoryStorage());
    fn();
    pass++;
    console.log('  ✓', name);
  } catch (e) {
    fail++;
    console.log('  ✗', name, '\n     ', e.message);
  }
}
function eq(a, b) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
  }
}
function ok(v, msg) { if (!v) throw new Error(msg || `expected truthy, got ${v}`); }
function throws(fn, type) {
  let err = null;
  try { fn(); } catch (e) { err = e; }
  if (!err) throw new Error('expected throw, got nothing');
  if (type && !(err instanceof type)) {
    throw new Error(`expected ${type.name}, got ${err.constructor.name}: ${err.message}`);
  }
  return err;
}

console.log('saves storage');

test('empty storage returns empty list', () => {
  eq(Saves.list(), []);
});

test('put then get round-trips code', () => {
  Saves.put('frog one', 'fd 50');
  const got = Saves.get('frog one');
  ok(got, 'expected entry');
  eq(got.name, 'frog one');
  eq(got.code, 'fd 50');
});

test('put a new entry returns {created:true}', () => {
  const r = Saves.put('frog one', 'fd 50');
  eq(r.created, true);
});

test('put existing name returns {created:false} and updates code', () => {
  Saves.put('frog one', 'fd 50');
  const r = Saves.put('frog one', 'rt 90');
  eq(r.created, false);
  eq(Saves.get('frog one').code, 'rt 90');
});

test('put bumps existing entry to top of list', () => {
  Saves.put('a', '1');
  Saves.put('b', '2');
  Saves.put('c', '3');
  eq(Saves.list().map(e => e.name), ['c', 'b', 'a']);
  Saves.put('a', '11');
  eq(Saves.list().map(e => e.name), ['a', 'c', 'b']);
});

test('case-insensitive duplicate detection', () => {
  Saves.put('Frog', 'fd 10');
  const r = Saves.put('frog', 'fd 20');
  eq(r.created, false);
  eq(Saves.list().length, 1);
  // Last-typed name wins for display
  eq(Saves.get('FROG').name, 'frog');
  eq(Saves.get('FROG').code, 'fd 20');
});

test('remove returns true on hit, removes entry', () => {
  Saves.put('a', '1');
  Saves.put('b', '2');
  eq(Saves.remove('a'), true);
  eq(Saves.list().map(e => e.name), ['b']);
});

test('remove returns false on miss', () => {
  Saves.put('a', '1');
  eq(Saves.remove('missing'), false);
});

test('remove is case-insensitive', () => {
  Saves.put('Frog', 'fd 10');
  eq(Saves.remove('FROG'), true);
  eq(Saves.list().length, 0);
});

test('list returns updated-desc order', () => {
  Saves.put('a', '1');
  Saves.put('b', '2');
  Saves.put('c', '3');
  eq(Saves.list().map(e => e.name), ['c', 'b', 'a']);
});

test('normalizeName trims', () => {
  eq(Saves.normalizeName('  hi  '), 'hi');
});

test('normalizeName collapses internal whitespace', () => {
  eq(Saves.normalizeName('hi   there'), 'hi there');
  eq(Saves.normalizeName('hi\tthere'), 'hi there');
});

test('normalizeName caps at 24', () => {
  const long = 'a'.repeat(40);
  eq(Saves.normalizeName(long).length, 24);
});

test('normalizeName whitespace-only returns empty', () => {
  eq(Saves.normalizeName('   '), '');
  eq(Saves.normalizeName(''), '');
  eq(Saves.normalizeName('\t\n  '), '');
});

test('normalizeName non-string returns empty', () => {
  eq(Saves.normalizeName(null), '');
  eq(Saves.normalizeName(undefined), '');
  eq(Saves.normalizeName(42), '');
});

test('isValidName rejects empty and whitespace', () => {
  eq(Saves.isValidName(''), false);
  eq(Saves.isValidName('   '), false);
});

test('isValidName accepts emoji', () => {
  eq(Saves.isValidName('🐔 fave'), true);
});

test('isValidName accepts normal names', () => {
  eq(Saves.isValidName('Frog'), true);
  eq(Saves.isValidName('a'), true);
});

test('corrupted manifest JSON falls back to empty list', () => {
  const stg = makeMemoryStorage();
  stg.setItem('chicken.saves.v1', '{not valid json');
  Saves._setStorage(stg);
  eq(Saves.list(), []);
  // Suppress the warn for this assertion line — replace console
  const origWarn = console.warn;
  console.warn = () => {};
  Saves.put('a', '1'); // should heal storage
  console.warn = origWarn;
  eq(Saves.list().map(e => e.name), ['a']);
});

test('non-array manifest falls back to empty list', () => {
  const stg = makeMemoryStorage();
  stg.setItem('chicken.saves.v1', '{"oops": true}');
  Saves._setStorage(stg);
  eq(Saves.list(), []);
});

test('manifest entries with bad shape are filtered', () => {
  const stg = makeMemoryStorage();
  stg.setItem('chicken.saves.v1', JSON.stringify([
    { name: 'good', code: 'fd 10' },
    { name: 42, code: 'fd 10' },         // bad
    { name: 'no-code' },                 // bad
    null,                                // bad
    { name: 'also good', code: 'rt 90' },
  ]));
  Saves._setStorage(stg);
  eq(Saves.list().map(e => e.name), ['good', 'also good']);
});

test('quota error wraps as SavesQuotaError', () => {
  const stg = {
    getItem() { return null; },
    setItem() { throw new Error('QuotaExceededError'); },
    removeItem() {},
  };
  Saves._setStorage(stg);
  throws(() => Saves.put('big', 'x'), SavesQuotaError);
});

test('lastSaved get/set roundtrip', () => {
  eq(Saves.getLastSaved(), null);
  Saves.setLastSaved('Frog', 'fd 50');
  eq(Saves.getLastSaved(), { name: 'Frog', code: 'fd 50' });
});

test('lastSaved accepts null name (used for examples)', () => {
  Saves.setLastSaved(null, 'fd 50\nrt 90');
  eq(Saves.getLastSaved(), { name: null, code: 'fd 50\nrt 90' });
});

test('clearLastSaved removes it', () => {
  Saves.setLastSaved('Frog', 'fd 50');
  Saves.clearLastSaved();
  eq(Saves.getLastSaved(), null);
});

test('lastSaved corrupt JSON returns null', () => {
  const stg = makeMemoryStorage();
  stg.setItem('chicken.lastSaved', '{garbage');
  Saves._setStorage(stg);
  eq(Saves.getLastSaved(), null);
});

test('emoji name survives roundtrip', () => {
  Saves.put('🐔 best', 'fd 10');
  eq(Saves.get('🐔 best').name, '🐔 best');
});

test('empty storage with no manifest does not throw', () => {
  Saves._setStorage(makeMemoryStorage());
  eq(Saves.list(), []);
  eq(Saves.get('anything'), null);
  eq(Saves.remove('anything'), false);
  eq(Saves.getLastSaved(), null);
});

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
