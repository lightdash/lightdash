import {
    CustomDimensionType,
    DimensionType,
    ExploreType,
    FieldType,
    FilterOperator,
    MetricType,
    SupportedDbtAdapter,
    type Explore,
    type MetricQuery,
} from '@lightdash/common';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import {
    PreAggregationDuckDbResolveReason,
    type ResolvePreAggregationDuckDbArgs,
} from './PreAggregationDuckDbClient';
import { PreAggregationExternalResolver } from './PreAggregationExternalResolver';

const EXTERNAL_TABLE = '"analytics"."orders_rollup_mv"';

// Baked external pre-aggregate explore, as produced by buildPreAggregateExplore
const externalPreAggExplore: Explore = {
    name: '__preagg__orders__orders_rollup',
    label: 'Orders rollup',
    tags: [],
    baseTable: 'orders',
    joinedTables: [],
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    type: ExploreType.PRE_AGGREGATE,
    preAggregateSource: {
        sourceExploreName: 'orders',
        preAggregateName: 'orders_rollup',
        externalTable: EXTERNAL_TABLE,
    },
    preAggregates: [],
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            database: 'db',
            schema: 'analytics',
            sqlTable: EXTERNAL_TABLE,
            lineageGraph: {},
            dimensions: {
                status: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    name: 'status',
                    label: 'Status',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: 'orders.orders_status',
                    compiledSql: 'orders.orders_status',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
            },
            metrics: {
                total_order_amount: {
                    fieldType: FieldType.METRIC,
                    type: MetricType.SUM,
                    name: 'total_order_amount',
                    label: 'Total order amount',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: 'orders.orders_total_order_amount',
                    compiledSql: 'SUM(orders.orders_total_order_amount)',
                    tablesReferences: ['orders'],
                    hidden: false,
                },
            },
        },
    },
};

const metricQuery: MetricQuery = {
    exploreName: '__preagg__orders__orders_rollup',
    dimensions: ['orders_status'],
    metrics: ['orders_total_order_amount'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

describe('PreAggregationExternalResolver', () => {
    const getResolver = ({
        enabled = true,
        explore = externalPreAggExplore,
    }: {
        enabled?: boolean;
        explore?: Explore;
    } = {}) => {
        const projectModel = {
            getExploreFromCache: vi.fn().mockResolvedValue(explore),
        };
        const resolver = new PreAggregationExternalResolver({
            lightdashConfig: {
                ...lightdashConfigMock,
                preAggregates: {
                    ...lightdashConfigMock.preAggregates,
                    enabled,
                },
            },
            projectModel: projectModel as unknown as ProjectModel,
        });
        return { resolver, projectModel };
    };

    const baseResolveArgs: ResolvePreAggregationDuckDbArgs = {
        projectUuid: 'projectUuid',
        metricQuery,
        timezone: 'UTC',
        dateZoom: undefined,
        parameters: undefined,
        preAggregationRoute: {
            sourceExploreName: 'orders',
            preAggregateName: 'orders_rollup',
            mode: 'opportunistic',
            externalTable: EXTERNAL_TABLE,
        },
        fieldsMap: {},
        pivotConfiguration: undefined,
        startOfWeek: undefined,
        userAccessControls: {
            userAttributes: {},
            intrinsicUserAttributes: {},
        },
        availableParameterDefinitions: {},
    };

    test('resolves project-dialect SQL with the external table in FROM and no client override', async () => {
        const { resolver, projectModel } = getResolver();

        const result = await resolver.resolve(baseResolveArgs);

        expect(result.resolved).toBe(true);
        if (!result.resolved) throw new Error('unreachable');
        expect(result.query).toContain(`FROM ${EXTERNAL_TABLE} AS "orders"`);
        expect(result.query).toContain('SUM(orders.orders_total_order_amount)');
        expect(result).not.toHaveProperty('warehouseClient');
        expect(projectModel.getExploreFromCache).toHaveBeenCalledWith(
            'projectUuid',
            '__preagg__orders__orders_rollup',
        );
    });

    test('recompiles SQL custom dimensions against materialized columns', async () => {
        const { resolver } = getResolver();

        const result = await resolver.resolve({
            ...baseResolveArgs,
            metricQuery: {
                ...metricQuery,
                dimensions: ['status_present'],
                customDimensions: [
                    {
                        id: 'status_present',
                        type: CustomDimensionType.SQL,
                        name: 'Status present',
                        table: 'orders',
                        sql: '${orders.status} IS NOT NULL',
                        dimensionType: DimensionType.BOOLEAN,
                    },
                ],
            },
        });

        expect(result.resolved).toBe(true);
        if (!result.resolved) throw new Error('unreachable');
        expect(result.query).toContain(
            '((orders.orders_status) IS NOT NULL) AS "status_present"',
        );
        expect(result.query).toContain(`FROM ${EXTERNAL_TABLE} AS "orders"`);
    });

    test('recompiles SQL custom dimension filters against materialized columns', async () => {
        const { resolver } = getResolver();

        const result = await resolver.resolve({
            ...baseResolveArgs,
            metricQuery: {
                ...metricQuery,
                dimensions: [],
                filters: {
                    dimensions: {
                        id: 'root',
                        and: [
                            {
                                id: 'custom-filter',
                                target: { fieldId: 'status_present' },
                                operator: FilterOperator.EQUALS,
                                values: [true],
                            },
                        ],
                    },
                },
                customDimensions: [
                    {
                        id: 'status_present',
                        type: CustomDimensionType.SQL,
                        name: 'Status present',
                        table: 'orders',
                        sql: '${orders.status} IS NOT NULL',
                        dimensionType: DimensionType.BOOLEAN,
                    },
                ],
            },
        });

        expect(result.resolved).toBe(true);
        if (!result.resolved) throw new Error('unreachable');
        expect(result.query).toContain('WHERE');
        expect(result.query).toContain('(orders.orders_status) IS NOT NULL');
    });

    test('returns unresolved when pre-aggregates are disabled', async () => {
        const { resolver, projectModel } = getResolver({ enabled: false });

        const result = await resolver.resolve(baseResolveArgs);

        expect(result).toEqual({
            resolved: false,
            reason: PreAggregationDuckDbResolveReason.PRE_AGGREGATES_DISABLED,
        });
        expect(projectModel.getExploreFromCache).not.toHaveBeenCalled();
    });

    test('returns unresolved when the cached explore has no external table', async () => {
        const { resolver } = getResolver({
            explore: {
                ...externalPreAggExplore,
                preAggregateSource: {
                    sourceExploreName: 'orders',
                    preAggregateName: 'orders_rollup',
                },
            },
        });

        const result = await resolver.resolve(baseResolveArgs);

        expect(result).toEqual({
            resolved: false,
            reason: PreAggregationDuckDbResolveReason.RESOLVE_ERROR,
        });
    });
});
