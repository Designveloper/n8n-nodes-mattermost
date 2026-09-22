module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'script',
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended'],
  env: {
    node: true,
    es2022: true,
  },
  rules: {
    'no-empty': ['error', { allowEmptyCatch: true }],
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
  },
  ignorePatterns: ['dist/**', 'node_modules/**'],
};
