import { WeekDay } from '../utils/timeFrames';
import { SupportedDbtAdapter } from './dbt';
import { DimensionType, Metric } from './field';
import { CreateWarehouseCredentials } from './projects';

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
    credentials: CreateWarehouseCredentials;
    getCatalog: (
        config: {
            database: string;
            schema: string;
            table: string;
        }[],
    ) => Promise<WarehouseCatalog>;

    runQuery(
        sql: string,
        tags?: Record<string, string>,
    ): Promise<{
        fields: Record<string, { type: DimensionType }>;
        rows: Record<string, any>[];
    }>;

    test(): Promise<void>;

    getStartOfWeek(): WeekDay | null | undefined;

    getAdapterType(): SupportedDbtAdapter;

    getFieldQuoteChar(): string;

    getStringQuoteChar(): string;

    getEscapeStringQuoteChar(): string;

    getMetricSql(sql: string, metric: Metric): string;

    concatString(...args: string[]): string;
}
