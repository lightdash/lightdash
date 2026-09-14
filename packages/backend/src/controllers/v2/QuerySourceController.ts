import {
    ApiErrorPayload,
    ApiSuccess,
    QueryExecutionContext,
    QuerySourceType,
    type ApiExecuteSourceQueriesResults,
    type ApiGetSourceQueryStatusResults,
    type ApiListQuerySourcesResults,
    type ApiScanQuerySourceSchemaResults,
    type ExecuteSourceQueriesRequestParams,
    type UUID,
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
     * the warehouse catalog resolved for your credentials, like the SQL
     * runner; the duckdb source has no schema of its own — its tables are the
     * references given to each query.
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
     * Submits one or more source queries through the common interface. Every
     * query body is tagged by sourceType and every query returns a queryUuid,
     * polled with the standard async query results endpoint (or Get source
     * query status for many at once).
     *
     * Queries reference each other's results by nodeId: a duckdb query's
     * references expose other queries' results as tables, named by node id
     * (array shorthand) or by alias (map form, which also accepts queryUuids
     * of results from previous submissions). A referenced result keeps the
     * column names of the query that produced it — field ids for
     * semanticLayer queries, SELECT output names for sql queries.
     *
     * All queries are submitted immediately; a query referencing
     * still-running results waits inside its own execution and fails if a
     * referenced query fails, so no orchestration happens outside the
     * queries themselves. Submit queries one at a time (interactive use) or
     * as a whole pipeline in one call — the two are equivalent, so a
     * serialized multi-query analysis is just the bodies of the queries that
     * were run interactively, with queryUuid references swapped for node
     * ids. Note that results expire: re-run upstream queries whose results
     * have expired instead of referencing their old queryUuids.
     * @summary Execute source queries
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Post('/queries')
    @OperationId('executeSourceQueries')
    async executeSourceQueries(
        @Body() body: ExecuteSourceQueriesRequestParams,
        @Path() projectUuid: string,
        @Request() req: express.Request,
    ): Promise<ApiSuccess<ApiExecuteSourceQueriesResults>> {
        this.setStatus(200);
        const context = body.context ?? getContextFromHeader(req);
        const results = await this.services
            .getQuerySourceService()
            .executeSourceQueries({
                account: req.account!,
                projectUuid,
                queries: body.queries,
                context: context ?? QueryExecutionContext.MULTI_SOURCE_QUERY,
                parameters: body.parameters ?? {},
                // Overrides are a runtime concern (embed, MCP, AI agent); the
                // HTTP API resolves attributes from the account alone
                userAttributeOverrides: {},
                invalidateCache: body.invalidateCache ?? false,
            });
        return { status: 'ok', results };
    }

    /**
     * Gets the status of many submitted queries at once — the standard async
     * query status lifecycle (pending, running, ready, error, ...) plus the
     * error message for failed queries. Poll this after Execute source
     * queries; fetch each ready query's rows with the standard async query
     * results endpoint. Statuses are visible to the query creator only.
     * @summary Get source query status
     */
    @Middlewares([allowApiKeyAuthentication, isAuthenticated])
    @SuccessResponse('200', 'Success')
    @Get('/queries/status')
    @OperationId('getSourceQueryStatus')
    async getSourceQueryStatus(
        @Path() projectUuid: string,
        @Query() queryUuids: UUID[],
        @Request() req: express.Request,
    ): Promise<ApiSuccess<ApiGetSourceQueryStatusResults>> {
        this.setStatus(200);
        const results = await this.services
            .getQuerySourceService()
            .getSourceQueryStatuses(req.account!, projectUuid, queryUuids);
        return { status: 'ok', results };
    }
}
