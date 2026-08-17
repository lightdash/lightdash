import { LightdashAppPreviewTokenHeader } from '@lightdash/common';
import express from 'express';
import { QueryController } from './QueryController';

describe('QueryController', () => {
    it('forwards merge execution to the one-call service interface', async () => {
        const executeAsyncMergeQuery = vi.fn().mockResolvedValue({
            errors: [],
            started: { queryUuid: 'query-uuid' },
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
        const body = {
            mergeQuery: { sources: [] },
            chartConfig: { type: 'table', config: {} },
            pivotConfig: { columns: ['customer_id'] },
        };

        await controller.executeAsyncMergeQuery(
            body as never,
            'project-uuid',
            req,
        );

        expect(executeAsyncMergeQuery).toHaveBeenCalledWith(
            expect.objectContaining({
                projectUuid: 'project-uuid',
                mergeQuery: body.mergeQuery,
                chartConfig: body.chartConfig,
                pivotConfig: body.pivotConfig,
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
