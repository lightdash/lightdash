import {
    AnyType,
    ApiDownloadActivity,
    ApiErrorPayload,
    ApiJobScheduledResponse,
    ApiUserActivity,
    ApiUserActivityDownloadCsv,
    ApiValidateResponse,
    ApiValidationDismissResponse,
    getRequestMethod,
    LightdashRequestMethodHeader,
    ValidationTarget,
} from '@lightdash/common';
import {
    Body,
    Delete,
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
    async getUserActivity(
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
    async exportUserActivityCsv(
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
     * Two pagination modes are supported:
     *  - Offset mode: pass `page` (1-indexed) and `pageSize`. Response includes
     *    `page`/`totalResults`/`totalPageCount`.
     *  - Cursor mode: pass `cursor` (from a previous response's `nextCursor`) and
     *    `pageSize`. `page` is ignored when `cursor` is provided. Avoids the count
     *    query so `page`/`totalResults`/`totalPageCount` are null in the response.
     * @summary Get download activity log
     * @param pageSize number of items per page
     * @param page page number (1-indexed); defaults to 1 if omitted
     * @param cursor opaque cursor from a previous response's `nextCursor`
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
        @Query() pageSize: number,
        @Query() page?: number,
        @Query() cursor?: string,
    ): Promise<ApiDownloadActivity> {
        this.setStatus(200);
        const results = await req.services
            .getAnalyticsService()
            .getDownloadActivity(
                projectUuid,
                req.account!,
                { page: page ?? 1, pageSize },
                cursor,
            );
        return {
            status: 'ok',
            results,
        };
    }
}
