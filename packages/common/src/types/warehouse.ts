import { WeekDay } from '../utils/timeFrames';
import { DimensionType, Metric } from './field';

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

    getStartOfWeek(): WeekDay | null | undefined;

    getFieldQuoteChar(): string;

    getStringQuoteChar(): string;

    getEscapeStringQuoteChar(): string;

    getMetricSql(sql: string, metric: Metric): string;
}
