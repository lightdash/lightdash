import { SupportedDbtVersions } from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
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
    environmentVariableAllowlist: string[];
    cachedWarehouse: CachedWarehouse;
    dbtVersion: SupportedDbtVersions;
    selector?: string;
    analytics?: LightdashAnalytics;
    gitConfigGlobalPath?: string;
    dbtDepsErrorHint?: string;
};

export class DbtLocalProjectAdapter extends DbtBaseProjectAdapter {
    constructor({
        analytics,
        warehouseClient,
        projectDir,
        profilesDir,
        target,
        profileName,
        environment,
        environmentVariableAllowlist,
        cachedWarehouse,
        dbtVersion,
        selector,
        gitConfigGlobalPath,
        dbtDepsErrorHint,
    }: DbtLocalProjectAdapterArgs) {
        const dbtClient = new DbtCliClient({
            dbtProjectDirectory: projectDir,
            dbtProfilesDirectory: profilesDir,
            environment: environment || {},
            environmentVariableAllowlist,
            profileName,
            target,
            dbtVersion,
            selector,
            gitConfigGlobalPath,
            dbtDepsErrorHint,
        });
        super(
            dbtClient,
            warehouseClient,
            cachedWarehouse,
            dbtVersion,
            projectDir,
            analytics,
        );
    }
}
