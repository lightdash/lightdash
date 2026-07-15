import { type CreateSnowflakeCredentials } from './projects';

export type WarehouseConnectCode = {
    code: string;
    expiresAt: Date;
};

export type ApiWarehouseConnectCodeResponse = {
    status: 'ok';
    results: WarehouseConnectCode;
};

export type DepositWarehouseConnectionRequest = {
    code: string;
    credentials: CreateSnowflakeCredentials;
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
    | { status: 'deposited'; credentials: CreateSnowflakeCredentials };

export type ApiWarehouseConnectCodeClaimResponse = {
    status: 'ok';
    results: WarehouseConnectCodeClaimResult;
};
