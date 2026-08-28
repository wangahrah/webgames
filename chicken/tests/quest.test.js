// Quest progress tests. Run from chicken/ dir: node tests/quest.test.js
// Mirrors saves.test.js: an in-memory storage stub stands in for localStorage.

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
for (const f of ['js/levels.js', 'js/quest.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx);
}
const { Quest, Levels } = ctx;

let pass = 0, fail = 0;
let storage;
function test(name, fn) {
  try {
    storage = makeMemoryStorage();
    Quest._setStorage(storage);
    Quest.leave();
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

const FIRST = Levels.LEVELS[0].id;
const win = (over) => ({
  outcome: 'win', eggsGot: 0, eggsTotal: 0, commands: 1, par: 1, ...over,
});

console.log('quest progress');

test('a fresh player has no stars anywhere', () => {
  eq(Quest.progressFor(FIRST), { stars: 0, bestCommands: null });
  eq(Quest.totalStars(), 0);
});

test('a win is recorded and survives a re-read', () => {
  Quest.record(FIRST, win());
  eq(Quest.progressFor(FIRST), { stars: 3, bestCommands: 1 });
});

test('a sloppier second run never takes stars away', () => {
  Quest.record(FIRST, win());
  Quest.record(FIRST, win({ commands: 40 }));
  eq(Quest.progressFor(FIRST).stars, 3);
});

test('a tidier run improves the best command count', () => {
  Quest.record(FIRST, win({ commands: 9, par: 3 }));
  eq(Quest.progressFor(FIRST).bestCommands, 9);
  Quest.record(FIRST, win({ commands: 3, par: 3 }));
  eq(Quest.progressFor(FIRST).bestCommands, 3);
  Quest.record(FIRST, win({ commands: 20, par: 3 }));
  eq(Quest.progressFor(FIRST).bestCommands, 3);
});

test('a losing run records nothing but does not crash', () => {
  Quest.record(FIRST, { outcome: 'bump', eggsGot: 0, eggsTotal: 0, commands: 5, par: 3 });
  eq(Quest.progressFor(FIRST), { stars: 0, bestCommands: null });
});

test('record reports the stars for this attempt and whether it improved', () => {
  const a = Quest.record(FIRST, win({ eggsGot: 0, eggsTotal: 2, commands: 9, par: 3 }));
  eq(a.stars, 1);
  eq(a.improved, true);
  const b = Quest.record(FIRST, win({ eggsGot: 0, eggsTotal: 2, commands: 9, par: 3 }));
  eq(b.improved, false);
});

test('totalStars adds up across levels', () => {
  Quest.record(Levels.LEVELS[0].id, win());
  Quest.record(Levels.LEVELS[1].id, win({ eggsGot: 0, eggsTotal: 1, commands: 99, par: 3 }));
  eq(Quest.totalStars(), 4);
});

test('list returns every level with its progress attached', () => {
  Quest.record(FIRST, win());
  const rows = Quest.list();
  eq(rows.length, Levels.LEVELS.length);
  eq(rows[0].level.id, FIRST);
  eq(rows[0].progress.stars, 3);
});

test('corrupt progress heals into an empty slate', () => {
  storage.setItem('chicken.quest.v1', '{not json');
  eq(Quest.progressFor(FIRST), { stars: 0, bestCommands: null });
  Quest.record(FIRST, win());
  eq(Quest.progressFor(FIRST).stars, 3);
});

test('a garbage record for one level does not poison the others', () => {
  storage.setItem('chicken.quest.v1', JSON.stringify({
    [FIRST]: { stars: 'lots' },
    fence: { stars: 2, bestCommands: 7 },
  }));
  eq(Quest.progressFor(FIRST).stars, 0);
  eq(Quest.progressFor('fence'), { stars: 2, bestCommands: 7 });
});

test('stars from a tampered file are clamped to three', () => {
  storage.setItem('chicken.quest.v1', JSON.stringify({ [FIRST]: { stars: 99 } }));
  eq(Quest.progressFor(FIRST).stars, 3);
});

test('clearProgress wipes the lot', () => {
  Quest.record(FIRST, win());
  Quest.clearProgress();
  eq(Quest.totalStars(), 0);
});

console.log('\nsession');

test('you start in free draw', () => {
  eq(Quest.isActive(), false);
  eq(Quest.current(), null);
});

test('entering a level makes it current, leaving clears it', () => {
  const lv = Quest.enter(FIRST);
  ok(lv);
  eq(Quest.isActive(), true);
  eq(Quest.current().id, FIRST);
  Quest.leave();
  eq(Quest.isActive(), false);
});

test('entering a level that does not exist changes nothing', () => {
  eq(Quest.enter('nope'), null);
  eq(Quest.isActive(), false);
});

console.log('\nper-level drafts');

test('a level with no draft yet returns null', () => {
  eq(Quest.getDraft(FIRST), null);
});

test('drafts round-trip per level and do not bleed into each other', () => {
  Quest.setDraft(FIRST, 'fd 100\n');
  Quest.setDraft('fence', 'rt 90\n');
  eq(Quest.getDraft(FIRST), 'fd 100\n');
  eq(Quest.getDraft('fence'), 'rt 90\n');
});

test('drafts never touch the free-draw draft', () => {
  storage.setItem('chicken.cluck', 'my drawing\n');
  Quest.setDraft(FIRST, 'fd 700\n');
  eq(storage.getItem('chicken.cluck'), 'my drawing\n');
});

test('an empty draft is a real value, not a missing one', () => {
  Quest.setDraft(FIRST, '');
  eq(Quest.getDraft(FIRST), '');
  Quest.clearDraft(FIRST);
  eq(Quest.getDraft(FIRST), null);
});

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
