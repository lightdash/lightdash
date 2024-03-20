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
    },
};
