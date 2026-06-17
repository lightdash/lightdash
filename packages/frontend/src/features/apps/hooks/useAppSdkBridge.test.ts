import { renderHook } from '@testing-library/react';
import { type RefObject } from 'react';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type Mock,
} from 'vitest';
import { useAppSdkBridge, type QueryEvent } from './useAppSdkBridge';

vi.mock('../../../ee/providers/Embed/useEmbed', () => ({
    default: () => ({
        embedToken: undefined,
        projectUuid: undefined,
    }),
}));

vi.mock('../../../providers/App/useApp', () => ({
    default: () => ({
        health: { data: undefined },
        user: { data: undefined },
    }),
}));

vi.mock('../../../hooks/useProjectUuid', () => ({
    useProjectUuid: () => undefined,
}));

const PROJECT_UUID = 'project-uuid';
const POST_PATH = `/api/v2/projects/${PROJECT_UUID}/query/metric-query`;
const UNDERLYING_DATA_PATH = `/api/v2/projects/${PROJECT_UUID}/query/underlying-data`;
const POST_ID = '11111111-1111-1111-1111-111111111111';
const GET_ID = '22222222-2222-2222-2222-222222222222';
const QUERY_UUID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const SCHEDULE_DOWNLOAD_PATH = `/api/v2/projects/${PROJECT_UUID}/query/${QUERY_UUID}/schedule-download`;
const JOB_STATUS_PATH = '/api/v1/schedulers/job/job-uuid/status';

const METRIC_QUERY = {
    exploreName: 'orders',
    dimensions: [],
    metrics: [],
    filters: {},
    sorts: [],
    tableCalculations: [],
    additionalMetrics: [],
    limit: 100,
};

function dispatchFetchMessage(payload: Record<string, unknown>) {
    // MessageEvent's `source` is intentionally set to `window` so that the
    // bridge's `event.source !== iframeRef.current?.contentWindow` identity
    // check passes when the iframe ref points at window in the test (see
    // setup below). `origin: 'null'` matches the sandboxed-iframe branch of
    // the bridge's origin check.
    const event = new MessageEvent('message', {
        data: payload,
        origin: 'null',
        source: window,
    });
    window.dispatchEvent(event);
}

function mockFetchOk(json: Record<string, unknown>) {
    (fetch as Mock).mockResolvedValueOnce({
        json: async () => json,
        status: 200,
    } as Response);
}

function mockFetchNonOk(json: Record<string, unknown>, status = 500) {
    (fetch as Mock).mockResolvedValueOnce({
        json: async () => json,
        status,
    } as Response);
}

function mockFetchReject(err: Error) {
    (fetch as Mock).mockRejectedValueOnce(err);
}

function postMetricQuery() {
    dispatchFetchMessage({
        type: 'lightdash:sdk:fetch',
        id: POST_ID,
        method: 'POST',
        path: POST_PATH,
        body: { query: METRIC_QUERY },
    });
}

function pollQueryResult(id: string = GET_ID) {
    dispatchFetchMessage({
        type: 'lightdash:sdk:fetch',
        id,
        method: 'GET',
        path: `/api/v2/projects/${PROJECT_UUID}/query/${QUERY_UUID}`,
    });
}

const APP_UUID = 'app-uuid';

function renderBridge(onQueryEvent: (event: QueryEvent) => void) {
    const iframeRef = {
        current: { contentWindow: window } as unknown as HTMLIFrameElement,
    } as RefObject<HTMLIFrameElement | null>;
    renderHook(() =>
        useAppSdkBridge(
            iframeRef,
            window.location.origin,
            PROJECT_UUID,
            APP_UUID,
            onQueryEvent,
        ),
    );
}

describe('useAppSdkBridge', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('re-keys ready events to the POST request id (regression: id mismatch left MinimalApp stuck on the indicator)', async () => {
        const events: QueryEvent[] = [];
        renderBridge((e) => events.push(e));

        mockFetchOk({
            status: 'ok',
            results: { queryUuid: QUERY_UUID, metricQuery: METRIC_QUERY },
        });
        postMetricQuery();
        await vi.waitFor(() =>
            expect(events.map((e) => e.status)).toEqual(['pending', 'running']),
        );

        mockFetchOk({
            status: 'ok',
            results: {
                queryUuid: QUERY_UUID,
                status: 'ready',
                totalResults: 42,
                metadata: {
                    performance: { initialQueryExecutionMs: 17 },
                },
            },
        });
        pollQueryResult();
        await vi.waitFor(() => expect(events).toHaveLength(3));

        expect(events[0]).toMatchObject({
            id: POST_ID,
            status: 'pending',
            queryUuid: null,
        });
        expect(events[1]).toMatchObject({
            id: POST_ID,
            status: 'running',
            queryUuid: QUERY_UUID,
        });
        // Previously emitted with id=GET_ID, so consumers tracking lifecycle
        // by event.id (e.g., MinimalApp's activeQueryIds set) never matched
        // the pending entry and the set never drained to zero.
        expect(events[2]).toMatchObject({
            id: POST_ID,
            status: 'ready',
            queryUuid: QUERY_UUID,
            rowCount: 42,
        });
    });

    it('re-keys terminal error events to the POST request id', async () => {
        const events: QueryEvent[] = [];
        renderBridge((e) => events.push(e));

        mockFetchOk({
            status: 'ok',
            results: { queryUuid: QUERY_UUID, metricQuery: METRIC_QUERY },
        });
        postMetricQuery();
        await vi.waitFor(() => expect(events).toHaveLength(2));

        mockFetchOk({
            status: 'ok',
            results: {
                queryUuid: QUERY_UUID,
                status: 'error',
                error: 'Warehouse timeout',
            },
        });
        pollQueryResult();
        await vi.waitFor(() => expect(events).toHaveLength(3));

        expect(events[2]).toMatchObject({
            id: POST_ID,
            status: 'error',
            queryUuid: QUERY_UUID,
            error: 'Warehouse timeout',
        });
    });

    it('emits a terminal error event when the metric-query POST returns a non-ok payload', async () => {
        // Without this, the pending event's id stays in MinimalApp's in-flight
        // set forever, isReady never flips true, and the screenshot indicator
        // never mounts — so the headless browser hits the 60s timeout.
        const events: QueryEvent[] = [];
        renderBridge((e) => events.push(e));

        mockFetchNonOk({
            status: 'error',
            error: { message: 'Internal server error' },
        });
        postMetricQuery();

        await vi.waitFor(() => expect(events).toHaveLength(2));
        expect(events[0]).toMatchObject({ id: POST_ID, status: 'pending' });
        expect(events[1]).toMatchObject({
            id: POST_ID,
            status: 'error',
            queryUuid: null,
            error: 'Internal server error',
        });
    });

    it('emits a terminal error event when the metric-query POST fetch throws', async () => {
        const events: QueryEvent[] = [];
        renderBridge((e) => events.push(e));

        mockFetchReject(new Error('Network unreachable'));
        postMetricQuery();

        await vi.waitFor(() => expect(events).toHaveLength(2));
        expect(events[0]).toMatchObject({ id: POST_ID, status: 'pending' });
        expect(events[1]).toMatchObject({
            id: POST_ID,
            status: 'error',
            queryUuid: null,
            error: 'Network unreachable',
        });
    });

    it('MinimalApp-style in-flight set drains to zero when the POST fails', async () => {
        // The bug this guards: a failed POST left its pending id stuck in the
        // set, blocking the screenshot indicator from ever mounting on any
        // run where a query errored. Mirrors the success-path drain test
        // below.
        const activeIds = new Set<string>();
        renderBridge((event) => {
            const inFlight =
                event.status === 'pending' || event.status === 'running';
            if (inFlight) activeIds.add(event.id);
            else activeIds.delete(event.id);
        });

        mockFetchReject(new Error('boom'));
        postMetricQuery();

        await vi.waitFor(() => expect(activeIds.size).toBe(0));
    });

    it('MinimalApp-style in-flight set drains to zero after a query completes', async () => {
        // Models MinimalApp's handleQueryEvent: pending/running add the
        // event id to a set, ready/error remove it. With the original bug,
        // the set never drained because the ready event carried the GET id
        // (not the POST id that was added), so isReady stayed false and
        // the screenshot indicator never mounted.
        const activeIds = new Set<string>();
        renderBridge((event) => {
            const inFlight =
                event.status === 'pending' || event.status === 'running';
            if (inFlight) activeIds.add(event.id);
            else activeIds.delete(event.id);
        });

        mockFetchOk({
            status: 'ok',
            results: { queryUuid: QUERY_UUID, metricQuery: METRIC_QUERY },
        });
        postMetricQuery();
        await vi.waitFor(() => expect(activeIds.size).toBe(1));

        mockFetchOk({
            status: 'ok',
            results: {
                queryUuid: QUERY_UUID,
                status: 'ready',
                totalResults: 0,
                metadata: { performance: { initialQueryExecutionMs: 1 } },
            },
        });
        pollQueryResult();
        await vi.waitFor(() => expect(activeIds.size).toBe(0));
    });

    it('allows SDK underlying-data queries through the bridge', async () => {
        renderBridge(() => undefined);

        mockFetchOk({
            status: 'ok',
            results: { queryUuid: QUERY_UUID, metricQuery: METRIC_QUERY },
        });

        dispatchFetchMessage({
            type: 'lightdash:sdk:fetch',
            id: POST_ID,
            method: 'POST',
            path: UNDERLYING_DATA_PATH,
            body: {
                underlyingDataSourceQueryUuid: QUERY_UUID,
                underlyingDataItemId: 'orders_total_revenue',
                filters: {},
            },
        });

        await vi.waitFor(() =>
            expect(fetch).toHaveBeenCalledWith(
                UNDERLYING_DATA_PATH,
                expect.objectContaining({ method: 'POST' }),
            ),
        );
    });

    it('allows SDK download scheduling and job polling through the bridge', async () => {
        renderBridge(() => undefined);

        mockFetchOk({
            status: 'ok',
            results: { jobId: 'job-uuid' },
        });

        dispatchFetchMessage({
            type: 'lightdash:sdk:fetch',
            id: POST_ID,
            method: 'POST',
            path: SCHEDULE_DOWNLOAD_PATH,
            body: {
                type: 'csv',
                onlyRaw: false,
                attachmentDownloadName: 'orders-export',
            },
        });

        await vi.waitFor(() =>
            expect(fetch).toHaveBeenCalledWith(
                SCHEDULE_DOWNLOAD_PATH,
                expect.objectContaining({ method: 'POST' }),
            ),
        );

        mockFetchOk({
            status: 'ok',
            results: {
                status: 'completed',
                details: { fileUrl: '/api/v1/projects/project-uuid/csv/file' },
            },
        });

        dispatchFetchMessage({
            type: 'lightdash:sdk:fetch',
            id: GET_ID,
            method: 'GET',
            path: JOB_STATUS_PATH,
        });

        await vi.waitFor(() =>
            expect(fetch).toHaveBeenCalledWith(
                JOB_STATUS_PATH,
                expect.objectContaining({ method: 'GET' }),
            ),
        );
    });
});

describe('external-fetch branch', () => {
    beforeEach(() => {
        vi.stubGlobal('fetch', vi.fn());
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    function postExternalFetch(payload: Record<string, unknown>) {
        dispatchFetchMessage({
            type: 'lightdash:sdk:external-fetch',
            id: POST_ID,
            ...payload,
        });
    }

    function captureResponses() {
        const responses: Array<Record<string, unknown>> = [];
        const spy = vi
            .spyOn(window, 'postMessage')
            .mockImplementation((msg: unknown) =>
                responses.push(msg as Record<string, unknown>),
            );
        return { responses, spy };
    }

    it('POSTs to the EE external-fetch endpoint with the app-supplied body only', async () => {
        renderBridge(() => undefined);
        mockFetchOk({
            status: 'ok',
            results: {
                status: 200,
                contentType: 'application/json',
                body: { ok: true },
                truncated: false,
            },
        });

        postExternalFetch({
            alias: 'stripe',
            method: 'POST',
            path: '/v1/charges',
            query: { limit: '10' },
            body: { amount: 500 },
        });

        await vi.waitFor(() =>
            expect(fetch).toHaveBeenCalledWith(
                `/api/v1/ee/projects/${PROJECT_UUID}/apps/${APP_UUID}/external-fetch`,
                expect.objectContaining({ method: 'POST' }),
            ),
        );
        const [, init] = (fetch as Mock).mock.calls[0];
        expect(JSON.parse(init.body)).toEqual({
            connectionAlias: 'stripe',
            method: 'POST',
            path: '/v1/charges',
            query: { limit: '10' },
            body: { amount: 500 },
        });
        // No app-supplied headers leak through — only Content-Type (+ embed JWT when present).
        expect(Object.keys(init.headers)).toEqual(['Content-Type']);
    });

    it('posts back the result on success', async () => {
        renderBridge(() => undefined);
        const { responses } = captureResponses();
        const result = {
            status: 200,
            contentType: 'application/json',
            body: 1,
            truncated: false,
        };
        mockFetchOk({ status: 'ok', results: result });

        postExternalFetch({ alias: 'weather', path: '/today' });

        await vi.waitFor(() =>
            expect(
                responses.find(
                    (r) =>
                        r['type'] === 'lightdash:sdk:external-fetch-response',
                ),
            ).toMatchObject({ id: POST_ID, result }),
        );
    });

    it('posts back an error when the EE call fails', async () => {
        renderBridge(() => undefined);
        const { responses } = captureResponses();
        mockFetchNonOk({
            status: 'error',
            error: { message: 'Connection alias not found' },
        });

        postExternalFetch({ alias: 'nope', path: '/x' });

        await vi.waitFor(() =>
            expect(
                responses.find(
                    (r) =>
                        r['type'] === 'lightdash:sdk:external-fetch-response',
                ),
            ).toMatchObject({
                id: POST_ID,
                error: 'Connection alias not found',
            }),
        );
    });

    it('does not consult the ALLOWED_ROUTES allowlist (the EE path is not in it)', async () => {
        renderBridge(() => undefined);
        const { responses } = captureResponses();
        mockFetchOk({
            status: 'ok',
            results: {
                status: 200,
                contentType: 'application/json',
                body: null,
                truncated: false,
            },
        });

        // A GET external-fetch — would be "Blocked" if it went through
        // isAllowedRoute. It must succeed instead.
        postExternalFetch({ alias: 'weather', method: 'GET', path: '/today' });

        await vi.waitFor(() =>
            expect(
                responses.find(
                    (r) =>
                        r['type'] === 'lightdash:sdk:external-fetch-response',
                )?.['result'],
            ).toBeDefined(),
        );
    });

    it('rejects external-fetch messages from a spoofed sender (wrong source AND wrong origin)', async () => {
        // Security invariant: the bridge guard checks BOTH event.source
        // (must match iframeRef.current.contentWindow) AND event.origin
        // (must match expectedPreviewOrigin or "null"). A message arriving
        // from a foreign window with a foreign origin — even with a
        // well-formed payload — must never trigger a fetch or post a
        // response.
        renderBridge(() => undefined);
        const { responses } = captureResponses();

        // Dispatch with source=null (not the iframe contentWindow) and a
        // foreign origin (not window.location.origin, not "null").
        const spoofedEvent = new MessageEvent('message', {
            data: {
                type: 'lightdash:sdk:external-fetch',
                id: POST_ID,
                alias: 'stripe',
                method: 'POST',
                path: '/v1/charges',
                body: { amount: 500 },
            },
            origin: 'https://evil.example.com',
            source: null,
        });
        window.dispatchEvent(spoofedEvent);

        // Give the (async) handler a chance to run — if it ran, it would
        // call fetch() and/or postMessage() before we reach this point.
        await vi.waitFor(() => expect(fetch).not.toHaveBeenCalled());
        expect(
            responses.find(
                (r) => r['type'] === 'lightdash:sdk:external-fetch-response',
            ),
        ).toBeUndefined();
    });
});
