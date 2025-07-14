const common = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    automock: false,
    setupFiles: ['./setupJest.ts'],
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/src/$1',
    },
};

module.exports = {
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
