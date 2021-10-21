import { Explore, ExploreError } from 'common';
import { DbtBaseProjectAdapter } from './dbtBaseProjectAdapter';
import { DbtCloudV2RpcClient } from '../dbt/dbtCloudV2RpcClient';
import { QueryRunner } from '../types';

type DbtCloudideProjectAdapterArgs = {
    queryRunner: QueryRunner | undefined;
    accountId: string | number;
    environmentId: string | number;
    projectId: string | number;
    apiKey: string;
};

export class DbtCloudIdeProjectAdapter extends DbtBaseProjectAdapter {
    constructor({
        queryRunner,
        accountId,
        environmentId,
        projectId,
        apiKey,
    }: DbtCloudideProjectAdapterArgs) {
        const rpcClient = new DbtCloudV2RpcClient(
            accountId,
            environmentId,
            projectId,
            apiKey,
        );
        // Use local adapter if possible, otherwise use the rpcClient for queries
        super(rpcClient, queryRunner || rpcClient);
    }

    public async compileAllExplores(): Promise<(Explore | ExploreError)[]> {
        return super.compileAllExplores(false);
    }
}
