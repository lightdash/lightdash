import dns from 'dns/promises';
import https from 'https';
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

const isPrivateIPv4 = (ip: string): boolean => {
    const parts = ip.split('.').map(Number);
    if (
        parts.length !== 4 ||
        parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)
    ) {
        return true; // unparseable — fail closed
    }
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8 RFC 1918
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (IMDS)
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12 RFC 1918
    if (a === 192 && b === 168) return true; // 192.168.0.0/16 RFC 1918
    if (a >= 224) return true; // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
    return false;
};

const isPrivateIPv6 = (ip: string): boolean => {
    const lower = ip.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (/^f[cd]/.test(lower)) return true; // fc00::/7 unique local
    if (/^fe[89ab]/.test(lower)) return true; // fe80::/10 link-local
    if (/^ff/.test(lower)) return true; // ff00::/8 multicast

    const mappedHex = lower.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (mappedHex) {
        const hi = parseInt(mappedHex[1], 16);
        const lo = parseInt(mappedHex[2], 16);
        return isPrivateIPv4(
            `${Math.floor(hi / 256)}.${hi % 256}.${Math.floor(lo / 256)}.${
                lo % 256
            }`,
        );
    }
    const mappedDotted = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mappedDotted) return isPrivateIPv4(mappedDotted[1]);

    const compat = lower.match(/^::(\d+\.\d+\.\d+\.\d+)$/);
    if (compat) return isPrivateIPv4(compat[1]);

    return false;
};

const isPrivateAddress = (address: string, family: number): boolean => {
    if (family === 4) return isPrivateIPv4(address);
    if (family === 6) return isPrivateIPv6(address);
    return true; // unknown family — fail closed
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
    for (const { address, family } of addresses) {
        if (isPrivateAddress(address, family)) {
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
            headers: options.headers,
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

    const contentType = (response.headers.get('content-type') ?? '')
        .split(';')[0]
        .trim()
        .toLowerCase();
    const allowed = options.allowedContentTypes.map((t) =>
        t.split(';')[0].trim().toLowerCase(),
    );
    if (!allowed.includes(contentType)) {
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
