import {
    DEFAULT_SPOTLIGHT_CONFIG,
    SupportedDbtVersions,
    type LightdashProjectConfig,
    type WarehouseClient,
} from '@lightdash/common';
import fs from 'fs/promises';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import type { CachedWarehouse, DbtClient } from '../types';
import { DbtBaseProjectAdapter } from './dbtBaseProjectAdapter';

const readFileSpy = jest.spyOn(fs, 'readFile');

describe('getLightdashProjectConfig', () => {
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
                experimental: {
                    label: 'Experimental Metrics',
                    color: 'orange',
                },
                sales: { label: 'Sales', color: 'green' },
            },
        },
    };

    const INVALID_CONFIG_CONTENTS =
        'spotlight:\n default_visibility: invalid_value';

    const mockProjectAdapter = new DbtBaseProjectAdapter(
        jest.fn() as unknown as DbtClient,
        jest.fn() as unknown as WarehouseClient,
        jest.fn() as unknown as CachedWarehouse,
        SupportedDbtVersions.V1_9,
        './some/path/to/dbt/project',
    );

    describe('Existing config file', () => {
        describe('when valid', () => {
            it('should load the config file', async () => {
                readFileSpy.mockResolvedValueOnce(VALID_CONFIG_CONTENTS);
                const config =
                    await mockProjectAdapter.getLightdashProjectConfig();
                expect(config).toEqual(VALID_CONFIG);
            });
        });

        describe('when invalid', () => {
            it('should throw an error', async () => {
                readFileSpy.mockResolvedValueOnce(INVALID_CONFIG_CONTENTS);
                await expect(
                    mockProjectAdapter.getLightdashProjectConfig(),
                ).rejects.toThrow(/Invalid lightdash.config.yml with errors/);
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

    describe('Missing config file', () => {
        it('should load the default config', async () => {
            // ! Throwing a mock error, not something we should rely on but when running the test in jest `e instanceof Error` is false, but when running the code in node it is true
            // ! Check: https://github.com/jestjs/jest/issues/11808
            readFileSpy.mockRejectedValueOnce(
                new MockedFSError('file not found', 'ENOENT'),
            );

            const config = await mockProjectAdapter.getLightdashProjectConfig();

            expect(config).toEqual({
                spotlight: DEFAULT_SPOTLIGHT_CONFIG,
            });
        });
    });
});

describe('getProjectContext', () => {
    const mockProjectAdapter = new DbtBaseProjectAdapter(
        jest.fn() as unknown as DbtClient,
        jest.fn() as unknown as WarehouseClient,
        jest.fn() as unknown as CachedWarehouse,
        SupportedDbtVersions.V1_9,
        './some/path/to/dbt/project',
    );

    class MockedFSError extends Error {
        code: string;

        constructor(message: string, code: string) {
            super(message);
            this.code = code;
        }
    }

    it('should load project context from lightdash.project_context.yml', async () => {
        readFileSpy.mockResolvedValueOnce(`
- id: hr
  kind: definition
  content: '"HR" = high-risk cohort.'
  terms: [HR]
`);

        const context = await mockProjectAdapter.getProjectContext();

        expect(context).toEqual([
            {
                id: 'hr',
                kind: 'definition',
                content: '"HR" = high-risk cohort.',
                terms: ['HR'],
                objects: [],
            },
        ]);
    });

    it('should return an empty list when project context file is missing', async () => {
        readFileSpy.mockRejectedValueOnce(
            new MockedFSError('file not found', 'ENOENT'),
        );

        const context = await mockProjectAdapter.getProjectContext();

        expect(context).toEqual([]);
    });

    it('should throw when project context file is invalid', async () => {
        readFileSpy.mockResolvedValueOnce('id: hr');

        await expect(mockProjectAdapter.getProjectContext()).rejects.toThrow(
            /Invalid lightdash.project_context.yml with errors/,
        );
    });
});

afterAll(() => {
    readFileSpy.mockRestore();
});
