import { Explore, ExploreError } from 'common';
import { DbtBaseProjectAdapter } from './dbtBaseProjectAdapter';
import { DbtCloudV2RpcClient } from '../dbt/dbtCloudV2RpcClient';

type DbtCloudideProjectAdapterArgs = {
    accountId: string | number;
    environmentId: string | number;
    projectId: string | number;
    apiKey: string;
};

export class DbtCloudIdeProjectAdapter extends DbtBaseProjectAdapter {
    constructor({
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
        super(rpcClient, rpcClient);
    }

    public async compileAllExplores(): Promise<(Explore | ExploreError)[]> {
        return super.compileAllExplores(false);
    }
}
