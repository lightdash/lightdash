import { Explore } from 'common';
import { DbtBaseProjectAdapter } from './dbtBaseProjectAdapter';
import { DbtCloudV2RpcClient } from '../dbt/dbtCloudV2RpcClient';

export class DbtCloudIdeProjectAdapter extends DbtBaseProjectAdapter {
    rpcClient: DbtCloudV2RpcClient;

    constructor(
        accountId: string | number,
        environmentId: string | number,
        projectId: string | number,
        apiKey: string,
    ) {
        super();
        this.rpcClient = new DbtCloudV2RpcClient(
            accountId,
            environmentId,
            projectId,
            apiKey,
        );
    }

    public async compileAllExplores(): Promise<Explore[]> {
        return super.compileAllExplores(false);
    }
}
