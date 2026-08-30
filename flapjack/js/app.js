// Wiring: screens, input, fixed-timestep game loop, autopilot attract demo.
// Loaded last; expects FlapjackThemes / FlapjackEngine / FlapjackRender /
// FlapjackAudio / FlapjackScores to already be on window.
(function () {
  'use strict';

  var T = window.FlapjackThemes;
  var E = window.FlapjackEngine;
  var R = window.FlapjackRender;
  var A = window.FlapjackAudio;
  var S = window.FlapjackScores;

  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var stage = document.getElementById('stage');
  var backdrop = document.getElementById('backdrop');
  var hud = document.getElementById('hud');
  var scoreEl = document.getElementById('score');
  var heartsEl = document.getElementById('hearts');
  var hintEl = document.getElementById('hint');
  var screenTitle = document.getElementById('screen-title');
  var screenPaused = document.getElementById('screen-paused');
  var screenGameover = document.getElementById('screen-gameover');
  var themeEmojiEl = document.getElementById('theme-emoji');
  var themeNameEl = document.getElementById('theme-name');
  var pillsEl = document.getElementById('pills');
  var bestLineEl = document.getElementById('best-line');
  var bannerEl = document.getElementById('banner');
  var popupsEl = document.getElementById('popups');
  var goTitle = document.getElementById('go-title');
  var goMedal = document.getElementById('go-medal');
  var goScore = document.getElementById('go-score');
  var goBest = document.getElementById('go-best');
  var muteBtn = document.getElementById('btn-mute');

  var STEP = 1 / 60;
  var ATTRACT_SCROLL = 70;
  var ratio = 1;

  var screen = 'title';              // title | playing | paused | gameover
  var runPhase = 'ready';            // ready | flying | dying
  var themeId = 'unicorn';
  var diffId = 'easy';
  var world = null;
  var attract = null;
  var attractResetTimer = 0;
  var particles = [];
  var time = 0;
  var shake = 0;
  var tint = 0;
  var dieT = 0;
  var lastTime = 0;
  var acc = 0;

  function theme() {
    return T.THEMES.find(function (t) { return t.id === themeId; });
  }
  function diff() {
    return T.DIFFICULTIES.find(function (d) { return d.id === diffId; });
  }

  // ---- resize / responsive canvas -----------------------------------------

  function resize() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var scale = Math.min(vh / E.HEIGHT, vw / E.WIDTH);
    var cw = E.WIDTH * scale, ch = E.HEIGHT * scale;
    ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(E.WIDTH * ratio);
    canvas.height = Math.round(E.HEIGHT * ratio);
    canvas.style.width = cw + 'px';
    canvas.style.height = ch + 'px';
    stage.style.width = cw + 'px';
    stage.style.height = ch + 'px';
    stage.style.left = ((vw - cw) / 2) + 'px';
    stage.style.top = ((vh - ch) / 2) + 'px';
    stage.style.fontSize = (16 * scale) + 'px';
  }

  function applyBackdrop() {
    var sky = theme().sky;
    var g = 'linear-gradient(to bottom, ' + sky.join(', ') + ')';
    backdrop.style.background = g;
  }

  // ---- themes + difficulty UI ---------------------------------------------

  function selectTheme(id, persist) {
    themeId = id;
    if (persist) S.setTheme(id);
    themeEmojiEl.textContent = theme().emoji;
    themeNameEl.textContent = theme().name;
    applyBackdrop();
    updateBestLine();
    makeAttract();
  }

  function selectDifficulty(id, persist) {
    diffId = id;
    if (persist) S.setDifficulty(id);
    for (var i = 0; i < pillsEl.children.length; i++) {
      pillsEl.children[i].classList.toggle('selected', pillsEl.children[i].dataset.id === id);
    }
    updateBestLine();
    makeAttract();
  }

  function buildPills() {
    pillsEl.innerHTML = '';
    T.DIFFICULTIES.forEach(function (d) {
      var b = document.createElement('button');
      b.className = 'pill';
      b.dataset.id = d.id;
      b.textContent = d.emoji + ' ' + d.name;
      b.addEventListener('click', function () {
        A.resume();
        selectDifficulty(d.id, true);
      });
      pillsEl.appendChild(b);
    });
  }

  function updateBestLine() {
    bestLineEl.textContent = 'Best: ' + S.best(themeId, diffId);
  }

  function cycleTheme(dir) {
    var idx = T.THEMES.findIndex(function (t) { return t.id === themeId; });
    idx = (idx + dir + T.THEMES.length) % T.THEMES.length;
    selectTheme(T.THEMES[idx].id, true);
  }

  // ---- mute ----------------------------------------------------------------

  function renderMute() {
    muteBtn.textContent = S.getMuted() ? '🔇' : '🔊';
  }
  muteBtn.addEventListener('click', function () {
    A.resume();
    S.setMuted(!S.getMuted());
    renderMute();
  });

  // ---- screens -------------------------------------------------------------

  function showScreen(name) {
    screenTitle.classList.add('hidden');
    screenPaused.classList.add('hidden');
    screenGameover.classList.add('hidden');
    if (name === 'title') screenTitle.classList.remove('hidden');
    if (name === 'paused') screenPaused.classList.remove('hidden');
    if (name === 'gameover') screenGameover.classList.remove('hidden');
  }

  // ---- particles -----------------------------------------------------------

  function spawnParticle(p) {
    if (particles.length > 220) particles.shift();
    p.age = 0;
    p.phase = Math.random() * 6.2832;
    particles.push(p);
  }

  function spawnPuff(x, y) {
    for (var i = 0; i < 8; i++) {
      var a = Math.random() * 6.2832;
      var sp = 30 + Math.random() * 80;
      spawnParticle({
        type: 'puff', x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20,
        life: 0.3 + Math.random() * 0.25, maxLife: 0.55,
        size: 4 + Math.random() * 6, color: 'rgba(255,255,255,0.9)', alpha: 0.8,
      });
    }
  }

  function spawnRingBurst(x, y) {
    spawnParticle({
      type: 'ring', x: x, y: y, vx: 0, vy: 0,
      life: 0.45, maxLife: 0.45, size: 90, color: '#ffe85a',
    });
    spawnParticle({
      type: 'ring', x: x, y: y, vx: 0, vy: 0,
      life: 0.6, maxLife: 0.6, size: 60, color: '#ff8fd6',
    });
    for (var i = 0; i < 14; i++) {
      var a = (i / 14) * 6.2832;
      spawnParticle({
        type: 'spark', x: x, y: y,
        vx: Math.cos(a) * (60 + Math.random() * 60),
        vy: Math.sin(a) * (60 + Math.random() * 60) - 30,
        life: 0.4 + Math.random() * 0.3, maxLife: 0.7,
        size: 2.5 + Math.random() * 2, color: i % 2 ? '#ffe85a' : '#ff8fd6',
        grav: 240,
      });
    }
    for (var k = 0; k < 4; k++) {
      spawnParticle({
        type: 'sparkleEmoji', x: x + (Math.random() - 0.5) * 70, y: y + (Math.random() - 0.5) * 70,
        vx: (Math.random() - 0.5) * 40, vy: -30 - Math.random() * 30,
        life: 0.6 + Math.random() * 0.3, maxLife: 0.9, size: 14 + Math.random() * 10,
        color: '#fff',
      });
    }
  }

  function spawnCrashBurst(x, y) {
    for (var i = 0; i < 22; i++) {
      var a = Math.random() * 6.2832;
      var sp = 60 + Math.random() * 180;
      spawnParticle({
        type: 'spark', x: x, y: y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        life: 0.4 + Math.random() * 0.4, maxLife: 0.8,
        size: 2 + Math.random() * 3, color: i % 3 === 0 ? '#fff' : '#ffb545',
        grav: 500,
      });
    }
    for (var k = 0; k < 10; k++) {
      spawnParticle({
        type: 'ember', x: x + (Math.random() - 0.5) * 30, y: y,
        vx: (Math.random() - 0.5) * 60, vy: -40 - Math.random() * 80,
        life: 0.6 + Math.random() * 0.5, maxLife: 1.1,
        size: 2.5 + Math.random() * 3, color: '#ff7a3a',
      });
    }
  }

  function spawnFireTrail(bird) {
    for (var i = 0; i < 3; i++) {
      spawnParticle({
        type: 'trail', x: E.BIRD_X - 18 + (Math.random() - 0.5) * 10, y: bird.y + (Math.random() - 0.5) * 12,
        vx: -80 - Math.random() * 60, vy: (Math.random() - 0.5) * 40,
        life: 0.25 + Math.random() * 0.2, maxLife: 0.45,
        size: 9 + Math.random() * 7, color: i % 2 ? '#ff7a3a' : '#ffe85a',
      });
    }
  }

  function spawnConfetti() {
    var colors = ['#ff5f6d', '#ffb545', '#ffe85a', '#5fe06a', '#4db8ff', '#a86aff', '#ff8fd6'];
    for (var i = 0; i < 90; i++) {
      spawnParticle({
        type: 'confetti',
        x: Math.random() * E.WIDTH, y: -20 - Math.random() * 80,
        vx: (Math.random() - 0.5) * 120, vy: 90 + Math.random() * 140,
        life: 1.8 + Math.random() * 1.4, maxLife: 3.2,
        size: 6 + Math.random() * 6, color: colors[i % colors.length],
        rot: Math.random() * 6.2832, vr: (Math.random() - 0.5) * 10,
        grav: 140, sway: 2.4,
      });
    }
  }

  function spawnAmbient(t) {
    var a = t.ambient;
    var x = Math.random() * E.WIDTH;
    var y;
    switch (a.kind) {
      case 'sparkle':
        y = Math.random() * (E.HEIGHT - R.GROUND_Y);
        spawnParticle({
          type: 'sparkleEmoji', x: x, y: y,
          vx: -8 - Math.random() * 10, vy: -12 - Math.random() * 18,
          life: 1.4 + Math.random() * 1.2, maxLife: 2.6,
          size: 9 + Math.random() * 8, color: '#fff',
        });
        break;
      case 'ember':
        y = E.HEIGHT - Math.random() * (E.HEIGHT - 60);
        spawnParticle({
          type: 'ember', x: x, y: y,
          vx: (Math.random() - 0.5) * 14, vy: -24 - Math.random() * 40,
          life: 1.6 + Math.random() * 1.2, maxLife: 2.8,
          size: 2 + Math.random() * 2.6, color: Math.random() < 0.5 ? '#ffb545' : '#ff7a3a',
        });
        break;
      case 'bubble':
        y = E.HEIGHT - Math.random() * (E.HEIGHT - 40);
        spawnParticle({
          type: 'bubble', x: x, y: y,
          vx: (Math.random() - 0.5) * 20, vy: -30 - Math.random() * 40,
          life: 2.2 + Math.random() * 1.6, maxLife: 3.8,
          size: 2 + Math.random() * 4, color: '#d6efff', sway: 1.6,
        });
        break;
      case 'snow':
        y = -10 - Math.random() * 60;
        spawnParticle({
          type: 'snow', x: x, y: y,
          vx: (Math.random() - 0.5) * 30, vy: 30 + Math.random() * 40,
          life: 2.5 + Math.random() * 1.6, maxLife: 4.1,
          size: 1.6 + Math.random() * 2.2, color: '#ffffff', sway: 2,
        });
        break;
      case 'pollen':
        y = Math.random() * (E.HEIGHT - R.GROUND_Y);
        spawnParticle({
          type: 'pollen', x: x, y: y,
          vx: -10 - Math.random() * 16, vy: -6 - Math.random() * 12,
          life: 2 + Math.random() * 1.6, maxLife: 3.6,
          size: 1.6 + Math.random() * 2, color: '#ffe066', sway: 1.8,
        });
        break;
      case 'star':
        y = Math.random() * (E.HEIGHT - R.GROUND_Y);
        spawnParticle({
          type: 'spark', x: x, y: y, vx: 0, vy: -2,
          life: 1.2 + Math.random() * 1, maxLife: 2.2,
          size: 1.6 + Math.random() * 1.6, color: '#ffffff',
        });
        break;
    }
  }

  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.age += dt;
      p.vy += (p.grav || 0) * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.sway) p.x += Math.sin(p.age * 3 + p.phase) * p.sway * 0.6;
      if (p.type === 'confetti') p.rot += p.vr * dt;
      if (p.type === 'snow' || p.type === 'bubble') {
        p.x += Math.sin(p.age * 2 + p.phase) * 1.2;
      }
    }
  }

  // ---- game setup ----------------------------------------------------------

  function startRun() {
    world = E.createWorld(diff(), Date.now() >>> 0);
    runPhase = 'ready';
    screen = 'playing';
    tint = 0;
    shake = 0;
    dieT = 0;
    A.resetStreak();
    scoreEl.textContent = '0';
    hintEl.classList.remove('hidden');
    renderHearts();
    showScreen('none');
    hud.classList.remove('hidden');
  }

  function renderHearts() {
    var d = diff();
    if (d.lives <= 1) {
      heartsEl.innerHTML = '';
      return;
    }
    var out = '';
    for (var i = 0; i < d.lives; i++) {
      out += i < world.hearts ? '❤️' : '🤍';
    }
    heartsEl.innerHTML = out;
  }

  function doFlap() {
    if (!world) return;
    E.flap(world.bird);
    spawnPuff(E.BIRD_X, world.bird.y);
    A.flap(theme().flapPitch, theme().squareWave);
    if (runPhase === 'ready') {
      runPhase = 'flying';
      hintEl.classList.add('hidden');
    }
  }

  function scorePop() {
    scoreEl.classList.remove('pop');
    void scoreEl.offsetWidth; // restart the animation
    scoreEl.classList.add('pop');
  }

  function milestoneGlow() {
    scoreEl.classList.remove('glow');
    void scoreEl.offsetWidth;
    scoreEl.classList.add('glow');
  }

  function showBanner(text) {
    bannerEl.textContent = text;
    bannerEl.classList.remove('show');
    void bannerEl.offsetWidth;
    bannerEl.classList.add('show');
  }

  function showPopup(text) {
    var d = document.createElement('div');
    d.className = 'popup';
    d.textContent = text;
    popupsEl.appendChild(d);
    setTimeout(function () { if (d.parentNode) d.parentNode.removeChild(d); }, 950);
  }

  // ---- gameplay update -----------------------------------------------------

  var MEDAL_TABLE = {
    easy: [{ s: 5, m: '🥉' }, { s: 15, m: '🥈' }, { s: 30, m: '🥇' }, { s: 50, m: '👑' }],
    medium: [{ s: 5, m: '🥉' }, { s: 10, m: '🥈' }, { s: 20, m: '🥇' }, { s: 40, m: '👑' }],
    hard: [{ s: 3, m: '🥉' }, { s: 8, m: '🥈' }, { s: 15, m: '🥇' }, { s: 30, m: '👑' }],
  };

  function medalFor(score) {
    var table = MEDAL_TABLE[diffId] || MEDAL_TABLE.easy;
    for (var i = table.length - 1; i >= 0; i--) {
      if (score >= table[i].s) return table[i].m;
    }
    return '';
  }

  function updatePlaying(dt) {
    if (runPhase === 'ready') {
      world.bird.y = E.HEIGHT * 0.42 + Math.sin(time * 3) * 8;
      world.bird.rot = Math.sin(time * 3) * 0.08;
      return;
    }
    if (runPhase === 'flying') {
      E.worldStep(world, dt);
      processEvents();
      if (world.fire) spawnFireTrail(world.bird);
    } else if (runPhase === 'dying') {
      dieT -= dt;
      E.integrateBird(world.bird, dt);
      world.bird.rot += dt * 6;
      var gy = E.HEIGHT - E.GROUND_H;
      if (world.bird.y + E.BIRD_HALF_H >= gy) {
        world.bird.y = gy - E.BIRD_HALF_H;
        world.bird.vy = 0;
      }
      if (dieT <= 0) showGameOver();
    }
    if (shake > 0) shake = Math.max(0, shake - dt * 3);
  }

  function processEvents() {
    var evs = world.lastEvents;
    for (var i = 0; i < evs.length; i++) {
      var e = evs[i];
      if (e.type === 'point') {
        scoreEl.textContent = world.score;
        scorePop();
        A.point();
      } else if (e.type === 'perfect') {
        scoreEl.textContent = world.score;
        scorePop();
        spawnRingBurst(E.BIRD_X, world.bird.y);
        showPopup('PERFECT! +2');
        A.perfect();
      } else if (e.type === 'milestone') {
        showBanner(e.n + '!');
        milestoneGlow();
        A.milestone();
        if (tint < 0.18) tint = Math.min(0.18, tint + 0.02);
      } else if (e.type === 'heartLost') {
        renderHearts();
        heartsEl.classList.remove('pop');
        void heartsEl.offsetWidth;
        heartsEl.classList.add('pop');
        A.heartLost();
      } else if (e.type === 'over') {
        beginDeath(e.cause);
      }
    }
  }

  function beginDeath(cause) {
    runPhase = 'dying';
    dieT = 0.8;
    shake = 1;
    spawnCrashBurst(E.BIRD_X, world.bird.y);
    if (cause === 'floor') {
      world.bird.y = E.HEIGHT - E.GROUND_H - E.BIRD_HALF_H;
      world.bird.vy = 0;
    }
    A.crash();
  }

  function showGameOver() {
    screen = 'gameover';
    hud.classList.add('hidden');
    hintEl.classList.add('hidden');
    var score = world.score;
    var medal = medalFor(score);
    var best = S.best(themeId, diffId);
    var isNew = score > best;

    goMedal.textContent = medal;
    goTitle.textContent = isNew ? 'NEW BEST!' : 'GAME OVER';
    goBest.textContent = 'Best: ' + Math.max(best, score);
    showScreen('gameover');

    var start = 0;
    var dur = isNew ? 0.9 : 0.4;
    var t0 = time;
    function flip() {
      var k = Math.min(1, (time - t0) / dur);
      goScore.textContent = String(Math.round(start + (score - start) * (1 - Math.pow(1 - k, 3))));
      if (k < 1) requestAnimationFrame(flip);
    }
    flip();

    if (isNew) {
      S.saveBest(themeId, diffId, score);
      spawnConfetti();
      A.fanfare();
    }
  }

  // ---- attract-mode autopilot demo ----------------------------------------

  function makeAttract() {
    attract = E.createWorld(diff(), 20240517);
    attract.flapCooldown = 0;
    attractResetTimer = 0;
  }

  function updateAttract(dt) {
    if (!attract) return;
    if (attract.over) {
      attractResetTimer -= dt;
      if (attractResetTimer <= 0) makeAttract();
      return;
    }
    var next = null;
    for (var i = 0; i < attract.obstacles.length; i++) {
      if (!attract.obstacles[i].passed) { next = attract.obstacles[i]; break; }
    }
    var moving = attract.diff.moving && attract.score >= 10;
    var targetY;
    if (next && next.x - E.BIRD_X < 480) {
      targetY = E.gapCenterY(next, attract.time, moving);
    } else {
      targetY = E.HEIGHT * 0.45;
    }
    if (attract.bird.y > targetY - 10 && attract.flapCooldown <= 0) {
      E.flap(attract.bird);
      attract.flapCooldown = 0.16;
    }
    if (attract.flapCooldown > 0) attract.flapCooldown -= dt;
    E.worldStep(attract, dt);
  }

  // ---- main loop -----------------------------------------------------------

  function update(dt) {
    time += dt;
    updateParticles(dt);
    var t = theme();
    if (Math.random() < t.ambient.rate * 50 && particles.length < 180) spawnAmbient(t);

    if (screen === 'title') updateAttract(dt);
    else if (screen === 'playing') updatePlaying(dt);
  }

  function render() {
    var t = theme();
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    R.drawSky(ctx, t);

    ctx.save();
    if (shake > 0) {
      ctx.translate((Math.random() - 0.5) * shake * 9, (Math.random() - 0.5) * shake * 9);
    }

    var scroll = (screen === 'playing' && world) ? world.diff.scroll : ATTRACT_SCROLL;
    for (var i = 0; i < t.parallax.length; i++) {
      R.drawParallax(ctx, t.parallax[i], time, scroll);
    }
    if (t.id === 'ghost') R.drawMoon(ctx, time, scroll);
    R.drawGround(ctx, t, time, scroll);

    var active = null;
    if (screen === 'playing' || screen === 'paused' || screen === 'gameover') active = world;
    else if (screen === 'title') active = attract;

    if (active) {
      var moving = active.diff.moving && active.score >= 10;
      for (var j = 0; j < active.obstacles.length; j++) {
        R.drawObstacle(ctx, t, active.obstacles[j], active.time, moving);
      }
      if (screen === 'playing' || screen === 'paused' || screen === 'gameover') {
        R.drawBird(ctx, t, active.bird);
      }
    }
    ctx.restore();

    if (tint > 0) {
      ctx.fillStyle = t.obstacle.accent;
      ctx.globalAlpha = tint;
      ctx.fillRect(0, 0, E.WIDTH, E.HEIGHT);
      ctx.globalAlpha = 1;
    }

    R.drawParticles(ctx, particles);
  }

  function loop(ts) {
    requestAnimationFrame(loop);
    var now = ts / 1000;
    if (!lastTime) lastTime = now;
    var frame = Math.min(now - lastTime, 0.25);
    lastTime = now;
    acc += frame;
    while (acc >= STEP) {
      update(STEP);
      acc -= STEP;
    }
    render();
  }

  // ---- input ---------------------------------------------------------------

  function togglePause() {
    if (screen === 'playing' && runPhase !== 'dying') {
      screen = 'paused';
      showScreen('paused');
    } else if (screen === 'paused') {
      screen = 'playing';
      showScreen('none');
    }
  }

  function onPress() {
    A.resume();
    if (screen === 'title') {
      startRun();
    } else if (screen === 'playing') {
      if (runPhase === 'ready' || runPhase === 'flying') doFlap();
    } else if (screen === 'gameover') {
      startRun();
    }
  }

  document.addEventListener('keydown', function (e) {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'KeyW') {
      e.preventDefault();
    }
    A.resume();
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      onPress();
    } else if (e.code === 'Enter') {
      if (screen === 'title') startRun();
    } else if (e.code === 'KeyP' || e.code === 'Escape') {
      togglePause();
    } else if (e.code === 'KeyR') {
      if (screen === 'gameover') startRun();
    }
  });

  stage.addEventListener('pointerdown', function (e) {
    if (e.target.closest && e.target.closest('button')) return;
    e.preventDefault();
    onPress();
  });

  window.addEventListener('blur', function () {
    if (screen === 'playing' && runPhase !== 'dying') {
      screen = 'paused';
      showScreen('paused');
    }
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && screen === 'playing' && runPhase !== 'dying') {
      screen = 'paused';
      showScreen('paused');
    }
  });

  // ---- buttons -------------------------------------------------------------

  document.getElementById('theme-prev').addEventListener('click', function () { cycleTheme(-1); });
  document.getElementById('theme-next').addEventListener('click', function () { cycleTheme(1); });
  document.getElementById('btn-play').addEventListener('click', function () { A.resume(); startRun(); });
  document.getElementById('btn-resume').addEventListener('click', function () { togglePause(); });
  document.getElementById('btn-quit').addEventListener('click', function () {
    screen = 'title';
    world = null;
    makeAttract();
    showScreen('title');
    hud.classList.add('hidden');
    hintEl.classList.add('hidden');
  });
  document.getElementById('btn-retry').addEventListener('click', function () { A.resume(); startRun(); });
  document.getElementById('btn-menu').addEventListener('click', function () {
    screen = 'title';
    world = null;
    makeAttract();
    showScreen('title');
    hud.classList.add('hidden');
    hintEl.classList.add('hidden');
  });

  // ---- boot ----------------------------------------------------------------

  function boot() {
    themeId = S.getTheme();
    if (!T.THEMES.some(function (t) { return t.id === themeId; })) themeId = 'unicorn';
    diffId = S.getDifficulty();
    if (!T.DIFFICULTIES.some(function (d) { return d.id === diffId; })) diffId = 'easy';

    buildPills();
    selectTheme(themeId, false);
    selectDifficulty(diffId, false);
    renderMute();
    showScreen('title');
    hud.classList.add('hidden');
    resize();
    requestAnimationFrame(loop);
  }

  window.addEventListener('resize', resize);
  boot();
})();