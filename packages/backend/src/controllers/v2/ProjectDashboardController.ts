import {
    assertRegisteredAccount,
    type ApiDashboardResponse,
    type ApiErrorPayload,
    type ApiGetComments,
    type ApiSuccessEmpty,
    type UpdateDashboard,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Get,
    Middlewares,
    OperationId,
    Patch,
    Path,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from '@tsoa/runtime';
import express from 'express';
import { toSessionUser } from '../../auth/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from '../authentication/middlewares';
import { BaseController } from '../baseController';

@Route('/api/v2/projects/{projectUuid}/dashboards')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Dashboards')
export class ProjectDashboardControllerV2 extends BaseController {
    /**
     * Get a dashboard by uuid or slug within a project
     * @summary Get dashboard
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{dashboardUuidOrSlug}')
    @OperationId('getProjectDashboard')
    async get(
        @Path() projectUuid: string,
        @Path() dashboardUuidOrSlug: string,
        @Request() req: express.Request,
    ): Promise<ApiDashboardResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getDashboardService()
                .getByIdOrSlug(
                    toSessionUser(req.account),
                    dashboardUuidOrSlug,
                    {
                        projectUuid,
                    },
                ),
        };
    }

    /**
     * Update a dashboard by uuid or slug within a project
     * @summary Update dashboard
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Patch('/{dashboardUuidOrSlug}')
    @OperationId('updateProjectDashboard')
    async update(
        @Path() projectUuid: string,
        @Path() dashboardUuidOrSlug: string,
        @Body() body: UpdateDashboard,
        @Request() req: express.Request,
    ): Promise<ApiDashboardResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getDashboardService()
                .update(toSessionUser(req.account), dashboardUuidOrSlug, body, {
                    projectUuid,
                }),
        };
    }

    /**
     * Delete a dashboard by uuid or slug within a project
     * @summary Delete dashboard
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('/{dashboardUuidOrSlug}')
    @OperationId('deleteProjectDashboard')
    async delete(
        @Path() projectUuid: string,
        @Path() dashboardUuidOrSlug: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        await this.services
            .getDashboardService()
            .delete(toSessionUser(req.account), dashboardUuidOrSlug, {
                projectUuid,
            });
        this.setStatus(200);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Gets all comments for a dashboard within a project
     * @summary Get comments
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{dashboardUuidOrSlug}/comments')
    @OperationId('getProjectDashboardComments')
    async getComments(
        @Path() projectUuid: string,
        @Path() dashboardUuidOrSlug: string,
        @Request() req: express.Request,
    ): Promise<ApiGetComments> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getCommentService()
                .findCommentsForDashboard(
                    toSessionUser(req.account),
                    dashboardUuidOrSlug,
                    {
                        projectUuid,
                    },
                ),
        };
    }
}
