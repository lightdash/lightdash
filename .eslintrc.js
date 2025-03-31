module.exports = {
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
    rules: {
        // Ensures all promises have proper handling to avoid unnoticed failures.
        '@typescript-eslint/no-floating-promises': [
            'error',
            { ignoreIIFE: true },
        ],
        // Allows the use of 'void' operator for promises we deliberately don't wait for,
        // providing a way to bypass the 'no-floating-promises' rule when necessary.
        'no-void': ['error', { allowAsStatement: true }],
        "@typescript-eslint/no-explicit-any": "error",

        // We want to add `noUncheckedIndexedAccess` but there are too many errors in the codebase
        // so we we are going to add these warnings on eslint to manually fix them incrementally.
        // Packages can exclude existing files and add errors for new files (eg: see common/.eslintrc.js)
        // TODO: fix these warnings and then add noUncheckedIndexedAccess to tsconfig.json
        "@typescript-eslint/no-unsafe-member-access": "off",
        "@typescript-eslint/no-unsafe-assignment": "off",
        "@typescript-eslint/no-unsafe-call": "off"
    },
    
};
