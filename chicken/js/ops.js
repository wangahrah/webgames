// Verb table — single source of truth for what the chicken can do.
// Adding a new verb: add it here, handle it in coop.js (the renderer),
// and (in phase 3) expose it in the Python module.

const OPS = {
  forward: { aliases: ['fd'], arg: 'number', defaultArg: 10 },
  back:    { aliases: ['bk'], arg: 'number', defaultArg: 10 },
  right:   { aliases: ['rt'], arg: 'number', defaultArg: 90 },
  left:    { aliases: ['lt'], arg: 'number', defaultArg: 90 },
  penup:   { aliases: ['pu'], arg: 'none' },
  pendown: { aliases: ['pd'], arg: 'none' },
  home:    { aliases: [],     arg: 'none' },
  clear:   { aliases: ['cs'], arg: 'none' },
};

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

function suggestVerb(word) {
  const lower = word.toLowerCase();
  let best = null, bestDist = 3;
  for (const w of allVerbWords()) {
    const d = levenshtein(lower, w);
    if (d < bestDist) { bestDist = d; best = w; }
  }
  return best;
}
