# smoosh

Fuse numbers together to make a target. Single static page — open
`index.html` in a browser, no build, no server.

See `concept.md` for why it is shaped this way. Short version: never ask a
kid an arithmetic question; ask a puzzle question they cannot answer without
doing arithmetic.

## How you play

Pick two tiles, pick an operator, they fuse into one tile holding the result.
Keep going until something on the bench equals the target.

- **Puzzles** — fourteen hand-made levels.
- **Endless** — generated puzzles at three difficulties, forever.

Three stars per level: **make the target**, **use every tile**, and **the
twist** (the level's extra rule, named on the chip from the first move so it
can be aimed at rather than discovered).

Keyboard: `+ - * /` fuse the picked pair, `Ctrl+Z` undoes, `Esc` clears.

## The rules, and why

- **Division must come out even.** No fractions at this age, and a greyed-out
  ÷ button teaches divisibility better than a sentence about it does.
- **Results may not go below zero** unless the level sets `neg: true`.
- **Collared tiles** (`{v: 9, collar: '×'}`) may only be fused using that one
  operator, from either side. Fusing burns the collar off.
- **Peek is off by default and that is the design, not an oversight.** With
  the answers showing on the ring the kid scans four results and picks; with
  them hidden they must compute four results to choose between them. All the
  practice is in that choice.
- **Nothing is ever lost.** No timer, no lives. Running out of legal moves
  says so and points at Undo.

## Architecture

```
  levels.js  ─┐
              ├── Engine (state + rules + solver) ── app.js ── DOM tiles
  gen.js     ─┘
```

- `js/engine.js` — every rule. DOM-free on purpose, so the tests load it
  straight into Node. States are **immutable**: a merge returns a fresh state,
  which is why undo is a stack pop rather than a replay.
- `js/levels.js` — the authored table. Data only; adding a level is one row.
- `js/gen.js` — endless mode.
- `js/saves.js` — best-ever stars per level in `localStorage`
  (`smoosh.progress.v1`). Endless results are deliberately not recorded.
- `js/app.js` — wiring only. No rules live here.

The board is DOM, not canvas: tiles are buttons, so hit-testing, focus and
text layout are the browser's problem, and an expression under a number stays
selectable text.

### Why the third star is a "twist" and not a move count

A move always eats exactly one tile, so move count is just
`tiles used - 1`. "Solve it in fewer moves" would literally mean "use fewer
tiles", which *fights* the second star instead of extending it. A twist —
ban an operator, cap how big you may go, land the last move on a divide — is
an extra rule that makes the kid walk the same numbers by a different road.

### Why targets are not chosen by hand

Every authored target sits in the intersection of two brute-forced sets:
values reachable by **some subset** of the tiles (so star 1 is an easy first
win — the low floor) and values reachable using **every** tile with the twist
held (so stars 2 and 3 are both live — the high ceiling). Change a tile and
the target probably has to change too. `tests/levels.test.js` enforces both
halves, so it will tell you.

### Why endless mode cannot deal an unsolvable board

It builds backwards. Start from the target and repeatedly *split* a value into
two values that rebuild it — each split is one operator run in reverse. Shuffle
the leftovers onto the bench. The solution existed before the puzzle did. The
twist is then read off that solution rather than invented, so all three stars
are reachable by construction.

## Running tests

```
node tests/engine.test.js         # rules, expressions, stars, solver
node tests/levels.test.js         # the authored table, brute-forced
node tests/gen.test.js            # the generator, over many seeds
node tests/ui.headless.test.js    # the real page in headless Chrome
```

The last one skips if no Chrome is installed (`CHROME_BIN` to point at one).

## Traps this game has already fallen into

- **`[hidden]` is the weakest rule in the cascade.** `.ring` and `.win` both
  set `display: flex`, which beats the UA stylesheet's
  `[hidden] { display: none }` — so both overlays sat permanently on top of
  the board while every DOM assertion cheerfully reported `el.hidden === true`.
  A screenshot found it; assertions never would. `style.css` now carries an
  explicit `[hidden] { display: none !important }`. Do not remove it.
- **The operator ring must not sit on top of the two tiles it is about.**
  Centring it on the midpoint of the pair covers the two numbers the kid is
  trying to do arithmetic with. It goes below the pair, flipping above when
  there is no room.
- **The solver's memo cannot key on tile values alone once a twist is in
  play.** A twist judges the move *log*, so two boards with identical numbers
  are not interchangeable — one may have already spent the banned operator.
  This bug made the solver swear a solvable level was impossible.
- **Don't re-trigger the pop animation on every render.** `render()` runs on
  every click; animating "the most recently fused tile" unconditionally makes
  the board twitch under the kid's hand.
- **A `1` on the bench is a wasted move** (`×1`, `÷1`), so the generator
  rejects boards containing one.

## Smoke checklist (things no test covers)

- Tiles are big enough to hit on a laptop trackpad.
- The ring never leaves the bench on a narrow window.
- Confetti does not lag the board on the slowest kid machine.
- The win overlay does not steal a click the kid meant for a tile.
