import {
    CartesianSeriesType,
    ChartType,
    ConditionalFormattingColorApplyTo,
    DashboardTileTypes,
    FilterOperator,
    generateSlug,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
    type ConditionalFormattingConfig,
    type ConditionalFormattingWithFilterOperator,
    type CreateDashboardChartTile,
    type CreateSavedChart,
} from '@lightdash/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { lightdashConfig } from '../../../config/lightdashConfig';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { SavedChartModel } from '../../../models/SavedChartModel';
import { SpaceModel } from '../../../models/SpaceModel';

type ChartUuids = Record<string, string>;

type SeedChartSpec = Omit<CreateSavedChart, 'spaceUuid' | 'dashboardUuid'> & {
    key: string;
};

type SeedModels = {
    dashboardModel: DashboardModel;
    savedChartModel: SavedChartModel;
    spaceModel: SpaceModel;
};

type RangeValue = number | 'auto';

const DASHBOARD_NAME = 'Conditional Formatting Coverage';
const DASHBOARD_SLUG = generateSlug(DASHBOARD_NAME);
const HARDCODED_DASHBOARD_UUID = '0859089e-7c1c-4fd2-b44a-29f4a0c7f4e8';
const CHART_NAME_PREFIX = '[CF Coverage]';
const TARGET_SPACE_NAME = '[Test app features]';

const ORDERS_FIELDS = {
    orderDateMonth: 'orders_order_date_month',
    shippingMethod: 'orders_shipping_method',
    shippingCostTier: 'orders_shipping_cost_tier',
    status: 'orders_status',
    promoCode: 'orders_promo_code',
    totalOrderAmount: 'orders_total_order_amount',
    totalCompletedOrderAmount: 'orders_total_completed_order_amount',
    uniqueOrderCount: 'orders_unique_order_count',
} as const;

const TABLE_CALCULATIONS = {
    avgOrderValuePerOrder: 'avg_order_value_per_order',
    completionGap: 'completion_gap',
    completionRate: 'completion_rate',
} as const;

const ORDERS_SQL_FIELDS = {
    totalOrderAmount: 'orders.total_order_amount',
    totalCompletedOrderAmount: 'orders.total_completed_order_amount',
    uniqueOrderCount: 'orders.unique_order_count',
} as const;

const markdownContent = `# ${DASHBOARD_NAME}

This dashboard is a development seed for manual QA across the conditional formatting runtime surface.

- Tables: stacked cell + text colors, string operators, null operators, ranges, compare-target, compare-target-to-values, and table calculation targets
- Pivots: the same rule set with metrics as rows both on and off, plus multi-dimension pivot context
- Cartesian charts: single-color conditional formatting on supported single-bar-series charts, including compare-target and last-match precedence
- Big numbers: single-color text rendering for metric and table calculation targets

Notes:

- Table and pivot tiles exercise both \`CELL\` and \`TEXT\` apply targets, including stacked rules on the same field
- Cartesian tiles intentionally use only single-color rules on single unstacked bar series because that is the supported chart path today
- Big number tiles intentionally use single-color rules because big number conditional formatting renders text color only today`;

const updatedByUser = {
    userUuid: SEED_ORG_1_ADMIN.user_uuid,
    firstName: SEED_ORG_1_ADMIN.first_name,
    lastName: SEED_ORG_1_ADMIN.last_name,
};

const createValueRule = (
    operator: FilterOperator,
    values: Array<number | string> = [],
): ConditionalFormattingWithFilterOperator => ({
    id: uuidv4(),
    operator,
    values,
});

const createCompareTargetRule = (
    operator: FilterOperator,
    compareFieldId: string,
    values?: Array<number | string>,
): ConditionalFormattingWithFilterOperator => ({
    id: uuidv4(),
    operator,
    compareTarget: { fieldId: compareFieldId },
    ...(values !== undefined ? { values } : {}),
});

const createSingleColorConfig = ({
    targetFieldId,
    color,
    rules,
    applyTo,
    darkColor,
}: {
    targetFieldId: string;
    color: string;
    rules: ConditionalFormattingWithFilterOperator[];
    applyTo?: ConditionalFormattingColorApplyTo;
    darkColor?: string;
}): ConditionalFormattingConfig => ({
    target: { fieldId: targetFieldId },
    color,
    ...(darkColor ? { darkColor } : {}),
    rules,
    ...(applyTo !== undefined ? { applyTo } : {}),
});

const createRangeConfig = ({
    targetFieldId,
    start,
    end,
    min,
    max,
    applyTo,
}: {
    targetFieldId: string;
    start: string;
    end: string;
    min: RangeValue;
    max: RangeValue;
    applyTo?: ConditionalFormattingColorApplyTo;
}): ConditionalFormattingConfig => ({
    target: { fieldId: targetFieldId },
    color: {
        start,
        end,
    },
    rule: {
        min,
        max,
    },
    ...(applyTo !== undefined ? { applyTo } : {}),
});

const createTableChartConfig = (
    conditionalFormattings: ConditionalFormattingConfig[],
    metricsAsRows = false,
) => ({
    type: ChartType.TABLE as const,
    config: {
        showTableNames: false,
        showResultsTotal: false,
        showColumnCalculation: false,
        showRowCalculation: false,
        hideRowNumbers: false,
        showSubtotals: false,
        metricsAsRows,
        conditionalFormattings,
        columns: {},
    },
});

const createSavedChartTile = ({
    savedChartUuid,
    x,
    y,
    w,
    h,
}: {
    savedChartUuid: string;
    x: number;
    y: number;
    w: number;
    h: number;
}): CreateDashboardChartTile => ({
    uuid: uuidv4(),
    x,
    y,
    w,
    h,
    type: DashboardTileTypes.SAVED_CHART,
    tabUuid: undefined,
    properties: {
        savedChartUuid,
    },
});

const getOrCreateTargetSpaceUuid = async (
    knex: Knex,
    spaceModel: SpaceModel,
): Promise<string> => {
    const existingSpace = await knex('spaces')
        .join('projects', 'spaces.project_id', 'projects.project_id')
        .where('spaces.name', TARGET_SPACE_NAME)
        .where('projects.project_uuid', SEED_PROJECT.project_uuid)
        .whereNull('spaces.parent_space_uuid')
        .whereNull('spaces.deleted_at')
        .first('spaces.space_uuid');

    if (existingSpace?.space_uuid) {
        return existingSpace.space_uuid;
    }

    const [user] = await knex('users').where(
        'user_uuid',
        SEED_ORG_1_ADMIN.user_uuid,
    );

    if (!user) {
        throw new Error(`User ${SEED_ORG_1_ADMIN.user_uuid} not found`);
    }

    const space = await spaceModel.createSpace(
        {
            name: TARGET_SPACE_NAME,
            inheritParentPermissions: true,
            parentSpaceUuid: null,
        },
        {
            projectUuid: SEED_PROJECT.project_uuid,
            userId: user.user_id,
        },
    );

    return space.uuid;
};

const createSeedModels = (knex: Knex): SeedModels => ({
    dashboardModel: new DashboardModel({
        database: knex,
    }),
    savedChartModel: new SavedChartModel({
        database: knex,
        lightdashConfig,
    }),
    spaceModel: new SpaceModel({
        database: knex,
    }),
});

const chartSpecs: SeedChartSpec[] = [
    {
        key: 'tableStackedCellAndText',
        name: '[CF Coverage] Table: stacked cell + text',
        description:
            'Regular table coverage for stacked cell and text colors, compare-target rules, and auto ranges.',
        tableName: 'orders',
        metricQuery: {
            exploreName: 'orders',
            dimensions: [
                ORDERS_FIELDS.shippingMethod,
                ORDERS_FIELDS.orderDateMonth,
            ],
            metrics: [
                ORDERS_FIELDS.totalOrderAmount,
                ORDERS_FIELDS.totalCompletedOrderAmount,
            ],
            filters: {},
            sorts: [
                {
                    fieldId: ORDERS_FIELDS.orderDateMonth,
                    descending: true,
                },
            ],
            limit: 500,
            tableCalculations: [],
        },
        chartConfig: createTableChartConfig([
            createSingleColorConfig({
                targetFieldId: ORDERS_FIELDS.totalCompletedOrderAmount,
                color: '#93c5fd',
                applyTo: ConditionalFormattingColorApplyTo.CELL,
                rules: [
                    createCompareTargetRule(
                        FilterOperator.LESS_THAN,
                        ORDERS_FIELDS.totalOrderAmount,
                    ),
                    createValueRule(FilterOperator.NOT_NULL),
                ],
            }),
            createSingleColorConfig({
                targetFieldId: ORDERS_FIELDS.totalCompletedOrderAmount,
                color: '#1d4ed8',
                applyTo: ConditionalFormattingColorApplyTo.TEXT,
                rules: [
                    createCompareTargetRule(
                        FilterOperator.LESS_THAN,
                        ORDERS_FIELDS.totalOrderAmount,
                    ),
                    createValueRule(FilterOperator.NOT_NULL),
                ],
            }),
            createRangeConfig({
                targetFieldId: ORDERS_FIELDS.totalOrderAmount,
                start: '#fff7ed',
                end: '#f97316',
                min: 'auto',
                max: 'auto',
                applyTo: ConditionalFormattingColorApplyTo.CELL,
            }),
        ]),
        tableConfig: {
            columnOrder: [
                ORDERS_FIELDS.shippingMethod,
                ORDERS_FIELDS.orderDateMonth,
                ORDERS_FIELDS.totalOrderAmount,
                ORDERS_FIELDS.totalCompletedOrderAmount,
            ],
        },
        pivotConfig: undefined,
        parameters: undefined,
    },
    {
        key: 'tableOperatorsAndRanges',
        name: '[CF Coverage] Table: operators + ranges',
        description:
            'Regular table coverage for equals, notEquals, include, inBetween, notInBetween, and table calculation targets.',
        tableName: 'orders',
        metricQuery: {
            exploreName: 'orders',
            dimensions: [ORDERS_FIELDS.status, ORDERS_FIELDS.shippingMethod],
            metrics: [
                ORDERS_FIELDS.uniqueOrderCount,
                ORDERS_FIELDS.totalOrderAmount,
            ],
            filters: {},
            sorts: [
                {
                    fieldId: ORDERS_FIELDS.totalOrderAmount,
                    descending: true,
                },
            ],
            limit: 500,
            tableCalculations: [
                {
                    name: TABLE_CALCULATIONS.avgOrderValuePerOrder,
                    displayName: 'Average order value per order',
                    sql: `\${${ORDERS_SQL_FIELDS.totalOrderAmount}} / NULLIF(\${${ORDERS_SQL_FIELDS.uniqueOrderCount}}, 0)`,
                },
            ],
        },
        chartConfig: createTableChartConfig([
            createSingleColorConfig({
                targetFieldId: ORDERS_FIELDS.status,
                color: '#16a34a',
                applyTo: ConditionalFormattingColorApplyTo.TEXT,
                rules: [createValueRule(FilterOperator.EQUALS, ['completed'])],
            }),
            createSingleColorConfig({
                targetFieldId: ORDERS_FIELDS.status,
                color: '#dc2626',
                applyTo: ConditionalFormattingColorApplyTo.TEXT,
                rules: [
                    createValueRule(FilterOperator.NOT_EQUALS, ['completed']),
                ],
            }),
            createSingleColorConfig({
                targetFieldId: ORDERS_FIELDS.shippingMethod,
                color: '#7c3aed',
                applyTo: ConditionalFormattingColorApplyTo.TEXT,
                rules: [createValueRule(FilterOperator.INCLUDE, ['exp'])],
            }),
            createSingleColorConfig({
                targetFieldId: ORDERS_FIELDS.uniqueOrderCount,
                color: '#fbbf24',
                applyTo: ConditionalFormattingColorApplyTo.CELL,
                rules: [createValueRule(FilterOperator.IN_BETWEEN, [50, 400])],
            }),
            createSingleColorConfig({
                targetFieldId: ORDERS_FIELDS.uniqueOrderCount,
                color: '#92400e',
                applyTo: ConditionalFormattingColorApplyTo.TEXT,
                rules: [
                    createValueRule(FilterOperator.NOT_IN_BETWEEN, [50, 400]),
                ],
            }),
            createSingleColorConfig({
                targetFieldId: TABLE_CALCULATIONS.avgOrderValuePerOrder,
                color: '#14b8a6',
                applyTo: ConditionalFormattingColorApplyTo.CELL,
                rules: [
                    createValueRule(
                        FilterOperator.GREATER_THAN_OR_EQUAL,
                        [100],
                    ),
                ],
            }),
        ]),
        tableConfig: {
            columnOrder: [
                ORDERS_FIELDS.status,
                ORDERS_FIELDS.shippingMethod,
                ORDERS_FIELDS.uniqueOrderCount,
                ORDERS_FIELDS.totalOrderAmount,
                TABLE_CALCULATIONS.avgOrderValuePerOrder,
            ],
        },
        pivotConfig: undefined,
        parameters: undefined,
    },
    {
        key: 'tableNullsAndTableCalcs',
        name: '[CF Coverage] Table: nulls + table calcs',
        description:
            'Regular table coverage for null/notNull operators, table calculation targets, and lessThanOrEqual/greaterThan rules.',
        tableName: 'orders',
        metricQuery: {
            exploreName: 'orders',
            dimensions: [ORDERS_FIELDS.promoCode],
            metrics: [
                ORDERS_FIELDS.uniqueOrderCount,
                ORDERS_FIELDS.totalOrderAmount,
            ],
            filters: {},
            sorts: [
                {
                    fieldId: ORDERS_FIELDS.totalOrderAmount,
                    descending: true,
                },
            ],
            limit: 500,
            tableCalculations: [
                {
                    name: TABLE_CALCULATIONS.completionGap,
                    displayName: 'Completion gap',
                    sql: `\${${ORDERS_SQL_FIELDS.totalOrderAmount}} - \${${ORDERS_SQL_FIELDS.totalCompletedOrderAmount}}`,
                },
            ],
        },
        chartConfig: createTableChartConfig([
            createSingleColorConfig({
                targetFieldId: ORDERS_FIELDS.promoCode,
                color: '#6b7280',
                applyTo: ConditionalFormattingColorApplyTo.TEXT,
                rules: [createValueRule(FilterOperator.NULL)],
            }),
            createSingleColorConfig({
                targetFieldId: ORDERS_FIELDS.promoCode,
                color: '#059669',
                applyTo: ConditionalFormattingColorApplyTo.TEXT,
                rules: [createValueRule(FilterOperator.NOT_NULL)],
            }),
            createSingleColorConfig({
                targetFieldId: TABLE_CALCULATIONS.completionGap,
                color: '#fecaca',
                applyTo: ConditionalFormattingColorApplyTo.CELL,
                rules: [
                    createValueRule(FilterOperator.LESS_THAN_OR_EQUAL, [0]),
                ],
            }),
            createSingleColorConfig({
                targetFieldId: TABLE_CALCULATIONS.completionGap,
                color: '#991b1b',
                applyTo: ConditionalFormattingColorApplyTo.TEXT,
                rules: [createValueRule(FilterOperator.GREATER_THAN, [0])],
            }),
        ]),
        tableConfig: {
            columnOrder: [
                ORDERS_FIELDS.promoCode,
                ORDERS_FIELDS.uniqueOrderCount,
                ORDERS_FIELDS.totalOrderAmount,
                TABLE_CALCULATIONS.completionGap,
            ],
        },
        pivotConfig: undefined,
        parameters: undefined,
    },
    {
        key: 'tableCompareTargetToValues',
        name: '[CF Coverage] Table: compare target to values',
        description:
            'Regular table coverage for compare-target-to-values rules using the supporting metric as the condition source.',
        tableName: 'orders',
        metricQuery: {
            exploreName: 'orders',
            dimensions: [
                ORDERS_FIELDS.shippingMethod,
                ORDERS_FIELDS.orderDateMonth,
            ],
            metrics: [
                ORDERS_FIELDS.totalOrderAmount,
                ORDERS_FIELDS.totalCompletedOrderAmount,
            ],
            filters: {},
            sorts: [
                {
                    fieldId: ORDERS_FIELDS.orderDateMonth,
                    descending: true,
                },
            ],
            limit: 500,
            tableCalculations: [],
        },
        chartConfig: createTableChartConfig([
            createSingleColorConfig({
                targetFieldId: ORDERS_FIELDS.totalCompletedOrderAmount,
                color: '#fed7aa',
                applyTo: ConditionalFormattingColorApplyTo.CELL,
                rules: [
                    createCompareTargetRule(
                        FilterOperator.LESS_THAN_OR_EQUAL,
                        ORDERS_FIELDS.totalOrderAmount,
                        [30000],
                    ),
                ],
            }),
            createSingleColorConfig({
                targetFieldId: ORDERS_FIELDS.totalCompletedOrderAmount,
                color: '#9a3412',
                applyTo: ConditionalFormattingColorApplyTo.TEXT,
                rules: [
                    createCompareTargetRule(
                        FilterOperator.GREATER_THAN,
                        ORDERS_FIELDS.totalOrderAmount,
                        [30000],
                    ),
                ],
            }),
        ]),
        tableConfig: {
            columnOrder: [
                ORDERS_FIELDS.shippingMethod,
                ORDERS_FIELDS.orderDateMonth,
                ORDERS_FIELDS.totalOrderAmount,
                ORDERS_FIELDS.totalCompletedOrderAmount,
            ],
        },
        pivotConfig: undefined,
        parameters: undefined,
    },
    {
        key: 'pivotColumnsStacked',
        name: '[CF Coverage] Pivot: columns stacked cell + text',
        description:
            'Pivot coverage with metricsAsRows off, stacked cell and text colors, and compare-target rules.',
        tableName: 'orders',
        metricQuery: {
            exploreName: 'orders',
            dimensions: [
                ORDERS_FIELDS.shippingMethod,
                ORDERS_FIELDS.orderDateMonth,
            ],
            metrics: [
                ORDERS_FIELDS.totalOrderAmount,
                ORDERS_FIELDS.totalCompletedOrderAmount,
            ],
            filters: {},
            sorts: [
                {
                    fieldId: ORDERS_FIELDS.orderDateMonth,
                    descending: true,
                },
            ],
            limit: 500,
            tableCalculations: [],
        },
        chartConfig: createTableChartConfig(
            [
                createSingleColorConfig({
                    targetFieldId: ORDERS_FIELDS.totalCompletedOrderAmount,
                    color: '#bfdbfe',
                    applyTo: ConditionalFormattingColorApplyTo.CELL,
                    rules: [
                        createCompareTargetRule(
                            FilterOperator.LESS_THAN,
                            ORDERS_FIELDS.totalOrderAmount,
                        ),
                        createValueRule(FilterOperator.NOT_NULL),
                    ],
                }),
                createSingleColorConfig({
                    targetFieldId: ORDERS_FIELDS.totalCompletedOrderAmount,
                    color: '#1e3a8a',
                    applyTo: ConditionalFormattingColorApplyTo.TEXT,
                    rules: [
                        createCompareTargetRule(
                            FilterOperator.LESS_THAN,
                            ORDERS_FIELDS.totalOrderAmount,
                        ),
                        createValueRule(FilterOperator.NOT_NULL),
                    ],
                }),
            ],
            false,
        ),
        tableConfig: {
            columnOrder: [
                ORDERS_FIELDS.shippingMethod,
                ORDERS_FIELDS.orderDateMonth,
                ORDERS_FIELDS.totalOrderAmount,
                ORDERS_FIELDS.totalCompletedOrderAmount,
            ],
        },
        pivotConfig: {
            columns: [ORDERS_FIELDS.orderDateMonth],
        },
        parameters: undefined,
    },
    {
        key: 'pivotMetricsAsRowsStacked',
        name: '[CF Coverage] Pivot: metrics as rows stacked cell + text',
        description:
            'Pivot coverage with metricsAsRows on, stacked cell and text colors, and compare-target rules.',
        tableName: 'orders',
        metricQuery: {
            exploreName: 'orders',
            dimensions: [
                ORDERS_FIELDS.shippingMethod,
                ORDERS_FIELDS.orderDateMonth,
            ],
            metrics: [
                ORDERS_FIELDS.totalOrderAmount,
                ORDERS_FIELDS.totalCompletedOrderAmount,
            ],
            filters: {},
            sorts: [
                {
                    fieldId: ORDERS_FIELDS.orderDateMonth,
                    descending: true,
                },
            ],
            limit: 500,
            tableCalculations: [],
        },
        chartConfig: createTableChartConfig(
            [
                createSingleColorConfig({
                    targetFieldId: ORDERS_FIELDS.totalCompletedOrderAmount,
                    color: '#dbeafe',
                    applyTo: ConditionalFormattingColorApplyTo.CELL,
                    rules: [
                        createCompareTargetRule(
                            FilterOperator.LESS_THAN,
                            ORDERS_FIELDS.totalOrderAmount,
                        ),
                        createValueRule(FilterOperator.NOT_NULL),
                    ],
                }),
                createSingleColorConfig({
                    targetFieldId: ORDERS_FIELDS.totalCompletedOrderAmount,
                    color: '#1d4ed8',
                    applyTo: ConditionalFormattingColorApplyTo.TEXT,
                    rules: [
                        createCompareTargetRule(
                            FilterOperator.LESS_THAN,
                            ORDERS_FIELDS.totalOrderAmount,
                        ),
                        createValueRule(FilterOperator.NOT_NULL),
                    ],
                }),
            ],
            true,
        ),
        tableConfig: {
            columnOrder: [
                ORDERS_FIELDS.shippingMethod,
                ORDERS_FIELDS.orderDateMonth,
                ORDERS_FIELDS.totalOrderAmount,
                ORDERS_FIELDS.totalCompletedOrderAmount,
            ],
        },
        pivotConfig: {
            columns: [ORDERS_FIELDS.orderDateMonth],
        },
        parameters: undefined,
    },
    {
        key: 'pivotMultiDimensionRanges',
        name: '[CF Coverage] Pivot: ranges + multi-dimension context',
        description:
            'Pivot coverage for stacked range and text rules across multi-dimension pivot context.',
        tableName: 'orders',
        metricQuery: {
            exploreName: 'orders',
            dimensions: [
                ORDERS_FIELDS.shippingMethod,
                ORDERS_FIELDS.shippingCostTier,
                ORDERS_FIELDS.orderDateMonth,
            ],
            metrics: [
                ORDERS_FIELDS.totalOrderAmount,
                ORDERS_FIELDS.uniqueOrderCount,
            ],
            filters: {},
            sorts: [
                {
                    fieldId: ORDERS_FIELDS.orderDateMonth,
                    descending: true,
                },
            ],
            limit: 500,
            tableCalculations: [],
        },
        chartConfig: createTableChartConfig(
            [
                createRangeConfig({
                    targetFieldId: ORDERS_FIELDS.totalOrderAmount,
                    start: '#eff6ff',
                    end: '#1d4ed8',
                    min: 'auto',
                    max: 'auto',
                    applyTo: ConditionalFormattingColorApplyTo.CELL,
                }),
                createSingleColorConfig({
                    targetFieldId: ORDERS_FIELDS.totalOrderAmount,
                    color: '#1e40af',
                    applyTo: ConditionalFormattingColorApplyTo.TEXT,
                    rules: [
                        createValueRule(
                            FilterOperator.GREATER_THAN_OR_EQUAL,
                            [30000],
                        ),
                    ],
                }),
                createRangeConfig({
                    targetFieldId: ORDERS_FIELDS.uniqueOrderCount,
                    start: '#ecfccb',
                    end: '#65a30d',
                    min: 'auto',
                    max: 'auto',
                    applyTo: ConditionalFormattingColorApplyTo.TEXT,
                }),
                createSingleColorConfig({
                    targetFieldId: ORDERS_FIELDS.shippingMethod,
                    color: '#7c3aed',
                    applyTo: ConditionalFormattingColorApplyTo.TEXT,
                    rules: [createValueRule(FilterOperator.INCLUDE, ['exp'])],
                }),
            ],
            true,
        ),
        tableConfig: {
            columnOrder: [
                ORDERS_FIELDS.shippingMethod,
                ORDERS_FIELDS.shippingCostTier,
                ORDERS_FIELDS.orderDateMonth,
                ORDERS_FIELDS.totalOrderAmount,
                ORDERS_FIELDS.uniqueOrderCount,
            ],
        },
        pivotConfig: {
            columns: [
                ORDERS_FIELDS.orderDateMonth,
                ORDERS_FIELDS.shippingCostTier,
            ],
        },
        parameters: undefined,
    },
    {
        key: 'cartesianCompareTargetBar',
        name: '[CF Coverage] Cartesian: compare target bar',
        description:
            'Cartesian coverage for compare-target rules and last-match precedence on the supported single-bar-series path.',
        tableName: 'orders',
        metricQuery: {
            exploreName: 'orders',
            dimensions: [ORDERS_FIELDS.orderDateMonth],
            metrics: [
                ORDERS_FIELDS.totalCompletedOrderAmount,
                ORDERS_FIELDS.totalOrderAmount,
            ],
            filters: {},
            sorts: [
                {
                    fieldId: ORDERS_FIELDS.orderDateMonth,
                    descending: false,
                },
            ],
            limit: 500,
            tableCalculations: [],
        },
        chartConfig: {
            type: ChartType.CARTESIAN,
            config: {
                layout: {
                    xField: ORDERS_FIELDS.orderDateMonth,
                    yField: [ORDERS_FIELDS.totalCompletedOrderAmount],
                },
                eChartsConfig: {
                    series: [
                        {
                            type: CartesianSeriesType.BAR,
                            encode: {
                                xRef: { field: ORDERS_FIELDS.orderDateMonth },
                                yRef: {
                                    field: ORDERS_FIELDS.totalCompletedOrderAmount,
                                },
                            },
                            yAxisIndex: 0,
                        },
                    ],
                    showAxisTicks: false,
                },
                conditionalFormattings: [
                    createSingleColorConfig({
                        targetFieldId: ORDERS_FIELDS.totalCompletedOrderAmount,
                        color: '#f59e0b',
                        rules: [
                            createCompareTargetRule(
                                FilterOperator.LESS_THAN,
                                ORDERS_FIELDS.totalOrderAmount,
                            ),
                        ],
                    }),
                    createSingleColorConfig({
                        targetFieldId: ORDERS_FIELDS.totalCompletedOrderAmount,
                        color: '#7c3aed',
                        rules: [
                            createValueRule(
                                FilterOperator.LESS_THAN_OR_EQUAL,
                                [250],
                            ),
                        ],
                    }),
                ],
            },
        },
        tableConfig: {
            columnOrder: [
                ORDERS_FIELDS.orderDateMonth,
                ORDERS_FIELDS.totalCompletedOrderAmount,
                ORDERS_FIELDS.totalOrderAmount,
            ],
        },
        pivotConfig: undefined,
        parameters: undefined,
    },
    {
        key: 'cartesianThresholdLine',
        name: '[CF Coverage] Cartesian: threshold bar',
        description:
            'Cartesian coverage for threshold-based coloring on the supported single-bar-series path.',
        tableName: 'orders',
        metricQuery: {
            exploreName: 'orders',
            dimensions: [ORDERS_FIELDS.orderDateMonth],
            metrics: [ORDERS_FIELDS.uniqueOrderCount],
            filters: {},
            sorts: [
                {
                    fieldId: ORDERS_FIELDS.orderDateMonth,
                    descending: false,
                },
            ],
            limit: 500,
            tableCalculations: [],
        },
        chartConfig: {
            type: ChartType.CARTESIAN,
            config: {
                layout: {
                    xField: ORDERS_FIELDS.orderDateMonth,
                    yField: [ORDERS_FIELDS.uniqueOrderCount],
                },
                eChartsConfig: {
                    series: [
                        {
                            type: CartesianSeriesType.BAR,
                            encode: {
                                xRef: { field: ORDERS_FIELDS.orderDateMonth },
                                yRef: {
                                    field: ORDERS_FIELDS.uniqueOrderCount,
                                },
                            },
                            yAxisIndex: 0,
                        },
                    ],
                    showAxisTicks: false,
                },
                conditionalFormattings: [
                    createSingleColorConfig({
                        targetFieldId: ORDERS_FIELDS.uniqueOrderCount,
                        color: '#dc2626',
                        rules: [createValueRule(FilterOperator.LESS_THAN, [3])],
                    }),
                    createSingleColorConfig({
                        targetFieldId: ORDERS_FIELDS.uniqueOrderCount,
                        color: '#16a34a',
                        rules: [
                            createValueRule(
                                FilterOperator.GREATER_THAN_OR_EQUAL,
                                [3],
                            ),
                        ],
                    }),
                ],
            },
        },
        tableConfig: {
            columnOrder: [
                ORDERS_FIELDS.orderDateMonth,
                ORDERS_FIELDS.uniqueOrderCount,
            ],
        },
        pivotConfig: undefined,
        parameters: undefined,
    },
    {
        key: 'bigNumberMetric',
        name: '[CF Coverage] Big number: metric thresholds',
        description:
            'Big number coverage for single-color precedence and darkColor support on a metric target.',
        tableName: 'orders',
        metricQuery: {
            exploreName: 'orders',
            dimensions: [],
            metrics: [
                ORDERS_FIELDS.totalCompletedOrderAmount,
                ORDERS_FIELDS.totalOrderAmount,
            ],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [],
        },
        chartConfig: {
            type: ChartType.BIG_NUMBER,
            config: {
                label: 'Completed order amount',
                selectedField: ORDERS_FIELDS.totalCompletedOrderAmount,
                conditionalFormattings: [
                    createSingleColorConfig({
                        targetFieldId: ORDERS_FIELDS.totalCompletedOrderAmount,
                        color: '#2563eb',
                        darkColor: '#60a5fa',
                        rules: [
                            createValueRule(
                                FilterOperator.GREATER_THAN_OR_EQUAL,
                                [1000],
                            ),
                        ],
                    }),
                    createSingleColorConfig({
                        targetFieldId: ORDERS_FIELDS.totalCompletedOrderAmount,
                        color: '#7c3aed',
                        darkColor: '#c4b5fd',
                        rules: [
                            createValueRule(
                                FilterOperator.GREATER_THAN_OR_EQUAL,
                                [2000],
                            ),
                        ],
                    }),
                ],
            },
        },
        tableConfig: {
            columnOrder: [
                ORDERS_FIELDS.totalCompletedOrderAmount,
                ORDERS_FIELDS.totalOrderAmount,
            ],
        },
        pivotConfig: undefined,
        parameters: undefined,
    },
    {
        key: 'bigNumberTableCalculation',
        name: '[CF Coverage] Big number: table calculation',
        description:
            'Big number coverage for a table calculation target using inBetween and notInBetween operators.',
        tableName: 'orders',
        metricQuery: {
            exploreName: 'orders',
            dimensions: [],
            metrics: [
                ORDERS_FIELDS.totalOrderAmount,
                ORDERS_FIELDS.uniqueOrderCount,
            ],
            filters: {},
            sorts: [],
            limit: 500,
            tableCalculations: [
                {
                    name: TABLE_CALCULATIONS.completionRate,
                    displayName: 'Average order value',
                    sql: `\${${ORDERS_SQL_FIELDS.totalOrderAmount}} / NULLIF(\${${ORDERS_SQL_FIELDS.uniqueOrderCount}}, 0)`,
                },
            ],
        },
        chartConfig: {
            type: ChartType.BIG_NUMBER,
            config: {
                label: 'Average order value',
                selectedField: TABLE_CALCULATIONS.completionRate,
                conditionalFormattings: [
                    createSingleColorConfig({
                        targetFieldId: TABLE_CALCULATIONS.completionRate,
                        color: '#16a34a',
                        darkColor: '#86efac',
                        rules: [
                            createValueRule(
                                FilterOperator.IN_BETWEEN,
                                [50, 150],
                            ),
                        ],
                    }),
                    createSingleColorConfig({
                        targetFieldId: TABLE_CALCULATIONS.completionRate,
                        color: '#b91c1c',
                        darkColor: '#fca5a5',
                        rules: [
                            createValueRule(
                                FilterOperator.NOT_IN_BETWEEN,
                                [50, 150],
                            ),
                        ],
                    }),
                ],
            },
        },
        tableConfig: {
            columnOrder: [
                ORDERS_FIELDS.totalOrderAmount,
                ORDERS_FIELDS.uniqueOrderCount,
                TABLE_CALCULATIONS.completionRate,
            ],
        },
        pivotConfig: undefined,
        parameters: undefined,
    },
];

async function createCharts(
    savedChartModel: SavedChartModel,
    spaceUuid: string,
): Promise<ChartUuids> {
    const createdCharts = await Promise.all(
        chartSpecs.map(async (chart) => {
            const { key, ...chartData } = chart;
            const createdChart = await savedChartModel.create(
                SEED_PROJECT.project_uuid,
                SEED_ORG_1_ADMIN.user_uuid,
                {
                    ...chartData,
                    slug: generateSlug(chartData.name),
                    updatedByUser,
                    spaceUuid,
                },
            );

            return [key, createdChart.uuid] as const;
        }),
    );

    return Object.fromEntries(createdCharts);
}

async function cleanupExistingSeedContent(knex: Knex): Promise<void> {
    await knex('dashboards')
        .where('dashboard_uuid', HARDCODED_DASHBOARD_UUID)
        .orWhere('name', DASHBOARD_NAME)
        .delete();

    await knex('saved_queries')
        .where('name', 'like', `${CHART_NAME_PREFIX}%`)
        .delete();
}

async function createDashboard(
    knex: Knex,
    dashboardModel: DashboardModel,
    chartUuids: ChartUuids,
    spaceUuid: string,
): Promise<void> {
    const tiles: CreateDashboardChartTile[] = [
        createSavedChartTile({
            savedChartUuid: chartUuids.tableStackedCellAndText,
            x: 0,
            y: 5,
            w: 18,
            h: 9,
        }),
        createSavedChartTile({
            savedChartUuid: chartUuids.tableOperatorsAndRanges,
            x: 18,
            y: 5,
            w: 18,
            h: 9,
        }),
        createSavedChartTile({
            savedChartUuid: chartUuids.tableNullsAndTableCalcs,
            x: 0,
            y: 14,
            w: 18,
            h: 9,
        }),
        createSavedChartTile({
            savedChartUuid: chartUuids.tableCompareTargetToValues,
            x: 18,
            y: 14,
            w: 18,
            h: 9,
        }),
        createSavedChartTile({
            savedChartUuid: chartUuids.pivotColumnsStacked,
            x: 0,
            y: 23,
            w: 18,
            h: 9,
        }),
        createSavedChartTile({
            savedChartUuid: chartUuids.pivotMetricsAsRowsStacked,
            x: 18,
            y: 23,
            w: 18,
            h: 9,
        }),
        createSavedChartTile({
            savedChartUuid: chartUuids.pivotMultiDimensionRanges,
            x: 0,
            y: 32,
            w: 36,
            h: 10,
        }),
        createSavedChartTile({
            savedChartUuid: chartUuids.cartesianCompareTargetBar,
            x: 0,
            y: 42,
            w: 18,
            h: 9,
        }),
        createSavedChartTile({
            savedChartUuid: chartUuids.cartesianThresholdLine,
            x: 18,
            y: 42,
            w: 18,
            h: 9,
        }),
        createSavedChartTile({
            savedChartUuid: chartUuids.bigNumberMetric,
            x: 0,
            y: 51,
            w: 18,
            h: 6,
        }),
        createSavedChartTile({
            savedChartUuid: chartUuids.bigNumberTableCalculation,
            x: 18,
            y: 51,
            w: 18,
            h: 6,
        }),
    ];

    const dashboard = await dashboardModel.create(
        spaceUuid,
        {
            name: DASHBOARD_NAME,
            slug: DASHBOARD_SLUG,
            description: '',
            tiles: [
                {
                    uuid: uuidv4(),
                    x: 0,
                    y: 0,
                    w: 36,
                    h: 5,
                    type: DashboardTileTypes.MARKDOWN,
                    tabUuid: undefined,
                    properties: {
                        title: '',
                        content: markdownContent,
                    },
                },
                ...tiles,
            ],
            tabs: [],
            filters: {
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            },
        },
        {
            userUuid: SEED_ORG_1_ADMIN.user_uuid,
        },
        SEED_PROJECT.project_uuid,
    );

    await knex.raw(
        `UPDATE dashboards SET dashboard_uuid = ? WHERE dashboard_uuid = ?`,
        [HARDCODED_DASHBOARD_UUID, dashboard.uuid],
    );
}

export async function seed(knex: Knex): Promise<void> {
    const { dashboardModel, savedChartModel, spaceModel } =
        createSeedModels(knex);
    const spaceUuid = await getOrCreateTargetSpaceUuid(knex, spaceModel);

    await cleanupExistingSeedContent(knex);
    const chartUuids = await createCharts(savedChartModel, spaceUuid);
    await createDashboard(knex, dashboardModel, chartUuids, spaceUuid);
}
