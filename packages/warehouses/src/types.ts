import { DimensionType } from '@lightdash/common';

export type WarehouseTableSchema = {
    [column: string]: DimensionType;
};
export type WarehouseCatalog = {
    [database: string]: {
        [schema: string]: {
            [table: string]: WarehouseTableSchema;
        };
    };
};

export interface WarehouseClient {
    getCatalog: (
        config: {
            database: string;
            schema: string;
            table: string;
            columns: string[];
        }[],
    ) => Promise<WarehouseCatalog>;

    runQuery(sql: string): Promise<Record<string, any>[]>;

    test(): Promise<void>;
}

export type CachedWarehouse = {
    warehouseCatalog: WarehouseCatalog | undefined;
    onWarehouseCatalogChange: (warehouseCatalog: WarehouseCatalog) => void;
};
