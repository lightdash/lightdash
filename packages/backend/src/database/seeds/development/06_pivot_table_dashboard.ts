import {
    ChartType,
    DashboardTileTypes,
    FilterOperator,
    generateSlug,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
} from '@lightdash/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { lightdashConfig } from '../../../config/lightdashConfig';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { SavedChartModel } from '../../../models/SavedChartModel';
import { SpaceModel } from '../../../models/SpaceModel';

const markdownContent = `Following condition is set on all tiles:

Paint \`Total completed order amount\` blue when:

- It is not null
- \`Total completed order amount\` < \`Total order amount\``;

interface ChartUuids {
    baseTable: string;
    baseTableWithCostTier: string;
    pivotDateMetricsAsRowsFalse: string;
    pivotDateMetricsAsRowsTrue: string;
    pivotDateWithShippingMethodMetricsAsRowsTrue: string;
    pivotDateShippingMethodMetricsAsRowsTrue: string;
    pivotDateShippingMethodWithCostTierMetricsAsRowsTrue: string;
    pivotDateWithMethodAndTierMetricsAsRowsTrue: string;
    pivotAllThreeMetricsAsRowsTrue: string;
    pivotDateShippingMethodWithCostTierMetricsAsRowsFalse: string;
}

async function createPivotTableCharts(knex: Knex): Promise<ChartUuids> {
    const savedChartModel = new SavedChartModel({
        database: knex,
        lightdashConfig,
    });

    const spaceModel = new SpaceModel({
        database: knex,
    });

    const { space_uuid: spaceUuid } = await spaceModel.getFirstAccessibleSpace(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
    );

    const updatedByUser = {
        userUuid: SEED_ORG_1_ADMIN.user_uuid,
        firstName: SEED_ORG_1_ADMIN.first_name,
        lastName: SEED_ORG_1_ADMIN.last_name,
    };

    // Common conditional formatting for all charts
    const conditionalFormatting = [
        {
            color: '#5470c6',
            target: { fieldId: 'orders_total_completed_order_amount' },
            rules: [
                {
                    id: uuidv4(),
                    operator: FilterOperator.LESS_THAN,
                    compareTarget: { fieldId: 'orders_total_order_amount' },
                },
                {
                    id: uuidv4(),
                    operator: FilterOperator.NOT_NULL,
                    values: [],
                },
            ],
        },
    ];

    // Chart 1: Base table - no pivot, metricsAsRows: false
    const baseTable = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            name: 'How do orders break down by completion status, shipping method, and cost tier?',
            description:
                'This table displays order data segmented by completion status, shipping method, and shipping cost tier, showing total order amounts and completed order amounts for each combination.',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: [
                    'orders_shipping_method',
                    'orders_order_date_month',
                ],
                metrics: [
                    'orders_total_order_amount',
                    'orders_total_completed_order_amount',
                ],
                filters: {},
                sorts: [
                    {
                        fieldId: 'orders_order_date_month',
                        descending: true,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: {
                    showTableNames: false,
                    showResultsTotal: false,
                    showColumnCalculation: false,
                    showRowCalculation: false,
                    hideRowNumbers: false,
                    showSubtotals: false,
                    metricsAsRows: false,
                    conditionalFormattings: conditionalFormatting,
                    columns: {},
                },
            },
            tableConfig: {
                columnOrder: [
                    'orders_shipping_method',
                    'orders_order_date_month',
                    'orders_total_order_amount',
                    'orders_total_completed_order_amount',
                ],
            },
            pivotConfig: undefined,
            updatedByUser,
            slug: generateSlug(
                'How do orders break down by completion status, shipping method, and cost tier?',
            ),
            spaceUuid,
        },
    );

    // Chart 2: Base table with cost tier - no pivot, metricsAsRows: false
    const baseTableWithCostTier = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            name: 'Copy of How do orders break down by completion status, shipping method, and cost tier?',
            description:
                'This table displays order data segmented by completion status, shipping method, and shipping cost tier, showing total order amounts and completed order amounts for each combination.',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: [
                    'orders_shipping_cost_tier',
                    'orders_shipping_method',
                    'orders_order_date_month',
                ],
                metrics: [
                    'orders_total_order_amount',
                    'orders_total_completed_order_amount',
                ],
                filters: {},
                sorts: [
                    {
                        fieldId: 'orders_order_date_month',
                        descending: true,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: {
                    showTableNames: false,
                    showResultsTotal: false,
                    showColumnCalculation: false,
                    showRowCalculation: false,
                    hideRowNumbers: false,
                    showSubtotals: false,
                    metricsAsRows: false,
                    conditionalFormattings: conditionalFormatting,
                    columns: {},
                },
            },
            tableConfig: {
                columnOrder: [
                    'orders_shipping_cost_tier',
                    'orders_shipping_method',
                    'orders_order_date_month',
                    'orders_total_order_amount',
                    'orders_total_completed_order_amount',
                ],
            },
            pivotConfig: undefined,
            updatedByUser,
            slug: generateSlug(
                'Copy of How do orders break down by completion status, shipping method, and cost tier?',
            ),
            spaceUuid,
        },
    );

    // Chart 3: Pivoted by date, metricsAsRows: false
    const pivotDateMetricsAsRowsFalse = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            name: 'Pivoted by date, metricsAsRows: false',
            description: '',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_order_date_month'],
                metrics: [
                    'orders_total_order_amount',
                    'orders_total_completed_order_amount',
                ],
                filters: {},
                sorts: [
                    {
                        fieldId: 'orders_order_date_month',
                        descending: true,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: {
                    showTableNames: false,
                    showResultsTotal: false,
                    showColumnCalculation: false,
                    showRowCalculation: false,
                    hideRowNumbers: false,
                    showSubtotals: false,
                    metricsAsRows: false,
                    conditionalFormattings: conditionalFormatting,
                    columns: {},
                },
            },
            tableConfig: {
                columnOrder: [
                    'orders_order_date_month',
                    'orders_total_order_amount',
                    'orders_total_completed_order_amount',
                ],
            },
            pivotConfig: {
                columns: ['orders_order_date_month'],
            },
            updatedByUser,
            slug: generateSlug('Pivoted by date, metricsAsRows: false'),
            spaceUuid,
        },
    );

    // Chart 4: Pivoted by date, metricsAsRows: true
    const pivotDateMetricsAsRowsTrue = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            name: 'pivoted by date, metricsAsRows true',
            description: '',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_order_date_month'],
                metrics: [
                    'orders_total_order_amount',
                    'orders_total_completed_order_amount',
                ],
                filters: {},
                sorts: [
                    {
                        fieldId: 'orders_order_date_month',
                        descending: true,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: {
                    showTableNames: false,
                    showResultsTotal: false,
                    showColumnCalculation: false,
                    showRowCalculation: false,
                    hideRowNumbers: false,
                    showSubtotals: false,
                    metricsAsRows: true,
                    conditionalFormattings: conditionalFormatting,
                    columns: {},
                },
            },
            tableConfig: {
                columnOrder: [
                    'orders_order_date_month',
                    'orders_total_order_amount',
                    'orders_total_completed_order_amount',
                ],
            },
            pivotConfig: {
                columns: ['orders_order_date_month'],
            },
            updatedByUser,
            slug: generateSlug('pivoted by date, metricsAsRows true'),
            spaceUuid,
        },
    );

    // Chart 5: Pivoted by date with shipping method, metricsAsRows: true
    const pivotDateWithShippingMethodMetricsAsRowsTrue =
        await savedChartModel.create(
            SEED_PROJECT.project_uuid,
            SEED_ORG_1_ADMIN.user_uuid,
            {
                name: 'pivoted by date,  metricsAsRows true, w/ shipping method',
                description: '',
                tableName: 'orders',
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: [
                        'orders_order_date_month',
                        'orders_shipping_method',
                    ],
                    metrics: [
                        'orders_total_order_amount',
                        'orders_total_completed_order_amount',
                    ],
                    filters: {},
                    sorts: [
                        {
                            fieldId: 'orders_order_date_month',
                            descending: true,
                        },
                    ],
                    limit: 500,
                    tableCalculations: [],
                },
                chartConfig: {
                    type: ChartType.TABLE,
                    config: {
                        showTableNames: false,
                        showResultsTotal: false,
                        showColumnCalculation: false,
                        showRowCalculation: false,
                        hideRowNumbers: false,
                        showSubtotals: false,
                        metricsAsRows: true,
                        conditionalFormattings: conditionalFormatting,
                        columns: {},
                    },
                },
                tableConfig: {
                    columnOrder: [
                        'orders_order_date_month',
                        'orders_shipping_method',
                        'orders_total_order_amount',
                        'orders_total_completed_order_amount',
                    ],
                },
                pivotConfig: {
                    columns: ['orders_order_date_month'],
                },
                updatedByUser,
                slug: generateSlug(
                    'pivoted by date,  metricsAsRows true, w/ shipping method',
                ),
                spaceUuid,
            },
        );

    // Chart 6: Pivoted by date & shipping method, metricsAsRows: true
    const pivotDateShippingMethodMetricsAsRowsTrue =
        await savedChartModel.create(
            SEED_PROJECT.project_uuid,
            SEED_ORG_1_ADMIN.user_uuid,
            {
                name: 'pivot(date,shipping_method)  metricsAsRows:true',
                description: '',
                tableName: 'orders',
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: [
                        'orders_order_date_month',
                        'orders_shipping_method',
                    ],
                    metrics: [
                        'orders_total_order_amount',
                        'orders_total_completed_order_amount',
                    ],
                    filters: {},
                    sorts: [
                        {
                            fieldId: 'orders_order_date_month',
                            descending: true,
                        },
                    ],
                    limit: 500,
                    tableCalculations: [],
                },
                chartConfig: {
                    type: ChartType.TABLE,
                    config: {
                        showTableNames: false,
                        showResultsTotal: false,
                        showColumnCalculation: false,
                        showRowCalculation: false,
                        hideRowNumbers: false,
                        showSubtotals: false,
                        metricsAsRows: true,
                        conditionalFormattings: conditionalFormatting,
                        columns: {},
                    },
                },
                tableConfig: {
                    columnOrder: [
                        'orders_order_date_month',
                        'orders_shipping_method',
                        'orders_total_order_amount',
                        'orders_total_completed_order_amount',
                    ],
                },
                pivotConfig: {
                    columns: [
                        'orders_order_date_month',
                        'orders_shipping_method',
                    ],
                },
                updatedByUser,
                slug: generateSlug(
                    'pivot(date,shipping_method)  metricsAsRows:true',
                ),
                spaceUuid,
            },
        );

    // Chart 7: Pivoted by date & shipping method with cost tier, metricsAsRows: true
    const pivotDateShippingMethodWithCostTierMetricsAsRowsTrue =
        await savedChartModel.create(
            SEED_PROJECT.project_uuid,
            SEED_ORG_1_ADMIN.user_uuid,
            {
                name: 'pivot(date,shipping_method),costtier  metricsAsRows:true',
                description: '',
                tableName: 'orders',
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: [
                        'orders_order_date_month',
                        'orders_shipping_method',
                        'orders_shipping_cost_tier',
                    ],
                    metrics: [
                        'orders_total_order_amount',
                        'orders_total_completed_order_amount',
                    ],
                    filters: {},
                    sorts: [
                        {
                            fieldId: 'orders_order_date_month',
                            descending: true,
                        },
                    ],
                    limit: 500,
                    tableCalculations: [],
                },
                chartConfig: {
                    type: ChartType.TABLE,
                    config: {
                        showTableNames: false,
                        showResultsTotal: false,
                        showColumnCalculation: false,
                        showRowCalculation: false,
                        hideRowNumbers: false,
                        showSubtotals: false,
                        metricsAsRows: true,
                        conditionalFormattings: conditionalFormatting,
                        columns: {},
                    },
                },
                tableConfig: {
                    columnOrder: [
                        'orders_order_date_month',
                        'orders_shipping_method',
                        'orders_shipping_cost_tier',
                        'orders_total_order_amount',
                        'orders_total_completed_order_amount',
                    ],
                },
                pivotConfig: {
                    columns: [
                        'orders_order_date_month',
                        'orders_shipping_method',
                    ],
                },
                updatedByUser,
                slug: generateSlug(
                    'pivot(date,shipping_method),costtier  metricsAsRows:true',
                ),
                spaceUuid,
            },
        );

    // Chart 8: Pivoted by date with method & tier, metricsAsRows: true
    const pivotDateWithMethodAndTierMetricsAsRowsTrue =
        await savedChartModel.create(
            SEED_PROJECT.project_uuid,
            SEED_ORG_1_ADMIN.user_uuid,
            {
                name: 'pivot(date),method,tier  metricsAsRows:true',
                description: '',
                tableName: 'orders',
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: [
                        'orders_order_date_month',
                        'orders_shipping_method',
                        'orders_shipping_cost_tier',
                    ],
                    metrics: [
                        'orders_total_order_amount',
                        'orders_total_completed_order_amount',
                    ],
                    filters: {},
                    sorts: [
                        {
                            fieldId: 'orders_order_date_month',
                            descending: true,
                        },
                    ],
                    limit: 500,
                    tableCalculations: [],
                },
                chartConfig: {
                    type: ChartType.TABLE,
                    config: {
                        showTableNames: false,
                        showResultsTotal: false,
                        showColumnCalculation: true,
                        showRowCalculation: false,
                        hideRowNumbers: false,
                        showSubtotals: false,
                        metricsAsRows: true,
                        conditionalFormattings: conditionalFormatting,
                        columns: {},
                    },
                },
                tableConfig: {
                    columnOrder: [
                        'orders_order_date_month',
                        'orders_shipping_method',
                        'orders_shipping_cost_tier',
                        'orders_total_order_amount',
                        'orders_total_completed_order_amount',
                    ],
                },
                pivotConfig: {
                    columns: ['orders_order_date_month'],
                },
                updatedByUser,
                slug: generateSlug(
                    'pivot(date),method,tier  metricsAsRows:true',
                ),
                spaceUuid,
            },
        );

    // Chart 9: Pivoted by all three dimensions, metricsAsRows: true
    const pivotAllThreeMetricsAsRowsTrue = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            name: 'pivot(date,shipping_method,cost_tier)  metricsAsRows:true',
            description: '',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: [
                    'orders_order_date_month',
                    'orders_shipping_method',
                    'orders_shipping_cost_tier',
                ],
                metrics: [
                    'orders_total_order_amount',
                    'orders_total_completed_order_amount',
                ],
                filters: {},
                sorts: [
                    {
                        fieldId: 'orders_order_date_month',
                        descending: true,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: {
                    showTableNames: false,
                    showResultsTotal: false,
                    showColumnCalculation: false,
                    showRowCalculation: false,
                    hideRowNumbers: false,
                    showSubtotals: false,
                    metricsAsRows: true,
                    conditionalFormattings: conditionalFormatting,
                    columns: {},
                },
            },
            tableConfig: {
                columnOrder: [
                    'orders_order_date_month',
                    'orders_shipping_method',
                    'orders_shipping_cost_tier',
                    'orders_total_order_amount',
                    'orders_total_completed_order_amount',
                ],
            },
            pivotConfig: {
                columns: [
                    'orders_order_date_month',
                    'orders_shipping_method',
                    'orders_shipping_cost_tier',
                ],
            },
            updatedByUser,
            slug: generateSlug(
                'Copy of pivot(date),method,tier  metricsAsRows:true',
            ),
            spaceUuid,
        },
    );

    // Chart 10: Pivoted by date & shipping method with cost tier, metricsAsRows: false
    const pivotDateShippingMethodWithCostTierMetricsAsRowsFalse =
        await savedChartModel.create(
            SEED_PROJECT.project_uuid,
            SEED_ORG_1_ADMIN.user_uuid,
            {
                name: 'pivot(date,shipping_method),costtier  metricsAsRows:false',
                description: '',
                tableName: 'orders',
                metricQuery: {
                    exploreName: 'orders',
                    dimensions: [
                        'orders_order_date_month',
                        'orders_shipping_method',
                        'orders_shipping_cost_tier',
                    ],
                    metrics: [
                        'orders_total_order_amount',
                        'orders_total_completed_order_amount',
                    ],
                    filters: {},
                    sorts: [
                        {
                            fieldId: 'orders_order_date_month',
                            descending: true,
                        },
                    ],
                    limit: 500,
                    tableCalculations: [],
                },
                chartConfig: {
                    type: ChartType.TABLE,
                    config: {
                        showTableNames: false,
                        showResultsTotal: false,
                        showColumnCalculation: false,
                        showRowCalculation: false,
                        hideRowNumbers: false,
                        showSubtotals: false,
                        metricsAsRows: false,
                        conditionalFormattings: conditionalFormatting,
                        columns: {},
                    },
                },
                tableConfig: {
                    columnOrder: [
                        'orders_order_date_month',
                        'orders_shipping_method',
                        'orders_shipping_cost_tier',
                        'orders_total_order_amount',
                        'orders_total_completed_order_amount',
                    ],
                },
                pivotConfig: {
                    columns: [
                        'orders_order_date_month',
                        'orders_shipping_method',
                    ],
                },
                updatedByUser,
                slug: generateSlug(
                    'pivot(date,shipping_method),costtier  metricsAsRows:false',
                ),
                spaceUuid,
            },
        );

    return {
        baseTable: baseTable.uuid,
        baseTableWithCostTier: baseTableWithCostTier.uuid,
        pivotDateMetricsAsRowsFalse: pivotDateMetricsAsRowsFalse.uuid,
        pivotDateMetricsAsRowsTrue: pivotDateMetricsAsRowsTrue.uuid,
        pivotDateWithShippingMethodMetricsAsRowsTrue:
            pivotDateWithShippingMethodMetricsAsRowsTrue.uuid,
        pivotDateShippingMethodMetricsAsRowsTrue:
            pivotDateShippingMethodMetricsAsRowsTrue.uuid,
        pivotDateShippingMethodWithCostTierMetricsAsRowsTrue:
            pivotDateShippingMethodWithCostTierMetricsAsRowsTrue.uuid,
        pivotDateWithMethodAndTierMetricsAsRowsTrue:
            pivotDateWithMethodAndTierMetricsAsRowsTrue.uuid,
        pivotAllThreeMetricsAsRowsTrue: pivotAllThreeMetricsAsRowsTrue.uuid,
        pivotDateShippingMethodWithCostTierMetricsAsRowsFalse:
            pivotDateShippingMethodWithCostTierMetricsAsRowsFalse.uuid,
    };
}

async function createPivotTableDashboard(
    knex: Knex,
    chartUuids: ChartUuids,
): Promise<void> {
    const dashboardModel = new DashboardModel({
        database: knex,
    });

    const spaceModel = new SpaceModel({
        database: knex,
    });

    const { space_uuid: spaceUuid } = await spaceModel.getFirstAccessibleSpace(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
    );

    // Create dashboard with conditional formatting demonstration
    const dashboard = await dashboardModel.create(
        spaceUuid,
        {
            name: 'Pivot Table Dashboard',
            tiles: [
                // Markdown tile explaining conditional formatting
                {
                    uuid: uuidv4(),
                    x: 0,
                    y: 0,
                    w: 36,
                    h: 3,
                    type: DashboardTileTypes.MARKDOWN,
                    tabUuid: undefined,
                    properties: {
                        title: '',
                        content: markdownContent,
                    },
                },
                // Chart 1: Base table
                {
                    uuid: uuidv4(),
                    x: 0,
                    y: 3,
                    w: 18,
                    h: 9,
                    type: DashboardTileTypes.SAVED_CHART,
                    tabUuid: undefined,
                    properties: {
                        savedChartUuid: chartUuids.baseTable,
                    },
                },
                // Chart 2: Base table with cost tier
                {
                    uuid: uuidv4(),
                    x: 18,
                    y: 3,
                    w: 18,
                    h: 9,
                    type: DashboardTileTypes.SAVED_CHART,
                    tabUuid: undefined,
                    properties: {
                        savedChartUuid: chartUuids.baseTableWithCostTier,
                    },
                },
                // Chart 3: Pivoted by date, metricsAsRows: false
                {
                    uuid: uuidv4(),
                    x: 0,
                    y: 12,
                    w: 18,
                    h: 9,
                    type: DashboardTileTypes.SAVED_CHART,
                    tabUuid: undefined,
                    properties: {
                        savedChartUuid: chartUuids.pivotDateMetricsAsRowsFalse,
                    },
                },
                // Chart 4: Pivoted by date, metricsAsRows: true
                {
                    uuid: uuidv4(),
                    x: 18,
                    y: 12,
                    w: 18,
                    h: 9,
                    type: DashboardTileTypes.SAVED_CHART,
                    tabUuid: undefined,
                    properties: {
                        savedChartUuid: chartUuids.pivotDateMetricsAsRowsTrue,
                    },
                },
                // Chart 5: Pivoted by date with shipping method, metricsAsRows: true
                {
                    uuid: uuidv4(),
                    x: 0,
                    y: 21,
                    w: 18,
                    h: 9,
                    type: DashboardTileTypes.SAVED_CHART,
                    tabUuid: undefined,
                    properties: {
                        savedChartUuid:
                            chartUuids.pivotDateWithShippingMethodMetricsAsRowsTrue,
                    },
                },
                // Chart 6: Pivoted by date & shipping method, metricsAsRows: true
                {
                    uuid: uuidv4(),
                    x: 18,
                    y: 21,
                    w: 18,
                    h: 9,
                    type: DashboardTileTypes.SAVED_CHART,
                    tabUuid: undefined,
                    properties: {
                        savedChartUuid:
                            chartUuids.pivotDateShippingMethodMetricsAsRowsTrue,
                    },
                },
                // Chart 7: Pivoted by date & shipping method with cost tier, metricsAsRows: true
                {
                    uuid: uuidv4(),
                    x: 0,
                    y: 30,
                    w: 18,
                    h: 9,
                    type: DashboardTileTypes.SAVED_CHART,
                    tabUuid: undefined,
                    properties: {
                        savedChartUuid:
                            chartUuids.pivotDateShippingMethodWithCostTierMetricsAsRowsTrue,
                    },
                },
                // Chart 8: Pivoted by date with method & tier, metricsAsRows: true
                {
                    uuid: uuidv4(),
                    x: 18,
                    y: 30,
                    w: 18,
                    h: 9,
                    type: DashboardTileTypes.SAVED_CHART,
                    tabUuid: undefined,
                    properties: {
                        savedChartUuid:
                            chartUuids.pivotDateWithMethodAndTierMetricsAsRowsTrue,
                    },
                },
                // Chart 9: Pivoted by all three dimensions, metricsAsRows: true
                {
                    uuid: uuidv4(),
                    x: 0,
                    y: 39,
                    w: 18,
                    h: 9,
                    type: DashboardTileTypes.SAVED_CHART,
                    tabUuid: undefined,
                    properties: {
                        savedChartUuid:
                            chartUuids.pivotAllThreeMetricsAsRowsTrue,
                    },
                },
                // Chart 10: Pivoted by date & shipping method with cost tier, metricsAsRows: false
                {
                    uuid: uuidv4(),
                    x: 18,
                    y: 39,
                    w: 18,
                    h: 9,
                    type: DashboardTileTypes.SAVED_CHART,
                    tabUuid: undefined,
                    properties: {
                        savedChartUuid:
                            chartUuids.pivotDateShippingMethodWithCostTierMetricsAsRowsFalse,
                    },
                },
            ],
            filters: {
                dimensions: [],
                metrics: [],
                tableCalculations: [],
            },
            tabs: [],
            slug: generateSlug('Pivot Table Dashboard'),
        },
        {
            userUuid: SEED_ORG_1_ADMIN.user_uuid,
        },
        SEED_PROJECT.project_uuid,
    );

    // Update dashboard UUID to match the original dashboard
    const HARDCODED_DASHBOARD_UUID = '8542a1ed-ba86-4e1f-8604-33a38e274189';
    await knex.raw(
        `UPDATE dashboards SET dashboard_uuid = ? WHERE dashboard_uuid = ?`,
        [HARDCODED_DASHBOARD_UUID, dashboard.uuid],
    );
}

export async function seed(knex: Knex): Promise<void> {
    // Create charts first
    const chartUuids = await createPivotTableCharts(knex);

    // Then create dashboard with the charts
    await createPivotTableDashboard(knex, chartUuids);
}
