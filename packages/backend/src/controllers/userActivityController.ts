import {
    ApiDownloadActivity,
    ApiErrorPayload,
    ApiUserActivity,
    ApiUserActivityDownloadCsv,
    KnexPaginateArgs,
} from '@lightdash/common';
import {
    Get,
    Middlewares,
    OperationId,
    Path,
    Post,
    Query,
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
    unauthorisedInDemo,
} from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/analytics/user-activity')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Projects')
export class UserActivityController extends BaseController {
    /**
     * Get user activity for a project
     * @summary Get user activity
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Get('/{projectUuid}')
    @OperationId('getUserActivity')
    async get(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<ApiUserActivity> {
        this.setStatus(200);
        const userActivity = await req.services
            .getAnalyticsService()
            .getUserActivity(projectUuid, req.account!);
        return {
            status: 'ok',
            results: userActivity,
        };
    }

    /**
     * Download user activity as CSV
     * @summary Download user activity CSV
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/{projectUuid}/download')
    @OperationId('downloadUserActivityCsv')
    async post(
        @Request() req: express.Request,
        @Path() projectUuid: string,
    ): Promise<ApiUserActivityDownloadCsv> {
        this.setStatus(200);
        const userActivity = await req.services
            .getAnalyticsService()
            .exportUserActivityRawCsv(projectUuid, req.account!);
        return {
            status: 'ok',
            results: userActivity,
        };
    }

    /**
     * Get download activity log for a project, ordered by most recent first.
     * @summary Get download activity log
     * @param page page number (1-indexed)
     * @param pageSize number of items per page
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Get('/{projectUuid}/download-activity')
    @OperationId('getDownloadActivity')
    async getDownloadActivity(
        @Request() req: express.Request,
        @Path() projectUuid: string,
        @Query() page?: number,
        @Query() pageSize?: number,
    ): Promise<ApiDownloadActivity> {
        this.setStatus(200);

        let paginateArgs: KnexPaginateArgs | undefined;
        if (page && pageSize) {
            paginateArgs = { page, pageSize };
        }

        const results = await req.services
            .getAnalyticsService()
            .getDownloadActivity(projectUuid, req.account!, paginateArgs);
        return {
            status: 'ok',
            results,
        };
    }
}
