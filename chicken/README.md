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

Parser and storage. The renderer is verified by play.

```
node tests/cluck.test.js
node tests/saves.test.js
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
- [ ] `color red` / `color blue` / etc. tints subsequent trail
- [ ] `color rainbow` cycles hue per segment
- [ ] `speed slow` / `speed fast` visibly changes pace
- [ ] `lay` drops a 🥚 at the chicken's current spot
- [ ] `peck` bobs the chicken and leaves a small mark
- [ ] `cluck` plays a short sound (volume audible, not jarring)
- [ ] `color rd` shows "did you mean 'red'?" hint
- [ ] `say "hello"` shows a speech bubble above the chicken
- [ ] `say "broken` (unclosed) errors with line number
- [ ] Each Examples button (Square / Star / Flower / Rainbow) loads
      a program that runs cleanly

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
│   ├── ops.js         verb table (single source of truth)
│   ├── cluck.js       Cluck-speak parser → command queue
│   ├── coop.js        canvas renderer, chicken sprite, compass, playback
│   ├── saves.js       named-script storage (localStorage)
│   └── app.js         wiring (buttons, localStorage, cheat sheet build)
└── tests/
    ├── cluck.test.js  parser sanity checks
    └── saves.test.js  storage roundtrips, validation, resilience
```
