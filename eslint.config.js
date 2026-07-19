import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        fetch: 'readonly',
        AbortSignal: 'readonly',
        AbortController: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-console': 'off',
      'no-constant-condition': ['error', { checkLoops: false }],
      'prefer-const': 'warn',
      'no-var': 'error',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-useless-assignment': 'warn',
      'no-useless-escape': 'warn',
    },
  },
  {
    files: [
      'trainer/screenshotter.js',
      'timeline/timelineScraper.js',
      'utils/skillScraper.js',
      'scripts/scrapeCards.js',
    ],
    languageOptions: {
      globals: {
        document: 'readonly',
        window: 'readonly',
        localStorage: 'readonly',
        AbortSignal: 'readonly',
        AbortController: 'readonly',
        fetch: 'readonly',
      },
    },
  },
  {
    ignores: [
      'node_modules/**',
      'data/**',
      'attached_assets/**',
      'milestone_images/**',
      '.local/**',
    ],
  },
];
