# smoosh — concept

A math puzzle game for a ten-year-old who is sick of `a + b = ?`.

## The problem

Kids who can do the operations perfectly well still stall on a page of
isolated sums. Not because the arithmetic is hard — because *being asked
arithmetic* is boring, and boredom reads as difficulty. The same kid will do
twelve multiplications without complaint while working out how to hit a
target, because they are not thinking about multiplication at all. They are
thinking about the target.

So: never ask a math question. Ask a puzzle question that cannot be answered
without doing math.

## What the research says

The kid-tested designs that survive — **24**, **KenKen**, **Mathler** — all
share the same trait, and it is not a theme or a reward loop:

- **Arithmetic is the means, never the goal.** You are trying to make 24. The
  six multiplications you did on the way are invisible to you.
- **Low floor, high ceiling.** Many solutions, many strategies. A puzzle with
  one blessed path is a worksheet in costume.
- **No timers.** Timed drill is the best-documented way to manufacture math
  anxiety. Struggle only stays productive with slack in it.
- **Undo must be free.** A wrong branch that costs nothing is a branch a kid
  will actually try. That trying is the practice.
- **The choice is where the practice hides.** Given four operators to pick
  between, you evaluate all four. That is four computations per move, none of
  which feels like a question.

## The mechanic

Number tiles on a bench. Pick two, pick an operator, they fuse into one tile
holding the result. Hit the target.

That is all of it. Everything else is a knob on that one idea:

- **Division must come out even.** No fractions, and the greyed-out ÷ button
  quietly teaches divisibility.
- **No negatives** unless a level says so, for the same reason.
- **Collared tiles** may only ever be fused with one operator, which forces a
  shape onto the solution without narrowing it to a single path.
- **Every tile shows the expression it came from**, correctly bracketed —
  `(6 + 4) × 3`. Order of operations, shown rather than taught. This is the
  bit aimed squarely at "they do fine when they aren't thinking about it."

## Three stars

Deliberately the same shape as chicken's quest mode, so a kid who knows one
game already knows how this one is scored:

1. **make it** — hit the target, however you like. The low floor.
2. **use every tile** — nothing left over.
3. **the twist** — a per-level extra rule: no minus, use a divide, never go
   over 100, finish on a divide, every step bigger than the last.

Stars 2 and 3 are what make the design earn its keep. They send the kid back
through the *same numbers* by a different road, which is more arithmetic per
minute than any amount of fresh puzzles, and it never once looks like
repetition.

## The valley

A good mechanic in a list of levels is a worksheet with better manners. The
puzzles were never the problem; having no reason to do the next one was.

So: **Mossway Valley**, a place gone quiet and overgrown that you open back up
one puzzle at a time. A gate wants 12. A bird wants 14 berries. A sunken
stepping stone wants 12 to come back up, and under it is the first tool. The
arithmetic did not change at all — what changed is that the answer now buys
something, and the map behind you fills in.

Three things this buys that a level list does not:

- **A reason to do the next one.** The next place is visibly there, greyed, with
  a name you cannot read yet.
- **A reason to go back for stars 2 and 3.** Region gates open on a star TOTAL,
  never on any single place. Playing well opens the valley sooner; playing
  badly still lets you walk on. Nothing is ever a wall.
- **Somewhere for a new mechanic to come from.** A rule that arrives as a
  paragraph of instructions is homework. The same rule arriving as a pair of
  shears you found in a drowned toolshed is a present.

Four regions, twenty places, one new idea per region, each introduced on its own
and then compounded: the fuse alone, then vine-bound seeds, then gates with two
locks and a tool that halves, then a stretch of old stone where numbers may go
below zero and everything is asked for at once. The shape is stolen wholesale
from chicken's twenty-level curriculum, which worked.

## Two modes

- **Valley** — the quest above. Every target is chosen from the intersection of
  "reachable by some subset" (so star 1 is easy) and "reachable using every tile
  with the twist held" (so stars 2 and 3 are live). Both halves are checked by
  brute force in the test suite.
- **Endless** — generated, three difficulties, built backwards from the answer
  so it is impossible to deal an unsolvable board. Deliberately outside the
  story: no stars are recorded, and nothing is at stake.

## Deliberately absent

- No timer, no lives, no streak, no daily loss condition.
- No score beyond the stars.
- No sound yet (flapjack has the pattern if we want it).
- **Peek is off by default.** With the results showing on the operator ring,
  a kid reads four answers and picks one. With them hidden, they have to work
  out four answers to choose between them. The toggle exists as a ramp for
  anyone who needs it, not as a convenience.
