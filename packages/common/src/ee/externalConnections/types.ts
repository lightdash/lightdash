export type ExternalConnectionAuthType =
    | 'none'
    | 'api_key'
    | 'bearer_token'
    | 'google_service_account'
    | 'oauth_client_credentials';

export type OAuthClientAuthMethod = 'basic' | 'body';

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
    // Portable identity for content-as-code: generated from the name at
    // create, unique per project among live connections, stable across renames.
    slug: string;
    type: ExternalConnectionAuthType;
    origin: string;
    /** Optional for compatibility with older servers during rolling upgrades. */
    allowBrowserImages?: boolean;
    /** Optional for compatibility with older servers during rolling upgrades. */
    allowDataAppBuilderLinking?: boolean;
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
    // OAuth scopes for Google service accounts and OAuth client credentials.
    oauthScopes: string[] | null;
    /** Optional for compatibility with older servers during rolling upgrades. */
    oauthTokenUrl?: string | null;
    /** Optional for compatibility with older servers during rolling upgrades. */
    oauthClientId?: string | null;
    /** Optional for compatibility with older servers during rolling upgrades. */
    oauthClientAuthMethod?: OAuthClientAuthMethod | null;
    // Static non-secret headers sent on every proxied request, applied before
    // auth so the injected credential always wins (e.g. anthropic-version).
    customHeaders: Record<string, string> | null;
    hasSecret: boolean;
    createdByUserUuid: string | null;
    updatedByUserUuid: string | null;
    createdAt: Date;
    updatedAt: Date;
};

export type ExternalConnectionListItem = ExternalConnection & {
    linkedDataAppCount: number;
    // Custom chart types linking this connection, counted apart from data
    // apps so the two products' usage stays distinguishable.
    linkedChartTypeCount: number;
};

export type ExternalConnectionLinkedApp = {
    appUuid: string;
    name: string;
    slug: string;
    kind: 'data_app' | 'project_chart_type';
    spaceUuid: string | null;
    spaceName: string | null;
    aliases: string[];
};

/** Kept as an object so pagination can be added later without changing the
 *  endpoint's top-level response shape. */
export type ExternalConnectionLinkedApps = {
    items: ExternalConnectionLinkedApp[];
    total: number;
};

export type ApiListExternalConnectionLinkedAppsResponse = {
    status: 'ok';
    results: ExternalConnectionLinkedApps;
};

/** WRITE shape — includes the secret. */
export type CreateExternalConnection = {
    name: string;
    type: ExternalConnectionAuthType;
    origin: string;
    allowBrowserImages?: boolean;
    allowDataAppBuilderLinking?: boolean;
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
    oauthScopes?: string[] | null;
    oauthTokenUrl?: string | null;
    oauthClientId?: string | null;
    oauthClientAuthMethod?: OAuthClientAuthMethod | null;
    customHeaders?: Record<string, string> | null; // static non-secret headers sent on every request
    secret?: string | null; // bearer token, api key, client secret, or service-account keyfile JSON; null for type 'none'
};

/** Omitted/blank `secret` means the stored secret is left unchanged. */
export type UpdateExternalConnection = Partial<CreateExternalConnection>;

export type AppExternalConnectionLink = {
    externalConnectionUuid: string;
    alias: string;
};

/** A link as the app's connection list returns it: alias plus the
 *  connection itself, not the uuid/alias pair the link request takes. */
export type AppExternalConnectionLinked = {
    alias: string;
    connection: ExternalConnection;
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
    /** Safe upstream response headers, normalized to lowercase names. */
    headers: Record<string, string>;
    body: unknown;
    truncated: boolean;
};

export type ApiTestExternalConnectionRequest = {
    method?: ExternalConnectionMethod;
    path: string;
    query?: Record<string, string>;
    body?: unknown;
    /** Optional unsaved edit values to test against the stored connection.
     *  Blank/omitted secret keeps the stored credential when it is still valid. */
    config?: UpdateExternalConnection;
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

export type ApiProposeExternalConnectionConfigRequest = {
    description: string;
};

/** AI-proposed connection config, shaped to prefill the create wizard. Never
 *  carries a secret — the user pastes the credential themselves on the Auth
 *  step. Kept flat for the same TSOA reason as
 *  ApiTestExternalConnectionConfigRequest. */
export type ExternalConnectionConfigProposal = {
    name: string;
    origin: string;
    type: ExternalConnectionAuthType;
    allowBrowserImages: boolean;
    apiKeyName: string | null;
    apiKeyLocation: ApiKeyLocation | null;
    oauthScopes: string[] | null;
    oauthTokenUrl?: string | null;
    oauthClientId?: string | null;
    oauthClientAuthMethod?: OAuthClientAuthMethod | null;
    customHeaders: Record<string, string> | null;
    allowedMethods: ExternalConnectionMethod[];
    allowedPathPrefixes: string[];
    instructions: string | null;
    /** Markdown steps for obtaining the credential; null when type is 'none'. */
    credentialGuide: string | null;
    docsUrl: string | null;
    /** Caveats the user should double-check before saving. */
    notes: string | null;
};

export type ApiProposeExternalConnectionConfigResponse = {
    status: 'ok';
    results: ExternalConnectionConfigProposal;
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
