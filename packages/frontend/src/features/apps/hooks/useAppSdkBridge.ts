import {
    APP_SDK_DATA_APP_VIZ_CONTEXT_MESSAGE,
    APP_SDK_VIZ_CONTEXT_REQUEST_MESSAGE,
    isAllowedAppSdkRoute,
    JWT_HEADER_NAME,
    LightdashAppUuidHeader,
    type DataAppVizContext,
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
 * A single external-connection fetch proxied through the bridge, reported for
 * the external-requests inspector tab. Single-shot lifecycle: one `pending`
 * event when the fetch starts, one terminal `ready`/`error` event when it
 * settles — matched by `id` (no queryUuid remap like metric queries need).
 */
export type ExternalRequestEvent = {
    id: string;
    timestamp: number;
    /** Connection alias the app called, e.g. `stripe`. */
    alias: string;
    method: 'GET' | 'POST';
    path: string;
    query: Record<string, string> | null;
    /** JSON request body (POST); null for GET or an empty body. */
    requestBody: unknown;
    status: 'pending' | 'ready' | 'error';
    /** Upstream HTTP status (null until the fetch settles / on proxy error). */
    httpStatus: number | null;
    contentType: string | null;
    /** Parsed response body; null until the fetch settles. */
    responseBody: unknown;
    truncated: boolean | null;
    durationMs: number | null;
    error: string | null;
};

// Routes the SDK is allowed to call through the postMessage bridge live in
// @lightdash/common (APP_SDK_ALLOWED_ROUTES) — shared with the CLI preview
// proxy so preview and deployed authority can't drift. Everything else is
// rejected.

// Keep in sync with MAX_URL_STATE_CHARS in packages/query-sdk/src/urlState.ts.
// Caps what an app can push into the host page's URL / browser history.
const MAX_URL_STATE_CHARS = 4096;

const isMetricQueryPost = (method: string, path: string): boolean =>
    method.toUpperCase() === 'POST' &&
    /^\/api\/v2\/projects\/[^/]+\/query\/metric-query$/.test(path);

const isChartQueryPost = (method: string, path: string): boolean =>
    method.toUpperCase() === 'POST' &&
    /^\/api\/v2\/projects\/[^/]+\/query\/chart$/.test(path);

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
export type UseAppSdkBridgeParams = {
    iframeRef: RefObject<HTMLIFrameElement | null>;
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
    expectedPreviewOrigin: string;
    /** Project the proxied EE external-fetch calls run against. */
    projectUuid: string;
    /** App the proxied EE external-fetch calls are attributed to. */
    appUuid: string;
    onQueryEvent?: (event: QueryEvent) => void;
    onElementSelected?: (event: ElementSelectedEvent) => void;
    onInspectorAvailable?: () => void;
    onScreenshotAvailable?: () => void;
    /**
     * When set, these filters are stamped onto every intercepted metric-query
     * POST before it reaches the backend. Used by dashboard data-app tiles so
     * the dashboard filter bar applies to the app's queries. The iframe SDK
     * is not involved — generated apps stay filter-agnostic.
     */
    dashboardFilters?: DashboardFilters;
    /**
     * When true, `invalidateCache` is stamped onto every intercepted
     * metric-query POST so the backend bypasses the warehouse results cache —
     * mirrors what chart tiles send after the dashboard refresh button is
     * pressed. Set by `DashboardDataAppTile`; left undefined elsewhere.
     */
    invalidateCache?: boolean;
    /**
     * Feature capabilities the host page opts into. Currently gates the
     * Google Sheets export flow — hosts that don't pass `gsheetExport: true`
     * will receive an error response for those requests.
     */
    capabilities?: { gsheetExport?: boolean };
    onLineageAvailable?: () => void;
    onLineageSelected?: (event: { queryUuid: string }) => void;
    /**
     * When provided, external-connection fetches proxied through this bridge
     * are reported for the external-requests inspector tab — mirrors
     * `onQueryEvent` for metric queries. Emits `pending` when the fetch starts
     * and a terminal `ready`/`error` event when it settles.
     */
    onExternalRequestEvent?: (event: ExternalRequestEvent) => void;
    // When set, the host pushes this render context into the iframe over the
    // existing bridge — on load and on every change. Only set for data app vizs.
    dataAppVizContext?: DataAppVizContext;
    // When set, `lightdash:sdk:url-state-change` messages from the iframe SDK
    // are validated and forwarded. Left undefined, they're ignored.
    onUrlStateChange?: (state: Record<string, unknown>) => void;
};

export function useAppSdkBridge({
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
    capabilities,
    onLineageAvailable,
    onLineageSelected,
    onExternalRequestEvent,
    dataAppVizContext,
    onUrlStateChange,
}: UseAppSdkBridgeParams) {
    // Embed mode adapts the bridge's outgoing fetches in two ways:
    //   - Attaches the embed JWT header in lieu of session cookies
    //     (the parent in embed mode has no session, only the JWT).
    //   - Rewrites `GET /api/v1/user` to the embed-specific user-info
    //     endpoint so that existing data apps built before embedding existed
    //     don't break on `client.auth.getUser()`. The SDK protocol is
    //     unchanged — the rewrite happens entirely on the parent side.
    const { embedToken, projectUuid: embedProjectUuid } = useEmbed();
    const { health, user } = useApp();

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

    // Push the render context into the iframe. Sent in response to the iframe's
    // `viz-context-request` handshake (the renderer mounts after its bundle
    // loads, so a single push on `load` can arrive before its listener exists)
    // and re-sent whenever the context changes. No-op for non-viz apps.
    const pushDataAppVizContext = useCallback(() => {
        if (!dataAppVizContext) return;
        iframeRef.current?.contentWindow?.postMessage(
            {
                type: APP_SDK_DATA_APP_VIZ_CONTEXT_MESSAGE,
                ...dataAppVizContext,
            },
            '*',
        );
    }, [iframeRef, dataAppVizContext]);

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

            // Handshake: the iframe's viz renderer asks for the current context
            // once its listener is mounted. Reply with a push (no-op if this
            // isn't a data app viz).
            if (data?.type === APP_SDK_VIZ_CONTEXT_REQUEST_MESSAGE) {
                pushDataAppVizContext();
                return;
            }

            if (data?.type === 'lightdash:inspect:selected') {
                const label = typeof data.label === 'string' ? data.label : '';
                if (label && onElementSelected) {
                    onElementSelected({ label });
                }
                return;
            }

            if (data?.type === 'lightdash:lineage:available') {
                onLineageAvailable?.();
                return;
            }

            if (data?.type === 'lightdash:sdk:url-state-change') {
                if (!onUrlStateChange) return;
                const state: unknown = data.state;
                // Untrusted app payload: accept only a plain object under the
                // size cap, and warn — a silent drop looks like a broken URL.
                const reject = (reason: string) =>
                    console.warn(
                        `[lightdash] Ignoring app URL state update: ${reason}`,
                    );
                if (
                    typeof state !== 'object' ||
                    state === null ||
                    Array.isArray(state)
                ) {
                    reject('not a plain object');
                    return;
                }
                try {
                    if (JSON.stringify(state).length > MAX_URL_STATE_CHARS) {
                        reject(`over ${MAX_URL_STATE_CHARS} chars serialized`);
                        return;
                    }
                } catch {
                    reject('not JSON-serializable');
                    return;
                }
                onUrlStateChange(state as Record<string, unknown>);
                return;
            }

            if (data?.type === 'lightdash:lineage:selected') {
                const queryUuid =
                    typeof data.queryUuid === 'string' ? data.queryUuid : '';
                if (queryUuid && onLineageSelected) {
                    onLineageSelected({ queryUuid });
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

                // Report the fetch to the external-requests inspector. Base
                // request fields are captured up front; each call overlays the
                // lifecycle status (and, on settle, the response/duration).
                const startedAt = Date.now();
                const emitExternal = (
                    fields: Partial<ExternalRequestEvent> & {
                        status: ExternalRequestEvent['status'];
                    },
                ) => {
                    onExternalRequestEvent?.({
                        id: externalId,
                        timestamp: startedAt,
                        alias: typeof alias === 'string' ? alias : 'unknown',
                        method: externalMethod === 'POST' ? 'POST' : 'GET',
                        path:
                            typeof externalPath === 'string'
                                ? externalPath
                                : '',
                        query:
                            (externalQuery as
                                | Record<string, string>
                                | undefined) ?? null,
                        requestBody: externalBody ?? null,
                        httpStatus: null,
                        contentType: null,
                        responseBody: null,
                        truncated: null,
                        durationMs: null,
                        error: null,
                        ...fields,
                    });
                };

                emitExternal({ status: 'pending' });

                // External fetch is not available to embedded apps: the proxy
                // endpoint requires a registered session, not an embed JWT.
                // Fail clearly rather than make a doomed authenticated call.
                if (embedToken) {
                    const embedError =
                        'External data access is not available in embedded apps';
                    emitExternal({
                        status: 'error',
                        error: embedError,
                        durationMs: Date.now() - startedAt,
                    });
                    respondExternal({ error: embedError });
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
                            },
                            body: JSON.stringify(externalFetchBody),
                        },
                    );
                    const json = await res.json();
                    if (json.status === 'ok') {
                        const result = json.results as
                            | {
                                  status?: number;
                                  contentType?: string;
                                  body?: unknown;
                                  truncated?: boolean;
                              }
                            | undefined;
                        emitExternal({
                            status: 'ready',
                            httpStatus: result?.status ?? null,
                            contentType: result?.contentType ?? null,
                            responseBody: result?.body ?? null,
                            truncated: result?.truncated ?? null,
                            durationMs: Date.now() - startedAt,
                        });
                        respondExternal({ result: json.results });
                    } else {
                        const errorMessage =
                            json.error?.message ??
                            `External fetch failed (${res.status})`;
                        emitExternal({
                            status: 'error',
                            error: errorMessage,
                            durationMs: Date.now() - startedAt,
                        });
                        respondExternal({ error: errorMessage });
                    }
                } catch (err) {
                    const errorMessage =
                        err instanceof Error ? err.message : 'Unknown error';
                    emitExternal({
                        status: 'error',
                        error: errorMessage,
                        durationMs: Date.now() - startedAt,
                    });
                    respondExternal({ error: errorMessage });
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

            if (!isAllowedAppSdkRoute(method, path)) {
                respond({ error: `Blocked: ${method} ${path}` });
                return;
            }

            // Stamp dashboard filters and the cache-invalidation flag onto
            // outgoing query bodies. The backend drops filters whose fields
            // aren't in the query's/chart's explore, so it's safe to send the
            // full set on every call. Both `dashboardFilters` and
            // `invalidateCache` apply to inline metric queries AND linked
            // (/query/chart) charts, so a dashboard filter or refresh reaches
            // linked charts too. App attribution rides on the
            // LightdashAppUuidHeader instead (see the fetch below).
            const stampFilters =
                (isMetricQueryPost(method, path) ||
                    isChartQueryPost(method, path)) &&
                !!dashboardFilters;
            const stampInvalidate =
                (isMetricQueryPost(method, path) ||
                    isChartQueryPost(method, path)) &&
                !!invalidateCache;
            const effectiveBody =
                stampFilters || stampInvalidate
                    ? {
                          ...(body as Record<string, unknown> | undefined),
                          ...(stampFilters ? { dashboardFilters } : {}),
                          ...(stampInvalidate ? { invalidateCache } : {}),
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
                if (
                    (!isMetricQueryPost(method, path) &&
                        !isChartQueryPost(method, path)) ||
                    !onQueryEvent
                )
                    return;
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
                        // Self-reported app attribution; the backend tags
                        // warehouse queries with it. Tracking only.
                        ...(appUuid
                            ? { [LightdashAppUuidHeader]: appUuid }
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
                        (isMetricQueryPost(method, path) ||
                            isChartQueryPost(method, path)) &&
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
            onLineageAvailable,
            onLineageSelected,
            onExternalRequestEvent,
            pushDataAppVizContext,
            onUrlStateChange,
            health.data,
            user.data,
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

    // Re-push the render context whenever the host's field mapping or rows
    // change, so an already-loaded iframe re-renders live. The initial delivery
    // is driven by the iframe's `viz-context-request` handshake, so no push on
    // `load` is needed here.
    useEffect(() => {
        pushDataAppVizContext();
    }, [pushDataAppVizContext]);

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

    const enableLineage = useCallback(() => {
        iframeRef.current?.contentWindow?.postMessage(
            { type: 'lightdash:lineage:enable' },
            '*',
        );
    }, [iframeRef]);

    const disableLineage = useCallback(() => {
        iframeRef.current?.contentWindow?.postMessage(
            { type: 'lightdash:lineage:disable' },
            '*',
        );
    }, [iframeRef]);

    const highlightLineage = useCallback(
        (queryUuid: string | null) => {
            iframeRef.current?.contentWindow?.postMessage(
                { type: 'lightdash:lineage:highlight', queryUuid },
                '*',
            );
        },
        [iframeRef],
    );

    return {
        handleIframeLoad,
        enableInspector,
        disableInspector,
        enableLineage,
        disableLineage,
        highlightLineage,
    };
}
