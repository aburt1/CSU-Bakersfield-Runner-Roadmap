import { defineConfig } from 'vitest/config';
import dotenv from 'dotenv';

// Load .env before any test code runs (needed for JWT_SECRET, DATABASE_URL, etc.)
dotenv.config();

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    sequence: { concurrent: false },
    testTimeout: 15000,
    hookTimeout: 30000,
    setupFiles: ['tests/setup.ts'],
    env: {
      // Ensure JWT_SECRET is always set for tests, even if .env is missing
      JWT_SECRET: process.env.JWT_SECRET || 'test-secret-for-vitest-do-not-use-in-prod',
      NODE_ENV: 'test',
    },
  },
});
