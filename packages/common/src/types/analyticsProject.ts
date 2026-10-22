export type AnalyticsProjectStatus = {
    project: {
        projectUuid: string;
        name: string;
        slug: string | null;
        url: string;
        createdAt: string;
        /** Checks counts and dashboard verification, not edits to existing definitions. */
        hasContentUpdates: boolean;
    } | null;
};

export type EnsureAnalyticsProjectResult = {
    projectUuid: string;
    url: string;
    created: boolean;
};

export type AnalyticsHistoryBackfillStatus = {
    running: boolean;
    completed: boolean;
    error?: string;
};

/** Slug of the managed AI usage dashboard installed in every analytics project. */
export const ANALYTICS_AI_USAGE_DASHBOARD_SLUG = 'lightdash-analytics-overview';
