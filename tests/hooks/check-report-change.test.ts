/**
 * [HOOK-01] The prepared PostToolUse hook script, driven with controlled event payloads.
 * These tests establish the script's behavior. They do not establish that Claude Code invoked it in a
 * session; that is a separate observation recorded by the trainer.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const root = path.resolve(import.meta.dirname, '..', '..');
const hook = path.join(root, '.claude', 'hooks', 'check-report-change.mjs');
let tmp: string;

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'hook-test-'));
});
afterEach(() => {
  rmSync(tmp, { recursive: true, force: true });
});

/** A stand-in for scripts/check.mjs that records its argv and writes a result JSON with the given outcome. */
function fakeRunner(exitCode: number, failedChecks: string[] = []): { runner: string; marker: string } {
  const marker = path.join(tmp, 'runner-invoked.json');
  const runner = path.join(tmp, 'fake-check.mjs');
  const checks = failedChecks.map((id) => ({ id, description: `desc ${id}`, required: true, status: 'fail', message: 'boom', evidencePaths: [`.check-output/fast/${id}.log`] }));
  writeFileSync(
    runner,
    `import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
writeFileSync(${JSON.stringify(marker)}, JSON.stringify({ args }));
const jsonIndex = args.indexOf('--json');
if (jsonIndex >= 0) writeFileSync(args[jsonIndex + 1], JSON.stringify({ stage: 'fast', requiredPassed: ${failedChecks.length ? 2 : 3}, requiredTotal: 3, checks: ${JSON.stringify(checks)} }));
process.exit(${exitCode});
`,
  );
  return { runner, marker };
}

function run(payload: unknown, env: Record<string, string> = {}) {
  const input = typeof payload === 'string' ? payload : JSON.stringify(payload);
  return spawnSync(process.execPath, [hook], {
    cwd: root,
    input,
    encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: root, ...env },
    timeout: 120000,
  });
}

const relevantEdit = (file: string, tool = 'Edit') => ({
  session_id: 'test',
  transcript_path: '/dev/null',
  cwd: root,
  hook_event_name: 'PostToolUse',
  tool_name: tool,
  tool_input: { file_path: path.join(root, file), old_string: 'a', new_string: 'b' },
  tool_response: { filePath: path.join(root, file), success: true },
});

describe('[HOOK-01] check-report-change hook', () => {
  it('[HOOK-01] runs the fast check with the fixed argument list for a relevant Edit and exits 0 when it passes', () => {
    const { runner, marker } = fakeRunner(0);
    const result = run(relevantEdit('src/client/reports/ReportPanel.tsx'), { INSPECTION_DESK_HOOK_RUNNER: runner });
    expect(result.status, result.stderr).toBe(0);
    expect(existsSync(marker)).toBe(true);
    const { args } = JSON.parse(readFileSync(marker, 'utf8')) as { args: string[] };
    expect(args.slice(0, 2)).toEqual(['--stage', 'fast']);
    expect(args[2]).toBe('--json');
    expect(result.stdout).toContain('fast checks passed');
  });

  it('[HOOK-01] exits 2 with failing check IDs on stderr when the fast check fails', () => {
    const { runner } = fakeRunner(1, ['SYS-02']);
    const result = run(relevantEdit('src/server/routes/reports.ts', 'Write'), { INSPECTION_DESK_HOOK_RUNNER: runner });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('SYS-02');
    expect(result.stderr).toContain('FAILED');
    expect(result.stderr).toContain('.check-output/fast/SYS-02.log');
  });

  it('[HOOK-01] ignores unrelated files, other tools and other events without running a check', () => {
    const { runner, marker } = fakeRunner(0);
    const env = { INSPECTION_DESK_HOOK_RUNNER: runner };
    for (const payload of [
      relevantEdit('README.md'),
      relevantEdit('src/client/pages/VehiclesPage.tsx'),
      relevantEdit('tests/acceptance/retry.spec.ts'),
      { ...relevantEdit('src/client/reports/ReportPanel.tsx'), tool_name: 'Read' },
      { ...relevantEdit('src/client/reports/ReportPanel.tsx'), hook_event_name: 'PreToolUse' },
      { ...relevantEdit('src/client/reports/ReportPanel.tsx'), tool_input: {} },
    ]) {
      const result = run(payload, env);
      expect(result.status, JSON.stringify(payload)).toBe(0);
      expect(existsSync(marker)).toBe(false);
    }
  });

  it('[HOOK-01] ignores a path outside the project even if it looks like a report file', () => {
    const { runner, marker } = fakeRunner(0);
    const outside = path.join(tmp, 'src', 'client', 'reports', 'ReportPanel.tsx');
    mkdirSync(path.dirname(outside), { recursive: true });
    const payload = { ...relevantEdit('x'), tool_input: { file_path: outside } };
    const result = run(payload, { INSPECTION_DESK_HOOK_RUNNER: runner });
    expect(result.status).toBe(0);
    expect(existsSync(marker)).toBe(false);
  });

  it('[HOOK-01] malformed input produces a diagnostic and exit 1, never a silent crash', () => {
    const notJson = run('{not json');
    expect(notJson.status).toBe(1);
    expect(notJson.stderr).toContain('malformed hook payload');
    const notObject = run('42');
    expect(notObject.status).toBe(1);
    expect(notObject.stderr).toContain('must be a JSON object');
  });

  it('[HOOK-01] a runner that cannot run is reported as a tooling problem (exit 1), not a code failure', () => {
    const result = run(relevantEdit('src/server/reports/reportJobs.ts'), { INSPECTION_DESK_HOOK_RUNNER: path.join(tmp, 'missing.mjs') });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('check runner not found');
  });

  it('[HOOK-01] real payload: a relevant edit runs the actual fast stage and reports its result', () => {
    // This invokes scripts/check.mjs for real (type check, service tests, structure check). ~10–20 s.
    const result = run(relevantEdit('src/shared/reportTypes.ts'));
    expect([0, 2], result.stderr).toContain(result.status);
    const resultFile = path.join(root, '.check-output', 'hook', 'last-fast.json');
    expect(existsSync(resultFile)).toBe(true);
    const summary = JSON.parse(readFileSync(resultFile, 'utf8')) as { stage: string; checks: Array<{ id: string }> };
    expect(summary.stage).toBe('fast');
    expect(summary.checks.map((c) => c.id)).toEqual(expect.arrayContaining(['TYPE-01', 'SVC-01', 'SYS-02']));
  }, 180000);
});
