/**
 * [SYS-03] Protected files must match the starter manifest in scripts/protected-manifest.json.
 * Contributors may add tests; they may not change fixtures, expected reports, the lockfile, the supplied
 * service or the check definitions. This public copy is feedback; the trainer's private manifest is authoritative.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..', '..');
const manifestPath = path.join(root, 'scripts', 'protected-manifest.json');

interface Manifest {
  contractVersion: string;
  generatedAt: string;
  files: Record<string, string>;
}

function sha256(file: string): string {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

describe('[SYS-03] protected file integrity', () => {
  it('[SYS-03] the manifest exists and names the contract', () => {
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
    expect(manifest.contractVersion).toBe('inspection-desk-1.0');
    expect(Object.keys(manifest.files).length).toBeGreaterThan(10);
  });

  it('[SYS-03] every protected file is present and unchanged', () => {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
    const problems: string[] = [];
    for (const [rel, expected] of Object.entries(manifest.files)) {
      const full = path.join(root, rel);
      if (!existsSync(full)) {
        problems.push(`missing: ${rel}`);
        continue;
      }
      const actual = sha256(full);
      if (actual !== expected) problems.push(`changed: ${rel}`);
    }
    expect(problems, `Protected files differ from the starter manifest:\n${problems.join('\n')}\nChanges here need review and block automatic award confirmation.`).toEqual([]);
  });
});
