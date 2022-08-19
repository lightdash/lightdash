module.exports = {
    extends: [
        'eslint:recommended',
        'plugin:json/recommended',
        'airbnb-base',
        'airbnb-typescript/base',
        'prettier',
    ],
    plugins: ['@typescript-eslint', 'prettier'],
    parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
    },
};
