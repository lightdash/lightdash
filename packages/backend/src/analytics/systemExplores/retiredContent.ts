// Managed dashboards and charts that used to be defined here and no longer are. The sync only writes what
// is in code, so without this list a removed item would stay on every instance that already has it.
//
// The rule: when you delete a dashboard from code, or a chart stops being part of any dashboard, add its
// slug here in the same change. Nothing checks this for you, because code cannot know what earlier
// releases shipped. A slug must never be both here and in code: the sync would create it and then
// remove it. If a retired slug is brought back, take it off this list.
//
// What the sync does with the list is in ee/services/AnalyticsProjectService/retiredAnalyticsContent.ts.
// It removes an item only when it is still the one the sync installed, and only with the delete an
// administrator can undo.

// Whole dashboards. Their charts go with them.
export const retiredAnalyticsDashboards: readonly string[] = [
    'lightdash-analytics-people',
    // Evaluations are a tab of the Agents dashboard
    'lightdash-analytics-agent-evaluations',
];

// Charts, each with the slug of the dashboard it belonged to. A chart is only removed while it still
// belongs to that dashboard.
export const retiredAnalyticsCharts: Readonly<Record<string, string>> = {
    // The two word clouds repeated the chart or table beside them
    'lightdash-analytics-query-activity-most-used-fields-cloud':
        'lightdash-analytics-query-activity',
    'lightdash-analytics-tools-tools-mcp-tools-cloud':
        'lightdash-analytics-tools',
    // Agents & AI became Agents: its token tiles moved to AI token usage under new slugs, and the
    // second drawing of requests by agent and day was removed
    'lightdash-analytics-overview-ai-calls': 'lightdash-analytics-overview',
    'lightdash-analytics-overview-tokens': 'lightdash-analytics-overview',
    'lightdash-analytics-overview-ai-users': 'lightdash-analytics-overview',
    'lightdash-analytics-overview-output-tokens':
        'lightdash-analytics-overview',
    'lightdash-analytics-overview-tokens-by-feature':
        'lightdash-analytics-overview',
    'lightdash-analytics-overview-ai-calls-by-day':
        'lightdash-analytics-overview',
    'lightdash-analytics-overview-tokens-by-day':
        'lightdash-analytics-overview',
    'lightdash-analytics-overview-tokens-by-model':
        'lightdash-analytics-overview',
    'lightdash-analytics-overview-calls-by-model':
        'lightdash-analytics-overview',
    'lightdash-analytics-overview-ai-consumption-by-person-feature-and-model':
        'lightdash-analytics-overview',
    'lightdash-analytics-overview-ai-tokens-by-feature-and-model':
        'lightdash-analytics-overview',
    'lightdash-analytics-overview-agent-daily-requests-per-agent':
        'lightdash-analytics-overview',
    // Adoption became People: its restatements of other dashboards were removed, and the data app
    // tiles moved to Data apps under new slugs
    'lightdash-analytics-adoption-adoption-dashboard-audience':
        'lightdash-analytics-adoption',
    'lightdash-analytics-adoption-adoption-app-audience':
        'lightdash-analytics-adoption',
    'lightdash-analytics-adoption-adoption-apps-created-by-day':
        'lightdash-analytics-adoption',
    'lightdash-analytics-adoption-adoption-app-creators':
        'lightdash-analytics-adoption',
    'lightdash-analytics-adoption-adoption-app-reader-trend':
        'lightdash-analytics-adoption',
    'lightdash-analytics-adoption-adoption-app-reader-detail':
        'lightdash-analytics-adoption',
    'lightdash-analytics-adoption-adoption-app-first-audience':
        'lightdash-analytics-adoption',
    'lightdash-analytics-adoption-adoption-app-outcome-trend':
        'lightdash-analytics-adoption',
    'lightdash-analytics-adoption-adoption-app-outcome-detail':
        'lightdash-analytics-adoption',
    'lightdash-analytics-adoption-adoption-ask-ai-questions':
        'lightdash-analytics-adoption',
    'lightdash-analytics-adoption-adoption-ask-ai-people':
        'lightdash-analytics-adoption',
    'lightdash-analytics-adoption-adoption-ask-ai-frequency':
        'lightdash-analytics-adoption',
    'lightdash-analytics-adoption-adoption-ask-ai-users':
        'lightdash-analytics-adoption',
    'lightdash-analytics-adoption-adoption-ask-ai-agents':
        'lightdash-analytics-adoption',
    'lightdash-analytics-adoption-adoption-apps-created':
        'lightdash-analytics-adoption',
    'lightdash-analytics-adoption-adoption-people-history':
        'lightdash-analytics-adoption',
    'lightdash-analytics-apps-apps-loads-and-observed-viewers':
        'lightdash-analytics-apps',
    'lightdash-analytics-apps-daily-trend': 'lightdash-analytics-apps',
    'lightdash-analytics-apps-data-app-builders-creation-and-iterations-by-week':
        'lightdash-analytics-apps',
    'lightdash-analytics-apps-distinct-viewers': 'lightdash-analytics-apps',
    // Most active data app viewers ranked the same people as Data app loads by person and app, which
    // now has its count of data apps as a column
    'lightdash-analytics-apps-top-people': 'lightdash-analytics-apps',
    'lightdash-analytics-apps-viewed-apps': 'lightdash-analytics-apps',
    'lightdash-analytics-content-content-by-activity-status':
        'lightdash-analytics-content',
    // Moved to Queries as lightdash-analytics-query-activity-dashboards-warehouse-and-response-time
    'lightdash-analytics-content-high-compute-dashboards-audience-versus-warehouse-time':
        'lightdash-analytics-content',
    'lightdash-analytics-embed-embed-dashboards': 'lightdash-analytics-embed',
    'lightdash-analytics-embed-embed-viewer-trend': 'lightdash-analytics-embed',
    'lightdash-analytics-embed-embed-viewers': 'lightdash-analytics-embed',
    'lightdash-analytics-home-queries-by-day': 'lightdash-analytics-home',
    'lightdash-analytics-people-daily-observed-active-people':
        'lightdash-analytics-people',
    'lightdash-analytics-people-google-sheets-query-audience':
        'lightdash-analytics-people',
    'lightdash-analytics-people-observed-active-people':
        'lightdash-analytics-people',
    'lightdash-analytics-people-observed-activity-by-person-and-week':
        'lightdash-analytics-people',
    'lightdash-analytics-people-observed-history-stable-user-and-project-uuids':
        'lightdash-analytics-people',
    'lightdash-analytics-people-people-active-latest-day':
        'lightdash-analytics-people',
    'lightdash-analytics-people-people-activity-by-person-and-day':
        'lightdash-analytics-people',
    'lightdash-analytics-people-people-activity-by-type-and-day':
        'lightdash-analytics-people',
    'lightdash-analytics-people-people-google-sheets-queries-by-day':
        'lightdash-analytics-people',
    'lightdash-analytics-people-people-queries': 'lightdash-analytics-people',
    'lightdash-analytics-people-people-recorded-activities':
        'lightdash-analytics-people',
    'lightdash-analytics-people-people-without-activity-30d-detail':
        'lightdash-analytics-people',
    'lightdash-analytics-people-people-without-observed-activity':
        'lightdash-analytics-people',
    'lightdash-analytics-people-people-without-observed-activity-detail':
        'lightdash-analytics-people',
    'lightdash-analytics-people-power-users-queries-ai-and-exports':
        'lightdash-analytics-people',
};
