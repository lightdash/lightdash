import {
    ChartKind,
    ChartType,
    DashboardTileTypes,
    generateSlug,
    MetricType,
    QuerySourceType,
    SAVED_COMPOSER_PIPELINE_SCHEMA_VERSION,
    SEED_COMPOSER_CHART,
    SEED_COMPOSER_CHART_DASHBOARD,
    SEED_ORG_1_ADMIN,
    SEED_PROJECT,
    toTimezoneSetting,
    type SavedComposerPipeline,
} from '@lightdash/common';
import { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import { DashboardModel } from '../../../models/DashboardModel/DashboardModel';
import { SpaceModel } from '../../../models/SpaceModel';
import {
    SavedChartsTableName,
    SavedChartVersionsTableName,
} from '../../entities/savedCharts';

// Rows are written directly: the saved chart model gains a composer writer
// with the save-to-dashboard step.
type SeedComposerChart = {
    name: string;
    chartKind: ChartKind;
    chartType: ChartType;
    chartConfig: Record<string, unknown>;
    pipeline: SavedComposerPipeline;
};

const revenueShare: SeedComposerChart = {
    name: SEED_COMPOSER_CHART.revenueShare,
    chartKind: ChartKind.VERTICAL_BAR,
    chartType: ChartType.CARTESIAN,
    chartConfig: {
        layout: {
            xField: 'composer_result_orders_status',
            yField: ['composer_result_revenue_share'],
        },
        eChartsConfig: {
            series: [
                {
                    type: 'bar',
                    encode: {
                        xRef: { field: 'composer_result_orders_status' },
                        yRef: { field: 'composer_result_revenue_share' },
                    },
                },
            ],
        },
    },
    pipeline: {
        schemaVersion: SAVED_COMPOSER_PIPELINE_SCHEMA_VERSION,
        nodes: [
            {
                sourceType: QuerySourceType.SEMANTIC_LAYER,
                nodeId: 'orders',
                title: 'Revenue by order status',
                exploreName: 'orders',
                dimensions: ['orders_status'],
                metrics: ['orders_total_order_amount', 'orders_amount_x2'],
                additionalMetrics: [
                    {
                        name: 'amount_x2',
                        label: 'Amount x2',
                        table: 'orders',
                        type: MetricType.SUM,
                        sql: '${TABLE}.amount * 2',
                        baseDimensionName: 'amount',
                    },
                ],
                sorts: [{ fieldId: 'orders_status', descending: false }],
                limit: 500,
            },
            {
                sourceType: QuerySourceType.DUCKDB,
                nodeId: 'revenue_share',
                title: 'Revenue share',
                sql: [
                    'SELECT orders_status, orders_total_order_amount, orders_amount_x2,',
                    '  orders_total_order_amount / SUM(orders_total_order_amount) OVER () AS revenue_share',
                    'FROM orders',
                    'ORDER BY orders_status',
                ].join('\n'),
                references: ['orders'],
                limit: 100,
            },
        ],
        terminalNodeId: 'revenue_share',
    },
};

const insertComposerChart = async (
    knex: Knex,
    dashboardUuid: string,
    chart: SeedComposerChart,
): Promise<string> => {
    const [{ saved_query_id: savedQueryId, saved_query_uuid: savedQueryUuid }] =
        await knex(SavedChartsTableName)
            .insert({
                name: chart.name,
                description: 'Seeded composer chart',
                slug: generateSlug(chart.name),
                last_version_chart_kind: chart.chartKind,
                last_version_updated_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
                color_palette_uuid: null,
                project_uuid: SEED_PROJECT.project_uuid,
                space_id: null,
                dashboard_uuid: dashboardUuid,
            })
            .returning(['saved_query_id', 'saved_query_uuid']);
    const terminalNode = chart.pipeline.nodes.find(
        (node) => node.nodeId === chart.pipeline.terminalNodeId,
    );
    await knex(SavedChartVersionsTableName).insert({
        saved_query_id: savedQueryId,
        explore_name: null,
        pipeline: chart.pipeline,
        filters: {},
        row_limit: terminalNode?.limit ?? 500,
        chart_type: chart.chartType,
        chart_config: chart.chartConfig,
        pivot_dimensions: null,
        pivot_rows: null,
        metric_overrides: null,
        dimension_overrides: null,
        parameters: null,
        updated_by_user_uuid: SEED_ORG_1_ADMIN.user_uuid,
        timezone: toTimezoneSetting(undefined),
        agent_identity: null,
    });
    return savedQueryUuid;
};

export async function seed(knex: Knex): Promise<void> {
    const dashboardModel = new DashboardModel({ database: knex });
    const spaceModel = new SpaceModel({ database: knex });

    const [seedSpace] = await spaceModel.find({
        projectUuid: SEED_PROJECT.project_uuid,
        slug: 'jaffle-shop',
    });
    const spaceUuid = seedSpace?.uuid;
    if (!spaceUuid) throw new Error('No space found for seeding');

    const dashboard = await dashboardModel.create(
        spaceUuid,
        {
            name: SEED_COMPOSER_CHART_DASHBOARD.name,
            tiles: [],
            filters: undefined,
            tabs: [],
            slug: SEED_COMPOSER_CHART_DASHBOARD.slug,
        },
        { userUuid: SEED_ORG_1_ADMIN.user_uuid },
        SEED_PROJECT.project_uuid,
    );

    const savedChartUuid = await insertComposerChart(
        knex,
        dashboard.uuid,
        revenueShare,
    );

    await dashboardModel.addVersion(
        dashboard.uuid,
        {
            tiles: [
                {
                    uuid: uuidv4(),
                    x: 0,
                    y: 0,
                    w: 24,
                    h: 9,
                    type: DashboardTileTypes.SAVED_CHART,
                    tabUuid: undefined,
                    properties: { savedChartUuid },
                },
            ],
            filters: undefined,
            tabs: [],
            updatedByUser: { userUuid: SEED_ORG_1_ADMIN.user_uuid },
        },
        { userUuid: SEED_ORG_1_ADMIN.user_uuid },
        SEED_PROJECT.project_uuid,
    );
}
