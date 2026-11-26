import {
    ChartType,
    FilterOperator,
    UnitOfTime,
    type ChartAsCode,
} from '@lightdash/common';
import { caution, positive } from './analyticsChartPresentation';
import { analyticsColorPalette } from './analyticsColorPalette';
import { card, seriesByDay, trend } from './chartBuilders';
import type { UsageChartSpec, UsageDashboardSpec } from './usageDashboardTypes';

const dashboardKey = 'lightdash-analytics-embed';
const embedQueries: NonNullable<UsageChartSpec['filters']> = [
    { field: 'query_events_context', values: ['embed'] },
];

const timezone = 'UTC';
const reachDay = 'embed_reach_event_ts_day';
const queryDay = 'query_events_event_ts_day';

// A split of one count into a few groups. The plain version is a donut for the period. The library
// version stacks the groups by day.
const shareByDay = ({
    day,
    dimension,
    metric,
    yName,
    splitDescription,
    colors,
    ...spec
}: Pick<
    UsageChartSpec,
    'key' | 'name' | 'description' | 'explore' | 'filters'
> & {
    day: string;
    dimension: string;
    metric: string;
    yName: string;
    splitDescription: string;
    // A fixed colour for each named group, for groups that mean good or not good
    colors?: Record<string, string>;
}): UsageChartSpec => ({
    ...spec,
    dimensions: [dimension],
    metrics: [metric],
    limit: 10,
    sorts: [{ fieldId: metric, descending: true }],
    visualization: 'donut',
    timezone,
    libraryChart: {
        slug: 'customizable-cartesian-chart',
        minVersion: colors ? '0.18.4' : '0.18.3',
        fieldMapping: { x: day, m1: metric, splitBy: dimension },
        optionValues: {
            seriesType: 'bar',
            stack: 'normal',
            splitSort: 'total',
            xAxisType: 'time',
            xTimeFormat: '{MMM} {d}',
            xName: 'Day',
            yName,
            ...(colors
                ? {
                      splitColorGroups: Object.entries(colors)
                          .map(([name, color]) => `${name}=${name}=${color}`)
                          .join(';'),
                  }
                : {}),
        },
        query: {
            dimensions: [day, dimension],
            metrics: [metric],
            sorts: [
                { fieldId: dimension, descending: false },
                { fieldId: day, descending: false },
            ],
            limit: 5000,
            description: splitDescription,
        },
    },
});

export const embedChartSpecs: UsageChartSpec[] = [
    card({
        key: 'embed-viewers-latest-day',
        name: 'Identified external viewers',
        description:
            'External viewer IDs sent by your embedding application on the latest day in the selected period. An ID is whatever identity your application sends, not a verified person.',
        explore: 'embed_reach',
        day: reachDay,
        metric: 'embed_reach_unique_viewers',
        latestDay: true,
        hero: true,
        timezone,
    }),
    card({
        key: 'embed-loads',
        name: 'Dashboard loads',
        description:
            'Authorized loads of embedded dashboards, including reloads. A load is not a billed load.',
        explore: 'embed_reach',
        day: reachDay,
        metric: 'embed_reach_total_loads',
        timezone,
    }),
    card({
        key: 'embed-dashboards-latest-day',
        name: 'Dashboards loaded',
        description:
            'Dashboards with at least one authorized embedded load on the latest day in the selected period. This is not a list of every dashboard that can be embedded.',
        explore: 'embed_reach',
        day: reachDay,
        metric: 'embed_reach_unique_dashboards',
        latestDay: true,
        timezone,
    }),
    trend({
        key: 'embed-load-trend',
        name: 'Dashboard loads by day',
        description: '',
        explore: 'embed_reach',
        day: reachDay,
        metric: 'embed_reach_total_loads',
        timezone,
        fieldLabels: { embed_reach_total_loads: 'Loads' },
    }),
    {
        key: 'embed-popular-dashboards',
        name: 'Most-loaded dashboards',
        description:
            'Top 10 dashboards by embedded loads. Dashboards with the same name are kept separate.',
        explore: 'embed_reach',
        dimensions: ['embed_reach_dashboard_label'],
        metrics: ['embed_reach_total_loads'],
        limit: 10,
        sorts: [{ fieldId: 'embed_reach_total_loads', descending: true }],
        visualization: 'bar',
        flipAxes: true,
        timezone,
        fieldLabels: { embed_reach_total_loads: 'Loads' },
        libraryChart: {
            slug: 'customizable-cartesian-chart',
            minVersion: '0.18.4',
            fieldMapping: {
                x: 'embed_reach_dashboard_label',
                m1: 'embed_reach_total_loads',
            },
            optionValues: {
                seriesType: 'bar',
                orientation: 'horizontal',
                m1Name: 'Loads',
                showDataLabels: true,
                lightdashLabels: false,
                showAxisTitles: false,
                showLegend: false,
            },
            query: null,
        },
    },
    shareByDay({
        key: 'embed-identity-coverage',
        name: 'Loads with and without a viewer ID',
        description:
            'Share of loads with and without an external viewer ID. Loads with no ID are not counted as one anonymous person.',
        explore: 'embed_reach',
        day: reachDay,
        dimension: 'embed_reach_identity_coverage',
        metric: 'embed_reach_total_loads',
        yName: 'Loads',
        splitDescription:
            'Loads per day, with and without an external viewer ID. Loads with no ID are not counted as one anonymous person.',
    }),
    card({
        key: 'embed-query-count',
        name: 'Queries',
        description:
            'Finished queries from embeds, including cached results and errors. This is not dashboard loads or billed usage.',
        explore: 'query_events',
        day: queryDay,
        metric: 'query_events_total_queries',
        filters: embedQueries,
        timezone,
    }),
    card({
        key: 'embed-query-errors',
        name: 'Query errors',
        description:
            'Embedded queries that ended in an error. Failures before the query ran, and rendering failures in the browser, are not recorded here.',
        explore: 'query_events',
        day: queryDay,
        metric: 'query_events_total_queries',
        filters: [
            ...embedQueries,
            { field: 'query_events_status', values: ['error'] },
        ],
        timezone,
    }),
    trend({
        key: 'embed-query-trend',
        name: 'Queries by day',
        description:
            'Embedded queries per UTC day, including cache hits and errors. A day with no data is not proof of zero usage.',
        explore: 'query_events',
        day: queryDay,
        metric: 'query_events_total_queries',
        filters: embedQueries,
        timezone,
    }),
    seriesByDay({
        key: 'embed-query-latency',
        name: 'Response time for successful queries (s)',
        description:
            'Median and P95 backend time for successful embedded queries, from the start of the request. Time spent in the browser is not included.',
        explore: 'query_events',
        day: queryDay,
        series: [
            { metric: 'query_events_p50_response_time_s', name: 'Median' },
            { metric: 'query_events_p95_response_time_s', name: 'P95' },
        ],
        yName: 'Response time (s)',
        seriesType: 'line',
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
        timezone,
    }),
    shareByDay({
        key: 'embed-query-outcomes',
        name: 'Queries by outcome',
        description: 'Embedded queries by success or error.',
        explore: 'query_events',
        day: queryDay,
        dimension: 'query_events_status_name',
        metric: 'query_events_total_queries',
        yName: 'Queries',
        filters: embedQueries,
        colors: {
            Success: positive,
            Error: caution,
            'Not recorded': '#868E96',
        },
        splitDescription: 'Embedded queries per day, by success or error.',
    }),
    shareByDay({
        key: 'embed-query-cache',
        name: 'Queries by cache hit',
        description:
            'Cache hits, cache misses and queries with no cache information, for embedded queries. This does not estimate cost saved.',
        explore: 'query_events',
        day: queryDay,
        dimension: 'query_events_cache_hit_name',
        metric: 'query_events_total_queries',
        yName: 'Queries',
        filters: embedQueries,
        colors: {
            'Cache hit': positive,
            'Cache miss': caution,
            'Not recorded': '#868E96',
        },
        splitDescription:
            'Embedded queries per day by cache hit, cache miss and no cache information. This does not estimate cost saved.',
    }),
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
                        'embed-viewers-latest-day',
                        'embed-loads',
                        'embed-dashboards-latest-day',
                    ],
                    layout: 'row',
                    rowHeight: 4,
                    widths: [18, 9, 9],
                },
                {
                    title: 'Usage over time',
                    description:
                        'Loads of embedded dashboards by day. Missing data is not zero usage.',
                    charts: ['embed-load-trend'],
                    layout: 'row',
                    rowHeight: 5,
                },
                {
                    title: 'Most-loaded dashboards and viewer IDs',
                    description:
                        'The top 10 dashboards, and how often a load has an external viewer ID. Loads with no ID stay in the totals.',
                    charts: [
                        'embed-popular-dashboards',
                        'embed-identity-coverage',
                    ],
                    layout: 'row',
                    rowHeight: 8,
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
                        'Queries are not dashboard loads: one load can run many. Query history can cover a different period from load history.',
                    charts: ['embed-query-count', 'embed-query-errors'],
                },
                {
                    title: 'Queries and response time',
                    description:
                        'Queries per day, and response time for successful ones. Timing includes queueing and result storage, not drawing in the browser.',
                    charts: ['embed-query-trend', 'embed-query-latency'],
                    layout: 'row',
                    rowHeight: 7,
                },
                {
                    title: 'Outcomes and caching',
                    description:
                        'A successful query does not prove the dashboard rendered. A missing cache flag is unknown, not a miss.',
                    charts: ['embed-query-outcomes', 'embed-query-cache'],
                    layout: 'row',
                    rowHeight: 7,
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
                            title: 'Loads',
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
                                title: 'Loads',
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
