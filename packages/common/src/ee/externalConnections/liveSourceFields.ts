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
    /** Written by Lightdash for the integration, not found by a scan. */
    isBuiltIn: boolean;
    /** The integration's own bookkeeping field, hidden by default. */
    isInternal: boolean;
    /** Every query needs it, so it can't be taken out of use. */
    isRequired: boolean;
    inUse: boolean;
    usedByChartCount: number;
    lastEdit: LiveSourceFieldEditor | null;
};

export type LiveSourceFields = {
    exploreName: string;
    /** Saved charts on any of the source's explores, each counted once. */
    usedByChartCount: number;
    /** ISO timestamp of the last scan, or null when the source was never scanned. */
    scannedAt: string | null;
    fields: LiveSourceField[];
};

export type ApiLiveSourceFieldsResponse = {
    status: 'ok';
    results: LiveSourceFields;
};

/** One field change; unset keys stay as they are, null clears an override. */
export type LiveSourceFieldChange = {
    name: string;
    inUse?: boolean;
    label?: string | null;
    description?: string | null;
    aiHint?: string | null;
    group?: string | null;
};

export type ApiUpdateLiveSourceFieldsRequest = {
    changes: LiveSourceFieldChange[];
};
