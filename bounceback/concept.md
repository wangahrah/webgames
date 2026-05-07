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
- **Shield**: Pressing **Spacebar** activates a brief shield bubble around the fireball. The shield blocks lasers and lasts ~1 second with a short cooldown (~2 seconds). Visual: a translucent circle flashes around the player.

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

### 2. Star Monster
- A quirky monster that patrols a small area, walking back and forth.
- Has a **star shape on its head** that glows.
- **Attack**: Periodically stops and shoots **5 laser beams outward** in a star/radial pattern from the star on its head.
- **Counter**: **Clicking the monster with the mouse** stuns it for ~3 seconds (it wobbles, the star dims, no lasers fire). This gives the player time to pass.
- There are 2-3 star monsters placed throughout the level.

### 3. Falling Hammers
- Hammers drop from the top of the screen at semi-random intervals in certain zones.
- A brief **warning shadow/indicator** appears on the ground before each hammer falls (kid-friendly telegraph).
- **If hit**: The player is **knocked/bounced backward** a short distance (not a life loss). This is more of an annoyance/setback than a punishment.
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
| Spacebar | Activate shield (blocks lasers) |
| Mouse Click | Click on Star Monster to stun it |

## HUD (Heads-Up Display)
- **Lives**: 3 flame icons (top-left). One extinguishes per life lost.
- **Shield cooldown**: Small circular indicator near the player or in the corner showing when shield is ready.

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
- **Fun over difficulty**: The game should feel beatable on the first or second try. Hammers knock you back but don't kill. Shield recharges fast. Monsters can be stunned easily.
- **Visually clear**: High contrast between player, hazards, and background. Big, readable shapes.
