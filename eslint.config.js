/* eslint-disable @typescript-eslint/no-require-imports */
/* global require __dirname */ // removes eslint `error 'require' is not defined no-undef` error in this config file (and same for __dirname)
const { defineConfig, globalIgnores } = require('eslint/config');

const tsParser = require('@typescript-eslint/parser');
const typescriptEslint = require('@typescript-eslint/eslint-plugin');
const js = require('@eslint/js');

const { FlatCompat } = require('@eslint/eslintrc');

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all,
});

const process = require('process');
const devBuild = !process.env.NODE_ENV || process.env.NODE_ENV === 'development';

module.exports = defineConfig([
  {
    languageOptions: {
      parser: tsParser,
      globals: {
        module: true
      },
      ecmaVersion: 2019,
      sourceType: 'module',
      parserOptions: {},
    },

    plugins: {
      '@typescript-eslint': typescriptEslint,
    },

    extends: compat.extends(
      'eslint:recommended',
      'plugin:@typescript-eslint/eslint-recommended',
      'plugin:@typescript-eslint/recommended'
    ),

    rules: {
      // this rule helps us be honest with our code annotations
      'no-warning-comments': ['warn', { terms: ['todo', 'fixme', 'xxx', 'bug'], location: 'anywhere' }],

      // don't be using the console in production, that's just silly
      'no-console': [devBuild ? 'warn' : 'error', { allow: ['assert'] }],

      // these rules help us keep the code readable & consistent
      'max-len': ['warn', { code: 240 }],
      'max-lines-per-function': ['error', { max: 50, skipComments: true, skipBlankLines: true }],
      'quotes': ['error', 'single'],
      'indent': ['error', 2],
      'linebreak-style': ['error', 'unix'],
      'no-trailing-spaces': ['error'],
      'semi': ['error', 'always'],
    },
  },

  // Test files, mocks, and tooling config run in Node (not the RN runtime) and use
  // Vitest/Node APIs. Relax the source-only rules that don't apply to test code.
  {
    files: [
      'src/**/*.test.ts',
      'test/**/*.{ts,js,mjs}',
      '.github/scripts/**/*.{js,mjs}',
      'vitest.config.ts',
    ],
    languageOptions: {
      globals: {
        __dirname: true,
        process: true,
        console: true,
        Buffer: true,
        module: true,
        require: true,
        global: true,
        setTimeout: true,
        clearTimeout: true,
        setInterval: true,
        clearInterval: true,
        URL: true,
      },
    },
    rules: {
      // Test bodies (describe/it callbacks) legitimately exceed the source limit.
      'max-lines-per-function': 'off',
      // Tests and the OpenSSH smoke harness log progress intentionally.
      'no-console': 'off',
      // Native callbacks and the react-native stub are loosely typed by design.
      '@typescript-eslint/no-explicit-any': 'off',
      // Allow underscore-prefixed unused args (e.g. RN signature placeholders).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Tests reference known-issue tickets by name; that is intentional here.
      'no-warning-comments': 'off',
    },
  },

  globalIgnores([
    // Project
    'node_modules',
    'lib',

    // Dev scratch pad
    'scratch'
  ]),
]);
