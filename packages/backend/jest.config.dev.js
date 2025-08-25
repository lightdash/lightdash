module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    automock: false,
    setupFiles: ['./setupJest.ts'],
    testPathIgnorePatterns: [
        '/node_modules/',
        '/dist/',
        '.*\\.integration\\.test\\.ts$',
    ],
    maxWorkers: '50%',
    transform: {
        '^.+\\.ts$': [
            'ts-jest',
            {
                transpileOnly: true,
                isolatedModules: true,
            },
        ],
    },
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
    },
    watchPlugins: [
        'jest-watch-typeahead/filename',
        'jest-watch-typeahead/testname',
    ],
};
