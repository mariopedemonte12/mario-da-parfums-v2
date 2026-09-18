// Run with: node --test scripts/check-env.test.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { activeKeys, compareEnv, main, optionalKeys } from './check-env.mjs';

const TEMPLATE = `# comment with prose, not a key
A=1
B=
# [SECRET] note
# OPT=default
export C=3
`;

test('activeKeys reads assigned keys only', () => {
  assert.deepEqual([...activeKeys(TEMPLATE)].sort(), ['A', 'B', 'C']);
});

test('optionalKeys reads commented KEY= lines only', () => {
  assert.deepEqual([...optionalKeys(TEMPLATE)], ['OPT']);
});

test('reports missing and unknown keys, optional ones are fine', () => {
  const r = compareEnv(TEMPLATE, 'A=x\nOPT=y\nEXTRA=z\n');
  assert.deepEqual(r.missing, ['B', 'C']);
  assert.deepEqual(r.unknown, ['EXTRA']);
});

test('CLI output never contains values and exit codes follow the rules', () => {
  const dir = mkdtempSync(join(tmpdir(), 'check-env-'));
  try {
    const tpl = join(dir, 'tpl.example');
    const vars = join(dir, 'mine.vars');
    writeFileSync(tpl, TEMPLATE);
    writeFileSync(vars, 'A=super-secret-value\nEXTRA=other-secret\n');
    const lines = [];
    const code = main([vars, tpl], (l) => lines.push(l));
    const out = lines.join('\n');
    assert.equal(code, 1);
    assert.match(out, /MISSING\s+B/);
    assert.match(out, /UNKNOWN\s+EXTRA/);
    assert.doesNotMatch(out, /secret/);

    writeFileSync(vars, 'A=1\nB=2\nC=3\nEXTRA=4\n');
    assert.equal(main([vars, tpl], () => {}), 0);
    assert.equal(main([vars, tpl, '--strict'], () => {}), 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('missing env file is reported without throwing', () => {
  const lines = [];
  assert.equal(main(['/nonexistent/none.vars', '/nonexistent/none.example'], (l) => lines.push(l)), 2);
});
