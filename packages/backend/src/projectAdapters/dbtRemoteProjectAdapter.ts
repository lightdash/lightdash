import { Explore, ExploreError } from 'common';
import { DbtBaseProjectAdapter } from './dbtBaseProjectAdapter';
import { DbtRpcClient } from '../dbt/dbtRpcClient';

type DbtRemoteProjectAdapterArgs = {
    host: string;
    port: number;
    protocol?: string;
};

export class DbtRemoteProjectAdapter extends DbtBaseProjectAdapter {
    constructor({
        host,
        port,
        protocol = 'http',
    }: DbtRemoteProjectAdapterArgs) {
        const rpcClient = new DbtRpcClient(
            `${protocol}://${host}:${port}/jsonrpc`,
        );
        super(rpcClient, rpcClient);
    }

    async compileAllExplores(): Promise<(Explore | ExploreError)[]> {
        return super.compileAllExplores(false);
    }
}
