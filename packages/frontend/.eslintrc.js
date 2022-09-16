const restrictedGlobals = require('confusing-browser-globals');

module.exports = {
    parser: '@typescript-eslint/parser',
    parserOptions: {
        project: './tsconfig.json',
    },
    plugins: [
        '@typescript-eslint',
        'css-modules',
        'import',
        'json',
        'jsx-a11y',
        'prettier',
        'react-hooks',
        'react',
    ],
    extends: [
        'plugin:@typescript-eslint/recommended',
        'plugin:css-modules/recommended',
        'plugin:import/recommended',
        'plugin:json/recommended',
        'plugin:jsx-a11y/recommended',
        'plugin:react-hooks/recommended',
        'plugin:react/recommended',
        'airbnb-typescript',
        'prettier',
    ],

    settings: {
        react: {
            version: 'detect',
        },
    },
    rules: {
        'no-restricted-globals': ['error'].concat(restrictedGlobals),
        'react/prop-types': 'off',
        // TODO: enable these rules once the codebase is fixed
        '@typescript-eslint/ban-ts-comment': 'off',
        '@typescript-eslint/ban-types': 'off',
        '@typescript-eslint/no-empty-interface': 'off',
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-inferrable-types': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        '@typescript-eslint/no-throw-literal': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        'import/no-extraneous-dependencies': 'off',
        'import/no-named-as-default': 'off',
        'jsx-a11y/click-events-have-key-events': 'off',
        'jsx-a11y/no-autofocus': 'off',
        'jsx-a11y/no-noninteractive-element-interactions': 'off',
        'jsx-a11y/no-static-element-interactions': 'off',
        'prefer-const': 'off',
        'prefer-spread': 'off',
        'react/display-name': 'off',
        'react/jsx-key': 'off',
        'react/no-unescaped-entities': 'off',
        'react/react-in-jsx-scope': 'off',
        eqeqeq: 'off',
    },
};
