import { GraphQLClient } from 'graphql-request';
import { URL } from 'url';

type RunQueryArgs = {
    domain: string;
};

export default class CubeClient {
    // eslint-disable-next-line class-methods-use-this
    async runQuery({ domain }: RunQueryArgs) {
        throw new Error('Not implemented');
    }
}
