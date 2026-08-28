// Cluck-speak parser: source text → command queue.
//
// Grammar:
//   program  := statement*
//   statement := command | repeat | comment
//   command  := word arg?
//   arg      := number | word | string
//   string   := '"' (any-but-quote)* '"'   (single line)
//   repeat   := "repeat" number "[" statement* "]"
//   comment  := "#" ... end of line (outside strings)

class CluckError extends Error {
  constructor(message, line) { super(message); this.line = line; }
}

// Line-level lexer shared by tokenize() and formatCluck().
// Returns { tokens: [string], comment: string|null }.
// Quoted strings are returned as a single token with quotes preserved.
// Brackets [ and ] are returned as their own single-char tokens.
// `#` outside a string starts a comment that runs to end of line.
function lexLine(line, lineNum) {
  const tokens = [];
  let comment = null;
  let buf = '';
  const flush = () => { if (buf.length > 0) { tokens.push(buf); buf = ''; } };

  let i = 0;
  while (i < line.length) {
    const ch = line[i];
    if (ch === '"') {
      flush();
      let str = '"';
      i++;
      while (i < line.length && line[i] !== '"') { str += line[i++]; }
      if (i >= line.length) {
        throw new CluckError(`unclosed string — needs a matching '"'`, lineNum);
      }
      str += '"';
      i++;
      tokens.push(str);
      continue;
    }
    if (ch === '#') {
      flush();
      comment = line.slice(i).trim();
      break;
    }
    if (ch === '[' || ch === ']') {
      flush();
      tokens.push(ch);
      i++;
      continue;
    }
    if (/\s/.test(ch)) {
      flush();
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  flush();
  return { tokens, comment };
}

function tokenize(source) {
  const tokens = [];
  const lines = source.split('\n');
  for (let li = 0; li < lines.length; li++) {
    const { tokens: lineToks } = lexLine(lines[li], li + 1);
    for (const v of lineToks) tokens.push({ value: v, line: li + 1 });
  }
  return tokens;
}

class TokenStream {
  constructor(tokens) { this.tokens = tokens; this.idx = 0; }
  peek() { return this.tokens[this.idx]; }
  next() { return this.tokens[this.idx++]; }
  eof() { return this.idx >= this.tokens.length; }
}

function isStringToken(value) {
  return typeof value === 'string' &&
         value.length >= 2 &&
         value[0] === '"' &&
         value[value.length - 1] === '"';
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
  if (isStringToken(t.value)) return null;
  stream.next();
  return { value: t.value.toLowerCase(), line: t.line };
}

function parseText(stream) {
  const t = stream.peek();
  if (!t) return null;
  if (!isStringToken(t.value)) return null;
  stream.next();
  return { value: t.value.slice(1, -1), line: t.line };
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
    if (isStringToken(tok.value)) {
      throw new CluckError(`a string ${tok.value} doesn't go here on its own`, tok.line);
    }
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
      const opts = def.valuesHint || def.values.join(', ');
      throw new CluckError(`'${verb}' needs a word after it (try: ${opts})`, tok.line);
    }
    if (def.values && !def.values.includes(w.value)) {
      const hint = nearestFromList(w.value, def.values);
      const opts = def.valuesHint || def.values.join(', ');
      const tail = hint ? ` did you mean '${hint}'?` : ` try one of: ${opts}`;
      throw new CluckError(`'${verb}' doesn't know '${w.value}'.${tail}`, w.line);
    }
    arg = w.value;
  } else if (def.arg === 'text') {
    const t = parseText(stream);
    if (t === null) {
      throw new CluckError(`'${verb}' needs some text in quotes (like ${verb} "hello")`, tok.line);
    }
    arg = t.value;
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
// repeat blocks indented. Preserves comments (full-line and inline) and
// quoted strings as single tokens.
function formatCluck(source) {
  const INDENT = '  ';
  const stream = [];
  const srcLines = source.split('\n');

  for (let li = 0; li < srcLines.length; li++) {
    const { tokens: lineToks, comment } = lexLine(srcLines[li], li + 1);

    if (lineToks.length === 0) {
      if (comment !== null) stream.push({ type: 'comment', value: comment });
      continue;
    }
    const wrapped = lineToks.map(v => ({
      type: v === '[' ? 'open' : v === ']' ? 'close' : 'word',
      value: v,
    }));
    if (comment !== null) {
      wrapped[wrapped.length - 1].trailing = comment;
    }
    for (const t of wrapped) stream.push(t);
  }

  const isNum = t => t && t.type === 'word' && /^-?\d+(\.\d+)?$/.test(t.value);
  const isStr = t => t && t.type === 'word' && isStringToken(t.value);
  const isPlainWord = t => t && t.type === 'word' && !isNum(t) && !isStr(t);

  const out = [];
  let depth = 0;
  let i = 0;
  const peek = () => stream[i];
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
      } else if (def.arg === 'word' && isPlainWord(next)) {
        const argTok = take();
        parts.push(argTok.value);
        if (argTok.trailing) trailing = argTok.trailing;
      } else if (def.arg === 'text' && isStr(next)) {
        const argTok = take();
        parts.push(argTok.value);
        if (argTok.trailing) trailing = argTok.trailing;
      }
    }

    emit(withTrailing(parts.join(' '), trailing));
  }

  return out.join('\n') + (out.length > 0 ? '\n' : '');
}
