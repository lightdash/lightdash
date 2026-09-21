import {
    type DataAppViz,
    type DataAppVizRenderMetadata,
} from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode, type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../api';
import MantineProvider from '../../../providers/MantineProvider';
import ChartTypeGalleryCard from './ChartTypeGalleryCard';
import { useChartTypeGalleryPreviewScheduler } from './useChartTypeGalleryPreviewScheduler';

vi.mock('../../../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../../../hooks/appearance/useResolvedColorPalette', () => ({
    useResolvedColorPalette: () => [],
}));
vi.mock('../../../hooks/useResizeObserver', () => ({
    useResizeObserver: () => [vi.fn(), { width: 800, height: 400 }],
}));
vi.mock('../../../hooks/useServerOrClientFeatureFlag', () => ({
    useServerFeatureFlag: () => ({ data: { enabled: false } }),
}));
vi.mock('../../apps/hooks/useCanCreateDataApp', () => ({
    useCanCreateDataApp: () => false,
}));
vi.mock('../../apps/hooks/useCanEditDataApp', () => ({
    useCanEditDataApp: () => false,
}));
vi.mock('../../apps/previewOrigin', () => ({
    usePreviewOrigin: () => 'http://preview.test',
}));
vi.mock('../../apps/hooks/useAppSdkBridge', () => ({
    useAppSdkBridge: () => ({
        handleIframeLoad: vi.fn(),
        enableInspector: vi.fn(),
        disableInspector: vi.fn(),
        enableLineage: vi.fn(),
        disableLineage: vi.fn(),
        highlightLineage: vi.fn(),
    }),
}));
vi.mock('../../apps/hooks/useIframeScreenshot', () => ({
    useIframeScreenshot: () => ({ captureScreenshot: vi.fn() }),
}));

type ObserverCallback = (entries: IntersectionObserverEntry[]) => void;

class ImmediatelyIntersectingObserver {
    constructor(private readonly callback: ObserverCallback) {}

    observe = (target: Element) => {
        this.callback([
            { isIntersecting: true, target } as IntersectionObserverEntry,
        ]);
    };

    unobserve = vi.fn();
    disconnect = vi.fn();
}

const dataAppViz: DataAppViz = {
    dataAppVizUuid: 'viz-1',
    slug: 'radial-gauge',
    name: 'Radial gauge',
    description: 'A gauge for KPI progress',
    projectUuid: 'project-1',
    spaceUuid: null,
    schema: null,
    createdAt: new Date('2026-06-30'),
    createdByUserUuid: 'user-1',
    icon: null,
    registrySlug: null,
};

const readyMetadata: DataAppVizRenderMetadata = {
    state: 'ready',
    version: 1,
    schema: { fields: [], configOptions: [], colorPalette: null },
    latestBuildInProgress: false,
};

const deferred = <T,>() => {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolvePromise) => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
};

const GalleryPreview = () => {
    const scheduler = useChartTypeGalleryPreviewScheduler({
        maxConcurrent: 1,
        timeoutMs: 5_000,
    });

    return (
        <ChartTypeGalleryCard
            dataAppViz={dataAppViz}
            hasRegistryUpdate={false}
            onClick={vi.fn()}
            onPreview={vi.fn()}
            onDelete={vi.fn()}
            previewRef={scheduler.register(dataAppViz.dataAppVizUuid)}
            previewMounted={scheduler.isMounted(dataAppViz.dataAppVizUuid)}
            previewUnavailable={
                scheduler.status(dataAppViz.dataAppVizUuid) === 'unavailable'
            }
            onPreviewLoad={() => scheduler.complete(dataAppViz.dataAppVizUuid)}
            onPreviewUnavailable={() =>
                scheduler.fail(dataAppViz.dataAppVizUuid)
            }
            onRetryPreview={() => scheduler.retry(dataAppViz.dataAppVizUuid)}
        />
    );
};

const createWrapper = (queryClient: QueryClient) =>
    function Wrapper({ children }: PropsWithChildren) {
        return (
            <QueryClientProvider client={queryClient}>
                <MantineProvider env="test">
                    <StrictMode>{children}</StrictMode>
                </MantineProvider>
            </QueryClientProvider>
        );
    };

describe('ChartTypeGalleryCard preview retry', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubGlobal('IntersectionObserver', ImmediatelyIntersectingObserver);
    });

    it.each(['unavailable', 'failed'] as const)(
        'fetches fresh metadata and a token after a %s preview recovers',
        async (initialState) => {
            const metadataRecovery = deferred<DataAppVizRenderMetadata>();
            const tokenRecovery = deferred<{ token: string }>();
            const metadataSignals: AbortSignal[] = [];
            const tokenSignals: AbortSignal[] = [];
            let metadataResponse: 'initial' | 'recovering' = 'initial';

            vi.mocked(lightdashApi).mockImplementation(({ url, signal }) => {
                if (url.endsWith('/render-metadata')) {
                    metadataSignals.push(signal!);
                    return metadataResponse === 'initial'
                        ? Promise.resolve({
                              state: initialState,
                              latestBuildInProgress: false,
                          })
                        : metadataRecovery.promise;
                }
                if (url.endsWith('/preview-token')) {
                    tokenSignals.push(signal!);
                    return tokenRecovery.promise;
                }
                throw new Error(`Unexpected request: ${url}`);
            });

            const queryClient = new QueryClient({
                defaultOptions: {
                    queries: { retry: false, staleTime: 30_000 },
                },
            });
            render(<GalleryPreview />, {
                wrapper: createWrapper(queryClient),
            });

            const retryButton = await screen.findByRole('button', {
                name: 'Retry preview',
            });
            const initialMetadataRequests = metadataSignals.length;
            metadataResponse = 'recovering';
            await userEvent.click(retryButton);

            await waitFor(() =>
                expect(metadataSignals).toHaveLength(
                    initialMetadataRequests + 1,
                ),
            );
            expect(metadataSignals.at(-1)?.aborted).toBe(false);
            expect(
                screen.queryByRole('button', { name: 'Retry preview' }),
            ).not.toBeInTheDocument();

            await act(async () => metadataRecovery.resolve(readyMetadata));
            await waitFor(() => expect(tokenSignals).toHaveLength(1));
            expect(tokenSignals[0].aborted).toBe(false);

            await act(async () => tokenRecovery.resolve({ token: 'token-1' }));
            expect(
                screen.queryByRole('button', { name: 'Retry preview' }),
            ).not.toBeInTheDocument();
        },
    );

    it('shows retry again without looping when fresh metadata still failed', async () => {
        let metadataRequests = 0;
        let metadataState: 'unavailable' | 'failed' = 'unavailable';
        vi.mocked(lightdashApi).mockImplementation(({ url }) => {
            if (!url.endsWith('/render-metadata')) {
                throw new Error(`Unexpected request: ${url}`);
            }
            metadataRequests += 1;
            return Promise.resolve({
                state: metadataState,
                latestBuildInProgress: false,
            });
        });

        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false, staleTime: 30_000 },
            },
        });
        render(<GalleryPreview />, { wrapper: createWrapper(queryClient) });

        const retryButton = await screen.findByRole('button', {
            name: 'Retry preview',
        });
        const initialMetadataRequests = metadataRequests;
        metadataState = 'failed';
        await userEvent.click(retryButton);

        expect(
            await screen.findByRole('button', { name: 'Retry preview' }),
        ).toBeInTheDocument();
        expect(metadataRequests).toBeGreaterThan(initialMetadataRequests);
        const settledMetadataRequests = metadataRequests;
        await act(async () => Promise.resolve());
        expect(metadataRequests).toBe(settledMetadataRequests);
    });

    it('refreshes a fresh cached token after a terminal refetch error', async () => {
        const forbidden = {
            status: 'error' as const,
            error: {
                name: 'ForbiddenError',
                statusCode: 403,
                message: 'Forbidden',
                data: {},
            },
        };
        const tokenRecovery = deferred<{ token: string }>();
        const tokenSignals: AbortSignal[] = [];
        let tokenResponse: 'success' | 'forbidden' | 'recovering' = 'success';

        vi.mocked(lightdashApi).mockImplementation(({ url, signal }) => {
            if (url.endsWith('/render-metadata')) {
                return Promise.resolve(readyMetadata);
            }
            if (url.endsWith('/preview-token')) {
                tokenSignals.push(signal!);
                if (tokenResponse === 'forbidden') {
                    return Promise.reject(forbidden);
                }
                if (tokenResponse === 'recovering') {
                    return tokenRecovery.promise;
                }
                return Promise.resolve({ token: 'cached-token' });
            }
            throw new Error(`Unexpected request: ${url}`);
        });

        const queryClient = new QueryClient({
            defaultOptions: {
                queries: { retry: false, staleTime: 30_000 },
            },
        });
        render(<GalleryPreview />, { wrapper: createWrapper(queryClient) });

        await waitFor(() => expect(tokenSignals).toHaveLength(1));
        expect(screen.getByTitle('App preview')).toHaveAttribute(
            'src',
            expect.stringContaining('/t/cached-token/'),
        );
        tokenResponse = 'forbidden';
        await act(async () => {
            await queryClient.refetchQueries({
                queryKey: [
                    'data-app-viz-preview-token',
                    'project-1',
                    'viz-1',
                    1,
                    'registered',
                    undefined,
                    undefined,
                ],
                exact: true,
            });
        });
        const retryButton = await screen.findByRole('button', {
            name: 'Retry preview',
        });

        tokenResponse = 'recovering';
        await userEvent.click(retryButton);

        expect(screen.queryByTitle('App preview')).not.toBeInTheDocument();
        await waitFor(() => expect(tokenSignals).toHaveLength(3));
        expect(tokenSignals[2].aborted).toBe(false);
        await act(async () =>
            tokenRecovery.resolve({ token: 'recovered-token' }),
        );
        expect(screen.getByTitle('App preview')).toHaveAttribute(
            'src',
            expect.stringContaining('/t/recovered-token/'),
        );
        expect(
            screen.queryByRole('button', { name: 'Retry preview' }),
        ).not.toBeInTheDocument();
    });
});
