import {
    DEFAULT_SPOTLIGHT_CONFIG,
    isExploreError,
    MetricType,
    SupportedDbtVersions,
    type LightdashProjectConfig,
    type WarehouseClient,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
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

describe('compileAllExplores with dbt semantic layer enabled', () => {
    const manifest = {
        metadata: {
            dbt_schema_version:
                'https://schemas.getdbt.com/dbt/manifest/v12.json',
            generated_at: '2023-01-01T00:00:00.000000Z',
            adapter_type: 'postgres',
        },
        nodes: {
            'model.test.claims': {
                resource_type: 'model',
                unique_id: 'model.test.claims',
                name: 'claims',
                database: 'test_db',
                schema: 'test_schema',
                alias: 'claims',
                relation_name: '"test_db"."test_schema"."claims"',
                meta: {},
                config: { materialized: 'table' },
                columns: {},
                tags: [],
                description: '',
                package_name: 'test',
                path: '',
                original_file_path: '',
                patch_path: null,
                checksum: { name: '', checksum: '' },
                fqn: [],
                raw_code: '',
                language: 'sql',
                depends_on: { nodes: [] },
            },
        },
        metrics: {},
        docs: {},
        semantic_models: {
            'semantic_model.test.claims': {
                unique_id: 'semantic_model.test.claims',
                name: 'claims',
                label: 'Claims',
                model: "ref('claims')",
                depends_on: { nodes: ['model.test.claims'] },
                defaults: { agg_time_dimension: 'created_at' },
                entities: [
                    { name: 'claim', type: 'primary', expr: 'claim_id' },
                ],
                dimensions: [
                    { name: 'category', type: 'categorical' },
                    {
                        name: 'created_at',
                        type: 'time',
                        type_params: { time_granularity: 'day' },
                    },
                ],
                measures: [
                    {
                        name: 'total_claims',
                        agg: 'count_distinct',
                        expr: 'claim_id',
                        create_metric: true,
                    },
                ],
            },
        },
    };

    const warehouseCatalog = {
        test_db: {
            test_schema: {
                claims: {
                    claim_id: 'number',
                    category: 'string',
                    created_at: 'date',
                },
            },
        },
    };

    const buildAdapter = () => {
        const warehouseClient = Object.assign(
            warehouseSqlBuilderFromType('postgres'),
            {
                getCatalog: jest.fn().mockResolvedValue(warehouseCatalog),
                credentials: { type: 'postgres' },
            },
        ) as unknown as WarehouseClient;
        return new DbtBaseProjectAdapter(
            {
                getDbtManifest: jest.fn().mockResolvedValue({ manifest }),
            } as unknown as DbtClient,
            warehouseClient,
            {
                warehouseCatalog,
                onWarehouseCatalogChange: jest.fn(),
            } as unknown as CachedWarehouse,
            SupportedDbtVersions.V1_9,
            './some/path/to/dbt/project',
        );
    };

    it('compiles semantic layer metrics into the explore', async () => {
        readFileSpy.mockResolvedValueOnce(
            'spotlight:\n  default_visibility: show\ndbt_semantic_layer:\n  enabled: true\n',
        );
        const explores = await buildAdapter().compileAllExplores();
        const explore = explores.find((e) => e.name === 'claims');
        if (explore === undefined || isExploreError(explore)) {
            throw new Error('Expected claims explore to compile');
        }
        expect(explore.label).toEqual('Claims');
        const table = explore.tables.claims;
        expect(table.metrics.total_claims.type).toEqual(
            MetricType.COUNT_DISTINCT,
        );
        expect(table.metrics.total_claims.defaultTimeDimension).toEqual({
            field: 'created_at',
            interval: 'DAY',
        });
        expect(table.dimensions.claim_id.hidden).toEqual(true);
        expect(table.dimensions.category).toBeDefined();
    });

    it('ignores the semantic layer when not enabled', async () => {
        readFileSpy.mockResolvedValueOnce(
            'spotlight:\n  default_visibility: show\n',
        );
        const explores = await buildAdapter().compileAllExplores();
        const explore = explores.find((e) => e.name === 'claims');
        expect(explore).toBeDefined();
        if (explore && !isExploreError(explore)) {
            throw new Error(
                'Expected claims explore to fail without dimensions',
            );
        }
    });
});

afterAll(() => {
    readFileSpy.mockRestore();
});
