import { WarehouseClient } from '@lightdash/warehouses';
import { DbtCliClient } from '../dbt/dbtCliClient';
import { CachedWarehouse } from '../types';
import { DbtBaseProjectAdapter } from './dbtBaseProjectAdapter';

type DbtLocalProjectAdapterArgs = {
    warehouseClient: WarehouseClient;
    projectDir: string;
    profilesDir: string;
    target: string | undefined;
    profileName?: string | undefined;
    environment?: Record<string, string>;
    cachedWarehouse: CachedWarehouse;
};

export class DbtLocalProjectAdapter extends DbtBaseProjectAdapter {
    constructor({
        warehouseClient,
        projectDir,
        profilesDir,
        target,
        profileName,
        environment,
        cachedWarehouse,
    }: DbtLocalProjectAdapterArgs) {
        const dbtClient = new DbtCliClient({
            dbtProjectDirectory: projectDir,
            dbtProfilesDirectory: profilesDir,
            environment: environment || {},
            profileName,
            target,
        });
        super(dbtClient, warehouseClient, cachedWarehouse);
    }
}
