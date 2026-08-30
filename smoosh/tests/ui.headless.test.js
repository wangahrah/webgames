// The board, in a real browser. Run from smoosh/ dir:
//   node tests/ui.headless.test.js
//
// engine/levels/gen are pure logic and covered headlessly. This suite drives
// the ACTUAL page -- tile clicks, the operator ring, undo, the win overlay --
// by loading index.html in headless Chrome and clicking things, because every
// bug that ever survived the logic tests lived in the wiring.
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
  console.log('board (headless)');
  console.log('  — skipped: no Chrome found (set CHROME_BIN to run these)');
  process.exit(0);
}

// The driver runs after every script has loaded, and talks to the page only
// through the DOM -- no reaching into app.js internals, because the wiring IS
// what is under test.
const DRIVER = `
<script>
(function () {
  var out = [];
  function q(s) { return document.querySelector(s); }
  function tiles() { return [].slice.call(document.querySelectorAll('#bench .tile')); }
  function values() { return tiles().map(function (t) { return +t.querySelector('.tile-value').textContent; }); }
  function tileWith(v) {
    return tiles().filter(function (t) { return +t.querySelector('.tile-value').textContent === v; })[0];
  }
  function pick(a, b) { tileWith(a).click(); tileWith(b).click(); }
  function op(o) { q('#ring .op[data-op="' + o + '"]').click(); }
  function stars() {
    return [1,2,3].map(function (i) { return q('#star-' + i).classList.contains('earned') ? 1 : 0; });
  }
  function openLevel(name) {
    q('.mode[data-mode="puzzles"]').click();
    var row = [].slice.call(document.querySelectorAll('.puzzle-row'))
      .filter(function (r) { return r.querySelector('.puzzle-name').textContent === name; })[0];
    row.click();
  }
  function esc() {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  }

  function shown(sel) { return getComputedStyle(q(sel)).display !== 'none'; }

  try {
    openLevel('First Fuse');
    // COMPUTED style, not the hidden property: [hidden] is the weakest rule in
    // the cascade and .ring/.win both set display, so el.hidden can be true
    // while the thing is sitting in front of the board.
    out.push({ name: 'overlays-down', ring: shown('#ring'), win: shown('#win'),
               panel: shown('#puzzle-panel') });
    out.push({ name: 'load', target: q('#target').textContent,
               tiles: values(), twist: q('#star-3 .twist').textContent, stars: stars() });

    pick(3, 4);
    out.push({ name: 'ring-opens', hidden: q('#ring').hidden,
               picked: document.querySelectorAll('.tile.picked').length });

    op('×');
    out.push({ name: 'merged', tiles: values(), ringShown: shown('#ring'), winShown: shown('#win'),
               expr: (tileWith(12) || {}).textContent, stars: stars(),
               win: !q('#win').hidden, winStars: q('#win-stars').textContent,
               ringHidden: q('#ring').hidden });

    esc();
    q('#undo').click();
    out.push({ name: 'undo', tiles: values(), stars: stars(),
               win: !q('#win').hidden, undoDisabled: q('#undo').disabled });

    // Three stars the long way: 3+4=7, 7+5=12, no minus used.
    pick(3, 4); op('+');
    pick(7, 5); op('+');
    out.push({ name: 'three-star', tiles: values(), stars: stars(),
               winStars: q('#win-stars').textContent,
               expr: q('#win-expr').textContent });

    esc();
    q('#restart').click();
    out.push({ name: 'restart', tiles: values(), stars: stars(),
               undoDisabled: q('#undo').disabled });

    // Peek is off by default and that is load-bearing.
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
    openLevel('Fifty-Six');
    pick(7, 2);
    out.push({ name: 'illegal-div', divDisabled: q('#ring .op[data-op="÷"]').disabled,
               timesDisabled: q('#ring .op[data-op="×"]').disabled });
    esc();

    // No negatives on this level, so 3 - 7 is refused.
    pick(3, 7);
    out.push({ name: 'illegal-minus', minusDisabled: q('#ring .op[data-op="-"]').disabled });
    esc();

    // Swap flips which tile goes first, so subtraction has both directions.
    pick(3, 7);
    q('#swap').click();
    out.push({ name: 'swap', minusDisabled: q('#ring .op[data-op="-"]').disabled });
    esc();

    // A collared tile refuses every operator but its own.
    openLevel('The Golden Collar');
    out.push({ name: 'collar-drawn', collars: document.querySelectorAll('.tile .collar').length });
    pick(9, 4);
    out.push({ name: 'collar-locks', plus: q('#ring .op[data-op="+"]').disabled,
               times: q('#ring .op[data-op="×"]').disabled });
    esc();

    // Keyboard: with two tiles picked, the operator keys fuse them.
    openLevel('Twenty-Four');
    pick(2, 3);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: '*', bubbles: true }));
    out.push({ name: 'keyboard-merge', tiles: values() });
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }));
    out.push({ name: 'keyboard-undo', tiles: values() });

    // The hint names one move and never the whole chain.
    q('#hint').click();
    out.push({ name: 'hint', status: q('#status').textContent });

    // Endless mode makes a board of the right size.
    q('.mode[data-mode="endless"]').click();
    q('.endless-pick[data-difficulty="easy"]').click();
    out.push({ name: 'endless', tiles: values().length,
               mode: q('.mode[data-mode="endless"]').classList.contains('active'),
               target: q('#target').textContent });

    document.title = 'RESULT ' + JSON.stringify(out);
  } catch (e) {
    document.title = 'JSERROR ' + e.message + ' @ ' + (e.stack || '').split('\\n')[1];
  }
})();
</script>
</body>`;

const probePath = path.join(ROOT, '.probe.tmp.html');
let raw;
try {
  const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8')
    .replace('</body>', DRIVER);
  fs.writeFileSync(probePath, page);
  raw = execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
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
const results = JSON.parse(m[1].slice('RESULT '.length));
const by = (name) => results.find((r) => r.name === name);

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

console.log('board (headless)');

test('a level loads with its target, tiles and twist on screen', () => {
  const r = by('load');
  eq(r.target, '12');
  eq(r.tiles.sort((a, b) => a - b), [3, 4, 5]);
  eq(r.twist, 'no − at all');
  eq(r.stars, [0, 0, 0]);
});

test('nothing is covering the board at load', () => {
  const r = by('overlays-down');
  nope(r.ring, 'the operator ring is on screen with nothing picked');
  nope(r.win, 'the win overlay is on screen before anyone has won');
  nope(r.panel, 'the puzzle picker stayed open');
});

test('picking two tiles opens the ring', () => {
  const r = by('ring-opens');
  nope(r.hidden, 'ring stayed hidden');
  eq(r.picked, 2);
});

test('an operator fuses the pair and the ring goes away', () => {
  const r = by('merged');
  eq(r.tiles.sort((a, b) => a - b), [5, 12]);
  ok(r.ringHidden, 'the ring stayed up after the merge');
  nope(r.ringShown, 'the ring is still painted after the merge');
  ok(r.win && r.winShown, 'no win overlay');
  // 3 x 4 hits the target and never touches the minus, so stars 1 and 3 both
  // light; star 2 does not, because the 5 is still sitting there. The three
  // stars are independent -- that is what keeps a partial win worth having.
  eq(r.stars, [1, 0, 1], 'stars after 3 x 4 on a no-minus level');
});

test('a fused tile shows the sum it came from', () => {
  ok(by('merged').expr.indexOf('3 × 4') >= 0, 'no expression under the number');
});

test('undo puts the board back and takes the overlay down', () => {
  const r = by('undo');
  eq(r.tiles.sort((a, b) => a - b), [3, 4, 5]);
  eq(r.stars, [0, 0, 0]);
  nope(r.win);
  ok(r.undoDisabled, 'undo should be spent');
});

test('all three stars light when the twist is honoured', () => {
  const r = by('three-star');
  eq(r.tiles, [12]);
  eq(r.stars, [1, 1, 1]);
  eq(r.winStars, '★★★');
  ok(r.expr.indexOf('12') >= 0, 'the winning expression is not shown');
});

test('restart deals the level again', () => {
  const r = by('restart');
  eq(r.tiles.sort((a, b) => a - b), [3, 4, 5]);
  eq(r.stars, [0, 0, 0]);
  ok(r.undoDisabled);
});

test('peek is off until asked for, then shows the answers', () => {
  const r = by('peek');
  eq(r.beforeText, null, 'the ring was giving the answers away');
  eq(r.afterText, '7');
  eq(r.pressed, 'true');
});

test('a division that would not come out even is greyed out', () => {
  const r = by('illegal-div');
  ok(r.divDisabled, '7 ÷ 2 was offered');
  nope(r.timesDisabled, '7 × 2 should be fine');
});

test('a subtraction that would go negative is greyed out, until you swap', () => {
  ok(by('illegal-minus').minusDisabled, '3 − 7 was offered on a no-negatives level');
  nope(by('swap').minusDisabled, 'swapping to 7 − 3 should unlock the minus');
});

test('collars are drawn and enforced', () => {
  eq(by('collar-drawn').collars, 1);
  ok(by('collar-locks').plus, 'the collared 9 accepted a plus');
  nope(by('collar-locks').times, 'the collared 9 refused its own operator');
});

test('the operator keys work on a picked pair', () => {
  eq(by('keyboard-merge').tiles.sort((a, b) => a - b), [4, 5, 6]);
  eq(by('keyboard-undo').tiles.sort((a, b) => a - b), [2, 3, 4, 5]);
});

test('the hint gives one move, not the answer', () => {
  const s = by('hint').status;
  ok(/try \d+ .{1,2} \d+/.test(s), 'hint did not name a move: ' + s);
  ok(s.split('…')[0].split(/\s+/).length <= 5, 'the hint is giving the game away: ' + s);
});

test('endless mode deals a board of the right size', () => {
  const r = by('endless');
  eq(r.tiles, 3);
  ok(r.mode, 'endless did not become the active mode');
  ok(/^\d+$/.test(r.target), 'no target: ' + r.target);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
