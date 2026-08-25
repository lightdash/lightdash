import type { PromotionAction } from '../promotion';

export const CONTENT_AS_CODE_VERSION = 1 as const;

export const CONTENT_AS_CODE_VERSIONS = {
    chart: 1,
    dashboard: 1,
    sql_chart: 1,
    space: 1,
    virtual_view: 1,
    scheduled_delivery: 1,
    alert: 1,
    google_sheets_sync: 1,
    ai_agent: 1,
    custom_role: 1,
    user: 1,
    group: 1,
    external_connection: 1,
} as const;

export type ContentAsCodeScope = 'project' | 'organization';

export type ContentAsCodeResourceKind =
    | 'chart'
    | 'dashboard'
    | 'sql_chart'
    | 'space'
    | 'virtual_view'
    | 'scheduled_delivery'
    | 'alert'
    | 'google_sheets_sync'
    | 'ai_agent'
    | 'custom_role'
    | 'user'
    | 'group'
    | 'theme'
    | 'external_connection';

export type ContentAsCodeIdentity = {
    resource: ContentAsCodeResourceKind;
    value: string;
};

export type ContentAsCodeDiagnostic = {
    identity: ContentAsCodeIdentity | null;
    reason: string;
};

export type ContentAsCodeListResults<
    Key extends string,
    Document,
    Extra extends object = Record<never, never>,
> = { [Property in Key]: Document[] } & Extra;

export type ApiContentAsCodeListResponse<Results extends object> = {
    status: 'ok';
    results: Results;
};

export type ContentAsCodeUpsertAction =
    | PromotionAction.CREATE
    | PromotionAction.UPDATE
    | PromotionAction.NO_CHANGES;

export type ApiContentAsCodeUpsertResponse<
    Extra extends object = Record<never, never>,
> = {
    status: 'ok';
    results: { action: ContentAsCodeUpsertAction } & Extra;
};

export enum ContentAsCodeSkipReason {
    SKIPPED_AHEAD = 'skipped_ahead',
}

export type ContentAsCodeSkip = {
    contentType: 'chart' | 'dashboard';
    slug: string;
    reason: ContentAsCodeSkipReason;
    message: string;
};

/**
 * Drift outcome of an upsert against the last-applied snapshot.
 * `skips` is populated when sync enforcement rejected the write;
 * `driftWarnings` when enforcement is off and the write proceeded.
 */
export type ContentAsCodeSyncStatus = {
    skips?: ContentAsCodeSkip[];
    driftWarnings?: string[];
};

export type ContentAsCodeWritebackStatus =
    | 'pending'
    | 'open'
    | 'merged'
    | 'closed'
    | 'error';

export type ContentAsCodeWritebackSummary = {
    contentType: string;
    slug: string;
    branch: string;
    prNumber: number | null;
    prUrl: string | null;
    status: ContentAsCodeWritebackStatus;
    error: string | null;
    createdAt: Date;
    updatedAt: Date;
};

export type ApiContentAsCodeWritebacksResponse = {
    status: 'ok';
    results: ContentAsCodeWritebackSummary[];
};

export type ApiContentAsCodeProposeResponse = {
    status: 'ok';
    results: ContentAsCodeWritebackSummary;
};

export type ContentAsCodeProjectSettings = {
    syncEnabled: boolean;
    stampedAt: Date;
};

export type ApiContentAsCodeSettingsResponse = {
    status: 'ok';
    results: ContentAsCodeProjectSettings | null;
};

export type ContentAsCodeSyncedContentType = 'chart' | 'dashboard';

export type ContentAsCodeConflictSummary = {
    contentType: string;
    slug: string;
    incomingHash: string;
    rejectedAt: Date;
};

/**
 * Three-way view of a skipped slug: base is the last-applied snapshot
 * (merge base), current is the instance content, incoming is the git
 * document rejected at skip time.
 */
export type ContentAsCodeConflict = {
    contentType: string;
    slug: string;
    base: object | null;
    baseHash: string | null;
    appliedAt: Date | null;
    current: object;
    currentHash: string;
    incoming: object;
    incomingHash: string;
    rejectedAt: Date;
};

export type ContentAsCodeConflictResolution = 'take_git' | 'keep_mine';

export type ApiContentAsCodeConflictsResponse = {
    status: 'ok';
    results: ContentAsCodeConflictSummary[];
};

export type ApiContentAsCodeConflictResponse = {
    status: 'ok';
    results: ContentAsCodeConflict;
};
