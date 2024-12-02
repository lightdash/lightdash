import {
    ApiErrorPayload,
    MetricExplorerComparison,
    type ApiMetricsExplorerQueryResults,
    type MetricExplorerComparisonType,
    type MetricExplorerDateRange,
} from '@lightdash/common';
import {
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
        @Query() compareToPreviousPeriod?: boolean,
        @Query() compareToMetric?: string,
        @Query() startDate?: string,
        @Query() endDate?: string,
    ): Promise<ApiMetricsExplorerQueryResults> {
        this.setStatus(200);

        let compare: MetricExplorerComparisonType | undefined;
        if (compareToPreviousPeriod) {
            compare = {
                type: MetricExplorerComparison.PREVIOUS_PERIOD,
            };
        }
        if (compareToMetric) {
            compare = {
                type: MetricExplorerComparison.DIFFERENT_METRIC,
                metricName: compareToMetric,
            };
        }

        let dateRange: MetricExplorerDateRange | undefined;
        if (startDate && endDate) {
            dateRange = [new Date(startDate), new Date(endDate)];
        }

        const results = await this.services
            .getMetricsExplorerService()
            .runMetricExplorerQuery(
                req.user!,
                projectUuid,
                explore,
                metric,
                compare,
                dateRange,
            );

        return {
            status: 'ok',
            results,
        };
    }
}
