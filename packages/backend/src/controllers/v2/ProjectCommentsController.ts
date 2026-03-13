import { type ApiErrorPayload, type ApiGetComments } from '@lightdash/common';
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
} from '@tsoa/runtime';
import express from 'express';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../authentication/middlewares';
import { BaseController } from '../baseController';

@Route('/api/v2/projects/{projectUuid}/comments')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Comments')
export class ProjectCommentsControllerV2 extends BaseController {
    /**
     * Gets all comments for a dashboard within a project
     * @summary Get comments
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/dashboards/{dashboardUuidOrSlug}')
    @OperationId('getProjectDashboardComments')
    async getComments(
        @Path() projectUuid: string,
        @Path() dashboardUuidOrSlug: string,
        @Request() req: express.Request,
    ): Promise<ApiGetComments> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getCommentService()
                .findCommentsForDashboard(req.user!, dashboardUuidOrSlug, {
                    projectUuid,
                }),
        };
    }
}
