import { useCallback, useEffect, type RefObject } from 'react';

export type QueryEvent = {
    id: string;
    timestamp: number;
    exploreName: string;
    dimensions: string[];
    metrics: string[];
    filters: unknown;
    sorts: unknown[];
    limit: number;
    queryUuid: string | null;
    status: 'pending' | 'running' | 'ready' | 'error';
    rowCount: number | null;
    durationMs: number | null;
    error: string | null;
};

/**
 * Routes the SDK is allowed to call through the postMessage bridge.
 * Everything else is rejected. Patterns use :param for path segments.
 */
const ALLOWED_ROUTES: Array<{ method: string; pattern: RegExp }> = [
    // Async metric query execution
    {
        method: 'POST',
        pattern: /^\/api\/v2\/projects\/[^/]+\/query\/metric-query$/,
    },
    // Poll for query results
    {
        method: 'GET',
        pattern: /^\/api\/v2\/projects\/[^/]+\/query\/[^/]+$/,
    },
    // Get current user
    { method: 'GET', pattern: /^\/api\/v1\/user$/ },
];

function isAllowedRoute(method: string, path: string): boolean {
    return ALLOWED_ROUTES.some(
        (route) =>
            route.method === method.toUpperCase() && route.pattern.test(path),
    );
}

const isMetricQueryPost = (method: string, path: string): boolean =>
    method.toUpperCase() === 'POST' &&
    /^\/api\/v2\/projects\/[^/]+\/query\/metric-query$/.test(path);

const isQueryResultGet = (method: string, path: string): boolean =>
    method.toUpperCase() === 'GET' &&
    /^\/api\/v2\/projects\/[^/]+\/query\/[^/]+$/.test(path);

/**
 * Parent-side fetch proxy for sandboxed iframe SDK communication.
 *
 * The iframe's SDK sends HTTP requests via postMessage (because it has
 * no direct API access). This hook receives those requests, validates
 * them against an allowlist, executes them with the current user's
 * session cookies, and posts the raw API response back.
 *
 * When onQueryEvent is provided, metric query requests and their results
 * are intercepted and reported for the query inspector overlay.
 */
export function useAppSdkBridge(
    iframeRef: RefObject<HTMLIFrameElement | null>,
    onQueryEvent?: (event: QueryEvent) => void,
) {
    const handleMessage = useCallback(
        async (event: MessageEvent) => {
            if (event.source !== iframeRef.current?.contentWindow) return;

            const { data } = event;
            if (data?.type !== 'lightdash:sdk:fetch') return;

            const { id, method, path, body } = data;

            const respond = (response: {
                result?: unknown;
                error?: string;
            }) => {
                iframeRef.current?.contentWindow?.postMessage(
                    { type: 'lightdash:sdk:fetch-response', id, ...response },
                    '*',
                );
            };

            if (!isAllowedRoute(method, path)) {
                respond({ error: `Blocked: ${method} ${path}` });
                return;
            }

            // Track metric query submissions
            if (isMetricQueryPost(method, path) && onQueryEvent && body) {
                const query = (body as { query?: Record<string, unknown> })
                    ?.query;
                if (query) {
                    onQueryEvent({
                        id,
                        timestamp: Date.now(),
                        exploreName: (query.exploreName as string) ?? 'unknown',
                        dimensions: (query.dimensions as string[]) ?? [],
                        metrics: (query.metrics as string[]) ?? [],
                        filters: query.filters ?? {},
                        sorts: (query.sorts as unknown[]) ?? [],
                        limit: (query.limit as number) ?? 0,
                        queryUuid: null,
                        status: 'pending',
                        rowCount: null,
                        durationMs: null,
                        error: null,
                    });
                }
            }

            try {
                const res = await fetch(path, {
                    method,
                    headers: { 'Content-Type': 'application/json' },
                    ...(body ? { body: JSON.stringify(body) } : {}),
                });

                const json = await res.json();

                if (json.status === 'ok') {
                    // Track metric query initiation response (has queryUuid)
                    if (
                        isMetricQueryPost(method, path) &&
                        onQueryEvent &&
                        json.results?.queryUuid
                    ) {
                        onQueryEvent({
                            id,
                            timestamp: Date.now(),
                            exploreName:
                                json.results?.metricQuery?.exploreName ??
                                'unknown',
                            dimensions:
                                json.results?.metricQuery?.dimensions ?? [],
                            metrics: json.results?.metricQuery?.metrics ?? [],
                            filters: json.results?.metricQuery?.filters ?? {},
                            sorts: json.results?.metricQuery?.sorts ?? [],
                            limit: json.results?.metricQuery?.limit ?? 0,
                            queryUuid: json.results.queryUuid,
                            status: 'running',
                            rowCount: null,
                            durationMs: null,
                            error: null,
                        });
                    }

                    // Track query result polling responses
                    if (isQueryResultGet(method, path) && onQueryEvent) {
                        const result = json.results;
                        if (result?.status === 'ready') {
                            onQueryEvent({
                                id,
                                timestamp: Date.now(),
                                exploreName: '',
                                dimensions: [],
                                metrics: [],
                                filters: {},
                                sorts: [],
                                limit: 0,
                                queryUuid: result.queryUuid,
                                status: 'ready',
                                rowCount: result.rows?.length ?? null,
                                durationMs:
                                    result.metadata?.performance
                                        ?.initialQueryExecutionMs ?? null,
                                error: null,
                            });
                        } else if (
                            result?.status === 'error' ||
                            result?.status === 'expired'
                        ) {
                            onQueryEvent({
                                id,
                                timestamp: Date.now(),
                                exploreName: '',
                                dimensions: [],
                                metrics: [],
                                filters: {},
                                sorts: [],
                                limit: 0,
                                queryUuid: result.queryUuid,
                                status: 'error',
                                rowCount: null,
                                durationMs: null,
                                error: result.error ?? 'Query failed',
                            });
                        }
                    }

                    respond({ result: json.results });
                } else {
                    respond({
                        error:
                            json.error?.message ?? `API error (${res.status})`,
                    });
                }
            } catch (err) {
                respond({
                    error: err instanceof Error ? err.message : 'Unknown error',
                });
            }
        },
        [iframeRef, onQueryEvent],
    );

    useEffect(() => {
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [handleMessage]);

    const handleIframeLoad = useCallback(() => {
        iframeRef.current?.contentWindow?.postMessage(
            { type: 'lightdash:sdk:ready' },
            '*',
        );
    }, [iframeRef]);

    return { handleIframeLoad };
}
