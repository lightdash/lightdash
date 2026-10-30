import { FilterOperator, UnitOfTime } from '@lightdash/common';
import type { UsageChartSpec, UsageDashboardSpec } from './usageDashboardTypes';

const dashboardKey = 'lightdash-analytics-embed';
const embedQueries: NonNullable<UsageChartSpec['filters']> = [
    { field: 'query_events_context', values: ['embed'] },
];
const loadDescription =
    'Observed authorized embedded-dashboard fetches. Repeat fetches count; browser-cached views can be absent. These are not rendered visits or billed loads.';

export const embedChartSpecs: UsageChartSpec[] = [
    ...[
        {
            key: 'embed-loads',
            name: 'Observed dashboard loads',
            metric: 'total_loads',
            description: loadDescription,
        },
        {
            key: 'embed-viewers',
            name: 'Identified external viewers',
            metric: 'unique_viewers',
            description:
                'Distinct supplied external viewer IDs in the selected period. Missing IDs and token issuers are excluded. An ID represents the identity supplied by the embedding application, not a verified person.',
        },
        {
            key: 'embed-dashboards',
            name: 'Dashboards loaded',
            metric: 'unique_dashboards',
            description:
                'Distinct dashboards with an observed authorized embed fetch. This is not an inventory of every dashboard that can be embedded.',
        },
    ].map(
        ({ key, name, metric, description }): UsageChartSpec => ({
            key,
            name,
            description,
            explore: 'embed_reach',
            dimensions: [],
            metrics: [`embed_reach_${metric}`],
            limit: 1,
            sorts: [],
            visualization: 'number',
            timezone: 'UTC',
        }),
    ),
    {
        key: 'embed-load-trend',
        name: 'Dashboard loads each day',
        description: `${loadDescription} Missing days are not evidence of zero usage.`,
        explore: 'embed_reach',
        dimensions: ['embed_reach_event_ts_day'],
        metrics: ['embed_reach_total_loads'],
        limit: 5000,
        sorts: [{ fieldId: 'embed_reach_event_ts_day', descending: false }],
        visualization: 'line',
        timezone: 'UTC',
        fieldLabels: { embed_reach_total_loads: 'Observed loads' },
    },
    {
        key: 'embed-popular-dashboards',
        name: 'Most-loaded dashboards',
        description:
            'Top 10 dashboards by observed embed fetches. IDs keep dashboards with the same name separate; names reflect the latest captured fetch. Missing names retain their dashboard identity.',
        explore: 'embed_reach',
        dimensions: ['embed_reach_dashboard_label'],
        metrics: ['embed_reach_total_loads'],
        limit: 10,
        sorts: [{ fieldId: 'embed_reach_total_loads', descending: true }],
        visualization: 'bar',
        flipAxes: true,
        timezone: 'UTC',
        fieldLabels: { embed_reach_total_loads: 'Observed loads' },
    },
    {
        key: 'embed-identity-coverage',
        name: 'How much usage has a viewer ID?',
        description:
            'Share of observed loads with and without a supplied external viewer ID. Unidentified loads remain visible and do not become a single anonymous person. This does not measure tenant attribution.',
        explore: 'embed_reach',
        dimensions: ['embed_reach_identity_coverage'],
        metrics: ['embed_reach_total_loads'],
        limit: 10,
        sorts: [{ fieldId: 'embed_reach_total_loads', descending: true }],
        visualization: 'donut',
        timezone: 'UTC',
    },
    {
        key: 'embed-viewer-trend',
        name: 'Identified viewers each week',
        description:
            'Distinct supplied external viewer IDs per UTC week, within the selected date range. First and last weeks can be partial. Do not sum weekly distinct counts to obtain the period audience.',
        explore: 'embed_reach',
        dimensions: ['embed_reach_event_ts_week'],
        metrics: ['embed_reach_unique_viewers'],
        limit: 1000,
        sorts: [{ fieldId: 'embed_reach_event_ts_week', descending: false }],
        visualization: 'bar',
        timezone: 'UTC',
        fieldLabels: { embed_reach_unique_viewers: 'Identified viewers' },
    },
    ...[
        {
            key: 'embed-query-count',
            name: 'Recorded query attempts',
            filters: embedQueries,
            description:
                'Terminal query outcomes from embeds, including cached results and errors. Dashboard tiles and repeated queries count separately; this is not dashboard loads or billing usage.',
        },
        {
            key: 'embed-query-errors',
            name: 'Query errors',
            filters: [
                ...embedQueries,
                { field: 'query_events_status', values: ['error'] },
            ],
            description:
                'Recorded embedded-query error outcomes. Failures before query execution and browser rendering failures are not captured here.',
        },
    ].map(
        ({ key, name, filters, description }): UsageChartSpec => ({
            key,
            name,
            description,
            explore: 'query_events',
            dimensions: [],
            metrics: ['query_events_total_queries'],
            filters,
            limit: 1,
            sorts: [],
            visualization: 'number',
            timezone: 'UTC',
        }),
    ),
    {
        key: 'embed-query-trend',
        name: 'Query attempts each day',
        description:
            'Recorded embedded-query outcomes each UTC day, including cache hits and errors. One dashboard load can produce several queries. Missing days are not evidence of zero usage.',
        explore: 'query_events',
        dimensions: ['query_events_event_ts_day'],
        metrics: ['query_events_total_queries'],
        filters: embedQueries,
        limit: 5000,
        sorts: [{ fieldId: 'query_events_event_ts_day', descending: false }],
        visualization: 'line',
        timezone: 'UTC',
        fieldLabels: { query_events_total_queries: 'Query attempts' },
    },
    {
        key: 'embed-query-outcomes',
        name: 'Query outcomes',
        description:
            'Recorded success and error outcomes from embed queries. Query success does not confirm that the dashboard rendered successfully.',
        explore: 'query_events',
        dimensions: ['query_events_status'],
        metrics: ['query_events_total_queries'],
        filters: embedQueries,
        limit: 10,
        sorts: [{ fieldId: 'query_events_total_queries', descending: true }],
        visualization: 'donut',
        timezone: 'UTC',
    },
    {
        key: 'embed-query-cache',
        name: 'Cached query results',
        description:
            'Recorded cache hits (true), misses (false) and missing cache flags (∅) for embed queries. Missing flags are unknown, not misses; this does not estimate money saved.',
        explore: 'query_events',
        dimensions: ['query_events_cache_hit'],
        metrics: ['query_events_total_queries'],
        filters: embedQueries,
        limit: 10,
        sorts: [{ fieldId: 'query_events_total_queries', descending: true }],
        visualization: 'donut',
        timezone: 'UTC',
    },
    {
        key: 'embed-query-latency',
        name: 'Successful query response time (ms)',
        description:
            'Median and P95 backend time from request start for successful embed queries with recorded timing, including queueing and result storage. Excludes browser transfer/rendering, cancelled queries and missing historical timing.',
        explore: 'query_events',
        dimensions: ['query_events_event_ts_day'],
        metrics: [
            'query_events_p50_response_time_ms',
            'query_events_p95_response_time_ms',
        ],
        filters: [
            ...embedQueries,
            { field: 'query_events_status', values: ['success'] },
            {
                field: 'query_events_response_timing_basis',
                values: ['request'],
            },
            {
                field: 'query_events_response_time_ms',
                operator: FilterOperator.NOT_NULL,
                values: [],
            },
        ],
        limit: 5000,
        sorts: [{ fieldId: 'query_events_event_ts_day', descending: false }],
        visualization: 'line',
        timezone: 'UTC',
        fieldLabels: {
            query_events_p50_response_time_ms: 'Median (ms)',
            query_events_p95_response_time_ms: 'P95 (ms)',
        },
    },
];

export const embedDashboardSpec: UsageDashboardSpec = {
    key: dashboardKey,
    name: 'Embed',
    description:
        'Observed embedded-dashboard loads, external viewers and query health. Updated nightly. Tenant attribution, billing reconciliation and a complete embed dependency inventory are not included.',
    filters: {
        dimensions: [
            {
                label: 'Date',
                target: {
                    fieldId: 'embed_reach_event_ts_day',
                    tableName: 'embed_reach',
                },
                operator: FilterOperator.IN_THE_PAST,
                values: [30],
                settings: { unitOfTime: UnitOfTime.days, completed: true },
                tileTargets: Object.fromEntries(
                    embedChartSpecs.map(({ key, explore }) => [
                        `${dashboardKey}-${key}`,
                        {
                            fieldId: `${explore}_event_ts_day`,
                            tableName: explore,
                        },
                    ]),
                ),
            },
        ],
        metrics: [],
        tableCalculations: [],
    },
    tabs: [
        {
            key: 'audience',
            name: 'Audience',
            sections: [
                {
                    title: 'Who is using your embedded dashboards?',
                    description:
                        'Observed authorized dashboard fetches and supplied external viewer IDs. Reloads count; browser-cached views can be absent. These are not billed loads or proof of successful rendering. New capture only; earlier usage is not backfilled.',
                    noteHeight: 3,
                    charts: [
                        'embed-loads',
                        'embed-viewers',
                        'embed-dashboards',
                    ],
                },
                {
                    title: 'Usage over time',
                    description:
                        'Daily loads and weekly distinct identified viewers. The default period is the last 30 completed UTC days; partial weeks remain visible. Missing data is not zero usage.',
                    charts: ['embed-load-trend', 'embed-viewer-trend'],
                },
                {
                    title: 'Popular dashboards and audience coverage',
                    description:
                        'Compare the top 10 dashboards and see how often an external viewer ID is available. Anonymous loads stay in the totals. External IDs do not establish tenant membership.',
                    charts: [
                        'embed-popular-dashboards',
                        'embed-identity-coverage',
                    ],
                },
            ],
        },
        {
            key: 'query-health',
            name: 'Query health',
            sections: [
                {
                    title: 'Embedded query demand',
                    description:
                        'Queries are separate from dashboard loads: tiles, refreshes and interactions can each run queries. Historical query data can cover a different period from dashboard-load capture.',
                    charts: ['embed-query-count', 'embed-query-errors'],
                },
                {
                    title: 'Demand and response time',
                    description:
                        'Query volume and successful request-start latency. Timing includes queueing and result storage, but not browser rendering. Older events without timing are excluded from latency.',
                    charts: ['embed-query-trend', 'embed-query-latency'],
                },
                {
                    title: 'Outcomes and caching',
                    description:
                        'Technical query outcomes and cache flags. Query success does not prove a rendered dashboard; a missing cache flag is unknown, not a miss.',
                    charts: ['embed-query-outcomes', 'embed-query-cache'],
                },
            ],
        },
    ],
};
