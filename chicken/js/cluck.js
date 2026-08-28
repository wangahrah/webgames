// Cluck-speak parser: source text → command queue.
//
// Grammar:
//   program  := (statement | def)*
//   def      := "to" name statement* "end"   (top level only)
//   statement := command | repeat | comment
//   command  := word arg?
//   arg      := number | word | string
//   string   := '"' (any-but-quote)* '"'   (single line)
//   repeat   := "repeat" number "[" statement* "]"
//   comment  := "#" ... end of line (outside strings)
//
// `to` teaches the chicken a new word: the body is stored and replayed
// wherever the word is called. Teaching is free in the quest statement
// count; calling costs one, which is what makes a well-named word cheaper
// than either flat code or a plain loop.

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

function parseStatement(stream, defs) {
  const tok = stream.next();
  if (!tok) return null;
  const word = tok.value.toLowerCase();

  if (word === '[' || word === ']') {
    throw new CluckError(`unexpected '${tok.value}'`, tok.line);
  }

  if (word === 'to') {
    throw new CluckError(`you can't teach a new word inside something else — teach it at the top of your program`, tok.line);
  }
  if (word === 'end') {
    throw new CluckError(`'end' finishes a word you taught with 'to', but there is nothing to end here`, tok.line);
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
      const stmt = parseStatement(stream, defs);
      if (stmt) body.push(stmt);
    }
    if (stream.eof()) {
      throw new CluckError(`'repeat' loop is missing a closing ']'`, tok.line);
    }
    stream.next();
    return { type: 'repeat', n: Math.floor(n), body, line: tok.line };
  }

  const verb = resolveVerb(word);
  if (!verb && defs && defs.has(word)) {
    return { type: 'call', name: word, line: tok.line };
  }
  if (!verb) {
    if (isStringToken(tok.value)) {
      throw new CluckError(`a string ${tok.value} doesn't go here on its own`, tok.line);
    }
    const own = defs ? nearestFromList(word, [...defs.keys()]) : null;
    const suggestion = own || suggestVerb(word);
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

// Words you may not teach, because the chicken already knows them.
const RESERVED_WORDS = ['to', 'end', 'repeat'];

function parseDefinition(stream, defs) {
  const toTok = stream.next(); // the 'to'
  const nameTok = stream.peek();
  if (!nameTok || nameTok.value === '[' || nameTok.value === ']' ||
      isStringToken(nameTok.value) || /^-?\d+(\.\d+)?$/.test(nameTok.value)) {
    throw new CluckError(`'to' needs a name for your new word (like: to wiggle)`, toTok.line);
  }
  stream.next();
  const name = nameTok.value.toLowerCase();

  if (RESERVED_WORDS.includes(name)) {
    throw new CluckError(`'${name}' is one of my words already — pick another name`, nameTok.line);
  }
  if (resolveVerb(name)) {
    throw new CluckError(`'${name}' is already chicken-speak — pick a new name`, nameTok.line);
  }
  if (defs.has(name)) {
    throw new CluckError(`you already taught me '${name}'`, nameTok.line);
  }

  const def = { type: 'def', name, body: [], line: toTok.line };
  // Registered before the body is parsed so the word can be used inside
  // itself; compileToQueue is what refuses actual recursion.
  defs.set(name, def);
  while (true) {
    if (stream.eof()) {
      throw new CluckError(`'to ${name}' is missing an 'end'`, toTok.line);
    }
    if (stream.peek().value.toLowerCase() === 'end') {
      stream.next();
      break;
    }
    const s = parseStatement(stream, defs);
    if (s) def.body.push(s);
  }
  return def;
}

function parseProgram(source) {
  const stream = new TokenStream(tokenize(source));
  const stmts = [];
  const defs = new Map();
  while (!stream.eof()) {
    if (stream.peek().value.toLowerCase() === 'to') {
      stmts.push(parseDefinition(stream, defs));
      continue;
    }
    const s = parseStatement(stream, defs);
    if (s) stmts.push(s);
  }
  return { ast: stmts, defs };
}

const MAX_CALL_DEPTH = 64;

function compileToQueue(ast, defs) {
  const queue = [];
  function emit(node, stack) {
    if (node.type === 'cmd') {
      queue.push({ op: node.verb, arg: node.arg, line: node.line });
    } else if (node.type === 'repeat') {
      for (let i = 0; i < node.n; i++) node.body.forEach(n => emit(n, stack));
    } else if (node.type === 'call') {
      const def = defs.get(node.name);
      if (!def) {
        throw new CluckError(`I don't know '${node.name}'`, node.line);
      }
      if (stack.includes(node.name)) {
        throw new CluckError(`${node.name} can't call itself — even chickens get dizzy`, node.line);
      }
      if (stack.length >= MAX_CALL_DEPTH) {
        throw new CluckError(`that's far too many words inside words`, node.line);
      }
      stack.push(node.name);
      def.body.forEach(n => emit(n, stack));
      stack.pop();
    }
    // 'def' nodes emit nothing — a word is called, not declared
  }
  ast.forEach(node => emit(node, []));
  return queue;
}

function compileCluck(source) {
  const { ast, defs } = parseProgram(source);
  return compileToQueue(ast, defs);
}

// How many statements the kid actually wrote — SOURCE statements, not the
// unrolled queue. `repeat 4 [ fd 100 rt 90 ]` is 3 (the repeat plus its two
// commands), where eight flat lines would be 8. Quest mode's par scores this,
// which is what makes a loop worth reaching for. Teaching a word with
// `to … end` is free; calling it costs one — naming a pattern is the win.
function cluckStatementCount(source) {
  const { ast } = parseProgram(source);
  function count(nodes) {
    let n = 0;
    for (const node of nodes) {
      if (node.type === 'def') continue;
      n++;
      if (node.type === 'repeat') n += count(node.body);
    }
    return n;
  }
  return count(ast);
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

    // Teaching a word: 'to name' rides one line, the body indents like a
    // repeat block, 'end' closes it.
    if (word === 'to') {
      if (peek() && peek().type === 'word' && peek().value !== 'end') {
        const nameTok = take();
        parts.push(nameTok.value);
        if (nameTok.trailing) trailing = nameTok.trailing;
      }
      emit(withTrailing(parts.join(' '), trailing));
      depth++;
      continue;
    }
    if (word === 'end') {
      depth = Math.max(0, depth - 1);
      emit(withTrailing('end', trailing));
      continue;
    }

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
