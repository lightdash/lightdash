import {
    AnyType,
    ApiErrorPayload,
    ApiExecuteAsyncDashboardChartQueryResults,
    ApiExecuteAsyncDashboardSqlChartQueryResults,
    ApiExecuteAsyncSqlQueryResults,
    ApiGetAsyncQueryResults,
    ApiSuccess,
    ApiSuccessEmpty,
    DownloadAsyncQueryResultsRequestParams,
    ExecuteAsyncSqlQueryRequestParams,
    isExecuteAsyncDashboardSqlChartByUuidParams,
    isExecuteAsyncSqlChartByUuidParams,
    QueryExecutionContext,
    type ApiDownloadAsyncQueryResults,
    type ApiDownloadAsyncQueryResultsAsCsv,
    type ApiDownloadAsyncQueryResultsAsXlsx,
    type ApiExecuteAsyncMetricQueryResults,
    type ExecuteAsyncDashboardChartRequestParams,
    type ExecuteAsyncDashboardSqlChartRequestParams,
    type ExecuteAsyncMetricQueryRequestParams,
    type ExecuteAsyncSavedChartRequestParams,
    type ExecuteAsyncSqlChartRequestParams,
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

@Route('/api/v2/projects/{projectUuid}/query')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Query')
export class QueryController extends BaseController {
    @Hidden()
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{queryUuid}')
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
            .getAsyncQueryService()
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
    @Post('/{queryUuid}/cancel')
    @OperationId('cancelAsyncQuery')
    async cancelAsyncQuery(
        @Path() projectUuid: string,
        @Path() queryUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);

        await this.services.getAsyncQueryService().cancelAsyncQuery({
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
    @Post('/metric-query')
    @OperationId('executeAsyncMetricQuery')
    async executeAsyncMetricQuery(
        @Body()
        body: ExecuteAsyncMetricQueryRequestParams,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccess<ApiExecuteAsyncMetricQueryResults>> {
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
            .getAsyncQueryService()
            .executeAsyncMetricQuery({
                user: req.user!,
                projectUuid,
                invalidateCache: body.invalidateCache,
                metricQuery,
                context: context ?? QueryExecutionContext.API,
                dateZoom: body.dateZoom,
            });

        return {
            status: 'ok',
            results,
        };
    }

    @Hidden()
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/chart')
    @OperationId('executeAsyncSavedChartQuery')
    async executeAsyncSavedChartQuery(
        @Body()
        body: ExecuteAsyncSavedChartRequestParams,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccess<ApiExecuteAsyncMetricQueryResults>> {
        this.setStatus(200);

        const context = body.context ?? getContextFromHeader(req);

        const results = await this.services
            .getAsyncQueryService()
            .executeAsyncSavedChartQuery({
                user: req.user!,
                projectUuid,
                invalidateCache: body.invalidateCache,
                chartUuid: body.chartUuid,
                versionUuid: body.versionUuid,
                context: context ?? QueryExecutionContext.API,
                limit: body.limit,
            });

        return {
            status: 'ok',
            results,
        };
    }

    @Hidden()
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/dashboard-chart')
    @OperationId('executeAsyncDashboardChartQuery')
    async executeAsyncDashboardChartQuery(
        @Body()
        body: ExecuteAsyncDashboardChartRequestParams,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccess<ApiExecuteAsyncDashboardChartQueryResults>> {
        this.setStatus(200);

        const context = body.context ?? getContextFromHeader(req);

        const results = await this.services
            .getAsyncQueryService()
            .executeAsyncDashboardChartQuery({
                user: req.user!,
                projectUuid,
                invalidateCache: body.invalidateCache,
                chartUuid: body.chartUuid,
                dashboardUuid: body.dashboardUuid,
                dashboardFilters: body.dashboardFilters,
                dashboardSorts: body.dashboardSorts,
                dateZoom: body.dateZoom,
                limit: body.limit,
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
    @Post('/underlying-data')
    @OperationId('executeAsyncUnderlyingDataQuery')
    async executeAsyncUnderlyingDataQuery(
        @Body()
        body: ExecuteAsyncUnderlyingDataRequestParams,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccess<ApiExecuteAsyncMetricQueryResults>> {
        this.setStatus(200);

        const context = body.context ?? getContextFromHeader(req);

        const results = await this.services
            .getAsyncQueryService()
            .executeAsyncUnderlyingDataQuery({
                user: req.user!,
                projectUuid,
                invalidateCache: body.invalidateCache,
                underlyingDataSourceQueryUuid:
                    body.underlyingDataSourceQueryUuid,
                filters: body.filters,
                underlyingDataItemId: body.underlyingDataItemId,
                context: context ?? QueryExecutionContext.API,
                dateZoom: body.dateZoom,
            });

        return {
            status: 'ok',
            results,
        };
    }

    @Hidden()
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/sql')
    @OperationId('executeAsyncSqlQuery')
    async executeAsyncSqlQuery(
        @Body()
        body: ExecuteAsyncSqlQueryRequestParams,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccess<ApiExecuteAsyncSqlQueryResults>> {
        this.setStatus(200);
        const context = body.context ?? getContextFromHeader(req);

        const results = await this.services
            .getAsyncQueryService()
            .executeAsyncSqlQuery({
                user: req.user!,
                projectUuid,
                invalidateCache: body.invalidateCache ?? false,
                sql: body.sql,
                context: context ?? QueryExecutionContext.SQL_RUNNER,
                pivotConfiguration: body.pivotConfiguration,
                limit: body.limit,
            });

        return {
            status: 'ok',
            results,
        };
    }

    @Hidden()
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/sql-chart')
    @OperationId('executeAsyncSqlChartQuery')
    async executeAsyncSqlChartQuery(
        @Body()
        body: ExecuteAsyncSqlChartRequestParams,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccess<ApiExecuteAsyncSqlQueryResults>> {
        this.setStatus(200);
        const context = body.context ?? getContextFromHeader(req);

        const results = await this.services
            .getAsyncQueryService()
            .executeAsyncSqlChartQuery({
                user: req.user!,
                projectUuid,
                invalidateCache: body.invalidateCache ?? false,
                context: context ?? QueryExecutionContext.SQL_RUNNER,
                limit: body.limit,
                ...(isExecuteAsyncSqlChartByUuidParams(body)
                    ? { savedSqlUuid: body.savedSqlUuid }
                    : { slug: body.slug }),
            });

        return {
            status: 'ok',
            results,
        };
    }

    @Hidden()
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/dashboard-sql-chart')
    @OperationId('executeAsyncDashboardSqlChartQuery')
    async executeAsyncDashboardSqlChartQuery(
        @Body()
        body: ExecuteAsyncDashboardSqlChartRequestParams,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccess<ApiExecuteAsyncDashboardSqlChartQueryResults>> {
        this.setStatus(200);
        const context = body.context ?? getContextFromHeader(req);

        const results = await this.services
            .getAsyncQueryService()
            .executeAsyncDashboardSqlChartQuery({
                user: req.user!,
                projectUuid,
                invalidateCache: body.invalidateCache ?? false,
                dashboardUuid: body.dashboardUuid,
                tileUuid: body.tileUuid,
                dashboardFilters: body.dashboardFilters,
                dashboardSorts: body.dashboardSorts,
                context: context ?? QueryExecutionContext.SQL_RUNNER,
                limit: body.limit,
                ...(isExecuteAsyncDashboardSqlChartByUuidParams(body)
                    ? { savedSqlUuid: body.savedSqlUuid }
                    : { slug: body.slug }),
            });

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Stream results from S3
     */
    @Hidden()
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{queryUuid}/results')
    @OperationId('getResultsStream')
    async getResultsStream(
        @Path() projectUuid: string,
        @Path() queryUuid: string,
        @Request() req: express.Request,
    ): Promise<AnyType> {
        this.setStatus(200);
        this.setHeader('Content-Type', 'application/json');

        const readStream = await this.services
            .getAsyncQueryService()
            .getResultsStream({
                user: req.user!,
                projectUuid,
                queryUuid,
            });

        const { res } = req;
        if (res) {
            readStream.pipe(res);
            await new Promise<void>((resolve, reject) => {
                readStream.on('end', () => {
                    res.end();
                    resolve();
                });
            });
        }
    }

    @Hidden()
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{queryUuid}/download')
    @OperationId('downloadResults')
    async downloadResults(
        @Path() projectUuid: string,
        @Path() queryUuid: string,
        @Request() req: express.Request,
        @Body() body: Omit<DownloadAsyncQueryResultsRequestParams, 'queryUuid'>,
    ): Promise<
        ApiSuccess<
            | ApiDownloadAsyncQueryResults
            | ApiDownloadAsyncQueryResultsAsCsv
            | ApiDownloadAsyncQueryResultsAsXlsx
        >
    > {
        this.setStatus(200);

        const results = await this.services.getAsyncQueryService().download({
            user: req.user!,
            projectUuid,
            queryUuid,
            type: body.type,
            onlyRaw: body.onlyRaw,
            showTableNames: body.showTableNames,
            customLabels: body.customLabels,
            columnOrder: body.columnOrder,
            hiddenFields: body.hiddenFields,
            pivotConfig: body.pivotConfig,
            attachmentDownloadName: body.attachmentDownloadName,
        });

        return {
            status: 'ok',
            results,
        };
    }
}
