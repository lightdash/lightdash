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

    // eslint-disable-next-line class-methods-use-this
    async runGraphQlQuery<T>({
        domain,
        query,
        environmentId,
        bearerToken,
    }: RunGraphQLQueryArgs): Promise<T> {
        console.log('query', query);
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
        const { groupBy, metrics, order, where, limit } = graphqlArgs;
        const createQuery = `
            mutation {
                createQuery(
                    environmentId: BigInt!
                    metrics: ${JSON.stringify(metrics)}
                    groupBy: ${JSON.stringify(groupBy)}
                    limit: ${limit ?? 'null'}
                    where: ${JSON.stringify(where)}
                    order: ${JSON.stringify(order)}
                ) {
                    queryId
                }
            }`;

        const { queryId } = await this.runGraphQlQuery<CreateQueryResponse>({
            domain,
            bearerToken,
            query: createQuery,
            environmentId,
        });

        const query = `
            query GetQueryResults($environmentId: BigInt!) {
                query(environmentId: $environmentId, queryId: "${queryId}") {
                    status
                    sql
                    jsonResult
                    error
                }
            }
        `;

        const rawResponse = await this.runGraphQlQuery<RunQueryRawResponse>({
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
        const { groupBy, metrics, order, where, limit } = graphqlArgs;
        const query = `
            mutation {
                compileSql(
                    environmentId: BigInt!
                    metrics: ${JSON.stringify(metrics)}
                    groupBy: ${JSON.stringify(groupBy)}
                    limit: ${limit ?? 'null'}
                    where: ${JSON.stringify(where)}
                    order: ${JSON.stringify(order)}
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
