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
    ForbiddenError,
    isExecuteAsyncDashboardSqlChartByUuidParams,
    isExecuteAsyncSqlChartByUuidParams,
    isJwtUser,
    QueryExecutionContext,
    type ApiDownloadAsyncQueryResults,
    type ApiDownloadAsyncQueryResultsAsCsv,
    type ApiDownloadAsyncQueryResultsAsXlsx,
    type ApiExecuteAsyncMetricQueryResults,
    type ApiJobScheduledResponse,
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
     * Retrieves paginated results from a previously executed async query using its UUID
     * @summary Get results
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
     * Cancels a running async query and discards any partial results
     * @summary Cancel query
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
     * Executes a metric query asynchronously against your data warehouse using dimensions, metrics, filters, and sorts
     * @summary Execute metric query
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
            periodOverPeriod: body.query.periodOverPeriod,
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
                pivotConfiguration: body.pivotConfiguration,
            });

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Executes a saved chart query asynchronously with optional parameter overrides
     * @summary Execute saved chart
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

        if (
            isJwtUser(req.account!) &&
            req.account!.access.content.type !== 'chart'
        ) {
            throw new ForbiddenError('Feature not available for this JWT');
        }

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
                pivotResults: body.pivotResults,
            });

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Executes a chart within a dashboard context asynchronously with inherited dashboard filters
     * @summary Execute dashboard chart
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

        if (req.account!.isJwtUser()) {
            // we need more granular CASTL abilities before enabling this
            throw new ForbiddenError('Feature not available for JWT users');
        }

        const results = await this.services
            .getAsyncQueryService()
            .executeAsyncDashboardChartQuery({
                account: req.account!,
                projectUuid,
                invalidateCache: body.invalidateCache,
                tileUuid: body.tileUuid,
                chartUuid: body.chartUuid,
                dashboardUuid: body.dashboardUuid,
                dashboardFilters: body.dashboardFilters,
                dashboardSorts: body.dashboardSorts,
                dateZoom: body.dateZoom,
                limit: body.limit,
                context: context ?? QueryExecutionContext.API,
                parameters: body.parameters,
                pivotResults: body.pivotResults,
            });

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Executes a query to retrieve underlying raw data for drilling down into aggregated values
     * @summary Execute underlying data
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
     * Executes a raw SQL query asynchronously against your data warehouse for custom queries
     * @summary Execute SQL query
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
     * Executes a saved SQL chart query asynchronously with optional chart configurations
     * @summary Execute SQL chart
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
     * Executes a SQL chart within a dashboard context asynchronously with inherited filters
     * @summary Execute dashboard SQL chart
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
     * Streams query results directly from storage as newline-delimited JSON for large result sets
     * @summary Stream results
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
     * Downloads query results in various formats with custom formatting options
     * @summary Download results
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

    /**
     * Downloads query results in various formats with custom formatting options
     * @summary Download results
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{queryUuid}/schedule-download')
    @OperationId('scheduleDownloadResults')
    async scheduleDownloadResults(
        @Path() projectUuid: string,
        /** The UUID of the completed async query to download */
        @Path() queryUuid: string,
        @Request() req: express.Request,
        @Body() body: Omit<DownloadAsyncQueryResultsRequestParams, 'queryUuid'>,
    ): Promise<ApiJobScheduledResponse> {
        this.setStatus(200);

        const jobId = await this.services
            .getAsyncQueryService()
            .scheduleDownloadAsyncQueryResults({
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
            results: {
                jobId,
            },
        };
    }
}
