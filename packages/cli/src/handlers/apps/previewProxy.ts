import {
    APP_SDK_EXPLORE_BASE_TABLE_PATH,
    extractAppSdkRouteProjectUuid,
    extractExploreBaseTable,
    isAllowedAppSdkRoute,
    isAppSdkScheduleDownloadRoute,
    LightdashSignedDownloadHeader,
    parseAppSdkExploreBaseTableRequest,
    type AppSdkExploreBaseTableResult,
} from '@lightdash/common';
import { timingSafeEqual } from 'crypto';
import * as http from 'http';
import * as https from 'https';
import { refuseAgentConnection } from '../../credentials';

// Per-run shared secret between the browser, Vite, and the CLI proxy. Vite
// forwards the browser's scoped Authorization value and adds this header;
// both must match before the durable credential is attached upstream.
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
// scoped preview capability and the nonce must not travel upstream, and
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

const readBody = (req: http.IncomingMessage): Promise<string> =>
    new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        req.on('data', (chunk: Buffer) => chunks.push(chunk));
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        req.on('error', reject);
    });

const parseJson = (text: string): unknown => {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
};

const secretsMatch = (
    actual: string | string[] | undefined,
    expected: string,
): boolean => {
    if (typeof actual !== 'string') return false;

    const actualBuffer = Buffer.from(actual);
    const expectedBuffer = Buffer.from(expected);
    return (
        actualBuffer.length === expectedBuffer.length &&
        timingSafeEqual(actualBuffer, expectedBuffer)
    );
};

/**
 * Loopback proxy that owns the preview credential. The vite dev server
 * forwards /api traffic here; only routes a deployed app could reach through
 * the SDK bridge — pinned to the previewed project — are forwarded upstream,
 * with the credential attached server-side. Preview does not write it into the
 * app folder or pass it to the vite process/browser.
 */
export const startPreviewProxy = (args: {
    upstreamUrl: string;
    authorization: string;
    proxyAuthorization?: string;
    projectUuid: string;
    nonce: string;
}): Promise<PreviewProxyHandle> => {
    refuseAgentConnection();
    const upstream = new URL(args.upstreamUrl);
    const requestFn =
        upstream.protocol === 'https:' ? https.request : http.request;

    const withUpstreamCredentials = (
        headers: http.OutgoingHttpHeaders,
    ): http.OutgoingHttpHeaders => ({
        ...headers,
        authorization: args.authorization,
        ...(args.proxyAuthorization
            ? { 'proxy-authorization': args.proxyAuthorization }
            : {}),
    });

    // Resolves the parsed body of a successful upstream GET, or null.
    const getUpstreamJson = (path: string): Promise<unknown> =>
        new Promise((resolve) => {
            const upstreamReq = requestFn(
                {
                    protocol: upstream.protocol,
                    hostname: upstream.hostname,
                    port: upstream.port || undefined,
                    path,
                    method: 'GET',
                    headers: withUpstreamCredentials({
                        accept: 'application/json',
                    }),
                },
                (upstreamRes) => {
                    readBody(upstreamRes).then(
                        (text) => {
                            const status = upstreamRes.statusCode ?? 502;
                            resolve(
                                status >= 200 && status < 300
                                    ? parseJson(text)
                                    : null,
                            );
                        },
                        () => resolve(null),
                    );
                },
            );
            upstreamReq.on('error', () => resolve(null));
            upstreamReq.end();
        });

    // Host-answered virtual route: replies with only the explore's base
    // table, never the explore itself.
    const answerExploreBaseTable = async (
        req: http.IncomingMessage,
        res: http.ServerResponse,
    ): Promise<void> => {
        const request = parseAppSdkExploreBaseTableRequest(
            parseJson(await readBody(req)),
        );
        if (request === null) {
            sendJsonError(
                res,
                400,
                'Preview proxy: invalid explore base-table request',
            );
            return;
        }
        const explore = await getUpstreamJson(
            `/api/v1/projects/${encodeURIComponent(args.projectUuid)}/explores/${encodeURIComponent(request.exploreName)}`,
        );
        const results: AppSdkExploreBaseTableResult = {
            baseTable: extractExploreBaseTable(explore),
        };
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', results }));
    };

    const server = http.createServer((req, res) => {
        const method = req.method ?? 'GET';
        const nonceHeader = req.headers[PREVIEW_PROXY_NONCE_HEADER];
        const browserAuthorization = req.headers.authorization;
        if (
            !secretsMatch(nonceHeader, args.nonce) ||
            !secretsMatch(browserAuthorization, `ApiKey ${args.nonce}`)
        ) {
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

        if (pathname === APP_SDK_EXPLORE_BASE_TABLE_PATH) {
            answerExploreBaseTable(req, res).catch(() => {
                if (!res.headersSent) {
                    sendJsonError(
                        res,
                        400,
                        'Preview proxy: invalid explore base-table request',
                    );
                }
            });
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

        const headers = withUpstreamCredentials(
            filterHeaders(req.headers, DROPPED_REQUEST_HEADERS),
        );
        // The previewed app fetches the export's fileUrl directly from the
        // local dev page, which carries no instance credentials — ask the
        // backend for a SIGNED URL, same as the deployed app's bridge.
        if (isAppSdkScheduleDownloadRoute(method, pathname)) {
            headers[LightdashSignedDownloadHeader.toLowerCase()] = 'true';
        }

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
