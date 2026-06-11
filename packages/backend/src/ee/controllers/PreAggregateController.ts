import {
    ApiErrorPayload,
    assertRegisteredAccount,
    type ApiGetDashboardPreAggregateAuditResponse,
    type ApiGetPreAggregateMaterializationsResponse,
    type ApiGetPreAggregateStatsResponse,
    type ApiRunDashboardPreAggregateAuditBody,
} from '@lightdash/common';
import {
    Body,
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
import { toSessionUser } from '../../auth/account';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
} from '../../controllers/authentication';
import { BaseController } from '../../controllers/baseController';

@Route('/api/v2/projects/{projectUuid}/pre-aggregates')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Pre-Aggregates')
export class PreAggregateController extends BaseController {
    /**
     * Retrieves aggregated pre-aggregate hit/miss statistics for a project
     * @summary Get pre-aggregate stats
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/stats')
    @OperationId('getPreAggregateStats')
    async getPreAggregateStats(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() days?: number,
        @Query() page?: number,
        @Query() pageSize?: number,
        @Query() exploreName?: string,
        @Query() queryType?: 'chart' | 'dashboard' | 'explorer',
    ): Promise<ApiGetPreAggregateStatsResponse> {
        this.setStatus(200);

        const paginateArgs = page && pageSize ? { page, pageSize } : undefined;

        const filters =
            exploreName || queryType ? { exploreName, queryType } : undefined;

        const results = await this.services
            .getAsyncQueryService()
            .getPreAggregateStats(
                req.account!,
                projectUuid,
                days ?? 3,
                paginateArgs,
                filters,
            );

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Audits pre-aggregate hit/miss coverage for every tile on a dashboard
     * without executing the queries. Returns a per-tile breakdown grouped
     * by tab, suitable for CI coverage checks and pre-aggregate tuning.
     * @summary Get dashboard pre-aggregate audit
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/dashboards/{dashboardUuidOrSlug}/audit')
    @OperationId('getDashboardPreAggregateAudit')
    async getDashboardPreAggregateAudit(
        @Path() projectUuid: string,
        @Path() dashboardUuidOrSlug: string,
        @Request() req: express.Request,
    ): Promise<ApiGetDashboardPreAggregateAuditResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const dashboard = await this.services
            .getDashboardService()
            .getByIdOrSlug(toSessionUser(req.account), dashboardUuidOrSlug, {
                projectUuid,
            });
        const results = await this.services
            .getAsyncQueryService()
            .getDashboardPreAggregateAudit(
                req.account,
                projectUuid,
                dashboard.uuid,
            );
        return { status: 'ok', results };
    }

    /**
     * Audit pre-aggregate hit/miss coverage with runtime filter overrides
     * @summary Run dashboard pre-aggregate audit
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/dashboards/{dashboardUuidOrSlug}/audit')
    @OperationId('runDashboardPreAggregateAudit')
    async runDashboardPreAggregateAudit(
        @Path() projectUuid: string,
        @Path() dashboardUuidOrSlug: string,
        @Body() body: ApiRunDashboardPreAggregateAuditBody,
        @Request() req: express.Request,
    ): Promise<ApiGetDashboardPreAggregateAuditResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const dashboard = await this.services
            .getDashboardService()
            .getByIdOrSlug(toSessionUser(req.account), dashboardUuidOrSlug, {
                projectUuid,
            });
        const results = await this.services
            .getAsyncQueryService()
            .getDashboardPreAggregateAudit(
                req.account,
                projectUuid,
                dashboard.uuid,
                body.dashboardFilters,
            );
        return { status: 'ok', results };
    }

    /**
     * Retrieves pre-aggregate definitions with their latest materialization status
     * @summary Get pre-aggregate materializations
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/materializations')
    @OperationId('getPreAggregateMaterializations')
    async getPreAggregateMaterializations(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Query() page?: number,
        @Query() pageSize?: number,
    ): Promise<ApiGetPreAggregateMaterializationsResponse> {
        this.setStatus(200);

        const paginateArgs = page && pageSize ? { page, pageSize } : undefined;

        const results = await this.services
            .getPreAggregateMaterializationService()
            .getMaterializations(projectUuid, paginateArgs);

        return {
            status: 'ok',
            results,
        };
    }
}
