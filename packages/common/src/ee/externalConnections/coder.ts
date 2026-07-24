import type { ContentAsCodeType } from '../../types/coder';
import type { PromotionAction } from '../../types/promotion';
import type {
    ApiKeyLocation,
    ExternalConnectionAuthType,
    ExternalConnectionMethod,
} from './types';

/**
 * Portable document for an external connection, stored as
 * `lightdash/external-connections/<slug>.yml`. Never carries the secret —
 * uploads resolve it from the LIGHTDASH_EXTERNAL_CONNECTION_SECRET_<SLUG>
 * environment variable on the CLI side.
 */
export type ExternalConnectionAsCode = {
    contentType: ContentAsCodeType.EXTERNAL_CONNECTION;
    version: number;
    slug: string;
    name: string;
    type: ExternalConnectionAuthType;
    origin: string;
    instructions: string | null;
    allowedPathPrefixes: string[];
    allowedMethods: ExternalConnectionMethod[];
    allowedContentTypes: string[];
    responseMaxBytes: number;
    requestMaxBytes: number;
    timeoutMs: number;
    rateLimitPerMinute: number | null;
    apiKeyName: string | null;
    apiKeyLocation: ApiKeyLocation | null;
    oauthScopes: string[] | null;
    customHeaders: Record<string, string> | null;
};

export type ApiExternalConnectionAsCodeListResponse = {
    status: 'ok';
    results: {
        externalConnections: ExternalConnectionAsCode[];
        missingSlugs: string[];
        total: number;
        offset: number;
    };
};

/**
 * Deliberately a flat wrapper, NOT `ExternalConnectionAsCode & { secret }`:
 * TSOA validates intersection bodies in remove-extras mode, which empties
 * Record<string, string> fields (customHeaders). Same workaround as
 * ApiTestExternalConnectionConfigRequest.
 */
export type ApiExternalConnectionAsCodeUpsertRequest = {
    connection: ExternalConnectionAsCode;
    /**
     * Resolved by the CLI from LIGHTDASH_EXTERNAL_CONNECTION_SECRET_<SLUG> at
     * upload time. Omitted = leave any stored secret unchanged.
     */
    secret?: string;
};

export type ApiExternalConnectionAsCodeUpsertResponse = {
    status: 'ok';
    results: {
        action:
            | PromotionAction.CREATE
            | PromotionAction.UPDATE
            | PromotionAction.NO_CHANGES;
    };
};
