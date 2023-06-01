import {
    ApiChartSummaryListResponse,
    ApiErrorPayload,
    ApiSpaceSummaryListResponse,
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
    Tags,
} from 'tsoa';
import { projectService } from '../services/services';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';

@Route('/api/v1/projects')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
export class ProjectController extends Controller {
    /**
     * List all charts in a project
     * @param projectUuid The uuid of the project to get charts for
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{projectUuid}/charts')
    @OperationId('ListChartsInProject')
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

    /**
     * List all spaces in a project
     * @param projectUuid The uuid of the project to get spaces for
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{projectUuid}/spaces')
    @OperationId('ListSpacesInProject')
    async getSpacesInProject(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSpaceSummaryListResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await projectService.getSpaces(req.user!, projectUuid),
        };
    }
}
