import {
    DateGranularity,
    DimensionType,
    ExploreType,
    FieldType,
    FilterOperator,
    MergeJoinType,
    MetricType,
    QuerySourceType,
    SupportedDbtAdapter,
    type ComposerChartPipelineNode,
    type DashboardFilterRule,
    type DashboardFilters,
    type Explore,
    type LightdashProjectParameter,
} from '@lightdash/common';
import { describe, expect, it } from 'vitest';
import {
    applyDashboardFiltersToComposerNodes,
    applyDashboardParametersToComposerNodes,
    getComposerNodeDateZooms,
    getComposerParameterReferences,
    getComposerZoomableFields,
    withSqlColumnFilters,
} from './composerTileInputs';

const buildExplore = (
    name: string,
    dimensions: string[],
    {
        parameters = {},
        dimensionSql = {},
    }: {
        parameters?: Record<string, LightdashProjectParameter>;
        dimensionSql?: Record<string, string>;
    } = {},
): Explore => ({
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name,
    label: name,
    tags: [],
    baseTable: name,
    type: ExploreType.DEFAULT,
    joinedTables: [],
    tables: {
        [name]: {
            name,
            label: name,
            database: 'db',
            schema: 'schema',
            sqlTable: name,
            lineageGraph: {},
            parameters,
            dimensions: Object.fromEntries(
                dimensions.map((dimension) => [
                    dimension,
                    {
                        fieldType: FieldType.DIMENSION,
                        type: DimensionType.STRING,
                        name: dimension,
                        label: dimension,
                        table: name,
                        tableLabel: name,
                        sql: dimensionSql[dimension] ?? '',
                        compiledSql: '',
                        hidden: false,
                        tablesReferences: [name],
                        parameterReferences: dimensionSql[dimension]
                            ? ['region']
                            : undefined,
                    },
                ]),
            ),
            metrics: {
                count: {
                    fieldType: FieldType.METRIC,
                    type: MetricType.COUNT,
                    name: 'count',
                    label: 'count',
                    table: name,
                    tableLabel: name,
                    sql: '',
                    compiledSql: '',
                    hidden: false,
                    tablesReferences: [name],
                },
            },
        },
    },
});

const orders = buildExplore('orders', ['status', 'region'], {
    dimensionSql: { region: '${lightdash.parameters.region}' },
});
const payments = buildExplore('payments', ['method']);

const ordersNode: ComposerChartPipelineNode = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'orders',
    title: 'Orders',
    exploreName: 'orders',
    dimensions: ['orders_status', 'orders_region'],
    metrics: ['orders_count'],
    filters: {
        dimensions: {
            id: 'node-group',
            and: [
                {
                    id: 'node-status',
                    target: { fieldId: 'orders_status' },
                    operator: FilterOperator.EQUALS,
                    values: ['placed'],
                },
                {
                    id: 'node-region',
                    target: { fieldId: 'orders_region' },
                    operator: FilterOperator.EQUALS,
                    values: ['eu'],
                },
            ],
        },
    },
    parameters: { region: 'node-value' },
};
const paymentsNode: ComposerChartPipelineNode = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'payments',
    title: 'Payments',
    exploreName: 'payments',
    dimensions: ['payments_method'],
    metrics: ['payments_count'],
};
const sqlNode: ComposerChartPipelineNode = {
    sourceType: QuerySourceType.SQL,
    nodeId: 'raw',
    title: 'Raw',
    sql: 'select * from t where r = ${lightdash.parameters.sql_param}',
};
const duckdbNode: ComposerChartPipelineNode = {
    sourceType: QuerySourceType.DUCKDB,
    nodeId: 'joined',
    title: 'Joined',
    sql: 'select * from orders where x = ${lightdash.parameters.duck_param}',
    references: ['orders'],
};
const pythonNode: ComposerChartPipelineNode = {
    sourceType: QuerySourceType.PYTHON,
    nodeId: 'py',
    title: 'Py',
    code: 'def run(inputs, params): return params["python_only"]',
    references: ['joined'],
};
const mergeNode: ComposerChartPipelineNode = {
    sourceType: QuerySourceType.MERGE,
    nodeId: 'merged',
    title: 'Merged',
    sources: [{ nodeId: 'orders' }, { nodeId: 'payments' }],
    joinKey: [],
    joinType: MergeJoinType.FULL,
};
const nodes = [
    ordersNode,
    paymentsNode,
    sqlNode,
    duckdbNode,
    pythonNode,
    mergeNode,
];
const exploreByNodeId = { orders, payments };

const rule = (
    id: string,
    fieldId: string,
    extra: Partial<DashboardFilterRule> = {},
): DashboardFilterRule => ({
    id,
    label: undefined,
    target: { fieldId, tableName: fieldId.split('_')[0] },
    operator: FilterOperator.EQUALS,
    values: ['x'],
    ...extra,
});

const filtersWith = (
    ...dimensions: DashboardFilterRule[]
): DashboardFilters => ({
    dimensions,
    metrics: [],
    tableCalculations: [],
});

const nodeById = (list: ComposerChartPipelineNode[], nodeId: string) =>
    list.find((node) => node.nodeId === nodeId)!;

describe('applyDashboardFiltersToComposerNodes', () => {
    it('applies a filter to every semantic-layer node whose explore has the field', () => {
        const statusRule = rule('dash-status', 'orders_status');
        const methodRule = rule('dash-method', 'payments_method');
        const result = applyDashboardFiltersToComposerNodes({
            tileUuid: 'tile',
            nodes,
            dashboardFilters: filtersWith(statusRule, methodRule),
            exploreByNodeId,
        });

        expect(result.appliedDashboardFiltersByNodeId).toEqual({
            orders: filtersWith(statusRule),
            payments: filtersWith(methodRule),
        });
        expect(result.appliedDashboardFilters).toEqual(
            filtersWith(statusRule, methodRule),
        );
        expect(nodeById(result.nodes, 'payments')).toMatchObject({
            filters: {
                dimensions: {
                    and: [
                        expect.objectContaining({
                            id: 'dash-method',
                            target: { fieldId: 'payments_method' },
                        }),
                    ],
                },
            },
        });
        ['raw', 'joined', 'py', 'merged'].forEach((nodeId) =>
            expect(nodeById(result.nodes, nodeId)).toBe(
                nodeById(nodes, nodeId),
            ),
        );
    });

    it('replaces a node rule on the same field and keeps its other rules', () => {
        const result = applyDashboardFiltersToComposerNodes({
            tileUuid: 'tile',
            nodes,
            dashboardFilters: filtersWith(
                rule('dash-status', 'orders_status', { values: ['shipped'] }),
            ),
            exploreByNodeId,
        });
        const group = nodeById(result.nodes, 'orders');
        expect(group).toMatchObject({
            filters: {
                dimensions: {
                    and: [
                        expect.objectContaining({
                            id: 'dash-status',
                            values: ['shipped'],
                        }),
                        expect.objectContaining({ id: 'node-region' }),
                    ],
                },
            },
        });
    });

    it('never pushes a SQL column target into a semantic-layer node, even one with a field of that name', () => {
        const result = applyDashboardFiltersToComposerNodes({
            tileUuid: 'tile',
            nodes,
            dashboardFilters: filtersWith(
                rule('dash-status', 'orders_status', {
                    tileTargets: {
                        tile: {
                            fieldId: 'orders_status',
                            tableName: 'mock_table',
                            isSqlColumn: true,
                        },
                    },
                }),
            ),
            exploreByNodeId,
        });
        expect(result.nodes).toEqual(nodes);
        expect(result.appliedDashboardFiltersByNodeId).toEqual({});
    });

    it('leaves every node unchanged when no explore has the field', () => {
        const result = applyDashboardFiltersToComposerNodes({
            tileUuid: 'tile',
            nodes,
            dashboardFilters: filtersWith(rule('dash-x', 'customers_name')),
            exploreByNodeId,
        });
        expect(result.nodes).toEqual(nodes);
        expect(result.appliedDashboardFilters).toEqual(filtersWith());
    });

    it('skips a filter switched off for the tile', () => {
        const result = applyDashboardFiltersToComposerNodes({
            tileUuid: 'tile',
            nodes,
            dashboardFilters: filtersWith(
                rule('dash-status', 'orders_status', {
                    tileTargets: { tile: false },
                }),
            ),
            exploreByNodeId,
        });
        expect(result.nodes).toEqual(nodes);
        expect(result.appliedDashboardFilters).toEqual(filtersWith());
    });
});

describe('applyDashboardParametersToComposerNodes', () => {
    const projectDefinitions: Record<string, LightdashProjectParameter> = {
        region: { label: 'Region' },
        sql_param: { label: 'SQL' },
        with_default: { label: 'Defaulted', default: 'definition-default' },
    };

    it('gives the dashboard value to every tier and drops node values for targeted keys', () => {
        const result = applyDashboardParametersToComposerNodes({
            nodes,
            exploreByNodeId,
            projectDefinitions,
            dashboardValues: { region: 'dashboard-value', sql_param: 'sql' },
            excludedKeys: [],
        });
        expect(nodeById(result.nodes, 'orders')).toMatchObject({
            parameters: { region: 'dashboard-value', sql_param: 'sql' },
        });
        expect(result.parameters).toEqual({
            region: 'dashboard-value',
            sql_param: 'sql',
        });
    });

    it('uses a node value only when the dashboard has none and the definition no default', () => {
        const result = applyDashboardParametersToComposerNodes({
            nodes: [
                {
                    ...ordersNode,
                    parameters: {
                        region: 'node-value',
                        with_default: 'node-value',
                    },
                },
            ],
            exploreByNodeId,
            projectDefinitions,
            dashboardValues: {},
            excludedKeys: [],
        });
        expect(result.nodes[0]).toMatchObject({
            parameters: { region: 'node-value' },
        });
        expect(result.parameters).toEqual({});
    });

    it('keeps only the node value for a key the tile is excluded from', () => {
        const result = applyDashboardParametersToComposerNodes({
            nodes,
            exploreByNodeId,
            projectDefinitions,
            dashboardValues: { region: 'dashboard-value' },
            excludedKeys: ['region'],
        });
        expect(nodeById(result.nodes, 'orders')).toMatchObject({
            parameters: { region: 'node-value' },
        });
        expect(nodeById(result.nodes, 'payments')).toMatchObject({
            parameters: {},
        });
        expect(result.parameters).toEqual({});
    });

    it('does not narrow the shared map by a semantic-layer explore', () => {
        const restricted = buildExplore('orders', ['status'], {
            parameters: { region: { label: 'Region', options: ['eu'] } },
        });
        const result = applyDashboardParametersToComposerNodes({
            nodes: [ordersNode, sqlNode],
            exploreByNodeId: { orders: restricted },
            projectDefinitions: {},
            dashboardValues: { 'orders.region': 'us' },
            excludedKeys: [],
        });
        expect(result.parameters).toEqual({ 'orders.region': 'us' });
        expect(nodeById(result.nodes, 'orders')).toMatchObject({
            parameters: {},
        });
    });
});

describe('getComposerParameterReferences', () => {
    it('reports the references of every node except Python ones', () => {
        expect(
            getComposerParameterReferences(nodes, exploreByNodeId).sort(),
        ).toEqual(['duck_param', 'region', 'sql_param']);
    });
});

describe('withSqlColumnFilters', () => {
    const columnTarget = (fieldId: string) => ({
        fieldId,
        tableName: 'mock_table',
        isSqlColumn: true,
    });

    it('reports a SQL column target on every SQL node that has the column, beside the semantic-layer rules', () => {
        const statusRule = rule('dash-status', 'orders_status');
        const columnRule = rule('dash-col', 'orders_status', {
            tileTargets: { tile: columnTarget('status') },
        });
        const semantic = applyDashboardFiltersToComposerNodes({
            tileUuid: 'tile',
            nodes,
            dashboardFilters: filtersWith(statusRule, columnRule),
            exploreByNodeId,
        });
        const result = withSqlColumnFilters(semantic, {
            tileUuid: 'tile',
            dashboardFilters: filtersWith(statusRule, columnRule),
            sqlColumnsByNodeId: {
                raw: ['status', 'amount'],
                other: ['status'],
                none: ['amount'],
            },
        });
        const appliedColumnRule = {
            ...columnRule,
            target: columnTarget('status'),
            settings: { sourceTarget: columnRule.target },
        };
        expect(result.appliedDashboardFiltersByNodeId).toEqual({
            orders: filtersWith(statusRule),
            raw: filtersWith(appliedColumnRule),
            other: filtersWith(appliedColumnRule),
        });
        expect(
            result.appliedDashboardFilters.dimensions.map((r) => r.id),
        ).toEqual(['dash-status', 'dash-col']);
    });

    it('applies nothing to a SQL node without an explicit column target', () => {
        const semantic = applyDashboardFiltersToComposerNodes({
            tileUuid: 'tile',
            nodes,
            dashboardFilters: filtersWith(rule('dash-status', 'status')),
            exploreByNodeId,
        });
        expect(
            withSqlColumnFilters(semantic, {
                tileUuid: 'tile',
                dashboardFilters: filtersWith(rule('dash-status', 'status')),
                sqlColumnsByNodeId: { raw: ['status'] },
            }).appliedDashboardFiltersByNodeId,
        ).toEqual({});
    });
});

describe('getComposerNodeDateZooms', () => {
    const withDateDimensions = (
        explore: Explore,
        types: Record<string, DimensionType>,
    ): Explore => {
        const table = explore.tables[explore.baseTable];
        const dimensions = { ...table.dimensions };
        Object.entries(types).forEach(([name, type]) => {
            dimensions[name] = { ...dimensions[name], type };
        });
        return {
            ...explore,
            tables: { [explore.baseTable]: { ...table, dimensions } },
        };
    };
    const events = withDateDimensions(
        buildExplore('events', ['created', 'shipped', 'kind']),
        { created: DimensionType.TIMESTAMP, shipped: DimensionType.TIMESTAMP },
    );
    const visits = withDateDimensions(
        buildExplore('visits', ['day', 'signup']),
        { day: DimensionType.DATE, signup: DimensionType.DATE },
    );
    const eventsNode: ComposerChartPipelineNode = {
        sourceType: QuerySourceType.SEMANTIC_LAYER,
        nodeId: 'events',
        title: 'Events',
        exploreName: 'events',
        dimensions: ['events_kind', 'events_created', 'events_shipped'],
        metrics: ['events_count'],
    };
    const visitsNode: ComposerChartPipelineNode = {
        sourceType: QuerySourceType.SEMANTIC_LAYER,
        nodeId: 'visits',
        title: 'Visits',
        exploreName: 'visits',
        dimensions: ['visits_day', 'visits_signup'],
        metrics: ['visits_count'],
    };
    const zoomExplores = { ...exploreByNodeId, events, visits };

    it('zooms the x-axis field on a node that selects it, else its first date dimension, and leaves nodes without one alone', () => {
        expect(
            getComposerNodeDateZooms({
                nodes: [
                    eventsNode,
                    visitsNode,
                    ordersNode,
                    sqlNode,
                    duckdbNode,
                ],
                exploreByNodeId: zoomExplores,
                dateZoom: {
                    granularity: DateGranularity.MONTH,
                    xAxisFieldId: 'events_shipped',
                },
            }),
        ).toEqual({
            events: {
                granularity: DateGranularity.MONTH,
                xAxisFieldId: 'events_shipped',
            },
            visits: {
                granularity: DateGranularity.MONTH,
                xAxisFieldId: 'visits_day',
            },
        });
    });

    it('zooms nothing without a granularity', () => {
        expect(
            getComposerNodeDateZooms({
                nodes: [eventsNode],
                exploreByNodeId: zoomExplores,
                dateZoom: null,
            }),
        ).toEqual({});
    });

    it('skips a sub-day zoom on a date-only dimension', () => {
        expect(
            getComposerNodeDateZooms({
                nodes: [eventsNode, visitsNode],
                exploreByNodeId: zoomExplores,
                dateZoom: { granularity: DateGranularity.HOUR },
            }),
        ).toEqual({
            events: {
                granularity: DateGranularity.HOUR,
                xAxisFieldId: 'events_created',
            },
        });
    });

    it('zooms a custom granularity only on a node whose explore defines it', () => {
        const fiscal = withDateDimensions(
            buildExplore('events', ['created', 'created_fiscal', 'kind']),
            { created: DimensionType.TIMESTAMP },
        );
        expect(
            getComposerNodeDateZooms({
                nodes: [eventsNode, visitsNode],
                exploreByNodeId: { events: fiscal, visits },
                dateZoom: { granularity: 'fiscal' },
            }),
        ).toEqual({
            events: { granularity: 'fiscal', xAxisFieldId: 'events_created' },
        });
    });

    describe('merge legs', () => {
        const merged = (
            joinKey: Array<{ name: string; events: string; visits: string }>,
        ): ComposerChartPipelineNode => ({
            sourceType: QuerySourceType.MERGE,
            nodeId: 'merged',
            title: 'Merged',
            sources: [{ nodeId: 'events' }, { nodeId: 'visits' }],
            joinKey: joinKey.map(({ name, events: e, visits: v }) => ({
                name,
                fieldIdBySourceId: { events: e, visits: v },
            })),
            joinType: MergeJoinType.FULL,
        });
        const zoomMerge = (
            merge: ComposerChartPipelineNode,
            dateZoom: { granularity: DateGranularity; xAxisFieldId?: string },
        ) =>
            getComposerNodeDateZooms({
                nodes: [eventsNode, visitsNode, merge],
                exploreByNodeId: zoomExplores,
                dateZoom,
            });
        const twoDateKeys = merged([
            { name: 'created', events: 'events_created', visits: 'visits_day' },
            {
                name: 'shipped',
                events: 'events_shipped',
                visits: 'visits_signup',
            },
        ]);

        it('zooms every leg on its own field of the first date key part', () => {
            expect(
                zoomMerge(twoDateKeys, { granularity: DateGranularity.MONTH }),
            ).toEqual({
                events: {
                    granularity: DateGranularity.MONTH,
                    xAxisFieldId: 'events_created',
                },
                visits: {
                    granularity: DateGranularity.MONTH,
                    xAxisFieldId: 'visits_day',
                },
            });
        });

        it.each(['merge_shipped', 'visits_signup'])(
            'zooms the key part %s targets on every leg',
            (xAxisFieldId) => {
                expect(
                    zoomMerge(twoDateKeys, {
                        granularity: DateGranularity.MONTH,
                        xAxisFieldId,
                    }),
                ).toEqual({
                    events: {
                        granularity: DateGranularity.MONTH,
                        xAxisFieldId: 'events_shipped',
                    },
                    visits: {
                        granularity: DateGranularity.MONTH,
                        xAxisFieldId: 'visits_signup',
                    },
                });
            },
        );

        it('zooms no leg when one leg cannot take the grain or no key part is a date on every leg', () => {
            expect(
                zoomMerge(twoDateKeys, { granularity: DateGranularity.HOUR }),
            ).toEqual({});
            expect(
                zoomMerge(
                    merged([
                        {
                            name: 'kind',
                            events: 'events_kind',
                            visits: 'visits_day',
                        },
                    ]),
                    { granularity: DateGranularity.MONTH },
                ),
            ).toEqual({});
        });

        it('zooms no leg of merges that share a leg, and still zooms a separate merge', () => {
            const createdKey = merged([
                {
                    name: 'created',
                    events: 'events_created',
                    visits: 'visits_day',
                },
            ]);
            const separate: ComposerChartPipelineNode = {
                sourceType: QuerySourceType.MERGE,
                nodeId: 'separate',
                title: 'Separate',
                joinType: MergeJoinType.FULL,
                sources: [{ nodeId: 'events2' }, { nodeId: 'visits2' }],
                joinKey: [
                    {
                        name: 'created',
                        fieldIdBySourceId: {
                            events2: 'events_created',
                            visits2: 'visits_day',
                        },
                    },
                ],
            };
            expect(
                getComposerNodeDateZooms({
                    nodes: [
                        eventsNode,
                        visitsNode,
                        { ...eventsNode, nodeId: 'events2' },
                        { ...visitsNode, nodeId: 'visits2' },
                        createdKey,
                        { ...createdKey, nodeId: 'again' },
                        separate,
                    ],
                    exploreByNodeId: {
                        ...zoomExplores,
                        events2: events,
                        visits2: visits,
                    },
                    dateZoom: { granularity: DateGranularity.MONTH },
                }),
            ).toEqual({
                events2: {
                    granularity: DateGranularity.MONTH,
                    xAxisFieldId: 'events_created',
                },
                visits2: {
                    granularity: DateGranularity.MONTH,
                    xAxisFieldId: 'visits_day',
                },
            });
        });

        it("reports every leg field of a merge's date key parts as zoomable", () => {
            expect(
                getComposerZoomableFields(
                    [
                        eventsNode,
                        visitsNode,
                        merged([
                            {
                                name: 'shipped',
                                events: 'events_shipped',
                                visits: 'visits_signup',
                            },
                        ]),
                    ],
                    zoomExplores,
                ).map(({ fieldId }) => fieldId),
            ).toEqual(['events_shipped', 'visits_signup']);
        });

        it('reports every date field of a node outside a merge', () => {
            expect(
                getComposerZoomableFields([eventsNode], zoomExplores).map(
                    ({ fieldId }) => fieldId,
                ),
            ).toEqual(['events_created', 'events_shipped']);
        });
    });
});
