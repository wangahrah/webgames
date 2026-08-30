// The game, in a real browser. Run from smoosh/ dir:
//   node tests/ui.headless.test.js
//
// engine/levels/gen/world/quest are pure logic and covered headlessly. This
// suite drives the ACTUAL page -- the map, tile clicks, the operator ring,
// undo, the reward card -- by loading index.html in headless Chrome and
// clicking things, because every bug that ever survived the logic tests lived
// in the wiring.
//
// Chrome is optional: with no browser installed this suite skips rather than
// fails.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const CANDIDATES = [
  process.env.CHROME_BIN,
  'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser',
].filter(Boolean);

function findChrome() {
  for (const bin of CANDIDATES) {
    try { execFileSync('which', [bin], { stdio: 'pipe' }); return bin; }
    catch (e) { /* keep looking */ }
  }
  return null;
}

const chrome = findChrome();
if (!chrome) {
  console.log('the game (headless)');
  console.log('  — skipped: no Chrome found (set CHROME_BIN to run these)');
  process.exit(0);
}

// Shared driver vocabulary. Everything talks to the page through the DOM --
// no reaching into app.js internals, because the wiring IS what is under test.
const HELPERS = `
  function q(s) { return document.querySelector(s); }
  function all(s) { return [].slice.call(document.querySelectorAll(s)); }
  function shown(sel) { var e = q(sel); return !!e && getComputedStyle(e).display !== 'none'; }
  function tiles() { return all('#bench .tile'); }
  function values() { return tiles().map(function (t) { return +t.querySelector('.tile-value').textContent; }); }
  function tileWith(v) {
    return tiles().filter(function (t) { return +t.querySelector('.tile-value').textContent === v; })[0];
  }
  function pick(a, b) { tileWith(a).click(); tileWith(b).click(); }
  function op(o) { q('#ring .op[data-op="' + o + '"]').click(); }
  function stars() {
    return [1,2,3].map(function (i) { return q('#star-' + i).classList.contains('earned') ? 1 : 0; });
  }
  function nodes() { return all('.mapnode'); }
  function place(name) {
    return nodes().filter(function (b) {
      return b.querySelector('.mapnode-name').textContent === name;
    })[0];
  }
  function stateOf(name) { var p = place(name); return p ? p.dataset.state : null; }
  function esc() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }
  function screens() {
    return { map: shown('#screen-map'), puzzle: shown('#screen-puzzle'), win: shown('#win') };
  }
`;

function runProbe(seed, body) {
  const probePath = path.join(ROOT, '.probe.tmp.html');
  const seeder = seed ? `<script>try { ${seed} } catch (e) {}</script>\n  ` : '';
  const driver = `
<script>
(function () {
  var out = [];
  ${HELPERS}
  try {
    ${body}
    document.title = 'RESULT ' + JSON.stringify(out);
  } catch (e) {
    document.title = 'JSERROR ' + e.message + ' @ ' + (e.stack || '').split('\\n')[1];
  }
})();
</script>
</body>`;
  let raw;
  try {
    const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
      .replace('<script src="js/engine.js"></script>', seeder + '<script src="js/engine.js"></script>')
      .replace('</body>', driver);
    fs.writeFileSync(probePath, page);
    raw = execFileSync(chrome, [
      '--headless=new', '--disable-gpu', '--no-sandbox',
      '--allow-file-access-from-files',
      '--user-data-dir=' + fs.mkdtempSync(path.join(os.tmpdir(), 'smoosh-')),
      '--dump-dom', 'file://' + probePath,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024 });
  } finally {
    try { fs.unlinkSync(probePath); } catch (e) { /* already gone */ }
  }
  const m = raw.match(/<title>([\s\S]*?)<\/title>/);
  if (!m) { console.error('no <title> in the dumped DOM — the page did not load'); process.exit(1); }
  if (m[1].startsWith('JSERROR')) { console.error(m[1]); process.exit(1); }
  if (!m[1].startsWith('RESULT ')) { console.error('probe never finished: ' + m[1]); process.exit(1); }
  return JSON.parse(m[1].slice('RESULT '.length));
}

// ---- probe 1: a valley nobody has walked yet ------------------------------

const FRESH = `
    out.push({ name: 'boot', screens: screens(), places: nodes().length,
               open: nodes().filter(function (n) { return n.dataset.state === 'open'; }).length,
               actions: shown('#puzzle-actions') });

    // A locked place says why, and does not open.
    place('???').click();
    out.push({ name: 'locked', screens: screens(), status: q('#status').textContent });

    place('The Knotted Gate').click();
    out.push({ name: 'entered', screens: screens(), actions: shown('#puzzle-actions'),
               target: q('#target').textContent, tiles: values(),
               placeName: q('#level-name').textContent, blurb: q('#node-blurb').textContent,
               twist: q('#star-3 .twist').textContent });

    // Three stars the long way: 3+4=7, 7+5=12, no minus used.
    pick(3, 4); op('+');
    pick(7, 5); op('+');
    out.push({ name: 'solved', screens: screens(), stars: stars(),
               winStars: q('#win-stars').textContent,
               title: q('#win-title').textContent, tale: q('#win-tale').textContent,
               item: shown('#win-item'), backShown: shown('#win-map') });

    q('#win-map').click();
    out.push({ name: 'returned', screens: screens(), actions: shown('#puzzle-actions'),
               gate: stateOf('The Knotted Gate'), next: stateOf('Berries for Hollowbeak'),
               gateStars: (place('The Knotted Gate').querySelector('.mapnode-stars') || {}).textContent,
               tally: q('#valley-tally').textContent });

    // The place that was locked a moment ago now opens.
    place('Berries for Hollowbeak').click();
    out.push({ name: 'second', screens: screens(), target: q('#target').textContent,
               tiles: values(), placeName: q('#level-name').textContent });

    pick(7, 2); op('×');                     // one star, seeds left over
    q('#win-next').click();
    out.push({ name: 'onwards', screens: screens(), placeName: q('#level-name').textContent,
               target: q('#target').textContent });

    // The Sunken Step hands over the Mossknife.
    pick(9, 3); op('÷');
    pick(3, 4); op('×');
    out.push({ name: 'gift', item: shown('#win-item'),
               itemText: q('#win-item').textContent, winStars: q('#win-stars').textContent });

    q('#win-map').click();
    out.push({ name: 'bag', bag: q('#valley-bag').textContent,
               hollow: stateOf('The Vine Arch'), tally: q('#valley-tally').textContent,
               screens: screens() });
`;

// ---- probe 2: a valley already walked, so the later boards are reachable ---

const WALKED_SEED = `
  localStorage.setItem('smoosh.quest.v1', JSON.stringify({ stars: {
    'clearing-gate': 3, 'clearing-bird': 3, 'clearing-step': 3,
    'hollow-arch': 3, 'hollow-thorn': 3, 'hollow-nest': 3, 'hollow-snare': 3,
    'hollow-heart': 3
  }}));
`;

const WALKED = `
    out.push({ name: 'resume', open: nodes().filter(function (n) {
                 return n.dataset.state === 'done'; }).length,
               tally: q('#valley-tally').textContent,
               bag: q('#valley-bag').textContent });

    // The bog is open ground now, but nothing is built on it yet.
    place('The Boardwalk').click();
    out.push({ name: 'unbuilt', state: stateOf('The Boardwalk'), screens: screens(),
               status: q('#status').textContent });

    // Peek is off by default and that is load-bearing.
    place('The Knotted Gate').click();
    pick(3, 4);
    var before = q('#ring .op[data-op="+"]').querySelector('.peek');
    q('#peek').click();
    var after = q('#ring .op[data-op="+"]').querySelector('.peek');
    out.push({ name: 'peek', beforeText: before ? before.textContent : null,
               afterText: after ? after.textContent : null,
               pressed: q('#peek').getAttribute('aria-pressed') });
    q('#peek').click();
    esc();

    // An operator that cannot produce a whole number is visibly dead.
    q('#to-map').click();
    place('The High Nest').click();
    pick(7, 2);
    out.push({ name: 'illegal-div', divDisabled: q('#ring .op[data-op="÷"]').disabled,
               timesDisabled: q('#ring .op[data-op="×"]').disabled });
    esc();

    pick(3, 7);
    out.push({ name: 'illegal-minus', minusDisabled: q('#ring .op[data-op="-"]').disabled });
    esc();

    pick(3, 7);
    q('#swap').click();
    out.push({ name: 'swap', minusDisabled: q('#ring .op[data-op="-"]').disabled });
    esc();

    // A vine-bound seed refuses every operator but its own.
    q('#to-map').click();
    place('The Vine Arch').click();
    out.push({ name: 'collar-drawn', collars: all('.tile .collar').length });
    pick(9, 4);
    out.push({ name: 'collar-locks', plus: q('#ring .op[data-op="+"]').disabled,
               times: q('#ring .op[data-op="×"]').disabled });
    esc();

    // Keyboard: with two seeds picked, the operator keys fuse them.
    q('#to-map').click();
    place('Thornway').click();
    pick(2, 3);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '*', bubbles: true }));
    out.push({ name: 'keyboard-merge', tiles: values() });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    out.push({ name: 'keyboard-undo', tiles: values(), undoDisabled: q('#undo').disabled });

    q('#restart').click();
    out.push({ name: 'restart', tiles: values(), stars: stars() });

    // The hint names one move and never the whole chain.
    q('#hint').click();
    out.push({ name: 'hint', status: q('#status').textContent });

    // Endless mode still works, and is not part of the valley.
    q('.mode[data-mode="endless"]').click();
    q('.endless-pick[data-difficulty="easy"]').click();
    out.push({ name: 'endless', screens: screens(), tiles: values().length,
               mode: q('.mode[data-mode="endless"]').classList.contains('active'),
               target: q('#target').textContent, blurb: shown('#node-blurb') });

    // And the Valley button always gets you home.
    q('.mode[data-mode="quest"]').click();
    out.push({ name: 'home', screens: screens(),
               mode: q('.mode[data-mode="quest"]').classList.contains('active') });
`;

const fresh = runProbe(null, FRESH);
const walked = runProbe(WALKED_SEED, WALKED);
const A = (name) => fresh.find((r) => r.name === name);
const B = (name) => walked.find((r) => r.name === name);

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); }
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error((msg ? msg + ': ' : '') + `got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
  }
}
function ok(v, msg) { if (!v) throw new Error(msg || `expected truthy, got ${v}`); }
function nope(v, msg) { if (v) throw new Error(msg || `expected falsy, got ${JSON.stringify(v)}`); }

console.log('the valley (headless)');

test('the game opens on the map, with one way in', () => {
  const r = A('boot');
  ok(r.screens.map, 'the map is not showing');
  nope(r.screens.puzzle, 'a board is showing before anywhere was chosen');
  nope(r.screens.win, 'the reward card is on screen at boot');
  nope(r.actions, 'the board buttons are showing on the map');
  eq(r.places, 20, 'the whole valley should be drawn from day one');
  eq(r.open, 1, 'exactly one place should be open on a fresh save');
});

test('a locked place explains itself instead of opening', () => {
  const r = A('locked');
  ok(r.screens.map, 'a locked place let us in');
  nope(r.screens.puzzle);
  ok(r.status && r.status.length > 4, 'no explanation given: ' + r.status);
});

test('a place with no puzzle behind it is drawn, and says so', () => {
  const r = B('unbuilt');
  eq(r.state, 'unbuilt', 'The Boardwalk should be open ground with nothing built on it');
  ok(r.screens.map, 'an unbuilt place let us in');
  nope(r.screens.puzzle);
  ok(/growing/.test(r.status), 'no explanation given: ' + r.status);
});

console.log('a place, entered');

test('entering a place swaps the screen and shows what it wants', () => {
  const r = A('entered');
  ok(r.screens.puzzle, 'the board did not appear');
  nope(r.screens.map, 'the map is still on screen behind the board');
  nope(r.screens.win, 'the reward card is up before anyone won');
  ok(r.actions, 'the board buttons did not appear');
  eq(r.target, '12');
  eq(r.tiles.sort((a, b) => a - b), [3, 4, 5]);
  eq(r.placeName, 'The Knotted Gate', 'the board is named after the level, not the place');
  ok(r.blurb.length > 10, 'the place said nothing: ' + r.blurb);
  eq(r.twist, 'no − at all');
});

test('solving it earns stars and tells you what happened', () => {
  const r = A('solved');
  eq(r.stars, [1, 1, 1]);
  eq(r.winStars, '★★★');
  ok(r.screens.win, 'no reward card');
  eq(r.title, 'The Knotted Gate');
  ok(r.tale.length > 10, 'the place had nothing to say about it: ' + r.tale);
  nope(r.item, 'an item appeared from a place that gives none');
  ok(r.backShown, 'no way back to the valley');
});

test('going back shows the place solved and the next one open', () => {
  const r = A('returned');
  ok(r.screens.map, 'did not return to the map');
  nope(r.screens.win, 'the reward card followed us to the map');
  nope(r.actions, 'the board buttons stayed up on the map');
  eq(r.gate, 'done', 'the solved place is not marked done');
  eq(r.next, 'open', 'the next place did not open');
  eq(r.gateStars, '★★★', 'stars not drawn on the map');
  ok(/3 of/.test(r.tally), 'the tally is wrong: ' + r.tally);
});

test('the newly opened place can be walked into', () => {
  const r = A('second');
  ok(r.screens.puzzle);
  eq(r.placeName, 'Berries for Hollowbeak');
  eq(r.target, '14');
  eq(r.tiles.sort((a, b) => a - b), [2, 4, 7]);
});

test('onwards goes to the next place along', () => {
  const r = A('onwards');
  ok(r.screens.puzzle, 'onwards did not land on a board');
  eq(r.placeName, 'The Sunken Step');
  eq(r.target, '12');
});

test('a place that gives an item hands it over on the card', () => {
  const r = A('gift');
  ok(r.item, 'the item was not shown');
  ok(/Mossknife/.test(r.itemText), 'wrong item: ' + r.itemText);
  eq(r.winStars, '★★★');
});

test('the item is in the bag afterwards, and the next region opens', () => {
  const r = A('bag');
  ok(r.screens.map);
  ok(/Mossknife/.test(r.bag), 'the bag is empty: ' + r.bag);
  eq(r.hollow, 'open', 'Bramble Hollow did not open at 7 stars');
});

console.log('coming back to a valley already walked');

test('saved progress is on the map at boot', () => {
  const r = B('resume');
  eq(r.open, 8, 'saved stars did not survive the reload');
  ok(/Mossknife/.test(r.bag), 'the bag forgot its item: ' + r.bag);
  ok(/★ 24/.test(r.tally), 'the tally is wrong: ' + r.tally);
});

console.log('the board itself');

test('peek is off until asked for, then shows the answers', () => {
  const r = B('peek');
  eq(r.beforeText, null, 'the ring was giving the answers away');
  eq(r.afterText, '7');
  eq(r.pressed, 'true');
});

test('a division that would not come out even is greyed out', () => {
  const r = B('illegal-div');
  ok(r.divDisabled, '7 ÷ 2 was offered');
  nope(r.timesDisabled, '7 × 2 should be fine');
});

test('a subtraction that would go negative is greyed out, until you swap', () => {
  ok(B('illegal-minus').minusDisabled, '3 − 7 was offered on a no-negatives level');
  nope(B('swap').minusDisabled, 'swapping to 7 − 3 should unlock the minus');
});

test('vines are drawn and enforced', () => {
  eq(B('collar-drawn').collars, 1);
  ok(B('collar-locks').plus, 'the vine-bound 9 accepted a plus');
  nope(B('collar-locks').times, 'the vine-bound 9 refused its own operator');
});

test('the operator keys work on a picked pair, and undo puts it back', () => {
  eq(B('keyboard-merge').tiles.sort((a, b) => a - b), [4, 5, 6]);
  eq(B('keyboard-undo').tiles.sort((a, b) => a - b), [2, 3, 4, 5]);
  ok(B('keyboard-undo').undoDisabled, 'undo should be spent');
});

test('restart deals the place again', () => {
  eq(B('restart').tiles.sort((a, b) => a - b), [2, 3, 4, 5]);
  eq(B('restart').stars, [0, 0, 0]);
});

test('the hint gives one move, not the answer', () => {
  const s = B('hint').status;
  ok(/try \d+ .{1,2} \d+/.test(s), 'hint did not name a move: ' + s);
  ok(s.split('…')[0].split(/\s+/).length <= 5, 'the hint is giving the game away: ' + s);
});

test('endless mode still deals a board, outside the valley', () => {
  const r = B('endless');
  ok(r.screens.puzzle, 'endless did not open a board');
  nope(r.screens.map);
  eq(r.tiles, 3);
  ok(r.mode, 'endless did not become the active mode');
  ok(/^\d+$/.test(r.target), 'no target: ' + r.target);
  nope(r.blurb, 'an endless puzzle claimed to be a place in the valley');
});

test('the Valley button always gets you home', () => {
  const r = B('home');
  ok(r.screens.map, 'the Valley button did not go to the map');
  nope(r.screens.puzzle);
  ok(r.mode);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
