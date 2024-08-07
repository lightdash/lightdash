import {
    CompileSqlArgs,
    CompileSqlResponse,
    CreateQueryArgs,
    CreateQueryResponse,
    GetDimensionsArgs,
    GetDimensionsResponse,
    GetMetricsForDimensionsArgs,
    GetMetricsForDimensionsResponse,
    GetMetricsResponse,
    RunQueryRawResponse,
    RunQueryResponse,
} from '@lightdash/common';
import { GraphQLClient } from 'graphql-request';
import { URL } from 'url';

type EnvironmentContext = {
    environmentId: string;
};

type GetClientFnArgs = {
    domain: string;
    bearerToken: string;
};

type BaseArgs = EnvironmentContext & GetClientFnArgs;
type RunQueryFnArgs = BaseArgs & CreateQueryArgs;
type GetSqlFnArgs = BaseArgs & CompileSqlArgs;
type GetDimensionsFnArgs = BaseArgs & GetDimensionsArgs;
type GetMetricsForDimensionsFnArgs = BaseArgs & GetMetricsForDimensionsArgs;
type RunGraphQLQueryFnArgs = GetClientFnArgs &
    EnvironmentContext & {
        query: string;
    };

export default class DbtCloudGraphqlClient {
    private static getClient({ domain, bearerToken }: GetClientFnArgs) {
        const endpoint = new URL('/api/graphql', domain);
        return new GraphQLClient(endpoint.href, {
            headers: {
                Authorization: `Bearer ${bearerToken}`,
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
    }: Partial<CreateQueryArgs | CompileSqlArgs>) {
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
    async runGraphQlQuery<T>({
        domain,
        query,
        environmentId,
        bearerToken,
    }: RunGraphQLQueryFnArgs): Promise<T> {
        return DbtCloudGraphqlClient.getClient({ domain, bearerToken }).request(
            query,
            {
                environmentId,
            },
        );
    }

    async runQuery({
        bearerToken,
        domain,
        environmentId,
        ...graphqlArgs
    }: RunQueryFnArgs): Promise<RunQueryResponse> {
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
            await this.runGraphQlQuery<CreateQueryResponse>({
                domain,
                bearerToken,
                query: createQuery,
                environmentId,
            });

        const query = `
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
            await this.runGraphQlQuery<RunQueryRawResponse>({
                domain,
                bearerToken,
                query,
                environmentId,
            });

        return {
            ...rawResponse,
            jsonResult: rawResponse.jsonResult
                ? JSON.parse(
                      Buffer.from(rawResponse.jsonResult, 'base64').toString(),
                  )
                : null,
        };
    }

    async getSql({
        bearerToken,
        domain,
        environmentId,
        ...graphqlArgs
    }: GetSqlFnArgs) {
        const { limit } = graphqlArgs;
        const { groupByString, metricsString, orderByString, whereString } =
            await DbtCloudGraphqlClient.getPreparedCreateQueryArgs(graphqlArgs);

        const query = `
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

        return this.runGraphQlQuery<CompileSqlResponse>({
            domain,
            bearerToken,
            query,
            environmentId,
        });
    }

    async getMetrics({ bearerToken, domain, environmentId }: BaseArgs) {
        const query = `
            query GetMetrics($environmentId: BigInt!) {
                metrics(environmentId: $environmentId) {
                    name
                    description
                    type
                    queryableGranularities
                    dimensions {
                        name
                        description
                        type
                        queryableGranularities
                    }
                }
            }`;

        return this.runGraphQlQuery<GetMetricsResponse>({
            bearerToken,
            domain,
            query,
            environmentId,
        });
    }

    async getMetricsForDimensions({
        bearerToken,
        dimensions,
        domain,
        environmentId,
    }: GetMetricsForDimensionsFnArgs) {
        const query = `
            query GetMetricsForDimensions($environmentId: BigInt!) {
                metricsForDimensions(environmentId: $environmentId, dimensions: [${dimensions.map(
                    (dimension) => `{ name: "${dimension.name}" }`,
                )}]) {
                    name
                    description
                    type
                    queryableGranularities
                    dimensions {
                        name
                        description
                        type
                        queryableGranularities
                    }
                }
            }`;

        return this.runGraphQlQuery<GetMetricsForDimensionsResponse>({
            bearerToken,
            domain,
            environmentId,
            query,
        });
    }

    async getDimensions({
        bearerToken,
        domain,
        environmentId,
        metrics,
    }: GetDimensionsFnArgs) {
        const query = `
            query GetDimensions($environmentId: BigInt!) {
                dimensions(environmentId: $environmentId, metrics: [${metrics.map(
                    (metric) => `{ name: "${metric.name}" }`,
                )}]) {
                    name
                    description
                    type
                    queryableGranularities
                }
            }`;

        return this.runGraphQlQuery<GetDimensionsResponse>({
            bearerToken,
            domain,
            query,
            environmentId,
        });
    }
}
