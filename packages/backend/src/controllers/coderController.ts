import {
    ApiChartAsCodeListResponse,
    ApiChartAsCodeUpsertResponse,
    ApiErrorPayload,
    ChartAsCode,
} from '@lightdash/common';
import {
    Body,
    Get,
    Hidden,
    Middlewares,
    OperationId,
    Path,
    Post,
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

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/chart')
    @OperationId('upsertChartAsCode')
    async upsertChartAsCode(
        @Path() projectUuid: string,
        @Body() chart: Omit<ChartAsCode, 'metricQuery'> & { metricQuery: any },
        @Request() req: express.Request,
    ): Promise<ApiChartAsCodeUpsertResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getCoderService()
                .upsertChart(req.user!, projectUuid, chart),
        };
    }
}
