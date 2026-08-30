// Endless mode: make a puzzle that is guaranteed solvable, by building it
// backwards. Forward generation ("here are five random numbers, hit 137") is
// how you hand a kid an impossible board and call it a challenge.
//
// So: start from the target and repeatedly SPLIT a value into two values that
// rebuild it. Every split is one of the four operators run in reverse, which
// means the shuffled leftovers always reassemble into the target using every
// tile. The solution exists before the puzzle does.
//
// The twist (third star) is likewise read off the solution we already have,
// never invented, so all three stars are reachable by construction.

var Gen = (function () {
  // Small seeded PRNG so tests are reproducible and a "puzzle of the day" is
  // one line away. Math.random is fine in the browser but useless in a test.
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5;  s >>>= 0;
      return s / 4294967296;
    };
  }

  const LEVELS = {
    // tiles: how many numbers on the bench. maxTile: the biggest a leaf may be.
    // maxTile bounds what a split may produce directly; maxLeaf is the hard
    // ceiling on any tile that ends up on the bench (a reverse-divide makes
    // v*b, which is legitimately bigger than maxTile -- 108 with a 9 on the
    // bench is a fine thing for a ten-year-old to see, 4212 is not).
    easy:   { tiles: 3, maxTile: 12, maxLeaf: 120, target: [10, 40] },
    medium: { tiles: 4, maxTile: 20, maxLeaf: 200, target: [20, 120] },
    hard:   { tiles: 5, maxTile: 25, maxLeaf: 400, target: [40, 300] },
  };

  function divisors(n, max) {
    const out = [];
    for (let d = 2; d * d <= n; d++) {
      if (n % d === 0) {
        if (d <= max) out.push(d);
        const e = n / d;
        if (e !== d && e <= max) out.push(e);
      }
    }
    return out;
  }

  // Split v into [a, b] such that a <op> b === v. Returns null when this
  // operator cannot split this value inside the size limits.
  function split(v, op, maxTile, rand) {
    switch (op) {
      case '+': {
        if (v < 2) return null;
        const lo = Math.max(1, v - maxTile);
        const hi = Math.min(maxTile, v - 1);
        if (hi < lo) return null;
        const a = lo + Math.floor(rand() * (hi - lo + 1));
        return [a, v - a];
      }
      case '-': {
        // a - b = v, so a = v + b. Keep b small or a runs away.
        const hi = Math.min(maxTile, maxTile - v);
        if (hi < 1) return null;
        const b = 1 + Math.floor(rand() * hi);
        return [v + b, b];
      }
      case '×': {
        const ds = divisors(v, maxTile).filter((d) => v / d <= maxTile * maxTile);
        if (!ds.length) return null;
        const d = ds[Math.floor(rand() * ds.length)];
        return [d, v / d];
      }
      case '÷': {
        // a / b = v, so a = v * b. Only worth it when b stays a leaf-sized
        // number, otherwise every hard puzzle turns into "divide by 2".
        const hi = Math.min(maxTile, 9);
        if (hi < 2 || v < 2) return null;
        const b = 2 + Math.floor(rand() * (hi - 1));
        return [v * b, b];
      }
      default: return null;
    }
  }

  // Read a twist off a solution we already have, cheapest-first, so the third
  // star is always attainable. Falls back to a cap, which any solution meets.
  function twistFrom(log, rand) {
    const used = new Set(log.map((m) => m.op));
    const peak = Math.max.apply(null, log.map((m) => m.v));
    const options = [];
    for (const op of ['÷', '×', '-']) if (used.has(op)) options.push({ kind: 'mustUse', op });
    for (const op of ['+', '-', '×']) if (!used.has(op)) options.push({ kind: 'banOp', op });
    if (log.every((m) => m.v > m.a && m.v > m.b)) options.push({ kind: 'grow' });
    // log is the SPLIT order (top-down); the forward solution replays it in
    // reverse, so the player's last move is the first split, log[0].
    options.push({ kind: 'endWith', op: log[0].op });
    options.push({ kind: 'cap', n: peak });
    // Always at least the cap, and always drawn -- picking the first match
    // every time made every generated puzzle say "use divide".
    return options[Math.floor((rand ? rand() : 0) * options.length)];
  }

  function make(difficulty, seed) {
    const cfg = LEVELS[difficulty] || LEVELS.medium;
    const rand = rng(seed);
    const [tlo, thi] = cfg.target;
    const target = tlo + Math.floor(rand() * (thi - tlo + 1));

    // Values still to be split. Split the largest each round: splitting the
    // small ones first leaves a giant number with nowhere to go.
    let parts = [target];
    const log = [];
    let guard = 0;
    while (parts.length < cfg.tiles && guard++ < 200) {
      parts.sort((a, b) => b - a);
      const i = Math.floor(rand() * Math.min(2, parts.length));  // biggest, or runner-up
      const v = parts[i];
      const ops = ['+', '-', '×', '÷'].sort(() => rand() - 0.5);
      let done = null;
      for (const op of ops) {
        const s = split(v, op, cfg.maxTile, rand);
        if (s && s.every((x) => x >= 1 && Number.isInteger(x))) { done = { op, s }; break; }
      }
      if (!done) continue;
      parts.splice(i, 1, done.s[0], done.s[1]);
      log.push({ a: done.s[0], b: done.s[1], op: done.op, v });
    }
    if (parts.length < cfg.tiles) return null;

    // A tile that already equals the target is a puzzle solved at zero moves.
    if (parts.some((p) => p === target)) return null;
    // A 1 on the bench invites x1 and /1 -- a free move that teaches nothing.
    if (parts.some((p) => p === 1)) return null;
    if (parts.some((p) => p > cfg.maxLeaf)) return null;

    for (let i = parts.length - 1; i > 0; i--) {   // shuffle the bench
      const j = Math.floor(rand() * (i + 1));
      const t = parts[i]; parts[i] = parts[j]; parts[j] = t;
    }

    return {
      id: 'endless-' + difficulty + '-' + seed,
      name: 'Endless (' + difficulty + ')',
      hint: 'A fresh one every time. Shuffle if you do not like the look of it.',
      tiles: parts,
      goal: { value: target },
      twist: twistFrom(log, rand),
      generated: true,
    };
  }

  // make() can bail (a split ran out of room, or a tile landed on the target);
  // retry with the next seed rather than making the caller loop.
  function puzzle(difficulty, seed) {
    for (let k = 0; k < 200; k++) {
      const p = make(difficulty, (seed + k * 7919) >>> 0);
      if (p) return p;
    }
    return null;
  }

  return { rng, split, twistFrom, make, puzzle, LEVELS };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Gen;
