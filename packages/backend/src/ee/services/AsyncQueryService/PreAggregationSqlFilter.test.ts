// Serving a model whose sql_filter references a joined table's field: the
// filter must target the materialized column, not the source join alias.
import {
    DEFAULT_SPOTLIGHT_CONFIG,
    DimensionType,
    ExploreCompiler,
    FieldType,
    MetricType,
    SupportedDbtAdapter,
    type MetricQuery,
    type UncompiledExplore,
} from '@lightdash/common';
import { warehouseSqlBuilderFromType } from '@lightdash/warehouses';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { type ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { QueryComposer } from '../../../utils/QueryBuilder/QueryComposer';
import { buildPreAggregateExplore } from '../../preAggregates/buildPreAggregateExplore';
import { type ResolvePreAggregationDuckDbArgs } from './PreAggregationDuckDbClient';
import { PreAggregationExternalResolver } from './PreAggregationExternalResolver';

const EXTERNAL_TABLE = '`analytics`.`orders_rollup_mv`';

const uncompiledSourceExplore = (sqlWhere: string): UncompiledExplore => ({
    name: 'orders',
    label: 'Orders',
    tags: [],
    baseTable: 'orders',
    targetDatabase: SupportedDbtAdapter.BIGQUERY,
    groupLabel: undefined,
    warehouse: undefined,
    sqlPath: undefined,
    ymlPath: undefined,
    databricksCompute: undefined,
    spotlightConfig: DEFAULT_SPOTLIGHT_CONFIG,
    meta: {},
    joinedTables: [
        {
            table: 'customers',
            sqlOn: '${orders.customer_id} = ${customers.id}',
        },
    ],
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            database: 'db',
            schema: 'jaffle',
            sqlTable: '`db`.`jaffle`.`orders`',
            sqlWhere,
            lineageGraph: {},
            dimensions: {
                customer_id: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.NUMBER,
                    name: 'customer_id',
                    label: 'Customer id',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: '${TABLE}.customer_id',
                    hidden: false,
                },
                status: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    name: 'status',
                    label: 'Status',
                    table: 'orders',
                    tableLabel: 'Orders',
                    sql: '${TABLE}.status',
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
                    sql: '${TABLE}.amount',
                    hidden: false,
                },
            },
        },
        customers: {
            name: 'customers',
            label: 'Customers',
            database: 'db',
            schema: 'jaffle',
            sqlTable: '`db`.`jaffle`.`customers`',
            lineageGraph: {},
            dimensions: {
                id: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.NUMBER,
                    name: 'id',
                    label: 'Id',
                    table: 'customers',
                    tableLabel: 'Customers',
                    sql: '${TABLE}.id',
                    hidden: false,
                },
                segment: {
                    fieldType: FieldType.DIMENSION,
                    type: DimensionType.STRING,
                    name: 'segment',
                    label: 'Segment',
                    table: 'customers',
                    tableLabel: 'Customers',
                    sql: '${TABLE}.segment',
                    hidden: false,
                },
            },
            metrics: {},
        },
    },
});

const metricQuery: MetricQuery = {
    exploreName: '__preagg__orders__orders_rollup',
    dimensions: ['orders_status'],
    metrics: ['orders_total_order_amount'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
};

const resolveWithSqlFilter = async (sqlWhere: string) => {
    const compiler = new ExploreCompiler(
        warehouseSqlBuilderFromType(SupportedDbtAdapter.BIGQUERY),
    );
    const sourceExplore = compiler.compileExplore(
        uncompiledSourceExplore(sqlWhere),
    );

    const preAggExplore = buildPreAggregateExplore(
        sourceExplore,
        {
            name: 'orders_rollup',
            dimensions: ['status', 'customers.segment'],
            metrics: ['total_order_amount'],
            table: EXTERNAL_TABLE,
        },
        null,
    );

    const projectModel = {
        getExploreFromCache: vi.fn().mockResolvedValue(preAggExplore),
    };
    const resolver = new PreAggregationExternalResolver({
        lightdashConfig: {
            ...lightdashConfigMock,
            preAggregates: {
                ...lightdashConfigMock.preAggregates,
                enabled: true,
            },
        },
        projectModel: projectModel as unknown as ProjectModel,
    });

    const args: ResolvePreAggregationDuckDbArgs = {
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
            userAttributes: { segment: ['gold'] },
            intrinsicUserAttributes: {},
        },
        availableParameterDefinitions: {},
    };

    return resolver.resolve(args);
};

describe('external pre-aggregate + sql_filter referencing a joined field', () => {
    test('serves with a user-attribute filter on the materialized column', async () => {
        const result = await resolveWithSqlFilter(
            '${customers.segment} = ${lightdash.attributes.segment}',
        );

        expect(result.resolved).toBe(true);
        if (!result.resolved) throw new Error('unreachable');

        expect(result.query).toContain(`FROM ${EXTERNAL_TABLE} AS \`orders\``);
        expect(result.query).toContain('orders.customers_segment');
        expect(result.query).toContain("'gold'");
        expect(result.query).not.toContain('JOIN');
        expect(result.query).not.toMatch(/`customers`\./);
    });

    test('serves with a static joined-field filter on the materialized column', async () => {
        const result = await resolveWithSqlFilter(
            "${customers.segment} = 'gold'",
        );

        expect(result.resolved).toBe(true);
        if (!result.resolved) throw new Error('unreachable');

        expect(result.query).toContain(`FROM ${EXTERNAL_TABLE} AS \`orders\``);
        expect(result.query).toContain("orders.customers_segment = 'gold'");
        expect(result.query).not.toContain('JOIN');
        expect(result.query).not.toMatch(/`customers`\./);
    });
});

describe('managed pre-aggregate + sql_filter referencing a joined field', () => {
    test('serves from the materialization with the user-attribute filter', () => {
        const compiler = new ExploreCompiler(
            warehouseSqlBuilderFromType(SupportedDbtAdapter.BIGQUERY),
        );
        const sourceExplore = compiler.compileExplore(
            uncompiledSourceExplore(
                '${customers.segment} = ${lightdash.attributes.segment}',
            ),
        );

        const preAggExplore = buildPreAggregateExplore(
            sourceExplore,
            {
                name: 'orders_rollup',
                dimensions: ['status', 'customers.segment'],
                metrics: ['total_order_amount'],
            },
            null,
        );

        // Same sqlTable patch PreAggregationDuckDbClient applies before serving
        const materializationSqlTable =
            "read_json_auto('s3://bucket/materialization.jsonl')";
        const patchedExplore = {
            ...preAggExplore,
            tables: Object.fromEntries(
                Object.entries(preAggExplore.tables).map(([name, table]) => [
                    name,
                    { ...table, sqlTable: materializationSqlTable },
                ]),
            ),
        };

        const composer = new QueryComposer(
            {
                metricQuery,
                pivotConfiguration: undefined,
            },
            {
                explore: patchedExplore,
                warehouseSqlBuilder: warehouseSqlBuilderFromType(
                    SupportedDbtAdapter.DUCKDB,
                ),
                intrinsicUserAttributes: {},
                userAttributes: { segment: ['gold'] },
                timezone: 'UTC',
                availableParameterDefinitions: {},
                parameters: undefined,
                dateZoom: undefined,
                pivotDimensions: undefined,
                pivotItemsMap: {},
                continueOnError: undefined,
                useTimezoneAwareDateTrunc: undefined,
                columnTimezone: undefined,
                applyDateZoomToFilters: undefined,
            },
        );

        const sql = composer.getSql({ columnLimit: 100 });

        expect(sql).toContain(`FROM ${materializationSqlTable} AS "orders"`);
        expect(sql).toContain("orders.customers_segment = 'gold'");
        expect(sql).not.toContain('JOIN');
        expect(sql).not.toMatch(/"customers"\./);
    });
});
