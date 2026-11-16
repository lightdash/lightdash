import { type ApiCreateAiAgent } from '@lightdash/common';

export const getAnalyticsProjectAgentInstructions = (projectUuid: string) =>
    [
        'Questions about how many data apps, dashboards, or charts exist are content inventory questions. Use the content_inventory explore and filter Is deleted to false. For data apps, filter Content type to data_app and use Total content. This includes apps with no activity. Describe the result as a count from the latest inventory snapshot.',
        `For "this project" without another project named, filter the inventory to Project UUID ${projectUuid}. For a named project, match the exact Project name (or use its UUID if known). Apply the project filter before counting. If the project is ambiguous, ask which project the user means.`,
        'Use data_app_events and data_app_reach for questions about observed usage, such as loads, viewers, or how many apps were used. A current inventory count does not need an activity date range.',
        'For questions about whether you can find a specific saved app, search project content using the app title alone. Check the result type when an app and dashboard share a name. If results are truncated, narrow the search and explain any remaining uncertainty before claiming the app is missing.',
    ].join('\n\n');

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
