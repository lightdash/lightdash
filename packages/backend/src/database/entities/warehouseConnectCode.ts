import { Knex } from 'knex';

export const WarehouseConnectCodeTableName = 'warehouse_connect_codes';

export type DbWarehouseConnectCode = {
    warehouse_connect_code_uuid: string;
    code_hash: string;
    organization_uuid: string;
    created_by_user_uuid: string;
    expires_at: Date;
    used_at: Date | null;
    encrypted_credentials: Buffer | null;
    created_at: Date;
};

type DbWarehouseConnectCodeInsert = Omit<
    DbWarehouseConnectCode,
    | 'warehouse_connect_code_uuid'
    | 'used_at'
    | 'encrypted_credentials'
    | 'created_at'
>;

type DbWarehouseConnectCodeUpdate = {
    used_at: Date | Knex.Raw;
    encrypted_credentials: Buffer | null;
};

export type WarehouseConnectCodeTable = Knex.CompositeTableType<
    DbWarehouseConnectCode,
    DbWarehouseConnectCodeInsert,
    DbWarehouseConnectCodeUpdate
>;
