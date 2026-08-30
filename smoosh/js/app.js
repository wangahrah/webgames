// Wiring: level -> Engine state -> DOM, and the handful of buttons around it.
// All the rules live in engine.js; this file only decides what the kid sees.

(function () {
  const $ = (id) => document.getElementById(id);
  const benchEl = $('bench'), ringEl = $('ring'), burstEl = $('burst');
  const targetEl = $('target'), levelNameEl = $('level-name'), hintEl = $('hint-line');
  const statusEl = $('status');
  const winEl = $('win'), winStarsEl = $('win-stars'), winExprEl = $('win-expr');
  const puzzlesBtn = document.querySelector('.mode[data-mode="puzzles"]');
  const endlessBtn = document.querySelector('.mode[data-mode="endless"]');
  const puzzlePanel = $('puzzle-panel'), endlessPanel = $('endless-panel');

  // ---- session state ------------------------------------------------------
  //
  // `history` is a stack of whole Engine states. They are immutable, so undo is
  // a pop -- no replay, no inverse operations, nothing to get subtly wrong.

  const S = {
    level: null,
    state: null,
    history: [],
    picked: [],          // tile ids, in the order tapped: [left, right]
    peek: false,
    mode: 'puzzles',
    difficulty: 'medium',
    seed: 1,
    popped: null,        // the fused tile we have already animated
    celebrated: 0,       // best star count already celebrated for this attempt
  };

  // ---- loading a puzzle ---------------------------------------------------

  function load(level) {
    S.level = level;
    S.state = Engine.newState(level);
    S.history = [];
    S.picked = [];
    S.celebrated = 0;
    S.popped = null;
    winEl.hidden = true;
    hideRing();
    render();
    say('pick two tiles, then an operator');
  }

  function push(next) {
    S.history.push(S.state);
    S.state = next;
  }

  // ---- rendering ----------------------------------------------------------

  // Warmer as the number grows. Purely decorative, but it gives a running feel
  // for magnitude without anyone having to read the digits.
  function magClass(v) {
    const a = Math.abs(v);
    if (a < 10) return 'mag-0';
    if (a < 25) return 'mag-1';
    if (a < 60) return 'mag-2';
    if (a < 150) return 'mag-3';
    return 'mag-4';
  }

  function render() {
    const st = Engine.status(S.state);

    targetEl.textContent = Engine.goalText(S.state.goal);
    levelNameEl.textContent = S.level.name;
    hintEl.textContent = S.level.hint || '';

    // Stars. Chip 3 always names the twist, so the kid can aim at it from the
    // first move instead of discovering it after winning.
    chip('star-1', st.solved);
    chip('star-2', st.solved && st.usedAll);
    chip('star-3', st.solved && st.twistOk);
    document.querySelector('#star-3 .twist').textContent =
      Engine.twistText(S.state.twist) || 'no twist';

    // Tiles. Rebuilt wholesale -- a dozen nodes is nothing, and diffing DOM by
    // hand is how you end up with a stale expression under a fresh number.
    benchEl.innerHTML = '';
    for (const t of S.state.tiles) {
      const el = document.createElement('button');
      el.className = 'tile ' + magClass(t.v);
      if (t.v < 0) el.classList.add('neg');
      // Pop only the first time we draw a newly fused tile. render() runs on
      // every click, and re-triggering the animation because a tile happens to
      // still be the most recent one makes the board twitch under the kid.
      if (t.id === S.state.last && S.popped !== S.state.last) el.classList.add('fresh');
      if (st.solved && t.id === st.winnerId) el.classList.add('winner');
      const pick = S.picked.indexOf(t.id);
      if (pick >= 0) { el.classList.add('picked'); el.dataset.order = String(pick + 1); }
      el.dataset.id = t.id;

      const v = document.createElement('div');
      v.className = 'tile-value';
      v.textContent = String(t.v);
      el.appendChild(v);

      if (!t.leaf) {
        const e = document.createElement('div');
        e.className = 'tile-expr';
        e.textContent = t.expr;
        el.appendChild(e);
      }
      if (t.collar) {
        const c = document.createElement('div');
        c.className = 'collar';
        c.title = 'this tile can only be fused with ' + t.collar;
        c.textContent = t.collar;
        el.appendChild(c);
      }
      benchEl.appendChild(el);
    }

    S.popped = S.state.last;
    $('undo').disabled = S.history.length === 0;

    if (st.stuck) say('nothing left that works — press Undo and try another road', 'warn');
  }

  function chip(id, on) { $(id).classList.toggle('earned', !!on); }

  function say(msg, cls) {
    statusEl.textContent = msg;
    statusEl.className = cls || '';
  }

  // ---- picking tiles ------------------------------------------------------

  benchEl.addEventListener('click', (e) => {
    const el = e.target.closest('.tile');
    if (!el) { clearPick(); return; }
    const id = el.dataset.id;
    const at = S.picked.indexOf(id);
    if (at >= 0) { S.picked.splice(at, 1); }        // tap again to un-pick
    else if (S.picked.length < 2) { S.picked.push(id); }
    else { S.picked = [S.picked[1], id]; }          // third tap slides the pair along
    render();
    if (S.picked.length === 2) showRing(); else hideRing();
  });

  function clearPick() { S.picked = []; hideRing(); render(); }

  // ---- the operator ring --------------------------------------------------
  //
  // PEEK IS OFF BY DEFAULT AND THAT IS THE WHOLE GAME. With the results
  // showing, the kid reads four answers and picks one; with them hidden, the
  // kid has to work out four answers to choose between them. The button is
  // there for anyone who needs the ramp, not as a convenience.

  function showRing() {
    const [aId, bId] = S.picked;
    const opts = Engine.optionsFor(S.state, aId, bId);
    for (const o of opts) {
      const btn = ringEl.querySelector('.op[data-op="' + o.op + '"]');
      btn.disabled = !o.ok;
      btn.title = o.ok ? '' : reasonText(o.why, o.op);
      btn.classList.toggle('wide', S.peek && o.ok);
      btn.innerHTML = '';
      const glyph = document.createElement('span');
      glyph.textContent = o.op === '-' ? '−' : o.op;
      btn.appendChild(glyph);
      if (S.peek && o.ok) {
        const p = document.createElement('span');
        p.className = 'peek';
        p.textContent = String(o.v);
        btn.appendChild(p);
      }
    }
    ringEl.hidden = false;
    placeRing();
  }

  function reasonText(why, op) {
    if (why === 'collar') return 'a collared tile only fuses with its own operator';
    if (why === 'not exact') return 'that division would not come out even';
    if (why === 'goes negative') return 'this puzzle does not allow numbers below zero';
    return 'not allowed here';
  }

  // Horizontally between the two chosen tiles, vertically BELOW them. Centring
  // it on the midpoint puts it straight over the two numbers the kid is trying
  // to do arithmetic on, which is the one place it must never be. Flips above
  // the pair when there is no room underneath.
  function placeRing() {
    const wrap = benchEl.parentElement.getBoundingClientRect();
    const els = S.picked
      .map((id) => benchEl.querySelector('.tile[data-id="' + id + '"]'))
      .filter(Boolean);
    if (els.length < 2) return;
    const r = els.map((el) => el.getBoundingClientRect());
    const half = ringEl.offsetHeight / 2 || 34;
    let x = (r[0].left + r[0].width / 2 + r[1].left + r[1].width / 2) / 2 - wrap.left;
    const below = Math.max(r[0].bottom, r[1].bottom) - wrap.top + half + 14;
    const above = Math.min(r[0].top, r[1].top) - wrap.top - half - 14;
    let y = (below + half <= wrap.height) ? below : above;
    const padX = ringEl.offsetWidth / 2 + 8 || 130;
    x = Math.max(padX, Math.min(wrap.width - padX, x));
    y = Math.max(half + 4, Math.min(wrap.height - half - 4, y));
    ringEl.style.left = x + 'px';
    ringEl.style.top = y + 'px';
  }

  function hideRing() { ringEl.hidden = true; }

  ringEl.addEventListener('click', (e) => {
    const swap = e.target.closest('#swap');
    if (swap) { S.picked.reverse(); render(); showRing(); return; }
    const btn = e.target.closest('.op');
    if (!btn || btn.disabled) return;
    doMerge(btn.dataset.op);
  });

  function doMerge(op) {
    if (S.picked.length !== 2) return;
    const [aId, bId] = S.picked;
    const next = Engine.merge(S.state, aId, bId, op);
    if (!next) { say(reasonText(Engine.legal(S.state, aId, bId, op).why, op), 'warn'); return; }
    push(next);
    S.picked = [];
    hideRing();
    render();
    checkWin();
  }

  // ---- winning ------------------------------------------------------------
  //
  // The overlay only interrupts when the kid has just BEATEN their best score
  // for this attempt. Hitting the target with tiles left over pops it once at
  // one star; going back for the rest pops it again at three. Re-winning the
  // same score in silence keeps experimentation cheap.

  function checkWin() {
    const st = Engine.status(S.state);
    if (!st.solved) return;
    if (!S.level.generated) Saves.record(S.level.id, st.stars);
    if (st.stars <= S.celebrated) return;
    S.celebrated = st.stars;

    winStarsEl.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const s = document.createElement('span');
      s.textContent = '★';
      if (i >= st.stars) s.className = 'off';
      winStarsEl.appendChild(s);
    }
    const winner = S.state.tiles.find((t) => t.id === st.winnerId);
    winExprEl.textContent = winner ? winner.expr + '  =  ' + winner.v : '';
    $('win-again').hidden = st.stars === 3;
    winEl.hidden = false;
    confetti(st.stars);
    say(st.stars === 3 ? 'three stars. Nothing left to squeeze out of that one.' : 'solved — but there are stars left on the table', 'good');
  }

  function confetti(n) {
    burstEl.hidden = false;
    burstEl.innerHTML = '';
    const colors = ['#7c4dff', '#f9a825', '#26c6da', '#ef5350', '#66bb6a'];
    for (let i = 0; i < 24 * n; i++) {
      const d = document.createElement('div');
      d.className = 'confetti';
      d.style.left = (10 + Math.random() * 80) + '%';
      d.style.top = '-2rem';
      d.style.background = colors[i % colors.length];
      d.style.setProperty('--dx', (Math.random() * 200 - 100) + 'px');
      d.style.animationDelay = (Math.random() * 0.4) + 's';
      burstEl.appendChild(d);
    }
    setTimeout(() => { burstEl.hidden = true; burstEl.innerHTML = ''; }, 2200);
  }

  // ---- buttons ------------------------------------------------------------

  $('undo').addEventListener('click', undo);
  function undo() {
    if (!S.history.length) return;
    S.state = S.history.pop();
    S.picked = [];
    hideRing();
    winEl.hidden = true;
    render();
    say('undone. Nothing is ever wasted here.');
  }

  $('restart').addEventListener('click', () => load(S.level));

  $('peek').addEventListener('click', () => {
    S.peek = !S.peek;
    $('peek').setAttribute('aria-pressed', String(S.peek));
    if (S.picked.length === 2) showRing();
    say(S.peek ? 'peek on — the ring shows what each operator would make'
               : 'peek off — work it out first, then pick');
  });

  // The hint is one move, never the chain. Telling a kid the whole solution
  // ends the puzzle; telling them where to start ends the stuck.
  $('hint').addEventListener('click', () => {
    const sol = Engine.solve(S.state, { useAll: true, twist: true, budget: 600000 })
             || Engine.solve(S.state, { useAll: true, budget: 600000 })
             || Engine.solve(S.state, { budget: 600000 });
    if (!sol || !sol.length) { say('no way home from here — try Undo', 'warn'); return; }
    const m = sol[0];
    say('try ' + m.a + ' ' + Engine.opGlyph(m.op) + ' ' + m.b + ' … the rest is yours');
  });

  $('win-again').addEventListener('click', () => { winEl.hidden = true; });
  $('win-next').addEventListener('click', nextPuzzle);

  function nextPuzzle() {
    winEl.hidden = true;
    if (S.mode === 'endless') { S.seed = (S.seed + 1) >>> 0; load(Gen.puzzle(S.difficulty, S.seed)); return; }
    const i = Levels.LEVELS.findIndex((l) => l.id === S.level.id);
    const next = Levels.LEVELS[i + 1];
    if (next) load(next);
    else { say('that was the last hand-made one. Endless is that way →', 'good'); openPanel(endlessPanel, endlessBtn); }
  }

  // ---- mode + pickers -----------------------------------------------------

  function anchorPopover(panel, btn) {
    // Chicken learned this one the hard way: a popover pinned to left:1rem
    // opens on the far side of the header from the button that summoned it.
    const header = btn.closest('header').getBoundingClientRect();
    const b = btn.getBoundingClientRect();
    panel.style.left = Math.max(8, Math.min(b.left - header.left, header.width - panel.offsetWidth - 8)) + 'px';
  }

  function openPanel(panel, btn) {
    closePanels();
    panel.hidden = false;
    anchorPopover(panel, btn);
    btn.setAttribute('aria-expanded', 'true');
  }

  function closePanels() {
    for (const [p, b] of [[puzzlePanel, puzzlesBtn], [endlessPanel, endlessBtn]]) {
      p.hidden = true;
      b.setAttribute('aria-expanded', 'false');
    }
  }

  puzzlesBtn.addEventListener('click', () => {
    if (!puzzlePanel.hidden) { closePanels(); return; }
    renderPuzzleList();
    openPanel(puzzlePanel, puzzlesBtn);
  });

  endlessBtn.addEventListener('click', () => {
    if (!endlessPanel.hidden) { closePanels(); return; }
    openPanel(endlessPanel, endlessBtn);
  });

  function setMode(mode) {
    S.mode = mode;
    puzzlesBtn.classList.toggle('active', mode === 'puzzles');
    endlessBtn.classList.toggle('active', mode === 'endless');
  }

  function renderPuzzleList() {
    const list = $('puzzle-list');
    list.innerHTML = '';
    for (const l of Levels.LEVELS) {
      const got = Saves.starsFor(l.id);
      const row = document.createElement('button');
      row.className = 'puzzle-row' + (S.level && S.level.id === l.id ? ' current' : '');
      const name = document.createElement('span');
      name.className = 'puzzle-name';
      name.textContent = l.name;
      const stars = document.createElement('span');
      stars.className = 'puzzle-stars';
      stars.innerHTML = '';
      for (let i = 0; i < 3; i++) {
        const s = document.createElement('span');
        s.textContent = '★';
        if (i < got) s.className = 'on';
        stars.appendChild(s);
      }
      row.appendChild(name); row.appendChild(stars);
      row.addEventListener('click', () => { setMode('puzzles'); closePanels(); load(l); });
      list.appendChild(row);
    }
  }

  endlessPanel.addEventListener('click', (e) => {
    const b = e.target.closest('.endless-pick');
    if (!b) return;
    S.difficulty = b.dataset.difficulty;
    S.seed = (Math.floor(Math.random() * 1e9)) >>> 0;
    setMode('endless');
    closePanels();
    const p = Gen.puzzle(S.difficulty, S.seed);
    if (p) load(p); else say('the generator gave up. Try again.', 'warn');
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('.popover') || e.target.closest('.mode')) return;
    closePanels();
  });

  // ---- keyboard -----------------------------------------------------------

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); return; }
    if (e.key === 'Escape') { clearPick(); closePanels(); winEl.hidden = true; return; }
    if (S.picked.length !== 2) return;
    const map = { '+': '+', '-': '-', '*': '×', 'x': '×', '/': '÷' };
    const op = map[e.key];
    if (op) { e.preventDefault(); doMerge(op); }
  });

  window.addEventListener('resize', () => { if (!ringEl.hidden) placeRing(); });

  // ---- go -----------------------------------------------------------------
  //
  // Open on the first level that is not yet three-starred, so a returning kid
  // lands on their edge instead of on level one.

  const firstUnfinished = Levels.LEVELS.find((l) => Saves.starsFor(l.id) < 3) || Levels.LEVELS[0];
  setMode('puzzles');
  load(firstUnfinished);
})();
