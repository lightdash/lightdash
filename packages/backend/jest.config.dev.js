const common = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    automock: false,
    setupFiles: ['./setupJest.ts'],
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
};

module.exports = {
    watchPlugins: [
        'jest-watch-typeahead/filename',
        'jest-watch-typeahead/testname',
    ],
    projects: [
        {
            ...common,
            displayName: 'main',
            testPathIgnorePatterns: [
                '/node_modules/',
                '/dist/',
                '/ee/services/ai/',
            ],
        },
        {
            ...common,
            displayName: 'ai',
            testMatch: ['<rootDir>/src/ee/services/ai/**/*.test.ts'],
            testPathIgnorePatterns: ['/node_modules/', '/dist/'],
        },
    ],
};
