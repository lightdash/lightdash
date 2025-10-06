import { Knex } from 'knex';

export const OrganizationWarehouseCredentialsTableName =
    'organization_warehouse_credentials';

export type DbOrganizationWarehouseCredentials = {
    organization_warehouse_credentials_uuid: string;
    organization_uuid: string;
    name: string;
    description: string | null;
    warehouse_type: string;
    warehouse_connection: Buffer;
    created_at: Date;
    created_by_user_uuid: string | null;
};

type CreateDbOrganizationWarehouseCredentials = Pick<
    DbOrganizationWarehouseCredentials,
    | 'organization_uuid'
    | 'name'
    | 'description'
    | 'warehouse_type'
    | 'warehouse_connection'
    | 'created_by_user_uuid'
>;

type UpdateDbOrganizationWarehouseCredentials = Partial<
    Pick<
        DbOrganizationWarehouseCredentials,
        'name' | 'description' | 'warehouse_type' | 'warehouse_connection'
    >
>;

export type OrganizationWarehouseCredentialsTable = Knex.CompositeTableType<
    DbOrganizationWarehouseCredentials,
    CreateDbOrganizationWarehouseCredentials,
    UpdateDbOrganizationWarehouseCredentials
>;
