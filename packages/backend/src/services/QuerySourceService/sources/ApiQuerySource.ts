import {
    assertRegisteredAccount,
    FeatureFlags,
    ParameterError,
    QuerySourceType,
    type ApiSourceQuery,
    type QuerySourceDefinition,
    type QuerySourceSchema,
    type RegisteredAccount,
    type SourceQuery,
} from '@lightdash/common';
import type { AsyncQueryService } from '../../AsyncQueryService/AsyncQueryService';
import type { MeteredApiConnector } from '../api/ApiConnector';
import type {
    QuerySourceClient,
    ScanSchemaArgs,
    SourceQuerySubmissionResult,
    SubmitSourceQueryArgs,
} from '../types';

/** Looks up the connection's connector, refusing callers who may not use the connection. */
export type ApiConnectorResolver = (
    account: RegisteredAccount,
    projectUuid: string,
    connectionUuid: string,
) => Promise<MeteredApiConnector>;

type ApiQuerySourceArguments = {
    asyncQueryService: Pick<AsyncQueryService, 'executeAsyncApiQuery'>;
    getApiConnector: ApiConnectorResolver;
};

/**
 * Queries sent live to an external API at question time. Nothing is
 * ingested: each submission calls the API and its rows become the result.
 */
export class ApiQuerySource implements QuerySourceClient {
    readonly definition: QuerySourceDefinition = {
        sourceType: QuerySourceType.API,
        label: 'Live API',
        description:
            'A query sent live to an external API when the pipeline runs, through one of the project\'s API connections named by connectionUuid. A PostHog connection takes {"kind": "query", "query": "<HogQL>"}: HogQL is ClickHouse SQL over PostHog tables such as events, persons and sessions. Name every column with AS using letters, digits and underscores. Results are capped at limit rows and PostHog stops queries after 10 seconds. Api queries read no other results; join them with a referencing duckdb query.',
    };

    readonly supportsPivot = false;

    readonly requiredFeatureFlags = [FeatureFlags.ApiQuerySources];

    private readonly asyncQueryService: ApiQuerySourceArguments['asyncQueryService'];

    private readonly getApiConnector: ApiConnectorResolver;

    constructor(args: ApiQuerySourceArguments) {
        this.asyncQueryService = args.asyncQueryService;
        this.getApiConnector = args.getApiConnector;
    }

    private static assertSourceQuery(query: SourceQuery): ApiSourceQuery {
        if (query.sourceType !== QuerySourceType.API) {
            throw new ParameterError(
                `Expected a ${QuerySourceType.API} query, got "${query.sourceType}"`,
            );
        }
        return query;
    }

    // eslint-disable-next-line class-methods-use-this
    async scanSchema(_args: ScanSchemaArgs): Promise<QuerySourceSchema> {
        return {
            sourceType: QuerySourceType.API,
            tables: [],
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
        const connector = await this.getApiConnector(
            account,
            projectUuid,
            sourceQuery.connectionUuid,
        );
        const { queryUuid } = await this.asyncQueryService.executeAsyncApiQuery(
            {
                account,
                projectUuid,
                connectionUuid: sourceQuery.connectionUuid,
                connector,
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
