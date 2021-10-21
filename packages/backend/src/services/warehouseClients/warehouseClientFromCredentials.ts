import { CreateWarehouseCredentials, WarehouseTypes } from 'common';
import { QueryRunner } from '../../types';
import PostgresWarehouseClient from './PostgresWarehouseClient';
import BigqueryWarehouseClient from './BigqueryWarehouseClient';

export const warehouseClientFromCredentials = (
    credentials: CreateWarehouseCredentials,
): QueryRunner | undefined => {
    switch (credentials.type) {
        case WarehouseTypes.POSTGRES:
            return new PostgresWarehouseClient(credentials);
        case WarehouseTypes.BIGQUERY:
            return new BigqueryWarehouseClient(credentials);
        default:
            return undefined;
    }
};
