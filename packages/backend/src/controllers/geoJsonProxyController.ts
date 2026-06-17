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
import {
    secureFetch,
    SecureFetchError,
} from '../utils/secureFetch/secureFetch';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const TIMEOUT_MS = 30000; // 30 seconds

// Translate the generic secureFetch failure reasons into the ParameterError
// messages this endpoint returned before it was refactored onto secureFetch.
const toParameterError = (error: SecureFetchError): ParameterError => {
    switch (error.reason) {
        case 'invalid_url':
            return new ParameterError('Invalid URL format');
        case 'non_https':
            return new ParameterError('Only HTTPS protocol is allowed');
        case 'blocked_ip':
            return new ParameterError(
                'Access to private/internal addresses is not allowed',
            );
        case 'redirect':
            return new ParameterError(
                'Redirects are not supported for security reasons',
            );
        case 'timeout':
            return new ParameterError('Failed to fetch GeoJSON: timed out');
        case 'too_large':
            return new ParameterError(
                `File too large (max ${MAX_FILE_SIZE / 1024 / 1024}MB)`,
            );
        case 'disallowed_content_type':
            return new ParameterError('Failed to fetch GeoJSON: invalid type');
        case 'request_failed':
        default:
            return new ParameterError(
                `Failed to fetch GeoJSON: ${error.message}`,
            );
    }
};

const validateGeoJsonUrlSyntax = (url: string): void => {
    if (!url) {
        throw new ParameterError('URL parameter is required');
    }
    let parsedUrl: URL;
    try {
        parsedUrl = new URL(url);
    } catch {
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
        // Extension allowlist is geoJson-specific and stays here, not in the util.
        validateGeoJsonUrlSyntax(url);

        let bodyText: string;
        try {
            const result = await secureFetch(url, {
                method: 'GET',
                timeoutMs: TIMEOUT_MS,
                maxResponseBytes: MAX_FILE_SIZE,
                // Empty list = no content-type restriction: parity with the
                // original controller, which accepted any content-type.
                allowedContentTypes: [],
            });
            bodyText = result.bodyText;
        } catch (error) {
            if (error instanceof SecureFetchError) {
                throw toParameterError(error);
            }
            throw error;
        }

        let data: unknown;
        try {
            data = JSON.parse(bodyText);
        } catch {
            throw new ParameterError('Invalid JSON format');
        }
        if (typeof data !== 'object' || data === null || Array.isArray(data)) {
            throw new ParameterError('Invalid GeoJSON: expected an object');
        }

        this.setStatus(200);
        return data as Record<string, unknown>;
    }
}
