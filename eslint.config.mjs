/**
 * Lint rules, kept to the mistakes that actually shipped.
 *
 * `node --check` validates syntax and says nothing about meaning: a call to a
 * function that was never defined parses perfectly and throws only when that
 * line runs. Exactly that reached a release — the advisory shown when most of a
 * run fails was wired into both summaries while the function itself was never
 * added, so every finished run ended in a ReferenceError.
 *
 * no-undef is the rule that catches it. The rest are the same class of problem:
 * code that looks right and fails later.
 */
export default [
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        // Browser and extension APIs, plus the two vendored libraries.
        window: 'readonly', document: 'readonly', location: 'readonly', navigator: 'readonly',
        self: 'readonly', globalThis: 'readonly', console: 'readonly', chrome: 'readonly',
        fetch: 'readonly', Blob: 'readonly', File: 'readonly', FileReader: 'readonly',
        URL: 'readonly', URLSearchParams: 'readonly', Headers: 'readonly', Request: 'readonly',
        Response: 'readonly', AbortController: 'readonly', DOMParser: 'readonly',
        XMLHttpRequest: 'readonly', TextEncoder: 'readonly', TextDecoder: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly',
        clearInterval: 'readonly', atob: 'readonly', btoa: 'readonly', crypto: 'readonly',
        ImageData: 'readonly', CustomEvent: 'readonly', Event: 'readonly', CSS: 'readonly',
        MouseEvent: 'readonly', PointerEvent: 'readonly',
        ResizeObserver: 'readonly', MutationObserver: 'readonly',
        createImageBitmap: 'readonly', OffscreenCanvas: 'readonly',
        DecompressionStream: 'readonly', CompressionStream: 'readonly',
        UTIF: 'readonly'
      }
    },
    linterOptions: { reportUnusedDisableDirectives: true },
    rules: {
      'no-undef': 'error',
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-func-assign': 'error',
      'no-unreachable': 'error',
      'no-const-assign': 'error',
      'no-self-compare': 'error',
      'no-constant-condition': 'error',
      'require-atomic-updates': 'off'
    }
  },
  {
    files: ['tools/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        console: 'readonly', process: 'readonly', fetch: 'readonly',
        URL: 'readonly', URLSearchParams: 'readonly', TextEncoder: 'readonly', TextDecoder: 'readonly',
        setTimeout: 'readonly', clearTimeout: 'readonly', Blob: 'readonly'
      }
    },
    rules: { 'no-undef': 'error', 'no-unused-vars': ['error', { args: 'none' }] }
  }
];
