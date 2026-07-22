export type ExternalConnectionAuthType =
    | 'none'
    | 'api_key'
    | 'bearer_token'
    | 'google_service_account';

/** HTTP methods an admin can opt a connection into. Single source of truth for
 *  the backend validation allowlist and the frontend method pickers. */
export const EXTERNAL_CONNECTION_METHODS = [
    'GET',
    'POST',
    'PUT',
    'PATCH',
    'DELETE',
] as const;
export type ExternalConnectionMethod =
    (typeof EXTERNAL_CONNECTION_METHODS)[number];
export type ApiKeyLocation = 'header' | 'query';

/** Bounds for a connection's custom request headers — shared by backend
 *  validation and the frontend form so both reject the same shapes. */
export const CUSTOM_HEADER_LIMITS = {
    maxCount: 20,
    maxNameChars: 128,
    maxValueChars: 1024,
} as const;

/** Header names custom request headers may never use: routing/framing headers
 *  the proxy owns, plus credential-shaped names — header values are plaintext
 *  config returned by the read API, so secrets belong in the encrypted secret. */
export const FORBIDDEN_CUSTOM_HEADER_NAMES = [
    'host',
    'content-length',
    'content-type',
    'connection',
    'transfer-encoding',
    'te',
    'trailer',
    'upgrade',
    'keep-alive',
    'expect',
    'authorization',
    'proxy-authorization',
    'proxy-connection',
    'cookie',
    'x-api-key',
    'api-key',
    'x-auth-token',
    'x-access-token',
] as const;

/** READ shape returned by the API — NEVER includes the secret value. */
export type ExternalConnection = {
    externalConnectionUuid: string;
    projectUuid: string;
    organizationUuid: string;
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
    // OAuth scopes for type 'google_service_account'; null for other types.
    oauthScopes: string[] | null;
    // Static non-secret headers sent on every proxied request, applied before
    // auth so the injected credential always wins (e.g. anthropic-version).
    customHeaders: Record<string, string> | null;
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
    instructions?: string | null;
    allowedPathPrefixes: string[];
    allowedMethods: ExternalConnectionMethod[];
    allowedContentTypes: string[];
    responseMaxBytes?: number; // server default 1048576
    requestMaxBytes?: number; // server default 262144
    timeoutMs?: number; // server default 10000
    rateLimitPerMinute?: number | null;
    apiKeyName?: string | null;
    apiKeyLocation?: ApiKeyLocation | null;
    oauthScopes?: string[] | null; // OAuth scopes for type 'google_service_account'
    customHeaders?: Record<string, string> | null; // static non-secret headers sent on every request
    secret?: string | null; // bearer token, api key, or service account keyfile JSON; null for type 'none'
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

export type ApiTestExternalConnectionRequest = {
    method?: ExternalConnectionMethod;
    path: string;
    query?: Record<string, string>;
    body?: unknown;
};

/** Test an unsaved connection config (incl. plaintext secret) before creating
 *  it. Runs through the same SSRF-guarded proxy core, persisting nothing.
 *  Deliberately a flat object, NOT `ApiTestExternalConnectionRequest & {...}`:
 *  TSOA validates intersection bodies in remove-extras mode, which empties
 *  Record<string, string> fields (query, config.customHeaders). */
export type ApiTestExternalConnectionConfigRequest = {
    method?: ExternalConnectionMethod;
    path: string;
    query?: Record<string, string>;
    body?: unknown;
    config: CreateExternalConnection;
};

export type ApiTestExternalConnectionResponse = {
    status: 'ok';
    results: ExternalFetchResponse;
};

/** The request that produced a sample (stored alongside the response). */
export type ExternalConnectionSampleRequest = {
    method: ExternalConnectionMethod;
    path: string;
    query?: Record<string, string>;
    body?: unknown;
};

/** READ shape for a persisted sample row. */
export type ExternalConnectionSample = {
    sampleUuid: string;
    externalConnectionUuid: string;
    label: string | null;
    request: ExternalConnectionSampleRequest;
    response: unknown;
    createdAt: Date;
};

export type ApiSaveExternalConnectionSampleRequest = {
    label?: string | null;
    request: ExternalConnectionSampleRequest;
    response: unknown;
};

export type ApiSaveExternalConnectionSampleResponse = {
    status: 'ok';
    results: ExternalConnectionSample;
};

export type ApiListExternalConnectionSamplesResponse = {
    status: 'ok';
    results: ExternalConnectionSample[];
};
