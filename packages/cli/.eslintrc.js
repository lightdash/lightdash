module.exports = {
    parserOptions: {
        project: './tsconfig.json',
        createDefaultProgram: true,
    },
    extends: [
        './../../.eslintrc.js',
        'eslint:recommended',
        'airbnb-base',
        'airbnb-typescript/base',
        'prettier',
        'plugin:json/recommended',
    ],
    plugins: ['@typescript-eslint', 'unused-imports'],
    rules: {
        'no-console': 'off',
        'import/prefer-default-export': 'off',
        'no-restricted-syntax': 'off',
        'no-throw-literal': 'off',
        '@typescript-eslint/no-throw-literal': 'off',
        'unused-imports/no-unused-imports': 'warn',
        '@typescript-eslint/consistent-type-imports': [
            'error',
            {
                prefer: 'type-imports',
                fixStyle: 'inline-type-imports'
            }
        ],
        '@typescript-eslint/no-unused-vars': [
            'error',
            {
                argsIgnorePattern: '^_',
                ignoreRestSiblings: true
            },
        ],
    },
};
