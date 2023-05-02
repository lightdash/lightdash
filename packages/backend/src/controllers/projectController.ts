import {
    ApiChartSummaryListResponse,
    ApiErrorPayload,
} from '@lightdash/common';
import { Controller } from '@tsoa/runtime';
import express from 'express';
import {
    Get,
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

@Route('/api/v1/projects')
@Response<ApiErrorPayload>('default', 'Error')
export class ProjectController extends Controller {
    /**
     * Get all charts in a project
     * @param projectUuid The uuid of the project to get charts for
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{projectUuid}/charts')
    @OperationId('getChartsInProject')
    async getChartsInProject(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiChartSummaryListResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await projectService.getCharts(req.user!, projectUuid),
        };
    }
}
