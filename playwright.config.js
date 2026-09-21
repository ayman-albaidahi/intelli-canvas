// Playwright configuration for IntelliCanvas browser tests.
//
// Browser tests currently cover the core smoke workflow only:
// upload, adjust, apply, undo, and export.
//
// The server is managed by webServer. CI must not start Flask separately.
// Playwright-managed Chromium is the default. Use system Chrome locally
// only with PLAYWRIGHT_USE_SYSTEM_CHROME=1.

import { defineConfig, devices } from "@playwright/test";

const useSystemChrome =
  process.env.PLAYWRIGHT_USE_SYSTEM_CHROME === "1" && !process.env.CI;

export default defineConfig({
  testDir: "./tests/browser",
  outputDir: "./test-results/browser",

  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,

  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",

  timeout: 30_000,

  expect: {
    timeout: 10_000,
  },

  webServer: {
    command: "python backend/run.py",
    url: "http://127.0.0.1:5000/api/health",
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
  },

  use: {
    baseURL: "http://127.0.0.1:5000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 10_000,
  },

  projects: [
    {
      name: "chromium",

      use: {
        ...devices["Desktop Chrome"],

        ...(useSystemChrome
          ? {
              channel: "chrome",
            }
          : {}),
      },
    },
  ],
});
