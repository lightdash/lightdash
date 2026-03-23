import {
    ApiErrorPayload,
    ApiPromoteDashboardResponse,
    ApiPromotionChangesResponse,
    ApiSuccessEmpty,
    AuthorizationError,
    type ApiCreateDashboardSchedulerResponse,
    type ApiDashboardSchedulersResponse,
    type ApiGetDashboardHistoryResponse,
} from '@lightdash/common';
import {
    Deprecated,
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
     * @summary Promote dashboard
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
     * @summary Get dashboard promotion diff
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

    /**
     * Get dashboard version history
     * @summary Get dashboard history
     * @param dashboardUuid dashboardUuid for the dashboard
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/history')
    @OperationId('getDashboardHistory')
    async getDashboardHistory(
        @Path() dashboardUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiGetDashboardHistoryResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getDashboardService()
                .getHistory(req.user!, dashboardUuid),
        };
    }

    /**
     * Rollback dashboard to a previous version
     * @summary Rollback dashboard version
     * @param dashboardUuid dashboardUuid for the dashboard
     * @param versionUuid versionUuid for the dashboard version to rollback to
     * @param req express request
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/rollback/{versionUuid}')
    @OperationId('postDashboardVersionRollback')
    async postDashboardVersionRollback(
        @Path() dashboardUuid: string,
        @Path() versionUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);
        await this.services
            .getDashboardService()
            .rollback(req.user!, dashboardUuid, versionUuid);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Get schedulers for a dashboard
     * @summary List dashboard schedulers
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/schedulers')
    @OperationId('getDashboardSchedulers')
    @Deprecated()
    async getDashboardSchedulers(
        @Path() dashboardUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiDashboardSchedulersResponse> {
        if (!req.user) {
            throw new AuthorizationError('User session not found');
        }

        const schedulers = await this.services
            .getDashboardService()
            .getSchedulers(req.user, dashboardUuid);

        this.setStatus(200);

        return {
            status: 'ok',
            results: schedulers.data,
        };
    }

    /**
     * Create a scheduler for a dashboard
     * @summary Create dashboard scheduler
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/schedulers')
    @OperationId('createDashboardScheduler')
    async createDashboardScheduler(
        @Path() dashboardUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiCreateDashboardSchedulerResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getDashboardService()
                .createScheduler(req.user!, dashboardUuid, req.body),
        };
    }
}
