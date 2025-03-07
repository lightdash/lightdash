import {
    ApiErrorPayload,
    isPaginatedMetricQueryRequest,
    isPaginatedQueryIdRequest,
    ParameterError,
    type ApiPaginatedQueryResults,
    type PaginatedQueryRequest,
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
import type { ApiRunPaginatedQueryResponse } from '../runQueryController';

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
        body: PaginatedQueryRequest,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiRunPaginatedQueryResponse> {
        let results: ApiPaginatedQueryResults | undefined;

        if (isPaginatedQueryIdRequest(body)) {
            results = await this.services
                .getProjectService()
                .runPaginatedQueryIdQuery({
                    user: req.user!,
                    projectUuid,
                    page: body.page,
                    pageSize: body.pageSize,
                    context: getContextFromHeader(req),
                    queryId: body.queryId,
                    fields: body.fields,
                    exploreName: body.exploreName, // TODO paginate: needed until we have the metadata for the queryId
                });
        } else if (isPaginatedMetricQueryRequest(body)) {
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

            results = await this.services
                .getProjectService()
                .runPaginatedMetricQuery({
                    user: req.user!,
                    projectUuid,
                    page: body.page,
                    pageSize: body.pageSize,
                    context: getContextFromHeader(req),
                    metricQuery,
                    csvLimit: body.query.csvLimit,
                });
        }

        if (!results) {
            this.setStatus(400);
            throw new ParameterError('Invalid query');
        }

        this.setStatus(200);

        return {
            status: 'ok',
            results,
        };
    }
}
