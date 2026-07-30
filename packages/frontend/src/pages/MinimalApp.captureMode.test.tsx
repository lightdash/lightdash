import {
    DELIVERY_CAPTURE_GLOBAL,
    QueryExecutionContext,
    SCREENSHOT_READY_INDICATOR_ID,
} from '@lightdash/common';
import type * as MantineHooks from '@mantine-8/hooks';
import { act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DeliveryCaptureAccumulatorModule from '../features/apps/deliveryCapture/deliveryCaptureAccumulator';
import type { DeliveryCaptureAccumulator } from '../features/apps/deliveryCapture/deliveryCaptureAccumulator';
import type { QueryEvent } from '../features/apps/hooks/useAppSdkBridge';
import { renderWithProviders } from '../testing/testUtils';

type IframePreviewProps = {
    onScreenshotAvailabilityChange?: (available: boolean) => void;
    onIframeLoad?: () => void;
    onQueryEvent?: (event: QueryEvent) => void;
    deliveryCapture?: DeliveryCaptureAccumulator;
    invalidateCache?: boolean;
    queryContextOverride?: string;
};

const mocks = vi.hoisted(() => ({
    iframePreview: vi.fn((_props: IframePreviewProps) => null),
    searchParams: new URLSearchParams(),
    manifestError: null as Error | null,
}));

vi.mock('react-router', () => ({
    Navigate: () => null,
    useParams: () => ({ projectUuid: 'project-uuid', appUuid: 'app-uuid' }),
    useSearchParams: () => [mocks.searchParams, vi.fn()],
}));

vi.mock('../features/apps/AppIframePreview', () => ({
    default: mocks.iframePreview,
}));

vi.mock('../features/apps/hooks/useAppPreviewToken', () => ({
    useAppPreviewToken: () => ({
        data: 'preview-token',
        isLoading: false,
        error: undefined,
    }),
}));

vi.mock('../features/apps/hooks/useGetApp', () => ({
    useGetApp: () => ({
        data: { pages: [{ latestReadyVersion: 1 }] },
        isLoading: false,
        error: undefined,
    }),
}));

vi.mock('../features/apps/previewOrigin', () => ({
    usePreviewOrigin: () => 'https://preview.example.com',
}));

vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        isLoading: false,
        data: { enabled: true },
    }),
}));

// Real accumulator, with an opt-in rejecting getManifest for the failure path.
vi.mock(
    '../features/apps/deliveryCapture/deliveryCaptureAccumulator',
    async (importOriginal) => {
        const actual =
            await importOriginal<typeof DeliveryCaptureAccumulatorModule>();
        return {
            ...actual,
            createDeliveryCaptureAccumulator: () => {
                const accumulator = actual.createDeliveryCaptureAccumulator();
                return {
                    ...accumulator,
                    getManifest: () =>
                        mocks.manifestError
                            ? Promise.reject(mocks.manifestError)
                            : accumulator.getManifest(),
                };
            },
        };
    },
);

// Bypasses the 1.5s app-quiet debounce so `isReady` tracks the underlying
// signal synchronously — the debounce itself isn't what these tests cover.
vi.mock('@mantine-8/hooks', async (importOriginal) => {
    const actual = await importOriginal<typeof MantineHooks>();
    return { ...actual, useDebouncedValue: (value: unknown) => [value] };
});

// eslint-disable-next-line import/first
import MinimalApp from './MinimalApp';

const latestIframeProps = (): IframePreviewProps => {
    const { calls } = mocks.iframePreview.mock;
    return calls[calls.length - 1][0];
};

/** Simulates the SDK announcing screenshot-availability with zero in-flight
 *  queries — the underlying signal `isReady` is debounced from (mocked
 *  above to be synchronous). */
const markSdkReady = () => {
    act(() => {
        latestIframeProps().onScreenshotAvailabilityChange?.(true);
    });
};

const readyIndicatorSelector = `#${SCREENSHOT_READY_INDICATOR_ID}`;

const readGlobal = () =>
    (window as unknown as Record<string, unknown>)[DELIVERY_CAPTURE_GLOBAL];

const CHART_PATH = '/api/v2/projects/project-uuid/query/chart';
const METRIC_PATH = '/api/v2/projects/project-uuid/query/metric-query';

const latestCapture = (): DeliveryCaptureAccumulator => {
    const capture = latestIframeProps().deliveryCapture;
    if (!capture) throw new Error('no accumulator passed to the iframe');
    return capture;
};

const queryEvent = (
    overrides: Partial<QueryEvent> & Pick<QueryEvent, 'id' | 'status'>,
): QueryEvent => ({
    timestamp: Date.now(),
    label: null,
    exploreName: 'orders',
    dimensions: [],
    metrics: [],
    filters: {},
    sorts: [],
    tableCalculations: [],
    additionalMetrics: [],
    limit: 500,
    queryUuid: null,
    rowCount: null,
    durationMs: null,
    error: null,
    rawMetricQuery: null,
    ...overrides,
});

/** Lets any queued publish microtask run before asserting it did NOT happen. */
const flushMicrotasks = async () => {
    await act(async () => {
        await Promise.resolve();
    });
};

describe('MinimalApp capture modes', () => {
    beforeEach(() => {
        mocks.iframePreview.mockClear();
        mocks.searchParams = new URLSearchParams();
        mocks.manifestError = null;
        delete (window as unknown as Record<string, unknown>)[
            DELIVERY_CAPTURE_GLOBAL
        ];
    });

    it('stamps invalidateCache + scheduledDelivery context in delivery mode', () => {
        mocks.searchParams.set('captureMode', 'delivery');
        renderWithProviders(<MinimalApp />);

        expect(latestIframeProps()).toEqual(
            expect.objectContaining({
                invalidateCache: true,
                queryContextOverride: QueryExecutionContext.SCHEDULED_DELIVERY,
                deliveryCapture: expect.anything(),
            }),
        );
    });

    it('passes the accumulator without stamps in preview mode', () => {
        mocks.searchParams.set('captureMode', 'preview');
        renderWithProviders(<MinimalApp />);

        expect(latestIframeProps()).toEqual(
            expect.objectContaining({
                invalidateCache: undefined,
                queryContextOverride: undefined,
                deliveryCapture: expect.anything(),
            }),
        );
    });

    it('never publishes the manifest global outside capture modes', async () => {
        renderWithProviders(<MinimalApp />);

        markSdkReady();

        // Give any (unexpected) publish microtask a chance to run.
        await act(async () => {
            await Promise.resolve();
        });

        expect(readGlobal()).toBeUndefined();
    });

    it('mounts the indicator once ready when no capture mode is set', () => {
        const { container } = renderWithProviders(<MinimalApp />);

        expect(container.querySelector(readyIndicatorSelector)).toBeNull();

        markSdkReady();

        expect(container.querySelector(readyIndicatorSelector)).not.toBeNull();
    });

    it('mounts the indicator only after the manifest global is published', async () => {
        mocks.searchParams.set('captureMode', 'preview');
        const { container } = renderWithProviders(<MinimalApp />);

        markSdkReady();
        // The publish resolves a microtask later, so right after the ready
        // signal flips the indicator must not be mounted yet.
        expect(container.querySelector(readyIndicatorSelector)).toBeNull();
        expect(readGlobal()).toBeUndefined();

        await waitFor(() => {
            expect(readGlobal()).toBeDefined();
        });

        expect(container.querySelector(readyIndicatorSelector)).not.toBeNull();
    });

    it('logs a console error when the manifest publish rejects', async () => {
        // UnfurlService forwards console errors, so a rejection has to leave a
        // diagnosable line rather than silently burning the render timeout.
        mocks.manifestError = new Error('manifest boom');
        mocks.searchParams.set('captureMode', 'preview');
        const consoleError = vi
            .spyOn(console, 'error')
            .mockImplementation(() => {});
        const { container } = renderWithProviders(<MinimalApp />);

        markSdkReady();

        await waitFor(() => {
            expect(consoleError).toHaveBeenCalledWith(
                '[delivery-capture] manifest publish failed',
                mocks.manifestError,
            );
        });
        expect(readGlobal()).toBeUndefined();
        expect(container.querySelector(readyIndicatorSelector)).toBeNull();

        consoleError.mockRestore();
    });

    // A /query/chart POST emits no `pending` QueryEvent — the accumulator
    // entry is the only in-flight signal until the POST resolves, so readiness
    // has to consume it or an app of only saved charts publishes a manifest
    // full of "did not settle" errors.
    it('withholds the manifest while a chart-query POST is pending in the accumulator', async () => {
        mocks.searchParams.set('captureMode', 'delivery');
        const { container } = renderWithProviders(<MinimalApp />);

        act(() => {
            latestCapture().onInitiation({
                requestId: 'chart-req',
                method: 'POST',
                path: CHART_PATH,
                body: { chartUuid: 'chart-1' },
                label: 'Revenue',
            });
        });
        markSdkReady();
        await flushMicrotasks();

        expect(readGlobal()).toBeUndefined();
        expect(container.querySelector(readyIndicatorSelector)).toBeNull();

        act(() => {
            latestCapture().onPostResponse('chart-req', {
                queryUuid: 'chart-uuid',
                metricQuery: { exploreName: 'orders', limit: 500 },
            });
            latestCapture().onTerminal('chart-uuid', {
                status: 'ready',
                rowCount: 12,
            });
        });

        await waitFor(() => {
            expect(readGlobal()).toBeDefined();
        });
        expect(readGlobal()).toMatchObject({
            items: [
                {
                    status: 'ready',
                    label: 'Revenue',
                    queryUuid: 'chart-uuid',
                    rowCount: 12,
                },
            ],
        });
        expect(container.querySelector(readyIndicatorSelector)).not.toBeNull();
    });

    // Unchanged behaviour: the QueryEvent in-flight set still gates on its own,
    // so a settled accumulator entry can't publish ahead of a live metric query.
    it('still gates on the QueryEvent in-flight set for metric queries', async () => {
        mocks.searchParams.set('captureMode', 'delivery');
        const { container } = renderWithProviders(<MinimalApp />);

        act(() => {
            latestCapture().onInitiation({
                requestId: 'metric-req',
                method: 'POST',
                path: METRIC_PATH,
                body: { query: { exploreName: 'orders', limit: 500 } },
                label: null,
            });
            latestIframeProps().onQueryEvent?.(
                queryEvent({ id: 'metric-req', status: 'pending' }),
            );
        });
        markSdkReady();
        await flushMicrotasks();

        expect(readGlobal()).toBeUndefined();

        act(() => {
            latestCapture().onPostResponse('metric-req', {
                queryUuid: 'metric-uuid',
            });
            latestCapture().onTerminal('metric-uuid', {
                status: 'ready',
                rowCount: 3,
            });
        });
        await flushMicrotasks();

        expect(readGlobal()).toBeUndefined();
        expect(container.querySelector(readyIndicatorSelector)).toBeNull();

        act(() => {
            latestIframeProps().onQueryEvent?.(
                queryEvent({
                    id: 'metric-req',
                    status: 'ready',
                    queryUuid: 'metric-uuid',
                    rowCount: 3,
                }),
            );
        });

        await waitFor(() => {
            expect(readGlobal()).toBeDefined();
        });
        expect(container.querySelector(readyIndicatorSelector)).not.toBeNull();
    });

    it('clears the stale manifest and republishes after an iframe reload', async () => {
        mocks.searchParams.set('captureMode', 'preview');
        const { container } = renderWithProviders(<MinimalApp />);

        markSdkReady();
        await waitFor(() => {
            expect(readGlobal()).toBeDefined();
        });
        expect(container.querySelector(readyIndicatorSelector)).not.toBeNull();
        const firstManifest = readGlobal();

        // Simulate a mid-render republish: the iframe reloads a new app
        // version, which resets SDK availability before it re-announces.
        act(() => {
            latestIframeProps().onIframeLoad?.();
            latestIframeProps().onScreenshotAvailabilityChange?.(false);
        });

        expect(readGlobal()).toBeUndefined();
        expect(container.querySelector(readyIndicatorSelector)).toBeNull();

        markSdkReady();
        await waitFor(() => {
            expect(readGlobal()).toBeDefined();
        });
        expect(readGlobal()).not.toBe(firstManifest);
        expect(container.querySelector(readyIndicatorSelector)).not.toBeNull();
    });
});
