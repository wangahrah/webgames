# flapjack — Themeable Flappy Clone (Design Spec)

A flappy-bird-style game for kids aged 7–10. Themeable: the whole look and
feel swaps between fun themes (unicorn, retro, rocket, dragon, ghost, ocean,
bee). Three difficulty modes: Easy / Medium / Hard. The point is FUN first —
vivid, juicy, forgiving.

This is the build spec. Build the game to match it exactly. Where this doc is
silent, make the obvious kid-friendly choice; where this doc says something,
follow it.

## Hard rules (do not violate)

- **No build step, no dependencies, no servers, no external assets.** Open
  `index.html` via `file://` and it must work. Vanilla HTML/CSS/JS only.
  All art is canvas-drawn or emoji; all sound is synthesized WebAudio.
- **Self-contained.** Everything lives in `flapjack/`. Do not touch any other
  directory in the repo.
- **Emoji must be Emoji 12.0 (2019) or older.** The kids' machines (Ubuntu
  24.04/26.04 desktops) render any newer glyph as a tofu box. Every emoji used
  in the game must appear in the whitelist in `tests/themes.test.js`. When in
  doubt, use a drawn shape instead of an emoji.
- **60fps via `requestAnimationFrame`** with a fixed-timestep physics loop.
- **Responsive canvas.** The logical playfield is portrait 420×640. Scale it
  to fit the window (fit-height), center it, letterbox with the theme's sky
  gradient so the window is fully covered.
- **All localStorage keys namespaced `flapjack.*`.**
- **Tests run with plain node**: `node tests/*.test.js`, no framework, no
  npm, no package.json needed. The engine and scores modules must be
  importable from node (CommonJS `module.exports` guard, the same trick
  `chicken/js/ops.js` uses).
- **No comments in the code unless they clarify a non-obvious rule.**

## File layout

```
flapjack/
├── index.html         page shell, canvas, HUD/screen overlays, script tags
├── style.css          layout, screen styling, big kid-friendly buttons
├── js/
│   ├── themes.js      THEMES + DIFFICULTIES tables (single source of truth)
│   ├── engine.js      pure physics/collision/scoring logic (node-testable)
│   ├── render.js      canvas drawing: parallax, sprites, particles, juice
│   ├── audio.js       WebAudio synth: all sounds, mute, theme pitch
│   ├── scores.js      best-score storage (localStorage, node-testable)
│   └── app.js         wiring: screens, input, game loop, autopilot demo
└── tests/
    ├── themes.test.js  theme/difficulty table validation + emoji whitelist
    ├── physics.test.js engine integration + collision/scoring edge cases
    └── scores.test.js  storage roundtrips, new-best detection
```

Script load order in `index.html`: `themes.js`, `engine.js`, `render.js`,
`audio.js`, `scores.js`, `app.js`.

## Screens (state machine)

1. **Title** — the "attract mode" canvas runs a live autopilot demo of the
   current theme behind the menu (a semi-transparent panel floats on top).
   Menu contains:
   - Game name **FLAPJACK** in a chunky, playful font (system font stack,
     heavy weight, slight text-shadow glow).
   - **Theme carousel**: left/right arrows + a big preview (the emoji at
     large size) + theme name. The canvas behind instantly switches to the
     selected theme so the kid sees it live.
   - **Difficulty pills**: `🌱 Easy`, `⚡ Medium`, `🔥 Hard` (emoji
     whitelist-check these: 🌱⚡🔥 are all fine). Selected pill is
     highlighted. Best score for the current theme+difficulty shows under the
     pills ("Best: 23").
   - **PLAY** — one big, bright button. Space/Enter also starts.
   - A small mute toggle in a corner.
2. **Playing** — flappy gameplay. First tap/click/space does NOT start the
   physics; it makes the first flap (bird is gently hovering/bobbing at
   center until first input, with a bouncing "tap to flap!" hint).
3. **Paused** — overlay with Resume / Quit to menu. Auto-pause on window
   blur (kid walks away mid-game, the game waits). `P` or `Esc` pauses.
4. **Game over** — after a short death animation (~0.8s so the crash lands
   naturally, not a jarring cut). Shows: score, medal (if earned), "NEW
   BEST!" + confetti (if a record), Retry button, Menu button. Space
   instantly retries. Retry preserves theme + difficulty.

## Themes (`themes.js`)

Single source of truth. `THEMES` is an array of objects; every object must
carry every key listed below (the test enforces this). Adding a theme is
adding a row. Theme ids are kebab-case and unique.

Schema:

```js
{
  id: 'unicorn',
  name: 'Unicorn',
  emoji: '🦄',                    // player sprite, drawn via canvas fillText
  sky: ['#top', '#mid', '#bottom'],  // vertical gradient (any 2-3 stops)
  ground: { top: '#', body: '#' },   // scrolling ground strip colors
  parallax: [                       // 2-3 layers, slowest first
    { kind: 'rainbow'|'clouds'|'stars'|'bubbles'|'hills'|'waves'|'trees'|'planets'|'pollen'|'city',
      color: '#', count: N, speed: 0.15 },
    ...
  ],
  obstacle: {
    kind: 'pipe'|'candy'|'brick'|'rocket'|'tower'|'coral'|'flower',
    color: '#',                     // body
    accent: '#',                    // caps / details
    deco: null|'⭐'|'🔥'|'💧'|'🍯',  // optional decorative emoji on the posts
  },
  ambient: { kind: 'sparkle'|'ember'|'bubble'|'snow'|'pollen'|'star', rate: 0.02 },
  flapPitch: 0,                   // semitone offset for the flap blip tint
  squareWave: false,              // true for retro (8-bit feel)
}
```

The seven v1 themes (id / name / emoji / flavor):

1. **unicorn** 🦄 — rainbow sky, cotton-candy ground, rainbow arcs + clouds
   parallax, striped candy obstacles with ⭐ deco, sparkle particles. Default
   theme.
2. **retro** 🍄 — pixel-blue sky, brick blocks (draw a simple pixel grid on
   the obstacles), block-cloud + pixel-hill parallax, `squareWave: true`.
   The Mario *vibe*, not the trademark: no mushroom pipes, no copyrighted
   shapes.
3. **rocket** 🚀 — deep space gradient, starfield (two star layers) + distant
   planets (plain circles with rings drawn — do NOT use the 🪐 emoji, it's
   Emoji 13 and renders as tofu), metallic rocket-tower obstacles, star
   particles.
4. **dragon** 🐉 — sunset/lava gradient, volcano silhouettes + smoke puffs
   parallax, castle-tower obstacles with 🔥 deco, ember particles.
5. **ghost** 👻 — night gradient, starfield + crescent moon 🌙 + spooky-tree
   silhouettes, dark gate obstacles with ⭐ deco, slow star particles.
6. **ocean** 🐠 — underwater gradient, bubble columns + wave silhouettes,
   coral obstacles with 💧 deco, bubble particles.
7. **bee** 🐝 — flower-field gradient, flower rows + soft hills + drifting
   petals, tall flower-stem obstacles with 🍯 deco, pollen (golden mote)
   particles.

Player sprite is the theme's `emoji` rendered at ~56px on the logical
playfield. Obstacles span the full field height minus the gap, so they look
like posts/pipes rooted at top and bottom (standard flappy: a gap you fly
through between a top obstacle and a bottom obstacle).

## Difficulty (`themes.js` — same table file)

`DIFFICULTIES` array: `{ id, name, emoji, gap, scroll, spacing, hitbox, lives, moving }`.

| id | name  | emoji | gap   | scroll  | spacing | hitbox | lives | moving |
|----|-------|-------|-------|---------|---------|--------|-------|--------|
| easy   | Easy   | 🌱 | 230 | 130 px/s | 330 px | 0.75 | 3 | false |
| medium | Medium | ⚡ | 175 | 165 px/s | 285 px | 0.85 | 1 | false |
| hard   | Hard   | 🔥 | 145 | 200 px/s | 250 px | 0.90 | 1 | true  |

Physics (constant across all difficulties — kids graduate without re-learning
the flap):

- gravity 1500 px/s²
- flap impulse −380 px/s
- terminal rise cap −260 px/s, terminal fall cap +600 px/s
- bird x fixed at 0.32 × playfield width
- rotation: +25° while rising (just after flap), lerp down to −90° as it
  approaches terminal fall. Squash-and-stretch on flap (width up, height down
  briefly).

`moving` = on Hard only, after score ≥ 10, the gap center of each obstacle
gently oscillates vertically (±28 px, sine period ~2.8 s, phase staggered per
obstacle) so the pipe you have to hit literally moves.

## Lives & forgiveness

- **Easy = 3 hearts** (❤️ HUD, 🤍 for spent). Crash costs one heart, a ~1.5s
  invincibility blink, and the obstacle you hit is *cleared* (no double
  punishment) — you keep flying. Lose the third heart → game over.
- **Medium / Hard = 1 life**, standard flappy.
- Floor = crash (no mercy). Ceiling = **soft bounce** (bird is gently pushed
  down, no death) — friendlier than the original and easier for a 7-year-old.
- First obstacle spawns ≥ 1.5 screen-widths away — nobody dies before they've
  taken a breath.

## Scoring, medals, streaks

- +1 per obstacle fully passed.
- **PERFECT!** — pass through the dead-center band (bird center within ±12%
  of gap center) → +2 and a rainbow ring burst + "PERFECT!" popup.
- **ON FIRE!** — 3+ perfects in a row → flame trail on the bird; resets when
  a non-perfect pass or a crash happens.
- Milestone every 10 points: banner ("10!", "20!"...), rising fanfare, and a
  subtle sky tint shift (applies a theme-colored overlay, cap at ~0.18 alpha,
  stop shifting after 100).
- Medals on game over (drawn as emoji, whitelisted):
  - Easy: 🥉 5 / 🥈 15 / 🥇 30 / 👑 50
  - Medium: 🥉 5 / 🥈 10 / 🥇 20 / 👑 40
  - Hard: 🥉 3 / 🥈 8 / 🥇 15 / 👑 30
- Best score stored per **theme × difficulty**:
  `flapjack.best.<themeId>.<diffId>` — "I got 23 on unicorn easy" is the
  whole point. Persist `flapjack.theme`, `flapjack.difficulty`,
  `flapjack.muted`.

## Input

- Space, ArrowUp, W, mouse click, touch → flap. (Also starts/retries on the
  relevant screens.)
- P or Esc → pause. R → retry on game over.
- `preventDefault` on Space/ArrowUp/ArrowDown so the page never scrolls.
- First gesture also resumes the AudioContext (browser autoplay policy).

## Juice list (the fun, non-negotiable)

- Title attract mode: autopilot bird (simple heuristic: flap when the bird
  is above the next gap center by a fixed margin — tuned so it mostly
  survives) plays live behind the menu.
- Flap: puff of particles + squash-and-stretch + little upward hop of the
  shadow (if ground is near).
- Score: big pop-and-bounce number; slight glow on milestone.
- Crash: tiny screen shake, particle burst, then the death fall (bird tumbles
  with rotation), soft thud (not harsh — kids).
- NEW BEST: confetti burst + fanfare + the score counter flips up.
- Ambient particles per theme drifting constantly (sparkle/ember/bubble/
  snow/pollen/star).
- Ground and parallax layers scroll at their own speeds continuously.
- Themed flap-pitch: each theme's flap blip is shifted by `flapPitch`
  semitones; retro uses a square wave.
- Hearts on Easy animate (pop when lost).

## Audio (synthesized, `audio.js`)

WebAudio, no assets. Master gain modest (~0.15–0.25 — present but not
jarring; chicken's bar was "audible, not jarring"). Events:
- flap: short blip, pitch rises slightly with consecutive flaps (streak feel)
- point: ding
- perfect: two-note chime (higher)
- milestone: rising 3-note arpeggio
- heartLost (easy): sad two-note
- crash: soft low thud + brief noise burst
- fanfare: C–E–G–C arpeggio on NEW BEST
Mute toggle persisted; icon swaps 🔇/🔊 (both whitelisted).

## Testing (plain node)

`tests/themes.test.js`:
- Every theme has all schema keys with correct types; ids unique, kebab-case.
- sky colors match `/^#[0-9a-fA-F]{6}$/`.
- 2–3 parallax layers; each `kind` in the known set.
- obstacle.kind in the known set; deco is null or a whitelisted emoji.
- ambient.kind in the known set.
- **EMOJI_ALLOWLIST** exported from the test file: every emoji used anywhere
  in the game must be listed, and every listed emoji must be Emoji ≤ 12.0.
  This is the guard against fleet tofu boxes. Include 🦄🍄🚀🐉👻🐠🐝
  ❤️🤍🌱⚡🔥⭐✨🔇🔊🥉🥈🥇👑🌙💧🍯 + anything else added.
- DIFFICULTIES: ids easy/medium/hard; monotonicity — easy.gap > medium.gap >
  hard.gap, easy.scroll < medium.scroll < hard.scroll, easy.spacing >
  medium.spacing > hard.spacing, easy.hitbox < medium.hitbox < hard.hitbox,
  lives 3/1/1, moving false/false/true.

`tests/physics.test.js`:
- flap/gravity integration is deterministic (two runs, same state → same
  state).
- terminal velocity caps hold.
- AABB collision with `hitbox` scale: clear pass is not a hit, edge graze at
  hitbox scale is a hit, exact-gap-center pass is perfect.
- Ceiling soft-bounce never kills; floor always kills.

`tests/scores.test.js` (mock localStorage object):
- best() roundtrip per theme×difficulty.
- new-best detection returns true only on a genuine record.
- keys are `flapjack.best.*`.
- corrupt storage → treated as 0, next save heals.

Modules under test must work in node: use
`if (typeof module !== 'undefined') module.exports = { ... }`.

## Definition of done

- All 7 themes render fully themed and switched live by the carousel.
- All 3 difficulties play correctly; Easy's 3-heart loop is genuinely
  forgiving; Hard's moving pipes engage after score 10.
- Attract-mode demo runs on the title screen.
- `node tests/*.test.js` all pass.
- Opens from `file://` with zero errors in the console; 60fps on
  bekah-class hardware (RX 6800 XT host and the kids' iGPU desktops).
- localStorage persists across reload (theme, difficulty, mute, bests).
- Every emoji renders as a real glyph on the kids' machines (fleet tofu
  check — do it on a kids' box, not just bekah).

## Smoke checklist (post-build, in the game's README.md)

Copy this into `flapjack/README.md` (chicken-style) and tick each item as
verified:

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