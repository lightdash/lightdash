import {
    DEFAULT_SPOTLIGHT_CONFIG,
    type LightdashProjectConfig,
} from '@lightdash/common';
import fs from 'fs/promises';
import { readAndLoadLightdashProjectConfig } from '.';

const VALID_CONFIG_CONTENTS =
    'spotlight:\n' +
    '  default_visibility: show # Optional, defaults to "show"\n' +
    '  categories:\n' +
    '    core:\n' +
    '      label: "Core Metrics"\n' +
    '      color: blue\n' +
    '    experimental:\n' +
    '      label: "Experimental Metrics"\n' +
    '      color: orange\n' +
    '    sales:\n' +
    '      label: "Sales"\n' +
    '      color: green\n';

const VALID_CONFIG: LightdashProjectConfig = {
    spotlight: {
        default_visibility: 'show',
        categories: {
            core: { label: 'Core Metrics', color: 'blue' },
            experimental: { label: 'Experimental Metrics', color: 'orange' },
            sales: { label: 'Sales', color: 'green' },
        },
    },
};

const INVALID_CONFIG_CONTENTS = 'I am invalid';

const readFileSpy = jest.spyOn(fs, 'readFile');

// Mock getConfig
jest.mock('../config', () => ({
    getConfig: jest.fn().mockResolvedValue({ user: null, context: null }),
}));

describe('Existing lightdash.config.yml file', () => {
    describe('when valid', () => {
        it('should load the config file', async () => {
            readFileSpy.mockResolvedValueOnce(VALID_CONFIG_CONTENTS);
            const config = await readAndLoadLightdashProjectConfig('');
            expect(config).toEqual(VALID_CONFIG);
        });
    });

    describe('when invalid', () => {
        it('should throw an error', async () => {
            readFileSpy.mockResolvedValueOnce(INVALID_CONFIG_CONTENTS);
            await expect(readAndLoadLightdashProjectConfig('')).rejects.toThrow(
                /Invalid lightdash.config.yml with errors/,
            );
        });
    });
});

class MockedFSError extends Error {
    code: string;

    constructor(message: string, code: string) {
        super(message);
        this.code = code;
    }
}

describe('Missing lightdash.config.yml file', () => {
    it('should load the default config', async () => {
        // ! Throwing a mock error, not something we should rely on but when running the test in jest `e instanceof Error` is false, but when running the code in node it is true
        // ! Check: https://github.com/jestjs/jest/issues/11808
        readFileSpy.mockRejectedValueOnce(
            new MockedFSError('file not found', 'ENOENT'),
        );
        const config = await readAndLoadLightdashProjectConfig(
            './some/path/to/nonexisting/file',
        );

        expect(config).toEqual({
            spotlight: DEFAULT_SPOTLIGHT_CONFIG,
        });
    });
});

afterAll(() => {
    jest.restoreAllMocks();
});
