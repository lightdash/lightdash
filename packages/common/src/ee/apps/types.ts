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
    s3Key: string;
}>;

/**
 * Image attached to a data app generation request.
 * The image is uploaded to S3 via the backend proxy; the s3Key
 * references the uploaded object.
 */
export type AppImageAttachment = {
    s3Key: string; // S3 object key (e.g. 'apps/images/{uuid}.png')
    mimeType: string; // e.g. 'image/png', 'image/jpeg'
    filename: string; // original filename
};

export type GenerateAppRequestBody = {
    prompt: string;
    image?: AppImageAttachment;
    appUuid?: string; // pre-generated UUID so images can be scoped to the app in S3
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
