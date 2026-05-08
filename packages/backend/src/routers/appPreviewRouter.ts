import { GetObjectCommand, S3, S3ServiceException } from '@aws-sdk/client-s3';
import express, { type Router } from 'express';
import path from 'path';
import { validate as isValidUuid } from 'uuid';
import { type AppRuntimeConfig } from '../config/parseConfig';
import Logger from '../logging/logger';
import {
    verifyPreviewToken,
    type PreviewTokenPayload,
} from './appPreviewToken';

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
    const { lightdashOrigin, cdnOrigin, cspAllowedOrigins } = config;

    const extra = cspAllowedOrigins.length
        ? ` ${cspAllowedOrigins.join(' ')}`
        : '';

    const directives: string[] = [
        `default-src 'none'`,
        `script-src 'self'${cdnOrigin ? ` ${cdnOrigin}` : ''}`,
        `style-src 'self' 'unsafe-inline'${extra}${cdnOrigin ? ` ${cdnOrigin}` : ''}`,
        `connect-src 'none'`,
        `img-src 'self' data:${cdnOrigin ? ` ${cdnOrigin}` : ''}`,
        `font-src 'self'${extra}${cdnOrigin ? ` ${cdnOrigin}` : ''}`,
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

/**
 * Rewrites Vite-generated asset references in HTML to include a token
 * query parameter so asset requests authenticate themselves.
 *
 * Matches patterns like:
 *   src="./assets/index-BxK29f.js"
 *   href="./assets/style-DhJ93k.css"
 */
const injectTokenIntoAssetUrls = (html: string, token: string): string =>
    html.replace(
        /((?:src|href)="\.\/assets\/[^"]+)"/g,
        `$1?token=${encodeURIComponent(token)}"`,
    );

export const createAppPreviewRouter = (
    config: AppRuntimeConfig,
    lightdashSecret: string,
    onPreviewView?: (payload: PreviewTokenPayload) => void,
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

    /**
     * Buffers an S3 readable stream into a UTF-8 string.
     */
    const bufferS3Body = (body: NodeJS.ReadableStream): Promise<string> =>
        new Promise((resolve, reject) => {
            const chunks: Buffer[] = [];
            body.on('data', (chunk: Buffer) => chunks.push(chunk));
            body.on('end', () =>
                resolve(Buffer.concat(chunks).toString('utf-8')),
            );
            body.on('error', reject);
        });

    // -- Auth middleware ------------------------------------------------

    /** Verifies a JWT from the `?token` query param. */
    const requireToken: express.RequestHandler = (req, res, next) => {
        const { appUuid, version } = req.params;

        if (!isValidUuid(appUuid)) {
            res.status(400).json({
                status: 'error',
                error: { message: 'Invalid UUID format' },
            });
            return;
        }

        const versionNum = Number(version);
        if (!Number.isInteger(versionNum) || versionNum < 1) {
            res.status(400).json({
                status: 'error',
                error: { message: 'Version must be a positive integer' },
            });
            return;
        }

        const token =
            typeof req.query.token === 'string' ? req.query.token : undefined;

        const result = verifyPreviewToken(
            token,
            lightdashSecret,
            appUuid,
            versionNum,
        );

        if (!result.ok) {
            res.status(result.status).json({
                status: 'error',
                error: { message: result.message },
            });
            return;
        }

        res.locals.previewTokenPayload = result.payload;
        next();
    };

    // -- Routes ---------------------------------------------------------

    // Redirect to trailing slash so relative asset paths resolve correctly.
    // e.g. "assets/foo.css" from "/api/apps/X/versions/Y" would resolve to
    //       "/api/apps/X/versions/assets/foo.css" (wrong)
    // but from "/api/apps/X/versions/Y/" resolves correctly.
    router.get('/:appUuid/versions/:version', (req, res) => {
        const queryString = req.originalUrl.includes('?')
            ? req.originalUrl.slice(req.originalUrl.indexOf('?'))
            : '';
        res.redirect(302, `${req.baseUrl}${req.path}/${queryString}`);
    });

    // Serve index.html for an app version.
    // Rewrites asset URLs to include the token so asset requests authenticate.
    router.get(
        '/:appUuid/versions/:version/',
        requireToken,
        async (req, res) => {
            const { appUuid, version } = req.params;
            const s3Key = `apps/${appUuid}/versions/${version}/index.html`;
            const result = await fetchFromS3(s3Key);

            if (!result.ok) {
                res.status(result.status).json({
                    status: 'error',
                    error: { message: result.message },
                });
                return;
            }

            const token = req.query.token as string;

            setSecurityHeaders(res);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');

            onPreviewView?.(
                res.locals.previewTokenPayload as PreviewTokenPayload,
            );

            const html = await bufferS3Body(result.body);
            res.send(injectTokenIntoAssetUrls(html, token));
        },
    );

    // Serve static assets (JS, CSS, fonts). Authenticated via ?token query param.
    router.get(
        '/:appUuid/versions/:version/assets/:filename',
        requireToken,
        async (req, res) => {
            const { filename } = req.params;

            if (!isSafeFilename(filename)) {
                res.status(400).json({
                    status: 'error',
                    error: { message: 'Invalid filename' },
                });
                return;
            }

            const { appUuid, version } = req.params;
            const s3Key = `apps/${appUuid}/versions/${version}/assets/${filename}`;
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

            // Allow cross-origin loading from sandboxed iframes (opaque origin).
            // Safe because assets are static build artifacts, not user data.
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
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
