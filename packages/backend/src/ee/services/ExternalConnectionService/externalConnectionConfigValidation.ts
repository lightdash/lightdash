import {
    assertUnreachable,
    EXTERNAL_CONNECTION_METHODS,
    ParameterError,
    type ApiKeyLocation,
    type ExternalConnectionAuthType,
} from '@lightdash/common';

// Defense-in-depth caps for the numeric limits. The runtime proxy enforces
// these too, but bad config should never be persisted in the first place.
const MAX_RESPONSE_BYTES = 25 * 1024 * 1024; // 25 MiB
const MAX_REQUEST_BYTES = 10 * 1024 * 1024; // 10 MiB
const MAX_TIMEOUT_MS = 120_000; // 2 minutes
const MAX_RATE_LIMIT = 100_000;
const MAX_INSTRUCTIONS_CHARS = 10_000;

const SUPPORTED_METHODS = new Set<string>(EXTERNAL_CONNECTION_METHODS);
// RFC 7230 token chars — valid for HTTP header names and a safe set for query keys.
const HTTP_TOKEN = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;
const CONTENT_TYPE = /^[a-z0-9*]+\/[a-z0-9.+*-]+$/i;
// Google OAuth scopes are full https URLs, except the OIDC scopes
// openid/email/profile which Google's token endpoint accepts as bare names.
export const OAUTH_SCOPE = /^(https:\/\/\S+|openid|email|profile)$/;
// Must be an absolute path with no whitespace, query, or fragment.
const PATH_PREFIX = /^\/[^\s?#]*$/;

/**
 * The complete, resolved connection config to validate. For create this is the
 * request body; for update it's the merged (existing + patch) result, so the
 * invariants always hold on the post-write state.
 */
export type ValidatableExternalConnectionConfig = {
    type: ExternalConnectionAuthType;
    origin: string;
    instructions?: string | null;
    allowedPathPrefixes: string[];
    allowedMethods: string[];
    allowedContentTypes: string[];
    responseMaxBytes?: number;
    requestMaxBytes?: number;
    timeoutMs?: number;
    rateLimitPerMinute?: number | null;
    apiKeyName?: string | null;
    apiKeyLocation?: ApiKeyLocation | null;
    oauthScopes?: string[] | null;
};

/**
 * Validate a Google service account keyfile (the decrypted secret for a
 * 'google_service_account' connection). Called where the plaintext secret is
 * available (create / update-with-secret / testConfig) — the shape-only
 * validateExternalConnectionConfig can't see the secret value itself.
 */
export function validateServiceAccountKeyfile(secret: string): void {
    let parsed: unknown;
    try {
        parsed = JSON.parse(secret);
    } catch {
        throw new ParameterError('Service account key must be valid JSON');
    }
    if (!parsed || typeof parsed !== 'object') {
        throw new ParameterError('Service account key must be a JSON object');
    }
    const keyfile = parsed as Record<string, unknown>;
    if (keyfile.type !== 'service_account') {
        throw new ParameterError(
            'Service account key must have type "service_account"',
        );
    }
    if (
        typeof keyfile.client_email !== 'string' ||
        keyfile.client_email.length === 0
    ) {
        throw new ParameterError(
            'Service account key must include a client_email',
        );
    }
    if (
        typeof keyfile.private_key !== 'string' ||
        keyfile.private_key.length === 0
    ) {
        throw new ParameterError(
            'Service account key must include a private_key',
        );
    }
}

const assertBoundedInt = (
    value: number | undefined,
    name: string,
    max: number,
): void => {
    if (value === undefined) return;
    if (!Number.isInteger(value) || value < 1 || value > max) {
        throw new ParameterError(
            `${name} must be an integer between 1 and ${max}`,
        );
    }
};

/**
 * Server-side validation for an external connection's security config. TypeScript
 * types and TSOA shape-checks are not sufficient for this trust boundary, so we
 * reject (rather than store) anything outside the allowed shape.
 *
 * `hasSecretAfter` is whether a secret will exist on the connection once the
 * write completes (true if one is supplied or already stored and not cleared).
 */
export function validateExternalConnectionConfig(
    config: ValidatableExternalConnectionConfig,
    hasSecretAfter: boolean,
): void {
    // --- origin: https, bare host only ---
    let url: URL;
    try {
        url = new URL(config.origin);
    } catch {
        throw new ParameterError('origin must be a valid absolute URL');
    }
    if (url.protocol !== 'https:') {
        throw new ParameterError('origin must use https');
    }
    if (url.username || url.password) {
        throw new ParameterError('origin must not contain credentials');
    }
    if ((url.pathname && url.pathname !== '/') || url.search || url.hash) {
        throw new ParameterError(
            'origin must be a bare host with no path, query, or fragment',
        );
    }
    if (!url.hostname) {
        throw new ParameterError('origin must include a host');
    }

    if (
        config.instructions != null &&
        config.instructions.length > MAX_INSTRUCTIONS_CHARS
    ) {
        throw new ParameterError(
            `instructions must be at most ${MAX_INSTRUCTIONS_CHARS} characters`,
        );
    }

    // --- path prefixes: absolute, no traversal ---
    config.allowedPathPrefixes.forEach((prefix) => {
        if (
            typeof prefix !== 'string' ||
            !PATH_PREFIX.test(prefix) ||
            prefix.includes('..')
        ) {
            throw new ParameterError(
                `Invalid path prefix: ${JSON.stringify(prefix)}`,
            );
        }
    });

    // --- methods: non-empty, supported only ---
    if (config.allowedMethods.length === 0) {
        throw new ParameterError('At least one allowed method is required');
    }
    config.allowedMethods.forEach((method) => {
        if (!SUPPORTED_METHODS.has(method)) {
            throw new ParameterError(`Unsupported method: ${method}`);
        }
    });

    // --- content types: non-empty, valid tokens ---
    if (config.allowedContentTypes.length === 0) {
        throw new ParameterError(
            'At least one allowed content type is required',
        );
    }
    config.allowedContentTypes.forEach((contentType) => {
        if (
            typeof contentType !== 'string' ||
            !CONTENT_TYPE.test(contentType)
        ) {
            throw new ParameterError(
                `Invalid content type: ${JSON.stringify(contentType)}`,
            );
        }
    });

    // --- numeric limits ---
    assertBoundedInt(
        config.responseMaxBytes,
        'responseMaxBytes',
        MAX_RESPONSE_BYTES,
    );
    assertBoundedInt(
        config.requestMaxBytes,
        'requestMaxBytes',
        MAX_REQUEST_BYTES,
    );
    assertBoundedInt(config.timeoutMs, 'timeoutMs', MAX_TIMEOUT_MS);
    if (
        config.rateLimitPerMinute !== undefined &&
        config.rateLimitPerMinute !== null
    ) {
        assertBoundedInt(
            config.rateLimitPerMinute,
            'rateLimitPerMinute',
            MAX_RATE_LIMIT,
        );
    }

    // --- auth invariants ---
    if (
        config.type !== 'google_service_account' &&
        config.oauthScopes &&
        config.oauthScopes.length > 0
    ) {
        throw new ParameterError(
            'OAuth scopes are only valid for type "google_service_account"',
        );
    }
    switch (config.type) {
        case 'none':
            if (hasSecretAfter) {
                throw new ParameterError('type "none" must not have a secret');
            }
            if (config.apiKeyName || config.apiKeyLocation) {
                throw new ParameterError(
                    'type "none" must not set an api key name or location',
                );
            }
            break;
        case 'bearer_token':
            if (!hasSecretAfter) {
                throw new ParameterError(
                    'type "bearer_token" requires a secret',
                );
            }
            break;
        case 'api_key':
            if (!hasSecretAfter) {
                throw new ParameterError('type "api_key" requires a secret');
            }
            if (!config.apiKeyName || !HTTP_TOKEN.test(config.apiKeyName)) {
                throw new ParameterError(
                    'type "api_key" requires a valid apiKeyName',
                );
            }
            if (
                config.apiKeyLocation !== 'header' &&
                config.apiKeyLocation !== 'query'
            ) {
                throw new ParameterError(
                    'type "api_key" requires apiKeyLocation of "header" or "query"',
                );
            }
            break;
        case 'google_service_account':
            if (!hasSecretAfter) {
                throw new ParameterError(
                    'type "google_service_account" requires a service account key',
                );
            }
            if (config.apiKeyName || config.apiKeyLocation) {
                throw new ParameterError(
                    'type "google_service_account" must not set an api key name or location',
                );
            }
            if (!config.oauthScopes || config.oauthScopes.length === 0) {
                throw new ParameterError(
                    'type "google_service_account" requires at least one OAuth scope',
                );
            }
            config.oauthScopes.forEach((scope) => {
                if (typeof scope !== 'string' || !OAUTH_SCOPE.test(scope)) {
                    throw new ParameterError(
                        `Invalid OAuth scope: ${JSON.stringify(scope)}`,
                    );
                }
            });
            break;
        default:
            assertUnreachable(
                config.type,
                'Unknown external connection auth type',
            );
    }
}
