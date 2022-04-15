module.exports = {
  env: {
    es2021: true,
  },
  extends: ['airbnb'],
  plugins: [],
  parserOptions: {
    ecmaVersion: 12,
    sourceType: 'module',
  },
  rules: {
    camelcase: 'off',
    'import/extensions': ['error',  { js: 'always', json: 'always' }],
    'max-len': 'off',
    'new-cap': 0,
    quotes: ['error', 'single'],
    'no-multiple-empty-lines': ['error', { max: 1, maxBOF: 1, maxEOF: 0 }],
    'no-param-reassign': 0,
  },
};
