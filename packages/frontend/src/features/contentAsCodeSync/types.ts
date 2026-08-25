/**
 * Local copy of the content-as-code sync-status contract until
 * the shared types are published.
 */

export type ContentAsCodeAppliedRevision = {
    contentType: string;
    slug: string;
    contentHash: string;
    appliedAt: Date;
    appliedByUserUuid: string | null;
};

export type ContentAsCodeSyncStatus = {
    lastAppliedAt: Date | null;
    revisionCount: number;
    revisions: ContentAsCodeAppliedRevision[];
};

export type ApiContentAsCodeSyncStatusResponse = {
    status: 'ok';
    results: ContentAsCodeSyncStatus;
};

export const EMPTY_CONTENT_AS_CODE_SYNC_STATUS: ContentAsCodeSyncStatus = {
    lastAppliedAt: null,
    revisionCount: 0,
    revisions: [],
};
