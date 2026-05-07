// Wiring: editor ↔ parser ↔ coop, button handlers, localStorage.

const codeEl = document.getElementById('code');
const statusEl = document.getElementById('status');
const runBtn = document.getElementById('run');
const stopBtn = document.getElementById('stop');
const clearBtn = document.getElementById('clear');

const STARTER = `# welcome! press Run (or Ctrl+Enter)

repeat 4 [
  fd 100
  rt 90
]
`;

codeEl.value = localStorage.getItem('chicken.cluck') || STARTER;

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

runBtn.addEventListener('click', run);
stopBtn.addEventListener('click', () => Coop.stop());
clearBtn.addEventListener('click', () => {
  Coop.stop();
  Coop.reset();
  setStatus('cleared');
});

codeEl.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    run();
  }
});
