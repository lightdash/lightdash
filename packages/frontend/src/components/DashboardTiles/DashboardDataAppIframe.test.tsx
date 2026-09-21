import { act, cleanup, render } from '@testing-library/react';
import { type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AppIframePreview from '../../features/apps/AppIframePreview';
import {
    type QueryEvent,
    type ExternalRequestEvent,
} from '../../features/apps/hooks/useAppSdkBridge';
import { type DashboardTileStatusContextType } from '../../providers/Dashboard/tileStatusTypes';
import DashboardDataAppIframe from './DashboardDataAppIframe';

vi.mock('../../features/apps/AppIframePreview', () => ({
    default: vi.fn(() => null),
}));
const status = vi.hoisted(() => ({
    markTileScreenshotReady: vi.fn(),
    markTileScreenshotLoading: vi.fn(),
}));
vi.mock('../../providers/Dashboard/useDashboardTileStatusContext', () => ({
    default: (
        selector: (context: Partial<DashboardTileStatusContextType>) => unknown,
    ) => selector(status),
}));

const props: ComponentProps<typeof DashboardDataAppIframe> = {
    tileUuid: 'tile',
    src: 'https://preview.example/app?v=1',
    previewToken: 'token',
    expectedPreviewOrigin: 'https://preview.example',
    projectUuid: 'project',
    appUuid: 'app',
    identityKey: 'app:1',
};

const mockAppIframePreview = vi.mocked(AppIframePreview);

const iframe = () => {
    const call = mockAppIframePreview.mock.calls.at(-1);
    if (!call) {
        throw new Error('Iframe was not rendered');
    }
    return call[0];
};
const capture = () => {
    const accumulator = iframe().deliveryCapture;
    if (!accumulator) {
        throw new Error('Query tracking was not enabled');
    }
    return accumulator;
};
const advance = (milliseconds: number) => {
    act(() => {
        vi.advanceTimersByTime(milliseconds);
    });
};
const load = () => act(() => iframe().onIframeLoad?.());
const sdkReady = () =>
    act(() => iframe().onScreenshotAvailabilityChange?.(true));
const query = (id: string, queryStatus: QueryEvent['status']): QueryEvent => ({
    id,
    timestamp: 0,
    label: null,
    exploreName: 'orders',
    dimensions: [],
    metrics: [],
    filters: {},
    sorts: [],
    tableCalculations: [],
    additionalMetrics: [],
    limit: 100,
    queryUuid: id,
    status: queryStatus,
    rowCount: null,
    durationMs: null,
    error: queryStatus === 'error' ? 'Query failed' : null,
    rawMetricQuery: null,
});
const emitQuery = (id: string, queryStatus: QueryEvent['status']) =>
    act(() => iframe().onQueryEvent?.(query(id, queryStatus)));
const emitExternal = (requestStatus: ExternalRequestEvent['status']) =>
    act(() =>
        iframe().onExternalRequestEvent?.({
            id: 'external',
            timestamp: 0,
            alias: 'crm',
            method: 'GET',
            path: '/contacts',
            query: null,
            requestBody: null,
            status: requestStatus,
            httpStatus: null,
            contentType: null,
            responseBody: null,
            truncated: null,
            durationMs: null,
            error: requestStatus === 'error' ? 'Request failed' : null,
        }),
    );

beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
});
afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

describe('data app dashboard screenshot readiness', () => {
    it('requires iframe load, SDK availability, and a full quiet window', () => {
        render(<DashboardDataAppIframe {...props} />);
        sdkReady();
        advance(2_000);
        expect(status.markTileScreenshotReady).not.toHaveBeenCalled();
        load();
        advance(1_499);
        expect(status.markTileScreenshotReady).not.toHaveBeenCalled();
        advance(1);
        expect(status.markTileScreenshotReady).toHaveBeenCalledWith('tile');
    });

    it.each(['metric-query', 'chart'])(
        'waits for %s initiation and warehouse completion',
        (route) => {
            render(<DashboardDataAppIframe {...props} />);
            load();
            sdkReady();
            act(() =>
                capture().onInitiation({
                    requestId: 'post',
                    method: 'POST',
                    path: `/api/v2/projects/project/query/${route}`,
                    body:
                        route === 'chart'
                            ? { chartUuid: 'chart' }
                            : { query: { exploreName: 'orders' } },
                    label: null,
                }),
            );
            advance(10_000);
            expect(status.markTileScreenshotReady).not.toHaveBeenCalled();
            act(() =>
                capture().onPostResponse('post', {
                    queryUuid: 'warehouse-query',
                }),
            );
            advance(2_000);
            expect(status.markTileScreenshotReady).not.toHaveBeenCalled();
            act(() =>
                capture().onTerminal('warehouse-query', {
                    status: 'ready',
                    rowCount: 2,
                }),
            );
            advance(1_500);
            expect(status.markTileScreenshotReady).toHaveBeenCalledWith('tile');
        },
    );

    it('waits for every query and restarts the quiet window for another request', () => {
        render(<DashboardDataAppIframe {...props} />);
        load();
        sdkReady();
        emitQuery('first', 'pending');
        emitQuery('second', 'running');
        emitQuery('first', 'ready');
        advance(2_000);
        expect(status.markTileScreenshotReady).not.toHaveBeenCalled();
        emitQuery('second', 'ready');
        advance(1_000);
        emitQuery('third', 'pending');
        advance(1_000);
        expect(status.markTileScreenshotReady).not.toHaveBeenCalled();
        emitQuery('third', 'ready');
        advance(1_500);
        expect(status.markTileScreenshotReady).toHaveBeenCalledWith('tile');
    });

    it('settles query and external request errors after rendering their states', () => {
        render(<DashboardDataAppIframe {...props} />);
        load();
        sdkReady();
        emitQuery('failed', 'pending');
        emitExternal('pending');
        emitQuery('failed', 'error');
        advance(2_000);
        expect(status.markTileScreenshotReady).not.toHaveBeenCalled();
        emitExternal('error');
        advance(1_500);
        expect(status.markTileScreenshotReady).toHaveBeenCalledWith('tile');
    });

    it('settles failed linked-chart initiation', () => {
        render(<DashboardDataAppIframe {...props} />);
        load();
        sdkReady();
        act(() =>
            capture().onInitiation({
                requestId: 'post',
                method: 'POST',
                path: '/api/v2/projects/project/query/chart',
                body: { chartUuid: 'chart' },
                label: null,
            }),
        );
        advance(2_000);
        expect(status.markTileScreenshotReady).not.toHaveBeenCalled();
        act(() => capture().onPostFailure('post', 'Access denied'));
        advance(1_500);
        expect(status.markTileScreenshotReady).toHaveBeenCalledWith('tile');
    });

    it('supports legacy SDKs without overriding a pending query', () => {
        render(<DashboardDataAppIframe {...props} />);
        load();
        emitQuery('legacy', 'pending');
        advance(8_000);
        advance(2_000);
        expect(status.markTileScreenshotReady).not.toHaveBeenCalled();
        emitQuery('legacy', 'ready');
        advance(1_500);
        expect(status.markTileScreenshotReady).toHaveBeenCalledWith('tile');
    });

    it('clears readiness on iframe reload and waits for the new quiet window', () => {
        render(<DashboardDataAppIframe {...props} />);
        load();
        sdkReady();
        advance(1_500);
        status.markTileScreenshotReady.mockClear();
        status.markTileScreenshotLoading.mockClear();
        load();
        expect(status.markTileScreenshotLoading).toHaveBeenCalledWith('tile');
        advance(1_499);
        expect(status.markTileScreenshotReady).not.toHaveBeenCalled();
        advance(1);
        expect(status.markTileScreenshotReady).toHaveBeenCalledWith('tile');
    });

    it('starts fresh when a different preview URL remounts the iframe wrapper', () => {
        const { rerender } = render(
            <DashboardDataAppIframe key={props.src} {...props} />,
        );
        load();
        sdkReady();
        emitQuery('old-query', 'pending');
        const nextSrc = `${props.src}&refresh=1`;
        rerender(
            <DashboardDataAppIframe {...props} key={nextSrc} src={nextSrc} />,
        );
        advance(2_000);
        expect(status.markTileScreenshotReady).not.toHaveBeenCalled();
        load();
        sdkReady();
        advance(1_500);
        expect(status.markTileScreenshotReady).toHaveBeenCalledWith('tile');
    });

    it('retains requests that begin before the initial iframe load', () => {
        render(<DashboardDataAppIframe {...props} />);
        sdkReady();
        emitQuery('early-metric', 'pending');
        act(() =>
            capture().onInitiation({
                requestId: 'early-chart',
                method: 'POST',
                path: '/api/v2/projects/project/query/chart',
                body: { chartUuid: 'chart' },
                label: null,
            }),
        );

        load();
        advance(2_000);
        expect(status.markTileScreenshotReady).not.toHaveBeenCalled();
        emitQuery('early-metric', 'ready');
        advance(2_000);
        expect(status.markTileScreenshotReady).not.toHaveBeenCalled();
        act(() => {
            capture().onPostResponse('early-chart', {
                queryUuid: 'chart-query',
            });
            capture().onTerminal('chart-query', {
                status: 'ready',
                rowCount: 1,
            });
        });
        advance(1_500);
        expect(status.markTileScreenshotReady).toHaveBeenCalledWith('tile');
    });
});
