import {
    ApiErrorPayload,
    ApiSuccess,
    QueryExecutionContext,
    QuerySourceType,
    type ApiExecuteQueryDagResults,
    type ApiExecuteSourceQueryResults,
    type ApiGetQueryDagResults,
    type ApiListQuerySourcesResults,
    type ApiScanQuerySourceSchemaResults,
    type ExecuteQueryDagRequestParams,
    type ExecuteSourceQueryRequestParams,
    type UUID,
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
import { getContextFromHeader } from '../../analytics/LightdashAnalytics';
import { allowApiKeyAuthentication, isAuthenticated } from '../authentication';
import { BaseController } from '../baseController';

@Route('/api/v2/projects/{projectUuid}/query-sources')
@Response<ApiErrorPayload>('default', 'Error')
@Tags('v2', 'Query Sources')
export class QuerySourceController extends BaseController {
    /**
     * Lists the query sources registered for this deployment. Every source
     * supports the same operations: scan its schema, and submit queries that
     * return a queryUuid whose results are fetched with the standard async
     * query results endpoint. Requires the multi-source-query feature flag.
     * @summary List query sources
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/')
    @OperationId('listQuerySources')
    async listQuerySources(
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccess<ApiListQuerySourcesResults>> {
        this.setStatus(200);
        const results = await this.services
            .getQuerySourceService()
            .listSources(req.account!, projectUuid);
        return { status: 'ok', results };
    }

    /**
     * Scans the schema of one query source into the standard shape: tables
     * with columns of {reference, type}. For the semantic layer, tables are
     * explores and columns are field ids; for warehouse SQL, tables come from
     * the cached warehouse catalog; the duckdb source has no schema of its
     * own — its tables are the references given to each query.
     * @summary Scan query source schema
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/{sourceType}/schema')
    @OperationId('scanQuerySourceSchema')
    async scanQuerySourceSchema(
        @Path() projectUuid: string,
        @Path() sourceType: QuerySourceType,
        @Request() req: express.Request,
    ): Promise<ApiSuccess<ApiScanQuerySourceSchemaResults>> {
        this.setStatus(200);
        const results = await this.services
            .getQuerySourceService()
            .scanSchema(req.account!, projectUuid, sourceType);
        return { status: 'ok', results };
    }

    /**
     * Submits a single query to a source through the common interface. The
     * body is tagged by sourceType, so every source is queried the same way;
     * the returned queryUuid is polled with the standard async query results
     * endpoint. A duckdb query's references must hold queryUuids of existing
     * results here — use the DAG endpoint to reference queries by node id.
     * @summary Execute source query
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/query')
    @OperationId('executeSourceQuery')
    async executeSourceQuery(
        @Body() body: ExecuteSourceQueryRequestParams,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccess<ApiExecuteSourceQueryResults>> {
        this.setStatus(200);
        const context = body.context ?? getContextFromHeader(req);
        const results = await this.services
            .getQuerySourceService()
            .executeSourceQuery({
                account: req.account!,
                projectUuid,
                query: body.query,
                context: context ?? QueryExecutionContext.MULTI_SOURCE_QUERY,
            });
        return { status: 'ok', results };
    }

    /**
     * Executes a DAG of source queries. Each node is a source query with a
     * DAG-unique node id; a duckdb node's references name upstream nodes, and
     * those edges order execution — independent nodes run in parallel, and a
     * node submits once every referenced node's results are ready. The
     * common pattern is n source queries feeding one duckdb node that merges
     * them. Returns immediately with a queryDagUuid to poll via Get query
     * DAG; each node yields its own queryUuid as it is submitted.
     * @summary Execute query DAG
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/dags')
    @OperationId('executeQueryDag')
    async executeQueryDag(
        @Body() body: ExecuteQueryDagRequestParams,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccess<ApiExecuteQueryDagResults>> {
        this.setStatus(200);
        const context = body.context ?? getContextFromHeader(req);
        const results = await this.services
            .getQuerySourceService()
            .executeQueryDag({
                account: req.account!,
                projectUuid,
                nodes: body.nodes,
                context: context ?? QueryExecutionContext.MULTI_SOURCE_QUERY,
            });
        return { status: 'ok', results };
    }

    /**
     * Gets the state of a query DAG: overall status plus per-node status and
     * queryUuid. Fetch each completed node's results with the standard async
     * query results endpoint. DAGs are visible to their creator only.
     * @summary Get query DAG
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/dags/{queryDagUuid}')
    @OperationId('getQueryDag')
    async getQueryDag(
        @Path() projectUuid: string,
        @Path() queryDagUuid: UUID,
        @Request() req: express.Request,
    ): Promise<ApiSuccess<ApiGetQueryDagResults>> {
        this.setStatus(200);
        const results = await this.services
            .getQuerySourceService()
            .getQueryDag(req.account!, projectUuid, queryDagUuid);
        return { status: 'ok', results };
    }
}
