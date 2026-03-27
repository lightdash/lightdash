import { type ApiSuccess } from '../../types/api/success';

export type ApiGenerateAppResponse = ApiSuccess<{
    appUuid: string;
    version: number;
}>;

export type ApiPreviewTokenResponse = ApiSuccess<{
    token: string;
}>;
