module.exports = {
    extends: [
        'plugin:json/recommended',
        'eslint:recommended',
        'airbnb-base',
        'airbnb-typescript/base',
        'prettier',
    ],
    plugins: ['@typescript-eslint', 'prettier'],
    parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
    },
    rules: {
        'no-console': 'off',
        'import/prefer-default-export': 'off',
        'no-restricted-syntax': 'off',
        'no-throw-literal': 'off',
    },
};
