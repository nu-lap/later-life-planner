import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    // UI component tests run in jsdom
    environmentMatchGlobs: [['tests/ui/**', 'jsdom']],
    setupFiles: ['./tests/ui/setup.ts'],
    // Exclude the legacy node:test file and Playwright e2e specs
    exclude: ['tests/financialEngine.test.ts', 'tests/e2e/**', 'node_modules/**'],
    coverage: {
      provider: 'v8',
      reporter: ['lcov', 'text-summary'],
      include: ['src/**'],
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
