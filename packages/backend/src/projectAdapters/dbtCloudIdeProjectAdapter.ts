import { SupportedDbtVersions } from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import { DbtMetadataApiClient } from '../dbt/DbtMetadataApiClient';
import { CachedWarehouse, ProjectAdapter } from '../types';
import { DbtBaseProjectAdapter } from './dbtBaseProjectAdapter';

type DbtCloudideProjectAdapterArgs = {
    warehouseClient: WarehouseClient;
    environmentId: string | number;
    apiKey: string;
    cachedWarehouse: CachedWarehouse;
    dbtVersion: SupportedDbtVersions;
};

export class DbtCloudIdeProjectAdapter
    extends DbtBaseProjectAdapter
    implements ProjectAdapter
{
    constructor({
        warehouseClient,
        environmentId,
        apiKey,
        cachedWarehouse,
        dbtVersion,
    }: DbtCloudideProjectAdapterArgs) {
        const dbtClient = new DbtMetadataApiClient(environmentId, apiKey);
        super(dbtClient, warehouseClient, cachedWarehouse, dbtVersion);
    }
}
