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
    cachedWarehouse: CachedWarehouse;
    dbtVersion: SupportedDbtVersions;
    useDbtLs: boolean;
    selector?: string;
    analytics?: LightdashAnalytics;
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
        cachedWarehouse,
        dbtVersion,
        useDbtLs,
        selector,
    }: DbtLocalProjectAdapterArgs) {
        const dbtClient = new DbtCliClient({
            dbtProjectDirectory: projectDir,
            dbtProfilesDirectory: profilesDir,
            environment: environment || {},
            profileName,
            target,
            dbtVersion,
            useDbtLs,
            selector,
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
