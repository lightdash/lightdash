import { ApiChartAsCodeListResponse, ApiErrorPayload } from '@lightdash/common';
import {
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Path,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/coder')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('AsCode')
@Hidden() // Hide from documentation while in beta
export class CoderController extends BaseController {
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/charts')
    @OperationId('getChartsAsCode')
    async getChartsAsCode(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiChartAsCodeListResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getCoderService()
                .getCharts(req.user!, projectUuid),
        };
    }
}
