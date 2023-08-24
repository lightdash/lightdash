import { UnexpectedServerError } from '@lightdash/common';
import fetch, { Headers } from 'node-fetch';

export default class DbtCloudGraphqlClient {
    private graphqlEndpoint =
        'https://cloud.getdbt.com/semantic-layer/api/graphql';

    async runQuery(bearerToken: string, environmentId: string, query: string) {
        const headers = new Headers();
        headers.append('Content-Type', 'application/json');
        headers.append('Authorization', `Bearer ${bearerToken}`);

        const body = JSON.stringify({
            query,
            variables: {
                environmentId,
            },
        });
        const response: { data: any; errors: Array<{ message: string }> } =
            await fetch(this.graphqlEndpoint, {
                method: 'POST',
                headers,
                body,
            }).then((resp) => resp.json());

        if (response.errors) {
            throw new UnexpectedServerError(
                response.errors.map((e) => e.message).join(', '),
                response.errors,
            );
        }

        return response.data;
    }
}
