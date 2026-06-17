export type ExternalConnectionAuthType = 'none' | 'api_key' | 'bearer_token';
export type ExternalConnectionMethod = 'GET' | 'POST';
export type ApiKeyLocation = 'header' | 'query';

/** READ shape returned by the API — NEVER includes the secret value. */
export type ExternalConnection = {
    externalConnectionUuid: string;
    projectUuid: string;
    organizationUuid: string;
    name: string;
    type: ExternalConnectionAuthType;
    origin: string;
    allowedPathPrefixes: string[];
    allowedMethods: ExternalConnectionMethod[];
    allowedContentTypes: string[];
    responseMaxBytes: number;
    requestMaxBytes: number;
    timeoutMs: number;
    rateLimitPerMinute: number | null;
    apiKeyName: string | null;
    apiKeyLocation: ApiKeyLocation | null;
    hasSecret: boolean;
    createdByUserUuid: string | null;
    updatedByUserUuid: string | null;
    createdAt: Date;
    updatedAt: Date;
};

/** WRITE shape — includes the secret. */
export type CreateExternalConnection = {
    name: string;
    type: ExternalConnectionAuthType;
    origin: string;
    allowedPathPrefixes: string[];
    allowedMethods: ExternalConnectionMethod[];
    allowedContentTypes: string[];
    responseMaxBytes?: number; // server default 1048576
    requestMaxBytes?: number; // server default 262144
    timeoutMs?: number; // server default 10000
    rateLimitPerMinute?: number | null;
    apiKeyName?: string | null;
    apiKeyLocation?: ApiKeyLocation | null;
    secret?: string | null; // bearer token or api key value; null for type 'none'
};

/** Omitted/blank `secret` means the stored secret is left unchanged. */
export type UpdateExternalConnection = Partial<CreateExternalConnection>;

export type AppExternalConnectionLink = {
    externalConnectionUuid: string;
    alias: string;
};

/** Server-applied defaults for the optional numeric limits. */
export const EXTERNAL_CONNECTION_DEFAULTS = {
    responseMaxBytes: 1048576,
    requestMaxBytes: 262144,
    timeoutMs: 10000,
} as const;

export type ExternalFetchRequest = {
    connectionAlias: string;
    method?: ExternalConnectionMethod;
    path: string;
    query?: Record<string, string>;
    body?: unknown;
};

export type ExternalFetchResponse = {
    status: number;
    contentType: string;
    body: unknown;
    truncated: boolean;
};
