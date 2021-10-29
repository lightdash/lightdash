import { Explore, ExploreError } from 'common';
import { DbtBaseProjectAdapter } from './dbtBaseProjectAdapter';
import { DbtCloudV2RpcClient } from '../dbt/dbtCloudV2RpcClient';
import { WarehouseClient } from '../types';

type DbtCloudideProjectAdapterArgs = {
    warehouseClient: WarehouseClient;
    accountId: string | number;
    environmentId: string | number;
    projectId: string | number;
    apiKey: string;
};

export class DbtCloudIdeProjectAdapter extends DbtBaseProjectAdapter {
    constructor({
        warehouseClient,
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
        super(rpcClient, warehouseClient);
    }

    public async compileAllExplores(): Promise<(Explore | ExploreError)[]> {
        return super.compileAllExplores(false);
    }
}
