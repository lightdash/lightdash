/* eslint-disable no-console */
// Spike: inserts composer v2 artifacts (runQuery-style viz over column
// references) into a local thread. Prints a /minimal URL per example.
// Run: direnv exec . pnpm -F backend exec tsx src/scripts/dev/seedComposerVizSpike.ts
import {
    QuerySourceType,
    type AiComposerChartArtifactConfigV2,
    type ComposerBuiltinVizConfig,
    type ComposerRunQueryVizConfig,
    type SourceQuery,
} from '@lightdash/common';
import knex from 'knex';

const PROJECT_UUID = '3675b69e-8324-4110-bdca-059031aa8da3';
const THREAD_UUID =
    process.env.SPIKE_THREAD_UUID ?? 'feabd0de-68d4-45b0-acf9-6bfc8ba2d71a';
const SITE_URL = process.env.SITE_URL ?? 'http://localhost:3000';

const builtin = (
    config: Partial<ComposerBuiltinVizConfig> &
        Pick<ComposerBuiltinVizConfig, 'defaultVizType'>,
): ComposerBuiltinVizConfig => ({
    xAxisDimension: null,
    yAxisMetrics: null,
    groupBy: null,
    xAxisType: null,
    stackBars: null,
    lineType: null,
    xAxisLabel: '',
    yAxisLabel: '',
    secondaryYAxisMetric: null,
    secondaryYAxisLabel: null,
    ...config,
});

const ordersByMonthStatus: SourceQuery = {
    sourceType: QuerySourceType.SEMANTIC_LAYER,
    nodeId: 'orders_month_status',
    title: 'Orders by month and status',
    exploreName: 'orders',
    dimensions: ['orders_order_date_month', 'orders_status'],
    metrics: ['orders_unique_order_count'],
    sorts: [{ fieldId: 'orders_order_date_month', descending: false }],
    limit: 500,
};

const examples: {
    key: string;
    title: string;
    description: string;
    queries: SourceQuery[];
    terminalNodeId: string;
    vizConfig: ComposerRunQueryVizConfig;
}[] = [
    {
        key: '1-semantic-bar',
        title: 'Revenue by month',
        description: 'Lone semantic layer node, bar over a date column.',
        queries: [
            {
                sourceType: QuerySourceType.SEMANTIC_LAYER,
                nodeId: 'revenue_by_month',
                title: 'Revenue by month',
                exploreName: 'orders',
                dimensions: ['orders_order_date_month'],
                metrics: ['orders_total_order_amount'],
                sorts: [
                    { fieldId: 'orders_order_date_month', descending: false },
                ],
                limit: 500,
            },
        ],
        terminalNodeId: 'revenue_by_month',
        vizConfig: builtin({
            defaultVizType: 'bar',
            xAxisDimension: 'orders_order_date_month',
            yAxisMetrics: ['orders_total_order_amount'],
            xAxisType: 'time',
            xAxisLabel: 'Month',
            yAxisLabel: 'Revenue',
        }),
    },
    {
        key: '2a-semantic-line-groupby',
        title: 'Orders by month per status',
        description: 'Multi-series line: groupBy pivots on DuckDB.',
        queries: [ordersByMonthStatus],
        terminalNodeId: 'orders_month_status',
        vizConfig: builtin({
            defaultVizType: 'line',
            xAxisDimension: 'orders_order_date_month',
            yAxisMetrics: ['orders_unique_order_count'],
            groupBy: ['orders_status'],
            xAxisType: 'time',
            xAxisLabel: 'Month',
            yAxisLabel: 'Orders',
        }),
    },
    {
        key: '2b-semantic-stacked-bar',
        title: 'Orders by month per status (stacked)',
        description: 'Stacked bar: groupBy pivots on DuckDB.',
        queries: [ordersByMonthStatus],
        terminalNodeId: 'orders_month_status',
        vizConfig: builtin({
            defaultVizType: 'bar',
            xAxisDimension: 'orders_order_date_month',
            yAxisMetrics: ['orders_unique_order_count'],
            groupBy: ['orders_status'],
            xAxisType: 'time',
            stackBars: true,
            xAxisLabel: 'Month',
            yAxisLabel: 'Orders',
        }),
    },
    {
        key: '3-sql-horizontal',
        title: 'Revenue by payment method',
        description: 'Warehouse SQL node, horizontal bar.',
        queries: [
            {
                sourceType: QuerySourceType.SQL,
                nodeId: 'revenue_by_method',
                title: 'Revenue by payment method',
                sql: 'SELECT payment_method AS method, SUM(amount) AS revenue FROM jaffle.payments GROUP BY 1 ORDER BY 2 DESC',
                limit: 100,
            },
        ],
        terminalNodeId: 'revenue_by_method',
        vizConfig: builtin({
            defaultVizType: 'horizontal',
            xAxisDimension: 'method',
            yAxisMetrics: ['revenue'],
            xAxisType: 'category',
            xAxisLabel: 'Payment method',
            yAxisLabel: 'Revenue',
        }),
    },
    {
        key: '4-duckdb-area',
        title: 'Cumulative revenue',
        description: 'Semantic node + DuckDB running total, area line.',
        queries: [
            {
                sourceType: QuerySourceType.SEMANTIC_LAYER,
                nodeId: 'daily_revenue',
                title: 'Revenue by week',
                exploreName: 'orders',
                dimensions: ['orders_order_date_week'],
                metrics: ['orders_total_order_amount'],
                limit: 1000,
            },
            {
                sourceType: QuerySourceType.DUCKDB,
                nodeId: 'cumulative_revenue',
                title: 'Cumulative revenue',
                sql: 'SELECT orders_order_date_week AS week_start, orders_total_order_amount AS weekly_revenue, SUM(orders_total_order_amount) OVER (ORDER BY orders_order_date_week) AS cumulative_revenue FROM daily_revenue ORDER BY 1',
                references: ['daily_revenue'],
            },
        ],
        terminalNodeId: 'cumulative_revenue',
        vizConfig: builtin({
            defaultVizType: 'line',
            xAxisDimension: 'week_start',
            yAxisMetrics: ['cumulative_revenue'],
            xAxisType: 'time',
            lineType: 'area',
            xAxisLabel: 'Week',
            yAxisLabel: 'Cumulative revenue',
        }),
    },
    {
        key: '5a-duckdb-pie',
        title: 'Order share by source',
        description: 'DuckDB over a semantic node, pie.',
        queries: [
            {
                sourceType: QuerySourceType.SEMANTIC_LAYER,
                nodeId: 'orders_by_source',
                title: 'Orders by source',
                exploreName: 'orders',
                dimensions: ['orders_order_source'],
                metrics: ['orders_unique_order_count'],
                limit: 100,
            },
            {
                sourceType: QuerySourceType.DUCKDB,
                nodeId: 'source_share',
                title: 'Source share',
                sql: "SELECT COALESCE(orders_order_source, 'unknown') AS order_source, orders_unique_order_count AS orders FROM orders_by_source",
                references: ['orders_by_source'],
            },
        ],
        terminalNodeId: 'source_share',
        vizConfig: builtin({
            defaultVizType: 'pie',
            xAxisDimension: 'order_source',
            yAxisMetrics: ['orders'],
        }),
    },
    {
        key: '5b-duckdb-table',
        title: 'Order KPIs',
        description:
            'DuckDB single-row summary, table (runQuery has no big number).',
        queries: [
            {
                sourceType: QuerySourceType.SEMANTIC_LAYER,
                nodeId: 'orders_by_status',
                title: 'Orders by status',
                exploreName: 'orders',
                dimensions: ['orders_status'],
                metrics: [
                    'orders_unique_order_count',
                    'orders_total_order_amount',
                ],
                limit: 100,
            },
            {
                sourceType: QuerySourceType.DUCKDB,
                nodeId: 'order_kpis',
                title: 'Order KPIs',
                sql: 'SELECT orders_status AS status, orders_unique_order_count AS orders, orders_total_order_amount AS revenue, ROUND(orders_total_order_amount / orders_unique_order_count, 2) AS avg_order_value FROM orders_by_status ORDER BY revenue DESC',
                references: ['orders_by_status'],
            },
        ],
        terminalNodeId: 'order_kpis',
        vizConfig: builtin({ defaultVizType: 'table' }),
    },
    {
        key: '6a-scatter',
        title: 'Shipping cost vs order amount',
        description: 'Warehouse SQL node, scatter of two numeric columns.',
        queries: [
            {
                sourceType: QuerySourceType.SQL,
                nodeId: 'customer_points',
                title: 'Orders',
                sql: 'SELECT shipping_cost, amount AS order_amount FROM jaffle.orders WHERE shipping_cost IS NOT NULL AND amount IS NOT NULL',
                limit: 1000,
            },
        ],
        terminalNodeId: 'customer_points',
        vizConfig: builtin({
            defaultVizType: 'scatter',
            xAxisDimension: 'shipping_cost',
            yAxisMetrics: ['order_amount'],
            xAxisType: 'category',
            xAxisLabel: 'Shipping cost',
            yAxisLabel: 'Order amount',
        }),
    },
    {
        key: '6b-funnel',
        title: 'Order fulfilment funnel',
        description: 'DuckDB stage counts over a semantic node, funnel.',
        queries: [
            {
                sourceType: QuerySourceType.SEMANTIC_LAYER,
                nodeId: 'status_counts',
                title: 'Orders by status',
                exploreName: 'orders',
                dimensions: ['orders_status'],
                metrics: ['orders_unique_order_count'],
                limit: 100,
            },
            {
                sourceType: QuerySourceType.DUCKDB,
                nodeId: 'funnel_stages',
                title: 'Funnel stages',
                sql: "SELECT stage, orders FROM (SELECT 1 AS n, 'placed' AS stage, SUM(orders_unique_order_count) AS orders FROM status_counts UNION ALL SELECT 2, 'shipped', SUM(orders_unique_order_count) FILTER (WHERE orders_status IN ('shipped','completed','return_pending','returned')) FROM status_counts UNION ALL SELECT 3, 'completed', SUM(orders_unique_order_count) FILTER (WHERE orders_status IN ('completed','return_pending','returned')) FROM status_counts) ORDER BY n",
                references: ['status_counts'],
            },
        ],
        terminalNodeId: 'funnel_stages',
        vizConfig: builtin({
            defaultVizType: 'funnel',
            xAxisDimension: 'stage',
            yAxisMetrics: ['orders'],
        }),
    },
    {
        key: '7-custom-chart-type',
        title: 'Orders share over time (stream graph)',
        description:
            'Custom chart type over a semantic node with a series slot.',
        queries: [ordersByMonthStatus],
        terminalNodeId: 'orders_month_status',
        vizConfig: {
            customChartTypeSlug: 'share-over-time-stream-graph',
            dataAppVizUuid: '69e24018-8802-4c75-966a-6dfe4c484686',
            dataAppVizVersion: 1,
            fieldMapping: {
                time: 'orders_order_date_month',
                series: 'orders_status',
                value: 'orders_unique_order_count',
            },
            options: null,
        },
    },
];

const main = async () => {
    const db = knex({
        client: 'pg',
        connection: process.env.PGCONNECTIONURI,
    });
    try {
        const thread = await db('ai_thread')
            .where({ ai_thread_uuid: THREAD_UUID })
            .first('agent_uuid', 'project_uuid');
        if (!thread || thread.project_uuid !== PROJECT_UUID) {
            throw new Error(`Thread ${THREAD_UUID} not in Jaffle shop`);
        }
        /* eslint-disable no-await-in-loop */
        for (const example of examples) {
            const config: AiComposerChartArtifactConfigV2 = {
                source: 'composer',
                schemaVersion: 2,
                queries: example.queries,
                terminalNodeId: example.terminalNodeId,
                vizConfig: example.vizConfig,
            };
            const [artifact] = await db('ai_artifacts')
                .insert({ ai_thread_uuid: THREAD_UUID, artifact_type: 'chart' })
                .returning('ai_artifact_uuid');
            const [version] = await db('ai_artifact_versions')
                .insert({
                    ai_artifact_uuid: artifact.ai_artifact_uuid,
                    version_number: 1,
                    title: example.title,
                    description: example.description,
                    chart_config: config,
                })
                .returning('ai_artifact_version_uuid');
            console.log(
                `${example.key}\t${SITE_URL}/minimal/projects/${PROJECT_UUID}/ai-agents/${thread.agent_uuid}/artifacts/${artifact.ai_artifact_uuid}/versions/${version.ai_artifact_version_uuid}`,
            );
        }
        /* eslint-enable no-await-in-loop */
    } finally {
        await db.destroy();
    }
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
