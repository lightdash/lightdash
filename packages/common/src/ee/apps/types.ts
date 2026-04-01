import { type ApiSuccess } from '../../types/api/success';

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
    versions: ApiAppVersionSummary[];
    hasMore: boolean;
}>;
