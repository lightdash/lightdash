import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_PREVIEW_TOKEN_REFRESH_INTERVAL_MS } from '../../apps/hooks/previewTokenQueryOptions';
import {
    useDataAppVizPreviewToken,
    useDataAppVizRenderMetadata,
} from './useDataAppVizRender';

const mocks = vi.hoisted(() => ({
    lightdashApi: vi.fn(),
    useQuery: vi.fn(),
}));

vi.mock('../../../api', () => ({ lightdashApi: mocks.lightdashApi }));
vi.mock('@tanstack/react-query', () => ({
    useQuery: mocks.useQuery,
    useQueryClient: () => ({}),
}));

type CapturedQuery = {
    queryKey: unknown[];
    queryFn: () => Promise<unknown>;
    enabled: boolean;
    refetchInterval?:
        | number
        | ((
              data: unknown,
              query?: { state: { error: unknown } },
          ) => number | false);
    refetchIntervalInBackground?: boolean;
    refetchOnWindowFocus?: boolean;
    retry?: (
        failureCount: number,
        error: ReturnType<typeof apiError>,
    ) => boolean;
};

const apiError = (statusCode: number) => ({
    status: 'error' as const,
    error: {
        name: 'ApiError',
        statusCode,
        message: 'Request failed',
        data: {},
    },
});

describe('useDataAppVizRender', () => {
    beforeEach(() => {
        mocks.lightdashApi.mockReset();
        mocks.useQuery.mockReset();
        mocks.useQuery.mockImplementation((options) => options);
    });

    it('binds the registered route to the saved chart and polls only while a build is active', async () => {
        const { result } = renderHook(() =>
            useDataAppVizRenderMetadata('project-1', 'viz-1', {
                isEmbedded: false,
                savedChartUuid: 'chart-1',
            }),
        );
        const query = result.current as unknown as CapturedQuery;

        expect(query.queryKey).toEqual([
            'data-app-viz-render-metadata',
            'project-1',
            'viz-1',
            'registered',
            'chart-1',
            undefined,
            undefined,
        ]);
        expect(query.enabled).toBe(true);
        await query.queryFn();
        expect(mocks.lightdashApi).toHaveBeenCalledWith({
            method: 'GET',
            url: '/ee/projects/project-1/apps/visualizations/viz-1/charts/chart-1/render-metadata',
        });
        expect(
            typeof query.refetchInterval === 'function' &&
                query.refetchInterval({ latestBuildInProgress: true }),
        ).toBe(3000);
        expect(
            typeof query.refetchInterval === 'function' &&
                query.refetchInterval({ latestBuildInProgress: false }),
        ).toBe(false);
    });

    it('passes the previewed chart version through to the registered route', async () => {
        const target = {
            isEmbedded: false,
            savedChartUuid: 'chart-1',
            chartVersionUuid: 'version-9',
        };
        const { result } = renderHook(() =>
            useDataAppVizRenderMetadata('project-1', 'viz-1', target),
        );
        await (result.current as unknown as CapturedQuery).queryFn();
        expect(mocks.lightdashApi).toHaveBeenLastCalledWith({
            method: 'GET',
            url: '/ee/projects/project-1/apps/visualizations/viz-1/charts/chart-1/render-metadata?chartVersionUuid=version-9',
        });
    });

    it('does not send a chart version on the embed route', async () => {
        const target = {
            isEmbedded: true,
            savedChartUuid: 'chart-1',
            chartVersionUuid: 'version-9',
        };
        const { result } = renderHook(() =>
            useDataAppVizRenderMetadata('project-1', 'viz-1', target),
        );
        await (result.current as unknown as CapturedQuery).queryFn();
        expect(mocks.lightdashApi).toHaveBeenLastCalledWith({
            method: 'GET',
            url: '/embed/project-1/chart/chart-1/visualizations/viz-1/render-metadata',
        });
    });

    it('falls back to the chart-less authoring route while editing', async () => {
        const target = { isEmbedded: false, savedChartUuid: undefined };
        const { result } = renderHook(() =>
            useDataAppVizRenderMetadata('project-1', 'viz-1', target),
        );
        const query = result.current as unknown as CapturedQuery;

        expect(query.enabled).toBe(true);
        await query.queryFn();
        expect(mocks.lightdashApi).toHaveBeenLastCalledWith({
            method: 'GET',
            url: '/ee/projects/project-1/apps/visualizations/viz-1/render-metadata',
        });

        mocks.lightdashApi.mockResolvedValue({ token: 'token-3' });
        const { result: tokenResult } = renderHook(() =>
            useDataAppVizPreviewToken('project-1', 'viz-1', 3, target),
        );
        await (tokenResult.current as unknown as CapturedQuery).queryFn();
        expect(mocks.lightdashApi).toHaveBeenLastCalledWith({
            method: 'GET',
            url: '/ee/projects/project-1/apps/visualizations/viz-1/versions/3/preview-token',
        });
    });

    it('requests an immutable chart-less artifact pin instead of the latest version', async () => {
        const target = { isEmbedded: false, savedChartUuid: undefined };
        const { result } = renderHook(() =>
            useDataAppVizRenderMetadata('project-1', 'viz-1', target, 2),
        );

        await (result.current as unknown as CapturedQuery).queryFn();

        expect(mocks.lightdashApi).toHaveBeenLastCalledWith({
            method: 'GET',
            url: '/ee/projects/project-1/apps/visualizations/viz-1/render-metadata?version=2',
        });
    });

    it('requests the preview token for the exact version returned by pinned chartless metadata', async () => {
        const target = { isEmbedded: false, savedChartUuid: undefined };
        mocks.lightdashApi.mockResolvedValueOnce({
            state: 'ready',
            version: 2,
            latestBuildInProgress: false,
            schema: { fields: [], configOptions: [], colorPalette: null },
        });
        const { result: metadataResult } = renderHook(() =>
            useDataAppVizRenderMetadata('project-1', 'viz-1', target, 2),
        );
        const metadata = (await (
            metadataResult.current as unknown as CapturedQuery
        ).queryFn()) as { version: number };

        mocks.lightdashApi.mockResolvedValueOnce({ token: 'token-2' });
        const { result: tokenResult } = renderHook(() =>
            useDataAppVizPreviewToken(
                'project-1',
                'viz-1',
                metadata.version,
                target,
                2,
            ),
        );
        await expect(
            (tokenResult.current as unknown as CapturedQuery).queryFn(),
        ).resolves.toBe('token-2');

        expect(mocks.lightdashApi.mock.calls).toEqual([
            [
                {
                    method: 'GET',
                    url: '/ee/projects/project-1/apps/visualizations/viz-1/render-metadata?version=2',
                },
            ],
            [
                {
                    method: 'GET',
                    url: '/ee/projects/project-1/apps/visualizations/viz-1/versions/2/preview-token',
                },
            ],
        ]);
    });

    it('uses the saved-chart-bound embed routes for metadata and exact-version tokens', async () => {
        const target = {
            isEmbedded: true,
            savedChartUuid: 'chart-1',
        };
        const { result: metadataResult } = renderHook(() =>
            useDataAppVizRenderMetadata('project-1', 'viz-1', target),
        );
        const metadataQuery =
            metadataResult.current as unknown as CapturedQuery;

        await metadataQuery.queryFn();
        expect(mocks.lightdashApi).toHaveBeenLastCalledWith({
            method: 'GET',
            url: '/embed/project-1/chart/chart-1/visualizations/viz-1/render-metadata',
        });

        mocks.lightdashApi.mockResolvedValue({ token: 'token-7' });
        const { result: tokenResult } = renderHook(() =>
            useDataAppVizPreviewToken('project-1', 'viz-1', 7, target),
        );
        const tokenQuery = tokenResult.current as unknown as CapturedQuery;

        await expect(tokenQuery.queryFn()).resolves.toBe('token-7');
        expect(tokenQuery.refetchInterval).toBeTypeOf('function');
        expect(
            typeof tokenQuery.refetchInterval === 'function' &&
                tokenQuery.refetchInterval(undefined, {
                    state: { error: null },
                }),
        ).toBe(APP_PREVIEW_TOKEN_REFRESH_INTERVAL_MS);
        expect(tokenQuery.refetchIntervalInBackground).toBe(true);
        expect(tokenQuery.refetchOnWindowFocus).toBe(true);
        expect(tokenQuery.queryKey).toEqual([
            'data-app-viz-preview-token',
            'project-1',
            'viz-1',
            7,
            'embed',
            'chart-1',
            undefined,
        ]);
        expect(mocks.lightdashApi).toHaveBeenLastCalledWith({
            method: 'GET',
            url: '/embed/project-1/chart/chart-1/visualizations/viz-1/versions/7/preview-token',
        });
    });

    it('previews a newly selected custom chart type in embedded Explore', async () => {
        const target = { isEmbedded: true, savedChartUuid: undefined };
        const { result } = renderHook(() =>
            useDataAppVizRenderMetadata('project-1', 'viz-1', target, 2),
        );
        const metadataQuery = result.current as unknown as CapturedQuery;
        expect(metadataQuery.enabled).toBe(true);
        await metadataQuery.queryFn();
        expect(mocks.lightdashApi).toHaveBeenLastCalledWith({
            method: 'GET',
            url: '/embed/project-1/visualizations/viz-1/render-metadata?version=2',
        });

        mocks.lightdashApi.mockResolvedValue({ token: 'token-2' });
        const { result: tokenResult } = renderHook(() =>
            useDataAppVizPreviewToken('project-1', 'viz-1', 2, target, 2),
        );
        const tokenQuery = tokenResult.current as unknown as CapturedQuery;
        expect(tokenQuery.enabled).toBe(true);
        await expect(tokenQuery.queryFn()).resolves.toBe('token-2');
        expect(mocks.lightdashApi).toHaveBeenLastCalledWith({
            method: 'GET',
            url: '/embed/project-1/visualizations/viz-1/versions/2/preview-token',
        });
    });

    it.each([
        ['metadata', 403],
        ['metadata', 404],
        ['token', 403],
        ['token', 404],
    ])(
        'does not retry terminal %s HTTP %s responses',
        (queryType, statusCode) => {
            const target = {
                isEmbedded: false,
                savedChartUuid: 'chart-1',
            };
            const { result } = renderHook(() =>
                queryType === 'metadata'
                    ? useDataAppVizRenderMetadata('project-1', 'viz-1', target)
                    : useDataAppVizPreviewToken(
                          'project-1',
                          'viz-1',
                          7,
                          target,
                      ),
            );
            const query = result.current as unknown as CapturedQuery;

            expect(query.retry?.(0, apiError(statusCode))).toBe(false);
        },
    );

    it('retries transient failures at most three times', () => {
        const { result } = renderHook(() =>
            useDataAppVizRenderMetadata('project-1', 'viz-1', {
                isEmbedded: false,
                savedChartUuid: 'chart-1',
            }),
        );
        const query = result.current as unknown as CapturedQuery;

        expect(query.retry?.(0, apiError(500))).toBe(true);
        expect(query.retry?.(2, apiError(500))).toBe(true);
        expect(query.retry?.(3, apiError(500))).toBe(false);
    });
});
