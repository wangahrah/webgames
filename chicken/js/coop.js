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

  let queue = [];
  let qi = 0;
  let opStart = 0;
  let opFrom = null;
  let running = false;
  let onDone = null;

  function reset() {
    chicken.x = HOME.x; chicken.y = HOME.y; chicken.heading = HOME.heading;
    chicken.penDown = true;
    chicken.color = DEFAULT_COLOR;
    chicken.colorMode = 'fixed'; chicken.hue = 0;
    chicken.bubble = null;
    chicken.animal = defaultAnimal;
    speed.msPerUnit = BASE_SPEED.msPerUnit;
    speed.msPerDeg = BASE_SPEED.msPerDeg;
    tctx.clearRect(0, 0, W, H);
    render();
  }

  function clearTrail() { tctx.clearRect(0, 0, W, H); }

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

  // Resize both surfaces to w x h CSS pixels, carrying the existing drawing
  // across. The artwork stays centred: it is copied in at half the delta and
  // the animal (plus any move in flight) shifts by the same amount, so
  // resizing the window never tears a drawing away from the animal that made
  // it.
  function resizeSurfaces(w, h) {
    const dpr = currentDpr();
    const oldTrail = trail, oldW = W, oldH = H;
    const dx = Math.round((w - oldW) / 2);
    const dy = Math.round((h - oldH) / 2);

    const next = document.createElement('canvas');
    next.width = Math.round(w * dpr);
    next.height = Math.round(h * dpr);
    const nctx = next.getContext('2d');
    useCssPixels(nctx, dpr);
    if (sized) nctx.drawImage(oldTrail, dx, dy, oldW, oldH);
    trail = next;
    tctx = nctx;

    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    useCssPixels(ctx, dpr);

    W = w; H = h;
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

    // Cardinal labels
    ctx.fillStyle = '#333';
    ctx.font = 'bold 11px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const labelR = r + 12;
    for (const deg of [0, 90, 180, 270]) {
      const rad = deg * Math.PI / 180;
      ctx.fillText(`${deg}°`, cx + labelR * Math.cos(rad), cy + labelR * Math.sin(rad));
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

    // Position above the chicken, clamped to canvas.
    let bx = cx - bw / 2;
    let by = cy - 50 - bh;
    bx = Math.max(8, Math.min(W - bw - 8, bx));
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

  function render() {
    ctx.clearRect(0, 0, W, H);
    // Explicit destination size: the trail's backing store is in device
    // pixels, and we are drawing under a CSS-pixel transform.
    ctx.drawImage(trail, 0, 0, W, H);
    drawAnimal(chicken.x, chicken.y, chicken.heading);
    drawCompass(chicken.heading);
    if (chicken.bubble) drawBubble(chicken.bubble, chicken.x, chicken.y);
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

  function applyInstant(op) {
    switch (op.op) {
      case 'penup':   chicken.penDown = false; break;
      case 'pendown': chicken.penDown = true; break;
      case 'home':
        chicken.x = HOME.x; chicken.y = HOME.y; chicken.heading = HOME.heading;
        break;
      case 'clear': clearTrail(); break;
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

  function startOp() {
    if (qi >= queue.length) { finish(false); return; }
    const op = queue[qi];
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
    const dur = durationFor(op);
    const elapsed = now - opStart;
    const t = dur === 0 ? 1 : Math.min(1, elapsed / dur);

    if (op.op === 'forward' || op.op === 'back') {
      const tgt = targetOf(op, opFrom);
      const newX = opFrom.x + (tgt.x - opFrom.x) * t;
      const newY = opFrom.y + (tgt.y - opFrom.y) * t;
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
        const tgt = targetOf(op, opFrom);
        chicken.x = tgt.x; chicken.y = tgt.y; chicken.heading = tgt.heading;
      }
      qi++;
      if (qi >= queue.length) { finish(false); return; }
      startOp();
      return;
    }
    requestAnimationFrame(tick);
  }

  function finish(interrupted) {
    running = false;
    if (onDone) { const cb = onDone; onDone = null; cb(interrupted); }
  }

  function play(q, doneCb) {
    queue = q;
    qi = 0;
    running = true;
    onDone = doneCb || null;
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

  return { play, stop, reset, render, isRunning, setDefaultAnimal, getDefaultAnimal };
})();
