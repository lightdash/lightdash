import * as fs from 'fs';
import type { Config } from 'jest';
import * as path from 'path';
import { pathsToModuleNameMapper } from 'ts-jest';

const projectRootDir = path.resolve(path.join(__dirname, '..', '..'));
const rootTsConfigPath = path.resolve(
    path.join(projectRootDir, 'tsconfig.json'),
);
const rootTsConfig = JSON.parse(fs.readFileSync(rootTsConfigPath, 'utf8'));
const tsConfigPath = path.resolve(path.join(__dirname, 'tsconfig.json'));

const config: Config = {
    testPathIgnorePatterns: ['/node_modules/', '/build/'],

    preset: 'ts-jest/presets/js-with-ts-esm',

    testEnvironment: 'node',

    rootDir: path.resolve(path.join(projectRootDir, 'packages', 'frontend')),

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

    moduleNameMapper: pathsToModuleNameMapper(
        rootTsConfig.compilerOptions.paths,
        { prefix: '<rootDir>/../../' },
    ),

    setupFilesAfterEnv: ['./setupJest.ts'],

    resetMocks: true,
};

export default config;
