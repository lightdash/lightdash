module.exports = {
    parserOptions: {
        project: './tsconfig.json',
        createDefaultProgram: true,
    },
    extends: [
        './../../.eslintrc.js',
        'eslint:recommended',
        'plugin:json/recommended',
        'airbnb-base',
        'airbnb-typescript/base',
        'prettier',
    ],
    plugins: ['@typescript-eslint', 'unused-imports'],
    rules: {
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
                varsIgnorePattern: '^_',
                ignoreRestSiblings: true
            },
        ],
    }
};
