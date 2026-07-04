import { defineConfig } from 'vitest/config';
import path from 'node:path';

// The library imports from 'react-native', a package that only resolves inside a
// React Native runtime. For unit tests we alias it to a hand-written stub so the
// SSHClient class can be imported and driven in a plain Node process.
export default defineConfig({
  resolve: {
    alias: {
      'react-native': path.resolve(__dirname, 'test/mocks/react-native.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__tests__/**'],
      // text: printed to the run log; html/lcov: local drill-down; json-summary:
      // consumed by CI to render a coverage table in the workflow step summary.
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      // Floors sit below current coverage (stmts ~88%, branch ~74%, funcs ~98%,
      // lines ~87%) to catch regressions without being brittle. Raise as coverage
      // grows. A failing threshold fails the run, gating both pre-commit and CI.
      thresholds: {
        statements: 80,
        branches: 70,
        functions: 90,
        lines: 80,
      },
    },
  },
});
