import { ParameterError } from '../errors';
import type { PromotionAction } from '../promotion';
import { joinContentAsCodePath } from './fileDiscovery';

export const DEFAULT_CONTENT_AS_CODE_PATH = 'lightdash';

// Repo directory for charts/ and dashboards/, relative to the project dir; '' is the project dir itself
export const normalizeContentAsCodePath = (raw: string): string => {
    const value = raw.trim().replace(/\\/g, '/');
    if (value.startsWith('/')) {
        throw new ParameterError(
            'content_as_code.path must be relative to the project directory',
        );
    }
    const segments = value
        .split('/')
        .filter((segment) => segment !== '' && segment !== '.');
    if (segments.includes('..')) {
        throw new ParameterError(
            'content_as_code.path cannot point outside the project directory',
        );
    }
    return segments.join('/');
};

export const getContentAsCodeFilePath = (
    contentPath: string,
    contentType: 'chart' | 'dashboard',
    slug: string,
): string => {
    const folder = contentType === 'chart' ? 'charts' : 'dashboards';
    return joinContentAsCodePath(contentPath, folder, `${slug}.yml`);
};

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
    path: string;
    stampedAt: Date;
};

// What an upload or pull stamps; path absent means the client predates it
export type ContentAsCodeSettingsStamp = {
    sync: boolean;
    path?: string;
};

export type ApiContentAsCodeSettingsResponse = {
    status: 'ok';
    results: ContentAsCodeProjectSettings | null;
};

export type ContentAsCodeUploadAdvisory = {
    openDraftCount: number;
};

export type ApiContentAsCodeUploadAdvisoryResponse = {
    status: 'ok';
    results: ContentAsCodeUploadAdvisory;
};

export type ContentDraftSummary = {
    uuid: string;
    contentType: string;
    contentUuid: string;
    slug: string;
    authorUserUuid: string;
    authorName: string | null;
    status: 'open' | 'written_back' | 'dismissed';
    prUrl: string | null;
    writebackStatus: ContentAsCodeWritebackStatus | null;
    createdAt: Date;
    updatedAt: Date;
};

export type ContentDraftReview = {
    summary: ContentDraftSummary;
    filePath: string;
    publishedYaml: string;
    draftYaml: string;
};

export type ApiContentDraftsResponse = {
    status: 'ok';
    results: ContentDraftSummary[];
};

export type ApiContentDraftReviewResponse = {
    status: 'ok';
    results: ContentDraftReview;
};

export type ApiContentDraftWriteBackResponse = {
    status: 'ok';
    results: ContentDraftSummary;
};

export type ApiContentDraftReopenResponse = {
    status: 'ok';
    results: ContentDraftSummary;
};
