// Verb table — single source of truth for what the chicken can do.
// Adding a new verb: add it here, handle it in coop.js (the renderer),
// and (in phase 3) expose it in the Python module.

const OPS = {
  forward: { aliases: ['fd'], arg: 'number', defaultArg: 10, desc: 'walk forward N steps' },
  back:    { aliases: ['bk'], arg: 'number', defaultArg: 10, desc: 'walk back N steps' },
  right:   { aliases: ['rt'], arg: 'number', defaultArg: 90, desc: 'turn right N degrees' },
  left:    { aliases: ['lt'], arg: 'number', defaultArg: 90, desc: 'turn left N degrees' },
  penup:   { aliases: ['pu'], arg: 'none',                   desc: 'lift the pen (no trail)' },
  pendown: { aliases: ['pd'], arg: 'none',                   desc: 'drop the pen (draws a trail)' },
  home:    { aliases: [],     arg: 'none',                   desc: 'back to the center' },
  clear:   { aliases: ['cs'], arg: 'none',                   desc: 'wipe the canvas' },
  color:   { aliases: [],     arg: 'word',
             values: ['red','blue','green','yellow','orange','purple','black','white','rainbow'],
             desc:   'pen color (try rainbow!)' },
  speed:   { aliases: [],     arg: 'word',
             values: ['slow','medium','fast'],
             desc:   'walk speed' },
  lay:     { aliases: [],     arg: 'none',                   desc: 'lay an egg right here' },
  peck:    { aliases: [],     arg: 'none',                   desc: 'peck the ground' },
  cluck:   { aliases: [],     arg: 'none',                   desc: 'make a chicken noise' },
  say:     { aliases: [],     arg: 'text',                   desc: 'say something out loud' },
};

// Extra non-verb syntax shown on the cheat sheet
const SYNTAX_HELP = [
  { cmd: 'repeat N [ … ]', desc: 'do something N times' },
  { cmd: '# comment',      desc: 'lines starting with # are notes' },
];

const VERB_LOOKUP = {};
for (const [name, def] of Object.entries(OPS)) {
  VERB_LOOKUP[name] = name;
  for (const a of def.aliases) VERB_LOOKUP[a] = name;
}

function resolveVerb(word) {
  return VERB_LOOKUP[word.toLowerCase()] || null;
}

function allVerbWords() {
  return Object.keys(VERB_LOOKUP);
}

// Levenshtein for "did you mean…" hints
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function nearestFromList(word, list, maxDist = 3) {
  const lower = word.toLowerCase();
  let best = null, bestDist = maxDist;
  for (const w of list) {
    const d = levenshtein(lower, w);
    if (d < bestDist) { bestDist = d; best = w; }
  }
  return best;
}

function suggestVerb(word) {
  return nearestFromList(word, allVerbWords());
}
