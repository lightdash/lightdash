/**
 * Seed file to create Period-over-Period (POP) test charts for SQL generation testing.
 * Creates 5 charts covering different POP granularities to verify getIntervalSyntax() fix for Athena/Trino.
 */
import {
    buildPopAdditionalMetric,
    CartesianSeriesType,
    ChartType,
    CreateDashboardChartTile,
    DashboardTileTypes,
    generateSlug,
    isExploreError,
    Metric,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
    TimeFrames,
} from '@lightdash/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { lightdashConfig } from '../../../config/lightdashConfig';
import { ChangesetModel } from '../../../models/ChangesetModel';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { ProjectModel } from '../../../models/ProjectModel/ProjectModel';
import { SavedChartModel } from '../../../models/SavedChartModel';
import { SpaceModel } from '../../../models/SpaceModel';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';

const PARENT_SPACE_NAME = '[Test SQL Generation]';
const CHILD_SPACE_NAME = '[Period Over Period]';

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

/**
 * Helper to get a metric from an explore by fetching the explore from cache
 */
async function getMetricFromExplore(
    projectModel: ProjectModel,
    exploreName: string,
    tableName: string,
    metricName: string,
): Promise<Metric> {
    const explore = await projectModel.getExploreFromCache(
        SEED_PROJECT.project_uuid,
        exploreName,
    );
    if (isExploreError(explore)) {
        throw new Error(
            `Failed to get explore ${exploreName}: ${explore.errors[0]?.message}`,
        );
    }
    const table = explore.tables[tableName];
    if (!table) {
        throw new Error(`Table ${tableName} not found in explore`);
    }
    const metric = table.metrics[metricName];
    if (!metric) {
        throw new Error(`Metric ${metricName} not found in table ${tableName}`);
    }
    return metric;
}

type ChartUuids = Record<string, string>;

async function createPopTestCharts(
    savedChartModel: SavedChartModel,
    spaceUuid: string,
    projectModel: ProjectModel,
): Promise<ChartUuids> {
    const updatedByUser = {
        userUuid: SEED_ORG_1_ADMIN.user_uuid,
        firstName: SEED_ORG_1_ADMIN.first_name,
        lastName: SEED_ORG_1_ADMIN.last_name,
    };

    const chartUuids: ChartUuids = {};

    // Chart 1: [POP Test] Orders - Day
    const metric1 = await getMetricFromExplore(
        projectModel,
        'orders',
        'orders',
        'total_order_amount',
    );
    const { additionalMetric: popMetric1, metricId: popMetricId1 } =
        buildPopAdditionalMetric({
            metric: metric1,
            timeDimensionId: 'orders_order_date_day',
            granularity: TimeFrames.DAY,
            periodOffset: 1,
        });
    const chart1 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[POP Test] Orders - Day'),
            name: '[POP Test] Orders - Day',
            description:
                'Tests POP with DAY granularity on orders model. Verifies getIntervalSyntax() for Athena/Trino.',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_order_date_day'],
                metrics: ['orders_total_order_amount', popMetricId1],
                filters: {},
                sorts: [
                    { fieldId: 'orders_order_date_day', descending: false },
                ],
                limit: 500,
                tableCalculations: [],
                additionalMetrics: [popMetric1],
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        xField: 'orders_order_date_day',
                        yField: ['orders_total_order_amount', popMetricId1],
                        flipAxes: false,
                    },
                    eChartsConfig: {
                        series: [
                            {
                                type: CartesianSeriesType.LINE,
                                encode: {
                                    xRef: { field: 'orders_order_date_day' },
                                    yRef: {
                                        field: 'orders_total_order_amount',
                                    },
                                },
                                yAxisIndex: 0,
                            },
                            {
                                type: CartesianSeriesType.LINE,
                                encode: {
                                    xRef: { field: 'orders_order_date_day' },
                                    yRef: { field: popMetricId1 },
                                },
                                yAxisIndex: 0,
                            },
                        ],
                    },
                },
            },
            tableConfig: {
                columnOrder: [
                    'orders_order_date_day',
                    'orders_total_order_amount',
                    popMetricId1,
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.popDay = chart1.uuid;

    // Chart 2: [POP Test] Subscriptions - Week
    const metric2 = await getMetricFromExplore(
        projectModel,
        'subscriptions',
        'subscriptions',
        'total_monthly_mrr',
    );
    const { additionalMetric: popMetric2, metricId: popMetricId2 } =
        buildPopAdditionalMetric({
            metric: metric2,
            timeDimensionId: 'subscriptions_subscription_start_week',
            granularity: TimeFrames.WEEK,
            periodOffset: 1,
        });
    const chart2 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[POP Test] Subscriptions - Week'),
            name: '[POP Test] Subscriptions - Week',
            description:
                'Tests POP with WEEK granularity on subscriptions model. Verifies getIntervalSyntax() for Athena/Trino.',
            tableName: 'subscriptions',
            metricQuery: {
                exploreName: 'subscriptions',
                dimensions: ['subscriptions_subscription_start_week'],
                metrics: ['subscriptions_total_monthly_mrr', popMetricId2],
                filters: {},
                sorts: [
                    {
                        fieldId: 'subscriptions_subscription_start_week',
                        descending: false,
                    },
                ],
                limit: 500,
                tableCalculations: [],
                additionalMetrics: [popMetric2],
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        xField: 'subscriptions_subscription_start_week',
                        yField: [
                            'subscriptions_total_monthly_mrr',
                            popMetricId2,
                        ],
                        flipAxes: false,
                    },
                    eChartsConfig: {
                        series: [
                            {
                                type: CartesianSeriesType.LINE,
                                encode: {
                                    xRef: {
                                        field: 'subscriptions_subscription_start_week',
                                    },
                                    yRef: {
                                        field: 'subscriptions_total_monthly_mrr',
                                    },
                                },
                                yAxisIndex: 0,
                            },
                            {
                                type: CartesianSeriesType.LINE,
                                encode: {
                                    xRef: {
                                        field: 'subscriptions_subscription_start_week',
                                    },
                                    yRef: { field: popMetricId2 },
                                },
                                yAxisIndex: 0,
                            },
                        ],
                    },
                },
            },
            tableConfig: {
                columnOrder: [
                    'subscriptions_subscription_start_week',
                    'subscriptions_total_monthly_mrr',
                    popMetricId2,
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.popWeek = chart2.uuid;

    // Chart 3: [POP Test] Orders - Month
    const metric3 = await getMetricFromExplore(
        projectModel,
        'orders',
        'orders',
        'unique_order_count',
    );
    const { additionalMetric: popMetric3, metricId: popMetricId3 } =
        buildPopAdditionalMetric({
            metric: metric3,
            timeDimensionId: 'orders_order_date_month',
            granularity: TimeFrames.MONTH,
            periodOffset: 1,
        });
    const chart3 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[POP Test] Orders - Month'),
            name: '[POP Test] Orders - Month',
            description:
                'Tests POP with MONTH granularity on orders model. Verifies getIntervalSyntax() for Athena/Trino.',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_order_date_month'],
                metrics: ['orders_unique_order_count', popMetricId3],
                filters: {},
                sorts: [
                    { fieldId: 'orders_order_date_month', descending: false },
                ],
                limit: 500,
                tableCalculations: [],
                additionalMetrics: [popMetric3],
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        xField: 'orders_order_date_month',
                        yField: ['orders_unique_order_count', popMetricId3],
                        flipAxes: false,
                    },
                    eChartsConfig: {
                        series: [
                            {
                                type: CartesianSeriesType.LINE,
                                encode: {
                                    xRef: { field: 'orders_order_date_month' },
                                    yRef: {
                                        field: 'orders_unique_order_count',
                                    },
                                },
                                yAxisIndex: 0,
                            },
                            {
                                type: CartesianSeriesType.LINE,
                                encode: {
                                    xRef: { field: 'orders_order_date_month' },
                                    yRef: { field: popMetricId3 },
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
                    'orders_unique_order_count',
                    popMetricId3,
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.popMonth = chart3.uuid;

    // Chart 4: [POP Test] Orders - Quarter
    const metric4 = await getMetricFromExplore(
        projectModel,
        'orders',
        'orders',
        'average_order_size',
    );
    const { additionalMetric: popMetric4, metricId: popMetricId4 } =
        buildPopAdditionalMetric({
            metric: metric4,
            timeDimensionId: 'orders_order_date_month',
            granularity: TimeFrames.QUARTER,
            periodOffset: 1,
        });
    const chart4 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[POP Test] Orders - Quarter'),
            name: '[POP Test] Orders - Quarter',
            description:
                'Tests POP with QUARTER granularity on orders model. Verifies QUARTER → MONTH conversion in Trino/Athena getIntervalSyntax().',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_order_date_month'],
                metrics: ['orders_average_order_size', popMetricId4],
                filters: {},
                sorts: [
                    { fieldId: 'orders_order_date_month', descending: false },
                ],
                limit: 500,
                tableCalculations: [],
                additionalMetrics: [popMetric4],
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        xField: 'orders_order_date_month',
                        yField: ['orders_average_order_size', popMetricId4],
                        flipAxes: false,
                    },
                    eChartsConfig: {
                        series: [
                            {
                                type: CartesianSeriesType.LINE,
                                encode: {
                                    xRef: { field: 'orders_order_date_month' },
                                    yRef: {
                                        field: 'orders_average_order_size',
                                    },
                                },
                                yAxisIndex: 0,
                            },
                            {
                                type: CartesianSeriesType.LINE,
                                encode: {
                                    xRef: { field: 'orders_order_date_month' },
                                    yRef: { field: popMetricId4 },
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
                    'orders_average_order_size',
                    popMetricId4,
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.popQuarter = chart4.uuid;

    // Chart 5: [POP Test] Orders - Year
    const metric5 = await getMetricFromExplore(
        projectModel,
        'orders',
        'orders',
        'total_order_amount',
    );
    const { additionalMetric: popMetric5, metricId: popMetricId5 } =
        buildPopAdditionalMetric({
            metric: metric5,
            timeDimensionId: 'orders_order_date_year',
            granularity: TimeFrames.YEAR,
            periodOffset: 1,
        });
    const chart5 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[POP Test] Orders - Year'),
            name: '[POP Test] Orders - Year',
            description:
                'Tests POP with YEAR granularity on orders model. Verifies getIntervalSyntax() for Athena/Trino.',
            tableName: 'orders',
            metricQuery: {
                exploreName: 'orders',
                dimensions: ['orders_order_date_year'],
                metrics: ['orders_total_order_amount', popMetricId5],
                filters: {},
                sorts: [
                    {
                        fieldId: 'orders_order_date_year',
                        descending: false,
                    },
                ],
                limit: 500,
                tableCalculations: [],
                additionalMetrics: [popMetric5],
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        xField: 'orders_order_date_year',
                        yField: ['orders_total_order_amount', popMetricId5],
                        flipAxes: false,
                    },
                    eChartsConfig: {
                        series: [
                            {
                                type: CartesianSeriesType.LINE,
                                encode: {
                                    xRef: {
                                        field: 'orders_order_date_year',
                                    },
                                    yRef: {
                                        field: 'orders_total_order_amount',
                                    },
                                },
                                yAxisIndex: 0,
                            },
                            {
                                type: CartesianSeriesType.LINE,
                                encode: {
                                    xRef: {
                                        field: 'orders_order_date_year',
                                    },
                                    yRef: { field: popMetricId5 },
                                },
                                yAxisIndex: 0,
                            },
                        ],
                    },
                },
            },
            tableConfig: {
                columnOrder: [
                    'orders_order_date_year',
                    'orders_total_order_amount',
                    popMetricId5,
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.popYear = chart5.uuid;

    return chartUuids;
}

async function createPopTestsDashboard(
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
        'popDay',
        'popWeek',
        'popMonth',
        'popQuarter',
        'popYear',
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
            name: 'POP Tests Dashboard',
            slug: generateSlug('POP Tests Dashboard'),
            description:
                'Dashboard containing Period-over-Period test charts for SQL generation verification on Athena/Trino',
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

    const encryptionUtil = new EncryptionUtil({ lightdashConfig });
    const changesetModel = new ChangesetModel({ database: knex });
    const projectModel = new ProjectModel({
        database: knex,
        lightdashConfig,
        encryptionUtil,
        changesetModel,
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

    // Get or create the [Period Over Period] child space
    const childSpaceUuid = await getOrCreateSpaceByName(
        knex,
        spaceModel,
        CHILD_SPACE_NAME,
        SEED_PROJECT.project_uuid,
        user.user_id,
        parentSpaceUuid,
    );

    // Create all POP test charts in the child space
    const chartUuids = await createPopTestCharts(
        savedChartModel,
        childSpaceUuid,
        projectModel,
    );

    // Create dashboard with all charts
    await createPopTestsDashboard(knex, childSpaceUuid, chartUuids);
}
