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
  const chicken = {
    x: HOME.x, y: HOME.y, heading: HOME.heading,
    penDown: true, color: '#222',
  };

  const speed = { msPerUnit: 4, msPerDeg: 2 };

  let queue = [];
  let qi = 0;
  let opStart = 0;
  let opFrom = null;
  let running = false;
  let onDone = null;

  function reset() {
    chicken.x = HOME.x; chicken.y = HOME.y; chicken.heading = HOME.heading;
    chicken.penDown = true; chicken.color = '#222';
    tctx.clearRect(0, 0, W, H);
    render();
  }

  function clearTrail() { tctx.clearRect(0, 0, W, H); }

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

  function render() {
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(trail, 0, 0);
    drawChicken(chicken.x, chicken.y, chicken.heading);
  }

  function durationFor(op) {
    if (op.op === 'forward' || op.op === 'back') {
      return Math.max(50, Math.abs(op.arg) * speed.msPerUnit);
    }
    if (op.op === 'right' || op.op === 'left') {
      return Math.max(50, Math.abs(op.arg) * speed.msPerDeg);
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
    }
  }

  function startOp() {
    if (qi >= queue.length) { finish(false); return; }
    const op = queue[qi];
    opFrom = snapshot();
    opStart = performance.now();
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
    }

    render();

    if (t >= 1) {
      const tgt = targetOf(op, opFrom);
      chicken.x = tgt.x; chicken.y = tgt.y; chicken.heading = tgt.heading;
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
