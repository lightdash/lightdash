import { DELIVERY_CAPTURE_GLOBAL } from '@lightdash/common';
import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DeliveryCaptureAccumulator } from '../features/apps/deliveryCapture/deliveryCaptureAccumulator';
import type { QueryEvent } from '../features/apps/hooks/useAppSdkBridge';
import { renderWithProviders } from '../testing/testUtils';

type IframePreviewProps = {
    onScreenshotAvailabilityChange?: (available: boolean) => void;
    onIframeLoad?: () => void;
    onQueryEvent?: (event: QueryEvent) => void;
    deliveryCapture?: DeliveryCaptureAccumulator;
};

const mocks = vi.hoisted(() => ({
    iframePreview: vi.fn((_props: IframePreviewProps) => null),
    searchParams: new URLSearchParams(),
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

// Unlike MinimalApp.captureMode.test.tsx, the real (timer-based) debounce is
// the subject here: the reload race only exists across the debounce windows.
// eslint-disable-next-line import/first
import MinimalApp from './MinimalApp';

const latestIframeProps = (): IframePreviewProps => {
    const { calls } = mocks.iframePreview.mock;
    return calls[calls.length - 1][0];
};

const latestCapture = (): DeliveryCaptureAccumulator => {
    const capture = latestIframeProps().deliveryCapture;
    if (!capture) throw new Error('no accumulator passed to the iframe');
    return capture;
};

const readGlobal = () =>
    (window as unknown as Record<string, unknown>)[DELIVERY_CAPTURE_GLOBAL];

const CHART_PATH = '/api/v2/projects/project-uuid/query/chart';

const advance = async (ms: number) => {
    await act(async () => {
        await vi.advanceTimersByTimeAsync(ms);
    });
};

describe('MinimalApp capture reload race (real debounce)', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        mocks.iframePreview.mockClear();
        mocks.searchParams = new URLSearchParams();
        delete (window as unknown as Record<string, unknown>)[
            DELIVERY_CAPTURE_GLOBAL
        ];
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // A same-identity reload re-fires the load event WITHOUT flipping SDK
    // availability. The load handler resets the accumulator; publish must
    // then wait a fresh quiet window for the reloaded app to process the
    // re-sent deliveryRender flag — not republish the empty manifest.
    it('does not republish the reset manifest right after a same-identity reload', async () => {
        mocks.searchParams.set('captureMode', 'delivery');
        renderWithProviders(<MinimalApp />);

        act(() => {
            latestIframeProps().onIframeLoad?.();
            latestIframeProps().onScreenshotAvailabilityChange?.(true);
        });
        // The two debounces chain through a React commit, and the second
        // timer is only scheduled once act() flushes the first update — so
        // each window needs its own advance.
        await advance(1600); // load-epoch settles
        await advance(1700); // ready debounce elapses, manifest publishes
        expect(readGlobal()).toBeDefined();

        // Same-identity reload: load fires again, availability never flips.
        act(() => {
            latestIframeProps().onIframeLoad?.();
        });
        expect(readGlobal()).toBeUndefined();

        // The regression window: pre-fix the stale debounced ready republished
        // the just-reset (empty) manifest here.
        await advance(200);
        expect(readGlobal()).toBeUndefined();

        // The reloaded app reacts to the re-sent flag inside the quiet window.
        act(() => {
            latestCapture().onInitiation({
                requestId: 'chart-req',
                method: 'POST',
                path: CHART_PATH,
                body: { chartUuid: 'chart-1' },
                label: 'Revenue',
            });
        });
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

        await advance(1600);
        await advance(1700);
        const manifest = readGlobal() as { items: unknown[] } | undefined;
        expect(manifest).toBeDefined();
        expect(manifest?.items).toHaveLength(1);
    });
});
