import { DbtPackages, Explore, ExploreError } from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import Logger from '../logging/logger';
import { ProjectAdapter } from '../types';

type DbtNoneCredentialsProjectAdapterArgs = {
    warehouseClient: WarehouseClient;
};

type RunQueryTags = {
    project_uuid?: string;
    user_uuid?: string;
    organization_uuid?: string;
    chart_uuid?: string;
    dashboard_uuid?: string;
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

    public async runQuery(sql: string, queryTags: RunQueryTags) {
        Logger.debug(`Run query against warehouse`);
        // Possible error if query is ran before dependencies are installed
        return this.warehouseClient.runQuery(sql, queryTags);
    }
}
