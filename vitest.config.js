import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['frontend/**/*.test.js'],
    exclude: ['tests/browser/**', 'node_modules/**'],
  },
});
