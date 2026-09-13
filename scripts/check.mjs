#!/usr/bin/env node
/**
 * Staged check runner for Inspection Desk.
 *
 *   npm run check -- --stage <baseline|fast|m1|m2|m3|m4|m5|m6> [--json <path>]
 *
 * Exit 0: every required check for the stage passed.
 * Exit 1: at least one required check failed (an assertion or requirement).
 * Exit 2: infrastructure/tooling prevented a result.
 *
 * Statuses: pass | fail | error | not_run. A failing check and an unrun check stay distinguishable.
 * Checks whose `required` flag is false are diagnostics: they are reported but never change the exit code.
 * Test titles carry tags like "[AC-01]"; a check passes when every tagged test passed and at least one ran.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const stage = args.stage;
const STAGES = ['baseline', 'fast', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6'];
if (!stage || !STAGES.includes(stage)) {
  console.error(`Usage: npm run check -- --stage <${STAGES.join('|')}> [--json <path>]`);
  process.exit(2);
}
const outDir = path.join(root, '.check-output', stage);
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const startedAt = new Date().toISOString();
const results = [];
const commit = describeCommit();

// ---------- stage plans ----------
const ALL_AC = ['AC-01', 'AC-02', 'AC-03', 'AC-04', 'AC-05', 'AC-06'];
const plans = {
  baseline: ['ENV-01', 'TYPE-01', 'LINT-01', 'SVC-01', 'BASE-01', 'BASE-02', 'BASE-02-STRONG'],
  fast: ['TYPE-01', 'SVC-01', 'SYS-02'],
  m1: ['ENV-01', 'TYPE-01', 'LINT-01', 'SVC-01', 'BASE-01', 'BASE-02', 'BASE-02-STRONG', 'DOC-M1'],
  m2: ['ENV-01', 'TYPE-01', 'LINT-01', 'SVC-01', 'BASE-01', 'BASE-02', 'BASE-02-STRONG', 'DOC-M1', 'DOC-M2'],
  m3: ['ENV-01', 'TYPE-01', 'LINT-01', 'SVC-01', 'BASE-01', 'BASE-02', 'BASE-02-STRONG', 'DOC-M1', 'DOC-M2', 'DOC-M3'],
  m4: ['TYPE-01', 'SVC-01', 'SYS-02', 'AC-01', 'AC-02', 'AC-03'],
  m5: ['ENV-01', 'TYPE-01', 'LINT-01', 'SYS-01', 'SYS-02', 'SYS-03', 'SVC-01', 'BASE-01', 'BASE-02', ...ALL_AC, 'HOOK-01'],
  m6: ['ENV-01', 'TYPE-01', 'LINT-01', 'SYS-01', 'SYS-02', 'SYS-03', 'SVC-01', 'BASE-01', 'BASE-02', ...ALL_AC, 'HOOK-01', 'DOC-M6'],
};
const NOT_REQUIRED = new Set(['BASE-02-STRONG']);
const DESCRIPTIONS = {
  'ENV-01': 'Runtime matches .node-version and dependencies are installed',
  'TYPE-01': 'TypeScript type check',
  'LINT-01': 'ESLint',
  'SVC-01': 'Supplied job service, builder and store unit tests',
  'SYS-01': 'Clean compile and reachable built app',
  'SYS-02': 'New handlers use the job service; no direct builder/store import',
  'SYS-03': 'Protected files match the starter manifest',
  'BASE-01': 'Screens load, fixture links work, legacy generation produces the expected document',
  'BASE-02': 'Weak baseline case: the error message appears after an injected failure',
  'BASE-02-STRONG': 'Stronger recovery case (expected to FAIL on the unmodified starter; passes after modernization)',
  'AC-01': 'Progress: Start returns a run before settlement; pending/running visible',
  'AC-02': 'One active run per inspection; UI prevents duplicate active requests',
  'AC-03': 'Completed run opens the correct expected report',
  'AC-04': 'Failure exits generating state and enables Retry without claiming success',
  'AC-05': 'Retry creates one child from original snapshots; ineligible retry creates nothing',
  'AC-06': 'Report contents preserved; navigation never misattributes a report',
  'HOOK-01': 'Prepared hook script behaves as documented with controlled event payloads',
  'DOC-M1': 'EVIDENCE.md M1 entry structure and cited paths',
  'DOC-M2': 'SPEC.md structure, unique acceptance IDs and M2 evidence entry',
  'DOC-M3': 'PLAN.md increments, acceptance mapping, estimates, subagent evidence and M3 entry',
  'DOC-M6': 'EVIDENCE.md M6 entry: review target, dispositions and readiness decision',
};

const plan = plans[stage];
const fastModeBrowserless = stage === 'fast' || stage === 'm4';

// ---------- execute ----------
try {
  runSimple('ENV-01', checkEnvironment);
  runCommand('TYPE-01', [npx, 'tsc', '-p', 'tsconfig.json', '--noEmit']);
  runCommand('LINT-01', [npx, 'eslint', '.']);
  runCommand('SYS-01', () => buildAndProbe());

  // Test-runner checks. A check ID may have tests in both runners (for example BASE-01); they are merged into one record.
  const vitestIds = plan.filter((id) => ['SVC-01', 'SYS-02', 'SYS-03', 'BASE-01', 'HOOK-01', ...ALL_AC].includes(id));
  const browserIds = fastModeBrowserless ? [] : plan.filter((id) => ['BASE-01', 'BASE-02', 'BASE-02-STRONG', ...ALL_AC].includes(id));
  const runs = [];
  if (vitestIds.length > 0) {
    const files = new Set();
    if (vitestIds.includes('SVC-01')) files.add('tests/service');
    if (vitestIds.includes('SYS-02')) files.add('tests/structure/dependency-rule.test.ts');
    if (vitestIds.includes('SYS-03')) files.add('tests/structure/protected-files.test.ts');
    if (vitestIds.includes('BASE-01')) files.add('tests/baseline/api.test.ts');
    if (vitestIds.includes('HOOK-01')) files.add('tests/hooks/check-report-change.test.ts');
    if (vitestIds.some((id) => ALL_AC.includes(id))) files.add('tests/acceptance/api.test.ts');
    runs.push({ runner: 'vitest', ids: vitestIds, ...runVitest([...files]) });
  }
  if (browserIds.length > 0) {
    const grepIds = browserIds.map((id) => (id === 'BASE-02-STRONG' ? 'AC-04-STRONG' : id));
    runs.push({ runner: 'playwright', ids: browserIds, ...runPlaywright(grepIds) });
  }
  for (const id of plan) {
    const relevant = runs.filter((run) => run.ids.includes(id));
    if (relevant.length === 0) continue;
    const tag = id === 'BASE-02-STRONG' ? 'AC-04-STRONG' : id;
    results.push(mergeTagged(id, relevant, tag));
  }

  runSimple('DOC-M1', () => checkEvidenceEntry('M1', ['Tested commit', 'Reproduction', 'Source references', 'Model/effort', 'Decision']));
  runSimple('DOC-M2', () => [...checkSpec(), ...checkEvidenceEntryQuiet('M2', ['Tested commit', 'Clarification', 'Decision'])]);
  runSimple('DOC-M3', () => [...checkPlan(), ...checkEvidenceEntryQuiet('M3', ['Tested commit', 'Subagent', 'Decision'])]);
  runSimple('DOC-M6', () => checkM6Evidence());
} catch (error) {
  console.error(`[check] infrastructure error: ${error && error.stack ? error.stack : error}`);
  finish(2);
}
finish();

// ---------- helpers ----------
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--stage') out.stage = argv[++i];
    else if (arg === '--json') out.json = argv[++i];
    else if (arg.startsWith('--stage=')) out.stage = arg.slice('--stage='.length);
    else if (arg.startsWith('--json=')) out.json = arg.slice('--json='.length);
  }
  return out;
}

function inPlan(id) {
  return plan.includes(id);
}

function record(entry) {
  const full = {
    id: entry.id,
    description: DESCRIPTIONS[entry.id] ?? '',
    required: !NOT_REQUIRED.has(entry.id),
    status: entry.status,
    durationMs: entry.durationMs ?? 0,
    command: entry.command ?? null,
    message: entry.message ?? '',
    evidencePaths: entry.evidencePaths ?? [],
    tests: entry.tests ?? [],
    expectation: entry.id === 'BASE-02-STRONG' ? 'fails_on_starter_passes_after_modernization' : undefined,
  };
  results.push(full);
  const marker = full.status === 'pass' ? 'PASS' : full.status === 'fail' ? 'FAIL' : full.status.toUpperCase();
  const req = full.required ? '' : ' (diagnostic)';
  console.log(`[check] ${marker.padEnd(7)} ${full.id.padEnd(15)} ${full.description}${req}${full.message ? ` — ${full.message}` : ''}`);
}

function runSimple(id, fn) {
  if (!inPlan(id)) return;
  const start = Date.now();
  try {
    const problems = fn() ?? [];
    record({ id, status: problems.length === 0 ? 'pass' : 'fail', durationMs: Date.now() - start, message: problems.join('; ') });
  } catch (error) {
    record({ id, status: 'error', durationMs: Date.now() - start, message: String(error && error.message ? error.message : error) });
  }
}

function runCommand(id, commandOrFn) {
  if (!inPlan(id)) return;
  const start = Date.now();
  if (typeof commandOrFn === 'function') {
    try {
      const outcome = commandOrFn();
      record({ id, ...outcome, durationMs: Date.now() - start });
    } catch (error) {
      record({ id, status: 'error', durationMs: Date.now() - start, message: String(error && error.message ? error.message : error) });
    }
    return;
  }
  const logPath = path.join(outDir, `${id}.log`);
  const proc = spawnSync(commandOrFn[0], commandOrFn.slice(1), { cwd: root, encoding: 'utf8', env: process.env, maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(logPath, `$ ${commandOrFn.join(' ')}\n\n${proc.stdout ?? ''}\n${proc.stderr ?? ''}`);
  const status = proc.error ? 'error' : proc.status === 0 ? 'pass' : 'fail';
  record({
    id,
    status,
    durationMs: Date.now() - start,
    command: commandOrFn.join(' '),
    message: status === 'pass' ? '' : summarizeOutput(proc),
    evidencePaths: [path.relative(root, logPath)],
  });
}

function summarizeOutput(proc) {
  if (proc.error) return `could not run: ${proc.error.message}`;
  const text = `${proc.stdout ?? ''}\n${proc.stderr ?? ''}`.trim().split('\n').filter(Boolean);
  return text.slice(-3).join(' | ').slice(0, 400);
}

function checkEnvironment() {
  const problems = [];
  const wanted = readFileSync(path.join(root, '.node-version'), 'utf8').trim();
  const wantedMajor = Number(wanted.split('.')[0]);
  const actualMajor = Number(process.versions.node.split('.')[0]);
  if (actualMajor !== wantedMajor) problems.push(`Node ${process.versions.node} running; pinned major is ${wantedMajor}`);
  if (!existsSync(path.join(root, 'node_modules', '.package-lock.json'))) problems.push('node_modules missing; run npm ci');
  return problems;
}

function buildAndProbe() {
  const buildLog = path.join(outDir, 'SYS-01-build.log');
  const build = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'build', '--silent'], { cwd: root, encoding: 'utf8', env: process.env, maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(buildLog, `$ npm run build\n\n${build.stdout ?? ''}\n${build.stderr ?? ''}`);
  if (build.error) return { status: 'error', message: `build could not run: ${build.error.message}`, evidencePaths: [path.relative(root, buildLog)] };
  if (build.status !== 0) return { status: 'fail', message: summarizeOutput(build), evidencePaths: [path.relative(root, buildLog)] };
  const serverEntry = path.join(root, 'dist', 'server', 'server', 'index.js');
  const clientIndex = path.join(root, 'dist', 'client', 'index.html');
  if (!existsSync(serverEntry) || !existsSync(clientIndex)) return { status: 'fail', message: 'build output missing dist/server/server/index.js or dist/client/index.html', evidencePaths: [path.relative(root, buildLog)] };
  // Probe the built app on a free port.
  const port = findFreePortSync();
  const probe = spawnSync(process.execPath, [path.join(root, 'scripts', 'probe-built-app.mjs'), String(port)], { cwd: root, encoding: 'utf8', env: { ...process.env, INSPECTION_DESK_API_PORT: String(port) }, timeout: 30000 });
  const probeLog = path.join(outDir, 'SYS-01-probe.log');
  writeFileSync(probeLog, `${probe.stdout ?? ''}\n${probe.stderr ?? ''}`);
  if (probe.error) return { status: 'error', message: `probe could not run: ${probe.error.message}`, evidencePaths: [path.relative(root, buildLog), path.relative(root, probeLog)] };
  return {
    status: probe.status === 0 ? 'pass' : 'fail',
    message: probe.status === 0 ? '' : summarizeOutput(probe),
    command: 'npm run build && node scripts/probe-built-app.mjs',
    evidencePaths: [path.relative(root, buildLog), path.relative(root, probeLog)],
  };
}

function findFreePortSync() {
  // Deterministic search in a private range; the probe script re-checks availability.
  const base = 4300 + (process.pid % 200);
  return base;
}

function runVitest(files) {
  const jsonPath = path.join(outDir, 'vitest.json');
  const logPath = path.join(outDir, 'vitest.log');
  const cmd = [npx, 'vitest', 'run', '--reporter=default', '--reporter=json', `--outputFile=${jsonPath}`, ...files];
  const proc = spawnSync(cmd[0], cmd.slice(1), { cwd: root, encoding: 'utf8', env: { ...process.env, CI: '1' }, maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(logPath, `$ ${cmd.join(' ')}\n\n${proc.stdout ?? ''}\n${proc.stderr ?? ''}`);
  if (!existsSync(jsonPath)) return { error: `vitest produced no JSON report: ${summarizeOutput(proc)}`, tests: [], command: cmd.join(' '), log: logPath };
  const report = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const tests = [];
  for (const file of report.testResults ?? []) {
    for (const assertion of file.assertionResults ?? []) {
      tests.push({ title: assertion.fullName ?? assertion.title, status: assertion.status, file: path.relative(root, file.name), message: (assertion.failureMessages ?? []).join('\n').slice(0, 800) });
    }
    if ((file.assertionResults ?? []).length === 0 && file.status === 'failed') {
      tests.push({ title: `[FILE] ${path.relative(root, file.name)}`, status: 'failed', file: path.relative(root, file.name), message: (file.message ?? '').slice(0, 800) });
    }
  }
  return { tests, command: cmd.join(' '), log: logPath, json: jsonPath };
}

function runPlaywright(ids) {
  const jsonPath = path.join(outDir, 'playwright.json');
  const logPath = path.join(outDir, 'playwright.log');
  const grep = ids.map((id) => `\\[${id.replace('-', '\\-')}\\]`).join('|');
  const cmd = [npx, 'playwright', 'test', '--reporter=list,json', `--grep=${grep}`];
  const proc = spawnSync(cmd[0], cmd.slice(1), { cwd: root, encoding: 'utf8', env: { ...process.env, CI: '1', PLAYWRIGHT_JSON_OUTPUT_NAME: jsonPath }, maxBuffer: 64 * 1024 * 1024 });
  writeFileSync(logPath, `$ ${cmd.join(' ')}\n\n${proc.stdout ?? ''}\n${proc.stderr ?? ''}`);
  if (!existsSync(jsonPath)) return { error: `playwright produced no JSON report: ${summarizeOutput(proc)}`, tests: [], command: cmd.join(' '), log: logPath };
  const report = JSON.parse(readFileSync(jsonPath, 'utf8'));
  const tests = [];
  const walk = (suite, titles) => {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        const last = test.results?.[test.results.length - 1];
        const status = last ? last.status : 'skipped';
        tests.push({ title: [...titles, suite.title, spec.title].filter(Boolean).join(' › '), status: status === 'passed' ? 'passed' : status === 'skipped' ? 'skipped' : 'failed', file: spec.file, message: (last?.error?.message ?? '').slice(0, 800) });
      }
    }
    for (const child of suite.suites ?? []) walk(child, [...titles, suite.title]);
  };
  for (const suite of report.suites ?? []) walk(suite, []);
  const fatal = (report.errors ?? []).map((e) => e.message).join('\n');
  return { tests, command: cmd.join(' '), log: logPath, json: jsonPath, fatal };
}

// SVC-01 covers every test under tests/service/; all other checks match by a [TAG] in the test title.
function matchesCheck(test, tag) {
  if (tag === 'SVC-01') return typeof test.file === 'string' && test.file.replace(/\\/g, '/').startsWith('tests/service/');
  return test.title.includes(`[${tag}]`);
}

function mergeTagged(id, runs, tag) {
  const matching = [];
  const errors = [];
  const fatals = [];
  const commands = [];
  const evidence = [];
  for (const run of runs) {
    commands.push(run.command);
    evidence.push(...[run.log, run.json].filter(Boolean).map((p) => path.relative(root, p)));
    if (run.error) errors.push(run.error);
    if (run.fatal) fatals.push(run.fatal);
    matching.push(...run.tests.filter((test) => matchesCheck(test, tag)).map((test) => ({ ...test, runner: run.runner })));
  }
  const base = {
    id,
    description: DESCRIPTIONS[id] ?? '',
    required: !NOT_REQUIRED.has(id),
    command: commands.join(' && '),
    evidencePaths: evidence,
    tests: matching.map((test) => ({ runner: test.runner, title: test.title, status: test.status, file: test.file, message: test.message })),
    durationMs: 0,
    expectation: id === 'BASE-02-STRONG' ? 'fails_on_starter_passes_after_modernization' : undefined,
  };
  let entry;
  const failed = matching.filter((test) => test.status === 'failed');
  if (errors.length > 0) entry = { ...base, status: 'error', message: errors.join(' | ') };
  else if (matching.length === 0 && fatals.length > 0) entry = { ...base, status: 'error', message: fatals.join(' | ').slice(0, 400) };
  else if (matching.length === 0) entry = { ...base, status: 'error', message: `no test tagged [${tag}] was found in ${runs.map((r) => r.runner).join('/')} results` };
  else if (failed.length > 0) entry = { ...base, status: 'fail', message: `${failed.length}/${matching.length} tagged tests failed: ${failed.map((t) => t.title.split(' › ').pop()).join('; ').slice(0, 300)}` };
  else if (matching.every((test) => test.status === 'skipped')) entry = { ...base, status: 'not_run', message: 'all tagged tests were skipped' };
  else entry = { ...base, status: 'pass', message: `${matching.length} tagged test(s) passed` };
  const marker = entry.status.toUpperCase();
  const req = entry.required ? '' : ' (diagnostic)';
  console.log(`[check] ${marker.padEnd(7)} ${entry.id.padEnd(15)} ${entry.description}${req}${entry.message ? ` — ${entry.message}` : ''}`);
  return entry;
}

// ---------- document structure checks ----------
function readDoc(name) {
  const file = path.join(root, name);
  if (!existsSync(file)) throw new Error(`${name} is missing`);
  return readFileSync(file, 'utf8');
}

function section(markdown, heading) {
  const lines = markdown.split('\n');
  const start = lines.findIndex((line) => /^##\s+/.test(line) && line.replace(/^##\s+/, '').trim().startsWith(heading));
  if (start < 0) return null;
  const end = lines.findIndex((line, index) => index > start && /^##\s+/.test(line));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n');
}

function fieldValue(text, label) {
  const match = new RegExp(`^\\s*(?:[-*]\\s*)?\\*{0,2}${escapeRegExp(label)}\\*{0,2}\\s*:\\s*(.*)$`, 'mi').exec(text);
  return match ? match[1].trim() : null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const PLACEHOLDER = /^(?:<[^>]*>|\(fill in\)|TODO|TBD|_?not filled_?|—|-)?$/i;

function checkEvidenceEntry(moduleId, requiredFields) {
  const text = readDoc('EVIDENCE.md');
  const body = section(text, moduleId);
  if (body === null) return [`EVIDENCE.md has no "## ${moduleId}" section`];
  const problems = [];
  for (const field of requiredFields) {
    const value = fieldValue(body, field);
    if (value === null) problems.push(`${moduleId}: missing field "${field}:"`);
    else if (PLACEHOLDER.test(value)) problems.push(`${moduleId}: field "${field}:" is not filled in`);
  }
  const commit = fieldValue(body, 'Tested commit');
  if (commit && !/^[a-f0-9]{7,40}\b/i.test(commit)) problems.push(`${moduleId}: "Tested commit:" should start with a commit SHA (7–40 hex characters)`);
  problems.push(...checkCitedPaths(body, moduleId));
  return problems;
}

function checkEvidenceEntryQuiet(moduleId, requiredFields) {
  try {
    return checkEvidenceEntry(moduleId, requiredFields);
  } catch (error) {
    return [String(error.message)];
  }
}

function checkCitedPaths(body, label) {
  const problems = [];
  const cited = new Set();
  for (const match of body.matchAll(/`?((?:src|tests|scripts|workshop|fixtures|\.claude)\/[\w./-]+?)(?::\d+(?:-\d+)?)?`?(?=[\s,;)`]|$)/g)) cited.add(match[1]);
  if (cited.size === 0) problems.push(`${label}: no source path is cited (expected at least one path under src/, tests/ or similar)`);
  for (const rel of cited) {
    if (!existsSync(path.join(root, rel))) problems.push(`${label}: cited path does not exist: ${rel}`);
  }
  return problems;
}

function checkSpec() {
  const text = readDoc('SPEC.md');
  const problems = [];
  for (const heading of ['Problem and evidence', 'Intended behavior', 'Failure cases', 'Constraints', 'Acceptance criteria', 'Scope', 'Open decisions']) {
    const body = section(text, heading);
    if (body === null) problems.push(`SPEC.md: missing "## ${heading}" section`);
    else if (body.replace(/<!--[\s\S]*?-->/g, '').trim().length < 20) problems.push(`SPEC.md: "## ${heading}" is empty`);
  }
  const acceptance = section(text, 'Acceptance criteria') ?? '';
  const rows = [...acceptance.matchAll(/^\|\s*(AC-0[1-6])\s*\|/gm)].map((m) => m[1]);
  for (const id of ALL_AC) {
    const count = rows.filter((row) => row === id).length;
    if (count === 0) problems.push(`SPEC.md: acceptance table has no row for ${id}`);
    if (count > 1) problems.push(`SPEC.md: acceptance ID ${id} appears ${count} times; IDs must be unique`);
  }
  const acceptanceLines = acceptance.split('\n').filter((line) => /^\|\s*AC-0[1-6]\s*\|/.test(line));
  for (const line of acceptanceLines) {
    const cells = line.split('|').map((cell) => cell.trim()).filter((_, index, all) => index > 0 && index < all.length - 1);
    if (cells.length < 4) problems.push(`SPEC.md: row "${cells[0]}" needs example, expected result and planned check columns`);
    else if (cells.slice(1).some((cell) => cell.length === 0 || PLACEHOLDER.test(cell))) problems.push(`SPEC.md: row "${cells[0]}" has an unfilled cell`);
  }
  return problems;
}

function checkPlan() {
  const text = readDoc('PLAN.md');
  const problems = [];
  for (const heading of ['Kind of change', 'Increment A', 'Increment B', 'Acceptance mapping', 'Change estimate', 'Subagent investigation', 'Alternatives considered']) {
    const body = section(text, heading);
    if (body === null) problems.push(`PLAN.md: missing "## ${heading}" section`);
    else if (body.replace(/<!--[\s\S]*?-->/g, '').trim().length < 20) problems.push(`PLAN.md: "## ${heading}" is empty`);
  }
  const mapping = section(text, 'Acceptance mapping') ?? '';
  for (const id of ALL_AC) {
    const row = mapping.split('\n').find((line) => new RegExp(`^\\|\\s*${id}\\s*\\|`).test(line));
    if (!row) {
      problems.push(`PLAN.md: acceptance mapping has no row for ${id}`);
      continue;
    }
    const cells = row.split('|').map((cell) => cell.trim()).filter((_, index, all) => index > 0 && index < all.length - 1);
    if (cells.length < 4 || cells.slice(1).some((cell) => cell.length === 0 || PLACEHOLDER.test(cell))) problems.push(`PLAN.md: ${id} row must name the increment, file(s) and check`);
    else if (!/\b(A|B)\b/.test(cells[1])) problems.push(`PLAN.md: ${id} row must assign increment A or B`);
  }
  const estimate = section(text, 'Change estimate') ?? '';
  for (const field of ['Application code', 'Tests']) {
    const value = fieldValue(estimate, field);
    if (value === null) problems.push(`PLAN.md: change estimate missing "${field}:" range`);
    else if (!/\d+\s*(?:–|-|to)\s*\d+/.test(value)) problems.push(`PLAN.md: "${field}:" should be a range such as 40–80 lines`);
  }
  const subagent = section(text, 'Subagent investigation') ?? '';
  for (const field of ['Question', 'Tools', 'Model', 'Finding', 'Verification', 'Effect on plan']) {
    const value = fieldValue(subagent, field);
    if (value === null) problems.push(`PLAN.md: subagent investigation missing "${field}:"`);
    else if (PLACEHOLDER.test(value)) problems.push(`PLAN.md: subagent "${field}:" is not filled in`);
  }
  problems.push(...checkCitedPaths(subagent, 'PLAN.md subagent investigation'));
  return problems;
}

function checkM6Evidence() {
  const problems = checkEvidenceEntry('M6', ['Tested commit', 'Outgoing review target', 'Received findings', 'Readiness', 'Decision']);
  const body = section(readDoc('EVIDENCE.md'), 'M6') ?? '';
  const target = fieldValue(body, 'Outgoing review target');
  if (target && !/[a-f0-9]{40}/i.test(target)) problems.push('M6: "Outgoing review target:" must include the full 40-character SHA you reviewed');
  const readiness = fieldValue(body, 'Readiness');
  if (readiness && !/^(ready_for_merge|changes_required)\b/.test(readiness)) problems.push('M6: "Readiness:" must be ready_for_merge or changes_required');
  const findings = fieldValue(body, 'Received findings');
  if (findings && !/(accepted_fixed|accepted_unresolved|disputed_with_evidence|none received)/.test(body)) problems.push('M6: each received finding needs a disposition: accepted_fixed, accepted_unresolved or disputed_with_evidence (or "none received")');
  return problems;
}

// ---------- git and output ----------
function describeCommit() {
  const rev = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  if (rev.status !== 0) return { sha: null, dirty: null };
  const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' });
  return { sha: rev.stdout.trim(), dirty: status.status === 0 ? status.stdout.trim().length > 0 : null };
}

function finish(forcedExit) {
  const required = results.filter((r) => r.required);
  const anyError = required.some((r) => r.status === 'error');
  const anyFail = required.some((r) => r.status === 'fail' || r.status === 'not_run');
  const exitCode = forcedExit ?? (anyFail ? 1 : anyError ? 2 : 0);
  const summary = {
    contractVersion: 'inspection-desk-1.0',
    stage,
    startedAt,
    finishedAt: new Date().toISOString(),
    testedCommit: commit.sha,
    workingTreeDirty: commit.dirty,
    node: process.versions.node,
    exitCode,
    requiredPassed: required.filter((r) => r.status === 'pass').length,
    requiredTotal: required.length,
    checks: results,
    checkBundleHash: bundleHash(),
  };
  const jsonPath = args.json ? path.resolve(root, args.json) : path.join(outDir, 'result.json');
  mkdirSync(path.dirname(jsonPath), { recursive: true });
  writeFileSync(jsonPath, `${JSON.stringify(summary, null, 2)}\n`);
  console.log(`\n[check] stage ${stage}: ${summary.requiredPassed}/${summary.requiredTotal} required checks passed → exit ${exitCode}. Result: ${path.relative(root, jsonPath)}`);
  if (exitCode === 1) console.log('[check] Exit 1 = an assertion or requirement failed. Exit 2 = tooling prevented a result.');
  process.exit(exitCode);
}

function bundleHash() {
  const hash = createHash('sha256');
  const files = ['scripts/check.mjs', 'vitest.config.ts', 'playwright.config.ts'];
  for (const file of files) {
    const full = path.join(root, file);
    if (existsSync(full)) hash.update(`${file}\n${readFileSync(full)}`);
  }
  return hash.digest('hex').slice(0, 16);
}
