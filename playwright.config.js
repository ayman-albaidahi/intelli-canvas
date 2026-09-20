// Playwright configuration for IntelliCanvas browser tests.
//
// Browser tests are the project's weakest layer: the backend has 276 tests and
// the frontend has one Vitest suite, while the editor's core workflow — upload,
// adjust, apply, undo, export — had no end-to-end coverage at all. These tests
// cover that gap.
//
// The server is expected to already be running (see the pytest fixture that
// boots it, or start it manually). CI starts it in a separate step.

import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  outputDir: './test-results/browser',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 30_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: 'http://127.0.0.1:5000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Video capture needs the hosted ffmpeg binary; screenshots and traces are
    // enough to diagnose a failure and avoid a second large download.
    video: 'off',
    // Editor assets are served with no-cache headers during development; the
    // browser must never serve a stale editor.html between test runs.
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // The Playwright-hosted headless shell is blocked by Application
        // Control policy on some locked-down machines (WinError 4551), so
        // fall back to an installed Chrome. CI installs the hosted browser.
        channel: 'chrome',
      },
    },
  ],
});
