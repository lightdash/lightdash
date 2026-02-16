/**
 * Seed file to create Table Calculation test charts for SQL generation testing.
 * Creates 7 charts covering all TableCalculationTemplateType values plus raw SQL.
 */
import {
    CartesianSeriesType,
    ChartType,
    CreateDashboardChartTile,
    CustomFormatType,
    DashboardTileTypes,
    FrameBoundaryType,
    FrameType,
    generateSlug,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
    TableCalculationTemplateType,
    WindowFunctionType,
} from '@lightdash/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { lightdashConfig } from '../../../config/lightdashConfig';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { SavedChartModel } from '../../../models/SavedChartModel';
import { SpaceModel } from '../../../models/SpaceModel';

const PARENT_SPACE_NAME = '[Test SQL Generation]';
const CHILD_SPACE_NAME = '[Table Calculations]';

type ChartUuids = Record<string, string>;

/**
 * Get or create a space by name. If parentSpaceUuid is provided, looks for/creates
 * a child space under that parent.
 */
async function getOrCreateSpaceByName(
    knex: Knex,
    spaceModel: SpaceModel,
    spaceName: string,
    projectUuid: string,
    userId: number,
    parentSpaceUuid: string | null = null,
): Promise<string> {
    // Query for existing space by name and parent
    const query = knex('spaces')
        .join('projects', 'spaces.project_id', 'projects.project_id')
        .where('spaces.name', spaceName)
        .where('projects.project_uuid', projectUuid);

    if (parentSpaceUuid) {
        void query.where('spaces.parent_space_uuid', parentSpaceUuid);
    } else {
        void query.whereNull('spaces.parent_space_uuid');
    }

    const existingSpace = await query.first();

    if (existingSpace) {
        return existingSpace.space_uuid;
    }

    const space = await spaceModel.createSpace(
        {
            name: spaceName,
            isPrivate: false,
            inheritParentPermissions: true,
            parentSpaceUuid,
        },
        {
            projectUuid,
            userId,
        },
    );

    return space.uuid;
}

async function createTableCalcTestCharts(
    savedChartModel: SavedChartModel,
    spaceUuid: string,
): Promise<ChartUuids> {
    const updatedByUser = {
        userUuid: SEED_ORG_1_ADMIN.user_uuid,
        firstName: SEED_ORG_1_ADMIN.first_name,
        lastName: SEED_ORG_1_ADMIN.last_name,
    };

    const chartUuids: ChartUuids = {};

    // Chart 1: Percent Change from Previous (LINE)
    const chart1 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[TC Test] Percent Change from Previous'),
            name: '[TC Test] Percent Change from Previous',
            description:
                'Tests PERCENT_CHANGE_FROM_PREVIOUS table calculation template',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_order_date_month'],
                metrics: ['orders_total_order_amount'],
                filters: {},
                sorts: [
                    { fieldId: 'orders_order_date_month', descending: false },
                ],
                limit: 500,
                tableCalculations: [
                    {
                        name: 'percent_change',
                        displayName: 'Percent Change',
                        format: { type: CustomFormatType.PERCENT },
                        template: {
                            type: TableCalculationTemplateType.PERCENT_CHANGE_FROM_PREVIOUS,
                            fieldId: 'orders_total_order_amount',
                            orderBy: [
                                {
                                    fieldId: 'orders_order_date_month',
                                    order: 'asc',
                                },
                            ],
                        },
                    },
                ],
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        xField: 'orders_order_date_month',
                        yField: ['orders_total_order_amount', 'percent_change'],
                        flipAxes: false,
                    },
                    eChartsConfig: {
                        series: [
                            {
                                type: CartesianSeriesType.LINE,
                                encode: {
                                    xRef: { field: 'orders_order_date_month' },
                                    yRef: {
                                        field: 'orders_total_order_amount',
                                    },
                                },
                                yAxisIndex: 0,
                            },
                            {
                                type: CartesianSeriesType.LINE,
                                encode: {
                                    xRef: { field: 'orders_order_date_month' },
                                    yRef: { field: 'percent_change' },
                                },
                                yAxisIndex: 1,
                            },
                        ],
                    },
                },
            },
            tableConfig: {
                columnOrder: [
                    'orders_order_date_month',
                    'orders_total_order_amount',
                    'percent_change',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.percentChange = chart1.uuid;

    // Chart 2: Percent of Previous Value (TABLE)
    const chart2 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[TC Test] Percent of Previous Value'),
            name: '[TC Test] Percent of Previous Value',
            description:
                'Tests PERCENT_OF_PREVIOUS_VALUE table calculation template',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_order_date_month'],
                metrics: ['orders_total_order_amount'],
                filters: {},
                sorts: [
                    { fieldId: 'orders_order_date_month', descending: false },
                ],
                limit: 500,
                tableCalculations: [
                    {
                        name: 'percent_of_previous',
                        displayName: 'Percent of Previous',
                        format: { type: CustomFormatType.PERCENT },
                        template: {
                            type: TableCalculationTemplateType.PERCENT_OF_PREVIOUS_VALUE,
                            fieldId: 'orders_total_order_amount',
                            orderBy: [
                                {
                                    fieldId: 'orders_order_date_month',
                                    order: 'asc',
                                },
                            ],
                        },
                    },
                ],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: undefined,
            },
            tableConfig: {
                columnOrder: [
                    'orders_order_date_month',
                    'orders_total_order_amount',
                    'percent_of_previous',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.percentOfPrevious = chart2.uuid;

    // Chart 3: Percent of Column Total (PIE)
    const chart3 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[TC Test] Percent of Column Total'),
            name: '[TC Test] Percent of Column Total',
            description:
                'Tests PERCENT_OF_COLUMN_TOTAL table calculation template',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_status'],
                metrics: ['orders_total_order_amount'],
                filters: {},
                sorts: [
                    { fieldId: 'orders_total_order_amount', descending: true },
                ],
                limit: 500,
                tableCalculations: [
                    {
                        name: 'percent_of_total',
                        displayName: 'Percent of Total',
                        format: { type: CustomFormatType.PERCENT },
                        template: {
                            type: TableCalculationTemplateType.PERCENT_OF_COLUMN_TOTAL,
                            fieldId: 'orders_total_order_amount',
                            partitionBy: [],
                        },
                    },
                ],
            },
            chartConfig: {
                type: ChartType.PIE,
                config: {
                    groupFieldIds: ['orders_status'],
                    metricId: 'percent_of_total',
                    isDonut: false,
                },
            },
            tableConfig: {
                columnOrder: [
                    'orders_status',
                    'orders_total_order_amount',
                    'percent_of_total',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.percentOfTotal = chart3.uuid;

    // Chart 4: Rank in Column (TABLE)
    const chart4 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[TC Test] Rank in Column'),
            name: '[TC Test] Rank in Column',
            description: 'Tests RANK_IN_COLUMN table calculation template',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_order_date_month'],
                metrics: ['orders_total_order_amount'],
                filters: {},
                sorts: [
                    { fieldId: 'orders_total_order_amount', descending: true },
                ],
                limit: 500,
                tableCalculations: [
                    {
                        name: 'rank',
                        displayName: 'Rank',
                        template: {
                            type: TableCalculationTemplateType.RANK_IN_COLUMN,
                            fieldId: 'orders_total_order_amount',
                        },
                    },
                ],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: undefined,
            },
            tableConfig: {
                columnOrder: [
                    'orders_order_date_month',
                    'orders_total_order_amount',
                    'rank',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.rank = chart4.uuid;

    // Chart 5: Running Total (BAR)
    const chart5 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[TC Test] Running Total'),
            name: '[TC Test] Running Total',
            description: 'Tests RUNNING_TOTAL table calculation template',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_order_date_month'],
                metrics: ['orders_total_order_amount'],
                filters: {},
                sorts: [
                    { fieldId: 'orders_order_date_month', descending: false },
                ],
                limit: 500,
                tableCalculations: [
                    {
                        name: 'running_total',
                        displayName: 'Running Total',
                        template: {
                            type: TableCalculationTemplateType.RUNNING_TOTAL,
                            fieldId: 'orders_total_order_amount',
                        },
                    },
                ],
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        xField: 'orders_order_date_month',
                        yField: ['orders_total_order_amount', 'running_total'],
                        flipAxes: false,
                    },
                    eChartsConfig: {
                        series: [
                            {
                                type: CartesianSeriesType.BAR,
                                encode: {
                                    xRef: { field: 'orders_order_date_month' },
                                    yRef: {
                                        field: 'orders_total_order_amount',
                                    },
                                },
                                yAxisIndex: 0,
                            },
                            {
                                type: CartesianSeriesType.LINE,
                                encode: {
                                    xRef: { field: 'orders_order_date_month' },
                                    yRef: { field: 'running_total' },
                                },
                                yAxisIndex: 1,
                            },
                        ],
                    },
                },
            },
            tableConfig: {
                columnOrder: [
                    'orders_order_date_month',
                    'orders_total_order_amount',
                    'running_total',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.runningTotal = chart5.uuid;

    // Chart 6: Window Function - Moving Average (LINE)
    const chart6 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[TC Test] Window Function - Moving Avg'),
            name: '[TC Test] Window Function - Moving Avg',
            description:
                'Tests WINDOW_FUNCTION table calculation template with AVG and frame clause',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_order_date_month'],
                metrics: ['orders_total_order_amount'],
                filters: {},
                sorts: [
                    { fieldId: 'orders_order_date_month', descending: false },
                ],
                limit: 500,
                tableCalculations: [
                    {
                        name: 'moving_avg_3m',
                        displayName: '3-Month Moving Avg',
                        template: {
                            type: TableCalculationTemplateType.WINDOW_FUNCTION,
                            windowFunction: WindowFunctionType.AVG,
                            fieldId: 'orders_total_order_amount',
                            orderBy: [
                                {
                                    fieldId: 'orders_order_date_month',
                                    order: 'asc',
                                },
                            ],
                            partitionBy: [],
                            frame: {
                                frameType: FrameType.ROWS,
                                start: {
                                    type: FrameBoundaryType.PRECEDING,
                                    offset: 2,
                                },
                                end: { type: FrameBoundaryType.CURRENT_ROW },
                            },
                        },
                    },
                ],
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        xField: 'orders_order_date_month',
                        yField: ['orders_total_order_amount', 'moving_avg_3m'],
                        flipAxes: false,
                    },
                    eChartsConfig: {
                        series: [
                            {
                                type: CartesianSeriesType.LINE,
                                encode: {
                                    xRef: { field: 'orders_order_date_month' },
                                    yRef: {
                                        field: 'orders_total_order_amount',
                                    },
                                },
                                yAxisIndex: 0,
                            },
                            {
                                type: CartesianSeriesType.LINE,
                                encode: {
                                    xRef: { field: 'orders_order_date_month' },
                                    yRef: { field: 'moving_avg_3m' },
                                },
                                yAxisIndex: 0,
                            },
                        ],
                    },
                },
            },
            tableConfig: {
                columnOrder: [
                    'orders_order_date_month',
                    'orders_total_order_amount',
                    'moving_avg_3m',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.windowFunction = chart6.uuid;

    // Chart 7: Raw SQL Table Calculation (TABLE)
    const chart7 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[TC Test] Raw SQL - Order Avg Ratio'),
            name: '[TC Test] Raw SQL - Order Avg Ratio',
            description: 'Tests raw SQL table calculation',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_order_date_month'],
                metrics: [
                    'orders_total_order_amount',
                    'orders_unique_order_count',
                ],
                filters: {},
                sorts: [
                    { fieldId: 'orders_order_date_month', descending: false },
                ],
                limit: 500,
                tableCalculations: [
                    {
                        name: 'avg_order_value',
                        displayName: 'Avg Order Value (Raw SQL)',
                        format: {
                            type: CustomFormatType.CURRENCY,
                            currency: 'USD',
                            round: 2,
                        },
                        sql: '${orders_total_order_amount} / NULLIF(${orders_unique_order_count}, 0)',
                    },
                ],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: undefined,
            },
            tableConfig: {
                columnOrder: [
                    'orders_order_date_month',
                    'orders_total_order_amount',
                    'orders_unique_order_count',
                    'avg_order_value',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.rawSql = chart7.uuid;

    return chartUuids;
}

async function createTableCalcTestsDashboard(
    knex: Knex,
    spaceUuid: string,
    chartUuids: ChartUuids,
): Promise<void> {
    const dashboardModel = new DashboardModel({
        database: knex,
    });

    // Dashboard layout: 2 columns, each tile is 18 units wide and 6 units tall
    const TILE_WIDTH = 18;
    const TILE_HEIGHT = 6;
    const COLS = 2;

    const chartOrder = [
        'percentChange',
        'percentOfPrevious',
        'percentOfTotal',
        'rank',
        'runningTotal',
        'windowFunction',
        'rawSql',
    ];

    const tiles: CreateDashboardChartTile[] = chartOrder.map(
        (chartKey, index) => {
            const row = Math.floor(index / COLS);
            const col = index % COLS;

            return {
                uuid: uuidv4(),
                x: col * TILE_WIDTH,
                y: row * TILE_HEIGHT,
                w: TILE_WIDTH,
                h: TILE_HEIGHT,
                type: DashboardTileTypes.SAVED_CHART,
                tabUuid: undefined,
                properties: {
                    savedChartUuid: chartUuids[chartKey],
                },
            };
        },
    );

    await dashboardModel.create(
        spaceUuid,
        {
            name: 'Table Calculations Tests Dashboard',
            slug: generateSlug('Table Calculations Tests Dashboard'),
            description:
                'Dashboard containing Table Calculation test charts for SQL generation verification on Athena/Trino',
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
}

export async function seed(knex: Knex): Promise<void> {
    const savedChartModel = new SavedChartModel({
        database: knex,
        lightdashConfig,
    });

    const spaceModel = new SpaceModel({
        database: knex,
    });

    const [user] = await knex('users').where(
        'user_uuid',
        SEED_ORG_1_ADMIN.user_uuid,
    );

    if (!user) {
        throw new Error(`User ${SEED_ORG_1_ADMIN.user_uuid} not found`);
    }

    // Get or create the [Test SQL Generation] parent space
    const parentSpaceUuid = await getOrCreateSpaceByName(
        knex,
        spaceModel,
        PARENT_SPACE_NAME,
        SEED_PROJECT.project_uuid,
        user.user_id,
        null,
    );

    // Get or create the [Table Calculations] child space
    const childSpaceUuid = await getOrCreateSpaceByName(
        knex,
        spaceModel,
        CHILD_SPACE_NAME,
        SEED_PROJECT.project_uuid,
        user.user_id,
        parentSpaceUuid,
    );

    // Create all table calculation test charts in the child space
    const chartUuids = await createTableCalcTestCharts(
        savedChartModel,
        childSpaceUuid,
    );

    // Create dashboard with all charts
    await createTableCalcTestsDashboard(knex, childSpaceUuid, chartUuids);
}
