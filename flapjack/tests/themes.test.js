// Theme/difficulty table validation + emoji whitelist guard.
// Run from flapjack/: node tests/themes.test.js

const fs = require('fs');
const path = require('path');

const { THEMES, DIFFICULTIES } = require('../js/themes.js');

// Every emoji used anywhere in the game must appear here. Every entry must be
// Emoji 12.0 (2019) or older — the kids' machines render newer glyphs as tofu.
const EMOJI_ALLOWLIST = [
  '🦄', '🍄', '🚀', '🐉', '👻', '🐠', '🐝',
  '❤️', '🤍', '🌱', '⚡', '🔥', '⭐', '✨',
  '🔇', '🔊', '🥉', '🥈', '🥇', '👑', '🌙', '💧', '🍯',
];

// Emoji version each glyph landed (Unicode emoji chart). Guard against fleet tofu.
const EMOJI_VERSIONS = {
  '🦄': 1.0, '🍄': 0.6, '🚀': 0.6, '🐉': 0.6, '👻': 0.6, '🐠': 0.6, '🐝': 0.6,
  '❤': 0.6, '🤍': 12.0, '🌱': 0.6, '⚡': 0.6, '🔥': 0.6, '⭐': 0.6, '✨': 0.6,
  '🔇': 0.6, '🔊': 0.6, '🥉': 11.0, '🥈': 11.0, '🥇': 11.0, '👑': 0.6,
  '🌙': 0.6, '💧': 0.6, '🍯': 0.6,
};

const KNOWN_PARALLAX = ['rainbow', 'clouds', 'stars', 'bubbles', 'hills', 'waves', 'trees', 'planets', 'pollen', 'city'];
const KNOWN_OBSTACLE = ['pipe', 'candy', 'brick', 'rocket', 'tower', 'coral', 'flower'];
const KNOWN_AMBIENT = ['sparkle', 'ember', 'bubble', 'snow', 'pollen', 'star'];
const HEX6 = /^#[0-9a-fA-F]{6}$/;

function norm(s) { return s.replace(/[\uFE0F\u200D]/g, ''); }
const allowedSet = new Set(EMOJI_ALLOWLIST.map(norm));

// Extract every emoji code point from a source string (drops variation selectors).
function extractEmojis(src) {
  const found = new Set();
  const re = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;
  let m;
  let buf = '';
  while ((m = re.exec(src))) buf += m[0];
  for (const ch of norm(buf)) found.add(ch);
  return found;
}

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
function ok(v, msg) { if (!v) throw new Error(msg || `expected truthy, got ${v}`); }

console.log('theme schema');

const SCHEMA_KEYS = ['id', 'name', 'emoji', 'sky', 'ground', 'parallax', 'obstacle', 'ambient', 'flapPitch', 'squareWave'];

test('every theme carries every schema key', () => {
  ok(THEMES.length === 7, `expected 7 themes, got ${THEMES.length}`);
  for (const t of THEMES) {
    for (const k of SCHEMA_KEYS) {
      ok(k in t, `theme ${t.id} missing key ${k}`);
    }
  }
});

test('theme ids unique and kebab-case', () => {
  const ids = new Set();
  for (const t of THEMES) {
    ok(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(t.id), `id "${t.id}" not kebab-case`);
    ok(!ids.has(t.id), `duplicate id ${t.id}`);
    ids.add(t.id);
  }
});

test('name and emoji are strings; emoji whitelisted', () => {
  for (const t of THEMES) {
    ok(typeof t.name === 'string' && t.name.length > 0, `${t.id} name`);
    ok(typeof t.emoji === 'string', `${t.id} emoji`);
    ok(allowedSet.has(norm(t.emoji)), `${t.id} emoji not in allowlist`);
  }
});

test('sky is 2-3 valid hex stops', () => {
  for (const t of THEMES) {
    ok(Array.isArray(t.sky) && t.sky.length >= 2 && t.sky.length <= 3, `${t.id} sky length`);
    for (const c of t.sky) ok(HEX6.test(c), `${t.id} sky color ${c}`);
  }
});

test('ground has valid hex top + body', () => {
  for (const t of THEMES) {
    ok(HEX6.test(t.ground.top), `${t.id} ground.top`);
    ok(HEX6.test(t.ground.body), `${t.id} ground.body`);
  }
});

test('2-3 parallax layers, known kinds, sane numbers', () => {
  for (const t of THEMES) {
    ok(Array.isArray(t.parallax) && t.parallax.length >= 2 && t.parallax.length <= 3, `${t.id} parallax count`);
    for (const l of t.parallax) {
      ok(KNOWN_PARALLAX.includes(l.kind), `${t.id} parallax kind ${l.kind}`);
      ok(HEX6.test(l.color), `${t.id} parallax color`);
      ok(typeof l.count === 'number' && l.count > 0, `${t.id} parallax count`);
      ok(typeof l.speed === 'number' && l.speed > 0, `${t.id} parallax speed`);
    }
  }
});

test('obstacle kind known; deco null or whitelisted emoji', () => {
  for (const t of THEMES) {
    ok(KNOWN_OBSTACLE.includes(t.obstacle.kind), `${t.id} obstacle kind ${t.obstacle.kind}`);
    ok(HEX6.test(t.obstacle.color), `${t.id} obstacle color`);
    ok(HEX6.test(t.obstacle.accent), `${t.id} obstacle accent`);
    ok(t.obstacle.deco === null || allowedSet.has(norm(t.obstacle.deco)), `${t.id} deco ${t.obstacle.deco}`);
  }
});

test('ambient kind known; rate positive', () => {
  for (const t of THEMES) {
    ok(KNOWN_AMBIENT.includes(t.ambient.kind), `${t.id} ambient kind ${t.ambient.kind}`);
    ok(typeof t.ambient.rate === 'number' && t.ambient.rate > 0, `${t.id} ambient rate`);
  }
});

test('flapPitch number; squareWave boolean', () => {
  for (const t of THEMES) {
    ok(typeof t.flapPitch === 'number', `${t.id} flapPitch`);
    ok(typeof t.squareWave === 'boolean', `${t.id} squareWave`);
  }
});

console.log('\nemoji whitelist');

test('every emoji in the game source appears in EMOJI_ALLOWLIST', () => {
  const dirs = ['..'];
  const files = [];
  for (const f of fs.readdirSync(path.join(__dirname, '..'))) {
    if (/\.(html|css|js)$/.test(f)) files.push(f);
  }
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'js'))) {
    if (/\.js$/.test(f)) files.push(path.join('js', f));
  }
  const used = new Set();
  for (const f of files) {
    const src = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
    for (const ch of extractEmojis(src)) used.add(ch);
  }
  for (const ch of used) {
    ok(allowedSet.has(ch), `emoji ${ch} (U+${ch.codePointAt(0).toString(16).toUpperCase()}) used in game but missing from allowlist`);
  }
  for (const ch of allowedSet) {
    ok(used.has(ch), `allowlist entry ${ch} is never used in the game (stale)`);
  }
});

test('every listed emoji is Emoji 12.0 or older', () => {
  for (const e of EMOJI_ALLOWLIST) {
    const n = norm(e);
    ok(n in EMOJI_VERSIONS, `no version recorded for ${e}`);
    ok(EMOJI_VERSIONS[n] <= 12.0, `${e} is Emoji ${EMOJI_VERSIONS[n]} — too new for the kids' machines`);
  }
});

test('every allowlist emoji is a single base codepoint after normalization', () => {
  for (const e of EMOJI_ALLOWLIST) {
    eq([...norm(e)].length, 1);
  }
});

console.log('\ndifficulties');

test('difficulty ids are easy/medium/hard', () => {
  eq(DIFFICULTIES.map(d => d.id), ['easy', 'medium', 'hard']);
});

test('difficulty schema fields sane', () => {
  for (const d of DIFFICULTIES) {
    ok(typeof d.name === 'string', `${d.id} name`);
    ok(allowedSet.has(norm(d.emoji)), `${d.id} emoji in allowlist`);
    for (const k of ['gap', 'scroll', 'spacing', 'hitbox', 'lives']) {
      ok(typeof d[k] === 'number', `${d.id} ${k}`);
    }
    ok(typeof d.moving === 'boolean', `${d.id} moving`);
  }
});

test('monotonicity: gap decreases, scroll/spacing/hitbox scale as specified', () => {
  const [easy, med, hard] = DIFFICULTIES;
  ok(easy.gap > med.gap && med.gap > hard.gap, 'gap ordering');
  ok(easy.scroll < med.scroll && med.scroll < hard.scroll, 'scroll ordering');
  ok(easy.spacing > med.spacing && med.spacing > hard.spacing, 'spacing ordering');
  ok(easy.hitbox < med.hitbox && med.hitbox < hard.hitbox, 'hitbox ordering');
  eq([easy.lives, med.lives, hard.lives], [3, 1, 1]);
  eq([easy.moving, med.moving, hard.moving], [false, false, true]);
});

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);