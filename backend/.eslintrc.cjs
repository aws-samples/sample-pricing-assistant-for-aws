/* eslint-env node */
// ESLint 8 legacy (eslintrc) config. Uses the .cjs extension because this
// package is "type": "module" — a plain .js config would be parsed as ESM.
module.exports = {
  root: true,
  env: {
    node: true,
    es2020: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint'],
  // Build output and dependencies are never linted. Without this, `eslint .`
  // walks into dist/ and fails resolving a config for the emitted JS.
  ignorePatterns: ['dist', 'node_modules', 'coverage', '*.cjs'],
  rules: {
    // The codebase intentionally prefixes deliberately-unused params with `_`
    // (e.g. Express handlers that only need `res`). Mirror tsconfig's
    // noUnusedParameters behavior rather than fighting it.
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
    // Bedrock/Pricing API responses are dynamically shaped; `any` is used
    // deliberately at those boundaries.
    '@typescript-eslint/no-explicit-any': 'off',
  },
};
