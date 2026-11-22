// main.ts is mend, the CLI SPEC.md specifies, built from the kit's starting point (MIT). The starter did sections
// 1 to 4, 9 and 10 of SPEC.md: the command line, the output and exit codes, safe paths, format detection, JSON
// edits and the all-or-nothing write. Written for this entry: matching lines at three tiers (section 5), reading
// unified diffs (section 6), SEARCH/REPLACE blocks (section 7) and V4A patches (section 8), and the `R` output
// lines for move edits (section 2). Node 22, the standard library alone; run it as `node main.ts [options] [PATCH]`.
//
// In a trial the grader runs `node /bot/main.ts` with MAKEFUN_ENV_URL set, and then this file hands over to runner.ts
// (the last lines below): keep that hand-over and runner.ts as they are, and write the CLI.

import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';

const FORMATS = ['auto', 'unified', 'search-replace', 'v4a', 'json'];

class Exit2 {
  readonly line: string;
  constructor(line: string) {
    this.line = line;
  }
}
class Fail {
  readonly code: string;
  readonly path: string;
  constructor(code: string, path: string) {
    this.code = code;
    this.path = path;
  }
}

const blank = (s: string): boolean => s.trim() === '';

function patchLines(text: string): string[] {
  if (text === '') return [];
  const lines = text.split('\n');
  if (text.endsWith('\n')) lines.pop();
  return lines.map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
}

function safe(p: string): boolean {
  return p !== '' && !p.startsWith('/') && !p.includes('\\') && p.split('/').every((s) => s !== '' && s !== '.' && s !== '..');
}

/** A file as SPEC.md section 3 reads it: its own line break, its lines, and whether it ends with a break. */
interface FileModel {
  br: string;
  lines: string[];
  fin: boolean;
}

function parseFile(text: string): FileModel {
  if (text === '') return { br: '\n', lines: [], fin: false };
  const nl = text.indexOf('\n');
  const br = nl > 0 && text[nl - 1] === '\r' ? '\r\n' : '\n';
  const lines = text.split(br);
  const fin = text.endsWith(br);
  if (fin) lines.pop();
  return { br, lines, fin };
}

function writeFile(m: FileModel): string {
  return m.lines.length === 0 ? '' : m.lines.join(m.br) + (m.fin ? m.br : '');
}

/** One body line of a hunk, chunk or block: context, old-only, new-only, or a `\` marker (unified only). */
type BodyEntry = { k: 'c' | 'd' | 'a' | 'x'; t: string };

function bodyON(body: BodyEntry[]): { O: string[]; N: string[] } {
  const O: string[] = [];
  const N: string[] = [];
  for (const b of body) {
    if (b.k === 'c' || b.k === 'd') O.push(b.t);
    if (b.k === 'c' || b.k === 'a') N.push(b.t);
  }
  return { O, N };
}

const leadWS = (s: string): string => /^[ \t]*/.exec(s)![0];

function normLine(s: string, tier: number): string {
  if (tier === 0) return s;
  if (tier === 1) return s.replace(/[ \t]+$/, '');
  return s.replace(/^[ \t]+/, '').replace(/[ \t]+$/, '');
}

/** Every position at or after `from` where O's lines match the file's lines at this tier (positions may overlap). */
function occurrences(lines: string[], O: string[], tier: number, from = 0): number[] {
  const out: number[] = [];
  const no = O.map((l) => normLine(l, tier));
  for (let i = from; i + O.length <= lines.length; i += 1) {
    let ok = true;
    for (let j = 0; j < O.length; j += 1) {
      if (normLine(lines[i + j]!, tier) !== no[j]) {
        ok = false;
        break;
      }
    }
    if (ok) out.push(i);
  }
  return out;
}

/** Section 5: the first tier at which O occurs at least once, and its occurrences there. */
function findTier(lines: string[], O: string[], strict: boolean, from = 0): { tier: number; occ: number[] } | null {
  for (const tier of strict ? [0] : [0, 1, 2]) {
    const occ = occurrences(lines, O, tier, from);
    if (occ.length > 0) return { tier, occ };
  }
  return null;
}

/**
 * The lines a matched body writes (section 5): context lines come from the file itself, and at tier 2 every
 * other new line is re-indented from O's first line's prefix P to the file's first matched line's prefix F.
 */
function writtenLines(body: BodyEntry[], fileLines: string[], at: number, tier: number): string[] {
  const { O } = bodyON(body);
  const F = O.length > 0 ? leadWS(fileLines[at] ?? '') : '';
  const P = O.length > 0 ? leadWS(O[0]!) : '';
  const out: string[] = [];
  let oi = 0;
  for (const b of body) {
    if (b.k === 'x') continue;
    if (b.k === 'd') {
      oi += 1;
      continue;
    }
    if (b.k === 'c') {
      out.push(fileLines[at + oi]!);
      oi += 1;
      continue;
    }
    let line = b.t;
    if (tier === 2 && !/^[ \t]*$/.test(line) && line.startsWith(P)) line = F + line.slice(P.length);
    out.push(line);
  }
  return out;
}

function spliceLines(lines: string[], at: number, oLen: number, written: string[]): string[] {
  return [...lines.slice(0, at), ...written, ...lines.slice(at + oLen)];
}

/** The tree as the edits leave it: changed paths in `now` (null: deleted), the rest read from disk. */
class Tree {
  private readonly orig = new Map<string, string | null>();
  readonly now = new Map<string, string | null>();
  /** Move edits that ran, as [old, new] pairs, for the `R` output lines of section 2. */
  readonly moves: [string, string][] = [];
  original(p: string): string | null {
    if (!this.orig.has(p)) {
      let v: string | null = null;
      try {
        if (statSync(p).isFile()) v = readFileSync(p, 'utf8');
      } catch {
        v = null;
      }
      this.orig.set(p, v);
    }
    return this.orig.get(p)!;
  }
  get(p: string): string | null {
    return this.now.has(p) ? this.now.get(p)! : this.original(p);
  }
}

type Edit = (tree: Tree) => void;

function detect(lines: string[]): string | null {
  const first = lines.findIndex((l) => !blank(l));
  if (first < 0) return null;
  if (lines[first]!.trim() === '*** Begin Patch') return 'v4a';
  const c = lines[first]!.trimStart()[0];
  if (c === '[' || c === '{') return 'json';
  if (lines.some((l) => l.trimEnd() === '<<<<<<< SEARCH')) return 'search-replace';
  if (lines.some((l, i) => l.startsWith('diff --git ') || (l.startsWith('--- ') && (lines[i + 1] ?? '').startsWith('+++ ')))) return 'unified';
  return null;
}

/** One JSON edit object (SPEC.md section 9), or null when it is not one. */
function jsonEdit(v: unknown): Edit | null {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const p = o.path;
  if (typeof p !== 'string') return null;
  const exists = (tree: Tree): string => {
    if (!safe(p)) throw new Fail('unsafe', p);
    const t = tree.get(p);
    if (t === null) throw new Fail('missing', p);
    return t;
  };
  if (o.command === 'create' && typeof o.file_text === 'string') {
    const text = o.file_text;
    return (tree) => {
      if (!safe(p)) throw new Fail('unsafe', p);
      if (tree.get(p) !== null) throw new Fail('exists', p);
      tree.now.set(p, text);
    };
  }
  if (o.command === 'str_replace' && typeof o.old_str === 'string' && o.old_str !== '' && (o.new_str === undefined || typeof o.new_str === 'string')) {
    const oldStr = o.old_str;
    const newStr = (o.new_str as string | undefined) ?? '';
    return (tree) => {
      const before = exists(tree);
      const nl = before.indexOf('\n');
      const crlf = nl > 0 && before[nl - 1] === '\r';
      const lf = (s: string): string => (crlf ? s.replaceAll('\r\n', '\n') : s);
      const t = lf(before);
      const old = lf(oldStr);
      let count = 0;
      for (let k = t.indexOf(old); k >= 0; k = t.indexOf(old, k + 1)) count += 1;
      if (count === 0) throw new Fail('no-match', p);
      if (count > 1) throw new Fail('ambiguous', p);
      const at = t.indexOf(old);
      const out = t.slice(0, at) + lf(newStr) + t.slice(at + old.length);
      tree.now.set(p, crlf ? out.replaceAll('\n', '\r\n') : out);
    };
  }
  if (o.command === 'insert' && typeof o.insert_line === 'number' && Number.isInteger(o.insert_line) && typeof o.new_str === 'string') {
    const line = o.insert_line;
    const add = patchLines(o.new_str);
    return (tree) => {
      const before = exists(tree);
      const nl = before.indexOf('\n');
      const br = nl > 0 && before[nl - 1] === '\r' ? '\r\n' : '\n';
      const lines = before === '' ? [] : before.split(br);
      const final = before !== '' && before.endsWith(br);
      if (final) lines.pop();
      if (line < 0 || line > lines.length) throw new Fail('no-match', p);
      lines.splice(line, 0, ...add);
      tree.now.set(p, lines.length === 0 ? '' : lines.join(br) + (final ? br : ''));
    };
  }
  return null;
}

function jsonEdits(text: string, lines: string[]): Edit[] {
  const first = lines.findIndex((l) => !blank(l));
  if (first < 0) throw new Exit2('error: parse 1');
  const edits: Edit[] = [];
  if (lines[first]!.trimStart().startsWith('[')) {
    let v: unknown;
    try {
      v = JSON.parse(text);
    } catch {
      throw new Exit2(`error: parse ${first + 1}`);
    }
    if (!Array.isArray(v)) throw new Exit2(`error: parse ${first + 1}`);
    for (const x of v) {
      const e = jsonEdit(x);
      if (e === null) throw new Exit2(`error: parse ${first + 1}`);
      edits.push(e);
    }
    return edits;
  }
  lines.forEach((l, i) => {
    if (blank(l)) return;
    let e: Edit | null = null;
    try {
      e = jsonEdit(JSON.parse(l));
    } catch {
      e = null;
    }
    if (e === null) throw new Exit2(`error: parse ${i + 1}`);
    edits.push(e);
  });
  return edits;
}

/** One unified hunk: its header's A, its body entries, and its two no-newline readings. */
interface Hunk {
  a: number;
  body: (BodyEntry & { empty?: boolean })[];
  /** A `\` line follows the hunk's last context or `+` line. */
  noEolNew: boolean;
  /** A `\` line follows the hunk's last `+` line. */
  noEolAdd: boolean;
}

interface Section {
  pairOld: string | null;
  pairNew: string | null;
  renOld: string | null;
  renNew: string | null;
  gitOld: string | null;
  gitNew: string | null;
  newFile: boolean;
  delFile: boolean;
  sawPair: boolean;
  hunks: Hunk[];
}

/** The path a `--- `/`+++ ` line names: up to the first tab, spaces removed, `/dev/null` kept, `a/`-`b/` stripped. */
function headPath(raw: string): string {
  let p = raw.split('\t')[0]!.trim();
  if (p === '/dev/null') return p;
  if (p.startsWith('a/') || p.startsWith('b/')) p = p.slice(2);
  return p;
}

function unifiedEdit(s: Section, strict: boolean): Edit {
  return (tree) => {
    const oldP = s.pairOld ?? s.renOld ?? s.gitOld;
    const newP = s.pairNew ?? s.renNew ?? s.gitNew;
    if (s.newFile || oldP === '/dev/null') {
      const p = newP ?? '';
      if (!safe(p)) throw new Fail('unsafe', p);
      if (tree.get(p) !== null) throw new Fail('exists', p);
      const fileLines: string[] = [];
      for (const h of s.hunks) for (const b of h.body) if (b.k === 'a') fileLines.push(b.t);
      const lastH = s.hunks[s.hunks.length - 1];
      const fin = !(lastH !== undefined && lastH.noEolAdd);
      tree.now.set(p, fileLines.length === 0 ? '' : fileLines.join('\n') + (fin ? '\n' : ''));
      return;
    }
    if (s.delFile || newP === '/dev/null') {
      const p = oldP ?? '';
      if (!safe(p)) throw new Fail('unsafe', p);
      if (tree.get(p) === null) throw new Fail('missing', p);
      tree.now.set(p, null);
      return;
    }
    const o = oldP ?? '';
    const n = newP ?? '';
    if (!safe(o)) throw new Fail('unsafe', o);
    if (n !== o && !safe(n)) throw new Fail('unsafe', n);
    const before = tree.get(o);
    if (before === null) throw new Fail('missing', o);
    if (n !== o && tree.get(n) !== null) throw new Fail('exists', n);
    const model = parseFile(before);
    let d = 0;
    for (const h of s.hunks) {
      const { O, N } = bodyON(h.body);
      if (O.length === 0) {
        const at = Math.min(h.a + d, model.lines.length);
        const atEnd = at >= model.lines.length;
        model.lines = spliceLines(model.lines, at, 0, [...N]);
        if (atEnd) model.fin = !h.noEolNew;
        d += N.length;
        continue;
      }
      const found = findTier(model.lines, O, strict);
      if (found === null) throw new Fail('no-match', o);
      const target = h.a - 1 + d;
      let best = found.occ[0]!;
      let bestDist = Math.abs(best - target);
      for (const pos of found.occ) {
        const dist = Math.abs(pos - target);
        if (dist < bestDist) {
          best = pos;
          bestDist = dist;
        }
      }
      const written = writtenLines(h.body, model.lines, best, found.tier);
      const runsToEnd = best + O.length === model.lines.length;
      model.lines = spliceLines(model.lines, best, O.length, written);
      if (runsToEnd) model.fin = !h.noEolNew;
      d += N.length - O.length;
    }
    const out = writeFile(model);
    if (n !== o) {
      tree.now.set(o, null);
      tree.now.set(n, out);
      tree.moves.push([o, n]);
    } else {
      tree.now.set(o, out);
    }
  };
}

/** Section 6: read the whole patch into section edits; parse faults throw Exit2 before any file is looked at. */
function unifiedEdits(lines: string[], strict: boolean): Edit[] {
  const sections: Section[] = [];
  let cur: Section | null = null;
  const newSection = (): Section => {
    const s: Section = {
      pairOld: null,
      pairNew: null,
      renOld: null,
      renNew: null,
      gitOld: null,
      gitNew: null,
      newFile: false,
      delFile: false,
      sawPair: false,
      hunks: [],
    };
    sections.push(s);
    cur = s;
    return s;
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const next = lines[i + 1] ?? '';
    if (line === 'diff --git' || line.startsWith('diff --git ')) {
      const m = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
      if (m === null) throw new Exit2(`error: parse ${i + 1}`);
      const s = newSection();
      s.gitOld = m[1]!;
      s.gitNew = m[2]!;
      i += 1;
      continue;
    }
    if (line.startsWith('--- ') && next.startsWith('+++ ')) {
      if (cur !== null && cur.hunks.length === 0 && !cur.sawPair) {
        cur.pairOld = headPath(line.slice(4));
        cur.pairNew = headPath(next.slice(4));
        cur.sawPair = true;
      } else {
        const s = newSection();
        s.pairOld = headPath(line.slice(4));
        s.pairNew = headPath(next.slice(4));
        s.sawPair = true;
      }
      i += 2;
      continue;
    }
    if (line.startsWith('--- ') && cur !== null && cur.hunks.length === 0) {
      throw new Exit2(`error: parse ${i + 2}`);
    }
    if (line.startsWith('@@')) {
      if (cur === null) throw new Exit2(`error: parse ${i + 1}`);
      const hm = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?:\s.*)?$/.exec(line);
      if (hm === null) throw new Exit2(`error: parse ${i + 1}`);
      const body: Hunk['body'] = [];
      let j = i + 1;
      while (j < lines.length) {
        const bl = lines[j]!;
        if (bl.startsWith('--- ') && (lines[j + 1] ?? '').startsWith('+++ ')) break;
        const c0 = bl[0];
        if (bl === '') body.push({ k: 'c', t: '', empty: true });
        else if (c0 === ' ') body.push({ k: 'c', t: bl.slice(1) });
        else if (c0 === '-') body.push({ k: 'd', t: bl.slice(1) });
        else if (c0 === '+') body.push({ k: 'a', t: bl.slice(1) });
        else if (c0 === '\\') body.push({ k: 'x', t: bl.slice(1) });
        else break;
        j += 1;
      }
      while (body.length > 0 && body[body.length - 1]!.empty === true) body.pop();
      let lastCA = -1;
      let lastA = -1;
      body.forEach((b, idx) => {
        if (b.k === 'c' || b.k === 'a') lastCA = idx;
        if (b.k === 'a') lastA = idx;
      });
      cur.hunks.push({
        a: Number(hm[1]),
        body,
        noEolNew: lastCA >= 0 && body[lastCA + 1]?.k === 'x',
        noEolAdd: lastA >= 0 && body[lastA + 1]?.k === 'x',
      });
      i = j;
      continue;
    }
    if (cur !== null && cur.hunks.length === 0) {
      if (line.startsWith('rename from ')) cur.renOld = line.slice(12).trim();
      else if (line.startsWith('rename to ')) cur.renNew = line.slice(10).trim();
      else if (line.startsWith('new file mode')) cur.newFile = true;
      else if (line.startsWith('deleted file mode')) cur.delFile = true;
    }
    i += 1;
  }
  return sections.map((s) => unifiedEdit(s, strict));
}

/** Section 7: one SEARCH/REPLACE block as an edit. */
function srEdit(path: string, oldLines: string[], newLines: string[], strict: boolean): Edit {
  return (tree) => {
    if (!safe(path)) throw new Fail('unsafe', path);
    if (oldLines.length === 0) {
      if (tree.get(path) !== null) throw new Fail('exists', path);
      tree.now.set(path, newLines.length === 0 ? '' : `${newLines.join('\n')}\n`);
      return;
    }
    const before = tree.get(path);
    if (before === null) throw new Fail('missing', path);
    const model = parseFile(before);
    const found = findTier(model.lines, oldLines, strict);
    if (found === null) throw new Fail('no-match', path);
    if (found.occ.length > 1) throw new Fail('ambiguous', path);
    const at = found.occ[0]!;
    const body: BodyEntry[] = [
      ...oldLines.map((t): BodyEntry => ({ k: 'd', t })),
      ...newLines.map((t): BodyEntry => ({ k: 'a', t })),
    ];
    const written = writtenLines(body, model.lines, at, found.tier);
    model.lines = spliceLines(model.lines, at, oldLines.length, written);
    tree.now.set(path, writeFile(model));
  };
}

function srEdits(lines: string[], strict: boolean): Edit[] {
  const edits: Edit[] = [];
  let prevPath: string | null = null;
  let prevEnd = -1;
  let i = 0;
  while (i < lines.length) {
    if (lines[i]!.trimEnd() !== '<<<<<<< SEARCH') {
      i += 1;
      continue;
    }
    const searchIdx = i;
    let eq = -1;
    for (let j = searchIdx + 1; j < lines.length; j += 1) {
      if (lines[j]!.trimEnd() === '=======') {
        eq = j;
        break;
      }
    }
    let rep = -1;
    if (eq >= 0) {
      for (let j = eq + 1; j < lines.length; j += 1) {
        if (lines[j]!.trimEnd() === '>>>>>>> REPLACE') {
          rep = j;
          break;
        }
      }
    }
    if (eq < 0 || rep < 0) throw new Exit2(`error: parse ${searchIdx + 1}`);
    let path: string | null = null;
    for (let j = searchIdx - 1; j > prevEnd; j -= 1) {
      const l = lines[j]!;
      if (l.trim() === '') continue;
      if (l.trim().startsWith('```')) continue;
      path = l.trim();
      break;
    }
    if (path === null) {
      if (prevPath === null) throw new Exit2(`error: parse ${searchIdx + 1}`);
      path = prevPath;
    }
    edits.push(srEdit(path, lines.slice(searchIdx + 1, eq), lines.slice(eq + 1, rep), strict));
    prevPath = path;
    prevEnd = rep;
    i = rep + 1;
  }
  return edits;
}

/** One V4A chunk: an optional anchor line, an end-of-file flag, and its body. */
interface VChunk {
  anchor: string | null;
  eof: boolean;
  body: BodyEntry[];
}

interface VSection {
  kind: 'add' | 'del' | 'upd';
  path: string;
  line: number;
  addLines: string[];
  moveTo: string | null;
  chunks: VChunk[];
}

/** A single line matched at the first tier where one is, at or after `from` (section 8 anchors, via section 5). */
function findAnchor(lines: string[], anchor: string, strict: boolean, from: number): number {
  for (const tier of strict ? [0] : [0, 1, 2]) {
    const want = normLine(anchor, tier);
    for (let i = from; i < lines.length; i += 1) {
      if (normLine(lines[i]!, tier) === want) return i;
    }
  }
  return -1;
}

/** The first tier with an occurrence at or after `from` that ends at the file's last line. */
function findTierEof(lines: string[], O: string[], strict: boolean, from: number): { tier: number; occ: number[] } | null {
  for (const tier of strict ? [0] : [0, 1, 2]) {
    const occ = occurrences(lines, O, tier, from).filter((pos) => pos + O.length === lines.length);
    if (occ.length > 0) return { tier, occ };
  }
  return null;
}

function v4aEdit(sec: VSection, strict: boolean): Edit {
  return (tree) => {
    const p = sec.path;
    if (!safe(p)) throw new Fail('unsafe', p);
    if (sec.kind === 'add') {
      if (tree.get(p) !== null) throw new Fail('exists', p);
      tree.now.set(p, sec.addLines.length === 0 ? '' : `${sec.addLines.join('\n')}\n`);
      return;
    }
    if (sec.kind === 'del') {
      if (tree.get(p) === null) throw new Fail('missing', p);
      tree.now.set(p, null);
      return;
    }
    if (sec.moveTo !== null && !safe(sec.moveTo)) throw new Fail('unsafe', sec.moveTo);
    const before = tree.get(p);
    if (before === null) throw new Fail('missing', p);
    if (sec.moveTo !== null && tree.get(sec.moveTo) !== null) throw new Fail('exists', sec.moveTo);
    const model = parseFile(before);
    let cursor = 0;
    for (const ch of sec.chunks) {
      if (ch.anchor !== null) {
        const at = findAnchor(model.lines, ch.anchor, strict, cursor);
        if (at < 0) throw new Fail('no-match', p);
        cursor = at + 1;
      }
      const { O, N } = bodyON(ch.body);
      if (O.length === 0) {
        const at = ch.eof ? model.lines.length : Math.min(cursor, model.lines.length);
        model.lines = spliceLines(model.lines, at, 0, [...N]);
        cursor = at + N.length;
        continue;
      }
      const found = ch.eof ? findTierEof(model.lines, O, strict, cursor) : findTier(model.lines, O, strict, cursor);
      if (found === null) throw new Fail('no-match', p);
      const at = found.occ[0]!;
      const written = writtenLines(ch.body, model.lines, at, found.tier);
      model.lines = spliceLines(model.lines, at, O.length, written);
      cursor = at + written.length;
    }
    const out = writeFile(model);
    if (sec.moveTo !== null) {
      tree.now.set(p, null);
      tree.now.set(sec.moveTo, out);
      tree.moves.push([p, sec.moveTo]);
    } else {
      tree.now.set(p, out);
    }
  };
}

/** Section 8: read the patch into section edits. Raw section lines keep their 1-based patch line numbers. */
function v4aEdits(lines: string[], strict: boolean): Edit[] {
  const first = lines.findIndex((l) => !blank(l));
  if (first < 0) throw new Exit2('error: parse 1');
  if (lines[first]!.trim() !== '*** Begin Patch') throw new Exit2(`error: parse ${first + 1}`);
  let last = -1;
  for (let j = lines.length - 1; j >= 0; j -= 1) {
    if (!blank(lines[j]!)) {
      last = j;
      break;
    }
  }
  if (lines[last]!.trim() !== '*** End Patch') throw new Exit2(`error: parse ${lines.length + 1}`);
  const secStart = (l: string): 'add' | 'del' | 'upd' | null =>
    l.startsWith('*** Add File: ') ? 'add' : l.startsWith('*** Delete File: ') ? 'del' : l.startsWith('*** Update File: ') ? 'upd' : null;
  const sections: VSection[] = [];
  let i = first + 1;
  while (i < last) {
    const line = lines[i]!;
    if (blank(line)) {
      i += 1;
      continue;
    }
    const kind = secStart(line);
    if (kind === null) throw new Exit2(`error: parse ${i + 1}`);
    const sec: VSection = {
      kind,
      path: line.slice(kind === 'add' ? 14 : 17).trim(),
      line: i + 1,
      addLines: [],
      moveTo: null,
      chunks: [],
    };
    i += 1;
    const raw: { t: string; n: number }[] = [];
    while (i < last && secStart(lines[i]!) === null) {
      raw.push({ t: lines[i]!, n: i + 1 });
      i += 1;
    }
    // Blank lines at the end of a section are not part of it; blank is section 4's word: empty or only whitespace.
    while (raw.length > 0 && blank(raw[raw.length - 1]!.t)) raw.pop();
    if (kind === 'add') {
      for (const r of raw) {
        if (r.t.startsWith('+')) sec.addLines.push(r.t.slice(1));
        else if (r.t === '') sec.addLines.push('');
        else throw new Exit2(`error: parse ${r.n}`);
      }
    } else if (kind === 'del') {
      for (const r of raw) {
        if (!blank(r.t)) throw new Exit2(`error: parse ${r.n}`);
      }
    } else {
      let idx = 0;
      if (raw.length > 0 && raw[0]!.t.startsWith('*** Move to: ')) {
        sec.moveTo = raw[0]!.t.slice(13).trim();
        idx = 1;
      }
      let chunk: VChunk | null = null;
      for (; idx < raw.length; idx += 1) {
        const r = raw[idx]!;
        const l = r.t;
        if (l.startsWith('@@')) {
          const anchor = l.slice(2).trim();
          chunk = { anchor: anchor === '' ? null : anchor, eof: false, body: [] };
          sec.chunks.push(chunk);
        } else if (l.trimEnd() === '*** End of File') {
          if (chunk === null) {
            chunk = { anchor: null, eof: true, body: [] };
            sec.chunks.push(chunk);
          } else {
            chunk.eof = true;
          }
        } else if (l === '' || l.startsWith(' ') || l.startsWith('-') || l.startsWith('+')) {
          if (chunk === null) {
            chunk = { anchor: null, eof: false, body: [] };
            sec.chunks.push(chunk);
          }
          if (l === '') chunk.body.push({ k: 'c', t: '' });
          else chunk.body.push({ k: l[0] === ' ' ? 'c' : l[0] === '-' ? 'd' : 'a', t: l.slice(1) });
        } else {
          throw new Exit2(`error: parse ${r.n}`);
        }
      }
      if (sec.chunks.length === 0 && sec.moveTo === null) throw new Exit2(`error: parse ${sec.line}`);
    }
    sections.push(sec);
  }
  return sections.map((s) => v4aEdit(s, strict));
}

function run(args: string[]): { code: number; out: string[] } {
  let format: string | null = null;
  let check = false;
  let strict = false;
  const pos: string[] = [];
  let ended = false;
  for (const a of args) {
    if (!ended && a === '--') ended = true;
    else if (!ended && a.startsWith('-') && a !== '-') {
      if (a.startsWith('--format=') && format === null && FORMATS.includes(a.slice(9))) format = a.slice(9);
      else if (a === '--check' && !check) check = true;
      else if (a === '--strict' && !strict) strict = true;
      else return { code: 2, out: ['error: usage'] };
    } else pos.push(a);
  }
  if (pos.length > 1) return { code: 2, out: ['error: usage'] };
  const file = pos.length === 0 || pos[0] === '-' ? null : pos[0]!;
  let text = '';
  try {
    text = readFileSync(file ?? 0, 'utf8');
  } catch {
    if (file !== null) return { code: 2, out: ['error: no-patch'] };
  }
  const lines = patchLines(text);
  const kind = format === null || format === 'auto' ? detect(lines) : format;
  if (kind === null) return { code: 2, out: ['error: format'] };
  let edits: Edit[];
  try {
    edits =
      kind === 'json'
        ? jsonEdits(text, lines)
        : kind === 'unified'
          ? unifiedEdits(lines, strict)
          : kind === 'search-replace'
            ? srEdits(lines, strict)
            : v4aEdits(lines, strict);
    if (edits.length === 0) throw new Exit2('error: parse 1');
  } catch (e) {
    if (e instanceof Exit2) return { code: 2, out: [e.line] };
    throw e;
  }
  const tree = new Tree();
  const fails: Fail[] = [];
  for (const edit of edits) {
    const before = new Map(tree.now);
    const movesBefore = tree.moves.length;
    try {
      edit(tree);
    } catch (e) {
      if (!(e instanceof Fail)) throw e;
      tree.now.clear();
      for (const [k, v] of before) tree.now.set(k, v);
      tree.moves.length = movesBefore;
      fails.push(e);
    }
  }
  if (fails.length > 0) return { code: 1, out: [...fails.map((f) => `error: ${f.code} ${f.path}`), `failed: ${fails.length} of ${edits.length} edits`] };
  const rows: { key: string; text: string }[] = [];
  const movedOld = new Set<string>();
  const movedNew = new Set<string>();
  for (const [o, n] of tree.moves) {
    const nowN = tree.now.get(n);
    if (tree.original(o) !== null && tree.now.get(o) === null && tree.original(n) === null && nowN !== null && nowN !== undefined) {
      rows.push({ key: n, text: `R ${o} -> ${n}` });
      movedOld.add(o);
      movedNew.add(n);
    }
  }
  for (const p of tree.now.keys()) {
    if (movedOld.has(p) || movedNew.has(p)) continue;
    const was = tree.original(p);
    const now = tree.now.get(p)!;
    if (was === now) continue;
    rows.push({ key: p, text: `${was === null ? 'A' : now === null ? 'D' : 'M'} ${p}` });
  }
  rows.sort((x, y) => Buffer.compare(Buffer.from(x.key), Buffer.from(y.key)));
  if (!check) {
    for (const p of tree.now.keys()) {
      const was = tree.original(p);
      const now = tree.now.get(p)!;
      if (was === now) continue;
      if (now === null) rmSync(p, { force: true });
      else {
        mkdirSync(dirname(p), { recursive: true });
        writeFileSync(p, now);
      }
    }
  }
  const texts = rows.map((r) => r.text);
  return { code: 0, out: [...texts, `ok: ${texts.length} ${texts.length === 1 ? 'file' : 'files'}`] };
}


const trialEnv = process.env.MAKEFUN_ENV_URL;
if (trialEnv !== undefined && trialEnv !== '') {
  // A trial: the kit's runner reads the checks from the env and runs this file on each one, without this variable.
  const { runTrial } = await import('./runner.ts');
  await runTrial(trialEnv);
} else {
  const r = run(process.argv.slice(2));
  writeSync(1, r.out.map((l) => `${l}\n`).join(''));
  process.exitCode = r.code;
}
