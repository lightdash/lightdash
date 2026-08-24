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
    dbtVersion: DbtVersionOption;
    // Additional dbt sources only: where this source's models live in the
    // project's warehouse. A blank field means inherit.
    warehouseLocation?: { database: string; schema: string };
};
