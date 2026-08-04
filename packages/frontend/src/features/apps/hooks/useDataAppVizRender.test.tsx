import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    useDataAppVizPreviewToken,
    useDataAppVizRenderMetadata,
} from './useDataAppVizRender';

const mocks = vi.hoisted(() => ({
    lightdashApi: vi.fn(),
    useQuery: vi.fn(),
}));

vi.mock('../../../api', () => ({ lightdashApi: mocks.lightdashApi }));
vi.mock('@tanstack/react-query', () => ({ useQuery: mocks.useQuery }));

type CapturedQuery = {
    queryKey: unknown[];
    queryFn: () => Promise<unknown>;
    enabled: boolean;
    refetchInterval?: (data: unknown) => number | false;
};

describe('useDataAppVizRender', () => {
    beforeEach(() => {
        mocks.lightdashApi.mockReset();
        mocks.useQuery.mockReset();
        mocks.useQuery.mockImplementation((options) => options);
    });

    it('uses registered viz-only routes and polls only while a build is active', async () => {
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
        ]);
        expect(query.enabled).toBe(true);
        await query.queryFn();
        expect(mocks.lightdashApi).toHaveBeenCalledWith({
            method: 'GET',
            url: '/ee/projects/project-1/apps/visualizations/viz-1/render-metadata',
        });
        expect(query.refetchInterval?.({ latestBuildInProgress: true })).toBe(
            3000,
        );
        expect(query.refetchInterval?.({ latestBuildInProgress: false })).toBe(
            false,
        );
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
        expect(tokenQuery.queryKey).toEqual([
            'data-app-viz-preview-token',
            'project-1',
            'viz-1',
            7,
            'embed',
            'chart-1',
        ]);
        expect(mocks.lightdashApi).toHaveBeenLastCalledWith({
            method: 'GET',
            url: '/embed/project-1/chart/chart-1/visualizations/viz-1/versions/7/preview-token',
        });
    });

    it('does not call an embed route without a saved chart UUID', () => {
        const { result } = renderHook(() =>
            useDataAppVizRenderMetadata('project-1', 'viz-1', {
                isEmbedded: true,
                savedChartUuid: undefined,
            }),
        );

        expect((result.current as unknown as CapturedQuery).enabled).toBe(
            false,
        );
    });
});
