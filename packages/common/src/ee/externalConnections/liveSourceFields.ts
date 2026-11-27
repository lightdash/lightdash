/** Who last edited a live source field. */
export type LiveSourceFieldEditor = {
    userUuid: string;
    userName: string;
    /** ISO timestamp. */
    at: string;
};

/** One field of a live data source, in use or available. */
export type LiveSourceField = {
    /** Stable within the explore; the field id is `<explore name>_<name>`. */
    name: string;
    /** What the integration calls the field, shown as "Source". */
    apiName: string;
    kind: 'dimension' | 'metric';
    type: string;
    label: string;
    description: string;
    aiHint: string | null;
    group: string | null;
    /** Declared in the integration's code; false for a field a Refresh found. */
    isBuiltIn: boolean;
    /** Off unless an admin turns it on, so lists hide it until it is in use. */
    isInternal: boolean;
    /** Every query needs it, so it can't be taken out of use. */
    isRequired: boolean;
    inUse: boolean;
    usedByChartCount: number;
    lastEdit: LiveSourceFieldEditor | null;
};

/** One explore of a live data source, with its fields when they can be curated. */
export type LiveSourceExploreFields = {
    exploreName: string;
    label: string;
    description: string;
    aiHint: string | null;
    /** Off, the explore isn't built, so charts, dashboards and agents can't use it. */
    inUse: boolean;
    /** Saved charts on the explore. */
    usedByChartCount: number;
    lastEdit: LiveSourceFieldEditor | null;
    /** Always true: every explore's fields can be curated. */
    canEditFields: boolean;
    fields: LiveSourceField[];
};

export type LiveSourceFields = {
    /** The first explore, which `fields` lists. */
    exploreName: string;
    /** Saved charts on any of the source's explores, each counted once. */
    usedByChartCount: number;
    /** ISO timestamp of the last Refresh, or null when the source was never refreshed. */
    scannedAt: string | null;
    fields: LiveSourceField[];
    /** Every explore of the source, in use or not, the first one included. */
    explores: LiveSourceExploreFields[];
};

export type ApiLiveSourceFieldsResponse = {
    status: 'ok';
    results: LiveSourceFields;
};

/** One field change; unset keys stay as they are, null clears an override. */
export type LiveSourceFieldChange = {
    name: string;
    /** The explore the field belongs to; omitted, the source's first explore. */
    exploreName?: string;
    inUse?: boolean;
    label?: string | null;
    description?: string | null;
    aiHint?: string | null;
    group?: string | null;
};

/** One explore change; unset keys stay as they are, null clears an override. */
export type LiveSourceExploreChange = {
    exploreName: string;
    inUse?: boolean;
    label?: string | null;
    description?: string | null;
    aiHint?: string | null;
};

export type ApiUpdateLiveSourceFieldsRequest = {
    changes: LiveSourceFieldChange[];
    exploreChanges?: LiveSourceExploreChange[];
};

/** Saved content one item of a live data source is used by. */
export type LiveSourceContentUsage = {
    /** The charts the caller can open. */
    charts: { uuid: string; name: string }[];
    /** Charts in spaces the caller can't open, counted but not named. */
    hiddenChartCount: number;
    /** Dashboards showing any of the charts, or holding one of them. */
    dashboards: { uuid: string; name: string }[];
    hiddenDashboardCount: number;
};

export type ApiLiveSourceContentUsageResponse = {
    status: 'ok';
    results: LiveSourceContentUsage;
};

/** What a Refresh changed: explores and fields the integration added or removed. */
export type LiveSourceRefreshSummary = {
    /** Explores found for the first time, by explore name. */
    addedExplores: string[];
    /** Explores gone from the integration, by explore name; they are no longer built. */
    removedExplores: string[];
    /** Fields new on the source's explores, by explore name. */
    addedFields: Record<string, string[]>;
    /** Fields gone from the source's explores, by explore name. */
    removedFields: Record<string, string[]>;
};

export type ApiLiveSourceRefreshResponse = {
    status: 'ok';
    results: LiveSourceRefreshSummary;
};
