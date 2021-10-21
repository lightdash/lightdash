import { CreateWarehouseCredentials, WarehouseTypes } from 'common';
import PostgresWarehouseClient from './PostgresWarehouseClient';
import { QueryRunner } from '../../types';

export const warehouseClientFromCredentials = (
    credentials: CreateWarehouseCredentials,
): QueryRunner | undefined => {
    switch (credentials.type) {
        case WarehouseTypes.POSTGRES:
            return new PostgresWarehouseClient(credentials);
        default:
            return undefined;
    }
};
