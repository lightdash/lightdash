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
} from '@lightdash/common';
import {
    Body,
    Deprecated,
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
import {
    allowApiKeyAuthentication,
    deprecatedResultsRoute,
    isAuthenticated,
} from './authentication';
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
    @Deprecated()
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        deprecatedResultsRoute,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/explores/{exploreId}/runUnderlyingDataQuery')
    @OperationId('postRunUnderlyingDataQuery')
    async postUnderlyingData(
        @Body() body: MetricQueryRequest,
        @Path() projectUuid: string,
        @Path() exploreId: string,
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
                    projectUuid,
                },
            );

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
                req.account!,
                metricQuery,
                projectUuid,
                exploreId,
                body.csvLimit,
                context,
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
    @Deprecated()
    @Middlewares([
        allowApiKeyAuthentication,
        isAuthenticated,
        deprecatedResultsRoute,
    ])
    @SuccessResponse('200', 'Success')
    @Post('/explores/{exploreId}/runQuery')
    @OperationId('RunMetricQuery')
    async runMetricQuery(
        @Body() body: MetricQueryRequest,
        @Path() projectUuid: string,
        @Path() exploreId: string,

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
                    projectUuid,
                },
            );

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
                req.account!,
                metricQuery,
                projectUuid,
                exploreId,
                body.csvLimit,
                body.dateZoom,
                context,
            );
        this.setStatus(200);
        return {
            status: 'ok',
            results,
        };
    }
}
