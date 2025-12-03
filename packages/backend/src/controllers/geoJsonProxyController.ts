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
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const TIMEOUT_MS = 30000; // 30 seconds

// Private IP ranges to block (SSRF protection)
const PRIVATE_IP_PATTERNS = [
    /^10\./, // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
    /^192\.168\./, // 192.168.0.0/16
    /^127\./, // 127.0.0.0/8 (loopback)
    /^169\.254\./, // 169.254.0.0/16 (link-local)
    /^0\./, // 0.0.0.0/8
    /^::1$/, // IPv6 loopback
    /^fc00:/, // IPv6 unique local
    /^fe80:/, // IPv6 link-local
];

const isPrivateHost = (hostname: string): boolean => {
    // Block localhost variants
    if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1'
    ) {
        return true;
    }
    // Block private IP ranges
    return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(hostname));
};

const validateUrl = (url: string) => {
    if (!url) {
        throw new ParameterError('URL parameter is required');
    }

    // Validate URL format
    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url);
    } catch (error) {
        throw new ParameterError('Invalid URL format');
    }

    // Only allow HTTPS protocol
    if (parsedUrl.protocol !== 'https:') {
        throw new ParameterError('Only HTTPS protocol is allowed');
    }

    // Block private/internal IP addresses (SSRF protection)
    if (isPrivateHost(parsedUrl.hostname)) {
        throw new ParameterError(
            'Access to private/internal addresses is not allowed',
        );
    }

    // Only allow .json files
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
};
const readResponseWithSizeLimit = async (
    response: globalThis.Response,
): Promise<string> => {
    // Check content-length header first (early rejection)
    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > MAX_FILE_SIZE) {
        throw new ParameterError(
            `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
        );
    }

    // Stream the body with size limit to prevent memory exhaustion
    const reader = response.body?.getReader();
    if (!reader) {
        throw new ParameterError('Unable to read response body');
    }

    const chunks: Uint8Array[] = [];
    let receivedLength = 0;

    const processChunk = async (): Promise<void> => {
        const { done, value } = await reader.read();
        if (done) return;

        receivedLength += value.length;
        if (receivedLength > MAX_FILE_SIZE) {
            await reader.cancel();
            throw new ParameterError(
                `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
            );
        }
        chunks.push(value);
        await processChunk();
    };

    await processChunk();

    // Combine chunks and decode to string
    const combined = new Uint8Array(receivedLength);
    let offset = 0;
    for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
    }

    return new TextDecoder().decode(combined);
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
        validateUrl(url);

        const response = await fetch(url, {
            signal: AbortSignal.timeout(TIMEOUT_MS),
        });

        if (!response.ok) {
            throw new ParameterError(
                `Failed to fetch GeoJSON: ${response.status}`,
            );
        }

        // Read body with streaming size limit
        const text = await readResponseWithSizeLimit(response);

        // Parse JSON
        let data: unknown;
        try {
            data = JSON.parse(text);
        } catch (error) {
            throw new ParameterError('Invalid JSON format');
        }

        // Validate it's an object (GeoJSON/TopoJSON are always objects)
        if (typeof data !== 'object' || data === null || Array.isArray(data)) {
            throw new ParameterError('Invalid GeoJSON: expected an object');
        }

        this.setStatus(200);
        return data as Record<string, unknown>;
    }
}
