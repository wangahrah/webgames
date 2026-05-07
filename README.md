# webgames

Browser games dreamed up by the kid, written by Marvin (with assistance from
Claude Code before that).

Each game lives in its own subdirectory and is fully self-contained — open
`index.html` in a browser and play. No build step, no dependencies, no
servers. The simplest deploy is "double-click the file."

## Games

- **bounceback/** — see `bounceback/concept.md` for the design.
- **through-maze/** — single-file maze game.

## Adding a new game

1. Make a new subdirectory: `mkdir mygame && cd mygame`
2. Write the game (typically a single `index.html`)
3. Optionally drop a `concept.md` next to it explaining the idea
4. Commit
