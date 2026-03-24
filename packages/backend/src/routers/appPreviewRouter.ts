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

export const createAppPreviewRouter = (config: AppRuntimeConfig): Router => {
    const router = express.Router({ strict: true });

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

    // Serve index.html for an app version.
    // Redirect to trailing slash so relative asset paths resolve correctly.
    // e.g. "assets/foo.css" from "/preview/apps/X/versions/Y" resolves to
    //       "/preview/apps/X/versions/assets/foo.css" (wrong, missing Y)
    // but from "/preview/apps/X/versions/Y/" resolves to
    //       "/preview/apps/X/versions/Y/assets/foo.css" (correct)
    // No trailing slash → redirect to add one
    router.get('/apps/:appUuid/versions/:versionUuid', (req, res) => {
        res.redirect(302, `${req.originalUrl}/`);
    });

    router.get('/apps/:appUuid/versions/:versionUuid/', async (req, res) => {
        const { appUuid, versionUuid } = req.params;

        if (!isValidUuid(appUuid) || !isValidUuid(versionUuid)) {
            res.status(400).json({
                status: 'error',
                error: { message: 'Invalid UUID format' },
            });
            return;
        }

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
    });

    // Serve static assets (JS, CSS, fonts) for local dev without CDN
    router.get(
        '/apps/:appUuid/versions/:versionUuid/assets/:filename',
        async (req, res) => {
            const { appUuid, versionUuid, filename } = req.params;

            if (!isValidUuid(appUuid) || !isValidUuid(versionUuid)) {
                res.status(400).json({
                    status: 'error',
                    error: { message: 'Invalid UUID format' },
                });
                return;
            }

            if (!isSafeFilename(filename)) {
                res.status(400).json({
                    status: 'error',
                    error: { message: 'Invalid filename' },
                });
                return;
            }

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
