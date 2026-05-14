import {
    assertRegisteredAccount,
    type ApiDashboardPaginatedSchedulersResponse,
    type ApiErrorPayload,
    type KnexPaginateArgs,
} from '@lightdash/common';
import {
    Get,
    Middlewares,
    OperationId,
    Path,
    Query,
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
} from '../authentication/middlewares';
import { BaseController } from '../baseController';

@Route('/api/v2/dashboards/{dashboardUuid}')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Dashboards')
export class DashboardControllerV2 extends BaseController {
    /**
     * Get all schedulers for a dashboard
     * @summary List dashboard schedulers
     * @param dashboardUuid The uuid of the dashboard
     * @param req express request
     * @param pageSize number of items per page
     * @param page page number
     * @param searchQuery filter schedulers by name
     * @param includeLatestRun include the most recent run for each scheduler
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/schedulers')
    @OperationId('getDashboardSchedulers')
    async getDashboardSchedulers(
        @Path() dashboardUuid: string,
        @Request() req: express.Request,
        @Query() pageSize?: number,
        @Query() page?: number,
        @Query() searchQuery?: string,
        @Query() includeLatestRun?: boolean,
    ): Promise<ApiDashboardPaginatedSchedulersResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);

        let paginateArgs: KnexPaginateArgs | undefined;
        if (pageSize && page) {
            paginateArgs = {
                page,
                pageSize,
            };
        }

        return {
            status: 'ok',
            results: await this.services
                .getDashboardService()
                .getSchedulers(
                    toSessionUser(req.account),
                    dashboardUuid,
                    searchQuery,
                    paginateArgs,
                    includeLatestRun,
                ),
        };
    }
}
