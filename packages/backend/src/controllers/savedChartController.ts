import {
    AnyType,
    ApiCalculateTotalResponse,
    ApiErrorPayload,
    ApiGetChartHistoryResponse,
    ApiGetChartVersionResponse,
    ApiPromoteChartResponse,
    ApiPromotionChangesResponse,
    ApiSuccessEmpty,
    DateZoom,
    QueryExecutionContext,
    SortField,
    type ParametersValuesMap,
} from '@lightdash/common';
import {
    Body,
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
}
