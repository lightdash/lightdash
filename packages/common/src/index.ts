import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';
import { Dashboard, DashboardBasicDetails } from './types/dashboard';
import {
    CompiledDimension,
    CompiledField,
    CompiledMetric,
    Dimension,
    DimensionType,
    Field,
    FieldId,
    fieldId,
    FilterableDimension,
    FilterableField,
    isDimension,
    isField,
    isFilterableDimension,
    Metric,
    MetricType,
    Source,
} from './types/field';
import {
    DashboardFilterRule,
    DateFilterRule,
    FilterOperator,
    FilterRule,
    Filters,
    FilterType,
    getFilterGroupItemsPropertyName,
    getItemsFromFilterGroup,
    UnitOfTime,
} from './types/filter';
import { MetricQuery, TableCalculation } from './types/metricQuery';
import { OrganizationMemberProfile } from './types/organizationMemberProfile';
import { SavedChart } from './types/savedCharts';
import { LightdashUser } from './types/user';

export * from './authorization/organizationMemberAbility';
export * from './types/dashboard';
export * from './types/field';
export * from './types/filter';
export * from './types/metricQuery';
export * from './types/organization';
export * from './types/organizationMemberProfile';
export * from './types/savedCharts';
export * from './types/user';

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

export const hasIntersection = (tags: string[], tags2: string[]): boolean => {
    const intersection = tags.filter((value) => tags2.includes(value));
    return intersection.length > 0;
};

export const toggleArrayValue = (
    initialArray: string[],
    value: string,
): string[] => {
    const array = [...initialArray];
    const index = array.indexOf(value);
    if (index === -1) {
        array.push(value);
    } else {
        array.splice(index, 1);
    }
    return array;
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

export enum ProjectType {
    DBT = 'dbt',
    DBT_CLOUD_IDE = 'dbt_cloud_ide',
    GITHUB = 'github',
    GITLAB = 'gitlab',
    BITBUCKET = 'bitbucket',
    AZURE_DEVOPS = 'azure_devops',
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
    is_setup_complete: true,
};
export const SEED_EMAIL = {
    email: 'demo@lightdash.com',
    is_primary: true,
};
export const SEED_PASSWORD = {
    password: 'demo_password!',
};
export const SEED_PROJECT = {
    project_uuid: '3675b69e-8324-4110-bdca-059031aa8da3',
    name: 'Jaffle shop',
    dbt_connection_type: ProjectType.DBT,
    dbt_connection: null,
};
export const SEED_SPACE = {
    name: SEED_PROJECT.name,
};

export type ArgumentsOf<F extends Function> = F extends (
    ...args: infer A
) => any
    ? A
    : never;

export type Explore = {
    name: string; // Must be sql friendly (a-Z, 0-9, _)
    label: string; // Friendly name
    tags: string[];
    baseTable: string; // Must match a tableName in tables
    joinedTables: CompiledExploreJoin[]; // Must match a tableName in tables
    tables: { [tableName: string]: CompiledTable }; // All tables in this explore
    targetDatabase: SupportedDbtAdapter; // Type of target database e.g. postgres/redshift/bigquery/snowflake/spark
};

export enum InlineErrorType {
    METADATA_PARSE_ERROR = 'METADATA_PARSE_ERROR',
    NO_DIMENSIONS_FOUND = 'NO_DIMENSIONS_FOUND',
}

export type InlineError = {
    type: InlineErrorType;
    message: string;
};

export type ExploreError = Partial<Explore> & {
    name: string;
    label: string;
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
    | Pick<Explore, 'name' | 'label' | 'tags'>
    | Pick<ExploreError, 'name' | 'label' | 'tags' | 'errors'>;

export type TableBase = {
    name: string; // Must be sql friendly (a-Z, 0-9, _)
    label: string; // Friendly name
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

export type CompiledTable = TableBase & {
    dimensions: Record<string, CompiledDimension>;
    metrics: Record<string, CompiledMetric>;
    lineageGraph: LineageGraph;
    source?: Source | undefined;
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

export const getFields = (explore: Explore): CompiledField[] => [
    ...getDimensions(explore),
    ...getMetrics(explore),
];

export const getVisibleFields = (explore: Explore): CompiledField[] =>
    getFields(explore).filter(({ hidden }) => !hidden);

export const findFieldByIdInExplore = (
    explore: Explore,
    id: FieldId,
): Field | undefined =>
    getFields(explore).find((field) => fieldId(field) === id);

export enum FilterGroupOperator {
    and = 'and',
    or = 'or',
}

export const filterableDimensionsOnly = (
    dimensions: Dimension[],
): FilterableDimension[] => dimensions.filter(isFilterableDimension);

export const getFilterTypeFromField = (field: FilterableField): FilterType => {
    const fieldType = field.type;
    switch (field.type) {
        case DimensionType.STRING:
        case MetricType.STRING:
            return FilterType.STRING;
        case DimensionType.NUMBER:
        case MetricType.NUMBER:
        case MetricType.AVERAGE:
        case MetricType.COUNT:
        case MetricType.COUNT_DISTINCT:
        case MetricType.SUM:
        case MetricType.MIN:
        case MetricType.MAX:
            return FilterType.NUMBER;
        case DimensionType.TIMESTAMP:
        case DimensionType.DATE:
        case MetricType.DATE:
            return FilterType.DATE;
        case DimensionType.BOOLEAN:
        case MetricType.BOOLEAN:
            return FilterType.BOOLEAN;
        default: {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const never: never = field;
            throw Error(`No filter type found for field type: ${fieldType}`);
        }
    }
};

export const getFilterRuleWithDefaultValue = <T extends FilterRule>(
    field: FilterableField,
    filterRule: T,
    value?: any,
): T => {
    const filterType = getFilterTypeFromField(field);
    const filterRuleDefaults: Partial<FilterRule> = {};
    if (
        ![FilterOperator.NULL, FilterOperator.NOT_NULL].includes(
            filterRule.operator,
        )
    ) {
        switch (filterType) {
            case FilterType.DATE: {
                if (filterRule.operator === FilterOperator.IN_THE_PAST) {
                    filterRuleDefaults.values =
                        value !== undefined ? [value] : [1];
                    filterRuleDefaults.settings = {
                        unitOfTime: UnitOfTime.days,
                        completed: false,
                    } as DateFilterRule['settings'];
                } else {
                    filterRuleDefaults.values = [new Date()];
                }
                break;
            }
            case FilterType.BOOLEAN: {
                filterRuleDefaults.values =
                    value !== undefined ? [value] : [false];
                break;
            }
            default:
                break;
        }
    }
    return {
        ...filterRule,
        values: value !== undefined && value !== null ? [value] : [],
        settings: undefined,
        ...filterRuleDefaults,
    };
};

export const createFilterRuleFromField = (
    field: FilterableField,
    value?: any,
): FilterRule =>
    getFilterRuleWithDefaultValue(
        field,
        {
            id: uuidv4(),
            target: {
                fieldId: fieldId(field),
            },
            operator:
                value === null ? FilterOperator.NULL : FilterOperator.EQUALS,
        },
        value,
    );

export const createDashboardFilterRuleFromField = (
    field: FilterableField,
): DashboardFilterRule =>
    getFilterRuleWithDefaultValue(field, {
        id: uuidv4(),
        target: {
            fieldId: fieldId(field),
            tableName: field.table,
        },
        operator: FilterOperator.EQUALS,
    });

type AddFilterRuleArgs = {
    filters: Filters;
    field: FilterableField;
    value?: any;
};
export const addFilterRule = ({
    filters,
    field,
    value,
}: AddFilterRuleArgs): Filters => {
    const groupKey = isDimension(field) ? 'dimensions' : 'metrics';
    const group = filters[groupKey];
    return {
        ...filters,
        [groupKey]: {
            id: uuidv4(),
            ...group,
            [getFilterGroupItemsPropertyName(group)]: [
                ...getItemsFromFilterGroup(group),
                createFilterRuleFromField(field, value),
            ],
        },
    };
};

export const getFilterRulesByFieldType = (
    fields: Field[],
    filterRules: FilterRule[],
): {
    dimensions: FilterRule[];
    metrics: FilterRule[];
} =>
    filterRules.reduce<{
        dimensions: FilterRule[];
        metrics: FilterRule[];
    }>(
        (sum, filterRule) => {
            const fieldInRule = fields.find(
                (field) => fieldId(field) === filterRule.target.fieldId,
            );
            if (fieldInRule) {
                if (isDimension(fieldInRule)) {
                    return {
                        ...sum,
                        dimensions: [...sum.dimensions, filterRule],
                    };
                }
                return {
                    ...sum,
                    metrics: [...sum.metrics, filterRule],
                };
            }

            return sum;
        },
        {
            dimensions: [],
            metrics: [],
        },
    );

const capitalize = (word: string): string =>
    word ? `${word.charAt(0).toUpperCase()}${word.slice(1).toLowerCase()}` : '';

export const friendlyName = (text: string): string => {
    const normalisedText =
        text === text.toUpperCase() ? text.toLowerCase() : text; // force all uppercase to all lowercase
    const [first, ...rest] =
        normalisedText.match(/[0-9]*[A-Za-z][a-z]*|[0-9]+/g) || [];
    return [
        capitalize(first.toLowerCase()),
        ...rest.map((word) => word.toLowerCase()),
    ].join(' ');
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
    DATABRICKS = 'databricks',
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
    tags: string[];
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
    label?: string;
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
    label?: string;
    type?: DimensionType;
    description?: string;
    sql?: string;
    time_intervals?: string | string[];
    hidden?: boolean;
};

export type DbtColumnLightdashMetric = {
    label?: string;
    type: MetricType;
    description?: string;
    sql?: string;
    hidden?: boolean;
};

export type ApiQueryResults = {
    metricQuery: MetricQuery;
    rows: { [col: string]: any }[];
};

export type ApiSqlQueryResults = {
    rows: { [col: string]: any }[];
};

export type ProjectCatalog = {
    [database: string]: {
        [schema: string]: {
            [table: string]: Pick<TableBase, 'description' | 'sqlTable'>;
        };
    };
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

export type ApiCompiledQueryResults = string;

export type ApiExploresResults = SummaryExplore[];

export type ApiExploreResults = Explore;

export type ApiStatusResults = 'loading' | 'ready' | 'error';

export type ApiRefreshResults = undefined;

export type CreateUserArgs = {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
};

export type CreateOrganizationUser = CreateUserArgs & {
    inviteCode: string;
};

export type CompleteUserArgs = {
    organizationName?: string;
    jobTitle: string;
    isMarketingOptedIn: boolean;
    isTrackingAnonymized: boolean;
};

export type UpdateUserArgs = {
    firstName: string;
    lastName: string;
    email: string;
    isMarketingOptedIn: boolean;
    isTrackingAnonymized: boolean;
    isSetupComplete: boolean;
};

export type CreateOpenIdIdentity = {
    subject: string;
    issuer: string;
    userId: number;
    email: string;
};

export type UpdateOpenIdentity = Pick<
    CreateOpenIdIdentity,
    'subject' | 'issuer' | 'email'
>;

export type OpenIdIdentity = CreateOpenIdIdentity & {
    createdAt: Date;
};

export type OpenIdIdentitySummary = Pick<
    OpenIdIdentity,
    'issuer' | 'email' | 'createdAt'
>;

export type DeleteOpenIdentity = Pick<
    OpenIdIdentitySummary,
    'issuer' | 'email'
>;

export type PasswordResetLink = {
    expiresAt: Date;
    code: string;
    email: string;
    url: string;
    isExpired: boolean;
};

export type CreatePasswordResetLink = Pick<PasswordResetLink, 'email'>;

export type PasswordReset = {
    code: string;
    newPassword: string;
};

export type ApiHealthResults = HealthState;
export type InviteLink = {
    expiresAt: Date;
    inviteCode: string;
    inviteUrl: string;
    organisationUuid: string;
};
export type CreateInviteLink = Pick<InviteLink, 'expiresAt'>;

export type OnbordingRecord = {
    ranQueryAt: Date | null;
    shownSuccessAt: Date | null;
};

export type IncompleteOnboarding = {
    isComplete: false;
    connectedProject: boolean;
    definedMetric: boolean;
    ranQuery: boolean;
    savedChart: boolean;
    invitedUser: boolean;
};

export type CompleteOnboarding = {
    isComplete: true;
    showSuccess: boolean;
};

export type ApiFlashResults = Record<string, string[]>;

export type OnboardingStatus = IncompleteOnboarding | CompleteOnboarding;

export type Organisation = {
    name: string;
    allowedEmailDomains: string[];
};

export type UpdateOrganisation = Partial<Organisation>;

type ApiResults =
    | ApiQueryResults
    | ApiSqlQueryResults
    | ApiCompiledQueryResults
    | ApiExploresResults
    | ApiExploreResults
    | ApiStatusResults
    | ApiRefreshResults
    | ApiHealthResults
    | Organisation
    | LightdashUser
    | SavedChart
    | Space[]
    | InviteLink
    | OrganizationProject[]
    | Project
    | WarehouseCredentials
    | OrganizationMemberProfile[]
    | ProjectCatalog
    | TablesConfiguration
    | Dashboard
    | DashboardBasicDetails[]
    | OnboardingStatus
    | Dashboard[]
    | DeleteOpenIdentity
    | ApiFlashResults
    | OpenIdIdentitySummary[]
    | FilterableField[];

export type ApiResponse = {
    status: 'ok';
    results: ApiResults;
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
    hasEmailClient: boolean;
    latest: {
        version?: string;
    };
    rudder: {
        writeKey: string;
        dataPlaneUrl: string;
    };
    sentry: {
        dsn: string;
        environment: string;
        release: string;
    };
    chatwoot: {
        baseUrl: string;
        websiteToken: string;
    };
    auth: {
        disablePasswordAuthentication: boolean;
        google: {
            oauth2ClientId: string | undefined;
            loginPath: string;
        };
    };
    cohere: {
        token: string;
    };
    siteUrl: string;
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

export interface DbtPackage {
    package: string;
    version: string;
}

export interface DbtPackages {
    packages: DbtPackage[];
}

export const isDbtPackages = (
    results: Record<string, any>,
): results is DbtPackages => 'packages' in results;

type DbtMetricFilter = {
    field: string;
    operator: string;
    value: string;
};

export type DbtMetric = {
    unique_id: string;
    package_name: string;
    path: string;
    root_path: string;
    original_file_path: string;
    model: string;
    name: string;
    description: string;
    label: string;
    type: string;
    timestamp: string | null;
    filters: DbtMetricFilter[];
    time_grains: string[];
    dimensions: string[];
    resource_type?: 'metric';
    meta?: Record<string, any> & DbtMetricLightdashMetadata;
    tags?: string[];
    sql?: string | null;
};

export type DbtMetricLightdashMetadata = {
    hidden?: boolean;
};

export interface DbtManifest {
    nodes: Record<string, DbtNode>;
    metadata: DbtRawManifestMetadata;
    metrics: Record<string, DbtMetric>;
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
    'metrics' in results.manifest &&
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

export type SpaceQuery = Pick<SavedChart, 'uuid' | 'name' | 'updatedAt'>;

export type Space = {
    uuid: string;
    name: string;
    queries: SpaceQuery[];
};

export enum DBFieldTypes {
    DIMENSION = 'dimension',
    METRIC = 'metric',
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
    ra3Node?: boolean;
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

export const ProjectTypeLabels: Record<ProjectType, string> = {
    [ProjectType.DBT]: 'dbt local server',
    [ProjectType.DBT_CLOUD_IDE]: 'dbt cloud',
    [ProjectType.GITHUB]: 'Github',
    [ProjectType.GITLAB]: 'GitLab',
    [ProjectType.BITBUCKET]: 'BitBucket',
    [ProjectType.AZURE_DEVOPS]: 'Azure DevOps',
};

export interface DbtProjectConfigBase {
    type: ProjectType;
    name: string;
}

export interface DbtProjectCompilerBase extends DbtProjectConfigBase {
    target?: string;
    environment?: Record<string, string>;
}

export interface DbtLocalProjectConfig extends DbtProjectCompilerBase {
    type: ProjectType.DBT;
    profiles_dir?: string;
    project_dir?: string;
}

export interface DbtCloudIDEProjectConfig extends DbtProjectConfigBase {
    type: ProjectType.DBT_CLOUD_IDE;
    api_key: string;
    account_id: string | number;
    environment_id: string | number;
    project_id: string | number;
}

export interface DbtGithubProjectConfig extends DbtProjectCompilerBase {
    type: ProjectType.GITHUB;
    personal_access_token: string;
    repository: string;
    branch: string;
    project_sub_path: string;
    host_domain?: string;
}

export interface DbtGitlabProjectConfig extends DbtProjectCompilerBase {
    type: ProjectType.GITLAB;
    personal_access_token: string;
    repository: string;
    branch: string;
    project_sub_path: string;
    host_domain?: string;
}

export interface DbtBitBucketProjectConfig extends DbtProjectCompilerBase {
    type: ProjectType.BITBUCKET;
    username: string;
    personal_access_token: string;
    repository: string;
    branch: string;
    project_sub_path: string;
    host_domain?: string;
}

export interface DbtAzureDevOpsProjectConfig extends DbtProjectCompilerBase {
    type: ProjectType.AZURE_DEVOPS;
    personal_access_token: string;
    organization: string;
    project: string;
    repository: string;
    branch: string;
    project_sub_path: string;
}

export type DbtProjectConfig =
    | DbtLocalProjectConfig
    | DbtCloudIDEProjectConfig
    | DbtGithubProjectConfig
    | DbtBitBucketProjectConfig
    | DbtGitlabProjectConfig
    | DbtAzureDevOpsProjectConfig;

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

export const getItemId = (item: Field | TableCalculation) =>
    isField(item) ? fieldId(item) : item.name;
export const getItemLabel = (item: Field | TableCalculation) =>
    isField(item) ? `${item.tableLabel} ${item.label}` : item.displayName;
export const getItemIcon = (item: Field | TableCalculation) => {
    if (isField(item)) {
        return isDimension(item) ? 'tag' : 'numerical';
    }
    return 'function';
};
export const getItemColor = (item: Field | TableCalculation) => {
    if (isField(item)) {
        return isDimension(item) ? '#0E5A8A' : '#A66321';
    }
    return '#0A6640';
};
