import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, '../../src') },
  },
  test: {
    name: 'boundaries',
    globals: true,
    environmentMatchGlobs: [
      ['tests/boundaries/ui/**', 'jsdom'],
      ['tests/boundaries/engine/**', 'node'],
    ],
    setupFiles: [path.resolve(__dirname, '../ui/setup.ts')],
    include: ['tests/boundaries/**/*.test.{ts,tsx}'],
  },
});
