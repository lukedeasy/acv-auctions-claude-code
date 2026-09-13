import { test, expect } from '@playwright/test';
test.setTimeout(20 * 60 * 1000);
test('[AC-06] [PROBE] sleeps past the wall-clock limit', async () => {
  console.log('PROBE_TIMEOUT sleeping');
  await new Promise((r) => setTimeout(r, 19 * 60 * 1000));
  expect(true).toBe(true);
});
