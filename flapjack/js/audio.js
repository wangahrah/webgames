// WebAudio synth — every sound is generated, no assets. Master gain modest:
// "audible, not jarring". Mute state lives in FlapjackScores.
(function (root) {
  'use strict';

  var ctx = null;
  var master = null;
  var noiseBuf = null;
  var flapCount = 0;

  function ensure() {
    if (ctx) return;
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.18;
    master.connect(ctx.destination);
    var len = ctx.sampleRate * 0.5;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }

  function resume() {
    ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume();
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  function osc(type, freq, t0, dur, vol, slideTo) {
    if (!ctx || !master) return;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  function noise(t0, dur, vol, freq) {
    if (!ctx || !master || !noiseBuf) return;
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    var f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = freq || 800;
    var g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  function muted() {
    return root.FlapjackScores ? root.FlapjackScores.getMuted() : false;
  }

  function flap(pitchSemitones, square) {
    resume();
    if (muted()) return;
    var base = 440 * Math.pow(2, (pitchSemitones || 0) / 12);
    var f = base * (1 + flapCount * 0.05);
    osc(square ? 'square' : 'sine', f, now(), 0.09, 0.16);
    osc('sine', f * 2, now(), 0.07, 0.05);
    flapCount = Math.min(flapCount + 1, 8);
  }

  function point() {
    resume();
    if (muted()) return;
    osc('sine', 880, now(), 0.1, 0.14);
  }

  function perfect() {
    resume();
    if (muted()) return;
    var t = now();
    osc('sine', 1046.5, t, 0.09, 0.15);
    osc('sine', 1318.5, t + 0.09, 0.14, 0.15);
  }

  function milestone() {
    resume();
    if (muted()) return;
    var t = now();
    osc('sine', 523.25, t, 0.09, 0.16);
    osc('sine', 659.25, t + 0.08, 0.09, 0.16);
    osc('sine', 783.99, t + 0.16, 0.16, 0.16);
  }

  function heartLost() {
    resume();
    if (muted()) return;
    var t = now();
    osc('sine', 392, t, 0.12, 0.15);
    osc('sine', 311.13, t + 0.12, 0.2, 0.14);
  }

  function crash() {
    resume();
    if (muted()) return;
    var t = now();
    osc('sine', 160, t, 0.28, 0.22, 70);
    noise(t, 0.16, 0.14, 900);
  }

  function fanfare() {
    resume();
    if (muted()) return;
    var t = now();
    var notes = [523.25, 659.25, 783.99, 1046.5];
    for (var i = 0; i < 4; i++) {
      osc('triangle', notes[i], t + i * 0.11, 0.16, 0.16);
    }
  }

  function resetStreak() { flapCount = 0; }

  var Audio = {
    ensure: ensure,
    resume: resume,
    flap: flap,
    point: point,
    perfect: perfect,
    milestone: milestone,
    heartLost: heartLost,
    crash: crash,
    fanfare: fanfare,
    resetStreak: resetStreak,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Audio;
  } else {
    root.FlapjackAudio = Audio;
  }
})(typeof window !== 'undefined' ? window : globalThis);