import {
    DELIVERY_CAPTURE_GLOBAL,
    QueryExecutionContext,
    SCREENSHOT_READY_INDICATOR_ID,
} from '@lightdash/common';
import type * as MantineHooks from '@mantine-8/hooks';
import { act, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../testing/testUtils';

type IframePreviewProps = {
    onScreenshotAvailabilityChange?: (available: boolean) => void;
    deliveryCapture?: unknown;
    invalidateCache?: boolean;
    queryContextOverride?: string;
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

describe('MinimalApp capture modes', () => {
    beforeEach(() => {
        mocks.iframePreview.mockClear();
        mocks.searchParams = new URLSearchParams();
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

        expect(
            (window as unknown as Record<string, unknown>)[
                DELIVERY_CAPTURE_GLOBAL
            ],
        ).toBeUndefined();
    });

    it('mounts the indicator only after the manifest global is published', async () => {
        mocks.searchParams.set('captureMode', 'preview');
        const { container } = renderWithProviders(<MinimalApp />);

        markSdkReady();
        // The publish is async (getManifest awaits pending hashing) — right
        // after the ready signal flips, the indicator must not be mounted yet.
        expect(container.querySelector(readyIndicatorSelector)).toBeNull();
        expect(
            (window as unknown as Record<string, unknown>)[
                DELIVERY_CAPTURE_GLOBAL
            ],
        ).toBeUndefined();

        await waitFor(() => {
            expect(
                (window as unknown as Record<string, unknown>)[
                    DELIVERY_CAPTURE_GLOBAL
                ],
            ).toBeDefined();
        });

        expect(container.querySelector(readyIndicatorSelector)).not.toBeNull();
    });
});
