import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  { ignores: ['dist/**', 'node_modules/**', 'demo-report/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mjs}'],
    languageOptions: {
      globals: {
        console: 'readonly', process: 'readonly', URL: 'readonly', Buffer: 'readonly',
        fetch: 'readonly', setTimeout: 'readonly', clearTimeout: 'readonly',
        document: 'readonly', window: 'readonly', HTMLElement: 'readonly',
        Element: 'readonly', HTMLImageElement: 'readonly', CSS: 'readonly',
        getComputedStyle: 'readonly', navigator: 'readonly', location: 'readonly',
        HTMLAnchorElement: 'readonly', AbortSignal: 'readonly'
      }
    }
  }
];
