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
  const W = canvas.width, H = canvas.height;

  const trail = document.createElement('canvas');
  trail.width = W; trail.height = H;
  const tctx = trail.getContext('2d');

  const HOME = { x: W / 2, y: H / 2, heading: 0 };
  const DEFAULT_COLOR = '#222';
  const chicken = {
    x: HOME.x, y: HOME.y, heading: HOME.heading,
    penDown: true, color: DEFAULT_COLOR,
    colorMode: 'fixed', hue: 0,
  };

  const COLOR_MAP = {
    red:    '#e53935',
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
    speed.msPerUnit = BASE_SPEED.msPerUnit;
    speed.msPerDeg = BASE_SPEED.msPerDeg;
    tctx.clearRect(0, 0, W, H);
    render();
  }

  function clearTrail() { tctx.clearRect(0, 0, W, H); }

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

  function drawChicken(x, y, heading) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading * Math.PI / 180);
    ctx.font = '36px system-ui, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🐔', 0, 0);
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

  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(trail, 0, 0);
    drawChicken(chicken.x, chicken.y, chicken.heading);
    drawCompass(chicken.heading);
  }

  function durationFor(op) {
    if (op.op === 'forward' || op.op === 'back') {
      return Math.max(50, Math.abs(op.arg) * speed.msPerUnit);
    }
    if (op.op === 'right' || op.op === 'left') {
      return Math.max(50, Math.abs(op.arg) * speed.msPerDeg);
    }
    if (op.op === 'peck') return 250;
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

  render();

  return { play, stop, reset, render, isRunning };
})();
