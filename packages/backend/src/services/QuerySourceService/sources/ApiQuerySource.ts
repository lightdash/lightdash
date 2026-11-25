import {
    assertRegisteredAccount,
    FeatureFlags,
    ParameterError,
    QuerySourceType,
    type ApiSourceQuery,
    type QueryExecutionContext,
    type QuerySourceDefinition,
    type QuerySourceSchema,
    type QuerySourceSchemaTable,
    type RegisteredAccount,
    type SourceQuery,
} from '@lightdash/common';
import type { AsyncQueryService } from '../../AsyncQueryService/AsyncQueryService';
import type { MeteredLiveSource } from '../live/calls';
import type {
    QuerySourceClient,
    ScanSchemaArgs,
    SourceQuerySubmissionResult,
    SubmitSourceQueryArgs,
} from '../types';

/** Looks up the connection's live source, refusing callers who may not use the connection. */
/** The live source for one query; the context decides how long its calls may wait for rate limits. */
export type LiveSourceResolver = (
    account: RegisteredAccount,
    projectUuid: string,
    connectionUuid: string,
    context: QueryExecutionContext,
) => Promise<MeteredLiveSource>;

/** Schema tables of the connections the caller may query, from their last scans. */
export type ApiSchemaTablesResolver = (
    account: RegisteredAccount,
    projectUuid: string,
) => Promise<QuerySourceSchemaTable[]>;

type ApiQuerySourceArguments = {
    asyncQueryService: Pick<AsyncQueryService, 'executeAsyncApiQuery'>;
    getLiveSource: LiveSourceResolver;
    listSchemaTables: ApiSchemaTablesResolver;
};

/**
 * Queries sent live to an external API at question time. Nothing is
 * ingested: each submission calls the API and its rows become the result.
 */
export class ApiQuerySource implements QuerySourceClient {
    readonly definition: QuerySourceDefinition = {
        sourceType: QuerySourceType.API,
        label: 'Live data source',
        description:
            'A query sent live to an external API when the pipeline runs, through one of the project\'s API connections named by connectionUuid. A PostHog connection takes {"kind": "query", "query": "<HogQL>"}: HogQL is ClickHouse SQL over PostHog tables such as events, persons and sessions. Name every column with AS using letters, digits and underscores. Results are capped at limit rows and PostHog stops queries after 10 seconds. Api queries read no other results; join them with a referencing duckdb query.',
    };

    readonly supportsPivot = false;

    readonly requiredFeatureFlags: FeatureFlags[] = [];

    // eslint-disable-next-line class-methods-use-this
    getUnavailableReason(): string | null {
        return null;
    }

    private readonly asyncQueryService: ApiQuerySourceArguments['asyncQueryService'];

    private readonly getLiveSource: LiveSourceResolver;

    private readonly listSchemaTables: ApiSchemaTablesResolver;

    constructor(args: ApiQuerySourceArguments) {
        this.asyncQueryService = args.asyncQueryService;
        this.getLiveSource = args.getLiveSource;
        this.listSchemaTables = args.listSchemaTables;
    }

    private static assertSourceQuery(query: SourceQuery): ApiSourceQuery {
        if (query.sourceType !== QuerySourceType.API) {
            throw new ParameterError(
                `Expected a ${QuerySourceType.API} query, got "${query.sourceType}"`,
            );
        }
        return query;
    }

    async scanSchema({
        account,
        projectUuid,
    }: ScanSchemaArgs): Promise<QuerySourceSchema> {
        assertRegisteredAccount(account);
        return {
            sourceType: QuerySourceType.API,
            tables: await this.listSchemaTables(account, projectUuid),
        };
    }

    // eslint-disable-next-line class-methods-use-this
    getQueryReferences(query: SourceQuery): string[] {
        ApiQuerySource.assertSourceQuery(query);
        return [];
    }

    async submitQuery({
        account,
        projectUuid,
        context,
        querySurface,
        query,
        parameters,
        invalidateCache,
    }: SubmitSourceQueryArgs): Promise<SourceQuerySubmissionResult> {
        const sourceQuery = ApiQuerySource.assertSourceQuery(query);
        assertRegisteredAccount(account);
        const source = await this.getLiveSource(
            account,
            projectUuid,
            sourceQuery.connectionUuid,
            context,
        );
        const { queryUuid } = await this.asyncQueryService.executeAsyncApiQuery(
            {
                account,
                projectUuid,
                connectionUuid: sourceQuery.connectionUuid,
                source,
                payload: sourceQuery.payload,
                limit: sourceQuery.limit,
                parameters,
                invalidateCache,
                context,
                querySurface,
            },
        );
        return { queryUuid, cacheHit: false };
    }
}
