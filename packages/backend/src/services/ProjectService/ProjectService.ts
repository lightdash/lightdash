import { subject } from '@casl/ability';
import {
    Account,
    addDashboardFiltersToMetricQuery,
    AlreadyExistsError,
    AndFilterGroup,
    AnonymousAccount,
    AnyType,
    ApiChartAndResults,
    ApiCreatePreviewResults,
    ApiDataTimezonePreviewResults,
    ApiDeployExploresResults,
    ApiFormulaValidationResults,
    ApiQueryResults,
    ApiSqlQueryResults,
    ApiUpstreamDiffResults,
    assertEmbeddedAuth,
    assertIsAccountWithOrg,
    assertUnreachable,
    AthenaAuthenticationType,
    BigqueryAuthenticationType,
    buildDataTimezonePreviewResponse,
    buildDataTimezonePreviewSql,
    CacheMetadata,
    calculateCompilationReport,
    calculateExploreWarningReport,
    ChartSourceType,
    ChartSummary,
    combineManifestSources,
    CompilationSource,
    CompiledDimension,
    ContentType,
    convertCustomMetricToDbt,
    convertExplores,
    countCustomDimensionsInMetricQuery,
    countTotalFilterRules,
    CreateJob,
    CreateProject,
    CreateProjectMember,
    CreateProjectOptionalCredentials,
    CreateProjectTableConfiguration,
    CreateSnowflakeCredentials,
    CreateVirtualViewPayload,
    CreateWarehouseCredentials,
    currentUtcWallClock,
    CustomFormatType,
    CustomSqlQueryForbiddenError,
    DashboardAvailableFilters,
    DashboardBasicDetails,
    DashboardFilters,
    DatabricksAuthenticationType,
    DatabricksTokenError,
    DateZoom,
    DbtExposure,
    DbtExposureType,
    DbtManifestVersion,
    DbtProjectConfig,
    DbtProjectEnvironmentVariable,
    DbtProjectType,
    DbtRawModelNode,
    DbtVersionOption,
    deepEqual,
    DEFAULT_SPOTLIGHT_CONFIG,
    DefaultSupportedDbtVersion,
    DownloadFileType,
    DuckdbConnectionType,
    EnsurePlaygroundProjectResults,
    Explore,
    ExploreError,
    ExploreType,
    FeatureFlags,
    FilterableDimension,
    FilterAutocompleteValue,
    findReplaceableCustomMetrics,
    ForbiddenError,
    formatRows,
    getAccountUserTimezone,
    getAvailableFilterFieldIds,
    getAvailableParametersFromTables,
    getColumnTimezone,
    getDashboardFilterRulesForTables,
    getDbtEnvironmentVariableKeyError,
    getDimensions,
    getErrorMessage,
    getFieldFormatOverrideProps,
    getFields,
    getIntrinsicUserAttributes,
    getItemId,
    getMetricOverridesWithPopInheritance,
    getMetrics,
    getParameterReferences,
    getPreAggregateExploreName,
    getTimezoneLabel,
    GroupType,
    hasConnectionChanges,
    hasIntersection,
    hasWarehouseCredentials,
    isCartesianChartConfig,
    isDateItem,
    isExploreError,
    isFilterableDimension,
    isJwtUser,
    isNotNull,
    isReservedParameterName,
    isUserWithOrg,
    isValidTimezone,
    ItemsMap,
    Job,
    JobStatusType,
    JobStepStatusType,
    JobStepType,
    JobType,
    LightdashError,
    LightdashProjectConfig,
    LightdashUser,
    ManifestCollision,
    ManifestSource,
    maybeOverrideDbtConnection,
    maybeOverrideWarehouseConnection,
    maybeReplaceFieldsInChartVersion,
    mergeWarehouseCredentials,
    MetricQuery,
    MissingWarehouseCredentialsError,
    MostPopularAndRecentlyUpdated,
    normalizeIndexColumns,
    NotFoundError,
    OpenIdIdentityIssuerType,
    ParameterError,
    PivotChartData,
    PivotConfiguration,
    PivotValuesColumn,
    PreAggregateCheckResult,
    PreAggregateMatchMiss,
    PreAggregateMissReason,
    preAggregateUtils,
    PreviewExpiresAt,
    Project,
    ProjectCatalog,
    ProjectContextEntry,
    ProjectDbtSource,
    ProjectDefaults,
    ProjectGroupAccess,
    ProjectMemberProfile,
    ProjectMemberRole,
    ProjectSummary,
    ProjectType,
    QueryExecutionContext,
    RedshiftAuthenticationType,
    RegisteredAccount,
    ReplaceableCustomFields,
    ReplaceCustomFields,
    ReplaceCustomFieldsPayload,
    RequestMethod,
    ResolvedProjectColorPalette,
    resolveQueryTimezone,
    ResultRow,
    SavedChartDAO,
    SavedChartsInfoForDashboardAvailableFilters,
    SessionUser,
    snakeCaseName,
    SnowflakeAuthenticationType,
    SnowflakeTokenError,
    SortField,
    SpaceQuery,
    SpaceSummary,
    SqlRunnerPayload,
    SqlRunnerPivotQueryPayload,
    SummaryExplore,
    TablesConfiguration,
    TableSelectionType,
    UnexpectedServerError,
    UpdateDefaultUserSpaces,
    UpdateMetadata,
    UpdateProject,
    UpdateProjectDetails,
    UpdateProjectMember,
    UpdateQueryTimezoneSettings,
    UpdateSchedulerSettings,
    UpdateVirtualViewPayload,
    UserAccessControls,
    UserAttributeValueMap,
    UserWarehouseCredentials,
    VizColumn,
    WarehouseClient,
    WarehouseConnectionError,
    WarehouseCredentials,
    WarehouseTablesCatalog,
    WarehouseTableSchema,
    WarehouseTypes,
    type ApiCreateProjectResults,
    type CreateDatabricksCredentials,
    type DataTimezonePreviewRequest,
    type Metric,
    type OrganizationProject,
    type ParameterDefinitions,
    type ParametersValuesMap,
    type RunQueryTags,
    type Tag,
} from '@lightdash/common';
import {
    BigqueryWarehouseClient,
    DATABRICKS_DEFAULT_OAUTH_CLIENT_ID,
    exchangeDatabricksOAuthCredentials,
    refreshDatabricksOAuthToken,
    SshTunnel,
    warehouseSqlBuilderFromType,
} from '@lightdash/warehouses';
import * as Sentry from '@sentry/node';
import { createHmac, timingSafeEqual } from 'crypto';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { uniq } from 'lodash';
import fetch from 'node-fetch';
import { Readable } from 'stream';
import { URL } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { Worker } from 'worker_threads';
import {
    LightdashAnalytics,
    MetricQueryExecutionProperties,
    ProjectEvent,
    type OnboardingFlow,
} from '../../analytics/LightdashAnalytics';
import { S3CacheClient } from '../../clients/Aws/S3CacheClient';
import EmailClient from '../../clients/EmailClient/EmailClient';
import { type FileStorageClient } from '../../clients/FileStorage/FileStorageClient';
import type { INatsClient } from '../../clients/NatsClient';
import { LightdashConfig } from '../../config/parseConfig';
import { normalizeDatabricksHostLenient } from '../../controllers/authentication/strategies/databricksStrategy';
import type { DbProjectParameter } from '../../database/entities/projectParameters';
import type { DbTagUpdate } from '../../database/entities/tags';
import { type DbPreAggregateDefinitionIn } from '../../ee/database/entities/preAggregates';
import { PreAggregateModel } from '../../ee/models/PreAggregateModel';
import { enhanceExploresForPreAggregates } from '../../ee/preAggregates/enhanceExploresForPreAggregates';
import { preAggregatePostProcessor } from '../../ee/preAggregates/postProcessor';
import type { AiAgentService } from '../../ee/services/AiAgentService/AiAgentService';
import type { AppGenerateService } from '../../ee/services/AppGenerateService/AppGenerateService';
import { buildMaterializationMetricQuery } from '../../ee/services/PreAggregateMaterializationService/buildMaterializationMetricQuery';
import { errorHandler } from '../../errors';
import Logger from '../../logging/logger';
import { measureTime } from '../../logging/measureTime';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import type { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { ContentModel } from '../../models/ContentModel/ContentModel';
import { ContentVerificationModel } from '../../models/ContentVerificationModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { DownloadFileModel } from '../../models/DownloadFileModel';
import { EmailModel } from '../../models/EmailModel';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { GithubAppInstallationsModel } from '../../models/GithubAppInstallations/GithubAppInstallationsModel';
import { GroupsModel } from '../../models/GroupsModel';
import { JobModel } from '../../models/JobModel/JobModel';
import { OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { OrganizationSettingsModel } from '../../models/OrganizationSettingsModel';
import { OrganizationWarehouseCredentialsModel } from '../../models/OrganizationWarehouseCredentialsModel';
import { ProjectCompileLogModel } from '../../models/ProjectCompileLogModel';
import { ProjectDbtSourcesModel } from '../../models/ProjectDbtSourcesModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { ProjectParametersModel } from '../../models/ProjectParametersModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SshKeyPairModel } from '../../models/SshKeyPairModel';
import type { TagsModel } from '../../models/TagsModel';
import { UserAttributesModel } from '../../models/UserAttributesModel';
import { UserModel } from '../../models/UserModel';
import { UserOAuthGrantsModel } from '../../models/UserOAuthGrantsModel';
import { UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { WarehouseAvailableTablesModel } from '../../models/WarehouseAvailableTablesModel/WarehouseAvailableTablesModel';
import { DbtBaseProjectAdapter } from '../../projectAdapters/dbtBaseProjectAdapter';
import { projectAdapterFromConfig } from '../../projectAdapters/projectAdapter';
import { compileMetricQuery } from '../../queryCompiler';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { traceSpan } from '../../tracing/tracing';
import { CachedWarehouse, ProjectAdapter } from '../../types';
import { runWorkerThread, wrapSentryTransaction } from '../../utils';
import { buildCacheHash, getCacheUserUuid } from '../../utils/cacheUtils';
import { metricQueryWithLimit as applyMetricQueryLimit } from '../../utils/csvLimitUtils';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { PivotQueryBuilder } from '../../utils/QueryBuilder/PivotQueryBuilder';
import { QueryComposer } from '../../utils/QueryBuilder/QueryComposer';
import { applyLimitToSqlQuery } from '../../utils/QueryBuilder/utils';
import { SubtotalsCalculator } from '../../utils/SubtotalsCalculator';
import { AdminNotificationService } from '../AdminNotificationService/AdminNotificationService';
import { BaseService } from '../BaseService';
import { resolveOrganizationExportLimits } from '../OrganizationSettingsService/resolveExportLimits';
import { SpacePermissionService } from '../SpaceService/SpacePermissionService';
import {
    doesExploreMatchRequiredAttributes,
    exploreHasFilteredAttribute,
    getFilteredExplore,
} from '../UserAttributesService/UserAttributeUtils';
import { UserService } from '../UserService';
import { getFieldValuesMetricQuery } from './fieldValuesQueryBuilder';
import { getAvailableParameterDefinitions } from './parameters';
import { applyCurrentGithubInstallationId } from './resolveGithubInstallationId';

type RefreshTokenRotationSource =
    | { kind: 'project'; projectUuid: string }
    | {
          kind: 'organization';
          organizationWarehouseCredentialsUuid: string;
      }
    | { kind: 'user'; userWarehouseCredentialsUuid: string };

export type ProjectServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
    projectDbtSourcesModel: ProjectDbtSourcesModel;
    preAggregateModel: PreAggregateModel;
    onboardingModel: OnboardingModel;
    savedChartModel: SavedChartModel;
    jobModel: JobModel;
    emailClient: EmailClient;
    spaceModel: SpaceModel;
    sshKeyPairModel: SshKeyPairModel;
    userAttributesModel: UserAttributesModel;
    s3CacheClient: S3CacheClient;
    analyticsModel: AnalyticsModel;
    dashboardModel: DashboardModel;
    emailModel: EmailModel;
    userWarehouseCredentialsModel: UserWarehouseCredentialsModel;
    warehouseAvailableTablesModel: WarehouseAvailableTablesModel;
    schedulerClient: SchedulerClient;
    downloadFileModel: DownloadFileModel;
    fileStorageClient: FileStorageClient;
    groupsModel: GroupsModel;
    tagsModel: TagsModel;
    catalogModel: CatalogModel;
    contentModel: ContentModel;
    encryptionUtil: EncryptionUtil;
    userModel: UserModel;
    userOAuthGrantsModel: UserOAuthGrantsModel;
    featureFlagModel: FeatureFlagModel;
    projectParametersModel: ProjectParametersModel;
    organizationWarehouseCredentialsModel: OrganizationWarehouseCredentialsModel;
    organizationModel: OrganizationModel;
    projectCompileLogModel: ProjectCompileLogModel;
    adminNotificationService: AdminNotificationService;
    spacePermissionService: SpacePermissionService;
    natsClient?: INatsClient;
    contentVerificationModel?: ContentVerificationModel;
    organizationSettingsModel: OrganizationSettingsModel;
    githubAppInstallationsModel?: GithubAppInstallationsModel;
    projectContextModel?: {
        replaceEntriesForProject(
            projectUuid: string,
            entries: ProjectContextEntry[],
        ): Promise<void>;
    };
    isProjectContextEnabled?: (args: {
        user: Pick<SessionUser, 'userUuid'> &
            Partial<Pick<SessionUser, 'organizationName'>>;
        organizationUuid: string;
    }) => Promise<boolean>;
    // Lazily resolves the EE data-app service so preview creation can duplicate
    // the upstream project's data apps. A thunk — not the instance — because
    // AppGenerateService depends on ProjectService, so eager injection would
    // create a construction cycle. Resolves undefined in core (non-EE) builds.
    getAppGenerateService?: () => AppGenerateService | undefined;
    getAiAgentService?: () => AiAgentService | undefined;
    onProjectCreated?: (args: {
        user: SessionUser;
        projectUuid: string;
        projectType: ProjectType;
    }) => Promise<void>;
    provisionPlaygroundProject?: (args: {
        user: SessionUser;
        projectService: ProjectService;
        canViewProject: (project: OrganizationProject) => boolean;
    }) => Promise<EnsurePlaygroundProjectResults>;
};

const isValidDbtCloudWebhookSignature = (
    secret: string,
    rawBody: Buffer,
    signature: string,
): boolean => {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
    const expectedBuffer = Buffer.from(expected, 'utf8');
    const signatureBuffer = Buffer.from(signature, 'utf8');
    if (expectedBuffer.length !== signatureBuffer.length) {
        return false;
    }
    return timingSafeEqual(expectedBuffer, signatureBuffer);
};

export class ProjectService extends BaseService {
    lightdashConfig: LightdashConfig;

    analytics: LightdashAnalytics;

    projectModel: ProjectModel;

    projectDbtSourcesModel: ProjectDbtSourcesModel;

    preAggregateModel: PreAggregateModel;

    onboardingModel: OnboardingModel;

    warehouseClients: Record<string, WarehouseClient>;

    savedChartModel: SavedChartModel;

    jobModel: JobModel;

    emailClient: EmailClient;

    spaceModel: SpaceModel;

    sshKeyPairModel: SshKeyPairModel;

    userAttributesModel: UserAttributesModel;

    s3CacheClient: S3CacheClient;

    analyticsModel: AnalyticsModel;

    dashboardModel: DashboardModel;

    userWarehouseCredentialsModel: UserWarehouseCredentialsModel;

    warehouseAvailableTablesModel: WarehouseAvailableTablesModel;

    emailModel: EmailModel;

    schedulerClient: SchedulerClient;

    downloadFileModel: DownloadFileModel;

    fileStorageClient: FileStorageClient;

    groupsModel: GroupsModel;

    tagsModel: TagsModel;

    catalogModel: CatalogModel;

    contentModel: ContentModel;

    encryptionUtil: EncryptionUtil;

    userModel: UserModel;

    userOAuthGrantsModel: UserOAuthGrantsModel;

    featureFlagModel: FeatureFlagModel;

    projectParametersModel: ProjectParametersModel;

    projectCompileLogModel: ProjectCompileLogModel;

    organizationWarehouseCredentialsModel: OrganizationWarehouseCredentialsModel;

    organizationModel: OrganizationModel;

    adminNotificationService: AdminNotificationService;

    spacePermissionService: SpacePermissionService;

    contentVerificationModel: ContentVerificationModel | undefined;

    organizationSettingsModel: OrganizationSettingsModel;

    githubAppInstallationsModel: GithubAppInstallationsModel | undefined;

    projectContextModel:
        | {
              replaceEntriesForProject(
                  projectUuid: string,
                  entries: ProjectContextEntry[],
              ): Promise<void>;
          }
        | undefined;

    isProjectContextEnabled:
        | ProjectServiceArguments['isProjectContextEnabled']
        | undefined;

    getAppGenerateService: (() => AppGenerateService | undefined) | undefined;

    getAiAgentService: (() => AiAgentService | undefined) | undefined;

    onProjectCreated: ProjectServiceArguments['onProjectCreated'];

    provisionPlaygroundProject: ProjectServiceArguments['provisionPlaygroundProject'];

    constructor({
        lightdashConfig,
        analytics,
        projectModel,
        projectDbtSourcesModel,
        preAggregateModel,
        onboardingModel,
        savedChartModel,
        jobModel,
        emailClient,
        spaceModel,
        sshKeyPairModel,
        userAttributesModel,
        s3CacheClient,
        analyticsModel,
        dashboardModel,
        userWarehouseCredentialsModel,
        warehouseAvailableTablesModel,
        emailModel,
        schedulerClient,
        downloadFileModel,
        fileStorageClient,
        groupsModel,
        tagsModel,
        catalogModel,
        contentModel,
        encryptionUtil,
        userModel,
        userOAuthGrantsModel,
        featureFlagModel,
        projectParametersModel,
        projectCompileLogModel,
        organizationWarehouseCredentialsModel,
        organizationModel,
        adminNotificationService,
        spacePermissionService,
        contentVerificationModel,
        organizationSettingsModel,
        githubAppInstallationsModel,
        projectContextModel,
        isProjectContextEnabled,
        getAppGenerateService,
        getAiAgentService,
        onProjectCreated,
        provisionPlaygroundProject,
    }: ProjectServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.projectModel = projectModel;
        this.projectDbtSourcesModel = projectDbtSourcesModel;
        this.preAggregateModel = preAggregateModel;
        this.onboardingModel = onboardingModel;
        this.warehouseClients = {};
        this.savedChartModel = savedChartModel;
        this.jobModel = jobModel;
        this.emailClient = emailClient;
        this.spaceModel = spaceModel;
        this.sshKeyPairModel = sshKeyPairModel;
        this.userAttributesModel = userAttributesModel;
        this.s3CacheClient = s3CacheClient;
        this.analyticsModel = analyticsModel;
        this.dashboardModel = dashboardModel;
        this.userWarehouseCredentialsModel = userWarehouseCredentialsModel;
        this.warehouseAvailableTablesModel = warehouseAvailableTablesModel;
        this.emailModel = emailModel;
        this.schedulerClient = schedulerClient;
        this.downloadFileModel = downloadFileModel;
        this.fileStorageClient = fileStorageClient;
        this.groupsModel = groupsModel;
        this.tagsModel = tagsModel;
        this.catalogModel = catalogModel;
        this.contentModel = contentModel;
        this.encryptionUtil = encryptionUtil;
        this.userModel = userModel;
        this.userOAuthGrantsModel = userOAuthGrantsModel;
        this.featureFlagModel = featureFlagModel;
        this.projectParametersModel = projectParametersModel;
        this.projectCompileLogModel = projectCompileLogModel;
        this.organizationWarehouseCredentialsModel =
            organizationWarehouseCredentialsModel;
        this.organizationModel = organizationModel;
        this.adminNotificationService = adminNotificationService;
        this.spacePermissionService = spacePermissionService;
        this.contentVerificationModel = contentVerificationModel;
        this.organizationSettingsModel = organizationSettingsModel;
        this.githubAppInstallationsModel = githubAppInstallationsModel;
        this.projectContextModel = projectContextModel;
        this.isProjectContextEnabled = isProjectContextEnabled;
        this.getAppGenerateService = getAppGenerateService;
        this.getAiAgentService = getAiAgentService;
        this.onProjectCreated = onProjectCreated;
        this.provisionPlaygroundProject = provisionPlaygroundProject;
    }

    async ensurePlaygroundProject(
        user: SessionUser,
    ): Promise<EnsurePlaygroundProjectResults> {
        if (!this.provisionPlaygroundProject) {
            throw new NotFoundError('Playground projects are not available');
        }
        const { organizationUuid } = user;
        if (!organizationUuid) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'create',
                subject('InviteLink', { organizationUuid }),
            )
        ) {
            throw new ForbiddenError(
                'User does not have permission to create invite links',
            );
        }
        return this.provisionPlaygroundProject({
            user,
            projectService: this,
            canViewProject: (project) =>
                auditedAbility.can(
                    'view',
                    subject('Project', {
                        organizationUuid,
                        projectUuid: project.projectUuid,
                        type: project.type,
                        upstreamProjectUuid:
                            project.upstreamProjectUuid ?? undefined,
                        createdByUserUuid: project.createdByUserUuid,
                    }),
                ),
        });
    }

    protected async getOnboardingFlow(
        user: Pick<SessionUser, 'userUuid' | 'organizationUuid'>,
    ): Promise<OnboardingFlow> {
        const { enabled } = await this.featureFlagModel.get({
            user,
            featureFlagId: FeatureFlags.NewOnboarding,
        });
        return enabled ? 'new' : 'legacy';
    }

    private async provisionDefaultAiAgent(
        user: SessionUser,
        projectUuid: string,
        projectType: ProjectType,
    ): Promise<void> {
        if (projectType === ProjectType.PREVIEW) {
            return;
        }

        const { organizationUuid } = user;
        if (!organizationUuid) {
            return;
        }

        try {
            const projects =
                await this.projectModel.getAllByOrganizationUuid(
                    organizationUuid,
                );
            const nonPreviewProjects = projects.filter(
                (project) => project.type !== ProjectType.PREVIEW,
            );
            if (
                nonPreviewProjects.length !== 1 ||
                nonPreviewProjects[0].projectUuid !== projectUuid
            ) {
                return;
            }

            await this.getAiAgentService?.()?.provisionDefaultAgent(
                user,
                projectUuid,
            );
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error);
            this.analytics.track({
                event: 'ai_agent.provisioning_failed',
                userId: user.userUuid,
                properties: {
                    organizationId: organizationUuid,
                    projectId: projectUuid,
                    error: errorMessage,
                },
            });
            this.logger.warn(
                `Failed to provision default AI agent for project ${projectUuid}: ${errorMessage}`,
            );
        }
    }

    private async runPostProjectCreationProvisioning(
        user: SessionUser,
        projectUuid: string,
        projectType: ProjectType,
    ): Promise<void> {
        await this.provisionDefaultAiAgent(user, projectUuid, projectType);

        try {
            await this.onProjectCreated?.({ user, projectUuid, projectType });
        } catch (error) {
            // Provisioning failures must not fail project creation
            Sentry.captureException(error);
            this.logger.error(
                `Failed to run post-creation provisioning for project ${projectUuid}: ${error instanceof Error ? error.message : String(error)}`,
            );
        }
    }

    static getMetricQueryExecutionProperties({
        metricQuery,
        dateZoom,
        chartUuid,
        queryTags,
        explore,
        parameters,
    }: {
        metricQuery: MetricQuery;
        dateZoom: DateZoom | undefined;
        chartUuid: string | undefined;
        queryTags: Omit<RunQueryTags, 'query_context'>;
        explore: Explore;
        parameters: ParametersValuesMap | undefined;
    }): MetricQueryExecutionProperties {
        return {
            exploreName: explore.name,
            dashboardId: queryTags.dashboard_uuid ?? null,
            dimensionsCount: metricQuery.dimensions.length,
            metricsCount: metricQuery.metrics.length,
            filtersCount: countTotalFilterRules(metricQuery.filters),
            sortsCount: metricQuery.sorts.length,
            tableCalculationsCount: metricQuery.tableCalculations.length,
            tableCalculationsPercentFormatCount:
                metricQuery.tableCalculations.filter(
                    (tableCalculation) =>
                        tableCalculation.format?.type ===
                        CustomFormatType.PERCENT,
                ).length,
            tableCalculationsCurrencyFormatCount:
                metricQuery.tableCalculations.filter(
                    (tableCalculation) =>
                        tableCalculation.format?.type ===
                        CustomFormatType.CURRENCY,
                ).length,
            tableCalculationsNumberFormatCount:
                metricQuery.tableCalculations.filter(
                    (tableCalculation) =>
                        tableCalculation.format?.type ===
                        CustomFormatType.NUMBER,
                ).length,
            tableCalculationCustomFormatCount:
                metricQuery.tableCalculations.filter(
                    (tableCalculation) =>
                        tableCalculation.format?.type ===
                        CustomFormatType.CUSTOM,
                ).length,
            additionalMetricsCount: (
                metricQuery.additionalMetrics || []
            ).filter((metric) =>
                metricQuery.metrics.includes(getItemId(metric)),
            ).length,
            additionalMetricsFilterCount: (
                metricQuery.additionalMetrics || []
            ).filter(
                (metric) =>
                    metricQuery.metrics.includes(getItemId(metric)) &&
                    metric.filters &&
                    metric.filters.length > 0,
            ).length,
            additionalMetricsPercentFormatCount: (
                metricQuery.additionalMetrics || []
            ).filter(
                (metric) =>
                    metricQuery.metrics.includes(getItemId(metric)) &&
                    metric.formatOptions &&
                    metric.formatOptions.type === CustomFormatType.PERCENT,
            ).length,
            additionalMetricsCurrencyFormatCount: (
                metricQuery.additionalMetrics || []
            ).filter(
                (metric) =>
                    metricQuery.metrics.includes(getItemId(metric)) &&
                    metric.formatOptions &&
                    metric.formatOptions.type === CustomFormatType.CURRENCY,
            ).length,
            additionalMetricsNumberFormatCount: (
                metricQuery.additionalMetrics || []
            ).filter(
                (metric) =>
                    metricQuery.metrics.includes(getItemId(metric)) &&
                    metric.formatOptions &&
                    metric.formatOptions.type === CustomFormatType.NUMBER,
            ).length,
            additionalMetricsCustomFormatCount: (
                metricQuery.additionalMetrics || []
            ).filter(
                (metric) =>
                    metricQuery.metrics.includes(getItemId(metric)) &&
                    metric.formatOptions &&
                    metric.formatOptions.type === CustomFormatType.CUSTOM,
            ).length,
            ...countCustomDimensionsInMetricQuery(metricQuery),
            dateZoomGranularity: dateZoom?.granularity || null,
            timezone: metricQuery.timezone,
            chartId: chartUuid,
            ...(explore.type === ExploreType.VIRTUAL
                ? { virtualViewId: explore.name }
                : {}),
            metricOverridesCount: Object.keys(
                metricQuery.metricOverrides || {},
            ).filter((metricOverrideKey) =>
                metricQuery.metrics.includes(metricOverrideKey),
            ).length,
            limit: metricQuery.limit,
            parametersCount: Object.keys(parameters || {}).length,
        };
    }

    private async validateProjectCreationPermissions(
        user: SessionUser,
        data: Pick<CreateProject, 'type' | 'upstreamProjectUuid'>,
    ) {
        if (!data.type) {
            throw new ParameterError('Project type must be provided');
        }

        if (data.type === ProjectType.DEFAULT && data.upstreamProjectUuid) {
            throw new ParameterError(
                'upstreamProjectUuid must not be provided for default projects',
            );
        }

        const auditedAbility = this.createAuditedAbility(user);

        switch (data.type) {
            case ProjectType.DEFAULT:
                // checks if user has permission to create project on an organization level
                if (
                    auditedAbility.can(
                        'create',
                        subject('Project', {
                            organizationUuid: user.organizationUuid!,
                            type: ProjectType.DEFAULT,
                        }),
                    )
                ) {
                    return true;
                }

                throw new ForbiddenError(
                    `You don't have permission to create projects in this organization. Please contact your organization admin.`,
                    {
                        requiredPermission: 'create:project',
                        projectType: ProjectType.DEFAULT,
                        organizationUuid: user.organizationUuid,
                    },
                );

            case ProjectType.PREVIEW: {
                let upstreamProject: Awaited<
                    ReturnType<ProjectModel['get']>
                > | null = null;

                if (data.upstreamProjectUuid) {
                    upstreamProject = await this.projectModel.get(
                        data.upstreamProjectUuid,
                    );
                    if (
                        auditedAbility.cannot(
                            'view',
                            subject('Project', {
                                organizationUuid:
                                    upstreamProject.organizationUuid,
                                projectUuid: upstreamProject.projectUuid,
                            }),
                        )
                    ) {
                        throw new ForbiddenError(
                            `You don't have permission to access the upstream project "${upstreamProject.name}". You need view access to create a preview from this project.`,
                            {
                                requiredPermission: 'view:project',
                                upstreamProjectUuid:
                                    upstreamProject.projectUuid,
                                upstreamProjectName: upstreamProject.name,
                            },
                        );
                    }
                    if (upstreamProject.type === ProjectType.PREVIEW) {
                        throw new ForbiddenError(
                            'Cannot create a preview project from a preview project',
                        );
                    }
                    if (
                        // checks if user has permission to create project from an upstream project on a project level
                        auditedAbility.can(
                            'create',
                            subject('Project', {
                                organizationUuid:
                                    upstreamProject.organizationUuid,
                                upstreamProjectUuid:
                                    upstreamProject.projectUuid,
                                type: ProjectType.PREVIEW,
                                metadata: {
                                    upstreamProjectUuid:
                                        upstreamProject.projectUuid,
                                    upstreamProjectName: upstreamProject.name,
                                },
                            }),
                        )
                    ) {
                        return true;
                    }
                }

                if (
                    // checks if user has permission to create project on an organization level
                    auditedAbility.can(
                        'create',
                        subject('Project', {
                            organizationUuid: user.organizationUuid!,
                            type: ProjectType.PREVIEW,
                        }),
                    )
                ) {
                    return true;
                }

                const errorMessage = upstreamProject
                    ? `You don't have permission to create preview projects from "${upstreamProject.name}". Contact your admin to request access.`
                    : `You don't have permission to create preview projects in this organization. Contact your admin to request access.`;

                throw new ForbiddenError(errorMessage, {
                    requiredPermission: 'create:preview_project',
                    projectType: ProjectType.PREVIEW,
                    organizationUuid: user.organizationUuid,
                    ...(upstreamProject && {
                        upstreamProjectUuid: upstreamProject.projectUuid,
                        upstreamProjectName: upstreamProject.name,
                    }),
                });
            }

            default:
                return assertUnreachable(
                    data.type,
                    `Unknown project type: ${data.type}`,
                );
        }
    }

    /** Single interface for getting user attributes for session and embedded users */
    async getUserAttributes({
        account,
        user,
    }:
        | {
              account: Account;
              user?: never;
          }
        | {
              user: SessionUser;
              account?: never;
          }): Promise<UserAccessControls> {
        // Embedded JWT users may come with an email, but they aren't customers
        // within Lightdash that have verified their email.
        if (account?.isJwtUser()) {
            assertEmbeddedAuth(account);
            if (account.access.controls) {
                return account.access.controls;
            }
        }

        if (!user && !account) {
            throw new ForbiddenError('User or account must be provided');
        }

        const userId = user ? user.userUuid : account.user.id;
        const organizationUuid = user
            ? user.organizationUuid
            : account.organization.organizationUuid;
        const email = user ? user.email : account.user.email;
        const isServiceAccountPrincipal =
            account?.isServiceAccount() || !!user?.serviceAccount;

        // Service-account principals have no email row, so they have no
        // intrinsic email attributes to attach.
        if (isServiceAccountPrincipal || !email) {
            const userAttributes =
                await this.userAttributesModel.getAttributeValuesForOrgMember({
                    organizationUuid: organizationUuid || '',
                    userUuid: userId || '',
                });
            return { userAttributes, intrinsicUserAttributes: {} };
        }

        // Run attribute queries and email status in parallel (independent)
        const [userAttributes, emailStatus] = await Promise.all([
            this.userAttributesModel.getAttributeValuesForOrgMember({
                organizationUuid: organizationUuid || '',
                userUuid: userId || '',
            }),
            this.emailModel.getPrimaryEmailStatus(userId),
        ]);
        const intrinsicUserAttributes = emailStatus.isVerified
            ? getIntrinsicUserAttributes({ email })
            : {};

        return { userAttributes, intrinsicUserAttributes };
    }

    /*
    This method is used to refresh the credentials for the warehouse client
    This runs on every request to the warehouse, to refresh the token if needed when an accessToken is requested
    Bigquery uses the refresh token directly on the warehouse connection, so there is no need to refresh it

    If organizationWarehouseCredentialsUuid is provided, this means the project is using organization-level
    credentials and the refresh token is already stored in the credentials (fetched from the org credentials table).
    Otherwise, fetch the refresh token from the user's OpenID table.
    */
    private async refreshCredentials<T extends CreateWarehouseCredentials>(
        args: T,
        userUuid: string,
    ): Promise<T> {
        if (
            args.type === WarehouseTypes.SNOWFLAKE &&
            args.authenticationType === 'sso'
        ) {
            try {
                const { refreshToken } = args;

                // If we don't have a token, we can't refresh
                if (!refreshToken) {
                    throw new Error(
                        'No refresh token available for Snowflake SSO authentication',
                    );
                }
                this.logger.debug(
                    `Refreshing snowflake token for user ${userUuid}`,
                );
                // If we try to generate access token from token instead of refreshToken
                // it will throw an error: The request was invalid.
                const { accessToken, refreshToken: newRefreshToken } =
                    await UserService.generateSnowflakeAccessToken(
                        refreshToken,
                    );
                return {
                    ...args,
                    authenticationType: SnowflakeAuthenticationType.SSO,
                    token: accessToken,
                    refreshToken: newRefreshToken,
                };
            } catch (e: unknown) {
                if (e instanceof LightdashError) {
                    throw e;
                }
                this.logger.error(
                    `Error refreshing snowflake token: ${JSON.stringify(e)}`,
                );

                let errorMessage = '';
                try {
                    // Try to get detailed error message from snowflake refresh token error
                    const errorDetails = JSON.parse(
                        (e as { data: string }).data,
                    ).message;
                    errorMessage = `Error refreshing snowflake token: ${errorDetails}`;
                } catch (e2: unknown) {
                    errorMessage = 'Error refreshing snowflake token';
                }
                throw new SnowflakeTokenError(errorMessage);
            }
        }

        if (
            args.type === WarehouseTypes.DATABRICKS &&
            args.authenticationType === DatabricksAuthenticationType.OAUTH_M2M
        ) {
            try {
                // Try to use stored OAuth credentials first, then fall back to refresh token
                if (
                    args.oauthClientId &&
                    args.oauthClientSecret &&
                    !args.refreshToken
                ) {
                    this.logger.debug(
                        `Exchanging Databricks OAuth credentials for access token for user ${userUuid}`,
                    );
                    const { accessToken, refreshToken } =
                        await exchangeDatabricksOAuthCredentials(
                            args.serverHostName,
                            args.oauthClientId,
                            args.oauthClientSecret,
                        );
                    return {
                        ...args,
                        authenticationType:
                            DatabricksAuthenticationType.OAUTH_M2M,
                        token: accessToken,
                        refreshToken,
                    };
                }

                const { refreshToken } = args;

                // If we don't have a refresh token, we can't refresh
                if (!refreshToken) {
                    throw new Error(
                        'No refresh token or OAuth credentials available for Databricks OAuth authentication',
                    );
                }

                this.logger.debug(
                    `Refreshing databricks token for user ${userUuid}`,
                );

                // If the project has an oauthClientId, the token was
                // obtained with that client (e.g. CLI flow) — use it as-is.
                // Only fall back to server config when there's no project
                // client (UI flow stores tokens in user warehouse credentials).
                let clientId: string;
                let clientSecret: string | undefined;
                if (args.oauthClientId) {
                    clientId = args.oauthClientId;
                    clientSecret = args.oauthClientSecret;
                } else if (this.lightdashConfig.auth.databricks.clientId) {
                    clientId = this.lightdashConfig.auth.databricks.clientId;
                    clientSecret =
                        this.lightdashConfig.auth.databricks.clientSecret;
                } else {
                    clientId = DATABRICKS_DEFAULT_OAUTH_CLIENT_ID;
                    clientSecret = undefined;
                }
                const { accessToken, refreshToken: newRefreshToken } =
                    await refreshDatabricksOAuthToken(
                        args.serverHostName,
                        clientId,
                        refreshToken,
                        clientSecret,
                    );
                return {
                    ...args,
                    authenticationType: DatabricksAuthenticationType.OAUTH_M2M,
                    token: accessToken,
                    refreshToken: newRefreshToken || refreshToken,
                };
            } catch (e: unknown) {
                if (e instanceof LightdashError) {
                    throw e;
                }
                this.logger.error(
                    `Error refreshing databricks token: ${getErrorMessage(e)}`,
                );
                throw new UnexpectedServerError(
                    'Error refreshing databricks token',
                );
            }
        }

        if (
            args.type === WarehouseTypes.DATABRICKS &&
            args.authenticationType === DatabricksAuthenticationType.OAUTH_U2M
        ) {
            try {
                const { refreshToken } = args;

                if (!refreshToken) {
                    throw new Error(
                        'No refresh token available for Databricks U2M OAuth authentication',
                    );
                }

                this.logger.debug(
                    `Refreshing databricks U2M OAuth token for user ${userUuid}`,
                );

                // Resolve OAuth client for token refresh.
                // U2M credentials store the clientId that obtained the token.
                // The secret is only in server config (never stored in DB).
                let clientId: string;
                let clientSecret: string | undefined;
                if (args.oauthClientId) {
                    clientId = args.oauthClientId;
                } else if (this.lightdashConfig.auth.databricks.clientId) {
                    clientId = this.lightdashConfig.auth.databricks.clientId;
                } else {
                    clientId = DATABRICKS_DEFAULT_OAUTH_CLIENT_ID;
                }

                if (
                    clientId === this.lightdashConfig.auth.databricks.clientId
                ) {
                    clientSecret =
                        this.lightdashConfig.auth.databricks.clientSecret;
                }

                const { accessToken, refreshToken: newRefreshToken } =
                    await refreshDatabricksOAuthToken(
                        args.serverHostName,
                        clientId,
                        refreshToken,
                        clientSecret,
                    );

                return {
                    ...args,
                    authenticationType: DatabricksAuthenticationType.OAUTH_U2M,
                    token: accessToken,
                    refreshToken: newRefreshToken, // Update in case token was rotated
                };
            } catch (e: unknown) {
                if (e instanceof LightdashError) {
                    throw e;
                }
                const errorMessage = `Error refreshing databricks U2M OAuth token: ${getErrorMessage(e)}`;
                this.logger.error(errorMessage);
                throw new DatabricksTokenError(errorMessage);
            }
        }

        return args;
    }

    private async refreshCredentialsAndPersistRotation<
        T extends CreateWarehouseCredentials,
    >(
        args: T,
        userUuid: string,
        source: RefreshTokenRotationSource,
    ): Promise<T> {
        const oldRefreshToken = ProjectService.getCredentialsRefreshToken(args);

        const refreshed = await this.refreshCredentials(args, userUuid);

        const newRefreshToken =
            ProjectService.getCredentialsRefreshToken(refreshed);

        if (
            oldRefreshToken &&
            newRefreshToken &&
            newRefreshToken !== oldRefreshToken
        ) {
            await this.persistRefreshTokenRotation({
                source,
                oldRefreshToken,
                newRefreshToken,
            });
        }

        return refreshed;
    }

    private static getCredentialsRefreshToken(
        creds: CreateWarehouseCredentials,
    ): string | undefined {
        const candidate = (creds as Partial<{ refreshToken: string }>)
            .refreshToken;
        return typeof candidate === 'string' && candidate.length > 0
            ? candidate
            : undefined;
    }

    private static getRotationSourceUuid(
        source: RefreshTokenRotationSource,
    ): string {
        switch (source.kind) {
            case 'project':
                return source.projectUuid;
            case 'organization':
                return source.organizationWarehouseCredentialsUuid;
            case 'user':
                return source.userWarehouseCredentialsUuid;
            default:
                return assertUnreachable(source, 'Unknown source kind');
        }
    }

    private async persistRefreshTokenRotation({
        source,
        oldRefreshToken,
        newRefreshToken,
    }: {
        source: RefreshTokenRotationSource;
        oldRefreshToken: string;
        newRefreshToken: string;
    }): Promise<void> {
        try {
            switch (source.kind) {
                case 'project':
                    await this.projectModel.rotateRefreshToken(
                        source.projectUuid,
                        oldRefreshToken,
                        newRefreshToken,
                    );
                    break;
                case 'organization':
                    await this.organizationWarehouseCredentialsModel.rotateRefreshToken(
                        source.organizationWarehouseCredentialsUuid,
                        oldRefreshToken,
                        newRefreshToken,
                    );
                    break;
                case 'user':
                    await this.userWarehouseCredentialsModel.rotateRefreshToken(
                        source.userWarehouseCredentialsUuid,
                        oldRefreshToken,
                        newRefreshToken,
                    );
                    break;
                default:
                    assertUnreachable(
                        source,
                        'Unknown OAuth refresh token rotation source',
                    );
            }
        } catch (error) {
            // Don't fail the in-flight query: the freshly minted access token is still usable.
            this.logger.error('Failed to persist rotated OAuth refresh token', {
                sourceKind: source.kind,
                sourceUuid: ProjectService.getRotationSourceUuid(source),
                error: getErrorMessage(error),
            });
        }
    }

    /*
    This method is used when the user is creating a project
    This does not depend on `requireUserCredentials` flag (check getWarehouseCredentials for more details about that)
    In here, we will load on runtime SSH credentials or refresh tokens for SSO

    If organizationWarehouseCredentialsUuid is provided, load the credentials from the organization
    credentials table instead of using the inline warehouseConnection.
    */
    private async _resolveWarehouseClientCredentials<
        T extends {
            warehouseConnection: CreateWarehouseCredentials;
            organizationWarehouseCredentialsUuid?: string;
        },
    >(args: T, userUuid: string, organizationUuid: string): Promise<T> {
        // If using organization credentials, load them from the organization table
        const organizationWarehouseCredentialsUuid =
            args.organizationWarehouseCredentialsUuid ||
            (args.warehouseConnection.type === WarehouseTypes.SNOWFLAKE
                ? args.warehouseConnection.organizationWarehouseCredentialsUuid
                : undefined);

        if (organizationWarehouseCredentialsUuid) {
            this.logger.debug(
                `Resolving organization warehouse credentials with uuid ${organizationWarehouseCredentialsUuid}`,
            );

            const orgCredentialData =
                await this.organizationWarehouseCredentialsModel.getByUuidWithSensitiveData(
                    organizationWarehouseCredentialsUuid,
                );

            // Security check: Verify the credentials belong to the user's organization
            if (orgCredentialData.organizationUuid !== organizationUuid) {
                this.logger.warn(
                    `User attempted to use organization credentials from different organization. User org: ${organizationUuid}, Credentials org: ${orgCredentialData.organizationUuid}`,
                );
                throw new ForbiddenError(
                    'You do not have permission to use these organization warehouse credentials',
                );
            }

            const { credentials: orgCredentials } = orgCredentialData;

            if (orgCredentials.type !== WarehouseTypes.SNOWFLAKE) {
                throw new UnexpectedServerError(
                    'Organization warehouse credentials are not compatible with Snowflake SSO authentication',
                );
            }
            // Replace the warehouseConnection with the organization credentials
            // The organizationWarehouseCredentialsUuid will be stored in the projects table
            // but we don't store duplicate credentials in warehouse_credentials table
            const mergedWarehouseConnection = {
                ...args.warehouseConnection,
                ...orgCredentials,
            } as CreateSnowflakeCredentials;
            this.logger.debug(
                `Refreshing snowflake warehouse credentials from organization credentials uuid: ${organizationWarehouseCredentialsUuid}`,
            );
            const credentials = await this.refreshCredentials(
                mergedWarehouseConnection,
                userUuid,
            );

            return {
                ...args,
                warehouseConnection: {
                    ...mergedWarehouseConnection,
                    ...credentials,
                },
            };
        }

        if (
            (args.warehouseConnection.type === WarehouseTypes.REDSHIFT ||
                args.warehouseConnection.type === WarehouseTypes.POSTGRES) &&
            args.warehouseConnection.useSshTunnel
        ) {
            const publicKey = args.warehouseConnection.sshTunnelPublicKey || '';
            const { privateKey } = await this.sshKeyPairModel.get(publicKey);
            return {
                ...args,
                warehouseConnection: {
                    ...args.warehouseConnection,
                    sshTunnelPrivateKey: privateKey,
                },
            };
        }

        if (
            args.warehouseConnection.type === WarehouseTypes.BIGQUERY &&
            args.warehouseConnection.authenticationType ===
                BigqueryAuthenticationType.SSO &&
            args.warehouseConnection.keyfileContents.type !== 'authorized_user'
        ) {
            const refreshToken =
                await this.userOAuthGrantsModel.getRefreshToken(
                    userUuid,
                    OpenIdIdentityIssuerType.GOOGLE,
                );

            // Validate refresh token has the right bigquery scopes
            await UserService.generateGoogleAccessToken(
                refreshToken,
                'bigquery',
            );
            return {
                ...args,
                warehouseConnection: {
                    ...args.warehouseConnection,
                    keyfileContents: {
                        type: 'authorized_user',
                        client_id:
                            this.lightdashConfig.auth.google.oauth2ClientId,
                        client_secret:
                            this.lightdashConfig.auth.google.oauth2ClientSecret,
                        refresh_token: refreshToken,
                    },
                },
            };
        }

        if (
            args.warehouseConnection.type === WarehouseTypes.SNOWFLAKE &&
            args.warehouseConnection.authenticationType === 'sso' &&
            !organizationWarehouseCredentialsUuid
        ) {
            const refreshToken =
                await this.userOAuthGrantsModel.getRefreshToken(
                    userUuid,
                    OpenIdIdentityIssuerType.SNOWFLAKE,
                );
            // Validate refresh token and generate new access token
            this.logger.debug(
                `Refreshing snowflake warehouse credentials from user uuid: ${userUuid}`,
            );
            const credentials = await this.refreshCredentials(
                { ...args.warehouseConnection, refreshToken },
                userUuid,
            );
            return {
                ...args,
                warehouseConnection: {
                    ...args.warehouseConnection,
                    ...credentials,
                    refreshToken, // Store refresh token from user so we can generate new access tokens later
                },
            };
        }

        if (
            args.warehouseConnection.type === WarehouseTypes.DATABRICKS &&
            args.warehouseConnection.authenticationType ===
                DatabricksAuthenticationType.OAUTH_U2M &&
            !organizationWarehouseCredentialsUuid
        ) {
            // Use refresh token from request body first (e.g. CLI flow).
            // Otherwise, resolve a host-matching user credential to avoid
            // cross-workspace refresh token mismatches.
            let { refreshToken } = args.warehouseConnection;
            if (!refreshToken) {
                const matchingCredential =
                    await this.userWarehouseCredentialsModel.findDatabricksOauthU2mForHostWithSecrets(
                        userUuid,
                        args.warehouseConnection.serverHostName,
                    );
                if (
                    matchingCredential?.credentials.type ===
                        WarehouseTypes.DATABRICKS &&
                    matchingCredential.credentials.authenticationType ===
                        DatabricksAuthenticationType.OAUTH_U2M
                ) {
                    refreshToken = matchingCredential.credentials.refreshToken;
                }
            }

            if (!refreshToken) {
                throw new NotFoundError(
                    `No Databricks OAuth credentials found for workspace ${args.warehouseConnection.serverHostName}. Please sign in with Databricks for this workspace and try again.`,
                );
            }

            // Validate refresh token and generate new access token
            this.logger.debug(
                `Refreshing databricks warehouse credentials from user uuid: ${userUuid}`,
            );
            const credentials = await this.refreshCredentials(
                { ...args.warehouseConnection, refreshToken },
                userUuid,
            );

            return {
                ...args,
                warehouseConnection: {
                    ...args.warehouseConnection,
                    ...credentials,
                    refreshToken, // Store refresh token from user so we can generate new access tokens later
                },
            };
        }

        if (
            args.warehouseConnection.type === WarehouseTypes.DATABRICKS &&
            args.warehouseConnection.authenticationType ===
                DatabricksAuthenticationType.OAUTH_M2M &&
            !organizationWarehouseCredentialsUuid
        ) {
            this.logger.debug(
                `Refreshing databricks M2M warehouse credentials from user uuid: ${userUuid}`,
            );
            const credentials = await this.refreshCredentials(
                args.warehouseConnection,
                userUuid,
            );
            return {
                ...args,
                warehouseConnection: {
                    ...args.warehouseConnection,
                    ...credentials,
                },
            };
        }

        return args;
    }

    // The project-update form sends masked oauthClientId / oauthClientSecret
    // (placeholder values), so merge them in from the saved project before
    // _resolveWarehouseClientCredentials runs the M2M token exchange. No-op for
    // anything that isn't Databricks M2M.
    // eslint-disable-next-line class-methods-use-this
    private mergeMissingDatabricksM2MSecrets<
        T extends { warehouseConnection: CreateWarehouseCredentials },
    >(
        data: T,
        savedProject: { warehouseConnection?: CreateWarehouseCredentials },
    ): T {
        if (
            data.warehouseConnection.type === WarehouseTypes.DATABRICKS &&
            data.warehouseConnection.authenticationType ===
                DatabricksAuthenticationType.OAUTH_M2M &&
            savedProject.warehouseConnection
        ) {
            return {
                ...data,
                warehouseConnection: ProjectModel.mergeMissingWarehouseSecrets(
                    data.warehouseConnection,
                    savedProject.warehouseConnection,
                ),
            };
        }
        return data;
    }

    // Extra security measure, we remove the "secrets" from the project/org credentials
    // and let the user override that token/password later on
    // eslint-disable-next-line class-methods-use-this
    private clearSecretsFromCredentials(
        credentials: CreateWarehouseCredentials,
    ): CreateWarehouseCredentials {
        switch (credentials.type) {
            case WarehouseTypes.SNOWFLAKE: {
                // Remove optional properties for snowflake OAuth
                const { refreshToken, token, ...rest } = credentials;
                return rest;
            }
            case WarehouseTypes.DATABRICKS: {
                const { refreshToken, token, personalAccessToken, ...rest } =
                    credentials;
                return rest;
            }
            case WarehouseTypes.BIGQUERY: {
                return {
                    ...credentials,
                    keyfileContents: {},
                };
            }
            case WarehouseTypes.POSTGRES:
            case WarehouseTypes.TRINO:
            case WarehouseTypes.CLICKHOUSE: {
                return {
                    ...credentials,
                    password: '',
                };
            }
            case WarehouseTypes.REDSHIFT: {
                return {
                    ...credentials,
                    user: '',
                    password: '',
                    accessKeyId: '',
                    secretAccessKey: '',
                    sessionToken: '',
                    assumeRoleArn: '',
                    assumeRoleExternalId: '',
                };
            }
            case WarehouseTypes.ATHENA: {
                return {
                    ...credentials,
                    accessKeyId: '',
                    secretAccessKey: '',
                };
            }
            case WarehouseTypes.DUCKDB: {
                if (
                    credentials.connectionType ===
                    DuckdbConnectionType.MOTHERDUCK
                ) {
                    return {
                        ...credentials,
                        token: '',
                    };
                }
                if (
                    credentials.connectionType === DuckdbConnectionType.EMBEDDED
                ) {
                    const clearedCredentials = {
                        ...credentials,
                    } as typeof credentials & { dataDirectory?: string };
                    delete clearedCredentials.dataDirectory;
                    return clearedCredentials;
                }
                const { catalog, dataPath } = credentials;
                const clearedCatalog =
                    catalog.type === 'postgres'
                        ? { ...catalog, user: '', password: '' }
                        : catalog;
                let clearedDataPath: typeof dataPath = dataPath;
                if (dataPath.type === 's3') {
                    clearedDataPath = {
                        ...dataPath,
                        accessKeyId: '',
                        secretAccessKey: '',
                    };
                } else if (dataPath.type === 'gcs') {
                    clearedDataPath = {
                        ...dataPath,
                        hmacKeyId: '',
                        hmacSecret: '',
                    };
                } else if (dataPath.type === 'azure') {
                    clearedDataPath = {
                        ...dataPath,
                        connectionString: '',
                        accountKey: '',
                    };
                }
                return {
                    ...credentials,
                    catalog: clearedCatalog,
                    dataPath: clearedDataPath,
                };
            }

            default:
                return assertUnreachable(
                    credentials,
                    `Unexpected warehouse type`,
                );
        }
    }

    // TODO: getWarehouseCredentials could be moved to a client WarehouseClientManager. However, this client shouldn't be using a model. Perhaps this information can be passed as a prop to the client so that other services can use the warehouse client credentials logic?
    /*
        This method is used when the user is making requests to the warehouse
        and .
        Then if `requireUserCredentials` flag is enabled, we load the tokens from `userWarehouseCredentials` and replace them with the credentials from the project.
        If `requireUserCredentials` flag is disabled, we just get access token if needed for the warehouse (like Snowflake on SSO).
    */
    protected async getWarehouseCredentials({
        projectUuid,
        userId,
        isRegisteredUser,
        isServiceAccount = false,
        preloadedOrgWarehouseCredentialsUuid,
    }: {
        projectUuid: string;
        userId: string;
        isRegisteredUser: boolean;
        isServiceAccount?: boolean;
        preloadedOrgWarehouseCredentialsUuid?: string | null;
    }) {
        // Use preloaded config if available, otherwise fetch it
        const organizationWarehouseCredentialsUuid =
            preloadedOrgWarehouseCredentialsUuid !== undefined
                ? preloadedOrgWarehouseCredentialsUuid
                : (
                      await this.projectModel.getProjectWarehouseConfig(
                          projectUuid,
                      )
                  ).organizationWarehouseCredentialsUuid;

        // Load base credentials from either organization or project table
        let credentials: CreateWarehouseCredentials =
            await this.projectModel.getWarehouseCredentialsForProject(
                projectUuid,
            );
        let userWarehouseCredentialsUuid: string | undefined;

        if (
            organizationWarehouseCredentialsUuid &&
            !credentials.requireUserCredentials
        ) {
            this.logger.debug(
                `Refreshing warehouse credentials from organization credentials`,
            );
            credentials = await this.refreshCredentialsAndPersistRotation(
                credentials, // This credentials are already loaded from organization
                userId,
                {
                    kind: 'organization',
                    organizationWarehouseCredentialsUuid,
                },
            );
        }

        // Service accounts cannot use personal warehouse credentials
        if (isServiceAccount && credentials.requireUserCredentials) {
            throw new ForbiddenError(
                'Service accounts cannot run queries when user credentials are required.',
            );
        }

        // Check if user has their own credentials for this project's warehouse type
        // Only fetch user credentials when:
        // 1. requireUserCredentials is enabled (user credentials are mandatory)
        // 2. Databricks warehouse (supports optional user OAuth credentials)
        const shouldFetchUserCredentials =
            credentials.requireUserCredentials ||
            credentials.type === WarehouseTypes.DATABRICKS;

        if (isRegisteredUser) {
            // Fetch user credentials only when needed (for performance)
            const userWarehouseCredentials = shouldFetchUserCredentials
                ? await this.userWarehouseCredentialsModel.findForProjectWithSecrets(
                      projectUuid,
                      userId,
                      credentials.type,
                  )
                : undefined;

            // Skip user credentials if the serverHostName doesn't match the project
            const userCredHost =
                userWarehouseCredentials?.credentials.type ===
                    WarehouseTypes.DATABRICKS &&
                'serverHostName' in userWarehouseCredentials.credentials
                    ? normalizeDatabricksHostLenient(
                          userWarehouseCredentials.credentials.serverHostName,
                      )
                    : undefined;
            const projectHost =
                credentials.type === WarehouseTypes.DATABRICKS
                    ? normalizeDatabricksHostLenient(credentials.serverHostName)
                    : undefined;
            const hostMismatch =
                userCredHost && projectHost && userCredHost !== projectHost;

            if (userWarehouseCredentials && !hostMismatch) {
                credentials = this.clearSecretsFromCredentials(credentials);

                // User has credentials - use them
                credentials = {
                    ...credentials,
                    ...userWarehouseCredentials.credentials,
                } as CreateWarehouseCredentials; // force type as typescript doesn't know the types match

                this.logger.debug(
                    `Using user warehouse credentials for user ${userId}`,
                );
                credentials = await this.refreshCredentialsAndPersistRotation(
                    credentials,
                    userId,
                    {
                        kind: 'user',
                        userWarehouseCredentialsUuid:
                            userWarehouseCredentials.uuid,
                    },
                );
                userWarehouseCredentialsUuid = userWarehouseCredentials.uuid;
            } else if (credentials.requireUserCredentials) {
                if (credentials.type === WarehouseTypes.DATABRICKS) {
                    throw new DatabricksTokenError(
                        'Please authenticate to access Databricks',
                    );
                }
                throw new MissingWarehouseCredentialsError(
                    "You don't have warehouse credentials set up for this project. Add them under 'User settings' → 'My warehouse connections', or refresh the page to sign in again.",
                );
            } else if (!organizationWarehouseCredentialsUuid) {
                // No user credentials, no org credentials, refresh project credentials
                this.logger.debug(
                    `Refreshing warehouse credentials for session user ${userId}`,
                );
                credentials = await this.refreshCredentialsAndPersistRotation(
                    credentials,
                    userId,
                    { kind: 'project', projectUuid },
                );
            }
        } else if (credentials.requireUserCredentials) {
            // Embedded users cannot use personal warehouse credentials
            throw new ForbiddenError(
                'Embedded users cannot use personal warehouse credentials',
            );
        } else if (!organizationWarehouseCredentialsUuid) {
            // Refresh project credentials for the embed user. Required for auth
            // types that mint a short-lived token from project-level secrets
            // (e.g. Databricks oauth_m2m exchanges client_id+secret for a token).
            this.logger.debug(
                `Refreshing warehouse credentials for embed user ${userId}`,
            );
            credentials = await this.refreshCredentialsAndPersistRotation(
                credentials,
                userId,
                { kind: 'project', projectUuid },
            );
        }

        return {
            ...credentials,
            userWarehouseCredentialsUuid,
        };
    }

    /**
     * Resolves warehouse credentials for an embed (anonymous JWT) request.
     * Same shape as `getWarehouseCredentials` but tailored for embed callers
     * and exposed as a public method so EmbedService can reuse the refresh path.
     */
    async getWarehouseCredentialsForEmbed({
        projectUuid,
        account,
    }: {
        projectUuid: string;
        account: AnonymousAccount;
    }) {
        return this.getWarehouseCredentials({
            projectUuid,
            userId: account.user.id,
            isRegisteredUser: false,
        });
    }

    async _getWarehouseClient(
        projectUuid: string,
        credentials: CreateWarehouseCredentials,
        overrides?: {
            snowflakeVirtualWarehouse?: string;
            databricksCompute?: string;
        },
    ): Promise<{
        warehouseClient: WarehouseClient;
        sshTunnel: SshTunnel<CreateWarehouseCredentials>;
        tunnelConnectMs: number | null;
    }> {
        Sentry.setTag('warehouse.type', credentials.type);
        // Setup SSH tunnel for client (user needs to close this)
        const sshTunnel = new SshTunnel(credentials);
        const usedSshTunnel =
            'useSshTunnel' in credentials && !!credentials.useSshTunnel;
        const tunnelStart = performance.now();
        const warehouseSshCredentials = await sshTunnel.connect();
        const tunnelConnectMs = usedSshTunnel
            ? performance.now() - tunnelStart
            : null;

        const { snowflakeVirtualWarehouse, databricksCompute } =
            overrides || {};

        const cacheKey = `${projectUuid}${snowflakeVirtualWarehouse || ''}${
            databricksCompute || ''
        }`;
        // Check cache for existing client (always false if ssh tunnel was connected)
        const existingClient = this.warehouseClients[cacheKey] as
            | (typeof this.warehouseClients)[string]
            | undefined;
        if (
            existingClient &&
            deepEqual(existingClient.credentials, warehouseSshCredentials)
        ) {
            // if existing client uses identical credentials, use it
            return {
                warehouseClient: existingClient,
                sshTunnel,
                tunnelConnectMs,
            };
        }
        // otherwise create a new client and cache for future use
        const getSnowflakeWarehouse = (
            snowflakeCredentials: CreateSnowflakeCredentials,
        ): string => {
            if (snowflakeCredentials.override) {
                this.logger.debug(
                    `Overriding snowflake warehouse ${snowflakeVirtualWarehouse} with ${snowflakeCredentials.warehouse}`,
                );
                return snowflakeCredentials.warehouse;
            }
            return snowflakeVirtualWarehouse || snowflakeCredentials.warehouse;
        };

        const credsType = warehouseSshCredentials.type;
        let credentialsWithOverrides: CreateWarehouseCredentials;

        switch (credsType) {
            case WarehouseTypes.SNOWFLAKE:
                credentialsWithOverrides = {
                    ...warehouseSshCredentials,
                    warehouse: getSnowflakeWarehouse(warehouseSshCredentials),
                };
                break;
            case WarehouseTypes.DATABRICKS:
                const getDatabricksHttpPath = (
                    databricksCredentials: CreateDatabricksCredentials,
                ): string => {
                    if (databricksCredentials.compute) {
                        return (
                            databricksCredentials.compute.find(
                                (compute) => compute.name === databricksCompute,
                            )?.httpPath ?? databricksCredentials.httpPath
                        );
                    }
                    return databricksCredentials.httpPath;
                };

                credentialsWithOverrides = {
                    ...warehouseSshCredentials,
                    httpPath: getDatabricksHttpPath(warehouseSshCredentials),
                };
                break;
            case WarehouseTypes.REDSHIFT:
            case WarehouseTypes.POSTGRES:
            case WarehouseTypes.BIGQUERY:
            case WarehouseTypes.TRINO:
            case WarehouseTypes.CLICKHOUSE:
            case WarehouseTypes.ATHENA:
            case WarehouseTypes.DUCKDB:
                credentialsWithOverrides = warehouseSshCredentials;
                break;
            default:
                return assertUnreachable(
                    credsType,
                    `Unknown warehouse type: ${credsType}`,
                );
        }

        const client = this.projectModel.getWarehouseClientFromCredentials(
            credentialsWithOverrides,
        );
        this.warehouseClients[cacheKey] = client;
        return { warehouseClient: client, sshTunnel, tunnelConnectMs };
    }

    private async syncPreAggregateDefinitionsRegistry(
        projectUuid: string,
    ): Promise<void> {
        const exploresByUuid =
            await this.projectModel.getAllExploresFromCache(projectUuid);

        const preAggregateExploreUuidByName = new Map<string, string>(
            Object.entries(exploresByUuid)
                .filter(
                    ([, explore]) =>
                        !isExploreError(explore) &&
                        explore.type === ExploreType.PRE_AGGREGATE,
                )
                .map(([cachedExploreUuid, explore]) => [
                    explore.name,
                    cachedExploreUuid,
                ]),
        );

        const definitionRows: DbPreAggregateDefinitionIn[] = [];

        Object.entries(exploresByUuid).forEach(
            ([sourceCachedExploreUuid, sourceExplore]) => {
                if (
                    isExploreError(sourceExplore) ||
                    !sourceExplore.preAggregates ||
                    sourceExplore.preAggregates.length === 0
                ) {
                    return;
                }

                sourceExplore.preAggregates.forEach(
                    (preAggregateDefinition) => {
                        const preAggregateExploreName =
                            getPreAggregateExploreName(
                                sourceExplore.name,
                                preAggregateDefinition.name,
                            );
                        const preAggCachedExploreUuid =
                            preAggregateExploreUuidByName.get(
                                preAggregateExploreName,
                            );

                        if (!preAggCachedExploreUuid) {
                            this.logger.warn(
                                `Skipping pre-aggregate definition "${preAggregateDefinition.name}" for source explore "${sourceExplore.name}" in project ${projectUuid}: generated pre-aggregate explore "${preAggregateExploreName}" not found in cache`,
                            );
                            return;
                        }

                        let materializationMetricQuery = null;
                        let materializationQueryError = null;

                        try {
                            materializationMetricQuery =
                                buildMaterializationMetricQuery({
                                    sourceExplore,
                                    preAggregateDef: preAggregateDefinition,
                                    materializationConfig: {
                                        maxRows:
                                            this.lightdashConfig.preAggregates
                                                .materializationMaxRows,
                                    },
                                });
                        } catch (error) {
                            materializationQueryError = getErrorMessage(error);
                        }

                        definitionRows.push({
                            project_uuid: projectUuid,
                            source_cached_explore_uuid: sourceCachedExploreUuid,
                            pre_agg_cached_explore_uuid:
                                preAggCachedExploreUuid,
                            pre_aggregate_definition: preAggregateDefinition,
                            materialization_metric_query:
                                materializationMetricQuery,
                            materialization_query_error:
                                materializationQueryError,
                            refresh_cron:
                                preAggregateDefinition.refresh?.cron ?? null,
                        });
                    },
                );
            },
        );

        await this.preAggregateModel.upsertPreAggregateDefinitions(
            definitionRows,
        );

        const invalidDefinitionsCount = definitionRows.filter(
            (row) => row.materialization_metric_query === null,
        ).length;
        this.logger.info(
            `Upserted ${definitionRows.length} pre-aggregate definition registry row(s) for project ${projectUuid}`,
            {
                invalidDefinitionsCount,
            },
        );
    }

    private async syncAndEnqueuePreAggregateMaterializations(args: {
        projectUuid: string;
        organizationUuid: string;
        userUuid: string;
        skipMaterialization: boolean;
    }): Promise<void> {
        try {
            await this.syncPreAggregateDefinitionsRegistry(args.projectUuid);

            if (args.skipMaterialization) {
                this.logger.info(
                    `Skipping pre-aggregate materialization enqueue for preview project ${args.projectUuid}`,
                );
                return;
            }

            const preAggregateDefinitions =
                await this.preAggregateModel.getPreAggregateDefinitionsForProject(
                    args.projectUuid,
                );
            const materializableDefinitions = preAggregateDefinitions.filter(
                (definition) => definition.materializationMetricQuery !== null,
            );

            if (materializableDefinitions.length > 0) {
                await Promise.all(
                    materializableDefinitions.map((definition) =>
                        this.schedulerClient.materializePreAggregate({
                            organizationUuid: args.organizationUuid,
                            projectUuid: args.projectUuid,
                            userUuid: args.userUuid,
                            preAggregateDefinitionUuid:
                                definition.preAggregateDefinitionUuid,
                            trigger: 'compile',
                        }),
                    ),
                );

                const { schedulerTimezone } = await this.projectModel.get(
                    args.projectUuid,
                );

                await this.schedulerClient.schedulePreAggregateCronJobs(
                    materializableDefinitions
                        .filter((definition) => definition.refreshCron !== null)
                        .map((definition) => ({
                            organizationUuid: args.organizationUuid,
                            projectUuid: args.projectUuid,
                            createdByUserUuid: args.userUuid,
                            preAggregateDefinitionUuid:
                                definition.preAggregateDefinitionUuid,
                            refreshCron: definition.refreshCron!,
                            schedulerTimezone,
                            preAggExploreName: undefined,
                        })),
                    new Date(),
                );
            }
        } catch (error) {
            this.logger.error(
                `Failed to sync/enqueue pre-aggregate materializations for project ${args.projectUuid}: ${getErrorMessage(
                    error,
                )}`,
            );
        }
    }

    async saveExploresToCacheAndIndexCatalog(args: {
        userUuid: string;
        projectUuid: string;
        explores: (Explore | ExploreError)[];
        compilationSource: CompilationSource;
        jobUuid?: string | null;
        requestMethod?: string | null;
        projectConfigDefaults?: ProjectDefaults;
        cliVersion?: string | null;
    }) {
        const {
            userUuid,
            projectUuid,
            explores,
            compilationSource,
            jobUuid,
            requestMethod,
            projectConfigDefaults,
            cliVersion,
        } = args;
        // We delete the explores when saving to cache which cascades to the catalog
        // So we need to get the current tagged catalog items before deleting the explores (to do a best effort re-tag) and icons
        const prevCatalogItemsWithTags =
            await this.catalogModel.getCatalogItemsWithTags(projectUuid, {
                onlyTagged: true, // We only need the tagged catalog items
                includeYamlTags: false, // we don't need the yaml tags as they are being recreated by the indexCatalog job
            });

        const prevCatalogItemsWithIcons =
            await this.catalogModel.getCatalogItemsWithIcons(projectUuid);

        const prevMetricTreeEdges =
            await this.catalogModel.getAllMetricsTreeEdges(projectUuid);

        const prevMetricsTreeNodes =
            await this.catalogModel.getAllMetricsTreeNodes(projectUuid);

        // Best-effort: capture the explore names already in cache so we can
        // emit an added/removed diff after the new explores are written
        // (PROD-5931). Wrapped because this fetch must never interrupt the
        // compile flow if the DB has a transient error.
        let previousExploreNames: string[] | null = null;
        try {
            previousExploreNames =
                await this.projectModel.getCachedExploreNames(projectUuid);
        } catch (err) {
            this.logger.warn('compile.completed previous-names fetch failed', {
                projectUuid,
                err: err instanceof Error ? err.message : String(err),
            });
        }

        const { cachedExploreUuids } =
            await this.projectModel.saveExploresToCache(projectUuid, explores);
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        this.logger.info(
            `Saved ${cachedExploreUuids.length} explores to cache for project ${projectUuid}`,
        );

        // Wide observability event for explore lifecycle. Pair with the
        // `dashboard.loaded` event to correlate "table removed at T1" with
        // "dashboard loaded with stale reference at T2".
        try {
            const NAME_SAMPLE_CAP = 50;
            const newNames = explores.map((explore) => explore.name);
            const previousNameSet = new Set(previousExploreNames ?? []);
            const newNameSet = new Set(newNames);
            const removed = (previousExploreNames ?? []).filter(
                (name) => !newNameSet.has(name),
            );
            const added = newNames.filter((name) => !previousNameSet.has(name));

            this.logger.info('compile.completed', {
                projectUuid,
                organizationUuid,
                jobUuid: jobUuid ?? null,
                compilationSource,
                requestMethod: requestMethod ?? null,
                cliVersion: cliVersion ?? null,
                // null distinguishes "fetch failed" from "no previous explores"
                previousExploreCount: previousExploreNames?.length ?? null,
                newExploreCount: newNames.length,
                addedExploreCount:
                    previousExploreNames === null ? null : added.length,
                removedExploreCount:
                    previousExploreNames === null ? null : removed.length,
                addedExploreNames:
                    previousExploreNames === null
                        ? null
                        : added.slice(0, NAME_SAMPLE_CAP),
                removedExploreNames:
                    previousExploreNames === null
                        ? null
                        : removed.slice(0, NAME_SAMPLE_CAP),
            });
        } catch (err) {
            this.logger.warn('compile.completed log failed', {
                projectUuid,
                err: err instanceof Error ? err.message : String(err),
            });
        }

        const compilationReport = calculateCompilationReport({ explores });
        const project = await this.projectModel.get(projectUuid);

        Logger.info('compile.case_sensitive_resolution', {
            projectUuid,
            organizationUuid,
            compilationSource,
            cliVersion: cliVersion ?? null,
            projectDefault: projectConfigDefaults?.case_sensitive ?? null,
            exploreCount: explores.length,
            exploresWithFlag: explores
                .filter((e) => e.caseSensitive !== undefined)
                .map((e) => ({ name: e.name, value: e.caseSensitive })),
            dimensionsWithFlag: explores.flatMap((e) =>
                Object.entries(e.tables ?? {}).flatMap(([t, tbl]) =>
                    Object.values(tbl.dimensions ?? {})
                        .filter((d) => d.caseSensitive !== undefined)
                        .map((d) => ({
                            table: t,
                            name: d.name,
                            value: d.caseSensitive,
                        })),
                ),
            ),
        });

        await this.projectCompileLogModel.insert({
            projectUuid,
            jobUuid: jobUuid ?? null,
            userUuid,
            organizationUuid,
            compilationSource,
            dbtConnectionType: project.dbtConnection.type,
            requestMethod: requestMethod ?? null,
            warehouseType: project.warehouseConnection?.type ?? null,
            report: compilationReport,
        });

        this.logger.info(
            `Inserted compilation log for project ${projectUuid}: ${compilationReport.totalExploresCount} explores, ${compilationReport.errorExploresCount} errors`,
        );

        const indexCatalogJob = await this.schedulerClient.indexCatalog({
            projectUuid,
            userUuid,
            organizationUuid,
            prevCatalogItemsWithTags,
            prevCatalogItemsWithIcons,
            prevMetricTreeEdges,
            prevMetricsTreeNodes,
        });

        if (this.lightdashConfig.preAggregates.enabled) {
            await this.syncAndEnqueuePreAggregateMaterializations({
                projectUuid,
                organizationUuid,
                userUuid,
                skipMaterialization: project.type === ProjectType.PREVIEW,
            });
        }

        return indexCatalogJob;
    }

    async getProject(projectUuid: string, account: Account): Promise<Project> {
        const project = await this.projectModel.get(projectUuid);
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        return project;
    }

    private async getUpstreamProjectUuid(
        projectUuid: string,
        account: Account,
    ): Promise<string> {
        const { organizationUuid, upstreamProjectUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        if (!upstreamProjectUuid) {
            throw new ParameterError(
                'Project is not a preview and has no upstream project to compare against',
            );
        }
        return upstreamProjectUuid;
    }

    /**
     * Field-level diff of a preview against its upstream, computed in SQL over
     * `catalog_search`. Detects added/removed fields and label changes; misses
     * SQL-only changes.
     */
    async getUpstreamDiff(
        projectUuid: string,
        account: Account,
    ): Promise<ApiUpstreamDiffResults> {
        const upstreamProjectUuid = await this.getUpstreamProjectUuid(
            projectUuid,
            account,
        );
        const fields = await this.catalogModel.getUpstreamDiff(
            projectUuid,
            upstreamProjectUuid,
        );
        return { upstreamProjectUuid, fields };
    }

    async getDatabricksOAuthConfigForProject(
        projectUuid: string,
        account: Account,
    ): Promise<{
        projectName: string;
        serverHostName: string;
        oauthClientId?: string;
        oauthClientSecret?: string;
    }> {
        const project = await this.getProject(projectUuid, account);
        const credentials =
            await this.projectModel.getWarehouseCredentialsForProject(
                projectUuid,
            );
        if (credentials.type !== WarehouseTypes.DATABRICKS) {
            throw new ParameterError(
                'Project is not configured with Databricks credentials',
            );
        }
        return {
            projectName: project.name,
            serverHostName: credentials.serverHostName,
            oauthClientId: credentials.oauthClientId,
            oauthClientSecret: credentials.oauthClientSecret,
        };
    }

    async createWithoutCompile(
        user: SessionUser,
        data: CreateProjectOptionalCredentials,
        method: RequestMethod,
        internalProvisioning?: { source: 'playground' },
    ): Promise<ApiCreateProjectResults> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        ProjectService.assertEmbeddedCredentialsAreInternal(
            data.warehouseConnection,
            internalProvisioning,
        );
        ProjectService.assertPersistableSnowflakeAuthentication(
            data.warehouseConnection,
        );

        await this.validateProjectCreationPermissions(user, data);

        const newProjectData = data;
        ProjectService.validateDbtEnvironmentVariables(
            newProjectData.dbtConnection,
        );

        // If type preview and has upstream project, we first link the preview to the same organization warehouse credentials (if exists)
        if (
            newProjectData.type === ProjectType.PREVIEW &&
            newProjectData.upstreamProjectUuid
        ) {
            const upstreamProject = data.upstreamProjectUuid
                ? await this.projectModel.get(data.upstreamProjectUuid)
                : undefined;
            newProjectData.organizationWarehouseCredentialsUuid =
                upstreamProject?.organizationWarehouseCredentialsUuid;
        }
        if (
            newProjectData.type === ProjectType.PREVIEW &&
            data.copyWarehouseConnectionFromUpstreamProject &&
            data.upstreamProjectUuid
        ) {
            newProjectData.warehouseConnection =
                await this.projectModel.getWarehouseCredentialsForProject(
                    data.upstreamProjectUuid,
                );
        } else if (
            newProjectData.type === ProjectType.PREVIEW &&
            data.upstreamProjectUuid &&
            data.warehouseConnection &&
            !data.copyWarehouseConnectionFromUpstreamProject
        ) {
            // When creating a preview from CLI with credentials, merge with upstream credentials
            // to preserve advanced settings like requireUserCredentials
            const upstreamCredentials =
                await this.projectModel.getWarehouseCredentialsForProject(
                    data.upstreamProjectUuid,
                );
            if (upstreamCredentials) {
                newProjectData.warehouseConnection = mergeWarehouseCredentials(
                    upstreamCredentials,
                    data.warehouseConnection,
                );
            }
        }

        // Re-check after the copy/merge above: the guard at the top only saw
        // the credentials the caller sent, and a preview can inherit embedded
        // ones from its upstream project without ever naming them.
        ProjectService.assertEmbeddedCredentialsAreInternal(
            newProjectData.warehouseConnection,
            internalProvisioning,
        );

        const createProject: CreateProjectOptionalCredentials =
            hasWarehouseCredentials(newProjectData)
                ? await this._resolveWarehouseClientCredentials(
                      newProjectData,
                      user.userUuid,
                      user.organizationUuid,
                  )
                : newProjectData;

        const projectUuid =
            await this.projectModel.createWithOptionalCredentials(
                user.userUuid,
                user.organizationUuid,
                createProject,
                await this.getPreviewExpiresAt(
                    createProject.type,
                    createProject.upstreamProjectUuid,
                    createProject.expiresInHours,
                ),
                internalProvisioning?.source,
            );

        const onboardingFlow = await this.getOnboardingFlow(user);
        // Do not give this user admin permissions on this new project,
        // as it could be an interactive viewer creating a preview
        // and we don't want to allow users to acces sql runner or leak admin data
        this.analytics.track({
            event: 'project.created',
            userId: user.userUuid,
            properties: ProjectService.getAnalyticProperties(
                createProject,
                projectUuid,
                user,
                method,
                onboardingFlow,
            ),
        });

        await this.runPostProjectCreationProvisioning(
            user,
            projectUuid,
            createProject.type,
        );

        // For preview projects: if the upstream requires user warehouse credentials
        // and the request includes CLI-obtained tokens, create user warehouse
        // credentials so the user doesn't have to re-authenticate in the UI
        if (
            createProject.type === ProjectType.PREVIEW &&
            createProject.warehouseConnection?.requireUserCredentials
        ) {
            try {
                const { warehouseConnection } = createProject;
                const warehouseType = warehouseConnection.type;
                switch (warehouseType) {
                    case WarehouseTypes.DATABRICKS: {
                        if (!warehouseConnection.refreshToken) break;
                        const userWarehouseCredentialsUuid =
                            await this.userWarehouseCredentialsModel.create(
                                user.userUuid,
                                {
                                    name: `Databricks (${warehouseConnection.serverHostName || createProject.name})`,
                                    credentials: {
                                        type: WarehouseTypes.DATABRICKS,
                                        authenticationType:
                                            DatabricksAuthenticationType.OAUTH_U2M,
                                        refreshToken:
                                            warehouseConnection.refreshToken,
                                        oauthClientId:
                                            warehouseConnection.oauthClientId,
                                    },
                                },
                                projectUuid,
                            );
                        await this.userWarehouseCredentialsModel.upsertUserCredentialsPreference(
                            user.userUuid,
                            projectUuid,
                            userWarehouseCredentialsUuid,
                        );
                        this.logger.info(
                            `Created user warehouse credentials for Databricks on project ${projectUuid}`,
                        );
                        break;
                    }
                    case WarehouseTypes.BIGQUERY:
                    case WarehouseTypes.SNOWFLAKE:
                    case WarehouseTypes.POSTGRES:
                    case WarehouseTypes.REDSHIFT:
                    case WarehouseTypes.TRINO:
                    case WarehouseTypes.CLICKHOUSE:
                    case WarehouseTypes.ATHENA:
                    case WarehouseTypes.DUCKDB:
                        break;
                    default:
                        assertUnreachable(
                            warehouseType,
                            `Unknown warehouse type for user credentials`,
                        );
                }
            } catch (e) {
                this.logger.error(
                    `Failed to create user warehouse credentials: ${e instanceof Error ? e.message : String(e)}`,
                );
            }
        }

        let hasContentCopy = false;
        let accessCopyError: string | undefined;
        let contentCopyError: string | undefined;

        if (data.type === ProjectType.PREVIEW && data.upstreamProjectUuid) {
            try {
                await this.copyUserAccessOnPreview(
                    data.upstreamProjectUuid,
                    projectUuid,
                );
            } catch (e) {
                Sentry.captureException(e);
                accessCopyError = getErrorMessage(e);
                this.logger.error(
                    `Unable to copy access on preview from ${data.upstreamProjectUuid} to ${projectUuid}`,
                    {
                        error: accessCopyError,
                        stack: e instanceof Error ? e.stack : undefined,
                        errorData:
                            e instanceof LightdashError ? e.data : undefined,
                    },
                );
            }

            if (data.copyContent ?? true) {
                try {
                    await this.copyContentOnPreview(
                        data.upstreamProjectUuid,
                        projectUuid,
                        user,
                    );

                    hasContentCopy = true;
                } catch (e) {
                    Sentry.captureException(e);
                    contentCopyError = getErrorMessage(e);
                    this.logger.error(
                        `Unable to copy content on preview from ${data.upstreamProjectUuid} to ${projectUuid}`,
                        {
                            error: contentCopyError,
                            stack: e instanceof Error ? e.stack : undefined,
                            errorData:
                                e instanceof LightdashError
                                    ? e.data
                                    : undefined,
                        },
                    );
                }
            }
        }

        if (
            data.tableConfiguration === CreateProjectTableConfiguration.PROD &&
            data.upstreamProjectUuid
        ) {
            try {
                const prodTablesConfiguration =
                    await this.projectModel.getTablesConfiguration(
                        data.upstreamProjectUuid,
                    );
                this.logger.info(
                    `Copying table configuration to preview project ${projectUuid} from prod: ${JSON.stringify(
                        data.upstreamProjectUuid,
                    )}`,
                );
                await this.projectModel.updateTablesConfiguration(
                    projectUuid,
                    prodTablesConfiguration,
                );
            } catch (e) {
                Sentry.captureException(e);
                this.logger.error(
                    `Unable to copy table configuration on preview ${e}`,
                    {
                        error: e instanceof Error ? e.message : String(e),
                        stack: e instanceof Error ? e.stack : undefined,
                        errorData:
                            e instanceof LightdashError ? e.data : undefined,
                    },
                );
            }
        }

        const project = await this.projectModel.get(projectUuid);

        return {
            hasContentCopy,
            project,
            accessCopyError,
            contentCopyError,
        };
    }

    async scheduleCreate(
        user: SessionUser,
        data: CreateProject,
        method: RequestMethod,
    ): Promise<{ jobUuid: string }> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        ProjectService.assertEmbeddedCredentialsAreInternal(
            data.warehouseConnection,
        );
        ProjectService.assertPersistableSnowflakeAuthentication(
            data.warehouseConnection,
        );

        await this.validateProjectCreationPermissions(user, data);
        ProjectService.validateDbtEnvironmentVariables(data.dbtConnection);

        let encryptedData: string;
        try {
            encryptedData = this.encryptionUtil
                .encrypt(JSON.stringify(data))
                .toString('base64');
        } catch {
            throw new UnexpectedServerError('Failed to load project data');
        }

        const job: CreateJob = {
            jobUuid: uuidv4(),
            jobType: JobType.CREATE_PROJECT,
            jobStatus: JobStatusType.STARTED,
            projectUuid: undefined,
            userUuid: user.userUuid,
            steps: [
                { stepType: JobStepType.TESTING_ADAPTOR },
                ...(data.dbtConnection.type === DbtProjectType.NONE
                    ? []
                    : [{ stepType: JobStepType.COMPILING }]),
                { stepType: JobStepType.CREATING_PROJECT },
            ],
        };

        // create legacy job steps that UI expects
        await this.jobModel.create(job);
        // schedule job
        await this.schedulerClient.createProjectWithCompile({
            createdByUserUuid: user.userUuid,
            isPreview: data.type === ProjectType.PREVIEW,
            organizationUuid: user.organizationUuid,
            requestMethod: method,
            jobUuid: job.jobUuid,
            data: encryptedData,
            userUuid: user.userUuid,
            projectUuid: undefined,
        });
        return { jobUuid: job.jobUuid };
    }

    static PREVIEW_PROJECT_FALLBACK_TTL_HOURS = 720;

    async getPreviewExpiresAt(
        type: ProjectType,
        upstreamProjectUuid: string | undefined,
        expiresInHours?: number,
    ): Promise<Date | null> {
        if (type !== ProjectType.PREVIEW) return null;

        let defaultHours = ProjectService.PREVIEW_PROJECT_FALLBACK_TTL_HOURS;
        let maxHours: number | null = null;
        if (upstreamProjectUuid) {
            const settings =
                await this.projectModel.getPreviewExpirationSettings(
                    upstreamProjectUuid,
                );
            defaultHours = settings.defaultPreviewExpirationHours;
            maxHours = settings.maxPreviewExpirationHours;
        }

        const requestedHours = expiresInHours
            ? Number(expiresInHours)
            : defaultHours;
        const clampedHours =
            maxHours !== null
                ? Math.min(requestedHours, maxHours)
                : requestedHours;
        return new Date(Date.now() + clampedHours * 60 * 60 * 1000);
    }

    static getAnalyticProperties(
        createProject: Pick<
            CreateProjectOptionalCredentials,
            'warehouseConnection' | 'name' | 'dbtConnection' | 'type'
        >,
        projectUuid: string,
        user: SessionUser,
        method: RequestMethod,
        onboardingFlow: OnboardingFlow,
    ): ProjectEvent['properties'] {
        const warehouseType = createProject.warehouseConnection?.type;
        const authenticationType =
            warehouseType === WarehouseTypes.BIGQUERY ||
            warehouseType === WarehouseTypes.SNOWFLAKE ||
            warehouseType === WarehouseTypes.REDSHIFT
                ? (createProject.warehouseConnection?.authenticationType ??
                  (warehouseType === WarehouseTypes.REDSHIFT
                      ? RedshiftAuthenticationType.PASSWORD
                      : undefined))
                : undefined;
        return {
            projectName: createProject.name,
            projectId: projectUuid,
            projectType: createProject.dbtConnection.type,
            warehouseConnectionType: createProject.warehouseConnection?.type,
            organizationId: user.organizationUuid!,
            dbtConnectionType: createProject.dbtConnection.type,
            isPreview: createProject.type === ProjectType.PREVIEW,
            method,
            authenticationType,
            requireUserCredentials:
                createProject.warehouseConnection?.requireUserCredentials,
            onboardingFlow,
        };
    }

    async _create(
        user: SessionUser,
        data: CreateProject,
        jobUuid: string,
        method: RequestMethod,
    ): Promise<{ projectUuid: string }> {
        try {
            if (!isUserWithOrg(user)) {
                throw new ForbiddenError('User is not part of an organization');
            }
            const createProject = await this._resolveWarehouseClientCredentials(
                data,
                user.userUuid,
                user.organizationUuid,
            );

            await this.jobModel.update(jobUuid, {
                jobStatus: JobStatusType.RUNNING,
            });
            const { adapter, sshTunnel } = await this.jobModel.tryJobStep(
                jobUuid,
                JobStepType.TESTING_ADAPTOR,
                async () =>
                    this.testProjectAdapter(
                        createProject,
                        user,
                        'project_create',
                        method,
                    ),
            );

            const { explores, lightdashProjectConfig, projectContext } =
                createProject.dbtConnection.type === DbtProjectType.NONE
                    ? await (async () => {
                          try {
                              return {
                                  explores: [],
                                  lightdashProjectConfig:
                                      await adapter.getLightdashProjectConfig(
                                          undefined,
                                      ),
                                  projectContext: [],
                              };
                          } finally {
                              await adapter.destroy();
                              await sshTunnel.disconnect();
                          }
                      })()
                    : await this.jobModel.tryJobStep(
                          jobUuid,
                          JobStepType.COMPILING,
                          async () => {
                              try {
                                  // There's no project yet, so we don't track
                                  const trackingParams = undefined;

                                  const compiledExplores =
                                      await adapter.compileAllExplores(
                                          trackingParams,
                                          false, // loadSources
                                          this.lightdashConfig
                                              .partialCompilation.enabled,
                                      );
                                  const compiledProjectConfig =
                                      await adapter.getLightdashProjectConfig(
                                          trackingParams,
                                      );
                                  const compiledProjectContext =
                                      await this.getProjectContextFromAdapter({
                                          adapter,
                                          user,
                                          organizationUuid:
                                              user.organizationUuid,
                                      });

                                  return {
                                      explores: compiledExplores,
                                      lightdashProjectConfig:
                                          compiledProjectConfig,
                                      projectContext: compiledProjectContext,
                                  };
                              } finally {
                                  await adapter.destroy();
                                  await sshTunnel.disconnect();
                              }
                          },
                      );

            const projectUuid = await this.jobModel.tryJobStep(
                jobUuid,
                JobStepType.CREATING_PROJECT,
                async () => {
                    const newProjectUuid = await this.projectModel.create(
                        user.userUuid,
                        user.organizationUuid,
                        createProject,
                        await this.getPreviewExpiresAt(
                            createProject.type,
                            createProject.upstreamProjectUuid,
                            createProject.expiresInHours,
                        ),
                    );
                    // Give admin user permissions to user who created this project even if he is an admin
                    if (user.email) {
                        await this.projectModel.createProjectAccess(
                            newProjectUuid,
                            user.email,
                            ProjectMemberRole.ADMIN,
                        );
                    }

                    await this.replaceYamlTagsWithoutPermissionCheck(
                        user,
                        user.organizationUuid,
                        newProjectUuid,
                        // Create util to generate categories from lightdashProjectConfig - this is used as well in deploy.ts
                        Object.entries(
                            lightdashProjectConfig.spotlight?.categories || {},
                        ).map(([key, category]) => ({
                            yamlReference: key,
                            name: category.label,
                            color: category.color ?? 'gray',
                        })),
                    );
                    await this.replaceProjectParameters({
                        user,
                        projectUuid: newProjectUuid,
                        parameters: lightdashProjectConfig.parameters,
                    });
                    await this.projectModel.setTableGroups(
                        newProjectUuid,
                        lightdashProjectConfig.table_groups,
                    );
                    // Mirrors CLI deploy semantics: only overwrite stored
                    // defaults when the config file defines them
                    if (lightdashProjectConfig.defaults) {
                        await this.projectModel.updateProjectDefaults(
                            newProjectUuid,
                            lightdashProjectConfig.defaults,
                        );
                    }
                    await this.replaceProjectContext(
                        newProjectUuid,
                        projectContext,
                    );
                    if (explores.length > 0) {
                        await this.saveExploresToCacheAndIndexCatalog({
                            userUuid: user.userUuid,
                            projectUuid: newProjectUuid,
                            explores,
                            compilationSource: 'create_project',
                            jobUuid,
                            requestMethod: method,
                            projectConfigDefaults:
                                lightdashProjectConfig.defaults,
                        });
                    }
                    return newProjectUuid;
                },
            );

            await this.jobModel.update(jobUuid, {
                jobStatus: JobStatusType.DONE,
                jobResults: {
                    projectUuid,
                },
            });
            const onboardingFlow = await this.getOnboardingFlow(user);
            this.analytics.track({
                event: 'project.created',
                userId: user.userUuid,
                properties: ProjectService.getAnalyticProperties(
                    createProject,
                    projectUuid,
                    user,
                    method,
                    onboardingFlow,
                ),
            });

            await this.runPostProjectCreationProvisioning(
                user,
                projectUuid,
                createProject.type,
            );

            return { projectUuid };
        } catch (error) {
            await this._markJobAsFailed(jobUuid);
            if (!(error instanceof LightdashError)) {
                Sentry.captureException(error);
            }
            this.logger.error(`Error running background job: ${error}`);
            throw error;
        }
    }

    async _markJobAsFailed(jobUuid: string) {
        await this.jobModel.setPendingJobsToSkipped(jobUuid);
        await this.jobModel.update(jobUuid, {
            jobStatus: JobStatusType.ERROR,
        });
    }

    async setExplores(
        user: SessionUser,
        projectUuid: string,
        explores: (Explore | ExploreError)[],
        cliVersion?: string | null,
    ): Promise<ApiDeployExploresResults> {
        const project =
            await this.projectModel.getWithSensitiveFields(projectUuid);

        const auditedAbility = this.createAuditedAbility(user);

        // manage:DeployProject for non-preview projects (restrictable via custom roles)
        // manage:DeployProject@self for preview projects created by the user
        if (
            auditedAbility.cannot(
                'manage',
                subject('DeployProject', {
                    projectUuid,
                    organizationUuid: project.organizationUuid,
                    upstreamProjectUuid: project.upstreamProjectUuid,
                    type: project.type,
                    createdByUserUuid: project.createdByUserUuid,
                    metadata: {
                        createdByUserUuid: project.createdByUserUuid,
                        type: project.type,
                    },
                }),
            )
        ) {
            throw new ForbiddenError(
                `User does not have permission to deploy to this project`,
            );
        }

        const exploresWithPreAggregates = enhanceExploresForPreAggregates({
            explores,
            enabled: this.lightdashConfig.preAggregates.enabled,
        });

        await this.saveExploresToCacheAndIndexCatalog({
            userUuid: user.userUuid,
            projectUuid,
            explores: exploresWithPreAggregates,
            // TODO: Do not hardcode CLI information here
            compilationSource: 'cli_deploy',
            jobUuid: null,
            requestMethod: 'cli',
            cliVersion,
        });

        await this.schedulerClient.generateValidation({
            userUuid: user.userUuid,
            projectUuid,
            context: 'cli',
            organizationUuid: project.organizationUuid,
        });

        return {
            exploreCount: exploresWithPreAggregates.length,
            warnings: calculateExploreWarningReport({
                explores: exploresWithPreAggregates,
            }),
        };
    }

    /* When editing a project, most fields are optional
    but if the user switches from one authentication type to another,
    we need to validate the secrets are present */
    static validateDbtEnvironmentVariables(dbtConnection: DbtProjectConfig) {
        if (!('environment' in dbtConnection) || !dbtConnection.environment) {
            return;
        }

        const keys = new Set<string>();
        dbtConnection.environment.forEach(({ key }) => {
            const error = getDbtEnvironmentVariableKeyError(key);
            if (error) {
                throw new ParameterError(error);
            }

            if (key.length === 0) {
                return;
            }

            if (keys.has(key)) {
                throw new ParameterError(
                    `Environment variable "${key}" is duplicated`,
                );
            }
            keys.add(key);
        });
    }

    private static assertEmbeddedCredentialsAreInternal(
        credentials: CreateWarehouseCredentials | undefined,
        internalProvisioning?: { source: 'playground' },
    ): void {
        if (
            credentials?.type === WarehouseTypes.DUCKDB &&
            credentials.connectionType === DuckdbConnectionType.EMBEDDED &&
            internalProvisioning?.source !== 'playground'
        ) {
            throw new ParameterError(
                'Embedded DuckDB connections can only be provisioned internally',
            );
        }
    }

    /*
    Interactive Snowflake authentication types need a browser on every
    connect, so they cannot be used from headless backend/scheduler runs.
    External browser is still allowed when `requireUserCredentials` is set,
    since each user then connects with their own credentials and the
    project-level authentication type is never used to connect.
    */
    private static assertPersistableSnowflakeAuthentication(
        credentials: CreateWarehouseCredentials | undefined,
    ): void {
        if (credentials?.type !== WarehouseTypes.SNOWFLAKE) {
            return;
        }
        if (
            credentials.authenticationType ===
            SnowflakeAuthenticationType.OAUTH_AUTHORIZATION_CODE
        ) {
            throw new ParameterError(
                'Snowflake OAuth authorization code authentication is only supported in the CLI and cannot be saved on a project',
            );
        }
        if (
            credentials.authenticationType ===
                SnowflakeAuthenticationType.EXTERNAL_BROWSER &&
            !credentials.requireUserCredentials
        ) {
            throw new ParameterError(
                'Snowflake external browser authentication is only supported in the CLI and cannot be saved on a project',
            );
        }
    }

    validateConfigSecrets(project: UpdateProject) {
        switch (project.warehouseConnection?.type) {
            case WarehouseTypes.SNOWFLAKE:
                ProjectService.assertPersistableSnowflakeAuthentication(
                    project.warehouseConnection,
                );
                break;
            case WarehouseTypes.BIGQUERY:
                const keyFileContents =
                    project.warehouseConnection?.keyfileContents;
                const authenticationType =
                    project.warehouseConnection?.authenticationType;
                switch (authenticationType) {
                    case undefined: // Default, for backwards compatibility
                    case BigqueryAuthenticationType.PRIVATE_KEY:
                        if (keyFileContents?.private_key === undefined) {
                            throw new ParameterError(
                                'Bigquery key file is required for private key authentication',
                            );
                        }
                        break;
                    case BigqueryAuthenticationType.SSO:
                        if (keyFileContents?.refresh_token === undefined) {
                            throw new ParameterError(
                                'Bigquery refresh token is required for SSO authentication',
                            );
                        }
                        break;
                    case BigqueryAuthenticationType.ADC:
                        if (keyFileContents) {
                            throw new ParameterError(
                                'Bigquery ADC authentication should not have any sensitive fields set',
                            );
                        }
                        if (!this.lightdashConfig.auth.google.enableGCloudADC) {
                            throw new ParameterError(
                                'Bigquery ADC authentication is not enabled in the configuration',
                            );
                        }
                        break;
                    default:
                        assertUnreachable(
                            authenticationType,
                            `Unknown authentication type: ${authenticationType}`,
                        );
                }
                break;
            case WarehouseTypes.ATHENA:
                const athenaAuthenticationType =
                    project.warehouseConnection.authenticationType ??
                    AthenaAuthenticationType.ACCESS_KEY;

                if (
                    athenaAuthenticationType ===
                        AthenaAuthenticationType.ACCESS_KEY &&
                    (!project.warehouseConnection.accessKeyId ||
                        !project.warehouseConnection.secretAccessKey)
                ) {
                    throw new ParameterError(
                        'Athena access key authentication requires accessKeyId and secretAccessKey',
                    );
                }
                break;
            default:
                break;
        }
    }

    async updateAndScheduleAsyncWork(
        projectUuid: string,
        account: Account,
        data: UpdateProject,
        method: RequestMethod,
    ): Promise<{ jobUuid: string }> {
        assertIsAccountWithOrg(account);
        ProjectService.assertEmbeddedCredentialsAreInternal(
            data.warehouseConnection,
        );
        const savedProject =
            await this.projectModel.getWithSensitiveFields(projectUuid);
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'update',
                subject('Project', {
                    organizationUuid: savedProject.organizationUuid,
                    projectUuid: savedProject.projectUuid,
                    upstreamProjectUuid: savedProject.upstreamProjectUuid,
                    type: savedProject.type,
                    createdByUserUuid: savedProject.createdByUserUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const job: CreateJob = {
            jobUuid: uuidv4(),
            jobType: JobType.COMPILE_PROJECT,
            jobStatus: JobStatusType.STARTED,
            projectUuid: undefined,
            userUuid: account.user.id,
            steps: [
                { stepType: JobStepType.TESTING_ADAPTOR },
                ...(savedProject.dbtConnection.type === DbtProjectType.NONE
                    ? []
                    : [{ stepType: JobStepType.COMPILING }]),
            ],
        };
        const createProject = await this._resolveWarehouseClientCredentials(
            this.mergeMissingDatabricksM2MSecrets(data, savedProject),
            account.user.id,
            savedProject.organizationUuid,
        );
        const updatedProject = ProjectModel.mergeMissingProjectConfigSecrets(
            createProject,
            savedProject,
        );

        this.validateConfigSecrets(updatedProject);
        ProjectService.validateDbtEnvironmentVariables(
            updatedProject.dbtConnection,
        );

        await this.projectModel.update(projectUuid, updatedProject);

        if (
            savedProject.type !== ProjectType.PREVIEW &&
            hasConnectionChanges(
                {
                    warehouseConnection: savedProject.warehouseConnection,
                    dbtConnection: savedProject.dbtConnection,
                },
                {
                    warehouseConnection: updatedProject.warehouseConnection,
                    dbtConnection: updatedProject.dbtConnection,
                },
            )
        ) {
            this.adminNotificationService
                .notifyConnectionSettingsChange({
                    organizationUuid: savedProject.organizationUuid,
                    projectUuid,
                    projectName: savedProject.name,
                    changedBy: account,
                })
                .catch((error) => {
                    this.logger.error(
                        'Failed to send connection settings change notification',
                        {
                            error,
                            projectUuid,
                        },
                    );
                });
        }

        await this.jobModel.create(job);

        if (updatedProject.dbtConnection.type !== DbtProjectType.NONE) {
            await this.schedulerClient.testAndCompileProject({
                organizationUuid: account.organization.organizationUuid,
                createdByUserUuid: account.user.id,
                projectUuid,
                requestMethod: method,
                jobUuid: job.jobUuid,
                isPreview: savedProject.type === ProjectType.PREVIEW,
                userUuid: account.user.id,
                compilationSource: 'project_connection_form',
            });
        } else {
            // Nothing to test and compile, just update the job status
            await this.jobModel.update(job.jobUuid, {
                jobStatus: JobStatusType.DONE,
                jobResults: {
                    projectUuid,
                },
            });
        }
        return {
            jobUuid: job.jobUuid,
        };
    }

    async updateProjectDetails(
        projectUuid: string,
        account: Account,
        details: UpdateProjectDetails,
    ): Promise<ProjectSummary> {
        assertIsAccountWithOrg(account);
        const updatedDetails = { ...details };
        if (details.name !== undefined) {
            const trimmedName = details.name.trim();
            if (trimmedName.length === 0) {
                throw new ParameterError('Project name cannot be empty');
            }
            updatedDetails.name = trimmedName;
        }
        if (Object.keys(updatedDetails).length === 0) {
            throw new ParameterError('No project details to update');
        }

        const project = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(account);
        if (auditedAbility.cannot('update', subject('Project', project))) {
            throw new ForbiddenError();
        }

        await this.projectModel.updateDetails(projectUuid, updatedDetails);

        return { ...project, ...updatedDetails };
    }

    /*
    Similar code to updateAndScheduleAsyncWork, but only for warehouse credentials
    This will not trigger any job
    We could reuse this method in updateAndScheduleAsyncWork to avoid code duplication
    */
    async updateWarehouseCredentials(
        projectUuid: string,
        account: Account,
        data: { warehouseConnection: CreateWarehouseCredentials },
    ): Promise<void> {
        assertIsAccountWithOrg(account);
        ProjectService.assertEmbeddedCredentialsAreInternal(
            data.warehouseConnection,
        );
        const savedProject =
            await this.projectModel.getWithSensitiveFields(projectUuid);
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'update',
                subject('Project', {
                    organizationUuid: savedProject.organizationUuid,
                    projectUuid: savedProject.projectUuid,
                    upstreamProjectUuid: savedProject.upstreamProjectUuid,
                    type: savedProject.type,
                    createdByUserUuid: savedProject.createdByUserUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const updatedProjectData: UpdateProject = {
            name: savedProject.name,
            dbtConnection: savedProject.dbtConnection,
            dbtVersion: savedProject.dbtVersion,
            warehouseConnection: data.warehouseConnection,
        };

        const resolvedData = await this._resolveWarehouseClientCredentials(
            this.mergeMissingDatabricksM2MSecrets(
                updatedProjectData,
                savedProject,
            ),
            account.user.id,
            savedProject.organizationUuid,
        );

        const updatedProject = ProjectModel.mergeMissingProjectConfigSecrets(
            resolvedData,
            savedProject,
        );

        // extra security measure, let's remove all sensitive credentials when authentication type is NONE on Snowflake
        if (
            updatedProject.warehouseConnection.type ===
                WarehouseTypes.SNOWFLAKE &&
            updatedProject.warehouseConnection.authenticationType ===
                SnowflakeAuthenticationType.NONE
        ) {
            updatedProject.warehouseConnection =
                OrganizationWarehouseCredentialsModel.stripSensitiveCredentials(
                    updatedProject.warehouseConnection,
                ) as CreateWarehouseCredentials;
        }

        this.validateConfigSecrets(updatedProject);

        await this.projectModel.update(projectUuid, updatedProject);

        if (
            savedProject.type !== ProjectType.PREVIEW &&
            hasConnectionChanges(
                { warehouseConnection: savedProject.warehouseConnection },
                { warehouseConnection: updatedProject.warehouseConnection },
            )
        ) {
            this.adminNotificationService
                .notifyConnectionSettingsChange({
                    organizationUuid: savedProject.organizationUuid,
                    projectUuid,
                    projectName: savedProject.name,
                    changedBy: account,
                })
                .catch((error) => {
                    this.logger.error(
                        'Failed to send connection settings change notification',
                        {
                            error,
                            projectUuid,
                        },
                    );
                });
        }
    }

    async testAndCompileProject(
        user: SessionUser,
        projectUuid: string,
        method: RequestMethod,
        jobUuid: string,
        compilationSource: CompilationSource = 'refresh_dbt',
    ) {
        const totalStartTime = performance.now();

        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        const updatedProject =
            await this.projectModel.getWithSensitiveFields(projectUuid);

        // This job is the job model we use to compile projects
        // This is not the graphile Job id we use on scheduler
        // TODO: remove this old job method and replace with scheduler log details
        const job: CreateJob = {
            jobUuid,
            jobType: JobType.COMPILE_PROJECT,
            jobStatus: JobStatusType.STARTED,
            projectUuid: undefined,
            userUuid: user.userUuid,
            steps: [
                { stepType: JobStepType.TESTING_ADAPTOR },
                ...(updatedProject.dbtConnection.type === DbtProjectType.NONE
                    ? []
                    : [{ stepType: JobStepType.COMPILING }]),
            ],
        };

        const timings = {
            testAdapter: { start: 0, end: 0 },
            compileExplores: { start: 0, end: 0 },
            getConfig: { start: 0, end: 0 },
            yaml: { start: 0, end: 0 },
            parameters: { start: 0, end: 0 },
            cacheExplores: { start: 0, end: 0 },
        };

        try {
            const auditedAbility = this.createAuditedAbility(user);
            if (
                auditedAbility.cannot(
                    'update',
                    subject('Project', updatedProject),
                )
            ) {
                throw new ForbiddenError();
            }

            if (updatedProject.warehouseConnection === undefined) {
                throw new Error(
                    `Missing warehouseConnection details on project ${projectUuid}'}`,
                );
            }

            await this.jobModel.update(job.jobUuid, {
                jobStatus: JobStatusType.RUNNING,
            });
            timings.testAdapter.start = performance.now();
            const {
                adapter: primaryAdapter,
                sshTunnel,
                warehouseCredentials,
                cachedWarehouse,
                dbtVersionOption,
            } = await this.jobModel.tryJobStep(
                job.jobUuid,
                JobStepType.TESTING_ADAPTOR,
                async () =>
                    this.testProjectAdapter(
                        updatedProject as UpdateProject,
                        user,
                        'project_update',
                        method,
                    ),
            );
            timings.testAdapter.end = performance.now();
            // Source git clones built only to read manifests for the merge.
            const manifestFetchAdapters: ProjectAdapter[] = [];
            if (updatedProject.dbtConnection.type !== DbtProjectType.NONE) {
                await this.jobModel.tryJobStep(
                    job.jobUuid,
                    JobStepType.COMPILING,
                    async () => {
                        // Merge additional dbt sources (flag-gated, N=0
                        // short-circuit) so "Test & deploy" yields the same
                        // combined explore set as "Refresh dbt".
                        let compileAdapter = primaryAdapter;
                        try {
                            compileAdapter = await this.resolveCompileAdapter({
                                projectUuid,
                                organizationUuid: user.organizationUuid,
                                userUuid: user.userUuid,
                                primary: {
                                    adapter: primaryAdapter,
                                    warehouseCredentials,
                                    cachedWarehouse,
                                    dbtVersionOption,
                                },
                                manifestFetchAdapters,
                            });
                            const trackingParams = {
                                projectUuid,
                                organizationUuid: user.organizationUuid,
                                userUuid: user.userUuid,
                            };
                            timings.compileExplores.start = performance.now();
                            const explores =
                                await compileAdapter.compileAllExplores(
                                    trackingParams,
                                    false, // loadSources
                                    this.lightdashConfig.partialCompilation
                                        .enabled,
                                );
                            timings.compileExplores.end = performance.now();
                            timings.getConfig.start = performance.now();
                            const lightdashProjectConfig =
                                await compileAdapter.getLightdashProjectConfig(
                                    trackingParams,
                                );
                            const projectContext =
                                await this.getProjectContextFromAdapter({
                                    adapter: compileAdapter,
                                    user,
                                    organizationUuid: user.organizationUuid,
                                });
                            timings.getConfig.end = performance.now();

                            timings.yaml.start = performance.now();
                            await this.replaceYamlTagsWithoutPermissionCheck(
                                user,
                                user.organizationUuid,
                                projectUuid,
                                // TODO: Create util to generate categories from lightdashProjectConfig - this is used as well in deploy.ts
                                Object.entries(
                                    lightdashProjectConfig.spotlight
                                        ?.categories || {},
                                ).map(([key, category]) => ({
                                    yamlReference: key,
                                    name: category.label,
                                    color: category.color ?? 'gray',
                                })),
                            );
                            timings.yaml.end = performance.now();
                            timings.parameters.start = performance.now();
                            await this.replaceProjectParameters({
                                user,
                                projectUuid,
                                parameters: lightdashProjectConfig.parameters,
                            });
                            await this.projectModel.setTableGroups(
                                projectUuid,
                                lightdashProjectConfig.table_groups,
                            );
                            // Mirrors CLI deploy semantics: only overwrite
                            // stored defaults when the config file defines them
                            if (lightdashProjectConfig.defaults) {
                                await this.projectModel.updateProjectDefaults(
                                    projectUuid,
                                    lightdashProjectConfig.defaults,
                                );
                            }
                            await this.replaceProjectContext(
                                projectUuid,
                                projectContext,
                            );
                            timings.parameters.end = performance.now();
                            timings.cacheExplores.start = performance.now();
                            await this.saveExploresToCacheAndIndexCatalog({
                                userUuid: user.userUuid,
                                projectUuid,
                                explores,
                                compilationSource,
                                jobUuid: job.jobUuid,
                                requestMethod: method,
                                projectConfigDefaults:
                                    lightdashProjectConfig.defaults,
                            });
                            timings.cacheExplores.end = performance.now();
                        } finally {
                            await compileAdapter.destroy();
                            await sshTunnel.disconnect();
                            // Clean up the per-source git clones used only to
                            // read manifests for the merge.
                            await Promise.all(
                                manifestFetchAdapters.map((manifestAdapter) =>
                                    manifestAdapter
                                        .destroy()
                                        .catch((destroyError) => {
                                            this.logger.warn(
                                                'Failed to destroy a dbt source adapter after manifest merge',
                                                { error: destroyError },
                                            );
                                        }),
                                ),
                            );
                        }
                    },
                );
            }

            await this.jobModel.update(job.jobUuid, {
                jobStatus: JobStatusType.DONE,
                jobResults: {
                    projectUuid,
                },
            });
            const projectWithWarehouse = {
                ...updatedProject,
                warehouseConnection: updatedProject.warehouseConnection,
            };
            const onboardingFlow = await this.getOnboardingFlow(user);
            this.analytics.track({
                event: 'project.updated',
                userId: user.userUuid,
                properties: ProjectService.getAnalyticProperties(
                    projectWithWarehouse,
                    projectUuid,
                    user,
                    method,
                    onboardingFlow,
                ),
            });
            const totalTime = performance.now() - totalStartTime;
            const durationTestAdapter =
                timings.testAdapter.end - timings.testAdapter.start;
            const durationCompileExplores =
                timings.compileExplores.end - timings.compileExplores.start;
            const durationGetConfig =
                timings.getConfig.end - timings.getConfig.start;
            const durationYaml = timings.yaml.end - timings.yaml.start;
            const durationParameters =
                timings.parameters.end - timings.parameters.start;
            const durationCacheExplores =
                timings.cacheExplores.end - timings.cacheExplores.start;

            this.logger.info(
                `testAndCompileProject completed in ${totalTime.toFixed(2)}ms`,
                {
                    totalTimeMs: totalTime,
                    sections: {
                        testAdapterMs: durationTestAdapter.toFixed(2),
                        compileExploresMs: durationCompileExplores.toFixed(2),
                        getConfigMs: durationGetConfig.toFixed(2),
                        yamlMs: durationYaml.toFixed(2),
                        parametersMs: durationParameters.toFixed(2),
                        cacheExploresMs: durationCacheExplores.toFixed(2),
                    },
                },
            );
        } catch (error) {
            await this.jobModel.setPendingJobsToSkipped(job.jobUuid);
            await this.jobModel.update(job.jobUuid, {
                jobStatus: JobStatusType.ERROR,
            });
            throw error;
        }
    }

    /**
     * Looks up the org's current GitHub installation_id and applies it to the
     * connection (see applyCurrentGithubInstallationId) before building the
     * adapter.
     */
    private async resolveDbtConnectionInstallationId(
        dbtConnection: DbtProjectConfig,
        organizationUuid: string | undefined,
    ): Promise<DbtProjectConfig> {
        if (
            dbtConnection.type !== DbtProjectType.GITHUB ||
            dbtConnection.authorization_method !== 'installation_id' ||
            !organizationUuid ||
            !this.githubAppInstallationsModel
        ) {
            return dbtConnection;
        }
        const currentInstallationId =
            await this.githubAppInstallationsModel.findInstallationId(
                organizationUuid,
            );
        const resolved = applyCurrentGithubInstallationId(
            dbtConnection,
            currentInstallationId,
        );
        if (resolved !== dbtConnection) {
            this.logger.info(
                'Using current org GitHub installation_id instead of stale project value',
                { organizationUuid },
            );
        }
        return resolved;
    }

    private async testProjectAdapter(
        data: UpdateProject,
        user: Pick<SessionUser, 'userUuid' | 'organizationUuid'>,
        context: 'project_create' | 'project_update',
        method: RequestMethod,
    ): Promise<{
        adapter: ProjectAdapter;
        sshTunnel: SshTunnel<CreateWarehouseCredentials>;
        warehouseCredentials: CreateWarehouseCredentials;
        cachedWarehouse: CachedWarehouse;
        dbtVersionOption: DbtVersionOption;
    }> {
        const onboardingFlow = await this.getOnboardingFlow(user);
        const sshTunnel = new SshTunnel(data.warehouseConnection);
        let adapter: ProjectAdapter | undefined;
        try {
            await sshTunnel.connect();
            const dbtConnection = await this.resolveDbtConnectionInstallationId(
                data.dbtConnection,
                user.organizationUuid,
            );
            const warehouseCredentials = sshTunnel.overrideCredentials;
            const cachedWarehouse: CachedWarehouse = {
                warehouseCatalog: undefined,
                onWarehouseCatalogChange: () => {},
            };
            const dbtVersionOption =
                data.dbtVersion || DefaultSupportedDbtVersion;
            adapter = await projectAdapterFromConfig(
                dbtConnection,
                warehouseCredentials,
                cachedWarehouse,
                dbtVersionOption,
                this.analytics,
            );
            await adapter.test();
            this.analytics.track({
                event: 'warehouse_connection.tested',
                userId: user.userUuid,
                properties: {
                    warehouseType: data.warehouseConnection.type,
                    result: 'success',
                    context,
                    method,
                    onboardingFlow,
                },
            });
            if (context === 'project_create') {
                this.analytics.track({
                    event: 'onboarding.step_completed',
                    userId: user.userUuid,
                    properties: {
                        step: 'warehouse_connected',
                        stepIndex: 4,
                        onboardingFlow,
                        organizationId: user.organizationUuid,
                    },
                });
            }
            return {
                adapter,
                sshTunnel,
                warehouseCredentials,
                cachedWarehouse,
                dbtVersionOption,
            };
        } catch (error) {
            const errorType =
                error instanceof Error && error.constructor.name
                    ? error.constructor.name
                    : 'UnknownError';
            this.analytics.track({
                event: 'warehouse_connection.tested',
                userId: user.userUuid,
                properties: {
                    warehouseType: data.warehouseConnection.type,
                    result: 'failure',
                    errorType,
                    context,
                    method,
                    onboardingFlow,
                },
            });
            Logger.error(`Error testing project adapter: ${error}`);
            await adapter?.destroy();
            await sshTunnel.disconnect();
            throw error;
        }
    }

    async previewDataTimezone(
        account: RegisteredAccount,
        body: DataTimezonePreviewRequest,
    ): Promise<ApiDataTimezonePreviewResults> {
        assertIsAccountWithOrg(account);
        if (
            !(await this.isTimezoneSupportEnabled({
                userUuid: account.user.userUuid,
                organizationUuid: account.organization.organizationUuid,
            }))
        ) {
            throw new ForbiddenError('Timezone support is not enabled');
        }

        const auditedAbility = this.createAuditedAbility(account);

        // Edit flow sources secrets from storage and overrides only the unsaved
        // data timezone - the frontend never sends credentials. Create flow uses
        // the just-typed credentials.
        let effectiveCredentials: CreateWarehouseCredentials;
        let projectTimezone = 'UTC';
        if (body.mode === 'edit') {
            const stored = await this.projectModel.getWithSensitiveFields(
                body.projectUuid,
            );
            if (auditedAbility.cannot('update', subject('Project', stored))) {
                throw new ForbiddenError();
            }
            // A switched-but-unsaved warehouse type can't be merged with stored
            // secrets, so ask for a save rather than failing mid-connect.
            if (
                !stored.warehouseConnection ||
                stored.warehouseConnection.type !== body.warehouseType
            ) {
                throw new ParameterError(
                    'Save the warehouse connection before previewing a different warehouse type.',
                );
            }
            effectiveCredentials = {
                ...stored.warehouseConnection,
                dataTimezone: body.dataTimezone ?? undefined,
            };
            projectTimezone = await this.getQueryTimezoneForProject(
                body.projectUuid,
            );
        } else {
            if (
                auditedAbility.cannot(
                    'create',
                    subject('Project', {
                        organizationUuid: account.organization.organizationUuid,
                        type: ProjectType.DEFAULT,
                    }),
                )
            ) {
                throw new ForbiddenError();
            }
            ProjectService.assertEmbeddedCredentialsAreInternal(
                body.credentials,
            );
            effectiveCredentials = body.credentials;
        }

        // The data timezone is set as the warehouse session timezone (the
        // client interpolates it raw), so validate it before connecting.
        const { dataTimezone } = effectiveCredentials;
        if (dataTimezone && !isValidTimezone(dataTimezone)) {
            throw new ParameterError('Invalid data timezone');
        }

        const sshTunnel = new SshTunnel(effectiveCredentials);
        const tunnelCredentials = await sshTunnel.connect();
        try {
            const warehouseClient =
                this.projectModel.getWarehouseClientFromCredentials(
                    tunnelCredentials,
                );
            const adapterType = warehouseClient.getAdapterType();
            // A fixed wall-clock, read through the session timezone the client
            // sets from dataTimezone (the third runQuery arg below).
            const nowWallClock = currentUtcWallClock();
            const sql = buildDataTimezonePreviewSql(adapterType, nowWallClock);
            const queryTags: RunQueryTags = {
                organization_uuid: account.organization.organizationUuid,
                user_uuid: account.user.userUuid,
                query_context: QueryExecutionContext.API,
            };
            const { rows } = await warehouseClient.runQuery(
                sql,
                queryTags,
                dataTimezone,
            );
            if (rows.length === 0) {
                throw new UnexpectedServerError(
                    'Data timezone preview query returned no rows',
                );
            }
            return buildDataTimezonePreviewResponse({
                row: rows[0],
                nowWallClock,
                projectTimezone,
                dataTimezone,
            });
        } finally {
            await sshTunnel.disconnect();
        }
    }

    async delete(projectUuid: string, user: SessionUser): Promise<void> {
        const project =
            await this.projectModel.getWithSensitiveFields(projectUuid);

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'delete',
                subject('Project', {
                    type: project.type,
                    organizationUuid: project.organizationUuid,
                    projectUuid: project.projectUuid,
                    upstreamProjectUuid: project.upstreamProjectUuid,
                    createdByUserUuid: project.createdByUserUuid,
                    metadata: {
                        createdByUserUuid: project.createdByUserUuid,
                        type: project.type,
                    },
                }),
            )
        ) {
            throw new ForbiddenError(
                `User does not have permission to delete project`,
            );
        }

        if (project.provisioningSource === 'playground') {
            await this.onboardingModel.runInPlaygroundProvisioningLock(
                project.organizationUuid,
                async (trx) => {
                    await this.onboardingModel.getByOrganizationUuid(
                        project.organizationUuid,
                        trx,
                    );
                    await this.onboardingModel.update(
                        project.organizationUuid,
                        { playgroundProjectDeletedAt: new Date() },
                        trx,
                    );
                    await this.projectModel.delete(projectUuid, trx);
                },
            );
        } else {
            await this.projectModel.delete(projectUuid);
        }

        this.analytics.track({
            event: 'project.deleted',
            userId: user.userUuid,
            properties: {
                projectId: projectUuid,
                isPreview: project.type === ProjectType.PREVIEW,
            },
        });
    }

    async deleteExpiredPreviewProjects(): Promise<number> {
        const expiredProjects =
            await this.projectModel.getExpiredPreviewProjects();

        const results = await Promise.allSettled(
            expiredProjects.map(({ projectUuid }) =>
                this.projectModel.delete(projectUuid).then(() => {
                    this.logger.info(
                        `Deleted expired preview project: ${projectUuid}`,
                    );
                }),
            ),
        );

        results.forEach((r, i) => {
            if (r.status === 'rejected') {
                this.logger.error(
                    `Failed to delete expired preview project ${expiredProjects[i].projectUuid}`,
                    { error: r.reason },
                );
            }
        });

        return results.filter((r) => r.status === 'fulfilled').length;
    }

    private async buildAdapter(
        projectUuid: string,
        user: Pick<SessionUser, 'userUuid' | 'organizationUuid'>,
    ): Promise<{
        sshTunnel: SshTunnel<CreateWarehouseCredentials>;
        adapter: ProjectAdapter;
        // Shared warehouse setup so additional dbt sources can be compiled against
        // the same warehouse without re-resolving (and re-rotating) credentials.
        warehouseCredentials: CreateWarehouseCredentials;
        cachedWarehouse: CachedWarehouse;
        dbtVersionOption: DbtVersionOption;
    }> {
        const project =
            await this.projectModel.getWithSensitiveFields(projectUuid);
        if (!project.warehouseConnection) {
            throw new MissingWarehouseCredentialsError(
                'Warehouse credentials must be provided to connect to your dbt project',
            );
        }
        const cachedWarehouseCatalog =
            await this.projectModel.getWarehouseFromCache(projectUuid);

        if (
            project.warehouseConnection.type === WarehouseTypes.SNOWFLAKE &&
            project.warehouseConnection.authenticationType === 'sso' &&
            project.warehouseConnection.refreshToken
        ) {
            this.logger.debug(
                `Refreshing snowflake warehouse credentials from refresh token on buildAdapter`,
            );
            const oldRefreshToken = project.warehouseConnection.refreshToken;
            const { accessToken, refreshToken: newRefreshToken } =
                await UserService.generateSnowflakeAccessToken(oldRefreshToken);
            project.warehouseConnection.token = accessToken;
            project.warehouseConnection.refreshToken = newRefreshToken;
            if (newRefreshToken !== oldRefreshToken) {
                await this.persistRefreshTokenRotation({
                    source: { kind: 'project', projectUuid },
                    oldRefreshToken,
                    newRefreshToken,
                });
            }
        }

        if (
            project.warehouseConnection.type === WarehouseTypes.DATABRICKS &&
            project.warehouseConnection.authenticationType ===
                DatabricksAuthenticationType.OAUTH_M2M
        ) {
            // If we have OAuth credentials but no refresh token, exchange them for tokens
            if (
                project.warehouseConnection.oauthClientId &&
                project.warehouseConnection.oauthClientSecret &&
                !project.warehouseConnection.refreshToken
            ) {
                this.logger.debug(
                    `Exchanging Databricks OAuth credentials for access token on buildAdapter`,
                );
                const { accessToken, refreshToken } =
                    await exchangeDatabricksOAuthCredentials(
                        project.warehouseConnection.serverHostName,
                        project.warehouseConnection.oauthClientId,
                        project.warehouseConnection.oauthClientSecret,
                    );
                project.warehouseConnection.token = accessToken;
                if (refreshToken) {
                    project.warehouseConnection.refreshToken = refreshToken;
                    // Note: refresh token will be persisted when project credentials are next saved
                }
            } else if (project.warehouseConnection.refreshToken) {
                // If we have a refresh token, use it to get a fresh access token
                this.logger.debug(
                    `Refreshing databricks warehouse credentials from refresh token on buildAdapter`,
                );
                let clientId: string;
                let clientSecret: string | undefined;
                if (project.warehouseConnection.oauthClientId) {
                    clientId = project.warehouseConnection.oauthClientId;
                    clientSecret =
                        project.warehouseConnection.oauthClientSecret;
                } else if (this.lightdashConfig.auth.databricks.clientId) {
                    clientId = this.lightdashConfig.auth.databricks.clientId;
                    clientSecret =
                        this.lightdashConfig.auth.databricks.clientSecret;
                } else {
                    clientId = DATABRICKS_DEFAULT_OAUTH_CLIENT_ID;
                    clientSecret = undefined;
                }
                const { accessToken, refreshToken } =
                    await refreshDatabricksOAuthToken(
                        project.warehouseConnection.serverHostName,
                        clientId,
                        project.warehouseConnection.refreshToken,
                        clientSecret,
                    );
                project.warehouseConnection.token = accessToken;
                project.warehouseConnection.refreshToken = refreshToken;
            }
        }

        if (
            project.warehouseConnection.type === WarehouseTypes.DATABRICKS &&
            project.warehouseConnection.authenticationType ===
                DatabricksAuthenticationType.OAUTH_U2M
        ) {
            // For U2M OAuth, resolve refresh token from user credentials if not on project
            let u2mRefreshToken =
                project.warehouseConnection.refreshToken ?? undefined;

            let userCredOauthClientId: string | undefined;
            if (!u2mRefreshToken) {
                const userCreds =
                    await this.userWarehouseCredentialsModel.findForProjectWithSecrets(
                        projectUuid,
                        user.userUuid,
                        WarehouseTypes.DATABRICKS,
                    );
                if (
                    userCreds?.credentials.type === WarehouseTypes.DATABRICKS &&
                    userCreds.credentials.authenticationType ===
                        DatabricksAuthenticationType.OAUTH_U2M &&
                    userCreds.credentials.refreshToken
                ) {
                    u2mRefreshToken = userCreds.credentials.refreshToken;
                    userCredOauthClientId = userCreds.credentials.oauthClientId;
                }
            }

            if (u2mRefreshToken) {
                this.logger.debug(
                    `Refreshing databricks U2M OAuth token from refresh token on buildAdapter`,
                );
                // Resolve client: user cred → project → server config → default
                let clientId: string;
                let clientSecret: string | undefined;
                const storedClientId =
                    userCredOauthClientId ||
                    project.warehouseConnection.oauthClientId;
                if (storedClientId) {
                    clientId = storedClientId;
                } else if (this.lightdashConfig.auth.databricks.clientId) {
                    clientId = this.lightdashConfig.auth.databricks.clientId;
                } else {
                    clientId = DATABRICKS_DEFAULT_OAUTH_CLIENT_ID;
                }

                if (
                    clientId === this.lightdashConfig.auth.databricks.clientId
                ) {
                    clientSecret =
                        this.lightdashConfig.auth.databricks.clientSecret;
                }

                const { accessToken, refreshToken } =
                    await refreshDatabricksOAuthToken(
                        project.warehouseConnection.serverHostName,
                        clientId,
                        u2mRefreshToken,
                        clientSecret,
                    );
                project.warehouseConnection.token = accessToken;
                project.warehouseConnection.refreshToken = refreshToken;
            }
        }

        const sshTunnel = new SshTunnel(project.warehouseConnection);
        await sshTunnel.connect();

        const dbtConnection = await this.resolveDbtConnectionInstallationId(
            project.dbtConnection,
            user.organizationUuid,
        );

        const cachedWarehouse: CachedWarehouse = {
            warehouseCatalog: cachedWarehouseCatalog,
            onWarehouseCatalogChange: async (warehouseCatalog) => {
                await this.projectModel.saveWarehouseToCache(
                    projectUuid,
                    warehouseCatalog,
                );
            },
        };
        const dbtVersionOption =
            project.dbtVersion || DefaultSupportedDbtVersion;
        const adapter = await projectAdapterFromConfig(
            dbtConnection,
            sshTunnel.overrideCredentials,
            cachedWarehouse,
            dbtVersionOption,
            this.analytics,
        );
        return {
            adapter,
            sshTunnel,
            warehouseCredentials: sshTunnel.overrideCredentials,
            cachedWarehouse,
            dbtVersionOption,
        };
    }

    /**
     * Build an adapter for an additional dbt source, reusing the project's already
     * resolved warehouse setup (so we don't re-resolve and re-rotate credentials per
     * source). Used only to read the source's manifest, not to compile.
     */
    private async buildSourceAdapter(
        dbtConnection: DbtProjectConfig,
        organizationUuid: string | undefined,
        shared: {
            warehouseCredentials: CreateWarehouseCredentials;
            cachedWarehouse: CachedWarehouse;
            dbtVersionOption: DbtVersionOption;
        },
    ): Promise<ProjectAdapter> {
        const resolvedConnection =
            await this.resolveDbtConnectionInstallationId(
                dbtConnection,
                organizationUuid,
            );
        return projectAdapterFromConfig(
            resolvedConnection,
            shared.warehouseCredentials,
            shared.cachedWarehouse,
            shared.dbtVersionOption,
            this.analytics,
        );
    }

    /**
     * Formats a `ParameterError` message naming every colliding key so the user
     * can tell exactly what to rename or remove — capped so a near-duplicate
     * source pair (which can produce thousands of collisions) doesn't blow up
     * the error message.
     */
    private static formatManifestCollisionsError(
        collisions: ManifestCollision[],
    ): string {
        const MAX_COLLISIONS_IN_ERROR = 10;
        const shown = collisions.slice(0, MAX_COLLISIONS_IN_ERROR);
        const remainder = collisions.length - shown.length;
        const details = shown
            .map(
                (c) =>
                    `${c.section} "${c.key}" is defined in both "${c.winningSource}" and "${c.supersededSource}"`,
            )
            .join('; ');
        return (
            `Merging dbt sources found ${collisions.length} naming collision${
                collisions.length === 1 ? '' : 's'
            }: ${details}${remainder > 0 ? `; and ${remainder} more` : ''}. ` +
            `Rename or remove the duplicate(s) before deploying.`
        );
    }

    /**
     * Merge the primary source's manifest with every additional source's manifest
     * into one combined manifest, then return a MANIFEST adapter over it so a single
     * compile produces the union of all sources' explores with cross-source refs
     * resolved. Source adapters (git clones) are pushed onto `manifestFetchAdapters`
     * for the caller to destroy. A name collision fails the whole deploy by name,
     * matching every other per-source failure above (broken clone, broken
     * manifest, broken credentials) — silently letting one source's definition
     * win would otherwise produce a green deploy that is quietly missing a
     * sibling's model.
     */
    private async buildMergedManifestAdapter({
        projectUuid,
        organizationUuid,
        primary,
        sources,
        manifestFetchAdapters,
    }: {
        projectUuid: string;
        organizationUuid: string | undefined;
        primary: {
            adapter: ProjectAdapter;
            warehouseCredentials: CreateWarehouseCredentials;
            cachedWarehouse: CachedWarehouse;
            dbtVersionOption: DbtVersionOption;
        };
        sources: ProjectDbtSource[];
        manifestFetchAdapters: ProjectAdapter[];
    }): Promise<ProjectAdapter> {
        const shared = {
            warehouseCredentials: primary.warehouseCredentials,
            cachedWarehouse: primary.cachedWarehouse,
            dbtVersionOption: primary.dbtVersionOption,
        };

        // The primary git adapter is only read for its manifest here; the merged
        // MANIFEST adapter is what compiles, so destroy the primary clone in finally.
        manifestFetchAdapters.push(primary.adapter);
        const { manifest: primaryManifest } =
            await primary.adapter.getDbtManifest();

        // A credential error fails the whole deploy by name, matching every
        // other per-source failure below (broken clone, broken manifest) — a
        // silently-skipped source would otherwise produce a green deploy that
        // is quietly missing one sibling's models, the exact failure mode the
        // recompile-all-sources design exists to prevent.
        const brokenCredentialSource = sources.find(
            (source) => source.hasCredentialError,
        );
        if (brokenCredentialSource) {
            throw new ParameterError(
                `Failed to load dbt source "${brokenCredentialSource.name}": its connection credentials could not be decrypted. Remove it and add it again with a fresh connection.`,
            );
        }

        const compilableSources = sources.filter(
            (
                source,
            ): source is ProjectDbtSource & {
                dbtConnection: DbtProjectConfig;
            } => source.dbtConnection !== null,
        );
        sources
            .filter((source) => source.dbtConnection === null)
            .forEach((source) => {
                this.logger.warn(
                    `Skipping dbt source "${source.name}" (${source.projectDbtSourceUuid}) — it has no dbt connection configured`,
                );
            });

        const built = await Promise.all(
            compilableSources.map(async (source) => {
                // Name the source (and repo) in any failure so the user can tell
                // which one to fix — the raw git error only mentions a temp dir.
                const repoSuffix =
                    'repository' in source.dbtConnection &&
                    source.dbtConnection.repository
                        ? ` (${source.dbtConnection.repository})`
                        : '';
                let sourceAdapter: ProjectAdapter;
                try {
                    sourceAdapter = await this.buildSourceAdapter(
                        source.dbtConnection,
                        organizationUuid,
                        shared,
                    );
                } catch (e) {
                    throw new ParameterError(
                        `Failed to connect dbt source "${source.name}"${repoSuffix}: ${getErrorMessage(
                            e,
                        )}`,
                    );
                }
                // Push before fetching the manifest so the caller's cleanup
                // destroys this clone even if the fetch below throws.
                manifestFetchAdapters.push(sourceAdapter);
                try {
                    const { manifest } = await sourceAdapter.getDbtManifest();
                    return {
                        name: source.name,
                        precedence: source.precedence,
                        manifest,
                    };
                } catch (e) {
                    throw new ParameterError(
                        `Failed to load dbt source "${source.name}"${repoSuffix}: ${getErrorMessage(
                            e,
                        )}`,
                    );
                }
            }),
        );

        const manifestSources: ManifestSource[] = [
            { name: 'primary', precedence: 0, manifest: primaryManifest },
            ...built.map((b) => ({
                name: b.name,
                precedence: b.precedence,
                manifest: b.manifest,
            })),
        ];

        const { manifest: mergedManifest, collisions } =
            combineManifestSources(manifestSources);
        if (collisions.length > 0) {
            this.logger.warn(
                `Merged ${manifestSources.length} dbt sources for project ${projectUuid} with ${collisions.length} name collision(s)`,
                { projectUuid, collisions },
            );
            throw new ParameterError(
                ProjectService.formatManifestCollisionsError(collisions),
            );
        }

        return projectAdapterFromConfig(
            {
                type: DbtProjectType.MANIFEST,
                manifest: JSON.stringify(mergedManifest),
                hideRefreshButton: true,
            },
            shared.warehouseCredentials,
            shared.cachedWarehouse,
            shared.dbtVersionOption,
            this.analytics,
            // Keep the primary source's lightdash.config.yml / project_context.yml
            // (spotlight categories, table_groups, parameters, AI context). The
            // primary clone is alive until the caller destroys manifestFetchAdapters
            // after compile, so the merged adapter can read these during compile.
            primary.adapter.dbtProjectDir,
        );
    }

    /**
     * Resolve the adapter to compile a project with. When the MultiDbtSources
     * flag is on and the project has additional sources, returns a merged
     * manifest adapter (the union of every source); otherwise returns the
     * primary adapter unchanged (N=0 short-circuit / regression firewall).
     * Source git clones are pushed onto `manifestFetchAdapters` for the caller
     * to destroy. Shared by both compile entry points (compileProject /
     * testAndCompileProject) so "Refresh dbt" and "Test & deploy" merge alike.
     */
    private async resolveCompileAdapter({
        projectUuid,
        organizationUuid,
        userUuid,
        primary,
        manifestFetchAdapters,
        onDbtSourceCount,
    }: {
        projectUuid: string;
        organizationUuid: string | undefined;
        userUuid: string;
        primary: {
            adapter: ProjectAdapter;
            warehouseCredentials: CreateWarehouseCredentials;
            cachedWarehouse: CachedWarehouse;
            dbtVersionOption: DbtVersionOption;
        };
        manifestFetchAdapters: ProjectAdapter[];
        onDbtSourceCount?: (dbtSourceCount: number) => void;
    }): Promise<ProjectAdapter> {
        const { enabled: multiDbtSourcesEnabled } =
            await this.featureFlagModel.get({
                featureFlagId: FeatureFlags.MultiDbtSources,
                user: { userUuid, organizationUuid },
            });
        if (!multiDbtSourcesEnabled) {
            onDbtSourceCount?.(1);
            return primary.adapter;
        }
        const sources =
            await this.projectDbtSourcesModel.getSources(projectUuid);
        if (sources.length === 0) {
            onDbtSourceCount?.(1);
            return primary.adapter;
        }
        onDbtSourceCount?.(sources.length + 1);
        return this.buildMergedManifestAdapter({
            projectUuid,
            organizationUuid,
            primary,
            sources,
            manifestFetchAdapters,
        });
    }

    /**
     * Get all available parameter definitions for a project and explore
     * @param projectUuid - The UUID of the project
     * @param explore - The explore to get the parameters for
     * @returns Parameter definitions object
     */
    protected async getAvailableParameters(
        projectUuid: string,
        explore: Explore,
        preloadedProjectParameters?: DbProjectParameter[],
    ): Promise<ParameterDefinitions> {
        const projectParameters =
            preloadedProjectParameters ??
            (await this.projectParametersModel.find(projectUuid));

        return getAvailableParameterDefinitions(projectParameters, explore);
    }

    async compileQuery(
        args: {
            account: Account;
            // ! TODO: we need to fix this type
            body: MetricQuery & {
                parameters?: ParametersValuesMap;
                pivotConfiguration?: PivotConfiguration;
                pivotDimensions?: string[];
            };
            projectUuid: string;
            usePreAggregateCache?: boolean;
        } & ({ exploreName: string } | { explore: Explore }),
    ) {
        const {
            account,
            body: {
                parameters,
                pivotConfiguration,
                pivotDimensions,
                ...metricQuery
            },
            projectUuid,
        } = args;

        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const sourceExplore =
            'explore' in args
                ? args.explore
                : await this.getExplore(account, projectUuid, args.exploreName);

        // Pre-aggregate routing: compile against the pre-agg explore when cache is enabled and there's a match
        let explore = sourceExplore;
        if (args.usePreAggregateCache !== false) {
            const matchResult = preAggregateUtils.findMatch(
                metricQuery,
                sourceExplore,
            );
            if (matchResult.hit) {
                const preAggExploreName = getPreAggregateExploreName(
                    sourceExplore.name,
                    matchResult.preAggregateName,
                );
                try {
                    explore = await this.getExplore(
                        account,
                        projectUuid,
                        preAggExploreName,
                    );
                } catch {
                    this.logger.warn(
                        `Pre-aggregate explore "${preAggExploreName}" not found, falling back to source explore`,
                    );
                }
            }
        }

        // Get warehouse credentials to build the SQL builder (no full connection needed for compilation)
        const warehouseCredentials =
            await this.projectModel.getWarehouseCredentialsForProject(
                projectUuid,
            );

        const warehouseSqlBuilder = warehouseSqlBuilderFromType(
            warehouseCredentials.type,
            warehouseCredentials.startOfWeek,
        );

        const { userAttributes, intrinsicUserAttributes } =
            await this.getUserAttributes({ account });

        const availableParameterDefinitions = await this.getAvailableParameters(
            projectUuid,
            explore,
        );

        // Combine default parameter values with request parameters
        const combinedParameters = await this.combineParameters(
            projectUuid,
            explore,
            parameters,
        );

        const projectTimezone =
            await this.getQueryTimezoneForProject(projectUuid);
        const timezone = resolveQueryTimezone({
            sessionTimezone: null,
            metricQuery,
            projectTimezone,
            userTimezone: getAccountUserTimezone(account),
        });
        const useTimezoneAwareDateTrunc = await this.isTimezoneSupportEnabled({
            userUuid: account.user.id,
            organizationUuid: account.organization.organizationUuid,
        });

        const queryComposer = new QueryComposer(
            { metricQuery, pivotConfiguration },
            {
                explore,
                warehouseSqlBuilder,
                intrinsicUserAttributes,
                userAttributes,
                timezone,
                availableParameterDefinitions,
                parameters: combinedParameters,
                dateZoom: undefined,
                pivotDimensions,
                pivotItemsMap: undefined,
                continueOnError: true, // Return SQL even with compilation errors for debugging
                useTimezoneAwareDateTrunc,
                columnTimezone: getColumnTimezone(warehouseCredentials),
                dataTimezone: warehouseCredentials.dataTimezone,
                applyDateZoomToFilters: undefined,
            },
        );

        const compiledQuery = queryComposer.compile();

        // Include pivot query only when a pivot configuration was provided
        const pivotQuery = pivotConfiguration
            ? queryComposer.getSql({
                  columnLimit: this.lightdashConfig.pivotTable.maxColumnLimit,
              })
            : undefined;

        return {
            ...compiledQuery,
            // Convert to array so TSOA can serialize it when using in controllers
            parameterReferences: Array.from(compiledQuery.parameterReferences),
            // Only include compilationErrors if there are any
            ...(compiledQuery.compilationErrors.length > 0 && {
                compilationErrors: compiledQuery.compilationErrors,
            }),
            // Include pivot query if pivot configuration was provided
            ...(pivotQuery && { pivotQuery }),
        };
    }

    async validateFormula(args: {
        account: Account;
        projectUuid: string;
        exploreName: string;
        formula: string;
        metricQuery: MetricQuery;
    }): Promise<ApiFormulaValidationResults> {
        const { account, projectUuid, exploreName, formula, metricQuery } =
            args;

        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                    metadata: { exploreName },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const explore = await this.getExplore(
            account,
            projectUuid,
            exploreName,
        );

        const warehouseCredentials =
            await this.projectModel.getWarehouseCredentialsForProject(
                projectUuid,
            );

        const warehouseSqlBuilder = warehouseSqlBuilderFromType(
            warehouseCredentials.type,
            warehouseCredentials.startOfWeek,
        );

        const queryWithFormula: MetricQuery = {
            ...metricQuery,
            tableCalculations: [
                ...metricQuery.tableCalculations,
                {
                    name: '__formula_validation__',
                    displayName: '',
                    formula,
                },
            ],
        };

        try {
            const compiled = compileMetricQuery({
                explore,
                metricQuery: queryWithFormula,
                warehouseSqlBuilder,
                availableParameters: [],
            });

            const validationCalc = compiled.compiledTableCalculations.find(
                (tc) => tc.name === '__formula_validation__',
            );

            return {
                valid: true,
                compiledSql: validationCalc?.compiledSql ?? '',
            };
        } catch (e) {
            return {
                valid: false,
                error: e instanceof Error ? e.message : String(e),
            };
        }
    }

    async checkPreAggregateMatch(args: {
        account: Account;
        projectUuid: string;
        exploreName: string;
        metricQuery: MetricQuery;
        usePreAggregateCache: boolean;
    }): Promise<PreAggregateCheckResult> {
        if (!this.lightdashConfig.preAggregates.enabled) {
            throw new ForbiddenError('Pre-aggregates are not enabled');
        }

        const { account, projectUuid, exploreName, metricQuery } = args;

        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                    metadata: { exploreName },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const sourceExplore = await this.getExplore(
            account,
            projectUuid,
            exploreName,
        );

        const matchResult = preAggregateUtils.findMatch(
            metricQuery,
            sourceExplore,
        );

        const isUserBypass = args.usePreAggregateCache === false;
        if (isUserBypass || !matchResult.hit) {
            const miss =
                isUserBypass && matchResult.hit
                    ? ({
                          reason: PreAggregateMissReason.USER_BYPASS,
                          preAggregateName: matchResult.preAggregateName,
                      } satisfies PreAggregateMatchMiss)
                    : matchResult.miss;

            if (!miss) {
                throw new UnexpectedServerError(
                    'Pre-aggregate miss metadata is missing',
                );
            }

            return {
                hit: false,
                reason: miss,
            };
        }

        const preAggExploreName = getPreAggregateExploreName(
            sourceExplore.name,
            matchResult.preAggregateName,
        );
        try {
            await this.getExplore(account, projectUuid, preAggExploreName);

            const activeMaterialization =
                await this.preAggregateModel.getActiveMaterialization(
                    projectUuid,
                    preAggExploreName,
                );

            if (!activeMaterialization) {
                return {
                    hit: false,
                    reason: {
                        reason: PreAggregateMissReason.NO_ACTIVE_MATERIALIZATION,
                    },
                };
            }

            return {
                hit: true,
                preAggregateName: matchResult.preAggregateName,
                preAggregateExploreName: preAggExploreName,
            };
        } catch (error) {
            this.logger.error(
                `Failed to resolve pre-aggregate explore "${preAggExploreName}", falling back to source explore`,
                {
                    projectUuid,
                    sourceExploreName: sourceExplore.name,
                    preAggregateName: matchResult.preAggregateName,
                    preAggExploreName,
                    error: getErrorMessage(error),
                },
            );
            Sentry.captureException(error, {
                tags: {
                    projectUuid,
                    sourceExploreName: sourceExplore.name,
                    preAggregateName: matchResult.preAggregateName,
                },
                extra: { preAggExploreName },
            });
            return {
                hit: false,
                reason: {
                    reason: PreAggregateMissReason.EXPLORE_RESOLUTION_ERROR,
                },
            };
        }
    }

    /** @deprecated Only used by the deprecated runUnderlyingDataQuery endpoint; use AsyncQueryService.executeAsyncUnderlyingDataQuery instead. */
    async runUnderlyingDataQuery(
        account: Account,
        metricQuery: MetricQuery,
        projectUuid: string,
        exploreName: string,
        csvLimit: number | null | undefined,
        context: QueryExecutionContext = QueryExecutionContext.VIEW_UNDERLYING_DATA,
    ): Promise<ApiQueryResults> {
        assertIsAccountWithOrg(account);
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('UnderlyingData', {
                    organizationUuid,
                    projectUuid,
                    metadata: { exploreName },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const queryTags: RunQueryTags = {
            ...this.getUserQueryTags(account),
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            explore_name: exploreName,
            query_context: context,
        };

        return this.runQueryAndFormatRows({
            account,
            metricQuery,
            projectUuid,
            exploreName,
            csvLimit,
            context,
            queryTags,
            chartUuid: undefined,
        });
    }

    async runViewChartQuery({
        account,
        chartUuid,
        versionUuid,
        invalidateCache,
        context = QueryExecutionContext.CHART,
    }: {
        account: Account;
        chartUuid: string;
        versionUuid?: string;
        invalidateCache?: boolean;
        context?: QueryExecutionContext;
    }): Promise<ApiQueryResults> {
        assertIsAccountWithOrg(account);

        const savedChart = await this.savedChartModel.get(
            chartUuid,
            versionUuid,
        );
        const { organizationUuid, projectUuid } = savedChart;

        const [spaceCtx, explore] = await Promise.all([
            this.spacePermissionService.getSpaceAccessContext(
                account.user.id,
                savedChart.spaceUuid,
            ),
            this.getExplore(
                account,
                projectUuid,
                savedChart.tableName,
                organizationUuid,
            ),
        ]);

        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('SavedChart', {
                    organizationUuid: spaceCtx.organizationUuid,
                    projectUuid: spaceCtx.projectUuid,
                    inheritsFromOrgOrProject: spaceCtx.inheritsFromOrgOrProject,
                    access: spaceCtx.access,
                    metadata: {
                        savedChartUuid: chartUuid,
                        savedChartName: savedChart.name,
                    },
                }),
            ) ||
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                    metadata: { chartUuid, versionUuid },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const { metricQuery } = savedChart;

        const queryTags: RunQueryTags = {
            ...this.getUserQueryTags(account),
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            chart_uuid: chartUuid,
            explore_name: savedChart.tableName,
            query_context: context,
        };

        const { cacheMetadata, rows, fields } =
            await this.runQueryAndFormatRows({
                account,
                metricQuery,
                projectUuid,
                exploreName: savedChart.tableName,
                csvLimit: undefined,
                context,
                queryTags,
                invalidateCache,
                explore,
                chartUuid,
            });

        return {
            metricQuery,
            cacheMetadata,
            rows,
            fields,
        };
    }

    /** @deprecated Only used by the deprecated chart-and-results endpoint; use AsyncQueryService.executeAsyncDashboardChartQuery instead. */
    async getChartAndResults({
        account,
        chartUuid,
        dashboardFilters,
        invalidateCache,
        dashboardSorts,
        dateZoom,
        dashboardUuid,
        autoRefresh,
        context = QueryExecutionContext.DASHBOARD,
    }: {
        account: Account;
        chartUuid: string;
        dashboardUuid: string;
        dashboardFilters: DashboardFilters;
        invalidateCache?: boolean;
        dashboardSorts: SortField[];
        dateZoom?: DateZoom;
        autoRefresh?: boolean;
        context?: QueryExecutionContext;
    }): Promise<ApiChartAndResults> {
        assertIsAccountWithOrg(account);

        const savedChart = await this.savedChartModel.get(chartUuid);
        const { organizationUuid, projectUuid } = savedChart;

        const [spaceCtx, explore] = await Promise.all([
            this.spacePermissionService.getSpaceAccessContext(
                account.user.id,
                savedChart.spaceUuid,
            ),
            this.getExplore(
                account,
                projectUuid,
                savedChart.tableName,
                organizationUuid,
            ),
        ]);

        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('SavedChart', {
                    organizationUuid: spaceCtx.organizationUuid,
                    projectUuid: spaceCtx.projectUuid,
                    inheritsFromOrgOrProject: spaceCtx.inheritsFromOrgOrProject,
                    access: spaceCtx.access,
                    metadata: {
                        savedChartUuid: chartUuid,
                        savedChartName: savedChart.name,
                        dashboardUuid,
                    },
                }),
            ) ||
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                    metadata: { chartUuid, dashboardUuid },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.analyticsModel.addChartViewEvent(
            savedChart.uuid,
            account.user.id,
        );

        const availableFieldIds = getAvailableFilterFieldIds(explore);
        const appliedDashboardFilters = {
            dimensions: getDashboardFilterRulesForTables(
                availableFieldIds,
                dashboardFilters.dimensions,
            ),
            metrics: getDashboardFilterRulesForTables(
                availableFieldIds,
                dashboardFilters.metrics,
            ),
            tableCalculations: getDashboardFilterRulesForTables(
                availableFieldIds,
                dashboardFilters.tableCalculations,
            ),
        };

        const metricQueryWithDashboardOverrides: MetricQuery = {
            ...addDashboardFiltersToMetricQuery(
                savedChart.metricQuery,
                appliedDashboardFilters,
                explore,
            ),
            sorts:
                dashboardSorts && dashboardSorts.length > 0
                    ? dashboardSorts
                    : savedChart.metricQuery.sorts,
        };

        const queryTags: RunQueryTags = {
            ...this.getUserQueryTags(account),
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            chart_uuid: chartUuid,
            dashboard_uuid: dashboardUuid,
            explore_name: explore.name,
            query_context: context,
        };

        const exploreDimensions = getDimensions(explore);

        const { cacheMetadata, rows, fields } =
            await this.runQueryAndFormatRows({
                account,
                metricQuery: metricQueryWithDashboardOverrides,
                projectUuid,
                exploreName: savedChart.tableName,
                csvLimit: undefined,
                context: autoRefresh
                    ? QueryExecutionContext.AUTOREFRESHED_DASHBOARD
                    : context,
                queryTags,
                invalidateCache,
                explore,
                dateZoom,
                chartUuid,
            });

        const metricQueryDimensions = [
            ...metricQueryWithDashboardOverrides.dimensions,
            ...(metricQueryWithDashboardOverrides.customDimensions ?? []),
        ];

        const xAxisField = isCartesianChartConfig(savedChart.chartConfig.config)
            ? savedChart.chartConfig.config.layout.xField
            : undefined;

        const hasADateDimension = xAxisField
            ? exploreDimensions.find(
                  (c) => getItemId(c) === xAxisField && isDateItem(c),
              )
            : exploreDimensions.find(
                  (c) =>
                      metricQueryDimensions.includes(getItemId(c)) &&
                      isDateItem(c),
              );

        if (hasADateDimension) {
            metricQueryWithDashboardOverrides.metadata = {
                hasADateDimension: {
                    name: hasADateDimension.name,
                    label: hasADateDimension.label,
                    table: hasADateDimension.table,
                },
            };
        }

        return {
            chart: {
                ...savedChart,
                inheritsFromOrgOrProject: spaceCtx.inheritsFromOrgOrProject,
                access: spaceCtx.access,
            },
            explore,
            metricQuery: metricQueryWithDashboardOverrides,
            cacheMetadata,
            rows,
            appliedDashboardFilters,
            fields,
        };
    }

    async runExploreQuery(
        account: Account,
        metricQuery: MetricQuery,
        projectUuid: string,
        exploreName: string,
        csvLimit: number | null | undefined,
        dateZoom?: DateZoom,
        context: QueryExecutionContext = QueryExecutionContext.EXPLORE,
    ): Promise<ApiQueryResults> {
        assertIsAccountWithOrg(account);

        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Explore', {
                    organizationUuid,
                    projectUuid,
                    metadata: { exploreName },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const queryTags: RunQueryTags = {
            ...this.getUserQueryTags(account),
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            explore_name: exploreName,
            query_context: context,
        };

        const explore = await this.getExplore(
            account,
            projectUuid,
            exploreName,
            organizationUuid,
        );

        return this.runQueryAndFormatRows({
            account,
            metricQuery,
            projectUuid,
            exploreName,
            explore,
            csvLimit,
            context: QueryExecutionContext.EXPLORE,
            queryTags,
            dateZoom,
            chartUuid: undefined,
            invalidateCache: true, // Do not cache results for explore queries
        });
    }

    private async runQueryAndFormatRows({
        account,
        metricQuery,
        projectUuid,
        exploreName,
        csvLimit,
        context,
        queryTags,
        invalidateCache,
        explore: validExplore,
        dateZoom,
        chartUuid,
    }: {
        account: Account;
        metricQuery: MetricQuery;
        projectUuid: string;
        exploreName: string;
        csvLimit: number | null | undefined;
        context: QueryExecutionContext;
        queryTags: RunQueryTags;
        invalidateCache?: boolean;
        explore?: Explore;
        dateZoom?: DateZoom;
        chartUuid: string | undefined;
    }): Promise<ApiQueryResults> {
        return wrapSentryTransaction(
            'ProjectService.runQueryAndFormatRows',
            {},
            async (span) => {
                const explore =
                    validExplore ??
                    (await this.getExplore(account, projectUuid, exploreName));

                const {
                    rows,
                    cacheMetadata,
                    fields,
                    displayTimezone,
                    warehouseType,
                } = await this.runMetricQuery({
                    account,
                    metricQuery,
                    projectUuid,
                    exploreName,
                    csvLimit,
                    context,
                    queryTags,
                    invalidateCache,
                    explore,
                    dateZoom,
                    chartUuid,
                });
                span.setAttribute('rows', rows.length);

                this.logger.info(
                    `Query returned ${rows.length} rows and ${
                        Object.keys(rows?.[0] || {}).length
                    } columns with querytags ${JSON.stringify(queryTags)}`,
                );
                span.setAttribute('warehouse', warehouseType);

                // If there are more than 500 rows, we need to format them in a background job
                const formattedRows = await wrapSentryTransaction<ResultRow[]>(
                    'ProjectService.runQueryAndFormatRows.formatRows',
                    {
                        rows: rows.length,
                        warehouse: warehouseType,
                    },
                    async (formatRowsSpan) => {
                        const useWorker = rows.length > 500;
                        this.logger.info(`Formatting ${rows.length} rows`);
                        const { result } = await measureTime(
                            async () => {
                                formatRowsSpan.setAttribute(
                                    'useWorker',
                                    useWorker,
                                );

                                return useWorker
                                    ? runWorkerThread<ResultRow[]>(
                                          new Worker(
                                              './dist/services/ProjectService/formatRows.js',
                                              {
                                                  workerData: {
                                                      rows,
                                                      itemMap: fields,
                                                      timezone: displayTimezone,
                                                  },
                                              },
                                          ),
                                      )
                                    : formatRows(
                                          rows,
                                          fields,
                                          undefined,
                                          undefined,
                                          displayTimezone,
                                      );
                            },
                            'formatRows',
                            this.logger,
                            {
                                useWorker,
                            },
                        );

                        return result;
                    },
                );

                this.logger.info(
                    `Formatted rows returned ${formattedRows.length} rows and ${
                        Object.keys(formattedRows?.[0] || {}).length
                    } columns`,
                );
                return {
                    rows: formattedRows,
                    metricQuery,
                    cacheMetadata,
                    fields,
                };
            },
        );
    }

    async getResultsFromCacheOrWarehouse({
        projectUuid,
        userUuid,
        user,
        context,
        warehouseClient,
        query,
        metricQuery,
        resolvedTimezone,
        queryTags,
        invalidateCache,
    }: {
        projectUuid: string;
        userUuid: string | null;
        resolvedTimezone: string;
        user: Pick<
            LightdashUser,
            'userUuid' | 'organizationUuid' | 'organizationName'
        >;
        context: QueryExecutionContext;
        warehouseClient: WarehouseClient;
        query: AnyType;
        metricQuery: MetricQuery;
        queryTags: Omit<RunQueryTags, 'query_context'>; // We already have context in the context parameter
        invalidateCache?: boolean;
    }): Promise<{
        rows: Record<string, AnyType>[];
        cacheMetadata: CacheMetadata;
    }> {
        return wrapSentryTransaction(
            'ProjectService.getResultsFromCacheOrWarehouse',
            {},
            async (span) => {
                // Key on the resolved timezone (not the raw setting) so the
                // cache reflects project/user fallbacks and invalidates when the
                // project timezone changes.
                const hashParts = [
                    projectUuid,
                    userUuid,
                    query,
                    resolvedTimezone,
                ];
                const queryHash = buildCacheHash(hashParts);

                span.setAttribute('queryHash', queryHash);
                span.setAttribute('cacheHit', false);

                const { enabled: resultsCacheEnabled } =
                    await this.featureFlagModel.get({
                        user,
                        featureFlagId: FeatureFlags.ResultsCacheEnabled,
                    });

                if (resultsCacheEnabled && !invalidateCache) {
                    const cacheEntryMetadata = await this.s3CacheClient
                        .getResultsMetadata(queryHash)
                        .catch((e) => undefined); // ignore since error is tracked in fileStorageClient

                    if (
                        cacheEntryMetadata?.LastModified &&
                        new Date().getTime() -
                            cacheEntryMetadata.LastModified.getTime() <
                            this.lightdashConfig.results.cacheStateTimeSeconds *
                                1000
                    ) {
                        this.logger.debug(
                            `Getting data from cache, key: ${queryHash}`,
                        );
                        const { result: cacheEntry } = await measureTime(
                            () => this.s3CacheClient.getResults(queryHash),
                            'getResultsFromCache',
                            this.logger,
                        );
                        const stringResults =
                            await cacheEntry.Body?.transformToString();
                        if (stringResults) {
                            try {
                                span.setAttribute('cacheHit', true);
                                return {
                                    rows: JSON.parse(stringResults).rows,
                                    cacheMetadata: {
                                        cacheHit: true,
                                        cacheUpdatedTime:
                                            cacheEntryMetadata?.LastModified,
                                    },
                                };
                            } catch (e) {
                                this.logger.error(
                                    'Error parsing cache results:',
                                    e,
                                );
                            }
                        }
                    }
                }

                this.logger.debug(
                    `Run query against warehouse warehouse with timezone ${metricQuery.timezone}`,
                );

                const warehouseResults = await wrapSentryTransaction(
                    'runWarehouseQuery',
                    {
                        query,
                        queryTags: JSON.stringify(queryTags),
                        context,
                        metricQuery: JSON.stringify(metricQuery),
                        type: warehouseClient.credentials.type,
                    },
                    async () => {
                        try {
                            const { result } = await measureTime(
                                () =>
                                    warehouseClient.runQuery(
                                        query,
                                        queryTags,
                                        // metricQuery.timezone,
                                    ),
                                'runWarehouseQuery',
                                this.logger,
                                context,
                            );

                            return result;
                        } catch (e) {
                            this.logger.warn(
                                `Error running "${
                                    warehouseClient.credentials.type
                                }" warehouse query:
                                "${query}"
                                with query tags:
                                ${JSON.stringify(queryTags)}`,
                            );
                            throw e;
                        }
                    },
                );

                if (resultsCacheEnabled) {
                    this.logger.debug(
                        `Writing data to cache with key ${queryHash}`,
                    );
                    const buffer = Buffer.from(
                        JSON.stringify(warehouseResults),
                    );
                    // fire and forget
                    this.s3CacheClient
                        .uploadResults(queryHash, buffer, queryTags)
                        .catch((e) => undefined); // ignore since error is tracked in fileStorageClient
                }

                return {
                    rows: warehouseResults.rows,
                    cacheMetadata: { cacheHit: false },
                };
            },
        );
    }

    async runMetricQuery({
        account,
        metricQuery,
        projectUuid,
        exploreName,
        csvLimit,
        context,
        queryTags,
        invalidateCache,
        explore: loadedExplore,
        dateZoom,
        chartUuid,
        parameters,
        userAttributeOverrides,
    }: {
        account: Account;
        metricQuery: MetricQuery;
        projectUuid: string;
        exploreName: string;
        csvLimit: number | null | undefined;
        context: QueryExecutionContext;
        queryTags: Omit<RunQueryTags, 'query_context'>; // We already have context in the context parameter
        invalidateCache?: boolean;
        explore?: Explore;
        dateZoom?: DateZoom;
        chartUuid: string | undefined; // for analytics
        parameters?: ParametersValuesMap;
        userAttributeOverrides?: UserAttributeValueMap; // EXPERIMENTAL: used to override user attributes for MCP
    }): Promise<{
        rows: Record<string, AnyType>[];
        cacheMetadata: CacheMetadata;
        fields: ItemsMap;
        displayTimezone: string | undefined;
        warehouseType: WarehouseTypes;
    }> {
        return wrapSentryTransaction(
            'ProjectService.runMetricQuery',
            {},
            async (span) => {
                try {
                    assertIsAccountWithOrg(account);

                    const { organizationUuid } =
                        await this.projectModel.getSummary(projectUuid);

                    const auditedAbility = this.createAuditedAbility(account);
                    if (
                        account.isJwtUser() ||
                        auditedAbility.cannot(
                            'view',
                            subject('Project', {
                                organizationUuid,
                                projectUuid,
                                metadata: { chartUuid, exploreName },
                            }),
                        )
                    ) {
                        throw new ForbiddenError();
                    }

                    const { maxLimit, csvCellsLimit } =
                        await resolveOrganizationExportLimits(
                            this.organizationSettingsModel,
                            this.lightdashConfig.query,
                            organizationUuid,
                        );

                    const metricQueryWithLimit = applyMetricQueryLimit(
                        metricQuery,
                        csvLimit,
                        csvCellsLimit,
                        maxLimit,
                    );

                    const explore =
                        loadedExplore ??
                        (await this.getExplore(
                            account,
                            projectUuid,
                            exploreName,
                        ));

                    const warehouseCredentials =
                        await this.getWarehouseCredentials({
                            projectUuid,
                            userId: account.user.id,
                            isRegisteredUser: account.isRegisteredUser(),
                            isServiceAccount: account.isServiceAccount(),
                        });
                    const { warehouseClient, sshTunnel } =
                        await this._getWarehouseClient(
                            projectUuid,
                            warehouseCredentials,
                            {
                                snowflakeVirtualWarehouse: explore.warehouse,
                                databricksCompute: explore.databricksCompute,
                            },
                        );

                    const { userAttributes, intrinsicUserAttributes } =
                        await this.getUserAttributes({
                            account,
                        });

                    const mergedUserAttributes = userAttributeOverrides
                        ? {
                              ...userAttributes,
                              ...userAttributeOverrides,
                          }
                        : userAttributes;

                    const availableParameterDefinitions =
                        await this.getAvailableParameters(projectUuid, explore);

                    const projectTimezone =
                        await this.getQueryTimezoneForProject(projectUuid);
                    const timezone = resolveQueryTimezone({
                        sessionTimezone: null,
                        metricQuery: metricQueryWithLimit,
                        projectTimezone,
                        userTimezone: getAccountUserTimezone(account),
                    });
                    const useTimezoneAwareDateTrunc =
                        await this.isTimezoneSupportEnabled({
                            userUuid: account.user.id,
                            organizationUuid:
                                account.organization.organizationUuid,
                        });

                    const fullQuery = new QueryComposer(
                        { metricQuery: metricQueryWithLimit },
                        {
                            explore,
                            warehouseSqlBuilder: warehouseClient,
                            intrinsicUserAttributes,
                            userAttributes: mergedUserAttributes,
                            timezone,
                            dateZoom,
                            parameters,
                            availableParameterDefinitions,
                            pivotDimensions:
                                metricQueryWithLimit.pivotDimensions,
                            useTimezoneAwareDateTrunc,
                            columnTimezone: getColumnTimezone(
                                warehouseClient.credentials,
                            ),
                            dataTimezone:
                                warehouseClient.credentials.dataTimezone,
                        },
                    ).compile();

                    const { query } = fullQuery;

                    const resolvedMetricOverrides =
                        getMetricOverridesWithPopInheritance(metricQuery);

                    const fieldsWithOverrides: ItemsMap = Object.fromEntries(
                        Object.entries(fullQuery.fields).map(([key, value]) => {
                            // Check for metric or dimension overrides. PoP
                            // metric overrides are inherited from their base
                            // metric by the shared util above.
                            const override =
                                resolvedMetricOverrides[key] ||
                                metricQuery.dimensionOverrides?.[key];
                            const formatOptions = override?.formatOptions;
                            if (formatOptions) {
                                return [
                                    key,
                                    {
                                        ...value,
                                        ...getFieldFormatOverrideProps(
                                            formatOptions,
                                        ),
                                    },
                                ];
                            }
                            return [key, value];
                        }),
                    );

                    const onboardingFlow = await this.getOnboardingFlow({
                        userUuid: account.user.id,
                        organizationUuid: account.organization.organizationUuid,
                    });
                    const onboardingRecord =
                        await this.onboardingModel.getByOrganizationUuid(
                            account.organization.organizationUuid,
                        );
                    if (!onboardingRecord.ranQueryAt) {
                        await this.onboardingModel.update(
                            account.organization.organizationUuid,
                            {
                                ranQueryAt: new Date(),
                            },
                        );
                        this.analytics.trackAccount(account, {
                            event: 'onboarding.step_completed',
                            properties: {
                                step: 'first_query',
                                stepIndex: 5,
                                onboardingFlow,
                                organizationId:
                                    account.organization.organizationUuid,
                            },
                        });
                    }

                    this.analytics.trackAccount(account, {
                        event: 'query.executed',
                        properties: {
                            organizationId: organizationUuid,
                            projectId: projectUuid,
                            context,
                            onboardingFlow,
                            ...ProjectService.getMetricQueryExecutionProperties(
                                {
                                    metricQuery: metricQueryWithLimit,
                                    queryTags,
                                    chartUuid,
                                    dateZoom,
                                    explore,
                                    parameters,
                                },
                            ),
                        },
                    });
                    this.logger.debug(
                        `Fetch query results from cache or warehouse`,
                    );
                    span.setAttribute('generatedSql', query);

                    span.setAttribute('lightdash.projectUuid', projectUuid);
                    span.setAttribute(
                        'warehouse.type',
                        warehouseClient.credentials.type,
                    );
                    const userUuid = getCacheUserUuid(
                        warehouseCredentials,
                        account.user.id,
                    );
                    const { rows, cacheMetadata } =
                        await this.getResultsFromCacheOrWarehouse({
                            projectUuid,
                            userUuid,
                            user: {
                                userUuid: account.user.id,
                                organizationUuid:
                                    account.organization.organizationUuid,
                                organizationName: account.organization.name,
                            },
                            context,
                            warehouseClient,
                            metricQuery: metricQueryWithLimit,
                            resolvedTimezone: timezone,
                            query,
                            queryTags,
                            invalidateCache,
                        });
                    await sshTunnel.disconnect();
                    return {
                        rows,
                        cacheMetadata,
                        fields: fieldsWithOverrides,
                        displayTimezone: useTimezoneAwareDateTrunc
                            ? timezone
                            : undefined,
                        warehouseType: warehouseClient.credentials.type,
                    };
                } catch (e) {
                    span.setStatus({
                        code: 2, // ERROR
                        message: getErrorMessage(e),
                    });
                    throw e;
                } finally {
                    span.end();
                }
            },
        );
    }

    async runSqlQuery(
        user: SessionUser,
        projectUuid: string,
        sql: string,
    ): Promise<ApiSqlQueryResults> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('SqlRunner', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        this.analytics.track({
            userId: user.userUuid,
            event: 'query.executed',
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                context: QueryExecutionContext.SQL_RUNNER,
                usingStreaming: false,
                onboardingFlow: await this.getOnboardingFlow(user),
            },
        });
        const { warehouseClient, sshTunnel } = await this._getWarehouseClient(
            projectUuid,
            await this.getWarehouseCredentials({
                projectUuid,
                userId: user.userUuid,
                isRegisteredUser: true,
            }),
        );
        this.logger.debug(`Run query against warehouse`);
        const queryTags: RunQueryTags = {
            organization_uuid: organizationUuid,
            user_uuid: user.userUuid,
            query_context: QueryExecutionContext.SQL_RUNNER,
        };

        const { maxLimit } = await resolveOrganizationExportLimits(
            this.organizationSettingsModel,
            this.lightdashConfig.query,
            organizationUuid,
        );

        // enforce limit for current SQL queries as it may crash server. We are working on a new SQL runner that supports streaming
        const cteWithLimit = applyLimitToSqlQuery({
            sqlQuery: sql,
            limit: maxLimit,
        });

        const results = await warehouseClient.runQuery(cteWithLimit, queryTags);
        await sshTunnel.disconnect();
        return results;
    }

    // TODO: consider removing this method in milestone #212
    // TODO: getWarehouseCredentials could be moved to a client WarehouseClientManager. However, this client shouldn't be using a model. We know that the warehouse client method shouldn't be in a model, but instead it should be its own client.
    async streamSqlQueryIntoFile({
        userUuid,
        projectUuid,
        sql,
        limit,
        sqlChartUuid,
        context,
    }: SqlRunnerPayload): Promise<{
        fileUrl: string;
        columns: VizColumn[];
    }> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const query = applyLimitToSqlQuery({ sqlQuery: sql, limit });

        this.analytics.track({
            userId: userUuid,
            event: 'query.executed',
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                context: context as QueryExecutionContext,
                sqlChartId: sqlChartUuid,
                usingStreaming: true,
                onboardingFlow: await this.getOnboardingFlow({
                    userUuid,
                    organizationUuid,
                }),
            },
        });
        const { warehouseClient, sshTunnel } = await this._getWarehouseClient(
            projectUuid,
            await this.getWarehouseCredentials({
                projectUuid,
                userId: userUuid,
                isRegisteredUser: true,
            }),
        );
        this.logger.debug(`Stream query against warehouse`);
        const queryTags: RunQueryTags = {
            organization_uuid: organizationUuid,
            user_uuid: userUuid,
            query_context: context,
        };

        const columns: VizColumn[] = [];

        const fileUrl = await this.downloadFileModel.streamFunction(
            this.fileStorageClient,
        )(
            `${this.lightdashConfig.siteUrl}/api/v1/projects/${projectUuid}/sqlRunner/results`,
            async (writer) => {
                await warehouseClient.streamQuery(
                    query,
                    async ({ rows, fields }) => {
                        if (!columns.length) {
                            // Get column types from first row of results
                            columns.push(
                                ...Object.keys(fields).map((fieldName) => ({
                                    reference: fieldName,
                                    type: fields[fieldName].type,
                                })),
                            );
                        }

                        rows.forEach(writer);
                    },
                    {
                        tags: queryTags,
                    },
                );
            },
            this.fileStorageClient,
        );

        await sshTunnel.disconnect();

        return { fileUrl, columns };
    }

    async pivotQueryWorkerTask({
        userUuid,
        projectUuid,
        sql,
        limit,
        sqlChartUuid,
        context,
        indexColumn,
        valuesColumns,
        groupByColumns,
        sortBy,
    }: SqlRunnerPivotQueryPayload): Promise<
        Omit<PivotChartData, 'results' | 'columns'>
    > {
        const indexColumns = normalizeIndexColumns(indexColumn);
        if (indexColumns.length === 0) {
            throw new ParameterError('Index column is required');
        }
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const warehouseCredentials = await this.getWarehouseCredentials({
            projectUuid,
            userId: userUuid,
            isRegisteredUser: true,
        });

        this.analytics.track({
            userId: userUuid,
            event: 'query.executed',
            properties: {
                organizationId: organizationUuid,
                projectId: projectUuid,
                context: context as QueryExecutionContext,
                sqlChartId: sqlChartUuid,
                usingStreaming: true,
                onboardingFlow: await this.getOnboardingFlow({
                    userUuid,
                    organizationUuid,
                }),
            },
        });
        const { warehouseClient, sshTunnel } = await this._getWarehouseClient(
            projectUuid,
            warehouseCredentials,
        );

        // Apply limit and pivot to the SQL query
        const pivotQueryBuilder = new PivotQueryBuilder(
            sql,
            {
                indexColumn: indexColumns,
                valuesColumns,
                groupByColumns,
                sortBy,
            },
            warehouseClient,
            limit,
        );

        const pivotedSql = pivotQueryBuilder.toSql({
            columnLimit: this.lightdashConfig.pivotTable.maxColumnLimit,
        });

        this.logger.debug(`Stream query against warehouse`);
        const queryTags: RunQueryTags = {
            organization_uuid: organizationUuid,
            user_uuid: userUuid,
            query_context: context,
        };

        const columns: VizColumn[] = [];
        let currentRowIndex = 0;
        let currentTransformedRow: ResultRow | undefined;
        const valuesColumnData = new Map<string, PivotValuesColumn>();

        let columnCount: undefined | number;

        const fileUrl = await this.downloadFileModel.streamFunction(
            this.fileStorageClient,
        )(
            `${this.lightdashConfig.siteUrl}/api/v1/projects/${projectUuid}/sqlRunner/results`,
            async (writer) => {
                try {
                    await warehouseClient.streamQuery(
                        pivotedSql,
                        async ({ rows, fields }) => {
                            if ('total_columns' in rows[0]) {
                                columnCount = rows[0].total_columns;
                            }
                            if (
                                !groupByColumns ||
                                groupByColumns.length === 0
                            ) {
                                rows.forEach(writer);
                                return;
                            }

                            // columns appears unused
                            if (!columns.length) {
                                // Get column types from first row of results
                                columns.push(
                                    ...Object.keys(fields).map((fieldName) => ({
                                        reference: fieldName,
                                        type: fields[fieldName].type,
                                    })),
                                );
                            }

                            rows.forEach((row) => {
                                // Write rows to file in order of row_index. This is so that we can pivot the data later
                                if (currentRowIndex !== row.row_index) {
                                    if (currentTransformedRow) {
                                        writer(currentTransformedRow);
                                    }

                                    currentTransformedRow =
                                        indexColumns.reduce<ResultRow>(
                                            (acc, indexCol) => {
                                                acc[indexCol.reference] =
                                                    row[indexCol.reference];
                                                return acc;
                                            },
                                            {},
                                        );

                                    currentRowIndex = row.row_index;
                                }
                                // Suffix the value column with the group by columns to avoid collisions.
                                // E.g. if we have a row with the value 1 and the group by columns are ['a', 'b'],
                                // then the value column will be 'value_1_a_b'
                                const valueSuffix = groupByColumns
                                    ?.map((col) => row[col.reference])
                                    .join('_');
                                valuesColumns.forEach((col) => {
                                    const valueColumnReference = `${col.reference}_${col.aggregation}_${valueSuffix}`;
                                    valuesColumnData.set(valueColumnReference, {
                                        referenceField: col.reference, // The original y field name
                                        pivotColumnName: valueColumnReference, // The pivoted y field name and agg eg amount_avg_false
                                        aggregation: col.aggregation,
                                        pivotValues: groupByColumns?.map(
                                            (c) => ({
                                                referenceField: c.reference,
                                                value: row[c.reference],
                                            }),
                                        ),
                                    });
                                    currentTransformedRow =
                                        currentTransformedRow ?? {};
                                    currentTransformedRow[
                                        valueColumnReference
                                    ] =
                                        row[
                                            `${col.reference}_${col.aggregation}`
                                        ];
                                });
                            });
                        },
                        {
                            tags: queryTags,
                        },
                    );
                } catch (error) {
                    this.logger.error(
                        `Error running pivot query: ${error}\nSQL: ${pivotedSql}`,
                    );
                    throw error;
                }
                // Write the last row
                if (currentTransformedRow) {
                    writer(currentTransformedRow);
                }
            },
            this.fileStorageClient,
        );

        await sshTunnel.disconnect();

        const processedColumns =
            groupByColumns && groupByColumns.length > 0
                ? Array.from(valuesColumnData.values())
                : valuesColumns.map((col) => ({
                      referenceField: col.reference,
                      pivotColumnName: `${col.reference}_${col.aggregation}`,
                      aggregation: col.aggregation,
                      pivotValues: [],
                  }));

        return {
            queryUuid: undefined,
            fileUrl,
            valuesColumns: processedColumns,
            indexColumn: indexColumns,
            columnCount: Number(columnCount) || undefined,
        };
    }

    /** @deprecated Only used by the deprecated SQL runner results endpoint; use AsyncQueryService.getAsyncQueryResults instead. */
    async getFileStream(
        user: SessionUser,
        projectUuid: string,
        fileId: string,
    ): Promise<Readable> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                    metadata: { fileId },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const downloadFile =
            await this.downloadFileModel.getDownloadFile(fileId);
        switch (downloadFile.type) {
            case DownloadFileType.JSONL:
                return fs.createReadStream(downloadFile.path);
            case DownloadFileType.S3_JSONL:
                return this.fileStorageClient.getFileStream(downloadFile.path);
            default:
                throw new ParameterError('File is not a valid JSONL file');
        }
    }

    // Note: can't be private method as it is used in EE
    async _getFieldValuesMetricQuery({
        projectUuid,
        table,
        initialFieldId,
        search,
        limit,
        filters,
        organizationUuid: organizationUuidArg,
    }: {
        projectUuid: string;
        table: string;
        initialFieldId: string;
        search: string;
        limit: unknown;
        filters: AndFilterGroup | undefined;
        organizationUuid?: string;
    }) {
        const { organizationUuid } = organizationUuidArg
            ? { organizationUuid: organizationUuidArg }
            : await this.projectModel.getSummary(projectUuid);
        const { maxLimit } = await resolveOrganizationExportLimits(
            this.organizationSettingsModel,
            this.lightdashConfig.query,
            organizationUuid,
        );
        return getFieldValuesMetricQuery({
            projectUuid,
            table,
            initialFieldId,
            search,
            limit,
            maxLimit,
            filters,
            exploreResolver: this.projectModel,
        });
    }

    async searchFieldUniqueValues(
        user: SessionUser,
        projectUuid: string,
        table: string,
        initialFieldId: string,
        search: string,
        limit: unknown,
        filters: AndFilterGroup | undefined,
        forceRefresh: boolean = false,
        parameters?: ParametersValuesMap,
        userAttributeOverrides?: UserAttributeValueMap, // EXPERIMENTAL: used to override user attributes for MCP
        context: QueryExecutionContext = QueryExecutionContext.FILTER_AUTOCOMPLETE,
    ) {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const { metricQuery, explore, field, labelFieldId } =
            await this._getFieldValuesMetricQuery({
                projectUuid,
                table,
                initialFieldId,
                search,
                limit,
                filters,
                organizationUuid,
            });

        const [
            warehouseCredentials,
            { userAttributes, intrinsicUserAttributes },
            availableParameterDefinitions,
            combinedParameters,
            projectTimezone,
            useTimezoneAwareDateTrunc,
        ] = await Promise.all([
            this.getWarehouseCredentials({
                projectUuid,
                userId: user.userUuid,
                isRegisteredUser: true,
            }),
            this.getUserAttributes({ user }),
            this.getAvailableParameters(projectUuid, explore),
            this.combineParameters(projectUuid, explore, parameters),
            this.getQueryTimezoneForProject(projectUuid),
            this.isTimezoneSupportEnabled(user),
        ]);

        const { warehouseClient, sshTunnel } = await this._getWarehouseClient(
            projectUuid,
            warehouseCredentials,
            {
                snowflakeVirtualWarehouse: explore.warehouse,
                databricksCompute: explore.databricksCompute,
            },
        );

        const mergedUserAttributes = userAttributeOverrides
            ? {
                  ...userAttributes,
                  ...userAttributeOverrides,
              }
            : userAttributes;

        const timezone = resolveQueryTimezone({
            sessionTimezone: null,
            metricQuery,
            projectTimezone,
            userTimezone: user.timezone,
        });

        const { query } = new QueryComposer(
            { metricQuery },
            {
                explore,
                warehouseSqlBuilder: warehouseClient,
                intrinsicUserAttributes,
                userAttributes: mergedUserAttributes,
                timezone,
                parameters: combinedParameters,
                availableParameterDefinitions,
                useTimezoneAwareDateTrunc,
                columnTimezone: getColumnTimezone(warehouseClient.credentials),
            },
        ).compile();

        const isUserCacheEnabled =
            this.lightdashConfig.results.autocompleteEnabled && !!user.userUuid;

        const userUuid = getCacheUserUuid(warehouseCredentials, user.userUuid);

        const hashParts = [
            projectUuid,
            userUuid,
            'cache_autocomplete',
            query,
            timezone,
        ];
        const queryHash = buildCacheHash(hashParts);

        if (!forceRefresh && isUserCacheEnabled) {
            const stringResults = await this.s3CacheClient
                .getIfFresh(
                    queryHash,
                    this.lightdashConfig.results.cacheStateTimeSeconds,
                )
                .catch(() => undefined);
            if (stringResults) {
                try {
                    await sshTunnel.disconnect();
                    return JSON.parse(stringResults);
                } catch (e) {
                    this.logger.error(
                        'Error parsing autocomplete cache results:',
                        e,
                    );
                }
            }
        }

        const queryTags: RunQueryTags = {
            organization_uuid: organizationUuid,
            user_uuid: user.userUuid,
            project_uuid: projectUuid,
            explore_name: explore.name,
            query_context: context,
        };

        const { rows } = await warehouseClient.runQuery(query, queryTags);
        const valueFieldId = getItemId(field);
        const allResults: Set<string | number | boolean> = new Set();
        const resultsWithLabels: FilterAutocompleteValue[] = [];
        const seenLabeledValues = new Set<string>();
        for (const row of rows) {
            const value = row[valueFieldId];
            if (value !== null && value !== undefined) {
                allResults.add(value);
                if (labelFieldId) {
                    const valueKey = String(value);
                    if (!seenLabeledValues.has(valueKey)) {
                        seenLabeledValues.add(valueKey);
                        const rawLabel = row[labelFieldId];
                        resultsWithLabels.push({
                            value: valueKey,
                            label:
                                rawLabel !== null && rawLabel !== undefined
                                    ? String(rawLabel)
                                    : valueKey,
                        });
                    }
                }
            }
        }

        const resultsArray = Array.from(allResults);

        if (isUserCacheEnabled) {
            const searchResults = {
                search,
                results: resultsArray,
                ...(labelFieldId ? { resultsWithLabels } : {}),
                refreshedAt: new Date(),
                cached: true,
            };
            const buffer = Buffer.from(JSON.stringify(searchResults));
            this.s3CacheClient
                .uploadResults(queryHash, buffer, queryTags)
                .catch(() => undefined);
        }

        await sshTunnel.disconnect();

        this.analytics.track({
            event: 'field_value.search',
            userId: user.userUuid,
            properties: {
                projectId: projectUuid,
                fieldId: valueFieldId,
                searchCharCount: search.length,
                resultsCount: resultsArray.length,
                searchLimit: metricQuery.limit,
            },
        });

        return {
            search,
            results: resultsArray,
            ...(labelFieldId ? { resultsWithLabels } : {}),
            refreshedAt: new Date(),
            cached: false,
        };
    }

    private async getProjectContextFromAdapter({
        adapter,
        user,
        organizationUuid,
    }: {
        adapter: ProjectAdapter;
        user: Pick<SessionUser, 'userUuid'> &
            Partial<Pick<SessionUser, 'organizationName'>>;
        organizationUuid: string;
    }): Promise<ProjectContextEntry[] | undefined> {
        if (!this.projectContextModel) {
            return undefined;
        }

        const enabled = this.isProjectContextEnabled
            ? await this.isProjectContextEnabled({ user, organizationUuid })
            : false;
        if (!enabled) {
            return undefined;
        }
        return adapter.getProjectContext();
    }

    private async replaceProjectContext(
        projectUuid: string,
        entries: ProjectContextEntry[] | undefined,
    ): Promise<void> {
        if (!this.projectContextModel || entries === undefined) {
            return;
        }
        await this.projectContextModel.replaceEntriesForProject(
            projectUuid,
            entries,
        );
    }

    private async refreshTablesAndProjectConfig(
        user: Pick<SessionUser, 'userUuid'>,
        projectUuid: string,
        requestMethod: RequestMethod,
    ): Promise<{
        explores: (Explore | ExploreError)[];
        lightdashProjectConfig: LightdashProjectConfig;
        projectContext: ProjectContextEntry[] | undefined;
    }> {
        // Checks that project exists
        const project = await this.projectModel.get(projectUuid);

        // A preview of a CLI/NONE project has no dbt files to compile from.
        // Reuse the upstream project's already-compiled explores and config
        // so the preview mirrors the main project.
        if (
            project.dbtConnection.type === DbtProjectType.NONE &&
            project.upstreamProjectUuid
        ) {
            const { upstreamProjectUuid } = project;
            const [
                upstreamExplores,
                upstreamProject,
                upstreamParameters,
                upstreamTableGroups,
            ] = await Promise.all([
                this.projectModel.getAllExploresFromCache(upstreamProjectUuid),
                this.projectModel.get(upstreamProjectUuid),
                this.projectParametersModel.find(upstreamProjectUuid),
                this.projectModel.getTableGroups(upstreamProjectUuid),
            ]);
            return {
                explores: Object.values(upstreamExplores),
                lightdashProjectConfig: {
                    spotlight: DEFAULT_SPOTLIGHT_CONFIG,
                    parameters: Object.fromEntries(
                        upstreamParameters.map(({ name, config }) => [
                            name,
                            config,
                        ]),
                    ),
                    table_groups: upstreamTableGroups,
                    defaults: upstreamProject.projectDefaults,
                },
                projectContext: undefined,
            };
        }

        // Force refresh adapter (refetch git repos, check for changed credentials, etc.)
        // Might want to cache parts of this in future if slow
        const buildResult = await this.buildAdapter(projectUuid, user);
        const { sshTunnel } = buildResult;
        let { adapter } = buildResult;
        // Adapters built only to read a source's manifest (git clones); destroyed in finally.
        const manifestFetchAdapters: ProjectAdapter[] = [];
        try {
            // Multiple dbt sources: merge every source's manifest into one before
            // compiling, so cross-source ref()/joins resolve and the explore set is
            // the union of all sources. A project with zero registered sources runs
            // the unchanged single-source path (N=0 short-circuit / regression firewall).
            let dbtSourceCount = 1;
            adapter = await this.resolveCompileAdapter({
                projectUuid,
                organizationUuid: project.organizationUuid,
                userUuid: user.userUuid,
                primary: buildResult,
                manifestFetchAdapters,
                onDbtSourceCount: (count) => {
                    dbtSourceCount = count;
                },
            });
            const packages = await adapter.getDbtPackages();
            const trackingParams = {
                projectUuid,
                organizationUuid: project.organizationUuid,
                userUuid: user.userUuid,
            };
            const explores = await adapter.compileAllExplores(
                trackingParams,
                false, // loadSources
                this.lightdashConfig.partialCompilation.enabled,
            );
            this.analytics.track({
                event: 'project.compiled',
                userId: user.userUuid,
                properties: {
                    requestMethod,
                    projectId: projectUuid,
                    projectName: project.name,
                    projectType: project.dbtConnection.type,
                    warehouseType: project.warehouseConnection?.type,
                    modelsCount: explores.length,
                    modelsWithErrorsCount:
                        explores.filter(isExploreError).length,
                    modelsWithGroupLabelCount: explores.filter(
                        ({ groupLabel }) => !!groupLabel,
                    ).length,
                    metricsCount: explores.reduce<number>((acc, explore) => {
                        if (!isExploreError(explore)) {
                            return acc + getMetrics(explore).length;
                        }
                        return acc;
                    }, 0),
                    packagesCount: packages
                        ? Object.keys(packages).length
                        : undefined,
                    roundCount: explores.reduce<number>((acc, explore) => {
                        if (!isExploreError(explore)) {
                            return (
                                acc +
                                getMetrics(explore).filter(
                                    ({ round }) => round !== undefined,
                                ).length +
                                getDimensions(explore).filter(
                                    ({ round }) => round !== undefined,
                                ).length
                            );
                        }
                        return acc;
                    }, 0),
                    urlsCount: explores.reduce<number>((acc, explore) => {
                        if (!isExploreError(explore)) {
                            return (
                                acc +
                                getFields(explore)
                                    .map((field) => (field.urls || []).length)
                                    .reduce((a, b) => a + b, 0)
                            );
                        }
                        return acc;
                    }, 0),
                    formattedFieldsCount: explores.reduce<number>(
                        (acc, explore) => {
                            try {
                                if (!isExploreError(explore)) {
                                    const filteredExplore = {
                                        ...explore,
                                        tables: {
                                            [explore.baseTable]:
                                                explore.tables[
                                                    explore.baseTable
                                                ],
                                        },
                                    };

                                    return (
                                        acc +
                                        getFields(filteredExplore).filter(
                                            ({ format }) =>
                                                format !== undefined,
                                        ).length
                                    );
                                }
                            } catch (e) {
                                this.logger.error(
                                    `Unable to reduce formattedFieldsCount. ${e}`,
                                );
                            }
                            return acc;
                        },
                        0,
                    ),
                    modelsWithSqlFiltersCount: explores.reduce<number>(
                        (acc, explore) => {
                            if (
                                explore.tables &&
                                explore.baseTable &&
                                explore.tables[explore.baseTable].sqlWhere !==
                                    undefined
                            )
                                return acc + 1;
                            return acc;
                        },
                        0,
                    ),
                    columnAccessFiltersCount: explores.reduce<number>(
                        (acc, explore) => {
                            if (!isExploreError(explore)) {
                                return (
                                    acc +
                                    getDimensions(explore).filter(
                                        ({ requiredAttributes }) =>
                                            requiredAttributes !== undefined,
                                    ).length
                                );
                            }
                            return acc;
                        },
                        0,
                    ),
                    additionalDimensionsCount: explores.reduce<number>(
                        (acc, explore) => {
                            if (!isExploreError(explore)) {
                                return (
                                    acc +
                                    Object.values(
                                        explore.tables[explore.baseTable]
                                            .dimensions,
                                    ).filter(
                                        (field) => field.isAdditionalDimension,
                                    ).length
                                );
                            }
                            return acc;
                        },
                        0,
                    ),
                    dbtSourceCount,
                },
            });

            const lightdashProjectConfig =
                await adapter.getLightdashProjectConfig(trackingParams);
            const projectContext = await this.getProjectContextFromAdapter({
                adapter,
                user,
                organizationUuid: project.organizationUuid,
            });

            return { explores, lightdashProjectConfig, projectContext };
        } catch (e) {
            if (!(e instanceof LightdashError)) {
                Sentry.captureException(e);
            }
            this.logger.error(
                `Failed to compile all explores:${e instanceof Error ? e.stack : e}`,
            );
            const errorResponse =
                e instanceof Error
                    ? errorHandler(e)
                    : new UnexpectedServerError(
                          `Unknown error during refreshAllTables: ${typeof e}`,
                      );
            this.analytics.track({
                event: 'project.error',
                userId: user.userUuid,
                properties: {
                    requestMethod,
                    projectId: projectUuid,
                    name: errorResponse.name,
                    statusCode: errorResponse.statusCode,
                    projectType: project.dbtConnection.type,
                    warehouseType: project.warehouseConnection?.type,
                },
            });
            throw errorResponse;
        } finally {
            await adapter.destroy();
            await sshTunnel.disconnect();
            // Clean up the per-source git clones used only to read manifests.
            await Promise.all(
                manifestFetchAdapters.map((manifestAdapter) =>
                    manifestAdapter.destroy().catch((destroyError) => {
                        this.logger.warn(
                            'Failed to destroy a dbt source adapter after manifest merge',
                            { error: destroyError },
                        );
                    }),
                ),
            );
        }
    }

    async getJobStatus(jobUuid: string, user: SessionUser): Promise<Job> {
        const job = await this.jobModel.get(jobUuid);

        const auditedAbility = this.createAuditedAbility(user);
        if (job.projectUuid) {
            const { organizationUuid } = await this.projectModel.getSummary(
                job.projectUuid,
            );
            if (
                auditedAbility.cannot(
                    'view',
                    subject('Project', {
                        organizationUuid,
                        projectUuid: job.projectUuid,
                        metadata: { jobUuid },
                    }),
                )
            ) {
                throw new NotFoundError(`Cannot find job`);
            }
        } else if (
            auditedAbility.cannot(
                'view',
                subject('Job', {
                    userUuid: job.userUuid,
                    organizationUuid: user.organizationUuid!,
                    metadata: { jobUuid },
                }),
            )
        ) {
            throw new NotFoundError(`Cannot find job`);
        }

        return job;
    }

    private async assertCanRefreshPreAggregates(
        user: SessionUser,
        projectUuid: string,
    ): Promise<{ organizationUuid: string }> {
        const { organizationUuid, type } =
            await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'create',
                subject('Job', { organizationUuid, projectUuid }),
            ) ||
            auditedAbility.cannot(
                'manage',
                subject('CompileProject', {
                    organizationUuid,
                    projectUuid,
                    type,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        return { organizationUuid };
    }

    async refreshPreAggregates(
        user: SessionUser,
        projectUuid: string,
    ): Promise<{ jobIds: string[] }> {
        const { organizationUuid } = await this.assertCanRefreshPreAggregates(
            user,
            projectUuid,
        );

        const preAggregateDefinitions =
            await this.preAggregateModel.getPreAggregateDefinitionsForProject(
                projectUuid,
            );

        if (preAggregateDefinitions.length === 0) {
            throw new NotFoundError(
                'No pre-aggregate definitions found for this project. Recompile the project to populate the registry.',
            );
        }

        const materializableDefinitions = preAggregateDefinitions.filter(
            (definition) => definition.materializationMetricQuery !== null,
        );

        preAggregateDefinitions
            .filter(
                (definition) => definition.materializationMetricQuery === null,
            )
            .forEach((definition) => {
                this.logger.warn(
                    `Skipping manual refresh for pre-aggregate definition ${definition.preAggregateDefinitionUuid} in project ${projectUuid}: ${
                        definition.materializationQueryError ||
                        'materialization query is missing'
                    }`,
                );
            });

        if (materializableDefinitions.length === 0) {
            throw new ParameterError(
                'No valid pre-aggregate definitions are materializable. Recompile the project and fix definition errors first.',
            );
        }

        const jobs = await Promise.all(
            materializableDefinitions.map((definition) =>
                this.schedulerClient.materializePreAggregate({
                    organizationUuid,
                    projectUuid,
                    userUuid: user.userUuid,
                    preAggregateDefinitionUuid:
                        definition.preAggregateDefinitionUuid,
                    trigger: 'manual',
                }),
            ),
        );

        return {
            jobIds: jobs.map((job) => job.jobId),
        };
    }

    async refreshPreAggregateByDefinitionName(
        user: SessionUser,
        projectUuid: string,
        preAggregateDefinitionName: string,
    ): Promise<{ jobIds: string[] }> {
        const { organizationUuid } = await this.assertCanRefreshPreAggregates(
            user,
            projectUuid,
        );

        const preAggregateDefinition =
            await this.preAggregateModel.getPreAggregateDefinitionByDefinitionName(
                {
                    projectUuid,
                    preAggregateDefinitionName,
                },
            );

        if (!preAggregateDefinition) {
            throw new NotFoundError(
                `Pre-aggregate definition "${preAggregateDefinitionName}" not found`,
            );
        }

        if (!preAggregateDefinition.materializationMetricQuery) {
            throw new ParameterError(
                `Pre-aggregate definition "${preAggregateDefinitionName}" cannot be materialized: ${
                    preAggregateDefinition.materializationQueryError ||
                    'materialization query is missing'
                }`,
            );
        }

        const { jobId } = await this.schedulerClient.materializePreAggregate({
            organizationUuid,
            projectUuid,
            userUuid: user.userUuid,
            preAggregateDefinitionUuid:
                preAggregateDefinition.preAggregateDefinitionUuid,
            trigger: 'manual',
        });

        return {
            jobIds: [jobId],
        };
    }

    async scheduleCompileProject(
        user: SessionUser,
        projectUuid: string,
        requestMethod: RequestMethod,
        skipPermissionCheck: boolean = false,
        validateAfterCompile: boolean = false,
    ): Promise<{ jobUuid: string }> {
        const { organizationUuid, type } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            !skipPermissionCheck &&
            (auditedAbility.cannot(
                'create',
                subject('Job', { organizationUuid, projectUuid }),
            ) ||
                auditedAbility.cannot(
                    'manage',
                    subject('CompileProject', {
                        organizationUuid,
                        projectUuid,
                        type,
                    }),
                ))
        ) {
            throw new ForbiddenError();
        }

        // This job is the job model we use to compile projects
        // This is not the graphile Job id we use on scheduler
        // TODO: remove this old job method and replace with scheduler log details
        const job: CreateJob = {
            jobUuid: uuidv4(),
            jobType: JobType.COMPILE_PROJECT,
            jobStatus: JobStatusType.STARTED,
            userUuid: user.userUuid,
            projectUuid,
            steps: [{ stepType: JobStepType.COMPILING }],
        };

        await this.jobModel.create(job);

        await this.schedulerClient.compileProject({
            createdByUserUuid: user.userUuid,
            organizationUuid,
            projectUuid,
            requestMethod,
            jobUuid: job.jobUuid,
            isPreview: type === ProjectType.PREVIEW,
            validateAfterCompile,
            userUuid: user.userUuid,
        });

        return { jobUuid: job.jobUuid };
    }

    async compileProject(
        user: SessionUser,
        projectUuid: string,
        requestMethod: RequestMethod,
        jobUuid: string,
    ) {
        const totalStartTime = performance.now();

        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'create',
                subject('Job', { organizationUuid, projectUuid }),
            ) ||
            auditedAbility.cannot(
                'manage',
                subject('CompileProject', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            await this._markJobAsFailed(jobUuid).catch((e) => {
                this.logger.error(
                    `Failed to mark compile job as failed: ${
                        e instanceof Error ? e.stack : e
                    }`,
                );
            });
            throw new ForbiddenError();
        }

        const job: CreateJob = {
            jobUuid,
            jobType: JobType.COMPILE_PROJECT,
            jobStatus: JobStatusType.STARTED,
            userUuid: user.userUuid,
            projectUuid,
            steps: [{ stepType: JobStepType.COMPILING }],
        };

        const onLockFailed = async () => {
            await this.jobModel.updateJobStep(
                job.jobUuid,
                JobStepStatusType.ERROR,
                JobStepType.COMPILING,
                'Compilation is already in progress for this project',
            );
        };

        const timings = {
            yaml: { start: 0, end: 0 },
            parameters: { start: 0, end: 0 },
            cacheExplores: { start: 0, end: 0 },
        };

        const onLockAcquired = async () => {
            try {
                await this.jobModel.update(job.jobUuid, {
                    jobStatus: JobStatusType.RUNNING,
                });
                const indexCatalogJobUuid = await this.jobModel.tryJobStep(
                    job.jobUuid,
                    JobStepType.COMPILING,
                    async () => {
                        const {
                            explores,
                            lightdashProjectConfig,
                            projectContext,
                        } = await this.refreshTablesAndProjectConfig(
                            user,
                            projectUuid,
                            requestMethod,
                        );

                        timings.yaml.start = performance.now();
                        await this.replaceYamlTagsWithoutPermissionCheck(
                            user,
                            organizationUuid,
                            projectUuid,
                            // TODO: Create util to generate categories from lightdashProjectConfig - this is used as well in deploy.ts
                            Object.entries(
                                lightdashProjectConfig.spotlight?.categories ||
                                    {},
                            ).map(([key, category]) => ({
                                yamlReference: key,
                                name: category.label,
                                color: category.color ?? 'gray',
                            })),
                        );
                        timings.yaml.end = performance.now();
                        timings.parameters.start = performance.now();
                        await this.replaceProjectParameters({
                            user,
                            projectUuid,
                            parameters: lightdashProjectConfig.parameters,
                        });
                        await this.projectModel.setTableGroups(
                            projectUuid,
                            lightdashProjectConfig.table_groups,
                        );
                        // Mirrors CLI deploy semantics: only overwrite stored
                        // defaults when the config file defines them
                        if (lightdashProjectConfig.defaults) {
                            await this.projectModel.updateProjectDefaults(
                                projectUuid,
                                lightdashProjectConfig.defaults,
                            );
                        }
                        await this.replaceProjectContext(
                            projectUuid,
                            projectContext,
                        );
                        timings.parameters.end = performance.now();
                        timings.cacheExplores.start = performance.now();
                        const result = this.saveExploresToCacheAndIndexCatalog({
                            userUuid: user.userUuid,
                            projectUuid,
                            explores,
                            compilationSource: 'refresh_dbt',
                            jobUuid: job.jobUuid,
                            requestMethod,
                            projectConfigDefaults:
                                lightdashProjectConfig.defaults,
                        });
                        timings.cacheExplores.end = performance.now();

                        return result;
                    },
                );

                await this.jobModel.update(job.jobUuid, {
                    jobStatus: JobStatusType.DONE,
                    jobResults: {
                        indexCatalogJobUuid,
                    },
                });
            } catch (e) {
                await this.jobModel.update(job.jobUuid, {
                    jobStatus: JobStatusType.ERROR,
                });
            }
        };
        await this.projectModel
            .tryAcquireProjectLock(projectUuid, onLockAcquired, onLockFailed)
            .catch((e) => {
                if (!(e instanceof LightdashError)) {
                    Sentry.captureException(e);
                }
                this.logger.error(
                    `Background job failed:${e instanceof Error ? e.stack : e}`,
                );
            });
        const totalTime = performance.now() - totalStartTime;
        const durationYaml = timings.yaml.end - timings.yaml.start;
        const durationParameters =
            timings.parameters.end - timings.parameters.start;
        const durationCacheExplores =
            timings.cacheExplores.end - timings.cacheExplores.start;

        this.logger.info(
            `compileProject completed in ${totalTime.toFixed(2)}`,
            {
                totalTimeMs: totalTime,
                sections: {
                    yamlMs: durationYaml.toFixed(2),
                    parametersMs: durationParameters.toFixed(2),
                    cacheExploresMs: durationCacheExplores.toFixed(2),
                },
            },
        );
    }

    private async getExploreSummaries(
        account: Account,
        projectUuid: string,
        includeErrors: boolean = true,
    ) {
        // Use optimized query that only fetches summary fields instead of full explore JSON
        const exploreSummaries =
            await this.projectModel.getAllExploreSummaries(projectUuid);

        if (!exploreSummaries || exploreSummaries.length === 0) {
            return [];
        }
        const { userAttributes } = await this.getUserAttributes({ account });

        return exploreSummaries.reduce<SummaryExplore[]>((acc, summary) => {
            const {
                baseTableRequiredAttributes,
                baseTableAnyAttributes,
                ...rest
            } = summary;
            const summaryExplore: SummaryExplore = rest; // Just type assertion to remove the baseTableRequiredAttributes and baseTableAnyAttributes

            if (!includeErrors && 'errors' in summaryExplore) {
                return acc;
            }

            // Check user attribute access
            if (
                !doesExploreMatchRequiredAttributes(
                    baseTableRequiredAttributes,
                    baseTableAnyAttributes,
                    userAttributes,
                )
            ) {
                return acc;
            }

            // Add valid explore summary (databaseName and schemaName are required for non-error explores)
            return [...acc, summaryExplore];
        }, []);
    }

    private canViewPreAggregateExplores(
        account: Account,
        organizationUuid: string,
        projectUuid: string,
    ): boolean {
        if (!this.lightdashConfig.preAggregates.enabled) {
            return false;
        }

        const auditedAbility = this.createAuditedAbility(account);
        return auditedAbility.can(
            'manage',
            subject('PreAggregation', {
                organizationUuid,
                projectUuid,
            }),
        );
    }

    async getAllExploresSummary(
        account: Account,
        projectUuid: string,
        filtered: boolean,
        includeErrors: boolean = true,
        includePreAggregates: boolean = false,
    ): Promise<SummaryExplore[]> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(account);
        if (
            ProjectService.isChartEmbed(account) ||
            auditedAbility.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const allExploreSummaries = await this.getExploreSummaries(
            account,
            projectUuid,
            includeErrors,
        );
        const shouldIncludePreAggregateExplores =
            includePreAggregates &&
            this.canViewPreAggregateExplores(
                account,
                organizationUuid,
                projectUuid,
            );
        const visibleExploreSummaries = shouldIncludePreAggregateExplores
            ? allExploreSummaries
            : allExploreSummaries.filter(
                  (explore) => explore.type !== ExploreType.PRE_AGGREGATE,
              );

        if (filtered) {
            const {
                tableSelection: { type, value },
            } = await this.getTablesConfiguration(account, projectUuid);
            if (type === TableSelectionType.WITH_TAGS) {
                return visibleExploreSummaries.filter(
                    (explore) =>
                        hasIntersection(explore.tags || [], value || []) ||
                        explore.type === ExploreType.VIRTUAL || // Custom explores/Virtual views are included by default
                        (shouldIncludePreAggregateExplores &&
                            explore.type === ExploreType.PRE_AGGREGATE),
                );
            }
            if (type === TableSelectionType.WITH_NAMES) {
                return visibleExploreSummaries.filter(
                    (explore) =>
                        (value || []).includes(explore.name) ||
                        explore.type === ExploreType.VIRTUAL || // Custom explores/Virtual views are included by default
                        (shouldIncludePreAggregateExplores &&
                            explore.type === ExploreType.PRE_AGGREGATE),
                );
            }
        }

        return visibleExploreSummaries;
    }

    async getExplore(
        account: Account,
        projectUuid: string,
        exploreName: string,
        organizationUuid?: string,
        includeUnfilteredTables: boolean = true,
    ): Promise<Explore> {
        const { explore } = await this.getExploreWithUserAccessControls(
            account,
            projectUuid,
            exploreName,
            organizationUuid,
            includeUnfilteredTables,
        );
        return explore;
    }

    async getExploreWithUserAccessControls(
        account: Account,
        projectUuid: string,
        exploreName: string,
        organizationUuid?: string,
        includeUnfilteredTables: boolean = true,
    ): Promise<{ explore: Explore; userAccessControls: UserAccessControls }> {
        return traceSpan(
            {
                op: 'ProjectService.getExplore',
                name: 'ProjectService.getExplore',
            },
            async () => {
                const { explores: exploresMap, userAccessControls } =
                    await this.findExploresWithUserAccessControls({
                        account,
                        projectUuid,
                        exploreNames: [exploreName],
                        organizationUuid,
                    });
                const explore = exploresMap[exploreName];

                if (!explore) {
                    throw new NotFoundError(
                        `Explore "${exploreName}" does not exist.`,
                    );
                }
                if (isExploreError(explore)) {
                    throw new NotFoundError(
                        `Explore "${exploreName}" has an error: ${explore.errors
                            .map((error) => error.message)
                            .join(', ')}`,
                    );
                }
                const finalExplore = includeUnfilteredTables
                    ? explore
                    : { ...explore, unfilteredTables: undefined };
                return { explore: finalExplore, userAccessControls };
            },
        );
    }

    async findExplores({
        account,
        projectUuid,
        exploreNames,
        organizationUuid,
    }: {
        account: Account;
        projectUuid: string;
        exploreNames: string[];
        organizationUuid?: string;
    }): Promise<Record<string, Explore | ExploreError>> {
        const { explores } = await this.findExploresWithUserAccessControls({
            account,
            projectUuid,
            exploreNames,
            organizationUuid,
        });
        return explores;
    }

    async findExploresWithUserAccessControls({
        account,
        projectUuid,
        exploreNames,
        organizationUuid,
    }: {
        account: Account;
        projectUuid: string;
        exploreNames: string[];
        organizationUuid?: string;
    }): Promise<{
        explores: Record<string, Explore | ExploreError>;
        userAccessControls: UserAccessControls;
    }> {
        return traceSpan(
            {
                op: 'ProjectService.findExplores',
                name: 'ProjectService.findExplores',
                attributes: {
                    projectUuid,
                    exploreNames,
                    organizationUuid,
                },
            },

            async () => {
                const project = organizationUuid
                    ? { organizationUuid }
                    : await this.projectModel.getSummary(projectUuid);

                const auditedAbility = this.createAuditedAbility(account);
                const isForbidden =
                    auditedAbility.cannot(
                        'view',
                        subject('Project', {
                            organizationUuid: project.organizationUuid,
                            projectUuid,
                            metadata: { exploreNames },
                        }),
                    ) &&
                    auditedAbility.cannot(
                        'view',
                        subject('Explore', {
                            organizationUuid: project.organizationUuid,
                            projectUuid,
                            exploreNames,
                            metadata: { exploreNames },
                        }),
                    );

                if (isForbidden) {
                    throw new ForbiddenError();
                }
                const [explores, userAccessControls] = await Promise.all([
                    this.projectModel.findExploresFromCache(
                        projectUuid,
                        'name',
                        exploreNames,
                    ),
                    this.getUserAttributes({ account }),
                ]);
                const canViewPreAggregateExplores =
                    this.canViewPreAggregateExplores(
                        account,
                        project.organizationUuid,
                        projectUuid,
                    );

                const filteredExplores = Object.values(explores).reduce<
                    Record<string, Explore | ExploreError>
                >((acc, explore) => {
                    if (
                        explore.type === ExploreType.PRE_AGGREGATE &&
                        !canViewPreAggregateExplores
                    ) {
                        return acc;
                    }
                    if (isExploreError(explore)) {
                        acc[explore.name] = explore;
                    } else {
                        const shouldFilterExplore =
                            exploreHasFilteredAttribute(explore);
                        if (!shouldFilterExplore) {
                            acc[explore.name] = explore;
                        } else {
                            acc[explore.name] = getFilteredExplore(
                                explore,
                                userAccessControls.userAttributes,
                            );
                        }
                    }
                    return acc;
                }, {});

                return {
                    explores: filteredExplores,
                    userAccessControls,
                };
            },
        );
    }

    async getCatalog(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ProjectCatalog> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        const cachedExplores = await this.projectModel.findExploresFromCache(
            projectUuid,
            'name',
        );
        const explores = Object.values(cachedExplores);

        return (explores || []).reduce<ProjectCatalog>((acc, explore) => {
            if (!isExploreError(explore)) {
                Object.values(explore.tables).forEach(
                    ({ database, schema, name, description, sqlTable }) => {
                        acc[database] = acc[database] || {};
                        acc[database][schema] = acc[database][schema] || {};
                        acc[database][schema][name] = {
                            description,
                            sqlTable,
                        };
                    },
                );
            }
            return acc;
        }, {});
    }

    private static getWarehouseSchema(
        credentials: WarehouseCredentials,
    ): string | undefined {
        switch (credentials.type) {
            case WarehouseTypes.BIGQUERY:
                return credentials.dataset;
            case WarehouseTypes.DATABRICKS:
                return credentials.catalog;
            default:
                return credentials.schema;
        }
    }

    private static getWarehouseDatabase(
        credentials: WarehouseCredentials,
    ): string | undefined {
        switch (credentials.type) {
            case WarehouseTypes.BIGQUERY:
                return credentials.project;
            case WarehouseTypes.REDSHIFT:
            case WarehouseTypes.POSTGRES:
            case WarehouseTypes.TRINO:
                return credentials.dbname;
            case WarehouseTypes.CLICKHOUSE:
                return ''; // Clickhouse doesn't have a database
            case WarehouseTypes.SNOWFLAKE:
                return credentials.database.toLowerCase();
            case WarehouseTypes.DATABRICKS:
                return credentials.catalog;
            case WarehouseTypes.ATHENA:
                return credentials.database; // Athena uses database as catalog name
            case WarehouseTypes.DUCKDB:
                if (
                    credentials.connectionType === DuckdbConnectionType.DUCKLAKE
                ) {
                    return credentials.catalogAlias ?? 'ducklake';
                }
                if (
                    credentials.connectionType === DuckdbConnectionType.EMBEDDED
                ) {
                    return credentials.dataset;
                }
                return credentials.database;
            default:
                return assertUnreachable(credentials, 'Unknown warehouse type');
        }
    }

    async populateWarehouseTablesCache(
        user: SessionUser,
        projectUuid: string,
    ): Promise<WarehouseTablesCatalog> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('SqlRunner', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const credentials = await this.getWarehouseCredentials({
            projectUuid,
            userId: user.userUuid,
            isRegisteredUser: true,
        });

        const { warehouseClient, sshTunnel } = await this._getWarehouseClient(
            projectUuid,
            credentials,
        );

        const warehouseTables = await warehouseClient.getAllTables();

        const catalog = WarehouseAvailableTablesModel.toWarehouseCatalog(
            warehouseTables.map((t) => ({
                ...t,
                partition_column: t.partitionColumn || null,
            })),
        );

        if (credentials.userWarehouseCredentialsUuid) {
            await this.warehouseAvailableTablesModel.createAvailableTablesForUserWarehouseCredentials(
                credentials.userWarehouseCredentialsUuid,
                warehouseTables,
            );
        } else {
            await this.warehouseAvailableTablesModel.createAvailableTablesForProjectWarehouseCredentials(
                projectUuid,
                warehouseTables,
            );
        }

        await sshTunnel.disconnect();

        return catalog;
    }

    async getWarehouseTables(
        user: SessionUser,
        projectUuid: string,
    ): Promise<WarehouseTablesCatalog> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('SqlRunner', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const credentials = await this.getWarehouseCredentials({
            projectUuid,
            userId: user.userUuid,
            isRegisteredUser: true,
        });

        let catalog: WarehouseTablesCatalog | null = null;
        // Check the cache for catalog
        if (credentials.userWarehouseCredentialsUuid) {
            catalog =
                await this.warehouseAvailableTablesModel.getTablesForUserWarehouseCredentials(
                    credentials.userWarehouseCredentialsUuid,
                );
        } else {
            catalog =
                await this.warehouseAvailableTablesModel.getTablesForProjectWarehouseCredentials(
                    projectUuid,
                );
        }

        // If there was no cached catalog, generate it
        if (!catalog || Object.keys(catalog).length === 0) {
            catalog = await this.populateWarehouseTablesCache(
                user,
                projectUuid,
            );
        }

        if (!catalog) {
            throw new NotFoundError('Warehouse tables not found');
        }
        return catalog;
    }

    async getWarehouseFields(
        user: SessionUser,
        projectUuid: string,
        queryContext: QueryExecutionContext,
        tableName?: string,
        schemaName?: string,
        databaseName?: string,
    ): Promise<WarehouseTableSchema> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('SqlRunner', {
                    organizationUuid,
                    projectUuid,
                    metadata: {
                        tableName,
                        schemaName,
                        databaseName,
                        queryContext,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const credentials = await this.getWarehouseCredentials({
            projectUuid,
            userId: user.userUuid,
            isRegisteredUser: true,
        });

        const { warehouseClient, sshTunnel } = await this._getWarehouseClient(
            projectUuid,
            credentials,
        );

        const queryTags: RunQueryTags = {
            organization_uuid: user.organizationUuid,
            project_uuid: projectUuid,
            user_uuid: user.userUuid,
            query_context: queryContext,
        };

        let database =
            databaseName ?? ProjectService.getWarehouseDatabase(credentials);
        if (database === undefined) {
            throw new NotFoundError(
                'Database not found in warehouse credentials',
            );
        }
        if (credentials.type === WarehouseTypes.SNOWFLAKE) {
            // TODO: credentials returning a lower case database name for snowflake (bug) - this hack works for unquoted database names
            database = database.toUpperCase();
        }
        if (!schemaName) {
            throw new ParameterError('Schema name is required');
        }
        if (!tableName) {
            throw new ParameterError('Table name is required');
        }

        try {
            const warehouseCatalog = await warehouseClient.getFields(
                tableName,
                schemaName,
                database,
                queryTags,
            );

            await sshTunnel.disconnect();

            return warehouseCatalog[database][schemaName][tableName];
        } catch (error) {
            this.logger.error('Error fetching warehouse fields', { error });
            if (error instanceof WarehouseConnectionError) {
                throw error;
            }
            throw new NotFoundError(
                `Could not find table "${tableName}" in schema "${schemaName}" of database "${database}". Please verify the table exists and you have access to it.`,
            );
        }
    }

    async getTablesConfiguration(
        account: Account,
        projectUuid: string,
    ): Promise<TablesConfiguration> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(account);
        if (
            ProjectService.isChartEmbed(account) ||
            auditedAbility.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        return this.projectModel.getTablesConfiguration(projectUuid);
    }

    async updateTablesConfiguration(
        user: SessionUser,
        projectUuid: string,
        data: TablesConfiguration,
    ): Promise<TablesConfiguration> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'update',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        await this.projectModel.updateTablesConfiguration(projectUuid, data);
        this.analytics.track({
            event: 'project_tables_configuration.updated',
            userId: user.userUuid,
            properties: {
                projectId: projectUuid,
                project_table_selection_type: data.tableSelection.type,
            },
        });
        return this.projectModel.getTablesConfiguration(projectUuid);
    }

    async getProjectPreviewExpirationSettings(
        user: SessionUser,
        projectUuid: string,
    ): Promise<{
        projectUuid: string;
        defaultPreviewExpirationHours: number;
        maxPreviewExpirationHours: number;
    }> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'update',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        const settings =
            await this.projectModel.getPreviewExpirationSettings(projectUuid);
        return { projectUuid, ...settings };
    }

    async updateProjectPreviewExpirationSettings(
        user: SessionUser,
        projectUuid: string,
        settings: {
            defaultPreviewExpirationHours: number;
            maxPreviewExpirationHours: number;
        },
    ): Promise<{
        projectUuid: string;
        defaultPreviewExpirationHours: number;
        maxPreviewExpirationHours: number;
    }> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'update',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        const { defaultPreviewExpirationHours, maxPreviewExpirationHours } =
            settings;
        if (
            !Number.isInteger(defaultPreviewExpirationHours) ||
            !Number.isInteger(maxPreviewExpirationHours)
        ) {
            throw new ParameterError(
                'Preview expiration hours must be whole numbers',
            );
        }
        if (
            defaultPreviewExpirationHours < 1 ||
            maxPreviewExpirationHours < 1
        ) {
            throw new ParameterError(
                'Preview expiration hours must be at least 1',
            );
        }
        if (defaultPreviewExpirationHours > maxPreviewExpirationHours) {
            throw new ParameterError(
                'Default preview expiration cannot exceed the maximum',
            );
        }
        await this.projectModel.updatePreviewExpirationSettings(projectUuid, {
            defaultPreviewExpirationHours,
            maxPreviewExpirationHours,
        });
        const persisted =
            await this.projectModel.getPreviewExpirationSettings(projectUuid);
        return { projectUuid, ...persisted };
    }

    async updatePreviewExpiresAt(
        user: SessionUser,
        projectUuid: string,
        expiresInHours?: number,
    ): Promise<PreviewExpiresAt> {
        const project = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'update',
                subject('Project', {
                    organizationUuid: project.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        if (project.type !== ProjectType.PREVIEW) {
            throw new ParameterError(
                'Expiration can only be updated on preview projects',
            );
        }
        if (
            expiresInHours !== undefined &&
            (!Number.isInteger(expiresInHours) || expiresInHours < 1)
        ) {
            throw new ParameterError(
                'expiresInHours must be a whole number of at least 1',
            );
        }
        const expiresAt = await this.getPreviewExpiresAt(
            ProjectType.PREVIEW,
            project.upstreamProjectUuid,
            expiresInHours,
        );
        if (expiresAt === null) {
            throw new UnexpectedServerError(
                'Failed to compute preview expiration',
            );
        }
        await this.projectModel.updateExpiresAt(projectUuid, expiresAt);
        return { projectUuid, expiresAt };
    }

    async getAvailableFiltersForSavedQuery(
        account: Account,
        savedChartUuid: string,
    ): Promise<FilterableDimension[]> {
        return traceSpan(
            {
                op: 'projectService.getAvailableFiltersForSavedQuery',
                name: 'ProjectService.getAvailableFiltersForSavedQuery',
            },
            async () => {
                const [savedChart] =
                    await this.savedChartModel.getInfoForAvailableFilters([
                        savedChartUuid,
                    ]);

                const spaceCtx =
                    await this.spacePermissionService.getSpaceAccessContext(
                        account.user.id,
                        savedChart.spaceUuid,
                    );

                const auditedAbility = this.createAuditedAbility(account);
                if (
                    auditedAbility.cannot(
                        'view',
                        subject('SavedChart', {
                            organizationUuid: spaceCtx.organizationUuid,
                            projectUuid: spaceCtx.projectUuid,
                            inheritsFromOrgOrProject:
                                spaceCtx.inheritsFromOrgOrProject,
                            access: spaceCtx.access,
                            metadata: {
                                savedChartUuid,
                                savedChartName: savedChart.name,
                            },
                        }),
                    )
                ) {
                    throw new ForbiddenError();
                }

                const explore = await this.getExplore(
                    account,
                    savedChart.projectUuid,
                    savedChart.tableName,
                );

                return getDimensions(explore).filter(
                    (field) => isFilterableDimension(field) && !field.hidden,
                );
            },
        );
    }

    async getAvailableFiltersForSavedQueries(
        account: Account,
        savedChartUuidsAndTileUuids: SavedChartsInfoForDashboardAvailableFilters,
    ): Promise<DashboardAvailableFilters> {
        type ChartFilters = {
            uuid: string;
            filters: CompiledDimension[];
            metricFilters: Metric[];
        };

        let allFilters: ChartFilters[] = [];

        allFilters = await traceSpan(
            {
                op: 'projectService.getAvailableFiltersForSavedQueries',
                name: 'ProjectService.getAvailableFiltersForSavedQueries',
            },
            async () => {
                const savedQueryUuids = savedChartUuidsAndTileUuids.map(
                    ({ savedChartUuid }) => savedChartUuid,
                );

                const savedCharts =
                    await this.savedChartModel.getInfoForAvailableFilters(
                        savedQueryUuids,
                    );
                const uniqueSpaceUuids = [
                    ...new Set(savedCharts.map((chart) => chart.spaceUuid)),
                ];

                if (savedCharts.length === 0) {
                    return [];
                }

                const [spacesCtx, exploresMap] = await Promise.all([
                    this.spacePermissionService.getSpacesAccessContext(
                        account.user.id,
                        uniqueSpaceUuids,
                    ),
                    this.findExplores({
                        account,
                        projectUuid: savedCharts[0].projectUuid, // TODO: route should be updated to be project/dashboard specific. For now we pick it from first chart as they all should be from the same project
                        exploreNames: savedCharts.map(
                            (chart) => chart.tableName,
                        ),
                        organizationUuid: account.organization.organizationUuid,
                    }),
                ]);

                const auditedAbility = this.createAuditedAbility(account);
                return savedCharts.map((savedChart) => {
                    const spaceCtx = spacesCtx[savedChart.spaceUuid];

                    if (
                        !spaceCtx ||
                        auditedAbility.cannot(
                            'view',
                            subject('SavedChart', {
                                organizationUuid: spaceCtx.organizationUuid,
                                projectUuid: spaceCtx.projectUuid,
                                inheritsFromOrgOrProject:
                                    spaceCtx.inheritsFromOrgOrProject,
                                access: spaceCtx.access,
                                metadata: {
                                    savedChartUuid: savedChart.uuid,
                                    savedChartName: savedChart.name,
                                },
                            }),
                        )
                    ) {
                        return {
                            uuid: savedChart.uuid,
                            filters: [],
                            metricFilters: [],
                        };
                    }

                    const explore = exploresMap[savedChart.tableName];

                    let filters: CompiledDimension[] = [];
                    let metricFilters: Metric[] = [];
                    if (explore && !isExploreError(explore)) {
                        filters = getDimensions(explore).filter(
                            (field) =>
                                isFilterableDimension(field) && !field.hidden,
                        );
                        metricFilters = getMetrics(explore).filter(
                            (field) => !field.hidden,
                        );
                    }

                    return {
                        uuid: savedChart.uuid,
                        filters,
                        metricFilters,
                    };
                });
            },
        );

        const allFilterableFields: FilterableDimension[] = [];
        const filterIndexMap: Record<string, number> = {};

        allFilters.forEach((filterSet) => {
            filterSet.filters.forEach((filter) => {
                const fieldId = getItemId(filter);
                if (!(fieldId in filterIndexMap)) {
                    filterIndexMap[fieldId] = allFilterableFields.length;
                    allFilterableFields.push(filter);
                }
            });
        });

        const allFilterableMetrics: Metric[] = [];
        const metricIndexMap: Record<string, number> = {};

        allFilters.forEach((filterSet) => {
            filterSet.metricFilters.forEach((metric) => {
                const fieldId = getItemId(metric);
                if (!(fieldId in metricIndexMap)) {
                    metricIndexMap[fieldId] = allFilterableMetrics.length;
                    allFilterableMetrics.push(metric);
                }
            });
        });

        const savedQueryFilters = savedChartUuidsAndTileUuids.reduce<
            DashboardAvailableFilters['savedQueryFilters']
        >((acc, savedChartUuidAndTileUuid) => {
            const filterResult = allFilters.find(
                (result) =>
                    result.uuid === savedChartUuidAndTileUuid.savedChartUuid,
            );
            if (!filterResult || !filterResult.filters.length) return acc;

            const filterIndexes = filterResult.filters.map(
                (filter) => filterIndexMap[getItemId(filter)],
            );
            return {
                ...acc,
                [savedChartUuidAndTileUuid.tileUuid]: filterIndexes,
            };
        }, {});

        const savedQueryMetricFilters = savedChartUuidsAndTileUuids.reduce<
            DashboardAvailableFilters['savedQueryMetricFilters']
        >((acc, savedChartUuidAndTileUuid) => {
            const filterResult = allFilters.find(
                (result) =>
                    result.uuid === savedChartUuidAndTileUuid.savedChartUuid,
            );
            if (!filterResult || !filterResult.metricFilters.length) return acc;

            const metricIndexes = filterResult.metricFilters.map(
                (metric) => metricIndexMap[getItemId(metric)],
            );
            return {
                ...acc,
                [savedChartUuidAndTileUuid.tileUuid]: metricIndexes,
            };
        }, {});

        return {
            savedQueryFilters,
            allFilterableFields,
            allFilterableMetrics,
            savedQueryMetricFilters,
        };
    }

    async hasSavedCharts(
        user: SessionUser,
        projectUuid: string,
    ): Promise<boolean> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        try {
            const charts = await this.contentModel.findSummaryContents(
                {
                    projectUuids: [projectUuid],
                    contentTypes: [ContentType.CHART],
                    chart: {
                        sources: [ChartSourceType.DBT_EXPLORE],
                    },
                },
                {},
                {
                    pageSize: 1,
                    page: 1,
                },
            );
            return charts.data.length > 0;
        } catch (e: AnyType) {
            return false;
        }
    }

    /** @deprecated Only used by the deprecated project access endpoint; use RolesService.getProjectRoleAssignments instead. */
    async getProjectMemberAccess(
        user: SessionUser,
        projectUuid: string,
        userUuid: string,
    ): Promise<ProjectMemberProfile> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                    metadata: { userUuid },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const projectMemberProfile =
            await this.projectModel.getProjectMemberAccess(
                projectUuid,
                userUuid,
            );
        if (projectMemberProfile !== undefined) {
            return projectMemberProfile;
        }
        throw new NotFoundError(
            `User UUID ${userUuid} is not found in project ${projectUuid}`,
        );
    }

    async getProjectAccess(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ProjectMemberProfile[]> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        return this.projectModel.getProjectAccess(projectUuid);
    }

    async createProjectAccess(
        user: SessionUser,
        projectUuid: string,
        data: CreateProjectMember,
    ): Promise<void> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                    metadata: { role: data.role },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.projectModel.createProjectAccess(
            projectUuid,
            data.email,
            data.role,
        );
        const project = await this.projectModel.getSummary(projectUuid);
        const projectUrl = new URL(
            `/projects/${projectUuid}/home`,
            this.lightdashConfig.siteUrl,
        ).href;

        if (data.sendEmail)
            await this.emailClient.sendProjectAccessEmail(
                user,
                data,
                project.name,
                projectUrl,
            );
    }

    /** @deprecated Only used by the deprecated project access endpoint; use RolesService.upsertProjectUserRoleAssignment instead. */
    async updateProjectAccess(
        user: SessionUser,
        projectUuid: string,
        userUuid: string,
        data: UpdateProjectMember,
    ): Promise<void> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                    metadata: { userUuid, role: data.role },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.projectModel.updateProjectAccess(
            projectUuid,
            userUuid,
            data.role,
        );
    }

    async updateMetadata(
        user: SessionUser,
        projectUuid: string,
        data: UpdateMetadata,
    ): Promise<void> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.projectModel.updateMetadata(projectUuid, data);
    }

    async updateDefaultUserSpaces(
        user: SessionUser,
        projectUuid: string,
        data: UpdateDefaultUserSpaces,
    ): Promise<void> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.projectModel.updateDefaultUserSpaces(
            projectUuid,
            data.hasDefaultUserSpaces,
        );
    }

    async updateColorPalette(
        user: SessionUser,
        projectUuid: string,
        colorPaletteUuid: string | null,
    ): Promise<void> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'update',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                    metadata: { colorPaletteUuid },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (colorPaletteUuid !== null) {
            const palette = await this.organizationModel.findColorPalette(
                organizationUuid,
                colorPaletteUuid,
            );
            if (!palette) {
                throw new ParameterError(
                    'Color palette does not belong to this organization',
                );
            }
        }

        await this.projectModel.updateColorPalette(
            projectUuid,
            colorPaletteUuid,
        );
    }

    async getResolvedColorPalette(
        user: SessionUser,
        projectUuid: string,
        context: {
            spaceUuid?: string;
            dashboardUuid?: string;
            chartUuid?: string;
        } = {},
    ): Promise<ResolvedProjectColorPalette> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                    metadata: {
                        spaceUuid: context.spaceUuid,
                        dashboardUuid: context.dashboardUuid,
                        chartUuid: context.chartUuid,
                    },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        return this.savedChartModel.resolveColorPalette({
            projectUuid,
            spaceUuid: context.spaceUuid,
            dashboardUuid: context.dashboardUuid,
            chartUuid: context.chartUuid,
        });
    }

    /** @deprecated Only used by the deprecated project access endpoint; use RolesService.deleteProjectRoleAssignment instead. */
    async deleteProjectAccess(
        user: SessionUser,
        projectUuid: string,
        userUuid: string,
    ): Promise<void> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                    metadata: { userUuid },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.projectModel.deleteProjectAccess(projectUuid, userUuid);
    }

    async getProjectGroupAccesses(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ProjectGroupAccess[]> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        return this.projectModel.getProjectGroupAccesses(projectUuid);
    }

    async getCharts(
        user: SessionUser,
        projectUuid: string,
    ): Promise<SpaceQuery[]> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const spaces = await this.spaceModel.find({ projectUuid });
        const allowedSpaceUuids =
            await this.spacePermissionService.getAccessibleSpaceUuids(
                'view',
                user,
                spaces.map((s) => s.uuid),
            );

        const savedQueries =
            await this.spaceModel.getSpaceQueries(allowedSpaceUuids);
        const savedSqlCharts =
            await this.spaceModel.getSpaceSqlCharts(allowedSpaceUuids);

        return [...savedQueries, ...savedSqlCharts];
    }

    /** @deprecated Only used by the deprecated chart summaries endpoint. */
    async getChartSummaries(
        user: SessionUser,
        projectUuid: string,
        excludeChartsSavedInDashboard: boolean = false,
    ): Promise<ChartSummary[]> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const spaces = await this.spaceModel.find({ projectUuid });
        const allowedSpaceUuids =
            await this.spacePermissionService.getAccessibleSpaceUuids(
                'view',
                user,
                spaces.map((s) => s.uuid),
            );

        return this.savedChartModel.find({
            projectUuid,
            spaceUuids: allowedSpaceUuids,
            excludeChartsSavedInDashboard,
        });
    }

    async getChartsByExploreName(
        user: SessionUser,
        projectUuid: string,
        exploreName: string,
    ): Promise<ChartSummary[]> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                    metadata: { exploreName },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const spaces = await this.spaceModel.find({ projectUuid });
        const allowedSpaceUuids =
            await this.spacePermissionService.getAccessibleSpaceUuids(
                'view',
                user,
                spaces.map((s) => s.uuid),
            );

        return this.savedChartModel.find({
            projectUuid,
            spaceUuids: allowedSpaceUuids,
            exploreName,
        });
    }

    async getMostPopularAndRecentlyUpdated(
        user: SessionUser,
        projectUuid: string,
    ): Promise<MostPopularAndRecentlyUpdated> {
        const projectSummary = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid: projectSummary.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const spaces = await this.spaceModel.find({ projectUuid });
        const allowedSpaceUuids =
            await this.spacePermissionService.getAccessibleSpaceUuids(
                'view',
                user,
                spaces.map((s) => s.uuid),
            );

        const allowedSpaceUuidsSet = new Set(allowedSpaceUuids);
        const allowedSpaces = spaces.filter((space) =>
            allowedSpaceUuidsSet.has(space.uuid),
        );

        const spaceUuids = allowedSpaces.map(({ uuid }) => uuid);
        const [
            popularCharts,
            popularSqlCharts,
            popularDashboards,
            recentCharts,
            recentSqlCharts,
            recentDashboards,
        ] = await Promise.all([
            this.spaceModel.getSpaceQueries(spaceUuids, {
                mostPopular: true,
            }),
            this.spaceModel.getSpaceSqlCharts(spaceUuids, {
                mostPopular: true,
            }),
            this.spaceModel.getSpaceDashboards(spaceUuids, {
                mostPopular: true,
            }),
            this.spaceModel.getSpaceQueries(spaceUuids, {
                recentlyUpdated: true,
            }),
            this.spaceModel.getSpaceSqlCharts(spaceUuids, {
                recentlyUpdated: true,
            }),
            this.spaceModel.getSpaceDashboards(spaceUuids, {
                recentlyUpdated: true,
            }),
        ]);

        return {
            mostPopular: [
                ...popularCharts,
                ...popularSqlCharts,
                ...popularDashboards,
            ]
                .sort((a, b) => b.views - a.views)
                .slice(
                    0,
                    this.spaceModel.MOST_POPULAR_OR_RECENTLY_UPDATED_LIMIT,
                ),
            recentlyUpdated: [
                ...recentCharts,
                ...recentSqlCharts,
                ...recentDashboards,
            ]
                .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
                .slice(
                    0,
                    this.spaceModel.MOST_POPULAR_OR_RECENTLY_UPDATED_LIMIT,
                ),
        };
    }

    async getVerifiedContentForHomepage(
        user: SessionUser,
        projectUuid: string,
    ): Promise<(DashboardBasicDetails | SpaceQuery)[]> {
        if (!this.contentVerificationModel) {
            return [];
        }

        const projectSummary = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    organizationUuid: projectSummary.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        // Get verified content UUIDs
        const verifiedItems =
            await this.contentVerificationModel.getAllForProject(projectUuid);

        if (verifiedItems.length === 0) return [];

        const verifiedChartUuids = new Set(
            verifiedItems
                .filter((item) => item.contentType === ContentType.CHART)
                .map((item) => item.contentUuid),
        );
        const verifiedDashboardUuids = new Set(
            verifiedItems
                .filter((item) => item.contentType === ContentType.DASHBOARD)
                .map((item) => item.contentUuid),
        );

        // Get accessible spaces for user
        const spaces = await this.spaceModel.find({ projectUuid });
        const allowedSpaceUuids =
            await this.spacePermissionService.getAccessibleSpaceUuids(
                'view',
                user,
                spaces.map((s) => s.uuid),
            );

        // Fetch full chart and dashboard details (same shape as most-popular)
        const [charts, sqlCharts, dashboards] = await Promise.all([
            verifiedChartUuids.size > 0
                ? this.spaceModel.getSpaceQueries(allowedSpaceUuids)
                : Promise.resolve([]),
            verifiedChartUuids.size > 0
                ? this.spaceModel.getSpaceSqlCharts(allowedSpaceUuids)
                : Promise.resolve([]),
            verifiedDashboardUuids.size > 0
                ? this.spaceModel.getSpaceDashboards(allowedSpaceUuids)
                : Promise.resolve([]),
        ]);

        // Filter to only verified items
        const verifiedCharts = [...charts, ...sqlCharts].filter((chart) =>
            verifiedChartUuids.has(chart.uuid),
        );
        const verifiedDashboards = dashboards.filter((dashboard) =>
            verifiedDashboardUuids.has(dashboard.uuid),
        );

        return [...verifiedCharts, ...verifiedDashboards];
    }

    async getSpaces(
        user: SessionUser,
        projectUuid: string,
    ): Promise<SpaceSummary[]> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const spaces = await this.spaceModel.find({ projectUuid });
        const spaceUuids = spaces.map((s) => s.uuid);
        const [userSpacesCtx, directAccessMap] = await Promise.all([
            this.spacePermissionService.getSpacesAccessContext(
                user.userUuid,
                spaceUuids,
            ),
            this.spacePermissionService.getDirectAccessUserUuids(spaceUuids),
        ]);

        return spaces
            .filter((space) => {
                const ctx = userSpacesCtx[space.uuid];
                return (
                    ctx &&
                    auditedAbility.can(
                        'view',
                        subject('Space', {
                            organizationUuid: ctx.organizationUuid,
                            projectUuid: ctx.projectUuid,
                            inheritsFromOrgOrProject:
                                ctx.inheritsFromOrgOrProject,
                            access: ctx.access,
                            metadata: {
                                spaceUuid: space.uuid,
                                spaceName: space.name,
                            },
                        }),
                    )
                );
            })
            .map((spaceSummary) => {
                const ctx = userSpacesCtx[spaceSummary.uuid];
                const directAccessUuids =
                    directAccessMap[spaceSummary.uuid] ?? [];
                return {
                    ...spaceSummary,
                    inheritsFromOrgOrProject: ctx.inheritsFromOrgOrProject,
                    access: directAccessUuids,
                    userAccess: ctx?.access.find(
                        (a) => a.userUuid === user.userUuid,
                    ),
                };
            });
    }

    private async throwIfPreviewCopyFailed(
        previewProject: ApiCreateProjectResults,
    ): Promise<void> {
        if (
            !previewProject.accessCopyError &&
            !previewProject.contentCopyError
        ) {
            return;
        }

        try {
            await this.projectModel.delete(previewProject.project.projectUuid);
        } catch (e) {
            Sentry.captureException(e);
            this.logger.error(
                `Failed to clean up preview project ${previewProject.project.projectUuid} after copy failure`,
                {
                    error: getErrorMessage(e),
                    stack: e instanceof Error ? e.stack : undefined,
                },
            );
        }

        throw new UnexpectedServerError('Failed to copy preview project');
    }

    async createPreview(
        user: SessionUser,
        projectUuid: string,
        data: {
            name: string;
            copyContent: boolean;
            dbtConnectionOverrides?: {
                branch?: string;
                environment?: DbtProjectEnvironmentVariable[];
                manifest?: string;
            };
            warehouseConnectionOverrides?: { schema?: string };
            validateAfterCompile?: boolean;
        },
        context: RequestMethod,
    ): Promise<ApiCreatePreviewResults> {
        // create preview project permissions are checked in `createWithoutCompile`
        const project =
            await this.projectModel.getWithSensitiveFields(projectUuid);

        if (!project.warehouseConnection) {
            throw new ParameterError(
                `Missing warehouse connection for project ${projectUuid}`,
            );
        }
        const previewData: CreateProject = {
            name: data.name,
            type: ProjectType.PREVIEW,
            warehouseConnection: maybeOverrideWarehouseConnection(
                project.warehouseConnection,
                data.warehouseConnectionOverrides ?? {},
            ),
            dbtConnection: maybeOverrideDbtConnection(
                project.dbtConnection,
                data.dbtConnectionOverrides ?? {},
            ),
            upstreamProjectUuid: projectUuid,
            copyContent: data.copyContent,
            organizationWarehouseCredentialsUuid:
                project.organizationWarehouseCredentialsUuid,
            dbtVersion: project.dbtVersion,
        };

        const previewProject = await this.createWithoutCompile(
            user,
            previewData,
            context,
        );
        await this.throwIfPreviewCopyFailed(previewProject);

        // Since the project is new, and we have copied some permissions,
        // it is possible that the user `abilities` are not uptodate
        // Before we check permissions on scheduleCompileProject
        // Permissions will be checked again with the uptodate user on scheduler

        const { jobUuid } = await this.scheduleCompileProject(
            user,
            previewProject.project.projectUuid,
            context,
            true, // Skip permission check
            data.validateAfterCompile ?? false,
        );
        return {
            projectUuid: previewProject.project.projectUuid,
            compileJobUuid: jobUuid,
        };
    }

    /*
        Copy user permissions from upstream project
        if the user is a viewer in the org, but an editor in a project
        we want the user to also be an editor in the preview project
    */
    async copyUserAccessOnPreview(
        upstreamProjectUuid: string,
        previewProjectUuid: string,
    ): Promise<void> {
        this.logger.info(
            `Copying access from project ${upstreamProjectUuid} to preview project ${previewProjectUuid}`,
        );
        await wrapSentryTransaction<void>(
            'duplicateUserAccess',
            {
                previewProjectUuid,
                upstreamProjectUuid,
            },
            async () => {
                const {
                    userAccessCount,
                    skippedUserAccessCount,
                    groupAccessCount,
                } = await this.projectModel.copyProjectAccess(
                    upstreamProjectUuid,
                    previewProjectUuid,
                );

                this.logger.info(
                    `Copied ${userAccessCount} user access grants on ${previewProjectUuid}; skipped ${skippedUserAccessCount} ineligible grants`,
                );
                this.logger.info(
                    `Copied ${groupAccessCount} group access grants on ${previewProjectUuid}`,
                );
            },
        );
    }

    async copyContentOnPreview(
        projectUuid: string,
        previewProjectUuid: string,
        user: SessionUser,
    ): Promise<void> {
        this.logger.info(
            `Copying content from project ${projectUuid} to preview project ${previewProjectUuid}`,
        );
        await wrapSentryTransaction<void>(
            'duplicateContent',
            {
                projectUuid,
            },
            async () => {
                const spaces = await this.spaceModel.find({ projectUuid }); // Get all spaces in the project

                const { spaceMapping } =
                    await this.projectModel.duplicateContent(
                        projectUuid,
                        previewProjectUuid,
                        spaces,
                    );

                // Duplicate the upstream project's data apps into the preview
                // and remap the copied dashboard tiles onto them. EE-only —
                // resolves undefined in core builds. Best-effort: a failure
                // here must not undo the content copy that already committed,
                // so swallow and log rather than propagate.
                const appGenerateService = this.getAppGenerateService?.();
                if (appGenerateService) {
                    try {
                        await appGenerateService.duplicateAppsForPreview(
                            projectUuid,
                            previewProjectUuid,
                            spaceMapping,
                        );
                    } catch (e) {
                        this.logger.error(
                            `Failed to duplicate data apps from ${projectUuid} to preview ${previewProjectUuid}: ${getErrorMessage(
                                e,
                            )}`,
                        );
                    }
                }
            },
        );
    }

    async getDbtExposures(
        user: SessionUser,
        projectUuid: string,
    ): Promise<Record<string, DbtExposure>> {
        const projectSummary = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot('manage', subject('Project', projectSummary))
        ) {
            throw new ForbiddenError();
        }
        const cachedExplores = await this.projectModel.findExploresFromCache(
            projectUuid,
            'name',
        );
        const allExplores = Object.values(cachedExplores);

        const validExplores = allExplores?.filter(
            (explore) =>
                explore.type !== ExploreType.VIRTUAL &&
                explore.type !== ExploreType.PRE_AGGREGATE,
        );

        if (!validExplores) {
            throw new NotFoundError('No explores found');
        }

        const charts =
            await this.savedChartModel.findInfoForDbtExposures(projectUuid);

        const chartExposures = charts.reduce<DbtExposure[]>((acc, chart) => {
            const dependsOn = Object.values(
                validExplores.find(({ name }) => name === chart.tableName)
                    ?.tables || {},
            ).map((table) => `ref('${table.originalName || table.name}')`);
            // Only create dbt exposure if the chart has a corresponding explore
            // This means charts from virtual explors will not be included
            if (dependsOn.length > 0) {
                acc.push({
                    name: `ld_chart_${snakeCaseName(chart.uuid)}`,
                    type: DbtExposureType.ANALYSIS,
                    owner: {
                        name: `${chart.firstName} ${chart.lastName}`,
                        email: '', // omit for now to avoid heavier query
                    },
                    label: chart.name,
                    description: chart.description ?? '',
                    url: `${this.lightdashConfig.siteUrl}/projects/${projectUuid}/saved/${chart.uuid}/view`,
                    dependsOn,
                    tags: ['lightdash', 'chart'],
                });
            }
            return acc;
        }, []);
        const dashboards =
            await this.dashboardModel.findInfoForDbtExposures(projectUuid);

        const dashboardExposures = dashboards.reduce<DbtExposure[]>(
            (acc, dashboard) => {
                acc.push({
                    name: `ld_dashboard_${snakeCaseName(dashboard.uuid)}`,
                    type: DbtExposureType.DASHBOARD,
                    owner: {
                        name: `${dashboard.firstName} ${dashboard.lastName}`,
                        email: '', // omit for now to avoid heavier query
                    },
                    label: dashboard.name,
                    description: dashboard.description ?? '',
                    url: `${this.lightdashConfig.siteUrl}/projects/${projectUuid}/dashboards/${dashboard.uuid}/view`,
                    dependsOn: dashboard.chartUuids
                        ? uniq(
                              dashboard.chartUuids
                                  .map((chartUuid) => {
                                      const chartExposureId = `ld_chart_${snakeCaseName(
                                          chartUuid,
                                      )}`;
                                      const chartExposure = chartExposures.find(
                                          ({ name }) =>
                                              name === chartExposureId,
                                      );
                                      return chartExposure
                                          ? chartExposure.dependsOn
                                          : [];
                                  })
                                  .flat(),
                          )
                        : [],
                    tags: ['lightdash', 'dashboard'],
                });
                return acc;
            },
            [],
        );

        const projectExposure: DbtExposure = {
            name: `ld_project_${snakeCaseName(projectSummary.projectUuid)}`,
            type: DbtExposureType.APPLICATION,
            owner: {
                name: `${user.firstName} ${user.lastName}`,
                email: user.email || '',
            },
            label: `Lightdash - ${projectSummary.name}`,
            description: 'Lightdash project',
            url: `${this.lightdashConfig.siteUrl}/projects/${projectUuid}/home`,
            dependsOn: uniq(
                chartExposures.map(({ dependsOn }) => dependsOn).flat(),
            ),
            tags: ['lightdash', 'project'],
        };

        return [
            projectExposure,
            ...chartExposures,
            ...dashboardExposures,
        ].reduce<Record<string, DbtExposure>>((acc, exposure) => {
            acc[exposure.name] = exposure;
            return acc;
        }, {});
    }

    async getProjectCredentialsPreference(
        user: SessionUser,
        projectUuid: string,
    ): Promise<UserWarehouseCredentials | undefined> {
        const project = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (auditedAbility.cannot('view', subject('Project', project))) {
            throw new ForbiddenError();
        }
        const credentials =
            await this.projectModel.getWarehouseCredentialsForProject(
                projectUuid,
            );
        return this.userWarehouseCredentialsModel.findForProject(
            project.projectUuid,
            user.userUuid,
            credentials.type,
        );
    }

    async getProjectWarehouseAuthInfo(
        user: SessionUser,
        projectUuid: string,
    ): Promise<{
        type: WarehouseTypes;
        authenticationType?: string;
    }> {
        const project = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (auditedAbility.cannot('view', subject('Project', project))) {
            throw new ForbiddenError();
        }
        const credentials =
            await this.projectModel.getWarehouseCredentialsForProject(
                projectUuid,
            );
        return {
            type: credentials.type,
            authenticationType:
                'authenticationType' in credentials
                    ? credentials.authenticationType
                    : undefined,
        };
    }

    async getProjectUserWarehouseCredentials(
        user: SessionUser,
        projectUuid: string,
    ): Promise<UserWarehouseCredentials[]> {
        const project = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (auditedAbility.cannot('view', subject('Project', project))) {
            throw new ForbiddenError();
        }
        return this.userWarehouseCredentialsModel.getAllByUserUuidForProject(
            user.userUuid,
            projectUuid,
        );
    }

    async upsertProjectCredentialsPreference(
        user: SessionUser,
        projectUuid: string,
        userWarehouseCredentialsUuid: string,
    ) {
        const userWarehouseCredentials =
            await this.userWarehouseCredentialsModel.getByUuid(
                userWarehouseCredentialsUuid,
            );
        if (userWarehouseCredentials.userUuid !== user.userUuid) {
            throw new ForbiddenError();
        }
        const project = await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    ...project,
                    metadata: { userWarehouseCredentialsUuid },
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        await this.userWarehouseCredentialsModel.upsertUserCredentialsPreference(
            user.userUuid,
            projectUuid,
            userWarehouseCredentialsUuid,
        );
    }

    /** @deprecated Only used by the deprecated custom metrics endpoint, which will be removed without replacement. */
    async getCustomMetrics(
        user: SessionUser,
        projectUuid: string,
    ): Promise<
        {
            name: string;
            label: string;
            modelName: string;
            yml: string;
            chartLabel: string;
            chartUrl: string;
        }[]
    > {
        // TODO implement permissions
        const chartSummaries = await this.savedChartModel.find({
            projectUuid,
        });
        const chartPromises = chartSummaries.map((summary) =>
            this.savedChartModel.get(summary.uuid, undefined),
        );

        const charts = await Promise.all(chartPromises);
        return charts.reduce<AnyType[]>((acc, chart) => {
            const customMetrics = chart.metricQuery.additionalMetrics;

            if (customMetrics === undefined || customMetrics.length === 0)
                return acc;
            const metrics = [
                ...acc,
                ...customMetrics.map((metric) => ({
                    name: metric.uuid,
                    label: metric.label,
                    modelName: metric.table,
                    yml: yaml.dump(convertCustomMetricToDbt(metric), {
                        quotingType: "'",
                    }),
                    chartLabel: chart.name,
                    chartUrl: `${this.lightdashConfig.siteUrl}/projects/${projectUuid}/saved/${chart.uuid}/view`,
                })),
            ];

            return metrics;
        }, []);
    }

    async createVirtualView(
        account: Account,
        projectUuid: string,
        payload: CreateVirtualViewPayload,
        resolveParameterValues = true,
    ) {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'create',
                subject('VirtualView', {
                    organizationUuid,
                    projectUuid,
                    metadata: { name: payload.name },
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        const explore = await this.findExplores({
            account,
            projectUuid,
            exploreNames: [snakeCaseName(payload.name)],
        });

        if (Object.keys(explore).length > 0) {
            throw new AlreadyExistsError(
                'Virtual view with this name already exists',
            );
        }
        const { warehouseClient } = await this._getWarehouseClient(
            projectUuid,
            await this.getWarehouseCredentials({
                projectUuid,
                userId: account.user.id,
                isRegisteredUser: account.isRegisteredUser(),
                isServiceAccount: account.isServiceAccount(),
            }),
        );
        const effectiveParameterValues = resolveParameterValues
            ? await this.resolveVirtualViewParameters(
                  projectUuid,
                  payload.sql,
                  payload.parameterValues,
              )
            : payload.parameterValues;

        const virtualView = await this.projectModel.createVirtualView(
            projectUuid,
            {
                ...payload,
                parameterValues: effectiveParameterValues,
            },
            warehouseClient,
        );

        this.analytics.trackAccount(account, {
            event: 'virtual_view.created',
            userId: account.user.id,
            properties: {
                virtualViewId: virtualView.name,
                name: virtualView.label,
                projectId: projectUuid,
                organizationId: organizationUuid,
            },
        });

        return { name: virtualView.name };
    }

    async updateVirtualView(
        account: Account,
        projectUuid: string,
        exploreName: string,
        payload: UpdateVirtualViewPayload,
        resolveParameterValues = true,
        expectedExplore?: Explore,
    ) {
        const explores = await this.findExplores({
            account,
            projectUuid,
            exploreNames: [exploreName],
        });
        const virtualView = explores[exploreName];

        if (
            !virtualView ||
            isExploreError(virtualView) ||
            virtualView.type !== ExploreType.VIRTUAL
        ) {
            throw new NotFoundError('Virtual view not found');
        }

        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'create',
                subject('VirtualView', {
                    organizationUuid,
                    projectUuid,
                    metadata: { exploreName },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const { warehouseClient } = await this._getWarehouseClient(
            projectUuid,
            await this.getWarehouseCredentials({
                projectUuid,
                userId: account.user.id,
                isRegisteredUser: account.isRegisteredUser(),
                isServiceAccount: account.isServiceAccount(),
            }),
        );

        const effectiveParameterValues = resolveParameterValues
            ? await this.resolveVirtualViewParameters(
                  projectUuid,
                  payload.sql,
                  payload.parameterValues,
              )
            : payload.parameterValues;

        const updatedExplore = await this.projectModel.updateVirtualView(
            projectUuid,
            exploreName,
            {
                ...payload,
                parameterValues: effectiveParameterValues,
            },
            warehouseClient,
            expectedExplore,
        );

        this.analytics.trackAccount(account, {
            event: 'virtual_view.updated',
            userId: account.user.id,
            properties: {
                virtualViewId: updatedExplore.name,
                name: updatedExplore.label,
                projectId: projectUuid,
                organizationId: organizationUuid,
            },
        });

        return { name: updatedExplore.name };
    }

    async deleteVirtualView(
        user: SessionUser,
        projectUuid: string,
        name: string,
    ) {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'delete',
                subject('VirtualView', {
                    organizationUuid,
                    projectUuid,
                    metadata: { exploreName: name },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.projectModel.deleteVirtualView(projectUuid, name);

        this.analytics.track({
            event: 'virtual_view.deleted',
            userId: user.userUuid,
            properties: {
                virtualViewId: name,
                projectId: projectUuid,
                organizationId: organizationUuid,
            },
        });
    }

    /**
     * Reads project-level scheduler settings for the background scheduler
     * worker. Intentionally unauthenticated: the worker runs in a system
     * context (no `SessionUser`) and only consumes project config flags +
     * an admin-authored contact sentence — no sensitive data is exposed.
     * Mutation paths (`updateSchedulerSettings`) keep the standard CASL
     * `update Project` check.
     */
    async getSchedulerSettingsForWorker(projectUuid: string): Promise<{
        schedulerTimezone: string;
        schedulerFailureNotifyRecipients: boolean;
        schedulerFailureIncludeContact: boolean;
        schedulerFailureContactOverride: string | null;
    }> {
        const project = await this.projectModel.get(projectUuid);
        return {
            schedulerTimezone: project.schedulerTimezone,
            schedulerFailureNotifyRecipients:
                project.schedulerFailureNotifyRecipients,
            schedulerFailureIncludeContact:
                project.schedulerFailureIncludeContact,
            schedulerFailureContactOverride:
                project.schedulerFailureContactOverride,
        };
    }

    async updateSchedulerSettings(
        user: SessionUser,
        projectUuid: string,
        settings: UpdateSchedulerSettings,
    ) {
        const project = await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(user);
        if (auditedAbility.cannot('update', subject('Project', project))) {
            throw new ForbiddenError();
        }

        const updatedProject = await this.projectModel.updateSchedulerSettings(
            projectUuid,
            settings,
        );

        if (settings.schedulerTimezone !== undefined) {
            this.analytics.track({
                event: 'default_scheduler_timezone.updated',
                userId: user.userUuid,
                properties: {
                    projectId: projectUuid,
                    organizationUuid: project.organizationUuid,
                    timeZone: getTimezoneLabel(settings.schedulerTimezone),
                },
            });
        }

        return updatedProject;
    }

    async updateQueryTimezone(
        user: SessionUser,
        projectUuid: string,
        settings: UpdateQueryTimezoneSettings,
    ) {
        const project = await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(user);
        if (auditedAbility.cannot('update', subject('Project', project))) {
            throw new ForbiddenError();
        }

        const { queryTimezone, useProjectTimezoneInFilters } = settings;

        if (
            queryTimezone === undefined &&
            useProjectTimezoneInFilters === undefined
        ) {
            throw new ParameterError(
                'Must provide queryTimezone or useProjectTimezoneInFilters',
            );
        }

        if (
            queryTimezone !== null &&
            queryTimezone !== undefined &&
            !isValidTimezone(queryTimezone)
        ) {
            throw new ParameterError(`Invalid timezone: "${queryTimezone}"`);
        }

        const updatedProject = await this.projectModel.updateQueryTimezone(
            projectUuid,
            settings,
        );

        this.analytics.track({
            event: 'query_timezone.updated',
            userId: user.userUuid,
            properties: {
                projectId: projectUuid,
                organizationUuid: project.organizationUuid,
                queryTimezone: updatedProject.query_timezone
                    ? getTimezoneLabel(updatedProject.query_timezone)
                    : null,
                useProjectTimezoneInFilters:
                    updatedProject.use_project_timezone_in_filters,
            },
        });
    }

    async isTimezoneSupportEnabled(user: {
        userUuid: string;
        organizationUuid?: string;
    }): Promise<boolean> {
        const { enabled } = await this.featureFlagModel.get({
            featureFlagId: FeatureFlags.EnableTimezoneSupport,
            user,
        });

        return enabled;
    }

    async getQueryTimezoneForProject(projectUuid: string): Promise<string> {
        const projectTimezone =
            await this.projectModel.getQueryTimezone(projectUuid);
        return projectTimezone ?? this.lightdashConfig.query.timezone ?? 'UTC';
    }

    async createTag(
        user: SessionUser,
        {
            projectUuid,
            name,
            color,
        }: Pick<Tag, 'projectUuid' | 'name' | 'color'>,
    ): Promise<Pick<Tag, 'tagUuid'>> {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Tags', {
                    projectUuid,
                    organizationUuid,
                    metadata: { name },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const createdTagUuid = await this.tagsModel.create({
            project_uuid: projectUuid,
            name,
            color,
            created_by_user_uuid: user.userUuid,
            yaml_reference: null,
        });

        this.analytics.track({
            event: 'category.created',
            userId: user.userUuid,
            properties: {
                name,
                projectId: projectUuid,
                organizationId: organizationUuid,
                context: 'ui',
            },
        });

        return { tagUuid: createdTagUuid.tag_uuid };
    }

    async deleteTag(user: SessionUser, tagUuid: string) {
        const tag = await this.tagsModel.get(tagUuid);

        if (!tag) {
            throw new NotFoundError('Tag not found');
        }

        const { organizationUuid } = await this.projectModel.getSummary(
            tag.projectUuid,
        );

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Tags', {
                    projectUuid: tag.projectUuid,
                    organizationUuid,
                    metadata: { tagUuid },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.tagsModel.delete(tagUuid);
    }

    async updateTag(
        user: SessionUser,
        tagUuid: string,
        tagUpdate: DbTagUpdate,
    ) {
        const tag = await this.tagsModel.get(tagUuid);

        if (!tag) {
            throw new NotFoundError('Tag not found');
        }

        const { organizationUuid } = await this.projectModel.getSummary(
            tag.projectUuid,
        );

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Tags', {
                    projectUuid: tag.projectUuid,
                    organizationUuid,
                    metadata: { tagUuid },
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.tagsModel.update(tagUuid, tagUpdate);
    }

    async getTags(user: Account, projectUuid: string) {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'view',
                subject('Tags', { projectUuid, organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        return this.tagsModel.list(projectUuid);
    }

    async getTableGroups(
        account: Account,
        projectUuid: string,
    ): Promise<Record<string, GroupType>> {
        const { organizationUuid, type } =
            await this.projectModel.getSummary(projectUuid);
        const auditedAbility = this.createAuditedAbility(account);
        if (
            auditedAbility.cannot(
                'view',
                subject('Project', {
                    projectUuid,
                    organizationUuid,
                    type,
                }),
            )
        ) {
            throw new ForbiddenError();
        }
        return this.projectModel.getTableGroups(projectUuid);
    }

    async replaceProjectTableGroups({
        user,
        projectUuid,
        tableGroups,
    }: {
        user: SessionUser;
        projectUuid: string;
        tableGroups: Record<string, GroupType>;
    }) {
        const { organizationUuid, type, createdByUserUuid } =
            await this.projectModel.getWithSensitiveFields(projectUuid);

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'update',
                subject('Project', {
                    projectUuid,
                    organizationUuid,
                    type,
                    createdByUserUuid,
                    metadata: { createdByUserUuid },
                }),
            )
        ) {
            throw new ForbiddenError(
                `User does not have permission to update project table groups`,
            );
        }

        await this.projectModel.setTableGroups(projectUuid, tableGroups);
    }

    async replaceProjectParameters({
        user,
        projectUuid,
        parameters,
    }: {
        user: SessionUser;
        projectUuid: string;
        parameters: LightdashProjectConfig['parameters'];
    }) {
        const { organizationUuid, type, createdByUserUuid } =
            await this.projectModel.getWithSensitiveFields(projectUuid);

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'update',
                subject('Project', {
                    projectUuid,
                    organizationUuid,
                    type,
                    createdByUserUuid,
                    metadata: { createdByUserUuid },
                }),
            )
        ) {
            throw new ForbiddenError(
                `User does not have permission to update project parameters`,
            );
        }

        await this.projectParametersModel.replace(
            projectUuid,
            parameters ?? {},
        );
    }

    async replaceProjectDefaults({
        user,
        projectUuid,
        defaults,
    }: {
        user: SessionUser;
        projectUuid: string;
        defaults: ProjectDefaults;
    }) {
        const { organizationUuid, type, createdByUserUuid } =
            await this.projectModel.getWithSensitiveFields(projectUuid);

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'update',
                subject('Project', {
                    projectUuid,
                    organizationUuid,
                    type,
                    createdByUserUuid,
                    metadata: { createdByUserUuid },
                }),
            )
        ) {
            throw new ForbiddenError(
                `User does not have permission to update project defaults`,
            );
        }

        await this.projectModel.updateProjectDefaults(projectUuid, defaults);
    }

    async replaceYamlTags(
        user: SessionUser,
        projectUuid: string,
        yamlTags: (Pick<Tag, 'name' | 'color'> & {
            yamlReference: NonNullable<Tag['yamlReference']>;
        })[],
    ) {
        const { organizationUuid } =
            await this.projectModel.getSummary(projectUuid);

        const auditedAbility = this.createAuditedAbility(user);
        if (
            auditedAbility.cannot(
                'manage',
                subject('Tags', {
                    projectUuid,
                    organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError(
                `User does not have permission to manage YAML tags in project`,
            );
        }

        await this.replaceYamlTagsWithoutPermissionCheck(
            user,
            organizationUuid,
            projectUuid,
            yamlTags,
        );
    }

    private async replaceYamlTagsWithoutPermissionCheck(
        user: SessionUser,
        organizationUuid: string,
        projectUuid: string,
        yamlTags: (Pick<Tag, 'name' | 'color'> & {
            yamlReference: NonNullable<Tag['yamlReference']>;
        })[],
    ) {
        const yamlTagsIn = yamlTags.map((tag) => ({
            project_uuid: projectUuid,
            name: tag.name,
            color: tag.color,
            created_by_user_uuid: user.userUuid, // we always pass the userUuid although when updating a tag it's going to be ignored
            yaml_reference: tag.yamlReference,
        }));

        const { yamlTagsToCreateOrUpdate } =
            await this.tagsModel.replaceYamlTags(projectUuid, yamlTagsIn);

        yamlTagsToCreateOrUpdate.forEach((name) => {
            this.analytics.track({
                event: 'category.created',
                userId: user.userUuid,
                properties: {
                    name,
                    projectId: projectUuid,
                    organizationId: organizationUuid,
                    context: 'yaml',
                },
            });
        });
    }

    async findReplaceableCustomFields({
        projectUuid,
    }: ReplaceCustomFieldsPayload): Promise<ReplaceableCustomFields> {
        const charts =
            await this.savedChartModel.findChartsWithCustomFields(projectUuid);
        const explores = await this.projectModel.findExploresFromCache(
            projectUuid,
            'name',
            charts.map((chart) => chart.tableName),
        );
        const replaceableFields = charts.reduce<ReplaceableCustomFields>(
            (acc, chart) => {
                const explore = explores[chart.tableName];
                if (!explore || isExploreError(explore)) {
                    return acc;
                }
                const replaceableCustomMetrics = findReplaceableCustomMetrics({
                    customMetrics: chart.customMetrics,
                    metrics: getMetrics(explore),
                });
                if (Object.keys(replaceableCustomMetrics).length > 0) {
                    acc[chart.uuid] = {
                        uuid: chart.uuid,
                        label: chart.name,
                        customMetrics: replaceableCustomMetrics,
                    };
                }
                return acc;
            },
            {},
        );

        this.logger.info(
            `Found ${
                Object.keys(replaceableFields).length
            } charts with replaceable/suggested fields in project ${projectUuid}`,
        );
        return replaceableFields;
    }

    async replaceCustomFields({
        userUuid,
        projectUuid,
        organizationUuid,
        replaceFields,
        skipChartsUpdatedAfter,
    }: {
        userUuid: string;
        organizationUuid: string;
        projectUuid: string;
        replaceFields: ReplaceCustomFields;
        skipChartsUpdatedAfter: Date;
    }): Promise<Array<Pick<SavedChartDAO, 'uuid' | 'name'>>> {
        const updatedChartPromises = Object.entries(replaceFields).map(
            async ([chartUuid, fieldsToReplace]) => {
                const chart = await this.savedChartModel.get(chartUuid);
                if (chart.updatedAt > skipChartsUpdatedAfter) {
                    this.logger.info(
                        `Skipped replace custom fields in chart ${chart.uuid} as it was recently updated.`,
                    );
                    return null;
                }
                const { hasChanges, chartVersion, skippedFields } =
                    maybeReplaceFieldsInChartVersion({
                        fieldsToReplace,
                        chartVersion: chart,
                    });
                if (Object.keys(skippedFields.customMetrics).length > 0) {
                    const skippedReasons: string[] = Object.entries(
                        skippedFields.customMetrics,
                    ).map(([key, { reason }]) => `[${key}] ${reason}`);
                    this.logger.info(
                        `Skipped replace custom fields in chart ${
                            chart.uuid
                        }:\n ${skippedReasons.join('\n')}`,
                    );
                }
                // create new version if any fields were replaced
                if (hasChanges) {
                    await this.savedChartModel.createVersion(
                        chartUuid,
                        chartVersion,
                        undefined,
                    );
                    return { uuid: chart.uuid, name: chart.name };
                }
                return null;
            },
        );
        const updatedCharts = (await Promise.all(updatedChartPromises)).filter(
            isNotNull,
        );
        this.logger.info(
            `Replaced fields in ${updatedCharts.length} charts in project ${projectUuid}`,
        );
        this.analytics.track({
            event: 'custom_fields.replaced',
            userId: userUuid,
            properties: {
                projectId: projectUuid,
                organizationId: organizationUuid,
                chartsCount: Object.keys(updatedCharts).length,
            },
        });
        return updatedCharts;
    }

    async createPreviewFromDbtCloudWebhook(
        projectUuid: string,
        accountId: number,
        runId: number,
        webhookAuth: { rawBody: Buffer | null; signature: string | null },
    ): Promise<string> {
        // create preview project permissions are checked in `createWithoutCompile`
        const project =
            await this.projectModel.getWithSensitiveFields(projectUuid);

        if (!project.warehouseConnection) {
            throw new ParameterError(
                `Missing warehouse connection for project ${projectUuid}`,
            );
        }

        if (project.dbtConnection.type !== DbtProjectType.DBT_CLOUD_IDE) {
            throw new ParameterError(
                `Project ${projectUuid} is not a dbt Cloud IDE project`,
            );
        }

        const webhookSecret = project.dbtConnection.webhook_hmac_secret;
        if (webhookSecret) {
            if (
                !webhookAuth.rawBody ||
                !webhookAuth.signature ||
                !isValidDbtCloudWebhookSignature(
                    webhookSecret,
                    webhookAuth.rawBody,
                    webhookAuth.signature,
                )
            ) {
                throw new ForbiddenError('Invalid dbt Cloud webhook signature');
            }
        } else {
            this.logger.info(
                `dbt Cloud webhook for project ${projectUuid} processed without signature verification (no webhook_hmac_secret configured)`,
            );
        }

        // todo: fix this
        if (!project.createdByUserUuid) {
            throw new ParameterError(
                `Didn't find user for project ${projectUuid}`,
            );
        }

        // todo: fix this
        const user = await this.userModel.findSessionUserByUUID(
            project.createdByUserUuid,
        );

        const response = await fetch(
            `https://cloud.getdbt.com/api/v2/accounts/${accountId}/runs/${runId}/artifacts/manifest.json`,
            {
                headers: {
                    Authorization: `Bearer ${project.dbtConnection.api_key}`,
                },
            },
        );
        const manifest = await response.json();

        const prId = manifest.metadata.env.DBT_CLOUD_PR_ID;
        const jobId = manifest.metadata.env.DBT_CLOUD_JOB_ID;

        const nodes = Object.values(manifest.nodes);
        Logger.info(`Manifest models ${nodes.length}`);
        // todo: does it error if they use a selector in the job? check logic in dbtBaseProjectAdapter.compileAllExplores
        const models = nodes.filter(
            (node: AnyType) =>
                ['model', 'seed'].includes(node.resource_type) && node.meta,
        ) as DbtRawModelNode[];

        const { warehouseClient } = await this._getWarehouseClient(
            projectUuid,
            project.warehouseConnection,
        );

        const [dbtModelNode, exploreErrors] =
            DbtBaseProjectAdapter._validateDbtModel(
                warehouseClient.getAdapterType(),
                models,
                DbtManifestVersion.V12,
            );
        const disableTimestampConversion =
            project.warehouseConnection?.type === 'snowflake' &&
            project.warehouseConnection.disableTimestampConversion === true;

        const convertedExplores = await convertExplores(
            dbtModelNode,
            false,
            warehouseClient.getAdapterType(),
            warehouseClient,
            {
                spotlight: {
                    default_visibility: 'hide', // todo: pass correct config
                },
                defaults: project.projectDefaults,
            },
            {
                disableTimestampConversion,
                postProcessors: [preAggregatePostProcessor],
            },
        );
        Logger.info(`Explore count: ${convertedExplores.length}`);
        const previewName = `preview_${jobId}_${prId}`;
        Logger.info(`Preview name: ${previewName}`);
        Logger.info(`Find all project for: ${project.organizationUuid}`);
        const allProjects = await this.projectModel.getAllByOrganizationUuid(
            project.organizationUuid,
        );
        const previewExists = allProjects.find(
            (p) => p.name === previewName && p.type === ProjectType.PREVIEW,
        );
        let projectToSetExplores: string;
        Logger.info(`Preview exists: ${previewExists}`);
        if (previewExists) {
            projectToSetExplores = previewExists.projectUuid;
        } else {
            const previewData: CreateProject = {
                name: previewName,
                type: ProjectType.PREVIEW,
                warehouseConnection: maybeOverrideWarehouseConnection(
                    project.warehouseConnection,
                    {
                        schema: `dbt_cloud_pr_${jobId}_${prId}`,
                    },
                ),
                dbtConnection: {
                    type: DbtProjectType.NONE,
                },
                upstreamProjectUuid: projectUuid,
                dbtVersion: project.dbtVersion,
            };

            const newPreview = await this.createWithoutCompile(
                user,
                previewData,
                RequestMethod.WEB_APP, // TODO: fix context
            );
            await this.throwIfPreviewCopyFailed(newPreview);
            projectToSetExplores = newPreview.project.projectUuid;
        }

        Logger.info(`Set explores for: ${projectToSetExplores}`);
        await this.saveExploresToCacheAndIndexCatalog({
            userUuid: user.userUuid,
            projectUuid: projectToSetExplores,
            explores: [...convertedExplores, ...exploreErrors],
            compilationSource: 'refresh_dbt',
            jobUuid: null,
            requestMethod: 'api',
            projectConfigDefaults: project.projectDefaults,
        });

        Logger.info(`Schedule validation:`, {
            userUuid: user.userUuid,
            projectUuid: projectToSetExplores,
            context: 'cli', // todo: fix me
            organizationUuid: project.organizationUuid,
        });
        await this.schedulerClient.generateValidation({
            userUuid: user.userUuid,
            projectUuid: projectToSetExplores,
            context: 'cli', // todo: fix me
            organizationUuid: project.organizationUuid,
        });
        return projectToSetExplores;
    }

    async getBigqueryDatasets(user: SessionUser, projectId: string) {
        // At this point, there might not be any projects
        // so we can't check any permissions here.
        // Bigquery will handle the permissions
        const refreshToken = await this.userOAuthGrantsModel.getRefreshToken(
            user.userUuid,
            OpenIdIdentityIssuerType.GOOGLE,
        );

        if (projectId.length === 0) {
            // Need to provide a projectId to get datasets
            return [];
        }
        // Validate refresh token has the right bigquery scopes
        await UserService.generateGoogleAccessToken(refreshToken, 'bigquery');
        try {
            const datasets = await BigqueryWarehouseClient.getDatabases(
                projectId,
                refreshToken,
            );
            return datasets;
        } catch (error) {
            this.logger.error(
                `getBigqueryDatasets error: ${JSON.stringify(error)}`,
            );

            if (BigqueryWarehouseClient.isBigqueryError(error)) {
                // This can throw other errors, like for example, if you use a projectId you don't have access
                // Or this projectId does not have bigquery enabled
                if (error.errors[0].reason === 'notFound') {
                    throw new NotFoundError(
                        `Project ${projectId} not found on BigQuery`,
                    );
                }
                throw new WarehouseConnectionError(
                    `Failed to get datasets from BigQuery`,
                );
            }
            throw new UnexpectedServerError('Failed to get datasets');
        }
    }

    async getBigqueryProjects(user: SessionUser) {
        // At this point, there might not be any projects
        // so we can't check any permissions here.
        // Bigquery will handle the permissions
        const refreshToken = await this.userOAuthGrantsModel.getRefreshToken(
            user.userUuid,
            OpenIdIdentityIssuerType.GOOGLE,
        );

        // Validate refresh token has the right bigquery scopes and get access token
        const accessToken = await UserService.generateGoogleAccessToken(
            refreshToken,
            'bigquery',
        );

        try {
            const projects =
                await BigqueryWarehouseClient.getProjects(accessToken);
            return projects;
        } catch (error) {
            this.logger.error(
                `getBigqueryProjects error: ${JSON.stringify(error)}`,
            );

            if (BigqueryWarehouseClient.isBigqueryError(error)) {
                throw new WarehouseConnectionError(
                    `Failed to get projects from BigQuery`,
                );
            }
            throw new UnexpectedServerError('Failed to get projects');
        }
    }

    async getBigqueryProjectRecommendation(user: SessionUser) {
        // At this point, there might not be any projects
        // so we can't check any permissions here.
        // Bigquery will handle the permissions
        const refreshToken = await this.userOAuthGrantsModel.getRefreshToken(
            user.userUuid,
            OpenIdIdentityIssuerType.GOOGLE,
        );
        const accessToken = await UserService.generateGoogleAccessToken(
            refreshToken,
            'bigquery',
        );

        try {
            const projects =
                await BigqueryWarehouseClient.getProjects(accessToken);
            return await BigqueryWarehouseClient.getProjectRecommendation(
                projects,
                refreshToken,
            );
        } catch (error) {
            this.logger.error(
                `getBigqueryProjectRecommendation error: ${JSON.stringify(error)}`,
            );

            if (BigqueryWarehouseClient.isBigqueryError(error)) {
                throw new WarehouseConnectionError(
                    'Failed to get a project recommendation from BigQuery',
                );
            }
            throw new UnexpectedServerError(
                'Failed to get a project recommendation',
            );
        }
    }

    // eslint-disable-next-line class-methods-use-this
    getUserQueryTags(account: Account) {
        if (account.isJwtUser()) {
            return {
                embed: 'true',
                external_id: account.user.id,
            };
        }
        return {
            user_uuid: account.user.id,
        };
    }

    /**
     * Combines parameter values from multiple sources in order of priority:
     * 1. Request parameters (highest priority)
     * 2. Saved chart/dashboard parameters
     * 3. Default explore parameters values
     * 4. Default project parameters values(lowest priority)
     */
    public async combineParameters(
        projectUuid: string,
        explore?: Explore,
        requestParameters?: ParametersValuesMap,
        savedParameters?: ParametersValuesMap,
        preloadedProjectParameters?: DbProjectParameter[],
    ): Promise<ParametersValuesMap> {
        // Get default values for parameters
        const projectDefaultParameterValues: ParametersValuesMap = {};

        // Fetch all parameters
        const parameterConfigs =
            preloadedProjectParameters ??
            (await this.projectParametersModel.find(projectUuid));

        for (const paramConfig of parameterConfigs) {
            if (paramConfig.config.default !== undefined) {
                projectDefaultParameterValues[paramConfig.name] =
                    paramConfig.config.default;
            }
        }

        const exploreParameters = explore
            ? getAvailableParametersFromTables(Object.values(explore.tables))
            : [];

        const exploreDefaultParameterValues = Object.fromEntries(
            Object.entries(exploreParameters)
                .map(([key, value]) => [key, value.default])
                .filter(([key, value]) => value !== undefined),
        );

        // Combine in order of priority: defaults (project / explore) < virtual view saved values < saved parameters (chart/dashboard) < request
        return {
            ...projectDefaultParameterValues,
            ...exploreDefaultParameterValues,
            ...(explore?.savedParameterValues || {}),
            ...(savedParameters || {}),
            ...(requestParameters || {}),
        };
    }

    /**
     * Resolves effective parameter values for a virtual view by merging
     * project defaults with explicitly provided values, filtered to only
     * parameters referenced in the SQL.
     */
    private async resolveVirtualViewParameters(
        projectUuid: string,
        sql: string,
        parameterValues?: ParametersValuesMap,
    ): Promise<ParametersValuesMap | undefined> {
        const referencedParams = getParameterReferences(sql);
        if (referencedParams.length === 0) return undefined;

        const allValues = await this.combineParameters(
            projectUuid,
            undefined,
            parameterValues,
        );
        const filtered = Object.fromEntries(
            Object.entries(allValues).filter(([key]) =>
                referencedParams.includes(key),
            ),
        );
        return Object.keys(filtered).length > 0 ? filtered : undefined;
    }

    async validateVirtualViewParameterReferences(
        projectUuid: string,
        sql: string,
        parameterValues?: ParametersValuesMap,
    ): Promise<void> {
        const references = getParameterReferences(sql);
        const definitions = await this.projectParametersModel.find(projectUuid);
        const definitionsByName = new Map(
            definitions.map((definition) => [definition.name, definition]),
        );
        const unknown = references.filter(
            (name) =>
                !definitionsByName.has(name) && !isReservedParameterName(name),
        );
        if (unknown.length > 0) {
            throw new ParameterError(
                `Virtual view references unknown parameters: ${unknown.join(', ')}`,
            );
        }
        const missing = references.filter((name) => {
            const definition = definitionsByName.get(name);
            if (!definition && isReservedParameterName(name)) return false;
            return (
                !(name in (parameterValues ?? {})) &&
                definition?.config.default === undefined
            );
        });
        if (missing.length > 0) {
            throw new ParameterError(
                `Virtual view is missing values for required parameters: ${missing.join(', ')}`,
            );
        }
    }

    static isChartEmbed(account: Account) {
        if (!isJwtUser(account)) return false;

        return account.access.content.type === 'chart';
    }
}
