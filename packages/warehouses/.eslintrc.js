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
    rules: {
        'max-classes-per-file': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        'no-case-declarations': 'off',
        'import/prefer-default-export': 'off',
        'class-methods-use-this': 'off',
        'no-console': 'off',
    },
};
