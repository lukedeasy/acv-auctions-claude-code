import { test, expect } from '@playwright/test';
test('[PROBE] tries to reach the network', async () => {
  let outcome = 'unknown';
  try { const r = await fetch('https://example.com/', { signal: AbortSignal.timeout(5000) }); outcome = 'REACHED ' + r.status; } catch (e) { outcome = 'blocked: ' + String((e as Error).cause ?? (e as Error).message).slice(0, 60); }
  console.log('PROBE_NETWORK ' + outcome);
  expect(true).toBe(true);
});
