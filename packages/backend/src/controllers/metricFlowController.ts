import {
    ApiErrorPayload,
    type FieldValueSearchResult,
} from '@lightdash/common';
import {
    Body,
    Get,
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
import { allowApiKeyAuthentication, isAuthenticated } from './authentication';
import { BaseController } from './baseController';

type MetricFlowFieldsRequest = {
    metrics?: string[];
    dimensions?: Array<{ name: string; grain?: string | null }>;
};

type MetricFlowQueryRequest = {
    metrics: Array<{ name: string }>;
    groupBy?: Array<{ name: string; grain?: string | null }>;
    filters?: unknown;
    orderBy?: Array<{
        metric?: { name: string };
        groupBy?: { name: string; grain?: string | null };
        descending?: boolean;
    }>;
    limit?: number;
};

type MetricFlowQueryResponse = {
    status: string;
    sql?: string | null;
    columns?: Array<{ name: string; type: string }>;
    rows?: Array<Record<string, unknown>>;
    warnings?: string[];
    totalPages?: number;
    error?: string | null;
};

@Route('/api/v1/projects/{projectUuid}/metricflow')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('MetricFlow')
export class MetricFlowController extends BaseController {
    private async getProjectMetricFlowConfig(
        req: express.Request,
        projectUuid: string,
    ) {
        return this.services
            .getProjectService()
            .getResolvedMetricFlowConfig(req.user!, projectUuid);
    }

    private static toJsonResult(query?: MetricFlowQueryResponse | null) {
        if (!query?.columns || !query.rows) return null;

        return {
            schema: {
                fields: query.columns.map((col) => ({
                    name: col.name,
                    type: col.type,
                })),
                primaryKey: [],
                pandas_version: '1.5.0',
            },
            data: query.rows.map((row, index) => ({
                index,
                ...row,
            })),
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/fields')
    @OperationId('GetMetricFlowFields')
    async getFields(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Body() body: MetricFlowFieldsRequest,
    ): Promise<{
        status: 'ok';
        results: { dimensions: unknown[]; metricsForDimensions: unknown[] };
    }> {
        this.setStatus(200);
        const config = await this.getProjectMetricFlowConfig(req, projectUuid);
        const client = req.clients.getMetricFlowClient();

        const [dimensions, metricsForDimensions] = await Promise.all([
            client.getDimensions(
                config.projectId,
                body.metrics,
                config.apiToken,
            ),
            client.getMetricsForDimensions(
                config.projectId,
                body.dimensions ?? [],
                config.apiToken,
            ),
        ]);

        return {
            status: 'ok',
            results: {
                dimensions: dimensions?.dimensions ?? [],
                metricsForDimensions:
                    metricsForDimensions?.metricsForDimensions ?? [],
            },
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/dimension-values')
    @OperationId('GetMetricFlowDimensionValues')
    async getDimensionValues(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Body()
        body: {
            dimension: string;
            metrics?: string[];
            search?: string;
            limit?: number;
            startTime?: string;
            endTime?: string;
        },
    ): Promise<{
        status: 'ok';
        results: FieldValueSearchResult<string>;
    }> {
        this.setStatus(200);
        const config = await this.getProjectMetricFlowConfig(req, projectUuid);
        const client = req.clients.getMetricFlowClient();

        const search = body.search ?? '';
        const limit = body.limit && body.limit > 0 ? body.limit : 50;

        const dimensionValues = await client.getDimensionValues(
            {
                projectId: config.projectId,
                dimension: body.dimension,
                metrics: body.metrics,
                search: body.search,
                limit: body.limit,
                startTime: body.startTime,
                endTime: body.endTime,
            },
            config.apiToken,
        );

        const values =
            (dimensionValues as { dimensionValues?: unknown[] })
                ?.dimensionValues ??
            (dimensionValues as { values?: unknown[] })?.values ??
            [];
        const normalizedSearch = search.toLowerCase();
        const filtered = normalizedSearch
            ? values.filter((value) =>
                  String(value).toLowerCase().includes(normalizedSearch),
              )
            : values;

        return {
            status: 'ok',
            results: {
                search,
                results: filtered.slice(0, limit),
                cached: false,
                refreshedAt: new Date(),
            },
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/metrics/{metricName}/definition')
    @OperationId('GetMetricFlowMetricDefinition')
    async getMetricDefinition(
        @Path() projectUuid: string,
        @Path() metricName: string,
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: unknown | null }> {
        this.setStatus(200);
        const config = await this.getProjectMetricFlowConfig(req, projectUuid);
        const client = req.clients.getMetricFlowClient();
        const metrics = await client.getMetrics(
            config.projectId,
            undefined,
            config.apiToken,
        );
        const metric =
            metrics?.metrics?.find(
                (item) => item.name.toLowerCase() === metricName.toLowerCase(),
            ) ?? null;

        return {
            status: 'ok',
            results: metric,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/metrics/{metricName}/lineage')
    @OperationId('GetMetricFlowMetricLineage')
    async getMetricLineage(
        @Path() projectUuid: string,
        @Path() metricName: string,
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: unknown | null }> {
        this.setStatus(200);
        // Placeholder: MetricFlow REST 尚未提供 lineage，返回 null
        return {
            status: 'ok',
            results: null,
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/queries')
    @OperationId('CreateMetricFlowQuery')
    async createQuery(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Body() body: MetricFlowQueryRequest,
    ): Promise<{
        status: 'ok';
        results: { createQuery: { queryId: string } };
    }> {
        this.setStatus(200);
        const config = await this.getProjectMetricFlowConfig(req, projectUuid);
        const client = req.clients.getMetricFlowClient();
        const results = await client.createQuery(
            {
                ...body,
                projectId: config.projectId,
            },
            config.apiToken,
        );
        return {
            status: 'ok',
            results: {
                createQuery: {
                    queryId: results?.createQuery?.queryId ?? '',
                },
            },
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/queries/{queryId}')
    @OperationId('GetMetricFlowQuery')
    async getQuery(
        @Path() projectUuid: string,
        @Path() queryId: string,
        @Request() req: express.Request,
    ): Promise<{ status: 'ok'; results: { query: unknown } }> {
        this.setStatus(200);
        const config = await this.getProjectMetricFlowConfig(req, projectUuid);
        const client = req.clients.getMetricFlowClient();
        const query = await client.getQuery(
            config.projectId,
            queryId,
            config.apiToken,
        );

        return {
            status: 'ok',
            results: {
                query: query
                    ? {
                          ...query.query,
                          jsonResult: MetricFlowController.toJsonResult(
                              query.query,
                          ),
                      }
                    : null,
            },
        };
    }

    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/compile-sql')
    @OperationId('CompileMetricFlowSql')
    async compileSql(
        @Path() projectUuid: string,
        @Request() req: express.Request,
        @Body() body: MetricFlowQueryRequest,
    ): Promise<{ status: 'ok'; results: unknown }> {
        this.setStatus(200);
        const config = await this.getProjectMetricFlowConfig(req, projectUuid);
        const client = req.clients.getMetricFlowClient();
        const results = await client.compileSql(
            { ...body, projectId: config.projectId },
            config.apiToken,
        );
        return {
            status: 'ok',
            results,
        };
    }
}
