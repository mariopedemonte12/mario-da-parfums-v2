#!/usr/bin/env node
// Compares the KEYS of the repo-root env file with those of .env.example and
// reports missing / unknown ones. It never prints values (they may be secrets).
//
//   node scripts/check-env.mjs [envFile] [templateFile] [--strict]
//
// Defaults: <repo root>/.env and <repo root>/.env.example.
// Exit code: 1 if required keys are missing (or, with --strict, if unknown
// keys exist); 0 otherwise. Commented template lines (`# KEY=value`) are
// OPTIONAL keys: never reported as missing, and not reported as unknown when
// present in the env file.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KEY = '[A-Za-z_][A-Za-z0-9_]*';

/** Keys assigned on active lines: `KEY=...` or `export KEY=...`. */
export function activeKeys(text) {
  const keys = new Set();
  for (const line of text.split(/\r?\n/)) {
    const m = new RegExp(`^\\s*(?:export\\s+)?(${KEY})\\s*=`).exec(line);
    if (m) keys.add(m[1]);
  }
  return keys;
}

/** Keys on commented-out template lines: `# KEY=...`. */
export function optionalKeys(text) {
  const keys = new Set();
  for (const line of text.split(/\r?\n/)) {
    const m = new RegExp(`^\\s*#\\s*(${KEY})=`).exec(line);
    if (m) keys.add(m[1]);
  }
  return keys;
}

/** Pure comparison. Returns sorted arrays of key names only. */
export function compareEnv(templateText, envText) {
  const required = activeKeys(templateText);
  const optional = optionalKeys(templateText);
  const present = activeKeys(envText);
  const missing = [...required].filter((k) => !present.has(k)).sort();
  const unknown = [...present]
    .filter((k) => !required.has(k) && !optional.has(k))
    .sort();
  return { missing, unknown };
}

export function main(argv, log = console.log) {
  const strict = argv.includes('--strict');
  const [envArg, templateArg] = argv.filter((a) => !a.startsWith('--'));
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const envPath = resolve(envArg ?? `${root}/.env`);
  const templatePath = resolve(templateArg ?? `${root}/.env.example`);

  if (!existsSync(templatePath)) {
    log(`Template not found: ${templatePath}`);
    return 2;
  }
  if (!existsSync(envPath)) {
    log(`Env file not found: ${envPath} (copy the template to create it)`);
    return 1;
  }
  const { missing, unknown } = compareEnv(
    readFileSync(templatePath, 'utf8'),
    readFileSync(envPath, 'utf8'),
  );
  for (const k of missing) log(`MISSING  ${k}  (in the template, not in your file)`);
  for (const k of unknown) log(`UNKNOWN  ${k}  (in your file, not in the template)`);
  if (!missing.length && !unknown.length) log('OK: keys match the template.');
  return missing.length || (strict && unknown.length) ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
