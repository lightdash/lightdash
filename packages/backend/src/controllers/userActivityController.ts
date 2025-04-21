import {
    AnyType,
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
            .getUserActivity(projectUuid, req.user!);
        return {
            status: 'ok',
            results: userActivity,
        };
    }

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
            .exportUserActivityRawCsv(projectUuid, req.user!);
        return {
            status: 'ok',
            results: userActivity,
        };
    }
}
