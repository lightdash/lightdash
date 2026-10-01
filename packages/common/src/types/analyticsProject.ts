export type AnalyticsProjectStatus = {
    project: {
        projectUuid: string;
        name: string;
        slug: string | null;
        url: string;
        createdAt: string;
        /** Count-based check only; does not detect edits to existing definitions. */
        hasContentUpdates: boolean;
    } | null;
};

export type EnsureAnalyticsProjectResult = {
    projectUuid: string;
    url: string;
    created: boolean;
};
