import { DbtCliClient } from '../dbt/dbtCliClient';
import { WarehouseClient } from '../types';
import { DbtBaseProjectAdapter } from './dbtBaseProjectAdapter';

type DbtLocalProjectAdapterArgs = {
    warehouseClient: WarehouseClient;
    projectDir: string;
    profilesDir: string;
    target: string | undefined;
    profileName?: string | undefined;
    environment?: Record<string, string>;
};

export class DbtLocalProjectAdapter extends DbtBaseProjectAdapter {
    constructor({
        warehouseClient,
        projectDir,
        profilesDir,
        target,
        profileName,
        environment,
    }: DbtLocalProjectAdapterArgs) {
        const dbtClient = new DbtCliClient({
            dbtProjectDirectory: projectDir,
            dbtProfilesDirectory: profilesDir,
            environment: environment || {},
            profileName,
            target,
        });
        super(dbtClient, warehouseClient);
    }
}
