import {
    extractAppSdkRouteProjectUuid,
    isAllowedAppSdkRoute,
} from '@lightdash/common';
import * as http from 'http';
import * as https from 'https';

// Per-run shared secret between the CLI proxy and the vite dev server's /api
// proxy. Requests without it are rejected, so a drive-by page (or another
// local process) that discovers the loopback port cannot use the proxy.
export const PREVIEW_PROXY_NONCE_HEADER = 'x-lightdash-preview-nonce';

// Hop-by-hop headers are connection-scoped and must not be forwarded.
const HOP_BY_HOP_HEADERS = new Set([
    'connection',
    'keep-alive',
    'proxy-authenticate',
    'proxy-authorization',
    'te',
    'trailer',
    'transfer-encoding',
    'upgrade',
]);

// Client → upstream: host is derived from the upstream URL; the browser-side
// authorization sentinel and the nonce must not travel upstream, and
// localhost cookies are not the instance's business.
const DROPPED_REQUEST_HEADERS = new Set([
    'host',
    'authorization',
    'cookie',
    PREVIEW_PROXY_NONCE_HEADER,
]);

// Upstream → client: the instance must not plant cookies on the dev origin.
const DROPPED_RESPONSE_HEADERS = new Set(['set-cookie']);

const filterHeaders = (
    source: http.IncomingHttpHeaders,
    dropped: Set<string>,
): http.OutgoingHttpHeaders => {
    const out: http.OutgoingHttpHeaders = {};
    for (const [name, value] of Object.entries(source)) {
        const lower = name.toLowerCase();
        if (
            value !== undefined &&
            !HOP_BY_HOP_HEADERS.has(lower) &&
            !dropped.has(lower)
        ) {
            out[lower] = value;
        }
    }
    return out;
};

export type PreviewProxyHandle = {
    port: number;
    close: () => Promise<void>;
};

const sendJsonError = (
    res: http.ServerResponse,
    status: number,
    message: string,
): void => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'error', results: null, message }));
};

/**
 * Loopback proxy that owns the preview credential. The vite dev server
 * forwards /api traffic here; only routes a deployed app could reach through
 * the SDK bridge — pinned to the previewed project — are forwarded upstream,
 * with the credential attached server-side. The credential never appears in
 * a file, the vite process, or the browser.
 */
export const startPreviewProxy = (args: {
    upstreamUrl: string;
    apiKey: string;
    projectUuid: string;
    nonce: string;
}): Promise<PreviewProxyHandle> => {
    const upstream = new URL(args.upstreamUrl);
    const requestFn =
        upstream.protocol === 'https:' ? https.request : http.request;

    const server = http.createServer((req, res) => {
        const method = req.method ?? 'GET';
        const nonceHeader = req.headers[PREVIEW_PROXY_NONCE_HEADER];
        if (nonceHeader !== args.nonce) {
            sendJsonError(res, 401, 'Preview proxy: missing or invalid nonce');
            return;
        }

        let pathname: string;
        try {
            pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
        } catch {
            sendJsonError(res, 400, 'Preview proxy: malformed request URL');
            return;
        }

        // Same authority as the deployed app's postMessage bridge: anything
        // the bridge would reject, preview rejects too.
        if (!isAllowedAppSdkRoute(method, pathname)) {
            sendJsonError(
                res,
                403,
                `Preview proxy: ${method} ${pathname} is not a data-app SDK route. Preview only allows the routes a deployed app can reach.`,
            );
            return;
        }

        const routeProjectUuid = extractAppSdkRouteProjectUuid(pathname);
        if (
            routeProjectUuid !== null &&
            routeProjectUuid !== args.projectUuid
        ) {
            sendJsonError(
                res,
                403,
                `Preview proxy: request targets project ${routeProjectUuid}, but this preview is pinned to ${args.projectUuid}.`,
            );
            return;
        }

        const headers = filterHeaders(req.headers, DROPPED_REQUEST_HEADERS);
        headers.authorization = `ApiKey ${args.apiKey}`;

        const upstreamReq = requestFn(
            {
                protocol: upstream.protocol,
                hostname: upstream.hostname,
                port: upstream.port || undefined,
                path: req.url,
                method,
                headers,
            },
            (upstreamRes) => {
                res.writeHead(
                    upstreamRes.statusCode ?? 502,
                    filterHeaders(
                        upstreamRes.headers,
                        DROPPED_RESPONSE_HEADERS,
                    ),
                );
                upstreamRes.pipe(res);
            },
        );
        upstreamReq.on('error', (err) => {
            if (!res.headersSent) {
                sendJsonError(
                    res,
                    502,
                    `Preview proxy: upstream request failed (${err.message})`,
                );
            } else {
                res.destroy();
            }
        });
        req.pipe(upstreamReq);
    });

    return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            if (address === null || typeof address === 'string') {
                reject(
                    new Error('Preview proxy failed to bind a loopback port'),
                );
                return;
            }
            resolve({
                port: address.port,
                close: () =>
                    new Promise<void>((resolveClose) => {
                        server.close(() => resolveClose());
                        // Pending keep-alive sockets would otherwise delay
                        // shutdown after vite exits.
                        server.closeAllConnections();
                    }),
            });
        });
    });
};
