import { type WeekDay } from '../utils/timeFrames';
import { type QueryExecutionContext } from './analytics';
import { type AnyType } from './any';
import { type SupportedDbtAdapter } from './dbt';
import { type DimensionType, type Metric, type TimestampDomain } from './field';
import { type CreateWarehouseCredentials } from './projects';
import type { WarehouseQueryMetadata } from './queryHistory';
import { type UserAttributeValueMap } from './userAttributes';

const MAX_USER_ATTRIBUTE_QUERY_TAGS = 20;
const MAX_QUERY_TAG_KEY_LENGTH = 60;
const MAX_QUERY_TAG_VALUE_LENGTH = 60;
const USER_ATTRIBUTE_QUERY_TAG_PREFIX = 'user_attribute_';

export type UserAttributeQueryTag = `user_attribute_${string}`;

export type RunQueryTags = Record<UserAttributeQueryTag, string> & {
    project_uuid?: string;
    user_uuid?: string;
    organization_uuid?: string;
    app_uuid?: string;
    chart_uuid?: string;
    dashboard_uuid?: string;
    saved_sql_uuid?: string;
    scheduler_uuid?: string;
    scheduler_name?: string;
    job_id?: string;
    explore_name?: string;
    query_context: QueryExecutionContext;
};

const sanitizeQueryTagString = (
    value: string,
    fallback: string,
    maxLength: number,
) =>
    value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')
        .substring(0, maxLength) || fallback;

export const sanitizeQueryTagKey = (key: string): string =>
    sanitizeQueryTagString(key, 'empty_key', MAX_QUERY_TAG_KEY_LENGTH);

export const sanitizeQueryTagValue = (value: string): string =>
    sanitizeQueryTagString(value, 'empty_value', MAX_QUERY_TAG_VALUE_LENGTH);

export const getUserAttributeQueryTags = (
    userAttributes: UserAttributeValueMap,
): Record<UserAttributeQueryTag, string> =>
    Object.fromEntries(
        Object.entries(userAttributes).reduce<
            [UserAttributeQueryTag, string][]
        >((acc, [name, values]) => {
            if (acc.length >= MAX_USER_ATTRIBUTE_QUERY_TAGS) {
                return acc;
            }

            const tagName = sanitizeQueryTagKey(
                `${USER_ATTRIBUTE_QUERY_TAG_PREFIX}${name}`,
            );
            const value = values
                .map((attribute) => attribute.trim())
                .filter(Boolean)
                .join(',')
                .trim();
            if (value) {
                acc.push([
                    tagName as UserAttributeQueryTag,
                    sanitizeQueryTagValue(value),
                ]);
            }

            return acc;
        }, []),
    ) as Record<UserAttributeQueryTag, string>;

export type WarehouseTableSchema = {
    [column: string]: DimensionType;
};

/**
 * Sparse sidecar of timestamp domains, keyed like the catalog itself. It
 * lives on the catalog under a reserved key next to the database keys, so it
 * survives the `cached_warehouse` JSON round-trip unchanged and is inert to
 * readers that only look up their own database names.
 */
export const WAREHOUSE_TIMESTAMP_DOMAINS_KEY = '__lightdashTimestampDomains';

export type WarehouseCatalogTimestampDomains = {
    [database: string]: {
        [schema: string]: {
            [table: string]: {
                [column: string]: TimestampDomain;
            };
        };
    };
};

/**
 * WARNING: a catalog may carry the reserved `WAREHOUSE_TIMESTAMP_DOMAINS_KEY`
 * sidecar alongside the database keys (its value is NOT a database entry).
 * Never enumerate `Object.keys(catalog)` as database names without excluding
 * it — look entries up by name, or use the sidecar accessors below.
 */
export type WarehouseCatalog = {
    [database: string]: {
        [schema: string]: {
            [table: string]: WarehouseTableSchema;
        };
    };
};

export const getCatalogTimestampDomain = (
    catalog: WarehouseCatalog,
    database: string,
    schema: string,
    table: string,
    column: string,
): TimestampDomain | undefined =>
    (
        catalog as {
            [WAREHOUSE_TIMESTAMP_DOMAINS_KEY]?: WarehouseCatalogTimestampDomains;
        }
    )[WAREHOUSE_TIMESTAMP_DOMAINS_KEY]?.[database]?.[schema]?.[table]?.[column];

export const setCatalogTimestampDomain = (
    catalog: WarehouseCatalog,
    database: string,
    schema: string,
    table: string,
    column: string,
    timestampDomain: TimestampDomain | undefined,
): void => {
    if (timestampDomain === undefined) return;
    const catalogWithDomains = catalog as {
        [WAREHOUSE_TIMESTAMP_DOMAINS_KEY]?: WarehouseCatalogTimestampDomains;
    };
    const domains = catalogWithDomains[WAREHOUSE_TIMESTAMP_DOMAINS_KEY] ?? {};
    catalogWithDomains[WAREHOUSE_TIMESTAMP_DOMAINS_KEY] = domains;
    domains[database] = domains[database] ?? {};
    domains[database][schema] = domains[database][schema] ?? {};
    domains[database][schema][table] = domains[database][schema][table] ?? {};
    domains[database][schema][table][column] = timestampDomain;
};

/**
 * True when the catalog was produced by domain-aware code: the sidecar key is
 * present, even if empty. A missing key means a pre-domain cache that should
 * be refetched once so timestamp columns get classified.
 */
export const catalogHasTimestampDomains = (
    catalog: WarehouseCatalog,
): boolean => WAREHOUSE_TIMESTAMP_DOMAINS_KEY in catalog;

/**
 * Stamps the (possibly empty) sidecar onto a freshly fetched catalog so
 * `catalogHasTimestampDomains` can tell it apart from a pre-domain cache —
 * clients only create the key when they classify at least one column.
 */
export const ensureCatalogTimestampDomainsKey = (
    catalog: WarehouseCatalog,
): void => {
    const catalogWithDomains = catalog as {
        [WAREHOUSE_TIMESTAMP_DOMAINS_KEY]?: WarehouseCatalogTimestampDomains;
    };
    catalogWithDomains[WAREHOUSE_TIMESTAMP_DOMAINS_KEY] =
        catalogWithDomains[WAREHOUSE_TIMESTAMP_DOMAINS_KEY] ?? {};
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
    fields: Record<
        string,
        { type: DimensionType; timestampDomain?: TimestampDomain }
    >;
    rows: Record<string, AnyType>[];
};

export type WarehouseExecuteAsyncQueryArgs = {
    tags: Record<string, string>;
    timezone?: string;
    values?: AnyType[]; // same as queryParams but in array form
    queryParams?: Record<string, AnyType>; // same as values but in object form
    sql: string;
};

// `query` is execution up to the first row; `fetch` is streaming the rest.
export type WarehouseQueryPhase =
    | 'ssh_tunnel'
    | 'connect'
    | 'session'
    | 'query'
    | 'fetch';

export type WarehousePhaseTimings = Partial<
    Record<WarehouseQueryPhase, number>
>;

export type WarehouseExecuteAsyncQuery = {
    queryId: string | null;
    queryMetadata: WarehouseQueryMetadata | null;
    totalRows: number;
    durationMs: number;
    phaseTimings: WarehousePhaseTimings;
};

export enum TimeIntervalUnit {
    SECOND = 'SECOND',
    MINUTE = 'MINUTE',
    HOUR = 'HOUR',
    DAY = 'DAY',
    WEEK = 'WEEK',
    MONTH = 'MONTH',
    YEAR = 'YEAR',
}

export interface WarehouseSqlBuilder {
    getStartOfWeek: () => WeekDay | null | undefined;
    getAdapterType: () => SupportedDbtAdapter;
    supportsCteMaterialization: () => boolean;
    getStringQuoteChar: () => string;
    getEscapeStringQuoteChar: () => string;
    getFieldQuoteChar: () => string;
    getFloatingType: () => string;
    getNullSafeEqualSql: (left: string, right: string) => string;
    getNullSafeEqualJoinSql: (left: string, right: string) => string;
    getMetricSql: (sql: string, metric: Metric) => string;
    concatString: (...args: string[]) => string;
    escapeString: (value: string) => string;
    // Methods for funnel builder and general SQL generation
    castToTimestamp: (date: Date) => string;
    getIntervalSql: (value: number, unit: TimeIntervalUnit) => string;
    getTimestampDiffSeconds: (
        startTimestampSql: string,
        endTimestampSql: string,
    ) => string;
    getMedianSql: (valueSql: string) => string;
    // Array construction methods for table calculations
    buildArray: (elements: string[]) => string;
    buildArrayAgg: (expression: string, orderBy?: string) => string;
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
        streamCallback: (data: WarehouseResults) => void | Promise<void>,
        options: {
            values?: AnyType[];
            tags: Record<string, string>;
            timezone?: string;
        },
    ): Promise<void>;

    executeAsyncQuery(
        args: WarehouseExecuteAsyncQueryArgs,
        resultsStreamCallback?: (
            rows: WarehouseResults['rows'],
            fields: WarehouseResults['fields'],
        ) => void | Promise<void>,
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
        mapTimestampDomain?: (type: string) => TimestampDomain | undefined,
    ): WarehouseCatalog;

    parseError(error: Error): Error;

    escapeString(value: string): string;
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
