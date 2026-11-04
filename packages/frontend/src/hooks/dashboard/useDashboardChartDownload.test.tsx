import {
    QueryHistoryStatus,
    type ApiExecuteAsyncDashboardChartQueryResults,
} from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sharedLightdashApi } from '../../api';
import { Limit } from '../../components/ExportResults/types';
import { pollForResults } from '../../features/queryRunner/executeQuery';
import { createDashboardTestStore } from '../../testing/dashboardStore';
import { DashboardStoreTestProvider } from '../../testing/DashboardStoreTestProvider';
import { mockedLightdashApi } from '../../testing/mockedLightdashApi';
import { useDashboardChartDownload } from './useDashboardChartDownload';
import { useEmbedDashboardChartDownload } from './useEmbedDashboardChartDownload';

vi.mock('../../api');
vi.mock('../../features/queryRunner/executeQuery', () => ({
    pollForResults: vi.fn(),
}));
vi.mock('./useDashboardFiltersForTile', () => ({ default: () => ({}) }));

const hooks = {
    dashboard: function useDashboardDownload() {
        return useDashboardChartDownload(
            'tile',
            'chart',
            'project',
            'dashboard',
            'visible-query',
            true,
        );
    },
    embed: function useEmbedDownload() {
        return useEmbedDashboardChartDownload(
            'tile',
            'project',
            'visible-query',
            true,
        );
    },
};

describe.each(Object.entries(hooks))(
    '%s chart download',
    (_name, useDownload) => {
        beforeEach(() => {
            vi.clearAllMocks();
            mockedLightdashApi.mockResolvedValue({
                queryUuid: 'download-query',
            } as ApiExecuteAsyncDashboardChartQueryResults);
            vi.mocked(pollForResults).mockResolvedValue({
                status: QueryHistoryStatus.READY,
            } as Awaited<ReturnType<typeof pollForResults>>);
        });

        it("sends only this tile's viewer sort", async () => {
            const tileSorts = [{ fieldId: 'orders_status', descending: true }];
            const store = createDashboardTestStore({
                parameterValues: {},
                chartSortsByTileUuid: {
                    tile: tileSorts,
                    other: [{ fieldId: 'orders_id', descending: false }],
                },
            });
            const { result } = renderHook(useDownload, {
                wrapper: ({ children }: { children: ReactNode }) => (
                    <DashboardStoreTestProvider store={store}>
                        {children}
                    </DashboardStoreTestProvider>
                ),
            });

            await result.current.getDownloadQueryUuid(10, Limit.CUSTOM);
            const body = JSON.parse(
                vi.mocked(sharedLightdashApi).mock.lastCall?.[0].body as string,
            );
            expect(body.dashboardSorts).toEqual(tileSorts);
        });

        it('reuses the visible pivot query only for flat table rows', async () => {
            const store = createDashboardTestStore({ parameterValues: {} });
            const { result } = renderHook(useDownload, {
                wrapper: ({ children }: { children: ReactNode }) => (
                    <DashboardStoreTestProvider store={store}>
                        {children}
                    </DashboardStoreTestProvider>
                ),
            });

            await expect(
                result.current.getDownloadQueryUuid(2, Limit.TABLE, false),
            ).resolves.toBe('visible-query');
            expect(sharedLightdashApi).not.toHaveBeenCalled();

            for (const [limit, scope] of [
                [2, Limit.CUSTOM],
                [null, Limit.ALL],
            ] as const) {
                await expect(
                    result.current.getDownloadQueryUuid(limit, scope, false),
                ).resolves.toBe('download-query');
                expect(sharedLightdashApi).toHaveBeenLastCalledWith(
                    expect.objectContaining({
                        body: expect.stringContaining(`"limit":${limit}`),
                    }),
                );
            }
        });
    },
);
