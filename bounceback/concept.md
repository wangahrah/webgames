# Bounceback - Game Concept

## Overview
A side-scrolling browser game for young kids (age 6+). The player controls a rolling fireball navigating through a hazard-filled course to reach the finish line. Simple controls, forgiving gameplay, and a vibrant fire theme throughout.

## Theme
**Fire** - The world is built around warm oranges, reds, and yellows. The player is a glowing fireball. The ground looks like smoldering embers. The background has a fiery gradient sky. Particle effects (sparks, embers) drift upward throughout.

---

## Player
- **Appearance**: A small, round, glowing fireball with a cute face (eyes). Leaves a faint ember trail as it rolls.
- **Movement**: Rolls left/right with arrow keys (or A/D). Jumps with Up arrow (or W). The ball has a slight rolling animation (rotation).
- **Lives**: The player starts with **3 lives** (displayed as flame icons in the HUD).
- **Shield**: Holding **Spacebar** raises a shield bubble around the fireball. It blocks lasers and monster beams, lasts ~1 second, then needs ~2 seconds before it can be raised again — holding the key just cycles it. It is deliberately *not* a state you can live in. The HUD dot shows all three states: a bright ring when ready, a filled dial draining while it is up, a dark dial refilling while it recharges.
- **What the shield does not stop**: falling hammers. A hammer smashes straight through a raised shield, knocks it out, and puts it on cooldown.

## Course / Level
- The level scrolls horizontally from left to right.
- The course is a single continuous level with a clear start and finish.
- **Obstacles** are placed along the path:
  - **Low barriers** the player rolls beside or jumps over.
  - **Overhead arches** the player rolls under.
  - **Gaps** in the ground the player jumps across.
- The level is designed to be completable in about 60-90 seconds.

## Hazards

### 1. Lasers
- Stationary horizontal or vertical laser beams placed at fixed positions in the level.
- They pulse/blink on and off on a visible timer so the player can learn the pattern.
- **If hit**: Player loses 1 life and respawns a short distance back with brief invincibility.
- **Blocked by**: Shield (spacebar).

### 2. Monsters

Five kinds patrol the course. Clicking is the point — he likes destroying them
more than he likes the platforming, so each type is a different *kind* of click.
Only the Star Monster's beams cost a life; every other monster merely shoves the
player back, the same as a falling hammer does.

#### Star Monster
- A quirky monster that patrols a small area, walking back and forth.
- Has a **star shape on its head** that glows.
- **Attack**: Periodically stops and shoots **5 laser beams outward** in a star/radial pattern from the star on its head.
- **Counter**: **Clicking the monster with the mouse** destroys it. It flashes white, then spins, swells and phases out over about three quarters of a second while its star bursts into sparks and a shockwave ring expands outward. It stops patrolling and stops being dangerous on the click frame — the animation is purely for show — and it stays gone until the level restarts.
- There are three star monsters per level, among the sixteen-odd monsters of all kinds.

#### Bomber
- A round monster with a lit fuse sparking on its head. Patrols slowly.
- **Click**: it detonates. A white core, a shockwave ring, screen shake, and
  everything within the blast radius is destroyed with it.
- **Chains**: other bombers caught in a blast light a short fuse and go off a
  moment later rather than instantly, so a line of them cascades. They are
  placed in clusters of two to four for exactly this reason.
- **Threat**: the blast shoves the player too. Don't stand next to one.

#### Splitter
- A wobbling blob that bounces along the ground.
- **Click**: it bursts into two smaller copies, which scatter. Click those and
  each splits again into two tiny ones. Click a tiny one and it pops for good.
  One splitter is seven satisfying clicks.
- **Threat**: bumping into one shoves the player back.

#### Armored
- Wears three plates over its back.
- **Click**: knocks one plate off with a flash and a shower of debris, and the
  monster flinches away. The third click destroys it.
- **Threat**: charges at the player when they come close, then shoves them.

#### Floater
- Drifts through the air on a lazy sine path, tethered like a balloon.
- **Click**: pops in a wide ring of sparks. One click, but it's a moving target
  well above the ground, so it takes aim.
- **Threat**: bumping into one mid-jump shoves the player back.

### 3. Falling Hammers
- Hammers drop from the top of the screen at semi-random intervals in certain zones.
- A brief **warning shadow/indicator** appears on the ground before each hammer falls (kid-friendly telegraph).
- **If hit**: costs **1 life**, throws the player backward, and breaks the shield if one was up. Hammers are the one hazard the shield cannot answer, so hammer zones have to be crossed on timing and footwork rather than by holding space.
- The hammers have a fiery handle to match the theme.

## Finish Line
- A bold, vertical stripe pattern of **red, yellow, and white** — like a checkered racing finish line but with fire colors.
- Sparkle/glow effect on the finish line to make it visually exciting.
- When the player crosses it: celebration screen with fireworks/fire particles and a "YOU WIN!" message.

## Controls Summary
| Input | Action |
|---|---|
| Arrow Left / A | Roll left |
| Arrow Right / D | Roll right |
| Arrow Up / W | Jump |
| Spacebar | Hold for shield (~1s up, ~2s cooldown; blocks lasers, NOT hammers) |
| Mouse Click | Click a monster to destroy it (armored ones take three) |

## HUD (Heads-Up Display)
- **Lives**: 3 flame icons (top-left). One extinguishes per life lost.
- **Shield cooldown**: Circular dial under the lives, top-left. Bright ring = ready, filled and draining = up, dark and refilling = recharging.

## Game States
1. **Title Screen**: "BOUNCEBACK" in fiery text, "Click to Start" prompt.
2. **Gameplay**: The main scrolling level.
3. **Death**: When all 3 lives are lost — "Try Again?" screen with option to restart.
4. **Victory**: Crossing the finish line — celebration screen with "YOU WIN!" and option to replay.

## Technical Approach
- **Single HTML file** with embedded CSS and JavaScript.
- Rendered on an **HTML5 Canvas**.
- No external dependencies or frameworks — pure vanilla JS.
- Target resolution: responsive canvas that fits the browser window.
- Runs at 60 FPS via `requestAnimationFrame`.

## Design Principles (for implementation)
- **Keep it simple**: Straightforward platformer physics (gravity, ground collision, basic AABB hitboxes).
- **Kid-friendly**: Forgiving hit detection, generous shield window, clear visual telegraphs for all hazards.
- **Fun over difficulty**: The game should feel beatable in a few tries. Monsters die in one click (armored ones in three). The shield recharges quickly. Hammers are the deliberate exception — they cost a life and ignore the shield, so hammer zones are the real test.
- **Visually clear**: High contrast between player, hazards, and background. Big, readable shapes.
