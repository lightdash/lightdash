import {
    AlreadyExistsError,
    CatalogCategoryFilterMode,
    CatalogFilter,
    CatalogType,
    FieldType,
    MetricType,
    SupportedDbtAdapter,
    TableSelectionType,
    type CompiledTable,
    type Explore,
} from '@lightdash/common';
import knex, { Knex } from 'knex';
import { getTracker, MockClient, Tracker } from 'knex-mock-client';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import {
    MetricsTreeEdgesTableName,
    MetricsTreeLocksTableName,
    MetricsTreeNodesTableName,
    MetricsTreesTableName,
    type DbCatalog,
} from '../../database/entities/catalog';
import { CatalogModel, CatalogSearchContext } from './CatalogModel';

type StructuredLogMetadata = {
    name: string;
    duration: number;
    context: Record<string, unknown>;
};

const loggerMocks = vi.hoisted(() => ({
    error: vi.fn(),
    info: vi.fn<(message: string, metadata: StructuredLogMetadata) => void>(),
    warn: vi.fn(),
}));

vi.mock('../../logging/logger', () => ({
    default: loggerMocks,
}));

const MOCK_PROJECT_UUID = 'project-uuid-1';
const MOCK_USER_UUID = 'user-uuid-1';
const MOCK_OTHER_USER_UUID = 'user-uuid-2';
const MOCK_TREE_UUID = 'tree-uuid-1';
const MOCK_TIMESTAMP = new Date('2026-01-01T00:00:00Z');

const buildExplore = (name: string): Explore => ({
    name,
    label: 'Orders',
    tags: ['finance'],
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            database: 'database',
            schema: 'schema',
            sqlTable: 'orders',
            lineageGraph: {},
            dimensions: {},
            metrics: {
                revenue: {
                    name: 'revenue',
                    label: 'Revenue',
                    table: 'orders',
                    tableLabel: 'Orders',
                    fieldType: FieldType.METRIC,
                    type: MetricType.SUM,
                    sql: 'SUM(${TABLE}.revenue)',
                    compiledSql: 'SUM("orders".revenue)',
                    hidden: false,
                    tablesReferences: ['orders'],
                },
            },
        },
    },
    baseTable: 'orders',
    joinedTables: [],
    targetDatabase: SupportedDbtAdapter.POSTGRES,
});

const buildExploreWithJoinedTable = (): Explore => {
    const explore = buildExplore('orders');
    explore.tables.customers = {
        name: 'customers',
        label: 'Customers',
        database: 'database',
        schema: 'schema',
        sqlTable: 'customers',
        lineageGraph: {},
        dimensions: {},
        metrics: {
            lifetime_value: {
                name: 'lifetime_value',
                label: 'Lifetime value',
                table: 'customers',
                tableLabel: 'Customers',
                fieldType: FieldType.METRIC,
                type: MetricType.SUM,
                sql: 'SUM(${TABLE}.lifetime_value)',
                compiledSql: 'SUM("customers".lifetime_value)',
                hidden: false,
                tablesReferences: ['customers'],
                tags: ['customer'],
            },
        },
    } satisfies CompiledTable;
    explore.joinedTables = [
        {
            table: 'customers',
            sqlOn: '${orders.customer_id} = ${customers.customer_id}',
            compiledSqlOn: '"orders"."customer_id" = "customers"."customer_id"',
        },
    ];
    return explore;
};

type CatalogSearchRow = DbCatalog & {
    search_rank: number;
    owner_first_name?: string;
    owner_last_name?: string;
    owner_email?: string;
};

const buildCatalogSearchRow = (
    overrides: Partial<CatalogSearchRow> = {},
): CatalogSearchRow => ({
    catalog_search_uuid: 'catalog-revenue',
    cached_explore_uuid: 'cached-orders',
    project_uuid: MOCK_PROJECT_UUID,
    name: 'revenue',
    label: 'Revenue',
    description: 'Total revenue',
    type: CatalogType.Field,
    search_vector: '',
    field_type: FieldType.METRIC,
    required_attributes: null,
    any_attributes: null,
    chart_usage: 4,
    icon: null,
    table_name: 'orders',
    spotlight_show: true,
    yaml_tags: [],
    ai_hints: null,
    joined_tables: null,
    owner_user_uuid: null,
    has_time_dimension: false,
    search_rank: 1,
    ...overrides,
});

const MOCK_CREATED_TREE_ROW = {
    metrics_tree_uuid: MOCK_TREE_UUID,
    project_uuid: MOCK_PROJECT_UUID,
    slug: 'my-tree',
    name: 'My Tree',
    description: null,
    source: 'ui',
    created_by_user_uuid: MOCK_USER_UUID,
    updated_by_user_uuid: null,
    created_at: MOCK_TIMESTAMP,
    updated_at: MOCK_TIMESTAMP,
};

describe('CatalogModel', () => {
    const database = knex({ client: MockClient, dialect: 'pg' });
    const model = new CatalogModel({
        database: database as unknown as Knex,
        lightdashConfig: lightdashConfigMock,
    });
    let tracker: Tracker;

    beforeAll(() => {
        tracker = getTracker();
    });

    afterEach(() => {
        tracker.reset();
        vi.restoreAllMocks();
        vi.clearAllMocks();
    });

    describe('search instrumentation', () => {
        test('logs distinct driver-read and Node spans without changing queries or response', async () => {
            const orders = buildExplore('orders');
            const ordersJsonBytes = Buffer.byteLength(
                JSON.stringify(orders),
                'utf8',
            );
            const rows = [
                {
                    ...buildCatalogSearchRow(),
                    __page_ordinal: '3',
                    hydrated_explores: {
                        'cached-orders': orders,
                    },
                },
                {
                    ...buildCatalogSearchRow({
                        catalog_search_uuid: 'catalog-stale',
                        name: 'removed_metric',
                    }),
                    __page_ordinal: '4',
                    hydrated_explores: null,
                },
            ];
            const stringify = vi.spyOn(JSON, 'stringify');

            tracker.on
                .any(({ sql }) => sql.includes('WITH count_cte AS'))
                .response({ rows: [{ count: '2' }] });
            tracker.on
                .select(
                    ({ sql }) =>
                        sql.includes('"selected_page" as materialized') &&
                        sql.includes('jsonb_object_agg'),
                )
                .response(rows);
            tracker.on
                .select(({ sql }) => sql.includes('catalog_search_tags'))
                .response([]);

            const result = await model.search({
                projectUuid: MOCK_PROJECT_UUID,
                catalogSearch: {},
                tablesConfiguration: {
                    tableSelection: {
                        type: TableSelectionType.ALL,
                        value: null,
                    },
                },
                userAttributes: {},
                paginateArgs: { page: 2, pageSize: 2 },
                context: CatalogSearchContext.METRICS_EXPLORER,
            });

            expect(result).toEqual({
                pagination: {
                    page: 2,
                    pageSize: 2,
                    totalPageCount: 1,
                    totalResults: 2,
                },
                data: [
                    {
                        name: 'revenue',
                        label: 'Revenue',
                        description: 'Total revenue',
                        tableLabel: 'Orders',
                        tableName: 'orders',
                        tableGroupLabel: undefined,
                        fieldType: FieldType.METRIC,
                        basicType: 'number',
                        fieldValueType: MetricType.SUM,
                        type: CatalogType.Field,
                        aiHints: null,
                        requiredAttributes: undefined,
                        anyAttributes: undefined,
                        tags: ['finance'],
                        categories: [],
                        chartUsage: 4,
                        catalogSearchUuid: 'catalog-revenue',
                        icon: null,
                        searchRank: 1,
                        owner: null,
                    },
                ],
            });

            expect(tracker.history.all).toHaveLength(3);

            const loggerInfoCalls = vi.mocked(loggerMocks.info).mock.calls;
            const logEntries = loggerInfoCalls.map(([, metadata]) => metadata);
            expect(logEntries.map(({ name }) => name)).toEqual(
                expect.arrayContaining([
                    'CatalogModel.search.count.driverRead',
                    'CatalogModel.search.page.driverRead',
                    'CatalogModel.search.tags',
                    'CatalogModel.search.itemBuild',
                ]),
            );
            expect(logEntries).toHaveLength(4);

            const pageContext = logEntries.find(
                ({ name }) => name === 'CatalogModel.search.page.driverRead',
            )?.context;
            const pageLog = logEntries.find(
                ({ name }) => name === 'CatalogModel.search.page.driverRead',
            );
            expect(pageContext).toEqual(
                expect.objectContaining({
                    codePath: 'catalog-search',
                    readStrategy: 'catalog-search-distinct-explore-hydration',
                    page: 2,
                    pageSize: 2,
                    returnedSqlRowCount: 2,
                    distinctExploreCount: 1,
                    exploreCount: 1,
                    selectedExploreJsonBytes: ordersJsonBytes,
                    returnedCatalogRowCount: undefined,
                }),
            );
            expect(pageContext?.dbReadMs).toEqual(expect.any(Number));
            expect(pageLog?.duration).toBe(pageContext?.dbReadMs);
            expect(
                stringify.mock.calls.filter(
                    ([value]) =>
                        typeof value === 'object' &&
                        value !== null &&
                        'name' in value &&
                        value.name === orders.name &&
                        'tables' in value,
                ),
            ).toHaveLength(1);

            const countContext = logEntries.find(
                ({ name }) => name === 'CatalogModel.search.count.driverRead',
            )?.context;
            expect(countContext).toEqual(
                expect.objectContaining({
                    readStrategy: 'catalog-search-count',
                    page: 2,
                    pageSize: 2,
                    totalResultCount: 2,
                }),
            );

            const itemBuildContext = logEntries.find(
                ({ name }) => name === 'CatalogModel.search.itemBuild',
            )?.context;
            expect(itemBuildContext).toEqual(
                expect.objectContaining({
                    returnedSqlRowCount: 2,
                    returnedCatalogRowCount: 1,
                    distinctExploreCount: 1,
                }),
            );
        });

        test('reuses one hydrated explore for base, joined, table, and stale rows', async () => {
            const orders = buildExploreWithJoinedTable();
            const rows = [
                {
                    ...buildCatalogSearchRow(),
                    __page_ordinal: '1',
                    hydrated_explores: { 'cached-orders': orders },
                },
                {
                    ...buildCatalogSearchRow({
                        catalog_search_uuid: 'catalog-lifetime-value',
                        name: 'lifetime_value',
                        label: 'Lifetime value',
                        table_name: 'customers',
                        yaml_tags: ['customer'],
                        owner_user_uuid: MOCK_USER_UUID,
                        owner_first_name: 'Ada',
                        owner_last_name: 'Lovelace',
                        owner_email: 'ada@example.com',
                        search_rank: 0.8,
                    }),
                    __page_ordinal: '2',
                    hydrated_explores: null,
                },
                {
                    ...buildCatalogSearchRow({
                        catalog_search_uuid: 'catalog-orders',
                        name: 'orders',
                        label: 'Orders catalog',
                        type: CatalogType.Table,
                        field_type: undefined,
                        joined_tables: ['customers'],
                        search_rank: 0.7,
                    }),
                    __page_ordinal: '3',
                    hydrated_explores: null,
                },
                {
                    ...buildCatalogSearchRow({
                        catalog_search_uuid: 'catalog-stale',
                        name: 'removed_metric',
                        search_rank: 0.6,
                    }),
                    __page_ordinal: '4',
                    hydrated_explores: null,
                },
            ];

            tracker.on
                .any(({ sql }) => sql.includes('WITH count_cte AS'))
                .response({ rows: [{ count: '4' }] });
            tracker.on
                .select(({ sql }) => sql.includes('jsonb_object_agg'))
                .response(rows);
            tracker.on
                .select(({ sql }) => sql.includes('catalog_search_tags'))
                .response([
                    {
                        catalog_search_uuid: 'catalog-lifetime-value',
                        tag_uuid: 'tag-certified',
                        name: 'Certified',
                        color: '#123456',
                        yaml_reference: null,
                    },
                ]);

            const result = await model.search({
                projectUuid: MOCK_PROJECT_UUID,
                catalogSearch: {},
                tablesConfiguration: {
                    tableSelection: {
                        type: TableSelectionType.ALL,
                        value: null,
                    },
                },
                userAttributes: {},
                paginateArgs: { page: 1, pageSize: 4 },
                context: CatalogSearchContext.METRICS_EXPLORER,
            });

            expect(result.pagination).toEqual({
                page: 1,
                pageSize: 4,
                totalPageCount: 1,
                totalResults: 4,
            });
            expect(result.data.map(({ name }) => name)).toEqual([
                'revenue',
                'lifetime_value',
                'orders',
            ]);
            expect(result.data[1]).toEqual(
                expect.objectContaining({
                    tableName: 'customers',
                    tableLabel: 'Customers',
                    tags: ['finance', 'customer'],
                    categories: [
                        {
                            tagUuid: 'tag-certified',
                            name: 'Certified',
                            color: '#123456',
                            yamlReference: null,
                        },
                    ],
                    owner: {
                        userUuid: MOCK_USER_UUID,
                        firstName: 'Ada',
                        lastName: 'Lovelace',
                        email: 'ada@example.com',
                    },
                }),
            );
            expect(result.data[2]).toEqual(
                expect.objectContaining({
                    type: CatalogType.Table,
                    tags: ['finance'],
                    joinedTables: ['customers'],
                }),
            );
        });

        test('fails when a selected page references missing cache data', async () => {
            tracker.on
                .any(({ sql }) => sql.includes('WITH count_cte AS'))
                .response({ rows: [{ count: '1' }] });
            tracker.on
                .select(({ sql }) => sql.includes('jsonb_object_agg'))
                .response([
                    {
                        ...buildCatalogSearchRow(),
                        __page_ordinal: '1',
                        hydrated_explores: {},
                    },
                ]);
            tracker.on
                .select(({ sql }) => sql.includes('catalog_search_tags'))
                .response([]);

            await expect(
                model.search({
                    projectUuid: MOCK_PROJECT_UUID,
                    catalogSearch: {},
                    tablesConfiguration: {
                        tableSelection: {
                            type: TableSelectionType.ALL,
                            value: null,
                        },
                    },
                    userAttributes: {},
                    paginateArgs: { page: 1, pageSize: 1 },
                    context: CatalogSearchContext.METRICS_EXPLORER,
                }),
            ).rejects.toThrow(
                'Explore not found for field revenue in table orders',
            );
        });

        test('keeps filters and permissions inside page selection before hydration', async () => {
            tracker.on
                .any(({ sql }) => sql.includes('WITH count_cte AS'))
                .response({ rows: [{ count: '0' }] });
            tracker.on
                .select(({ sql }) => sql.includes('jsonb_object_agg'))
                .response([]);
            tracker.on
                .select(({ sql }) => sql.includes('catalog_search_tags'))
                .response([]);

            await model.search({
                projectUuid: MOCK_PROJECT_UUID,
                catalogSearch: {
                    catalogTags: ['tag-certified'],
                    catalogTagsFilterMode: CatalogCategoryFilterMode.AND,
                    filter: CatalogFilter.Metrics,
                    searchQuery: 'revenue',
                    type: CatalogType.Field,
                    tables: ['orders'],
                    ownerUserUuids: [MOCK_USER_UUID],
                },
                tablesConfiguration: {
                    tableSelection: {
                        type: TableSelectionType.WITH_TAGS,
                        value: ['finance'],
                    },
                },
                userAttributes: { department: ['sales'] },
                paginateArgs: { page: 2, pageSize: 5 },
                sortArgs: { sort: 'name', order: 'desc' },
                context: CatalogSearchContext.METRICS_EXPLORER,
                tags: ['finance'],
            });

            const pageSql = tracker.history.select.find(({ sql }) =>
                sql.includes('jsonb_object_agg'),
            )?.sql;
            expect(pageSql).toEqual(expect.any(String));
            expect(pageSql).toContain('"selected_page" as materialized');
            expect(pageSql).toContain('"selected_explore_ids" as');
            expect(pageSql).toContain('jsonb_object_agg');
            expect(pageSql).toContain('jsonb_array_elements_text');
            expect(pageSql).toContain('"required_attributes"');
            expect(pageSql).toContain('"any_attributes"');
            expect(pageSql).toContain('"catalog_search".search_vector @@');
            expect(pageSql).toContain('"catalog_search"."field_type" =');
            expect(pageSql).toContain('"catalog_search"."table_name" in');
            expect(pageSql).toContain('"catalog_search"."owner_user_uuid" in');
            expect(pageSql).toContain(
                'ROW_NUMBER() OVER (ORDER BY "filtered_catalog"."search_rank" desc, "filtered_catalog"."name" desc)',
            );
            expect(pageSql).toMatch(/limit \$\d+ offset \$\d+/);

            const countSql = tracker.history.all.find(({ sql }) =>
                sql.includes('WITH count_cte AS'),
            )?.sql;
            expect(countSql).toEqual(expect.any(String));
            expect(countSql).not.toContain('search_rank');
            expect(countSql).not.toContain('order by');
            expect(tracker.history.all).toHaveLength(3);
        });

        test('normalizes malformed runtime sort directions before building SQL', async () => {
            tracker.on
                .any(({ sql }) => sql.includes('WITH count_cte AS'))
                .response({ rows: [{ count: '0' }] });
            tracker.on
                .select(({ sql }) => sql.includes('jsonb_object_agg'))
                .response([]);
            tracker.on
                .select(({ sql }) => sql.includes('catalog_search_tags'))
                .response([]);

            await model.search({
                projectUuid: MOCK_PROJECT_UUID,
                catalogSearch: {},
                tablesConfiguration: {
                    tableSelection: {
                        type: TableSelectionType.ALL,
                        value: null,
                    },
                },
                userAttributes: {},
                paginateArgs: { page: 1, pageSize: 10 },
                sortArgs: {
                    sort: 'name',
                    order: 'desc; DROP TABLE users' as 'desc',
                },
                context: CatalogSearchContext.METRICS_EXPLORER,
            });

            const pageSql = tracker.history.select.find(({ sql }) =>
                sql.includes('jsonb_object_agg'),
            )?.sql;
            expect(pageSql).toContain('"filtered_catalog"."name" asc');
            expect(pageSql).not.toContain('DROP TABLE');
        });

        test.each([
            ['name', 'name'],
            ['label', 'label'],
            ['description', 'description'],
            ['type', 'type'],
            ['chartUsage', 'chart_usage'],
            ['requiredAttributes', 'required_attributes'],
            ['anyAttributes', 'any_attributes'],
            ['catalogSearchUuid', 'catalog_search_uuid'],
            ['aiHints', 'ai_hints'],
            ['icon', 'icon'],
            ['tableLabel', 'table_name'],
            ['owner', 'owner_user_uuid'],
        ])(
            'orders by mapped %s through the outer page alias',
            async (sort, column) => {
                tracker.on
                    .any(({ sql }) => sql.includes('WITH count_cte AS'))
                    .response({ rows: [{ count: '0' }] });
                tracker.on
                    .select(({ sql }) => sql.includes('jsonb_object_agg'))
                    .response([]);
                tracker.on
                    .select(({ sql }) => sql.includes('catalog_search_tags'))
                    .response([]);

                await model.search({
                    projectUuid: MOCK_PROJECT_UUID,
                    catalogSearch: {},
                    tablesConfiguration: {
                        tableSelection: {
                            type: TableSelectionType.ALL,
                            value: null,
                        },
                    },
                    userAttributes: {},
                    paginateArgs: { page: 1, pageSize: 10 },
                    sortArgs: { sort, order: 'desc' },
                    context: CatalogSearchContext.METRICS_EXPLORER,
                });

                const pageSql = tracker.history.select.find(({ sql }) =>
                    sql.includes('jsonb_object_agg'),
                )?.sql;
                expect(pageSql).toContain(
                    `"filtered_catalog"."${column}" desc`,
                );
            },
        );
    });

    describe('createMetricsTree', () => {
        test('should create tree with nodes and edges in clean state', async () => {
            // Mock the tree insert (returning created row)
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreesTableName))
                .responseOnce([MOCK_CREATED_TREE_ROW]);

            // Mock the nodes insert
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreeNodesTableName))
                .responseOnce([]);

            // Mock the edges insert (with onConflict ignore)
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreeEdgesTableName))
                .responseOnce([]);

            const result = await model.createMetricsTree(
                {
                    project_uuid: MOCK_PROJECT_UUID,
                    slug: 'my-tree',
                    name: 'My Tree',
                    description: null,
                    source: 'ui',
                    created_by_user_uuid: MOCK_USER_UUID,
                },
                [
                    {
                        catalogSearchUuid: 'node-1',
                        xPosition: 100,
                        yPosition: 200,
                    },
                    {
                        catalogSearchUuid: 'node-2',
                        xPosition: 300,
                        yPosition: 400,
                    },
                ],
                [
                    {
                        sourceCatalogSearchUuid: 'node-1',
                        targetCatalogSearchUuid: 'node-2',
                    },
                ],
            );

            expect(result).toEqual({
                metricsTreeUuid: MOCK_TREE_UUID,
                projectUuid: MOCK_PROJECT_UUID,
                slug: 'my-tree',
                name: 'My Tree',
                description: null,
                source: 'ui',
                createdByUserUuid: MOCK_USER_UUID,
                updatedByUserUuid: null,
                createdAt: MOCK_TIMESTAMP,
                updatedAt: MOCK_TIMESTAMP,
            });

            // Verify all three inserts happened
            expect(tracker.history.insert).toHaveLength(3);

            // Verify tree insert
            const treeInsert = tracker.history.insert[0];
            expect(treeInsert.sql).toContain(MetricsTreesTableName);

            // Verify nodes insert
            const nodesInsert = tracker.history.insert[1];
            expect(nodesInsert.sql).toContain(MetricsTreeNodesTableName);
            expect(nodesInsert.bindings).toEqual(
                expect.arrayContaining([
                    MOCK_TREE_UUID,
                    'node-1',
                    100,
                    200,
                    'ui',
                    MOCK_TREE_UUID,
                    'node-2',
                    300,
                    400,
                    'ui',
                ]),
            );

            // Verify edges insert with onConflict ignore
            const edgesInsert = tracker.history.insert[2];
            expect(edgesInsert.sql).toContain(MetricsTreeEdgesTableName);
            expect(edgesInsert.sql).toContain('on conflict');
            expect(edgesInsert.bindings).toEqual(
                expect.arrayContaining([
                    'node-1',
                    'node-2',
                    MOCK_USER_UUID,
                    MOCK_PROJECT_UUID,
                    'ui',
                ]),
            );
        });

        test('should skip existing edges with onConflict ignore', async () => {
            // Mock the tree insert
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreesTableName))
                .responseOnce([MOCK_CREATED_TREE_ROW]);

            // Mock the nodes insert
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreeNodesTableName))
                .responseOnce([]);

            // Mock the edges insert — onConflict().ignore() means
            // existing edges are silently skipped, no error thrown
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreeEdgesTableName))
                .responseOnce([]);

            const result = await model.createMetricsTree(
                {
                    project_uuid: MOCK_PROJECT_UUID,
                    slug: 'my-tree',
                    name: 'My Tree',
                    description: null,
                    source: 'ui',
                    created_by_user_uuid: MOCK_USER_UUID,
                },
                [
                    { catalogSearchUuid: 'node-1' },
                    { catalogSearchUuid: 'node-2' },
                    { catalogSearchUuid: 'node-3' },
                ],
                [
                    {
                        sourceCatalogSearchUuid: 'node-1',
                        targetCatalogSearchUuid: 'node-2',
                    },
                    {
                        sourceCatalogSearchUuid: 'node-2',
                        targetCatalogSearchUuid: 'node-3',
                    },
                ],
            );

            expect(result.metricsTreeUuid).toEqual(MOCK_TREE_UUID);

            // All three inserts should succeed
            expect(tracker.history.insert).toHaveLength(3);

            // Edges insert uses onConflict ignore
            const edgesInsert = tracker.history.insert[2];
            expect(edgesInsert.sql).toContain('on conflict');
            expect(edgesInsert.sql).toMatch(/do nothing|ignore/i);
        });

        test('should create tree with nodes but no edges', async () => {
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreesTableName))
                .responseOnce([MOCK_CREATED_TREE_ROW]);

            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreeNodesTableName))
                .responseOnce([]);

            const result = await model.createMetricsTree(
                {
                    project_uuid: MOCK_PROJECT_UUID,
                    slug: 'my-tree',
                    name: 'My Tree',
                    description: null,
                    source: 'ui',
                    created_by_user_uuid: MOCK_USER_UUID,
                },
                [{ catalogSearchUuid: 'node-1' }],
                [],
            );

            expect(result.metricsTreeUuid).toEqual(MOCK_TREE_UUID);

            // Only tree + nodes inserts, no edges
            expect(tracker.history.insert).toHaveLength(2);
        });

        test('should create tree with no nodes and no edges', async () => {
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreesTableName))
                .responseOnce([MOCK_CREATED_TREE_ROW]);

            const result = await model.createMetricsTree(
                {
                    project_uuid: MOCK_PROJECT_UUID,
                    slug: 'my-tree',
                    name: 'My Tree',
                    description: null,
                    source: 'ui',
                    created_by_user_uuid: MOCK_USER_UUID,
                },
                [],
                [],
            );

            expect(result.metricsTreeUuid).toEqual(MOCK_TREE_UUID);

            // Only tree insert
            expect(tracker.history.insert).toHaveLength(1);
        });

        test('should default node positions to null when omitted', async () => {
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreesTableName))
                .responseOnce([MOCK_CREATED_TREE_ROW]);

            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreeNodesTableName))
                .responseOnce([]);

            await model.createMetricsTree(
                {
                    project_uuid: MOCK_PROJECT_UUID,
                    slug: 'my-tree',
                    name: 'My Tree',
                    description: null,
                    source: 'ui',
                    created_by_user_uuid: MOCK_USER_UUID,
                },
                [{ catalogSearchUuid: 'node-1' }],
                [],
            );

            const nodesInsert = tracker.history.insert[1];
            // Bindings: tree_uuid, catalog_search_uuid, x_position(null), y_position(null), source
            expect(nodesInsert.bindings).toContain(null);
        });

        test('should create a sub-tree with a subset of nodes and edges', async () => {
            // Given metrics A -> B -> C exist globally,
            // we create a tree that only contains A -> B
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreesTableName))
                .responseOnce([
                    {
                        ...MOCK_CREATED_TREE_ROW,
                        slug: 'sub-tree',
                        name: 'Sub Tree',
                    },
                ]);

            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreeNodesTableName))
                .responseOnce([]);

            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreeEdgesTableName))
                .responseOnce([]);

            const result = await model.createMetricsTree(
                {
                    project_uuid: MOCK_PROJECT_UUID,
                    slug: 'sub-tree',
                    name: 'Sub Tree',
                    description: null,
                    source: 'ui',
                    created_by_user_uuid: MOCK_USER_UUID,
                },
                [
                    { catalogSearchUuid: 'metric-a' },
                    { catalogSearchUuid: 'metric-b' },
                ],
                [
                    {
                        sourceCatalogSearchUuid: 'metric-a',
                        targetCatalogSearchUuid: 'metric-b',
                    },
                ],
            );

            expect(result.metricsTreeUuid).toEqual(MOCK_TREE_UUID);

            // Tree + nodes + edges = 3 inserts
            expect(tracker.history.insert).toHaveLength(3);

            // Verify only A and B are in the nodes insert (not C)
            const nodesInsert = tracker.history.insert[1];
            expect(nodesInsert.bindings).toContain('metric-a');
            expect(nodesInsert.bindings).toContain('metric-b');
            expect(nodesInsert.bindings).not.toContain('metric-c');

            // Verify only A -> B edge is inserted (not B -> C)
            const edgesInsert = tracker.history.insert[2];
            expect(edgesInsert.bindings).toContain('metric-a');
            expect(edgesInsert.bindings).toContain('metric-b');
            expect(edgesInsert.bindings).not.toContain('metric-c');
        });
    });

    describe('acquireTreeLock', () => {
        const MOCK_LOCK_ROW = {
            metrics_tree_uuid: MOCK_TREE_UUID,
            locked_by_user_uuid: MOCK_USER_UUID,
            acquired_at: MOCK_TIMESTAMP,
            last_heartbeat_at: new Date(),
        };

        test('should acquire lock when no existing lock', async () => {
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreeLocksTableName))
                .responseOnce([MOCK_LOCK_ROW]);

            // SELECT user info
            tracker.on
                .select(({ sql }) => sql.includes('users'))
                .responseOnce([{ first_name: 'John', last_name: 'Doe' }]);

            const result = await model.acquireTreeLock(
                MOCK_TREE_UUID,
                MOCK_USER_UUID,
            );

            expect(result).toEqual({
                lockedByUserUuid: MOCK_USER_UUID,
                lockedByUserName: 'John Doe',
                acquiredAt: MOCK_TIMESTAMP,
            });

            expect(tracker.history.insert).toHaveLength(1);
            // Verify the upsert uses onConflict merge
            const insertQuery = tracker.history.insert[0];
            expect(insertQuery.sql).toContain('on conflict');
        });

        test('should re-acquire lock when same user holds it', async () => {
            // Atomic upsert succeeds (same user matches WHERE condition)
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreeLocksTableName))
                .responseOnce([MOCK_LOCK_ROW]);

            // SELECT user info
            tracker.on
                .select(({ sql }) => sql.includes('users'))
                .responseOnce([{ first_name: 'John', last_name: 'Doe' }]);

            const result = await model.acquireTreeLock(
                MOCK_TREE_UUID,
                MOCK_USER_UUID,
            );

            expect(result.lockedByUserUuid).toEqual(MOCK_USER_UUID);
            expect(tracker.history.insert).toHaveLength(1);
        });

        test('should acquire lock when existing lock is expired', async () => {
            // Atomic upsert succeeds (expired heartbeat matches WHERE condition)
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreeLocksTableName))
                .responseOnce([MOCK_LOCK_ROW]);

            // SELECT user info
            tracker.on
                .select(({ sql }) => sql.includes('users'))
                .responseOnce([{ first_name: 'John', last_name: 'Doe' }]);

            const result = await model.acquireTreeLock(
                MOCK_TREE_UUID,
                MOCK_USER_UUID,
            );

            expect(result.lockedByUserUuid).toEqual(MOCK_USER_UUID);
            expect(tracker.history.insert).toHaveLength(1);
        });

        test('should throw when different user holds active lock', async () => {
            // Atomic upsert returns empty (WHERE conditions not met)
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreeLocksTableName))
                .responseOnce([]);

            await expect(
                model.acquireTreeLock(MOCK_TREE_UUID, MOCK_USER_UUID),
            ).rejects.toThrow(AlreadyExistsError);

            // Only the failed upsert attempt, no user SELECT
            expect(tracker.history.insert).toHaveLength(1);
            expect(tracker.history.select).toHaveLength(0);
        });

        test('should format user name without last name', async () => {
            // Atomic upsert succeeds
            tracker.on
                .insert(({ sql }) => sql.includes(MetricsTreeLocksTableName))
                .responseOnce([MOCK_LOCK_ROW]);

            // SELECT user with null last name
            tracker.on
                .select(({ sql }) => sql.includes('users'))
                .responseOnce([{ first_name: 'John', last_name: null }]);

            const result = await model.acquireTreeLock(
                MOCK_TREE_UUID,
                MOCK_USER_UUID,
            );

            expect(result.lockedByUserName).toEqual('John');
        });
    });

    describe('refreshTreeLockHeartbeat', () => {
        test('should return true when lock is refreshed', async () => {
            // UPDATE returns 1 row affected
            tracker.on
                .update(({ sql }) => sql.includes(MetricsTreeLocksTableName))
                .responseOnce(1);

            const result = await model.refreshTreeLockHeartbeat(
                MOCK_TREE_UUID,
                MOCK_USER_UUID,
            );

            expect(result).toBe(true);

            // Verify update targets the correct tree + user
            const updateQuery = tracker.history.update[0];
            expect(updateQuery.bindings).toContain(MOCK_TREE_UUID);
            expect(updateQuery.bindings).toContain(MOCK_USER_UUID);
        });

        test('should return false when no matching lock exists', async () => {
            // UPDATE returns 0 rows affected (no lock found)
            tracker.on
                .update(({ sql }) => sql.includes(MetricsTreeLocksTableName))
                .responseOnce(0);

            const result = await model.refreshTreeLockHeartbeat(
                MOCK_TREE_UUID,
                MOCK_USER_UUID,
            );

            expect(result).toBe(false);
        });
    });

    describe('releaseTreeLock', () => {
        test('should delete lock for the given tree and user', async () => {
            tracker.on
                .delete(({ sql }) => sql.includes(MetricsTreeLocksTableName))
                .responseOnce([]);

            await model.releaseTreeLock(MOCK_TREE_UUID, MOCK_USER_UUID);

            expect(tracker.history.delete).toHaveLength(1);

            const deleteQuery = tracker.history.delete[0];
            expect(deleteQuery.bindings).toContain(MOCK_TREE_UUID);
            expect(deleteQuery.bindings).toContain(MOCK_USER_UUID);
        });
    });

    describe('getTreeLock', () => {
        test('should return lock info when active lock exists', async () => {
            tracker.on
                .select(
                    ({ sql }) =>
                        sql.includes(MetricsTreeLocksTableName) &&
                        sql.includes('users'),
                )
                .responseOnce([
                    {
                        metrics_tree_uuid: MOCK_TREE_UUID,
                        locked_by_user_uuid: MOCK_USER_UUID,
                        acquired_at: MOCK_TIMESTAMP,
                        last_heartbeat_at: new Date(),
                        first_name: 'John',
                        last_name: 'Doe',
                    },
                ]);

            const result = await model.getTreeLock(MOCK_TREE_UUID);

            expect(result).toEqual({
                lockedByUserUuid: MOCK_USER_UUID,
                lockedByUserName: 'John Doe',
                acquiredAt: MOCK_TIMESTAMP,
            });
        });

        test('should return null when no lock exists', async () => {
            tracker.on
                .select(
                    ({ sql }) =>
                        sql.includes(MetricsTreeLocksTableName) &&
                        sql.includes('users'),
                )
                .responseOnce([]);

            const result = await model.getTreeLock(MOCK_TREE_UUID);

            expect(result).toBeNull();
        });

        test('should include expiry condition in query', async () => {
            tracker.on
                .select(
                    ({ sql }) =>
                        sql.includes(MetricsTreeLocksTableName) &&
                        sql.includes('users'),
                )
                .responseOnce([]);

            await model.getTreeLock(MOCK_TREE_UUID);

            const selectQuery = tracker.history.select[0];
            // The query should include the heartbeat expiry check
            expect(selectQuery.sql).toContain('last_heartbeat_at');
        });
    });
});
