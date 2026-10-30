import {
    APP_SDK_EXPLORE_BASE_TABLE_PATH,
    APP_SDK_SPACE_CHARTS_PATH,
    emptyAppSdkSpaceCharts,
    extractAppSdkRouteProjectUuid,
    extractAppSdkSpaceCharts,
    extractExploreBaseTable,
    isAllowedAppSdkRoute,
    isAppSdkMetricQueryRoute,
    isAppSdkScheduleDownloadRoute,
    LightdashSignedDownloadHeader,
    parseAppSdkExploreBaseTableRequest,
    parseAppSdkSpaceChartsRequest,
    resolveAppSdkSpaceUuid,
    type AppSdkExploreBaseTableResult,
    type AppSdkSpaceChartsResult,
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

/** What --show-sql reports for each metric query the previewed app runs. */
export type CompiledQueryLogEntry = {
    exploreName: string;
    dimensions: string[];
    metrics: string[];
    compiledSql: string | null;
    compilationErrors: string[];
    // Execution-time transformations the compile endpoint cannot apply
    // (e.g. date zoom, dashboard filters) — the printed SQL excludes them.
    runtimeOnlyTransformations: string[];
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
    resolveAuthorization?: () => Promise<string>;
    proxyAuthorization?: string;
    projectUuid: string;
    nonce: string;
    // When set, each metric query the app runs is compiled upstream and
    // reported here (--show-sql). Never blocks or alters the query itself.
    onCompiledQuery?: (entry: CompiledQueryLogEntry) => void;
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
    const getUpstreamJson = async (path: string): Promise<unknown> => {
        const authorization = args.resolveAuthorization
            ? await args.resolveAuthorization()
            : args.authorization;
        return new Promise((resolve) => {
            const upstreamReq = requestFn(
                {
                    protocol: upstream.protocol,
                    hostname: upstream.hostname,
                    port: upstream.port || undefined,
                    path,
                    method: 'GET',
                    headers: {
                        ...withUpstreamCredentials({
                            accept: 'application/json',
                        }),
                        authorization,
                    },
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
    };

    // Resolves the parsed body of a successful upstream POST, or null.
    const postUpstreamJson = async (
        path: string,
        body: string,
    ): Promise<unknown> => {
        const authorization = args.resolveAuthorization
            ? await args.resolveAuthorization()
            : args.authorization;
        return new Promise((resolve) => {
            const payload = Buffer.from(body, 'utf-8');
            const upstreamReq = requestFn(
                {
                    protocol: upstream.protocol,
                    hostname: upstream.hostname,
                    port: upstream.port || undefined,
                    path,
                    method: 'POST',
                    headers: {
                        ...withUpstreamCredentials({
                            accept: 'application/json',
                            'content-type': 'application/json',
                            'content-length': payload.length,
                        }),
                        authorization,
                    },
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
            upstreamReq.end(payload);
        });
    };

    // --show-sql: compile the metric query the app just ran (same payload the
    // customer-facing compileQuery endpoint takes) and report the SQL.
    const compileAndReport = async (requestBody: string): Promise<void> => {
        const report = args.onCompiledQuery;
        if (report === undefined) return;
        const parsed = parseJson(requestBody);
        if (typeof parsed !== 'object' || parsed === null) return;
        const {
            query,
            parameters,
            usePreAggregateCache,
            pivotConfiguration,
            dateZoom,
            dashboardFilters,
        } = parsed as {
            query?: unknown;
            parameters?: unknown;
            usePreAggregateCache?: unknown;
            pivotConfiguration?: unknown;
            dateZoom?: unknown;
            dashboardFilters?: unknown;
        };
        if (typeof query !== 'object' || query === null) return;
        const metricQuery = query as {
            exploreName?: unknown;
            dimensions?: unknown;
            metrics?: unknown;
            dateZoom?: unknown;
        };
        if (typeof metricQuery.exploreName !== 'string') return;
        const toStrings = (value: unknown): string[] =>
            Array.isArray(value)
                ? value.filter(
                      (item): item is string => typeof item === 'string',
                  )
                : [];
        // compileQuery cannot apply these execution-time transformations, so
        // the printed SQL would silently diverge — disclose them instead.
        const hasDashboardFilters =
            typeof dashboardFilters === 'object' &&
            dashboardFilters !== null &&
            Object.values(dashboardFilters).some(
                (group) => Array.isArray(group) && group.length > 0,
            );
        const runtimeOnlyTransformations = [
            ...(dateZoom !== undefined || metricQuery.dateZoom !== undefined
                ? ['date zoom']
                : []),
            ...(hasDashboardFilters ? ['dashboard filters'] : []),
        ];
        const entry: CompiledQueryLogEntry = {
            exploreName: metricQuery.exploreName,
            dimensions: toStrings(metricQuery.dimensions),
            metrics: toStrings(metricQuery.metrics),
            compiledSql: null,
            compilationErrors: [],
            runtimeOnlyTransformations,
        };
        const compiled = await postUpstreamJson(
            `/api/v1/projects/${encodeURIComponent(args.projectUuid)}/explores/${encodeURIComponent(metricQuery.exploreName)}/compileQuery`,
            JSON.stringify({
                ...query,
                parameters,
                usePreAggregateCache,
                pivotConfiguration,
            }),
        );
        if (typeof compiled === 'object' && compiled !== null) {
            const { results } = compiled as { results?: unknown };
            if (typeof results === 'object' && results !== null) {
                const { query: sql, compilationErrors } = results as {
                    query?: unknown;
                    compilationErrors?: unknown;
                };
                if (typeof sql === 'string') entry.compiledSql = sql;
                entry.compilationErrors = toStrings(compilationErrors);
            }
        }
        report(entry);
    };

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

    // Host-answered virtual route: resolves a slug-or-uuid space reference
    // to its trimmed chart list with the developer's credentials. Unknown
    // space, no access, and upstream failure all answer uniformly empty —
    // same face as the deployed app's bridge.
    const answerSpaceCharts = async (
        req: http.IncomingMessage,
        res: http.ServerResponse,
    ): Promise<void> => {
        const request = parseAppSdkSpaceChartsRequest(
            parseJson(await readBody(req)),
        );
        if (request === null) {
            sendJsonError(
                res,
                400,
                'Preview proxy: invalid space-charts request',
            );
            return;
        }
        let results: AppSdkSpaceChartsResult = emptyAppSdkSpaceCharts();
        try {
            const spaces = await getUpstreamJson(
                `/api/v1/projects/${encodeURIComponent(args.projectUuid)}/spaces`,
            );
            const spaceUuid = resolveAppSdkSpaceUuid(spaces, request.space);
            if (spaceUuid !== null) {
                const space = await getUpstreamJson(
                    `/api/v1/projects/${encodeURIComponent(args.projectUuid)}/spaces/${encodeURIComponent(spaceUuid)}`,
                );
                results = extractAppSdkSpaceCharts(space) ?? results;
            }
        } catch {
            // Keep the uniform empty answer.
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', results }));
    };

    const handleRequest = async (
        req: http.IncomingMessage,
        res: http.ServerResponse,
    ): Promise<void> => {
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

        if (pathname === APP_SDK_SPACE_CHARTS_PATH) {
            answerSpaceCharts(req, res).catch(() => {
                if (!res.headersSent) {
                    sendJsonError(
                        res,
                        400,
                        'Preview proxy: invalid space-charts request',
                    );
                }
            });
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
        if (args.resolveAuthorization)
            headers.authorization = await args.resolveAuthorization();
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
        if (
            args.onCompiledQuery !== undefined &&
            isAppSdkMetricQueryRoute(method, pathname)
        ) {
            // Buffer so the same bytes are both forwarded and compiled.
            readBody(req).then(
                (body) => {
                    upstreamReq.end(body);
                    compileAndReport(body).catch(() => {});
                },
                () => upstreamReq.destroy(),
            );
        } else {
            req.pipe(upstreamReq);
        }
    };
    const server = http.createServer((req, res) => {
        handleRequest(req, res).catch(() => {
            if (!res.headersSent)
                sendJsonError(
                    res,
                    502,
                    'Preview proxy: could not authenticate the upstream request.',
                );
            else res.destroy();
        });
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
