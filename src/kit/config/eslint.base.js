// Shared ESLint flat config for 499apps Games repos.
// Consumers import this file from their vendored copy: ./src/kit/config/eslint.base.js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * @param {{ extraIgnores?: string[] }} [options]
 * @returns {import('eslint').Linter.Config[]}
 */
export function createEslintConfig(options = {}) {
  const extraIgnores = options.extraIgnores ?? [];
  return [
    {
      ignores: [
        'dist/**',
        'site/**',
        'node_modules/**',
        'test-results/**',
        'playwright-report/**',
        'e2e-results/**',
        'blob-report/**',
        'coverage/**',
        'public/**',
        ...extraIgnores,
      ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
      files: ['**/*.{js,mjs,cjs}'],
      languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        globals: { ...globals.node },
      },
      rules: {
        'no-console': 'off',
      },
    },
    {
      files: ['**/*.{ts,mts,cts}'],
      languageOptions: {
        globals: { ...globals.browser, ...globals.node },
      },
      rules: {
        '@typescript-eslint/consistent-type-imports': [
          'error',
          { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
        ],
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
        ],
        'no-console': 'off',
      },
    },
    prettier,
  ];
}

export default createEslintConfig();
