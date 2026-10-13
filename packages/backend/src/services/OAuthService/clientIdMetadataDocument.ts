import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { isAllowedStrictRedirectUri } from '../../models/oauthStrictRedirectUri';

// OAuth Client ID Metadata Documents (MCP authorization spec, draft-ietf-oauth-client-id-metadata-document).
// The client_id is an https URL; the document it serves describes the public client.

export type ClientIdMetadataDocument = {
    clientId: string;
    clientName: string;
    redirectUris: string[];
    grantTypes: string[];
};

export type ClientIdMetadataDocumentFetch = (
    url: string,
    init: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<{
    ok: boolean;
    status: number;
    headers: { get(name: string): string | null };
    text(): Promise<string>;
}>;

export type ClientIdMetadataDocumentResolverOptions = {
    fetch?: ClientIdMetadataDocumentFetch;
    lookupAddresses?: (hostname: string) => Promise<string[]>;
    cacheTtlMs?: number;
    negativeCacheTtlMs?: number;
    timeoutMs?: number;
    maxBytes?: number;
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

const ipv4Octets = (address: string): number[] | null => {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    const candidate = mapped ? mapped[1] : address;
    if (isIP(candidate) !== 4) return null;
    return candidate.split('.').map(Number);
};

export const isPublicAddress = (address: string): boolean => {
    const octets = ipv4Octets(address);
    if (octets) {
        const [a, b] = octets;
        return !(
            a === 0 ||
            a === 10 ||
            a === 127 ||
            (a === 100 && b >= 64 && b <= 127) ||
            (a === 169 && b === 254) ||
            (a === 172 && b >= 16 && b <= 31) ||
            (a === 192 && b === 168) ||
            (a === 192 && b === 0) ||
            (a === 198 && (b === 18 || b === 19)) ||
            a >= 224
        );
    }
    if (isIP(address) !== 6) return false;
    const normalized = address.toLowerCase();
    return !(
        normalized === '::' ||
        normalized === '::1' ||
        normalized.startsWith('fc') ||
        normalized.startsWith('fd') ||
        normalized.startsWith('fe8') ||
        normalized.startsWith('fe9') ||
        normalized.startsWith('fea') ||
        normalized.startsWith('feb') ||
        normalized.startsWith('::ffff:')
    );
};

const defaultLookupAddresses = async (hostname: string): Promise<string[]> =>
    (await lookup(hostname, { all: true })).map(({ address }) => address);

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

    const grantTypes = document.grant_types ?? SUPPORTED_GRANT_TYPES;
    if (
        !Array.isArray(grantTypes) ||
        grantTypes.length === 0 ||
        !grantTypes.every(
            (grant): grant is string =>
                typeof grant === 'string' &&
                SUPPORTED_GRANT_TYPES.includes(grant),
        )
    )
        return null;

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

    private readonly lookupAddresses: (hostname: string) => Promise<string[]>;

    private readonly cacheTtlMs: number;

    private readonly negativeCacheTtlMs: number;

    private readonly timeoutMs: number;

    private readonly maxBytes: number;

    private readonly now: () => number;

    constructor(options: ClientIdMetadataDocumentResolverOptions = {}) {
        this.fetchDocument =
            options.fetch ??
            ((url, init) =>
                fetch(url, { ...init, redirect: 'error', method: 'GET' }));
        this.lookupAddresses =
            options.lookupAddresses ?? defaultLookupAddresses;
        this.cacheTtlMs = options.cacheTtlMs ?? 60 * 60 * 1000;
        this.negativeCacheTtlMs = options.negativeCacheTtlMs ?? 60 * 1000;
        this.timeoutMs = options.timeoutMs ?? 5000;
        this.maxBytes = options.maxBytes ?? 64 * 1024;
        this.now = options.now ?? Date.now;
    }

    async resolve(clientId: string): Promise<ClientIdMetadataDocument | null> {
        if (!isClientIdMetadataDocumentUrl(clientId)) return null;
        const cached = this.cache.get(clientId);
        if (cached && cached.expiresAt > this.now()) return cached.document;
        const pending = this.inFlight.get(clientId);
        if (pending) return pending;
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
            document = await this.fetchAndValidate(clientId);
        } catch {
            document = null;
        }
        this.cache.set(clientId, {
            document,
            expiresAt:
                this.now() +
                (document ? this.cacheTtlMs : this.negativeCacheTtlMs),
        });
        return document;
    }

    private async fetchAndValidate(
        clientId: string,
    ): Promise<ClientIdMetadataDocument | null> {
        const { hostname } = new URL(clientId);
        const addresses = await this.lookupAddresses(hostname);
        if (addresses.length === 0 || !addresses.every(isPublicAddress))
            return null;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        try {
            const response = await this.fetchDocument(clientId, {
                signal: controller.signal,
                headers: { Accept: 'application/json' },
            });
            if (!response.ok) return null;
            const declaredLength = Number(
                response.headers.get('content-length') ?? '0',
            );
            if (declaredLength > this.maxBytes) return null;
            const body = await response.text();
            if (Buffer.byteLength(body) > this.maxBytes) return null;
            return parseDocument(clientId, body);
        } finally {
            clearTimeout(timer);
        }
    }
}
