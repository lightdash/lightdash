import { ApiErrorPayload, UnexpectedServerError } from '@lightdash/common';
import {
    Get,
    Middlewares,
    OperationId,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import fetch from 'node-fetch';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

// Maximum file size: 50MB
const MAX_FILE_SIZE = 50 * 1024 * 1024;

// Private IP ranges to block (SSRF protection)
const PRIVATE_IP_RANGES = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^127\./,
    /^169\.254\./,
    /^::1$/,
    /^fc00:/,
    /^fe80:/,
];

function isPrivateIP(hostname: string): boolean {
    return PRIVATE_IP_RANGES.some((range) => range.test(hostname));
}

type SvgResponse = {
    __svg__: string;
    __isSvg__: true;
};

type GeoJsonResponse = Record<string, unknown>;

@Route('/api/v1/geojson-proxy')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Map')
export class GeoJsonProxyController extends BaseController {
    /**
     * Proxies external GeoJSON/TopoJSON/SVG files to bypass CORS restrictions
     * @param url the URL of the GeoJSON or SVG file to fetch
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get()
    @OperationId('getGeoJson')
    async get(
        @Query() url: string,
        @Request() req: express.Request,
    ): Promise<SvgResponse | GeoJsonResponse> {
        if (!url) {
            throw new UnexpectedServerError('URL parameter is required');
        }

        // Validate URL format
        let parsedUrl: URL;
        try {
            parsedUrl = new URL(url);
        } catch (error) {
            throw new UnexpectedServerError('Invalid URL format');
        }

        // Only allow HTTP and HTTPS protocols (prevent file://, ftp://, etc.)
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            throw new UnexpectedServerError(
                'Only HTTP and HTTPS protocols are allowed',
            );
        }

        // Block access to private IP ranges (SSRF protection)
        // Note: localhost is allowed for development purposes (e.g., local geoservers)
        // but other private IPs are blocked to prevent SSRF attacks
        const isLocalhost =
            parsedUrl.hostname === 'localhost' ||
            parsedUrl.hostname === '127.0.0.1' ||
            parsedUrl.hostname === '::1';

        if (!isLocalhost && isPrivateIP(parsedUrl.hostname)) {
            throw new UnexpectedServerError(
                'Access to private IP addresses is not allowed',
            );
        }

        try {
            const response = await fetch(url, {
                headers: {
                    Accept: 'application/json, application/geo+json, image/svg+xml',
                    // Prevent following redirects to potentially malicious hosts
                },
                redirect: 'manual',
                // 30 second timeout
                timeout: 30000,
                // Limit response size
                size: MAX_FILE_SIZE,
            });

            // Check for redirects and validate redirect location
            if (response.status >= 300 && response.status < 400) {
                const location = response.headers.get('location');
                if (location) {
                    try {
                        const redirectUrl = new URL(location, url);
                        if (isPrivateIP(redirectUrl.hostname)) {
                            throw new UnexpectedServerError(
                                'Redirect to private IP addresses is not allowed',
                            );
                        }
                    } catch (redirectError) {
                        throw new UnexpectedServerError(
                            'Invalid redirect location',
                        );
                    }
                }
                throw new UnexpectedServerError(
                    'Redirects are not supported for security reasons',
                );
            }

            if (!response.ok) {
                throw new UnexpectedServerError(
                    `Failed to fetch GeoJSON: HTTP ${response.status}`,
                );
            }

            // Validate content type
            const contentType = response.headers.get('content-type');
            const isSvg =
                contentType?.includes('image/svg+xml') ||
                contentType?.includes('svg') ||
                url.toLowerCase().endsWith('.svg');
            const isJson =
                contentType?.includes('application/json') ||
                contentType?.includes('application/geo+json') ||
                contentType?.includes('application/topojson') ||
                url.toLowerCase().endsWith('.json') ||
                url.toLowerCase().endsWith('.topojson') ||
                url.toLowerCase().endsWith('.geojson') ||
                !contentType; // Allow missing content-type for JSON

            if (contentType && !isSvg && !isJson) {
                throw new UnexpectedServerError(
                    `Invalid content type: ${contentType}. Expected JSON or SVG.`,
                );
            }

            // For SVG files, return as text in a special format
            // We wrap it in an object with __svg__ property to distinguish from GeoJSON
            if (isSvg) {
                const svgText = await response.text();
                this.setStatus(200);
                return { __svg__: svgText, __isSvg__: true };
            }

            // For JSON files, parse and validate
            const geoJson = await response.json();

            // Basic validation that it's actually GeoJSON-like
            if (
                typeof geoJson !== 'object' ||
                geoJson === null ||
                Array.isArray(geoJson)
            ) {
                throw new UnexpectedServerError(
                    'Invalid GeoJSON format. Expected an object.',
                );
            }

            this.setStatus(200);
            return geoJson;
        } catch (error) {
            const message =
                error instanceof Error ? error.message : 'Unknown error';
            throw new UnexpectedServerError(
                `Failed to fetch GeoJSON: ${message}`,
            );
        }
    }
}
