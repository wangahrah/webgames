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
const { compileCluck, resolveVerb, suggestVerb } = ctx;

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

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);
