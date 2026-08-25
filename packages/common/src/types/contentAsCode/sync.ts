import type { ContentAsCodeType } from './core';

export type ContentAsCodeAppliedRevision = {
    contentType: ContentAsCodeType;
    slug: string;
    contentHash: string;
    appliedAt: Date;
    appliedByUserUuid: string | null;
};

export type ContentAsCodeAppliedRevisionInput = {
    contentType: ContentAsCodeType;
    slug: string;
    contentHash: string;
};

export type UpsertContentAsCodeAppliedRevisionsRequest = {
    revisions: ContentAsCodeAppliedRevisionInput[];
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

export type ApiUpsertContentAsCodeAppliedRevisionsResponse = {
    status: 'ok';
    results: ContentAsCodeSyncStatus;
};
