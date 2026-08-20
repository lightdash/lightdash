import {
    AnyType,
    ApiErrorPayload,
    ApiExecuteAsyncDashboardChartQueryResults,
    ApiExecuteAsyncDashboardSqlChartQueryResults,
    ApiExecuteAsyncFieldValueSearchResults,
    ApiExecuteAsyncSqlQueryResults,
    ApiGetAsyncQueryResults,
    ApiSuccess,
    ApiSuccessEmpty,
    assertRegisteredAccount,
    DownloadAsyncQueryResultsRequestParams,
    ExecuteAsyncSqlQueryRequestParams,
    ForbiddenError,
    isExecuteAsyncDashboardSqlChartByUuidParams,
    isExecuteAsyncSqlChartByUuidParams,
    isJwtUser,
    LightdashAppPreviewTokenHeader,
    LightdashSignedDownloadHeader,
    PersistentDownloadFileAccessMode,
    QueryExecutionContext,
    QueryHistorySortBy,
    QueryHistoryStatus,
    QueryHistoryWindow,
    QueryLanguage,
    QueryTrigger,
    type ApiDownloadAsyncQueryResults,
    type ApiDownloadAsyncQueryResultsAsCsv,
    type ApiDownloadAsyncQueryResultsAsXlsx,
    type ApiExecuteAsyncComposeMergeQueryRequest,
    type ApiExecuteAsyncMergeQueryRequest,
    type ApiExecuteAsyncMergeQueryResults,
    type ApiExecuteAsyncMetricQueryResults,
    type ApiJobScheduledResponse,
    type ApiQueryHistoryListResponse,
    type ExecuteAsyncCalculateTotalRequestParams,
    type ExecuteAsyncComposeSqlQueryRequestParams,
    type ExecuteAsyncDashboardChartRequestParams,
    type ExecuteAsyncDashboardSqlChartRequestParams,
    type ExecuteAsyncFieldValueSearchRequestParams,
    type ExecuteAsyncMetricQueryRequestParams,
    type ExecuteAsyncSavedChartRequestParams,
    type ExecuteAsyncSqlChartRequestParams,
    type ExecuteAsyncUnderlyingDataRequestParams,
    type MetricQuery,
    type UUID,
} from '@lightdash/common';
import {
    Body,
    Deprecated,
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
import {
    allowApiKeyAuthentication,
    getDeprecatedRouteMiddleware,
    isAuthenticated,
} from '../authentication';
import { BaseController } from '../baseController';

export type ApiGetAsyncQueryResultsResponse = {
    status: 'ok';
    results: ApiGetAsyncQueryResults;
};

@Route('/api/v2/projects/{projectUuid}/query')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Query')
export class QueryController extends BaseController {
    /**
     * Lists the requesting user's own query history for a project, newest
     * first, with per-trigger and per-window counts.
     *
     * Must stay declared before `getAsyncQueryResults` so the generated
     * `/history` route is matched before `/{queryUuid}`.
     * @summary List my query history
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/history')
    @OperationId('getQueryHistory')
    async getQueryHistory(
        @Path()
        projectUuid: string,
        @Request() req: express.Request,
        /** Page number for pagination (starts at 1) */
        @Query()
        page: number = 1,
        /** Number of results per page (default: 25, max: 100) */
        @Query()
        pageSize: number = 25,
        /** Filter by what triggered the run */
        @Query()
        trigger?: QueryTrigger,
        /** Filter by query language */
        @Query()
        language?: QueryLanguage,
        /** Filter by one or more statuses */
        @Query()
        status?: QueryHistoryStatus[],
        /** Matches explore name, chart/dashboard name, fields and SQL */
        @Query()
        search?: string,
        /** Restrict rows to one disjoint time window */
        @Query()
        window?: QueryHistoryWindow,
        /** Sort order; runtime flattens the windows into one sorted list */
        @Query()
        sortBy?: QueryHistorySortBy,
    ): Promise<ApiQueryHistoryListResponse> {
        this.setStatus(200);

        const results = await this.services
            .getAsyncQueryService()
            .getQueryHistoryList({
                account: req.account!,
                projectUuid,
                filters: {
                    trigger,
                    language,
                    statuses: status,
                    search,
                    window,
                    sortBy,
                },
                paginateArgs: {
                    page,
                    pageSize: Math.min(pageSize, 100),
                },
            });

        return {
            status: 'ok',
            results,
        };
    }

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
     * Calculates totals for a previously-executed query, referenced by its queryUuid. Re-runs the source query's MetricQuery against the warehouse so totals are correct for every metric type (count distinct, average, ratio, etc.) — unlike client-side cell summation, which only works for sum/count. The requested `kind` selects which totals to compute.
     * @summary Calculate totals
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{queryUuid}/calculate-total')
    @OperationId('executeAsyncCalculateTotal')
    async executeAsyncCalculateTotal(
        @Path() projectUuid: string,
        /** The UUID of the previously-executed query to compute totals from */
        @Path() queryUuid: string,
        @Body() body: ExecuteAsyncCalculateTotalRequestParams,
        @Request() req: express.Request,
    ): Promise<ApiSuccess<ApiExecuteAsyncMetricQueryResults>> {
        this.setStatus(200);

        const results = await this.services
            .getAsyncQueryService()
            .executeAsyncCalculateTotalFromQueryHistory({
                account: req.account!,
                projectUuid,
                queryUuid,
                kind: body.kind,
                subtotalDimensions: body.subtotalDimensions,
                invalidateCache: body.invalidateCache,
            });

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Validates and executes a merge as one asynchronous query request.
     * @summary Execute merge query
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/merge-query')
    @OperationId('executeAsyncMergeQuery')
    async executeAsyncMergeQuery(
        @Body() body: ApiExecuteAsyncMergeQueryRequest,
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiSuccess<ApiExecuteAsyncMergeQueryResults>> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const results = await this.services
            .getAsyncQueryService()
            .executeAsyncMergeQuery({
                account: req.account,
                projectUuid,
                mergeQuery: body.mergeQuery,
                context:
                    body.context ??
                    getContextFromHeader(req) ??
                    QueryExecutionContext.API,
                invalidateCache: body.invalidateCache,
                parameters: body.parameters,
                mode: body.mode ?? { type: 'interactive' },
                chart: body.chart,
            });

        return { status: 'ok', results };
    }

    /**
     * Validates and executes a merge on the compose engine as one asynchronous query request. Unlike Execute merge query, sources may reference existing query results by queryUuid; each referenced query is authorized with the same access checks as fetching its results. Requires the merge-on-compose feature flag.
     * @summary Execute compose merge query
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/compose-merge-query')
    @OperationId('executeAsyncComposeMergeQuery')
    async executeAsyncComposeMergeQuery(
        @Body() body: ApiExecuteAsyncComposeMergeQueryRequest,
        @Path() projectUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiSuccess<ApiExecuteAsyncMergeQueryResults>> {
        assertRegisteredAccount(req.account);
        this.setStatus(200);
        const results = await this.services
            .getAsyncQueryService()
            .executeAsyncMergeQuery({
                account: req.account,
                projectUuid,
                mergeQuery: body.mergeQuery,
                context:
                    body.context ??
                    getContextFromHeader(req) ??
                    QueryExecutionContext.API,
                invalidateCache: body.invalidateCache,
                parameters: body.parameters,
                mode: body.mode ?? { type: 'interactive' },
                chart: body.chart,
            });

        return { status: 'ok', results };
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
        const previewTokenHeader =
            req.headers[LightdashAppPreviewTokenHeader.toLowerCase()];
        const dataAppPreviewToken =
            typeof previewTokenHeader === 'string'
                ? previewTokenHeader
                : undefined;

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
            pivotDimensions: body.query.pivotDimensions,
            metricOverrides: body.query.metricOverrides,
            dimensionOverrides: body.query.dimensionOverrides,
        };

        const results = await this.services
            .getAsyncQueryService()
            .executeAsyncMetricQuery({
                account: req.account!,
                projectUuid,
                invalidateCache: body.invalidateCache,
                usePreAggregateCache: body.usePreAggregateCache,
                metricQuery,
                context: context ?? QueryExecutionContext.API,
                dateZoom: body.dateZoom,
                parameters: body.parameters,
                pivotConfiguration: body.pivotConfiguration,
                dashboardFilters: body.dashboardFilters,
                dataAppPreviewToken,
            });

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Searches for unique field values asynchronously, returning a query UUID to poll for results
     * @summary Search field values
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/field-values')
    @OperationId('executeAsyncFieldValueSearch')
    async executeAsyncFieldValueSearch(
        @Body()
        body: ExecuteAsyncFieldValueSearchRequestParams,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccess<ApiExecuteAsyncFieldValueSearchResults>> {
        this.setStatus(200);

        const results = await this.services
            .getAsyncQueryService()
            .executeAsyncFieldValueSearch({
                account: req.account!,
                projectUuid,
                table: body.table,
                fieldId: body.fieldId,
                search: body.search,
                limit: body.limit,
                filters: body.filters,
                forceRefresh: body.forceRefresh,
                invalidateCache: body.invalidateCache,
                parameters: body.parameters,
                context: QueryExecutionContext.FILTER_AUTOCOMPLETE,
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
                filterOverrides: body.filters,
                dashboardFilters: body.dashboardFilters,
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
                sorts: body.sorts,
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
     * Executes a DuckDB SQL query asynchronously on the pre-aggregate DuckDB engine. Requires run-queries access (interactive viewer and up) and the compose-sql-runner feature flag. The references map exposes other async queries' results as named tables the SQL can select from ({"orders": "queryUuid"} lets the SQL run SELECT * FROM orders); each referenced query is authorized with the same access checks as Get results, so you can reference any query you can already fetch by uuid. References to queries that are still running are waited on — this query executes once every referenced result is ready and fails if a referenced query fails. Direct file access in the SQL is rejected. Returns a queryUuid to poll for results via Get results.
     * @summary Execute compose SQL query
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/compose-sql')
    @OperationId('executeAsyncComposeSqlQuery')
    async executeAsyncComposeSqlQuery(
        @Body()
        body: ExecuteAsyncComposeSqlQueryRequestParams,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccess<ApiExecuteAsyncSqlQueryResults>> {
        this.setStatus(200);
        const context = body.context ?? getContextFromHeader(req);

        const results = await this.services
            .getAsyncQueryService()
            .executeAsyncComposeSqlQuery({
                account: req.account!,
                projectUuid,
                sql: body.sql,
                limit: body.limit,
                references: body.references,
                context: context ?? QueryExecutionContext.COMPOSE_SQL_RUNNER,
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
     *
     * @deprecated Use POST /api/v2/projects/{projectUuid}/query/{queryUuid}/schedule-download instead
     */
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        getDeprecatedRouteMiddleware(new Date('2026-06-10'), {
            suffixMessage:
                'Use POST /api/v2/projects/{projectUuid}/query/{queryUuid}/schedule-download instead.',
        }),
    ])
    @SuccessResponse('200', 'Success')
    @Post('/{queryUuid}/download')
    @OperationId('downloadResults')
    @Deprecated()
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
            accessMode: req.account!.isJwtUser()
                ? PersistentDownloadFileAccessMode.SIGNED
                : PersistentDownloadFileAccessMode.AUTHENTICATED_CREATOR,
            projectUuid,
            queryUuid,
            type: body.type,
            onlyRaw: body.onlyRaw,
            showTableNames: body.showTableNames,
            customLabels: body.customLabels,
            columnOrder: body.columnOrder,
            hiddenFields: body.hiddenFields,
            pivotConfig: body.pivotConfig,
            exportPivotedData: body.exportPivotedData,
            attachmentDownloadName: body.attachmentDownloadName,
            conditionalFormattings: body.conditionalFormattings,
            showColumnTotals: body.showColumnTotals,
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

        // The data-app SDK bridge (and CLI preview proxy) stamp this header
        // because the app fetches the resulting fileUrl from a sandboxed,
        // credential-less context — only a SIGNED URL survives that fetch.
        const wantsSignedDownload =
            req.header(LightdashSignedDownloadHeader) === 'true';

        const jobId = await this.services
            .getAsyncQueryService()
            .scheduleDownloadAsyncQueryResults({
                account: req.account!,
                fileAccessMode: wantsSignedDownload
                    ? PersistentDownloadFileAccessMode.SIGNED
                    : undefined,
                projectUuid,
                queryUuid,
                type: body.type,
                onlyRaw: body.onlyRaw,
                showTableNames: body.showTableNames,
                customLabels: body.customLabels,
                columnOrder: body.columnOrder,
                hiddenFields: body.hiddenFields,
                pivotConfig: body.pivotConfig,
                exportPivotedData: body.exportPivotedData,
                attachmentDownloadName: body.attachmentDownloadName,
                conditionalFormattings: body.conditionalFormattings,
                showColumnTotals: body.showColumnTotals,
            });

        return {
            status: 'ok',
            results: {
                jobId,
            },
        };
    }
}
