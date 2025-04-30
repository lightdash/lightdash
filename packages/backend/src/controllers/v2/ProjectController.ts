import {
    ApiErrorPayload,
    ApiGetAsyncQueryResults,
    ApiSuccessEmpty,
    ExecuteAsyncSqlQueryRequestParams,
    QueryExecutionContext,
    type ApiExecuteAsyncQueryResults,
    type ExecuteAsyncDashboardChartRequestParams,
    type ExecuteAsyncMetricQueryRequestParams,
    type ExecuteAsyncSavedChartRequestParams,
    type ExecuteAsyncUnderlyingDataRequestParams,
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
    @Post('{projectUuid}/query/{queryUuid}/cancel')
    @OperationId('cancelAsyncQuery')
    async cancelAsyncQuery(
        @Path() projectUuid: string,
        @Path() queryUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);

        await this.services.getProjectService().cancelAsyncQuery({
            user: req.user!,
            projectUuid,
            queryUuid,
        });

        return {
            status: 'ok',
            results: undefined,
        };
    }

    @Hidden()
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('{projectUuid}/query/metric-query')
    @OperationId('executeAsyncMetricQuery')
    async executeAsyncMetricQuery(
        @Body()
        body: ExecuteAsyncMetricQueryRequestParams,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiExecuteAsyncQueryResponse> {
        this.setStatus(200);
        const context = body.context ?? getContextFromHeader(req);

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
                user: req.user!,
                projectUuid,
                invalidateCache: body.invalidateCache,
                metricQuery,
                context: context ?? QueryExecutionContext.API,
                granularity: body.query.granularity,
            });

        return {
            status: 'ok',
            results,
        };
    }

    @Hidden()
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('{projectUuid}/query/sql')
    @OperationId('executeAsyncSqlQuery')
    async executeAsyncSqlQuery(
        @Body()
        body: ExecuteAsyncSqlQueryRequestParams,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiExecuteAsyncQueryResponse> {
        this.setStatus(200);
        const context = body.context ?? getContextFromHeader(req);

        const results = await this.services
            .getProjectService()
            .executeAsyncSqlQuery({
                user: req.user!,
                projectUuid,
                invalidateCache: body.invalidateCache ?? false,
                sql: body.sql,
                context: context ?? QueryExecutionContext.SQL_RUNNER,
            });

        return {
            status: 'ok',
            results,
        };
    }

    @Hidden()
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('{projectUuid}/query/chart')
    @OperationId('executeAsyncSavedChartQuery')
    async executeAsyncSavedChartQuery(
        @Body()
        body: ExecuteAsyncSavedChartRequestParams,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiExecuteAsyncQueryResponse> {
        this.setStatus(200);

        const context = body.context ?? getContextFromHeader(req);

        const results = await this.services
            .getProjectService()
            .executeAsyncSavedChartQuery({
                user: req.user!,
                projectUuid,
                invalidateCache: body.invalidateCache,
                chartUuid: body.chartUuid,
                versionUuid: body.versionUuid,
                context: context ?? QueryExecutionContext.API,
            });

        return {
            status: 'ok',
            results,
        };
    }

    @Hidden()
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('{projectUuid}/query/dashboard-chart')
    @OperationId('executeAsyncDashboardChartQuery')
    async executeAsyncDashboardChartQuery(
        @Body()
        body: ExecuteAsyncDashboardChartRequestParams,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiExecuteAsyncQueryResponse> {
        this.setStatus(200);

        const context = body.context ?? getContextFromHeader(req);

        const results = await this.services
            .getProjectService()
            .executeAsyncDashboardChartQuery({
                user: req.user!,
                projectUuid,
                invalidateCache: body.invalidateCache,
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

    @Hidden()
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('{projectUuid}/query/underlying-data')
    @OperationId('executeAsyncUnderlyingDataQuery')
    async executeAsyncUnderlyingDataQuery(
        @Body()
        body: ExecuteAsyncUnderlyingDataRequestParams,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiExecuteAsyncQueryResponse> {
        this.setStatus(200);

        const context = body.context ?? getContextFromHeader(req);

        const results = await this.services
            .getProjectService()
            .executeAsyncUnderlyingDataQuery({
                user: req.user!,
                projectUuid,
                invalidateCache: body.invalidateCache,
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
}
