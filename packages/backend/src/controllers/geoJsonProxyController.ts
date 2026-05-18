import { ApiErrorPayload, ParameterError } from '@lightdash/common';
import {
    Get,
    Middlewares,
    OperationId,
    Query,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import dns from 'dns/promises';
import https from 'https';
import { LookupFunction } from 'net';
import fetch, {
    FetchError,
    type Response as NodeFetchResponse,
} from 'node-fetch';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const TIMEOUT_MS = 30000; // 30 seconds

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
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local (AWS/GCP IMDS)
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

const PRIVATE_HOST_ERROR =
    'Access to private/internal addresses is not allowed';

const validateUrlSyntax = (url: string): URL => {
    if (!url) {
        throw new ParameterError('URL parameter is required');
    }

    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url);
    } catch (error) {
        throw new ParameterError('Invalid URL format');
    }

    if (parsedUrl.protocol !== 'https:') {
        throw new ParameterError('Only HTTPS protocol is allowed');
    }

    const pathname = parsedUrl.pathname.toLowerCase();
    if (
        !pathname.endsWith('.json') &&
        !pathname.endsWith('.geojson') &&
        !pathname.endsWith('.topojson')
    ) {
        throw new ParameterError(
            'Only .json, .geojson, or .topojson files are allowed',
        );
    }

    return parsedUrl;
};

const resolveAndValidateHost = async (
    hostname: string,
): Promise<{ address: string; family: 4 | 6 }> => {
    // URL.hostname returns IPv6 literals wrapped in brackets ("[::1]") — strip them.
    const cleanHost = hostname.replace(/^\[/, '').replace(/\]$/, '');

    let addresses: Array<{ address: string; family: number }>;
    try {
        addresses = await dns.lookup(cleanHost, {
            all: true,
            verbatim: true,
        });
    } catch (error) {
        throw new ParameterError('Unable to resolve hostname');
    }

    if (addresses.length === 0) {
        throw new ParameterError('Unable to resolve hostname');
    }

    for (const { address, family } of addresses) {
        if (isPrivateAddress(address, family)) {
            throw new ParameterError(PRIVATE_HOST_ERROR);
        }
    }

    const { address, family } = addresses[0];
    return { address, family: family === 6 ? 6 : 4 };
};

// Returns an HTTPS agent whose DNS lookup is pinned to a single
// pre-validated IP. This defeats DNS rebinding between the time we
// validated the resolved IPs and the time `fetch` opens the socket —
// the kernel never resolves the hostname a second time.
const createPinnedHttpsAgent = (
    address: string,
    family: 4 | 6,
): https.Agent => {
    const lookup: LookupFunction = (_hostname, options, callback) => {
        if (options && (options as { all?: boolean }).all) {
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

const readResponseWithSizeLimit = async (
    response: NodeFetchResponse,
): Promise<string> => {
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_FILE_SIZE) {
        throw new ParameterError(
            `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
        );
    }
    try {
        return await response.text();
    } catch (error) {
        // node-fetch's `size` option throws FetchError with type 'max-size'
        // when the streamed body exceeds the limit.
        if (error instanceof FetchError && error.type === 'max-size') {
            throw new ParameterError(
                `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
            );
        }
        throw error;
    }
};

@Route('/api/v1/geojson-proxy')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Map')
export class GeoJsonProxyController extends BaseController {
    /**
     * Proxies external GeoJSON files to bypass CORS restrictions
     * @param url the URL of the GeoJSON file
     * @summary Proxy GeoJSON
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get()
    @OperationId('getGeoJson')
    async get(@Query() url: string): Promise<Record<string, unknown>> {
        const parsedUrl = validateUrlSyntax(url);
        const { address, family } = await resolveAndValidateHost(
            parsedUrl.hostname,
        );
        const agent = createPinnedHttpsAgent(address, family);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

        let response: NodeFetchResponse;
        try {
            response = await fetch(url, {
                agent,
                redirect: 'manual',
                signal: controller.signal as never,
                size: MAX_FILE_SIZE,
            });
        } finally {
            clearTimeout(timer);
        }

        // Validation only covered the initial URL. Any redirect target is
        // unvalidated, so the response chain ends here.
        if (response.status >= 300 && response.status < 400) {
            throw new ParameterError(
                'Redirects are not supported for security reasons',
            );
        }

        if (!response.ok) {
            throw new ParameterError(
                `Failed to fetch GeoJSON: ${response.status}`,
            );
        }

        const text = await readResponseWithSizeLimit(response);

        let data: unknown;
        try {
            data = JSON.parse(text);
        } catch (error) {
            throw new ParameterError('Invalid JSON format');
        }

        if (typeof data !== 'object' || data === null || Array.isArray(data)) {
            throw new ParameterError('Invalid GeoJSON: expected an object');
        }

        this.setStatus(200);
        return data as Record<string, unknown>;
    }
}
