import { defineConfig, devices } from '@playwright/test';

// Browser checks use their own ports so they never collide with a running `npm run dev`.
const host = process.env.INSPECTION_DESK_HOST ?? '127.0.0.1';
const apiPort = Number(process.env.INSPECTION_DESK_TEST_API_PORT ?? 4190);
const uiPort = Number(process.env.INSPECTION_DESK_TEST_UI_PORT ?? 5190);
const baseURL = `http://${host}:${uiPort}`;
const serverEnv = {
  ...process.env,
  INSPECTION_DESK_HOST: host,
  INSPECTION_DESK_API_PORT: String(apiPort),
  INSPECTION_DESK_UI_PORT: String(uiPort),
};

export default defineConfig({
  testDir: 'tests',
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30000,
  expect: { timeout: 5000 },
  reporter: process.env.CI ? [['list'], ['json', { outputFile: '.check-output/playwright.json' }]] : [['list']],
  outputDir: 'test-results',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 },
  },
  webServer: [
    {
      command: 'npx tsx src/server/index.ts',
      url: `http://${host}:${apiPort}/api/health`,
      reuseExistingServer: false,
      env: serverEnv,
      timeout: 30000,
    },
    {
      command: 'npx vite --clearScreen false',
      url: baseURL,
      reuseExistingServer: false,
      env: serverEnv,
      timeout: 60000,
    },
  ],
});
