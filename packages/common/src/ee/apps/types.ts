import { type ApiSuccess } from '../../types/api/success';

export type ApiGenerateAppResponse = ApiSuccess<{
    appUuid: string;
    versionUuid: string;
}>;

export type ApiPreviewTokenResponse = ApiSuccess<{
    token: string;
}>;
