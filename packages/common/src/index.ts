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

export type SqlResultsRow = { [columnName: string]: any };
export type SqlResultsField = { name: string; type: string }; // TODO: standardise column types
export type SqlQueryResults = {
    fields: SqlResultsField[]; // TODO: standard column types
    rows: SqlResultsRow[];
};

export function hexToRGB(hex: string, alpha: number | undefined): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);

    if (alpha !== undefined) {
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return `rgb(${r}, ${g}, ${b})`;
}

// Seeds
export const SEED_ORGANIZATION = {
    organization_uuid: '172a2270-000f-42be-9c68-c4752c23ae51',
    organization_name: 'Jaffle Shop',
};
export const SEED_USER = {
    user_uuid: 'b264d83a-9000-426a-85ec-3f9c20f368ce',
    first_name: 'Jane',
    last_name: 'Doe',
    is_marketing_opted_in: true,
    is_tracking_anonymized: false,
};
export const SEED_EMAIL = {
    user_id: 1,
    email: 'demo@lightdash.com',
    is_primary: true,
};
export const SEED_PASSWORD = {
    user_id: 1,
    password: 'demo_password!',
};
export const SEED_ORGANIZATION_MEMBERSHIP = {
    user_id: 1,
    organization_id: 1,
};
export const SEED_PROJECT = {
    project_uuid: '3675b69e-8324-4110-bdca-059031aa8da3',
    organization_id: 1,
    name: 'Jaffle shop',
    dbt_connection_type: null,
    dbt_connection: null,
};
export const SEED_SPACE = {
    project_id: 1,
    name: SEED_PROJECT.name,
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
    targetDatabase: SupportedDbtAdapter; // Type of target database e.g. postgres/redshift/bigquery/snowflake/spark
};

export type InlineError = {
    type: string;
    message: string;
};

export type ExploreError = Partial<Explore> & {
    name: string;
    errors: InlineError[];
};
export const isExploreError = (
    explore: Explore | ExploreError,
): explore is ExploreError => 'errors' in explore;

export type ExploreJoin = {
    table: string; // Must match a tableName in containing Explore
    sqlOn: string; // Built sql
};

export type CompiledExploreJoin = ExploreJoin & {
    compiledSqlOn: string; // Sql on clause with template variables resolved
};

export type SummaryExplore =
    | Pick<Explore, 'name'>
    | Pick<ExploreError, 'name' | 'errors'>;

export type TableBase = {
    name: string; // Must be sql friendly (a-Z, 0-9, _)
    description?: string; // Optional description of table
    database: string;
    schema: string;
    sqlTable: string; // The sql identifier for the table
};

export type Table = TableBase & {
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

export type CompiledTable = TableBase & {
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

export const getFieldRef = (field: Field): string =>
    `${field.table}.${field.name}`;

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

export type TableCalculation = {
    index?: number;
    name: string;
    displayName: string;
    sql: string;
};

export type CompiledTableCalculation = TableCalculation & {
    compiledSql: string;
};

// Object used to query an explore. Queries only happen within a single explore
export type MetricQuery = {
    dimensions: FieldId[]; // Dimensions to group by in the explore
    metrics: FieldId[]; // Metrics to compute in the explore
    filters: FilterGroup[]; // Filters applied to the table to query (logical AND)
    sorts: SortField[]; // Sorts for the data
    limit: number; // Max number of rows to return from query
    tableCalculations: TableCalculation[]; // calculations to append to results
};

export type CompiledMetricQuery = MetricQuery & {
    compiledTableCalculations: CompiledTableCalculation[];
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

export interface IFilter {
    tableName: string;
    fieldName: string;
    operator: FilterGroupOperator;
}

export interface StringFilterGroup extends IFilter {
    type: 'string';
    filters: StringFilter[];
}

export interface NumberFilterGroup extends IFilter {
    type: 'number';
    filters: NumberFilter[];
}

export interface DateFilterGroup extends IFilter {
    type: 'date';
    filters: DateAndTimestampFilter[];
}

export interface TimestampFilterGroup extends IFilter {
    type: 'timestamp';
    filters: DateAndTimestampFilter[];
}

export interface BooleanFilterGroup extends IFilter {
    type: 'boolean';
    filters: BooleanFilter[];
}

export type StringFilter =
    | { operator: 'equals'; values: string[]; id?: string }
    | { operator: 'notEquals'; values: string[]; id?: string }
    | { operator: 'startsWith'; value: string; id?: string }
    | { operator: 'doesNotInclude'; value: string; id?: string }
    | { operator: 'isNull'; id?: string }
    | { operator: 'notNull'; id?: string };

export type NumberFilter =
    | { operator: 'equals'; values: number[]; id?: string }
    | { operator: 'notEquals'; values: number[]; id?: string }
    | { operator: 'greaterThan'; value: number; id?: string }
    | { operator: 'lessThan'; value: number; id?: string }
    | { operator: 'isNull'; id?: string }
    | { operator: 'notNull'; id?: string };

export type BooleanFilter =
    | { operator: 'equals'; value?: boolean; id?: string }
    | { operator: 'isNull'; id?: string }
    | { operator: 'notNull'; id?: string };

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
    | DateFilterGroup
    | BooleanFilterGroup;

export const fieldIdFromFilterGroup = (fg: FilterGroup) =>
    `${fg.tableName}_${fg.fieldName}`;

export interface FilterableDimension extends Dimension {
    type:
        | DimensionType.STRING
        | DimensionType.NUMBER
        | DimensionType.DATE
        | DimensionType.TIMESTAMP
        | DimensionType.BOOLEAN;
}

const isFilterableDimension = (
    dimension: Dimension,
): dimension is FilterableDimension =>
    [
        DimensionType.STRING,
        DimensionType.NUMBER,
        DimensionType.DATE,
        DimensionType.TIMESTAMP,
        DimensionType.BOOLEAN,
    ].includes(dimension.type);

export const filterableDimensionsOnly = (
    dimensions: Dimension[],
): FilterableDimension[] => dimensions.filter(isFilterableDimension);

const capitalize = (word: string): string =>
    word ? `${word.charAt(0).toUpperCase()}${word.slice(1)}` : '';

export const friendlyName = (text: string): string => {
    const [first, ...rest] = text.match(/[0-9]*[A-Za-z][a-z]*/g) || [];
    return [capitalize(first), ...rest].join(' ');
};

export const snakeCaseName = (text: string): string =>
    text
        .replace(/\W+/g, ' ')
        .split(/ |\B(?=[A-Z])/)
        .map((word) => word.toLowerCase())
        .join('_');

export const hasSpecialCharacters = (text: string) => /[^a-zA-Z ]/g.test(text);

// DBT CONFIG
export enum SupportedDbtAdapter {
    BIGQUERY = 'bigquery',
    SPARK = 'spark',
    SNOWFLAKE = 'snowflake',
    REDSHIFT = 'redshift',
    POSTGRES = 'postgres',
}
export type DbtNode = {
    unique_id: string;
    resource_type: string;
};
export type DbtRawModelNode = DbtNode & {
    columns: { [name: string]: DbtModelColumn };
    config?: { meta?: DbtModelMetadata };
    meta: DbtModelMetadata;
    database: string | null;
    schema: string;
    name: string;
    relation_name: string;
    depends_on: DbtTableDependency;
    description?: string;
    root_path: string;
    patch_path: string | null;
};
export type DbtModelNode = DbtRawModelNode & {
    database: string;
};
type DbtTableDependency = {
    nodes: string[];
};
export type DbtModelColumn = {
    name: string;
    description?: string;
    meta: DbtColumnMetadata;
    data_type?: DimensionType;
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

export type ApiSqlQueryResults = {
    rows: { [col: string]: any }[];
};
export type ApiSqlQueryResponse =
    | ApiError
    | {
          status: 'ok';
          results: ApiSqlQueryResults;
      };

export type ProjectCatalog = {
    [database: string]: {
        [schema: string]: {
            [table: string]: Pick<TableBase, 'description' | 'sqlTable'>;
        };
    };
};
export type ApiCatalogResponse =
    | ApiError
    | {
          status: 'ok';
          results: ProjectCatalog;
      };

export enum TableSelectionType {
    ALL = 'ALL',
    WITH_TAGS = 'WITH_TAGS',
    WITH_NAMES = 'WITH_NAMES',
}

export type TablesConfiguration = {
    tableSelection: {
        type: TableSelectionType;
        value: string[] | null;
    };
};
export type ApiTablesConfigurationResponse =
    | ApiError
    | {
          status: 'ok';
          results: TablesConfiguration;
      };

export type ApiCompiledQueryResults = string;
export type ApiCompiledQueryResponse =
    | ApiError
    | {
          status: 'ok';
          results: ApiCompiledQueryResults;
      };

export type ApiExploresResults = SummaryExplore[];
export type ApiExploresResponse =
    | ApiError
    | {
          status: 'ok';
          results: ApiExploresResults;
      };

export type ApiExploreResults = Explore;
export type ApiExploreResponse =
    | ApiError
    | {
          status: 'ok';
          results: ApiExploreResults;
      };

export type ApiStatusResults = 'loading' | 'ready' | 'error';
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
    organizationUuid: string;
    organizationName: string;
    isTrackingAnonymized: boolean;
}

export interface SessionUser extends LightdashUser {
    userId: number;
}

export type OrganizationUser = Pick<
    LightdashUser,
    'userUuid' | 'firstName' | 'lastName' | 'email'
>;

export type CreateInitialUserArgs = {
    firstName: string;
    lastName: string;
    organizationName: string;
    email: string;
    password: string;
    isMarketingOptedIn: boolean;
    isTrackingAnonymized: boolean;
};

export type CreateOrganizationUser = Omit<
    CreateInitialUserArgs,
    'organizationName'
> & { inviteCode: string };

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
export type ApiOrganizationUsersResponse =
    | ApiError
    | {
          status: 'ok';
          results: OrganizationUser[];
      };

export type ApiProjectsResponse =
    | ApiError
    | {
          status: 'ok';
          results: OrganizationProject[];
      };

export type ApiProjectResponse =
    | ApiError
    | {
          status: 'ok';
          results: Project;
      };

export type ApiUpdateWarehouseConnectionResponse =
    | ApiError
    | {
          status: 'ok';
          results: WarehouseCredentials;
      };

export type ApiResults =
    | ApiQueryResults
    | ApiSqlQueryResults
    | ApiCompiledQueryResults
    | ApiExploresResults
    | ApiExploreResults
    | ApiStatusResults
    | ApiRefreshResults
    | ApiHealthResults
    | LightdashUser
    | SavedQuery
    | Space[]
    | InviteLink
    | OrganizationProject[]
    | Project
    | WarehouseCredentials
    | OrganizationUser[]
    | ProjectCatalog
    | TablesConfiguration
    | Dashboard;

export type ApiResponse =
    | ApiQueryResponse
    | ApiSqlQueryResponse
    | ApiCatalogResponse
    | ApiTablesConfigurationResponse
    | ApiCompiledQueryResponse
    | ApiExploresResponse
    | ApiExploreResponse
    | ApiStatusResponse
    | ApiRefreshResponse
    | ApiHealthResponse
    | ApiUserResponse
    | ApiRegisterResponse
    | ApiInviteLinkResponse
    | ApiProjectsResponse
    | ApiProjectResponse
    | ApiUpdateWarehouseConnectionResponse
    | ApiOrganizationUsersResponse;

export enum LightdashMode {
    DEFAULT = 'default',
    DEMO = 'demo',
    PR = 'pr',
    CLOUD_BETA = 'cloud_beta',
}
export const isLightdashMode = (x: string): x is LightdashMode =>
    Object.values<string>(LightdashMode).includes(x);

export enum LightdashInstallType {
    DOCKER_IMAGE = 'docker_image',
    BASH_INSTALL = 'bash_install',
    HEROKU = 'heroku',
    UNKNOWN = 'unknown',
}

export type HealthState = {
    healthy: boolean;
    mode: LightdashMode;
    version: string;
    needsSetup: boolean;
    needsProject: boolean;
    localDbtEnabled: boolean;
    defaultProject?: DbtProjectConfig;
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
    database: string | null;
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

export interface DbtManifest {
    nodes: Record<string, DbtNode>;
    metadata: DbtRawManifestMetadata;
}

export interface DbtRawManifestMetadata {
    dbt_schema_version: string;
    generated_at: string;
    adapter_type: string;
}

export interface DbtManifestMetadata extends DbtRawManifestMetadata {
    adapter_type: SupportedDbtAdapter;
}
const isDbtRawManifestMetadata = (x: any): x is DbtRawManifestMetadata =>
    typeof x === 'object' &&
    x !== null &&
    'dbt_schema_version' in x &&
    'generated_at' in x &&
    'adapter_type' in x;

export const isSupportedDbtAdapter = (
    x: DbtRawManifestMetadata,
): x is DbtManifestMetadata =>
    isDbtRawManifestMetadata(x) &&
    Object.values<string>(SupportedDbtAdapter).includes(x.adapter_type);

export interface DbtRpcGetManifestResults {
    manifest: DbtManifest;
}
export const isDbtRpcManifestResults = (
    results: Record<string, any>,
): results is DbtRpcGetManifestResults =>
    'manifest' in results &&
    typeof results.manifest === 'object' &&
    results.manifest !== null &&
    'nodes' in results.manifest &&
    'metadata' in results.manifest &&
    isDbtRawManifestMetadata(results.manifest.metadata);

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
    tableConfig: {
        columnOrder: string[];
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

export enum WarehouseTypes {
    BIGQUERY = 'bigquery',
    POSTGRES = 'postgres',
    REDSHIFT = 'redshift',
    SNOWFLAKE = 'snowflake',
    DATABRICKS = 'databricks',
}

export type CreateBigqueryCredentials = {
    type: WarehouseTypes.BIGQUERY;
    project: string;
    dataset: string;
    threads: number;
    timeoutSeconds: number;
    priority: 'interactive' | 'batch';
    keyfileContents: Record<string, string>;
    retries: number;
    location: string;
    maximumBytesBilled: number;
};

export const sensitiveCredentialsFieldNames = [
    'user',
    'password',
    'keyfileContents',
    'personalAccessToken',
] as const;

export const sensitiveDbtCredentialsFieldNames = [
    'personal_access_token',
    'api_key',
] as const;

export type SensitiveCredentialsFieldNames =
    typeof sensitiveCredentialsFieldNames[number];

export type BigqueryCredentials = Omit<
    CreateBigqueryCredentials,
    SensitiveCredentialsFieldNames
>;

export type CreateDatabricksCredentials = {
    type: WarehouseTypes.DATABRICKS;
    serverHostName: string;
    port: number;
    database: string;
    personalAccessToken: string;
    httpPath: string;
};

export type DatabricksCredentials = Omit<
    CreateDatabricksCredentials,
    SensitiveCredentialsFieldNames
>;

export type CreatePostgresCredentials = {
    type: WarehouseTypes.POSTGRES;
    host: string;
    user: string;
    password: string;
    port: number;
    dbname: string;
    schema: string;
    threads: number;
    keepalivesIdle?: number;
    searchPath?: string;
    role?: string;
    sslmode?: string;
};

export type PostgresCredentials = Omit<
    CreatePostgresCredentials,
    SensitiveCredentialsFieldNames
>;

export type CreateRedshiftCredentials = {
    type: WarehouseTypes.REDSHIFT;
    host: string;
    user: string;
    password: string;
    port: number;
    dbname: string;
    schema: string;
    threads: number;
    keepalivesIdle?: number;
    sslmode?: string;
};

export type RedshiftCredentials = Omit<
    CreateRedshiftCredentials,
    SensitiveCredentialsFieldNames
>;

export type CreateSnowflakeCredentials = {
    type: WarehouseTypes.SNOWFLAKE;
    account: string;
    user: string;
    password: string;
    role: string;
    database: string;
    warehouse: string;
    schema: string;
    threads: number;
    clientSessionKeepAlive: boolean;
    queryTag?: string;
};

export type SnowflakeCredentials = Omit<
    CreateSnowflakeCredentials,
    SensitiveCredentialsFieldNames
>;

export type CreateWarehouseCredentials =
    | CreateRedshiftCredentials
    | CreateBigqueryCredentials
    | CreatePostgresCredentials
    | CreateSnowflakeCredentials
    | CreateDatabricksCredentials;

export type WarehouseCredentials =
    | SnowflakeCredentials
    | RedshiftCredentials
    | PostgresCredentials
    | BigqueryCredentials
    | DatabricksCredentials;

export enum ProjectType {
    DBT = 'dbt',
    DBT_CLOUD_IDE = 'dbt_cloud_ide',
    GITHUB = 'github',
    GITLAB = 'gitlab',
}

export const ProjectTypeLabels: Record<ProjectType, string> = {
    [ProjectType.DBT]: 'dbt local server',
    [ProjectType.DBT_CLOUD_IDE]: 'dbt cloud',
    [ProjectType.GITHUB]: 'Github',
    [ProjectType.GITLAB]: 'GitLab',
};

export interface DbtProjectConfigBase {
    type: ProjectType;
    name: string;
}

export interface DbtLocalProjectConfig extends DbtProjectConfigBase {
    type: ProjectType.DBT;
    profiles_dir?: string;
    project_dir: string;
    target?: string;
}

export interface DbtCloudIDEProjectConfig extends DbtProjectConfigBase {
    type: ProjectType.DBT_CLOUD_IDE;
    api_key: string;
    account_id: string | number;
    environment_id: string | number;
    project_id: string | number;
}

export interface DbtGithubProjectConfig extends DbtProjectConfigBase {
    type: ProjectType.GITHUB;
    personal_access_token: string;
    repository: string;
    branch: string;
    project_sub_path: string;
}

export interface DbtGitlabProjectConfig extends DbtProjectConfigBase {
    type: ProjectType.GITLAB;
    personal_access_token: string;
    repository: string;
    branch: string;
    project_sub_path: string;
}

export type DbtProjectConfig =
    | DbtLocalProjectConfig
    | DbtCloudIDEProjectConfig
    | DbtGithubProjectConfig
    | DbtGitlabProjectConfig;

export type OrganizationProject = {
    projectUuid: string;
    name: string;
};

export type Project = {
    projectUuid: string;
    name: string;
    dbtConnection: DbtProjectConfig;
    warehouseConnection?: WarehouseCredentials;
};

export type CreateProject = Omit<Project, 'projectUuid'> & {
    warehouseConnection: CreateWarehouseCredentials;
};

export type UpdateProject = Omit<Project, 'projectUuid'> & {
    warehouseConnection: CreateWarehouseCredentials;
};

export enum DashboardTileTypes {
    SAVED_CHART = 'saved_chart',
}

type CreateDashboardTileBase = {
    uuid?: string;
    type: DashboardTileTypes;
    x: number;
    y: number;
    h: number;
    w: number;
};

type DashboardTileBase = Required<CreateDashboardTileBase>;

type DashboardChartTileProperties = {
    type: DashboardTileTypes.SAVED_CHART;
    properties: {
        savedChartUuid: string | null;
    };
};

export type CreateDashboardChartTile = CreateDashboardTileBase &
    DashboardChartTileProperties;
export type DashboardChartTile = DashboardTileBase &
    DashboardChartTileProperties;

export type CreateDashboard = {
    name: string;
    description?: string;
    tiles: CreateDashboardChartTile[];
};

export type Dashboard = {
    name: string;
    description?: string;
    uuid: string;
    updatedAt: Date;
    tiles: DashboardChartTile[];
};

export type DashboardBasicDetails = Pick<
    Dashboard,
    'uuid' | 'name' | 'description' | 'updatedAt'
>;

export type DashboardUnversionedFields = Pick<
    CreateDashboard,
    'name' | 'description'
>;
export type DashboardVersionedFields = Pick<CreateDashboard, 'tiles'>;

export type UpdateDashboard =
    | DashboardUnversionedFields
    | DashboardVersionedFields
    | (DashboardUnversionedFields & DashboardVersionedFields);

export const isDashboardUnversionedFields = (
    data: UpdateDashboard,
): data is DashboardUnversionedFields => 'name' in data && !!data.name;

export const isDashboardVersionedFields = (
    data: UpdateDashboard,
): data is DashboardVersionedFields => 'tiles' in data && !!data.tiles;
