import {
    applyMetricFlowMetricsToModels,
    convertExplores,
    DimensionType,
    ensureCatalogTimestampDomainsKey,
    getCompiledModels,
    getModelsFromManifest,
    SupportedDbtVersions,
    type DbtModelNode,
    type Explore,
    type WarehouseCatalog,
    type WarehouseCatalogTable,
} from '@lightdash/common';
import type { WarehouseClient } from '@lightdash/warehouses';
import Logger from '../logging/logger';
import type { CachedWarehouse, DbtClient } from '../types';
import {
    DbtBaseProjectAdapter,
    findMissingWarehouseTables,
} from './dbtBaseProjectAdapter';

vi.mock('@lightdash/common', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@lightdash/common')>()),
    applyMetricFlowMetricsToModels: vi.fn(),
    convertExplores: vi.fn(),
    getCompiledModels: vi.fn(),
    getModelsFromManifest: vi.fn(),
}));

const mockedApplyMetricFlowMetricsToModels = vi.mocked(
    applyMetricFlowMetricsToModels,
);
const mockedConvertExplores = vi.mocked(convertExplores);
const mockedGetCompiledModels = vi.mocked(getCompiledModels);
const mockedGetModelsFromManifest = vi.mocked(getModelsFromManifest);

const makeModel = (
    name: string,
    options: { alias?: string; database?: string; schema?: string } = {},
): DbtModelNode =>
    ({
        alias: options.alias ?? name,
        checksum: { name: '', checksum: '' },
        fqn: [],
        language: 'sql',
        package_name: 'test',
        path: `${name}.sql`,
        raw_code: '',
        compiled: true,
        unique_id: `model.test.${name}`,
        description: name,
        resource_type: 'model',
        columns: {
            id: {
                name: 'id',
                meta: {},
            },
        },
        meta: {},
        database: options.database ?? 'analytics',
        schema: options.schema ?? 'public',
        name,
        tags: [],
        relation_name: `${options.database ?? 'analytics'}.${
            options.schema ?? 'public'
        }.${options.alias ?? name}`,
        depends_on: { nodes: [] },
        patch_path: null,
        original_file_path: `${name}.sql`,
    }) as DbtModelNode;

const withTimestampMarker = (catalog: WarehouseCatalog): WarehouseCatalog => {
    ensureCatalogTimestampDomainsKey(catalog);
    return catalog;
};

const makeCatalog = (...tables: string[]): WarehouseCatalog =>
    withTimestampMarker({
        analytics: {
            public: Object.fromEntries(
                tables.map((table) => [table, { id: DimensionType.NUMBER }]),
            ),
        },
    });

const trackingParams = {
    projectUuid: 'project-uuid',
    organizationUuid: 'organization-uuid',
    userUuid: 'user-uuid',
    jobUuid: 'job-uuid',
};

const makeHarness = ({
    models,
    cachedWarehouse,
    fetchedCatalog,
    adapterType = 'postgres',
}: {
    models: DbtModelNode[];
    cachedWarehouse: Omit<CachedWarehouse, 'onWarehouseCatalogChange'>;
    fetchedCatalog: WarehouseCatalog;
    adapterType?: 'postgres' | 'snowflake';
}) => {
    const getCatalog = vi.fn(async () => fetchedCatalog);
    const warehouseClient = {
        credentials:
            adapterType === 'snowflake'
                ? { type: 'snowflake' }
                : { type: 'postgres' },
        getCatalog,
    } as unknown as WarehouseClient;
    const cache = { ...cachedWarehouse } as CachedWarehouse;
    const onWarehouseCatalogChange = vi.fn(
        async (cacheUpdate: {
            warehouseCatalog: WarehouseCatalog;
            fetchedAt: Date;
            missingTables: WarehouseCatalogTable[];
        }) => {
            cache.warehouseCatalog = cacheUpdate.warehouseCatalog;
            cache.warehouseCatalogFetchedAt = cacheUpdate.fetchedAt;
            cache.missingWarehouseTables = cacheUpdate.missingTables;
            cache.manualWarehouseCatalogRefresh = false;
        },
    );
    const dbtClient = {
        getDbtManifest: vi.fn(async () => ({
            manifest: {
                metadata: {
                    adapter_type: adapterType,
                    dbt_schema_version:
                        'https://schemas.getdbt.com/dbt/manifest/v11.json',
                    generated_at: '2026-09-07T18:00:00.000Z',
                },
            },
        })),
    } as unknown as DbtClient;
    cache.onWarehouseCatalogChange = onWarehouseCatalogChange;
    const adapter = new DbtBaseProjectAdapter(
        dbtClient,
        warehouseClient,
        cache,
        SupportedDbtVersions.V1_9,
    );
    vi.spyOn(DbtBaseProjectAdapter, '_validateDbtModel').mockReturnValue([
        models,
        [],
    ]);
    mockedGetModelsFromManifest.mockReturnValue(models);
    mockedGetCompiledModels.mockReturnValue(models);
    mockedApplyMetricFlowMetricsToModels.mockReturnValue({
        models,
        translatedCount: 0,
        skippedCount: 0,
        warnings: [],
        error: null,
    });
    return {
        adapter,
        cache,
        getCatalog: vi.mocked(getCatalog),
        onWarehouseCatalogChange: vi.mocked(onWarehouseCatalogChange),
    };
};

describe('DbtBaseProjectAdapter warehouse catalog cache', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockedConvertExplores.mockImplementation(
            async (models) =>
                models.map((model) => ({
                    name: model.name,
                    typed: model.columns.id.data_type,
                })) as unknown as Explore[],
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('treats null and undefined catalog table values as missing', () => {
        const models = [makeModel('null_table'), makeModel('undefined_table')];
        const catalog = {
            analytics: {
                public: {
                    null_table: null,
                    undefined_table: undefined,
                },
            },
        } as unknown as WarehouseCatalog;

        expect(findMissingWarehouseTables(models, catalog, true)).toEqual([
            { database: 'analytics', schema: 'public', table: 'null_table' },
            {
                database: 'analytics',
                schema: 'public',
                table: 'undefined_table',
            },
        ]);
    });

    it('keeps a complete legacy cache with null metadata on the old path', async () => {
        const model = makeModel('orders');
        const harness = makeHarness({
            models: [model],
            cachedWarehouse: {
                warehouseCatalog: makeCatalog('orders'),
                warehouseCatalogFetchedAt: null,
                missingWarehouseTables: null,
            },
            fetchedCatalog: makeCatalog('orders'),
        });

        await expect(
            harness.adapter.compileAllExplores(trackingParams),
        ).resolves.toEqual([{ name: 'orders', typed: DimensionType.NUMBER }]);
        expect(harness.getCatalog).not.toHaveBeenCalled();
    });

    it('reuses every known missing table without refetching and keeps fresh-pass output', async () => {
        const models = [makeModel('missing_a'), makeModel('missing_b')];
        const freshHarness = makeHarness({
            models,
            cachedWarehouse: { warehouseCatalog: undefined },
            fetchedCatalog: makeCatalog(),
        });
        const freshOutput =
            await freshHarness.adapter.compileAllExplores(trackingParams);
        const knownMissingHarness = makeHarness({
            models,
            cachedWarehouse: {
                warehouseCatalog: freshHarness.cache.warehouseCatalog,
                warehouseCatalogFetchedAt:
                    freshHarness.cache.warehouseCatalogFetchedAt,
                missingWarehouseTables:
                    freshHarness.cache.missingWarehouseTables,
            },
            fetchedCatalog: makeCatalog(),
        });
        const logger = vi.spyOn(Logger, 'info');

        await expect(
            knownMissingHarness.adapter.compileAllExplores(trackingParams),
        ).resolves.toEqual(freshOutput);
        expect(knownMissingHarness.getCatalog).not.toHaveBeenCalled();
        expect(freshHarness.cache.missingWarehouseTables).toEqual([
            { database: 'analytics', schema: 'public', table: 'missing_a' },
            { database: 'analytics', schema: 'public', table: 'missing_b' },
        ]);
        expect(logger).toHaveBeenCalledWith(
            expect.stringContaining(
                'dbt.compile.warehouseCatalogFetch reason=known_missing_skipped knownMissing=2 durationMs=0',
            ),
            expect.objectContaining({
                event: 'dbt.compile.warehouseCatalogFetch',
                reason: 'known_missing_skipped',
                knownMissing: 2,
            }),
        );
        expect(logger).toHaveBeenCalledWith(
            expect.stringContaining(
                'dbt.compile.attachTypes catalogSource=cached_catalog knownMissing=2 durationMs=',
            ),
            expect.objectContaining({
                event: 'dbt.compile.attachTypes',
                catalogSource: 'cached_catalog',
                knownMissing: 2,
            }),
        );
    });

    it('ignores negative entries when the fetch timestamp is null', async () => {
        const harness = makeHarness({
            models: [makeModel('missing_orders')],
            cachedWarehouse: {
                warehouseCatalog: makeCatalog(),
                warehouseCatalogFetchedAt: null,
                missingWarehouseTables: [
                    {
                        database: 'analytics',
                        schema: 'public',
                        table: 'missing_orders',
                    },
                ],
            },
            fetchedCatalog: makeCatalog(),
        });

        await harness.adapter.compileAllExplores(trackingParams);

        expect(harness.getCatalog).toHaveBeenCalledOnce();
    });

    it('refetches and persists all misses when one table is new', async () => {
        const models = [makeModel('known_missing'), makeModel('new_missing')];
        const harness = makeHarness({
            models,
            cachedWarehouse: {
                warehouseCatalog: makeCatalog(),
                warehouseCatalogFetchedAt: new Date(),
                missingWarehouseTables: [
                    {
                        database: 'analytics',
                        schema: 'public',
                        table: 'known_missing',
                    },
                ],
            },
            fetchedCatalog: makeCatalog(),
        });

        await harness.adapter.compileAllExplores(trackingParams);

        expect(harness.getCatalog).toHaveBeenCalledOnce();
        expect(harness.onWarehouseCatalogChange).toHaveBeenCalledWith(
            expect.objectContaining({
                missingTables: [
                    {
                        database: 'analytics',
                        schema: 'public',
                        table: 'known_missing',
                    },
                    {
                        database: 'analytics',
                        schema: 'public',
                        table: 'new_missing',
                    },
                ],
            }),
        );
    });

    it('refetches an expired cache', async () => {
        const harness = makeHarness({
            models: [makeModel('orders')],
            cachedWarehouse: {
                warehouseCatalog: makeCatalog('orders'),
                warehouseCatalogFetchedAt: new Date(Date.now() - 1_001),
                missingWarehouseTables: [],
                warehouseCatalogMaxAgeMs: 1_000,
            },
            fetchedCatalog: makeCatalog('orders'),
        });

        await harness.adapter.compileAllExplores(trackingParams);

        expect(harness.getCatalog).toHaveBeenCalledOnce();
    });

    it('uses one day as the default maximum cache age', async () => {
        const harness = makeHarness({
            models: [makeModel('orders')],
            cachedWarehouse: {
                warehouseCatalog: makeCatalog('orders'),
                warehouseCatalogFetchedAt: new Date(
                    Date.now() - 24 * 60 * 60 * 1000 - 1,
                ),
                missingWarehouseTables: [],
            },
            fetchedCatalog: makeCatalog('orders'),
        });

        await harness.adapter.compileAllExplores(trackingParams);

        expect(harness.getCatalog).toHaveBeenCalledOnce();
    });

    it('refetches a manually invalidated cache', async () => {
        const harness = makeHarness({
            models: [makeModel('orders')],
            cachedWarehouse: {
                warehouseCatalog: makeCatalog('orders'),
                warehouseCatalogFetchedAt: new Date(),
                missingWarehouseTables: [],
                manualWarehouseCatalogRefresh: true,
            },
            fetchedCatalog: makeCatalog('orders'),
        });
        const logger = vi.spyOn(Logger, 'info');

        await harness.adapter.compileAllExplores(trackingParams);

        expect(harness.getCatalog).toHaveBeenCalledOnce();
        expect(logger).toHaveBeenCalledWith(
            expect.stringContaining(
                'dbt.compile.warehouseCatalogFetch reason=manual knownMissing=0 durationMs=',
            ),
            expect.objectContaining({ reason: 'manual' }),
        );
    });

    it('uses Snowflake case folding for known missing tables', async () => {
        const harness = makeHarness({
            models: [makeModel('orders')],
            cachedWarehouse: {
                warehouseCatalog: withTimestampMarker({}),
                warehouseCatalogFetchedAt: new Date(),
                missingWarehouseTables: [
                    {
                        database: 'ANALYTICS',
                        schema: 'PUBLIC',
                        table: 'ORDERS',
                    },
                ],
            },
            fetchedCatalog: withTimestampMarker({}),
            adapterType: 'snowflake',
        });

        await harness.adapter.compileAllExplores(trackingParams);

        expect(harness.getCatalog).not.toHaveBeenCalled();
    });

    it('refetches a cache without the timestamp-domain marker', async () => {
        const harness = makeHarness({
            models: [makeModel('orders')],
            cachedWarehouse: {
                warehouseCatalog: {
                    analytics: {
                        public: {
                            orders: { id: DimensionType.NUMBER },
                        },
                    },
                },
                warehouseCatalogFetchedAt: new Date(),
                missingWarehouseTables: [],
            },
            fetchedCatalog: makeCatalog('orders'),
        });

        await harness.adapter.compileAllExplores(trackingParams);

        expect(harness.getCatalog).toHaveBeenCalledOnce();
    });
});
