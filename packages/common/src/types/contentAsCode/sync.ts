import { ContentAsCodeType } from './core';

export const CONTENT_AS_CODE_SNAPSHOT_TYPES = [
    ContentAsCodeType.CHART,
    ContentAsCodeType.DASHBOARD,
] as const;

export type ContentAsCodeSnapshotType =
    (typeof CONTENT_AS_CODE_SNAPSHOT_TYPES)[number];

export type ContentAsCodeSnapshot = Record<string, unknown>;

export type ContentAsCodeSyncItemState = 'in_sync' | 'ahead' | 'ui_only';

export type ContentAsCodeAppliedRevision = {
    contentType: ContentAsCodeSnapshotType;
    slug: string;
    contentHash: string;
    snapshot: ContentAsCodeSnapshot;
    appliedAt: Date;
    appliedByUserUuid: string | null;
};

export type ContentAsCodeAppliedRevisionInput = {
    contentType: ContentAsCodeSnapshotType;
    slug: string;
    snapshot: ContentAsCodeSnapshot;
};

export type UpsertContentAsCodeAppliedRevisionsRequest = {
    revisions: ContentAsCodeAppliedRevisionInput[];
};

export type RestampContentAsCodeRevisionRequest = {
    contentType: ContentAsCodeSnapshotType;
    slug: string;
};

export type ContentAsCodeSyncItem = {
    contentType: ContentAsCodeSnapshotType;
    slug: string;
    state: ContentAsCodeSyncItemState;
    appliedAt: Date | null;
    contentHash: string | null;
    snapshot: ContentAsCodeSnapshot | null;
    current: ContentAsCodeSnapshot | null;
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

export type ApiUpsertContentAsCodeAppliedRevisionsResponse = {
    status: 'ok';
    results: ContentAsCodeSyncStatus;
};

export const isContentAsCodeSnapshotType = (
    value: string,
): value is ContentAsCodeSnapshotType =>
    (CONTENT_AS_CODE_SNAPSHOT_TYPES as readonly string[]).includes(value);
