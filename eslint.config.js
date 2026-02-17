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

  globalIgnores([
    // Project
    'node_modules',
    'lib',

    // Dev scratch pad
    'scratch'
  ]),
]);
