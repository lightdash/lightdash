import { SupportedDbtVersions } from '@lightdash/common';
import { WarehouseClient } from '@lightdash/warehouses';
import { DbtMetadataApiClient } from '../dbt/DbtMetadataApiClient';
import { CachedWarehouse, ProjectAdapter } from '../types';
import { DbtBaseProjectAdapter } from './dbtBaseProjectAdapter';

type DbtCloudideProjectAdapterArgs = {
    warehouseClient: WarehouseClient;
    discoveryApiEndpoint: string | undefined;
    environmentId: string | number;
    apiKey: string;
    cachedWarehouse: CachedWarehouse;
    dbtVersion: SupportedDbtVersions;
    tags: string[] | undefined;
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
        discoveryApiEndpoint,
        tags,
    }: DbtCloudideProjectAdapterArgs) {
        const dbtClient = new DbtMetadataApiClient({
            environmentId,
            bearerToken: apiKey,
            discoveryApiEndpoint,
            tags,
        });
        super(dbtClient, warehouseClient, cachedWarehouse, dbtVersion);
    }
}
