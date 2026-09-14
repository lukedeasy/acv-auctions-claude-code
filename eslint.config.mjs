import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'test-results/**', 'playwright-report/**', '.check-output/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/client/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // The starter resets loading state synchronously when a route parameter changes. That pattern is
      // deliberate and easy to read here, so the React Compiler-oriented rule is off here.
      'react-hooks/set-state-in-effect': 'off',
    },
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    files: ['src/server/**/*.ts', 'scripts/**/*.mjs', '.claude/hooks/**/*.mjs', 'tests/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
