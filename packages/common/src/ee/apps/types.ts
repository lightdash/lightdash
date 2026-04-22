import { type ApiSuccess, type ApiSuccessEmpty } from '../../types/api/success';
import { type KnexPaginateArgs } from '../../types/knex-paginate';
import { type MetricQuery } from '../../types/metricQuery';

/**
 * Ordered pipeline stages. Index position determines progression — used to
 * skip completed stages when a build is retried after a worker crash.
 * 'ready' is included as the final stage; 'error' is terminal but not a
 * stage (not reachable through normal progression).
 */
export const APP_VERSION_STAGE_ORDER = [
    'pending',
    'sandbox',
    'catalog',
    'generating',
    'building',
    'packaging',
    'ready',
] as const;

export const APP_VERSION_TERMINAL_STATUSES = ['ready', 'error'] as const;

export type AppVersionStatus =
    | (typeof APP_VERSION_STAGE_ORDER)[number]
    | 'error';

export const isAppVersionInProgress = (status: AppVersionStatus): boolean =>
    !(APP_VERSION_TERMINAL_STATUSES as readonly string[]).includes(status);

export type ApiGenerateAppResponse = ApiSuccess<{
    appUuid: string;
    version: number;
}>;

export type ApiAppImageUploadResponse = ApiSuccess<{
    imageId: string;
}>;

export type GenerateAppRequestBody = {
    prompt: string;
    imageId?: string;
    appUuid?: string; // pre-generated UUID so images can be scoped to the app in S3
    chartUuids?: string[]; // saved chart UUIDs to resolve and pass as structured metric queries
};

export type ApiPreviewTokenResponse = ApiSuccess<{
    token: string;
}>;

export type ApiAppVersionSummary = {
    version: number;
    prompt: string;
    status: AppVersionStatus;
    statusMessage: string | null;
    createdAt: Date;
};

export type ApiGetAppResponse = ApiSuccess<{
    appUuid: string;
    name: string;
    description: string;
    createdByUserUuid: string;
    versions: ApiAppVersionSummary[];
    hasMore: boolean;
}>;

export type ApiUpdateAppRequest = {
    name?: string;
    description?: string;
};

export type ApiUpdateAppResponse = ApiSuccess<{
    appUuid: string;
    name: string;
    description: string;
}>;

export type ApiCancelAppVersionResponse = ApiSuccessEmpty;

export type ApiAppSummary = {
    appUuid: string;
    name: string;
    description: string;
    projectUuid: string;
    projectName: string;
    createdAt: Date;
    lastVersionNumber: number | null;
    lastVersionStatus: AppVersionStatus | null;
};

export type ChartReference = {
    chartName: string;
    chartDescription: string;
    exploreName: string;
    metricQuery: MetricQuery;
};

export type ApiMyAppsResponse = ApiSuccess<{
    data: ApiAppSummary[];
    pagination?: KnexPaginateArgs & {
        totalPageCount: number;
        totalResults: number;
    };
}>;
