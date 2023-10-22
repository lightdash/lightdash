import { ApiUserActivity, ApiErrorPayload } from '@lightdash/common';
import { Get } from '@tsoa/runtime';
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
    Tags,
} from 'tsoa';
import { analyticsService } from '../services/services';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';

@Route('/api/v1/analytics')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Analytics')
export class AnalyticsController extends Controller {
    /**
     * Get the user analytics for a project
     * @param projectUuid the uuid of the project
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/user-activity/{projectUuid}')
    @OperationId('getUserAnalytics')
    async get(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiUserActivity> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await analyticsService.getUserActivity(projectUuid, req.user!),
        };
    }
}
