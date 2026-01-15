import {
    CartesianSeriesType,
    ChartType,
    CreateDashboardChartTile,
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

type ChartUuids = Record<string, string>;

async function createCharts(knex: Knex): Promise<ChartUuids> {
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

    const chartUuids: ChartUuids = {};

    // Chart 1: Bar chart with date filter (returns data)
    const chart1 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('order amount by status filtered'),
            name: 'Order amount by status (filtered date)',
            description:
                'Total non-completed order amount by status for a specific date',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_status'],
                metrics: ['orders_total_non_completed_order_amount'],
                filters: {
                    dimensions: {
                        id: uuidv4(),
                        and: [
                            {
                                id: uuidv4(),
                                target: {
                                    fieldId: 'orders_order_date',
                                },
                                values: ['2024-04-01'],
                                operator: FilterOperator.EQUALS,
                            },
                        ],
                    },
                },
                sorts: [
                    {
                        fieldId: 'orders_status',
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
                        xField: 'orders_status',
                        yField: ['orders_total_non_completed_order_amount'],
                    },
                    eChartsConfig: {
                        series: [
                            {
                                type: CartesianSeriesType.BAR,
                                encode: {
                                    xRef: { field: 'orders_status' },
                                    yRef: {
                                        field: 'orders_total_non_completed_order_amount',
                                    },
                                },
                                yAxisIndex: 0,
                            },
                        ],
                        showAxisTicks: false,
                    },
                },
            },
            tableConfig: {
                columnOrder: [
                    'orders_status',
                    'orders_total_non_completed_order_amount',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.barChart = chart1.uuid;

    // Chart 2: Table with filter that returns NO data (empty results)
    const chart2 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('order status shipping revenue empty'),
            name: 'Order status and shipping (no results)',
            description: 'Table filtered to a date with no data',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_status'],
                metrics: ['orders_total_shipping_revenue'],
                filters: {
                    dimensions: {
                        id: uuidv4(),
                        and: [
                            {
                                id: uuidv4(),
                                target: {
                                    fieldId: 'orders_order_date',
                                },
                                values: ['2099-01-15'],
                                operator: FilterOperator.EQUALS,
                            },
                        ],
                    },
                },
                sorts: [
                    {
                        fieldId: 'orders_total_shipping_revenue',
                        descending: true,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: {
                    columns: {},
                    metricsAsRows: false,
                    showSubtotals: false,
                    hideRowNumbers: false,
                    showTableNames: false,
                    showResultsTotal: false,
                    showRowCalculation: false,
                    showColumnCalculation: false,
                    conditionalFormattings: [],
                },
            },
            tableConfig: {
                columnOrder: ['orders_status', 'orders_total_shipping_revenue'],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.emptyTable = chart2.uuid;

    // Chart 3: Table with data
    const chart3 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('order amounts table'),
            name: 'Order amounts by month',
            description: 'Table showing order amounts grouped by month',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_order_date_month'],
                metrics: ['orders_total_order_amount_foobar'],
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
                    columns: {},
                    metricsAsRows: false,
                    showSubtotals: false,
                    hideRowNumbers: false,
                    showTableNames: false,
                    showResultsTotal: false,
                    showRowCalculation: false,
                    showColumnCalculation: false,
                    conditionalFormattings: [],
                },
            },
            tableConfig: {
                columnOrder: [
                    'orders_order_date_month',
                    'orders_total_order_amount_foobar',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.tableWithData = chart3.uuid;

    // Chart 4: Chart that will be deleted to create orphan tile
    const chart4 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('chart to be deleted'),
            name: 'Chart to be deleted (orphan test)',
            description:
                'This chart will be deleted to test orphan tile handling',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_status'],
                metrics: ['orders_average_order_size'],
                filters: {},
                sorts: [
                    {
                        fieldId: 'orders_status',
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
                        xField: 'orders_status',
                        yField: ['orders_average_order_size'],
                    },
                    eChartsConfig: {
                        series: [
                            {
                                type: CartesianSeriesType.BAR,
                                encode: {
                                    xRef: { field: 'orders_status' },
                                    yRef: {
                                        field: 'orders_average_order_size',
                                    },
                                },
                                yAxisIndex: 0,
                            },
                        ],
                        showAxisTicks: false,
                    },
                },
            },
            tableConfig: {
                columnOrder: ['orders_status', 'orders_average_order_size'],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.toBeDeleted = chart4.uuid;

    return chartUuids;
}

async function createDashboard(
    knex: Knex,
    chartUuids: ChartUuids,
): Promise<string> {
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

    // Create dashboard tiles
    const tiles: CreateDashboardChartTile[] = [
        // Row 1: Bar chart with data
        {
            uuid: uuidv4(),
            x: 0,
            y: 0,
            w: 15,
            h: 9,
            type: DashboardTileTypes.SAVED_CHART,
            tabUuid: undefined,
            properties: {
                savedChartUuid: chartUuids.barChart,
            },
        },
        // Row 1: Chart that will become orphan
        {
            uuid: uuidv4(),
            x: 15,
            y: 0,
            w: 15,
            h: 9,
            type: DashboardTileTypes.SAVED_CHART,
            tabUuid: undefined,
            properties: {
                savedChartUuid: chartUuids.toBeDeleted,
                title: 'Orphaned Chart Tile',
            },
        },
        // Row 2: Table with empty results
        {
            uuid: uuidv4(),
            x: 0,
            y: 9,
            w: 15,
            h: 9,
            type: DashboardTileTypes.SAVED_CHART,
            tabUuid: undefined,
            properties: {
                savedChartUuid: chartUuids.emptyTable,
            },
        },
        // Row 2: Table with data
        {
            uuid: uuidv4(),
            x: 15,
            y: 9,
            w: 15,
            h: 9,
            type: DashboardTileTypes.SAVED_CHART,
            tabUuid: undefined,
            properties: {
                savedChartUuid: chartUuids.tableWithData,
            },
        },
    ];

    const dashboard = await dashboardModel.create(
        spaceUuid,
        {
            name: 'Scheduled delivery edge cases',
            slug: generateSlug('Scheduled delivery edge cases'),
            description:
                'Dashboard for testing screenshot edge cases: orphan tiles, empty results, various chart types',
            tiles,
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

    const HARDCODED_DASHBOARD_UUID = '4f34f5a2-93df-4e5b-a6f1-b6167b19a8ba';
    await knex.raw(
        `UPDATE dashboards SET dashboard_uuid = ? WHERE dashboard_uuid = ?`,
        [HARDCODED_DASHBOARD_UUID, dashboard.uuid],
    );
    return HARDCODED_DASHBOARD_UUID;
}

async function createOrphanTile(
    knex: Knex,
    chartUuidToDelete: string,
): Promise<void> {
    // Delete the chart to create an orphan tile
    // The foreign key ON DELETE SET NULL will set saved_chart_id to NULL
    await knex('saved_queries')
        .where('saved_query_uuid', chartUuidToDelete)
        .delete();
}

export async function seed(knex: Knex): Promise<void> {
    const chartUuids = await createCharts(knex);
    await createDashboard(knex, chartUuids);

    // Delete one chart to create orphan tile scenario
    await createOrphanTile(knex, chartUuids.toBeDeleted);
}
