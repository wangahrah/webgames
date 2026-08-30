// Best-score storage tests against an in-memory localStorage stub.
// Run from flapjack/: node tests/scores.test.js

const { Best } = require('../js/scores.js');

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

let pass = 0, fail = 0;
function test(name, fn) {
  try {
    Best._setStorage(makeMemoryStorage());
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

function storage() { return current; }
// expose the current stub for key inspection
let current;
const realSetStorage = Best._setStorage;
Best._setStorage = function (s) { current = s; realSetStorage(s); };

console.log('best-score storage');

test('fresh storage has no best', () => {
  eq(Best.best('unicorn', 'easy'), 0);
});

test('save then load roundtrips per theme x difficulty', () => {
  Best.saveBest('unicorn', 'easy', 23);
  Best.saveBest('unicorn', 'hard', 7);
  Best.saveBest('ocean', 'easy', 11);
  eq(Best.best('unicorn', 'easy'), 23);
  eq(Best.best('unicorn', 'hard'), 7);
  eq(Best.best('ocean', 'easy'), 11);
  eq(Best.best('ocean', 'medium'), 0, 'untouched combo stays 0');
});

test('new-best detection true only on a genuine record', () => {
  ok(Best.isNewBest('dragon', 'medium', 5), 'first ever score is a new best');
  Best.saveBest('dragon', 'medium', 5);
  ok(!Best.isNewBest('dragon', 'medium', 5), 'equal score is not a new best');
  ok(!Best.isNewBest('dragon', 'medium', 4), 'lower score is not a new best');
  ok(Best.isNewBest('dragon', 'medium', 6), 'higher score is a new best');
});

test('saveBest returns true only when it actually records', () => {
  ok(Best.saveBest('rocket', 'hard', 30), 'record saved');
  ok(!Best.saveBest('rocket', 'hard', 10), 'not a record, no save');
  eq(Best.best('rocket', 'hard'), 30);
});

test('keys are namespaced flapjack.best.*', () => {
  Best.saveBest('bee', 'medium', 9);
  Best.saveBest('bee', 'hard', 3);
  const keys = [...current._data.keys()];
  ok(keys.length === 2, `expected 2 keys, got ${keys.length}`);
  for (const k of keys) {
    ok(k.startsWith('flapjack.best.'), `key "${k}" not namespaced`);
  }
  eq(keys.sort(), ['flapjack.best.bee.hard', 'flapjack.best.bee.medium'].sort());
});

test('corrupt storage treated as 0 and heals on next save', () => {
  const stg = makeMemoryStorage();
  stg.setItem('flapjack.best.unicorn.easy', '{garbage');
  Best._setStorage(stg);
  eq(Best.best('unicorn', 'easy'), 0, 'corrupt value reads as 0');
  Best.saveBest('unicorn', 'easy', 40);
  eq(Best.best('unicorn', 'easy'), 40, 'next save heals storage');
});

test('negative or NaN stored values read as 0', () => {
  const stg = makeMemoryStorage();
  stg.setItem('flapjack.best.retro.easy', '-5');
  stg.setItem('flapjack.best.retro.medium', 'not-a-number');
  Best._setStorage(stg);
  eq(Best.best('retro', 'easy'), 0);
  eq(Best.best('retro', 'medium'), 0);
});

test('saving a zero or negative score is ignored', () => {
  ok(!Best.saveBest('ghost', 'easy', 0), 'zero not recorded');
  ok(!Best.saveBest('ghost', 'easy', -3), 'negative not recorded');
  eq(Best.best('ghost', 'easy'), 0);
});

console.log('\npreference persistence');

test('theme/difficulty/muted persist under flapjack.* keys', () => {
  Best.setTheme('dragon');
  Best.setDifficulty('hard');
  Best.setMuted(true);
  eq(Best.getTheme(), 'dragon');
  eq(Best.getDifficulty(), 'hard');
  eq(Best.getMuted(), true);
  const keys = [...current._data.keys()].sort();
  eq(keys, ['flapjack.difficulty', 'flapjack.muted', 'flapjack.theme']);
});

test('fresh storage defaults theme/difficulty/mute', () => {
  eq(Best.getTheme(), 'unicorn');
  eq(Best.getDifficulty(), 'easy');
  eq(Best.getMuted(), false);
});

test('mute toggle roundtrip', () => {
  Best.setMuted(true);
  ok(Best.getMuted());
  Best.setMuted(false);
  ok(!Best.getMuted());
});

test('survives a fresh module-load against the same storage', () => {
  const stg = makeMemoryStorage();
  stg.setItem('flapjack.best.ghost.hard', '12');
  stg.setItem('flapjack.theme', 'ghost');
  const reloaded = require('../js/scores.js').Best;
  reloaded._setStorage(stg);
  eq(reloaded.best('ghost', 'hard'), 12);
  eq(reloaded.getTheme(), 'ghost');
});

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);