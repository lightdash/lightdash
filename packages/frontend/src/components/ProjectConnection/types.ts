import {
    type CreateWarehouseCredentials,
    type DbtProjectConfig,
    type DbtVersionOption,
} from '@lightdash/common';

export type ProjectConnectionForm = {
    name: string;
    dbt: DbtProjectConfig;
    warehouse: CreateWarehouseCredentials;
    organizationWarehouseCredentialsUuid?: string;
    connectionUuid?: string;
    namespacePrefix?: string;
    dbtVersion: DbtVersionOption;
    warehouseLocation?: { database: string; schema: string };
};
