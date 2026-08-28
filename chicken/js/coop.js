// The Coop: canvas renderer, chicken sprite, command queue playback.
//
// Two layers:
//   - trail (offscreen canvas): persistent, every drawn segment goes here.
//   - main canvas: cleared each frame, blits trail then draws chicken on top.
//
// JS angle convention: 0° = east (facing right), positive = clockwise.

const Coop = (function () {
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  // W and H are CSS pixels — the coordinate system every command works in.
  // The backing store underneath is W*dpr by H*dpr, hidden by a base
  // transform, so nothing below this block has to think in device pixels.
  // Both track the element's real size (see fitNow), rather than being fixed
  // and stretched to fit.
  let W = canvas.width, H = canvas.height;

  let trail = document.createElement('canvas');
  trail.width = W; trail.height = H;
  let tctx = trail.getContext('2d');

  // Recentred on every resize.
  const HOME = { x: W / 2, y: H / 2, heading: 0 };
  const DEFAULT_COLOR = '#222';
  // The sprite's state. Still called `chicken` — that's the game's name, even
  // when it is currently being a unicorn.
  const chicken = {
    x: HOME.x, y: HOME.y, heading: HOME.heading,
    penDown: true, color: DEFAULT_COLOR,
    colorMode: 'fixed', hue: 0,
    bubble: null,
    animal: DEFAULT_ANIMAL,
  };

  // The animal the picker chose: what `reset` returns to. `be` changes the
  // current animal mid-program without disturbing this.
  let defaultAnimal = DEFAULT_ANIMAL;

  // ---- the world ------------------------------------------------------------
  //
  // Every command works in *world* units. In free draw the world is simply the
  // canvas, so scale is 1 and nothing below this line changes behaviour. In
  // quest mode the world is a fixed 1000x750 (Levels.WORLD) letterboxed into
  // whatever shape the canvas happens to be, so a level is the same puzzle at
  // any window size and `fd 100` always means the same distance.
  const world = { w: W, h: H, scale: 1, ox: 0, oy: 0 };

  // The level being played, or null for free draw.
  let level = null;
  // Live run state for that level. `nestArmed` stops a level whose basket sits
  // on the start square from being won before the animal has gone anywhere.
  let quest = null;

  function blankQuest() {
    return { eggs: new Set(), keys: new Set(), nestArmed: false, outcome: null };
  }

  function layoutWorld() {
    if (level) {
      world.w = Levels.WORLD.w;
      world.h = Levels.WORLD.h;
      world.scale = Math.min(W / world.w, H / world.h);
      world.ox = (W - world.w * world.scale) / 2;
      world.oy = (H - world.h * world.scale) / 2;
    } else {
      world.w = W; world.h = H;
      world.scale = 1; world.ox = 0; world.oy = 0;
    }
  }

  const COLOR_MAP = {
    red:    '#e53935',
    pink:   '#ec407a',
    teal:   '#00897b',
    blue:   '#1e88e5',
    green:  '#43a047',
    yellow: '#fdd835',
    orange: '#fb8c00',
    purple: '#8e24aa',
    black:  '#000000',
    white:  '#ffffff',
  };

  const BASE_SPEED = { msPerUnit: 4, msPerDeg: 2 };
  const SPEED_MAP = {
    slow:   { mult: 2.0 },
    medium: { mult: 1.0 },
    fast:   { mult: 0.4 },
  };
  const speed = { msPerUnit: BASE_SPEED.msPerUnit, msPerDeg: BASE_SPEED.msPerDeg };

  // Web Audio for `cluck` — created lazily on first use (browser autoplay rules).
  let audioCtx = null;
  function ensureAudio() {
    if (audioCtx) return audioCtx;
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    audioCtx = new Ctor();
    return audioCtx;
  }
  function playCluck() {
    const ac = ensureAudio();
    if (!ac) return;
    if (ac.state === 'suspended') ac.resume();
    const t0 = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(600, t0);
    osc.frequency.exponentialRampToValueAtTime(300, t0 + 0.08);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.18, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + 0.1);
  }

  // Same shape as playCluck, different curve: a short low thud for walking
  // into a fence, and a longer falling tone for being caught.
  function playTone(type, fromHz, toHz, seconds, peak) {
    const ac = ensureAudio();
    if (!ac) return;
    if (ac.state === 'suspended') ac.resume();
    const t0 = ac.currentTime;
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(fromHz, t0);
    osc.frequency.exponentialRampToValueAtTime(toHz, t0 + seconds * 0.9);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.02);
  }
  function playBump() { playTone('triangle', 180, 90, 0.14, 0.22); }
  function playCaught() { playTone('sawtooth', 420, 70, 0.5, 0.18); }
  // A little two-note chime for the moment the last key opens the gate.
  function playUnlock() {
    playTone('square', 330, 660, 0.18, 0.15);
    setTimeout(() => playTone('square', 660, 990, 0.15, 0.12), 90);
  }
  function playWin() {
    playTone('square', 520, 780, 0.12, 0.16);
    setTimeout(() => playTone('square', 780, 1040, 0.18, 0.16), 120);
  }

  let queue = [];
  let qi = 0;
  let opStart = 0;
  let opFrom = null;
  let running = false;
  let onDone = null;
  // Reports the source line of the op about to run, so the editor can glow it.
  let onLine = null;

  function reset() {
    chicken.x = HOME.x; chicken.y = HOME.y; chicken.heading = HOME.heading;
    chicken.penDown = true;
    chicken.color = DEFAULT_COLOR;
    chicken.colorMode = 'fixed'; chicken.hue = 0;
    chicken.bubble = null;
    chicken.animal = defaultAnimal;
    speed.msPerUnit = BASE_SPEED.msPerUnit;
    speed.msPerDeg = BASE_SPEED.msPerDeg;
    if (level) {
      quest = blankQuest();
      // A basket you do not already stand on is live from the start; only one
      // sitting on the start square has to wait for you to leave it.
      quest.nestArmed = nestDistance(chicken.x, chicken.y) > Levels.NEST_R;
      // Gates relock on every fresh run — the key has to be earned each time.
      rebuildQuestWalls();
    }
    clearTrail();
    render();
  }

  function clearTrail() { tctx.clearRect(0, 0, world.w, world.h); }

  // ---- keeping the surfaces matched to the element -------------------------

  function currentDpr() {
    return Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  }

  // Point a context at CSS pixels whatever the device pixel ratio, so one
  // unit of `forward` is one CSS pixel on every display and the drawing is
  // sharp on a hidpi one.
  function useCssPixels(context, dpr) {
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  let sized = false;

  // Allocate the offscreen trail at w x h world units, optionally blitting the
  // old one in at an offset.
  function allocTrail(w, h, carryFrom, dx, dy, srcW, srcH) {
    const dpr = currentDpr();
    const next = document.createElement('canvas');
    next.width = Math.round(w * dpr);
    next.height = Math.round(h * dpr);
    const nctx = next.getContext('2d');
    useCssPixels(nctx, dpr);
    if (carryFrom) nctx.drawImage(carryFrom, dx, dy, srcW, srcH);
    trail = next;
    tctx = nctx;
  }

  // Match both surfaces to w x h CSS pixels. In free draw the artwork stays
  // centred: it is copied in at half the delta and the animal (plus any move
  // in flight) shifts by the same amount, so resizing the window never tears a
  // drawing away from the animal that made it. In quest mode the trail is a
  // fixed world-sized surface, so there is nothing to carry.
  function resizeSurfaces(w, h) {
    const dpr = currentDpr();
    const oldTrail = trail, oldW = W, oldH = H;

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    useCssPixels(ctx, dpr);
    W = w; H = h;

    if (level) {
      // The quest trail is a fixed world-sized surface blitted into the
      // letterbox rect, so a resize is nothing but a new layout — no artwork
      // to shift, no drift, no re-centring of the animal.
      layoutWorld();
      sized = true;
      render();
      return;
    }

    // Free draw: the world *is* the canvas, so the drawing has to be carried
    // across by hand and kept centred under the animal that made it.
    const dx = Math.round((w - oldW) / 2);
    const dy = Math.round((h - oldH) / 2);
    allocTrail(w, h, sized ? oldTrail : null, dx, dy, oldW, oldH);
    layoutWorld();
    HOME.x = W / 2; HOME.y = H / 2;
    chicken.x += dx; chicken.y += dy;
    if (opFrom) { opFrom.x += dx; opFrom.y += dy; }
    sized = true;
    render();
  }

  let lastDpr = 0; // 0 so the first fit always runs
  function fitNow() {
    // clientWidth/Height are the content box — the border is excluded, which
    // getBoundingClientRect would have included and skewed by a few pixels.
    const w = Math.max(1, canvas.clientWidth || W);
    const h = Math.max(1, canvas.clientHeight || H);
    const dpr = currentDpr();
    if (w === W && h === H && dpr === lastDpr) return;
    lastDpr = dpr;
    resizeSurfaces(w, h);
  }

  let pendingFit = null;
  function scheduleFit() {
    if (pendingFit !== null) return;
    pendingFit = requestAnimationFrame(() => { pendingFit = null; fitNow(); });
  }

  function stampEgg(x, y) {
    tctx.save();
    tctx.font = '24px system-ui, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"';
    tctx.textAlign = 'center';
    tctx.textBaseline = 'middle';
    tctx.fillText('🥚', x, y);
    tctx.restore();
  }

  function stampPeckMark(x, y) {
    tctx.save();
    tctx.fillStyle = '#7a4a1d';
    tctx.beginPath();
    tctx.arc(x, y, 2.5, 0, 2 * Math.PI);
    tctx.fill();
    tctx.restore();
  }

  function nextRainbowColor() {
    const c = `hsl(${chicken.hue}, 80%, 45%)`;
    chicken.hue = (chicken.hue + 30) % 360;
    return c;
  }

  // Emoji animals are drawn facing WEST. To point one at `heading` we rotate,
  // but rolling all the way round leaves it upside down on the western half —
  // so past 90° we mirror instead. The animal always faces where it walks and
  // is never upside down.
  function drawAnimal(x, y, heading) {
    const glyph = ANIMALS[chicken.animal] || ANIMALS[DEFAULT_ANIMAL];
    const a = ((heading % 360) + 360) % 360;
    const facingWest = a > 90 && a < 270;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((facingWest ? a - 180 : a) * Math.PI / 180);
    if (!facingWest) ctx.scale(-1, 1);
    ctx.font = '36px system-ui, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(glyph, 0, 0);
    ctx.restore();
  }

  function drawCompass(heading) {
    const cx = W - 75, cy = 75, r = 42;
    ctx.save();

    // Background disc (semi-transparent, big enough to cover labels)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
    ctx.strokeStyle = '#bbb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 20, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();

    // Inner circle (the dial itself)
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.stroke();

    // Tick marks every 30° (longer + thicker at cardinals)
    ctx.strokeStyle = '#666';
    for (let deg = 0; deg < 360; deg += 30) {
      const isMajor = deg % 90 === 0;
      const inner = isMajor ? r - 8 : r - 4;
      const rad = deg * Math.PI / 180;
      ctx.lineWidth = isMajor ? 2 : 1;
      ctx.beginPath();
      ctx.moveTo(cx + inner * Math.cos(rad), cy + inner * Math.sin(rad));
      ctx.lineTo(cx + r * Math.cos(rad), cy + r * Math.sin(rad));
      ctx.stroke();
    }

    // Cardinal labels. Letters, not degrees -- "north" is a word a six-year-old
    // already owns, where "270°" is one more thing to decode.
    ctx.fillStyle = '#333';
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelR = r + 12;
    const CARDINALS = { 0: 'E', 90: 'S', 180: 'W', 270: 'N' };
    for (const deg of [0, 90, 180, 270]) {
      const rad = deg * Math.PI / 180;
      ctx.fillText(CARDINALS[deg], cx + labelR * Math.cos(rad), cy + labelR * Math.sin(rad));
    }

    // Live heading arrow (red, tracks the chicken)
    const hRad = heading * Math.PI / 180;
    const tipR = r - 6;
    const tipX = cx + tipR * Math.cos(hRad);
    const tipY = cy + tipR * Math.sin(hRad);
    ctx.strokeStyle = '#e53935';
    ctx.fillStyle = '#e53935';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(tipX, tipY);
    ctx.stroke();

    const ah = 7;
    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(
      tipX - ah * Math.cos(hRad - 0.45),
      tipY - ah * Math.sin(hRad - 0.45)
    );
    ctx.lineTo(
      tipX - ah * Math.cos(hRad + 0.45),
      tipY - ah * Math.sin(hRad + 0.45)
    );
    ctx.closePath();
    ctx.fill();

    // Center pin
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5, 0, 2 * Math.PI);
    ctx.fill();

    ctx.restore();
  }

  function drawBubble(text, cx, cy) {
    ctx.save();
    ctx.font = '14px system-ui, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"';
    const padding = 8;
    const tw = Math.ceil(ctx.measureText(text).width);
    const th = 18;
    const bw = tw + 2 * padding;
    const bh = th + 2 * padding;

    // Position above the chicken, clamped to the world.
    let bx = cx - bw / 2;
    let by = cy - 50 - bh;
    bx = Math.max(8, Math.min(world.w - bw - 8, bx));
    by = Math.max(8, by);

    const r = 8;
    const tailW = 12;
    const tipX = Math.min(Math.max(bx + r + 6, cx), bx + bw - r - 6);
    const tipY = cy - 18;
    const tailLeft = tipX - tailW / 2;
    const tailRight = tipX + tailW / 2;
    const bubbleBottom = by + bh;

    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.lineTo(bx + bw - r, by);
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
    ctx.lineTo(bx + bw, by + bh - r);
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
    ctx.lineTo(tailRight, bubbleBottom);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(tailLeft, bubbleBottom);
    ctx.lineTo(bx + r, bubbleBottom);
    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
    ctx.lineTo(bx, by + r);
    ctx.quadraticCurveTo(bx, by, bx + r, by);
    ctx.closePath();

    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = '#222';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(text, bx + padding, by + padding);
    ctx.restore();
  }

  // ---- level furniture ------------------------------------------------------
  //
  // Drawn every frame, never stamped into `trail` — otherwise `clear` / `cs`
  // would wipe the fences out from under the puzzle.

  const EMOJI_FONT = 'system-ui, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"';

  function roundRectPath(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
    c.closePath();
  }

  function glyph(text, x, y, size) {
    ctx.save();
    ctx.font = `${size}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    // Opaque fill, always: a colour emoji still picks up the current
    // fillStyle's alpha, so inheriting the fox halo's 10% red washes out
    // every glyph drawn after it.
    ctx.fillStyle = '#000';
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  // The yard itself, under the trail.
  function drawLevelGround() {
    ctx.save();
    ctx.fillStyle = '#f4faf1';
    ctx.fillRect(0, 0, world.w, world.h);
    ctx.strokeStyle = '#9ccc9c';
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, world.w - 4, world.h - 4);
    ctx.restore();
  }

  // Everything the animal can interact with, over the trail.
  function drawLevelProps() {
    ctx.save();

    // Ponds first: they are ground, not furniture.
    if (level.ice) {
      for (const r of level.ice) {
        ctx.fillStyle = '#d8ecf7';
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = '#9fc9de';
        ctx.lineWidth = 3;
        ctx.strokeRect(r.x, r.y, r.w, r.h);
        glyph('❄️', r.x + 30, r.y + 30, 20);
        glyph('❄️', r.x + r.w - 30, r.y + r.h - 30, 20);
      }
    }

    for (const w of level.walls) {
      ctx.fillStyle = '#c9a271';
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.strokeStyle = '#8a6234';
      ctx.lineWidth = 3;
      ctx.strokeRect(w.x, w.y, w.w, w.h);
      // Plank lines, along the long axis, so a fence reads as a fence.
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(138, 98, 52, 0.55)';
      ctx.beginPath();
      if (w.h >= w.w) {
        for (let y = w.y + 40; y < w.y + w.h; y += 40) {
          ctx.moveTo(w.x, y); ctx.lineTo(w.x + w.w, y);
        }
      } else {
        for (let x = w.x + 40; x < w.x + w.w; x += 40) {
          ctx.moveTo(x, w.y); ctx.lineTo(x, w.y + w.h);
        }
      }
      ctx.stroke();
    }

    // Gates: the fences' fancier cousins. Solid and padlocked while their key
    // is still out there; a faint dashed outline once open, so the passage
    // you earned stays legible.
    if (level.gates) {
      for (const g of level.gates) {
        ctx.save();
        if (gatesOpen()) {
          ctx.strokeStyle = 'rgba(126, 87, 194, 0.35)';
          ctx.lineWidth = 2;
          ctx.setLineDash([7, 7]);
          ctx.strokeRect(g.x, g.y, g.w, g.h);
          ctx.setLineDash([]);
        } else {
          ctx.fillStyle = '#b39ddb';
          ctx.fillRect(g.x, g.y, g.w, g.h);
          ctx.strokeStyle = '#7e57c2';
          ctx.lineWidth = 3;
          ctx.strokeRect(g.x, g.y, g.w, g.h);
          glyph('🔒', g.x + g.w / 2, g.y + g.h / 2, 30);
        }
        ctx.restore();
      }
    }

    // Foxes, with their danger radius shown so it is never a mystery.
    for (const f of level.foxes) {
      ctx.fillStyle = 'rgba(229, 57, 53, 0.10)';
      ctx.strokeStyle = 'rgba(229, 57, 53, 0.45)';
      ctx.lineWidth = 2;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.arc(f.x, f.y, Levels.FOX_R + Levels.ANIMAL_R, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      glyph('🦊', f.x, f.y, 40);
    }

    // The basket. Dashed while it is still waiting for you to leave it.
    const nest = level.nest;
    ctx.strokeStyle = quest.nestArmed ? 'rgba(67, 160, 71, 0.75)' : 'rgba(120, 120, 120, 0.4)';
    ctx.lineWidth = 3;
    ctx.setLineDash(quest.nestArmed ? [] : [6, 6]);
    ctx.beginPath();
    ctx.arc(nest.x, nest.y, Levels.NEST_R, 0, 2 * Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);
    glyph('🧺', nest.x, nest.y, 46);

    // Eggs. Collected ones stay as a faint ghost so the route is legible.
    for (let i = 0; i < level.eggs.length; i++) {
      const e = level.eggs[i];
      const got = quest.eggs.has(i);
      ctx.globalAlpha = got ? 0.22 : 1;
      glyph('🥚', e.x, e.y, 30);
      ctx.globalAlpha = 1;
    }

    // Keys, same ghost rule as eggs.
    if (level.keys) {
      for (let i = 0; i < level.keys.length; i++) {
        const k = level.keys[i];
        ctx.globalAlpha = quest.keys.has(i) ? 0.22 : 1;
        glyph('🔑', k.x, k.y, 30);
        ctx.globalAlpha = 1;
      }
    }

    ctx.restore();
  }

  // Screen-space overlay: which level, eggs so far, and the outcome once the
  // run has ended.
  const OUTCOME_TEXT = {
    win: '🎉 you made it!',
    bump: '🚧 bumped the fence',
    caught: '🦊 the fox got you',
    locked: '🔒 locked — find the key!',
    unfinished: '🤔 out of commands',
  };

  function drawHud() {
    const total = level.eggs.length;
    const bits = [level.name];
    if (total > 0) bits.push(`🥚 ${quest.eggs.size}/${total}`);
    if (level.keys && level.keys.length > 0) {
      bits.push(`🔑 ${quest.keys.size}/${level.keys.length}`);
    }
    if (quest.outcome) bits.push(OUTCOME_TEXT[quest.outcome] || '');
    const text = bits.filter(Boolean).join('   ');

    ctx.save();
    ctx.font = 'bold 14px system-ui, sans-serif';
    const tw = Math.ceil(ctx.measureText(text).width);
    const pad = 10;
    roundRectPath(ctx, 12, 12, tw + 2 * pad, 30, 8);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.fill();
    ctx.strokeStyle = quest.outcome === 'win' ? '#43a047'
                    : quest.outcome ? '#e53935' : '#bbb';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#333';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 12 + pad, 28);
    ctx.restore();
  }

  // Free draw is otherwise a featureless cream void: there is no way to see
  // how far `fd 100` actually goes. One faint square per 50 units, and a cross
  // where `home` returns to.
  function drawGrid() {
    ctx.save();
    ctx.strokeStyle = 'rgba(139, 111, 71, 0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = HOME.x % 50; x < W; x += 50) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
    for (let y = HOME.y % 50; y < H; y += 50) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
    ctx.stroke();

    ctx.strokeStyle = 'rgba(139, 111, 71, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(HOME.x - 8, HOME.y); ctx.lineTo(HOME.x + 8, HOME.y);
    ctx.moveTo(HOME.x, HOME.y - 8); ctx.lineTo(HOME.x, HOME.y + 8);
    ctx.stroke();
    ctx.restore();
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    // Everything below draws in world units; in free draw this transform is
    // the identity, so the original code path is unchanged.
    ctx.translate(world.ox, world.oy);
    ctx.scale(world.scale, world.scale);
    if (level) drawLevelGround(); else drawGrid();
    // Explicit destination size: the trail's backing store is in device
    // pixels, and we are drawing under a CSS-pixel transform.
    ctx.drawImage(trail, 0, 0, world.w, world.h);
    if (level) drawLevelProps();
    drawAnimal(chicken.x, chicken.y, chicken.heading);
    if (chicken.bubble) drawBubble(chicken.bubble, chicken.x, chicken.y);
    ctx.restore();

    drawCompass(chicken.heading);
    if (level) drawHud();
  }

  function durationFor(op) {
    if (op.op === 'forward' || op.op === 'back') {
      return Math.max(50, Math.abs(op.arg) * speed.msPerUnit);
    }
    if (op.op === 'right' || op.op === 'left') {
      return Math.max(50, Math.abs(op.arg) * speed.msPerDeg);
    }
    if (op.op === 'peck') return 250;
    if (op.op === 'say') {
      const len = (op.arg || '').length;
      return Math.max(1200, len * 60);
    }
    return 0;
  }

  function snapshot() {
    return { x: chicken.x, y: chicken.y, heading: chicken.heading };
  }

  function targetOf(op, from) {
    if (op.op === 'forward' || op.op === 'back') {
      const sign = op.op === 'forward' ? 1 : -1;
      const rad = from.heading * Math.PI / 180;
      return {
        x: from.x + sign * op.arg * Math.cos(rad),
        y: from.y + sign * op.arg * Math.sin(rad),
        heading: from.heading,
      };
    }
    if (op.op === 'right' || op.op === 'left') {
      const sign = op.op === 'right' ? 1 : -1;
      return { x: from.x, y: from.y, heading: from.heading + sign * op.arg };
    }
    return { ...from };
  }

  // Where a move op really ends: the requested target, or — on ice levels —
  // the far edge of the pond, when the requested target would rest on ice.
  function moveTarget(op, from) {
    if (op._slide) return { x: op._slide.x, y: op._slide.y, heading: from.heading };
    return targetOf(op, from);
  }

  function applyInstant(op) {
    switch (op.op) {
      case 'penup':   chicken.penDown = false; break;
      case 'pendown': chicken.penDown = true; break;
      case 'home':
        chicken.x = HOME.x; chicken.y = HOME.y; chicken.heading = HOME.heading;
        // Teleporting back onto the basket must not count as arriving at it.
        if (level) quest.nestArmed = nestDistance(chicken.x, chicken.y) > Levels.NEST_R;
        break;
      case 'clear': clearTrail(); break;
      // (`clear` wipes the pen trail only — level furniture lives in render())
      case 'color':
        if (op.arg === 'rainbow') {
          chicken.colorMode = 'rainbow';
        } else {
          chicken.colorMode = 'fixed';
          chicken.color = COLOR_MAP[op.arg] || DEFAULT_COLOR;
        }
        break;
      case 'speed': {
        const s = SPEED_MAP[op.arg] || SPEED_MAP.medium;
        speed.msPerUnit = BASE_SPEED.msPerUnit * s.mult;
        speed.msPerDeg = BASE_SPEED.msPerDeg * s.mult;
        break;
      }
      case 'be':
        if (ANIMALS[op.arg]) chicken.animal = op.arg;
        break;
      case 'lay':   stampEgg(chicken.x, chicken.y); break;
      case 'cluck': playCluck(); break;
    }
  }

  // ---- quest collision ------------------------------------------------------
  //
  // Cluck has no runtime control flow — `repeat` is unrolled at compile time —
  // so a program cannot react to hitting something. All of that lives here:
  // the renderer stops playback and reports why.

  let questWalls = [];

  function nestDistance(x, y) {
    return Math.hypot(x - level.nest.x, y - level.nest.y);
  }

  // Gates are walls that stand only while their key is out there somewhere.
  // Rebuilt on level entry, on reset, and the moment the last key is grabbed.
  function gatesOpen() {
    return quest.keys.size >= (level.keys || []).length;
  }

  function rebuildQuestWalls() {
    questWalls = Levels.wallsOf(level);
    if (level.gates && level.gates.length > 0 && !gatesOpen()) {
      questWalls = questWalls.concat(level.gates);
    }
  }

  // A wall hit is a "locked" bump when the wall is a gate. Locked gates are
  // the only gates that ever appear in questWalls, so membership is enough.
  function isGate(wall) {
    return !!level.gates && level.gates.indexOf(wall) !== -1;
  }

  // Move the animal from (x0,y0) toward (x1,y1). Returns where it actually
  // got to and what stopped it, and collects any eggs brushed on the way.
  function resolveMove(x0, y0, x1, y1) {
    const wallHit = Levels.segmentHitsWalls(x0, y0, x1, y1, questWalls, Levels.ANIMAL_R);
    const foxHit = level.foxes.length
      ? Levels.segmentHitsCircles(x0, y0, x1, y1, level.foxes,
                                  Levels.FOX_R + Levels.ANIMAL_R)
      : null;
    const nestHit = quest.nestArmed
      ? Levels.segmentHitsCircles(x0, y0, x1, y1, [level.nest], Levels.NEST_R)
      : null;

    let stop = null;
    const consider = (hit, outcome) => {
      if (hit && (!stop || hit.t < stop.t)) stop = { t: hit.t, outcome };
    };
    consider(wallHit, wallHit && isGate(wallHit.wall) ? 'locked' : 'bump');
    consider(foxHit, 'caught');
    consider(nestHit, 'win');

    const t = stop ? stop.t : 1;
    const ex = x0 + (x1 - x0) * t;
    const ey = y0 + (y1 - y0) * t;

    for (const i of Levels.eggsCollectedBy(x0, y0, ex, ey, level.eggs, quest.eggs)) {
      quest.eggs.add(i);
      playCluck();
    }

    // Keys grab like eggs. The last one swings every gate open.
    if (level.keys && level.keys.length > 0) {
      for (const i of Levels.eggsCollectedBy(x0, y0, ex, ey, level.keys,
                                             quest.keys, Levels.KEY_R)) {
        quest.keys.add(i);
        if (level.gates && level.gates.length > 0 && gatesOpen()) {
          rebuildQuestWalls();
          playUnlock();
        } else {
          playCluck();
        }
      }
    }

    // The basket only goes live once the animal has left it, so a level whose
    // basket sits on the start square is not won before it begins. This runs
    // per frame on a short sub-segment, so it is effectively continuous.
    if (!quest.nestArmed &&
        Math.max(nestDistance(x0, y0), nestDistance(ex, ey)) > Levels.NEST_R) {
      quest.nestArmed = true;
    }

    return { x: ex, y: ey, outcome: stop ? stop.outcome : null };
  }

  function endQuestRun(outcome) {
    quest.outcome = outcome;
    chicken.bubble = null;
    render();
    if (outcome === 'win') playWin();
    else if (outcome === 'caught') playCaught();
    else playBump();
    finish(false, {
      outcome,
      eggsGot: quest.eggs.size,
      eggsTotal: level.eggs.length,
    });
  }

  function startOp() {
    if (qi >= queue.length) { finish(false); return; }
    const op = queue[qi];
    if (onLine) onLine(op.line);
    opFrom = snapshot();
    opStart = performance.now();

    // Lock in this segment's color before any animation begins, so rainbow
    // mode advances once per move (not once per tick).
    if ((op.op === 'forward' || op.op === 'back') && chicken.colorMode === 'rainbow') {
      chicken.color = nextRainbowColor();
    }
    if (op.op === 'peck') {
      op._peckMarked = false;
    }
    if (op.op === 'say') {
      chicken.bubble = op.arg;
    }

    // Ice: a move that would end on the pond glides on to the far edge
    // instead. The extended target is locked in here, and the per-frame
    // collision below still catches anything in the glide's path.
    if (level && (op.op === 'forward' || op.op === 'back') &&
        level.ice && level.ice.length > 0) {
      const tgt = targetOf(op, opFrom);
      const slid = Levels.slideDestination(opFrom.x, opFrom.y, tgt.x, tgt.y, level.ice);
      if (slid) {
        op._slide = slid;
        op._dur = Math.max(50, Math.hypot(slid.x - opFrom.x, slid.y - opFrom.y) *
                           speed.msPerUnit);
      }
    }

    if (durationFor(op) === 0) {
      applyInstant(op);
      qi++;
      render();
      requestAnimationFrame(() => { if (running) startOp(); });
      return;
    }
    requestAnimationFrame(tick);
  }

  function tick(now) {
    if (!running) return;
    const op = queue[qi];
    if (!op) { finish(false); return; }
    const dur = op._dur || durationFor(op);
    const elapsed = now - opStart;
    const t = dur === 0 ? 1 : Math.min(1, elapsed / dur);

    if (op.op === 'forward' || op.op === 'back') {
      const tgt = moveTarget(op, opFrom);
      let newX = opFrom.x + (tgt.x - opFrom.x) * t;
      let newY = opFrom.y + (tgt.y - opFrom.y) * t;
      let outcome = null;
      if (level) {
        const moved = resolveMove(chicken.x, chicken.y, newX, newY);
        newX = moved.x; newY = moved.y; outcome = moved.outcome;
      }
      if (chicken.penDown) {
        tctx.strokeStyle = chicken.color;
        tctx.lineWidth = 2;
        tctx.lineCap = 'round';
        tctx.beginPath();
        tctx.moveTo(chicken.x, chicken.y);
        tctx.lineTo(newX, newY);
        tctx.stroke();
      }
      chicken.x = newX; chicken.y = newY;
      if (outcome) { endQuestRun(outcome); return; }
    } else if (op.op === 'right' || op.op === 'left') {
      const tgt = targetOf(op, opFrom);
      chicken.heading = opFrom.heading + (tgt.heading - opFrom.heading) * t;
    } else if (op.op === 'peck') {
      // Bob forward 5px and back over 250ms; stamp a mark at peak.
      const PECK_DIST = 5;
      const phase = Math.sin(t * Math.PI); // 0 → 1 → 0
      const rad = opFrom.heading * Math.PI / 180;
      chicken.x = opFrom.x + PECK_DIST * phase * Math.cos(rad);
      chicken.y = opFrom.y + PECK_DIST * phase * Math.sin(rad);
      if (!op._peckMarked && t >= 0.5) {
        const tipX = opFrom.x + (PECK_DIST + 6) * Math.cos(rad);
        const tipY = opFrom.y + (PECK_DIST + 6) * Math.sin(rad);
        stampPeckMark(tipX, tipY);
        op._peckMarked = true;
      }
    }

    render();

    if (t >= 1) {
      if (op.op === 'peck') {
        // Snap back to origin — the bob is purely animation, not displacement.
        chicken.x = opFrom.x; chicken.y = opFrom.y; chicken.heading = opFrom.heading;
      } else if (op.op === 'say') {
        chicken.bubble = null;
        render();
      } else {
        const tgt = moveTarget(op, opFrom);
        chicken.x = tgt.x; chicken.y = tgt.y; chicken.heading = tgt.heading;
      }
      qi++;
      if (qi >= queue.length) { finish(false); return; }
      startOp();
      return;
    }
    requestAnimationFrame(tick);
  }

  // Free draw only ever cared about `interrupted`; quest mode needs to know
  // *how* the run ended, so a second argument carries the result. Existing
  // callers that take one parameter are unaffected.
  function finish(interrupted, result) {
    running = false;
    if (onLine) { const lc = onLine; onLine = null; lc(null); }
    let res = result || null;
    if (level && !res) {
      // Ran off the end of the program without reaching anything.
      if (!quest.outcome && !interrupted) quest.outcome = 'unfinished';
      res = {
        outcome: quest.outcome || 'stopped',
        eggsGot: quest.eggs.size,
        eggsTotal: level.eggs.length,
      };
      render();
    }
    if (onDone) { const cb = onDone; onDone = null; cb(interrupted, res); }
  }

  function play(q, doneCb, lineCb) {
    queue = q;
    qi = 0;
    running = true;
    onDone = doneCb || null;
    onLine = lineCb || null;
    startOp();
  }

  function stop() {
    if (!running) return;
    finish(true);
  }

  function isRunning() { return running; }

  fitNow();

  // The pane changes size for reasons other than the window moving (the
  // editor pane is a percentage of it), so watch the element itself rather
  // than only listening for window resizes.
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(scheduleFit).observe(canvas);
  }
  window.addEventListener('resize', scheduleFit);

  // The picker sets the animal the coop starts (and resets) as. Applied live
  // too, so clicking one is instantly visible without pressing Run.
  function setDefaultAnimal(name) {
    if (!ANIMALS[name]) return;
    defaultAnimal = name;
    chicken.animal = name;
    render();
  }
  function getDefaultAnimal() { return defaultAnimal; }

  // ---- entering and leaving a level -----------------------------------------

  function setLevel(lv) {
    level = lv;
    quest = blankQuest();
    rebuildQuestWalls();
    HOME.x = lv.start.x;
    HOME.y = lv.start.y;
    HOME.heading = lv.start.heading || 0;
    layoutWorld();
    allocTrail(world.w, world.h, null);
    reset();
  }

  function clearLevel() {
    level = null;
    quest = null;
    questWalls = [];
    layoutWorld();
    HOME.x = W / 2; HOME.y = H / 2; HOME.heading = 0;
    allocTrail(world.w, world.h, null);
    reset();
  }

  function getQuest() {
    if (!level) return null;
    return {
      levelId: level.id,
      eggsGot: quest.eggs.size,
      eggsTotal: level.eggs.length,
      outcome: quest.outcome,
    };
  }

  return {
    play, stop, reset, render, isRunning,
    setDefaultAnimal, getDefaultAnimal,
    setLevel, clearLevel, getQuest,
  };
})();
