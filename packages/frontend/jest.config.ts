import type { Config } from 'jest';
import * as path from 'path';
import { pathsToModuleNameMapper } from 'ts-jest';

const rootDir = path.resolve(__dirname);
const tsConfigPath = path.resolve(path.join(rootDir, 'tsconfig.json'));
const tsConfig = require(tsConfigPath);

const config: Config = {
    testPathIgnorePatterns: ['/node_modules/', '/build/'],

    preset: 'ts-jest/presets/js-with-ts-esm',

    testEnvironment: 'node',

    rootDir: rootDir,

    transform: {
        '^.+\\.(js|jsx|mjs|cjs|ts|tsx)$': [
            'ts-jest',
            { allowJs: true, tsConfigPath: tsConfigPath },
        ],

        '^.+\\.css$': '<rootDir>/config/jest/cssMock.js',
        '^(?!.*\\.(js|jsx|ts|tsx|css|json)$)':
            '<rootDir>/config/jest/fileMock.js',
    },

    transformIgnorePatterns: [
        '[/\\\\]node_modules[/\\\\].+\\.(js|jsx|ts|tsx)$',
    ],

    testMatch: [
        '<rootDir>/**/__tests__/**/*.{js,jsx,ts,tsx}',
        '<rootDir>/**/*.{spec,test}.{js,jsx,ts,tsx}',
    ],

    moduleNameMapper: {
        ...pathsToModuleNameMapper(tsConfig.compilerOptions.paths, {
            prefix: '<rootDir>/',
        }),
        'lodash-es': 'lodash',
    },

    setupFilesAfterEnv: ['./setupJest.ts'],

    resetMocks: true,
};

export default config;
