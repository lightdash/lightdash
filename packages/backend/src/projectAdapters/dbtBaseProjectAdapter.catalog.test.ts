import {
    applyMetricFlowMetricsToModels,
    DEFAULT_WAREHOUSE_CATALOG_CACHE_MAX_AGE_MS,
    DimensionType,
    ensureCatalogTimestampDomainsKey,
    getCompiledModels,
    getModelsFromManifest,
    iterateExplores,
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
    MAX_PERSISTED_MISSING_WAREHOUSE_TABLES,
} from './dbtBaseProjectAdapter';

vi.mock('@lightdash/common', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@lightdash/common')>()),
    applyMetricFlowMetricsToModels: vi.fn(),
    iterateExplores: vi.fn(),
    getCompiledModels: vi.fn(),
    getModelsFromManifest: vi.fn(),
}));

const mockedApplyMetricFlowMetricsToModels = vi.mocked(
    applyMetricFlowMetricsToModels,
);
const mockedIterateExplores = vi.mocked(iterateExplores);
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
    cachedWarehouse: Pick<CachedWarehouse, 'warehouseCatalog'> &
        Partial<Omit<CachedWarehouse, 'warehouseCatalog'>>;
    fetchedCatalog:
        | WarehouseCatalog
        | ((tables: WarehouseCatalogTable[]) => WarehouseCatalog);
    adapterType?: 'postgres' | 'snowflake';
}) => {
    const getCatalog = vi.fn(async (tables: WarehouseCatalogTable[]) =>
        typeof fetchedCatalog === 'function'
            ? fetchedCatalog(tables)
            : fetchedCatalog,
    );
    const warehouseClient = {
        credentials:
            adapterType === 'snowflake'
                ? { type: 'snowflake' }
                : { type: 'postgres' },
        getCatalog,
    } as unknown as WarehouseClient;
    const cache: CachedWarehouse = {
        warehouseCatalogFetchedAt: null,
        missingWarehouseTables: null,
        manualWarehouseCatalogRefresh: null,
        warehouseCatalogMaxAgeMs: null,
        ...cachedWarehouse,
        onWarehouseCatalogChange: async () => undefined,
    };
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
    cache.onWarehouseCatalogChange = onWarehouseCatalogChange;
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
        mockedIterateExplores.mockImplementation(
            async function* exploreIterator(models) {
                for (const model of models) {
                    yield {
                        name: model.name,
                        typed: model.columns.id.data_type,
                    } as unknown as Explore;
                }
            },
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

    it('probes known missing tables without rewriting an unchanged cache', async () => {
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
        expect(knownMissingHarness.getCatalog).toHaveBeenCalledExactlyOnceWith([
            { database: 'analytics', schema: 'public', table: 'missing_a' },
            { database: 'analytics', schema: 'public', table: 'missing_b' },
        ]);
        expect(
            knownMissingHarness.onWarehouseCatalogChange,
        ).not.toHaveBeenCalled();
        expect(freshHarness.cache.missingWarehouseTables).toEqual([
            { database: 'analytics', schema: 'public', table: 'missing_a' },
            { database: 'analytics', schema: 'public', table: 'missing_b' },
        ]);
        expect(logger).toHaveBeenCalledWith(
            expect.stringContaining(
                'dbt.compile.warehouseCatalogFetch reason=known_missing_probe knownMissing=2 durationMs=',
            ),
            expect.objectContaining({
                event: 'dbt.compile.warehouseCatalogFetch',
                reason: 'known_missing_probe',
                requestedTables: 2,
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

    it('uses a distinct event when the cached compile needs no fetch', async () => {
        const harness = makeHarness({
            models: [makeModel('orders')],
            cachedWarehouse: {
                warehouseCatalog: makeCatalog('orders'),
                warehouseCatalogFetchedAt: new Date(),
                missingWarehouseTables: [],
            },
            fetchedCatalog: makeCatalog('orders'),
        });
        const logger = vi.spyOn(Logger, 'info');

        await harness.adapter.compileAllExplores(trackingParams);

        expect(harness.getCatalog).not.toHaveBeenCalled();
        expect(logger).toHaveBeenCalledWith(
            expect.stringContaining(
                'dbt.compile.warehouseCatalogSkipped reason=cached_catalog_reused knownMissing=0',
            ),
            expect.objectContaining({
                event: 'dbt.compile.warehouseCatalogSkipped',
                reason: 'cached_catalog_reused',
            }),
        );
    });

    it('types a reappearing known missing table after one narrow probe', async () => {
        const fetchedAt = new Date('2026-09-07T18:00:00.000Z');
        const harness = makeHarness({
            models: [
                makeModel('existing'),
                makeModel('orders'),
                makeModel('customers'),
            ],
            cachedWarehouse: {
                warehouseCatalog: makeCatalog('existing'),
                warehouseCatalogFetchedAt: fetchedAt,
                missingWarehouseTables: [
                    {
                        database: 'analytics',
                        schema: 'public',
                        table: 'orders',
                    },
                    {
                        database: 'analytics',
                        schema: 'public',
                        table: 'customers',
                    },
                ],
            },
            fetchedCatalog: makeCatalog('orders'),
        });

        await expect(
            harness.adapter.compileAllExplores(trackingParams),
        ).resolves.toEqual([
            { name: 'existing', typed: DimensionType.NUMBER },
            { name: 'orders', typed: DimensionType.NUMBER },
            { name: 'customers', typed: undefined },
        ]);
        expect(harness.getCatalog).toHaveBeenCalledExactlyOnceWith([
            { database: 'analytics', schema: 'public', table: 'orders' },
            { database: 'analytics', schema: 'public', table: 'customers' },
        ]);
        expect(
            harness.onWarehouseCatalogChange,
        ).toHaveBeenCalledExactlyOnceWith({
            warehouseCatalog: makeCatalog('existing', 'orders'),
            fetchedAt,
            missingTables: [
                {
                    database: 'analytics',
                    schema: 'public',
                    table: 'customers',
                },
            ],
        });
    });

    it('persists a probe result before the first explore is yielded', async () => {
        const model = makeModel('orders');
        const harness = makeHarness({
            models: [model],
            cachedWarehouse: {
                warehouseCatalog: makeCatalog(),
                warehouseCatalogFetchedAt: new Date(),
                missingWarehouseTables: [
                    {
                        database: 'analytics',
                        schema: 'public',
                        table: 'orders',
                    },
                ],
            },
            fetchedCatalog: makeCatalog('orders'),
        });
        const cacheWriteCounts: number[] = [];
        mockedIterateExplores.mockImplementationOnce(
            async function* probeExploreIterator(models) {
                cacheWriteCounts.push(
                    harness.onWarehouseCatalogChange.mock.calls.length,
                );
                for (const typedModel of models) {
                    yield {
                        name: typedModel.name,
                        typed: typedModel.columns.id.data_type,
                    } as unknown as Explore;
                }
            },
        );

        const stream =
            await harness.adapter.prepareExploreStream(trackingParams);
        const firstExplore = await stream[Symbol.asyncIterator]().next();

        expect(firstExplore.done).toBe(false);
        expect(cacheWriteCounts).toEqual([1]);
    });

    it('persists a full refetch before the first explore is yielded', async () => {
        const model = makeModel('orders');
        const harness = makeHarness({
            models: [model],
            cachedWarehouse: { warehouseCatalog: undefined },
            fetchedCatalog: makeCatalog('orders'),
        });
        const cacheWriteCounts: number[] = [];
        mockedIterateExplores.mockImplementationOnce(
            async function* refetchedExploreIterator(models) {
                cacheWriteCounts.push(
                    harness.onWarehouseCatalogChange.mock.calls.length,
                );
                for (const typedModel of models) {
                    yield {
                        name: typedModel.name,
                        typed: typedModel.columns.id.data_type,
                    } as unknown as Explore;
                }
            },
        );

        const stream =
            await harness.adapter.prepareExploreStream(trackingParams);
        const firstExplore = await stream[Symbol.asyncIterator]().next();

        expect(firstExplore.done).toBe(false);
        expect(cacheWriteCounts).toEqual([1]);
    });

    it('uses the cached catalog when a known missing probe fails', async () => {
        const harness = makeHarness({
            models: [makeModel('missing_orders')],
            cachedWarehouse: {
                warehouseCatalog: makeCatalog(),
                warehouseCatalogFetchedAt: new Date(),
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
        harness.getCatalog.mockRejectedValueOnce(new Error('probe failed'));
        const logger = vi.spyOn(Logger, 'warn');

        await expect(
            harness.adapter.compileAllExplores(trackingParams),
        ).resolves.toEqual([{ name: 'missing_orders', typed: undefined }]);
        expect(harness.getCatalog).toHaveBeenCalledExactlyOnceWith([
            {
                database: 'analytics',
                schema: 'public',
                table: 'missing_orders',
            },
        ]);
        expect(harness.onWarehouseCatalogChange).not.toHaveBeenCalled();
        expect(logger).toHaveBeenCalledWith(
            'Failed to probe known missing warehouse tables; using cached catalog',
            expect.objectContaining({
                event: 'dbt.compile.warehouseCatalogProbeFailed',
                requestedTables: 1,
                error: 'probe failed',
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

        expect(harness.getCatalog).toHaveBeenCalledTimes(2);
        expect(harness.getCatalog).toHaveBeenNthCalledWith(1, [
            {
                database: 'analytics',
                schema: 'public',
                table: 'known_missing',
            },
        ]);
        expect(harness.getCatalog).toHaveBeenNthCalledWith(2, [
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
        ]);
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

    it('fully refetches a new miss when a known table reappears', async () => {
        const models = [makeModel('known_missing'), makeModel('new_table')];
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
            fetchedCatalog: (tables) =>
                tables.length === 1
                    ? makeCatalog('known_missing')
                    : makeCatalog('known_missing', 'new_table'),
        });

        await expect(
            harness.adapter.compileAllExplores(trackingParams),
        ).resolves.toEqual([
            { name: 'known_missing', typed: DimensionType.NUMBER },
            { name: 'new_table', typed: DimensionType.NUMBER },
        ]);
        expect(harness.getCatalog).toHaveBeenCalledTimes(2);
        expect(harness.getCatalog.mock.calls[0][0]).toEqual([
            {
                database: 'analytics',
                schema: 'public',
                table: 'known_missing',
            },
        ]);
        expect(harness.getCatalog.mock.calls[1][0]).toEqual([
            {
                database: 'analytics',
                schema: 'public',
                table: 'known_missing',
            },
            {
                database: 'analytics',
                schema: 'public',
                table: 'new_table',
            },
        ]);
        expect(harness.onWarehouseCatalogChange).toHaveBeenCalledOnce();
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

    it('uses zero maximum cache age as a full-fetch kill switch', async () => {
        const harness = makeHarness({
            models: [makeModel('orders')],
            cachedWarehouse: {
                warehouseCatalog: makeCatalog('orders'),
                warehouseCatalogFetchedAt: new Date(),
                missingWarehouseTables: [],
                warehouseCatalogMaxAgeMs: 0,
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
                    Date.now() - DEFAULT_WAREHOUSE_CATALOG_CACHE_MAX_AGE_MS - 1,
                ),
                missingWarehouseTables: [],
            },
            fetchedCatalog: makeCatalog('orders'),
        });

        await harness.adapter.compileAllExplores(trackingParams);

        expect(harness.getCatalog).toHaveBeenCalledOnce();
    });

    it('persists one missing warehouse reference for an aliased model', async () => {
        const harness = makeHarness({
            models: [makeModel('logical_orders', { alias: 'orders' })],
            cachedWarehouse: { warehouseCatalog: undefined },
            fetchedCatalog: makeCatalog(),
        });

        await harness.adapter.compileAllExplores(trackingParams);

        expect(harness.onWarehouseCatalogChange).toHaveBeenCalledWith(
            expect.objectContaining({
                missingTables: [
                    {
                        database: 'analytics',
                        schema: 'public',
                        table: 'orders',
                    },
                ],
            }),
        );
    });

    it('caps the persisted missing table list and warns when it is truncated', async () => {
        const models = Array.from(
            { length: MAX_PERSISTED_MISSING_WAREHOUSE_TABLES + 1 },
            (_, index) => makeModel(`missing_${index}`),
        );
        const harness = makeHarness({
            models,
            cachedWarehouse: { warehouseCatalog: undefined },
            fetchedCatalog: makeCatalog(),
        });
        const logger = vi.spyOn(Logger, 'warn');

        await harness.adapter.compileAllExplores(trackingParams);

        expect(
            harness.onWarehouseCatalogChange.mock.calls[0][0].missingTables,
        ).toHaveLength(MAX_PERSISTED_MISSING_WAREHOUSE_TABLES + 1);
        expect(logger).toHaveBeenCalledWith(
            expect.stringContaining(
                `count=${MAX_PERSISTED_MISSING_WAREHOUSE_TABLES + 1} cap=${MAX_PERSISTED_MISSING_WAREHOUSE_TABLES}`,
            ),
            expect.objectContaining({
                missingTableCount: MAX_PERSISTED_MISSING_WAREHOUSE_TABLES + 1,
                persistedMissingTableCount:
                    MAX_PERSISTED_MISSING_WAREHOUSE_TABLES + 1,
            }),
        );

        harness.getCatalog.mockClear();
        harness.onWarehouseCatalogChange.mockClear();

        await harness.adapter.compileAllExplores(trackingParams);

        expect(harness.getCatalog).toHaveBeenCalledOnce();
        expect(harness.getCatalog.mock.calls[0][0]).toHaveLength(
            MAX_PERSISTED_MISSING_WAREHOUSE_TABLES + 1,
        );
        expect(harness.onWarehouseCatalogChange).toHaveBeenCalledOnce();
    });

    it('probes an exact-cap missing table list without treating it as truncated', async () => {
        const models = Array.from(
            { length: MAX_PERSISTED_MISSING_WAREHOUSE_TABLES },
            (_, index) => makeModel(`missing_${index}`),
        );
        const missingWarehouseTables = models.map(
            ({ database, schema, alias }) => ({
                database,
                schema,
                table: alias,
            }),
        );
        const harness = makeHarness({
            models,
            cachedWarehouse: {
                warehouseCatalog: makeCatalog(),
                warehouseCatalogFetchedAt: new Date(),
                missingWarehouseTables,
            },
            fetchedCatalog: makeCatalog(),
        });

        await harness.adapter.compileAllExplores(trackingParams);

        expect(harness.getCatalog).toHaveBeenCalledExactlyOnceWith(
            missingWarehouseTables,
        );
        expect(harness.onWarehouseCatalogChange).not.toHaveBeenCalled();
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

        harness.getCatalog.mockClear();
        harness.onWarehouseCatalogChange.mockClear();

        await harness.adapter.compileAllExplores(trackingParams);

        expect(harness.getCatalog).not.toHaveBeenCalled();
        expect(harness.onWarehouseCatalogChange).not.toHaveBeenCalled();
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

        expect(harness.getCatalog).toHaveBeenCalledExactlyOnceWith([
            { database: 'analytics', schema: 'public', table: 'orders' },
        ]);
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
