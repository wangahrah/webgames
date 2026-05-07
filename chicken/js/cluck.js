// Cluck-speak parser: source text → command queue.
//
// Grammar:
//   program  := statement*
//   statement := command | repeat | comment
//   command  := word number?
//   repeat   := "repeat" number "[" statement* "]"
//   comment  := "#" ... end of line

class CluckError extends Error {
  constructor(message, line) { super(message); this.line = line; }
}

function tokenize(source) {
  const tokens = [];
  const lines = source.split('\n');
  for (let li = 0; li < lines.length; li++) {
    let line = lines[li];
    const hash = line.indexOf('#');
    if (hash >= 0) line = line.slice(0, hash);
    line = line.replace(/\[/g, ' [ ').replace(/\]/g, ' ] ');
    const parts = line.trim().split(/\s+/).filter(Boolean);
    for (const p of parts) tokens.push({ value: p, line: li + 1 });
  }
  return tokens;
}

class TokenStream {
  constructor(tokens) { this.tokens = tokens; this.idx = 0; }
  peek() { return this.tokens[this.idx]; }
  next() { return this.tokens[this.idx++]; }
  eof() { return this.idx >= this.tokens.length; }
}

function parseNumber(stream) {
  const t = stream.peek();
  if (!t) return null;
  if (t.value === '[' || t.value === ']') return null;
  const n = parseFloat(t.value);
  if (Number.isFinite(n) && /^-?\d+(\.\d+)?$/.test(t.value)) {
    stream.next();
    return n;
  }
  return null;
}

function parseWord(stream) {
  const t = stream.peek();
  if (!t) return null;
  if (t.value === '[' || t.value === ']') return null;
  if (/^-?\d+(\.\d+)?$/.test(t.value)) return null;
  stream.next();
  return { value: t.value.toLowerCase(), line: t.line };
}

function parseStatement(stream) {
  const tok = stream.next();
  if (!tok) return null;
  const word = tok.value.toLowerCase();

  if (word === '[' || word === ']') {
    throw new CluckError(`unexpected '${tok.value}'`, tok.line);
  }

  if (word === 'repeat') {
    const n = parseNumber(stream);
    if (n === null) {
      throw new CluckError(`'repeat' needs a number after it`, tok.line);
    }
    const open = stream.next();
    if (!open || open.value !== '[') {
      throw new CluckError(`'repeat ${n}' needs '[' to start the loop`, tok.line);
    }
    const body = [];
    while (!stream.eof() && stream.peek().value !== ']') {
      const stmt = parseStatement(stream);
      if (stmt) body.push(stmt);
    }
    if (stream.eof()) {
      throw new CluckError(`'repeat' loop is missing a closing ']'`, tok.line);
    }
    stream.next();
    return { type: 'repeat', n: Math.floor(n), body, line: tok.line };
  }

  const verb = resolveVerb(word);
  if (!verb) {
    const suggestion = suggestVerb(word);
    const hint = suggestion ? ` did you mean '${suggestion}'?` : '';
    throw new CluckError(`I don't know '${tok.value}'.${hint}`, tok.line);
  }

  const def = OPS[verb];
  let arg = null;
  if (def.arg === 'number') {
    arg = parseNumber(stream);
    if (arg === null) arg = def.defaultArg;
  } else if (def.arg === 'word') {
    const w = parseWord(stream);
    if (w === null) {
      throw new CluckError(`'${verb}' needs a word after it (try: ${def.values.join(', ')})`, tok.line);
    }
    if (def.values && !def.values.includes(w.value)) {
      const hint = nearestFromList(w.value, def.values);
      const tail = hint ? ` did you mean '${hint}'?` : ` try one of: ${def.values.join(', ')}`;
      throw new CluckError(`'${verb}' doesn't know '${w.value}'.${tail}`, w.line);
    }
    arg = w.value;
  }
  return { type: 'cmd', verb, arg, line: tok.line };
}

function parseProgram(source) {
  const stream = new TokenStream(tokenize(source));
  const stmts = [];
  while (!stream.eof()) {
    const s = parseStatement(stream);
    if (s) stmts.push(s);
  }
  return stmts;
}

function compileToQueue(ast) {
  const queue = [];
  function emit(node) {
    if (node.type === 'cmd') {
      queue.push({ op: node.verb, arg: node.arg, line: node.line });
    } else if (node.type === 'repeat') {
      for (let i = 0; i < node.n; i++) node.body.forEach(emit);
    }
  }
  ast.forEach(emit);
  return queue;
}

function compileCluck(source) {
  return compileToQueue(parseProgram(source));
}

// Pretty-printer: re-emits source with each statement on its own line and
// repeat blocks indented. Preserves comments (full-line and inline).
function formatCluck(source) {
  const INDENT = '  ';
  const stream = [];
  const srcLines = source.split('\n');

  for (const raw of srcLines) {
    let line = raw;
    let comment = null;
    const h = line.indexOf('#');
    if (h >= 0) {
      comment = line.slice(h).trim();
      line = line.slice(0, h);
    }
    line = line.replace(/\[/g, ' [ ').replace(/\]/g, ' ] ');
    const parts = line.trim().split(/\s+/).filter(Boolean);

    if (parts.length === 0) {
      if (comment !== null) stream.push({ type: 'comment', value: comment });
      continue;
    }
    const lineToks = parts.map(p => ({
      type: p === '[' ? 'open' : p === ']' ? 'close' : 'word',
      value: p,
    }));
    if (comment !== null) {
      lineToks[lineToks.length - 1].trailing = comment;
    }
    for (const t of lineToks) stream.push(t);
  }

  const isNum = t => t && t.type === 'word' && /^-?\d+(\.\d+)?$/.test(t.value);
  const out = [];
  let depth = 0;
  let i = 0;
  const peek = (off = 0) => stream[i + off];
  const take = () => stream[i++];
  const emit = text => out.push(INDENT.repeat(depth) + text);
  const withTrailing = (text, trailing) => trailing ? `${text} ${trailing}` : text;

  while (i < stream.length) {
    const tok = peek();

    if (tok.type === 'comment') { take(); emit(tok.value); continue; }

    if (tok.type === 'close') {
      take();
      depth = Math.max(0, depth - 1);
      emit(withTrailing(']', tok.trailing));
      continue;
    }

    if (tok.type === 'open') {
      take();
      emit(withTrailing('[', tok.trailing));
      depth++;
      continue;
    }

    const word = tok.value.toLowerCase();
    const startTok = take();
    const parts = [startTok.value];
    let trailing = startTok.trailing || null;

    if (word === 'repeat') {
      if (isNum(peek())) {
        const numTok = take();
        parts.push(numTok.value);
        if (numTok.trailing) trailing = numTok.trailing;
      }
      if (peek() && peek().type === 'open') {
        const openTok = take();
        parts.push('[');
        if (openTok.trailing) trailing = openTok.trailing;
        emit(withTrailing(parts.join(' '), trailing));
        depth++;
        continue;
      }
      emit(withTrailing(parts.join(' '), trailing));
      continue;
    }

    const verb = resolveVerb(word);
    if (verb) {
      const def = OPS[verb];
      const next = peek();
      if (def.arg === 'number' && isNum(next)) {
        const argTok = take();
        parts.push(argTok.value);
        if (argTok.trailing) trailing = argTok.trailing;
      } else if (def.arg === 'word' && next && next.type === 'word' && !isNum(next)) {
        const argTok = take();
        parts.push(argTok.value);
        if (argTok.trailing) trailing = argTok.trailing;
      }
    }

    emit(withTrailing(parts.join(' '), trailing));
  }

  return out.join('\n') + (out.length > 0 ? '\n' : '');
}
