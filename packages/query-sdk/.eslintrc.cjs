module.exports = {
    parserOptions: {
        project: './tsconfig.json',
    },
    extends: [
        './../../.eslintrc.js',
        'eslint:recommended',
        'airbnb-base',
        'airbnb-typescript/base',
        'prettier',
    ],
    rules: {
        'no-restricted-syntax': 'off',
        'no-await-in-loop': 'off', // polling pattern requires await in loop
        'no-plusplus': 'off',
        'no-continue': 'off',
        'no-promise-executor-return': 'off',
        'no-underscore-dangle': 'off',
        'class-methods-use-this': 'off',
        'import/prefer-default-export': 'off',
        'import/extensions': 'off',
        '@typescript-eslint/lines-between-class-members': 'off',
        '@typescript-eslint/consistent-type-imports': [
            'error',
            {
                prefer: 'type-imports',
                fixStyle: 'inline-type-imports',
            },
        ],
        '@typescript-eslint/no-unused-vars': [
            'error',
            {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                ignoreRestSiblings: true,
            },
        ],
    },
};
