import {
    ApiContentVerificationDeleteResponse,
    ApiContentVerificationResponse,
    ApiErrorPayload,
    ApiPromoteDashboardResponse,
    ApiPromotionChangesResponse,
    ApiSuccessEmpty,
    assertRegisteredAccount,
    type ApiCreateDashboardSchedulerResponse,
    type ApiDashboardSchedulersResponse,
    type ApiGetDashboardHistoryResponse,
    type ApiGetDashboardVersionResponse,
} from '@lightdash/common';
import {
    Delete,
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
import { toSessionUser } from '../auth/account';
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
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getPromoteService()
                .promoteDashboard(toSessionUser(req.account), dashboardUuid),
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
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getPromoteService()
                .getPromoteDashboardDiff(
                    toSessionUser(req.account),
                    dashboardUuid,
                ),
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
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getDashboardService()
                .getHistory(toSessionUser(req.account), dashboardUuid),
        };
    }

    /**
     * Get specific dashboard version
     * @summary Get dashboard version
     * @param dashboardUuid dashboardUuid for the dashboard
     * @param versionUuid versionUuid for the dashboard version
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/version/{versionUuid}')
    @OperationId('getDashboardVersion')
    async getDashboardVersion(
        @Path() dashboardUuid: string,
        @Path() versionUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiGetDashboardVersionResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getDashboardService()
                .getVersion(
                    toSessionUser(req.account),
                    dashboardUuid,
                    versionUuid,
                ),
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
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        await this.services
            .getDashboardService()
            .rollback(toSessionUser(req.account), dashboardUuid, versionUuid);
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
        assertRegisteredAccount(req.account);

        const schedulers = await this.services
            .getDashboardService()
            .getSchedulers(toSessionUser(req.account), dashboardUuid);

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
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getDashboardService()
                .createScheduler(
                    toSessionUser(req.account),
                    dashboardUuid,
                    req.body,
                ),
        };
    }

    /**
     * Verify a dashboard
     * @summary Verify dashboard
     * @param dashboardUuid The uuid of the dashboard to verify
     * @param req
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('verification')
    @OperationId('verifyDashboard')
    async verifyDashboard(
        @Path() dashboardUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiContentVerificationResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getDashboardService()
                .verifyDashboard(toSessionUser(req.account), dashboardUuid),
        };
    }

    /**
     * Remove verification from a dashboard
     * @summary Unverify dashboard
     * @param dashboardUuid The uuid of the dashboard to unverify
     * @param req
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('verification')
    @OperationId('unverifyDashboard')
    async unverifyDashboard(
        @Path() dashboardUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiContentVerificationDeleteResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        await this.services
            .getDashboardService()
            .unverifyDashboard(toSessionUser(req.account), dashboardUuid);
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
