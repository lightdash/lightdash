import { Explore, ExploreError } from 'common';
import { DbtBaseProjectAdapter } from './dbtBaseProjectAdapter';
import { DbtRpcClient } from '../dbt/dbtRpcClient';

export class DbtRemoteProjectAdapter extends DbtBaseProjectAdapter {
    rpcClient: DbtRpcClient;

    constructor(host: string, port: number, protocol: string = 'http') {
        super();
        this.rpcClient = new DbtRpcClient(
            `${protocol}://${host}:${port}/jsonrpc`,
        );
    }

    async compileAllExplores(): Promise<(Explore | ExploreError)[]> {
        return super.compileAllExplores(false);
    }
}
