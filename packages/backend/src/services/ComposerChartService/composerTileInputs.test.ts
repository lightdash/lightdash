import {
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
    getComposerParameterReferences,
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
