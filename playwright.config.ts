import { defineConfig, devices } from '@playwright/test';

const baseURL = 'http://127.0.0.1:4200';
const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Measured on the actual GitHub-hosted runner: workers: 2 added browser-process
  // contention without a real parallel gain (webkit test time went 124s -> 139s),
  // so CI stays single-worker. fullyParallel still helps local runs on more cores.
  workers: isCI ? 1 : undefined,
  retries: isCI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    storageState: {
      cookies: [],
      origins: [
        {
          origin: baseURL,
          localStorage: [{ name: 'lealchess.onboarding.completed', value: '2' }],
        },
      ],
    },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'ng serve --host 127.0.0.1 --port 4200',
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
