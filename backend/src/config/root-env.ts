import { existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

/** Marker file that identifies the monorepo root. */
const ROOT_MARKER = 'pnpm-workspace.yaml';
const ENV_FILE_NAME = '.env';
const MAX_LEVELS = 8;

function isFile(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isFile();
  } catch {
    return false;
  }
}

/**
 * Walks up from `startDir` looking for the monorepo root (the directory that
 * holds pnpm-workspace.yaml). Returns undefined when there is none, which is
 * the case inside the Docker images (only the built output is copied there).
 * Works the same from `src/` and `dist/` and from any process cwd, because it
 * starts from this module's location, never from the cwd.
 */
export function findRepoRoot(startDir: string): string | undefined {
  let dir = startDir;
  for (let i = 0; i < MAX_LEVELS; i++) {
    if (isFile(join(dir, ROOT_MARKER))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
  return undefined;
}

/** Path to `<repo root>/.env` (`fileName` exists for tests), or undefined if there is no root or no file. */
export function rootEnvFilePath(
  startDir: string = dirname(fileURLToPath(import.meta.url)),
  fileName: string = ENV_FILE_NAME,
): string | undefined {
  const root = findRepoRoot(startDir);
  if (!root) return undefined;
  const file = join(root, fileName);
  return isFile(file) ? file : undefined;
}

/**
 * Loads `<repo root>/.env` into process.env when it exists. The file is
 * optional and never overrides variables already present in the environment
 * (dotenv's default). Returns the loaded path, or undefined if none.
 */
export function loadRootEnv(
  startDir?: string,
  fileName?: string,
): string | undefined {
  const file = rootEnvFilePath(startDir, fileName);
  if (!file) return undefined;
  loadDotenv({ path: file, quiet: true, override: false });
  return file;
}
