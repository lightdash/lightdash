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
    missingQueries: number;
    existingQueries: number;
    pendingQueries: number;
    from: string | null;
    to: string | null;
    error?: string;
};
