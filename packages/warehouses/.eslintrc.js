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
        'max-classes-per-file': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        'no-case-declarations': 'off',
        'import/prefer-default-export': 'off',
    },
};
