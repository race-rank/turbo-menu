import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Mirrors the '@' alias in vite.config.ts so tests can import app modules.
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    testTimeout: 15000,
    // clearFirestore + seeding on a cold JVM can approach the 10s default.
    hookTimeout: 15000,
    fileParallelism: false,
  },
});
