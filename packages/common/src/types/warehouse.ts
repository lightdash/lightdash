import { type WeekDay } from '../utils/timeFrames';
import { type QueryExecutionContext } from './analytics';
import { type AnyType } from './any';
import { type SupportedDbtAdapter } from './dbt';
import { type DimensionType, type Metric } from './field';
import { type CreateWarehouseCredentials } from './projects';
import type { WarehouseQueryMetadata } from './queryHistory';

export type RunQueryTags = {
    project_uuid?: string;
    user_uuid?: string;
    organization_uuid?: string;
    chart_uuid?: string;
    dashboard_uuid?: string;
    explore_name?: string;
    query_context: QueryExecutionContext;
};

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

export type WarehouseTablesCatalog = {
    [database: string]: {
        [schema: string]: {
            [table: string]: { partitionColumn?: PartitionColumn };
        };
    };
};

export type WarehouseTables = {
    database: string;
    schema: string;
    table: string;
    partitionColumn?: PartitionColumn;
}[];

export type WarehouseResults = {
    fields: Record<string, { type: DimensionType }>;
    rows: Record<string, AnyType>[];
};

export type WarehousePaginationArgs = {
    page: number;
    pageSize: number;
};

export type WarehouseExecuteAsyncQueryArgs = {
    tags: Record<string, string>;
    timezone?: string;
    values?: AnyType[];
    sql: string;
};

export type WarehouseExecuteAsyncQuery = {
    queryId: string | null;
    queryMetadata: WarehouseQueryMetadata | null;
    totalRows: number;
    durationMs: number;
};

export interface WarehouseSqlBuilder {
    getStartOfWeek: () => WeekDay | null | undefined;
    getAdapterType: () => SupportedDbtAdapter;
    getStringQuoteChar: () => string;
    getEscapeStringQuoteChar: () => string;
    getFieldQuoteChar: () => string;
    getMetricSql: (sql: string, metric: Metric) => string;
    concatString: (...args: string[]) => string;
}

export interface WarehouseClient extends WarehouseSqlBuilder {
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
            values?: AnyType[];
            tags: Record<string, string>;
            timezone?: string;
        },
    ): Promise<void>;

    executeAsyncQuery(
        args: WarehouseExecuteAsyncQueryArgs,
        resultsStreamCallback: (
            rows: WarehouseResults['rows'],
            fields: WarehouseResults['fields'],
        ) => void,
    ): Promise<WarehouseExecuteAsyncQuery>;

    /**
     * Runs a query and returns all the results
     * @param sql
     * @param tags
     * @param timezone
     * @param values
     * @deprecated Use streamQuery() instead to avoid loading all results into memory
     */
    runQuery(
        sql: string,
        tags: Record<string, string>,
        timezone?: string,
        values?: AnyType[],
    ): Promise<WarehouseResults>;

    test(): Promise<void>;

    getAllTables(
        schema?: string,
        tags?: Record<string, string>,
    ): Promise<WarehouseTables>;

    getFields(
        tableName: string,
        schema?: string,
        database?: string,
        tags?: Record<string, string>,
    ): Promise<WarehouseCatalog>;

    parseWarehouseCatalog(
        rows: Record<string, AnyType>[],
        mapFieldType: (type: string) => DimensionType,
    ): WarehouseCatalog;

    parseError(error: Error): Error;
}

export type ApiWarehouseCatalog = {
    status: 'ok';
    results: WarehouseCatalog;
};

export type ApiWarehouseTablesCatalog = {
    status: 'ok';
    results: WarehouseTablesCatalog;
};

export type ApiWarehouseTableFields = {
    status: 'ok';
    results: WarehouseTableSchema;
};

export enum PartitionType {
    DATE = 'DATE',
    RANGE = 'RANGE',
}

export type PartitionColumn = {
    partitionType: PartitionType;
    field: string;
};
