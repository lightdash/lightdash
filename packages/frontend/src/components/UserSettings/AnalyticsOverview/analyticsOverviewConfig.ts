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
    metric: string;
    kind: 'time' | 'ranking';
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
    metric,
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
    metric,
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
    title: 'Daily active users',
    query: activityDaily,
    metric: 'unique_users',
    kind: 'time',
};
const dailyQueries: AnalyticsChartSpec = {
    ...activeUsers,
    title: 'Queries per day',
    metric: 'total_queries',
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

export const analyticsHeadlineMetrics = [
    {
        title: 'Active users',
        description: 'People with recorded activity',
        tab: 'people',
        query: query('activity', [], ['unique_users', 'total_queries']),
        metric: 'unique_users',
    },
    {
        title: 'Queries run',
        description: 'Recorded queries',
        tab: 'queries',
        query: query('activity', [], ['unique_users', 'total_queries']),
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
        query: query('requests', [], ['total_requests']),
        metric: 'total_requests',
    },
];

// Settings has a small, independent selection; full dashboards remain managed by sync.
export const analyticsTabs: {
    id: string;
    label: string;
    dashboardSlug: string | null;
    charts: AnalyticsChartSpec[];
}[] = [
    {
        id: 'overview',
        label: 'Overview',
        dashboardSlug: null,
        charts: [activeUsers, topUsers, dailyQueries, dailyRequests],
    },
    {
        id: 'agents',
        label: 'Agents & AI',
        dashboardSlug: 'lightdash-analytics-overview',
        charts: [
            dailyRequests,
            ranking(
                'Requests by agent',
                'requests',
                ['agent_name', 'agent_id'],
                'total_requests',
            ),
            ranking(
                'Request outcomes',
                'outcomes',
                ['status'],
                'total_requests',
            ),
            ranking(
                'Requests by channel',
                'requests',
                ['surface'],
                'total_requests',
            ),
        ],
    },
    {
        id: 'queries',
        label: 'Queries',
        dashboardSlug: 'lightdash-analytics-query-activity',
        charts: [
            dailyQueries,
            ranking(
                'Most queried metrics',
                'semantic',
                ['field_label', 'table_name', 'field_id'],
                'total_queries',
                { field_kind: ['metric'] },
            ),
            ranking(
                'Queries by cache status',
                'queries',
                ['cache_hit'],
                'total_queries',
            ),
            ranking(
                'Queries by origin',
                'queries',
                ['workload_origin'],
                'total_queries',
            ),
        ],
    },
    {
        id: 'people',
        label: 'Users',
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
        label: 'Content',
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
        label: 'Apps',
        dashboardSlug: 'lightdash-analytics-apps',
        charts: [
            time('App loads per day', 'apps', 'total_views'),
            ranking(
                'Most used apps',
                'apps',
                ['app_name', 'app_id'],
                'total_views',
            ),
            time('Apps created per day', 'apps', 'unique_apps', {
                event_name: ['data_app.created'],
            }),
            time('App generation tokens', 'tokens', 'total_tokens_used', {
                feature: ['data-app'],
            }),
        ],
    },
    {
        id: 'tools',
        label: 'Tools & operations',
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
        label: 'Adoption',
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
        label: 'AI usage',
        dashboardSlug: 'lightdash-analytics-ai-tokens',
        charts: [
            time('Tokens per day', 'tokens', 'total_tokens_used'),
            ranking(
                'Tokens by feature',
                'tokens',
                ['feature'],
                'total_tokens_used',
            ),
            ranking(
                'Tokens by channel',
                'tokens',
                ['channel'],
                'total_tokens_used',
            ),
            ranking(
                'Tokens by model',
                'tokens',
                ['model'],
                'total_tokens_used',
            ),
        ],
    },
    {
        id: 'embed',
        label: 'Embed',
        dashboardSlug: 'lightdash-analytics-embed',
        charts: [
            time('Embed loads per day', 'embed', 'total_loads'),
            ranking(
                'Most loaded embeds',
                'embed',
                ['dashboard_label'],
                'total_loads',
            ),
            time('External viewers per day', 'embed', 'unique_viewers'),
            ranking(
                'Embed query outcomes',
                'queries',
                ['status'],
                'total_queries',
                { context: ['embed'] },
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
        limit: spec.daily ? 90 : spec.dimensions.length ? 8 : 1,
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
