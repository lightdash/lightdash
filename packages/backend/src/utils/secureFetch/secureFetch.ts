import dns from 'dns/promises';

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

export async function secureFetch(
    rawUrl: string,
    options: SecureFetchOptions,
): Promise<SecureFetchResult> {
    const parsedUrl = parseHttpsUrl(rawUrl);
    const { address, family } = await resolveAndValidateHost(
        parsedUrl.hostname,
    );
    throw new SecureFetchError(
        'request_failed',
        `not implemented (resolved ${address}/${family})`,
    );
}
