import {
    DEFAULT_SPOTLIGHT_CONFIG,
    SupportedDbtVersions,
    type DbtManifest,
    type LightdashProjectConfig,
    type WarehouseClient,
} from '@lightdash/common';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { DbtCliClient } from '../dbt/dbtCliClient';
import { cliArgs } from '../dbt/dbtCliClient.mock';
import type { CachedWarehouse, DbtClient } from '../types';
import { DbtBaseProjectAdapter } from './dbtBaseProjectAdapter';

const readFileSpy = vi.spyOn(fs, 'readFile');

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
        vi.fn() as unknown as DbtClient,
        vi.fn() as unknown as WarehouseClient,
        vi.fn() as unknown as CachedWarehouse,
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
            // ! Throwing a mock error, not something we should rely on but different test runtimes can disagree with node on `e instanceof Error`
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
        vi.fn() as unknown as DbtClient,
        vi.fn() as unknown as WarehouseClient,
        vi.fn() as unknown as CachedWarehouse,
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

describe('getDbtManifest', () => {
    const manifest = { nodes: {} } as unknown as DbtManifest;

    const buildAdapter = (dbtClient: DbtClient) =>
        new DbtBaseProjectAdapter(
            dbtClient,
            vi.fn() as unknown as WarehouseClient,
            vi.fn() as unknown as CachedWarehouse,
            SupportedDbtVersions.V1_9,
        );

    beforeEach(() => {
        vi.useFakeTimers({ toFake: ['Date'] });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('times dbt deps and the manifest read separately', async () => {
        const adapter = buildAdapter({
            installDeps: vi.fn(async () => {
                vi.advanceTimersByTime(2300);
            }),
            getDbtManifest: vi.fn(async () => {
                vi.advanceTimersByTime(15300);
                return { manifest };
            }),
        } as unknown as DbtClient);

        await expect(adapter.getDbtManifest()).resolves.toEqual({
            manifest,
            timings: { gitRefreshMs: null, depsMs: 2300, manifestMs: 15300 },
        });
    });

    it('prepares once across a pre-scan and two manifest fetches', async () => {
        const installDeps = vi.fn(async () => {
            vi.advanceTimersByTime(23);
        });
        const getDbtManifest = vi.fn(async () => ({ manifest }));
        const adapter = buildAdapter({
            installDeps,
            getDbtManifest,
        } as unknown as DbtClient);
        const preparation = await adapter.prepareDbtSource();
        expect(await adapter.prepareDbtSource()).toBe(preparation);
        expect((await adapter.getDbtManifest()).timings.depsMs).toBe(23);
        expect((await adapter.getDbtManifest()).timings.depsMs).toBeNull();
        expect(installDeps).toHaveBeenCalledTimes(1);
        expect(getDbtManifest).toHaveBeenCalledTimes(2);
    });

    it('prepares dependencies once while testing the client', async () => {
        const installDeps = vi.fn(async () => undefined);
        const test = vi.fn(async (prepareDependencies: () => Promise<void>) => {
            await prepareDependencies();
        });
        const adapter = new DbtBaseProjectAdapter(
            {
                installDeps,
                test,
                getDbtManifest: vi.fn(async () => ({ manifest })),
            } as unknown as DbtClient,
            {
                test: vi.fn(async () => undefined),
            } as unknown as WarehouseClient,
            vi.fn() as unknown as CachedWarehouse,
            SupportedDbtVersions.V1_9,
        );
        await adapter.test();
        expect(installDeps).toHaveBeenCalledTimes(1);
        await adapter.getDbtManifest();
        await adapter.getDbtManifest();
        expect(installDeps).toHaveBeenCalledTimes(1);
        expect(test).toHaveBeenCalledTimes(1);
    });

    it('reports a missing project directory before dependency preparation can fail', async () => {
        const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'dbt-test-'));
        const client = new DbtCliClient({
            ...cliArgs,
            dbtProjectDirectory: path.join(directory, 'missing-project'),
            dbtVersion: SupportedDbtVersions.V1_9,
        });
        const installDeps = vi
            .spyOn(client, 'installDeps')
            .mockRejectedValue(new Error('deps failed'));
        try {
            await expect(buildAdapter(client).test()).rejects.toHaveProperty(
                'message',
                'dbt project directory not found: /missing-project',
            );
            expect(installDeps).not.toHaveBeenCalled();
        } finally {
            installDeps.mockRestore();
            await fs.rmdir(directory);
        }
    });

    it('reports no dependency time when the client installs no dependencies', async () => {
        const adapter = buildAdapter({
            getDbtManifest: vi.fn(async () => {
                vi.advanceTimersByTime(40);
                return { manifest, selectedModelIds: ['model.pkg.orders'] };
            }),
        } as unknown as DbtClient);

        await expect(adapter.getDbtManifest()).resolves.toEqual({
            manifest,
            selectedModelIds: ['model.pkg.orders'],
            timings: { gitRefreshMs: null, depsMs: null, manifestMs: 40 },
        });
    });
});

afterAll(() => {
    readFileSpy.mockRestore();
});
