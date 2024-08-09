import {
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
    SemanticLayerQuery,
    SemanticLayerView,
} from '@lightdash/common';
import { GraphQLClient } from 'graphql-request';
import { URL } from 'url';
import { LightdashConfig } from '../../config/parseConfig';
import { dbtCloudTransfomers } from './transformer';

type DbtCloudGraphqlClientArgs = {
    lightdashConfig: LightdashConfig;
};

type GetDimensionsFnArgs = DbtGraphQLGetDimensionsArgs;
type GetMetricsForDimensionsFnArgs = DbtGraphQLGetMetricsForDimensionsArgs;

export default class DbtCloudGraphqlClient {
    transformers = dbtCloudTransfomers;

    domain: string;

    bearerToken?: string;

    environmentId?: string;

    constructor({ lightdashConfig }: DbtCloudGraphqlClientArgs) {
        this.domain = lightdashConfig.dbtCloud.domain;
        this.bearerToken = lightdashConfig.dbtCloud.bearerToken;
        this.environmentId = lightdashConfig.dbtCloud.environmentId;
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
                    return `{ name: "${g.name}", grain: ${g.grain} }`;
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
        return this.getClient().request(query, {
            environmentId: this.environmentId,
        });
    }

    async getResults(query: SemanticLayerQuery) {
        const graphqlArgs = this.transformers.semanticLayerQueryToQuery(query);
        const { limit } = graphqlArgs;
        const { groupByString, metricsString, orderByString, whereString } =
            await DbtCloudGraphqlClient.getPreparedCreateQueryArgs(graphqlArgs);

        const createQuery = `
            mutation CreateQuery($environmentId: BigInt!) {
                createQuery(
                    environmentId: $environmentId
                    metrics: ${metricsString}
                    groupBy: ${groupByString}
                    limit: ${limit ?? null}
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

        const getQueryResultsQuery = `
            query GetQueryResults($environmentId: BigInt!) {
                query(environmentId: $environmentId, queryId: "${createQueryResponse.queryId}") {
                    status
                    sql
                    jsonResult
                    error
                }
            }
        `;

        const { query: rawResponse } =
            await this.runGraphQlQuery<DbtGraphQLRunQueryRawResponse>(
                getQueryResultsQuery,
            );

        const jsonResult = rawResponse.jsonResult
            ? (JSON.parse(
                  Buffer.from(rawResponse.jsonResult, 'base64').toString(),
              ) as DbtGraphQLJsonResult)
            : null;

        return jsonResult
            ? this.transformers.resultsToResultRows(jsonResult)
            : [];
    }

    async getSql(query: SemanticLayerQuery) {
        const graphqlArgs = this.transformers.semanticLayerQueryToQuery(query);
        const { limit } = graphqlArgs;

        const { groupByString, metricsString, orderByString, whereString } =
            await DbtCloudGraphqlClient.getPreparedCreateQueryArgs(graphqlArgs);

        const compileSqlQuery = `
            mutation CompileSql($environmentId: BigInt!) {
                compileSql(
                    environmentId: $environmentId
                    metrics: ${metricsString}
                    groupBy: ${groupByString}
                    limit: ${limit ?? null}
                    where: ${whereString}
                    orderBy: ${orderByString}
                ) {
                    sql
                }
            }`;

        const { compileSql } =
            await this.runGraphQlQuery<DbtGraphQLCompileSqlResponse>(
                compileSqlQuery,
            );

        return this.transformers.sqlToString(compileSql.sql);
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
        {
            dimensions: selectedDimensions,
            timeDimensions: selectedTimeDimensions,
            metrics: selectedMetrics,
        }: Pick<
            SemanticLayerQuery,
            'dimensions' | 'timeDimensions' | 'metrics'
        >,
    ) {
        // Get all metrics and check which ones are available for the selected dimensions
        const { metrics: allMetrics } = await this.getMetrics();
        let availableMetrics: DbtGraphQLMetric[] | undefined;

        if (
            selectedDimensions.length > 0 ||
            selectedTimeDimensions.length > 0
        ) {
            availableMetrics = (
                await this.getMetricsForDimensions({
                    dimensions: [
                        ...selectedDimensions.map((d) => ({ name: d })),
                        ...selectedTimeDimensions.map((d) => ({ name: d })),
                    ],
                })
            ).metricsForDimensions;
        }

        const metrics = allMetrics.map((metric) => {
            // When available metrics is undefined, all metrics are visible
            const isVisible = availableMetrics
                ? availableMetrics.find((m) => m.name === metric.name)
                : true;

            return {
                ...metric,
                visible: !!isVisible,
            };
        });

        // Get all dimensions and check which ones are available for the selected metrics
        const { dimensions: allDimensions } = await this.getDimensions({
            metrics: [],
        });

        let availableDimensions: DbtGraphQLDimension[] | undefined;

        if (selectedMetrics.length > 0) {
            availableDimensions = (
                await this.getDimensions({
                    metrics: selectedMetrics.map((metric) => ({
                        name: metric,
                    })),
                })
            ).dimensions;
        }

        const dimensions = allDimensions.map((dimension) => {
            // When available dimensions is undefined, all dimensions are visible
            const isVisible = availableDimensions
                ? availableDimensions.find((d) => d.name === dimension.name)
                : true;

            return {
                ...dimension,
                visible: !!isVisible,
            };
        });

        return this.transformers.fieldsToSemanticLayerFields(
            dimensions,
            metrics,
        );
    }
}
