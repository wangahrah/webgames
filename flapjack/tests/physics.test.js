// Engine physics / collision / scoring edge cases.
// Run from flapjack/: node tests/physics.test.js

const E = require('../js/engine.js');
const { DIFFICULTIES } = require('../js/themes.js');

const easy = DIFFICULTIES.find(d => d.id === 'easy');
const medium = DIFFICULTIES.find(d => d.id === 'medium');
const hard = DIFFICULTIES.find(d => d.id === 'hard');
const DT = 1 / 60;

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass++; console.log('  ✓', name); }
  catch (e) { fail++; console.log('  ✗', name, '\n     ', e.message); }
}
function eq(a, b) {
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    throw new Error(`got ${JSON.stringify(a)} want ${JSON.stringify(b)}`);
  }
}
function ok(v, msg) { if (!v) throw new Error(msg || `expected truthy, got ${v}`); }

function snapshot(w) {
  return {
    bird: w.bird, obstacles: w.obstacles, score: w.score,
    perfectStreak: w.perfectStreak, fire: w.fire, hearts: w.hearts,
    invincible: w.invincible, over: w.over, time: w.time, spawnTimer: w.spawnTimer,
  };
}

console.log('physics integration');

test('flap/gravity step is deterministic (same seed, same state)', () => {
  const a = E.createWorld(easy, 1234);
  const b = E.createWorld(easy, 1234);
  E.flap(a.bird);
  E.flap(b.bird);
  for (let i = 0; i < 400; i++) {
    E.worldStep(a, DT);
    E.worldStep(b, DT);
  }
  eq(snapshot(a), snapshot(b));
});

test('terminal rise and fall caps hold', () => {
  const bird = E.createBird();
  bird.vy = -10000;
  E.integrateBird(bird, DT);
  ok(bird.vy >= E.TERM_RISE - 1e-6, `rise cap violated: ${bird.vy}`);

  const bird2 = E.createBird();
  bird2.vy = 10000;
  E.integrateBird(bird2, DT);
  ok(bird2.vy <= E.TERM_FALL + 1e-6, `fall cap violated: ${bird2.vy}`);
});

test('flap impulse is exactly FLAP and starts rising', () => {
  const bird = E.createBird();
  E.flap(bird);
  eq(bird.vy, E.FLAP);
  ok(bird.squash === 1, 'squash set on flap');
});

test('perfect band is ±12% of gap', () => {
  const bird = E.createBird();
  bird.y = 320;
  const o = E.createObstacle(400, 320, 230, 0);
  ok(E.isPerfect(bird, o, 0, false), 'dead-center pass is perfect');
  bird.y = 320 + Math.floor(0.12 * 230);
  ok(E.isPerfect(bird, o, 0, false), 'boundary (inclusive) is perfect');
  bird.y = 320 + Math.floor(0.12 * 230) + 1;
  ok(!E.isPerfect(bird, o, 0, false), 'just outside band is not perfect');
});

console.log('\ncollision');

test('clear pass through a wide gap is not a hit', () => {
  const bird = E.createBird();
  bird.y = 200;
  const o = E.createObstacle(E.BIRD_X, 200, 230, 0);
  ok(!E.collides(bird, o, 1.0, 0, false), 'centered in gap should not collide');
});

test('edge graze at hitbox scale is a hit', () => {
  const bird = E.createBird();
  bird.y = 200;
  // gap center such that the top pipe bottom edge overlaps the bird's top by 1px
  const gapY = bird.y - E.BIRD_HALF_H + 1 + 230 / 2;
  const o = E.createObstacle(E.BIRD_X, gapY, 230, 0);
  ok(E.collides(bird, o, 1.0, 0, false), '1px vertical graze should collide');
});

test('smaller hitbox forgives an edge clip the full hitbox catches', () => {
  const bird = E.createBird();
  bird.y = 60;
  const o = E.createObstacle(E.BIRD_X + 40, 100, 50, 0);
  ok(E.collides(bird, o, 1.0, 0, false), 'full hitbox grazes the drawn pipe');
  ok(!E.collides(bird, o, 0.75, 0, false), '0.75 hitbox clears the narrower collision box');
});

test('collision width scales with hitbox', () => {
  const o = E.createObstacle(100, 300, 200, 0);
  const full = E.obstacleBoxes(o, 1.0, 0, false);
  const scaled = E.obstacleBoxes(o, 0.75, 0, false);
  eq(full.top.x1 - full.top.x0, E.OBSTACLE_W);
  eq(scaled.top.x1 - scaled.top.x0, Math.floor(E.OBSTACLE_W * 0.75));
});

console.log('\nceiling + floor');

test('ceiling soft-bounce never kills', () => {
  const w = E.createWorld(easy, 7);
  w.bird.y = 5;
  w.bird.vy = -500;
  E.worldStep(w, DT);
  ok(!w.over, 'ceiling bounce should not end the run');
  ok(w.bird.y >= E.CEILING_Y + E.BIRD_HALF_H, 'bird pushed below ceiling');
  ok(w.bird.vy >= 0, 'upward velocity killed at the ceiling');
});

test('floor always kills, even with hearts left', () => {
  const w = E.createWorld(easy, 8); // easy has 3 hearts, floor has no mercy
  w.bird.y = E.HEIGHT - E.GROUND_H - E.BIRD_HALF_H - 1;
  w.bird.vy = E.TERM_FALL;
  E.worldStep(w, DT);
  ok(w.over, 'floor crash ends the run');
  ok(w.lastEvents.some(e => e.type === 'over' && e.cause === 'floor'), 'over event has cause floor');
});

test('hard pipes move after score 10 but not before', () => {
  const w = E.createWorld(hard, 42);
  w.score = 5;
  const o = E.createObstacle(300, 320, hard.gap, 0);
  const before = E.gapCenterY(o, 1.0, false);
  const after = E.gapCenterY(o, 1.0, true);
  ok(before === 320, 'static gap before moving');
  ok(Math.abs(after - 320) <= E.MOVE_AMP + 1e-6, 'gap oscillates within ±amp after moving');
});

test('easy heart-loss clears the obstacle and grants invincibility', () => {
  const w = E.createWorld(easy, 9);
  w.spawnTimer = 100; // no new obstacles this step
  w.bird.y = 60;
  const o = E.createObstacle(E.BIRD_X, 100, 50, 0);
  w.obstacles = [o];
  E.worldStep(w, DT);
  ok(w.hearts === 2, 'lost one heart');
  ok(w.invincible > 0, 'invincible after hit');
  ok(w.obstacles.length === 0, 'hit obstacle cleared');
  ok(!w.over, 'still flying with hearts left');
  ok(w.lastEvents.some(e => e.type === 'heartLost'), 'heartLost event emitted');
});

test('medium is one life: a single hit ends the run', () => {
  const w = E.createWorld(medium, 10);
  w.bird.y = 60;
  const o = E.createObstacle(E.BIRD_X, 100, 50, 0);
  w.obstacles = [o];
  E.worldStep(w, DT);
  ok(w.over, 'medium dies in one hit');
});

test('passing scores 1; perfect scores 2', () => {
  const w = E.createWorld(medium, 11);
  w.spawnTimer = 100;
  w.bird.y = 320;
  const o = E.createObstacle(E.BIRD_X - 80, 320, medium.gap, 0); // already past the bird
  w.obstacles = [o];
  E.worldStep(w, DT);
  eq(w.score, 2, 'perfect pass awards 2');
  ok(w.lastEvents.some(e => e.type === 'perfect'), 'perfect event');

  const w2 = E.createWorld(medium, 12);
  w2.spawnTimer = 100;
  w2.bird.y = 320;
  const o2 = E.createObstacle(E.BIRD_X - 80, 200, medium.gap, 0); // off-center gap
  w2.obstacles = [o2];
  E.worldStep(w2, DT);
  eq(w2.score, 1, 'normal pass awards 1');
});

test('first obstacle spawns at least 1.5 screen-widths ahead', () => {
  const w = E.createWorld(easy, 13);
  E.spawnObstacle(w);
  ok(w.obstacles.length === 1, 'first obstacle spawned');
  ok(w.obstacles[0].x >= E.BIRD_X + 1.5 * E.WIDTH, 'first spawn distance respected');
});

test('deterministic gap positions from a fixed seed', () => {
  const a = E.createWorld(medium, 999);
  const b = E.createWorld(medium, 999);
  for (let i = 0; i < 200; i++) { E.worldStep(a, DT); E.worldStep(b, DT); }
  eq(a.obstacles.map(o => o.gapY), b.obstacles.map(o => o.gapY));
});

console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail === 0 ? 0 : 1);