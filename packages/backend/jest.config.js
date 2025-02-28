module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    automock: false,
    setupFiles: ['./setupJest.ts'],
    testPathIgnorePatterns: ['/node_modules/', '/dist/'],

    // maybe only worth it when running in dev mode
    // https://huafu.github.io/ts-jest/user/config/isolatedModules
    transform: {
        '^.+\\.(ts|tsx)$': ['ts-jest', {
            isolatedModules: true,
        }],
    },
};
