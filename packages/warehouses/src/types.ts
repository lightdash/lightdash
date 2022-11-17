import { DimensionType, WeekDay } from '@lightdash/common';

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
        }[],
    ) => Promise<WarehouseCatalog>;

    runQuery(sql: string): Promise<{
        fields: Record<string, { type: DimensionType }>;
        rows: Record<string, any>[];
    }>;

    test(): Promise<void>;

    getStartOfWeek(): WeekDay | undefined;
}
