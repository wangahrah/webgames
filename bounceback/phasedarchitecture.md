# Bounceback - Phased Architecture

> Implementation plan for sub-agents. Phases are sequential. Tasks within a phase can be executed **in parallel** unless noted.

The game is a **single HTML file** (`index.html`) with all CSS and JS embedded. To enable parallel work, agents write to **separate temporary JS files** during development. A final integration phase merges everything into the single HTML file.

---

## File Structure During Development

```
bounceback/
  concept.md
  phasedarchitecture.md
  index.html              ← final output (built in Phase 4)
  dev/                    ← temporary working files (deleted after Phase 4)
    core.js               ← game loop, canvas, input, camera, state machine
    player.js             ← player entity, physics, shield
    level.js              ← level data, platforms, obstacles, finish line
    hazards.js            ← lasers, star monster, falling hammers
    rendering.js          ← background, particles, HUD, screen overlays
```

---

## Phase 1 — Foundation

> One agent. This must complete before Phases 2-3 can begin, as it establishes the shared constants and architecture all other modules depend on.

### Task 1.1: Core Engine (`dev/core.js`)

**Agent writes**: `dev/core.js`

Implements the skeleton that all other modules plug into:

- **Canvas setup**: Create and size a responsive `<canvas>` to fill the window. Handle `resize` events.
- **Game constants object** (`CONFIG`): Central place for shared values other modules reference:
  ```
  CONFIG = {
    CANVAS_WIDTH, CANVAS_HEIGHT,
    GRAVITY: 0.6,
    GROUND_Y: <canvas_height - 80>,
    PLAYER_RADIUS: 20,
    PLAYER_SPEED: 4,
    JUMP_FORCE: -12,
    SHIELD_DURATION: 60,    // frames (~1s)
    SHIELD_COOLDOWN: 120,   // frames (~2s)
    LEVEL_LENGTH: 8000,     // pixels
    CAMERA_OFFSET_X: 200,   // player's screen X position
    COLORS: {
      FIRE_BG_TOP: '#1a0500',
      FIRE_BG_BOTTOM: '#4a1500',
      GROUND: '#3d1500',
      EMBER: '#ff6600',
      PLAYER: '#ff8800',
      PLAYER_GLOW: '#ffcc00',
      LASER: '#ff0000',
      SHIELD: 'rgba(100,200,255,0.3)',
      MONSTER: '#8B008B',
      MONSTER_STAR: '#ffff00',
      HAMMER_HEAD: '#888888',
      HAMMER_HANDLE: '#cc4400',
      FINISH_RED: '#ff2200',
      FINISH_YELLOW: '#ffdd00',
      FINISH_WHITE: '#ffffff',
    }
  }
  ```
- **Input handler**: Track keyboard state (`keys` object for held keys) and mouse click events (store `{x, y}` in world coordinates, consumed after processing).
- **Camera object**: `{ x: 0 }` — horizontal offset that follows the player. Other modules use this to convert world coords to screen coords.
- **Game state machine**: Variable `gameState` with values `'title'`, `'playing'`, `'dead'`, `'victory'`. Functions: `setState(newState)`.
- **Game loop**: `requestAnimationFrame` loop that calls `update(dt)` and `draw(ctx)`. Delta-time based at 60 FPS target. The update/draw functions dispatch to the current state's handlers.
- **Module hook points**: The loop calls arrays of registered functions:
  ```
  updateFunctions = []   // each called with (dt)
  drawFunctions = []     // each called with (ctx), drawn in order (background first, HUD last)
  ```
  Other modules push their update/draw functions into these arrays.

**Acceptance criteria**: A canvas appears, resizes with the window, shows a solid background color, and the game loop runs. Input is tracked. State can be switched via console.

---

## Phase 2 — Game Entities (Parallel)

> **Three agents run in parallel.** Each writes to its own file. All depend on Phase 1's `CONFIG` and module hook points.

---

### Task 2.1: Player (`dev/player.js`)

**Agent writes**: `dev/player.js`

Depends on: `CONFIG`, `keys`, `camera`, `gameState`

- **Player object**: `{ x, y, vx, vy, radius, lives, rotation, shieldActive, shieldTimer, shieldCooldown, invincible, invincibleTimer }`
- **Physics**:
  - Apply gravity (`vy += CONFIG.GRAVITY`) each frame.
  - Ground collision: if `y + radius >= CONFIG.GROUND_Y`, snap to ground, zero `vy`, set `onGround = true`.
  - Platform collision: check against platform list from level data (passed in or global). Stand on top of platforms (one-way).
  - Horizontal movement: left/right arrow keys set `vx`. Apply `vx` to `x`. Clamp `x` within `[0, CONFIG.LEVEL_LENGTH]`.
  - Jump: if `onGround` and up arrow pressed, set `vy = CONFIG.JUMP_FORCE`.
- **Shield**:
  - Spacebar triggers shield if `shieldCooldown <= 0`.
  - Sets `shieldActive = true`, `shieldTimer = CONFIG.SHIELD_DURATION`.
  - Timer counts down; when 0, `shieldActive = false`, `shieldCooldown = CONFIG.SHIELD_COOLDOWN`.
  - Cooldown counts down each frame when not active.
- **Damage / lives**:
  - `hurtPlayer()`: If not `invincible` and not `shieldActive` (for lasers): decrement `lives`, set `invincible = true`, `invincibleTimer = 90` (1.5s). Respawn X position back by 100px.
  - `knockbackPlayer(direction)`: For hammers — apply a velocity impulse (`vx = direction * 8, vy = -6`). No life loss.
  - If `lives <= 0`: `setState('dead')`.
- **Camera update**: `camera.x = player.x - CONFIG.CAMERA_OFFSET_X`. Clamp so camera doesn't go below 0 or past level end.
- **Drawing**:
  - Draw a filled circle with radial gradient (inner `PLAYER_GLOW`, outer `PLAYER`).
  - Simple face: two small black oval eyes.
  - Rotate the drawing by `player.rotation` (increments based on `vx` to simulate rolling).
  - If `invincible`: blink the player (skip drawing every other 4 frames).
  - If `shieldActive`: draw a translucent circle around the player.
  - Ember trail: push small particles behind the player (just 3-5 small fading circles trailing the player; no separate particle system needed).

**Acceptance criteria**: Player renders on screen, rolls left/right, jumps, has working shield with cooldown, blinks when invincible, and the camera follows.

---

### Task 2.2: Level Layout (`dev/level.js`)

**Agent writes**: `dev/level.js`

Depends on: `CONFIG`, `camera`

- **Level data**: A set of arrays defined as plain data:
  - `platforms[]`: `{ x, y, width, height }` — solid rectangles the player can stand on.
  - `obstacles[]`: `{ x, y, width, height, type }` — visual barriers. Types: `'low_wall'`, `'arch'`.
  - `gaps[]`: `{ x, width }` — sections where ground is missing (player falls and loses a life, or respawns).
  - `hammerZones[]`: `{ xStart, xEnd, interval }` — regions where hammers fall.
  - `laserPlacements[]`: `{ x, y, width, height, onDuration, offDuration }` — passed to hazards module.
  - `monsterPlacements[]`: `{ x, y, patrolLeft, patrolRight }` — passed to hazards module.
  - `finishLine`: `{ x }` — world X position of the finish line.
- **Level design** (approximately 8000px long):
  - **Section 1 (0-2000)**: Gentle intro. A few low walls to jump over. One gap. One pulsing laser.
  - **Section 2 (2000-4500)**: First star monster. Two lasers. A hammer zone. Some platforms to climb over an arch.
  - **Section 3 (4500-6500)**: Second star monster. Tighter laser timing. More gaps. Another hammer zone.
  - **Section 4 (6500-8000)**: Final gauntlet — third star monster, overlapping hammer zone and lasers, then the finish line at ~7800.
- **Ground rendering**: Draw the ground as a dark rectangle with subtle ember-glow spots (just a few static orange circles on the ground surface). Draw gaps as empty space (no ground rect in that segment).
- **Platform rendering**: Draw platforms as dark reddish-brown rectangles with a slight highlight on top edge.
- **Obstacle rendering**:
  - `low_wall`: A short filled rectangle on the ground.
  - `arch`: Two vertical pillars with a horizontal bar on top (player passes underneath).
- **Finish line rendering**: At `finishLine.x`, draw alternating vertical stripes of red, yellow, white — about 40px wide, full height. Add a gentle glow/shimmer (oscillating alpha).
- **Finish line collision**: If `player.x >= finishLine.x`: `setState('victory')`.

**Acceptance criteria**: The level renders with all platforms, obstacles, gaps, and the finish line visible. Ground scrolls with the camera. Finish line triggers victory state.

---

### Task 2.3: Hazards (`dev/hazards.js`)

**Agent writes**: `dev/hazards.js`

Depends on: `CONFIG`, `camera`, player's `{ x, y, radius, shieldActive, invincible }`, `hurtPlayer()`, `knockbackPlayer()`

- **Lasers**:
  - Initialize from `laserPlacements[]` data.
  - Each laser has a timer toggling between `on` (dangerous, visible) and `off` (safe, dim).
  - **Drawing (on)**: Bright red rectangle with a glow effect (draw a slightly larger, lower-alpha rect behind it). Flicker slightly.
  - **Drawing (off)**: Dim, translucent thin line.
  - **Collision**: When `on`, check AABB overlap with player circle. If overlapping and player not `shieldActive` and not `invincible`: call `hurtPlayer()`. If `shieldActive`: show a brief spark at contact point (just set a small flash timer).

- **Star Monster**:
  - Initialize from `monsterPlacements[]` data.
  - Each monster: `{ x, y, patrolLeft, patrolRight, vx, stunTimer, attackTimer, attacking, lasers[] }`.
  - **Patrol**: Walk back and forth between `patrolLeft` and `patrolRight` at slow speed. Reverse `vx` at boundaries.
  - **Attack cycle**: Every ~180 frames (3s), stop and `attacking = true`. Shoot 5 laser beams radially (72 degrees apart) from the star on the monster's head. Beams extend outward over ~30 frames, hold for ~30 frames, then retract. Then resume patrol.
  - **Stun**: On mouse click, convert click screen coords to world coords. If click is within the monster's bounding box: set `stunTimer = 180` (3s). Monster stops, doesn't attack, star dims.
  - **Drawing**: A roundish body (ellipse, purple/dark), two stumpy legs that alternate position (simple walk animation: just shift leg rects). Star on head: 5-pointed star shape drawn in yellow/gold, glowing when active, dim when stunned.
  - **Star laser drawing**: 5 lines extending from the star center outward at 72-degree intervals. Red with glow. Length animates (grow out, hold, shrink back).
  - **Star laser collision**: For each of the 5 beam lines, check distance from player center to line segment. If distance < player radius and not shielded and not invincible: `hurtPlayer()`.

- **Falling Hammers**:
  - Active hammer zones from `hammerZones[]`.
  - When player is inside a zone, spawn hammers at `interval` frame counts at random X within the zone.
  - Each hammer: `{ x, y, vy, active }`. Starts above screen, falls with `vy` that increases with gravity.
  - **Warning**: Before spawning, draw a pulsing red circle/shadow on the ground at the target X for ~40 frames, then spawn the hammer.
  - **Drawing**: A rectangle head (gray) with a vertical handle (fiery orange-brown). Simple shape — no detail needed.
  - **Collision**: AABB check with player. If hit: `knockbackPlayer(direction)` where direction is based on relative position. Mark hammer as inactive.
  - **Cleanup**: Remove hammers that fall below ground level.

**Acceptance criteria**: Lasers pulse on/off and hurt the player. Star monsters patrol, shoot star-pattern lasers, and can be stunned by clicking. Hammers fall with warnings and knock the player back.

---

## Phase 3 — Visuals & UI (Parallel with Phase 2)

> **One agent.** Can run in parallel with Phase 2 agents since it only depends on Phase 1 and writes to its own file.

### Task 3.1: Rendering, Particles, HUD & Screens (`dev/rendering.js`)

**Agent writes**: `dev/rendering.js`

Depends on: `CONFIG`, `camera`, `gameState`, player's `{ lives, shieldCooldown }`

- **Background**:
  - Vertical gradient from `FIRE_BG_TOP` (dark) at top to `FIRE_BG_BOTTOM` (deep orange) at bottom. Static, doesn't scroll.
  - Parallax ember layer: ~20 small orange/yellow dots that drift slowly upward and reset when off-screen. Slight horizontal sway. These scroll at 0.3x camera speed for parallax effect.

- **Ember particles (ambient)**:
  - A simple array of ~30 particles: `{ x, y, size, alpha, vy }`.
  - Float upward, fade out, respawn at bottom. Drawn as tiny orange circles.
  - Scroll with camera at 0.5x speed (midground parallax).

- **HUD** (drawn in screen-space, not world-space):
  - **Lives**: Top-left corner. Draw 3 small flame icons (simple teardrop shapes: orange filled, yellow highlight). Extinguished flames are gray.
  - **Shield indicator**: Small circular cooldown indicator below the lives. A ring that fills clockwise as the cooldown recharges. Full ring + bright color = ready. Partially filled + dim = recharging.

- **Title Screen** (`gameState === 'title'`):
  - Dark background with floating embers.
  - "BOUNCEBACK" in large, bold text centered on screen. Color: orange-yellow gradient (use `fillStyle` with a linear gradient). Slight glow (draw text twice: once blurred/larger in orange behind, once sharp on top).
  - "Click to Start" below in white, pulsing opacity (fades in and out).
  - On click: `setState('playing')`.

- **Death Screen** (`gameState === 'dead'`):
  - Semi-transparent dark overlay.
  - "OH NO!" in large red text, centered.
  - "Click to Try Again" below, pulsing.
  - On click: reset player, reset hazards, `setState('playing')`.

- **Victory Screen** (`gameState === 'victory'`):
  - Semi-transparent overlay.
  - "YOU WIN!" in large gold/yellow text, centered, with glow.
  - Simple fireworks: ~10 particles that burst outward from random points, each a cluster of orange/red/yellow dots that fly outward and fade. Repeat every couple seconds.
  - "Click to Play Again" below.
  - On click: full reset, `setState('title')`.

**Acceptance criteria**: Background renders with parallax embers. HUD shows lives and shield cooldown accurately. All four game screens (title, playing, dead, victory) display correctly and transition on click.

---

## Phase 4 — Integration

> **One agent.** Merges everything into a single HTML file.

### Task 4.1: Assemble `index.html`

**Agent reads**: All files in `dev/` and merges them.
**Agent writes**: `index.html`

- Create the HTML file with:
  ```html
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>Bounceback</title>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { background: #000; overflow: hidden; }
      canvas { display: block; }
    </style>
  </head>
  <body>
    <canvas id="gameCanvas"></canvas>
    <script>
      // === ALL JS MERGED HERE IN ORDER ===
      // 1. core.js   (CONFIG, canvas, input, camera, state, loop)
      // 2. rendering.js (background, particles, HUD, screens)
      // 3. level.js  (level data, ground/platform/obstacle rendering)
      // 4. hazards.js (lasers, star monster, hammers)
      // 5. player.js (player logic, drawing, camera follow)
      // 6. Initialization: call setup functions, register update/draw hooks, start loop
    </script>
  </body>
  </html>
  ```
- **Resolve any cross-references**: Ensure global variables and functions are accessible across modules. Fix any naming conflicts.
- **Add initialization code** at the bottom of the script that:
  - Creates the level data.
  - Initializes the player, hazards, and rendering systems.
  - Registers all update/draw functions in the correct order.
  - Starts the game loop on the title screen.
- **Test in browser**: The game should be fully playable from `index.html` alone.

**Acceptance criteria**: Opening `index.html` in a browser runs the complete game. Title screen appears, gameplay works with all hazards, victory/death screens function, game can be replayed.

---

## Phase 5 — Polish & Playtesting

> **One agent.** Final pass.

### Task 5.1: Playtest & Fix

- Play through the game and fix any issues:
  - Collision detection edge cases.
  - Difficulty balancing (if too hard for a 6-year-old, widen gaps, slow hazards, increase shield duration).
  - Visual glitches (z-ordering, off-screen rendering).
  - Missing state resets on replay.
- Ensure smooth camera movement.
- Verify all controls work.
- Test window resizing.

**Acceptance criteria**: The game is fun, completable by a young child, and free of obvious bugs.

---

## Dependency / Parallelism Map

```
Phase 1 ─── Task 1.1 (Core)
                │
                ├───────────────────────┐
                │                       │
Phase 2 ─── Task 2.1 (Player)    Phase 3 ─── Task 3.1 (Rendering/HUD/Screens)
            Task 2.2 (Level)         [runs in parallel with Phase 2]
            Task 2.3 (Hazards)
            [all 3 in parallel]
                │                       │
                ├───────────────────────┘
                │
Phase 4 ─── Task 4.1 (Integration)
                │
Phase 5 ─── Task 5.1 (Polish)
```

**Maximum parallelism: 4 agents** during Phases 2+3 (Tasks 2.1, 2.2, 2.3, 3.1 all run simultaneously).
