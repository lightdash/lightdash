import { GraphQLClient } from 'graphql-request';
import { URL } from 'url';

type RunQueryArgs = {
    domain: string;
    bearerToken: string;
    environmentId: string;
    query: string;
};

export default class DbtCloudGraphqlClient {
    // eslint-disable-next-line class-methods-use-this
    async runQuery({
        domain,
        query,
        environmentId,
        bearerToken,
    }: RunQueryArgs) {
        const endpoint = new URL('/api/graphql', domain);
        const client = new GraphQLClient(endpoint.href, {
            headers: {
                Authorization: `Bearer ${bearerToken}`,
                'X-dbt-partner-source': 'lightdash',
            },
        });
        return client.request(query, {
            environmentId,
        });
    }
}
