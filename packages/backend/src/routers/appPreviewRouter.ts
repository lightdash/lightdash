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

const buildCspHeader = (
    config: AppRuntimeConfig,
    frameAncestors: string[],
): string => {
    const { cdnOrigin, cspAllowedOrigins, previewOrigin, lightdashOrigin } =
        config;

    // The preview iframe is sandboxed without `allow-same-origin`, so its
    // document origin is opaque. WebKit/Safari resolves the CSP `'self'`
    // keyword against that opaque origin — which matches nothing — and blocks
    // the app's own scripts, styles, and fetches. Chromium/Firefox resolve
    // `'self'` against the response URL's origin, so they load fine. Listing
    // the serving origin explicitly alongside `'self'` makes the policy work
    // in all three. The iframe is served from `previewOrigin` in production
    // (cross-origin previews) and same-origin (`lightdashOrigin`) in dev.
    const selfOrigin = previewOrigin || lightdashOrigin;

    // Compose a source list, dropping the null cdnOrigin / empty entries.
    const sources = (...parts: (string | false | null)[]): string =>
        ["'self'", selfOrigin, ...parts, cdnOrigin]
            .filter((s): s is string => Boolean(s))
            .join(' ');

    const directives: string[] = [
        `default-src 'none'`,
        `script-src ${sources()}`,
        `style-src ${sources("'unsafe-inline'", ...cspAllowedOrigins)}`,
        // Allow same-origin fetch so html-to-image can inline @font-face
        // sources and <img>/background URLs when capturing screenshots.
        // The iframe is sandboxed (`allow-scripts allow-modals`) with an
        // opaque origin, so any fetch it makes is uncredentialed and can't
        // exfiltrate user data — the postMessage bridge remains the only
        // path to the authenticated Lightdash API.
        `connect-src ${sources()}`,
        `img-src ${sources('data:')}`,
        `font-src ${sources(...cspAllowedOrigins)}`,
        `frame-ancestors ${frameAncestors.join(' ')}`,
        `object-src 'none'`,
        // Constrain <base> to the serving origin instead of blocking it
        // outright — html-to-image serializes the cloned DOM into an SVG
        // <foreignObject> whose rendering can trip a base-uri check, and a
        // `'none'` policy there aborts the whole screenshot. `'self'` alone
        // fails under Safari's opaque sandbox origin (see above), so the
        // explicit origin is listed here too.
        `base-uri ${sources()}`,
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
 * Validates that a token is in a plausible JWT shape (3 base64url
 * segments). Tighter validation runs in `verifyPreviewToken`; this guard
 * just keeps stray bytes from being included in S3 keys / logs.
 */
const isPlausibleToken = (token: string): boolean =>
    /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token);

export const createAppPreviewRouter = (
    config: AppRuntimeConfig,
    lightdashSecret: string,
    /**
     * Frame-ancestor allowlist applied to every preview iframe. Matches the
     * `/embed/*` policy (`'self' https://*`) plus the explicit domains in
     * `LIGHTDASH_IFRAME_EMBEDDING_DOMAINS` — see App.ts. Both session and
     * embed-minted tokens use the same list; the broader allowlist costs
     * little since the iframe is sandboxed (`allow-scripts allow-modals`)
     * with an opaque origin — any fetch it makes is uncredentialed, so
     * authenticated backend traffic still only flows through the
     * parent-mediated postMessage bridge.
     */
    frameAncestors: string[],
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

    const cspHeader = buildCspHeader(config, frameAncestors);

    const setSecurityHeaders = (res: express.Response): void => {
        res.setHeader('Content-Security-Policy', cspHeader);
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

    // -- Auth middleware ------------------------------------------------

    /**
     * Verifies a JWT from the `:token` path segment.
     *
     * The token lives in the URL path (not a query param) so that Vite's
     * relative asset URLs (`./assets/foo.js`) naturally inherit the
     * token when the browser resolves them against the iframe's URL.
     * That way runtime-rendered <img> / dynamic chunks / lazy modules all
     * authenticate without any client-side URL rewriting.
     */
    const requireToken: express.RequestHandler = (req, res, next) => {
        const { appUuid, version, token } = req.params;

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

        if (typeof token !== 'string' || !isPlausibleToken(token)) {
            res.status(401).json({
                status: 'error',
                error: { message: 'Invalid token' },
            });
            return;
        }

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
    // Without it, "./assets/foo.css" from "/api/apps/X/versions/Y/t/Z" would
    // resolve to "/api/apps/X/versions/Y/t/assets/foo.css" (wrong); the
    // trailing slash makes it resolve to ".../t/Z/assets/foo.css".
    router.get('/:appUuid/versions/:version/t/:token', (req, res) => {
        const queryString = req.originalUrl.includes('?')
            ? req.originalUrl.slice(req.originalUrl.indexOf('?'))
            : '';
        res.redirect(302, `${req.baseUrl}${req.path}/${queryString}`);
    });

    // Serve index.html for an app version.
    //
    // The token-in-path scheme means every relative asset URL emitted by
    // Vite (`./assets/foo.js`) inherits the token segment when the browser
    // resolves it against this URL — no bundle rewriting or client-side
    // patching is needed for runtime-rendered assets (theme images,
    // dynamic imports, lazy chunks) to authenticate.
    router.get(
        '/:appUuid/versions/:version/t/:token/',
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

            setSecurityHeaders(res);
            res.setHeader('Content-Type', 'text/html; charset=utf-8');
            res.setHeader('Cache-Control', 'no-store');

            onPreviewView?.(
                res.locals.previewTokenPayload as PreviewTokenPayload,
            );

            result.body.pipe(res);
        },
    );

    // CORS for asset fetches from the sandboxed iframe.
    //
    // The iframe is loaded with `sandbox="allow-scripts allow-modals"` (no
    // `allow-same-origin`), so its document origin is the opaque value
    // `null` — regardless of whether the iframe URL is same-origin as the
    // parent. Vite emits `<script type="module" crossorigin>` and
    // `<link rel="stylesheet" crossorigin>` tags, which become CORS
    // requests from that opaque origin and get preflighted. Without these
    // headers the browser blocks the subsequent GET and the iframe
    // renders as a blank page.
    //
    // Mounted as `router.use` so it runs before the GET handler and
    // short-circuits OPTIONS preflights.
    router.use(
        '/:appUuid/versions/:version/t/:token/assets/:filename',
        (req, res, next) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
            if (req.method === 'OPTIONS') {
                // GET is the only method these routes accept, but the
                // headless browser adds a custom `Lightdash-Headless-
                // Browser-Context` header that propagates to subresource
                // fetches from inside the sandboxed iframe. The preflight
                // surfaces that in `Access-Control-Request-Headers`, so
                // the response needs a permissive `Allow-Headers`.
                res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
                res.setHeader('Access-Control-Allow-Headers', '*');
                res.setHeader('Access-Control-Max-Age', '86400');
                res.status(204).end();
                return;
            }
            next();
        },
    );

    // Serve static assets (JS, CSS, fonts, images). The token segment in
    // the path authenticates the request.
    router.get(
        '/:appUuid/versions/:version/t/:token/assets/:filename',
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
