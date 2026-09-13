/**
 * Regression checks for the M6 evidence cycle and tested-commit attribution.
 *
 * First-run condition: EVIDENCE.md cites workshop/evidence/m6-check.json, which only exists after the m6 stage
 * has run. The m6 stage therefore must not contain the DOC-M6 check; the separate `evidence` stage verifies the
 * entry against the file it cites. These tests run the real scripts against temporary project copies.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkM6Evidence } from '../../scripts/lib/evidence.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');
let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'evidence-flow-'));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

const SHA = 'a'.repeat(40);
const PEER_SHA = 'b'.repeat(40);

function projectCopy(name: string): string {
  const dir = path.join(tmp, name);
  mkdirSync(path.join(dir, 'workshop', 'evidence'), { recursive: true });
  cpSync(path.join(root, 'scripts'), path.join(dir, 'scripts'), { recursive: true });
  for (const file of ['SPEC.md', 'PLAN.md', 'EVIDENCE.md', '.node-version', 'package.json', 'vitest.config.ts', 'playwright.config.ts']) cpSync(path.join(root, file), path.join(dir, file));
  return dir;
}

function m6Entry(dir: string, fields: Partial<Record<'tested' | 'readiness' | 'unresolved' | 'finalChecks', string>> = {}) {
  const evidence = readFileSync(path.join(dir, 'EVIDENCE.md'), 'utf8');
  const before = evidence.split('## M6')[0];
  const entry = `## M6

- Tested commit: ${fields.tested ?? SHA}
- Outgoing review target: demo:peer at ${PEER_SHA}
- Received findings: none received
- Final checks: ${fields.finalChecks ?? 'workshop/evidence/m6-check.json'}
- Readiness: ${fields.readiness ?? 'ready_for_merge'}
- Decision: final checks run on the tested commit.
- Unresolved: ${fields.unresolved ?? 'none'}
`;
  writeFileSync(path.join(dir, 'EVIDENCE.md'), before + entry);
}

function checkResult(dir: string, overrides: Record<string, unknown> = {}) {
  const result = {
    contractVersion: 'inspection-desk-1.0',
    stage: 'm6',
    testedCommit: SHA,
    testedCommitSource: 'git',
    workingTreeDirty: false,
    exitCode: 0,
    requiredPassed: 2,
    requiredTotal: 2,
    checks: [
      { id: 'SYS-01', required: true, status: 'pass' },
      { id: 'AC-04', required: true, status: 'pass' },
    ],
    ...overrides,
  };
  writeFileSync(path.join(dir, 'workshop', 'evidence', 'm6-check.json'), JSON.stringify(result));
}

function runStage(dir: string, stage: string, env: Record<string, string> = {}) {
  const out = path.join(dir, `${stage}-result.json`);
  const proc = spawnSync(process.execPath, ['scripts/check.mjs', '--stage', stage, '--json', out], { cwd: dir, encoding: 'utf8', env: { ...process.env, ...env } });
  return { status: proc.status, result: existsSync(out) ? (JSON.parse(readFileSync(out, 'utf8')) as { testedCommit: string | null; testedCommitSource: string; checks: Array<{ id: string; status: string; message: string }>; binding: unknown }) : null, stderr: proc.stderr };
}

describe('[EVIDENCE-FLOW] M6 evidence cycle', () => {
  it('the m6 stage does not contain DOC-M6 and the evidence stage does', () => {
    const source = readFileSync(path.join(root, 'scripts', 'check.mjs'), 'utf8');
    const m6Line = source.split('\n').find((line) => /^\s*m6:\s*\[/.test(line)) ?? '';
    const evidenceLine = source.split('\n').find((line) => /^\s*evidence:\s*\[/.test(line)) ?? '';
    expect(m6Line).not.toContain('DOC-M6');
    expect(evidenceLine).toContain('DOC-M6');
  });

  it('first run: the entry cites a check file that does not exist yet → clear failure telling the learner the order', () => {
    const dir = projectCopy('first-run');
    m6Entry(dir);
    const problems = checkM6Evidence(dir);
    expect(problems.some((p) => p.includes('cited check result does not exist') && p.includes('--stage m6') && p.includes('--stage evidence'))).toBe(true);
  });

  it('after the m6 run: entry written from the result passes the evidence stage on its first run', () => {
    const dir = projectCopy('after-run');
    checkResult(dir);
    m6Entry(dir);
    expect(checkM6Evidence(dir)).toEqual([]);
  });

  it('readiness must agree with the cited result', () => {
    const dir = projectCopy('readiness');
    checkResult(dir, { exitCode: 1, checks: [{ id: 'AC-04', required: true, status: 'fail' }] });
    m6Entry(dir, { readiness: 'ready_for_merge' });
    expect(checkM6Evidence(dir).some((p) => p.includes('ready_for_merge') && p.includes('AC-04'))).toBe(true);
    m6Entry(dir, { readiness: 'changes_required', unresolved: 'AC-04 still failing' });
    expect(checkM6Evidence(dir)).toEqual([]);
    checkResult(dir);
    m6Entry(dir, { readiness: 'changes_required', unresolved: 'none' });
    expect(checkM6Evidence(dir).some((p) => p.includes('changes_required') && p.includes('passed every required check'))).toBe(true);
  });

  it('the tested commit in the entry must match the cited result; the evidence commit itself is not required anywhere', () => {
    const dir = projectCopy('commit');
    checkResult(dir, { testedCommit: 'c'.repeat(40) });
    m6Entry(dir, { tested: SHA });
    expect(checkM6Evidence(dir).some((p) => p.includes('does not match the tested commit'))).toBe(true);
    m6Entry(dir, { tested: 'c'.repeat(12) });
    expect(checkM6Evidence(dir)).toEqual([]);
  });

  it('a result produced on a dirty working tree or without a tested commit is rejected', () => {
    const dir = projectCopy('dirty');
    checkResult(dir, { workingTreeDirty: true });
    m6Entry(dir);
    expect(checkM6Evidence(dir).some((p) => p.includes('uncommitted changes'))).toBe(true);
    checkResult(dir, { testedCommit: null, testedCommitSource: 'none' });
    expect(checkM6Evidence(dir).some((p) => p.includes('records no tested commit'))).toBe(true);
  });
});

describe('[EVIDENCE-FLOW] tested-commit attribution', () => {
  it('a copied tree without its own .git does not inherit an enclosing repository’s commit', () => {
    const outer = path.join(tmp, 'outer-repo');
    mkdirSync(outer, { recursive: true });
    execFileSync('git', ['init', '-q', outer]);
    execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '--allow-empty', '-m', 'outer'], { cwd: outer });
    const dir = path.join(outer, 'candidate');
    mkdirSync(dir, { recursive: true });
    cpSync(projectCopy('seed'), dir, { recursive: true });
    const { result } = runStage(dir, 'evidence');
    expect(result).not.toBeNull();
    expect(result!.testedCommit).toBeNull();
    expect(result!.testedCommitSource).toBe('enclosing-repository-ignored');
  });

  it('a trainer binding file determines the tested commit; the environment cannot override it', () => {
    const dir = projectCopy('bound');
    const binding = { submissionId: 'demo:x:M6:abc', testedCommit: 'd'.repeat(40), sourceArchiveHash: 'e'.repeat(64), checkBundleHash: 'f'.repeat(64), boundBy: 'trainer-runner', boundAt: '2026-09-17T13:00:00.000Z' };
    writeFileSync(path.join(dir, '.check-binding.json'), JSON.stringify(binding));
    const { result } = runStage(dir, 'evidence', { INSPECTION_DESK_TESTED_COMMIT: '1'.repeat(40), GIT_DIR: path.join(tmp, 'nowhere') });
    expect(result!.testedCommit).toBe('d'.repeat(40));
    expect(result!.testedCommitSource).toBe('trainer-binding');
    expect(result!.binding).toMatchObject({ submissionId: 'demo:x:M6:abc', sourceArchiveHash: 'e'.repeat(64), checkBundleHash: 'f'.repeat(64), boundBy: 'trainer-runner' });
  });

  it('a malformed binding file yields no tested commit rather than a guess', () => {
    const dir = projectCopy('badbinding');
    writeFileSync(path.join(dir, '.check-binding.json'), '{"testedCommit": "not-a-sha"}');
    const { result } = runStage(dir, 'evidence');
    expect(result!.testedCommit).toBeNull();
    expect(result!.testedCommitSource).toBe('binding-invalid');
  });
});
