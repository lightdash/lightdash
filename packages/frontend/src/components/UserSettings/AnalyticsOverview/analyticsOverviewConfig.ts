import { FilterOperator, type MetricQuery } from '@lightdash/common';

const sources = {
    activity: {
        explore: 'user_activity',
        table: 'user_activity',
        date: 'activity_date_day',
    },
    queries: {
        explore: 'query_events',
        table: 'query_events',
        date: 'event_ts_day',
    },
    requests: {
        explore: 'agent_request_starts',
        table: 'agent_requests',
        date: 'requested_at_day',
    },
    outcomes: {
        explore: 'agent_requests',
        table: 'agent_requests',
        date: 'requested_at_day',
    },
    inventory: {
        explore: 'content_inventory',
        table: 'content_health',
        date: 'created_at_day',
    },
    content: {
        explore: 'content_reach',
        table: 'content_reach',
        date: 'event_ts_day',
    },
    apps: {
        explore: 'data_app_events',
        table: 'data_app_events',
        date: 'event_ts_day',
    },
    tools: {
        explore: 'tool_activity',
        table: 'tool_activity',
        date: 'event_ts_day',
    },
    exports: {
        explore: 'export_events',
        table: 'export_events',
        date: 'event_ts_day',
    },
    tokens: { explore: 'ai_usage', table: 'ai_usage', date: 'event_ts_day' },
    semantic: {
        explore: 'semantic_usage',
        table: 'semantic_usage',
        date: 'event_ts_day',
    },
    embed: {
        explore: 'embed_reach',
        table: 'embed_reach',
        date: 'event_ts_day',
    },
};

export type AnalyticsQuerySpec = {
    source: keyof typeof sources;
    dimensions: string[];
    metrics: string[];
    filters: Record<string, string[]>;
    daily: boolean;
};

export type AnalyticsFilters = {
    projectUuid: string | null;
    start: string;
    end: string;
};

export type AnalyticsChartSpec = {
    title: string;
    query: AnalyticsQuerySpec;
    series: { metric: string; label: string }[];
    kind: 'time' | 'ranking' | 'donut';
};

const query = (
    source: AnalyticsQuerySpec['source'],
    dimensions: string[],
    metrics: string[],
    filters: AnalyticsQuerySpec['filters'] = {},
    daily = false,
): AnalyticsQuerySpec => ({ source, dimensions, metrics, filters, daily });

const time = (
    title: string,
    source: AnalyticsQuerySpec['source'],
    metric: string,
    filters: AnalyticsQuerySpec['filters'] = {},
): AnalyticsChartSpec => ({
    title,
    query: query(source, [sources[source].date], [metric], filters, true),
    series: [{ metric, label: title }],
    kind: 'time',
});

const ranking = (
    title: string,
    source: AnalyticsQuerySpec['source'],
    dimensions: string[],
    metric: string,
    filters: AnalyticsQuerySpec['filters'] = {},
): AnalyticsChartSpec => ({
    title,
    query: query(source, dimensions, [metric], filters),
    series: [{ metric, label: title }],
    kind: 'ranking',
});

const activityDaily = query(
    'activity',
    ['activity_date_day'],
    ['unique_users', 'total_queries'],
    {},
    true,
);
const activeUsers: AnalyticsChartSpec = {
    title: 'Daily observed active people',
    query: activityDaily,
    series: [{ metric: 'unique_users', label: 'Active people' }],
    kind: 'time',
};
const dailyQueries: AnalyticsChartSpec = {
    ...activeUsers,
    title: 'Queries per day',
    series: [{ metric: 'total_queries', label: 'Queries' }],
};
const topUsers = ranking(
    'Most active users',
    'activity',
    ['user_name', 'user_id'],
    'total_events',
);
const dailyRequests = time(
    'AI agent requests per day',
    'requests',
    'total_requests',
);
const appSeries = [
    { metric: 'total_views', label: 'App loads' },
    { metric: 'unique_viewers', label: 'Observed viewers' },
];
const inventoryFilter = {
    content_type: ['saved_chart', 'sql_chart', 'dashboard'],
};
const topDashboards = ranking(
    'Most viewed dashboards',
    'content',
    ['content_name', 'content_id'],
    'qualifying_views',
    { content_type: ['dashboard'] },
);
const activityTotals = query('activity', [], ['unique_users', 'total_queries']);

export const analyticsHeadlineMetrics = [
    {
        title: 'Active users',
        description: 'People with recorded activity',
        tab: 'people',
        query: activityTotals,
        metric: 'unique_users',
    },
    {
        title: 'Queries run',
        description: 'Recorded queries',
        tab: 'queries',
        query: activityTotals,
        metric: 'total_queries',
    },
    {
        title: 'Content created',
        description: 'Charts and dashboards in the inventory',
        tab: 'content',
        query: query('inventory', [], ['total_content'], inventoryFilter),
        metric: 'total_content',
    },
    {
        title: 'AI agent requests',
        description: 'Questions sent to agents',
        tab: 'agents',
        query: dailyRequests.query,
        metric: 'total_requests',
        sumDailyCounts: true,
    },
];

const analyticsAiSummary = {
    query: query(
        'tokens',
        [],
        [
            'total_ai_calls',
            'total_tokens_used',
            'unique_users',
            'total_output_tokens',
        ],
    ),
    metrics: [
        { title: 'AI calls', metric: 'total_ai_calls', compact: false },
        { title: 'Tokens used', metric: 'total_tokens_used', compact: true },
        { title: 'Users using AI', metric: 'unique_users', compact: false },
        {
            title: 'Output tokens',
            metric: 'total_output_tokens',
            compact: true,
        },
    ],
};

export type AnalyticsSummarySpec = {
    query: AnalyticsQuerySpec;
    metrics: { title: string; metric: string; compact: boolean }[];
};

const querySummary: AnalyticsSummarySpec = {
    query: query(
        'queries',
        [],
        [
            'total_queries',
            'unique_users',
            'avg_warehouse_execution_time_ms',
            'p90_warehouse_execution_time_ms',
        ],
    ),
    metrics: [
        { title: 'Queries executed', metric: 'total_queries', compact: false },
        {
            title: 'Users running queries',
            metric: 'unique_users',
            compact: false,
        },
        {
            title: 'Avg. warehouse time (ms)',
            metric: 'avg_warehouse_execution_time_ms',
            compact: false,
        },
        {
            title: 'P90 warehouse time (ms)',
            metric: 'p90_warehouse_execution_time_ms',
            compact: false,
        },
    ],
};
const appSummary: AnalyticsSummarySpec = {
    query: query('apps', [], ['total_views', 'unique_viewers', 'unique_apps'], {
        event_name: ['data_app.view'],
    }),
    metrics: [
        { title: 'Recorded app loads', metric: 'total_views', compact: false },
        {
            title: 'Distinct app viewers',
            metric: 'unique_viewers',
            compact: false,
        },
        {
            title: 'Apps with recorded loads',
            metric: 'unique_apps',
            compact: false,
        },
    ],
};
const embedSummary: AnalyticsSummarySpec = {
    query: query(
        'embed',
        [],
        ['total_loads', 'unique_viewers', 'unique_dashboards'],
    ),
    metrics: [
        {
            title: 'Observed dashboard loads',
            metric: 'total_loads',
            compact: false,
        },
        {
            title: 'Identified external viewers',
            metric: 'unique_viewers',
            compact: false,
        },
        {
            title: 'Dashboards loaded',
            metric: 'unique_dashboards',
            compact: false,
        },
    ],
};
export const analyticsDateRangeDays = [7, 30, 90];

// Settings has a small, independent selection; full dashboards remain managed by sync.
export const analyticsTabs: {
    id: string;
    label: string;
    description: string;
    dashboardSlug: string | null;
    charts: AnalyticsChartSpec[];
    summary: AnalyticsSummarySpec | null;
}[] = [
    {
        id: 'overview',
        summary: null,
        label: 'Overview',
        description:
            'A quick view of active users, query activity, content creation and AI agent requests.',
        dashboardSlug: null,
        charts: [activeUsers, topUsers, dailyQueries, dailyRequests],
    },
    {
        id: 'agents',
        summary: analyticsAiSummary,
        label: 'Agents & AI',
        description:
            'AI consumption and agent request adoption, outcomes and feedback.',
        dashboardSlug: 'lightdash-analytics-overview',
        charts: [
            time('AI calls by day', 'tokens', 'total_ai_calls'),
            time('Tokens used by day', 'tokens', 'total_tokens_used'),
        ],
    },
    {
        id: 'queries',
        summary: querySummary,
        label: 'Queries',
        description:
            'Query performance, failures, origins, caching and the metrics and dimensions people use.',
        dashboardSlug: 'lightdash-analytics-query-activity',
        charts: [
            time('Queries by day', 'queries', 'total_queries'),
            {
                ...ranking(
                    'How often are queries served from cache?',
                    'queries',
                    ['cache_hit'],
                    'total_queries',
                ),
                kind: 'donut',
            },
        ],
    },
    {
        id: 'people',
        summary: null,
        label: 'Users',
        description:
            'Observed activity, returning users and activity channels.',
        dashboardSlug: 'lightdash-analytics-people',
        charts: [
            activeUsers,
            topUsers,
            ranking(
                'Activity by source',
                'activity',
                ['stream'],
                'total_events',
            ),
            ranking(
                'Users by project',
                'activity',
                ['project_id'],
                'unique_users',
            ),
        ],
    },
    {
        id: 'content',
        summary: null,
        label: 'Content',
        description: 'Audience, trust, adoption and current content inventory.',
        dashboardSlug: 'lightdash-analytics-content',
        charts: [
            time(
                'Content created per day',
                'inventory',
                'total_content',
                inventoryFilter,
            ),
            topDashboards,
            ranking(
                'Charts and dashboards created',
                'inventory',
                ['content_type'],
                'total_content',
                inventoryFilter,
            ),
            ranking(
                'Recorded views by space',
                'content',
                ['space_name', 'space_id'],
                'qualifying_views',
            ),
        ],
    },
    {
        id: 'apps',
        summary: appSummary,
        label: 'Apps',
        description:
            'App loads, audiences, builders and generation consumption.',
        dashboardSlug: 'lightdash-analytics-apps',
        charts: [
            {
                title: 'Daily app loads and viewers',
                query: query(
                    'apps',
                    ['event_ts_day'],
                    ['total_views', 'unique_viewers'],
                    { event_name: ['data_app.view'] },
                    true,
                ),
                series: appSeries,
                kind: 'time',
            },
            {
                title: 'Apps · loads and observed viewers',
                query: query(
                    'apps',
                    ['app_name', 'project_name', 'app_id', 'project_id'],
                    ['total_views', 'unique_viewers'],
                    { event_name: ['data_app.view'] },
                ),
                series: appSeries,
                kind: 'ranking',
            },
        ],
    },
    {
        id: 'tools',
        summary: null,
        label: 'Tools & operations',
        description:
            'MCP tool activity, exports and operational capture boundaries.',
        dashboardSlug: 'lightdash-analytics-tools',
        charts: [
            time('Tool calls per day', 'tools', 'total_calls'),
            ranking('Most used tools', 'tools', ['tool_name'], 'total_calls'),
            ranking(
                'Exports by format',
                'exports',
                ['format'],
                'total_downloads',
            ),
            ranking(
                'MCP calls by client',
                'tools',
                ['client_name'],
                'total_calls',
                { source: ['mcp'] },
            ),
        ],
    },
    {
        id: 'adoption',
        summary: null,
        label: 'Adoption',
        description:
            'See who is active, which apps and dashboards people use, and how Ask AI use develops.',
        dashboardSlug: 'lightdash-analytics-adoption',
        charts: [
            activeUsers,
            ranking(
                'Dashboard audiences',
                'content',
                ['content_name', 'content_id'],
                'distinct_viewers',
                { content_type: ['dashboard'] },
            ),
            time('Ask AI users per day', 'requests', 'distinct_requesters', {
                surface: ['web_app'],
            }),
            time('Apps in use per day', 'apps', 'unique_apps', {
                event_name: ['data_app.view'],
            }),
        ],
    },
    {
        id: 'tokens',
        summary: null,
        label: 'AI usage',
        description:
            'All captured token usage for the selected dates. The full dashboard also includes billing-specific views with a narrower scope.',
        dashboardSlug: 'lightdash-analytics-ai-tokens',
        charts: [
            time('Tokens per day · all usage', 'tokens', 'total_tokens_used'),
            ranking(
                'Tokens by feature · all usage',
                'tokens',
                ['feature'],
                'total_tokens_used',
            ),
            ranking(
                'Tokens by channel · all usage',
                'tokens',
                ['channel'],
                'total_tokens_used',
            ),
            ranking(
                'Tokens by model · all usage',
                'tokens',
                ['model'],
                'total_tokens_used',
            ),
        ],
    },
    {
        id: 'embed',
        summary: embedSummary,
        label: 'Embed',
        description:
            'Observed embedded-dashboard loads, external viewers and query health.',
        dashboardSlug: 'lightdash-analytics-embed',
        charts: [
            time('Dashboard loads each day', 'embed', 'total_loads'),
            ranking(
                'Most-loaded dashboards',
                'embed',
                ['dashboard_label'],
                'total_loads',
            ),
        ],
    },
];

export const analyticsFieldId = (spec: AnalyticsQuerySpec, field: string) =>
    `${sources[spec.source].table}_${field}`;

export const buildAnalyticsQuery = (
    spec: AnalyticsQuerySpec,
    filters: AnalyticsFilters,
): MetricQuery => {
    const source = sources[spec.source];
    const field = (name: string) => analyticsFieldId(spec, name);
    return {
        exploreName: source.explore,
        dimensions: spec.dimensions.map(field),
        metrics: spec.metrics.map(field),
        filters: {
            dimensions: {
                id: 'analytics-settings',
                and: [
                    {
                        id: 'start',
                        target: { fieldId: field(source.date) },
                        operator: FilterOperator.GREATER_THAN_OR_EQUAL,
                        values: [filters.start],
                    },
                    {
                        id: 'end',
                        target: { fieldId: field(source.date) },
                        operator: FilterOperator.LESS_THAN,
                        values: [filters.end],
                    },
                    ...(filters.projectUuid
                        ? [
                              {
                                  id: 'project',
                                  target: { fieldId: field('project_id') },
                                  operator: FilterOperator.EQUALS,
                                  values: [filters.projectUuid],
                              },
                          ]
                        : []),
                    ...Object.entries(spec.filters).map(([name, values]) => ({
                        id: name,
                        target: { fieldId: field(name) },
                        operator: FilterOperator.EQUALS,
                        values,
                    })),
                ],
            },
        },
        sorts: spec.dimensions.length
            ? [
                  {
                      fieldId: field(
                          spec.daily ? spec.dimensions[0] : spec.metrics[0],
                      ),
                      descending: !spec.daily,
                  },
              ]
            : [],
        limit: spec.daily
            ? Math.max(...analyticsDateRangeDays)
            : spec.dimensions.length
              ? 10
              : 1,
        tableCalculations: [],
        timezone: 'UTC',
    };
};

export const analyticsDateRange = (days: number, now: Date) => {
    const end = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - days);
    return {
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
    };
};

export const formatAnalyticsNumber = (value: number) =>
    new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
        value,
    );

export const analyticsCategoryLabels: Record<string, Record<string, string>> = {
    stream: {
        query_events: 'Queries',
        ai_usage: 'AI model calls',
        content_views: 'Content views',
        data_app_events: 'Data apps',
        export_events: 'Exports',
        agent_steps: 'Agent activity',
        mcp_tool_calls: 'MCP tools',
    },
    content_type: {
        saved_chart: 'Charts',
        sql_chart: 'SQL charts',
        dashboard: 'Dashboards',
    },
    surface: { web_app: 'Web app', slack: 'Slack', api: 'API' },
    workload_origin: {
        interactive: 'Interactive',
        dashboard: 'Dashboard',
        scheduled: 'Scheduled',
        embed: 'Embed',
        unknown: 'Unknown',
    },
};
