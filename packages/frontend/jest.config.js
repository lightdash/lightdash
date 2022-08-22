/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
    transform: {
        '\\.jsx?$': 'esbuild-jest',
        '\\.tsx?$': 'esbuild-jest',
        '\\.css$': 'esbuild-jest',
    },
    testEnvironment: 'jest-environment-jsdom',
    automock: false,
    setupFilesAfterEnv: ['./setupJest.ts'],
    transformIgnorePatterns: [],
};
