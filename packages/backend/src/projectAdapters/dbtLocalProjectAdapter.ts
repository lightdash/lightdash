import { SupportedDbtVersions } from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { DbtCliClient } from '../dbt/dbtCliClient';
import type { DbtPartialParseBaseline } from '../dbt/dbtPartialParseBaseline';
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
    explicitCredentials: boolean;
    cachedWarehouse: CachedWarehouse;
    dbtVersion: SupportedDbtVersions;
    selector?: string;
    analytics?: LightdashAnalytics;
    gitConfigGlobalPath?: string;
    dbtDepsErrorHint?: string;
    partialParseBaseline?: DbtPartialParseBaseline | null;
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
        explicitCredentials,
        cachedWarehouse,
        dbtVersion,
        selector,
        gitConfigGlobalPath,
        dbtDepsErrorHint,
        partialParseBaseline = null,
    }: DbtLocalProjectAdapterArgs) {
        const dbtClient = new DbtCliClient({
            dbtProjectDirectory: projectDir,
            dbtProfilesDirectory: profilesDir,
            environment: environment || {},
            environmentVariableAllowlist,
            explicitCredentials,
            profileName,
            target,
            dbtVersion,
            selector,
            gitConfigGlobalPath,
            dbtDepsErrorHint,
            partialParseBaseline,
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
