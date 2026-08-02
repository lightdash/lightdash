import { type CreateSnowflakeCredentials } from './projects';

export type WarehouseConnectCode = {
    code: string;
    expiresAt: Date;
};

export type ApiWarehouseConnectCodeResponse = {
    status: 'ok';
    results: WarehouseConnectCode;
};

export type DepositSnowflakeCredentials = Omit<
    CreateSnowflakeCredentials,
    'database' | 'warehouse' | 'schema'
> &
    Partial<
        Pick<CreateSnowflakeCredentials, 'database' | 'warehouse' | 'schema'>
    >;

export type WarehouseConnectInventory = {
    databases: {
        name: string;
        comment: string | null;
        sizeBytes?: number | null;
    }[];
    warehouses: {
        name: string;
        size: string | null;
        state: string | null;
    }[];
    roles: { name: string; isDefault: boolean }[];
    schemas: { database: string; name: string }[];
};

export type DepositWarehouseConnectionRequest = {
    code: string;
    credentials: DepositSnowflakeCredentials;
    inventory: WarehouseConnectInventory | null;
};

export type ApiDepositWarehouseConnectionResponse = {
    status: 'ok';
    results: undefined;
};

export type ClaimWarehouseConnectCodeRequest = {
    code: string;
};

export type WarehouseConnectCodeClaimResult =
    | { status: 'pending' }
    | {
          status: 'deposited';
          credentials: DepositSnowflakeCredentials;
          inventory: WarehouseConnectInventory | null;
      };

export type ApiWarehouseConnectCodeClaimResponse = {
    status: 'ok';
    results: WarehouseConnectCodeClaimResult;
};
