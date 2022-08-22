/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
    transform: {
        '^.+\\.tsx?$': 'esbuild-jest',
    },
    testEnvironment: 'jest-environment-jsdom',
    automock: false,
    testPathIgnorePatterns: ['/node_modules/', '/build/'],
    setupFilesAfterEnv: ['./setupJest.ts'],
};
