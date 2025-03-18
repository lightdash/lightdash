const path = require('path');

module.exports = {
    parserOptions: { tsconfigRootDir: __dirname, project: './tsconfig.json' },
    extends: [
        path.resolve(__dirname, './../../.eslintrc.js'),
        'eslint:recommended',
        'airbnb-base',
        'airbnb-typescript/base',
        'prettier',
        'plugin:json/recommended',
    ],
    rules: {
        'no-console': 'off',
        'import/prefer-default-export': 'off',
        'no-restricted-syntax': 'off',
        'no-throw-literal': 'off',
        '@typescript-eslint/no-throw-literal': 'off',
        '@typescript-eslint/no-explicit-any': 'error',
    },
};
