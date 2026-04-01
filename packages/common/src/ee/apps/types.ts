import { type ApiSuccess, type ApiSuccessEmpty } from '../../types/api/success';

export type ApiGenerateAppResponse = ApiSuccess<{
    appUuid: string;
    version: number;
}>;

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
