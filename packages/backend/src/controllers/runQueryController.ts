import {
    AdditionalMetric,
    ApiErrorPayload,
    ApiQueryResults,
    FieldId,
    MetricQuery,
    SortField,
    TableCalculation,
} from '@lightdash/common';
import { Body, Post } from '@tsoa/runtime';
import express from 'express';
import {
    Controller,
    Middlewares,
    OperationId,
    Path,
    Request,
    Response,
    Route,
    SuccessResponse,
} from 'tsoa';
import { projectService } from '../services/services';
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';

type FilterGroupResponse =
    | {
          id: string;
          or: any[];
      }
    | {
          id: string;
          and: any[];
      };
export type Filters = {
    dimensions?: FilterGroupResponse;
    metrics?: FilterGroupResponse;
};
type MetricQueryResponse = {
    dimensions: FieldId[]; // Dimensions to group by in the explore
    metrics: FieldId[]; // Metrics to compute in the explore
    filters: Filters;
    sorts: SortField[]; // Sorts for the data
    limit: number; // Max number of rows to return from query
    tableCalculations: TableCalculation[]; // calculations to append to results
    additionalMetrics?: AdditionalMetric[]; // existing metric type
};
export type ApiRunQueryResponse = {
    status: 'ok';
    results: {
        metricQuery: MetricQueryResponse; // tsoa doesn't support complex types like MetricQuery
        rows: any[];
    };
};

type RunQueryRequest = {
    // tsoa doesn't support complex types like MetricQuery
    dimensions: FieldId[]; // Dimensions to group by in the explore
    metrics: FieldId[]; // Metrics to compute in the explore
    filters: {
        dimensions?: any;
        metrics?: any;
    };
    sorts: SortField[]; // Sorts for the data
    limit: number; // Max number of rows to return from query
    tableCalculations: TableCalculation[]; // calculations to append to results
    additionalMetrics?: AdditionalMetric[]; // existing metric type
    csvLimit?: number;
};

@Route('/api/v1/projects/{projectUuid}')
@Response<ApiErrorPayload>('default', 'Error')
export class RunViewChartQueryController extends Controller {
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
        @Body() body: RunQueryRequest,
        @Path() projectUuid: string,
        @Path() exploreId: string,
        @Request() req: express.Request,
    ): Promise<ApiRunQueryResponse> {
        const metricQuery: MetricQuery = {
            dimensions: body.dimensions,
            metrics: body.metrics,
            filters: body.filters,
            sorts: body.sorts,
            limit: body.limit,
            tableCalculations: body.tableCalculations,
            additionalMetrics: body.additionalMetrics,
        };
        const results: ApiQueryResults =
            await projectService.runUnderlyingDataQuery(
                req.user!,
                metricQuery,
                projectUuid,
                exploreId,
                body.csvLimit,
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
    @OperationId('postRunQuery')
    async postRunQuery(
        @Body() body: RunQueryRequest,
        @Path() projectUuid: string,
        @Path() exploreId: string,

        @Request() req: express.Request,
    ): Promise<ApiRunQueryResponse> {
        const metricQuery: MetricQuery = {
            dimensions: body.dimensions,
            metrics: body.metrics,
            filters: body.filters,
            sorts: body.sorts,
            limit: body.limit,
            tableCalculations: body.tableCalculations,
            additionalMetrics: body.additionalMetrics,
        };
        const results: ApiQueryResults = await projectService.runExploreQuery(
            req.user!,
            metricQuery,
            projectUuid,
            exploreId,
            body.csvLimit,
        );
        this.setStatus(200);
        return {
            status: 'ok',
            results,
        };
    }
}
