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
    AuthorizationError,
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
import { deprecatedDownloadCsvRoute } from '../middlewares/deprecation';
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
        const context = getContextFromQueryOrHeader(req);

        await this.services
            .getLightdashAnalyticsService()
            .trackDeprecatedRouteCalled(
                {
                    event: 'deprecated_route.called',
                    userId: req.user!.userUuid,
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
                account: req.account!,
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
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSavedChartService()
                .getHistory(req.user!, chartUuid),
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
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSavedChartService()
                .getVersion(req.user!, chartUuid, versionUuid),
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
        const context = getContextFromHeader(req);
        await this.services
            .getLightdashAnalyticsService()
            .trackDeprecatedRouteCalled(
                {
                    event: 'deprecated_route.called',
                    userId: req.user!.userUuid,
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
                account: req.account!,
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
        this.setStatus(200);
        await this.services
            .getSavedChartService()
            .rollback(req.user!, chartUuid, versionUuid);
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
            .getProjectService()
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
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getPromoteService()
                .promoteChart(req.user!, chartUuid),
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
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getPromoteService()
                .getPromoteChartDiff(req.user!, chartUuid),
        };
    }

    /**
     * Download a CSV from a saved chart uuid
     * @summary Download CSV from saved chart
     * @param req express request
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        deprecatedDownloadCsvRoute,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/downloadCsv')
    @OperationId('DownloadCsvFromSavedChart')
    async DownloadCsvFromSavedChart(
        @Request() req: express.Request,
        @Path() chartUuid: string,
        @Body()
        body: {
            dashboardFilters: AnyType; // DashboardFilters; temp disable validation
            tileUuid?: string;
            // Csv properties
            onlyRaw: boolean;
            csvLimit: number | null | undefined;
        },
    ): Promise<{ status: 'ok'; results: { jobId: string } }> {
        this.setStatus(200);
        const { dashboardFilters, onlyRaw, csvLimit, tileUuid } = body;

        const { jobId } = await req.services
            .getCsvService()
            .scheduleDownloadCsvForChart(
                req.user!,
                chartUuid,
                onlyRaw,
                csvLimit,
                tileUuid,
                dashboardFilters,
            );

        return {
            status: 'ok',
            results: {
                jobId,
            },
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
        if (!req.user) {
            throw new AuthorizationError('User session not found');
        }

        const schedulers = await this.services
            .getSavedChartService()
            .getSchedulers(req.user, chartUuid);

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
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSavedChartService()
                .createScheduler(req.user!, chartUuid, req.body),
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
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getUnfurlService()
                .exportChart(chartUuid, req.user!),
        };
    }

    /**
     * Verify a chart
     * @summary Verify chart
     * @param chartUuid The uuid of the chart to verify
     * @param req
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('200', 'Success')
    @Post('verification')
    @OperationId('verifyChart')
    async verifyChart(
        @Path() chartUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiContentVerificationResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services
                .getSavedChartService()
                .verifyChart(req.user!, chartUuid),
        };
    }

    /**
     * Remove verification from a chart
     * @summary Unverify chart
     * @param chartUuid The uuid of the chart to unverify
     * @param req
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated, unauthorisedInDemo])
    @SuccessResponse('200', 'Success')
    @Delete('verification')
    @OperationId('unverifyChart')
    async unverifyChart(
        @Path() chartUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiContentVerificationDeleteResponse> {
        this.setStatus(200);
        await this.services
            .getSavedChartService()
            .unverifyChart(req.user!, chartUuid);
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
