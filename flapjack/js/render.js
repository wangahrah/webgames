// Canvas renderer: sky, parallax, ground, obstacles, bird, particles, juice.
// All drawing happens in the fixed 420x640 logical playfield.
(function (root) {
  'use strict';

  var E = root.FlapjackEngine;
  var WIDTH = E.WIDTH, HEIGHT = E.HEIGHT, GROUND_H = E.GROUND_H;
  var GROUND_Y = HEIGHT - GROUND_H;
  var BIRD_X = E.BIRD_X;

  var layouts = new Map();

  function hashStr(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function layoutFor(key, count, gen) {
    if (!layouts.has(key)) {
      var rng = E.mulberry32(hashStr(key));
      var arr = [];
      for (var i = 0; i < count; i++) arr.push(gen(rng, i));
      layouts.set(key, arr);
    }
    return layouts.get(key);
  }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') {
      ctx.roundRect(x, y, w, h, r);
    } else {
      ctx.rect(x, y, w, h); // fallback for very old browsers
    }
  }

  function drawSky(ctx, theme) {
    var sky = theme.sky;
    var g = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    if (sky.length === 2) {
      g.addColorStop(0, sky[0]);
      g.addColorStop(1, sky[1]);
    } else {
      g.addColorStop(0, sky[0]);
      g.addColorStop(0.5, sky[1]);
      g.addColorStop(1, sky[2]);
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
  }

  // ---- parallax layers -----------------------------------------------------

  function drawRainbow(ctx, layer, time, offset) {
    var els = layoutFor('rainbow:' + layer.color, layer.count, function (rng) {
      return { x: rng(), y: 90 + rng() * 260, size: 26 + rng() * 34, phase: rng() * 6.28 };
    });
    var hues = ['#ff5f6d', '#ffb545', '#ffe85a', '#5fe06a', '#4db8ff', '#a86aff'];
    ctx.lineCap = 'round';
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var x = wrapX(el.x * WIDTH - offset);
      var alpha = 0.5 + 0.5 * Math.abs(Math.sin(time * 0.5 + el.phase));
      for (var c = 0; c < 6; c++) {
        ctx.strokeStyle = hues[c];
        ctx.globalAlpha = 0.35 + alpha * 0.4;
        ctx.lineWidth = 7 - c * 0.6;
        ctx.beginPath();
        ctx.arc(x, el.y, el.size + c * 6, Math.PI, 2 * Math.PI);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawClouds(ctx, layer, time, offset) {
    var els = layoutFor('clouds:' + layer.color, layer.count, function (rng) {
      return { x: rng(), y: 40 + rng() * 220, size: 0.5 + rng() * 0.7, phase: rng() * 6.28 };
    });
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var x = wrapX(el.x * WIDTH - offset);
      var y = el.y + Math.sin(time * 0.4 + el.phase) * 6;
      var s = el.size;
      ctx.fillStyle = layer.color;
      ctx.globalAlpha = 0.85;
      cloudBlob(ctx, x, y, s);
    }
    ctx.globalAlpha = 1;
  }

  function cloudBlob(ctx, x, y, s) {
    ctx.beginPath();
    ctx.arc(x, y, 22 * s, 0, 6.2832);
    ctx.arc(x + 24 * s, y - 10 * s, 18 * s, 0, 6.2832);
    ctx.arc(x + 46 * s, y, 20 * s, 0, 6.2832);
    ctx.arc(x + 24 * s, y + 6 * s, 24 * s, 0, 6.2832);
    ctx.fill();
  }

  function drawStars(ctx, layer, time, offset) {
    var els = layoutFor('stars:' + layer.color, layer.count, function (rng) {
      return { x: rng(), y: rng() * (HEIGHT - GROUND_H - 40), size: 0.6 + rng() * 1.4, phase: rng() * 6.28 };
    });
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var x = wrapX(el.x * WIDTH - offset);
      var a = 0.35 + 0.65 * Math.abs(Math.sin(time * 1.2 + el.phase));
      ctx.fillStyle = layer.color;
      ctx.globalAlpha = a;
      ctx.fillRect(x, el.y, el.size, el.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawBubbles(ctx, layer, time, offset) {
    var els = layoutFor('bubbles:' + layer.color, layer.count, function (rng) {
      return { x: rng(), y: rng() * (HEIGHT - GROUND_H - 60), size: 2 + rng() * 6, phase: rng() * 6.28 };
    });
    ctx.strokeStyle = layer.color;
    ctx.lineWidth = 1.4;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var x = wrapX(el.x * WIDTH - offset);
      var y = el.y + Math.sin(time * 0.8 + el.phase) * 8;
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(x, y, el.size, 0, 6.2832);
      ctx.stroke();
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.arc(x - el.size * 0.3, y - el.size * 0.3, el.size * 0.25, 0, 6.2832);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawHills(ctx, layer, time, offset) {
    var els = layoutFor('hills:' + layer.color, layer.count, function (rng) {
      return { x: rng(), y: (HEIGHT - GROUND_H) * (0.45 + rng() * 0.35), size: 90 + rng() * 120, phase: rng() * 6.28 };
    });
    ctx.fillStyle = layer.color;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var x = wrapX(el.x * WIDTH - offset);
      ctx.beginPath();
      ctx.arc(x, el.y, el.size, Math.PI, 2 * Math.PI);
      ctx.lineTo(x + el.size, HEIGHT - GROUND_H);
      ctx.lineTo(x - el.size, HEIGHT - GROUND_H);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawWaves(ctx, layer, time, offset) {
    var els = layoutFor('waves:' + layer.color, layer.count, function (rng) {
      return { y: 40 + rng() * (HEIGHT - GROUND_H - 90), amp: 6 + rng() * 10, phase: rng() * 6.28 };
    });
    ctx.strokeStyle = layer.color;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      for (var x = -10; x <= WIDTH + 10; x += 10) {
        var y = el.y + Math.sin(x / 42 + el.phase + offset / 40) * el.amp;
        if (x === -10) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawTrees(ctx, layer, time, offset) {
    var els = layoutFor('trees:' + layer.color, layer.count, function (rng) {
      return { x: rng(), size: 0.7 + rng() * 0.6, phase: rng() * 6.28 };
    });
    ctx.strokeStyle = layer.color;
    ctx.lineCap = 'round';
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var x = wrapX(el.x * WIDTH - offset);
      var baseY = (HEIGHT - GROUND_H) * (0.7 + el.phase * 0.05);
      var h = 110 * el.size;
      ctx.lineWidth = 10 * el.size;
      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.lineTo(x, baseY - h);
      ctx.stroke();
      ctx.lineWidth = 6 * el.size;
      ctx.beginPath();
      ctx.moveTo(x, baseY - h * 0.7);
      ctx.lineTo(x - 30 * el.size, baseY - h * 0.9);
      ctx.moveTo(x, baseY - h * 0.45);
      ctx.lineTo(x + 26 * el.size, baseY - h * 0.75);
      ctx.moveTo(x, baseY - h * 0.2);
      ctx.lineTo(x - 22 * el.size, baseY - h * 0.4);
      ctx.stroke();
    }
  }

  function drawPlanets(ctx, layer, time, offset) {
    var els = layoutFor('planets:' + layer.color, layer.count, function (rng) {
      return { x: rng(), y: 40 + rng() * 200, size: 26 + rng() * 30, phase: rng() * 6.28, variant: rng() };
    });
    var bodies = [layer.color, '#7fa8ff', '#ff9a6a', '#9ae0a0', '#e0c7a0'];
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var x = wrapX(el.x * WIDTH - offset);
      var body = bodies[Math.floor(el.variant * bodies.length) % bodies.length];
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.arc(x, el.y, el.size, 0, 6.2832);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.beginPath();
      ctx.arc(x + el.size * 0.25, el.y, el.size * 0.9, 0, 6.2832);
      ctx.fill();
      ctx.strokeStyle = body;
      ctx.globalAlpha = 0.65;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.ellipse(x, el.y, el.size * 1.5, el.size * 0.35, -0.35, 0, 6.2832);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawPollen(ctx, layer, time, offset) {
    var els = layoutFor('pollen:' + layer.color, layer.count, function (rng) {
      return { x: rng(), y: rng() * (HEIGHT - GROUND_H), size: 1.5 + rng() * 2.5, phase: rng() * 6.28 };
    });
    ctx.fillStyle = layer.color;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var x = wrapX(el.x * WIDTH - offset) + Math.sin(time * 0.7 + el.phase) * 14;
      var y = el.y + Math.sin(time * 0.5 + el.phase * 1.7) * 10;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      ctx.arc(x, y, el.size, 0, 6.2832);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawCity(ctx, layer, time, offset) {
    var els = layoutFor('city:' + layer.color, layer.count, function (rng) {
      return { x: rng(), w: 30 + rng() * 40, h: 60 + rng() * 140, phase: rng() };
    });
    var groundTop = HEIGHT - GROUND_H;
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var x = wrapX(el.x * WIDTH - offset);
      ctx.fillStyle = layer.color;
      ctx.fillRect(x - el.w / 2, groundTop - el.h, el.w, el.h);
      if (el.phase > 0.5) {
        ctx.fillStyle = 'rgba(255,230,150,0.7)';
        var wy = groundTop - el.h + 10;
        for (var w = 0; w < 3; w++) {
          for (var k = 0; k < 3; k++) {
            ctx.fillRect(x - el.w / 2 + 6 + w * 12, wy + k * 22, 6, 9);
          }
        }
      }
    }
  }

  // Ghost theme's crescent moon, drifting with the slowest star layer.
  function drawMoon(ctx, time, scrollPx) {
    var off = time * scrollPx * 0.07;
    var x = wrapX(336 - off);
    var y = 64;
    ctx.save();
    ctx.shadowColor = 'rgba(255,244,200,0.6)';
    ctx.shadowBlur = 20;
    ctx.font = '40px ' + EMOJI_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🌙', x, y);
    ctx.restore();
  }

  function drawParallax(ctx, layer, time, scrollPx) {
    var offset = time * scrollPx * layer.speed;
    switch (layer.kind) {
      case 'rainbow': drawRainbow(ctx, layer, time, offset); break;
      case 'clouds': drawClouds(ctx, layer, time, offset); break;
      case 'stars': drawStars(ctx, layer, time, offset); break;
      case 'bubbles': drawBubbles(ctx, layer, time, offset); break;
      case 'hills': drawHills(ctx, layer, time, offset); break;
      case 'waves': drawWaves(ctx, layer, time, offset); break;
      case 'trees': drawTrees(ctx, layer, time, offset); break;
      case 'planets': drawPlanets(ctx, layer, time, offset); break;
      case 'pollen': drawPollen(ctx, layer, time, offset); break;
      case 'city': drawCity(ctx, layer, time, offset); break;
    }
  }

  function wrapX(x) {
    var w = x % WIDTH;
    return w < 0 ? w + WIDTH : w;
  }

  // ---- ground --------------------------------------------------------------

  function drawGround(ctx, theme, time, scrollPx) {
    var body = theme.ground.body, top = theme.ground.top;
    ctx.fillStyle = body;
    ctx.fillRect(0, GROUND_Y, WIDTH, GROUND_H);
    ctx.fillStyle = top;
    ctx.fillRect(0, GROUND_Y, WIDTH, 16);

    var step = 30;
    var offsetX = (time * scrollPx) % step;
    var isBee = theme.id === 'bee';
    for (var x = -step + offsetX; x < WIDTH + step; x += step) {
      if (isBee) {
        flowerTuft(ctx, x, GROUND_Y + 10, 4);
      } else {
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.beginPath();
        ctx.arc(x, GROUND_Y + 12, 4, 0, 6.2832);
        ctx.fill();
      }
    }

    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(0, GROUND_Y + 15, WIDTH, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(0, GROUND_Y + 1, WIDTH, 2);
  }

  function flowerTuft(ctx, x, y, s) {
    var petals = ['#ff8fc0', '#ffd04a', '#ffffff', '#9ad0ff', '#ff7a7a'];
    for (var i = 0; i < 5; i++) {
      var a = (i / 5) * 6.2832;
      ctx.fillStyle = petals[i];
      ctx.beginPath();
      ctx.arc(x + Math.cos(a) * 4 * s, y + Math.sin(a) * 4 * s, 2.6 * s, 0, 6.2832);
      ctx.fill();
    }
    ctx.fillStyle = '#c06a1a';
    ctx.beginPath();
    ctx.arc(x, y, 2.2 * s, 0, 6.2832);
    ctx.fill();
  }

  // ---- obstacles -----------------------------------------------------------

  function drawObstacle(ctx, theme, obstacle, time, moving) {
    var cy = E.gapCenterY(obstacle, time, moving);
    var topY1 = cy - obstacle.gap / 2;
    var bottomY0 = cy + obstacle.gap / 2;
    drawColumn(ctx, theme, obstacle.x, 0, topY1, 'bottom');
    drawColumn(ctx, theme, obstacle.x, bottomY0, GROUND_Y, 'top');
  }

  function drawColumn(ctx, theme, cx, y0, y1, face) {
    var o = theme.obstacle;
    var kind = o.kind;
    var half = E.OBSTACLE_W / 2;
    var x0 = cx - half, x1 = cx + half;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, E.OBSTACLE_W, y1 - y0);
    ctx.clip();

    switch (kind) {
      case 'pipe':
        ctx.fillStyle = o.color;
        ctx.fillRect(x0, y0, E.OBSTACLE_W, y1 - y0);
        break;
      case 'candy':
        ctx.fillStyle = o.color;
        ctx.fillRect(x0, y0, E.OBSTACLE_W, y1 - y0);
        ctx.strokeStyle = lighten(o.color, 0.55);
        ctx.lineWidth = 26;
        for (var sy = y0 - 40; sy < y1 + 40; sy += 52) {
          ctx.beginPath();
          ctx.moveTo(x0, sy + 26);
          ctx.lineTo(x1, sy - 26);
          ctx.stroke();
        }
        break;
      case 'brick':
        ctx.fillStyle = o.color;
        ctx.fillRect(x0, y0, E.OBSTACLE_W, y1 - y0);
        ctx.strokeStyle = lighten(o.color, 0.28);
        ctx.lineWidth = 3;
        var rowH = 24, br = 0;
        for (var rowY = y0; rowY < y1; rowY += rowH) {
          var off = (br % 2) * (E.OBSTACLE_W / 2);
          ctx.beginPath();
          ctx.moveTo(x0, rowY);
          ctx.lineTo(x1, rowY);
          ctx.stroke();
          for (var bx = x0 + off; bx < x1 + E.OBSTACLE_W; bx += E.OBSTACLE_W) {
            ctx.beginPath();
            ctx.moveTo(bx, rowY);
            ctx.lineTo(bx, rowY + rowH);
            ctx.stroke();
          }
          br++;
        }
        break;
      case 'rocket':
        var metal = ctx.createLinearGradient(x0, 0, x1, 0);
        metal.addColorStop(0, lighten(o.color, -0.2));
        metal.addColorStop(0.45, o.color);
        metal.addColorStop(1, lighten(o.color, 0.35));
        ctx.fillStyle = metal;
        ctx.fillRect(x0, y0, E.OBSTACLE_W, y1 - y0);
        ctx.fillStyle = lighten(o.color, 0.5);
        ctx.fillRect(cx - 4, y0, 8, y1 - y0);
        ctx.fillStyle = o.accent;
        ctx.beginPath();
        ctx.arc(cx, face === 'top' ? y0 + 26 : y1 - 26, 7, 0, 6.2832);
        ctx.fill();
        break;
      case 'tower':
        ctx.fillStyle = o.color;
        ctx.fillRect(x0, y0, E.OBSTACLE_W, y1 - y0);
        ctx.strokeStyle = lighten(o.color, 0.22);
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(cx, y0);
        ctx.lineTo(cx, y1);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(x0, y0 + 14);
        ctx.lineTo(x1, y0 + 14);
        ctx.moveTo(x0, y0 + 44);
        ctx.lineTo(x1, y0 + 44);
        ctx.stroke();
        break;
      case 'coral':
        ctx.fillStyle = o.color;
        ctx.fillRect(x0, y0, E.OBSTACLE_W, y1 - y0);
        ctx.fillStyle = lighten(o.color, 0.35);
        var n = 5;
        for (var bi = 0; bi < n; bi++) {
          var by = y0 + ((y1 - y0) * (bi + 0.5)) / n;
          var side = bi % 2 === 0 ? -1 : 1;
          ctx.beginPath();
          ctx.arc(cx + side * 18, by, 9, 0, 6.2832);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(cx - side * 18, by + 20, 6, 0, 6.2832);
          ctx.fill();
        }
        break;
      case 'flower':
        ctx.fillStyle = o.color;
        ctx.fillRect(x0, y0, E.OBSTACLE_W, y1 - y0);
        ctx.fillStyle = lighten(o.color, 0.2);
        var leafY = y0;
        while (leafY < y1) {
          var lx = cx + 20;
          ctx.beginPath();
          ctx.ellipse(lx, leafY, 12, 5, 0, 0, 6.2832);
          ctx.fill();
          ctx.beginPath();
          ctx.ellipse(lx - 40, leafY + 18, 12, 5, 0, 0, 6.2832);
          ctx.fill();
          leafY += 46;
        }
        break;
    }
    ctx.restore();

    // face-end decorations
    var faceCenter = face === 'top' ? y0 : y1;
    switch (kind) {
      case 'pipe':
        ctx.fillStyle = o.accent;
        rr(ctx, cx - half - 6, face === 'top' ? y0 : y1 - 24, E.OBSTACLE_W + 12, 24, 4);
        ctx.fill();
        break;
      case 'candy':
        ctx.fillStyle = lighten(o.color, 0.3);
        rr(ctx, cx - half, face === 'top' ? y0 : y1 - 22, E.OBSTACLE_W, 22, 10);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.globalAlpha = 0.85;
        rr(ctx, cx - half + 6, face === 'top' ? y0 + 8 : y1 - 12, 10, 6, 3);
        ctx.fill();
        ctx.globalAlpha = 1;
        break;
      case 'brick':
        ctx.fillStyle = lighten(o.color, -0.3);
        rr(ctx, cx - half, face === 'top' ? y0 : y1 - 16, E.OBSTACLE_W, 16, 3);
        ctx.fill();
        break;
      case 'rocket':
        ctx.fillStyle = o.color;
        ctx.fillStyle = lighten(o.color, 0.1);
        var finW = 26, finH = 18;
        ctx.beginPath();
        if (face === 'top') {
          ctx.moveTo(x0, y0); ctx.lineTo(x0 - finW, y0 - finH); ctx.lineTo(cx - 8, y0);
          ctx.moveTo(x1, y0); ctx.lineTo(x1 + finW, y0 - finH); ctx.lineTo(cx + 8, y0);
        } else {
          ctx.moveTo(x0, y1); ctx.lineTo(x0 - finW, y1 + finH); ctx.lineTo(cx - 8, y1);
          ctx.moveTo(x1, y1); ctx.lineTo(x1 + finW, y1 + finH); ctx.lineTo(cx + 8, y1);
        }
        ctx.fill();
        ctx.fillStyle = o.accent;
        ctx.beginPath();
        if (face === 'top') {
          ctx.moveTo(x0 - finW, y0 - finH); ctx.lineTo(x0 - finW + 8, y0 - finH - 6); ctx.lineTo(x0 - finW + 6, y0 - finH);
          ctx.moveTo(x1 + finW, y0 - finH); ctx.lineTo(x1 + finW - 8, y0 - finH - 6); ctx.lineTo(x1 + finW - 6, y0 - finH);
        } else {
          ctx.moveTo(x0 - finW, y1 + finH); ctx.lineTo(x0 - finW + 8, y1 + finH + 6); ctx.lineTo(x0 - finW + 6, y1 + finH);
          ctx.moveTo(x1 + finW, y1 + finH); ctx.lineTo(x1 + finW - 8, y1 + finH + 6); ctx.lineTo(x1 + finW - 6, y1 + finH);
        }
        ctx.fill();
        break;
      case 'tower':
        ctx.fillStyle = lighten(o.color, 0.3);
        var mw = 18, mh = 14;
        for (var m = -1; m <= 1; m++) {
          rr(ctx, cx + m * mw - 7, face === 'top' ? y0 - mh + 2 : y1 - 2, 14, mh, 2);
          ctx.fill();
        }
        ctx.fillStyle = o.accent;
        rr(ctx, cx - half, face === 'top' ? y0 : y1 - 8, E.OBSTACLE_W, 8, 2);
        ctx.fill();
        break;
      case 'coral':
        ctx.fillStyle = lighten(o.color, 0.45);
        ctx.beginPath();
        if (face === 'top') {
          ctx.arc(cx - 14, y0 + 8, 8, 0, 6.2832);
          ctx.arc(cx + 10, y0 + 4, 7, 0, 6.2832);
          ctx.arc(cx, y0 - 4, 9, 0, 6.2832);
        } else {
          ctx.arc(cx - 12, y1 - 8, 8, 0, 6.2832);
          ctx.arc(cx + 12, y1 - 6, 7, 0, 6.2832);
          ctx.arc(cx, y1 + 2, 9, 0, 6.2832);
        }
        ctx.fill();
        break;
      case 'flower':
        drawFlowerHead(ctx, cx, faceCenter, o.accent);
        break;
    }

    if (o.deco) {
      ctx.font = '22px "Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(o.deco, cx, face === 'top' ? y0 + 30 : y1 - 30);
    }
  }

  function drawFlowerHead(ctx, cx, cy, color) {
    ctx.fillStyle = color;
    for (var i = 0; i < 7; i++) {
      var a = (i / 7) * 6.2832;
      ctx.beginPath();
      ctx.ellipse(cx + Math.cos(a) * 14, cy + Math.sin(a) * 14, 10, 6, a, 0, 6.2832);
      ctx.fill();
    }
    ctx.fillStyle = '#ffd94a';
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, 6.2832);
    ctx.fill();
  }

  function lighten(hex, amt) {
    var n = parseInt(hex.slice(1), 16);
    var r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    if (amt < 0) {
      r = Math.max(0, Math.round(r * (1 + amt)));
      g = Math.max(0, Math.round(g * (1 + amt)));
      b = Math.max(0, Math.round(b * (1 + amt)));
    } else {
      r = Math.min(255, Math.round(r + (255 - r) * amt));
      g = Math.min(255, Math.round(g + (255 - g) * amt));
      b = Math.min(255, Math.round(b + (255 - b) * amt));
    }
    return 'rgb(' + r + ',' + g + ',' + b + ')';
  }

  // ---- bird ----------------------------------------------------------------

  var EMOJI_FONT = '"Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", "Twemoji Mozilla", sans-serif';

  function drawBird(ctx, theme, bird) {
    // ground shadow (hops up briefly on flap)
    var prox = (bird.y - HEIGHT * 0.5) / (GROUND_Y - HEIGHT * 0.5);
    if (prox > 0) {
      var s = Math.min(1, prox);
      var hop = bird.squash * 6;
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.ellipse(BIRD_X, GROUND_Y + 10 - hop, 16 + 8 * s + bird.squash * 3, 4.5, 0, 0, 6.2832);
      ctx.fill();
    }

    var sx = 1 + 0.25 * bird.squash;
    var sy = 1 - 0.2 * bird.squash;
    ctx.save();
    ctx.translate(BIRD_X, bird.y);
    ctx.rotate(-bird.rot); // engine rot is nose-up positive; canvas rotate is clockwise
    ctx.scale(sx, sy);
    ctx.font = '56px ' + EMOJI_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(theme.emoji, 0, 2);
    ctx.restore();
  }

  // ---- particles -----------------------------------------------------------

  var CONFETTI_COLORS = ['#ff5f6d', '#ffb545', '#ffe85a', '#5fe06a', '#4db8ff', '#a86aff', '#ff8fd6'];

  function drawParticles(ctx, particles) {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      var ratio = p.life / p.maxLife;
      switch (p.type) {
        case 'puff':
          ctx.fillStyle = p.color;
          ctx.globalAlpha = ratio * p.alpha;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.6 - ratio * 0.6), 0, 6.2832);
          ctx.fill();
          break;
        case 'trail':
          ctx.fillStyle = p.color;
          ctx.globalAlpha = ratio * 0.8;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * ratio, 0, 6.2832);
          ctx.fill();
          break;
        case 'ember':
          ctx.fillStyle = p.color;
          ctx.globalAlpha = ratio;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, 6.2832);
          ctx.fill();
          break;
        case 'bubble':
          ctx.strokeStyle = p.color;
          ctx.globalAlpha = ratio * 0.7;
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, 6.2832);
          ctx.stroke();
          break;
        case 'snow':
          ctx.fillStyle = p.color;
          ctx.globalAlpha = ratio;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, 6.2832);
          ctx.fill();
          break;
        case 'pollen':
          ctx.fillStyle = p.color;
          ctx.globalAlpha = ratio * 0.8;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, 6.2832);
          ctx.fill();
          break;
        case 'spark':
          ctx.fillStyle = p.color;
          ctx.globalAlpha = ratio;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, 6.2832);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,' + (0.5 * ratio) + ')';
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 0.45, 0, 6.2832);
          ctx.fill();
          break;
        case 'ring':
          ctx.strokeStyle = p.color;
          ctx.globalAlpha = ratio;
          ctx.lineWidth = 3 + ratio * 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1 - ratio), 0, 6.2832);
          ctx.stroke();
          break;
        case 'confetti':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = ratio;
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
          ctx.restore();
          break;
        case 'sparkleEmoji':
          ctx.font = p.size + 'px ' + EMOJI_FONT;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.globalAlpha = ratio;
          ctx.fillText('✨', p.x, p.y);
          break;
      }
    }
    ctx.globalAlpha = 1;
  }

  var Render = {
    drawSky: drawSky,
    drawParallax: drawParallax,
    drawGround: drawGround,
    drawObstacle: drawObstacle,
    drawBird: drawBird,
    drawParticles: drawParticles,
    drawMoon: drawMoon,
    lighten: lighten,
    GROUND_Y: GROUND_Y,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Render;
  } else {
    root.FlapjackRender = Render;
  }
})(typeof window !== 'undefined' ? window : globalThis);