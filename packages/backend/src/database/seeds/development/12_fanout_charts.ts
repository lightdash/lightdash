/**
 * Seed file to create Fanout test charts for SQL generation testing.
 * Creates 8 charts covering:
 * - Inflated vs safe metrics (COUNT vs COUNT_DISTINCT)
 * - Multiple join depths (1, 2, 3+ levels)
 * - All relationship types (one-to-many, many-to-many, many-to-one, one-to-one)
 */
import {
    CartesianSeriesType,
    ChartType,
    CreateDashboardChartTile,
    DashboardTileTypes,
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

const PARENT_SPACE_NAME = '[Test SQL Generation]';
const CHILD_SPACE_NAME = '[Fanouts]';

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

async function createFanoutTestCharts(
    savedChartModel: SavedChartModel,
    spaceUuid: string,
): Promise<ChartUuids> {
    const updatedByUser = {
        userUuid: SEED_ORG_1_ADMIN.user_uuid,
        firstName: SEED_ORG_1_ADMIN.first_name,
        lastName: SEED_ORG_1_ADMIN.last_name,
    };

    const chartUuids: ChartUuids = {};

    // Chart 1: Safe Account Count (TABLE) - COUNT_DISTINCT is safe aggregation
    const chart1 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[Fanout] Safe Account Count'),
            name: '[Fanout] Safe Account Count',
            description:
                'Tests COUNT_DISTINCT - safe aggregation that does not inflate with joins',
            tableName: 'fanouts_accounts',
            metricQuery: {
                exploreName: 'fanouts_accounts',
                dimensions: ['fanouts_accounts_segment'],
                metrics: ['fanouts_accounts_unique_accounts'],
                filters: {},
                sorts: [
                    {
                        fieldId: 'fanouts_accounts_unique_accounts',
                        descending: true,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: undefined,
            },
            tableConfig: {
                columnOrder: [
                    'fanouts_accounts_segment',
                    'fanouts_accounts_unique_accounts',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.safeAccountCount = chart1.uuid;

    // Chart 2: One-to-Many Deals (BAR) - accounts -> deals relationship
    const chart2 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[Fanout] One-to-Many Deals'),
            name: '[Fanout] One-to-Many Deals',
            description:
                'Tests one-to-many join: accounts -> deals relationship',
            tableName: 'fanouts_accounts',
            metricQuery: {
                exploreName: 'fanouts_accounts',
                dimensions: ['fanouts_accounts_segment'],
                metrics: [
                    'fanouts_accounts_unique_accounts',
                    'fanouts_deals_total_deal_value',
                ],
                filters: {},
                sorts: [
                    {
                        fieldId: 'fanouts_deals_total_deal_value',
                        descending: true,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.CARTESIAN,
                config: {
                    layout: {
                        xField: 'fanouts_accounts_segment',
                        yField: [
                            'fanouts_accounts_unique_accounts',
                            'fanouts_deals_total_deal_value',
                        ],
                        flipAxes: false,
                    },
                    eChartsConfig: {
                        series: [
                            {
                                type: CartesianSeriesType.BAR,
                                encode: {
                                    xRef: { field: 'fanouts_accounts_segment' },
                                    yRef: {
                                        field: 'fanouts_accounts_unique_accounts',
                                    },
                                },
                                yAxisIndex: 0,
                            },
                            {
                                type: CartesianSeriesType.BAR,
                                encode: {
                                    xRef: { field: 'fanouts_accounts_segment' },
                                    yRef: {
                                        field: 'fanouts_deals_total_deal_value',
                                    },
                                },
                                yAxisIndex: 1,
                            },
                        ],
                    },
                },
            },
            tableConfig: {
                columnOrder: [
                    'fanouts_accounts_segment',
                    'fanouts_accounts_unique_accounts',
                    'fanouts_deals_total_deal_value',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.oneToManyDeals = chart2.uuid;

    // Chart 3: Many-to-Many Users (TABLE) - accounts -> users via deals.stage='Won'
    const chart3 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[Fanout] Many-to-Many Users'),
            name: '[Fanout] Many-to-Many Users',
            description:
                'Tests many-to-many join: accounts -> users (via deals stage=Won)',
            tableName: 'fanouts_accounts',
            metricQuery: {
                exploreName: 'fanouts_accounts',
                dimensions: ['fanouts_accounts_account_name'],
                metrics: [
                    'fanouts_accounts_unique_accounts',
                    'fanouts_users_unique_user_count',
                ],
                filters: {},
                sorts: [
                    {
                        fieldId: 'fanouts_users_unique_user_count',
                        descending: true,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: undefined,
            },
            tableConfig: {
                columnOrder: [
                    'fanouts_accounts_account_name',
                    'fanouts_accounts_unique_accounts',
                    'fanouts_users_unique_user_count',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.manyToManyUsers = chart3.uuid;

    // Chart 4: 3-Level Chain (LINE) - accounts -> deals -> users -> tracks
    const chart4 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[Fanout] 3-Level Chain'),
            name: '[Fanout] 3-Level Chain',
            description:
                'Tests 3-level join chain: accounts -> deals -> users -> tracks',
            tableName: 'fanouts_accounts',
            metricQuery: {
                exploreName: 'fanouts_accounts',
                dimensions: ['fanouts_tracks_timestamp_month'],
                metrics: [
                    'fanouts_accounts_unique_accounts',
                    'fanouts_tracks_event_count',
                ],
                filters: {},
                sorts: [
                    {
                        fieldId: 'fanouts_tracks_timestamp_month',
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
                        xField: 'fanouts_tracks_timestamp_month',
                        yField: [
                            'fanouts_accounts_unique_accounts',
                            'fanouts_tracks_event_count',
                        ],
                        flipAxes: false,
                    },
                    eChartsConfig: {
                        series: [
                            {
                                type: CartesianSeriesType.LINE,
                                encode: {
                                    xRef: {
                                        field: 'fanouts_tracks_timestamp_month',
                                    },
                                    yRef: {
                                        field: 'fanouts_accounts_unique_accounts',
                                    },
                                },
                                yAxisIndex: 0,
                            },
                            {
                                type: CartesianSeriesType.LINE,
                                encode: {
                                    xRef: {
                                        field: 'fanouts_tracks_timestamp_month',
                                    },
                                    yRef: {
                                        field: 'fanouts_tracks_event_count',
                                    },
                                },
                                yAxisIndex: 1,
                            },
                        ],
                    },
                },
            },
            tableConfig: {
                columnOrder: [
                    'fanouts_tracks_timestamp_month',
                    'fanouts_accounts_unique_accounts',
                    'fanouts_tracks_event_count',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.threeLevelChain = chart4.uuid;

    // Chart 5: Junction Table (TABLE) - user_deals junction table pattern
    const chart5 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[Fanout] Junction Table'),
            name: '[Fanout] Junction Table',
            description:
                'Tests junction table pattern: accounts -> deals -> user_deals -> users',
            tableName: 'fanouts_accounts_bridged_fanout',
            metricQuery: {
                exploreName: 'fanouts_accounts_bridged_fanout',
                dimensions: ['fanouts_user_deals_role'],
                metrics: [
                    'fanouts_accounts_bridged_fanout_unique_accounts',
                    'fanouts_users_unique_user_count',
                ],
                filters: {},
                sorts: [
                    {
                        fieldId: 'fanouts_users_unique_user_count',
                        descending: true,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: undefined,
            },
            tableConfig: {
                columnOrder: [
                    'fanouts_user_deals_role',
                    'fanouts_accounts_bridged_fanout_unique_accounts',
                    'fanouts_users_unique_user_count',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.junctionTable = chart5.uuid;

    // Chart 6: Inflated vs Safe (TABLE) - Educational: COUNT vs COUNT_DISTINCT
    const chart6 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[Fanout] Inflated vs Safe'),
            name: '[Fanout] Inflated vs Safe',
            description:
                'Educational: Shows COUNT (inflated) vs COUNT_DISTINCT (safe) side-by-side',
            tableName: 'fanouts_accounts_bridged_fanout',
            metricQuery: {
                exploreName: 'fanouts_accounts_bridged_fanout',
                dimensions: ['fanouts_accounts_bridged_fanout_segment'],
                metrics: [
                    'fanouts_accounts_bridged_fanout_unique_accounts',
                    'fanouts_accounts_bridged_fanout_inflated_account_count',
                ],
                filters: {},
                sorts: [
                    {
                        fieldId:
                            'fanouts_accounts_bridged_fanout_inflated_account_count',
                        descending: true,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: undefined,
            },
            tableConfig: {
                columnOrder: [
                    'fanouts_accounts_bridged_fanout_segment',
                    'fanouts_accounts_bridged_fanout_unique_accounts',
                    'fanouts_accounts_bridged_fanout_inflated_account_count',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.inflatedVsSafe = chart6.uuid;

    // Chart 7: One-to-One Addresses (TABLE) - users -> addresses relationship
    const chart7 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[Fanout] One-to-One Addresses'),
            name: '[Fanout] One-to-One Addresses',
            description:
                'Tests one-to-one join: users -> addresses relationship',
            tableName: 'fanouts_accounts_bridged_fanout',
            metricQuery: {
                exploreName: 'fanouts_accounts_bridged_fanout',
                dimensions: ['fanouts_addresses_city'],
                metrics: [
                    'fanouts_addresses_unique_city_count',
                    'fanouts_users_unique_user_count',
                ],
                filters: {},
                sorts: [
                    {
                        fieldId: 'fanouts_users_unique_user_count',
                        descending: true,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.TABLE,
                config: undefined,
            },
            tableConfig: {
                columnOrder: [
                    'fanouts_addresses_city',
                    'fanouts_addresses_unique_city_count',
                    'fanouts_users_unique_user_count',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.oneToOneAddresses = chart7.uuid;

    // Chart 8: Many-to-One Countries (PIE) - addresses -> countries relationship
    const chart8 = await savedChartModel.create(
        SEED_PROJECT.project_uuid,
        SEED_ORG_1_ADMIN.user_uuid,
        {
            slug: generateSlug('[Fanout] Many-to-One Countries'),
            name: '[Fanout] Many-to-One Countries',
            description:
                'Tests many-to-one join: addresses -> countries relationship',
            tableName: 'fanouts_accounts_bridged_fanout',
            metricQuery: {
                exploreName: 'fanouts_accounts_bridged_fanout',
                dimensions: ['fanouts_countries_country_name'],
                metrics: ['fanouts_accounts_bridged_fanout_unique_accounts'],
                filters: {},
                sorts: [
                    {
                        fieldId:
                            'fanouts_accounts_bridged_fanout_unique_accounts',
                        descending: true,
                    },
                ],
                limit: 500,
                tableCalculations: [],
            },
            chartConfig: {
                type: ChartType.PIE,
                config: {
                    groupFieldIds: ['fanouts_countries_country_name'],
                    metricId: 'fanouts_accounts_bridged_fanout_unique_accounts',
                    isDonut: false,
                },
            },
            tableConfig: {
                columnOrder: [
                    'fanouts_countries_country_name',
                    'fanouts_accounts_bridged_fanout_unique_accounts',
                ],
            },
            updatedByUser,
            spaceUuid,
        },
    );
    chartUuids.manyToOneCountries = chart8.uuid;

    return chartUuids;
}

async function createFanoutTestsDashboard(
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
        'safeAccountCount',
        'oneToManyDeals',
        'manyToManyUsers',
        'threeLevelChain',
        'junctionTable',
        'inflatedVsSafe',
        'oneToOneAddresses',
        'manyToOneCountries',
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
            name: 'Fanout Tests Dashboard',
            slug: generateSlug('Fanout Tests Dashboard'),
            description:
                'Dashboard containing Fanout test charts for SQL generation verification - tests inflated vs safe metrics across various join patterns',
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

    // Get or create the [Fanouts] child space
    const childSpaceUuid = await getOrCreateSpaceByName(
        knex,
        spaceModel,
        CHILD_SPACE_NAME,
        SEED_PROJECT.project_uuid,
        user.user_id,
        parentSpaceUuid,
    );

    // Create all fanout test charts in the child space
    const chartUuids = await createFanoutTestCharts(
        savedChartModel,
        childSpaceUuid,
    );

    // Create dashboard with all charts
    await createFanoutTestsDashboard(knex, childSpaceUuid, chartUuids);
}
