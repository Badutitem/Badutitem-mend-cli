// Cross-validation on the kit's other public instances (practice/trial-1, trial-2): each carries 100 checks in
// env format plus the house reference's expected exit/stdout/files. Runs main.ts on each check via runner.ts and
// reports every mismatch, then the instance score round(1000 x passed / checks), as the scorer would.
// Usage: node trialcheck.ts <trial-dir>
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runCheck } from './runner.ts';

const dir = process.argv[2];
if (dir === undefined) {
  process.stderr.write('usage: node trialcheck.ts <trial-dir>\n');
  process.exit(2);
}
const { checks } = JSON.parse(readFileSync(join(dir, 'input/env/checks.json'), 'utf8')) as {
  checks: { id: string; argv: string[]; stdin: string | null; files: Record<string, string> }[];
};
const expected = JSON.parse(readFileSync(join(dir, 'reference/expected.json'), 'utf8')) as {
  checks: { id: string; exit: number; stdout: string; files: Record<string, string> }[];
};
const want = new Map(expected.checks.map((c) => [c.id, c]));
let passed = 0;
for (const c of checks) {
  const e = want.get(c.id)!;
  const got = runCheck({ id: c.id, argv: c.argv, stdin: c.stdin, files: c.files });
  const why: string[] = [];
  if (got.exit !== e.exit) why.push(`exit ${got.exit}, expected ${e.exit}`);
  if (got.stdout !== e.stdout) why.push(`stdout ${JSON.stringify(got.stdout)}, expected ${JSON.stringify(e.stdout)}`);
  for (const p of new Set([...Object.keys(e.files), ...Object.keys(got.files)])) {
    if (e.files[p] === undefined) why.push(`${p} should not exist`);
    else if (got.files[p] === undefined) why.push(`${p} is missing`);
    else if (got.files[p] !== e.files[p]) why.push(`${p} differs`);
  }
  if (why.length === 0) passed += 1;
  else process.stdout.write(`FAIL ${c.id}\n  ${why.join('\n  ')}\n`);
}
process.stdout.write(`${passed} of ${checks.length} passed: instance score ${Math.round((1000 * passed) / checks.length)}\n`);
