// Wiring: editor ↔ parser ↔ coop, button handlers, localStorage.

const codeEl = document.getElementById('code');
const statusEl = document.getElementById('status');
const runBtn = document.getElementById('run');
const stopBtn = document.getElementById('stop');
const clearBtn = document.getElementById('clear');
const formatBtn = document.getElementById('format');

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
};

codeEl.value = localStorage.getItem('chicken.cluck') || STARTER;

function buildCheatsheet() {
  const el = document.getElementById('cheatsheet');
  const verbRows = Object.entries(OPS).map(([name, def]) => {
    const short = def.aliases[0];
    const label = short ? `${short} / ${name}` : name;
    const argHint = def.arg === 'number' ? ' N' : '';
    return { cmd: label + argHint, desc: def.desc };
  });
  const all = [...verbRows, { spacer: true }, ...SYNTAX_HELP];
  const html = '<h3>commands</h3><table>' +
    all.map(r => r.spacer
      ? '<tr class="spacer"><td></td><td></td></tr>'
      : `<tr><td>${r.cmd}</td><td>${r.desc}</td></tr>`
    ).join('') +
    '</table>';
  el.innerHTML = html;
}
buildCheatsheet();

codeEl.addEventListener('input', () => {
  localStorage.setItem('chicken.cluck', codeEl.value);
});

function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle('error', isError);
}

function run() {
  if (Coop.isRunning()) {
    setStatus('already running — press Stop first', true);
    return;
  }
  let queue;
  try {
    queue = compileCluck(codeEl.value);
  } catch (e) {
    if (e instanceof CluckError) {
      setStatus(`line ${e.line}: ${e.message}`, true);
    } else {
      setStatus(`error: ${e.message}`, true);
      console.error(e);
    }
    return;
  }
  if (queue.length === 0) {
    setStatus('nothing to run');
    return;
  }
  setStatus(`running ${queue.length} command${queue.length === 1 ? '' : 's'}…`);
  Coop.play(queue, (interrupted) => {
    if (interrupted) setStatus('stopped');
    else setStatus(`done — ran ${queue.length} command${queue.length === 1 ? '' : 's'}`);
  });
}

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
  localStorage.setItem('chicken.cluck', after);
  setStatus('tidied');
}

function loadExample(key, label) {
  const program = EXAMPLES[key];
  if (!program) return;
  Coop.stop();
  codeEl.value = program;
  localStorage.setItem('chicken.cluck', program);
  Saves.setLastSaved(null, program);
  setStatus(`loaded: ${label}`);
  renderScriptsList();
}

runBtn.addEventListener('click', run);
stopBtn.addEventListener('click', () => Coop.stop());
formatBtn.addEventListener('click', tidy);
clearBtn.addEventListener('click', () => {
  Coop.stop();
  Coop.reset();
  setStatus('cleared');
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
  const draft = codeEl.value;
  const last = Saves.getLastSaved();
  if (last) return draft !== last.code;
  return draft.trim() !== '' && draft !== STARTER;
}

function closeAllPopovers() {
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
  localStorage.setItem('chicken.cluck', entry.code);
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
  const inside = e.target.closest('.popover, button.example, .examples-label');
  if (!inside) cancelEverything();
});

// Escape closes popovers
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && (
    !savePopover.hidden || !scriptsPanel.hidden || !dirtyConfirm.hidden
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
