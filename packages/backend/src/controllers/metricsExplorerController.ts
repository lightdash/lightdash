import {
    ApiCompiledQueryResults,
    ApiErrorPayload,
    MetricExplorerQuery,
    MetricTotalComparisonType,
    TimeDimensionConfig,
    type ApiMetricsExplorerQueryResults,
    type ApiMetricsExplorerTotalResults,
    type FilterRule,
    type TimeFrames,
} from '@lightdash/common';
import {
    Body,
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
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

@Route('/api/v1/projects/{projectUuid}/metricsExplorer')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('Metrics Explorer', 'Metrics', 'Explorer')
export class MetricsExplorerController extends BaseController {
    /**
     * Run a metrics explorer query
     * @summary Run metric explorer query
     * @param projectUuid The project UUID
     * @param explore The explore name
     * @param metric The metric name
     * @returns The results of the query
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{explore}/{metric}/runMetricExplorerQuery')
    @OperationId('runMetricExplorerQuery')
    async runMetricExplorerQuery(
        @Path() projectUuid: string,
        @Path() explore: string,
        @Path() metric: string,
        @Request() req: express.Request,
        @Query() startDate: string,
        @Query() endDate: string,
        @Body()
        body: {
            timeDimensionOverride?: TimeDimensionConfig;
            query: MetricExplorerQuery;
            filter?: FilterRule;
        },
    ): Promise<ApiMetricsExplorerQueryResults> {
        this.setStatus(200);

        if (!startDate || !endDate) {
            throw new Error('startDate and endDate are required');
        }

        const results = await this.services
            .getMetricsExplorerService()
            .runMetricExplorerQuery(
                req.user!,
                projectUuid,
                explore,
                metric,
                startDate,
                endDate,
                body.query,
                body?.timeDimensionOverride,
                body?.filter,
            );

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Run a metric total query with comparison
     * @summary Run metric total query
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{explore}/{metric}/runMetricTotal')
    @OperationId('runMetricTotal')
    async runMetricTotal(
        @Path() projectUuid: string,
        @Path() explore: string,
        @Path() metric: string,
        @Request() req: express.Request,
        @Query() timeFrame: TimeFrames,
        @Query() granularity: TimeFrames,
        @Query() startDate: string,
        @Query() endDate: string,
        @Body()
        body?: {
            comparisonType?: MetricTotalComparisonType;
            rollingDays?: number;
        },
    ): Promise<ApiMetricsExplorerTotalResults> {
        this.setStatus(200);

        const results = await this.services
            .getMetricsExplorerService()
            .getMetricTotal(
                req.user!,
                projectUuid,
                explore,
                metric,
                timeFrame,
                granularity,
                startDate,
                endDate,
                body?.comparisonType,
                body?.rollingDays,
            );

        return {
            status: 'ok',
            results,
        };
    }

    /**
     * Compile the metric total query SQL
     * @summary Compile metric total query
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/{explore}/{metric}/compileMetricTotalQuery')
    @OperationId('compileMetricTotalQuery')
    async compileMetricTotalQuery(
        @Path() projectUuid: string,
        @Path() explore: string,
        @Path() metric: string,
        @Request() req: express.Request,
        @Query() timeFrame: TimeFrames,
        @Query() granularity: TimeFrames,
        @Query() startDate: string,
        @Query() endDate: string,
        @Body()
        body?: {
            comparisonType?: MetricTotalComparisonType;
            rollingDays?: number;
        },
    ): Promise<{ status: 'ok'; results: ApiCompiledQueryResults }> {
        this.setStatus(200);

        const results = await this.services
            .getMetricsExplorerService()
            .compileMetricTotalQuery(
                req.user!,
                projectUuid,
                explore,
                metric,
                timeFrame,
                granularity,
                startDate,
                endDate,
                body?.comparisonType,
                body?.rollingDays,
            );

        return {
            status: 'ok',
            results,
        };
    }
}
