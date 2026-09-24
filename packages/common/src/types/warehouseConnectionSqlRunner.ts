import { type WarehouseTypes } from './projects';

export type SqlRunnerWarehouseConnection = {
    warehouseConnectionUuid: string;
    name: string;
    isOriginal: boolean;
    warehouseType: WarehouseTypes;
};

export type ApiSqlRunnerWarehouseConnectionsResponse = {
    status: 'ok';
    results: SqlRunnerWarehouseConnection[];
};
