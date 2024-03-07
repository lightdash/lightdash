import { type DbtPackages, type Explore, type ExploreError } from '@lightdash/common';
import { type WarehouseClient } from '@lightdash/warehouses';
import Logger from '../logging/logger';
import { type ProjectAdapter } from '../types';

type DbtNoneCredentialsProjectAdapterArgs = {
    warehouseClient: WarehouseClient;
};

export class DbtNoneCredentialsProjectAdapter implements ProjectAdapter {
    warehouseClient: WarehouseClient;

    constructor({ warehouseClient }: DbtNoneCredentialsProjectAdapterArgs) {
        this.warehouseClient = warehouseClient;
    }

    // eslint-disable-next-line class-methods-use-this
    async destroy(): Promise<void> {
        Logger.debug(`Destroy none project adapter`);
    }

    public async test(): Promise<void> {
        Logger.debug('Test warehouse client');
        await this.warehouseClient.test();
    }

    // eslint-disable-next-line class-methods-use-this
    public async compileAllExplores(
        loadSources: boolean = false,
    ): Promise<(Explore | ExploreError)[]> {
        throw new Error('Cannot compile explores with CLI-created projects');
    }

    // eslint-disable-next-line class-methods-use-this
    public async getDbtPackages(): Promise<DbtPackages | undefined> {
        Logger.debug(`Get dbt packages`);
        return undefined;
    }

    public async runQuery(sql: string) {
        Logger.debug(`Run query against warehouse`);
        // Possible error if query is ran before dependencies are installed
        return this.warehouseClient.runQuery(sql);
    }
}
