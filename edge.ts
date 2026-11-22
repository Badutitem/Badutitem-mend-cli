// Self-built edge cases beyond the practice set. Every expectation below is derived by hand from SPEC.md's
// literal text (the section is named in each case), never from the implementation's behaviour. Where a run
// disagrees, either the code or this derivation is wrong; the SPEC decides, and the outcome is recorded in
// ../SPEC-MAP.md. Usage: node edge.ts
import { runCheck } from './runner.ts';

interface Case {
  name: string;
  argv: string[];
  stdin: string | null;
  files: Record<string, string>;
  exit: number;
  stdout: string;
  after: Record<string, string>;
}

const cases: Case[] = [
  {
    name: 'A unified: header line numbers far off, nearest occurrence wins (s.6)',
    argv: ['p.diff'],
    stdin: null,
    files: { 'f.txt': 'x\ntarget\ny\ntarget\nz\n', 'p.diff': '--- a/f.txt\n+++ b/f.txt\n@@ -100,3 +100,3 @@\n target\n-y\n+why\n target\n' },
    exit: 0,
    stdout: 'M f.txt\nok: 1 file\n',
    after: { 'f.txt': 'x\ntarget\nwhy\ntarget\nz\n', 'p.diff': '--- a/f.txt\n+++ b/f.txt\n@@ -100,3 +100,3 @@\n target\n-y\n+why\n target\n' },
  },
  {
    name: 'B unified: overlapping occurrences, nearest to A-1+d (s.6)',
    argv: ['p.diff'],
    stdin: null,
    files: { 'f.txt': 'a\na\na\n', 'p.diff': '--- a/f.txt\n+++ b/f.txt\n@@ -3,2 +3,2 @@\n a\n-a\n+b\n' },
    exit: 0,
    stdout: 'M f.txt\nok: 1 file\n',
    after: { 'f.txt': 'a\na\nb\n', 'p.diff': '--- a/f.txt\n+++ b/f.txt\n@@ -3,2 +3,2 @@\n a\n-a\n+b\n' },
  },
  {
    name: 'C search-replace: tier-2 re-indent with empty P prepends F (s.5)',
    argv: ['p.txt'],
    stdin: null,
    files: { f: '  hello\n  world\n', 'p.txt': 'f\n<<<<<<< SEARCH\nhello\n=======\nhello2\nagain\n>>>>>>> REPLACE\n' },
    exit: 0,
    stdout: 'M f\nok: 1 file\n',
    after: { f: '  hello2\n  again\n  world\n', 'p.txt': 'f\n<<<<<<< SEARCH\nhello\n=======\nhello2\nagain\n>>>>>>> REPLACE\n' },
  },
  {
    name: 'D strict: tier drift is no-match under --strict (s.5)',
    argv: ['--strict', 'p.txt'],
    stdin: null,
    files: { f: '  hello\n  world\n', 'p.txt': 'f\n<<<<<<< SEARCH\nhello\n=======\nhello2\n>>>>>>> REPLACE\n' },
    exit: 1,
    stdout: 'error: no-match f\nfailed: 1 of 1 edits\n',
    after: { f: '  hello\n  world\n', 'p.txt': 'f\n<<<<<<< SEARCH\nhello\n=======\nhello2\n>>>>>>> REPLACE\n' },
  },
  {
    name: 'E unified on CRLF file: hunk runs to EOF, no backslash line, final break appears (s.6, s.3)',
    argv: ['p.diff'],
    stdin: null,
    files: { 'cr.txt': 'one\r\ntwo\r\nthree', 'p.diff': '--- a/cr.txt\n+++ b/cr.txt\n@@ -3,1 +3,1 @@\n-three\n+three!\n' },
    exit: 0,
    stdout: 'M cr.txt\nok: 1 file\n',
    after: { 'cr.txt': 'one\r\ntwo\r\nthree!\r\n', 'p.diff': '--- a/cr.txt\n+++ b/cr.txt\n@@ -3,1 +3,1 @@\n-three\n+three!\n' },
  },
  {
    name: 'E2 unified on CRLF file: backslash after last + line keeps no final break (s.6)',
    argv: ['p.diff'],
    stdin: null,
    files: { 'cr.txt': 'one\r\ntwo\r\nthree', 'p.diff': '--- a/cr.txt\n+++ b/cr.txt\n@@ -3,1 +3,1 @@\n-three\n+three!\n\\ No newline at end of file\n' },
    exit: 0,
    stdout: 'M cr.txt\nok: 1 file\n',
    after: { 'cr.txt': 'one\r\ntwo\r\nthree!', 'p.diff': '--- a/cr.txt\n+++ b/cr.txt\n@@ -3,1 +3,1 @@\n-three\n+three!\n\\ No newline at end of file\n' },
  },
  {
    name: 'F unified mid-file hunk: a no-final-break file keeps it (s.6)',
    argv: ['p.diff'],
    stdin: null,
    files: { 'f.txt': 'a\nb\nc', 'p.diff': '--- a/f.txt\n+++ b/f.txt\n@@ -2,1 +2,1 @@\n-b\n+B\n' },
    exit: 0,
    stdout: 'M f.txt\nok: 1 file\n',
    after: { 'f.txt': 'a\nB\nc', 'p.diff': '--- a/f.txt\n+++ b/f.txt\n@@ -2,1 +2,1 @@\n-b\n+B\n' },
  },
  {
    name: 'G atomicity: second block fails, nothing is written (s.10)',
    argv: ['p.txt'],
    stdin: null,
    files: {
      f: 'one\n',
      g: 'two\n',
      'p.txt': 'f\n<<<<<<< SEARCH\none\n=======\nuno\n>>>>>>> REPLACE\ng\n<<<<<<< SEARCH\nabsent\n=======\ntres\n>>>>>>> REPLACE\n',
    },
    exit: 1,
    stdout: 'error: no-match g\nfailed: 1 of 2 edits\n',
    after: {
      f: 'one\n',
      g: 'two\n',
      'p.txt': 'f\n<<<<<<< SEARCH\none\n=======\nuno\n>>>>>>> REPLACE\ng\n<<<<<<< SEARCH\nabsent\n=======\ntres\n>>>>>>> REPLACE\n',
    },
  },
  {
    name: 'H v4a: Add then Update of the same file in one patch (s.10, s.8)',
    argv: ['p.txt'],
    stdin: null,
    files: { 'p.txt': '*** Begin Patch\n*** Add File: new.txt\n+one\n+two\n*** Update File: new.txt\n-two\n+three\n*** End Patch\n' },
    exit: 0,
    stdout: 'A new.txt\nok: 1 file\n',
    after: { 'p.txt': '*** Begin Patch\n*** Add File: new.txt\n+one\n+two\n*** Update File: new.txt\n-two\n+three\n*** End Patch\n', 'new.txt': 'one\nthree\n' },
  },
  {
    name: 'I json str_replace: overlapping occurrences are ambiguous (s.9)',
    argv: ['p.json'],
    stdin: null,
    files: { t: 'aaaa\n', 'p.json': '{"command": "str_replace", "path": "t", "old_str": "aa", "new_str": "b"}\n' },
    exit: 1,
    stdout: 'error: ambiguous t\nfailed: 1 of 1 edits\n',
    after: { t: 'aaaa\n', 'p.json': '{"command": "str_replace", "path": "t", "old_str": "aa", "new_str": "b"}\n' },
  },
  {
    name: 'I2 json insert at the line count, and one past it (s.9)',
    argv: ['p.json'],
    stdin: null,
    files: { t: 'x\ny\n', 'p.json': '{"command": "insert", "path": "t", "insert_line": 2, "new_str": "z"}\n' },
    exit: 0,
    stdout: 'M t\nok: 1 file\n',
    after: { t: 'x\ny\nz\n', 'p.json': '{"command": "insert", "path": "t", "insert_line": 2, "new_str": "z"}\n' },
  },
  {
    name: 'I3 json insert past the line count is no-match (s.9)',
    argv: ['p.json'],
    stdin: null,
    files: { t: 'x\ny\n', 'p.json': '{"command": "insert", "path": "t", "insert_line": 3, "new_str": "z"}\n' },
    exit: 1,
    stdout: 'error: no-match t\nfailed: 1 of 1 edits\n',
    after: { t: 'x\ny\n', 'p.json': '{"command": "insert", "path": "t", "insert_line": 3, "new_str": "z"}\n' },
  },
  {
    name: 'J v4a End of File chunk: only the occurrence ending at the last line (s.8)',
    argv: ['p.txt'],
    stdin: null,
    files: { 'e.txt': 'a\nX\nb\nX\n', 'p.txt': '*** Begin Patch\n*** Update File: e.txt\n-X\n+Y\n*** End of File\n*** End Patch\n' },
    exit: 0,
    stdout: 'M e.txt\nok: 1 file\n',
    after: { 'e.txt': 'a\nX\nb\nY\n', 'p.txt': '*** Begin Patch\n*** Update File: e.txt\n-X\n+Y\n*** End of File\n*** End Patch\n' },
  },
  {
    name: 'K search-replace: tier 0 has one occurrence, tier 1 would have two; tier 0 decides (s.5, s.7)',
    argv: ['p.txt'],
    stdin: null,
    files: { f: 'foo \nfoo\n', 'p.txt': 'f\n<<<<<<< SEARCH\nfoo\n=======\nbar\n>>>>>>> REPLACE\n' },
    exit: 0,
    stdout: 'M f\nok: 1 file\n',
    after: { f: 'foo \nbar\n', 'p.txt': 'f\n<<<<<<< SEARCH\nfoo\n=======\nbar\n>>>>>>> REPLACE\n' },
  },
  {
    name: 'L unified creation with a backslash line: no final break (s.6)',
    argv: ['p.diff'],
    stdin: null,
    files: { 'p.diff': 'diff --git a/new.txt b/new.txt\nnew file mode 100644\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1,2 @@\n+hello\n+world\n\\ No newline at end of file\n' },
    exit: 0,
    stdout: 'A new.txt\nok: 1 file\n',
    after: { 'p.diff': 'diff --git a/new.txt b/new.txt\nnew file mode 100644\n--- /dev/null\n+++ b/new.txt\n@@ -0,0 +1,2 @@\n+hello\n+world\n\\ No newline at end of file\n', 'new.txt': 'hello\nworld' },
  },
  {
    name: 'M v4a move: R line sorts by the new path (s.2, s.8)',
    argv: ['p.txt'],
    stdin: null,
    files: {
      'a.txt': 'old\n',
      'm.txt': 'data\n',
      'p.txt': '*** Begin Patch\n*** Update File: a.txt\n-old\n+new\n*** Update File: m.txt\n*** Move to: z.txt\n-data\n+data2\n*** End Patch\n',
    },
    exit: 0,
    stdout: 'M a.txt\nR m.txt -> z.txt\nok: 2 files\n',
    after: {
      'a.txt': 'new\n',
      'z.txt': 'data2\n',
      'p.txt': '*** Begin Patch\n*** Update File: a.txt\n-old\n+new\n*** Update File: m.txt\n*** Move to: z.txt\n-data\n+data2\n*** End Patch\n',
    },
  },
  {
    name: 'N usage wins over an unreadable patch (s.1, s.2)',
    argv: ['--bogus', 'nonexistent.patch'],
    stdin: null,
    files: {},
    exit: 2,
    stdout: 'error: usage\n',
    after: {},
  },
  {
    name: 'N2 unreadable patch file (s.2)',
    argv: ['missing.patch'],
    stdin: null,
    files: {},
    exit: 2,
    stdout: 'error: no-patch\n',
    after: {},
  },
  {
    name: 'O empty patch with auto detects no format (s.4)',
    argv: [],
    stdin: '',
    files: {},
    exit: 2,
    stdout: 'error: format\n',
    after: {},
  },
  {
    name: 'O2 empty patch with a named format holds no edit (s.2)',
    argv: ['--format=unified'],
    stdin: '',
    files: {},
    exit: 2,
    stdout: 'error: parse 1\n',
    after: {},
  },
  {
    name: 'P v4a anchor and chunk matched at tier 2, new line re-indented (s.8, s.5)',
    argv: ['p.txt'],
    stdin: null,
    files: { 'f.py': '    def f():\n        pass\n', 'p.txt': '*** Begin Patch\n*** Update File: f.py\n@@ def f():\n-pass\n+done\n*** End Patch\n' },
    exit: 0,
    stdout: 'M f.py\nok: 1 file\n',
    after: { 'f.py': '    def f():\n        done\n', 'p.txt': '*** Begin Patch\n*** Update File: f.py\n@@ def f():\n-pass\n+done\n*** End Patch\n' },
  },
  {
    name: 'Q unified: second hunk still finds its line after the first hunk grew the file (s.6 d)',
    argv: ['p.diff'],
    stdin: null,
    files: { 'f.txt': 'a1\na2\na3\na4\na5\na6\n', 'p.diff': '--- a/f.txt\n+++ b/f.txt\n@@ -2,1 +2,2 @@\n-a2\n+b1\n+b2\n@@ -5,1 +6,1 @@\n-a5\n+b5\n' },
    exit: 0,
    stdout: 'M f.txt\nok: 1 file\n',
    after: { 'f.txt': 'a1\nb1\nb2\na3\na4\nb5\na6\n', 'p.diff': '--- a/f.txt\n+++ b/f.txt\n@@ -2,1 +2,2 @@\n-a2\n+b1\n+b2\n@@ -5,1 +6,1 @@\n-a5\n+b5\n' },
  },
  {
    name: 'R search-replace: a later block edits the file an earlier block created (s.10, s.7)',
    argv: ['p.txt'],
    stdin: null,
    files: { 'p.txt': 'c.txt\n<<<<<<< SEARCH\n=======\nx\n>>>>>>> REPLACE\nc.txt\n<<<<<<< SEARCH\nx\n=======\ny\n>>>>>>> REPLACE\n' },
    exit: 0,
    stdout: 'A c.txt\nok: 1 file\n',
    after: { 'p.txt': 'c.txt\n<<<<<<< SEARCH\n=======\nx\n>>>>>>> REPLACE\nc.txt\n<<<<<<< SEARCH\nx\n=======\ny\n>>>>>>> REPLACE\n', 'c.txt': 'y\n' },
  },
];

const more: Case[] = [
  {
    name: 'S unified rename named only by rename from/to, with a hunk (s.6)',
    argv: ['p.diff'],
    stdin: null,
    files: { 'old.txt': 'keep\nchange\n', 'p.diff': 'diff --git a/old.txt b/new.txt\nrename from old.txt\nrename to new.txt\n@@ -2,1 +2,1 @@\n-change\n+changed\n' },
    exit: 0,
    stdout: 'R old.txt -> new.txt\nok: 1 file\n',
    after: { 'new.txt': 'keep\nchanged\n', 'p.diff': 'diff --git a/old.txt b/new.txt\nrename from old.txt\nrename to new.txt\n@@ -2,1 +2,1 @@\n-change\n+changed\n' },
  },
  {
    name: 'T unified deletion: its hunks are not read, a non-matching hunk still deletes (s.6)',
    argv: ['p.diff'],
    stdin: null,
    files: { 'gone.txt': 'real\n', 'p.diff': '--- a/gone.txt\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-not-in-the-file\n' },
    exit: 0,
    stdout: 'D gone.txt\nok: 1 file\n',
    after: { 'p.diff': '--- a/gone.txt\n+++ /dev/null\n@@ -1,1 +0,0 @@\n-not-in-the-file\n' },
  },
  {
    name: 'U detection: a SEARCH marker beats diff headers (s.4 order)',
    argv: ['p.txt'],
    stdin: null,
    files: { f: 'one\n', 'p.txt': 'diff --git a/f b/f\nf\n<<<<<<< SEARCH\none\n=======\ntwo\n>>>>>>> REPLACE\n' },
    exit: 0,
    stdout: 'M f\nok: 1 file\n',
    after: { f: 'two\n', 'p.txt': 'diff --git a/f b/f\nf\n<<<<<<< SEARCH\none\n=======\ntwo\n>>>>>>> REPLACE\n' },
  },
  {
    name: 'V --check: same output, no file written (s.1)',
    argv: ['--check', 'p.txt'],
    stdin: null,
    files: { f: 'one\n', 'p.txt': 'f\n<<<<<<< SEARCH\none\n=======\ntwo\n>>>>>>> REPLACE\n' },
    exit: 0,
    stdout: 'M f\nok: 1 file\n',
    after: { f: 'one\n', 'p.txt': 'f\n<<<<<<< SEARCH\none\n=======\ntwo\n>>>>>>> REPLACE\n' },
  },
  {
    name: 'W json array form: a fault in any element is parse at the array start line (s.9)',
    argv: ['p.json'],
    stdin: null,
    files: { 'p.json': '\n\n[{"command": "create", "path": "a", "file_text": "x"}, {"command": "bogus", "path": "b"}]\n' },
    exit: 2,
    stdout: 'error: parse 3\n',
    after: { 'p.json': '\n\n[{"command": "create", "path": "a", "file_text": "x"}, {"command": "bogus", "path": "b"}]\n' },
  },
  {
    name: 'X v4a Move to with no chunk is a pure rename (s.8, s.2)',
    argv: ['p.txt'],
    stdin: null,
    files: { 'a.txt': 'same\n', 'p.txt': '*** Begin Patch\n*** Update File: a.txt\n*** Move to: b.txt\n*** End Patch\n' },
    exit: 0,
    stdout: 'R a.txt -> b.txt\nok: 1 file\n',
    after: { 'b.txt': 'same\n', 'p.txt': '*** Begin Patch\n*** Update File: a.txt\n*** Move to: b.txt\n*** End Patch\n' },
  },
  {
    name: 'Y json str_replace in a CRLF file with LF strings (s.9)',
    argv: ['p.json'],
    stdin: null,
    files: { t: 'a\r\nb\r\n', 'p.json': '{"command": "str_replace", "path": "t", "old_str": "a\\nb", "new_str": "a\\nc"}\n' },
    exit: 0,
    stdout: 'M t\nok: 1 file\n',
    after: { t: 'a\r\nc\r\n', 'p.json': '{"command": "str_replace", "path": "t", "old_str": "a\\nb", "new_str": "a\\nc"}\n' },
  },
  {
    name: 'Z unified: two failing sections report both, in patch order (s.2, s.10)',
    argv: ['p.diff'],
    stdin: null,
    files: {
      'a.txt': 'a\n',
      'b.txt': 'b\n',
      'p.diff': '--- a/a.txt\n+++ b/a.txt\n@@ -1,1 +1,1 @@\n-x\n+y\n--- a/b.txt\n+++ b/b.txt\n@@ -1,1 +1,1 @@\n-x\n+y\n',
    },
    exit: 1,
    stdout: 'error: no-match a.txt\nerror: no-match b.txt\nfailed: 2 of 2 edits\n',
    after: {
      'a.txt': 'a\n',
      'b.txt': 'b\n',
      'p.diff': '--- a/a.txt\n+++ b/a.txt\n@@ -1,1 +1,1 @@\n-x\n+y\n--- a/b.txt\n+++ b/b.txt\n@@ -1,1 +1,1 @@\n-x\n+y\n',
    },
  },
  {
    name: 'AA search-replace create on an existing file is exists (s.7)',
    argv: ['p.txt'],
    stdin: null,
    files: { f: 'here\n', 'p.txt': 'f\n<<<<<<< SEARCH\n=======\nnew\n>>>>>>> REPLACE\n' },
    exit: 1,
    stdout: 'error: exists f\nfailed: 1 of 1 edits\n',
    after: { f: 'here\n', 'p.txt': 'f\n<<<<<<< SEARCH\n=======\nnew\n>>>>>>> REPLACE\n' },
  },
  {
    name: 'AB unified: occurrence chosen at tier 1 when only trailing whitespace drifted (s.5, s.6)',
    argv: ['p.diff'],
    stdin: null,
    files: { 'f.txt': 'keep  \nkeep\n', 'p.diff': '--- a/f.txt\n+++ b/f.txt\n@@ -2,1 +2,1 @@\n-keep\n+kept\n' },
    exit: 0,
    stdout: 'M f.txt\nok: 1 file\n',
    after: { 'f.txt': 'keep  \nkept\n', 'p.diff': '--- a/f.txt\n+++ b/f.txt\n@@ -2,1 +2,1 @@\n-keep\n+kept\n' },
  },
];
cases.push(...more);

let passed = 0;
for (const c of cases) {
  const got = runCheck({ id: c.name, argv: c.argv, stdin: c.stdin, files: c.files });
  const why: string[] = [];
  if (got.exit !== c.exit) why.push(`exit ${got.exit}, expected ${c.exit}`);
  if (got.stdout !== c.stdout) why.push(`stdout ${JSON.stringify(got.stdout)}, expected ${JSON.stringify(c.stdout)}`);
  for (const p of new Set([...Object.keys(c.after), ...Object.keys(got.files)])) {
    if (c.after[p] === undefined) why.push(`${p} should not exist`);
    else if (got.files[p] === undefined) why.push(`${p} is missing`);
    else if (got.files[p] !== c.after[p]) why.push(`${p} differs: expected ${JSON.stringify(c.after[p])}, got ${JSON.stringify(got.files[p])}`);
  }
  if (why.length === 0) passed += 1;
  else process.stdout.write(`FAIL ${c.name}\n  ${why.join('\n  ')}\n`);
}
process.stdout.write(`${passed} of ${cases.length} edge cases passed\n`);
