import moment from 'moment';
import { v4 as uuidv4 } from 'uuid';
import { Dashboard, DashboardBasicDetails } from './types/dashboard';
import { convertAdditionalMetric } from './types/dbt';
import { Explore, SummaryExplore } from './types/explore';
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
import {
    AdditionalMetric,
    isAdditionalMetric,
    MetricQuery,
    TableCalculation,
} from './types/metricQuery';
import {
    OrganizationMemberProfile,
    OrganizationMemberRole,
} from './types/organizationMemberProfile';
import {
    CreatePersonalAccessToken,
    PersonalAccessToken,
} from './types/personalAccessToken';
import {
    ProjectMemberProfile,
    ProjectMemberRole,
} from './types/projectMemberProfile';
import { SavedChart, Series } from './types/savedCharts';
import { SearchResults } from './types/search';
import { Space } from './types/space';
import { TableBase } from './types/table';
import { TimeFrames } from './types/timeFrames';
import { LightdashUser } from './types/user';
import { formatItemValue } from './utils/formatting';

export * from './authorization/index';
export * from './authorization/types';
export * from './compiler/exploreCompiler';
export * from './compiler/translator';
export { default as lightdashDbtYamlSchema } from './schemas/json/lightdash-dbt-2.0.json';
export * from './templating/template';
export * from './types/api';
export * from './types/dashboard';
export * from './types/dbt';
export * from './types/errors';
export * from './types/explore';
export * from './types/field';
export * from './types/filter';
export * from './types/job';
export * from './types/metricQuery';
export * from './types/organization';
export * from './types/organizationMemberProfile';
export * from './types/personalAccessToken';
export * from './types/projectMemberProfile';
export * from './types/savedCharts';
export * from './types/search';
export * from './types/share';
export * from './types/space';
export * from './types/table';
export * from './types/timeFrames';
export * from './types/user';
export * from './utils/api';
export * from './utils/formatting';
export * from './utils/timeFrames';

export const validateEmail = (email: string): boolean => {
    const re =
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
};

export const hasIntersection = (tags: string[], tags2: string[]): boolean => {
    const intersection = tags.filter((value) => tags2.includes(value));
    return intersection.length > 0;
};

export const toggleArrayValue = <T = string>(
    initialArray: T[],
    value: T,
): T[] => {
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
    DEFAULT = 'DEFAULT',
    PREVIEW = 'PREVIEW',
}

export enum DbtProjectType {
    DBT = 'dbt',
    DBT_CLOUD_IDE = 'dbt_cloud_ide',
    GITHUB = 'github',
    GITLAB = 'gitlab',
    BITBUCKET = 'bitbucket',
    AZURE_DEVOPS = 'azure_devops',
}

// Seeds

export const SEED_ORG_1 = {
    organization_uuid: '172a2270-000f-42be-9c68-c4752c23ae51',
    organization_name: 'Jaffle Shop',
};
export const SEED_ORG_1_ADMIN = {
    user_uuid: 'b264d83a-9000-426a-85ec-3f9c20f368ce',
    first_name: 'David',
    last_name: 'Attenborough',
    is_marketing_opted_in: true,
    is_tracking_anonymized: false,
    is_setup_complete: true,
    is_active: true,
};
export const SEED_ORG_1_ADMIN_EMAIL = {
    email: 'demo@lightdash.com',
    is_primary: true,
};
export const SEED_ORG_1_ADMIN_PASSWORD = {
    password: 'demo_password!',
};
// Another user
export const SEED_ORG_2 = {
    organization_uuid: '42339eef-359e-4ec4-b810-54ef0b4e3446',
    organization_name: 'Another Shop',
};
export const SEED_ORG_2_ADMIN = {
    user_uuid: '57cd4548-cbe3-42b3-aa13-97821713e307',
    first_name: 'Another',
    last_name: 'User',
    is_marketing_opted_in: true,
    is_tracking_anonymized: false,
    is_setup_complete: true,
    is_active: true,
};
export const SEED_ORG_2_ADMIN_EMAIL = {
    email: 'another@lightdash.com',
    is_primary: true,
};
export const SEED_ORG_2_ADMIN_PASSWORD = {
    password: 'demo_password!',
};

export const SEED_PROJECT = {
    project_uuid: '3675b69e-8324-4110-bdca-059031aa8da3',
    name: 'Jaffle shop',
    project_type: ProjectType.DEFAULT,
    dbt_connection_type: DbtProjectType.DBT,
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
                    const numberValue =
                        value === undefined || typeof value !== 'number'
                            ? 1
                            : value;

                    filterRuleDefaults.values = [numberValue];
                    filterRuleDefaults.settings = {
                        unitOfTime: UnitOfTime.days,
                        completed: false,
                    } as DateFilterRule['settings'];
                } else {
                    const valueIsDate =
                        value !== undefined && typeof value !== 'number';
                    const defaultTimeIntervalValues: Record<string, Date> = {
                        [TimeFrames.DAY]: new Date(),
                        [TimeFrames.WEEK]: moment(
                            valueIsDate ? value : undefined,
                        )
                            .utc(true)
                            .startOf('week')
                            .toDate(),
                        [TimeFrames.MONTH]: moment()
                            .utc(true)
                            .startOf('month')
                            .toDate(),
                        [TimeFrames.YEAR]: moment(
                            valueIsDate ? value : undefined,
                        )
                            .utc(true)
                            .startOf('year')
                            .toDate(),
                    };
                    const defaultDate =
                        isDimension(field) &&
                        field.timeInterval &&
                        defaultTimeIntervalValues[field.timeInterval]
                            ? defaultTimeIntervalValues[field.timeInterval]
                            : new Date();

                    const dateValue = valueIsDate ? value : defaultDate;
                    filterRuleDefaults.values = [dateValue];
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

export const snakeCaseName = (text: string): string =>
    text
        .replace(/\W+/g, ' ')
        .split(/ |\B(?=[A-Z])/)
        .map((word) => word.toLowerCase())
        .join('_');

export const hasSpecialCharacters = (text: string) => /[^a-zA-Z ]/g.test(text);

export type ResultRow = {
    [col: string]: {
        value: {
            raw: any;
            formatted: any;
        };
    };
};
export type ApiQueryResults = {
    metricQuery: MetricQuery;
    rows: ResultRow[];
};

export type ApiSqlQueryResults = {
    fields: Record<string, { type: DimensionType }>;
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

export type CreateProjectMember = {
    email: string;
    role: ProjectMemberRole;
    sendEmail: boolean;
};

export type UpdateProjectMember = {
    role: ProjectMemberRole;
};

export type ApiCompiledQueryResults = string;

export type ApiExploresResults = SummaryExplore[];

export type ApiExploreResults = Explore;

export type ApiStatusResults = 'loading' | 'ready' | 'error';

export type ApiRefreshResults = {
    jobUuid: string;
};

export type ApiJobStartedResults = {
    jobUuid: string;
};

export type ApiCreateUserTokenResults = {
    token: string;
    expiresAt: Date;
};

export type ActivateUser = {
    firstName: string;
    lastName: string;
    password: string;
};

export type CreateUserArgs = {
    firstName: string;
    lastName: string;
    email: string;
    password?: string;
};

export type CreateUserWithRole = {
    firstName: string;
    lastName: string;
    email: string;
    password?: string;
    role: OrganizationMemberRole;
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
    issuerType: 'google' | 'okta';
    userId: number;
    email: string;
};

export type UpdateOpenIdentity = Pick<
    CreateOpenIdIdentity,
    'subject' | 'issuer' | 'email' | 'issuerType'
>;

export type OpenIdIdentity = CreateOpenIdIdentity & {
    createdAt: Date;
};

export type OpenIdIdentitySummary = Pick<
    OpenIdIdentity,
    'issuer' | 'email' | 'createdAt' | 'issuerType'
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
    userUuid: string;
    email: string;
};
export type CreateInviteLink = Pick<InviteLink, 'expiresAt' | 'email'> & {
    email: string;
    role?: OrganizationMemberRole;
};

export type OnbordingRecord = {
    ranQueryAt: Date | null;
    shownSuccessAt: Date | null;
};

export type OnboardingStatus = {
    isComplete: boolean;
    ranQuery: boolean;
};

export type ProjectSavedChartStatus = boolean;

export type ApiFlashResults = Record<string, string[]>;

export type Organisation = {
    organizationUuid: string;
    name: string;
    allowedEmailDomains: string[];
    chartColors?: string[];
    needsProject?: boolean;
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
    | SavedChart[]
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
    | FilterableField[]
    | ProjectSavedChartStatus
    | undefined
    | ApiJobStartedResults
    | ApiCreateUserTokenResults
    | CreatePersonalAccessToken
    | PersonalAccessToken
    | ProjectMemberProfile[]
    | SearchResults
    | Space;

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
    localDbtEnabled: boolean;
    defaultProject?: DbtProjectConfig;
    isAuthenticated: boolean;
    requiresOrgRegistration: boolean;
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
    intercom: {
        appId: string;
        apiBase: string;
    };
    auth: {
        disablePasswordAuthentication: boolean;
        google: {
            oauth2ClientId: string | undefined;
            loginPath: string;
        };
        okta: {
            enabled: boolean;
            loginPath: string;
        };
    };
    cohere: {
        token: string;
    };
    siteUrl: string;
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
    threads?: number;
    timeoutSeconds: number | undefined;
    priority: 'interactive' | 'batch' | undefined;
    keyfileContents: Record<string, string>;
    retries: number | undefined;
    location: string | undefined;
    maximumBytesBilled: number | undefined;
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
    threads?: number;
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
    threads?: number;
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
    password?: string;
    privateKey?: string;
    privateKeyPass?: string;
    role?: string;
    database: string;
    warehouse: string;
    schema: string;
    threads?: number;
    clientSessionKeepAlive?: boolean;
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

export const DbtProjectTypeLabels: Record<DbtProjectType, string> = {
    [DbtProjectType.DBT]: 'dbt local server',
    [DbtProjectType.DBT_CLOUD_IDE]: 'dbt cloud',
    [DbtProjectType.GITHUB]: 'Github',
    [DbtProjectType.GITLAB]: 'GitLab',
    [DbtProjectType.BITBUCKET]: 'BitBucket',
    [DbtProjectType.AZURE_DEVOPS]: 'Azure DevOps',
};

export interface DbtProjectConfigBase {
    type: DbtProjectType;
}

export type DbtProjectEnvironmentVariable = {
    key: string;
    value: string;
};

export interface DbtProjectCompilerBase extends DbtProjectConfigBase {
    target?: string;
    environment?: DbtProjectEnvironmentVariable[];
}

export interface DbtLocalProjectConfig extends DbtProjectCompilerBase {
    type: DbtProjectType.DBT;
    profiles_dir?: string;
    project_dir?: string;
}

export interface DbtCloudIDEProjectConfig extends DbtProjectConfigBase {
    type: DbtProjectType.DBT_CLOUD_IDE;
    api_key: string;
    account_id: string | number;
    environment_id: string | number;
    project_id: string | number;
}

export interface DbtGithubProjectConfig extends DbtProjectCompilerBase {
    type: DbtProjectType.GITHUB;
    personal_access_token: string;
    repository: string;
    branch: string;
    project_sub_path: string;
    host_domain?: string;
}

export interface DbtGitlabProjectConfig extends DbtProjectCompilerBase {
    type: DbtProjectType.GITLAB;
    personal_access_token: string;
    repository: string;
    branch: string;
    project_sub_path: string;
    host_domain?: string;
}

export interface DbtBitBucketProjectConfig extends DbtProjectCompilerBase {
    type: DbtProjectType.BITBUCKET;
    username: string;
    personal_access_token: string;
    repository: string;
    branch: string;
    project_sub_path: string;
    host_domain?: string;
}

export interface DbtAzureDevOpsProjectConfig extends DbtProjectCompilerBase {
    type: DbtProjectType.AZURE_DEVOPS;
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
    type: ProjectType;
};

export type Project = {
    organizationUuid: string;
    projectUuid: string;
    name: string;
    type: ProjectType;
    dbtConnection: DbtProjectConfig;
    warehouseConnection?: WarehouseCredentials;
};

export type CreateProject = Omit<
    Project,
    'projectUuid' | 'organizationUuid'
> & {
    warehouseConnection: CreateWarehouseCredentials;
};

export type UpdateProject = Omit<
    Project,
    'projectUuid' | 'organizationUuid' | 'type'
> & {
    warehouseConnection: CreateWarehouseCredentials;
};
export const findItem = (
    items: Array<Field | TableCalculation>,
    id: string | undefined,
) =>
    items.find((item) =>
        isField(item) ? fieldId(item) === id : item.name === id,
    );
export const getItemId = (item: Field | AdditionalMetric | TableCalculation) =>
    isField(item) || isAdditionalMetric(item) ? fieldId(item) : item.name;
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

export const isNumericItem = (
    item: Field | AdditionalMetric | TableCalculation | undefined,
): boolean => {
    if (!item) {
        return false;
    }
    if (isField(item) || isAdditionalMetric(item)) {
        const numericTypes: string[] = [
            DimensionType.NUMBER,
            MetricType.NUMBER,
            MetricType.AVERAGE,
            MetricType.COUNT,
            MetricType.COUNT_DISTINCT,
            MetricType.SUM,
            MetricType.MIN,
            MetricType.MAX,
        ];
        return numericTypes.includes(item.type);
    }
    return true;
};

export const getResultValues = (
    rows: ResultRow[],
    onlyRaw: boolean = false,
): { [col: string]: any }[] =>
    rows.map((row: ResultRow) =>
        Object.keys(row).reduce((acc, key) => {
            const value: string = onlyRaw
                ? row[key]?.value?.raw
                : row[key]?.value?.formatted || row[key]?.value?.raw;

            return { ...acc, [key]: value };
        }, {}),
    );

export const getAxisName = ({
    isAxisTheSameForAllSeries,
    selectedAxisIndex,
    axisReference,
    axisIndex,
    axisName,
    series,
    items,
}: {
    isAxisTheSameForAllSeries: boolean;
    selectedAxisIndex: number;
    axisReference: 'yRef' | 'xRef';
    axisIndex: number;
    axisName?: string;
    series?: Series[];
    items: Array<Field | TableCalculation>;
}): string | undefined => {
    const defaultItem = items.find(
        (item) =>
            getItemId(item) === (series || [])[0]?.encode[axisReference].field,
    );
    const fallbackSeriesName: string | undefined =
        series && series.length === 1
            ? series[0].name || (defaultItem && getItemLabel(defaultItem))
            : undefined;
    return !isAxisTheSameForAllSeries || selectedAxisIndex === axisIndex
        ? axisName || fallbackSeriesName
        : undefined;
};

export function getFieldMap(
    explore: Explore,
    additionalMetrics: AdditionalMetric[] = [],
): Record<string, CompiledField | AdditionalMetric> {
    return [...getFields(explore), ...additionalMetrics].reduce(
        (sum, field) => ({
            ...sum,
            [fieldId(field)]: field,
        }),
        {},
    );
}

export function getItemMap(
    explore: Explore,
    additionalMetrics: AdditionalMetric[] = [],
    tableCalculations: TableCalculation[] = [],
): Record<string, Field | TableCalculation> {
    const convertedAdditionalMetrics = (additionalMetrics || []).reduce<
        Metric[]
    >((acc, additionalMetric) => {
        const table = explore.tables[additionalMetric.table];
        if (table) {
            const metric = convertAdditionalMetric({
                additionalMetric,
                table,
            });
            return [...acc, metric];
        }
        return acc;
    }, []);
    return [
        ...getFields(explore),
        ...convertedAdditionalMetrics,
        ...tableCalculations,
    ].reduce(
        (acc, item) => ({
            ...acc,
            [isAdditionalMetric(item) ? fieldId(item) : getItemId(item)]: item,
        }),
        {},
    );
}

export function itemsInMetricQuery(
    metricQuery: MetricQuery | undefined,
): string[] {
    return metricQuery === undefined
        ? []
        : [
              ...metricQuery.metrics,
              ...metricQuery.dimensions,
              ...(metricQuery.tableCalculations || []).map((tc) => tc.name),
          ];
}

export function formatRows(
    rows: { [col: string]: any }[],
    explore: Explore,
    additionalMetrics: AdditionalMetric[] = [],
    tableCalculations: TableCalculation[] = [],
): ResultRow[] {
    const itemMap = getItemMap(explore, additionalMetrics, tableCalculations);

    return rows.map((row) =>
        Object.keys(row).reduce((acc, columnName) => {
            const col = row[columnName];

            const item = itemMap[columnName];
            return {
                ...acc,
                [columnName]: {
                    value: {
                        raw: col,
                        formatted: formatItemValue(item, col),
                    },
                },
            };
        }, {}),
    );
}

const isObject = (object: any) => object != null && typeof object === 'object';
export const removeEmptyProperties = (object: Record<string, any>) => {
    const newObj: Record<string, any> = {};
    Object.keys(object).forEach((key) => {
        if (object[key] === Object(object[key]))
            newObj[key] = removeEmptyProperties(object[key]);
        else if (object[key] !== undefined && object[key] !== null)
            newObj[key] = object[key];
    });
    return newObj;
};
export const deepEqual = (
    object1: Record<string, any>,
    object2: Record<string, any>,
): boolean => {
    const keys1 = Object.keys(object1);
    const keys2 = Object.keys(object2);
    if (keys1.length !== keys2.length) {
        return false;
    }
    return keys1.every((key) => {
        const val1: any = object1[key];
        const val2: any = object2[key];
        const areObjects = isObject(val1) && isObject(val2);
        return !(
            (areObjects && !deepEqual(val1, val2)) ||
            (!areObjects && val1 !== val2)
        );
    });
};

export const assertUnreachable = (_x: never): never => {
    throw new Error("Didn't expect to get here");
};
