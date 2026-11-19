import {
    ChartType,
    FilterOperator,
    UnitOfTime,
    type ChartAsCode,
} from '@lightdash/common';
import { analyticsColorPalette } from './analyticsColorPalette';
import type { UsageChartSpec, UsageDashboardSpec } from './usageDashboardTypes';

const dashboardKey = 'lightdash-analytics-embed';
const embedQueries: NonNullable<UsageChartSpec['filters']> = [
    { field: 'query_events_context', values: ['embed'] },
];

export const embedChartSpecs: UsageChartSpec[] = [
    ...[
        {
            key: 'embed-loads',
            name: 'Dashboard loads',
            metric: 'total_loads',
            description:
                'Authorized loads of embedded dashboards. Reloads count. Views served from the browser cache can be missing. A load is not a billed load, and does not prove the dashboard rendered.',
        },
        {
            key: 'embed-viewers',
            name: 'Identified external viewers',
            metric: 'unique_viewers',
            description:
                'Distinct external viewer IDs sent by your embedding application in the selected period. Loads with no ID, and token issuers, are left out. An ID is whatever identity your application sends, not a verified person.',
        },
        {
            key: 'embed-dashboards',
            name: 'Dashboards loaded',
            metric: 'unique_dashboards',
            description:
                'Distinct dashboards with at least one authorized embedded load. This is not a list of every dashboard that can be embedded.',
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
        name: 'Dashboard loads by day',
        description: '',
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
            'Top 10 dashboards by embedded loads. Dashboards with the same name are kept separate by ID. Names are from the latest recorded load. A dashboard with no name is still listed separately.',
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
        name: 'Loads with and without a viewer ID',
        description:
            'Share of loads with and without an external viewer ID. Loads with no ID are shown, and are not counted as one anonymous person. An external ID does not show which tenant a viewer belongs to.',
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
        name: 'Identified external viewers by week',
        description:
            'Distinct external viewer IDs per UTC week in the selected date range. The first and last weeks can be partial. Weekly counts cannot be added up to get viewers for the whole period.',
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
            name: 'Queries',
            filters: embedQueries,
            description:
                'Finished queries from embeds, including cached results and errors. Each tile and each repeated query counts separately. This is not dashboard loads or billed usage.',
        },
        {
            key: 'embed-query-errors',
            name: 'Query errors',
            filters: [
                ...embedQueries,
                { field: 'query_events_status', values: ['error'] },
            ],
            description:
                'Embedded queries that ended in an error. Failures before the query ran, and rendering failures in the browser, are not recorded here.',
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
        name: 'Queries by day',
        description:
            'Embedded queries per UTC day, including cache hits and errors. A day with no data is not proof of zero usage.',
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
        name: 'Queries by outcome',
        description: 'Embedded queries by success or error.',
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
        name: 'Queries by cache hit',
        description:
            'Cache hits (true), misses (false) and unknown (∅) for embedded queries. This does not estimate cost saved.',
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
        name: 'Response time for successful queries (ms)',
        description:
            'Median and P95 backend time, from the start of the request, for successful embedded queries that have timing. Includes queueing and result storage. Leaves out transfer to and rendering in the browser, cancelled queries and older queries with no timing.',
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
    description: 'Embedded dashboards, viewers and query health.',
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
                        'Loads of embedded dashboards and the external viewer IDs your application sends. Only usage since recording began is included.',
                    charts: [
                        'embed-loads',
                        'embed-viewers',
                        'embed-dashboards',
                    ],
                },
                {
                    title: 'Usage over time',
                    description:
                        'Daily loads and weekly distinct identified viewers. Missing data is not zero usage.',
                    charts: ['embed-load-trend', 'embed-viewer-trend'],
                },
                {
                    title: 'Most-loaded dashboards and viewer IDs',
                    description:
                        'The top 10 dashboards, and how often a load has an external viewer ID. Loads with no ID stay in the totals.',
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
                        'Queries are separate from dashboard loads: tiles, refreshes and interactions can each run queries. Query history can cover a different period from dashboard-load history.',
                    charts: ['embed-query-count', 'embed-query-errors'],
                },
                {
                    title: 'Queries and response time',
                    description:
                        'Queries per day, and response time for successful queries. Timing includes queueing and result storage, and stops before the browser draws the result.',
                    charts: ['embed-query-trend', 'embed-query-latency'],
                },
                {
                    title: 'Outcomes and caching',
                    description:
                        'A successful query does not prove the dashboard rendered. A missing cache flag is unknown, not a miss.',
                    charts: ['embed-query-outcomes', 'embed-query-cache'],
                },
            ],
        },
    ],
};

// Keep the full identity as the category; shorten only the rendered axis label.
export const withEmbedRankingPresentation = (
    chart: ChartAsCode,
): ChartAsCode => {
    if (chart.slug !== `${dashboardKey}-embed-popular-dashboards`) return chart;
    return {
        ...chart,
        chartConfig: {
            type: ChartType.CUSTOM,
            config: {
                spec: {
                    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
                    autosize: { type: 'fit', contains: 'padding' },
                    mark: {
                        type: 'bar',
                        color: analyticsColorPalette.colors[0],
                        cornerRadiusEnd: 3,
                        tooltip: true,
                    },
                    encoding: {
                        y: {
                            field: 'embed_reach_dashboard_label',
                            type: 'nominal',
                            sort: '-x',
                            title: null,
                            axis: { labelLimit: 150, labelFontSize: 11 },
                        },
                        x: {
                            field: 'embed_reach_total_loads',
                            type: 'quantitative',
                            title: 'Observed loads',
                            axis: { tickMinStep: 1 },
                        },
                        tooltip: [
                            {
                                field: 'embed_reach_dashboard_label',
                                type: 'nominal',
                                title: 'Dashboard',
                            },
                            {
                                field: 'embed_reach_total_loads',
                                type: 'quantitative',
                                title: 'Observed loads',
                                format: ',',
                            },
                        ],
                    },
                    config: {
                        view: { stroke: null },
                        axis: {
                            domain: false,
                            labelColor: '#868E96',
                            titleColor: '#868E96',
                            gridColor: '#E9ECEF',
                        },
                    },
                },
            },
        },
    };
};
