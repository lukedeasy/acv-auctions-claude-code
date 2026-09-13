#!/usr/bin/env node
// Generate or verify scripts/protected-manifest.json: SHA-256 of every protected starter file.
//   node scripts/protected-manifest.mjs generate   (trainer, at freeze)
//   node scripts/protected-manifest.mjs verify     (anyone)
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'scripts', 'protected-manifest.json');

// Protected: dependency pins, fixtures, shared types, supplied service modules, supplied tests, check definitions and tooling config.
export const PROTECTED_FILES = [
  'package.json',
  'package-lock.json',
  '.node-version',
  '.npmrc',
  'tsconfig.json',
  'tsconfig.server.json',
  'vite.config.ts',
  'vitest.config.ts',
  'playwright.config.ts',
  'eslint.config.mjs',
  'src/shared/reportTypes.ts',
  'src/server/errors.ts',
  'src/server/http.ts',
  'src/server/reports/reportJobs.ts',
  'src/server/reports/buildReport.ts',
  'src/server/reports/reportStore.ts',
  'src/server/reports/scheduler.ts',
  'src/server/reports/legacyGenerate.ts',
  'src/server/fixtures/loadFixtures.ts',
  'scripts/check.mjs',
  'scripts/lib/evidence.mjs',
  'scripts/lib/evidence.d.mts',
  'scripts/probe-built-app.mjs',
  'scripts/protected-manifest.mjs',
  'tests/helpers/testApp.ts',
  'tests/helpers/browser.ts',
  'tests/baseline/api.test.ts',
  'tests/baseline/screens.spec.ts',
  'tests/acceptance/api.test.ts',
  'tests/acceptance/journeys.spec.ts',
  'tests/structure/dependency-rule.test.ts',
  'tests/structure/protected-files.test.ts',
  'tests/structure/evidence-flow.test.ts',
  'tests/hooks/check-report-change.test.ts',
  '.github/workflows/check-pr.yml',
];
export const PROTECTED_DIRS = ['fixtures', 'tests/service'];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

export function protectedPaths() {
  const files = new Set(PROTECTED_FILES);
  for (const dir of PROTECTED_DIRS) {
    const full = path.join(root, dir);
    if (existsSync(full)) for (const file of walk(full)) files.add(path.relative(root, file).split(path.sep).join('/'));
  }
  return [...files].sort();
}

export function computeManifest() {
  const files = {};
  for (const rel of protectedPaths()) {
    const full = path.join(root, rel);
    if (!existsSync(full)) throw new Error(`protected file missing: ${rel}`);
    files[rel] = createHash('sha256').update(readFileSync(full)).digest('hex');
  }
  return { contractVersion: 'inspection-desk-1.0', generatedAt: new Date().toISOString(), files };
}

const mode = process.argv[2];
if (mode === 'generate') {
  const manifest = computeManifest();
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`wrote ${path.relative(root, manifestPath)} with ${Object.keys(manifest.files).length} files`);
} else if (mode === 'verify') {
  const expected = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const actual = computeManifest();
  const problems = [];
  for (const [rel, hash] of Object.entries(expected.files)) {
    if (!(rel in actual.files)) problems.push(`missing: ${rel}`);
    else if (actual.files[rel] !== hash) problems.push(`changed: ${rel}`);
  }
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exit(1);
  }
  console.log(`all ${Object.keys(expected.files).length} protected files match`);
} else if (mode !== undefined) {
  console.error('usage: node scripts/protected-manifest.mjs <generate|verify>');
  process.exit(2);
}
