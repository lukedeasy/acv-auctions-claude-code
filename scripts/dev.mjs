#!/usr/bin/env node
// Start the API and the Vite UI together. Ctrl+C stops both.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
loadDotEnv(path.join(root, '.env'));

const host = process.env.INSPECTION_DESK_HOST ?? '127.0.0.1';
const apiPort = process.env.INSPECTION_DESK_API_PORT ?? '4100';
const uiPort = process.env.INSPECTION_DESK_UI_PORT ?? '5173';
const env = { ...process.env, INSPECTION_DESK_HOST: host, INSPECTION_DESK_API_PORT: apiPort, INSPECTION_DESK_UI_PORT: uiPort };
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

const children = [
  spawn(npx, ['tsx', 'watch', '--clear-screen=false', 'src/server/index.ts'], { cwd: root, env, stdio: 'inherit' }),
  spawn(npx, ['vite', '--clearScreen', 'false'], { cwd: root, env, stdio: 'inherit' }),
];

console.log(`\n[inspection-desk] UI:  http://${host}:${uiPort}\n[inspection-desk] API: http://${host}:${apiPort}/api/health\n[inspection-desk] Data is kept in memory. Restarting the API restores the seed data.\n`);

let stopping = false;
function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  setTimeout(() => process.exit(code), 300).unref();
}
for (const child of children) {
  child.on('exit', (code) => {
    if (!stopping) {
      console.error(`[inspection-desk] a dev process exited with code ${code ?? 'null'}; stopping the other.`);
      stopAll(code ?? 1);
    }
  });
}
process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

function loadDotEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2];
  }
}
