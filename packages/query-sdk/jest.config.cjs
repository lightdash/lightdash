/** @type {import('jest').Config} */
module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    automock: false,
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],
    maxWorkers: '50%',
    globals: {
        'ts-jest': {
            tsconfig: {
                module: 'commonjs',
                moduleResolution: 'node',
                esModuleInterop: true,
                types: ['jest', 'node'],
            },
        },
    },
};
