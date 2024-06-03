import {
    ApiErrorPayload,
    ApiPromoteDashboardResponse,
} from '@lightdash/common';
import {
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
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
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
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
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
}
