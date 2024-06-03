import {
    ApiCalculateTotalResponse,
    ApiErrorPayload,
    ApiGetChartHistoryResponse,
    ApiGetChartVersionResponse,
    ApiPromoteChartResponse,
    ApiSuccessEmpty,
    DateGranularity,
    SortField,
} from '@lightdash/common';
import {
    Body,
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
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/results')
    @OperationId('postChartResults')
    async postChartResults(
        @Body()
        body: {
            invalidateCache?: boolean;
        },
        @Path() chartUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiRunQueryResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services.getProjectService().runViewChartQuery({
                user: req.user!,
                chartUuid,
                versionUuid: undefined,
                invalidateCache: body.invalidateCache,
            }),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/chart-and-results')
    @OperationId('postChartResults')
    async postDashboardTile(
        @Body()
        body: {
            dashboardFilters: any; // DashboardFilters; temp disable validation
            invalidateCache?: boolean;
            dashboardSorts: SortField[];
            dashboardUuid: string;
            granularity?: DateGranularity;
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
                    user: req.user!,
                    chartUuid,
                    dashboardFilters: body.dashboardFilters,
                    invalidateCache: body.invalidateCache,
                    dashboardSorts: body.dashboardSorts,
                    granularity: body.granularity,
                    dashboardUuid: body.dashboardUuid,
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
    @OperationId('get')
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
    @OperationId('get')
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
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('version/{versionUuid}/results')
    @OperationId('getChartVersionResults')
    async getChartVersionResults(
        @Path() chartUuid: string,
        @Path() versionUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiRunQueryResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await this.services.getProjectService().runViewChartQuery({
                user: req.user!,
                chartUuid,
                versionUuid,
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
            dashboardFilters?: any; // DashboardFilters; temp disable validation
            invalidateCache?: boolean;
        },
        @Request() req: express.Request,
    ): Promise<ApiCalculateTotalResponse> {
        this.setStatus(200);
        const totalResult = await this.services
            .getProjectService()
            .calculateTotalFromSavedChart(
                req.user!,
                chartUuid,
                body.dashboardFilters,
                body.invalidateCache,
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
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
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
}
