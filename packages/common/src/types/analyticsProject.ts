export type AnalyticsProjectStatus = {
    project: {
        projectUuid: string;
        name: string;
        slug: string | null;
        url: string;
        createdAt: string;
        sampleContent?: {
            version: number;
            installedAt: string;
            dashboardUuid: string | null;
        } | null;
    } | null;
};

export type EnsureAnalyticsProjectResult = {
    projectUuid: string;
    url: string;
    created: boolean;
};
