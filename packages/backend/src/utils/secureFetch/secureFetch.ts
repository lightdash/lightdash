import dns from 'dns/promises';
import https from 'https';
import * as ipaddr from 'ipaddr.js';
import { LookupFunction } from 'net';
import fetch, { FetchError } from 'node-fetch';

export type SecureFetchReason =
    | 'non_https'
    | 'blocked_ip'
    | 'invalid_url'
    | 'redirect'
    | 'timeout'
    | 'too_large'
    | 'disallowed_content_type'
    | 'request_failed';

export class SecureFetchError extends Error {
    public readonly reason: SecureFetchReason;

    constructor(reason: SecureFetchReason, message: string) {
        super(message);
        this.name = 'SecureFetchError';
        this.reason = reason;
        Object.setPrototypeOf(this, SecureFetchError.prototype);
    }
}

export type SecureFetchOptions = {
    method: 'GET' | 'POST';
    body?: string;
    headers?: Record<string, string>;
    timeoutMs: number;
    maxResponseBytes: number;
    allowedContentTypes: string[];
};

export type SecureFetchResult = {
    status: number;
    contentType: string;
    bodyText: string;
    truncated: boolean;
};

const parseHttpsUrl = (rawUrl: string): URL => {
    if (!rawUrl) {
        throw new SecureFetchError('invalid_url', 'URL is required');
    }
    let parsedUrl: URL;
    try {
        parsedUrl = new URL(rawUrl);
    } catch {
        throw new SecureFetchError('invalid_url', 'Invalid URL format');
    }
    if (parsedUrl.protocol !== 'https:') {
        throw new SecureFetchError(
            'non_https',
            'Only HTTPS protocol is allowed',
        );
    }
    return parsedUrl;
};

// Returns true when the address must be blocked (non-routable, private,
// loopback, link-local, multicast, reserved, or unparseable). Uses ipaddr.js
// so that tunnelled ranges like 6to4 (2002:7f00::/16) and NAT64
// (64:ff9b::/96) collapse to their IPv4 range via ipaddr.process(). Fail-closed:
// if the address cannot be parsed it is treated as blocked.
const isNonPublicAddress = (address: string): boolean => {
    try {
        return ipaddr.process(address).range() !== 'unicast';
    } catch {
        return true; // unparseable — fail closed
    }
};

const resolveAndValidateHost = async (
    hostname: string,
): Promise<{ address: string; family: 4 | 6 }> => {
    // URL.hostname wraps IPv6 literals in brackets ("[::1]") — strip them.
    const cleanHost = hostname.replace(/^\[/, '').replace(/\]$/, '');

    let addresses: Array<{ address: string; family: number }>;
    try {
        addresses = await dns.lookup(cleanHost, { all: true, verbatim: true });
    } catch {
        throw new SecureFetchError('blocked_ip', 'Unable to resolve hostname');
    }
    if (addresses.length === 0) {
        throw new SecureFetchError('blocked_ip', 'Unable to resolve hostname');
    }
    for (const { address } of addresses) {
        if (isNonPublicAddress(address)) {
            throw new SecureFetchError(
                'blocked_ip',
                'Access to private/internal addresses is not allowed',
            );
        }
    }
    const { address, family } = addresses[0];
    return { address, family: family === 6 ? 6 : 4 };
};

const MAX_TIMEOUT_MS = 30000;

// Identify the proxy to upstreams. Some APIs (e.g. GitHub) reject requests with
// no User-Agent. Callers can still override it via options.headers.
const DEFAULT_USER_AGENT = 'Lightdash-DataApp-Proxy';

const normalizeContentType = (contentType: string): string =>
    contentType.split(';')[0].trim().toLowerCase();

const isAllowedContentType = (
    contentType: string,
    allowedContentTypes: string[],
): boolean => {
    if (allowedContentTypes.length === 0) {
        return true;
    }

    const allowed = allowedContentTypes.map(normalizeContentType);
    if (allowed.includes(contentType)) {
        return true;
    }

    // Treat structured-syntax JSON media types (RFC 6839), like
    // application/geo+json, as JSON when a connection allows application/json.
    return (
        allowed.includes('application/json') && contentType.endsWith('+json')
    );
};

// HTTPS agent whose DNS lookup is pinned to a single pre-validated IP. This
// defeats DNS rebinding between validation and socket open: the kernel never
// resolves the hostname a second time.
const createPinnedHttpsAgent = (
    address: string,
    family: 4 | 6,
): https.Agent => {
    const lookup: LookupFunction = (_hostname, lookupOptions, callback) => {
        if (lookupOptions && (lookupOptions as { all?: boolean }).all) {
            (
                callback as (
                    err: NodeJS.ErrnoException | null,
                    addrs: Array<{ address: string; family: number }>,
                ) => void
            )(null, [{ address, family }]);
            return;
        }
        callback(null, address, family);
    };
    return new https.Agent({ lookup } as https.AgentOptions);
};

export async function secureFetch(
    rawUrl: string,
    options: SecureFetchOptions,
): Promise<SecureFetchResult> {
    const parsedUrl = parseHttpsUrl(rawUrl);
    const { address, family } = await resolveAndValidateHost(
        parsedUrl.hostname,
    );
    const agent = createPinnedHttpsAgent(address, family);

    const controller = new AbortController();
    const effectiveTimeout = Math.min(options.timeoutMs, MAX_TIMEOUT_MS);
    const timer = setTimeout(() => controller.abort(), effectiveTimeout);

    let response: import('node-fetch').Response;
    try {
        response = await fetch(rawUrl, {
            method: options.method,
            body: options.body,
            headers: { 'User-Agent': DEFAULT_USER_AGENT, ...options.headers },
            agent,
            redirect: 'manual',
            signal: controller.signal as never,
            size: options.maxResponseBytes,
        });
    } catch (error) {
        if (
            controller.signal.aborted ||
            (error instanceof FetchError && error.type === 'aborted')
        ) {
            throw new SecureFetchError('timeout', 'Request timed out');
        }
        if (error instanceof FetchError) {
            throw new SecureFetchError(
                'request_failed',
                `Request failed: ${error.message}`,
            );
        }
        throw new SecureFetchError('request_failed', 'Request failed');
    } finally {
        clearTimeout(timer);
    }

    // Validation only covered the initial URL; any redirect target is
    // unvalidated, so the chain ends here.
    if (response.status >= 300 && response.status < 400) {
        throw new SecureFetchError(
            'redirect',
            'Redirects are not allowed for security reasons',
        );
    }
    if (!response.ok) {
        throw new SecureFetchError(
            'request_failed',
            `Request failed with status ${response.status}`,
        );
    }

    const contentLength = response.headers.get('content-length');
    if (
        contentLength &&
        Number.parseInt(contentLength, 10) > options.maxResponseBytes
    ) {
        throw new SecureFetchError(
            'too_large',
            `Response too large (max ${options.maxResponseBytes} bytes)`,
        );
    }

    const contentType = normalizeContentType(
        response.headers.get('content-type') ?? '',
    );
    // Empty allowlist = no content-type restriction (explicit opt-out; the proxy
    // always passes a non-empty list). When non-empty, enforce a strict allowlist.
    if (!isAllowedContentType(contentType, options.allowedContentTypes)) {
        throw new SecureFetchError(
            'disallowed_content_type',
            `Disallowed content-type: ${contentType || '(none)'}`,
        );
    }

    let bodyText: string;
    try {
        bodyText = await response.text();
    } catch (error) {
        // node-fetch's `size` option throws FetchError type 'max-size' when the
        // streamed body exceeds the limit.
        if (error instanceof FetchError && error.type === 'max-size') {
            throw new SecureFetchError(
                'too_large',
                `Response too large (max ${options.maxResponseBytes} bytes)`,
            );
        }
        throw new SecureFetchError('request_failed', 'Failed to read response');
    }

    return {
        status: response.status,
        contentType,
        bodyText,
        truncated: false,
    };
}
