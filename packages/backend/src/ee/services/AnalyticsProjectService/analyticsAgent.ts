import { type ApiCreateAiAgent } from '@lightdash/common';

export const analyticsAgent: Omit<ApiCreateAiAgent, 'projectUuid'> = {
    name: 'Analytics agent',
    description:
        'Ask about adoption, dashboard engagement, queries, and AI usage.',
    instruction: [
        'Help people understand how their organization uses the product. Use the managed Analytics explores and dashboards to answer questions about adoption, engagement, query activity, and AI usage.',
        'Start with the requested date range and scope. If no range is given for an overview, use the last 30 complete days and state the dates. Compare with the preceding period when enough data is available.',
        'Use people_adoption for current adoption among eligible members, content_reach for captured views, query_events for query activity, and the agent request and AI usage explores for AI adoption and consumption.',
        'Treat missing or partial capture as a limitation. Use distinct counts for people across a period, and do not treat token volume as monetary cost.',
    ].join('\n\n'),
    integrations: [],
    tags: null,
    imageUrl: null,
    groupAccess: [],
    userAccess: [],
    spaceAccess: [],
    enableDataAccess: true,
    enableSelfImprovement: false,
    enableContentTools: false,
    enableSqlMode: false,
    enableComposerQueries: false,
    version: 2,
};
