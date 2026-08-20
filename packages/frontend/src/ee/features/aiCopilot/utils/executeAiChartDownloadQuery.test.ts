import {
    ChartType,
    MergeJoinType,
    QueryExecutionContext,
    type ChartConfig,
    type ItemsMap,
    type MergeQuery,
    type MetricQuery,
} from '@lightdash/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeAiChartDownloadQuery } from './executeAiChartDownloadQuery';

const mocks = vi.hoisted(() => ({
    executeQueryAndWaitForResults: vi.fn(),
    executeMergeQuery: vi.fn(),
}));

vi.mock('../../../../hooks/useQueryResults', () => ({
    executeQueryAndWaitForResults: mocks.executeQueryAndWaitForResults,
}));

vi.mock('../../../../features/mergeQuery/hooks/useMergeQuery', () => ({
    executeMergeQuery: mocks.executeMergeQuery,
}));

const metricQuery = {
    exploreName: 'orders',
    dimensions: ['orders_status'],
    metrics: ['orders_total'],
    filters: {},
    sorts: [],
    limit: 500,
    tableCalculations: [],
    additionalMetrics: [],
    metricOverrides: {},
} satisfies MetricQuery;

const chartConfig = {
    type: ChartType.TABLE,
    config: {},
} satisfies ChartConfig;

const mergeQuery = {
    sources: [],
    joinKey: [],
    joinType: MergeJoinType.FULL,
    limit: 500,
    tableCalculations: [],
} satisfies MergeQuery;

const fields = {} satisfies ItemsMap;

describe('executeAiChartDownloadQuery', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('executes a semantic artifact as an export for the requested row limit', async () => {
        mocks.executeQueryAndWaitForResults.mockResolvedValue({
            queryUuid: 'semantic-download-query',
        });

        await expect(
            executeAiChartDownloadQuery({
                projectUuid: 'project-uuid',
                metricQuery,
                parameters: { date_range: 'last 30 days' },
                chartConfig,
                pivotDimensions: undefined,
                fields,
                mergeQuery: null,
                limit: 42,
                exportPivotedData: false,
            }),
        ).resolves.toBe('semantic-download-query');

        expect(mocks.executeQueryAndWaitForResults).toHaveBeenCalledWith({
            projectUuid: 'project-uuid',
            tableId: 'orders',
            query: metricQuery,
            csvLimit: 42,
            context: QueryExecutionContext.AI,
            parameters: { date_range: 'last 30 days' },
            pivotConfiguration: undefined,
        });
    });

    it('uses the merge export path and chart grouping for a merged artifact', async () => {
        mocks.executeMergeQuery.mockResolvedValue({
            outcome: 'started',
            query: { queryUuid: 'merge-download-query' },
        });

        await expect(
            executeAiChartDownloadQuery({
                projectUuid: 'project-uuid',
                metricQuery,
                parameters: { date_range: 'last 30 days' },
                chartConfig,
                pivotDimensions: ['orders_status'],
                fields,
                mergeQuery,
                limit: null,
                exportPivotedData: true,
            }),
        ).resolves.toBe('merge-download-query');

        expect(mocks.executeMergeQuery).toHaveBeenCalledWith(
            'project-uuid',
            mergeQuery,
            { date_range: 'last 30 days' },
            {
                chartConfig,
                pivotConfig: { columns: ['orders_status'] },
            },
            null,
        );
    });

    it('surfaces merge export refusals', async () => {
        mocks.executeMergeQuery.mockResolvedValue({
            outcome: 'refused',
            errors: [
                { message: 'Join key missing' },
                { message: 'Source unavailable' },
            ],
        });

        await expect(
            executeAiChartDownloadQuery({
                projectUuid: 'project-uuid',
                metricQuery,
                parameters: undefined,
                chartConfig,
                pivotDimensions: undefined,
                fields,
                mergeQuery,
                limit: 10,
                exportPivotedData: false,
            }),
        ).rejects.toThrow('Join key missing Source unavailable');
    });
});
