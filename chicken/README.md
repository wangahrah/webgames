# chicken

Logo for kids, with a chicken instead of a turtle. Single static page —
open `index.html` in a browser, no build, no server.

## Modes

The header switch picks the mode: **🎨 Draw** or **🥚 Puzzles**.

- **Cluck** (live): Logo-flavored commands, one per line. Verbs come from
  `js/ops.js`; the cheat sheet in the editor pane is generated from that
  table so adding a verb auto-documents itself.

You are not stuck being a chicken. `js/ops.js` also holds `ANIMALS`, the
name→emoji cast list, which drives three things at once: the `be <animal>`
verb, the 🐾 Animal picker, and the sprite the Coop draws. Add a row there and
all three pick it up. Only use glyphs at Emoji 12 or older — the kids' machines
render anything newer as a tofu box.

The picker is a *setting* (stored under `chicken.animal`), not part of your
script, so loading someone else's program does not change who you are. `be`
inside a program overrides it until the next Reset.
- **Quest** (live): puzzles. The canvas becomes a yard with fences to route
  around, eggs to collect, the odd fox, and a basket to reach. You still write
  a program — that is the whole point — but now it either solves the level or
  it doesn't. Levels come from `js/levels.js`; adding one is a table row, the
  same as adding a verb. Three stars per level: reach the basket, collect every
  egg, and do it inside `par` **source statements** — so `repeat 4 [ fd 100 rt
  90 ]` (3) beats eight flat lines (8). That is the nudge toward loops.

  Bumping a fence stops the run gently and you press Run again. A fox ends it.
  A locked gate reports its own outcome ("find the key!") — gates are solid
  until every 🔑 on the level has been grabbed, at which point the renderer
  rebuilds its wall list and the gate fades to a dashed outline. Ice ponds
  take away your stop: a move that would end on the ice glides on to the far
  edge instead (see `slideDestination()`), which makes picking your approach
  row a lesson in dead reckoning. Wormhole pads teleport you to their twin
  mid-stride — you come out the far side still walking the rest of your `fd`
  — and the pair you just used stays quiet until you step off it. Progress
  lives under `chicken.quest.v1`, and every level keeps its own draft, so
  wandering into a puzzle never eats your free-draw code.

- **Python** (planned, phase 3): Skulpt-powered real Python with a `chicken`
  module exposing the same verbs. There is deliberately no disabled "Python"
  button in the meantime — a control that never works is worse than no control.

## Feedback, and where it goes

The audience is six to nine years old, which sets one hard rule: **anything the
kid has to act on appears next to the code, not in the footer.**

- `#code-banner` sits directly above the editor and carries parse errors,
  quest hints, and quest outcomes. The footer keeps the low-stakes chatter
  (saved / loaded / tidied).
- A highlight band behind the textarea marks the line: red for the line that
  failed to parse, amber for the line currently being walked. `coop.js` reports
  it through the third argument to `Coop.play(queue, onDone, onLine)`; the band
  is positioned arithmetically, which is why `#code` sets an explicit
  `line-height` and `white-space: pre` (a wrapped line would break the mapping).
- Both clear the moment the kid edits the code — stale feedback about code that
  has since changed is worse than none.
- `Run` and `Stop` swap disabled states, so neither ever invites a press that
  does nothing.

Popovers are positioned by `anchorPopover()` under the button that opened them.
They used to be pinned to `left: 1rem` regardless, so Quest opened on the far
left while its button sat on the far right.

## Architecture

Both modes compile to the same intermediate **command queue**. The Coop
(`js/coop.js`) plays it back animated, so the same renderer drives any
front-end.

The canvas has no fixed shape. `coop.js` keeps the backing store matched to
whatever size the layout gives the element (times the device pixel ratio, with
a base transform so all the drawing code still thinks in CSS pixels). Never
give `#canvas` an intrinsic size in CSS — that is what makes the browser
stretch one rectangle into another and turn the compass into an oval.

```
  Cluck text  ──┐
                ├── [ {op, arg}, ... ] ── Coop renderer ── canvas
  Python text ──┘
```

### World coordinates (quest mode)

Free draw works in CSS pixels: the world *is* the canvas. Quest levels can't,
because the canvas has no fixed size — a level authored in screen pixels would
be unsolvable at one window shape and trivial at another. So a level lives in a
fixed **1000 × 750 world** (`Levels.WORLD`) that `coop.js` letterboxes into
whatever the canvas currently is. `fd 100` therefore means the same distance on
every machine, and the quest trail is a fixed world-sized surface, which makes
resizing a level free: nothing to shift, nothing to drift.

`layoutWorld()` sets `scale` to 1 and the offsets to 0 in free draw, so the
original code path is untouched by any of this.

### Collision

Cluck has no runtime control flow — `repeat` is unrolled at compile time — so a
program cannot react to hitting something. All of it lives in the renderer:
`resolveMove()` swept-tests each frame's sub-segment against the fences (the
world border included), the foxes and the basket, collects any egg brushed on
the way, and stops playback with an outcome. The geometry itself is pure
functions in `js/levels.js`, which is why it can be tested headlessly.

Level furniture is drawn every frame in `render()`, never stamped into the
trail — otherwise `clear` / `cs` would wipe the fences out from under the
puzzle.

## Running tests

```
node tests/cluck.test.js          # parser, formatter, statement counting
node tests/saves.test.js          # named-script storage
node tests/levels.test.js         # level table, collision geometry, stars
node tests/quest.test.js          # quest progress + per-level drafts
node tests/coop.headless.test.js  # the real renderer, in headless Chrome
```

The first four are plain Node over a `vm` sandbox, no deps. The fifth loads
`index.html` in headless Chrome with `requestAnimationFrame` and
`performance.now` replaced by a hand-cranked clock, so it plays every level's
answer key through the actual playback loop and asserts the outcome. It
**skips** if no Chrome is installed (set `CHROME_BIN` to point at one).

Each level in `js/levels.js` carries a `solution` — a program that solves it.
It is never shown in the UI; it exists so the tests can prove every level is
still winnable, still collects every egg, and is still inside par. Move a
fence, break the test.

## Smoke checklist (visual things tests don't catch)

After UI changes, open `index.html` and confirm:

- [ ] Default starter (a square) runs to completion
- [ ] Chicken emoji renders and rotates with `rt` / `lt`
- [ ] Trail draws as the chicken walks (and stops with `pu`)
- [ ] `clear` wipes the trail; chicken stays put (per design)
- [ ] `home` returns chicken to center facing east
- [ ] Compass needle tracks heading in real time
- [ ] Compass is a *circle*, not an oval, at any window shape — drag the
      window wide, then tall, and check it again
- [ ] Resizing mid-drawing keeps the artwork centred under the animal
- [ ] `home` returns to the centre of the *current* canvas after a resize
- [ ] Cheat sheet shows all verbs from `OPS`
- [ ] Stop button interrupts mid-run cleanly
- [ ] Ctrl+Enter runs from the editor
- [ ] Reload preserves edited code (localStorage)
- [ ] Typo error shows a red banner above the editor, the bad line highlighted
- [ ] Editing the code clears the banner and the highlight
- [ ] The line being walked glows amber, and stops glowing at the end
- [ ] Stop is greyed until you press Run; Run is greyed while running
- [ ] Every popover opens under its own button, at any window width
- [ ] Compass reads N / E / S / W; free draw shows a faint grid and a home cross
- [ ] `color red` / `color blue` / `color pink` / `color teal` tints
      subsequent trail
- [ ] `color rainbow` cycles hue per segment
- [ ] `speed slow` / `speed fast` visibly changes pace
- [ ] `lay` drops a 🥚 at the chicken's current spot
- [ ] `peck` bobs the chicken and leaves a small mark
- [ ] `cluck` plays a short sound (volume audible, not jarring)
- [ ] `color rd` shows "did you mean 'red'?" hint
- [ ] `say "hello"` shows a speech bubble above the chicken
- [ ] `say "broken` (unclosed) errors with line number
- [ ] Each Examples button (Square / Star / Flower / Rainbow / Zoo) loads
      a program that runs cleanly

### Animals

- [ ] 🐾 Animal opens a 5-wide grid; the current animal is highlighted
- [ ] Clicking one changes the sprite immediately (no Run needed) and
      relabels the button with that emoji
- [ ] Choice survives a reload
- [ ] `be unicorn` mid-program switches the sprite; Reset restores the
      animal chosen in the picker
- [ ] `be unicron` shows "did you mean 'unicorn'?"
- [ ] Every animal renders as a real glyph, not a tofu box (check on the
      kids' machines, not just here)
- [ ] The animal faces the direction it walks and is never upside down —
      east, south, west, and north all look right

### Saving scripts

- [ ] 💾 Save opens popover; name input is focused and selected
- [ ] Ctrl+S opens the same popover from any focus
- [ ] Save with empty/whitespace name → button disabled, hint shown
- [ ] Save with a new name → status reads "saved: <name>"; reload
      preserves it
- [ ] 📂 My Scripts panel lists saves, newest first; 🐔 marks the
      currently loaded one
- [ ] Clicking a saved name with edits triggers "Save your work first?"
      with Save / Throw away / Cancel
- [ ] Same prompt fires when clicking an Examples button mid-edit
- [ ] Save → succeeds → the pending load proceeds
- [ ] Throw away → loads anyway
- [ ] Saving an existing name → "Replace" button (yellow); typing
      anything resets to plain Save
- [ ] ✕ on a row → inline "Delete <name>? Yes/No"; No restores; Yes
      removes
- [ ] Empty state: panel says "No saved scripts yet…"
- [ ] Escape and click-outside close any open popover
- [ ] Corrupting `chicken.saves.v1` in DevTools → editor still works,
      panel shows empty state, next save heals storage

## File layout

```
chicken/
├── index.html         page shell
├── style.css          two-pane layout, sticky-note cheat sheet
├── js/
│   ├── ops.js         verb + animal tables (single source of truth)
│   ├── cluck.js       Cluck-speak parser → command queue
│   ├── levels.js      quest level table + collision geometry (no DOM)
│   ├── quest.js       quest session, stars, per-level drafts (no DOM)
│   ├── coop.js        canvas renderer, chicken sprite, compass, playback
│   ├── saves.js       named-script storage (localStorage)
│   └── app.js         wiring (buttons, localStorage, cheat sheet build)
└── tests/
    ├── cluck.test.js         parser sanity checks
    ├── saves.test.js         storage roundtrips, validation, resilience
    ├── levels.test.js        geometry, level table, every level winnable
    ├── quest.test.js         progress + drafts
    └── coop.headless.test.js the renderer, played in headless Chrome
```

### Quest

- [ ] 🥚 Quest opens the level list; each row shows its earned stars
- [ ] Picking a level draws the yard: fences, eggs, basket, foxes
- [ ] The editor swaps to that level's starter; free-draw code is untouched
- [ ] `fd 700` solves First Steps and the status bar shows ★★★
- [ ] Walking into a fence stops the animal *at* it with a thud — not through it
- [ ] Run again after a bump restarts the level cleanly
- [ ] Walking off the edge bumps the border; the animal never leaves the yard
- [ ] Touching a fox ends the run with the caught message and a falling tone
- [ ] Passing over an egg collects it, plays a cluck, and bumps the HUD counter
- [ ] Collected eggs stay on screen as a faint ghost
- [ ] Solving Round and Round with `repeat` earns three stars; the eight-line
      version earns two
- [ ] Stars persist across a reload and show in the level list
- [ ] A basket on the start square (Round and Round, The Whole Farm) shows a
      dashed ring and is not won until you have left it — including after `home`
- [ ] `clear` inside a level wipes the pen trail but not the fences
- [ ] Resize mid-level: the yard stays proportional and nothing drifts
- [ ] Reset reloads the level; Stop interrupts cleanly
- [ ] ← Free Draw returns to free drawing with the previous code intact
- [ ] Every emoji renders as a real glyph — including 🧺 on the kids' machines

### Gates and keys

- [ ] The Locked Gate draws its gate purple with a 🔒 — never mistakable
      for a wooden fence
- [ ] Running straight at the locked gate stops with "🔒 the gate is
      locked — find the key!" above the editor, not the plain fence message
- [ ] Grabbing the key plays a chime, the HUD counts 🔑 1/1, and the gate
      fades to a dashed outline mid-run
- [ ] After unlocking, walking through the gate line just works
- [ ] Reset relocks the gate and the key reappears; the key keeps its faint
      ghost once grabbed (until reset)
- [ ] 🔑 and 🔒 render as real glyphs on the kids' machines

### Ice ponds

- [ ] Slippery Pond draws pale blue with ❄️ — clearly not grass
- [ ] A move that ends mid-pond glides to the far edge in the same
      direction, leaving one continuous trail
- [ ] Stopping exactly at the pond edge does NOT slide (toes at the water
      line are allowed)
- [ ] Gliding through an egg collects it mid-slide
- [ ] Gliding into a fence/border bumps and ends the run like any wall
- [ ] The glide animation takes visibly longer than the requested `fd`
      (distance-proportional, not a teleport)
- [ ] A big single `fd` that strides the whole pond in one go does not
      slide — you only slide when you would have STOPPED on the ice

### Wormholes

- [ ] Wormholes draws 🌀 pads in dashed rings — the rings read as
      "something happens here"
- [ ] Walking into a pad teleports you to its twin with a rising zap,
      mid-stride: the leftover `fd` continues from the far side
- [ ] You are never stranded standing on a pad — landing consumes the
      stride to the pad's centre
- [ ] The pair you just came through does not bounce you straight back;
      step away, come back, and it works again
- [ ] A stride that emerges heading into the pond glides on landing
      (warp + ice compose)
- [ ] The divider fence really does force the pad: no walking around it
- [ ] 🌀 renders as a real glyph on the kids' machines
