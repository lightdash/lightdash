import { Explore, ExploreError, SupportedDbtVersions } from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import { DbtCloudV2RpcClient } from '../dbt/dbtCloudV2RpcClient';
import { CachedWarehouse } from '../types';
import { DbtBaseProjectAdapter } from './dbtBaseProjectAdapter';

type DbtCloudideProjectAdapterArgs = {
    warehouseClient: WarehouseClient;
    accountId: string | number;
    environmentId: string | number;
    projectId: string | number;
    apiKey: string;
    cachedWarehouse: CachedWarehouse;
    dbtVersion: SupportedDbtVersions;
};

export class DbtCloudIdeProjectAdapter extends DbtBaseProjectAdapter {
    constructor({
        warehouseClient,
        accountId,
        environmentId,
        projectId,
        apiKey,
        cachedWarehouse,
        dbtVersion,
    }: DbtCloudideProjectAdapterArgs) {
        const rpcClient = new DbtCloudV2RpcClient(
            accountId,
            environmentId,
            projectId,
            apiKey,
        );
        super(rpcClient, warehouseClient, cachedWarehouse, dbtVersion);
    }

    public async compileAllExplores(): Promise<(Explore | ExploreError)[]> {
        return super.compileAllExplores(false);
    }
}
