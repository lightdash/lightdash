import {
    DimensionType,
    FieldType,
    FilterOperator,
    getItemMap,
    MetricType,
    QuerySourceType,
    SupportedDbtAdapter,
    TimeFrames,
    UnitOfTime,
    type CompiledDimension,
    type CompiledMetric,
    type Explore,
    type ParametersValuesMap,
    type SemanticLayerSourceQuery,
} from '@lightdash/common';

export const STORY_PROJECT_UUID = 'story';

const source = {
    path: '',
    content: '',
    range: {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 0 },
    },
};

const dimension = (
    name: string,
    label: string,
    type: DimensionType,
    timeInterval?: TimeFrames,
): CompiledDimension => ({
    fieldType: FieldType.DIMENSION,
    type,
    name,
    label,
    table: 'orders',
    tableLabel: 'Orders',
    sql: `\${TABLE}.${name}`,
    compiledSql: `"orders".${name}`,
    tablesReferences: ['orders'],
    source,
    hidden: false,
    groups: [],
    timeInterval,
});

const metric = (
    name: string,
    label: string,
    type: MetricType,
): CompiledMetric => ({
    fieldType: FieldType.METRIC,
    type,
    name,
    label,
    table: 'orders',
    tableLabel: 'Orders',
    sql: `\${TABLE}.${name}`,
    compiledSql: `"orders".${name}`,
    tablesReferences: ['orders'],
    source,
    hidden: false,
    groups: [],
});

export const ordersExplore: Explore = {
    targetDatabase: SupportedDbtAdapter.POSTGRES,
    name: 'orders',
    label: 'Orders',
    tags: [],
    baseTable: 'orders',
    joinedTables: [],
    groupLabel: undefined,
    tables: {
        orders: {
            name: 'orders',
            label: 'Orders',
            database: 'postgres',
            schema: 'jaffle',
            sqlTable: 'jaffle.orders',
            sqlWhere: undefined,
            dimensions: {
                status: dimension('status', 'Status', DimensionType.STRING),
                is_completed: dimension(
                    'is_completed',
                    'Is completed',
                    DimensionType.BOOLEAN,
                ),
                order_date: dimension(
                    'order_date',
                    'Order date',
                    DimensionType.DATE,
                ),
                order_date_week: dimension(
                    'order_date_week',
                    'Order date week',
                    DimensionType.DATE,
                    TimeFrames.WEEK,
                ),
                amount: dimension('amount', 'Amount', DimensionType.NUMBER),
            },
            metrics: {
                unique_order_count: metric(
                    'unique_order_count',
                    'Unique order count',
                    MetricType.COUNT_DISTINCT,
                ),
                total_order_amount: metric(
                    'total_order_amount',
                    'Total order amount',
                    MetricType.SUM,
                ),
            },
            lineageGraph: {},
            groupLabel: undefined,
            source,
        },
    },
};

export const ordersFieldsMap = getItemMap(ordersExplore);

/** Filters, two sorts, a limit and a parameter: everything the summary shows. */
export const ordersSemanticNode: SemanticLayerSourceQuery = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'weekly_orders',
    title: 'Weekly completed orders',
    description: 'Completed orders per week and status, last 90 days.',
    exploreName: 'orders',
    dimensions: ['orders_order_date_week', 'orders_status'],
    metrics: ['orders_unique_order_count', 'orders_total_order_amount'],
    filters: {
        dimensions: {
            id: 'root',
            and: [
                {
                    id: 'completed',
                    target: { fieldId: 'orders_is_completed' },
                    operator: FilterOperator.EQUALS,
                    values: [true],
                },
                {
                    id: 'recent',
                    target: { fieldId: 'orders_order_date' },
                    operator: FilterOperator.IN_THE_PAST,
                    values: [90],
                    settings: { unitOfTime: UnitOfTime.days, completed: false },
                },
                {
                    id: 'status',
                    or: [
                        {
                            id: 'shipped',
                            target: { fieldId: 'orders_status' },
                            operator: FilterOperator.EQUALS,
                            values: ['shipped', 'completed'],
                        },
                        {
                            id: 'big',
                            target: { fieldId: 'orders_amount' },
                            operator: FilterOperator.GREATER_THAN,
                            values: [100],
                        },
                    ],
                },
            ],
        },
    },
    sorts: [
        { fieldId: 'orders_order_date_week', descending: true },
        { fieldId: 'orders_unique_order_count', descending: false },
    ],
    limit: 500,
    parameters: { currency: 'usd', region: ['EMEA', 'APAC'] },
};

export const ordersParameters: ParametersValuesMap =
    ordersSemanticNode.parameters ?? {};
