import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['frontend/**/*.test.js'],
    exclude: ['tests/browser/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      reportsDirectory: './coverage',
      // Measured baseline is 34%; the floor sits below it with headroom so
      // the gate fails on a real regression rather than on noise, and the
      // plan raises it in the test-pyramid phase as unit coverage grows.
      thresholds: {
        lines: 30,
      },
      // Measure the editor sources the unit suites actually exercise. The
      // Playwright specs under tests/browser drive a real browser and are
      // excluded, as are the test files themselves.
      include: ['frontend/**/*.js'],
      exclude: ['frontend/**/*.test.js', 'tests/**'],
    },
  },
});
