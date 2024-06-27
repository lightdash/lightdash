import { type WeekDay } from '../utils/timeFrames';
import { type SupportedDbtAdapter } from './dbt';
import { type DimensionType, type Metric } from './field';
import { type CreateWarehouseCredentials } from './projects';

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

export type WarehouseResults = {
    fields: Record<string, { type: DimensionType }>;
    rows: Record<string, any>[];
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

    streamQuery(
        query: string,
        streamCallback: (data: WarehouseResults) => void,
        options: {
            tags?: Record<string, string>;
            timezone?: string;
        },
    ): Promise<void>;

    /**
     * Runs a query and returns all the results
     * @param sql
     * @param tags
     * @param timezone
     * @deprecated Use streamQuery() instead to avoid loading all results into memory
     */
    runQuery(
        sql: string,
        tags?: Record<string, string>,
        timezone?: string,
    ): Promise<WarehouseResults>;

    test(): Promise<void>;

    getStartOfWeek(): WeekDay | null | undefined;

    getAdapterType(): SupportedDbtAdapter;

    getStringQuoteChar(): string;

    getEscapeStringQuoteChar(): string;

    getMetricSql(sql: string, metric: Metric): string;

    concatString(...args: string[]): string;
}
