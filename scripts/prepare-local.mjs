#!/usr/bin/env node
// Check the local runtime, ports and the pinned Playwright Chromium. Reports actionable failures.
// Exit 0 only when every prerequisite is satisfied.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const notes = [];

// 1. Node version
const wanted = readFileSync(path.join(root, '.node-version'), 'utf8').trim();
const wantedMajor = Number(wanted.split('.')[0]);
const actual = process.versions.node;
const actualMajor = Number(actual.split('.')[0]);
if (actualMajor !== wantedMajor) {
  problems.push(`Node ${actual} is running, but this repository is pinned to Node ${wanted} (major ${wantedMajor}). Install Node ${wantedMajor} (for example with nvm, fnm or Homebrew node@${wantedMajor}) and re-run.`);
} else {
  notes.push(`Node ${actual} matches the pinned major ${wantedMajor}${actual === wanted ? '' : ` (pinned patch is ${wanted})`}.`);
}

// 2. Dependencies installed
if (!existsSync(path.join(root, 'node_modules', '.package-lock.json'))) {
  problems.push('Dependencies are not installed. Run `npm ci` first.');
} else {
  notes.push('node_modules present.');
}

// 3. Ports
const host = process.env.INSPECTION_DESK_HOST ?? '127.0.0.1';
const ports = {
  INSPECTION_DESK_API_PORT: Number(process.env.INSPECTION_DESK_API_PORT ?? 4100),
  INSPECTION_DESK_UI_PORT: Number(process.env.INSPECTION_DESK_UI_PORT ?? 5173),
  INSPECTION_DESK_TEST_API_PORT: Number(process.env.INSPECTION_DESK_TEST_API_PORT ?? 4190),
  INSPECTION_DESK_TEST_UI_PORT: Number(process.env.INSPECTION_DESK_TEST_UI_PORT ?? 5190),
};
for (const [name, port] of Object.entries(ports)) {
  const free = await isPortFree(host, port);
  if (!free) problems.push(`Port ${port} (${name}) is already in use on ${host}. Stop the other process or set ${name} to a free port (see .env.example).`);
  else notes.push(`Port ${port} (${name}) is free.`);
}

// 4. Playwright Chromium
if (!problems.some((p) => p.startsWith('Dependencies'))) {
  const probe = spawnSync(process.execPath, ['-e', "const {chromium}=require('@playwright/test'); console.log(chromium.executablePath())"], { cwd: root, encoding: 'utf8' });
  const executable = probe.stdout.trim();
  if (probe.status !== 0 || !executable) {
    problems.push(`Could not resolve the Playwright Chromium path: ${probe.stderr.trim() || 'unknown error'}`);
  } else if (!existsSync(executable)) {
    if (process.env.INSPECTION_DESK_SKIP_BROWSER_INSTALL === '1') {
      problems.push(`Playwright Chromium is missing at ${executable}. Run \`npx playwright install chromium\`.`);
    } else {
      console.log('[prepare-local] Installing the pinned Playwright Chromium (one-time download)…');
      const install = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['playwright', 'install', 'chromium'], { cwd: root, stdio: 'inherit' });
      if (install.status !== 0 || !existsSync(executable)) {
        problems.push('Playwright Chromium installation did not complete. Re-run `npx playwright install chromium` and check network access.');
      } else {
        notes.push(`Playwright Chromium installed at ${executable}.`);
      }
    }
  } else {
    notes.push(`Playwright Chromium present at ${executable}.`);
  }
}

for (const note of notes) console.log(`[prepare-local] ok: ${note}`);
if (problems.length > 0) {
  for (const problem of problems) console.error(`[prepare-local] PROBLEM: ${problem}`);
  console.error(`[prepare-local] ${problems.length} problem(s). Not ready.`);
  process.exit(1);
}
console.log('[prepare-local] Ready. Next: `npm run dev`, then `npm run check -- --stage baseline`.');

function isPortFree(bindHost, port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => server.close(() => resolve(true)));
    server.listen(port, bindHost);
  });
}
