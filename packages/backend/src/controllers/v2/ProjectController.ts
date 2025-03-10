import {
    ApiErrorPayload,
    isPaginatedDashboardChartRequest,
    isPaginatedMetricQueryRequest,
    isPaginatedQueryIdRequest,
    isPaginatedSavedChartRequest,
    ParameterError,
    type ApiPaginatedQueryResults,
    type PaginatedQueryRequestParams,
} from '@lightdash/common';
import {
    Body,
    Hidden,
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
import { getContextFromHeader } from '../../analytics/LightdashAnalytics';
import { allowApiKeyAuthentication, isAuthenticated } from '../authentication';
import { BaseController } from '../baseController';

export type ApiRunPaginatedQueryResponse = {
    status: 'ok';
    results: ApiPaginatedQueryResults;
};

@Route('/api/v2/projects')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Projects')
export class V2ProjectController extends BaseController {
    @Hidden()
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('{projectUuid}/query')
    @OperationId('query')
    async query(
        @Body()
        body: PaginatedQueryRequestParams,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiRunPaginatedQueryResponse> {
        this.setStatus(200);

        const context = body.context ?? getContextFromHeader(req);
        const commonArgs = {
            user: req.user!,
            projectUuid,
            context,
            page: body.page,
            pageSize: body.pageSize,
        };

        if (isPaginatedQueryIdRequest(body)) {
            const results = await this.services
                .getProjectService()
                .runPaginatedQueryIdQuery({
                    ...commonArgs,
                    queryId: body.queryId,
                    fields: body.fields,
                    exploreName: body.exploreName, // TODO paginate: needed until we have the metadata for the queryId,
                });

            return {
                status: 'ok',
                results,
            };
        }

        if (isPaginatedMetricQueryRequest(body)) {
            const metricQuery = {
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
                .getProjectService()
                .runPaginatedMetricQuery({
                    ...commonArgs,
                    metricQuery,
                    csvLimit: body.query.csvLimit,
                });

            return {
                status: 'ok',
                results,
            };
        }

        if (isPaginatedSavedChartRequest(body)) {
            const results = await this.services
                .getProjectService()
                .runPaginatedSavedChartQuery({
                    ...commonArgs,
                    chartUuid: body.chartUuid,
                    versionUuid: body.versionUuid,
                });

            return {
                status: 'ok',
                results,
            };
        }

        if (isPaginatedDashboardChartRequest(body)) {
            const results = await this.services
                .getProjectService()
                .runPaginatedDashboardChartQuery({
                    ...commonArgs,
                    chartUuid: body.chartUuid,
                    dashboardUuid: body.dashboardUuid,
                    dashboardFilters: body.dashboardFilters,
                    dashboardSorts: body.dashboardSorts,
                    granularity: body.granularity,
                });

            return {
                status: 'ok',
                results,
            };
        }

        this.setStatus(400);
        throw new ParameterError('Invalid query');
    }
}
