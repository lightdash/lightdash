import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { z } from 'zod';
import { type UserActivity, type ViewStatistics } from './types/analytics';
import {
    type Dashboard,
    type DashboardAvailableFilters,
    type DashboardBasicDetails,
    type DashboardSummary,
} from './types/dashboard';
import { type DbtCloudIntegration } from './types/dbtCloud';
import { type Explore, type SummaryExplore } from './types/explore';
import {
    DimensionType,
    friendlyName,
    isCustomDimension,
    isDimension,
    isField,
    isFilterableDimension,
    isMetric,
    isTableCalculation,
    type CompiledField,
    type CustomDimension,
    type Dimension,
    type Field,
    type FieldId,
    type FilterableDimension,
    type FilterableField,
    type ItemsMap,
    type Metric,
    type TableCalculation,
} from './types/field';
import { type AdditionalMetric, type MetricQuery } from './types/metricQuery';
import {
    type ApiOrganizationMemberProfiles,
    type OrganizationMemberProfile,
    type OrganizationMemberRole,
} from './types/organizationMemberProfile';
import {
    type CreatePersonalAccessToken,
    type PersonalAccessToken,
} from './types/personalAccessToken';
import { type ProjectMemberProfile } from './types/projectMemberProfile';
import {
    type ApiCalculateTotalResponse,
    type ChartHistory,
    type ChartVersion,
    type SavedChart,
    type Series,
} from './types/savedCharts';
import { type SearchResults } from './types/search';
import { type ShareUrl } from './types/share';
import { type SlackSettings } from './types/slackSettings';

import {
    type ApiCreateComment,
    type ApiDeleteComment,
    type ApiGetComments,
} from './types/api/comments';
import { type Email } from './types/api/email';
import { type ApiSuccessEmpty } from './types/api/success';
import { type DbtExposure } from './types/dbt';
import { type EmailStatusExpiring } from './types/email';
import { type FieldValueSearchResult } from './types/fieldMatch';
import { type DashboardFilters } from './types/filter';
import {
    type GitIntegrationConfiguration,
    type GitRepo,
    type PullRequestCreated,
} from './types/gitIntegration';
import {
    type DeleteOpenIdentity,
    type OpenIdIdentitySummary,
} from './types/openIdIdentity';
import {
    type AllowedEmailDomains,
    type OnboardingStatus,
    type Organization,
    type OrganizationProject,
    type UpdateAllowedEmailDomains,
} from './types/organization';
import { type ApiTogglePinnedItem, type PinnedItems } from './types/pinning';
import { type ProjectGroupAccess } from './types/projectGroupAccess';
import { type ProjectMemberRole } from './types/projectMemberRole';
import {
    DbtProjectType,
    ProjectType,
    type CreateWarehouseCredentials,
    type DbtProjectConfig,
    type Project,
    type WarehouseCredentials,
} from './types/projects';
import { type MostPopularAndRecentlyUpdated } from './types/resourceViewItem';
import { type ResultRow } from './types/results';
import {
    type ApiJobScheduledResponse,
    type ApiJobStatusResponse,
    type SchedulerAndTargets,
    type SchedulerJobStatus,
    type SchedulerWithLogs,
} from './types/scheduler';
import { type SlackChannel } from './types/slack';
import { type Space } from './types/space';
import { type ApiSshKeyPairResponse } from './types/SshKeyPair';
import { type TableBase } from './types/table';
import {
    type LightdashUser,
    type LoginOptions,
    type UserAllowedOrganization,
} from './types/user';
import { type UserWarehouseCredentials } from './types/userWarehouseCredentials';
import { type ValidationResponse } from './types/validation';

import {
    type ApiCatalogAnalyticsResults,
    type ApiCatalogMetadataResults,
} from './types/catalog';
import {
    type ApiChartContentResponse,
    type ApiContentResponse,
} from './types/content';
import { type ApiPromotionChangesResponse } from './types/promotion';
import {
    type ApiCreateSqlChart,
    type ApiSqlChart,
    type ApiSqlRunnerJobStatusResponse,
    type ApiUpdateSqlChart,
} from './types/sqlRunner';
import { TimeFrames } from './types/timeFrames';
import { type ApiWarehouseTableFields } from './types/warehouse';
import { convertAdditionalMetric } from './utils/additionalMetrics';
import { getFields } from './utils/fields';
import { formatItemValue } from './utils/formatting';
import { getItemId, getItemLabelWithoutTableName } from './utils/item';

dayjs.extend(utc);

export * from './authorization/index';
export * from './authorization/types';
export * from './compiler/exploreCompiler';
export * from './compiler/filtersCompiler';
export * from './compiler/translator';
export * from './dbt/validation';
export { default as lightdashDbtYamlSchema } from './schemas/json/lightdash-dbt-2.0.json';
export * from './templating/template';
export * from './transformers';
export * from './types/analytics';
export * from './types/api';
export * from './types/api/comments';
export * from './types/api/errors';
export * from './types/api/integrations';
export * from './types/api/notifications';
export * from './types/api/share';
export * from './types/api/success';
export * from './types/api/uuid';
export * from './types/catalog';
export * from './types/comments';
export * from './types/conditionalFormatting';
export * from './types/conditionalRule';
export * from './types/content';
export * from './types/csv';
export * from './types/dashboard';
export * from './types/dbt';
export * from './types/dbtCloud';
export * from './types/downloadFile';
export * from './types/email';
export * from './types/errors';
export * from './types/explore';
export * from './types/featureFlags';
export * from './types/field';
export * from './types/fieldMatch';
export * from './types/filter';
export * from './types/gdrive';
export * from './types/gitIntegration';
export * from './types/groups';
export * from './types/job';
export * from './types/knex-paginate';
export * from './types/metricQuery';
export * from './types/notifications';
export * from './types/openIdIdentity';
export * from './types/organization';
export * from './types/organizationMemberProfile';
export * from './types/personalAccessToken';
export * from './types/pinning';
export * from './types/pivot';
export * from './types/projectGroupAccess';
export * from './types/projectMemberProfile';
export * from './types/projectMemberRole';
export * from './types/projects';
export * from './types/promotion';
export * from './types/resourceViewItem';
export * from './types/results';
export * from './types/savedCharts';
export * from './types/scheduler';
export * from './types/search';
export * from './types/share';
export * from './types/slack';
export * from './types/slackSettings';
export * from './types/space';
export * from './types/sqlRunner';
export * from './types/SshKeyPair';
export * from './types/table';
export * from './types/timeFrames';
export * from './types/timezone';
export * from './types/user';
export * from './types/userAttributes';
export * from './types/userWarehouseCredentials';
export * from './types/validation';
export * from './types/warehouse';
export * from './utils/additionalMetrics';
export * from './utils/api';
export { default as assertUnreachable } from './utils/assertUnreachable';
export * from './utils/conditionalFormatting';
export * from './utils/convertToDbt';
export * from './utils/email';
export * from './utils/fields';
export * from './utils/filters';
export * from './utils/formatting';
export * from './utils/github';
export * from './utils/item';
export * from './utils/projectMemberRole';
export * from './utils/sanitizeHtml';
export * from './utils/scheduler';
export * from './utils/slugs';
export * from './utils/time';
export * from './utils/timeFrames';
export * from './utils/warehouse';
export * from './viz/barChart';
export * from './viz/base';
export * from './viz/sqlRunner';

export const validateEmail = (email: string): boolean => {
    if (/\s/.test(email)) {
        return false;
    }

    const re =
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
};

export const getEmailSchema = () =>
    z
        .string()
        .refine((email) => validateEmail(email), {
            message: 'Email address is not valid',
        })
        .refine((email) => !/\s/.test(email), {
            message: 'Email address must not contain whitespaces',
        });

export const getPasswordSchema = () =>
    z
        .string()
        .min(8, { message: 'must be at least 8 characters long' })
        .regex(/[a-zA-Z]/, { message: 'must contain a letter' })
        .regex(/[\d\W_]/, { message: 'must contain a number or symbol' });

export const validatePassword = (password: string): boolean =>
    getPasswordSchema().safeParse(password).success;

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

export const replaceStringInArray = (
    arrayToUpdate: string[],
    valueToReplace: string,
    newValue: string,
) =>
    arrayToUpdate.map((value) => (value === valueToReplace ? newValue : value));

export type SqlResultsRow = { [columnName: string]: unknown };
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
    copied_from_project_uuid: null,
};
export const SEED_SPACE = {
    name: SEED_PROJECT.name,
};

export const SEED_GROUP = {
    groupUuid: '9d615ede-5758-4954-9fb9-2a07fc415ba5',
    name: 'Org 1 Group',
};

export type ArgumentsOf<F extends Function> = F extends (
    ...args: infer A
) => any
    ? A
    : never;

export const getVisibleFields = (explore: Explore): CompiledField[] =>
    getFields(explore).filter(({ hidden }) => !hidden);

export const findFieldByIdInExplore = (
    explore: Explore,
    id: FieldId,
): Field | undefined =>
    getFields(explore).find((field) => getItemId(field) === id);

export const snakeCaseName = (text: string): string =>
    text
        .replace(/\W+/g, ' ')
        .split(/ |\B(?=[A-Z])/)
        .map((word) => word.toLowerCase())
        .join('_');

export const hasSpecialCharacters = (text: string) => /[^a-zA-Z ]/g.test(text);

export type CacheMetadata = {
    cacheUpdatedTime?: Date;
    cacheHit: boolean;
};

export type ApiQueryResults = {
    metricQuery: MetricQuery;
    cacheMetadata: CacheMetadata;
    rows: ResultRow[];
    fields: ItemsMap;
};

export type ApiChartAndResults = {
    chart: SavedChart;
    explore: Explore;
    appliedDashboardFilters: DashboardFilters | undefined;
    metricQuery: MetricQuery;
    cacheMetadata: CacheMetadata;
    rows: ResultRow[];
    fields: ItemsMap;
};

export type ApiSqlQueryResults = {
    fields: Record<string, { type: DimensionType }>;
    rows: Record<string, unknown>[];
};

export type ApiScheduledDownloadCsv = {
    jobId: string;
};
export type ApiDownloadCsv = {
    url: string;
    status: SchedulerJobStatus;
    truncated: boolean;
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

export type UpdateMetadata = {
    upstreamProjectUuid?: string | null; // null means we unset this value
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
    email: Email;
    password: string;
};

export type CreateUserWithRole = {
    firstName: string;
    lastName: string;
    email: Email;
    password?: string;
    role: OrganizationMemberRole;
};

export type ActivateUserWithInviteCode = ActivateUser & {
    inviteCode: string;
};

export type RegisterOrActivateUser =
    | ActivateUserWithInviteCode
    | CreateUserArgs;

export const hasInviteCode = (
    data: RegisterOrActivateUser,
): data is ActivateUserWithInviteCode => 'inviteCode' in data;

export type CompleteUserArgs = {
    organizationName?: string;
    jobTitle: string;
    isMarketingOptedIn: boolean;
    isTrackingAnonymized: boolean;
    enableEmailDomainAccess: boolean;
};

export type UpdateUserArgs = {
    firstName: string;
    lastName: string;
    email: string;
    isMarketingOptedIn: boolean;
    isTrackingAnonymized: boolean;
    isSetupComplete: boolean;
};

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
    organizationUuid: string;
    userUuid: string;
    email: string;
};
export type CreateInviteLink = Pick<InviteLink, 'expiresAt' | 'email'> & {
    email: string;
    role?: OrganizationMemberRole;
};

export type ApiCreateProjectResults = {
    project: Project;
    hasContentCopy: boolean;
};

export type ProjectSavedChartStatus = boolean;

export type ApiFlashResults = Record<string, string[]>;

export type ApiAiDashboardSummaryResponse = {
    status: 'ok';
    results: DashboardSummary;
};

export type ApiAiGetDashboardSummaryResponse = {
    status: 'ok';
    results: DashboardSummary;
};

type ApiResults =
    | ApiQueryResults
    | ApiSqlQueryResults
    | ApiCompiledQueryResults
    | ApiExploresResults
    | ApiExploreResults
    | ApiStatusResults
    | ApiRefreshResults
    | ApiHealthResults
    | Organization
    | LightdashUser
    | LoginOptions
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
    | Record<OpenIdIdentitySummary['issuerType'], OpenIdIdentitySummary[]>
    | FilterableField[]
    | DashboardAvailableFilters
    | ProjectSavedChartStatus
    | null
    | Array<unknown>
    | ApiJobStartedResults
    | ApiCreateUserTokenResults
    | CreatePersonalAccessToken
    | PersonalAccessToken
    | ProjectMemberProfile[]
    | ProjectGroupAccess
    | SearchResults
    | Space
    | DbtCloudIntegration
    | ShareUrl
    | SlackSettings
    | UserActivity
    | SlackChannel[]
    | SchedulerAndTargets
    | SchedulerAndTargets[]
    | FieldValueSearchResult
    | ApiDownloadCsv
    | AllowedEmailDomains
    | UpdateAllowedEmailDomains
    | UserAllowedOrganization[]
    | EmailStatusExpiring
    | ApiScheduledDownloadCsv
    | PinnedItems
    | ViewStatistics
    | SchedulerWithLogs
    | ValidationResponse[]
    | ChartHistory
    | ChartVersion
    | Array<GitRepo>
    | PullRequestCreated
    | GitIntegrationConfiguration
    | UserWarehouseCredentials
    | ApiJobStatusResponse['results']
    | ApiJobScheduledResponse['results']
    | ApiSshKeyPairResponse['results']
    | MostPopularAndRecentlyUpdated
    | ApiCalculateTotalResponse['results']
    | Record<string, DbtExposure>
    | ApiCreateComment['results']
    | ApiGetComments['results']
    | ApiDeleteComment
    | ApiSuccessEmpty
    | ApiCreateProjectResults
    | ApiAiDashboardSummaryResponse['results']
    | ApiAiGetDashboardSummaryResponse['results']
    | ApiCatalogMetadataResults
    | ApiCatalogAnalyticsResults
    | ApiPromotionChangesResponse['results']
    | ApiWarehouseTableFields['results']
    | ApiTogglePinnedItem['results']
    | ApiOrganizationMemberProfiles['results']
    | ApiSqlChart['results']
    | ApiCreateSqlChart['results']
    | ApiUpdateSqlChart['results']
    | ApiContentResponse['results']
    | ApiChartContentResponse['results']
    | ApiSqlRunnerJobStatusResponse['results'];

export type ApiResponse<T extends ApiResults = ApiResults> = {
    status: 'ok';
    results: T;
};

export type ApiErrorDetail = {
    name: string;
    statusCode: number;
    message: string;
    data: { [key: string]: string };
    id?: string;
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
    DEV = 'development',
}

export const isLightdashMode = (x: string): x is LightdashMode =>
    Object.values<string>(LightdashMode).includes(x);

export enum LightdashInstallType {
    DOCKER_IMAGE = 'docker_image',
    BASH_INSTALL = 'bash_install',
    HEROKU = 'heroku',
    UNKNOWN = 'unknown',
}

export type SentryConfig = {
    backend: {
        dsn: string;
        securityReportUri: string;
    };
    frontend: {
        dsn: string;
    };
    release: string;
    environment: string;
    tracesSampleRate: number;
    profilesSampleRate: number;
    anr: {
        enabled: boolean;
        timeout?: number;
        captureStacktrace: boolean;
    };
};

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
    sentry: Pick<
        SentryConfig,
        | 'frontend'
        | 'release'
        | 'environment'
        | 'tracesSampleRate'
        | 'profilesSampleRate'
    >;
    auth: {
        disablePasswordAuthentication: boolean;
        google: {
            oauth2ClientId: string | undefined;
            loginPath: string;
            googleDriveApiKey: string | undefined;
            enabled: boolean;
        };
        okta: {
            enabled: boolean;
            loginPath: string;
        };
        oneLogin: {
            enabled: boolean;
            loginPath: string;
        };
        azuread: {
            enabled: boolean;
            loginPath: string;
        };
        oidc: {
            enabled: boolean;
            loginPath: string;
        };
    };
    posthog: {
        projectApiKey: string;
        apiHost: string;
    };
    siteUrl: string;
    intercom: {
        appId: string;
        apiBase: string;
    };
    pylon: {
        appId: string;
        verificationHash?: string;
    };
    staticIp: string;
    query: {
        maxLimit: number;
        csvCellsLimit: number;
    };
    pivotTable: {
        maxColumnLimit: number;
    };
    customVisualizationsEnabled: boolean;
    hasSlack: boolean;
    hasGithub: boolean;
    hasHeadlessBrowser: boolean;
    hasDbtSemanticLayer: boolean;
    hasGroups: boolean;
    hasExtendedUsageAnalytics: boolean;
};

export enum DBFieldTypes {
    DIMENSION = 'dimension',
    METRIC = 'metric',
}

export const sensitiveDbtCredentialsFieldNames = [
    'personal_access_token',
    'api_key',
] as const;

export const DbtProjectTypeLabels: Record<DbtProjectType, string> = {
    [DbtProjectType.DBT]: 'dbt local server',
    [DbtProjectType.DBT_CLOUD_IDE]: 'dbt cloud',
    [DbtProjectType.GITHUB]: 'Github',
    [DbtProjectType.GITLAB]: 'GitLab',
    [DbtProjectType.BITBUCKET]: 'BitBucket',
    [DbtProjectType.AZURE_DEVOPS]: 'Azure DevOps',
    [DbtProjectType.NONE]: 'CLI',
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

export const getResultValueArray = (
    rows: ResultRow[],
    preferRaw: boolean = false,
    calculateMinAndMax: boolean = false,
): {
    results: Record<string, unknown>[];
    minsAndMaxes?: Record<string, { min: number; max: number }>;
} => {
    const minMax: Record<string, { min: number; max: number }> = {};

    const results = rows.map((row) =>
        Object.keys(row).reduce<Record<string, unknown>>((acc, key) => {
            const rawWithFallback =
                row[key]?.value.raw ?? row[key]?.value.formatted; // using nullish coalescing operator to handle null and undefined only
            const formattedWithFallback =
                row[key]?.value.formatted || row[key]?.value.raw;

            const value = preferRaw ? rawWithFallback : formattedWithFallback;

            acc[key] = value;

            if (calculateMinAndMax) {
                const numericValue = Number(value);
                if (!Number.isNaN(numericValue)) {
                    if (!minMax[key]) {
                        minMax[key] = { min: numericValue, max: numericValue };
                    } else {
                        minMax[key].min = Math.min(
                            minMax[key].min,
                            numericValue,
                        );
                        minMax[key].max = Math.max(
                            minMax[key].max,
                            numericValue,
                        );
                    }
                }
            }

            return acc;
        }, {}),
    );

    return calculateMinAndMax ? { results, minsAndMaxes: minMax } : { results };
};

export const getDateGroupLabel = (axisItem: ItemsMap[string]) => {
    if (
        isDimension(axisItem) &&
        [DimensionType.DATE, DimensionType.TIMESTAMP].includes(axisItem.type) &&
        (axisItem.group || (axisItem.groups && axisItem.groups.length > 0)) &&
        axisItem.label &&
        axisItem.timeInterval
    ) {
        const timeFrame =
            TimeFrames[axisItem.timeInterval]?.toLowerCase() || '';

        if (timeFrame && axisItem.label.endsWith(` ${timeFrame}`)) {
            // Remove the time frame from the end of the label - e.g. from 'Order created day' to 'Order created'.
            return getItemLabelWithoutTableName(axisItem).replace(
                new RegExp(`\\s+${timeFrame}$`),
                '',
            );
        }

        return friendlyName(axisItem.label);
    }

    return undefined;
};

export const getAxisName = ({
    isAxisTheSameForAllSeries,
    selectedAxisIndex,
    axisReference,
    axisIndex,
    axisName,
    series,
    itemsMap,
}: {
    isAxisTheSameForAllSeries: boolean;
    selectedAxisIndex: number;
    axisReference: 'yRef' | 'xRef';
    axisIndex: number;
    axisName?: string;
    series?: Series[];
    itemsMap: ItemsMap | undefined;
}): string | undefined => {
    const defaultItem = itemsMap
        ? itemsMap[(series || [])[0]?.encode[axisReference].field]
        : undefined;
    const dateGroupName = defaultItem
        ? getDateGroupLabel(defaultItem)
        : undefined;
    const fallbackSeriesName: string | undefined =
        series && series.length === 1
            ? series[0].name ||
              (defaultItem && getItemLabelWithoutTableName(defaultItem))
            : undefined;

    return !isAxisTheSameForAllSeries || selectedAxisIndex === axisIndex
        ? axisName || dateGroupName || fallbackSeriesName
        : undefined;
};

export function getFieldMap(
    explore: Explore,
    additionalMetrics: AdditionalMetric[] = [],
): Record<string, CompiledField | AdditionalMetric> {
    return [...getFields(explore), ...additionalMetrics].reduce(
        (sum, field) => ({
            ...sum,
            [getItemId(field)]: field,
        }),
        {},
    );
}

export function getItemMap(
    explore: Explore,
    additionalMetrics: AdditionalMetric[] = [],
    tableCalculations: TableCalculation[] = [],
    customDimensions: CustomDimension[] = [],
): ItemsMap {
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
        ...customDimensions,
    ].reduce(
        (acc, item) => ({
            ...acc,
            [getItemId(item)]: item,
        }),
        {},
    );
}

export const getDimensionsFromItemsMap = (itemsMap: ItemsMap) =>
    Object.entries(itemsMap).reduce<
        Record<string, Dimension | CustomDimension>
    >((acc, [key, value]) => {
        if (isDimension(value) || isCustomDimension(value)) {
            return { ...acc, [key]: value };
        }
        return acc;
    }, {});

export const getFilterableDimensionsFromItemsMap = (itemsMap: ItemsMap) =>
    Object.entries(itemsMap).reduce<Record<string, FilterableDimension>>(
        (acc, [key, value]) => {
            if (isDimension(value) && isFilterableDimension(value)) {
                return { ...acc, [key]: value };
            }
            return acc;
        },
        {},
    );

export const getMetricsFromItemsMap = (
    itemsMap: ItemsMap,
    filter: (value: ItemsMap[string]) => boolean = () => true,
) =>
    Object.entries(itemsMap).reduce<Record<string, Metric>>(
        (acc, [key, value]) => {
            if (isField(value) && isMetric(value) && filter(value)) {
                return { ...acc, [key]: value };
            }
            return acc;
        },
        {},
    );

export const getTableCalculationsFromItemsMap = (itemsMap?: ItemsMap) =>
    Object.entries(itemsMap ?? {}).reduce<Record<string, TableCalculation>>(
        (acc, [key, value]) => {
            if (isTableCalculation(value)) {
                return { ...acc, [key]: value };
            }
            return acc;
        },
        {},
    );

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

function formatRawValue(
    field: Field | Metric | TableCalculation | CustomDimension,
    value: any,
) {
    const isTimestamp =
        isField(field) &&
        (field.type === DimensionType.DATE ||
            field.type === DimensionType.TIMESTAMP);

    if (isTimestamp) {
        // We want to return the datetime in UTC to avoid timezone issues in the frontend like in chart tooltips
        return dayjs(value).utc(true).format();
    }
    return value;
}

export function formatRows(
    rows: { [col: string]: any }[],
    itemsMap: ItemsMap,
): ResultRow[] {
    return rows.map((row) =>
        Object.keys(row).reduce<ResultRow>((acc, columnName) => {
            const col = row[columnName];

            const item = itemsMap[columnName];
            return {
                ...acc,
                [columnName]: {
                    value: {
                        raw: formatRawValue(item, col),
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
