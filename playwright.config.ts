// End-to-end tests. Run against a seeded database:
//   BASE_URL=http://localhost:3100 DATABASE_URL=... npx playwright test
// CHROME_PATH points at a local Chrome when Playwright's own browsers are not installed.
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  workers: process.env.PW_WORKERS ? +process.env.PW_WORKERS : 4,
  retries: 0,
  reporter: [['list'], ['json', { outputFile: 'test-results/results.json' }]],
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3100',
    locale: 'he-IL',
    trace: 'off', // Playwright's trace snapshotter itself trips React hydration (#418) – turn on only to debug a single test
    screenshot: 'only-on-failure',
    launchOptions: process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {},
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1366, height: 900 } }, grepInvert: /@mobile/ },
    { name: 'mobile', use: { ...devices['Pixel 7'], browserName: 'chromium' }, grep: /@mobile/ },
  ],
});
