import { useCallback, useEffect, type RefObject } from 'react';

export type QueryEventTableCalculation = {
    name: string;
    displayName: string;
    sql: string;
};

export type QueryEventAdditionalMetric = {
    name: string;
    label: string;
    table: string;
    type: string;
};

export type QueryEvent = {
    id: string;
    timestamp: number;
    label: string | null;
    exploreName: string;
    dimensions: string[];
    metrics: string[];
    filters: unknown;
    sorts: unknown[];
    tableCalculations: QueryEventTableCalculation[];
    additionalMetrics: QueryEventAdditionalMetric[];
    limit: number;
    queryUuid: string | null;
    status: 'pending' | 'running' | 'ready' | 'error';
    rowCount: number | null;
    durationMs: number | null;
    error: string | null;
    /** The raw metric query body sent to the API */
    rawMetricQuery: Record<string, unknown> | null;
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

export type ElementSelectedEvent = {
    /** Bracketed reference produced by the iframe inspector, e.g. `[button "Save"]`. */
    label: string;
};

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
 *
 * When onElementSelected is provided, click-to-edit selections from the
 * iframe inspector are forwarded to the caller. Use the returned
 * enableInspector / disableInspector helpers to toggle the iframe-side
 * overlay.
 *
 * `onInspectorAvailable` and `onScreenshotAvailable` fire when the iframe
 * SDK announces those capabilities on mount. The bridge doesn't track
 * availability state itself — the parent owns it and is responsible for
 * resetting on iframe `src` change.
 */
export function useAppSdkBridge(
    iframeRef: RefObject<HTMLIFrameElement | null>,
    /**
     * The origin this iframe is expected to load from. When previews are
     * served cross-origin this is `https://{customer}.lightdash.app`; in
     * same-origin dev it's `window.location.origin`. The bridge accepts
     * either this origin or the literal `"null"` — the latter is what
     * sandboxed iframes without `allow-same-origin` report, since they
     * have an opaque origin. Identity is established by `event.source`
     * matching our iframe's contentWindow (unforgeable); origin is a
     * defence-in-depth check for the non-sandboxed/dev case.
     */
    expectedPreviewOrigin: string,
    onQueryEvent?: (event: QueryEvent) => void,
    onElementSelected?: (event: ElementSelectedEvent) => void,
    onInspectorAvailable?: () => void,
    onScreenshotAvailable?: () => void,
) {
    const handleMessage = useCallback(
        async (event: MessageEvent) => {
            if (event.source !== iframeRef.current?.contentWindow) return;
            // Sandboxed iframes without `allow-same-origin` report `"null"`
            // as their origin. The `event.source` check above is the strong
            // identity guarantee; this is defence-in-depth for the
            // non-sandboxed dev path.
            if (
                event.origin !== expectedPreviewOrigin &&
                event.origin !== 'null'
            ) {
                return;
            }

            const { data } = event;

            if (data?.type === 'lightdash:inspect:available') {
                onInspectorAvailable?.();
                return;
            }

            if (data?.type === 'lightdash:sdk:screenshot-available') {
                onScreenshotAvailable?.();
                return;
            }

            if (data?.type === 'lightdash:inspect:selected') {
                const label = typeof data.label === 'string' ? data.label : '';
                if (label && onElementSelected) {
                    onElementSelected({ label });
                }
                return;
            }

            if (data?.type !== 'lightdash:sdk:fetch') return;

            const { id, method, path, body, metadata } = data;

            const respond = (response: {
                result?: unknown;
                error?: string;
            }) => {
                // Wildcard targetOrigin — see handleIframeLoad below. The
                // parent's `event.source` and route allowlist do the security
                // work; matching against expectedPreviewOrigin only adds
                // noise from race conditions during iframe (re)mount.
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
                const sdkLabel = (
                    metadata as Record<string, unknown> | undefined
                )?.label as string | undefined;
                if (query) {
                    onQueryEvent({
                        id,
                        timestamp: Date.now(),
                        label: sdkLabel ?? null,
                        exploreName: (query.exploreName as string) ?? 'unknown',
                        dimensions: (query.dimensions as string[]) ?? [],
                        metrics: (query.metrics as string[]) ?? [],
                        filters: query.filters ?? {},
                        sorts: (query.sorts as unknown[]) ?? [],
                        tableCalculations:
                            (query.tableCalculations as QueryEventTableCalculation[]) ??
                            [],
                        additionalMetrics:
                            (query.additionalMetrics as QueryEventAdditionalMetric[]) ??
                            [],
                        limit: (query.limit as number) ?? 0,
                        queryUuid: null,
                        status: 'pending',
                        rowCount: null,
                        durationMs: null,
                        error: null,
                        rawMetricQuery: query,
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
                        const initLabel = (
                            metadata as Record<string, unknown> | undefined
                        )?.label as string | undefined;
                        onQueryEvent({
                            id,
                            timestamp: Date.now(),
                            label: initLabel ?? null,
                            exploreName:
                                json.results?.metricQuery?.exploreName ??
                                'unknown',
                            dimensions:
                                json.results?.metricQuery?.dimensions ?? [],
                            metrics: json.results?.metricQuery?.metrics ?? [],
                            filters: json.results?.metricQuery?.filters ?? {},
                            sorts: json.results?.metricQuery?.sorts ?? [],
                            tableCalculations:
                                json.results?.metricQuery?.tableCalculations ??
                                [],
                            additionalMetrics:
                                json.results?.metricQuery?.additionalMetrics ??
                                [],
                            limit: json.results?.metricQuery?.limit ?? 0,
                            queryUuid: json.results.queryUuid,
                            status: 'running',
                            rowCount: null,
                            durationMs: null,
                            error: null,
                            rawMetricQuery: null,
                        });
                    }

                    // Track query result polling responses
                    if (isQueryResultGet(method, path) && onQueryEvent) {
                        const result = json.results;
                        if (result?.status === 'ready') {
                            onQueryEvent({
                                id,
                                timestamp: Date.now(),
                                label: null,
                                exploreName: '',
                                dimensions: [],
                                metrics: [],
                                filters: {},
                                sorts: [],
                                tableCalculations: [],
                                additionalMetrics: [],
                                limit: 0,
                                queryUuid: result.queryUuid,
                                status: 'ready',
                                // Use totalResults (full row count across all
                                // pages), not rows.length (just this page).
                                // The SDK paginates internally — the app sees
                                // every row, so the inspector should too.
                                rowCount: result.totalResults ?? null,
                                durationMs:
                                    result.metadata?.performance
                                        ?.initialQueryExecutionMs ?? null,
                                error: null,
                                rawMetricQuery: null,
                            });
                        } else if (
                            result?.status === 'error' ||
                            result?.status === 'expired'
                        ) {
                            onQueryEvent({
                                id,
                                timestamp: Date.now(),
                                label: null,
                                exploreName: '',
                                dimensions: [],
                                metrics: [],
                                filters: {},
                                sorts: [],
                                tableCalculations: [],
                                additionalMetrics: [],
                                limit: 0,
                                queryUuid: result.queryUuid,
                                status: 'error',
                                rowCount: null,
                                durationMs: null,
                                error: result.error ?? 'Query failed',
                                rawMetricQuery: null,
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
        [
            iframeRef,
            expectedPreviewOrigin,
            onQueryEvent,
            onElementSelected,
            onInspectorAvailable,
            onScreenshotAvailable,
        ],
    );

    useEffect(() => {
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
    }, [handleMessage]);

    const handleIframeLoad = useCallback(() => {
        // `*` because the load event fires once for the initial about:blank
        // (which inherits the parent's origin) and again after the iframe
        // navigates to its actual src. With a specific targetOrigin the
        // first call logs a noisy postMessage warning. The :ready signal
        // carries no sensitive data, so wildcard is safe here.
        iframeRef.current?.contentWindow?.postMessage(
            { type: 'lightdash:sdk:ready' },
            '*',
        );
    }, [iframeRef]);

    const enableInspector = useCallback(() => {
        iframeRef.current?.contentWindow?.postMessage(
            { type: 'lightdash:inspect:enable' },
            '*',
        );
    }, [iframeRef]);

    const disableInspector = useCallback(() => {
        iframeRef.current?.contentWindow?.postMessage(
            { type: 'lightdash:inspect:disable' },
            '*',
        );
    }, [iframeRef]);

    return {
        handleIframeLoad,
        enableInspector,
        disableInspector,
    };
}
