const restrictedGlobals = require('confusing-browser-globals');

module.exports = {
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
    parser: '@typescript-eslint/parser',
    parserOptions: {
        project: './tsconfig.json',
        createDefaultProgram: true,
    },
    settings: {
        react: {
            version: 'detect',
        },
    },
    rules: {
        'react/prop-types': 'off',
        'import/prefer-default-export': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
        'jsx-a11y/click-events-have-key-events': 'off',
        'jsx-a11y/no-noninteractive-element-interactions': 'off',
        'react/jsx-props-no-spreading': 'off',
        'css-modules/no-unused-class': [2, { camelCase: true }],
        'css-modules/no-undef-class': [2, { camelCase: true }],
        eqeqeq: 'error',
        'react-hooks/exhaustive-deps': 'error',
        'no-restricted-globals': ['error'].concat(restrictedGlobals),
    },
};
