import { ApiErrorPayload } from '@lightdash/common';
import { Get, Post } from '@tsoa/runtime';
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
import { ApiRunQueryResponse } from './runQueryController';

@Route('/api/v1/projects/{projectUuid}/saved/{chartUuid}')
@Response<ApiErrorPayload>('default', 'Error')
export class SavedChartController extends Controller {
    /**
     * Run a query for a chart on view mode
     * @param projectUuid The uuid of the project
     * @param chartUuid chartUuid for the chart to run
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/queryResults')
    @OperationId('getChartResults')
    async getChartResults(
        @Path() chartUuid: string,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiRunQueryResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await projectService.runViewChartQuery(
                req.user!,
                chartUuid,
                projectUuid,
            ),
        };
    }
}
