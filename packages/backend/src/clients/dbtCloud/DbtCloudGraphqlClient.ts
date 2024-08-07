import {
    CompileSqlArgs,
    CompileSqlResponse,
    CreateQueryArgs,
    CreateQueryResponse,
    RunQueryRawResponse,
    RunQueryResponse,
} from '@lightdash/common';
import { GraphQLClient } from 'graphql-request';
import { URL } from 'url';

type GetClientArgs = {
    domain: string;
    bearerToken: string;
};

type RunGraphQLQueryArgs = GetClientArgs & {
    environmentId: string;
    query: string;
};

type GetSqlArgs = GetClientArgs &
    CompileSqlArgs &
    Pick<RunGraphQLQueryArgs, 'environmentId'>;

type RunQueryArgs = GetClientArgs &
    CreateQueryArgs &
    Pick<RunGraphQLQueryArgs, 'environmentId'>;

export default class DbtCloudGraphqlClient {
    private static getClient({ domain, bearerToken }: GetClientArgs) {
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
    }: CreateQueryArgs | CompileSqlArgs) {
        const metricsString = metrics.map(
            (metric) => `{ name: "${metric.name}" }`,
        );
        const groupByString = groupBy.map((g) => `{ name: "${g.name}" }`);
        const whereString = where.map((w) => `{ sql: "${w.sql}" }`);
        const orderByString = orderBy.map((o) => {
            if ('metric' in o) {
                return `{ metric: { name: "${o.metric.name}" }, descending: ${o.descending} }`;
            }

            return `{ groupBy: { name: "${o.groupBy.name}" }, descending: ${o.descending} }`;
        });

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
    }: RunGraphQLQueryArgs): Promise<T> {
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
    }: RunQueryArgs): Promise<RunQueryResponse> {
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
    }: GetSqlArgs) {
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
}
