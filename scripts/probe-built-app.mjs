#!/usr/bin/env node
// Start the built server on the given port, probe health and the client entry, then exit.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] ?? 4300);
const host = '127.0.0.1';
const child = spawn(process.execPath, [path.join(root, 'dist', 'server', 'server', 'index.js')], {
  cwd: root,
  env: { ...process.env, INSPECTION_DESK_HOST: host, INSPECTION_DESK_API_PORT: String(port) },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '';
child.stdout.on('data', (chunk) => (output += chunk));
child.stderr.on('data', (chunk) => (output += chunk));

const deadline = Date.now() + 15000;
let ok = false;
let detail = '';
while (Date.now() < deadline) {
  try {
    const health = await fetch(`http://${host}:${port}/api/health`);
    const body = await health.json();
    const page = await fetch(`http://${host}:${port}/inspections/insp-001`);
    const html = await page.text();
    if (health.ok && body.status === 'ok' && page.ok && html.includes('<div id="root">')) {
      ok = true;
      detail = `health ${health.status} ${JSON.stringify(body)}; client entry served for deep link (${html.length} bytes)`;
      break;
    }
    detail = `health ${health.status}; page ${page.status}`;
  } catch (error) {
    detail = String(error.message ?? error);
  }
  await new Promise((resolve) => setTimeout(resolve, 250));
}
child.kill('SIGTERM');
console.log(ok ? `built app reachable on port ${port}: ${detail}` : `built app NOT reachable on port ${port}: ${detail}\n${output}`);
process.exit(ok ? 0 : 1);
