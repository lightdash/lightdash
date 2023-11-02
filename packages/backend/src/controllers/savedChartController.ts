import {
    ApiErrorPayload,
    ApiGetChartHistoryResponse,
    ApiGetChartVersionResponse,
    ApiSuccessEmpty,
    FiltersResponse,
} from '@lightdash/common';
import { Body, Get, Post } from '@tsoa/runtime';
import express from 'express';
import {
    Controller,
    Middlewares,
    OperationId,
    Path,
    Request,
    Response,
    Route,
    SuccessResponse,
    Tags,
} from 'tsoa';
import { projectService, savedChartsService } from '../services/services';
import {
    allowApiKeyAuthentication,
    isAuthenticated,
    unauthorisedInDemo,
} from './authentication';
import { ApiRunQueryResponse } from './runQueryController';

@Route('/api/v1/saved/{chartUuid}')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Charts')
export class SavedChartController extends Controller {
    /**
     * Run a query for a chart
     * @param chartUuid chartUuid for the chart to run
     * @param filters dashboard filters
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/results')
    @OperationId('postChartResults')
    async postDashboardTile(
        @Body() body: { filters?: FiltersResponse; invalidateCache?: boolean },
        @Path() chartUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiRunQueryResponse> {
        this.setStatus(200);
        return {
            status: 'ok',
            results: await projectService.runViewChartQuery({
                user: req.user!,
                chartUuid,
                filters: body.filters,
                versionUuid: undefined,
                invalidateCache: body.invalidateCache,
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
            results: await savedChartsService.getHistory(req.user!, chartUuid),
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
            results: await savedChartsService.getVersion(
                req.user!,
                chartUuid,
                versionUuid,
            ),
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
            results: await projectService.runViewChartQuery({
                user: req.user!,
                chartUuid,
                filters: undefined,
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
        await savedChartsService.rollback(req.user!, chartUuid, versionUuid);
        return {
            status: 'ok',
            results: undefined,
        };
    }
}
