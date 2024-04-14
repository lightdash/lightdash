import { type WeekDay } from '../utils/timeFrames';
import { type SupportedDbtAdapter } from './dbt';
import { type DimensionType, type Metric } from './field';
import { type CreateWarehouseCredentials } from './projects';
import { type TimeZone } from './timezone';

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
        timezone?: TimeZone,
    ): Promise<{
        fields: Record<string, { type: DimensionType }>;
        rows: Record<string, any>[];
    }>;

    test(): Promise<void>;

    getStartOfWeek(): WeekDay | null | undefined;

    getAdapterType(): SupportedDbtAdapter;

    getStringQuoteChar(): string;

    getEscapeStringQuoteChar(): string;

    getMetricSql(sql: string, metric: Metric): string;

    concatString(...args: string[]): string;
}
