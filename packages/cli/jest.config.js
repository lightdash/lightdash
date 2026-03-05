// Disable chalk colors so test assertions on styled output work consistently
// across local (TTY) and CI (non-TTY) environments.
process.env.FORCE_COLOR = '0';

module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    automock: false,
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],
    maxWorkers: '50%',
};
