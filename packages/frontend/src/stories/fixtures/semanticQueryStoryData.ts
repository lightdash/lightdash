import {
    DimensionType,
    FieldType,
    FilterOperator,
    friendlyName,
    getItemMap,
    MergeJoinType,
    MetricType,
    QuerySourceType,
    SupportedDbtAdapter,
    TimeFrames,
    UnitOfTime,
    type CompiledDimension,
    type CompiledMetric,
    type Explore,
    type MergeSourceQuery,
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
    table = 'orders',
): CompiledDimension => ({
    fieldType: FieldType.DIMENSION,
    type,
    name,
    label,
    table,
    tableLabel: friendlyName(table),
    sql: `\${TABLE}.${name}`,
    compiledSql: `"${table}".${name}`,
    tablesReferences: [table],
    source,
    hidden: false,
    groups: [],
    timeInterval,
});

const metric = (
    name: string,
    label: string,
    type: MetricType,
    table = 'orders',
): CompiledMetric => ({
    fieldType: FieldType.METRIC,
    type,
    name,
    label,
    table,
    tableLabel: friendlyName(table),
    sql: `\${TABLE}.${name}`,
    compiledSql: `"${table}".${name}`,
    tablesReferences: [table],
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

export const sessionsExplore: Explore = {
    ...ordersExplore,
    name: 'web_sessions',
    label: 'Web sessions',
    baseTable: 'web_sessions',
    tables: {
        web_sessions: {
            ...ordersExplore.tables.orders,
            name: 'web_sessions',
            label: 'Web sessions',
            sqlTable: 'jaffle.web_sessions',
            dimensions: {
                session_week: dimension(
                    'session_week',
                    'Session week',
                    DimensionType.DATE,
                    TimeFrames.WEEK,
                    'web_sessions',
                ),
            },
            metrics: {
                session_count: metric(
                    'session_count',
                    'Sessions',
                    MetricType.COUNT,
                    'web_sessions',
                ),
            },
        },
    },
};

/** Weekly revenue by status, with each week's sessions repeated on every status. */
export const mergeStoryQueries: [
    SemanticLayerSourceQuery,
    SemanticLayerSourceQuery,
    MergeSourceQuery,
] = [
    {
        sourceType: QuerySourceType.SEMANTIC_LAYER,
        nodeId: 'weekly_revenue',
        title: 'Weekly revenue by status',
        exploreName: 'orders',
        dimensions: ['orders_order_date_week', 'orders_status'],
        metrics: ['orders_total_order_amount'],
        filters: {},
        sorts: [],
        limit: 500,
    },
    {
        sourceType: QuerySourceType.SEMANTIC_LAYER,
        nodeId: 'weekly_sessions',
        title: 'Weekly web sessions',
        exploreName: 'web_sessions',
        dimensions: ['web_sessions_session_week'],
        metrics: ['web_sessions_session_count'],
        filters: {},
        sorts: [],
        limit: 500,
    },
    {
        sourceType: QuerySourceType.MERGE,
        nodeId: 'revenue_per_session',
        title: 'Revenue per session',
        description: 'Weekly revenue by status beside that week’s sessions.',
        sources: [
            { nodeId: 'weekly_revenue' },
            { nodeId: 'weekly_sessions', repeatValues: true },
        ],
        joinKey: [
            {
                name: 'week',
                fieldIdBySourceId: {
                    weekly_revenue: 'orders_order_date_week',
                    weekly_sessions: 'web_sessions_session_week',
                },
            },
        ],
        joinType: MergeJoinType.LEFT,
        tableCalculations: [
            {
                name: 'revenue_per_session',
                displayName: 'Revenue per session',
                sql: '',
                formula:
                    '=weekly_revenue_orders_total_order_amount / weekly_sessions_web_sessions_session_count',
            },
        ],
        sorts: [{ fieldId: 'merge_week', descending: true }],
        limit: 500,
    },
];
