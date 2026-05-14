import {
    AnyType,
    ApiCalculateTotalResponse,
    ApiContentVerificationDeleteResponse,
    ApiContentVerificationResponse,
    ApiErrorPayload,
    ApiExportChartImageResponse,
    ApiGetChartHistoryResponse,
    ApiGetChartVersionResponse,
    ApiPromoteChartResponse,
    ApiPromotionChangesResponse,
    ApiSuccessEmpty,
    assertRegisteredAccount,
    DateZoom,
    QueryExecutionContext,
    SortField,
    type ApiCreateSavedChartSchedulerResponse,
    type ApiSavedChartSchedulersResponse,
    type ParametersValuesMap,
} from '@lightdash/common';
import {
    Body,
    Delete,
    Deprecated,
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
    getContextFromHeader,
    getContextFromQueryOrHeader,
} from '../analytics/LightdashAnalytics';
import { toSessionUser } from '../auth/account';
import {
    allowApiKeyAuthentication,
    deprecatedResultsRoute,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';
import { BaseController } from './baseController';
import { ApiRunQueryResponse } from './runQueryController';

@Route('/api/v1/saved/{chartUuid}')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Charts')
export class SavedChartController extends BaseController {
    /**
     * Run a query for a chart
     * @summary Run chart query
     * @param chartUuid chartUuid for the chart to run
     * @param body
     * @param body.dashboardFilters dashboard filters
     * @param body.invalidateCache invalidate cache
     * @param req express request
     */
    @Deprecated()
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        deprecatedResultsRoute,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/results')
    @OperationId('PostChartResults')
    async postChartResults(
        @Body()
        body: {
            invalidateCache?: boolean;
        },
        @Path() chartUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiRunQueryResponse> {
        assertRegisteredAccount(req.account);
        const context = getContextFromQueryOrHeader(req);

        await this.services
            .getLightdashAnalyticsService()
            .trackDeprecatedRouteCalled(
                {
                    event: 'deprecated_route.called',
                    userId: toSessionUser(req.account).userUuid,
                    properties: {
                        route: req.path,
                        context: context ?? QueryExecutionContext.API,
                    },
                },
                {
                    chartUuid,
                },
            );

        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services.getProjectService().runViewChartQuery({
                account: req.account,
                chartUuid,
                versionUuid: undefined,
                invalidateCache: body.invalidateCache,
                context,
            }),
        };
    }

    /**
     * Get chart and run query with dashboard filters
     * @summary Get chart and results
     */
    @Deprecated()
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/chart-and-results')
    @OperationId('PostDashboardTile')
    async postDashboardTile(
        @Body()
        body: {
            dashboardFilters: AnyType; // DashboardFilters; temp disable validation
            invalidateCache?: boolean;
            dashboardSorts: SortField[];
            dashboardUuid: string;
            dateZoom?: DateZoom;
            autoRefresh?: boolean;
        },
        @Path() chartUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiRunQueryResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getProjectService()
                .getChartAndResults({
                    account: req.account!,
                    chartUuid,
                    dashboardFilters: body.dashboardFilters,
                    invalidateCache: body.invalidateCache,
                    dashboardSorts: body.dashboardSorts,
                    dateZoom: body.dateZoom,
                    dashboardUuid: body.dashboardUuid,
                    autoRefresh: body.autoRefresh,
                    context: getContextFromQueryOrHeader(req),
                }),
        };
    }

    /**
     * Get chart version history from last 30 days
     * @summary Get chart version history
     * @param chartUuid chartUuid for the chart
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/history')
    @OperationId('GetChartHistory')
    async getChartHistory(
        @Path() chartUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiGetChartHistoryResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSavedChartService()
                .getHistory(toSessionUser(req.account), chartUuid),
        };
    }

    /**
     * Get chart version
     * @summary Get chart version
     * @param chartUuid chartUuid for the chart
     * @param versionUuid versionUuid for the chart version
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/version/{versionUuid}')
    @OperationId('GetChartVersion')
    async getChartVersion(
        @Path() chartUuid: string,
        @Path() versionUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiGetChartVersionResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSavedChartService()
                .getVersion(toSessionUser(req.account), chartUuid, versionUuid),
        };
    }

    /**
     * Run a query for a chart version
     * @summary Get chart version results
     * @param chartUuid chartUuid for the chart to run
     * @param versionUuid versionUuid for the chart version
     * @param req express request
     */
    @Deprecated()
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        deprecatedResultsRoute,
    ])
    @SuccessResponse('200', 'Success')
    @Post('version/{versionUuid}/results')
    @OperationId('getChartVersionResults')
    async getChartVersionResults(
        @Path() chartUuid: string,
        @Path() versionUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiRunQueryResponse> {
        assertRegisteredAccount(req.account);
        const context = getContextFromHeader(req);
        await this.services
            .getLightdashAnalyticsService()
            .trackDeprecatedRouteCalled(
                {
                    event: 'deprecated_route.called',
                    userId: toSessionUser(req.account).userUuid,
                    properties: {
                        route: req.path,
                        context: context ?? QueryExecutionContext.API,
                    },
                },
                {
                    chartUuid,
                },
            );

        this.setStatus(200);

        return {
            status: 'ok',
            results: await this.services.getProjectService().runViewChartQuery({
                account: req.account,
                chartUuid,
                versionUuid,
                context,
            }),
        };
    }

    /**
     * Rollback chart to version
     * @summary Rollback chart to version
     * @param chartUuid chartUuid for the chart to run
     * @param versionUuid versionUuid for the chart version
     * @param req express request
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/rollback/{versionUuid}/')
    @OperationId('postChartVersionRollback')
    async postChartVersionRollback(
        @Path() chartUuid: string,
        @Path() versionUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        await this.services
            .getSavedChartService()
            .rollback(toSessionUser(req.account), chartUuid, versionUuid);
        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Calculate metric totals from a saved chart
     * @summary Calculate total from saved chart
     * @param chartUuid chartUuid for the chart to run
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/calculate-total')
    @OperationId('CalculateTotalFromSavedChart')
    async calculateTotalFromSavedChart(
        @Path() chartUuid: string,
        @Body()
        body: {
            dashboardFilters?: AnyType; // DashboardFilters; temp disable validation
            invalidateCache?: boolean;
            parameters?: ParametersValuesMap;
        },
        @Request() req: express.Request,
    ): Promise<ApiCalculateTotalResponse> {
        this.setStatus(200);
        const totalResult = await this.services
            .getAsyncQueryService()
            .calculateTotalFromSavedChart(
                req.account!,
                chartUuid,
                body.dashboardFilters,
                body.invalidateCache,
                body.parameters,
            );
        return {
            status: 'ok',
            results: totalResult,
        };
    }

    /**
     * Promote chart to its upstream project
     * @summary Promote chart
     * @param chartUuid chartUuid for the chart to run
     * @param req express request
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/promote')
    @OperationId('promoteChart')
    async promoteChart(
        @Path() chartUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiPromoteChartResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getPromoteService()
                .promoteChart(toSessionUser(req.account), chartUuid),
        };
    }

    /**
     * Get diff from chart to promote
     * @summary Get chart promotion diff
     * @param chartUuid chartUuid for the chart to check diff
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/promoteDiff')
    @OperationId('promoteChartDiff')
    async promoteChartDiff(
        @Path() chartUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiPromotionChangesResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getPromoteService()
                .getPromoteChartDiff(toSessionUser(req.account), chartUuid),
        };
    }

    /**
     * Get schedulers for a saved chart
     * @summary List saved chart schedulers
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/schedulers')
    @OperationId('getSavedChartSchedulers')
    @Deprecated()
    async getSavedChartSchedulers(
        @Path() chartUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSavedChartSchedulersResponse> {
        assertRegisteredAccount(req.account);

        const schedulers = await this.services
            .getSavedChartService()
            .getSchedulers(toSessionUser(req.account), chartUuid);

        this.setStatus(200);

        return {
            status: 'ok',
            results: schedulers.data,
        };
    }

    /**
     * Create a scheduler for a saved chart
     * @summary Create saved chart scheduler
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/schedulers')
    @OperationId('createSavedChartScheduler')
    async createSavedChartScheduler(
        @Path() chartUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiCreateSavedChartSchedulerResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSavedChartService()
                .createScheduler(
                    toSessionUser(req.account),
                    chartUuid,
                    req.body,
                ),
        };
    }

    /**
     * Export a saved chart as a PNG image
     * @summary Export chart image
     * @param chartUuid chartUuid for the chart to export
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/export')
    @OperationId('exportSavedChartImage')
    async exportSavedChartImage(
        @Path() chartUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiExportChartImageResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getUnfurlService()
                .exportChart(chartUuid, toSessionUser(req.account)),
        };
    }

    /**
     * Verify a chart
     * @summary Verify chart
     * @param chartUuid The uuid of the chart to verify
     * @param req
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Post('verification')
    @OperationId('verifyChart')
    async verifyChart(
        @Path() chartUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiContentVerificationResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSavedChartService()
                .verifyChart(toSessionUser(req.account), chartUuid),
        };
    }

    /**
     * Remove verification from a chart
     * @summary Unverify chart
     * @param chartUuid The uuid of the chart to unverify
     * @param req
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        unauthorisedInDemo,
    ])
    @SuccessResponse('200', 'Success')
    @Delete('verification')
    @OperationId('unverifyChart')
    async unverifyChart(
        @Path() chartUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiContentVerificationDeleteResponse> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        await this.services
            .getSavedChartService()
            .unverifyChart(toSessionUser(req.account), chartUuid);
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
