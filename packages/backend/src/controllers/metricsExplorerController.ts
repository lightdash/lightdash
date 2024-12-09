import {
    ApiErrorPayload,
    TimeDimensionConfig,
    type ApiMetricsExplorerQueryResults,
    type ApiMetricsExplorerTotalResults,
    type MetricExplorerComparisonType,
    type MetricExplorerDateRange,
    type TimeFrames,
} from '@lightdash/common';
import {
    Body,
    Get,
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
            comparison: MetricExplorerComparisonType;
        },
    ): Promise<ApiMetricsExplorerQueryResults> {
        this.setStatus(200);

        if (!startDate || !endDate) {
            throw new Error('startDate and endDate are required');
        }

        const dateRange: MetricExplorerDateRange = [
            new Date(startDate),
            new Date(endDate),
        ];

        const results = await this.services
            .getMetricsExplorerService()
            .runMetricExplorerQuery(
                req.user!,
                projectUuid,
                explore,
                metric,
                dateRange,
                body.comparison,
                body?.timeDimensionOverride,
            );

        return {
            status: 'ok',
            results,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{explore}/{metric}/runMetricTotal')
    @OperationId('runMetricTotal')
    async runMetricTotal(
        @Path() projectUuid: string,
        @Path() explore: string,
        @Path() metric: string,
        @Request() req: express.Request,
        @Query() timeFrame: TimeFrames,
    ): Promise<ApiMetricsExplorerTotalResults> {
        this.setStatus(200);

        const results = await this.services
            .getMetricsExplorerService()
            .getMetricTotal(req.user!, projectUuid, explore, metric, timeFrame);

        return {
            status: 'ok',
            results,
        };
    }
}
