// The valley, drawn. Reads World for where things are and Quest for what you
// have done; owns no state of its own and decides nothing -- a click is handed
// straight back out to app.js.
//
// The nodes are HTML BUTTONS positioned over an SVG, not shapes inside it. The
// SVG draws only the ground: region blobs and the paths between places. This
// is the same call the board already made in choosing DOM tiles over canvas --
// hit-testing, focus rings, keyboard access and text layout become the
// browser's problem instead of ours, and a kid who tabs through the map gets
// somewhere sensible for free.
//
// Named Valley and not Map, because `Map` is a JavaScript built-in and
// shadowing it globally is the kind of joke that takes an afternoon to find.

var Valley = (function () {
  const NS = 'http://www.w3.org/2000/svg';

  function el(tag, attrs) {
    const n = document.createElementNS(NS, tag);
    for (const k of Object.keys(attrs || {})) n.setAttribute(k, attrs[k]);
    return n;
  }

  function stateOf(row) {
    if (!row.unlocked) return 'locked';
    if (!row.built) return 'unbuilt';        // a place that exists but has no puzzle yet
    return row.stars > 0 ? 'done' : 'open';
  }

  // rows: Quest.list(). opts: {onPick(row), current: nodeId, fresh: nodeId}
  function render(root, rows, opts) {
    const o = opts || {};
    const byId = {};
    for (const r of rows) byId[r.node.id] = r;

    root.innerHTML = '';
    const V = World.VIEW;
    const svg = el('svg', {
      class: 'map-ground',
      viewBox: '0 0 ' + V.w + ' ' + V.h,
      // 'none', deliberately. The places on top are HTML positioned by
      // PERCENTAGE of this element; letterboxing the viewBox inside it (which
      // is what 'meet' does the moment the element is not 1000x700) makes the
      // two coordinate systems silently disagree, and the paths drift off the
      // places they connect. style.css pins the element to the same aspect
      // ratio, so nothing is actually stretched.
      preserveAspectRatio: 'none',
    });

    // ---- region patches, behind everything --------------------------------
    for (const region of World.REGIONS) {
      const mine = rows.filter((r) => r.node.region === region.id);
      if (!mine.length) continue;
      const open = mine.some((r) => r.unlocked);
      const b = World.regionBox(region.id);
      svg.appendChild(el('rect', {
        class: 'map-region' + (open ? '' : ' shut'),
        x: b.x, y: b.y, width: b.w, height: b.h, rx: 78,
        fill: region.tint,
      }));
      const label = el('text', {
        class: 'map-region-label' + (open ? '' : ' shut'),
        x: region.labelAt.x, y: region.labelAt.y,
      });
      label.textContent = region.glyph + '  ' + region.name +
        (open ? '' : '  · needs ★' + region.gateStars);
      svg.appendChild(label);
    }

    // ---- paths between places ---------------------------------------------
    for (const e of World.edges()) {
      const to = byId[e.to.id];
      svg.appendChild(el('line', {
        class: 'map-path' + (to && to.unlocked ? ' walked' : ''),
        x1: e.from.at.x, y1: e.from.at.y, x2: e.to.at.x, y2: e.to.at.y,
      }));
    }
    root.appendChild(svg);

    // ---- the places themselves --------------------------------------------
    for (const row of rows) {
      const st = stateOf(row);
      const b = document.createElement('button');
      b.className = 'mapnode is-' + st;
      b.dataset.id = row.node.id;
      b.dataset.state = st;
      if (row.node.id === o.current) b.classList.add('current');
      if (row.node.id === o.fresh) b.classList.add('fresh');
      b.style.left = (row.node.at.x / V.w * 100) + '%';
      b.style.top = (row.node.at.y / V.h * 100) + '%';
      b.title = st === 'locked' ? 'not open yet'
              : st === 'unbuilt' ? 'this part of the valley is still growing'
              : row.node.name;

      const dot = document.createElement('span');
      dot.className = 'mapnode-dot';
      // A locked place is a plain shut disc. Giving it a glyph of its own put
      // the same green leaf on twelve different circles, and a map where every
      // shut door looks identical to every open one is not a map.
      dot.textContent = st === 'locked' ? ''
                      : st === 'unbuilt' ? '·'
                      : (row.node.gives ? (World.itemById(row.node.gives) || {}).glyph || '★' : '');
      b.appendChild(dot);

      const name = document.createElement('span');
      name.className = 'mapnode-name';
      name.textContent = st === 'locked' ? '???' : row.node.name;
      b.appendChild(name);

      // Stars only once there are some: three grey pips under every unplayed
      // place turns a map into a chore list.
      if (row.stars > 0) {
        const s = document.createElement('span');
        s.className = 'mapnode-stars';
        for (let i = 0; i < 3; i++) {
          const p = document.createElement('span');
          p.textContent = '★';
          if (i >= row.stars) p.className = 'off';
          s.appendChild(p);
        }
        b.appendChild(s);
      }

      b.addEventListener('click', () => { if (o.onPick) o.onPick(row); });
      root.appendChild(b);
    }
  }

  return { render, stateOf };
})();

if (typeof module !== 'undefined' && module.exports) module.exports = Valley;
