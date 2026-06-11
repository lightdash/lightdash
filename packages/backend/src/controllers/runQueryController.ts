import {
    AdditionalMetric,
    AnyType,
    ApiErrorPayload,
    ApiQueryResults,
    assertRegisteredAccount,
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
    Extension,
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
import { toSessionUser } from '../auth/account';
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
     * Deprecated — use the v2 Execute underlying data endpoint instead.
     *
     * This endpoint was deprecated on 20 March 2025 and is past its sunset date (30 April 2025) — it may be removed at any time. Migrate to the v2 async query flow: Execute underlying data, then Get results.
     * @summary Run underlying data query
     * @deprecated Use POST /api/v2/projects/{projectUuid}/query/underlying-data instead
     * @param projectUuid The uuid of the project
     * @param body metricQuery for the chart to run
     * @param exploreId table name
     * @param req express request
     */
    @Extension('x-mint', {
        content: `<Warning>
**This endpoint is deprecated and past its sunset date (30 April 2025) — it may be removed at any time.**

Migrate to the v2 async query flow: [Execute underlying data](https://docs.lightdash.com/api-reference/v2/execute-underlying-data) (\`POST /api/v2/projects/{projectUuid}/query/underlying-data\`) to start the query, then [Get results](https://docs.lightdash.com/api-reference/v2/get-results) to fetch rows. See also [Cancel query](https://docs.lightdash.com/api-reference/v2/cancel-query) and [Download results](https://docs.lightdash.com/api-reference/v2/download-results).
</Warning>`,
    })
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
        assertRegisteredAccount(req.account);
        const context = getContextFromHeader(req);
        await this.services
            .getLightdashAnalyticsService()
            .trackDeprecatedRouteCalled(
                {
                    event: 'deprecated_route.called',
                    userId: toSessionUser(req.account).userUuid,
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
                req.account,
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
     * Deprecated — use the v2 Execute metric query endpoint instead.
     *
     * This endpoint was deprecated on 20 March 2025 and is past its sunset date (30 April 2025) — it may be removed at any time. Migrate to the v2 async query flow: Execute metric query, then Get results.
     * @summary Run metric query
     * @deprecated Use POST /api/v2/projects/{projectUuid}/query/metric-query instead
     * @param projectUuid The uuid of the project
     * @param body metricQuery for the chart to run
     * @param exploreId table name
     * @param req express request
     */
    @Extension('x-mint', {
        content: `<Warning>
**This endpoint is deprecated and past its sunset date (30 April 2025) — it may be removed at any time.**

Migrate to the v2 async query flow: [Execute metric query](https://docs.lightdash.com/api-reference/v2/execute-metric-query) (\`POST /api/v2/projects/{projectUuid}/query/metric-query\`) to start the query, then [Get results](https://docs.lightdash.com/api-reference/v2/get-results) to fetch rows. See also [Cancel query](https://docs.lightdash.com/api-reference/v2/cancel-query) and [Download results](https://docs.lightdash.com/api-reference/v2/download-results).
</Warning>`,
    })
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
        assertRegisteredAccount(req.account);
        const context = getContextFromHeader(req);
        await this.services
            .getLightdashAnalyticsService()
            .trackDeprecatedRouteCalled(
                {
                    event: 'deprecated_route.called',
                    userId: toSessionUser(req.account).userUuid,
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
            pivotDimensions: body.pivotDimensions,
            metricOverrides: body.metricOverrides,
            dimensionOverrides: body.dimensionOverrides,
        };
        const results: ApiQueryResults = await this.services
            .getProjectService()
            .runExploreQuery(
                req.account,
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
