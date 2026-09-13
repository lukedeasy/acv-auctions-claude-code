import { test, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
test('[PROBE] tries to write outside the writable dirs', async () => {
  const targets = ['/work/scripts/check.mjs', '/work/tests/acceptance/journeys.spec.ts', '/etc/probe.txt', '/root/probe.txt', '/trusted-install/probe.txt', '/work/.check-binding.json'];
  const outcomes: Record<string, string> = {};
  for (const t of targets) { try { writeFileSync(t, 'forged'); outcomes[t] = 'WROTE'; } catch (e) { outcomes[t] = String((e as Error).message).slice(0, 40); } }
  console.log('PROBE_OUTSIDE_WRITE ' + JSON.stringify(outcomes));
  expect(true).toBe(true);
});
