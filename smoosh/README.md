# smoosh — Mossway Valley

Fuse numbers together to open a valley. Single static page — open `index.html`
in a browser, no build, no server.

See `concept.md` for why it is shaped this way. Short version: never ask a kid
an arithmetic question; ask a puzzle question they cannot answer without doing
arithmetic — then give them somewhere to spend the answer.

## How you play

You are a small sprite in Mossway Valley, which has gone quiet and overgrown.
Tap a place on the map. It wants a number. Pick two seeds, pick an operator,
they smoosh into one seed holding the result. Keep going until something on the
log equals what the place asked for, and the place opens.

- **Valley** — twenty places across four regions, unlocking as you go.
- **Endless** — generated puzzles at three difficulties, forever, outside the
  story.

Three stars per place: **make the target**, **use every seed**, and **the
twist** (the level's extra rule, named on the chip from the first move so it can
be aimed at rather than discovered).

Keyboard: `+ - * /` fuse the picked pair, `Ctrl+Z` undoes, `Esc` clears.

## The rules, and why

- **Division must come out even.** No fractions at this age, and a greyed-out
  ÷ button teaches divisibility better than a sentence about it does.
- **Results may not go below zero** unless the level sets `neg: true`.
- **Vine-bound seeds** (`{v: 9, collar: '×'}`) may only be fused using that one
  operator, from either side. Fusing burns the vine off.
- **Peek is off by default and that is the design, not an oversight.** With
  the answers showing on the ring the kid scans four results and picks; with
  them hidden they must compute four results to choose between them. All the
  practice is in that choice.
- **Nothing is ever lost.** No timer, no lives. Running out of legal moves says
  so and points at Undo.
- **Getting past a place costs one star, never three.** Stars 2 and 3 feed the
  region gates instead, so playing well opens the valley sooner without ever
  standing between a kid and the next thing to play.

## Architecture

```
  levels.js ─┐
  gen.js    ─┼── Engine  (rules, DOM-free, immutable)  ─┐
             │                                          ├── app.js ── screens
  world.js  ─┴── Quest   (progress, DOM-free)          ─┘             ├ map (map.js)
                                                                      ├ puzzle
                                                                      └ reward
```

- `js/engine.js` — every rule. DOM-free on purpose, so the tests load it
  straight into Node. States are **immutable**: a merge returns a fresh state,
  which is why undo is a stack pop rather than a replay.
- `js/levels.js` — the authored boards. Data only; adding a board is one row.
- `js/world.js` — the valley: regions, twenty places, where they sit, what
  opens what, who gives you what. Data only.
- `js/quest.js` — stars per place, which places are open, what you are
  carrying. `smoosh.quest.v1`, migrated once from the old `smoosh.progress.v1`.
- `js/map.js` — draws the valley. Exported as **`Valley`**, because `Map` is a
  JavaScript built-in and shadowing it globally is a joke that takes an
  afternoon to find.
- `js/gen.js` — endless mode. Untouched by the valley.
- `js/app.js` — wiring only. No rules live here.

The board is DOM, not canvas: tiles are buttons, so hit-testing, focus and text
layout are the browser's problem, and an expression under a number stays
selectable text. **The map is the same call twice over** — the places on it are
HTML buttons layered over an SVG that draws only the ground.

### The three files, and why they are three

| file | owns |
|---|---|
| `levels.js` | what the **board** is — tiles, target, twist |
| `world.js` | what the **place** is — name, position, what it opens, what it gives |
| `quest.js` | what **you** have done — stars, unlocks, items |

A board can therefore be re-dressed as a gate, a bird or a shrine without
`levels.js` changing a character, and the valley can be re-drawn without any
board being re-checked. That separation is the thing that makes level 21 cheap.

### Growing the game

The ramp is one new mechanic per region, introduced by an item, then compounded:

| region | places | mechanic | item |
|---|---|---|---|
| Home Clearing | 1–3 | the fuse, and nothing else | Mossknife |
| Bramble Hollow | 4–8 | vine-bound seeds (`collar`) | — |
| Lantern Bog | 9–14 | two-lock gates (`goals: []`), halving | **Sap Shears** |
| Old Stone Grove | 15–20 | the Deepdark (`neg`), everything at once | Grovestone |

A new mechanic arrives as an **optional field on the level row**, absent by
default, so every existing board keeps working untouched. `goals`, `shears` and
`neg` are all in the engine and tested. **An item is a new verb**, which means a
rule never arrives as a paragraph of instructions — it arrives as a present from
somebody in a bog.

**Still to wire:** places 9–20 have no boards yet (`level: null`, drawn on the
map as not-yet-grown), and the shears have no button on the bench. The engine,
solver and tests already know about both.

### Why the third star is a "twist" and not a move count

A move always eats exactly one tile, so move count is just `tiles used - 1`.
"Solve it in fewer moves" would literally mean "use fewer tiles", which *fights*
the second star instead of extending it. A twist — ban an operator, cap how big
you may go, land the last move on a divide — is an extra rule that makes the kid
walk the same numbers by a different road.

### Why targets are not chosen by hand

Every authored target sits in the intersection of two brute-forced sets: values
reachable by **some subset** of the tiles (so star 1 is an easy first win — the
low floor) and values reachable using **every** tile with the twist held (so
stars 2 and 3 are both live — the high ceiling). Change a tile and the target
probably has to change too. `tests/levels.test.js` enforces both halves, so it
will tell you.

### Why endless mode cannot deal an unsolvable board

It builds backwards. Start from the target and repeatedly *split* a value into
two values that rebuild it — each split is one operator run in reverse. Shuffle
the leftovers onto the bench. The solution existed before the puzzle did.

## Running tests

```
node tests/engine.test.js         # rules, expressions, stars, two locks, shears, solver
node tests/levels.test.js         # the authored boards, brute-forced
node tests/world.test.js          # the valley: paths, geometry, region gates
node tests/quest.test.js          # unlocks, items, migration, and no soft-locks
node tests/gen.test.js            # the generator, over many seeds
node tests/ui.headless.test.js    # the real page in headless Chrome, twice
```

The last one skips if no Chrome is installed (`CHROME_BIN` to point at one). It
loads the page twice — once as a valley nobody has walked, once with progress
seeded into `localStorage` — because half the behaviour worth testing only
exists after somebody has already played.

## Traps this game has already fallen into

- **`[hidden]` is the weakest rule in the cascade.** `.ring`, `.win` and
  `.screen` all set `display: flex`, which beats the UA stylesheet's
  `[hidden] { display: none }` — so overlays sat permanently on top of the board
  while every DOM assertion cheerfully reported `el.hidden === true`. A
  screenshot found it; assertions never would. `style.css` carries an explicit
  `[hidden] { display: none !important }`. Do not remove it.
- **The map's two coordinate systems only agree if you make them.** The ground
  is an SVG `viewBox`; the places on it are HTML positioned by *percentage* of
  the element. `preserveAspectRatio="xMidYMid meet"` letterboxes the viewBox the
  moment the element is not exactly 1000×700 — so the paths drifted off the
  places they connect, and every place in the first region sat outside its own
  region. Fixed by `preserveAspectRatio="none"` plus an `aspect-ratio` on
  `.map-canvas` that pins the element to the same shape. Change one, change both.
- **Region labels and node positions are hand-placed, and must stay that way.**
  A label auto-parked in the corner of its own patch lands on whichever place
  happens to live there. `world.js` carries `labelAt` per region and
  `tests/world.test.js` checks nothing sits under it.
- **The solver's memo cannot key on tile values alone.** A twist judges the move
  *log*, so two boards with identical numbers are not interchangeable — one may
  have already spent the banned operator. The same trap one field along: two
  boards with identical numbers are not interchangeable if one has spent its
  shears. The key carries them; the twist case skips the memo entirely.
- **Two locks need real matching, not greed.** With `goals: [a, b]`, a tile that
  satisfies both can be claimed by the lock that had another option, and a
  solved board reads as unsolved. `matchGoals` backtracks.
- **Cuts stay out of the move log.** A twist is a vocabulary about *operators*.
  Quietly feeding it a move with no operator is how you get a `grow` twist that
  can never be met for reasons nobody can see on screen. Halvings live in
  `state.cuts`.
- **Don't re-trigger the pop animation on every render.** `render()` runs on
  every click; animating "the most recently fused tile" unconditionally makes
  the board twitch under the kid's hand.
- **A `1` on the bench is a wasted move** (`×1`, `÷1`), so the generator rejects
  boards containing one.
- **In the headless probe, never put a `name` key in a payload.** Records are
  found by `results.find(r => r.name === ...)`; a payload field called `name`
  silently wins and three tests fail with "cannot read properties of undefined".

## Smoke checklist (things no test covers)

- Tiles are big enough to hit on a laptop trackpad.
- The ring never leaves the bench on a narrow window.
- The whole map fits at 900×650 without scrolling, and its labels stay legible.
- Confetti does not lag the board on the slowest kid machine.
- The win overlay does not steal a click the kid meant for a tile — note it does
  currently sit over the winning tile, which is where the eye already is.
- Take a screenshot of **all three screens** before believing any of it.
