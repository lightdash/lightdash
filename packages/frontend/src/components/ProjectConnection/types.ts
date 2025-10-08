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
};
