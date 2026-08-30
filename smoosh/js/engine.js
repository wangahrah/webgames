// smoosh core: board state, legal merges, expression building, scoring, and a
// brute-force solver. No DOM, no canvas, no browser APIs -- everything here is
// a plain function over plain objects so tests/ can run it in Node and so the
// renderer stays a dumb view over this state.
//
// THE ONE IDEA: a move takes two tiles and an operator and gives back one
// tile. The arithmetic is never the goal, it is the cost of moving. That is
// the whole pedagogy; everything below is bookkeeping.

var Engine = (function () {
  const OPS = ['+', '-', '×', '÷'];   // + - x /
  const PREC = { '+': 1, '-': 1, '×': 2, '÷': 2 };

  // ---- arithmetic -----------------------------------------------------------
  //
  // Returns the value, or null if this operation is not allowed here. Illegal
  // is a first-class answer: the UI greys the button out, which is how a kid
  // discovers divisibility without anybody saying the word.

  function apply(a, b, op, opts) {
    const neg = !!(opts && opts.neg);
    switch (op) {
      case '+': return a + b;
      case '-': {
        const v = a - b;
        return (v < 0 && !neg) ? null : v;
      }
      case '×': return a * b;
      case '÷': {
        if (b === 0) return null;
        if (a % b !== 0) return null;         // exact division only -- no fractions
        return a / b;
      }
      default: return null;
    }
  }

  // ---- expressions ----------------------------------------------------------
  //
  // Each tile remembers how it was built, correctly parenthesized, so the kid
  // can read (6 x 4) + 3 under the 27. Order of operations shown, not taught.
  //
  // A child needs brackets when its own operator binds more loosely than the
  // one about to be applied. The right-hand child additionally needs them at
  // EQUAL precedence under - and /, because those are not associative:
  // 10 - (3 - 1) is not 10 - 3 - 1.

  function combineExpr(left, right, op) {
    const p = PREC[op];
    const l = left.prec > 0 && left.prec < p ? '(' + left.expr + ')' : left.expr;
    const rNeedsWrap = right.prec > 0 &&
      (right.prec < p || (right.prec === p && (op === '-' || op === '÷')));
    const r = rNeedsWrap ? '(' + right.expr + ')' : right.expr;
    return { expr: l + ' ' + op + ' ' + r, prec: p };
  }

  // ---- state ----------------------------------------------------------------
  //
  // A level (see levels.js) is data; newState turns it into something playable.
  // States are treated as immutable: every merge returns a fresh one, which is
  // what makes undo a one-line array pop instead of a replay engine.

  function newState(level) {
    let n = 0;
    const tiles = level.tiles.map((t) => {
      const spec = (typeof t === 'number') ? { v: t } : t;
      return {
        id: 't' + (n++),
        v: spec.v,
        expr: String(spec.v),
        prec: 0,                 // 0 = a bare number, never needs brackets
        collar: spec.collar || null,
        leaf: true,
      };
    });
    return {
      tiles,
      goal: level.goal,
      goals: level.goals || null, // two-lock gates; see goalsOf() below
      par: level.par,
      neg: !!level.neg,
      shears: level.shears || 0,  // how many halvings this level grants
      twist: level.twist || null,
      moves: 0,
      log: [],                  // every FUSE made, in order -- the twist judges this
      cuts: [],                 // every halving made; deliberately not in log
      last: null,               // id of the tile the most recent move produced
    };
  }

  function tileById(state, id) {
    return state.tiles.find((t) => t.id === id) || null;
  }

  // Why a merge is or is not allowed. Returns {ok:false, why} rather than
  // throwing, because the UI wants to render the reason on the button.
  function legal(state, aId, bId, op) {
    if (aId === bId) return { ok: false, why: 'same tile' };
    const a = tileById(state, aId), b = tileById(state, bId);
    if (!a || !b) return { ok: false, why: 'gone' };
    // A collared tile can only be consumed by its own operator. Both sides are
    // checked -- the collar is a property of the tile, not of a position.
    if (a.collar && a.collar !== op) return { ok: false, why: 'collar' };
    if (b.collar && b.collar !== op) return { ok: false, why: 'collar' };
    const v = apply(a.v, b.v, op, { neg: state.neg });
    if (v === null) {
      return { ok: false, why: op === '÷' ? 'not exact' : 'goes negative' };
    }
    return { ok: true, v };
  }

  function merge(state, aId, bId, op) {
    const check = legal(state, aId, bId, op);
    if (!check.ok) return null;
    const a = tileById(state, aId), b = tileById(state, bId);
    const e = combineExpr(a, b, op);
    const fused = {
      id: 'm' + state.moves + '_' + a.id + b.id,
      v: check.v,
      expr: e.expr,
      prec: e.prec,
      collar: null,             // fusing burns the collar off both halves
      leaf: false,
    };
    // The fused tile takes the left operand's slot, so the bench does not
    // reshuffle under the kid's fingers between moves.
    const tiles = [];
    for (const t of state.tiles) {
      if (t.id === aId) tiles.push(fused);
      else if (t.id === bId) continue;
      else tiles.push(t);
    }
    const log = state.log.concat([{ a: a.v, b: b.v, op, v: fused.v }]);
    return Object.assign({}, state,
      { tiles, log, moves: state.moves + 1, last: fused.id });
  }

  // ---- goals ----------------------------------------------------------------
  //
  // A goal is data so a level can ask for a range ("anything over 100") as
  // easily as an exact number, without the renderer learning a second shape.

  function goalHit(goal, v) {
    if (!goal) return false;
    if (goal.value !== undefined) return v === goal.value;
    if (goal.atLeast !== undefined && v < goal.atLeast) return false;
    if (goal.atMost !== undefined && v > goal.atMost) return false;
    return goal.atLeast !== undefined || goal.atMost !== undefined;
  }

  function goalText(goal) {
    if (!goal) return '?';
    if (goal.value !== undefined) return String(goal.value);
    if (goal.atLeast !== undefined && goal.atMost !== undefined) {
      return goal.atLeast + '–' + goal.atMost;
    }
    if (goal.atLeast !== undefined) return '≥ ' + goal.atLeast;
    return '≤ ' + goal.atMost;
  }

  // A gate may carry more than one lock: goals: [{value:12},{value:20}] means
  // two tiles must show those numbers AT THE SAME TIME, which turns the board
  // from "converge on one number" into "keep two plates spinning" without a
  // single new rule about arithmetic. `goal` stays the one-lock shorthand, and
  // everything downstream reads through goalsOf(), so the old single-goal path
  // is literally the new path with a list of one.
  function goalsOf(state) {
    if (state.goals && state.goals.length) return state.goals;
    return state.goal ? [state.goal] : [];
  }

  // Can every lock be satisfied by a DIFFERENT tile? Greedy matching is wrong
  // here: with two locks, a tile that fits both can be claimed by the one that
  // had another option, and the board reads as unsolved while a solution is
  // sitting on it. So walk the assignments. Returns the winning tile ids in
  // goal order, or null.
  function matchGoals(goals, tiles, used) {
    if (!goals.length) return [];
    const u = used || new Set();
    const g = goals[0], rest = goals.slice(1);
    for (const t of tiles) {
      if (u.has(t.id) || !goalHit(g, t.v)) continue;
      u.add(t.id);
      const tail = matchGoals(rest, tiles, u);
      if (tail) return [t.id].concat(tail);
      u.delete(t.id);
    }
    return null;
  }

  function goalsText(state) {
    return goalsOf(state).map(goalText).join('  &  ') || '?';
  }

  // ---- the Sap Shears -------------------------------------------------------
  //
  // Cut one seed cleanly in half. Halving, and not "split into any a + b", and
  // that is deliberate twice over. It is ONE option per tile instead of dozens,
  // so the solver can still walk a board exhaustively -- which is the thing
  // that proves every authored level winnable. And a greyed-out shears teaches
  // evenness exactly the way the greyed-out divide already teaches
  // divisibility: by refusing, silently, at the moment it matters.
  //
  // Cuts are recorded in state.cuts, NOT in state.log. Twists are a vocabulary
  // about operators -- "no minus", "finish on a divide", "every step bigger" --
  // and quietly feeding them a move that has no operator is how you get a
  // `grow` twist that can never be met for reasons nobody can see on screen.

  function canSplit(state, id) {
    if (!state.shears || state.shears < 1) return { ok: false, why: 'no shears' };
    const t = tileById(state, id);
    if (!t) return { ok: false, why: 'gone' };
    if (t.collar) return { ok: false, why: 'collar' };   // vines hold the seed shut
    if (t.v === 0 || t.v % 2 !== 0) return { ok: false, why: 'not even' };
    return { ok: true, v: t.v / 2 };
  }

  // A cut seed forgets its expression. Two halves of 24 are two 12s, not two
  // copies of the sum that made it -- claiming otherwise would print an
  // expression that does not evaluate to the number above it.
  function split(state, id) {
    const check = canSplit(state, id);
    if (!check.ok) return null;
    const from = tileById(state, id).v;
    const half = check.v;
    const mk = (side) => ({
      id: 'c' + state.moves + '_' + id + '_' + side,
      v: half, expr: String(half), prec: 0, collar: null, leaf: true,
    });
    const a = mk('a'), b = mk('b');
    const tiles = [];
    for (const t of state.tiles) {
      if (t.id === id) { tiles.push(a); tiles.push(b); }
      else tiles.push(t);
    }
    return Object.assign({}, state, {
      tiles,
      shears: state.shears - 1,
      cuts: (state.cuts || []).concat([{ from, to: half }]),
      moves: state.moves + 1,
      last: a.id,
    });
  }

  // ---- status + scoring -----------------------------------------------------
  //
  // Three stars, the same shape as chicken's quest mode:
  //   1. make the target at all       -- the low floor
  //   2. with nothing left over       -- every tile spent
  //   3. the level's TWIST            -- the ceiling
  //
  // Why a twist and not "par moves": in this mechanic a move always eats
  // exactly one tile, so move count is just (tiles used - 1). "Fewer moves"
  // would literally mean "use fewer tiles", which fights star 2 instead of
  // extending it. A twist is a named extra rule -- ban an operator, cap how
  // big you may go, land the last move on a divide -- and it makes the kid
  // walk the SAME numbers by a different road. That re-walk is the cheapest
  // fluency in the whole design, and it is why every level has one.
  //
  // Stars 2 and 3 are bonuses, never gates: solving badly still wins, and the
  // level stays put so the kid can undo and hunt the rest.

  // Each twist is a predicate over the move log plus the final tiles.
  const TWISTS = {
    // use `op` at least `times` times
    mustUse: (t, log) => log.filter((m) => m.op === t.op).length >= (t.times || 1),
    // never use `op` at all
    banOp:   (t, log) => log.every((m) => m.op !== t.op),
    // no number you ever make may exceed n
    cap:     (t, log) => log.every((m) => m.v <= t.n),
    // the winning move must be this operator
    endWith: (t, log) => log.length > 0 && log[log.length - 1].op === t.op,
    // every move must make a number bigger than both its parts
    grow:    (t, log) => log.every((m) => m.v > m.a && m.v > m.b),
  };

  // The ASCII hyphen is not a minus sign; on a tile the size of a kid's palm
  // the difference is the whole readability of the rule.
  function opGlyph(op) { return op === '-' ? '−' : op; }

  function twistText(twist) {
    if (!twist) return '';
    switch (twist.kind) {
      case 'mustUse': return 'use ' + opGlyph(twist.op) + (twist.times > 1 ? ' ' + twist.times + ' times' : '');
      case 'banOp':   return 'no ' + opGlyph(twist.op) + ' at all';
      case 'cap':     return 'never go over ' + twist.n;
      case 'endWith': return 'finish with a ' + opGlyph(twist.op);
      case 'grow':    return 'every step gets bigger';
      default:        return '';
    }
  }

  function twistMet(twist, log) {
    if (!twist) return false;
    const fn = TWISTS[twist.kind];
    return fn ? !!fn(twist, log) : false;
  }

  function status(state) {
    const goals = goalsOf(state);
    const winners = goals.length ? matchGoals(goals, state.tiles) : null;
    const solved = !!winners;
    // "Nothing left over" means one tile per lock, not one tile full stop --
    // a two-lock gate cannot be satisfied by a board of one.
    const usedAll = state.tiles.length === Math.max(1, goals.length);
    const twistOk = twistMet(state.twist, state.log);
    let stars = 0;
    if (solved) {
      stars = 1;
      if (usedAll) stars++;
      if (twistOk) stars++;
    }
    return {
      solved,
      winnerId: solved ? winners[0] : null,
      winnerIds: solved ? winners : [],
      stars,
      usedAll,
      twistOk,
      stuck: !solved && !anyMoveLeft(state),
    };
  }

  // "Stuck" is not a loss -- there is no loss. It just means every remaining
  // pairing is illegal, and the honest thing is to say so and point at Undo.
  function anyMoveLeft(state) {
    // A pair of shears is a move even on a board of one.
    if (state.shears > 0 && state.tiles.some((t) => canSplit(state, t.id).ok)) return true;
    if (state.tiles.length < 2) return false;
    for (let i = 0; i < state.tiles.length; i++) {
      for (let j = 0; j < state.tiles.length; j++) {
        if (i === j) continue;
        for (const op of OPS) {
          if (legal(state, state.tiles[i].id, state.tiles[j].id, op).ok) return true;
        }
      }
    }
    return false;
  }

  // Which of the four operators are live for this ordered pair, for the ring.
  function optionsFor(state, aId, bId) {
    return OPS.map((op) => {
      const r = legal(state, aId, bId, op);
      return { op, ok: r.ok, v: r.ok ? r.v : null, why: r.why || null };
    });
  }

  // ---- solver ---------------------------------------------------------------
  //
  // Exhaustive over (pair, order, operator). With <= 6 tiles the space is
  // small enough to walk outright, which buys two things: the tests can prove
  // every authored level is winnable in par using every tile, and the game can
  // offer a first-move hint without anybody hand-authoring one.
  //
  // Returns the shortest move list found, or null. `useAll` demands the board
  // end on a single tile (star 2); `twist` demands the level's extra rule hold
  // (star 3). Ask for both and the solver proves three stars are reachable,
  // which is exactly what tests/levels.test.js asks of every authored level.

  function solve(state, opts) {
    const o = opts || {};
    const useAll = !!o.useAll;
    const wantTwist = !!o.twist;
    const budget = o.budget || 400000;
    let spent = 0;
    let best = null;
    const seen = new Set();

    // The memo key must carry the shears too. Two boards showing the same
    // numbers are not interchangeable if one has already spent its cut -- the
    // same trap the twist memo fell into, one field along.
    function key(s) {
      return s.tiles.map((t) => t.v + (t.collar || '')).sort().join(',') +
             '#' + (s.shears || 0);
    }

    function walk(s, path) {
      if (spent++ > budget) return;
      if (best && path.length >= best.length) return;
      const st = status(s);
      if (st.solved && (!useAll || st.usedAll) && (!wantTwist || st.twistOk)) {
        best = path.slice();
        return;
      }
      // Memo only when the goal depends on the tiles alone. A twist judges the
      // move LOG, so two boards with identical tiles are not interchangeable
      // once a twist is in play -- one may have spent the banned operator and
      // the other not. Skipping the memo there costs a few milliseconds at
      // these board sizes and is the difference between "no solution" and the
      // truth.
      if (!wantTwist) {
        const k = key(s) + '|' + path.length;
        if (seen.has(k)) return;
        seen.add(k);
      }
      // Cuts come first, and before the two-tile guard: a lone tile can still
      // be halved into a pair worth fusing.
      if (s.shears > 0) {
        for (const t of s.tiles) {
          const next = split(s, t.id);
          if (!next) continue;
          path.push({ cut: t.v, v: t.v / 2 });
          walk(next, path);
          path.pop();
        }
      }
      if (s.tiles.length < 2) return;
      for (let i = 0; i < s.tiles.length; i++) {
        for (let j = 0; j < s.tiles.length; j++) {
          if (i === j) continue;
          const a = s.tiles[i], b = s.tiles[j];
          // + and x are commutative: only walk one order of each pair.
          for (const op of OPS) {
            if ((op === '+' || op === '×') && j < i) continue;
            const next = merge(s, a.id, b.id, op);
            if (!next) continue;
            path.push(next.log[next.log.length - 1]);
            walk(next, path);
            path.pop();
          }
        }
      }
    }

    walk(state, []);
    return best;
  }

  return {
    OPS, PREC,
    apply, combineExpr,
    newState, tileById, legal, merge,
    canSplit, split,
    goalHit, goalText, goalsOf, goalsText, matchGoals,
    TWISTS, twistText, twistMet, opGlyph,
    status, anyMoveLeft, optionsFor,
    solve,
  };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
