import js from '@eslint/js';
import vue from 'eslint-plugin-vue';
import globals from 'globals';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'tmp/**', 'docs/**'] },
  js.configs.recommended,
  ...vue.configs['flat/essential'],
  {
    files: ['**/*.{js,mjs,vue}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      'prefer-const': 'error',
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-duplicate-imports': 'error',
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    files: ['src/core/**/*.js'],
    languageOptions: { globals: { crypto: 'readonly', structuredClone: 'readonly', TextEncoder: 'readonly' } },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            'vue',
            'vue/*',
            'konva',
            'three',
            'three/*',
            'dexie',
            '@microsoft/signalr',
            '**/application/**',
            '**/infrastructure/**',
            '**/components/**',
            '**/renderers/**',
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        'window',
        'document',
        'localStorage',
        'sessionStorage',
        'fetch',
        'indexedDB',
        'XMLHttpRequest',
      ],
    },
  },
];
