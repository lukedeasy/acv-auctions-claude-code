#!/usr/bin/env node
/**
 * PostToolUse hook: after Claude edits or writes a report-generation source file, run the fast checks.
 *
 * Reads the hook JSON payload from stdin. Behavior:
 *   - Unrelated event, tool, or file outside the report source area → exit 0, no check runs.
 *   - Relevant edit and the fast checks pass                         → exit 0 with a one-line summary.
 *   - Relevant edit and a check FAILS                                → exit 2; failing check IDs and log paths on stderr
 *                                                                       so Claude receives the feedback.
 *   - Malformed payload or the runner itself could not run          → exit 1 with a diagnostic (non-blocking);
 *                                                                       this is not evidence that the code is wrong.
 *
 * A PostToolUse hook runs after the edit and cannot undo it. It is feedback, not a gate.
 * The fixed executable/argument list is: node scripts/check.mjs --stage fast --json <file>.
 * INSPECTION_DESK_HOOK_RUNNER may point at another script for hook tests; it is not read from the payload.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RELEVANT = [
  /^src\/client\/reports\//,
  /^src\/server\/routes\/reports\.ts$/,
  /^src\/server\/reports\//,
  /^src\/shared\/reportTypes\.ts$/,
];
const TOOLS = new Set(['Edit', 'Write', 'MultiEdit']);
const TIMEOUT_MS = Number(process.env.INSPECTION_DESK_HOOK_TIMEOUT_MS ?? 120000);

const raw = readStdin();
let payload;
try {
  payload = JSON.parse(raw);
} catch (error) {
  console.error(`[check-report-change] malformed hook payload (not JSON): ${error.message}. No check was run.`);
  process.exit(1);
}
if (!payload || typeof payload !== 'object') {
  console.error('[check-report-change] hook payload must be a JSON object. No check was run.');
  process.exit(1);
}

const event = payload.hook_event_name;
const tool = payload.tool_name;
if (event !== 'PostToolUse' || !TOOLS.has(tool)) process.exit(0);

const filePath = payload.tool_input && (payload.tool_input.file_path ?? payload.tool_input.notebook_path);
if (typeof filePath !== 'string' || filePath.length === 0) process.exit(0);

const projectDir = resolveProjectDir(payload);
const absolute = path.resolve(projectDir, filePath);
const relative = path.relative(projectDir, absolute);
if (relative.startsWith('..') || path.isAbsolute(relative)) process.exit(0); // outside the project
const normalized = relative.split(path.sep).join('/');
if (!RELEVANT.some((pattern) => pattern.test(normalized))) process.exit(0);

const outDir = path.join(projectDir, '.check-output', 'hook');
mkdirSync(outDir, { recursive: true });
const resultPath = path.join(outDir, 'last-fast.json');
const runner = process.env.INSPECTION_DESK_HOOK_RUNNER ? path.resolve(process.env.INSPECTION_DESK_HOOK_RUNNER) : path.join(projectDir, 'scripts', 'check.mjs');
if (!existsSync(runner)) {
  console.error(`[check-report-change] check runner not found at ${runner}. No check was run.`);
  process.exit(1);
}

const args = [runner, '--stage', 'fast', '--json', resultPath];
const proc = spawnSync(process.execPath, args, { cwd: projectDir, encoding: 'utf8', timeout: TIMEOUT_MS, env: process.env, maxBuffer: 32 * 1024 * 1024 });

if (proc.error) {
  const reason = proc.error.code === 'ETIMEDOUT' ? `timed out after ${TIMEOUT_MS} ms` : proc.error.message;
  console.error(`[check-report-change] the fast check could not complete (${reason}). This is a tooling problem, not a code result.`);
  process.exit(1);
}

const result = readResult(resultPath);

if (proc.status === 0) {
  const passed = result ? `${result.requiredPassed}/${result.requiredTotal}` : 'all';
  console.log(`[check-report-change] ${normalized} changed → fast checks passed (${passed}). Result: .check-output/hook/last-fast.json`);
  process.exit(0);
}

if (proc.status === 1) {
  const failed = result ? result.checks.filter((c) => c.required && c.status !== 'pass') : [];
  const lines = failed.map((c) => `  - ${c.id} ${c.status}: ${c.description}${c.message ? ` — ${c.message}` : ''}${c.evidencePaths?.length ? ` (log: ${c.evidencePaths[0]})` : ''}`);
  console.error(
    [
      `[check-report-change] ${normalized} changed → fast checks FAILED.`,
      ...(lines.length ? lines : ['  (see .check-output/fast/ for logs)']),
      'Use the check output above to correct the change. Re-run: npm run check -- --stage fast',
    ].join('\n'),
  );
  process.exit(2);
}

console.error(`[check-report-change] the fast check runner exited with ${proc.status} (tooling/infrastructure problem). ${(proc.stderr || '').trim().split('\n').slice(-2).join(' | ')}`);
process.exit(1);

function readResult(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function resolveProjectDir(input) {
  if (process.env.CLAUDE_PROJECT_DIR && existsSync(process.env.CLAUDE_PROJECT_DIR)) return path.resolve(process.env.CLAUDE_PROJECT_DIR);
  if (typeof input.cwd === 'string' && existsSync(path.join(input.cwd, 'package.json'))) return path.resolve(input.cwd);
  // .claude/hooks/<this file> → project root
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}
