# flapjack

Themeable flappy clone for kids aged 7–10. Seven themes, three difficulties,
synthesized sound, zero dependencies — open `index.html` from `file://` and
play. See `concept.md` for the full design spec.

## Running tests

Plain node, no framework, no npm. From `flapjack/`:

```
node tests/themes.test.js
node tests/physics.test.js
node tests/scores.test.js
```

## Architecture

```
flapjack/
├── index.html         page shell, canvas, HUD/screen overlays, script tags
├── style.css          layout, screen styling, kid-friendly buttons
├── js/
│   ├── themes.js      THEMES + DIFFICULTIES tables (single source of truth)
│   ├── engine.js      pure physics/collision/scoring logic (node-testable)
│   ├── render.js      canvas drawing: parallax, sprites, particles, juice
│   ├── audio.js       WebAudio synth: all sounds, mute, theme pitch
│   ├── scores.js      best-score storage (localStorage, node-testable)
│   └── app.js         wiring: screens, input, game loop, autopilot demo
└── tests/
    ├── themes.test.js theme/difficulty validation + emoji whitelist guard
    ├── physics.test.js engine integration + collision/scoring edge cases
    └── scores.test.js storage roundtrips, new-best detection
```

### Module split

- **themes.js** is data only. `THEMES` and `DIFFICULTIES` are the single source
  of truth; tests assert every theme carries every schema key, ids are kebab-case
  and unique, sky/ground colors are 6-digit hex, and difficulty numbers are
  monotonic exactly as the spec tables. Adding a theme = adding a row.
- **engine.js** is the only module that knows the rules of flappy. It never
  touches the DOM, and randomness comes only from a seeded PRNG, so the same
  seed + the same inputs produces byte-identical state — that's what the
  determinism test asserts. The engine emits `lastEvents` per `worldStep`
  (`point`, `perfect`, `milestone`, `heartLost`, `over`) that `app.js` reacts
  to for sound, particles, and popups; the engine itself stays pure.
- **render.js** draws the whole playfield in the fixed 420×640 logical space.
  Parallax layouts are precomputed from a hash of (theme id + layer index) so
  layers never flicker between frames. Obstacles switch on
  `theme.obstacle.kind`; the two ghost stars are drawn, not the 🪐 emoji
  (Emoji 13 → tofu). All drawing is emoji-agnostic except the bird, deco, the
  ghost moon, and ambient sparkles.
- **audio.js** synthesizes everything (no assets) behind one modest master
  gain (~0.18). `flap()` shifts the blip by `theme.flapPitch` semitones and
  uses a square wave for the retro theme; consecutive flaps rise in pitch.
- **scores.js** stores bests per theme×difficulty under `flapjack.best.*`
  plus `flapjack.theme` / `flapjack.difficulty` / `flapjack.muted`. Corrupt
  values read as 0 and heal on the next save.
- **app.js** is the state machine (title / playing / paused / gameover, plus
  `ready → flying → dying` inside playing) and the fixed-timestep loop:
  a `requestAnimationFrame` pump accumulates real time and steps the world in
  discrete 1/60 s ticks, so physics never depends on frame rate.

### CommonJS guard

`themes.js`, `engine.js`, and `scores.js` end with
`if (typeof module !== 'undefined' && module.exports) module.exports = …`,
so node's `require()` gets the exports while the browser gets globals
(`FlapjackThemes`, `FlapjackEngine`, `FlapjackScores`). `render.js`, `audio.js`,
and `app.js` are browser-only and don't need the guard.

### Emoji discipline

Every glyph in the game is checked against `EMOJI_ALLOWLIST` in
`tests/themes.test.js`. The test scans all source files, extracts every emoji,
and asserts two things: (1) every emoji used in the game is listed, and (2)
every listed emoji is Emoji 12.0 (2019) or older, via a hardcoded version
table. The kids' Ubuntu machines render anything newer as a tofu box, so this
is the fleet guard. The hardest catch here: the 🪐 (Saturn) emoji is Emoji 13,
which is why the rocket theme's planets are drawn as circles with rings.

### Interpretations worth knowing

- **"First input makes the first flap":** PLAY (or Space on the title) puts the
  bird in the bobbing *ready* state; the *next* input is the first flap, which
  starts physics. No separate "go" step.
- **Hitbox scale:** the difficulty `hitbox` factor narrows the obstacle's
  *collision width only*; the drawn gap and collision gap are unchanged, so a
  smaller hitbox is strictly more forgiving (easy 0.75 < hard 0.90).
- **PERFECT = +2** replaces the normal +1 (not +3). Milestones fire on any
  crossing of a multiple of 10, so a perfect pass that jumps 9→11 still rings
  the "10!" banner.
- **Floor always kills**, even on Easy with hearts left — the spec calls the
  floor a no-mercy crash, so the 3-heart forgiveness applies only to obstacle
  hits. Ceiling is always a soft bounce.
- **Emoji scan covers all source**, not just the theme tables, so the HUD
  hearts, medals, mute icons, and ghost moon are all guarded.
- **Rotation sign:** the engine tracks nose-up as positive; the renderer
  applies `rotate(-rot)` so the canvas's clockwise-positive rotation turns
  "rising" into a correctly nose-up sprite.
- **Autopilot** (title attract): flap when the bird sits ~10px above the next
  gap center, with a 0.16 s cooldown; otherwise hover at mid-height. Verified
  in node to survive 30 s on all three difficulties, including hard's moving
  pipes.

## Smoke checklist (post-build, visual things tests don't catch)

- [ ] Title screen: attract-mode bird flaps behind the menu
- [ ] Theme carousel switches all 7 themes live; selection persists
- [ ] Easy: 3 hearts; crash clears the obstacle and blinks invincible;
      third hit ends the run
- [ ] Medium/Hard: one hit ends the run
- [ ] Hard: pipes start moving after score 10
- [ ] Ceiling is a soft bounce; floor is a crash
- [ ] "tap to flap!" hint shows until first input; first input only flaps
- [ ] PERFECT! +2 and ring burst on dead-center pass; ON FIRE! trail after 3
- [ ] Milestone banner + fanfare every 10; sky tint shifts, caps ~0.18
- [ ] Score pop animation; crash screen-shake; death tumble then game over
- [ ] NEW BEST! confetti + fanfare on a record
- [ ] Medals render at thresholds; 👑 crown at top tier
- [ ] Best score per theme×difficulty shows on title
- [ ] P/Esc pause; auto-pause on window blur; R retry; Space on game over
- [ ] Mute toggles and persists; sounds are "audible, not jarring"
- [ ] Reload preserves theme, difficulty, mute, bests
- [ ] No console errors; runs from `file://`
- [ ] Every emoji is a real glyph on the kids' machines (no tofu)