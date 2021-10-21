import { Explore, ExploreError } from 'common';
import { DbtBaseProjectAdapter } from './dbtBaseProjectAdapter';
import { DbtRpcClient } from '../dbt/dbtRpcClient';
import { QueryRunner } from '../types';

type DbtRemoteProjectAdapterArgs = {
    queryRunner: QueryRunner | undefined;
    host: string;
    port: number;
    protocol?: string;
};

export class DbtRemoteProjectAdapter extends DbtBaseProjectAdapter {
    constructor({
        queryRunner,
        host,
        port,
        protocol = 'http',
    }: DbtRemoteProjectAdapterArgs) {
        const rpcClient = new DbtRpcClient(
            `${protocol}://${host}:${port}/jsonrpc`,
        );
        super(rpcClient, queryRunner || rpcClient);
    }

    async compileAllExplores(): Promise<(Explore | ExploreError)[]> {
        return super.compileAllExplores(false);
    }
}
