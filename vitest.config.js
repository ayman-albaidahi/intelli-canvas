import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./frontend/vitest.setup.js'],
    include: ['frontend/**/*.test.js'],
    exclude: ['tests/browser/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      include: ['frontend/editor-v2/js/**/*.js'],
      exclude: ['**/*.test.js'],
      // Ratcheted floor: measured 2026-10-02 on main (34.44% stmts, 72.44%
      // branches, 51.3% funcs), minus a ~2pt margin for Node-version drift
      // between local and CI. Raise these as coverage improves — the
      // frontend modularization merge (32 test files, ~88% stmts) is the
      // next expected jump.
      thresholds: {
        statements: 32,
        branches: 70,
        functions: 50,
        lines: 32,
      },
    },
  },
});
