module.exports = {
    extends: [
        'eslint:recommended',
        'airbnb-base',
        'airbnb-typescript/base',
        'prettier',
        'plugin:json/recommended',
    ],
    plugins: ['@typescript-eslint', 'prettier'],
    parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
    },
    rules: {
        'no-case-declarations': 'off',
        'no-template-curly-in-string': 'off',
    },
};
