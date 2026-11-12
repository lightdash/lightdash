import { type HomepageConfig } from '@lightdash/common';

export const analyticsHomepage = {
    name: 'Analytics overview',
    config: {
        version: 1,
        rows: [
            {
                id: 'metrics',
                blocks: [
                    {
                        id: 'usage-metrics',
                        type: 'metrics',
                        config: {
                            title: 'Query activity',
                            items: [
                                {
                                    tableName: 'query_events',
                                    metricName: 'unique_users',
                                    label: 'Querying users',
                                },
                                {
                                    tableName: 'query_events',
                                    metricName: 'total_queries',
                                    label: 'Total queries',
                                },
                                {
                                    tableName: 'query_events',
                                    metricName: 'queries_per_user',
                                    label: 'Queries per querying user',
                                },
                            ],
                        },
                    },
                ],
            },
            {
                id: 'engagement',
                blocks: [
                    {
                        id: 'engagement-metrics',
                        type: 'metrics',
                        config: {
                            title: 'Content and AI',
                            items: [
                                {
                                    tableName: 'user_activity',
                                    metricName: 'unique_users',
                                    label: 'Users with recorded activity',
                                },
                                {
                                    tableName: 'content_reach',
                                    metricName: 'distinct_viewers',
                                    label: 'Chart and dashboard viewers',
                                },
                                {
                                    tableName: 'agent_requests',
                                    metricName: 'total_requests',
                                    label: 'Agent questions',
                                },
                                {
                                    tableName: 'ai_usage',
                                    metricName: 'total_ai_calls',
                                    label: 'AI model calls',
                                },
                            ],
                        },
                    },
                ],
            },
            {
                id: 'dashboards',
                blocks: [
                    {
                        id: 'verified-dashboards',
                        type: 'collection',
                        config: {
                            title: 'Analytics dashboards',
                            items: [],
                            source: 'verified',
                            contentTypes: ['dashboard'],
                            limit: 12,
                        },
                    },
                ],
            },
        ],
    } satisfies HomepageConfig,
};
