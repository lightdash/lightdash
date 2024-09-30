import {
    ApiErrorPayload,
    ApiPromoteDashboardResponse,
    ApiPromotionChangesResponse,
} from '@lightdash/common';
import {
    Get,
    Middlewares,
    OperationId,
    Path,
    Post,
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

@Route('/api/v1/dashboards/{dashboardUuid}')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Dashboards')
export class DashboardController extends BaseController {
    /**
     * Promote dashboard to its upstream project
     * @param dashboardUuid dashboardUuid for the dashboard to run
     * @param req express request
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/promote')
    @OperationId('promoteDashboard')
    async promoteDashboard(
        @Path() dashboardUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiPromoteDashboardResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getPromoteService()
                .promoteDashboard(req.user!, dashboardUuid),
        };
    }

    /**
     * Get diff from dashboard to promote
     * @param dashboardUuid dashboardUuid for the dashboard to check diff
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/promoteDiff')
    @OperationId('promoteDashboardDiff')
    async promoteDashboardDiff(
        @Path() dashboardUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiPromotionChangesResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getPromoteService()
                .getPromoteDashboardDiff(req.user!, dashboardUuid),
        };
    }
}
