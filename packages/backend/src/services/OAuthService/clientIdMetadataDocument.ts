import { isIP } from 'node:net';
import { isAllowedStrictRedirectUri } from '../../models/oauthStrictRedirectUri';
import { secureFetch } from '../../utils/secureFetch/secureFetch';

// OAuth Client ID Metadata Documents (MCP authorization spec, draft-ietf-oauth-client-id-metadata-document).
// The client_id is an https URL; the document it serves describes the public client.

export type ClientIdMetadataDocument = {
    clientId: string;
    clientName: string;
    redirectUris: string[];
    grantTypes: string[];
};

// Fetches the document body. Throws for anything that is not a successful fetch.
export type ClientIdMetadataDocumentFetch = (
    url: string,
    options: { timeoutMs: number; maxBytes: number },
) => Promise<{ status: number; bodyText: string }>;

export type ClientIdMetadataDocumentResolverOptions = {
    fetch?: ClientIdMetadataDocumentFetch;
    cacheTtlMs?: number;
    negativeCacheTtlMs?: number;
    timeoutMs?: number;
    maxBytes?: number;
    maxCacheEntries?: number;
    maxInFlight?: number;
    now?: () => number;
};

const SUPPORTED_GRANT_TYPES = ['authorization_code', 'refresh_token'];

export const isClientIdMetadataDocumentUrl = (clientId: string): boolean => {
    if (/[\u0000- \u007f\\#]/.test(clientId)) return false;
    try {
        const url = new URL(clientId);
        return (
            url.protocol === 'https:' &&
            url.username === '' &&
            url.password === '' &&
            url.hash === '' &&
            url.hostname !== '' &&
            isIP(url.hostname.replace(/^\[|\]$/g, '')) === 0 &&
            url.pathname !== '/' &&
            url.href === clientId
        );
    } catch {
        return false;
    }
};

// secureFetch pins the connection to a validated public address, refuses
// redirects, and caps the body size, so the document URL is never followed blindly.
const secureDocumentFetch: ClientIdMetadataDocumentFetch = async (
    url,
    { timeoutMs, maxBytes },
) => {
    const response = await secureFetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        timeoutMs,
        maxResponseBytes: maxBytes,
        allowedContentTypes: ['application/json'],
    });
    if (response.truncated) throw new Error('Document body was truncated');
    return { status: response.status, bodyText: response.bodyText };
};

const parseDocument = (
    clientId: string,
    body: string,
): ClientIdMetadataDocument | null => {
    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch {
        return null;
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
        return null;
    const document = parsed as Record<string, unknown>;
    if (document.client_id !== clientId) return null;

    const redirectUris = document.redirect_uris;
    if (
        !Array.isArray(redirectUris) ||
        redirectUris.length === 0 ||
        !redirectUris.every(
            (uri): uri is string =>
                typeof uri === 'string' && isAllowedStrictRedirectUri(uri),
        )
    )
        return null;

    const authMethod = document.token_endpoint_auth_method;
    if (authMethod !== undefined && authMethod !== 'none') return null;

    // Clients may advertise grants we do not issue (e.g. jwt-bearer); keep the
    // supported subset, but the client must be able to use the authorization code flow.
    const declaredGrantTypes = document.grant_types ?? SUPPORTED_GRANT_TYPES;
    if (!Array.isArray(declaredGrantTypes)) return null;
    const grantTypes = declaredGrantTypes.filter(
        (grant): grant is string =>
            typeof grant === 'string' && SUPPORTED_GRANT_TYPES.includes(grant),
    );
    if (!grantTypes.includes('authorization_code')) return null;

    const clientName =
        typeof document.client_name === 'string' &&
        document.client_name.trim() !== ''
            ? document.client_name.trim().slice(0, 255)
            : new URL(clientId).hostname;

    return {
        clientId,
        clientName,
        redirectUris: [...new Set(redirectUris)],
        grantTypes: [...new Set(grantTypes)],
    };
};

export class ClientIdMetadataDocumentResolver {
    private readonly cache = new Map<
        string,
        { document: ClientIdMetadataDocument | null; expiresAt: number }
    >();

    private readonly inFlight = new Map<
        string,
        Promise<ClientIdMetadataDocument | null>
    >();

    private readonly fetchDocument: ClientIdMetadataDocumentFetch;

    private readonly cacheTtlMs: number;

    private readonly negativeCacheTtlMs: number;

    private readonly timeoutMs: number;

    private readonly maxBytes: number;

    private readonly maxCacheEntries: number;

    private readonly maxInFlight: number;

    private readonly now: () => number;

    constructor(options: ClientIdMetadataDocumentResolverOptions = {}) {
        this.fetchDocument = options.fetch ?? secureDocumentFetch;
        this.cacheTtlMs = options.cacheTtlMs ?? 60 * 60 * 1000;
        this.negativeCacheTtlMs = options.negativeCacheTtlMs ?? 60 * 1000;
        this.timeoutMs = options.timeoutMs ?? 5000;
        this.maxBytes = options.maxBytes ?? 64 * 1024;
        this.maxCacheEntries = options.maxCacheEntries ?? 1000;
        this.maxInFlight = options.maxInFlight ?? 100;
        this.now = options.now ?? Date.now;
    }

    async resolve(clientId: string): Promise<ClientIdMetadataDocument | null> {
        if (!isClientIdMetadataDocumentUrl(clientId)) return null;
        const cached = this.cache.get(clientId);
        if (cached && cached.expiresAt > this.now()) return cached.document;
        const pending = this.inFlight.get(clientId);
        if (pending) return pending;
        // Unauthenticated callers choose the URL, so concurrency is capped rather than queued.
        if (this.inFlight.size >= this.maxInFlight) return null;
        const promise = this.load(clientId).finally(() =>
            this.inFlight.delete(clientId),
        );
        this.inFlight.set(clientId, promise);
        return promise;
    }

    private async load(
        clientId: string,
    ): Promise<ClientIdMetadataDocument | null> {
        let document: ClientIdMetadataDocument | null = null;
        try {
            const response = await this.fetchDocument(clientId, {
                timeoutMs: this.timeoutMs,
                maxBytes: this.maxBytes,
            });
            if (response.status >= 200 && response.status < 300)
                document = parseDocument(clientId, response.bodyText);
        } catch {
            document = null;
        }
        this.remember(clientId, document);
        return document;
    }

    private remember(
        clientId: string,
        document: ClientIdMetadataDocument | null,
    ): void {
        this.cache.delete(clientId);
        while (this.cache.size >= this.maxCacheEntries) {
            const oldest = this.cache.keys().next().value;
            if (oldest === undefined) break;
            this.cache.delete(oldest);
        }
        this.cache.set(clientId, {
            document,
            expiresAt:
                this.now() +
                (document ? this.cacheTtlMs : this.negativeCacheTtlMs),
        });
    }
}
