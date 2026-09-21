import {
    QueryHistoryStatus,
    type ApiExecuteAsyncDashboardChartQueryResults,
} from '@lightdash/common';
import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../api';
import { Limit } from '../../components/ExportResults/types';
import { pollForResults } from '../../features/queryRunner/executeQuery';
import { useDashboardChartDownload } from './useDashboardChartDownload';
import { useEmbedDashboardChartDownload } from './useEmbedDashboardChartDownload';

vi.mock('../../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../../features/queryRunner/executeQuery', () => ({
    pollForResults: vi.fn(),
}));
vi.mock('../../providers/Dashboard/useDashboardContext', () => ({
    default: (selector: (context: unknown) => unknown) =>
        selector({ chartSort: {}, parameterValues: {} }),
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
            vi.mocked(lightdashApi).mockResolvedValue({
                queryUuid: 'download-query',
            } as ApiExecuteAsyncDashboardChartQueryResults);
            vi.mocked(pollForResults).mockResolvedValue({
                status: QueryHistoryStatus.READY,
            } as Awaited<ReturnType<typeof pollForResults>>);
        });

        it('reuses the visible pivot query only for flat table rows', async () => {
            const { result } = renderHook(useDownload);

            await expect(
                result.current.getDownloadQueryUuid(2, Limit.TABLE, false),
            ).resolves.toBe('visible-query');
            expect(lightdashApi).not.toHaveBeenCalled();

            for (const [limit, scope] of [
                [2, Limit.CUSTOM],
                [null, Limit.ALL],
            ] as const) {
                await expect(
                    result.current.getDownloadQueryUuid(limit, scope, false),
                ).resolves.toBe('download-query');
                expect(lightdashApi).toHaveBeenLastCalledWith(
                    expect.objectContaining({
                        body: expect.stringContaining(`"limit":${limit}`),
                    }),
                );
            }
        });
    },
);
