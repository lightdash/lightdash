import { GetObjectCommand, S3, S3ServiceException } from '@aws-sdk/client-s3';
import express, { type Router } from 'express';
import path from 'path';
import { validate as isValidUuid } from 'uuid';
import { type AppRuntimeConfig } from '../config/parseConfig';
import Logger from '../logging/logger';

const CONTENT_TYPE_BY_EXT: Record<string, string> = {
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.css': 'text/css',
    '.html': 'text/html',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.map': 'application/json',
};

const buildCspHeader = (config: AppRuntimeConfig): string => {
    const { lightdashOrigin, cdnOrigin } = config;

    const directives: string[] = [
        `default-src 'none'`,
        `script-src 'self'${cdnOrigin ? ` ${cdnOrigin}` : ''}`,
        `style-src 'self' 'unsafe-inline'${cdnOrigin ? ` ${cdnOrigin}` : ''}`,
        `connect-src 'self' ${lightdashOrigin} https:`,
        `img-src 'self' data:${cdnOrigin ? ` ${cdnOrigin}` : ''}`,
        `font-src 'self'${cdnOrigin ? ` ${cdnOrigin}` : ''}`,
        `frame-ancestors ${lightdashOrigin}`,
        `object-src 'none'`,
        `base-uri 'none'`,
    ];

    return directives.join('; ');
};

/**
 * Validates that a filename is safe for use in an S3 key.
 * Only allows alphanumeric characters, hyphens, underscores, and dots.
 * Rejects path traversal attempts (e.g. "../", "..\\").
 */
const isSafeFilename = (filename: string): boolean =>
    /^[a-zA-Z0-9._-]+$/.test(filename) && !filename.includes('..');

export const createAppPreviewRouter = (
    config: AppRuntimeConfig,
    _lightdashSecret: string,
): Router => {
    const router = express.Router({ strict: true });

    // Host header validation — defense-in-depth for domain isolation.
    // When APP_RUNTIME_PREVIEW_ORIGIN is set (production), reject requests
    // that arrive on the wrong hostname (e.g. the main app domain).
    // previewOrigin is a full URL (e.g. "https://preview.lightdash.cloud")
    // consistent with other *_ORIGIN env vars, so we extract the hostname.
    if (config.previewOrigin) {
        const previewHostname = new URL(config.previewOrigin).hostname;
        router.use((req, res, next) => {
            if (req.hostname !== previewHostname) {
                res.status(404).json({
                    status: 'error',
                    error: { message: 'Not found' },
                });
                return;
            }
            next();
        });
    }

    const s3 =
        config.s3 !== null
            ? new S3({
                  region: config.s3.region,
                  endpoint: config.s3.endpoint,
                  forcePathStyle: config.s3.forcePathStyle,
                  credentials:
                      config.s3.accessKey && config.s3.secretKey
                          ? {
                                accessKeyId: config.s3.accessKey,
                                secretAccessKey: config.s3.secretKey,
                            }
                          : undefined,
              })
            : null;

    const cspHeaderValue = buildCspHeader(config);

    const setSecurityHeaders = (res: express.Response): void => {
        res.setHeader('Content-Security-Policy', cspHeaderValue);
        res.removeHeader('X-Frame-Options');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    };

    const fetchFromS3 = async (
        s3Key: string,
    ): Promise<
        | { ok: true; body: NodeJS.ReadableStream }
        | { ok: false; status: number; message: string }
    > => {
        if (!s3 || !config.s3) {
            return {
                ok: false,
                status: 503,
                message: 'App runtime storage not configured',
            };
        }

        try {
            const response = await s3.send(
                new GetObjectCommand({
                    Bucket: config.s3.bucket,
                    Key: s3Key,
                }),
            );

            if (!response.Body) {
                return {
                    ok: false,
                    status: 404,
                    message: 'Not found',
                };
            }

            return { ok: true, body: response.Body as NodeJS.ReadableStream };
        } catch (error) {
            if (
                error instanceof S3ServiceException &&
                (error.$metadata?.httpStatusCode === 404 ||
                    error.name === 'NoSuchKey')
            ) {
                return { ok: false, status: 404, message: 'Not found' };
            }

            Logger.error(
                `Failed to fetch from S3: ${error instanceof Error ? error.message : String(error)}`,
            );
            return {
                ok: false,
                status: 502,
                message: 'Failed to fetch app bundle',
            };
        }
    };

    // -- Validation middleware ---------------------------------------------

    /** Validates that appUuid and versionUuid are valid UUIDs. */
    const requireValidUuids: express.RequestHandler = (req, res, next) => {
        const { appUuid, versionUuid } = req.params;

        if (!isValidUuid(appUuid) || !isValidUuid(versionUuid)) {
            res.status(400).json({
                status: 'error',
                error: { message: 'Invalid UUID format' },
            });
            return;
        }

        next();
    };

    // -- Routes ---------------------------------------------------------

    // Redirect to trailing slash so relative asset paths resolve correctly.
    // e.g. "assets/foo.css" from "/api/apps/X/versions/Y" would resolve to
    //       "/api/apps/X/versions/assets/foo.css" (wrong)
    // but from "/api/apps/X/versions/Y/" resolves correctly.
    router.get('/:appUuid/versions/:versionUuid', (req, res) => {
        const queryString = req.originalUrl.includes('?')
            ? req.originalUrl.slice(req.originalUrl.indexOf('?'))
            : '';
        res.redirect(302, `${req.baseUrl}${req.path}/${queryString}`);
    });

    // Serve index.html for an app version.
    // No token auth required — the app bundle is static code, not sensitive data.
    // Actual data access is protected by JWT auth on API endpoints.
    // UUIDs are unguessable (128-bit random) and CSP frame-ancestors restricts embedding.
    router.get(
        '/:appUuid/versions/:versionUuid/',
        requireValidUuids,
        async (req, res) => {
            const { appUuid, versionUuid } = req.params;
            const s3Key = `apps/${appUuid}/versions/${versionUuid}/index.html`;
            const result = await fetchFromS3(s3Key);

            if (!result.ok) {
                res.status(result.status).json({
                    status: 'error',
                    error: { message: result.message },
                });
                return;
            }

            setSecurityHeaders(res);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');
            result.body.pipe(res);
        },
    );

    // Serve static assets (JS, CSS, fonts) for local dev without CDN.
    router.get(
        '/:appUuid/versions/:versionUuid/assets/:filename',
        requireValidUuids,
        async (req, res) => {
            const { filename } = req.params;

            if (!isSafeFilename(filename)) {
                res.status(400).json({
                    status: 'error',
                    error: { message: 'Invalid filename' },
                });
                return;
            }

            const { appUuid, versionUuid } = req.params;
            const s3Key = `apps/${appUuid}/versions/${versionUuid}/assets/${filename}`;
            const result = await fetchFromS3(s3Key);

            if (!result.ok) {
                res.status(result.status).json({
                    status: 'error',
                    error: { message: result.message },
                });
                return;
            }

            const ext = path.extname(filename).toLowerCase();
            const contentType =
                CONTENT_TYPE_BY_EXT[ext] || 'application/octet-stream';

            res.setHeader('Content-Type', contentType);
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader(
                'Cache-Control',
                'public, max-age=31536000, immutable',
            );

            result.body.pipe(res);
        },
    );

    return router;
};
