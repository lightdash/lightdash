import {
    ApiErrorPayload,
    ApiQueryResults,
    MetricQuery,
} from '@lightdash/common';
import { Body, Post } from '@tsoa/runtime';
import express from 'express';
import {
    Controller,
    Middlewares,
    OperationId,
    Path,
    Request,
    Response,
    Route,
    SuccessResponse,
} from 'tsoa';
import { projectService } from '../services/services';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';

type ApiRunQueryResponse = {
    status: 'ok';
    results: {
        metricQuery: any; // tsoa doesn't support complex types like MetricQuery
        rows: any[];
    };
};

@Route('/api/v1/projects/{projectUuid}')
@Response<ApiErrorPayload>('default', 'Error')
export class RunViewChartQueryController extends Controller {
    /**
     * Run a query for a chart on view mode
     * @param projectUuid The uuid of the project
     * @param body chartUuid for the chart to run
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/runViewChartQuery')
    @OperationId('postRunViewChartQuery')
    async postViewChart(
        @Body() body: { chartUuid: string },
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiRunQueryResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await projectService.runViewChartQuery(
                req.user!,
                body.chartUuid,
                projectUuid,
            ),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/runDashboardTileQuery')
    @OperationId('postRunDashboardTileQuery')
    async postDashboardTile(
        @Body() body: { chartUuid: string },
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiRunQueryResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await projectService.runViewChartQuery(
                req.user!,
                body.chartUuid,
                projectUuid,
            ),
        };
    }
}
