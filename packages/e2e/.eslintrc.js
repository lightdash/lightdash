module.exports = {
    parserOptions: {
        project: './tsconfig.json',
    },
    extends: [
        './../../.eslintrc.js',
        'eslint:recommended',
        'plugin:json/recommended',
        'airbnb-base',
        'airbnb-typescript/base',
        'prettier',
    ],
    overrides: [
        {
            files: ['playwright/**/*.ts', 'playwright.config.ts'],
            rules: {
                'import/no-extraneous-dependencies': [
                    'error',
                    { devDependencies: true },
                ],
            },
        },
    ],
    rules: {},
};
