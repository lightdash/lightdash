import {
    ChartType,
    LightdashAppPreviewTokenHeader,
    MergeJoinType,
    QueryExecutionContext,
    type ApiExecuteAsyncMergeQueryRequest,
} from '@lightdash/common';
import express from 'express';
import { QueryController } from './QueryController';

describe('QueryController', () => {
    it('forwards merge execution to the one-call service interface', async () => {
        const executeAsyncMergeQuery = vi.fn().mockResolvedValue({
            outcome: 'started',
            query: { queryUuid: 'query-uuid' },
        });
        const controller = new QueryController({
            getAsyncQueryService: () => ({
                executeAsyncMergeQuery,
            }),
        } as unknown as ConstructorParameters<typeof QueryController>[0]);
        controller.setStatus = vi.fn();
        const req = {
            account: {},
            headers: {},
            header: vi.fn(),
        } as unknown as express.Request;
        const body: ApiExecuteAsyncMergeQueryRequest = {
            mergeQuery: {
                sources: [],
                joinKey: [],
                joinType: MergeJoinType.FULL,
                limit: 500,
                tableCalculations: [],
            },
            context: QueryExecutionContext.EXPLORE,
            mode: { type: 'export', limit: 42 },
            chart: {
                chartConfig: { type: ChartType.TABLE, config: {} },
                pivotConfig: { columns: ['customer_id'], rows: [] },
            },
        };

        await controller.executeAsyncMergeQuery(body, 'project-uuid', req);

        expect(executeAsyncMergeQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                projectUuid: 'project-uuid',
                mergeQuery: body.mergeQuery,
                context: QueryExecutionContext.EXPLORE,
                mode: body.mode,
                chart: body.chart,
            }),
        );
    });

    it('forwards the signed Data App preview token to metric-query execution', async () => {
        const executeAsyncMetricQuery = vi.fn().mockResolvedValue({
            queryUuid: 'query-uuid',
        });
        const controller = new QueryController({
            getAsyncQueryService: () => ({ executeAsyncMetricQuery }),
        } as unknown as ConstructorParameters<typeof QueryController>[0]);
        controller.setStatus = vi.fn();
        const req = {
            account: {},
            header: vi.fn(),
            headers: {
                [LightdashAppPreviewTokenHeader.toLowerCase()]:
                    'signed-preview-token',
            },
        } as unknown as express.Request;

        await controller.executeAsyncMetricQuery(
            {
                query: {
                    exploreName: 'orders',
                    dimensions: [],
                    metrics: [],
                },
            } as never,
            'project-uuid',
            req,
        );

        expect(executeAsyncMetricQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                dataAppPreviewToken: 'signed-preview-token',
            }),
        );
    });
});
