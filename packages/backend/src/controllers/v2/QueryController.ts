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
@Tags('Query')
export class QueryController extends BaseController {
    /**
     * Get results from an asynchronous query
     *
     * Retrieves paginated results from a previously executed async query using its UUID.
     * Use this endpoint to fetch query results after the query has completed execution.
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{queryUuid}')
    @OperationId('getAsyncQueryResults')
    async getAsyncQueryResults(
        @Path()
        projectUuid: string,
        /** The UUID of the async query to retrieve results for */
        @Path()
        queryUuid: string,
        @Request() req: express.Request,
        /** Page number for pagination (starts at 1) */
        @Query()
        page?: number,
        /** Number of results per page (default: 500, max: 5000) */
        @Query()
        pageSize?: number,
    ): Promise<ApiGetAsyncQueryResultsResponse> {
        this.setStatus(200);

        const results = await this.services
            .getAsyncQueryService()
            .getAsyncQueryResults({
                account: req.account!,
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

    /**
     * Cancel an asynchronous query
     *
     * Cancels a running async query. Once cancelled, the query cannot be resumed
     * and any partial results will be discarded.
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{queryUuid}/cancel')
    @OperationId('cancelAsyncQuery')
    async cancelAsyncQuery(
        @Path() projectUuid: string,
        /** The UUID of the async query to cancel */
        @Path() queryUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccessEmpty> {
        this.setStatus(200);

        await this.services.getAsyncQueryService().cancelAsyncQuery({
            account: req.account!,
            projectUuid,
            queryUuid,
        });

        return {
            status: 'ok',
            results: undefined,
        };
    }

    /**
     * Execute an asynchronous metric query
     *
     * Executes a metric query asynchronously against your data warehouse.
     * Returns a query UUID that can be used to fetch results once the query completes.
     * Metric queries are built using dimensions, metrics, filters, and sorts from your dbt models.
     */
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
                account: req.account!,
                projectUuid,
                invalidateCache: body.invalidateCache,
                metricQuery,
                context: context ?? QueryExecutionContext.API,
                dateZoom: body.dateZoom,
                parameters: body.parameters,
            });

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Execute an asynchronous saved chart query
     *
     * Executes a saved chart query asynchronously. Saved charts contain pre-configured
     * metric queries that can be executed with optional parameter overrides.
     */
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
                account: req.account!,
                projectUuid,
                invalidateCache: body.invalidateCache,
                chartUuid: body.chartUuid,
                versionUuid: body.versionUuid,
                context: context ?? QueryExecutionContext.API,
                limit: body.limit,
                parameters: body.parameters,
            });

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Execute an asynchronous dashboard chart query
     *
     * Executes a chart within a dashboard context asynchronously. Dashboard charts
     * inherit dashboard-level filters and may have additional contextual parameters.
     */
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
                account: req.account!,
                projectUuid,
                invalidateCache: body.invalidateCache,
                chartUuid: body.chartUuid,
                dashboardUuid: body.dashboardUuid,
                dashboardFilters: body.dashboardFilters,
                dashboardSorts: body.dashboardSorts,
                dateZoom: body.dateZoom,
                limit: body.limit,
                context: context ?? QueryExecutionContext.API,
                parameters: body.parameters,
            });

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Execute an asynchronous underlying data query
     *
     * Executes a query to retrieve the underlying raw data for a specific metric or dimension.
     * This is useful for drilling down into the data behind aggregated values.
     */
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
                account: req.account!,
                projectUuid,
                invalidateCache: body.invalidateCache,
                underlyingDataSourceQueryUuid:
                    body.underlyingDataSourceQueryUuid,
                filters: body.filters,
                underlyingDataItemId: body.underlyingDataItemId,
                context: context ?? QueryExecutionContext.API,
                dateZoom: body.dateZoom,
                limit: body.limit,
                parameters: body.parameters,
            });

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Execute an asynchronous SQL query
     *
     * Executes a raw SQL query asynchronously against your data warehouse.
     * This allows for custom queries beyond the metric layer capabilities.
     */
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
                account: req.account!,
                projectUuid,
                invalidateCache: body.invalidateCache ?? false,
                sql: body.sql,
                context: context ?? QueryExecutionContext.SQL_RUNNER,
                pivotConfiguration: body.pivotConfiguration,
                limit: body.limit,
                parameters: body.parameters,
            });

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Execute an asynchronous SQL chart query
     *
     * Executes a saved SQL chart query asynchronously. SQL charts are custom visualizations
     * built from raw SQL queries with optional chart configurations.
     */
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
                account: req.account!,
                projectUuid,
                invalidateCache: body.invalidateCache ?? false,
                context: context ?? QueryExecutionContext.SQL_RUNNER,
                limit: body.limit,
                parameters: body.parameters,
                ...(isExecuteAsyncSqlChartByUuidParams(body)
                    ? { savedSqlUuid: body.savedSqlUuid }
                    : { slug: body.slug }),
            });

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Execute an asynchronous dashboard SQL chart query
     *
     * Executes a SQL chart within a dashboard context asynchronously. Dashboard SQL charts
     * can inherit dashboard-level filters and contextual parameters.
     */
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
                account: req.account!,
                projectUuid,
                invalidateCache: body.invalidateCache ?? false,
                dashboardUuid: body.dashboardUuid,
                tileUuid: body.tileUuid,
                dashboardFilters: body.dashboardFilters,
                dashboardSorts: body.dashboardSorts,
                context: context ?? QueryExecutionContext.SQL_RUNNER,
                limit: body.limit,
                parameters: body.parameters,
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
     * Stream query results
     *
     * Streams query results directly from storage as a JSON stream.
     * Use this endpoint for large result sets to avoid memory issues.
     * The response is streamed as newline-delimited JSON (NDJSON).
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{queryUuid}/results')
    @Hidden() // This endpoint is temporary while we migrate SQL runner to use pagination. Should not be part of API docs.
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
                account: req.account!,
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

    /**
     * Download query results
     *
     * Downloads query results in various formats (CSV, XLSX, JSON).
     * Supports custom formatting options like column ordering, hidden fields,
     * and pivot configurations.
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{queryUuid}/download')
    @OperationId('downloadResults')
    async downloadResults(
        @Path() projectUuid: string,
        /** The UUID of the completed async query to download */
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
            account: req.account!,
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
