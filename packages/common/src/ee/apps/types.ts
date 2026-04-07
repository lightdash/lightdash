import { type ApiSuccess, type ApiSuccessEmpty } from '../../types/api/success';
import { type KnexPaginateArgs } from '../../types/knex-paginate';

export type ApiGenerateAppResponse = ApiSuccess<{
    appUuid: string;
    version: number;
}>;

/**
 * Image attached to a data app generation request.
 *
 * Phase 1: `data` contains the base64-encoded image sent inline in the JSON body.
 * Phase 2: Add an optional `s3Key` field for images pre-uploaded to S3 via
 * presigned URL. When `s3Key` is present, `data` can be omitted and the backend
 * streams the image from S3 into the sandbox. This also enables persisting images
 * alongside the source tarball for use as app assets.
 */
export type AppImageAttachment = {
    data: string; // base64-encoded image content
    mimeType: string; // e.g. 'image/png', 'image/jpeg'
    filename: string; // original filename
};

export type GenerateAppRequestBody = {
    prompt: string;
    image?: AppImageAttachment;
};

export type ApiPreviewTokenResponse = ApiSuccess<{
    token: string;
}>;

export type ApiAppVersionSummary = {
    version: number;
    prompt: string;
    status: string;
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
    lastVersionStatus: string | null;
};

export type ApiMyAppsResponse = ApiSuccess<{
    data: ApiAppSummary[];
    pagination?: KnexPaginateArgs & {
        totalPageCount: number;
        totalResults: number;
    };
}>;
