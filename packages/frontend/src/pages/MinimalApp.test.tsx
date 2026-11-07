import { APP_PDF_EXPORT_GLOBAL } from '@lightdash/common';
import { act, screen } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import {
    afterEach,
    beforeEach,
    describe,
    expect,
    it,
    vi,
    type Mock,
} from 'vitest';
import type AppIframePreviewActual from '../features/apps/AppIframePreview';
import { renderWithProviders } from '../testing/testUtils';
import MinimalApp from './MinimalApp';

// Captures the live props MinimalApp passes to the iframe preview so the test
// can drive bridge callbacks and the delivery-capture accumulator directly.
type PreviewProps = React.ComponentProps<typeof AppIframePreviewActual>;
const previewPropsHolder: { current: PreviewProps | null } = { current: null };
const exportPdfMock: Mock = vi.fn();

vi.mock(
    '../features/apps/AppIframePreview',
    () =>
        ({
            __esModule: true,
            default: forwardRef<unknown, any>((props, ref) => {
                previewPropsHolder.current = props as PreviewProps;
                useImperativeHandle(ref, () => ({
                    captureScreenshot: vi.fn(),
                    exportPdf: exportPdfMock,
                }));
                return <div data-testid="iframe-stub" />;
            }),
        }) as unknown as {
            __esModule: true;
            default: typeof AppIframePreviewActual;
        },
);
vi.mock('../features/apps/hooks/useGetApp', () => ({
    useGetApp: () => ({
        data: { pages: [{ latestReadyVersion: 1 }] },
        isLoading: false,
        error: null,
    }),
}));
vi.mock('../features/apps/hooks/useAppVersion', () => ({
    useAppVersion: () => ({ data: undefined, isLoading: false, error: null }),
}));
vi.mock('../features/apps/hooks/useAppPreviewToken', () => ({
    useAppPreviewToken: () => ({
        data: 'preview-token',
        isLoading: false,
        error: null,
    }),
}));
vi.mock('../features/apps/previewOrigin', () => ({
    usePreviewOrigin: () => 'http://preview.local',
}));
vi.mock('../hooks/useProjectUuid', () => ({
    useProjectUuid: () => 'c0ffee00-0000-4000-8000-000000000001',
}));
vi.mock('../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({
        isLoading: false,
        data: { enabled: true },
    }),
}));

const QUIET_WINDOW_MS = 1_500;

const renderMinimalAppPdf = () =>
    renderWithProviders(
        <MemoryRouter
            initialEntries={['/minimal/projects/p1/apps/a1?exportMode=pdf']}
        >
            <Routes>
                <Route
                    path="/minimal/projects/:projectUuid/apps/:appUuid"
                    element={<MinimalApp />}
                />
            </Routes>
        </MemoryRouter>,
    );

describe('MinimalApp exportMode=pdf readiness', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        exportPdfMock.mockReset();
        // jsdom's Blob has no arrayBuffer; a minimal Blob-like is enough for
        // blobToBase64 and the size cap.
        const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);
        exportPdfMock.mockResolvedValue({
            size: bytes.length,
            type: 'application/pdf',
            arrayBuffer: async () => bytes.buffer,
        } as unknown as Blob);
        previewPropsHolder.current = null;
        delete (window as unknown as Record<string, unknown>)[
            APP_PDF_EXPORT_GLOBAL
        ];
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    // Reviewer-specified regression: a saved-chart POST held open beyond the
    // quiet window must hold the PDF build; it runs exactly once after the
    // query settles and the window elapses again.
    it('holds the PDF build while a saved-chart request is pending', async () => {
        renderMinimalAppPdf();
        const props = previewPropsHolder.current!;
        expect(props).toBeTruthy();

        // App boots: iframe load + capability announces, and a saved-chart
        // POST goes out immediately (tracked by the accumulator before any
        // QueryEvent exists for it).
        act(() => {
            props.onIframeLoad!();
            props.onScreenshotAvailabilityChange!(true);
            props.onPdfExportAvailabilityChange!(true);
            props.deliveryCapture!.onInitiation({
                requestId: 'r1',
                method: 'POST',
                path: '/api/v1/saved/chart-uuid/chart-and-results',
                body: {},
                label: 'Orders chart',
            });
        });

        // Well past both debounce windows (load-epoch settle + quiet window),
        // in separate act blocks so each debounce gets its render: only the
        // pending request may hold the build.
        for (let i = 0; i < 4; i += 1) {
            await act(async () => {
                await vi.advanceTimersByTimeAsync(QUIET_WINDOW_MS + 100);
            });
        }
        expect(exportPdfMock).not.toHaveBeenCalled();
        expect(screen.queryByTestId('screenshot-ready')).toBeNull();

        // The query settles; after a fresh quiet window the build runs once.
        act(() => {
            props.deliveryCapture!.onPostResponse('r1', {
                queryUuid: 'q1',
            });
            props.deliveryCapture!.onTerminal('q1', {
                status: 'ready',
                rowCount: 10,
            });
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(QUIET_WINDOW_MS + 100);
        });
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
        });
        expect(exportPdfMock).toHaveBeenCalledTimes(1);

        const result = (window as unknown as Record<string, unknown>)[
            APP_PDF_EXPORT_GLOBAL
        ] as { status: string };
        expect(result?.status).toBe('success');

        // Settled state stays settled: no duplicate builds on later ticks.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(QUIET_WINDOW_MS * 3);
        });
        expect(exportPdfMock).toHaveBeenCalledTimes(1);
    });

    it('publishes a typed error when the app never announces a PDF export', async () => {
        renderMinimalAppPdf();
        const props = previewPropsHolder.current!;

        act(() => {
            props.onIframeLoad!();
            props.onScreenshotAvailabilityChange!(true);
        });
        // The two debounces are sequential and each needs its own act block:
        // the second timer is only scheduled after the first one's state
        // update has rendered.
        await act(async () => {
            await vi.advanceTimersByTimeAsync(QUIET_WINDOW_MS + 100);
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(QUIET_WINDOW_MS + 100);
        });

        expect(exportPdfMock).not.toHaveBeenCalled();
        const result = (window as unknown as Record<string, unknown>)[
            APP_PDF_EXPORT_GLOBAL
        ] as { status: string; error?: string };
        expect(result?.status).toBe('error');
        expect(result?.error).toMatch(/no PDF export/);
    });
});
