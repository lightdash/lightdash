import moment from 'moment';

const DATE_FORMAT = 'YYYY-MM-DD';
export const formatDate = (date: Date): string =>
    moment(date).format(DATE_FORMAT);
export const parseDate = (str: string): Date =>
    moment(str, DATE_FORMAT).toDate();

const TIMESTAMP_FORMAT = 'YYYY-MM-DD HH:mm:ss';
export const formatTimestamp = (date: Date): string =>
    moment(date).format(TIMESTAMP_FORMAT);
export const parseTimestamp = (str: string): Date =>
    moment(str, TIMESTAMP_FORMAT).toDate();

export const validateEmail = (email: string): boolean => {
    const re =
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
};

export const USER_SEED: CreateInitialUserArgs = {
    firstName: 'Jane',
    lastName: 'Doe',
    organizationName: 'Jaffle Shop',
    email: 'demo@lightdash.com',
    password: 'demo_password!',
    isMarketingOptedIn: true,
    isTrackingAnonymized: false,
};

export type ArgumentsOf<F extends Function> = F extends (
    ...args: infer A
) => any
    ? A
    : never;

export type Explore = {
    name: string; // Friendly name any characters
    baseTable: string; // Must match a tableName in tables
    joinedTables: CompiledExploreJoin[]; // Must match a tableName in tables
    tables: { [tableName: string]: CompiledTable }; // All tables in this explore
};

export type ExploreJoin = {
    table: string; // Must match a tableName in containing Explore
    sqlOn: string; // Built sql
};

export type CompiledExploreJoin = ExploreJoin & {
    compiledSqlOn: string; // Sql on clause with template variables resolved
};

export type PartialTable = {
    name: string; // Must be sql friendly (a-Z, 0-9, _)
    description?: string; // Optional description of table
    sqlTable: string; // The sql identifier for the table
};

export type Table = PartialTable & {
    dimensions: { [fieldName: string]: Dimension }; // Field names must be unique across dims and metrics
    metrics: { [fieldName: string]: Metric }; //
    lineageGraph: LineageGraph; // DAG structure representing the lineage of the table
    source?: Source;
};

export type Source = {
    path: string;
    range: {
        start: SourcePosition;
        end: SourcePosition;
    };
    highlight?: {
        start: SourcePosition;
        end: SourcePosition;
    };
    content: string;
};

type SourcePosition = {
    line: number;
    character: number;
};

export type CompiledTable = PartialTable & {
    dimensions: Record<string, CompiledDimension>;
    metrics: Record<string, CompiledMetric>;
    lineageGraph: LineageGraph;
    source?: Source;
};

export type LineageGraph = Record<string, LineageNodeDependency[]>;
export type LineageNodeDependency = {
    type: 'model' | 'seed' | 'source';
    name: string;
};

// Helper function to get a list of all dimensions in an explore
export const getDimensions = (explore: Explore): CompiledDimension[] =>
    Object.values(explore.tables).flatMap((t) => Object.values(t.dimensions));

// Helper function to get a list of all metrics in an explore
export const getMetrics = (explore: Explore): CompiledMetric[] =>
    Object.values(explore.tables).flatMap((t) => Object.values(t.metrics));

export const getFields = (explore: Explore): Field[] => [
    ...getDimensions(explore),
    ...getMetrics(explore),
];

export enum FieldType {
    METRIC = 'metric',
    DIMENSION = 'dimension',
}

// Every dimension and metric is a field
export interface Field {
    fieldType: FieldType;
    type: string; // Discriminator field
    name: string; // Field names are unique within a table
    table: string; // Table names are unique within the project
    sql: string; // Templated sql
    description?: string;
    source?: Source;
}

export const isField = (field: any): field is Field => field?.fieldType;

export enum DimensionType {
    STRING = 'string',
    NUMBER = 'number',
    TIMESTAMP = 'timestamp',
    DATE = 'date',
    BOOLEAN = 'boolean',
}

export interface Dimension extends Field {
    fieldType: FieldType.DIMENSION;
    type: DimensionType;
}

export interface CompiledDimension extends Dimension {
    compiledSql: string; // sql string with resolved template variables
}

export const isDimension = (field: Field): field is Dimension =>
    field.fieldType === FieldType.DIMENSION;

// Field ids are unique across the project
export type FieldId = string;
export const fieldId = (field: Field): FieldId =>
    `${field.table}_${field.name}`;

export enum MetricType {
    AVERAGE = 'average',
    COUNT = 'count',
    COUNT_DISTINCT = 'count_distinct',
    SUM = 'sum',
    MIN = 'min',
    MAX = 'max',
    NUMBER = 'number',
    STRING = ' string',
    DATE = ' date',
    BOOLEAN = ' boolean',
}

const NonAggregateMetricTypes = [
    MetricType.STRING,
    MetricType.NUMBER,
    MetricType.DATE,
    MetricType.BOOLEAN,
];

export const isMetric = (field: Field): field is Metric =>
    field.fieldType === FieldType.METRIC;

export const isNonAggregateMetric = (field: Field): boolean =>
    isMetric(field) && NonAggregateMetricTypes.includes(field.type);

export interface Metric extends Field {
    fieldType: FieldType.METRIC;
    type: MetricType;
}

export interface CompiledMetric extends Metric {
    compiledSql: string;
}

// Object used to query an explore. Queries only happen within a single explore
export type MetricQuery = {
    dimensions: FieldId[]; // Dimensions to group by in the explore
    metrics: FieldId[]; // Metrics to compute in the explore
    filters: FilterGroup[]; // Filters applied to the table to query (logical AND)
    sorts: SortField[]; // Sorts for the data
    limit: number; // Max number of rows to return from query
};

// Sort by
export type SortField = {
    fieldId: string; // Field must exist in the explore
    descending: boolean; // Direction of the sort
};

export enum FilterGroupOperator {
    and = 'and',
    or = 'or',
}

// Filter groups combine multiple filters for a single dimension or metric
// The filters in a filter group can be combined with AND/OR
// Filters vary depending on the dimension type
export type StringFilterGroup = {
    type: 'string';
    tableName: string;
    fieldName: string;
    operator: FilterGroupOperator;
    filters: StringFilter[];
};

export type StringFilter =
    | { operator: 'equals'; values: string[]; id?: string }
    | { operator: 'notEquals'; values: string[]; id?: string }
    | { operator: 'startsWith'; value: string; id?: string }
    | { operator: 'isNull'; id?: string }
    | { operator: 'notNull'; id?: string };

export type NumberFilterGroup = {
    type: 'number';
    tableName: string;
    fieldName: string;
    operator: FilterGroupOperator;
    filters: NumberFilter[];
};

export type NumberFilter =
    | { operator: 'equals'; values: number[]; id?: string }
    | { operator: 'notEquals'; values: number[]; id?: string }
    | { operator: 'greaterThan'; value: number; id?: string }
    | { operator: 'lessThan'; value: number; id?: string }
    | { operator: 'isNull'; id?: string }
    | { operator: 'notNull'; id?: string };

export type DateFilterGroup = {
    type: 'date';
    tableName: string;
    fieldName: string;
    operator: FilterGroupOperator;
    filters: DateAndTimestampFilter[];
};

export type TimestampFilterGroup = {
    type: 'timestamp';
    tableName: string;
    fieldName: string;
    operator: FilterGroupOperator;
    filters: DateAndTimestampFilter[];
};

export type DateAndTimestampFilter =
    | { operator: 'equals'; value: Date; id?: string }
    | { operator: 'notEquals'; value: Date; id?: string }
    | { operator: 'greaterThan'; value: Date; id?: string }
    | { operator: 'greaterThanOrEqual'; value: Date; id?: string }
    | { operator: 'lessThan'; value: Date; id?: string }
    | { operator: 'lessThanOrEqual'; value: Date; id?: string }
    | { operator: 'isNull'; id?: string }
    | { operator: 'notNull'; id?: string };

export type FilterGroup =
    | StringFilterGroup
    | NumberFilterGroup
    | TimestampFilterGroup
    | DateFilterGroup;

export const fieldIdFromFilterGroup = (fg: FilterGroup) =>
    `${fg.tableName}_${fg.fieldName}`;

export interface FilterableDimension extends Dimension {
    type:
        | DimensionType.STRING
        | DimensionType.NUMBER
        | DimensionType.DATE
        | DimensionType.TIMESTAMP;
}

const isFilterableDimension = (
    dimension: Dimension,
): dimension is FilterableDimension =>
    [
        DimensionType.STRING,
        DimensionType.NUMBER,
        DimensionType.DATE,
        DimensionType.TIMESTAMP,
    ].includes(dimension.type);

export const filterableDimensionsOnly = (
    dimensions: Dimension[],
): FilterableDimension[] => dimensions.filter(isFilterableDimension);

const lightdashTypeMap: { [columnType: string]: DimensionType } = {
    INTEGER: DimensionType.NUMBER,
    INT32: DimensionType.NUMBER,
    INT64: DimensionType.NUMBER,
    FLOAT: DimensionType.NUMBER,
    FLOAT32: DimensionType.NUMBER,
    FLOAT64: DimensionType.NUMBER,
    NUMERIC: DimensionType.NUMBER,
    BOOLEAN: DimensionType.BOOLEAN,
    STRING: DimensionType.STRING,
    TIMESTAMP: DimensionType.TIMESTAMP,
    DATETIME: DimensionType.STRING,
    DATE: DimensionType.DATE,
    TIME: DimensionType.STRING,
    BOOL: DimensionType.BOOLEAN,
    ARRAY: DimensionType.STRING,
    GEOGRAPHY: DimensionType.STRING,
    NUMBER: DimensionType.NUMBER,
    DECIMAL: DimensionType.NUMBER,
    INT: DimensionType.NUMBER,
    BIGINT: DimensionType.NUMBER,
    SMALLINT: DimensionType.NUMBER,
    FLOAT4: DimensionType.NUMBER,
    FLOAT8: DimensionType.NUMBER,
    DOUBLE: DimensionType.NUMBER,
    'DOUBLE PRECISION': DimensionType.NUMBER,
    REAL: DimensionType.NUMBER,
    VARCHAR: DimensionType.STRING,
    CHAR: DimensionType.STRING,
    CHARACTER: DimensionType.STRING,
    TEXT: DimensionType.STRING,
    BINARY: DimensionType.STRING,
    VARBINARY: DimensionType.STRING,
    TIMESTAMP_NTZ: DimensionType.TIMESTAMP,
    VARIANT: DimensionType.STRING,
    OBJECT: DimensionType.STRING,
    INT2: DimensionType.NUMBER,
    INT4: DimensionType.NUMBER,
    INT8: DimensionType.NUMBER,
    NCHAR: DimensionType.STRING,
    BPCHAR: DimensionType.STRING,
    'CHARACTER VARYING': DimensionType.STRING,
    NVARCHAR: DimensionType.STRING,
    'TIMESTAMP WITHOUT TIME ZONE': DimensionType.TIMESTAMP,
    GEOMETRY: DimensionType.STRING,
    'TIME WITHOUT TIME ZONE': DimensionType.STRING,
    XML: DimensionType.STRING,
    UUID: DimensionType.STRING,
    PG_LSN: DimensionType.STRING,
    MACADDR: DimensionType.STRING,
    JSON: DimensionType.STRING,
    JSONB: DimensionType.STRING,
    CIDR: DimensionType.STRING,
    INET: DimensionType.STRING,
    MONEY: DimensionType.NUMBER,
    SMALLSERIAL: DimensionType.NUMBER,
    SERIAL2: DimensionType.NUMBER,
    SERIAL: DimensionType.NUMBER,
    SERIAL4: DimensionType.NUMBER,
    BIGSERIAL: DimensionType.NUMBER,
    SERIAL8: DimensionType.NUMBER,
};
// Map native database types to sensible dimension types in lightdash
// Used to autogenerate explore tables from database table schemas
export const mapColumnTypeToLightdashType = (
    columnType: string,
): DimensionType => lightdashTypeMap[columnType.toUpperCase()] || 'string';

// THESE ALL GET DEFAULT CONVERTED TO STRINGS (SO NO SPECIAL TREATMENT)
// # TIMETZ not supported
// # TIME WITH TIME ZONE not supported
// # TIMESTAMP_LTZ not supported (see https://docs.looker.com/reference/field-params/dimension_group)
//     # TIMESTAMP_TZ not supported (see https://docs.looker.com/reference/field-params/dimension_group)
//     # HLLSKETCH not supported
// # TIMESTAMPTZ not supported
// # TIMESTAMP WITH TIME ZONE not supported
// # BIT, BIT VARYING, VARBIT not supported
// # BOX not supported
// # BYTEA not supported
// # CIRCLE not supported
// # INTERVAL not supported
// # LINE not supported
// # LSEG not supported
// # PATH not supported
// # POINT not supported
// # POLYGON not supported
// # TSQUERY, TSVECTOR not supported
// # TIMESTAMPTZ not supported
// # TIMESTAMP WITH TIME ZONE not supported
// # TIMETZ not supported
// # HLLSKETCH not supported
// # TIME WITH TIME ZONE not supported

const capitalize = (word: string): string =>
    word ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : '';

export const friendlyName = (text: string): string => {
    const [first, ...rest] = text.match(/[0-9]*[A-Za-z][a-z]*/g) || [];
    return [capitalize(first), ...rest].join(' ');
};

// DBT CONFIG
export type DbtNode = {
    unique_id: string;
    resource_type: string;
};
export type DbtModelNode = DbtNode & {
    columns: { [name: string]: DbtModelColumn };
    meta: DbtModelMetadata;
    database: string;
    schema: string;
    name: string;
    relation_name: string;
    depends_on: DbtTableDependency;
    description?: string;
    root_path: string;
    patch_path: string | null;
};
type DbtTableDependency = {
    nodes: string[];
};
export type DbtModelColumn = {
    name: string;
    description?: string;
    meta: DbtColumnMetadata;
    data_type?: string;
};

// CUSTOM LIGHTDASH CONFIG IN DBT
type DbtModelMetadata = DbtModelLightdashConfig & {};

type DbtModelLightdashConfig = {
    joins?: DbtModelJoin[];
};
type DbtModelJoin = {
    join: string;
    sql_on: string;
};
type DbtColumnMetadata = DbtColumnLightdashConfig & {};
type DbtColumnLightdashConfig = {
    dimension?: DbtColumnLightdashDimension;
    metrics?: { [metricName: string]: DbtColumnLightdashMetric };
};

type DbtColumnLightdashDimension = {
    name?: string;
    type?: DimensionType;
    description?: string;
    sql?: string;
};

export type DbtColumnLightdashMetric = {
    type: MetricType;
    description?: string;
    sql?: string;
};

type ApiErrorDetail = {
    name: string;
    statusCode: number;
    message: string;
    data: { [key: string]: string };
};
export type ApiError = {
    status: 'error';
    error: ApiErrorDetail;
};
export type ApiQueryResults = {
    metricQuery: MetricQuery;
    rows: { [col: string]: any }[];
};
export type ApiQueryResponse =
    | ApiError
    | {
          status: 'ok';
          results: ApiQueryResults;
      };

export type ApiCompiledQueryResults = string;
export type ApiCompiledQueryResponse =
    | ApiError
    | {
          status: 'ok';
          results: ApiCompiledQueryResults;
      };

export type ApiExploresResults = Explore[];
export type ApiExploresResponse =
    | ApiError
    | {
          status: 'ok';
          results: ApiExploresResults;
      };

export type ApiTablesResults = PartialTable[];
export type ApiTablesResponse =
    | ApiError
    | {
          status: 'ok';
          results: PartialTable[];
      };

export type ApiTableResults = Explore;
export type ApiTableResponse =
    | ApiError
    | {
          status: 'ok';
          results: ApiTableResults;
      };

export type ApiStatusResults = 'loading' | 'ready';
export type ApiStatusResponse =
    | ApiError
    | {
          status: 'ok';
          results: ApiStatusResults;
      };

export type ApiRefreshResults = undefined;
export type ApiRefreshResponse =
    | ApiError
    | {
          status: 'ok';
          results: ApiRefreshResults;
      };

export type ApiRegisterResponse =
    | ApiError
    | {
          status: 'ok';
          results: undefined;
      };

export interface LightdashUser {
    userUuid: string;
    email: string | undefined;
    firstName: string;
    lastName: string;
    organizationUuid: string | undefined;
    organizationName: string | undefined;
    isTrackingAnonymized: boolean;
}

export interface SessionUser extends LightdashUser {
    userId: number;
}

export type CreateInitialUserArgs = {
    firstName: string;
    lastName: string;
    organizationName: string;
    email: string;
    password: string;
    isMarketingOptedIn: boolean;
    isTrackingAnonymized: boolean;
};

export type UpdateUserArgs = {
    firstName: string;
    lastName: string;
    email: string;
};

export type ApiUserResponse =
    | ApiError
    | {
          status: 'ok';
          results: LightdashUser;
      };

export type ApiHealthResults = HealthState;
export type ApiHealthResponse =
    | ApiError
    | {
          status: 'ok';
          results: ApiHealthResults;
      };
export type InviteLink = {
    expiresAt: Date;
    inviteCode: string;
};
export type CreateInviteLink = Omit<InviteLink, 'inviteCode'>;
export type ApiInviteLinkResponse =
    | ApiError
    | {
          status: 'ok';
          results: InviteLink;
      };

export type ApiResults =
    | ApiQueryResults
    | ApiCompiledQueryResults
    | ApiTablesResults
    | ApiExploresResults
    | ApiTableResults
    | ApiStatusResults
    | ApiRefreshResults
    | ApiHealthResults
    | LightdashUser
    | SavedQuery
    | Space[]
    | InviteLink;

export type ApiResponse =
    | ApiQueryResponse
    | ApiCompiledQueryResponse
    | ApiTablesResponse
    | ApiExploresResponse
    | ApiTableResponse
    | ApiStatusResponse
    | ApiRefreshResponse
    | ApiHealthResponse
    | ApiUserResponse
    | ApiRegisterResponse
    | ApiInviteLinkResponse;

export enum LightdashMode {
    DEFAULT = 'default',
    DEMO = 'demo',
    PR = 'pr',
}

export type HealthState = {
    healthy: boolean;
    mode: LightdashMode;
    version: string;
    needsSetup: boolean;
    isAuthenticated: boolean;
    latest: {
        version?: string;
    };
    rudder: {
        writeKey: string;
        dataPlaneUrl: string;
    };
};

export interface DbtCatalogNode {
    metadata: DbtCatalogNodeMetadata;
    columns: {
        [k: string]: DbtCatalogNodeColumn;
    };
}

export interface DbtCatalogNodeMetadata {
    type: string;
    database: string;
    schema: string;
    name: string;
    comment?: string;
    owner?: string;
}

export interface DbtCatalogNodeColumn {
    type: string;
    comment?: string;
    index: number;
    name: string;
}

export interface DbtRpcDocsGenerateResults {
    nodes: {
        [k: string]: DbtCatalogNode;
    };
}

export const isDbtRpcDocsGenerateResults = (
    results: Record<string, any>,
): results is DbtRpcDocsGenerateResults =>
    'nodes' in results &&
    typeof results.nodes === 'object' &&
    results.nodes !== null &&
    Object.values(results.nodes).every(
        (node) =>
            typeof node === 'object' &&
            node !== null &&
            'metadata' in node &&
            'columns' in node,
    );

export interface DbtRpcCompileResults {
    results: { node: DbtNode }[];
}
export const isDbtRpcCompileResults = (
    results: Record<string, any>,
): results is DbtRpcCompileResults =>
    'results' in results &&
    Array.isArray(results.results) &&
    results.results.every(
        (result) =>
            typeof result === 'object' &&
            result !== null &&
            'node' in result &&
            typeof result.node === 'object' &&
            result.node !== null &&
            'unique_id' in result.node &&
            'resource_type' in result.node,
    );

export interface DbtRpcRunSqlResults {
    results: {
        table: { column_names: string[]; rows: any[][] };
    }[];
}
export const isDbtRpcRunSqlResults = (
    results: Record<string, any>,
): results is DbtRpcRunSqlResults =>
    'results' in results &&
    Array.isArray(results.results) &&
    results.results.every(
        (result) =>
            typeof result === 'object' &&
            result !== null &&
            'table' in result &&
            typeof result.table === 'object' &&
            result.table !== null &&
            'column_names' in result.table &&
            Array.isArray(result.table.column_names) &&
            'rows' in result.table &&
            Array.isArray(result.table.rows),
    );

type ValidSeriesLayout = {
    xDimension: string;
    yMetrics: string[];
    groupDimension: string | undefined;
};
type SeriesLayout = Partial<ValidSeriesLayout>;

export type SavedQuery = {
    uuid: string;
    name: string;
    tableName: string;
    metricQuery: MetricQuery;
    chartConfig: {
        chartType: DBChartTypes;
        seriesLayout: SeriesLayout;
    };
};

export type SpaceQuery = Pick<SavedQuery, 'uuid' | 'name'>;

export type Space = {
    uuid: string;
    name: string;
    queries: SpaceQuery[];
};

export type CreateSavedQuery = Omit<SavedQuery, 'uuid'>;

export type CreateSavedQueryVersion = Omit<SavedQuery, 'uuid' | 'name'>;

export type UpdateSavedQuery = Pick<SavedQuery, 'name'>;

export enum DBFieldTypes {
    DIMENSION = 'dimension',
    METRIC = 'metric',
}

export enum DBChartTypes {
    COLUMN = 'column',
    BAR = 'bar',
    LINE = 'line',
    SCATTER = 'scatter',
}
