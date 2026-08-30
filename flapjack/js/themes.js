// Themes + difficulties — single source of truth for everything themed.
// Every object in THEMES must carry every schema key below (tests enforce).
// Adding a theme = adding a row. Keep all emoji at Emoji 12.0 or older so the
// kids' machines never render a tofu box.
(function (root) {
  'use strict';

  var THEMES = [
    {
      id: 'unicorn',
      name: 'Unicorn',
      emoji: '🦄',
      sky: ['#ffd3f0', '#e3d9ff', '#c9f4ff'],
      ground: { top: '#ff9fd6', body: '#ffbce4' },
      parallax: [
        { kind: 'rainbow', color: '#ff9ad5', count: 6, speed: 0.12 },
        { kind: 'clouds', color: '#ffffff', count: 5, speed: 0.28 },
      ],
      obstacle: { kind: 'candy', color: '#ff5fae', accent: '#ffffff', deco: '⭐' },
      ambient: { kind: 'sparkle', rate: 0.02 },
      flapPitch: 3,
      squareWave: false,
    },
    {
      id: 'retro',
      name: 'Retro',
      emoji: '🍄',
      sky: ['#6aa6ff', '#3f72e8', '#2948b8'],
      ground: { top: '#5a3a1e', body: '#8a6a3a' },
      parallax: [
        { kind: 'clouds', color: '#eef4ff', count: 4, speed: 0.12 },
        { kind: 'hills', color: '#3f8f3f', count: 4, speed: 0.28 },
      ],
      obstacle: { kind: 'brick', color: '#c0392b', accent: '#e8c9a0', deco: null },
      ambient: { kind: 'star', rate: 0.015 },
      flapPitch: -2,
      squareWave: true,
    },
    {
      id: 'rocket',
      name: 'Rocket',
      emoji: '🚀',
      sky: ['#0b0b2e', '#1a1a4a', '#2e1b52'],
      ground: { top: '#4a4a6a', body: '#2e2e4a' },
      parallax: [
        { kind: 'stars', color: '#ffffff', count: 55, speed: 0.07 },
        { kind: 'planets', color: '#b08968', count: 3, speed: 0.16 },
        { kind: 'stars', color: '#ffd27f', count: 28, speed: 0.32 },
      ],
      obstacle: { kind: 'rocket', color: '#9aa5b1', accent: '#ff5252', deco: null },
      ambient: { kind: 'star', rate: 0.02 },
      flapPitch: 5,
      squareWave: false,
    },
    {
      id: 'dragon',
      name: 'Dragon',
      emoji: '🐉',
      sky: ['#ff8c5a', '#ffc15e', '#6a2c70'],
      ground: { top: '#3a1d0e', body: '#2a1408' },
      parallax: [
        { kind: 'hills', color: '#4a2416', count: 4, speed: 0.12 },
        { kind: 'clouds', color: '#7a4a2a', count: 5, speed: 0.26 },
      ],
      obstacle: { kind: 'tower', color: '#6b4a3a', accent: '#a8886a', deco: '🔥' },
      ambient: { kind: 'ember', rate: 0.025 },
      flapPitch: -3,
      squareWave: false,
    },
    {
      id: 'ghost',
      name: 'Ghost',
      emoji: '👻',
      sky: ['#0f1020', '#1c1d3c', '#2c2d58'],
      ground: { top: '#22233a', body: '#141526' },
      parallax: [
        { kind: 'stars', color: '#ffffff', count: 50, speed: 0.07 },
        { kind: 'trees', color: '#1a1b30', count: 5, speed: 0.24 },
      ],
      obstacle: { kind: 'tower', color: '#2d2f4c', accent: '#5a5d80', deco: '⭐' },
      ambient: { kind: 'star', rate: 0.015 },
      flapPitch: -5,
      squareWave: false,
    },
    {
      id: 'ocean',
      name: 'Ocean',
      emoji: '🐠',
      sky: ['#86d6ee', '#2f86c0', '#12406e'],
      ground: { top: '#e8c98a', body: '#c9a35a' },
      parallax: [
        { kind: 'waves', color: '#1f6794', count: 5, speed: 0.12 },
        { kind: 'bubbles', color: '#d6efff', count: 18, speed: 0.28 },
      ],
      obstacle: { kind: 'coral', color: '#ff6a7a', accent: '#ffb0a8', deco: '💧' },
      ambient: { kind: 'bubble', rate: 0.03 },
      flapPitch: 7,
      squareWave: false,
    },
    {
      id: 'bee',
      name: 'Bee',
      emoji: '🐝',
      sky: ['#fff0b8', '#aee36a', '#4a9a2a'],
      ground: { top: '#4a9a2a', body: '#34701d' },
      parallax: [
        { kind: 'hills', color: '#7ac46a', count: 3, speed: 0.1 },
        { kind: 'pollen', color: '#ffe066', count: 22, speed: 0.26 },
      ],
      obstacle: { kind: 'flower', color: '#3f8f2a', accent: '#ff6a9a', deco: '🍯' },
      ambient: { kind: 'pollen', rate: 0.03 },
      flapPitch: 9,
      squareWave: false,
    },
  ];

  var DIFFICULTIES = [
    { id: 'easy', name: 'Easy', emoji: '🌱', gap: 230, scroll: 130, spacing: 330, hitbox: 0.75, lives: 3, moving: false },
    { id: 'medium', name: 'Medium', emoji: '⚡', gap: 175, scroll: 165, spacing: 285, hitbox: 0.85, lives: 1, moving: false },
    { id: 'hard', name: 'Hard', emoji: '🔥', gap: 145, scroll: 200, spacing: 250, hitbox: 0.90, lives: 1, moving: true },
  ];

  var exports = { THEMES: THEMES, DIFFICULTIES: DIFFICULTIES };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  } else {
    root.FlapjackThemes = exports;
  }
})(typeof window !== 'undefined' ? window : globalThis);