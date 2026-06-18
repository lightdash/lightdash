import {
    FeatureFlags,
    JWT_HEADER_NAME,
    type DashboardFilters,
} from '@lightdash/common';
import { useCallback, useEffect, useRef, type RefObject } from 'react';
import { lightdashApi } from '../../../api';
import useEmbed from '../../../ee/providers/Embed/useEmbed';
import {
    getGdriveAccessToken,
    triggerGdriveLogin,
} from '../../../hooks/gdrive/useGdrive';
import useApp from '../../../providers/App/useApp';
import {
    handleGsheetExport,
    type GsheetExportColumn,
    type GsheetExportRow,
} from './handleGsheetExport';
import { useServerFeatureFlag } from '../../../hooks/useServerOrClientFeatureFlag';

// Same key the SDK persists `instanceUrl` under (sdk/index.tsx, api.ts).
// Duplicated rather than imported to avoid threading a shared export through
// the SDK build. Keep in sync if the key changes there.
const LIGHTDASH_SDK_INSTANCE_URL_KEY = '__lightdash_sdk_instance_url';

/**
 * In SDK embeds the host page is the consuming app's origin, so a relative
 * `fetch('/api/v2/...')` would hit *their* dev server, not Lightdash. When
 * the SDK has stashed an instance URL in sessionStorage, prepend it.
 */
const resolveFetchUrl = (path: string): string => {
    if (typeof window === 'undefined') return path;
    const instanceUrl = sessionStorage.getItem(LIGHTDASH_SDK_INSTANCE_URL_KEY);
    if (!instanceUrl) return path;
    // SDK persists with a trailing slash; `path` always starts with `/`.
    return `${instanceUrl.replace(/\/$/, '')}${path}`;
};

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
    // Run underlying-data queries for SDK result rows
    {
        method: 'POST',
        pattern: /^\/api\/v2\/projects\/[^/]+\/query\/underlying-data$/,
    },
    // Poll for query results
    {
        method: 'GET',
        pattern: /^\/api\/v2\/projects\/[^/]+\/query\/[^/]+$/,
    },
    // Schedule backend CSV/XLSX export jobs for SDK query results
    {
        method: 'POST',
        pattern:
            /^\/api\/v2\/projects\/[^/]+\/query\/[^/]+\/schedule-download$/,
    },
    // Poll export job status until the backend returns a file URL
    {
        method: 'GET',
        pattern: /^\/api\/v1\/schedulers\/job\/[^/]+\/status$/,
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
    /** Project the proxied EE external-fetch calls run against. */
    projectUuid: string,
    /** App the proxied EE external-fetch calls are attributed to. */
    appUuid: string,
    onQueryEvent?: (event: QueryEvent) => void,
    onElementSelected?: (event: ElementSelectedEvent) => void,
    onInspectorAvailable?: () => void,
    onScreenshotAvailable?: () => void,
    /**
     * When set, these filters are stamped onto every intercepted metric-query
     * POST before it reaches the backend. Used by dashboard data-app tiles so
     * the dashboard filter bar applies to the app's queries. The iframe SDK
     * is not involved — generated apps stay filter-agnostic.
     */
    dashboardFilters?: DashboardFilters,
    /**
     * When true, `invalidateCache` is stamped onto every intercepted
     * metric-query POST so the backend bypasses the warehouse results cache —
     * mirrors what chart tiles send after the dashboard refresh button is
     * pressed. Set by `DashboardDataAppTile`; left undefined elsewhere.
     */
    invalidateCache?: boolean,
    /**
     * Feature capabilities the host page opts into. Currently gates the
     * Google Sheets export flow — hosts that don't pass `gsheetExport: true`
     * will receive an error response for those requests.
     */
    capabilities?: { gsheetExport?: boolean },
) {
    // Embed mode adapts the bridge's outgoing fetches in two ways:
    //   - Attaches the embed JWT header in lieu of session cookies
    //     (the parent in embed mode has no session, only the JWT).
    //   - Rewrites `GET /api/v1/user` to the embed-specific user-info
    //     endpoint so that existing data apps built before embedding existed
    //     don't break on `client.auth.getUser()`. The SDK protocol is
    //     unchanged — the rewrite happens entirely on the parent side.
    const { embedToken, projectUuid: embedProjectUuid } = useEmbed();
    const { health, user } = useApp();

    const { data: externalAccessFlag } = useServerFeatureFlag(
        FeatureFlags.EnableDataAppExternalAccess,
    );
    const externalAccessEnabled = externalAccessFlag?.enabled ?? false;

    // Maps queryUuid → POST request id. The SDK transport assigns a fresh
    // request id to the POST (`/metric-query`) and again to each GET poll
    // (`/query/{uuid}`), so terminal events emitted from the GET handler
    // would otherwise carry a different id than the pending/running events
    // emitted from the POST handler. We record the mapping when the POST
    // resolves with a queryUuid, then re-key ready/error events to the
    // POST id so consumers can track the full pending → ready/error
    // lifecycle by a single stable id (without this, MinimalApp's
    // in-flight set never drains and the screenshot indicator never
    // mounts).
    const queryUuidToPostIdRef = useRef<Map<string, string>>(new Map());

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

            if (data?.type === 'lightdash:sdk:gsheet-export-request') {
                const req = data as {
                    id: string;
                    title: string;
                    columns: GsheetExportColumn[];
                    rows: GsheetExportRow[];
                };
                const respondGsheet = (resp: {
                    fileUrl?: string;
                    error?: string;
                }) =>
                    iframeRef.current?.contentWindow?.postMessage(
                        {
                            type: 'lightdash:sdk:gsheet-export-response',
                            id: req.id,
                            ...resp,
                        },
                        '*',
                    );
                // Guard against iframe requests that arrive before health/user
                // queries resolve — otherwise the non-null assertions below
                // throw a TypeError that the app developer sees as a generic
                // "Export failed" with no diagnostic.
                if (!health.data || !user.data) {
                    respondGsheet({
                        error: 'Lightdash is still loading, try again shortly',
                    });
                    return;
                }
                try {
                    const { fileUrl } = await handleGsheetExport(
                        {
                            title: req.title,
                            columns: req.columns,
                            rows: req.rows,
                        },
                        {
                            capability: capabilities?.gsheetExport === true,
                            health: health.data,
                            ability: user.data.ability,
                            projectUuid: projectUuid ?? '',
                            organizationUuid: user.data.organizationUuid ?? '',
                            getAccessToken: getGdriveAccessToken,
                            triggerLogin: triggerGdriveLogin,
                            lightdashApi: ({ url, method, body }) =>
                                lightdashApi({
                                    url,
                                    method,
                                    body: body ?? undefined,
                                }),
                        },
                    );
                    respondGsheet({ fileUrl });
                } catch (e) {
                    respondGsheet({
                        error: e instanceof Error ? e.message : 'Export failed',
                    });
                }
                return;
            }

            if (data?.type === 'lightdash:sdk:external-fetch') {
                const {
                    id: externalId,
                    alias,
                    method: externalMethod,
                    path: externalPath,
                    query: externalQuery,
                    body: externalBody,
                } = data;

                const respondExternal = (response: {
                    result?: unknown;
                    error?: string;
                }) => {
                    iframeRef.current?.contentWindow?.postMessage(
                        {
                            type: 'lightdash:sdk:external-fetch-response',
                            id: externalId,
                            ...response,
                        },
                        '*',
                    );
                };

                if (!externalAccessEnabled) {
                    respondExternal({
                        error: 'External data access is disabled for this organization',
                    });
                    return;
                }

                // Build the EE request body from app-supplied fields ONLY.
                // No URL, no headers, no connection UUID — the backend resolves
                // the alias and attaches the connection's secrets. The
                // ALLOWED_ROUTES allowlist is deliberately NOT consulted here:
                // this is a dedicated, separately-authorized endpoint.
                const externalFetchPath = `/api/v1/ee/projects/${projectUuid}/apps/${appUuid}/external-fetch`;
                const externalFetchBody = {
                    connectionAlias: alias,
                    method: externalMethod ?? 'GET',
                    path: externalPath,
                    query: externalQuery,
                    body: externalBody,
                };

                try {
                    const res = await fetch(
                        resolveFetchUrl(externalFetchPath),
                        {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                ...(embedToken
                                    ? { [JWT_HEADER_NAME]: embedToken }
                                    : {}),
                            },
                            body: JSON.stringify(externalFetchBody),
                        },
                    );
                    const json = await res.json();
                    if (json.status === 'ok') {
                        respondExternal({ result: json.results });
                    } else {
                        respondExternal({
                            error:
                                json.error?.message ??
                                `External fetch failed (${res.status})`,
                        });
                    }
                } catch (err) {
                    respondExternal({
                        error:
                            err instanceof Error
                                ? err.message
                                : 'Unknown error',
                    });
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

            // Stamp dashboard filters and the cache-invalidation flag onto
            // outgoing metric-query bodies. The backend drops filters whose
            // fields aren't in the query's explore, so it's safe to send the
            // full set on every call. `invalidateCache` mirrors what charts
            // send on a dashboard refresh so the app's queries bypass the
            // warehouse results cache too.
            const effectiveBody =
                isMetricQueryPost(method, path) &&
                (dashboardFilters || invalidateCache)
                    ? {
                          ...(body as Record<string, unknown> | undefined),
                          ...(dashboardFilters ? { dashboardFilters } : {}),
                          ...(invalidateCache ? { invalidateCache } : {}),
                      }
                    : body;

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

            // In embed mode, rewrite the user-info fetch to the embed
            // endpoint so the SDK's getUser() resolves against the JWT's
            // synthesized user instead of a session-only route.
            const effectivePath =
                embedToken &&
                embedProjectUuid &&
                method.toUpperCase() === 'GET' &&
                path === '/api/v1/user'
                    ? `/api/v1/embed/${embedProjectUuid}/user-info`
                    : path;

            // Emits a terminal `error` QueryEvent re-keyed to the POST id
            // when a metric-query POST fails before the SDK ever gets a
            // queryUuid. Without it, the pending entry stays in
            // MinimalApp's in-flight set forever and the screenshot
            // indicator never mounts. The GET-poll error/ready paths
            // already emit their own terminal events, so this only runs
            // for the POST.
            const emitPostFailure = (errorMessage: string) => {
                if (!isMetricQueryPost(method, path) || !onQueryEvent) return;
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
                    queryUuid: null,
                    status: 'error',
                    rowCount: null,
                    durationMs: null,
                    error: errorMessage,
                    rawMetricQuery: null,
                });
            };

            try {
                // SDK embeds: a bare `fetch(path)` resolves against the
                // host's origin, not Lightdash. Rewrite to an absolute URL
                // against the SDK's stashed instance URL when present.
                const res = await fetch(resolveFetchUrl(effectivePath), {
                    method,
                    headers: {
                        'Content-Type': 'application/json',
                        ...(embedToken
                            ? { [JWT_HEADER_NAME]: embedToken }
                            : {}),
                    },
                    ...(effectiveBody
                        ? { body: JSON.stringify(effectiveBody) }
                        : {}),
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
                        queryUuidToPostIdRef.current.set(
                            json.results.queryUuid,
                            id,
                        );
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
                        // Re-key terminal events to the POST id so consumers
                        // see a single stable id across the pending →
                        // ready/error lifecycle. Falls back to the GET id
                        // only if the mapping is missing (shouldn't happen
                        // in normal flow — the POST always runs first).
                        const lifecycleId: string =
                            (result?.queryUuid &&
                                queryUuidToPostIdRef.current.get(
                                    result.queryUuid,
                                )) ??
                            id;
                        if (result?.status === 'ready') {
                            queryUuidToPostIdRef.current.delete(
                                result.queryUuid,
                            );
                            onQueryEvent({
                                id: lifecycleId,
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
                            queryUuidToPostIdRef.current.delete(
                                result.queryUuid,
                            );
                            onQueryEvent({
                                id: lifecycleId,
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
                    const errorMessage =
                        json.error?.message ?? `API error (${res.status})`;
                    emitPostFailure(errorMessage);
                    respond({ error: errorMessage });
                }
            } catch (err) {
                const errorMessage =
                    err instanceof Error ? err.message : 'Unknown error';
                emitPostFailure(errorMessage);
                respond({ error: errorMessage });
            }
        },
        [
            iframeRef,
            expectedPreviewOrigin,
            projectUuid,
            appUuid,
            onQueryEvent,
            onElementSelected,
            onInspectorAvailable,
            onScreenshotAvailable,
            dashboardFilters,
            invalidateCache,
            embedToken,
            embedProjectUuid,
            capabilities,
            health.data,
            user.data,
            projectUuid,
            externalAccessEnabled,
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
