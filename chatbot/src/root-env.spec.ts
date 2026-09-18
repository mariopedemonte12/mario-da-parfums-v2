import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { findRepoRoot, loadRootEnv, rootEnvFilePath } from './root-env.js';

// Fixtures use a `*.vars` file name (the `fileName` seam) instead of a real
// env file, so no test ever touches or depends on a developer's real one.
const FILE = 'test-root.vars';
const KEY = 'ROOT_ENV_SPEC_KEY';

describe('root env file resolution', () => {
  let root: string;
  let deep: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'root-env-'));
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
    deep = join(root, 'pkg', 'dist', 'nested');
    mkdirSync(deep, { recursive: true });
    delete process.env[KEY];
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    delete process.env[KEY];
  });

  it('finds the repo root from a nested directory (src/ or dist/ depth)', () => {
    expect(findRepoRoot(deep)).toBe(root);
    expect(findRepoRoot(join(root, 'pkg'))).toBe(root);
  });

  it('returns undefined when no root marker exists above (Docker image)', () => {
    const lone = mkdtempSync(join(tmpdir(), 'no-root-'));
    try {
      // tmpdir itself has no marker in any sane environment
      expect(findRepoRoot(lone)).toBeUndefined();
      expect(rootEnvFilePath(lone, FILE)).toBeUndefined();
      expect(loadRootEnv(lone, FILE)).toBeUndefined();
    } finally {
      rmSync(lone, { recursive: true, force: true });
    }
  });

  it('returns undefined and does not throw when the file is missing', () => {
    expect(rootEnvFilePath(deep, FILE)).toBeUndefined();
    expect(loadRootEnv(deep, FILE)).toBeUndefined();
  });

  it('ignores a directory with the file name', () => {
    mkdirSync(join(root, FILE));
    expect(rootEnvFilePath(deep, FILE)).toBeUndefined();
  });

  it('loads the file from the repo root regardless of cwd', () => {
    writeFileSync(join(root, FILE), `${KEY}=from-file\n`);
    expect(loadRootEnv(deep, FILE)).toBe(join(root, FILE));
    expect(process.env[KEY]).toBe('from-file');
  });

  it('never overrides a variable already in the process environment', () => {
    writeFileSync(join(root, FILE), `${KEY}=from-file\n`);
    process.env[KEY] = 'from-process';
    loadRootEnv(deep, FILE);
    expect(process.env[KEY]).toBe('from-process');
  });

  it('ignores per-package files (no fallback)', () => {
    writeFileSync(join(root, 'pkg', FILE), `${KEY}=from-package\n`);
    expect(loadRootEnv(deep, FILE)).toBeUndefined();
    expect(process.env[KEY]).toBeUndefined();
  });
});
