// Renderer tests, in a real browser. Run from chicken/ dir:
//   node tests/coop.headless.test.js
//
// The other three suites are pure logic. This one drives the ACTUAL coop.js
// playback loop — canvas, command queue, collision, outcome reporting — by
// loading index.html in headless Chrome with requestAnimationFrame and
// performance.now replaced by a hand-cranked clock, so a whole level plays out
// synchronously and deterministically.
//
// Chrome is optional: with no browser installed this suite skips rather than
// fails, and the level geometry is still covered headlessly by levels.test.js.

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
    try {
      execFileSync('which', [bin], { stdio: 'pipe' });
      return bin;
    } catch (e) { /* keep looking */ }
  }
  return null;
}

const chrome = findChrome();
if (!chrome) {
  console.log('renderer (headless)');
  console.log('  — skipped: no Chrome found (set CHROME_BIN to run these)');
  process.exit(0);
}

// The clock stub has to be in place before coop.js's IIFE runs, and the driver
// after every script has loaded — so the probe is index.html with two inserts.
const CLOCK = `  <script>
  var __now = 0, __cbs = [];
  window.requestAnimationFrame = function (cb) { __cbs.push(cb); return __cbs.length; };
  performance.now = function () { return __now; };
  window.__pump = function (frames) {
    for (var i = 0; i < frames && __cbs.length; i++) {
      __now += 16;
      var batch = __cbs.splice(0, __cbs.length);
      for (var j = 0; j < batch.length; j++) batch[j](__now);
    }
  };
  </script>
  <script src="js/ops.js"></script>`;

const DRIVER = `
  <script>
  function playHere(program, frames) {
    var got = { called: false };
    Coop.play(compileCluck(program), function (interrupted, result) {
      got = { called: true, interrupted: interrupted, result: result };
    });
    window.__pump(frames || 20000);
    return got;
  }
  (function () {
    var out = [];
    try {
      Levels.LEVELS.forEach(function (lv) {
        enterLevel(lv.id);
        var got = playHere(lv.solution);
        out.push({
          name: lv.id, kind: 'solution', got: got,
          stars: got.result ? Levels.starsFor({
            outcome: got.result.outcome,
            eggsGot: got.result.eggsGot,
            eggsTotal: got.result.eggsTotal,
            commands: cluckStatementCount(lv.solution),
            par: lv.par,
          }) : -1,
          editor: codeEl.value,
        });
      });

      enterLevel('fence');
      out.push({ name: 'fence-straight', got: playHere('fd 700\\n') });

      enterLevel('fox');
      out.push({ name: 'fox-direct',
                 got: playHere('fd 375\\nlt 90\\nfd 250\\nrt 90\\nfd 375\\n') });

      enterLevel('firststeps');
      out.push({ name: 'off-the-edge', got: playHere('lt 90\\nfd 5000\\n', 40000) });

      enterLevel('firststeps');
      out.push({ name: 'too-short', got: playHere('fd 10\\n') });

      // home must not count as arriving at a basket sitting on the start square
      enterLevel('roundabout');
      out.push({ name: 'home-is-not-a-win', got: playHere('fd 450\\nhome\\n') });

      // clear wipes the pen trail, never the level
      enterLevel('fence');
      out.push({ name: 'clear-keeps-the-fence', got: playHere('clear\\nfd 700\\n') });

      // per-level drafts must not leak into each other or into free draw
      localStorage.setItem('chicken.cluck', 'MY DRAWING\\n');
      enterLevel('fence');
      codeEl.value = 'MY FENCE ATTEMPT\\n';
      persistDraft(codeEl.value);
      enterLevel('maze');
      var mazeEditor = codeEl.value;
      enterLevel('fence');
      var backToFence = codeEl.value;
      exitQuest();
      out.push({ name: 'drafts', got: { called: true, result: null },
                 mazeEditor: mazeEditor, backToFence: backToFence,
                 freeDraw: codeEl.value, quest: Coop.getQuest() });

      // free draw still reports the old one-argument way
      out.push({ name: 'free-draw', got: playHere('repeat 4 [ fd 100 rt 90 ]'),
                 quest: Coop.getQuest() });

      // ---- feedback the kid can actually see ----------------------------
      var banner = document.getElementById('code-banner');
      var marks = document.getElementById('code-marks');
      var readMark = function () {
        var m = marks.querySelector('.mark');
        return m ? { cls: m.className, top: m.style.top } : null;
      };

      codeEl.value = 'fd 100\\nrt 90\\nfoward 50\\n';
      run();
      out.push({ name: 'typo-feedback',
                 bannerHidden: banner.hidden, bannerText: banner.textContent,
                 bannerCls: banner.className, mark: readMark(),
                 moved: Coop.isRunning() });

      // typing must clear feedback about code you have since changed
      codeEl.value = 'fd 100\\n';
      codeEl.dispatchEvent(new Event('input'));
      out.push({ name: 'typing-clears',
                 bannerHidden: banner.hidden, mark: readMark() });

      // the running line is reported as it plays
      var seen = [];
      exitQuest();
      codeEl.value = 'fd 50\\nrt 90\\nfd 50\\n';
      Coop.play(compileCluck(codeEl.value), function () {}, function (l) { seen.push(l); });
      window.__pump(20000);

      // and again through the real Run path, watching the button and the band
      var stopIdle = stopBtn.disabled;
      run();
      var stopLive = stopBtn.disabled;
      var markDuring = readMark();
      window.__pump(20000);
      out.push({ name: 'running-line', seen: seen,
                 stopIdle: stopIdle, stopLive: stopLive, markDuring: markDuring,
                 stopAfter: stopBtn.disabled, markAfter: readMark() });

      // every popover opens under the button that opened it
      var pairs = [
        ['animal-btn', 'animal-panel'],
        ['my-scripts', 'scripts-panel'],
        ['save-script', 'save-popover'],
      ];
      var span = function (n, b, p) {
        return { name: n, bl: Math.round(b.left), br: Math.round(b.right),
                 pl: Math.round(p.left), pr: Math.round(p.right) };
      };
      var anchors = pairs.map(function (pr) {
        document.getElementById(pr[0]).click();
        var a = span(pr[0], document.getElementById(pr[0]).getBoundingClientRect(),
                            document.getElementById(pr[1]).getBoundingClientRect());
        closeAllPopovers();
        return a;
      });
      var qb = document.querySelector('.mode[data-mode=\"quest\"]');
      qb.click();
      anchors.push(span('quest', qb.getBoundingClientRect(),
                        document.getElementById('quest-panel').getBoundingClientRect()));
      closeAllPopovers();
      out.push({ name: 'anchors', anchors: anchors });

      // the header switch is the mode
      enterLevel('fence');
      var inQuest = { quest: qb.classList.contains('active'),
                      draw: document.querySelector('.mode[data-mode=\"draw\"]').classList.contains('active') };
      document.querySelector('.mode[data-mode=\"draw\"]').click();
      var inDraw = { quest: qb.classList.contains('active'),
                     draw: document.querySelector('.mode[data-mode=\"draw\"]').classList.contains('active'),
                     level: Coop.getQuest() };
      out.push({ name: 'mode-switch', inQuest: inQuest, inDraw: inDraw });

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
    .replace('  <script src="js/ops.js"></script>', CLOCK)
    .replace('</body>', DRIVER);
  fs.writeFileSync(probePath, page);

  raw = execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox',
    '--user-data-dir=' + fs.mkdtempSync(path.join(os.tmpdir(), 'chicken-')),
    '--dump-dom', 'file://' + probePath,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 32 * 1024 * 1024 });
} finally {
  try { fs.unlinkSync(probePath); } catch (e) { /* already gone */ }
}

const m = raw.match(/<title>([\s\S]*?)<\/title>/);
if (!m) { console.error('no <title> in the dumped DOM — the page did not load'); process.exit(1); }
const title = m[1];
if (title.startsWith('JSERROR')) { console.error(title); process.exit(1); }
if (!title.startsWith('RESULT ')) {
  console.error('probe never finished (title is still "' + title + '")');
  process.exit(1);
}
const results = JSON.parse(title.slice('RESULT '.length));
const by = name => results.find(r => r.name === name);

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); }
}
function eq(a, b, msg) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`${msg || ''} got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
  }
}
function ok(v, msg) { if (!v) throw new Error(msg || `expected truthy, got ${v}`); }

console.log('renderer (headless Chrome: ' + chrome + ')');

for (const r of results.filter(r => r.kind === 'solution')) {
  test(`"${r.name}" plays through to a win in the real renderer`, () => {
    ok(r.got.called, 'playback never called back');
    eq(r.got.interrupted, false);
    eq(r.got.result.outcome, 'win');
    eq(r.got.result.eggsGot, r.got.result.eggsTotal, 'eggs:');
    eq(r.stars, 3, 'stars:');
  });
}

test('the whole level table was played', () => {
  const played = results.filter(r => r.kind === 'solution').length;
  const table = fs.readFileSync(path.join(ROOT, 'js/levels.js'), 'utf8')
    .match(/^      id: '/gm).length;
  eq(played, table, 'levels played vs levels in the table:');
});

test('entering a level seeds the editor with its starter', () => {
  const first = results.find(r => r.kind === 'solution');
  ok(first.editor.length > 0, 'editor was left empty');
});

console.log('\nthings that should go wrong');

test('walking straight at a fence bumps it', () =>
  eq(by('fence-straight').got.result.outcome, 'bump'));
test('walking through a fox is caught', () =>
  eq(by('fox-direct').got.result.outcome, 'caught'));
test('walking off the world bumps the border instead of vanishing', () =>
  eq(by('off-the-edge').got.result.outcome, 'bump'));
test('a program that stops short reports unfinished', () =>
  eq(by('too-short').got.result.outcome, 'unfinished'));
test('home does not count as arriving at a basket on the start square', () =>
  eq(by('home-is-not-a-win').got.result.outcome, 'unfinished'));
test('clear wipes the trail, not the fence', () =>
  eq(by('clear-keeps-the-fence').got.result.outcome, 'bump'));

console.log('\nmodes and drafts');

test('each level keeps its own draft', () => {
  const d = by('drafts');
  ok(d.mazeEditor.indexOf('MY FENCE ATTEMPT') === -1, 'fence draft leaked into maze');
  eq(d.backToFence, 'MY FENCE ATTEMPT\n');
});
test('quest drafts never touch the free-draw draft', () =>
  eq(by('drafts').freeDraw, 'MY DRAWING\n'));
test('leaving quest mode clears the level', () =>
  eq(by('drafts').quest, null));
test('free draw still reports the old way — no result object', () => {
  const f = by('free-draw');
  ok(f.got.called, 'playback never called back');
  eq(f.got.interrupted, false);
  eq(f.got.result, null);
  eq(f.quest, null);
});

console.log('\nfeedback the kid can see');

test('a typo shows a banner naming the line, and does not run', () => {
  const r = by('typo-feedback');
  eq(r.bannerHidden, false, 'banner hidden:');
  ok(/line 3/.test(r.bannerText), `banner said "${r.bannerText}"`);
  ok(/forward/.test(r.bannerText), 'no did-you-mean in the banner');
  ok(/error/.test(r.bannerCls), `banner class was "${r.bannerCls}"`);
  eq(r.moved, false, 'the animal ran anyway:');
});

test('the offending line is highlighted, not just described', () => {
  const m = by('typo-feedback').mark;
  ok(m, 'no highlight band at all');
  ok(/error/.test(m.cls), `band class was "${m.cls}"`);
  // line 3 of a 1rem/1.7rem editor sits well below the first row
  ok(parseFloat(m.top) > 0, `band top was ${m.top}`);
});

test('typing clears feedback about code you have since changed', () => {
  const r = by('typing-clears');
  eq(r.bannerHidden, true);
  eq(r.mark, null);
});

test('the running line is reported as the animal walks', () => {
  const r = by('running-line');
  // …then null, which is how the editor knows to drop the highlight.
  eq(r.seen, [1, 2, 3, null]);
});

test('the line being run is highlighted, and cleared when it ends', () => {
  const r = by('running-line');
  ok(r.markDuring, 'nothing was highlighted mid-run');
  ok(/running/.test(r.markDuring.cls), `band class was "${r.markDuring.cls}"`);
  eq(r.markAfter, null, 'highlight left behind after the run:');
});

test('Stop is dead until something is running', () => {
  const r = by('running-line');
  eq(r.stopIdle, true, 'stop enabled while idle:');
  eq(r.stopLive, false, 'stop disabled while running:');
  eq(r.stopAfter, true, 'stop still live after the run:');
});

test('every popover overlaps the button that opened it', () => {
  for (const a of by('anchors').anchors) {
    ok(a.pl <= a.br && a.pr >= a.bl,
       `${a.name}: button spans ${a.bl}-${a.br}, its panel spans ${a.pl}-${a.pr}`);
  }
});

test('the header switch is the mode', () => {
  const r = by('mode-switch');
  eq(r.inQuest, { quest: true, draw: false });
  eq(r.inDraw.quest, false);
  eq(r.inDraw.draw, true);
  eq(r.inDraw.level, null, 'Draw did not leave the level:');
});

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
