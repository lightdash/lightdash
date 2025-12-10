import { type AnyType } from './any';
import { type ApiTogglePinnedItem, type PinnedItems } from './pinning';
import { type ProjectGroupAccess } from './projectGroupAccess';
import { type MostPopularAndRecentlyUpdated } from './resourceViewItem';
import {
    type ApiJobScheduledResponse,
    type ApiJobStatusResponse,
    type ApiSchedulersResponse,
    type SchedulerAndTargets,
    type SchedulerJobStatus,
} from './scheduler';
import { type ApiSlackChannelsResponse } from './slack';
import { type Space } from './space';
import { type ApiSshKeyPairResponse } from './SshKeyPair';
import {
    type LightdashUser,
    type LoginOptions,
    type UserAllowedOrganization,
} from './user';
import { type UserWarehouseCredentials } from './userWarehouseCredentials';
import { type ValidationResponse } from './validation';

import {
    type ApiUnusedContent,
    type ApiUserActivityDownloadCsv,
    type UnusedContent,
    type UnusedContentItem,
    type UserActivity,
    type ViewStatistics,
} from './analytics';
import {
    type ApiCreateComment,
    type ApiDeleteComment,
    type ApiGetComments,
} from './api/comments';
import { type Email } from './api/email';
import {
    type ApiGetProjectParametersListResults,
    type ApiGetProjectParametersResults,
} from './api/parameters';
import { type ApiGetSpotlightTableConfig } from './api/spotlight';
import { type ApiSuccessEmpty } from './api/success';
import { type Account } from './auth';
import {
    type ApiCatalogAnalyticsResults,
    type ApiCatalogMetadataResults,
    type ApiGetMetricsTree,
    type ApiMetricsCatalog,
} from './catalog';
import { type ApiGetChangeResponse } from './changeset';
import {
    type ApiChartAsCodeListResponse,
    type ApiChartAsCodeUpsertResponse,
    type ApiDashboardAsCodeListResponse,
    type ApiSqlChartAsCodeListResponse,
} from './coder';
import {
    type ApiChartContentResponse,
    type ApiContentResponse,
} from './content';
import {
    type Dashboard,
    type DashboardAvailableFilters,
    type DashboardBasicDetails,
    type DashboardSummary,
} from './dashboard';
import { type DbtExposure } from './dbt';
import { type EmailStatusExpiring } from './email';
import { type Explore, type SummaryExplore } from './explore';
import {
    type DimensionType,
    type FilterableField,
    type ItemsMap,
} from './field';
import { type FieldValueSearchResult } from './fieldMatch';
import { type DashboardFilters } from './filter';
import {
    type GitIntegrationConfiguration,
    type GitRepo,
    type PullRequestCreated,
} from './gitIntegration';
import type { ApiGroupListResponse } from './groups';
import { type MetricQuery, type QueryWarning } from './metricQuery';
import type {
    ApiMetricsExplorerQueryResults,
    ApiMetricsExplorerTotalResults,
} from './metricsExplorer';
import {
    type DeleteOpenIdentity,
    type OpenIdIdentitySummary,
} from './openIdIdentity';
import {
    type AllowedEmailDomains,
    type OnboardingStatus,
    type Organization,
    type OrganizationProject,
    type UpdateAllowedEmailDomains,
} from './organization';
import {
    type ApiOrganizationMemberProfiles,
    type OrganizationMemberProfile,
    type OrganizationMemberRole,
} from './organizationMemberProfile';
import type { ParametersValuesMap } from './parameters';
import {
    type CreatePersonalAccessToken,
    type PersonalAccessToken,
} from './personalAccessToken';

import {
    type ApiProjectCompileLogResponse,
    type ApiProjectCompileLogsResponse,
} from './projectCompileLogs';
import { type ProjectMemberProfile } from './projectMemberProfile';
import { type ProjectMemberRole } from './projectMemberRole';
import {
    DbtProjectType,
    type CreateWarehouseCredentials,
    type DbtProjectConfig,
    type Project,
    type WarehouseCredentials,
} from './projects';
import { type ApiPromotionChangesResponse } from './promotion';
import { type ApiRenameFieldsResponse } from './rename';
import { type ResultColumns, type ResultRow } from './results';
import {
    type ApiCalculateSubtotalsResponse,
    type ApiCalculateTotalResponse,
    type ChartHistory,
    type ChartVersion,
    type SavedChart,
} from './savedCharts';
import { type SchedulerWithLogs } from './schedulerLog';
import { type SearchResults } from './search';
import { type ShareUrl } from './share';
import { type SlackSettings } from './slackSettings';
import {
    type ApiCreateSqlChart,
    type ApiCreateVirtualView,
    type ApiGithubDbtWritePreview,
    type ApiSqlChart,
    type ApiSqlRunnerJobStatusResponse,
    type ApiUpdateSqlChart,
    type GroupByColumn,
    type SortBy,
} from './sqlRunner';
import { type TableBase } from './table';
import { type ApiCreateTagResponse } from './tags';
import { type ApiWarehouseTableFields } from './warehouse';

// Note: EE types removed from direct import to avoid circular module resolution
// They are still available via the re-export below: export * from './ee';
import type {
    ApiAiAgentAdminConversationsResponse,
    ApiAiAgentArtifactResponse,
    ApiAiAgentEvaluationResponse,
    ApiAiAgentEvaluationRunResponse,
    ApiAiAgentEvaluationRunResultsResponse,
    ApiAiAgentEvaluationRunSummaryListResponse,
    ApiAiAgentEvaluationSummaryListResponse,
    ApiAiAgentThreadCreateResponse,
    ApiAiAgentThreadGenerateTitleResponse,
    ApiAiAgentThreadMessageCreateResponse,
    ApiAiAgentThreadMessageVizQueryResponse,
    ApiAiAgentThreadMessageVizResponse,
    ApiAiAgentThreadResponse,
    ApiAiAgentThreadSummaryListResponse,
    ApiAiAgentVerifiedArtifactsResponse,
    ApiAiOrganizationSettingsResponse,
    ApiAppendInstructionResponse,
    ApiCreateEvaluationResponse,
    ApiGetUserAgentPreferencesResponse,
    ApiUpdateAiOrganizationSettingsResponse,
    ApiUpdateUserAgentPreferencesResponse,
    DecodedEmbed,
    EmbedUrl,
} from '../ee';
import type { PivotValuesColumn } from '../visualizations/types';
import type { ResultsPaginationMetadata } from './paginateResults';
import { type PivotConfiguration } from './pivot';
import { type QueryHistoryStatus } from './queryHistory';

export enum RequestMethod {
    CLI = 'CLI',
    CLI_CI = 'CLI_CI',
    WEB_APP = 'WEB_APP',
    HEADLESS_BROWSER = 'HEADLESS_BROWSER',
    UNKNOWN = 'UNKNOWN',
    BACKEND = 'BACKEND',
}

export const isRequestMethod = (
    value: string | undefined,
): value is RequestMethod =>
    !!value && Object.values(RequestMethod).includes(value as AnyType);

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
export type ApiCompiledQueryResults = {
    query: string;
    parameterReferences: string[];
};

export type ApiExploresResults = SummaryExplore[];

export type ApiExploreResults = Omit<Explore, 'unfilteredTables'>;

export type ApiStatusResults = 'loading' | 'ready' | 'error';

export type ApiRefreshResults = {
    jobUuid: string;
};

export type ApiCreatePreviewResults = {
    projectUuid: string;
    compileJobUuid: string;
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

export enum LightdashMode {
    DEFAULT = 'default',
    DEMO = 'demo',
    PR = 'pr',
    CLOUD_BETA = 'cloud_beta',
    DEV = 'development',
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
    hasMicrosoftTeams: boolean;
    isServiceAccountEnabled: boolean;
    isOrganizationWarehouseCredentialsEnabled: boolean;
    latest: {
        version?: string;
    };
    rudder: {
        writeKey: string | undefined;
        dataPlaneUrl: string | undefined;
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
            enableGCloudADC: boolean;
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
        pat: {
            maxExpirationTimeInDays: number | undefined;
        };
        snowflake: {
            enabled: boolean;
        };
        databricks: {
            enabled: boolean;
        };
    };
    posthog:
        | {
              projectApiKey: string;
              feApiHost: string;
              beApiHost: string;
          }
        | undefined;
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
        defaultLimit: number;
        csvCellsLimit: number;
        maxPageSize: number;
    };
    pivotTable: {
        maxColumnLimit: number;
    };
    hasSlack: boolean;
    slack: {
        multiAgentChannelEnabled: boolean;
    };
    hasGithub: boolean;
    hasGitlab: boolean;
    hasHeadlessBrowser: boolean;
    hasExtendedUsageAnalytics: boolean;
    hasCacheAutocompleResults: boolean;
    appearance: {
        overrideColorPalette: string[] | undefined;
        overrideColorPaletteName: string | undefined;
    };
    isCustomRolesEnabled: boolean;
    embedding: {
        enabled: boolean;
        events:
            | {
                  enabled: boolean;
                  rateLimiting: {
                      maxEventsPerWindow: number;
                      windowDurationMs: number;
                  };
                  allowedOrigins: string[];
                  enablePostMessage: boolean;
              }
            | undefined;
    };
    ai: {
        analyticsProjectUuid?: string;
        analyticsDashboardUuid?: string;
    };
    echarts6: {
        enabled: boolean;
    };
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
    [DbtProjectType.MANIFEST]: 'Manifest',
};

export enum CreateProjectTableConfiguration {
    PROD = 'prod',
    ALL = 'all',
}

export type CreateProject = Omit<
    Project,
    | 'projectUuid'
    | 'organizationUuid'
    | 'schedulerTimezone'
    | 'createdByUserUuid'
> & {
    warehouseConnection: CreateWarehouseCredentials;
    copyWarehouseConnectionFromUpstreamProject?: boolean;
    tableConfiguration?: CreateProjectTableConfiguration;
    copyContent?: boolean;
};

export type CreateProjectOptionalCredentials = Omit<
    CreateProject,
    'warehouseConnection'
> & {
    warehouseConnection?: CreateWarehouseCredentials;
};

export const hasWarehouseCredentials = (
    createProject: CreateProjectOptionalCredentials,
): createProject is CreateProjectOptionalCredentials & {
    warehouseConnection: CreateWarehouseCredentials;
} =>
    !!createProject.warehouseConnection &&
    Object.keys(createProject.warehouseConnection).length > 0;

export type UpdateProject = Omit<
    Project,
    | 'projectUuid'
    | 'organizationUuid'
    | 'type'
    | 'schedulerTimezone'
    | 'createdByUserUuid'
> & {
    warehouseConnection: CreateWarehouseCredentials;
};

export type CacheMetadata = {
    cacheUpdatedTime?: Date;
    cacheExpiresAt?: Date;
    cacheKey?: string;
    cacheHit: boolean;
};

export type ApiQueryResults = {
    metricQuery: MetricQuery;
    cacheMetadata: CacheMetadata;
    rows: ResultRow[];
    fields: ItemsMap;
};

type ApiExecuteAsyncQueryResultsCommon = {
    queryUuid: string;
    cacheMetadata: CacheMetadata;
    parameterReferences: string[]; // params needed for query to run
    usedParametersValues: ParametersValuesMap; // params values used
};

export type ApiExecuteAsyncMetricQueryResults =
    ApiExecuteAsyncQueryResultsCommon & {
        metricQuery: MetricQuery;
        fields: ItemsMap;
        warnings: QueryWarning[];
    };

export type ApiExecuteAsyncDashboardChartQueryResults =
    ApiExecuteAsyncQueryResultsCommon & {
        metricQuery: MetricQuery;
        fields: ItemsMap;
        appliedDashboardFilters: DashboardFilters;
    };

export type ApiExecuteAsyncSqlQueryResults =
    ApiExecuteAsyncQueryResultsCommon & {
        // leaving empty for now
    };

export type ApiExecuteAsyncDashboardSqlChartQueryResults =
    ApiExecuteAsyncQueryResultsCommon & {
        appliedDashboardFilters: DashboardFilters;
    };

export type ReadyQueryResultsPage = ResultsPaginationMetadata<ResultRow> & {
    queryUuid: string;
    columns: ResultColumns;
    rows: ResultRow[];
    initialQueryExecutionMs: number;
    resultsPageExecutionMs: number;
    status: QueryHistoryStatus.READY;
    pivotDetails: {
        // Unlimited total column count, this is used to display a warning to the user in the frontend when the number of columns is over maxColumnLimit
        totalColumnCount: number | null;
        indexColumn: PivotConfiguration['indexColumn'] | undefined;
        valuesColumns: PivotValuesColumn[];
        groupByColumns: GroupByColumn[] | undefined;
        sortBy: SortBy | undefined;
        originalColumns: ResultColumns;
    } | null;
};

export type ApiGetAsyncQueryResults =
    | ReadyQueryResultsPage
    | {
          status: QueryHistoryStatus.PENDING | QueryHistoryStatus.CANCELLED;
          queryUuid: string;
      }
    | {
          status: QueryHistoryStatus.ERROR;
          queryUuid: string;
          error: string | null;
      };

export type ApiDownloadAsyncQueryResults = {
    fileUrl: string;
};

export type ApiDownloadAsyncQueryResultsAsCsv = {
    fileUrl: string;
    truncated: boolean;
};

export type ApiDownloadAsyncQueryResultsAsXlsx = {
    fileUrl: string;
    truncated: boolean;
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

export type UpdateUserArgs = {
    firstName: string;
    lastName: string;
    email: string;
    isMarketingOptedIn: boolean;
    isTrackingAnonymized: boolean;
    isSetupComplete: boolean;
    isActive: boolean;
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
    contentCopyError?: string;
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

export type ApiAiGenerateCustomVizResponse = {
    status: 'ok';
    results: string;
};

type ApiResults =
    | ApiQueryResults
    | ApiSqlQueryResults
    | ApiCompiledQueryResults
    | ApiExploresResults
    | ApiExploreResults
    | ApiStatusResults
    | ApiRefreshResults
    | ApiCreatePreviewResults
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
    | ShareUrl
    | SlackSettings
    | ApiSlackChannelsResponse['results']
    | UserActivity
    | UnusedContent
    | UnusedContentItem
    | ApiUnusedContent
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
    | EmbedUrl
    | DecodedEmbed
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
    | ApiSqlRunnerJobStatusResponse['results']
    | ApiCreateVirtualView['results']
    | ApiGithubDbtWritePreview['results']
    | ApiMetricsCatalog['results']
    | ApiMetricsExplorerQueryResults['results']
    | ApiGroupListResponse['results']
    | ApiCreateTagResponse['results']
    | ApiChartAsCodeListResponse['results']
    | ApiSqlChartAsCodeListResponse['results']
    | ApiDashboardAsCodeListResponse['results']
    | ApiChartAsCodeUpsertResponse['results']
    | ApiGetMetricsTree['results']
    | ApiMetricsExplorerTotalResults['results']
    | ApiGetSpotlightTableConfig['results']
    | ApiCalculateSubtotalsResponse['results']
    | ApiExecuteAsyncSqlQueryResults
    | ApiExecuteAsyncDashboardSqlChartQueryResults
    | ApiExecuteAsyncMetricQueryResults
    | ApiExecuteAsyncDashboardChartQueryResults
    | ApiGetAsyncQueryResults
    | ApiSchedulersResponse['results']
    | ApiUserActivityDownloadCsv['results']
    | ApiRenameFieldsResponse['results']
    | ApiDownloadAsyncQueryResults
    | ApiDownloadAsyncQueryResultsAsXlsx
    | ApiAiAgentThreadResponse['results']
    | ApiAiAgentThreadMessageVizResponse['results']
    | ApiAiAgentThreadMessageVizQueryResponse['results']
    | ApiUpdateUserAgentPreferencesResponse['results']
    | ApiGetUserAgentPreferencesResponse[`results`]
    | ApiGetProjectParametersResults
    | ApiGetProjectParametersListResults
    | ApiAiAgentThreadCreateResponse['results']
    | ApiAiAgentThreadMessageCreateResponse['results']
    | ApiAiAgentArtifactResponse['results']
    | ApiAiAgentThreadGenerateTitleResponse['results']
    | ApiAiAgentThreadSummaryListResponse['results']
    | Account
    | ApiAiAgentAdminConversationsResponse['results']
    | ApiAiAgentEvaluationSummaryListResponse['results']
    | ApiAiAgentEvaluationResponse['results']
    | ApiAiAgentEvaluationRunResponse['results']
    | ApiAiAgentEvaluationRunSummaryListResponse['results']
    | ApiAiAgentEvaluationRunResultsResponse['results']
    | ApiAiAgentVerifiedArtifactsResponse['results']
    | ApiCreateEvaluationResponse['results']
    | ApiAppendInstructionResponse['results']
    | ApiGetChangeResponse['results']
    | ApiAiOrganizationSettingsResponse['results']
    | ApiUpdateAiOrganizationSettingsResponse['results']
    | ApiProjectCompileLogsResponse['results']
    | ApiProjectCompileLogResponse['results'];
// Note: EE API types removed from ApiResults to avoid circular imports
// They can still be used with ApiResponse<T> by importing from '@lightdash/common'

export type ApiResponse<T extends ApiResults = ApiResults> = {
    status: 'ok';
    results: T;
};

export type ApiErrorDetail = {
    name: string;
    statusCode: number;
    message: string;
    data: { [key: string]: string };
    sentryTraceId?: string;
    sentryEventId?: string;
};
export type ApiError = {
    status: 'error';
    error: ApiErrorDetail;
};

export const isApiError = (error: unknown): error is ApiError =>
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    error.status === 'error';
