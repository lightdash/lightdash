import type * as MantineHooks from '@mantine/hooks';
import { act, waitFor } from '@testing-library/react';
import { type ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../../../testing/testUtils';
import { type QueryEvent } from '../hooks/useAppSdkBridge';
import { type DeliveryCaptureAccumulator } from './deliveryCaptureAccumulator';

type IframePreviewProps = {
    src: string;
    onScreenshotAvailabilityChange?: (available: boolean) => void;
    onIframeLoad?: () => void;
    onQueryEvent?: (event: QueryEvent) => void;
    deliveryCapture?: DeliveryCaptureAccumulator;
    invalidateCache?: boolean;
    queryContextOverride?: string;
};

const mocks = vi.hoisted(() => ({
    iframePreview: vi.fn((_props: IframePreviewProps) => null),
    appQuery: {
        data: { pages: [{ latestReadyVersion: 3 }] } as
            | { pages: Array<{ latestReadyVersion: number | null }> }
            | undefined,
        isLoading: false,
        error: undefined as { error: { message: string } } | undefined,
    },
    token: {
        data: 'preview-token' as string | undefined,
        isLoading: false,
        error: undefined as { error: { message: string } } | undefined,
    },
}));

vi.mock('../AppIframePreview', () => ({ default: mocks.iframePreview }));

vi.mock('../hooks/useGetApp', () => ({
    useGetApp: () => mocks.appQuery,
}));

vi.mock('../hooks/useAppPreviewToken', () => ({
    useAppPreviewToken: () => mocks.token,
}));

vi.mock('../previewOrigin', () => ({
    usePreviewOrigin: () => 'https://preview.example.com',
}));

// Bypasses the 1.5s quiet debounce; the debounce itself isn't under test.
vi.mock('@mantine/hooks', async (importOriginal) => {
    const actual = await importOriginal<typeof MantineHooks>();
    return { ...actual, useDebouncedValue: (value: unknown) => [value] };
});

// eslint-disable-next-line import/first
import AppDeliveryPreviewCapture from './AppDeliveryPreviewCapture';

const latestIframeProps = (): IframePreviewProps => {
    const { calls } = mocks.iframePreview.mock;
    if (calls.length === 0) throw new Error('iframe preview never rendered');
    return calls[calls.length - 1][0];
};

const latestCapture = (): DeliveryCaptureAccumulator => {
    const capture = latestIframeProps().deliveryCapture;
    if (!capture) throw new Error('no accumulator passed to the iframe');
    return capture;
};

/** Load the iframe and announce the SDK — the baseline ready preconditions. */
const markSdkReady = () => {
    act(() => {
        latestIframeProps().onIframeLoad?.();
        latestIframeProps().onScreenshotAvailabilityChange?.(true);
    });
};

const flushMicrotasks = async () => {
    await act(async () => {
        await Promise.resolve();
    });
};

const CHART_PATH = '/api/v2/projects/project-uuid/query/chart';

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

const renderCapture = (
    overrides: Partial<ComponentProps<typeof AppDeliveryPreviewCapture>> = {},
) => {
    const onManifest = vi.fn();
    const onError = vi.fn();
    const result = renderWithProviders(
        <AppDeliveryPreviewCapture
            projectUuid="project-uuid"
            appUuid="app-uuid"
            appState={null}
            onManifest={onManifest}
            onError={onError}
            {...overrides}
        />,
    );
    return { onManifest, onError, ...result };
};

describe('AppDeliveryPreviewCapture', () => {
    beforeEach(() => {
        mocks.iframePreview.mockClear();
        mocks.appQuery.data = { pages: [{ latestReadyVersion: 3 }] };
        mocks.appQuery.isLoading = false;
        mocks.appQuery.error = undefined;
        mocks.token.data = 'preview-token';
        mocks.token.isLoading = false;
        mocks.token.error = undefined;
    });

    it('renders the preview without delivery stamps and seeds the app state into the URL', () => {
        renderCapture({ appState: { tab: 'over view' } });

        const props = latestIframeProps();
        expect(props.invalidateCache).toBeUndefined();
        expect(props.queryContextOverride).toBeUndefined();
        expect(props.deliveryCapture).toBeDefined();
        expect(props.src).toBe(
            `https://preview.example.com/api/apps/app-uuid/versions/3/t/preview-token/#transport=postMessage&projectUuid=project-uuid&state=${encodeURIComponent(
                JSON.stringify({ tab: 'over view' }),
            )}`,
        );
    });

    it('omits the state param when there is no app state', () => {
        renderCapture({ appState: null });

        expect(latestIframeProps().src).not.toContain('&state=');
    });

    it('emits the manifest once the app settles', async () => {
        const { onManifest, onError } = renderCapture();

        // One act: load (resets the accumulator), SDK announce, and the first
        // query initiation — in production the 1.5s quiet debounce spans the
        // gap between these, but the debounce is mocked synchronous here.
        act(() => {
            latestIframeProps().onIframeLoad?.();
            latestIframeProps().onScreenshotAvailabilityChange?.(true);
            latestCapture().onInitiation({
                requestId: 'req-1',
                method: 'POST',
                path: CHART_PATH,
                body: { chartUuid: 'chart-1' },
                label: 'Revenue',
            });
        });
        await flushMicrotasks();
        // A pending capture entry withholds the manifest.
        expect(onManifest).not.toHaveBeenCalled();

        act(() => {
            latestCapture().onPostResponse('req-1', {
                queryUuid: 'query-1',
                metricQuery: { exploreName: 'orders', limit: 500 },
            });
            latestCapture().onTerminal('query-1', {
                status: 'ready',
                rowCount: 42,
            });
        });

        await waitFor(() => expect(onManifest).toHaveBeenCalledTimes(1));
        expect(onManifest.mock.calls[0][0]).toMatchObject({
            version: 1,
            overflowCount: 0,
            items: [
                {
                    status: 'ready',
                    label: 'Revenue',
                    queryUuid: 'query-1',
                    rowCount: 42,
                },
            ],
        });
        expect(onError).not.toHaveBeenCalled();
    });

    it('waits for in-flight QueryEvents before emitting', async () => {
        const { onManifest } = renderCapture();

        act(() => {
            latestIframeProps().onIframeLoad?.();
            latestIframeProps().onScreenshotAvailabilityChange?.(true);
            latestIframeProps().onQueryEvent?.(
                queryEvent({ id: 'evt-1', status: 'pending' }),
            );
        });
        await flushMicrotasks();
        expect(onManifest).not.toHaveBeenCalled();

        act(() => {
            latestIframeProps().onQueryEvent?.(
                queryEvent({ id: 'evt-1', status: 'ready' }),
            );
        });

        await waitFor(() => expect(onManifest).toHaveBeenCalledTimes(1));
    });

    it('emits an error once on timeout and never a late manifest', async () => {
        vi.useFakeTimers();
        try {
            const { onManifest, onError } = renderCapture();

            act(() => {
                vi.advanceTimersByTime(60_000);
            });

            expect(onError).toHaveBeenCalledTimes(1);
            expect(onError).toHaveBeenCalledWith(
                'The app took too long to run its queries',
            );

            // Settling after the timeout must not double-emit.
            markSdkReady();
            await act(async () => {
                await vi.runAllTimersAsync();
            });
            expect(onManifest).not.toHaveBeenCalled();
            expect(onError).toHaveBeenCalledTimes(1);
        } finally {
            vi.useRealTimers();
        }
    });

    it('emits an error when the app fails to load', () => {
        mocks.appQuery.error = { error: { message: 'nope' } };
        const { onManifest, onError } = renderCapture();

        expect(onError).toHaveBeenCalledWith('nope');
        expect(onManifest).not.toHaveBeenCalled();
    });

    it('emits an error when the app has no ready version', () => {
        mocks.appQuery.data = { pages: [{ latestReadyVersion: null }] };
        const { onError } = renderCapture();

        expect(onError).toHaveBeenCalledWith('This app has no ready version');
        expect(mocks.iframePreview).not.toHaveBeenCalled();
    });
});
