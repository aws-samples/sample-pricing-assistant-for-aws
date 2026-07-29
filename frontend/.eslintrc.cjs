/* eslint-env node */
// ESLint 8 legacy (eslintrc) config. Uses the .cjs extension because this
// package is "type": "module" — a plain .js config would be parsed as ESM.
module.exports = {
  root: true,
  env: {
    browser: true,
    es2020: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint', 'react-refresh'],
  // Build output and dependencies are never linted. Without this, `eslint .`
  // walks into dist/ and fails resolving a config for the bundled JS.
  ignorePatterns: ['dist', 'node_modules', 'coverage', '*.cjs'],
  rules: {
    'react-refresh/only-export-components': [
      'warn',
      { allowConstantExport: true },
    ],
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    '@typescript-eslint/no-explicit-any': 'off',
  },
};
