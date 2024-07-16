import { ApiChartContentResponse, ApiErrorPayload } from '@lightdash/common';
import {
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Query,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { allowApiKeyAuthentication, isAuthenticated } from '../authentication';
import { BaseController } from '../baseController';

@Route('/api/v2/charts')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Charts')
@Hidden() // Hide this endpoint from the documentation for now
export class ChartsController extends BaseController {
    /**
     * Get charts
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('List charts')
    async listCharts(
        @Request() req: express.Request,
        @Query() projectUuids?: string[],
        @Query() spaceUuids?: string[],
        @Query() pageSize?: number,
        @Query() page?: number,
    ): Promise<ApiChartContentResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services.getContentService().findCharts(
                req.user!,
                {
                    projectUuids,
                    spaceUuids,
                },
                {
                    page: page || 1,
                    pageSize: pageSize || 10,
                },
            ),
        };
    }
}
