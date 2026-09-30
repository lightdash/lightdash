import {
    applyMetricFlowMetricsToModels,
    DimensionType,
    ensureCatalogTimestampDomainsKey,
    getCatalogMissingEntries,
    getCompiledModels,
    getModelsFromManifest,
    iterateExplores,
    setCatalogMissingEntries,
    SupportedDbtVersions,
    type DbtModelNode,
    type Explore,
    type WarehouseCatalog,
    type WarehouseCatalogMissingEntry,
    type WarehouseCatalogTable,
} from '@lightdash/common';
import type { WarehouseClient } from '@lightdash/warehouses';
import Logger from '../logging/logger';
import type { CachedWarehouse, DbtClient } from '../types';
import { DbtBaseProjectAdapter } from './dbtBaseProjectAdapter';

vi.mock('@lightdash/common', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@lightdash/common')>()),
    applyMetricFlowMetricsToModels: vi.fn(),
    iterateExplores: vi.fn(),
    getCompiledModels: vi.fn(),
    getModelsFromManifest: vi.fn(),
}));

const makeModel = (
    name: string,
    options: { alias?: string; columns?: string[] } = {},
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
        columns: Object.fromEntries(
            (options.columns ?? ['id']).map((column) => [
                column,
                { name: column, meta: {} },
            ]),
        ),
        meta: {},
        database: 'analytics',
        schema: 'public',
        name,
        tags: [],
        relation_name: `analytics.public.${options.alias ?? name}`,
        depends_on: { nodes: [] },
        patch_path: null,
        original_file_path: `${name}.sql`,
    }) as DbtModelNode;

type WarehouseTables = Record<string, string[]>;

const makeCatalog = (tables: WarehouseTables): WarehouseCatalog => {
    const catalog: WarehouseCatalog = {
        analytics: {
            public: Object.fromEntries(
                Object.entries(tables).map(([table, columns]) => [
                    table,
                    Object.fromEntries(
                        columns.map((column) => [column, DimensionType.NUMBER]),
                    ),
                ]),
            ),
        },
    };
    ensureCatalogTimestampDomainsKey(catalog);
    return catalog;
};

const missing = (
    table: string,
    columns: string[] | null = null,
): WarehouseCatalogMissingEntry => ({
    database: 'analytics',
    schema: 'public',
    table,
    columns,
});

const withMissingEntries = (
    catalog: WarehouseCatalog,
    entries: WarehouseCatalogMissingEntry[],
): WarehouseCatalog => {
    setCatalogMissingEntries(catalog, entries);
    return catalog;
};

const trackingParams = {
    projectUuid: 'project-uuid',
    organizationUuid: 'organization-uuid',
    userUuid: 'user-uuid',
    jobUuid: 'job-uuid',
};

const makeHarness = ({
    models,
    cachedCatalog,
    warehouseTables,
    adapterType = 'postgres',
}: {
    models: DbtModelNode[];
    cachedCatalog: WarehouseCatalog | undefined;
    warehouseTables: WarehouseTables;
    adapterType?: 'postgres' | 'snowflake';
}) => {
    const getCatalog = vi.fn(async (requested: WarehouseCatalogTable[]) =>
        makeCatalog(
            Object.fromEntries(
                requested.flatMap(({ table }) =>
                    warehouseTables[table]
                        ? [[table, warehouseTables[table]]]
                        : [],
                ),
            ),
        ),
    );
    const cachedWarehouse: CachedWarehouse = {
        warehouseCatalog: cachedCatalog,
        onWarehouseCatalogChange: vi.fn(),
    };
    const dbtClient = {
        getDbtManifest: vi.fn(async () => ({
            manifest: {
                metadata: {
                    adapter_type: adapterType,
                    dbt_schema_version:
                        'https://schemas.getdbt.com/dbt/manifest/v11.json',
                    generated_at: '2026-09-30T00:00:00.000Z',
                },
            },
        })),
    } as unknown as DbtClient;
    const adapter = new DbtBaseProjectAdapter(
        dbtClient,
        {
            credentials: { type: adapterType },
            getCatalog,
        } as unknown as WarehouseClient,
        cachedWarehouse,
        SupportedDbtVersions.V1_9,
    );
    vi.spyOn(DbtBaseProjectAdapter, '_validateDbtModel').mockReturnValue([
        models,
        [],
    ]);
    vi.mocked(getModelsFromManifest).mockReturnValue(models);
    vi.mocked(getCompiledModels).mockReturnValue(models);
    vi.mocked(applyMetricFlowMetricsToModels).mockReturnValue({
        models,
        translatedCount: 0,
        skippedCount: 0,
        warnings: [],
        error: null,
    });
    return {
        compile: () => adapter.compileAllExplores(trackingParams),
        getCatalog,
        onWarehouseCatalogChange: vi.mocked(
            cachedWarehouse.onWarehouseCatalogChange,
        ),
    };
};

const catalogFetchReasons = () =>
    (
        vi.mocked(Logger.info).mock.calls as unknown as [
            string,
            { reason?: string } | undefined,
        ][]
    )
        .filter(([message]) => message === 'dbt.compile.warehouseCatalogFetch')
        .map(([, meta]) => meta?.reason);

describe('DbtBaseProjectAdapter warehouse catalog cache', () => {
    beforeEach(() => {
        vi.spyOn(Logger, 'info');
        vi.mocked(iterateExplores).mockImplementation(
            async function* exploreIterator(models) {
                for (const model of models) {
                    yield {
                        name: model.name,
                        typed: model.columns.id?.data_type,
                    } as unknown as Explore;
                }
            },
        );
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('records missing tables and columns on a full fetch', async () => {
        const harness = makeHarness({
            models: [
                makeModel('orders', { columns: ['id', 'custom_sql'] }),
                makeModel('gone'),
            ],
            cachedCatalog: undefined,
            warehouseTables: { orders: ['id'] },
        });

        await harness.compile();

        expect(catalogFetchReasons()).toEqual(['no_cache']);
        const [[saved]] = harness.onWarehouseCatalogChange.mock.calls;
        expect(getCatalogMissingEntries(saved)).toEqual([
            missing('orders', ['custom_sql']),
            missing('gone'),
        ]);
    });

    it('probes only the tables with known missing entries on the next compile and matches the full fetch output', async () => {
        const models = [
            makeModel('orders', { columns: ['id', 'custom_sql'] }),
            makeModel('customers'),
            makeModel('gone'),
        ];
        const warehouseTables = { orders: ['id'], customers: ['id'] };
        const first = makeHarness({
            models,
            cachedCatalog: undefined,
            warehouseTables,
        });
        const firstOutput = await first.compile();
        const [[savedCatalog]] = first.onWarehouseCatalogChange.mock.calls;
        vi.mocked(Logger.info).mockClear();

        const second = makeHarness({
            models,
            cachedCatalog: savedCatalog,
            warehouseTables,
        });
        const secondOutput = await second.compile();

        expect(second.getCatalog).toHaveBeenCalledTimes(1);
        expect(second.getCatalog).toHaveBeenCalledWith([
            { database: 'analytics', schema: 'public', table: 'orders' },
            { database: 'analytics', schema: 'public', table: 'gone' },
        ]);
        expect(second.onWarehouseCatalogChange).not.toHaveBeenCalled();
        expect(catalogFetchReasons()).toEqual(['known_missing_probe']);
        expect(secondOutput).toEqual(firstOutput);
        expect(secondOutput).toEqual([
            { name: 'orders', typed: DimensionType.NUMBER },
            { name: 'customers', typed: DimensionType.NUMBER },
            { name: 'gone', typed: undefined },
        ]);
    });

    it('refetches the full catalog when a known missing table appears', async () => {
        const harness = makeHarness({
            models: [makeModel('orders'), makeModel('gone')],
            cachedCatalog: withMissingEntries(makeCatalog({ orders: ['id'] }), [
                missing('gone'),
            ]),
            warehouseTables: { orders: ['id'], gone: ['id'] },
        });

        const output = await harness.compile();

        expect(catalogFetchReasons()).toEqual([
            'known_missing_probe',
            'known_missing_changed',
        ]);
        expect(output).toContainEqual({
            name: 'gone',
            typed: DimensionType.NUMBER,
        });
        const [[saved]] = harness.onWarehouseCatalogChange.mock.calls;
        expect(getCatalogMissingEntries(saved)).toEqual([]);
    });

    it('refetches the full catalog when a known missing column appears', async () => {
        const harness = makeHarness({
            models: [makeModel('orders', { columns: ['id', 'added_later'] })],
            cachedCatalog: withMissingEntries(makeCatalog({ orders: ['id'] }), [
                missing('orders', ['added_later']),
            ]),
            warehouseTables: { orders: ['id', 'added_later'] },
        });

        await harness.compile();

        expect(catalogFetchReasons()).toEqual([
            'known_missing_probe',
            'known_missing_changed',
        ]);
        const [[saved]] = harness.onWarehouseCatalogChange.mock.calls;
        expect(getCatalogMissingEntries(saved)).toEqual([]);
    });

    it('refetches the full catalog for a missing table it has not seen', async () => {
        const harness = makeHarness({
            models: [makeModel('orders'), makeModel('gone'), makeModel('new')],
            cachedCatalog: withMissingEntries(makeCatalog({ orders: ['id'] }), [
                missing('gone'),
            ]),
            warehouseTables: { orders: ['id'], new: ['id'] },
        });

        await harness.compile();

        expect(catalogFetchReasons()).toEqual(['cache_miss']);
        expect(harness.getCatalog).toHaveBeenCalledTimes(1);
    });

    it('refetches the full catalog for a missing column it has not seen', async () => {
        const harness = makeHarness({
            models: [
                makeModel('orders', { columns: ['id', 'known', 'new_column'] }),
            ],
            cachedCatalog: withMissingEntries(makeCatalog({ orders: ['id'] }), [
                missing('orders', ['known']),
            ]),
            warehouseTables: { orders: ['id'] },
        });

        await harness.compile();

        expect(catalogFetchReasons()).toEqual(['cache_miss']);
    });

    it('refetches when a cache without the missing entries sidecar lacks a table', async () => {
        const harness = makeHarness({
            models: [makeModel('orders'), makeModel('gone')],
            cachedCatalog: makeCatalog({ orders: ['id'] }),
            warehouseTables: { orders: ['id'] },
        });

        await harness.compile();

        expect(catalogFetchReasons()).toEqual(['cache_miss']);
    });

    it('does not fetch for a complete cache of aliased models', async () => {
        const harness = makeHarness({
            models: [makeModel('stg_orders', { alias: 'orders' })],
            cachedCatalog: makeCatalog({ orders: ['id'] }),
            warehouseTables: { orders: ['id'] },
        });

        await harness.compile();

        expect(harness.getCatalog).not.toHaveBeenCalled();
    });

    it('matches known missing entries case-insensitively on Snowflake', async () => {
        const harness = makeHarness({
            models: [
                makeModel('orders', { columns: ['id', 'custom_sql'] }),
                makeModel('gone'),
            ],
            cachedCatalog: withMissingEntries(makeCatalog({ orders: ['id'] }), [
                {
                    database: 'ANALYTICS',
                    schema: 'PUBLIC',
                    table: 'GONE',
                    columns: null,
                },
                {
                    database: 'ANALYTICS',
                    schema: 'PUBLIC',
                    table: 'ORDERS',
                    columns: ['CUSTOM_SQL'],
                },
            ]),
            warehouseTables: { orders: ['id'] },
            adapterType: 'snowflake',
        });

        await harness.compile();

        expect(catalogFetchReasons()).toEqual(['known_missing_probe']);
        expect(harness.onWarehouseCatalogChange).not.toHaveBeenCalled();
    });
});
