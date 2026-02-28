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
    rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-loop-func': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        'no-await-in-loop': 'off',
        'no-plusplus': 'off',
        'no-promise-executor-return': 'off',
        'no-restricted-syntax': 'off',
        'import/no-extraneous-dependencies': 'off',
    },
};
