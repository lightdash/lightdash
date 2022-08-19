module.exports = {
    extends: [
        'plugin:json/recommended',
        'plugin:css-modules/recommended',
        'react-app',
        'airbnb-typescript',
        'prettier',
    ],
    plugins: ['css-modules', 'jsx-a11y', '@typescript-eslint', 'prettier'],
    parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
    },
    settings: {
        'import/core-modules': ['@lightdash/common'],
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
    },
};
