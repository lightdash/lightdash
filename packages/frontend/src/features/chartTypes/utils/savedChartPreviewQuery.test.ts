import {
    QueryExecutionContext,
    QueryHistoryStatus,
    type ApiExecuteAsyncMetricQueryResults,
} from '@lightdash/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { lightdashApi } from '../../../api';
import { pollForResults } from '../../queryRunner/executeQuery';
import {
    SAVED_CHART_PREVIEW_ROW_LIMIT,
    executeSavedChartPreviewQuery,
} from './savedChartPreviewQuery';

vi.mock('../../../api', () => ({ lightdashApi: vi.fn() }));
vi.mock('../../queryRunner/executeQuery', () => ({ pollForResults: vi.fn() }));

describe('executeSavedChartPreviewQuery', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.mocked(lightdashApi).mockResolvedValue({
            queryUuid: 'preview-query',
            fields: { orders_status: { name: 'orders_status' } },
        } as unknown as ApiExecuteAsyncMetricQueryResults);
    });

    it('starts an unpivoted bounded query and returns its ready rows', async () => {
        const rows = [
            {
                orders_status: {
                    value: { raw: 'completed', formatted: 'Completed' },
                },
            },
        ];
        const pivotDetails = null;
        vi.mocked(pollForResults).mockResolvedValue({
            status: QueryHistoryStatus.READY,
            rows,
            pivotDetails,
            page: 1,
            pageSize: SAVED_CHART_PREVIEW_ROW_LIMIT,
            totalPageCount: 1,
            totalResults: rows.length,
            nextPage: undefined,
            previousPage: undefined,
            queryUuid: 'query-1',
            columns: {},
            metadata: {
                performance: {
                    initialQueryExecutionMs: null,
                    resultsPageExecutionMs: 0,
                    queueTimeMs: null,
                },
                preAggregate: null,
            },
        });

        await expect(
            executeSavedChartPreviewQuery({
                projectUuid: 'project-1',
                chartUuid: 'chart-1',
            }),
        ).resolves.toEqual({
            rows,
            itemsMap: { orders_status: { name: 'orders_status' } },
            pivotDetails,
        });

        expect(lightdashApi).toHaveBeenCalledWith({
            url: '/projects/project-1/query/chart',
            version: 'v2',
            method: 'POST',
            body: JSON.stringify({
                context: QueryExecutionContext.DATA_APP_SAMPLE,
                chartUuid: 'chart-1',
                limit: SAVED_CHART_PREVIEW_ROW_LIMIT,
                pivotResults: false,
            }),
        });
        expect(pollForResults).toHaveBeenCalledWith(
            'project-1',
            'preview-query',
        );
    });

    it('maps a failed chart-query request to its API error message', async () => {
        vi.mocked(lightdashApi).mockRejectedValue({
            status: 'error',
            error: {
                name: 'InternalServerError',
                statusCode: 500,
                message: 'Saved chart query failed',
                data: {},
            },
        });

        await expect(
            executeSavedChartPreviewQuery({
                projectUuid: 'project-1',
                chartUuid: 'chart-1',
            }),
        ).rejects.toThrow('Saved chart query failed');
        expect(pollForResults).not.toHaveBeenCalled();
    });

    it('maps an unfinished poll to an actionable error', async () => {
        vi.mocked(pollForResults).mockResolvedValue({
            status: QueryHistoryStatus.ERROR,
            error: 'The warehouse is unavailable',
        } as Awaited<ReturnType<typeof pollForResults>>);

        await expect(
            executeSavedChartPreviewQuery({
                projectUuid: 'project-1',
                chartUuid: 'chart-1',
            }),
        ).rejects.toThrow('The warehouse is unavailable');
    });
});
