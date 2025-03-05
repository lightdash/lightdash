import {
    AdditionalMetric,
    AnyType,
    ApiErrorPayload,
    ApiQueryResults,
    CacheMetadata,
    Item,
    MetricQuery,
    MetricQueryRequest,
    MetricQueryResponse,
    QueryExecutionContext,
    type ApiPaginatedQueryResults,
    type ItemsMap,
} from '@lightdash/common';
import {
    Body,
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
import { getContextFromHeader } from '../analytics/LightdashAnalytics';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

export type ApiRunQueryResponse = {
    status: 'ok';
    results: {
        metricQuery: MetricQueryResponse; // tsoa doesn't support complex types like MetricQuery
        cacheMetadata: CacheMetadata;
        rows: AnyType[];
        fields?: Record<string, Item | AdditionalMetric>;
    };
};

export type ApiPaginatedRunQueryResponse = {
    status: 'ok';
    results: ApiPaginatedQueryResults;
};

@Route('/api/v1/projects/{projectUuid}')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Exploring')
export class RunViewChartQueryController extends BaseController {
    /**
     * Run a query for underlying data results
     * @param projectUuid The uuid of the project
     * @param body metricQuery for the chart to run
     * @param exploreId table name
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/explores/{exploreId}/runUnderlyingDataQuery')
    @OperationId('postRunUnderlyingDataQuery')
    async postUnderlyingData(
        @Body() body: MetricQueryRequest,
        @Path() projectUuid: string,
        @Path() exploreId: string,
        @Request() req: express.Request,
    ): Promise<ApiRunQueryResponse> {
        const metricQuery: MetricQuery = {
            exploreName: body.exploreName,
            dimensions: body.dimensions,
            metrics: body.metrics,
            filters: body.filters,
            sorts: body.sorts,
            limit: body.limit,
            tableCalculations: body.tableCalculations,
            additionalMetrics: body.additionalMetrics,
            customDimensions: body.customDimensions,
        };

        const results: ApiQueryResults = await this.services
            .getProjectService()
            .runUnderlyingDataQuery(
                req.user!,
                metricQuery,
                projectUuid,
                exploreId,
                body.csvLimit,
                getContextFromHeader(req),
            );
        this.setStatus(200);
        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Run a query for explore
     * @param projectUuid The uuid of the project
     * @param body metricQuery for the chart to run
     * @param exploreId table name
     * @param req express request
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/explores/{exploreId}/runQuery')
    @OperationId('RunMetricQuery')
    async runMetricQuery(
        @Body() body: MetricQueryRequest,
        @Path() projectUuid: string,
        @Path() exploreId: string,

        @Request() req: express.Request,
    ): Promise<ApiRunQueryResponse> {
        const metricQuery: MetricQuery = {
            exploreName: body.exploreName,
            dimensions: body.dimensions,
            metrics: body.metrics,
            filters: body.filters,
            sorts: body.sorts,
            limit: body.limit,
            tableCalculations: body.tableCalculations,
            additionalMetrics: body.additionalMetrics,
            customDimensions: body.customDimensions,
            timezone: body.timezone,
            metricOverrides: body.metricOverrides,
        };
        const results: ApiQueryResults = await this.services
            .getProjectService()
            .runExploreQuery(
                req.user!,
                metricQuery,
                projectUuid,
                exploreId,
                body.csvLimit,
                body.granularity,
                getContextFromHeader(req),
            );
        this.setStatus(200);
        return {
            status: 'ok',
            results,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/explores/{exploreName}/runPaginatedQuery')
    @OperationId('RunPaginatedQuery')
    async runPaginatedQuery(
        @Body()
        body: (MetricQueryRequest | { queryId: string; fields: ItemsMap }) & {
            page: number;
            pageSize: number;
        },
        @Path() projectUuid: string,
        @Path() exploreName: string,
        @Request() req: express.Request,
    ): Promise<ApiPaginatedRunQueryResponse> {
        const queryParams =
            'queryId' in body
                ? {
                      queryId: body.queryId,
                      fields: body.fields,
                  }
                : {
                      metricQuery: {
                          exploreName: body.exploreName,
                          dimensions: body.dimensions,
                          metrics: body.metrics,
                          filters: body.filters,
                          sorts: body.sorts,
                          limit: body.limit,
                          tableCalculations: body.tableCalculations,
                          additionalMetrics: body.additionalMetrics,
                          customDimensions: body.customDimensions,
                          timezone: body.timezone,
                          metricOverrides: body.metricOverrides,
                      },
                      csvLimit: body.csvLimit,
                  };

        const results = await this.services
            .getProjectService()
            .runPaginatedExploreQuery({
                user: req.user!,
                projectUuid,
                exploreName,
                page: body.page,
                pageSize: body.pageSize,
                context: getContextFromHeader(req),
                ...queryParams,
            });

        this.setStatus(200);

        return {
            status: 'ok',
            results,
        };
    }
}
