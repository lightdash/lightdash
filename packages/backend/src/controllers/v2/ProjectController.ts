import {
    ApiErrorPayload,
    ApiGetAsyncQueryResults,
    ParameterError,
    QueryExecutionContext,
    isExecuteAsyncDashboardChartRequest,
    isExecuteAsyncMetricQueryRequest,
    isExecuteAsyncSavedChartRequest,
    isExecuteAsyncUnderlyingDataRequest,
    type ApiExecuteAsyncQueryResults,
    type ExecuteAsyncQueryRequestParams,
    type MetricQuery,
} from '@lightdash/common';
import {
    Body,
    Get,
    Hidden,
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
import { getContextFromHeader } from '../../analytics/LightdashAnalytics';
import { allowApiKeyAuthentication, isAuthenticated } from '../authentication';
import { BaseController } from '../baseController';

export type ApiGetAsyncQueryResultsResponse = {
    status: 'ok';
    results: ApiGetAsyncQueryResults;
};

export type ApiExecuteAsyncQueryResponse = {
    status: 'ok';
    results: ApiExecuteAsyncQueryResults;
};

@Route('/api/v2/projects')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Projects')
export class V2ProjectController extends BaseController {
    @Hidden()
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('{projectUuid}/query/{queryUuid}')
    @OperationId('getAsyncQueryResults')
    async getAsyncQueryResults(
        @Path()
        projectUuid: string,
        @Path()
        queryUuid: string,
        @Request() req: express.Request,
        @Query()
        page?: number,
        @Query()
        pageSize?: number,
    ): Promise<ApiGetAsyncQueryResultsResponse> {
        this.setStatus(200);

        const results = await this.services
            .getProjectService()
            .getAsyncQueryResults({
                user: req.user!,
                projectUuid,
                queryUuid,
                page,
                pageSize,
            });

        return {
            status: 'ok',
            results,
        };
    }

    @Hidden()
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('{projectUuid}/query')
    @OperationId('executeAsyncQuery')
    async executeAsyncQuery(
        @Body()
        body: ExecuteAsyncQueryRequestParams,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiExecuteAsyncQueryResponse> {
        this.setStatus(200);

        const context = body.context ?? getContextFromHeader(req);
        const commonArgs = {
            user: req.user!,
            projectUuid,
        };

        if (isExecuteAsyncMetricQueryRequest(body)) {
            const metricQuery: MetricQuery = {
                exploreName: body.query.exploreName,
                dimensions: body.query.dimensions,
                metrics: body.query.metrics,
                filters: body.query.filters,
                sorts: body.query.sorts,
                limit: body.query.limit,
                tableCalculations: body.query.tableCalculations,
                additionalMetrics: body.query.additionalMetrics,
                customDimensions: body.query.customDimensions,
                timezone: body.query.timezone,
                metricOverrides: body.query.metricOverrides,
            };

            const results = await this.services
                .getProjectService()
                .executeAsyncMetricQuery({
                    ...commonArgs,
                    metricQuery,
                    context: context ?? QueryExecutionContext.API,
                    granularity: body.query.granularity,
                });

            return {
                status: 'ok',
                results,
            };
        }

        if (isExecuteAsyncSavedChartRequest(body)) {
            const results = await this.services
                .getProjectService()
                .executeAsyncSavedChartQuery({
                    ...commonArgs,
                    chartUuid: body.chartUuid,
                    versionUuid: body.versionUuid,
                    context: context ?? QueryExecutionContext.API,
                });

            return {
                status: 'ok',
                results,
            };
        }

        if (isExecuteAsyncDashboardChartRequest(body)) {
            const results = await this.services
                .getProjectService()
                .executeAsyncDashboardChartQuery({
                    ...commonArgs,
                    chartUuid: body.chartUuid,
                    dashboardUuid: body.dashboardUuid,
                    dashboardFilters: body.dashboardFilters,
                    dashboardSorts: body.dashboardSorts,
                    granularity: body.granularity,
                    context: context ?? QueryExecutionContext.API,
                });

            return {
                status: 'ok',
                results,
            };
        }

        if (isExecuteAsyncUnderlyingDataRequest(body)) {
            const results = await this.services
                .getProjectService()
                .executeAsyncUnderlyingDataQuery({
                    ...commonArgs,
                    underlyingDataSourceQueryUuid:
                        body.underlyingDataSourceQueryUuid,
                    filters: body.filters,
                    underlyingDataItemId: body.underlyingDataItemId,
                    context: context ?? QueryExecutionContext.API,
                });

            return {
                status: 'ok',
                results,
            };
        }

        this.setStatus(400);
        throw new ParameterError('Invalid async query execution request');
    }
}
