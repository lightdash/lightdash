import { LightdashAppPreviewTokenHeader } from '@lightdash/common';
import express from 'express';
import { QueryController } from './QueryController';

describe('QueryController', () => {
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
