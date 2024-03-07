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
        'max-classes-per-file': 'off',
        'no-case-declarations': 'off',
        'import/prefer-default-export': 'off',
        'class-methods-use-this': 'off',
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
