const path = require('path');

module.exports = {
    parserOptions: { tsconfigRootDir: __dirname, project: './tsconfig.json' },
    extends: [
        path.resolve(__dirname, './../../.eslintrc.js'),
        'eslint:recommended',
        'plugin:json/recommended',
        'airbnb-base',
        'airbnb-typescript/base',
        'prettier',
    ],
};
