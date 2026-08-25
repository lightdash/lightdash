/**
 * Local copy of the content-as-code sync-status contract until
 * the shared types are published.
 */

export type ContentAsCodeSyncContentType = 'chart' | 'dashboard';

export type ContentAsCodeSyncItemState = 'in_sync' | 'ahead' | 'ui_only';

export type ContentAsCodeSyncItem = {
    contentType: ContentAsCodeSyncContentType;
    slug: string;
    state: ContentAsCodeSyncItemState;
    appliedAt: Date | null;
    contentHash: string | null;
    snapshot: Record<string, unknown> | null;
    current: Record<string, unknown> | null;
};

export type ContentAsCodeSyncStatus = {
    syncEnabled: boolean;
    lastAppliedAt: Date | null;
    items: ContentAsCodeSyncItem[];
};

export type ApiContentAsCodeSyncStatusResponse = {
    status: 'ok';
    results: ContentAsCodeSyncStatus;
};

export type ContentAsCodeSyncStatusResult =
    | { kind: 'unavailable' }
    | { kind: 'ok'; status: ContentAsCodeSyncStatus };

export const CONTENT_AS_CODE_SYNC_STATUS_QUERY_KEY =
    'content-as-code-sync-status';

export const CONTENT_AS_CODE_WRITE_BACK_STATUS_QUERY_KEY =
    'content-as-code-write-back-status';

export type ContentAsCodeWriteBackPrState = 'open' | 'merged' | 'none';

export type ContentAsCodeWriteBackStatus = {
    contentType: ContentAsCodeSyncContentType;
    slug: string;
    syncEnabled: boolean;
    writeBackEnabled: boolean;
    state: ContentAsCodeSyncItemState | 'unavailable';
    writeBack: {
        prState: ContentAsCodeWriteBackPrState;
        prUrl: string | null;
        prTitle: string | null;
    };
};

export type ContentAsCodeWriteBackStatusResult =
    | { kind: 'unavailable' }
    | { kind: 'ok'; status: ContentAsCodeWriteBackStatus };

export type ContentAsCodeProposeResult = {
    prUrl: string;
    prTitle: string;
    filesWritten: string[];
    notedChartSlugs: string[];
};

export const shouldShowContentAsCodeSync = (
    result: ContentAsCodeSyncStatusResult | undefined,
): boolean => {
    if (!result) {
        return false;
    }

    if (result.kind === 'unavailable') {
        return true;
    }

    return result.status.syncEnabled;
};
