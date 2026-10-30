import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'threads',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'src/kit/smoke/**'],
    environment: 'node',
    reporters: ['default'],
  },
});
