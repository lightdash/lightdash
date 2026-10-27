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
    /** Current backfill version completed; counts are not scanned by Settings. */
    completed?: boolean;
    missingQueries: number;
    existingQueries: number;
    pendingQueries: number;
    from: string | null;
    to: string | null;
    /** Totals across every recoverable source; query fields remain compatible. */
    missingRecords?: number;
    existingRecords?: number;
    pendingRecords?: number;
    sources?: {
        name: string;
        missing: number;
        existing: number;
        pending: number;
    }[];
    error?: string;
};
