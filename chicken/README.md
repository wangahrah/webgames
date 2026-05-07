# chicken

Logo for kids, with a chicken instead of a turtle. Single static page —
open `index.html` in a browser, no build, no server.

## Modes

- **Cluck** (live): Logo-flavored commands, one per line. Verbs come from
  `js/ops.js`; the cheat sheet in the editor pane is generated from that
  table so adding a verb auto-documents itself.
- **Python** (planned, phase 3): Skulpt-powered real Python with a `chicken`
  module exposing the same verbs.

## Architecture

Both modes compile to the same intermediate **command queue**. The Coop
(`js/coop.js`) plays it back animated, so the same renderer drives any
front-end.

```
  Cluck text  ──┐
                ├── [ {op, arg}, ... ] ── Coop renderer ── canvas
  Python text ──┘
```

## Running tests

Parser only — the renderer is verified by play.

```
node tests/cluck.test.js
```

## Smoke checklist (visual things tests don't catch)

After UI changes, open `index.html` and confirm:

- [ ] Default starter (a square) runs to completion
- [ ] Chicken emoji renders and rotates with `rt` / `lt`
- [ ] Trail draws as the chicken walks (and stops with `pu`)
- [ ] `clear` wipes the trail; chicken stays put (per design)
- [ ] `home` returns chicken to center facing east
- [ ] Compass needle tracks heading in real time
- [ ] Cheat sheet shows all verbs from `OPS`
- [ ] Stop button interrupts mid-run cleanly
- [ ] Ctrl+Enter runs from the editor
- [ ] Reload preserves edited code (localStorage)
- [ ] Typo error shows line number + "did you mean…"

## File layout

```
chicken/
├── index.html         page shell
├── style.css          two-pane layout, sticky-note cheat sheet
├── js/
│   ├── ops.js         verb table (single source of truth)
│   ├── cluck.js       Cluck-speak parser → command queue
│   ├── coop.js        canvas renderer, chicken sprite, compass, playback
│   └── app.js         wiring (buttons, localStorage, cheat sheet build)
└── tests/
    └── cluck.test.js  parser sanity checks
```
