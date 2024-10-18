import {
    DbtError,
    DbtGraphQLCompileSqlArgs,
    DbtGraphQLCompileSqlResponse,
    DbtGraphQLCreateQueryArgs,
    DbtGraphQLCreateQueryResponse,
    DbtGraphQLDimension,
    DbtGraphQLGetDimensionsArgs,
    DbtGraphQLGetDimensionsResponse,
    DbtGraphQLGetMetricsForDimensionsArgs,
    DbtGraphQLGetMetricsForDimensionsResponse,
    DbtGraphQLGetMetricsResponse,
    DbtGraphQLJsonResult,
    DbtGraphQLMetric,
    DbtGraphQLRunQueryRawResponse,
    DbtQueryStatus,
    DbtSemanticLayerConnection,
    getDefaultedLimit,
    SemanticLayerClient,
    SemanticLayerQuery,
    SemanticLayerResultRow,
    SemanticLayerType,
    SemanticLayerView,
} from '@lightdash/common';
import { GraphQLClient } from 'graphql-request';
import { mapKeys } from 'lodash';
import { URL } from 'url';
import { LightdashConfig } from '../../config/parseConfig';
import { dbtCloudTransfomers } from './transformer';

type DbtCloudGraphqlClientArgs = {
    lightdashConfig: LightdashConfig;
    connectionCredentials: Pick<
        DbtSemanticLayerConnection,
        'environmentId' | 'domain' | 'token'
    >;
};

type GetDimensionsFnArgs = DbtGraphQLGetDimensionsArgs;
type GetMetricsForDimensionsFnArgs = DbtGraphQLGetMetricsForDimensionsArgs;

export default class DbtCloudGraphqlClient implements SemanticLayerClient {
    transformers = dbtCloudTransfomers;

    domain: string;

    bearerToken?: string;

    environmentId?: string;

    maxQueryLimit: number;

    type = SemanticLayerType.DBT;

    constructor({
        lightdashConfig,
        connectionCredentials,
    }: DbtCloudGraphqlClientArgs) {
        this.domain = connectionCredentials.domain;
        this.bearerToken = connectionCredentials.token;
        this.environmentId = connectionCredentials.environmentId;
        this.maxQueryLimit = lightdashConfig.query.maxLimit;
    }

    getMaxQueryLimit() {
        return this.maxQueryLimit;
    }

    getClientInfo() {
        return {
            name: 'dbt',
            features: {
                views: false,
            },
            config: {
                maxQueryLimit: this.getMaxQueryLimit(),
            },
        };
    }

    private getClient() {
        if (!this.domain || !this.bearerToken) {
            throw new Error('DbtCloudGraphqlClient not initialized');
        }

        const endpoint = new URL('/api/graphql', this.domain);
        return new GraphQLClient(endpoint.href, {
            headers: {
                Authorization: `Bearer ${this.bearerToken}`,
                'X-dbt-partner-source': 'lightdash',
            },
        });
    }

    /**
     * Converts CreateQueryArgs to a string that can be used in a GraphQL query
     */
    private static async getPreparedCreateQueryArgs({
        groupBy,
        metrics,
        orderBy,
        where,
    }: Partial<DbtGraphQLCreateQueryArgs | DbtGraphQLCompileSqlArgs>) {
        const metricsString =
            metrics?.map((metric) => `{ name: "${metric.name}" }`) ?? '';
        const groupByString =
            groupBy?.map((g) => {
                if ('grain' in g) {
                    return `{ name: "${g.name}", grain: ${g.grain ?? null} }`;
                }

                return `{ name: "${g.name}" }`;
            }) ?? '';
        const whereString = where?.map((w) => `{ sql: "${w.sql}" }`) ?? '';
        const orderByString =
            orderBy?.map((o) => {
                if ('metric' in o) {
                    return `{ metric: { name: "${o.metric.name}" }, descending: ${o.descending} }`;
                }

                return `{ groupBy: { name: "${o.groupBy.name}" }, descending: ${o.descending} }`;
            }) ?? '';

        return {
            metricsString: `[${metricsString}]`,
            groupByString: `[${groupByString}]`,
            whereString: `[${whereString}]`,
            orderByString: `[${orderByString}]`,
        };
    }

    // eslint-disable-next-line class-methods-use-this
    async getViews(): Promise<SemanticLayerView[]> {
        return this.transformers.viewsToSemanticLayerViews([
            {
                label: 'DBT Semantic View',
                name: 'dbtSemanticView',
                visible: true,
            },
        ]);
    }

    // eslint-disable-next-line class-methods-use-this
    async runGraphQlQuery<T>(query: string): Promise<T> {
        try {
            return await this.getClient().request(query, {
                environmentId: this.environmentId,
            });
        } catch (error) {
            // ! Collecting all errors, we might want to just send the first one so that the string isn't as big
            const errors: string[] | undefined = error?.response?.errors?.map(
                (e: { message: string }) =>
                    this.transformers.errorToReadableError(e.message),
            );

            throw new DbtError(errors?.join('\n'));
        }
    }

    async getResults(
        queryId: string,
        pageNum: number = 1,
    ): Promise<{
        totalPages: number | null;
        results: SemanticLayerResultRow[];
    } | null> {
        const getQueryResultsQuery = `
            query GetQueryResults($environmentId: BigInt!) {
                query(environmentId: $environmentId, queryId: "${queryId}", pageNum: ${pageNum}) {
                    status
                    sql
                    jsonResult
                    totalPages
                    error
                }
            }
        `;

        const { query: rawResponse } =
            await this.runGraphQlQuery<DbtGraphQLRunQueryRawResponse>(
                getQueryResultsQuery,
            );

        if (rawResponse.status === DbtQueryStatus.FAILED) {
            throw new DbtError(
                this.transformers.errorToReadableError(
                    rawResponse.error ?? undefined,
                ),
            );
        }

        const jsonResult = rawResponse.jsonResult
            ? (JSON.parse(
                  Buffer.from(rawResponse.jsonResult, 'base64').toString(),
              ) as DbtGraphQLJsonResult)
            : null;

        if (!jsonResult) return null;

        return {
            totalPages: rawResponse.totalPages,
            results: this.transformers.resultsToResultRows(jsonResult),
        };
    }

    private async *getResultsGenerator(
        queryId: string,
        pageNum: number = 1,
    ): AsyncGenerator<SemanticLayerResultRow[]> {
        let nextPageNum = pageNum;
        let totalPages = 1;

        const result = await this.getResults(queryId, pageNum);

        if (result) {
            nextPageNum += 1;
            totalPages = result.totalPages ?? 1;
            yield result.results;
        }

        if (nextPageNum <= totalPages) {
            yield* this.getResultsGenerator(queryId, nextPageNum);
        }
    }

    async streamResults(
        _projectUuid: string,
        query: SemanticLayerQuery,
        callback: (results: SemanticLayerResultRow[]) => void,
    ): Promise<number> {
        const graphqlArgs = this.transformers.semanticLayerQueryToQuery(query);
        const { groupByString, metricsString, orderByString, whereString } =
            await DbtCloudGraphqlClient.getPreparedCreateQueryArgs(graphqlArgs);
        const defaultedLimit = getDefaultedLimit(
            this.maxQueryLimit,
            graphqlArgs.limit,
        );

        const createQuery = `
            mutation CreateQuery($environmentId: BigInt!) {
                createQuery(
                    environmentId: $environmentId
                    metrics: ${metricsString}
                    groupBy: ${groupByString}
                    limit: ${defaultedLimit}
                    where: ${whereString}
                    orderBy: ${orderByString}
                ) {
                    queryId
                }
            }`;

        const { createQuery: createQueryResponse } =
            await this.runGraphQlQuery<DbtGraphQLCreateQueryResponse>(
                createQuery,
            );

        let rowCount = 0;

        for await (const rows of this.getResultsGenerator(
            createQueryResponse.queryId,
        )) {
            rowCount += rows.length;
            callback(
                rows.map((r) =>
                    mapKeys(r, (_value, key) =>
                        this.transformers.mapResultsKeys(key, query),
                    ),
                ), // dbt cloud might return columns in uppercase
            );
        }

        return rowCount;
    }

    async getSql(query: SemanticLayerQuery) {
        const graphqlArgs = this.transformers.semanticLayerQueryToQuery(query);
        const defaultedLimit = getDefaultedLimit(
            this.maxQueryLimit,
            graphqlArgs.limit,
        );

        const { groupByString, metricsString, orderByString, whereString } =
            await DbtCloudGraphqlClient.getPreparedCreateQueryArgs(graphqlArgs);

        const compileSqlQuery = `
            mutation CompileSql($environmentId: BigInt!) {
                compileSql(
                    environmentId: $environmentId
                    metrics: ${metricsString}
                    groupBy: ${groupByString}
                    limit: ${defaultedLimit}
                    where: ${whereString}
                    orderBy: ${orderByString}
                ) {
                    sql
                }
            }`;

        const response =
            await this.runGraphQlQuery<DbtGraphQLCompileSqlResponse>(
                compileSqlQuery,
            );

        return this.transformers.sqlToString(response.compileSql.sql);
    }

    async getMetrics() {
        const getMetricsQuery = `
            query GetMetrics($environmentId: BigInt!) {
                metrics(environmentId: $environmentId) {
                    name
                    description
                    label
                    type
                    queryableGranularities
                    dimensions {
                        name
                        description
                        label
                        type
                        queryableGranularities
                    }
                }
            }`;

        return this.runGraphQlQuery<DbtGraphQLGetMetricsResponse>(
            getMetricsQuery,
        );
    }

    async getMetricsForDimensions({
        dimensions,
    }: GetMetricsForDimensionsFnArgs) {
        const metricsForDimensionsQuery = `
            query GetMetricsForDimensions($environmentId: BigInt!) {
                metricsForDimensions(environmentId: $environmentId, dimensions: [${dimensions.map(
                    (dimension) => `{ name: "${dimension.name}" }`,
                )}]) {
                    name
                    description
                    label
                    type
                    queryableGranularities
                    dimensions {
                        name
                        description
                        label
                        type
                        queryableGranularities
                    }
                }
            }`;

        return this.runGraphQlQuery<DbtGraphQLGetMetricsForDimensionsResponse>(
            metricsForDimensionsQuery,
        );
    }

    async getDimensions({ metrics }: GetDimensionsFnArgs) {
        const getDimensionsQuery = `
            query GetDimensions($environmentId: BigInt!) {
                dimensions(environmentId: $environmentId, metrics: [${metrics.map(
                    (metric) => `{ name: "${metric.name}" }`,
                )}]) {
                    name
                    description
                    label
                    type
                    queryableGranularities
                }
            }`;

        return this.runGraphQlQuery<DbtGraphQLGetDimensionsResponse>(
            getDimensionsQuery,
        );
    }

    async getFields(
        _: unknown, // there is no concept of views in dbt cloud
        selectedFields: Pick<
            SemanticLayerQuery,
            'dimensions' | 'timeDimensions' | 'metrics'
        >,
    ) {
        // Get all metrics and check which ones are available for the selected dimensions
        const { metrics: allMetrics } = await this.getMetrics();
        const { dimensions: allDimensions } = await this.getDimensions({
            metrics: [],
        });

        const hasSelectedDimensions =
            selectedFields.dimensions.length > 0 ||
            selectedFields.timeDimensions.length > 0;
        const hasSelectedMetrics = selectedFields.metrics.length > 0;

        let availableMetrics: DbtGraphQLMetric[] | undefined;

        if (hasSelectedDimensions) {
            const getMetricsForDimensionsResult =
                await this.getMetricsForDimensions({
                    dimensions: [
                        ...selectedFields.dimensions.map((d) => ({
                            name: d.name,
                        })),
                        ...selectedFields.timeDimensions.map((d) => ({
                            name: d.name,
                        })),
                    ],
                });

            availableMetrics =
                getMetricsForDimensionsResult.metricsForDimensions;
        }

        const metrics = allMetrics.map((metric) => ({
            ...metric,
            // If no dimensions are selected, availableMetrics will be undefined and all metrics will be visible
            visible: availableMetrics
                ? !!availableMetrics.find((m) => m.name === metric.name)
                : true,
        }));

        let availableDimensions: DbtGraphQLDimension[] | undefined;

        if (hasSelectedMetrics) {
            const getDimensionsResult = await this.getDimensions({
                metrics: selectedFields.metrics.map((metric) => ({
                    name: metric.name,
                })),
            });

            availableDimensions = getDimensionsResult.dimensions;
        }

        const dimensions = allDimensions.map((dimension) => ({
            ...dimension,
            // If no metrics are selected, availableDimensions will be undefined and all dimensions will be visible
            visible: availableDimensions
                ? !!availableDimensions.find((d) => d.name === dimension.name)
                : true,
        }));

        return this.transformers.fieldsToSemanticLayerFields(
            dimensions,
            metrics,
        );
    }
}
