// Wiring: editor ↔ parser ↔ coop, button handlers, localStorage.

const codeEl = document.getElementById('code');
const statusEl = document.getElementById('status');
const runBtn = document.getElementById('run');
const stopBtn = document.getElementById('stop');
const clearBtn = document.getElementById('clear');
const formatBtn = document.getElementById('format');
const bannerEl = document.getElementById('code-banner');
const marksEl = document.getElementById('code-marks');
const modeDrawBtn = document.querySelector('.mode[data-mode="draw"]');
const modeQuestBtn = document.querySelector('.mode[data-mode="quest"]');

const STARTER = `# welcome! press Run (or Ctrl+Enter)

repeat 4 [
  fd 100
  rt 90
]
`;

const EXAMPLES = {
  square:
    'say "a perfect square!"\n' +
    'color blue\n' +
    'repeat 4 [\n' +
    '  fd 100\n' +
    '  cluck\n' +
    '  rt 90\n' +
    ']\n' +
    'lay\n',
  star:
    'color yellow\n' +
    'speed fast\n' +
    'say "stars!"\n' +
    'repeat 5 [\n' +
    '  fd 120\n' +
    '  lay\n' +
    '  cluck\n' +
    '  rt 144\n' +
    ']\n',
  flower:
    'color rainbow\n' +
    'speed fast\n' +
    'say "watch me bloom!"\n' +
    'repeat 8 [\n' +
    '  repeat 4 [\n' +
    '    fd 60\n' +
    '    rt 90\n' +
    '  ]\n' +
    '  cluck\n' +
    '  rt 45\n' +
    ']\n',
  rainbow:
    'say "rainbow time!"\n' +
    'speed fast\n' +
    'color rainbow\n' +
    'repeat 12 [\n' +
    '  fd 50\n' +
    '  rt 30\n' +
    ']\n' +
    'home\n' +
    'peck\n' +
    'cluck\n' +
    'say "tada!"\n',
  zoo:
    'say "welcome to the zoo!"\n' +
    'speed fast\n' +
    'color rainbow\n' +
    'be unicorn\n' +
    'repeat 3 [\n' +
    '  fd 80\n' +
    '  rt 120\n' +
    ']\n' +
    'be raccoon\n' +
    'say "sneaky!"\n' +
    'repeat 4 [\n' +
    '  fd 60\n' +
    '  rt 90\n' +
    ']\n' +
    'be dragon\n' +
    'say "rawr"\n' +
    'cluck\n' +
    'repeat 6 [\n' +
    '  fd 70\n' +
    '  rt 60\n' +
    ']\n' +
    'be chicken\n' +
    'lay\n' +
    'say "home again"\n',
};

codeEl.value = localStorage.getItem('chicken.cluck') || STARTER;

const ARG_HINTS = { number: ' N', word: ' name', text: ' "..."' };

function buildCheatsheet() {
  const el = document.getElementById('cheatsheet');
  const verbRows = Object.entries(OPS).map(([name, def]) => {
    const short = def.aliases[0];
    const label = short ? `${short} / ${name}` : name;
    const argHint = ARG_HINTS[def.arg] || '';
    return { cmd: label + argHint, desc: def.desc };
  });
  // `repeat` earns the third star on every quest level, so it sits with the
  // movement verbs at the top rather than below `peck` where nobody scrolls.
  const MOVES = 4;
  const all = [
    ...verbRows.slice(0, MOVES),
    { spacer: true }, ...SYNTAX_HELP, { spacer: true },
    ...verbRows.slice(MOVES),
  ];
  el.innerHTML =
    '<button class="cheatsheet-toggle" type="button" aria-expanded="true" aria-controls="cheatsheet-body">' +
      '<span class="cheatsheet-title">commands</span>' +
      '<span class="cheatsheet-chevron" aria-hidden="true">▾</span>' +
    '</button>' +
    '<div class="cheatsheet-body" id="cheatsheet-body"><table>' +
      all.map(r => r.spacer
        ? '<tr class="spacer"><td></td><td></td></tr>'
        : `<tr><td>${r.cmd}</td><td>${r.desc}</td></tr>`
      ).join('') +
    '</table></div>';

  const toggle = el.querySelector('.cheatsheet-toggle');
  const body = el.querySelector('.cheatsheet-body');
  const stored = localStorage.getItem('chicken.cheatsheet.open');
  setCheatsheetOpen(toggle, body, stored !== 'false');
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    setCheatsheetOpen(toggle, body, open);
    localStorage.setItem('chicken.cheatsheet.open', String(open));
  });
}

function setCheatsheetOpen(toggle, body, open) {
  toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  toggle.querySelector('.cheatsheet-chevron').textContent = open ? '▾' : '▸';
  body.hidden = !open;
}

buildCheatsheet();

// Where the editor's contents get remembered depends on which mode you are
// in: free draw has one draft, and each quest level keeps its own, so
// wandering into a puzzle and back never eats your drawing's code.
function persistDraft(code) {
  const lv = Quest.current();
  if (lv) Quest.setDraft(lv.id, code);
  else localStorage.setItem('chicken.cluck', code);
}

codeEl.addEventListener('input', () => {
  persistDraft(codeEl.value);
  // Stale feedback about code you have since changed is worse than none.
  hideBanner();
  setMark(null);
});

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('error', isError);
}

// The footer is 900px away from where a child is looking. Anything they have
// to act on goes in the banner directly above the code instead.
function showBanner(msg, kind) {
  bannerEl.textContent = msg;
  bannerEl.className = 'code-banner ' + kind;
  bannerEl.hidden = false;
}
function hideBanner() { bannerEl.hidden = true; }

// One highlight band behind the textarea. The textarea never wraps, so the
// line number is just a row offset; scrolling repositions it.
let mark = null;
function drawMark() {
  marksEl.innerHTML = '';
  if (!mark) return;
  const cs = getComputedStyle(codeEl);
  const lh = parseFloat(cs.lineHeight);
  const top = parseFloat(cs.paddingTop) + (mark.line - 1) * lh - codeEl.scrollTop;
  const band = document.createElement('div');
  band.className = 'mark ' + mark.kind;
  band.style.height = lh + 'px';
  band.style.top = top + 'px';
  marksEl.appendChild(band);
}
function setMark(line, kind) {
  mark = line ? { line, kind } : null;
  drawMark();
}
codeEl.addEventListener('scroll', drawMark);

// Put every popover under the button that opened it. Quest used to open on the
// far left while its button sat on the far right.
function anchorPopover(panel, btn) {
  const host = panel.offsetParent;
  if (!host || !btn) return;
  const hostLeft = host.getBoundingClientRect().left;
  const b = btn.getBoundingClientRect();
  const w = panel.offsetWidth;
  let left = b.left - hostLeft;
  // A wide panel near the right edge would get shoved sideways by the clamp
  // below and end up visibly detached from its button. Hang it from the
  // button's right edge instead, so the two still overlap.
  if (left + w > host.clientWidth - 8) left = (b.right - hostLeft) - w;
  panel.style.left = Math.max(8, Math.min(left, host.clientWidth - w - 8)) + 'px';
}

function run() {
  if (Coop.isRunning()) {
    setStatus('already running — press Stop first', true);
    return;
  }
  hideBanner();
  setMark(null);

  let queue, statements;
  try {
    queue = compileCluck(codeEl.value);
    statements = cluckStatementCount(codeEl.value);
  } catch (e) {
    if (e instanceof CluckError) {
      showBanner(`line ${e.line}: ${e.message}`, 'error');
      setMark(e.line, 'error');
      setStatus(`line ${e.line}: ${e.message}`, true);
    } else {
      showBanner(e.message, 'error');
      setStatus(`error: ${e.message}`, true);
      console.error(e);
    }
    return;
  }
  if (queue.length === 0) {
    showBanner('there is nothing to run yet — write a command first!', 'retry');
    setStatus('nothing to run');
    return;
  }
  // Running a level always starts it over, so a bump is one keypress from a
  // retry rather than a puzzle about leftover state.
  if (Quest.isActive()) Coop.reset();

  setStatus(`running ${queue.length} command${queue.length === 1 ? '' : 's'}…`);
  setRunning(true);
  Coop.play(queue, (interrupted, result) => {
    setRunning(false);
    setMark(null);
    if (interrupted) { setStatus('stopped'); return; }
    if (!result) {
      setStatus(`done — ran ${queue.length} command${queue.length === 1 ? '' : 's'}`);
      return;
    }
    reportQuestResult(result, statements);
  }, (line) => setMark(line, 'running'));
}

function setRunning(on) {
  stopBtn.disabled = !on;
  runBtn.disabled = on;
}
setRunning(false);

function tidy() {
  const before = codeEl.value;
  let after;
  try {
    after = formatCluck(before);
  } catch (e) {
    if (e instanceof CluckError) {
      setStatus(`line ${e.line}: ${e.message}`, true);
    } else {
      setStatus(`error: ${e.message}`, true);
      console.error(e);
    }
    return;
  }
  if (after === before) {
    setStatus('already tidy');
    return;
  }
  codeEl.value = after;
  persistDraft(after);
  setStatus('tidied');
}

function loadExample(key, label) {
  const program = EXAMPLES[key];
  if (!program) return;
  Coop.stop();
  codeEl.value = program;
  persistDraft(program);
  Saves.setLastSaved(null, program);
  setStatus(`loaded: ${label}`);
  renderScriptsList();
}

runBtn.addEventListener('click', run);
stopBtn.addEventListener('click', () => Coop.stop());
formatBtn.addEventListener('click', tidy);
clearBtn.addEventListener('click', () => {
  Coop.stop();
  setRunning(false);
  Coop.reset();
  setMark(null);
  hideBanner();
  setStatus(Quest.isActive() ? 'level reset' : 'reset');
});

document.querySelectorAll('button[data-example]').forEach(btn => {
  btn.addEventListener('click', () => {
    confirmIfDirty(() => {
      loadExample(btn.dataset.example, btn.textContent);
      closeAllPopovers();
    });
  });
});

codeEl.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    run();
  } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'F' || e.key === 'f')) {
    e.preventDefault();
    tidy();
  }
});

// ---- Animal picker ----------------------------------------------------------
// Which animal you *are* is a setting, not part of your script — it lives in
// its own localStorage key so it survives loading someone else's program.

const ANIMAL_KEY = 'chicken.animal';
const animalBtn = document.getElementById('animal-btn');
const animalPanel = document.getElementById('animal-panel');
const animalGrid = document.getElementById('animal-grid');

function setAnimal(name) {
  if (!ANIMALS[name]) name = DEFAULT_ANIMAL;
  Coop.setDefaultAnimal(name);
  localStorage.setItem(ANIMAL_KEY, name);
  animalBtn.textContent = `${ANIMALS[name]} Animal ▾`;
  animalBtn.title = `you are a ${name} — click to change`;
  markCurrentAnimal(name);
}

function markCurrentAnimal(name) {
  animalGrid.querySelectorAll('.animal-choice').forEach(b => {
    b.classList.toggle('current', b.dataset.animal === name);
  });
}

function buildAnimalGrid() {
  animalGrid.innerHTML = '';
  for (const [name, glyph] of Object.entries(ANIMALS)) {
    const b = document.createElement('button');
    b.className = 'animal-choice';
    b.dataset.animal = name;
    b.title = name;
    b.innerHTML = `<span class="animal-glyph">${glyph}</span><span class="animal-name">${name}</span>`;
    b.addEventListener('click', () => {
      setAnimal(name);
      setStatus(`you are a ${name}!`);
      closeAllPopovers();
    });
    animalGrid.appendChild(b);
  }
}

buildAnimalGrid();
setAnimal(localStorage.getItem(ANIMAL_KEY) || DEFAULT_ANIMAL);

animalBtn.addEventListener('click', () => {
  if (!animalPanel.hidden) {
    closeAllPopovers();
  } else {
    closeAllPopovers();
    markCurrentAnimal(Coop.getDefaultAnimal());
    animalPanel.hidden = false;
    anchorPopover(animalPanel, animalBtn);
    animalBtn.setAttribute('aria-expanded', 'true');
  }
});

// ---- Quest mode -------------------------------------------------------------
// Free draw asks nothing of you. A quest hands you a yard with fences, eggs
// and the odd fox, and your program either solves it or it doesn't. The level
// table lives in js/levels.js; everything here is the picker and the scoring
// readout.

const questPanel = document.getElementById('quest-panel');
const questList = document.getElementById('quest-list');

function starString(n) {
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n));
}

function renderQuestList() {
  const active = Quest.current();
  questList.innerHTML = '';
  for (const { level, progress } of Quest.list()) {
    const row = document.createElement('button');
    row.className = 'quest-row';
    if (active && active.id === level.id) row.classList.add('current');
    row.title = level.hint;
    row.innerHTML =
      `<span class="quest-name">${level.name}</span>` +
      `<span class="quest-stars${progress.stars ? ' earned' : ''}">${starString(progress.stars)}</span>`;
    row.addEventListener('click', () => {
      confirmIfDirty(() => {
        enterLevel(level.id);
        closeAllPopovers();
      });
    });
    questList.appendChild(row);
  }
}

// The header switch is the mode: 🎨 Draw or 🥚 Puzzles. The button label stays
// put — which level you are on is already written across the top of the yard.
function markMode(questing) {
  modeDrawBtn.classList.toggle('active', !questing);
  modeQuestBtn.classList.toggle('active', questing);
  document.body.classList.toggle('quest-mode', questing);
}

function enterLevel(id) {
  const lv = Quest.enter(id);
  if (!lv) return;
  Coop.stop();
  setRunning(false);
  Coop.setLevel(lv);
  const draft = Quest.getDraft(id);
  codeEl.value = (draft !== null && draft.trim() !== '') ? draft : lv.starter;
  Quest.setDraft(id, codeEl.value);
  markMode(true);
  setMark(null);
  showBanner(`${lv.name} — ${lv.hint}`, 'retry');
  setStatus(`${lv.name} — ${lv.hint}`);
}

function exitQuest() {
  Coop.stop();
  setRunning(false);
  Quest.leave();
  Coop.clearLevel();
  codeEl.value = localStorage.getItem('chicken.cluck') || STARTER;
  markMode(false);
  setMark(null);
  hideBanner();
  setStatus('free draw');
}

function reportQuestResult(result, statements) {
  const lv = Quest.current();
  if (!lv) return;
  const full = {
    outcome: result.outcome,
    eggsGot: result.eggsGot,
    eggsTotal: result.eggsTotal,
    commands: statements,
    par: lv.par,
  };
  const { stars } = Quest.record(lv.id, full);

  if (result.outcome === 'win') {
    const bits = [`🎉 solved!  ${starString(stars)}`];
    if (result.eggsTotal > 0) bits.push(`${result.eggsGot}/${result.eggsTotal} eggs`);
    bits.push(`${statements} command${statements === 1 ? '' : 's'} (par ${lv.par})`);
    if (stars < 3 && result.eggsGot >= result.eggsTotal) {
      bits.push('try it with fewer commands!');
    } else if (stars < 3) {
      bits.push('you missed an egg!');
    }
    const line = bits.join('   ·   ');
    showBanner(line, 'win');
    setStatus(line);
    renderQuestList();
    return;
  }
  const msg = {
    bump: '🚧 you bumped into a fence — press Run to try again',
    caught: '🦊 the fox got you — press Run to try again',
    locked: '🔒 the gate is locked — find the key first! — press Run to try again',
    unfinished: '🤔 your program ended before reaching the basket',
  }[result.outcome] || 'stopped';
  showBanner(msg, 'retry');
  setStatus(msg, result.outcome !== 'unfinished');
}

modeQuestBtn.addEventListener('click', () => {
  if (!questPanel.hidden) {
    closeAllPopovers();
  } else {
    closeAllPopovers();
    renderQuestList();
    questPanel.hidden = false;
    anchorPopover(questPanel, modeQuestBtn);
    modeQuestBtn.setAttribute('aria-expanded', 'true');
  }
});

modeDrawBtn.addEventListener('click', () => {
  closeAllPopovers();
  if (Quest.isActive()) exitQuest();
});

// ---- Save / Load / Delete ---------------------------------------------------

const saveBtn = document.getElementById('save-script');
const myScriptsBtn = document.getElementById('my-scripts');
const savePopover = document.getElementById('save-popover');
const saveNameInput = document.getElementById('save-name');
const saveConfirmBtn = document.getElementById('save-confirm');
const saveCancelBtn = document.getElementById('save-cancel');
const saveHint = document.getElementById('save-hint');
const scriptsPanel = document.getElementById('scripts-panel');
const scriptsList = document.getElementById('scripts-list');
const dirtyConfirm = document.getElementById('dirty-confirm');
const dirtySaveBtn = document.getElementById('dirty-save');
const dirtyThrowBtn = document.getElementById('dirty-throw');
const dirtyCancelBtn = document.getElementById('dirty-cancel');

let pendingAction = null;
let saveMode = 'new'; // 'new' | 'replace'

function isDirty() {
  // Quest drafts save themselves per level, so there is nothing to lose and
  // no reason to interrupt the kid with a "save first?" prompt.
  if (Quest.isActive()) return false;
  const draft = codeEl.value;
  const last = Saves.getLastSaved();
  if (last) return draft !== last.code;
  return draft.trim() !== '' && draft !== STARTER;
}

function closeAllPopovers() {
  animalPanel.hidden = true;
  animalBtn.setAttribute('aria-expanded', 'false');
  questPanel.hidden = true;
  modeQuestBtn.setAttribute('aria-expanded', 'false');
  savePopover.hidden = true;
  scriptsPanel.hidden = true;
  dirtyConfirm.hidden = true;
  myScriptsBtn.setAttribute('aria-expanded', 'false');
  saveHint.hidden = true;
  saveMode = 'new';
  saveConfirmBtn.textContent = 'Save';
  saveConfirmBtn.classList.remove('danger-btn');
  saveConfirmBtn.classList.add('popover-primary');
}

function cancelEverything() {
  closeAllPopovers();
  pendingAction = null;
}

function confirmIfDirty(action) {
  if (!isDirty()) {
    action();
    return;
  }
  pendingAction = action;
  closeAllPopovers();
  dirtyConfirm.hidden = false;
}

function openSavePopover(prefill) {
  closeAllPopovers();
  const last = Saves.getLastSaved();
  const fallback = (last && last.name) ? last.name : '';
  saveNameInput.value = prefill !== undefined ? prefill : fallback;
  savePopover.hidden = false;
  anchorPopover(savePopover, saveBtn);
  updateSaveValidity();
  saveNameInput.focus();
  saveNameInput.select();
}

function updateSaveValidity() {
  const raw = saveNameInput.value;
  const valid = Saves.isValidName(raw);
  saveConfirmBtn.disabled = !valid;
  // Any name change resets the replace-confirm flow.
  if (saveMode === 'replace') {
    saveMode = 'new';
    saveConfirmBtn.textContent = 'Save';
    saveConfirmBtn.classList.remove('danger-btn');
    saveConfirmBtn.classList.add('popover-primary');
  }
  if (!valid && raw.length > 0) {
    saveHint.textContent = 'type a name first';
    saveHint.hidden = false;
  } else {
    saveHint.hidden = true;
  }
}

function attemptSave() {
  const name = Saves.normalizeName(saveNameInput.value);
  if (!Saves.isValidName(name)) return;
  const existing = Saves.get(name);
  if (existing && saveMode !== 'replace') {
    saveMode = 'replace';
    saveConfirmBtn.textContent = `Replace "${existing.name}"`;
    saveConfirmBtn.classList.remove('popover-primary');
    saveConfirmBtn.classList.add('danger-btn');
    saveHint.textContent = 'click again to replace';
    saveHint.hidden = false;
    return;
  }
  doSave(name);
}

function doSave(name) {
  const code = codeEl.value;
  try {
    Saves.put(name, code);
  } catch (e) {
    if (e instanceof SavesQuotaError) {
      setStatus("couldn't save — try a shorter script", true);
    } else {
      setStatus(`couldn't save: ${e.message}`, true);
      console.error(e);
    }
    return;
  }
  Saves.setLastSaved(name, code);
  setStatus(`saved: ${name}`);
  closeAllPopovers();
  if (pendingAction) {
    const action = pendingAction;
    pendingAction = null;
    action();
  }
}

function loadSaved(name) {
  const entry = Saves.get(name);
  if (!entry) return;
  Coop.stop();
  codeEl.value = entry.code;
  persistDraft(entry.code);
  Saves.setLastSaved(entry.name, entry.code);
  setStatus(`loaded: ${entry.name}`);
  renderScriptsList();
}

function renderScriptsList() {
  const entries = Saves.list();
  const last = Saves.getLastSaved();
  const currentName = (last && last.name) ? last.name.toLowerCase() : null;

  scriptsList.innerHTML = '';
  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'scripts-empty';
    empty.textContent = 'No saved scripts yet. Click 💾 Save to keep one!';
    scriptsList.appendChild(empty);
    return;
  }
  for (const entry of entries) {
    const row = document.createElement('div');
    row.className = 'script-row';
    if (entry.name.toLowerCase() === currentName) row.classList.add('current');

    const loadBtn = document.createElement('button');
    loadBtn.className = 'script-load';
    loadBtn.textContent = entry.name;
    loadBtn.title = `load "${entry.name}"`;
    loadBtn.addEventListener('click', () => {
      confirmIfDirty(() => {
        loadSaved(entry.name);
        closeAllPopovers();
      });
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'script-delete';
    delBtn.textContent = '✕';
    delBtn.title = `delete "${entry.name}"`;
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      flipRowToConfirmDelete(row, entry.name);
    });

    row.appendChild(loadBtn);
    row.appendChild(delBtn);
    scriptsList.appendChild(row);
  }
}

function flipRowToConfirmDelete(row, name) {
  row.classList.add('confirming');
  row.innerHTML = '';

  const text = document.createElement('span');
  text.className = 'confirm-text';
  text.textContent = `Delete "${name}"?`;

  const yes = document.createElement('button');
  yes.className = 'danger-btn';
  yes.textContent = 'Yes';
  yes.addEventListener('click', (e) => {
    e.stopPropagation();
    Saves.remove(name);
    setStatus(`deleted: ${name}`);
    renderScriptsList();
  });

  const no = document.createElement('button');
  no.textContent = 'No';
  no.addEventListener('click', (e) => {
    e.stopPropagation();
    renderScriptsList();
  });

  row.appendChild(text);
  row.appendChild(yes);
  row.appendChild(no);
}

function openScriptsPanel() {
  closeAllPopovers();
  renderScriptsList();
  scriptsPanel.hidden = false;
  anchorPopover(scriptsPanel, myScriptsBtn);
  myScriptsBtn.setAttribute('aria-expanded', 'true');
}

// Wiring --------------------------------------------------------------

saveBtn.addEventListener('click', () => openSavePopover());
saveCancelBtn.addEventListener('click', () => cancelEverything());
saveConfirmBtn.addEventListener('click', () => attemptSave());
saveNameInput.addEventListener('input', updateSaveValidity);
saveNameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    attemptSave();
  } else if (e.key === 'Escape') {
    e.preventDefault();
    cancelEverything();
  }
});

myScriptsBtn.addEventListener('click', () => {
  if (!scriptsPanel.hidden) {
    closeAllPopovers();
  } else {
    openScriptsPanel();
  }
});

dirtySaveBtn.addEventListener('click', () => {
  // pendingAction stays — doSave will run it after success
  openSavePopover();
});
dirtyThrowBtn.addEventListener('click', () => {
  closeAllPopovers();
  const action = pendingAction;
  pendingAction = null;
  if (action) action();
});
dirtyCancelBtn.addEventListener('click', () => cancelEverything());

// Click-outside closes popovers. Treat all .examples-bar buttons as "inside"
// so clicking a preset button can open a dirty-confirm without the document
// handler immediately tearing it down.
document.addEventListener('click', (e) => {
  const inside = e.target.closest('.popover, button.example, button.mode, .examples-label');
  if (!inside) cancelEverything();
});

// Escape closes popovers
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && (
    !savePopover.hidden || !scriptsPanel.hidden || !dirtyConfirm.hidden ||
    !animalPanel.hidden || !questPanel.hidden
  )) {
    e.preventDefault();
    cancelEverything();
  }
});

// Ctrl/Cmd+S — global, opens the Save popover
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 's' || e.key === 'S')) {
    e.preventDefault();
    openSavePopover();
  }
});

// First-boot baseline: pin whatever's currently in the editor as the
// dirty-detection baseline. Subsequent boots reuse the stored baseline.
if (!Saves.getLastSaved()) {
  Saves.setLastSaved(null, codeEl.value);
}
