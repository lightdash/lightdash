import { type DataAppVizRenderMetadata } from '@lightdash/common';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { type PropsWithChildren } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../api';
import {
    useDataAppVizPreviewToken,
    useDataAppVizRenderMetadata,
} from './useDataAppVizRender';

vi.mock('../../../api', () => ({ lightdashApi: vi.fn() }));

const metadata = (version: number): DataAppVizRenderMetadata => ({
    state: 'ready',
    version,
    latestBuildInProgress: false,
    schema: { fields: [], configOptions: [], colorPalette: null },
});

const forbidden = {
    status: 'error' as const,
    error: {
        name: 'ForbiddenError',
        statusCode: 403,
        message: 'Not authorized to access this visualization version',
        data: {},
    },
};

describe('custom chart version refresh', () => {
    let serverVersion: number;
    let denyToken: boolean;

    beforeEach(() => {
        serverVersion = 1;
        denyToken = false;
        vi.mocked(lightdashApi).mockReset();
        vi.mocked(lightdashApi).mockImplementation(({ url }) => {
            if (url.endsWith('/render-metadata')) {
                return Promise.resolve(metadata(serverVersion));
            }
            if (url.endsWith('/preview-token')) {
                return !denyToken && url.includes(`/versions/${serverVersion}/`)
                    ? Promise.resolve({ token: `token-${serverVersion}` })
                    : Promise.reject(forbidden);
            }
            throw new Error(`Unexpected request: ${url}`);
        });
    });

    const renderChart = (
        isEmbedded: boolean,
        pinnedVersion: number | undefined,
    ) => {
        const queryClient = new QueryClient({
            defaultOptions: {
                queries: {
                    staleTime: Infinity,
                    retry: false,
                    notifyOnChangeProps: 'all',
                },
            },
        });
        const wrapper = ({ children }: PropsWithChildren) => (
            <QueryClientProvider client={queryClient}>
                {children}
            </QueryClientProvider>
        );
        const target = { isEmbedded, savedChartUuid: 'chart-1' };
        return {
            queryClient,
            ...renderHook(
                ({ pinnedVersion }: { pinnedVersion: number | undefined }) => {
                    const renderMetadata = useDataAppVizRenderMetadata(
                        'project-1',
                        'viz-1',
                        target,
                        pinnedVersion,
                    );
                    const token = useDataAppVizPreviewToken(
                        'project-1',
                        'viz-1',
                        renderMetadata.data?.state === 'ready'
                            ? renderMetadata.data.version
                            : undefined,
                        target,
                        pinnedVersion,
                    );
                    return { renderMetadata, token };
                },
                { wrapper, initialProps: { pinnedVersion } },
            ),
        };
    };

    it.each([false, true])(
        'fetches the new version when a mounted chart is repinned (embedded: %s)',
        async (isEmbedded) => {
            const { result, rerender } = renderChart(isEmbedded, 1);
            await waitFor(() =>
                expect(result.current.token.data).toBe('token-1'),
            );

            serverVersion = 2;
            rerender({ pinnedVersion: 2 });

            await waitFor(() =>
                expect(result.current.token.data).toBe('token-2'),
            );
            expect(result.current.renderMetadata.data).toEqual(metadata(2));
            expect(result.current.token.error).toBeNull();
        },
    );

    it.each([
        { isEmbedded: false, pinnedVersion: 1 },
        { isEmbedded: true, pinnedVersion: 1 },
        { isEmbedded: false, pinnedVersion: undefined },
        { isEmbedded: true, pinnedVersion: undefined },
    ])(
        'recovers only the active metadata entry (embedded: $isEmbedded, pin: $pinnedVersion)',
        async ({ isEmbedded, pinnedVersion }) => {
            const { result, queryClient } = renderChart(
                isEmbedded,
                pinnedVersion,
            );
            const otherChartKey = [
                'data-app-viz-render-metadata',
                'project-1',
                'viz-1',
                isEmbedded ? 'embed' : 'registered',
                'chart-2',
                undefined,
                1,
            ];
            const otherPinKey = [
                'data-app-viz-render-metadata',
                'project-1',
                'viz-1',
                isEmbedded ? 'embed' : 'registered',
                'chart-1',
                undefined,
                2,
            ];
            queryClient.setQueryData(otherChartKey, metadata(1));
            queryClient.setQueryData(otherPinKey, metadata(2));
            await waitFor(() =>
                expect(result.current.token.data).toBe('token-1'),
            );

            // Another session repins the chart while this tile remains mounted.
            serverVersion = 2;
            await act(async () => {
                await result.current.token.refetch();
            });

            await waitFor(() =>
                expect(result.current.token.data).toBe('token-2'),
            );
            expect(result.current.renderMetadata.data).toEqual(metadata(2));
            expect(result.current.token.error).toBeNull();
            expect(
                queryClient.getQueryState(otherChartKey)?.isInvalidated,
            ).toBe(false);
            expect(queryClient.getQueryState(otherPinKey)?.isInvalidated).toBe(
                false,
            );
        },
    );

    it('preserves a genuine access error without repeatedly refreshing', async () => {
        const { result } = renderChart(false, 1);
        await waitFor(() => expect(result.current.token.data).toBe('token-1'));

        denyToken = true;
        await act(async () => {
            await result.current.token.refetch();
        });

        await waitFor(() => {
            expect(result.current.token.error).toEqual(forbidden);
            expect(result.current.renderMetadata.isFetching).toBe(false);
        });
        expect(result.current.renderMetadata.data).toEqual(metadata(1));
        expect(
            vi.mocked(lightdashApi).mock.calls.map(([{ url }]) => url),
        ).toEqual([
            expect.stringContaining('/render-metadata'),
            expect.stringContaining('/versions/1/preview-token'),
            expect.stringContaining('/versions/1/preview-token'),
            expect.stringContaining('/render-metadata'),
        ]);
    });
});
