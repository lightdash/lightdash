module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    automock: false,
    setupFiles: ['./setupJest.ts'],
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],
};
