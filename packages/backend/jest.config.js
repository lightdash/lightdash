/** @type {import('ts-jest/dist/types').InitialOptionsTsJest} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    automock: false,
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],
    setupFiles: ['./setupJest.ts'],
};
