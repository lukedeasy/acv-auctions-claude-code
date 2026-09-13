#!/usr/bin/env node
/**
 * Staged check runner for Inspection Desk.
 *
 *   npm run check -- --stage <baseline|fast|m1|m2|m3|m4|m5|m6|evidence> [--json <path>]
 *
 * Exit 0: every required check for the stage passed.
 * Exit 1: at least one required check failed (an assertion or requirement).
 * Exit 2: infrastructure/tooling prevented a result.
 *
 * Statuses: pass | fail | error | not_run. A failing check and an unrun check stay distinguishable.
 *
 * Result channel: the summary is written to the --json path. When the trusted runner supplies an open file
 * descriptor in INSPECTION_DESK_RESULT_FD, the same summary is also written there, last, after every check
 * process has exited. Child processes never inherit that descriptor, so submitted code cannot write to it.
 * Checks whose `required` flag is false are diagnostics: they are reported but never change the exit code.
 * Test titles carry tags like "[AC-01]"; a check passes when every tagged test passed and at least one ran.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkEvidenceEntry, checkEvidenceEntryQuiet, checkM6Evidence, checkPlan, checkSpec } from './lib/evidence.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = parseArgs(process.argv.slice(2));
const stage = args.stage;
const STAGES = ['baseline', 'fast', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'evidence'];
if (!stage || !STAGES.includes(stage)) {
  console.error(`Usage: npm run check -- --stage <${STAGES.join('|')}> [--json <path>]`);
  process.exit(2);
}
const BINDING_FILE = '.check-binding.json';
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
  // m6 is the executable final stage. Its document check lives in the separate `evidence` stage because the
  // M6 evidence entry cites the m6 result file: run m6, write the entry from that result, then run evidence.
  m6: ['ENV-01', 'TYPE-01', 'LINT-01', 'SYS-01', 'SYS-02', 'SYS-03', 'SVC-01', 'BASE-01', 'BASE-02', ...ALL_AC, 'HOOK-01'],
  evidence: ['DOC-M1', 'DOC-M2', 'DOC-M3', 'DOC-M6'],
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
  'DOC-M6': 'EVIDENCE.md M6 entry: review target, dispositions, and a readiness decision that agrees with the cited m6 check result',
};

const plan = plans[stage];
const fastModeBrowserless = stage === 'fast' || stage === 'm4' || stage === 'evidence';

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

  runSimple('DOC-M1', () => checkEvidenceEntry(root, 'M1', ['Tested commit', 'Reproduction', 'Source references', 'Model/effort', 'Decision']));
  runSimple('DOC-M2', () => [...checkSpec(root), ...checkEvidenceEntryQuiet(root, 'M2', ['Tested commit', 'Clarification', 'Decision'], { requireCitedPath: false })]);
  runSimple('DOC-M3', () => [...checkPlan(root), ...checkEvidenceEntryQuiet(root, 'M3', ['Tested commit', 'Subagent', 'Decision'])]);
  runSimple('DOC-M6', () => checkM6Evidence(root));
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

// ---------- git and output ----------
/**
 * Which code version was tested.
 *  1. A trainer-written binding file (.check-binding.json) wins: the trusted runner writes it from its own
 *     records (participant commit, source archive hash, bundle hash) after removing anything with that name
 *     from the candidate source. Nothing in the candidate or its environment can change it.
 *  2. Otherwise Git, but only when the repository root IS this project root. A copied tree without .git sitting
 *     under some other repository must not inherit that repository's commit.
 *  3. Otherwise unknown (null), stated as such.
 */
function describeCommit() {
  const bindingPath = path.join(root, BINDING_FILE);
  if (existsSync(bindingPath)) {
    try {
      const binding = JSON.parse(readFileSync(bindingPath, 'utf8'));
      if (binding && typeof binding.testedCommit === 'string' && /^[a-f0-9]{40}$/.test(binding.testedCommit)) {
        return { sha: binding.testedCommit, dirty: false, source: 'trainer-binding', binding };
      }
      return { sha: null, dirty: null, source: 'binding-invalid', binding: null };
    } catch {
      return { sha: null, dirty: null, source: 'binding-invalid', binding: null };
    }
  }
  const top = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, encoding: 'utf8' });
  if (top.status !== 0) return { sha: null, dirty: null, source: 'none', binding: null };
  const repoRoot = path.resolve(top.stdout.trim());
  if (repoRoot !== path.resolve(root)) return { sha: null, dirty: null, source: 'enclosing-repository-ignored', binding: null };
  const rev = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  if (rev.status !== 0) return { sha: null, dirty: null, source: 'none', binding: null };
  const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' });
  return { sha: rev.stdout.trim(), dirty: status.status === 0 ? status.stdout.trim().length > 0 : null, source: 'git', binding: null };
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
    testedCommitSource: commit.source,
    workingTreeDirty: commit.dirty,
    // Present only when the trusted runner bound this run to a captured submission.
    binding: commit.binding
      ? { submissionId: commit.binding.submissionId ?? null, sourceArchiveHash: commit.binding.sourceArchiveHash ?? null, checkBundleHash: commit.binding.checkBundleHash ?? null, boundBy: commit.binding.boundBy ?? null, boundAt: commit.binding.boundAt ?? null }
      : null,
    node: process.versions.node,
    exitCode,
    requiredPassed: required.filter((r) => r.status === 'pass').length,
    requiredTotal: required.length,
    checks: results,
    checkBundleHash: bundleHash(),
  };
  const jsonPath = args.json ? path.resolve(root, args.json) : path.join(outDir, 'result.json');
  mkdirSync(path.dirname(jsonPath), { recursive: true });
  const serialized = `${JSON.stringify(summary, null, 2)}\n`;
  writeFileSync(jsonPath, serialized);
  const resultFd = Number(process.env.INSPECTION_DESK_RESULT_FD ?? '');
  if (Number.isInteger(resultFd) && resultFd > 2) {
    try {
      writeSync(resultFd, serialized);
    } catch (error) {
      console.error(`[check] could not write the summary to result fd ${resultFd}: ${error.message}`);
    }
  }
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
