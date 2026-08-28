// Cluck parser tests. Run from chicken/ dir: node tests/cluck.test.js
// No deps — plain Node, vm sandbox to load the browser source.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctx = { console };
vm.createContext(ctx);
for (const f of ['js/ops.js', 'js/cluck.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), ctx);
}
const { compileCluck, cluckStatementCount, resolveVerb, suggestVerb, formatCluck } = ctx;
// `const ANIMALS` / `const OPS` are lexical bindings, so they never appear as
// properties of `ctx` the way the function declarations do.
const ANIMALS = vm.runInContext('ANIMALS', ctx);

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); }
}
function eq(a, b) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
  }
}
function throws(fn, match) {
  let err = null;
  try { fn(); } catch (e) { err = e; }
  if (!err) throw new Error('expected throw, got nothing');
  if (match && !err.message.includes(match)) {
    throw new Error(`message "${err.message}" did not include "${match}"`);
  }
  return err;
}

console.log('cluck parser');

test('square compiles to 8 ops', () => {
  const q = compileCluck('repeat 4 [ fd 100 rt 90 ]');
  eq(q.length, 8);
  eq(q[0].op, 'forward'); eq(q[0].arg, 100);
  eq(q[1].op, 'right');   eq(q[1].arg, 90);
});

test('aliases case-insensitive', () => {
  const q = compileCluck('FD 50\nRt 90\nBK 10\nLT 30');
  eq(q.map(o => o.op), ['forward', 'right', 'back', 'left']);
});

test('comments stripped (full-line and inline)', () => {
  const q = compileCluck('# hello\nfd 50 # inline\nrt 90');
  eq(q.length, 2);
  eq(q[0].op, 'forward');
});

test('nested repeat flattens correctly', () => {
  // 6 outer × (4 inner × 2 ops + 1 outer rt) = 6 × 9 = 54
  const q = compileCluck('repeat 6 [ repeat 4 [ fd 50 rt 90 ] rt 60 ]');
  eq(q.length, 54);
});

test('default arg used when number missing', () => {
  const q = compileCluck('fd');
  eq(q[0].arg, 10);
});

test('negative numbers parsed', () => {
  const q = compileCluck('fd -50');
  eq(q[0].arg, -50);
});

test('no-arg verbs have null arg', () => {
  const q = compileCluck('pu pd home cs');
  eq(q.map(o => o.op), ['penup', 'pendown', 'home', 'clear']);
  for (const o of q) eq(o.arg, null);
});

test('empty / comment-only programs return empty queue', () => {
  eq(compileCluck(''), []);
  eq(compileCluck('# only a comment\n   '), []);
});

test('alias resolution', () => {
  eq(resolveVerb('fd'), 'forward');
  eq(resolveVerb('FD'), 'forward');
  eq(resolveVerb('cs'), 'clear');
  eq(resolveVerb('xyz'), null);
});

test('suggestVerb finds close match', () => {
  eq(suggestVerb('foward'), 'forward');
  eq(suggestVerb('clera'), 'clear');
  eq(suggestVerb('zzzzzzz'), null);
});

console.log('\ncluck errors');

test('typo throws with did-you-mean hint', () => {
  throws(() => compileCluck('foward 50'), `did you mean 'forward'`);
});

test('repeat missing bracket', () => {
  throws(() => compileCluck('repeat 4 fd 50'), `'['`);
});

test('repeat unclosed bracket', () => {
  throws(() => compileCluck('repeat 3 [ fd 50'), 'closing');
});

test('repeat without number', () => {
  throws(() => compileCluck('repeat [ fd 50 ]'), 'needs a number');
});

test('error reports the offending line number', () => {
  const err = throws(() => compileCluck('fd 100\nrt 90\nfowrd 50'));
  eq(err.line, 3);
});

test('stray bracket caught', () => {
  throws(() => compileCluck('fd 50 ]'), 'unexpected');
});

console.log('\ncluck phase 2 verbs');

test('color accepts named colors', () => {
  const q = compileCluck('color red\nfd 10');
  eq(q[0].op, 'color'); eq(q[0].arg, 'red');
});

test('color rainbow parses', () => {
  const q = compileCluck('color rainbow');
  eq(q[0].arg, 'rainbow');
});

test('color rejects unknown name with hint', () => {
  const err = throws(() => compileCluck('color rd'), `did you mean 'red'`);
  eq(err.line, 1);
});

test('color without arg throws helpfully', () => {
  throws(() => compileCluck('color'), 'needs a word');
});

test('speed slow/medium/fast parse', () => {
  const q = compileCluck('speed slow\nspeed medium\nspeed fast');
  eq(q.map(o => o.arg), ['slow', 'medium', 'fast']);
});

test('speed rejects unknown word', () => {
  throws(() => compileCluck('speed turbo'), `'speed' doesn't know 'turbo'`);
});

test('lay/peck/cluck are no-arg ops', () => {
  const q = compileCluck('lay\npeck\ncluck');
  eq(q.map(o => o.op), ['lay', 'peck', 'cluck']);
  for (const o of q) eq(o.arg, null);
});

test('color inside repeat works', () => {
  const q = compileCluck('repeat 3 [ color blue fd 10 ]');
  eq(q.length, 6);
  eq(q[0].op, 'color'); eq(q[0].arg, 'blue');
  eq(q[1].op, 'forward');
});

test('case-insensitive word args', () => {
  const q = compileCluck('COLOR Red\nSPEED FAST');
  eq(q[0].arg, 'red');
  eq(q[1].arg, 'fast');
});

console.log('\ncluck formatter');

test('one-line repeat expands to indented block', () => {
  const out = formatCluck('repeat 4 [ fd 100 rt 90 ]');
  eq(out, 'repeat 4 [\n  fd 100\n  rt 90\n]\n');
});

test('multiple statements on one line are split', () => {
  const out = formatCluck('pu fd 50 pd');
  eq(out, 'pu\nfd 50\npd\n');
});

test('nested repeats indent two levels', () => {
  const out = formatCluck('repeat 6 [ repeat 4 [ fd 50 rt 90 ] rt 60 ]');
  eq(out,
    'repeat 6 [\n' +
    '  repeat 4 [\n' +
    '    fd 50\n' +
    '    rt 90\n' +
    '  ]\n' +
    '  rt 60\n' +
    ']\n');
});

test('full-line comment preserved at current depth', () => {
  const out = formatCluck('# top comment\nrepeat 2 [\n# inside\nfd 10\n]');
  eq(out,
    '# top comment\n' +
    'repeat 2 [\n' +
    '  # inside\n' +
    '  fd 10\n' +
    ']\n');
});

test('inline comment stays attached to its statement', () => {
  const out = formatCluck('fd 50 # walk\nrt 90 # turn');
  eq(out, 'fd 50 # walk\nrt 90 # turn\n');
});

test('already-tidy code is idempotent', () => {
  const tidy = 'repeat 4 [\n  fd 100\n  rt 90\n]\n';
  eq(formatCluck(tidy), tidy);
});

test('color and speed format on their own lines', () => {
  const out = formatCluck('color rainbow speed fast repeat 6 [ fd 50 rt 60 ]');
  eq(out,
    'color rainbow\n' +
    'speed fast\n' +
    'repeat 6 [\n' +
    '  fd 50\n' +
    '  rt 60\n' +
    ']\n');
});

test('empty source formats to empty', () => {
  eq(formatCluck(''), '');
  eq(formatCluck('   \n   \n'), '');
});

console.log('\ncluck say verb');

test('say with quoted string parses', () => {
  const q = compileCluck('say "hello"');
  eq(q.length, 1);
  eq(q[0].op, 'say');
  eq(q[0].arg, 'hello');
});

test('say preserves spaces and punctuation in string', () => {
  const q = compileCluck('say "hello, world!"');
  eq(q[0].arg, 'hello, world!');
});

test('say does not consume brackets inside string', () => {
  const q = compileCluck('say "[brackets]"\nfd 10');
  eq(q.length, 2);
  eq(q[0].arg, '[brackets]');
  eq(q[1].op, 'forward');
});

test('say does not strip # inside string', () => {
  const q = compileCluck('say "no # comment here"');
  eq(q[0].arg, 'no # comment here');
});

test('say without arg throws helpfully', () => {
  throws(() => compileCluck('say'), 'needs some text in quotes');
});

test('say with bareword throws (not a string)', () => {
  throws(() => compileCluck('say hello'), 'needs some text in quotes');
});

test('unclosed quote throws on the right line', () => {
  const err = throws(() => compileCluck('fd 10\nsay "broken'), 'unclosed string');
  eq(err.line, 2);
});

test('say inside repeat works', () => {
  const q = compileCluck('repeat 2 [ say "hi" fd 20 ]');
  eq(q.length, 4);
  eq(q[0].op, 'say'); eq(q[0].arg, 'hi');
  eq(q[1].op, 'forward');
});

test('formatter preserves quoted string as one statement', () => {
  const out = formatCluck('repeat 2 [ say "hi there" fd 50 ]');
  eq(out,
    'repeat 2 [\n' +
    '  say "hi there"\n' +
    '  fd 50\n' +
    ']\n');
});

test('formatter preserves brackets inside string', () => {
  const out = formatCluck('say "[stay]"');
  eq(out, 'say "[stay]"\n');
});

test('new colors pink and teal are accepted', () => {
  const q = compileCluck('color pink\ncolor teal');
  eq(q.map(o => o.arg), ['pink', 'teal']);
});

test("'be' turns into a known animal", () => {
  const q = compileCluck('be unicorn\nbe raccoon');
  eq(q.map(o => o.op), ['be', 'be']);
  eq(q.map(o => o.arg), ['unicorn', 'raccoon']);
});

test("'be' is case-insensitive", () => {
  eq(compileCluck('BE Unicorn')[0].arg, 'unicorn');
});

test("'be' with an unknown animal suggests a near miss", () => {
  const e = throws(() => compileCluck('be unicron'), "did you mean 'unicorn'?");
  eq(e.line, 1);
});

test("'be' with no animal at all explains itself", () => {
  throws(() => compileCluck('be'), "needs a word after it");
});

test("'be' with a far-off word falls back to the short hint, not 20 names", () => {
  const e = throws(() => compileCluck('be xylophone'), 'try one of:');
  if (e.message.length > 120) {
    throw new Error(`hint too long for the status bar: ${e.message}`);
  }
});

test("'be unicorn' survives a tidy pass", () => {
  eq(formatCluck('repeat 2 [ be unicorn fd 10 ]'),
     'repeat 2 [\n  be unicorn\n  fd 10\n]\n');
});

test('every animal in the table is a usable verb argument', () => {
  for (const name of Object.keys(ANIMALS)) {
    const q = compileCluck(`be ${name}`);
    eq(q[0].arg, name);
  }
});

console.log('\nstatement counting (quest par)');

test('a flat program counts its lines', () => {
  eq(cluckStatementCount('fd 100\nrt 90\nfd 100\n'), 3);
});

test('a repeat counts as itself plus its body, not the unrolled queue', () => {
  // The same square: 8 ops when compiled, 3 statements as written.
  eq(compileCluck('repeat 4 [ fd 100 rt 90 ]').length, 8);
  eq(cluckStatementCount('repeat 4 [ fd 100 rt 90 ]'), 3);
});

test('the flat version of a square costs more than the loop', () => {
  const flat = 'fd 100\nrt 90\n'.repeat(4);
  eq(cluckStatementCount(flat), 8);
});

test('nested repeats count at every level', () => {
  eq(cluckStatementCount('repeat 2 [ repeat 3 [ fd 10 ] rt 90 ]'), 4);
});

test('comments and blank lines are free', () => {
  eq(cluckStatementCount('# hello\n\nfd 10 # go\n'), 1);
});

test('an empty program counts zero', () => {
  eq(cluckStatementCount(''), 0);
  eq(cluckStatementCount('# just a note\n'), 0);
});

console.log('\nexamples programs');

// Pulled straight out of js/app.js rather than copied, so a new Examples
// button is covered the moment it exists. app.js touches the DOM at load, so
// we lift just the object literal and evaluate that.
const appSrc = fs.readFileSync(path.join(__dirname, '..', 'js/app.js'), 'utf8');
const exStart = appSrc.indexOf('const EXAMPLES = {');
const exEnd = appSrc.indexOf('\n};\n', exStart);
if (exStart === -1 || exEnd === -1) {
  throw new Error('could not find the EXAMPLES literal in js/app.js');
}
const EXAMPLE_PROGRAMS = vm.runInNewContext(
  '(' + appSrc.slice(exStart + 'const EXAMPLES = '.length, exEnd + 2) + ')'
);

for (const [name, program] of Object.entries(EXAMPLE_PROGRAMS)) {
  test(`example "${name}" compiles cleanly`, () => {
    const q = compileCluck(program);
    if (q.length === 0) throw new Error('compiled to empty queue');
  });
  test(`example "${name}" is already tidy`, () => {
    eq(formatCluck(program), program);
  });
}

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
