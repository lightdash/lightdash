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
];

// Charts, each with the slug of the dashboard it belonged to. A chart is only removed while it still
// belongs to that dashboard.
export const retiredAnalyticsCharts: Readonly<Record<string, string>> = {
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
    'lightdash-analytics-apps-viewed-apps': 'lightdash-analytics-apps',
    'lightdash-analytics-content-content-by-activity-status':
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
