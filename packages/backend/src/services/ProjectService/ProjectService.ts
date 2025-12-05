import { subject } from '@casl/ability';
import {
    Account,
    addDashboardFiltersToMetricQuery,
    AlreadyExistsError,
    AlreadyProcessingError,
    AndFilterGroup,
    AnonymousAccount,
    AnyType,
    ApiChartAndResults,
    ApiCreatePreviewResults,
    type ApiCreateProjectResults,
    ApiQueryResults,
    ApiSqlQueryResults,
    assertEmbeddedAuth,
    assertIsAccountWithOrg,
    assertUnreachable,
    BigqueryAuthenticationType,
    CacheMetadata,
    calculateCompilationReport,
    type CalculateSubtotalsFromQuery,
    CalculateTotalFromQuery,
    ChartSourceType,
    ChartSummary,
    CompiledDimension,
    ContentType,
    convertCustomMetricToDbt,
    convertExplores,
    countCustomDimensionsInMetricQuery,
    countTotalFilterRules,
    type CreateDatabricksCredentials,
    createDimensionWithGranularity,
    CreateJob,
    CreateProject,
    CreateProjectMember,
    CreateProjectOptionalCredentials,
    CreateProjectTableConfiguration,
    CreateSnowflakeCredentials,
    CreateVirtualViewPayload,
    CreateWarehouseCredentials,
    CustomFormatType,
    CustomSqlQueryForbiddenError,
    DashboardAvailableFilters,
    DashboardBasicDetails,
    type DashboardDAO,
    DashboardFilters,
    DatabricksAuthenticationType,
    DateZoom,
    DbtExposure,
    DbtExposureType,
    DbtManifestVersion,
    DbtProjectEnvironmentVariable,
    DbtProjectType,
    DbtRawModelNode,
    deepEqual,
    DefaultSupportedDbtVersion,
    DimensionType,
    DownloadFileType,
    Explore,
    ExploreError,
    ExploreType,
    FeatureFlags,
    FilterableDimension,
    FilterGroupItem,
    FilterOperator,
    findFieldByIdInExplore,
    findReplaceableCustomMetrics,
    flattenFilterGroup,
    ForbiddenError,
    formatRawRows,
    formatRows,
    getAggregatedField,
    getAvailableParametersFromTables,
    getDashboardFilterRulesForTables,
    getDateDimension,
    getDimensions,
    getErrorMessage,
    getFieldQuoteChar,
    getFields,
    getIntrinsicUserAttributes,
    getItemId,
    getMetrics,
    getSubtotalKey,
    getTimezoneLabel,
    GroupByColumn,
    hasIntersection,
    hasWarehouseCredentials,
    IntrinsicUserAttributes,
    isCartesianChartConfig,
    isCustomSqlDimension,
    isDateItem,
    isDimension,
    isExploreError,
    isFilterableDimension,
    isFilterRule,
    isJwtUser,
    isNotNull,
    isUserWithOrg,
    ItemsMap,
    Job,
    JobStatusType,
    JobStepType,
    JobType,
    LightdashError,
    LightdashProjectConfig,
    maybeOverrideDbtConnection,
    maybeOverrideWarehouseConnection,
    maybeReplaceFieldsInChartVersion,
    mergeWarehouseCredentials,
    MetricQuery,
    MissingWarehouseCredentialsError,
    MostPopularAndRecentlyUpdated,
    normalizeIndexColumns,
    NotExistsError,
    NotFoundError,
    NotSupportedError,
    OpenIdIdentityIssuerType,
    type ParameterDefinitions,
    ParameterError,
    type ParametersValuesMap,
    PivotChartData,
    PivotConfiguration,
    PivotValuesColumn,
    Project,
    ProjectCatalog,
    ProjectGroupAccess,
    ProjectMemberProfile,
    ProjectMemberRole,
    ProjectType,
    QueryExecutionContext,
    ReplaceableCustomFields,
    ReplaceCustomFields,
    ReplaceCustomFieldsPayload,
    replaceDimensionInExplore,
    RequestMethod,
    ResultRow,
    type RunQueryTags,
    SavedChartDAO,
    SavedChartsInfoForDashboardAvailableFilters,
    SessionUser,
    snakeCaseName,
    SnowflakeTokenError,
    SortByDirection,
    SortField,
    SpaceQuery,
    SpaceSummary,
    SqlRunnerPayload,
    SqlRunnerPivotQueryPayload,
    SummaryExplore,
    TablesConfiguration,
    TableSelectionType,
    type Tag,
    UnexpectedServerError,
    UpdateMetadata,
    UpdateProject,
    UpdateProjectMember,
    UpdateVirtualViewPayload,
    UserAccessControls,
    UserAttributeValueMap,
    UserWarehouseCredentials,
    ValuesColumn,
    VizColumn,
    VizIndexType,
    WarehouseClient,
    WarehouseConnectionError,
    WarehouseCredentials,
    type WarehouseSqlBuilder,
    WarehouseTablesCatalog,
    WarehouseTableSchema,
    WarehouseTypes,
} from '@lightdash/common';
import {
    BigqueryWarehouseClient,
    exchangeDatabricksOAuthCredentials,
    refreshDatabricksOAuthToken,
    SshTunnel,
} from '@lightdash/warehouses';
import * as Sentry from '@sentry/node';
import * as crypto from 'crypto';
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
} from '../../analytics/LightdashAnalytics';
import { S3CacheClient } from '../../clients/Aws/S3CacheClient';
import { S3Client } from '../../clients/Aws/S3Client';
import EmailClient from '../../clients/EmailClient/EmailClient';
import { LightdashConfig } from '../../config/parseConfig';
import type { DbTagUpdate } from '../../database/entities/tags';
import { errorHandler } from '../../errors';
import Logger from '../../logging/logger';
import { measureTime } from '../../logging/measureTime';
import { AnalyticsModel } from '../../models/AnalyticsModel';
import type { CatalogModel } from '../../models/CatalogModel/CatalogModel';
import { ContentModel } from '../../models/ContentModel/ContentModel';
import { DashboardModel } from '../../models/DashboardModel/DashboardModel';
import { DownloadFileModel } from '../../models/DownloadFileModel';
import { EmailModel } from '../../models/EmailModel';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { GroupsModel } from '../../models/GroupsModel';
import { JobModel } from '../../models/JobModel/JobModel';
import { OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';
import { OrganizationWarehouseCredentialsModel } from '../../models/OrganizationWarehouseCredentialsModel';
import { ProjectCompileLogModel } from '../../models/ProjectCompileLogModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { ProjectParametersModel } from '../../models/ProjectParametersModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SshKeyPairModel } from '../../models/SshKeyPairModel';
import type { TagsModel } from '../../models/TagsModel';
import { UserAttributesModel } from '../../models/UserAttributesModel';
import { UserModel } from '../../models/UserModel';
import { UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { WarehouseAvailableTablesModel } from '../../models/WarehouseAvailableTablesModel/WarehouseAvailableTablesModel';
import { isFeatureFlagEnabled } from '../../postHog';
import { DbtBaseProjectAdapter } from '../../projectAdapters/dbtBaseProjectAdapter';
import { projectAdapterFromConfig } from '../../projectAdapters/projectAdapter';
import { compileMetricQuery } from '../../queryCompiler';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { ProjectAdapter } from '../../types';
import {
    runWorkerThread,
    wrapSentryTransaction,
    wrapSentryTransactionSync,
} from '../../utils';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import {
    CompiledQuery,
    MetricQueryBuilder,
} from '../../utils/QueryBuilder/MetricQueryBuilder';
import { PivotQueryBuilder } from '../../utils/QueryBuilder/PivotQueryBuilder';
import { applyLimitToSqlQuery } from '../../utils/QueryBuilder/utils';
import { SubtotalsCalculator } from '../../utils/SubtotalsCalculator';
import { BaseService } from '../BaseService';
import {
    hasDirectAccessToSpace,
    hasViewAccessToSpace,
} from '../SpaceService/SpaceService';
import {
    doesExploreMatchRequiredAttributes,
    exploreHasFilteredAttribute,
    getFilteredExplore,
} from '../UserAttributesService/UserAttributeUtils';
import { UserService } from '../UserService';
import { getAvailableParameterDefinitions } from './parameters';

export type ProjectServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    projectModel: ProjectModel;
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
    s3Client: S3Client;
    groupsModel: GroupsModel;
    tagsModel: TagsModel;
    catalogModel: CatalogModel;
    contentModel: ContentModel;
    encryptionUtil: EncryptionUtil;
    userModel: UserModel;
    featureFlagModel: FeatureFlagModel;
    projectParametersModel: ProjectParametersModel;
    organizationWarehouseCredentialsModel: OrganizationWarehouseCredentialsModel;
    projectCompileLogModel: ProjectCompileLogModel;
};

export class ProjectService extends BaseService {
    lightdashConfig: LightdashConfig;

    analytics: LightdashAnalytics;

    projectModel: ProjectModel;

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

    s3Client: S3Client;

    groupsModel: GroupsModel;

    tagsModel: TagsModel;

    catalogModel: CatalogModel;

    contentModel: ContentModel;

    encryptionUtil: EncryptionUtil;

    userModel: UserModel;

    featureFlagModel: FeatureFlagModel;

    projectParametersModel: ProjectParametersModel;

    projectCompileLogModel: ProjectCompileLogModel;

    organizationWarehouseCredentialsModel: OrganizationWarehouseCredentialsModel;

    constructor({
        lightdashConfig,
        analytics,
        projectModel,
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
        s3Client,
        groupsModel,
        tagsModel,
        catalogModel,
        contentModel,
        encryptionUtil,
        userModel,
        featureFlagModel,
        projectParametersModel,
        projectCompileLogModel,
        organizationWarehouseCredentialsModel,
    }: ProjectServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.projectModel = projectModel;
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
        this.s3Client = s3Client;
        this.groupsModel = groupsModel;
        this.tagsModel = tagsModel;
        this.catalogModel = catalogModel;
        this.contentModel = contentModel;
        this.encryptionUtil = encryptionUtil;
        this.userModel = userModel;
        this.featureFlagModel = featureFlagModel;
        this.projectParametersModel = projectParametersModel;
        this.projectCompileLogModel = projectCompileLogModel;
        this.organizationWarehouseCredentialsModel =
            organizationWarehouseCredentialsModel;
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
        queryTags: Record<string, unknown>;
        explore: Explore;
        parameters: ParametersValuesMap | undefined;
    }): MetricQueryExecutionProperties {
        return {
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
            ...(queryTags?.dashboard_uuid
                ? { dashboardId: queryTags.dashboard_uuid }
                : {}),
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

        switch (data.type) {
            case ProjectType.DEFAULT:
                // checks if user has permission to create project on an organization level
                if (
                    user.ability.can(
                        'create',
                        subject('Project', {
                            organizationUuid: user.organizationUuid,
                            type: ProjectType.DEFAULT,
                        }),
                    )
                ) {
                    return true;
                }

                throw new ForbiddenError();

            case ProjectType.PREVIEW:
                if (data.upstreamProjectUuid) {
                    const upstreamProject = await this.projectModel.get(
                        data.upstreamProjectUuid,
                    );
                    if (
                        user.ability.cannot(
                            'view',
                            subject('Project', {
                                organizationUuid:
                                    upstreamProject.organizationUuid,
                                projectUuid: upstreamProject.projectUuid,
                            }),
                        )
                    ) {
                        throw new ForbiddenError(
                            'Cannot access upstream project',
                        );
                    }
                    if (upstreamProject.type === ProjectType.PREVIEW) {
                        throw new ForbiddenError(
                            'Cannot create a preview project from a preview project',
                        );
                    }
                    if (
                        // checks if user has permission to create project from an upstream project on a project level
                        user.ability.can(
                            'create',
                            subject('Project', {
                                upstreamProjectUuid:
                                    upstreamProject.projectUuid,
                                type: ProjectType.PREVIEW,
                            }),
                        )
                    ) {
                        return true;
                    }
                }

                if (
                    // checks if user has permission to create project on an organization level
                    user.ability.can(
                        'create',
                        subject('Project', {
                            organizationUuid: user.organizationUuid,
                            type: ProjectType.PREVIEW,
                        }),
                    )
                ) {
                    return true;
                }

                throw new ForbiddenError();

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

        const userAttributes =
            await this.userAttributesModel.getAttributeValuesForOrgMember({
                organizationUuid: organizationUuid || '',
                userUuid: userId || '',
            });

        const emailStatus = await this.emailModel.getPrimaryEmailStatus(userId);
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
                // On old project configs we were storing refreshToken inside the token field (legacy)
                let refreshToken = args.refreshToken || args.token;

                // We pass the refresh token for snowflake on args
                // This is used on user warehouse credentials.
                // If this is provided, use this instead of getting the refresh token from the openid table
                if (refreshToken === undefined) {
                    refreshToken = await this.userModel.getRefreshToken(
                        userUuid,
                        OpenIdIdentityIssuerType.SNOWFLAKE,
                    );
                }
                // If we still don't have a token, we can't refresh
                if (!refreshToken) {
                    throw new Error(
                        'No refresh token available for Snowflake SSO authentication',
                    );
                }
                // Token format validation
                if (refreshToken.startsWith('ver:1-hint')) {
                    // This is an invalid refresh token format,
                    // we are using `access token` as refresh token (refresh token starts with ver:2-hint)
                    // Review the calls to this method and ensure we pass {token: refreshToken} instead
                    // This might affect older projects that were not storing correctly refresh token
                    // They should be recompiled to store the refresh token correctly
                    // see _resolveWarehouseClientCredentials for more details.
                    throw new UnexpectedServerError(
                        'Invalid snowflake refresh token format, please recompile your project',
                    );
                }
                this.logger.debug(
                    `Refreshing snowflake token for user ${userUuid}`,
                );

                const accessToken =
                    await UserService.generateSnowflakeAccessToken(
                        refreshToken,
                    );
                return {
                    ...args,
                    authenticationType: 'sso',
                    token: accessToken,
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

                let { refreshToken } = args;

                // If no refresh token provided, try to get it from user's OpenID table
                if (refreshToken === undefined) {
                    refreshToken = await this.userModel.getRefreshToken(
                        userUuid,
                        OpenIdIdentityIssuerType.DATABRICKS,
                    );
                }

                // If we still don't have a refresh token, we can't refresh
                if (!refreshToken) {
                    throw new Error(
                        'No refresh token or OAuth credentials available for Databricks OAuth authentication',
                    );
                }

                this.logger.debug(
                    `Refreshing databricks token for user ${userUuid}`,
                );

                const accessToken =
                    await UserService.generateDatabricksAccessToken(
                        refreshToken,
                    );
                return {
                    ...args,
                    authenticationType: DatabricksAuthenticationType.OAUTH_M2M,
                    token: accessToken,
                };
            } catch (e: unknown) {
                if (e instanceof LightdashError) {
                    throw e;
                }
                this.logger.error(
                    `Error refreshing databricks token: ${JSON.stringify(e)}`,
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
                // For U2M OAuth, refresh token should be stored in credentials
                const { refreshToken } = args;

                if (!refreshToken) {
                    throw new Error(
                        'No refresh token available for Databricks U2M OAuth authentication',
                    );
                }

                this.logger.debug(
                    `Refreshing databricks U2M OAuth token for user ${userUuid}`,
                );

                const { accessToken, refreshToken: newRefreshToken } =
                    await refreshDatabricksOAuthToken(
                        args.serverHostName,
                        args.oauthClientId || 'databricks-cli',
                        refreshToken,
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
                this.logger.error(
                    `Error refreshing databricks U2M OAuth token: ${JSON.stringify(
                        e,
                    )}`,
                );
                throw new UnexpectedServerError(
                    'Error refreshing databricks U2M OAuth token',
                );
            }
        }

        return args;
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
            const refreshToken = await this.userModel.getRefreshToken(
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
            const refreshToken = await this.userModel.getRefreshToken(
                userUuid,
                OpenIdIdentityIssuerType.SNOWFLAKE,
            );
            // Validate refresh token and generate new access token
            this.logger.debug(
                `Refreshing snowflake warehouse credentials from user uuid: ${userUuid}`,
            );
            const credentials = await this.refreshCredentials(
                { ...args.warehouseConnection, token: refreshToken },
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
            const refreshToken = await this.userModel.getRefreshToken(
                userUuid,
                OpenIdIdentityIssuerType.DATABRICKS,
            );
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

        return args;
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
    }: {
        projectUuid: string;
        userId: string;
        isRegisteredUser: boolean;
    }) {
        // First, check if project uses organization-level credentials
        const project = await this.projectModel.get(projectUuid);
        const { organizationWarehouseCredentialsUuid } = project;

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
            credentials = await this.refreshCredentials(
                credentials, // This credentials are already loaded from organization
                userId,
            );
        }

        // If requireUserCredentials is true, we need to override the existing credentials with the user credentials
        // even if we use organization credentials
        if (credentials.requireUserCredentials) {
            if (!isRegisteredUser) {
                throw new ForbiddenError(
                    'Embedded users cannot use personal warehouse credentials',
                );
            }

            const userWarehouseCredentials =
                await this.userWarehouseCredentialsModel.findForProjectWithSecrets(
                    projectUuid,
                    userId,
                    credentials.type,
                );
            if (userWarehouseCredentials === undefined) {
                throw new NotFoundError('User warehouse credentials not found');
            }

            if (
                credentials.type === userWarehouseCredentials.credentials.type
            ) {
                credentials = {
                    ...credentials,
                    ...userWarehouseCredentials.credentials,
                } as CreateWarehouseCredentials; // force type as typescript doesn't know the types match
            } else {
                throw new UnexpectedServerError(
                    'User warehouse credentials are not compatible',
                );
            }
            this.logger.debug(
                `Refreshing warehouse credentials for user ${userId} with requireUserCredentials`,
            );
            credentials = await this.refreshCredentials(credentials, userId);

            userWarehouseCredentialsUuid = userWarehouseCredentials.uuid;
        } else if (isRegisteredUser && !organizationWarehouseCredentialsUuid) {
            this.logger.debug(
                `Refreshing warehouse credentials for session user ${userId}`,
            );
            credentials = await this.refreshCredentials(credentials, userId);
        }

        return {
            ...credentials,
            userWarehouseCredentialsUuid,
        };
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
    }> {
        Sentry.setTag('warehouse.type', credentials.type);
        // Setup SSH tunnel for client (user needs to close this)
        const sshTunnel = new SshTunnel(credentials);
        const warehouseSshCredentials = await sshTunnel.connect();

        const { snowflakeVirtualWarehouse, databricksCompute } =
            overrides || {};

        const cacheKey = `${projectUuid}${snowflakeVirtualWarehouse || ''}${
            databricksCompute || ''
        }`;
        // Check cache for existing client (always false if ssh tunnel was connected)
        const existingClient = this.warehouseClients[cacheKey] as
            | typeof this.warehouseClients[string]
            | undefined;
        if (
            existingClient &&
            deepEqual(existingClient.credentials, warehouseSshCredentials)
        ) {
            // if existing client uses identical credentials, use it
            return { warehouseClient: existingClient, sshTunnel };
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
        return { warehouseClient: client, sshTunnel };
    }

    private async saveExploresToCacheAndIndexCatalog(
        userUuid: string,
        projectUuid: string,
        explores: (Explore | ExploreError)[],
        compilationSource: 'cli_deploy' | 'refresh_dbt' | 'create_project',
        jobUuid?: string | null,
        requestMethod?: string | null,
    ) {
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

        const { cachedExploreUuids } =
            await this.projectModel.saveExploresToCache(projectUuid, explores);
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        this.logger.info(
            `Saved ${cachedExploreUuids.length} explores to cache for project ${projectUuid}`,
        );

        const compilationReport = calculateCompilationReport({ explores });
        const project = await this.projectModel.get(projectUuid);

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

        return this.schedulerClient.indexCatalog({
            projectUuid,
            userUuid,
            organizationUuid,
            prevCatalogItemsWithTags,
            prevCatalogItemsWithIcons,
            prevMetricTreeEdges,
        });
    }

    async getProject(projectUuid: string, account: Account): Promise<Project> {
        const project = await this.projectModel.get(projectUuid);
        if (
            account.user.ability.cannot(
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

    async createWithoutCompile(
        user: SessionUser,
        data: CreateProjectOptionalCredentials,
        method: RequestMethod,
    ): Promise<ApiCreateProjectResults> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        await this.validateProjectCreationPermissions(user, data);

        const newProjectData = data;

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
            );

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
            ),
        });

        let hasContentCopy = false;
        let contentCopyError: string | undefined;

        if (data.type === ProjectType.PREVIEW && data.upstreamProjectUuid) {
            try {
                await this.copyUserAccessOnPreview(
                    data.upstreamProjectUuid,
                    projectUuid,
                );

                if (data.copyContent ?? true) {
                    await this.copyContentOnPreview(
                        data.upstreamProjectUuid,
                        projectUuid,
                        user,
                    );

                    hasContentCopy = true;
                }
            } catch (e) {
                Sentry.captureException(e);
                contentCopyError = e instanceof Error ? e.message : String(e);
                this.logger.error(
                    `Unable to copy content on preview from ${data.upstreamProjectUuid} to ${projectUuid}`,
                    {
                        error: contentCopyError,
                        stack: e instanceof Error ? e.stack : undefined,
                    },
                );
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
                );
            }
        }

        const project = await this.projectModel.get(projectUuid);

        return {
            hasContentCopy,
            project,
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

        await this.validateProjectCreationPermissions(user, data);

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
                { stepType: JobStepType.COMPILING },
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

    static getAnalyticProperties(
        createProject: Pick<
            CreateProjectOptionalCredentials,
            'warehouseConnection' | 'name' | 'dbtConnection' | 'type'
        >,
        projectUuid: string,
        user: SessionUser,
        method: RequestMethod,
    ): ProjectEvent['properties'] {
        const warehouseType = createProject.warehouseConnection?.type;
        const authenticationType =
            warehouseType === WarehouseTypes.BIGQUERY ||
            warehouseType === WarehouseTypes.SNOWFLAKE
                ? createProject.warehouseConnection?.authenticationType
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
                async () => this.testProjectAdapter(createProject, user),
            );

            const { explores, lightdashProjectConfig } =
                await this.jobModel.tryJobStep(
                    jobUuid,
                    JobStepType.COMPILING,
                    async () => {
                        try {
                            // There's no project yet, so we don't track
                            const trackingParams = undefined;

                            return {
                                explores: await adapter.compileAllExplores(
                                    trackingParams,
                                ),
                                lightdashProjectConfig:
                                    await adapter.getLightdashProjectConfig(
                                        trackingParams,
                                    ),
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
                    );
                    // Give admin user permissions to user who created this project even if he is an admin
                    if (user.email) {
                        await this.projectModel.createProjectAccess(
                            newProjectUuid,
                            user.email,
                            ProjectMemberRole.ADMIN,
                        );
                    }

                    await this.replaceYamlTags(
                        user,
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
                    await this.saveExploresToCacheAndIndexCatalog(
                        user.userUuid,
                        newProjectUuid,
                        explores,
                        'create_project',
                        jobUuid,
                        method,
                    );
                    return newProjectUuid;
                },
            );

            await this.jobModel.update(jobUuid, {
                jobStatus: JobStatusType.DONE,
                jobResults: {
                    projectUuid,
                },
            });
            this.analytics.track({
                event: 'project.created',
                userId: user.userUuid,
                properties: ProjectService.getAnalyticProperties(
                    createProject,
                    projectUuid,
                    user,
                    method,
                ),
            });

            return { projectUuid };
        } catch (error) {
            await this._markJobAsFailed(jobUuid);
            if (!(error instanceof LightdashError)) {
                Sentry.captureException(error);
            }
            this.logger.error(
                `Error running background job:${
                    error instanceof Error ? error.stack : error
                }`,
            );
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
    ): Promise<void> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'update',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        // TODO: Do not hardcode CLI information here
        await this.saveExploresToCacheAndIndexCatalog(
            user.userUuid,
            projectUuid,
            explores,
            'cli_deploy',
            null,
            'cli',
        );

        await this.schedulerClient.generateValidation({
            userUuid: user.userUuid,
            projectUuid,
            context: 'cli',
            organizationUuid,
        });
    }

    /* When editing a project, most fields are optional
    but if the user switches from one authentication type to another,
    we need to validate the secrets are present */
    validateConfigSecrets(project: UpdateProject) {
        switch (project.warehouseConnection?.type) {
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
            default:
                break;
        }
    }

    async updateAndScheduleAsyncWork(
        projectUuid: string,
        user: SessionUser,
        data: UpdateProject,
        method: RequestMethod,
    ): Promise<{ jobUuid: string }> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const savedProject = await this.projectModel.getWithSensitiveFields(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'update',
                subject('Project', {
                    organizationUuid: savedProject.organizationUuid,
                    projectUuid,
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
            userUuid: user.userUuid,
            steps: [
                { stepType: JobStepType.TESTING_ADAPTOR },
                ...(savedProject.dbtConnection.type === DbtProjectType.NONE
                    ? []
                    : [{ stepType: JobStepType.COMPILING }]),
            ],
        };
        const createProject = await this._resolveWarehouseClientCredentials(
            data,
            user.userUuid,
            savedProject.organizationUuid,
        );
        const updatedProject = ProjectModel.mergeMissingProjectConfigSecrets(
            createProject,
            savedProject,
        );

        this.validateConfigSecrets(updatedProject);

        await this.projectModel.update(projectUuid, updatedProject);
        await this.jobModel.create(job);

        if (updatedProject.dbtConnection.type !== DbtProjectType.NONE) {
            await this.schedulerClient.testAndCompileProject({
                organizationUuid: user.organizationUuid,
                createdByUserUuid: user.userUuid,
                projectUuid,
                requestMethod: method,
                jobUuid: job.jobUuid,
                isPreview: savedProject.type === ProjectType.PREVIEW,
                userUuid: user.userUuid,
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

    async testAndCompileProject(
        user: SessionUser,
        projectUuid: string,
        method: RequestMethod,
        jobUuid: string,
    ) {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        const updatedProject = await this.projectModel.getWithSensitiveFields(
            projectUuid,
        );

        if (user.ability.cannot('update', subject('Project', updatedProject))) {
            throw new ForbiddenError();
        }

        if (updatedProject.warehouseConnection === undefined) {
            throw new Error(
                `Missing warehouseConnection details on project ${projectUuid}'}`,
            );
        }

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

        try {
            await this.jobModel.update(job.jobUuid, {
                jobStatus: JobStatusType.RUNNING,
            });
            const { adapter, sshTunnel } = await this.jobModel.tryJobStep(
                job.jobUuid,
                JobStepType.TESTING_ADAPTOR,
                async () =>
                    this.testProjectAdapter(
                        updatedProject as UpdateProject,
                        user,
                    ),
            );
            if (updatedProject.dbtConnection.type !== DbtProjectType.NONE) {
                await this.jobModel.tryJobStep(
                    job.jobUuid,
                    JobStepType.COMPILING,
                    async () => {
                        try {
                            const trackingParams = {
                                projectUuid,
                                organizationUuid: user.organizationUuid,
                                userUuid: user.userUuid,
                            };
                            const explores = await adapter.compileAllExplores(
                                trackingParams,
                            );
                            const lightdashProjectConfig =
                                await adapter.getLightdashProjectConfig(
                                    trackingParams,
                                );

                            await this.replaceYamlTags(
                                user,
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
                            await this.replaceProjectParameters({
                                user,
                                projectUuid,
                                parameters: lightdashProjectConfig.parameters,
                            });
                            await this.saveExploresToCacheAndIndexCatalog(
                                user.userUuid,
                                projectUuid,
                                explores,
                                'refresh_dbt',
                                job.jobUuid,
                                method,
                            );
                        } finally {
                            await adapter.destroy();
                            await sshTunnel.disconnect();
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
            this.analytics.track({
                event: 'project.updated',
                userId: user.userUuid,
                properties: ProjectService.getAnalyticProperties(
                    projectWithWarehouse,
                    projectUuid,
                    user,
                    method,
                ),
            });
        } catch (error) {
            await this.jobModel.setPendingJobsToSkipped(job.jobUuid);
            await this.jobModel.update(job.jobUuid, {
                jobStatus: JobStatusType.ERROR,
            });
            throw error;
        }
    }

    private async testProjectAdapter(
        data: UpdateProject,
        _user: Pick<SessionUser, 'userUuid' | 'organizationUuid'>,
    ): Promise<{
        adapter: ProjectAdapter;
        sshTunnel: SshTunnel<CreateWarehouseCredentials>;
    }> {
        const sshTunnel = new SshTunnel(data.warehouseConnection);
        await sshTunnel.connect();
        const adapter = await projectAdapterFromConfig(
            data.dbtConnection,
            sshTunnel.overrideCredentials,
            {
                warehouseCatalog: undefined,
                onWarehouseCatalogChange: () => {},
            },
            data.dbtVersion || DefaultSupportedDbtVersion,
            undefined,
            this.analytics,
        );
        try {
            await adapter.test();
        } catch (e) {
            Logger.error(`Error testing project adapter: ${e}`);
            await adapter.destroy();
            await sshTunnel.disconnect();
            throw e;
        }
        return { adapter, sshTunnel };
    }

    async delete(projectUuid: string, user: SessionUser): Promise<void> {
        const project = await this.projectModel.getWithSensitiveFields(
            projectUuid,
        );

        if (
            user.ability.cannot(
                'delete',
                subject('Project', {
                    type: project.type,
                    projectUuid: project.projectUuid,
                    organizationUuid: project.organizationUuid,
                    createdByUserUuid: project.createdByUserUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.projectModel.delete(projectUuid);

        this.analytics.track({
            event: 'project.deleted',
            userId: user.userUuid,
            properties: {
                projectId: projectUuid,
                isPreview: project.type === ProjectType.PREVIEW,
            },
        });
    }

    private async buildAdapter(
        projectUuid: string,
        user: Pick<SessionUser, 'userUuid' | 'organizationUuid'>,
    ): Promise<{
        sshTunnel: SshTunnel<CreateWarehouseCredentials>;
        adapter: ProjectAdapter;
    }> {
        const project = await this.projectModel.getWithSensitiveFields(
            projectUuid,
        );
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
            const accessToken = await UserService.generateSnowflakeAccessToken(
                project.warehouseConnection.refreshToken,
            );
            project.warehouseConnection.token = accessToken;
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
                const accessToken =
                    await UserService.generateDatabricksAccessToken(
                        project.warehouseConnection.refreshToken,
                    );
                project.warehouseConnection.token = accessToken;
            }
        }

        if (
            project.warehouseConnection.type === WarehouseTypes.DATABRICKS &&
            project.warehouseConnection.authenticationType ===
                DatabricksAuthenticationType.OAUTH_U2M
        ) {
            // For U2M OAuth, check if token needs refresh
            if (project.warehouseConnection.refreshToken) {
                this.logger.debug(
                    `Refreshing databricks U2M OAuth token from refresh token on buildAdapter`,
                );
                const { accessToken, refreshToken } =
                    await refreshDatabricksOAuthToken(
                        project.warehouseConnection.serverHostName,
                        project.warehouseConnection.oauthClientId ||
                            'databricks-cli',
                        project.warehouseConnection.refreshToken,
                    );
                project.warehouseConnection.token = accessToken;
                // Update refresh token in case it was rotated
                project.warehouseConnection.refreshToken = refreshToken;
                // Note: Updated tokens will be persisted when project credentials are next saved
            }
        }

        const sshTunnel = new SshTunnel(project.warehouseConnection);
        await sshTunnel.connect();

        const adapter = await projectAdapterFromConfig(
            project.dbtConnection,
            sshTunnel.overrideCredentials,
            {
                warehouseCatalog: cachedWarehouseCatalog,
                onWarehouseCatalogChange: async (warehouseCatalog) => {
                    await this.projectModel.saveWarehouseToCache(
                        projectUuid,
                        warehouseCatalog,
                    );
                },
            },
            project.dbtVersion || DefaultSupportedDbtVersion,
            undefined,
            this.analytics,
        );
        return { adapter, sshTunnel };
    }

    static updateExploreWithDateZoom(
        explore: Explore,
        metricQuery: MetricQuery,
        warehouseSqlBuilder: WarehouseSqlBuilder,
        availableParameters: string[],
        dateZoom?: DateZoom,
    ): Explore {
        if (dateZoom?.granularity) {
            const timeDimensionsMap: Record<string, CompiledDimension> =
                Object.values(explore.tables).reduce<
                    Record<string, CompiledDimension>
                >((acc, t) => {
                    Object.values(t.dimensions).forEach((dim) => {
                        if (
                            dim.type === DimensionType.TIMESTAMP ||
                            dim.type === DimensionType.DATE
                        ) {
                            acc[getItemId(dim)] = dim;
                        }
                    });
                    return acc;
                }, {});

            let timeOrDateDimension = dateZoom?.xAxisFieldId;

            if (!timeOrDateDimension) {
                const firstTimeDimensionIdInMetricQuery =
                    metricQuery.dimensions.find(
                        (dimension) => !!timeDimensionsMap[dimension],
                    );

                timeOrDateDimension = firstTimeDimensionIdInMetricQuery;
            }

            if (timeOrDateDimension) {
                const dimToOverride = timeDimensionsMap[timeOrDateDimension];
                const { baseDimensionId } =
                    getDateDimension(timeOrDateDimension);
                const baseTimeDimension =
                    dimToOverride.timeInterval && baseDimensionId
                        ? timeDimensionsMap[baseDimensionId]
                        : dimToOverride;

                const dimWithGranularityOverride =
                    createDimensionWithGranularity(
                        dimToOverride.name,
                        baseTimeDimension,
                        explore,
                        warehouseSqlBuilder,
                        dateZoom?.granularity,
                        availableParameters,
                    );

                return replaceDimensionInExplore(
                    explore,
                    dimWithGranularityOverride,
                );
            }
        }
        return explore;
    }

    static async _compileQuery({
        metricQuery,
        explore,
        warehouseSqlBuilder,
        intrinsicUserAttributes,
        userAttributes,
        timezone,
        dateZoom,
        parameters,
        availableParameterDefinitions,
        pivotConfiguration,
    }: {
        metricQuery: MetricQuery;
        explore: Explore;
        warehouseSqlBuilder: WarehouseSqlBuilder;
        intrinsicUserAttributes: IntrinsicUserAttributes;
        userAttributes: UserAttributeValueMap;
        timezone: string;
        dateZoom?: DateZoom;
        parameters?: ParametersValuesMap;
        availableParameterDefinitions: ParameterDefinitions;
        pivotConfiguration?: PivotConfiguration;
    }): Promise<CompiledQuery> {
        const availableParameters = Object.keys(availableParameterDefinitions);

        const exploreWithOverride = ProjectService.updateExploreWithDateZoom(
            explore,
            metricQuery,
            warehouseSqlBuilder,
            availableParameters,
            dateZoom,
        );

        const compiledMetricQuery = compileMetricQuery({
            explore: exploreWithOverride,
            metricQuery,
            warehouseSqlBuilder,
            availableParameters,
        });

        const queryBuilder = new MetricQueryBuilder({
            explore: exploreWithOverride,
            compiledMetricQuery,
            warehouseSqlBuilder,
            intrinsicUserAttributes,
            userAttributes,
            timezone,
            parameters,
            parameterDefinitions: availableParameterDefinitions,
            pivotConfiguration,
        });

        return wrapSentryTransactionSync('QueryBuilder.buildQuery', {}, () =>
            queryBuilder.compileQuery(),
        );
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
    ): Promise<ParameterDefinitions> {
        const projectParameters = await this.projectParametersModel.find(
            projectUuid,
        );

        return getAvailableParameterDefinitions(projectParameters, explore);
    }

    async compileQuery(
        args: {
            account: Account;
            // ! TODO: we need to fix this type
            body: MetricQuery & { parameters?: ParametersValuesMap };
            projectUuid: string;
        } & ({ exploreName: string } | { explore: Explore }),
    ) {
        const {
            account,
            body: { parameters, ...metricQuery },
            projectUuid,
        } = args;

        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            account.user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        if (
            metricQuery.customDimensions?.some(isCustomSqlDimension) &&
            account.user.ability.cannot(
                'manage',
                subject('CustomSql', { organizationUuid, projectUuid }),
            )
        ) {
            throw new CustomSqlQueryForbiddenError();
        }

        const explore =
            'explore' in args
                ? args.explore
                : await this.getExplore(account, projectUuid, args.exploreName);

        const { warehouseClient, sshTunnel } = await this._getWarehouseClient(
            projectUuid,
            await this.getWarehouseCredentials({
                projectUuid,
                userId: account.user.id,
                isRegisteredUser: account.isRegisteredUser(),
            }),
            {
                snowflakeVirtualWarehouse: explore.warehouse,
                databricksCompute: explore.databricksCompute,
            },
        );

        const { userAttributes, intrinsicUserAttributes } =
            await this.getUserAttributes({ account });

        const availableParameterDefinitions = await this.getAvailableParameters(
            projectUuid,
            explore,
        );

        const compiledQuery = await ProjectService._compileQuery({
            metricQuery,
            explore,
            warehouseSqlBuilder: warehouseClient,
            intrinsicUserAttributes,
            userAttributes,
            timezone: this.lightdashConfig.query.timezone || 'UTC',
            parameters,
            availableParameterDefinitions,
        });

        await sshTunnel.disconnect();

        return {
            ...compiledQuery,
            // Convert to array so TSOA can serialize it when using in controllers
            parameterReferences: Array.from(compiledQuery.parameterReferences),
        };
    }

    private metricQueryWithLimit(
        metricQuery: MetricQuery,
        csvLimit: number | null | undefined,
    ): MetricQuery {
        if (csvLimit === undefined) {
            if (metricQuery.limit > this.lightdashConfig.query?.maxLimit) {
                throw new ParameterError(
                    `Query limit can not exceed ${this.lightdashConfig.query.maxLimit}`,
                );
            }
            return metricQuery;
        }

        const numberColumns =
            metricQuery.dimensions.length +
            metricQuery.metrics.length +
            metricQuery.tableCalculations.length;
        if (numberColumns === 0)
            throw new ParameterError(
                'Query must have at least one dimension or metric',
            );

        const cellsLimit = this.lightdashConfig.query?.csvCellsLimit || 100000;
        const maxRows = Math.floor(cellsLimit / numberColumns);
        const csvRowLimit =
            csvLimit === null ? maxRows : Math.min(csvLimit, maxRows);

        return {
            ...metricQuery,
            limit: csvRowLimit,
        };
    }

    async runUnderlyingDataQuery(
        account: Account,
        metricQuery: MetricQuery,
        projectUuid: string,
        exploreName: string,
        csvLimit: number | null | undefined,
        context: QueryExecutionContext = QueryExecutionContext.VIEW_UNDERLYING_DATA,
    ): Promise<ApiQueryResults> {
        assertIsAccountWithOrg(account);
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            account.user.ability.cannot(
                'view',
                subject('UnderlyingData', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (
            metricQuery.customDimensions?.some(isCustomSqlDimension) &&
            account.user.ability.cannot(
                'manage',
                subject('CustomSql', { organizationUuid, projectUuid }),
            )
        ) {
            throw new CustomSqlQueryForbiddenError();
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

        const [space, explore] = await Promise.all([
            this.spaceModel.getSpaceSummary(savedChart.spaceUuid),
            this.getExplore(
                account,
                projectUuid,
                savedChart.tableName,
                organizationUuid,
            ),
        ]);

        const access = await this.spaceModel.getUserSpaceAccess(
            account.user.id,
            space.uuid,
        );

        if (
            account.user.ability.cannot(
                'view',
                subject('SavedChart', {
                    organizationUuid,
                    projectUuid,
                    isPrivate: space.isPrivate,
                    access,
                }),
            ) ||
            account.user.ability.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
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

        const [space, explore] = await Promise.all([
            this.spaceModel.getSpaceSummary(savedChart.spaceUuid),
            this.getExplore(
                account,
                projectUuid,
                savedChart.tableName,
                organizationUuid,
            ),
        ]);

        const access = await this.spaceModel.getUserSpaceAccess(
            account.user.id,
            space.uuid,
        );

        if (
            account.user.ability.cannot(
                'view',
                subject('SavedChart', {
                    organizationUuid,
                    projectUuid,
                    isPrivate: space.isPrivate,
                    access,
                }),
            ) ||
            account.user.ability.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.analyticsModel.addChartViewEvent(
            savedChart.uuid,
            account.user.id,
        );

        const tables = Object.keys(explore.tables);
        const appliedDashboardFilters = {
            dimensions: getDashboardFilterRulesForTables(
                tables,
                dashboardFilters.dimensions,
            ),
            metrics: getDashboardFilterRulesForTables(
                tables,
                dashboardFilters.metrics,
            ),
            tableCalculations: getDashboardFilterRulesForTables(
                tables,
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
            chart: { ...savedChart, isPrivate: space.isPrivate, access },
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

        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            account.user.ability.cannot(
                'manage',
                subject('Explore', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (
            metricQuery.customDimensions?.some(isCustomSqlDimension) &&
            account.user.ability.cannot(
                'manage',
                subject('CustomSql', { organizationUuid, projectUuid }),
            )
        ) {
            throw new CustomSqlQueryForbiddenError();
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

                const { rows, cacheMetadata, fields } =
                    await this.runMetricQuery({
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
                const { warehouseConnection } =
                    await this.projectModel.getWithSensitiveFields(projectUuid);
                if (warehouseConnection) {
                    span.setAttribute('warehouse', warehouseConnection?.type);
                }

                // If there are more than 500 rows, we need to format them in a background job
                const formattedRows = await wrapSentryTransaction<ResultRow[]>(
                    'ProjectService.runQueryAndFormatRows.formatRows',
                    {
                        rows: rows.length,
                        warehouse: warehouseConnection?.type,
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
                                                  },
                                              },
                                          ),
                                      )
                                    : formatRows(rows, fields);
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

    async runMetricExplorerQuery(
        account: Account,
        projectUuid: string,
        exploreName: string,
        metricQuery: MetricQuery,
    ) {
        const { result } = await measureTime(
            () =>
                this.runMetricQuery({
                    account,
                    metricQuery,
                    projectUuid,
                    exploreName,
                    csvLimit: undefined,
                    context: QueryExecutionContext.METRICS_EXPLORER,
                    queryTags: {},
                    chartUuid: undefined,
                }),
            'runMetricQuery',
            this.logger,
            {
                exploreName,
                metricQuery,
            },
        );

        return result;
    }

    async getResultsForChart(
        account: Account,
        chartUuid: string,
        context: QueryExecutionContext,
        dashboardParameters?: ParametersValuesMap,
    ): Promise<{
        rows: Record<string, AnyType>[];
        cacheMetadata: CacheMetadata;
    }> {
        return wrapSentryTransaction(
            'getResultsForChartWithWarehouseQuery',
            {
                userUuid: account.user.id,
                chartUuid,
            },
            async () => {
                const chart = await this.savedChartModel.get(chartUuid);
                const { metricQuery, parameters: savedChartParameters } = chart;
                const exploreId = chart.tableName;
                const queryTags: RunQueryTags = {
                    ...this.getUserQueryTags(account),
                    project_uuid: chart.projectUuid,
                    chart_uuid: chartUuid,
                    explore_name: exploreId,
                    query_context: context,
                };

                // Parameter overrides are the dashboard parameters
                const explore = await this.getExplore(
                    account,
                    chart.projectUuid,
                    exploreId,
                );

                const parameters = await this.combineParameters(
                    chart.projectUuid,
                    explore,
                    undefined,
                    dashboardParameters ?? savedChartParameters, // Dashboard parameters go in place of saved chart parameters
                );

                return this.runMetricQuery({
                    account,
                    metricQuery,
                    projectUuid: chart.projectUuid,
                    exploreName: exploreId,
                    csvLimit: undefined,
                    context,
                    chartUuid,
                    queryTags,
                    parameters,
                    explore, // Passing in explore to avoid fetching it again
                });
            },
        );
    }

    async getResultsFromCacheOrWarehouse({
        projectUuid,
        context,
        warehouseClient,
        query,
        metricQuery,
        queryTags,
        invalidateCache,
    }: {
        projectUuid: string;
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
                // TODO: put this hash function in a util somewhere
                const queryHashKey = metricQuery.timezone
                    ? `${projectUuid}.${query}.${metricQuery.timezone}`
                    : `${projectUuid}.${query}`;
                const queryHash = crypto
                    .createHash('sha256')
                    .update(queryHashKey)
                    .digest('hex');

                span.setAttribute('queryHash', queryHash);
                span.setAttribute('cacheHit', false);

                if (
                    this.lightdashConfig.results.cacheEnabled &&
                    !invalidateCache
                ) {
                    const cacheEntryMetadata = await this.s3CacheClient
                        .getResultsMetadata(queryHash)
                        .catch((e) => undefined); // ignore since error is tracked in s3Client

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

                if (this.lightdashConfig.results.cacheEnabled) {
                    this.logger.debug(
                        `Writing data to cache with key ${queryHash}`,
                    );
                    const buffer = Buffer.from(
                        JSON.stringify(warehouseResults),
                    );
                    // fire and forget
                    this.s3CacheClient
                        .uploadResults(queryHash, buffer, queryTags)
                        .catch((e) => undefined); // ignore since error is tracked in s3Client
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
    }> {
        return wrapSentryTransaction(
            'ProjectService.runMetricQuery',
            {},
            async (span) => {
                try {
                    assertIsAccountWithOrg(account);

                    const { organizationUuid } =
                        await this.projectModel.getSummary(projectUuid);

                    if (
                        account.isJwtUser() ||
                        account.user.ability.cannot(
                            'view',
                            subject('Project', {
                                organizationUuid,
                                projectUuid,
                            }),
                        )
                    ) {
                        throw new ForbiddenError();
                    }

                    const metricQueryWithLimit = this.metricQueryWithLimit(
                        metricQuery,
                        csvLimit,
                    );

                    const explore =
                        loadedExplore ??
                        (await this.getExplore(
                            account,
                            projectUuid,
                            exploreName,
                        ));

                    const { warehouseClient, sshTunnel } =
                        await this._getWarehouseClient(
                            projectUuid,
                            await this.getWarehouseCredentials({
                                projectUuid,
                                userId: account.user.id,
                                isRegisteredUser: account.isRegisteredUser(),
                            }),
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

                    const fullQuery = await ProjectService._compileQuery({
                        metricQuery: metricQueryWithLimit,
                        explore,
                        warehouseSqlBuilder: warehouseClient,
                        intrinsicUserAttributes,
                        userAttributes: mergedUserAttributes,
                        timezone: this.lightdashConfig.query.timezone || 'UTC',
                        dateZoom,
                        parameters,
                        availableParameterDefinitions,
                    });

                    const { query } = fullQuery;

                    const fieldsWithOverrides: ItemsMap = Object.fromEntries(
                        Object.entries(fullQuery.fields).map(([key, value]) => {
                            if (
                                metricQuery.metricOverrides &&
                                metricQuery.metricOverrides[key]
                            ) {
                                return [
                                    key,
                                    {
                                        ...value,
                                        ...metricQuery.metricOverrides[key],
                                    },
                                ];
                            }
                            return [key, value];
                        }),
                    );

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
                    }

                    this.analytics.trackAccount(account, {
                        event: 'query.executed',
                        properties: {
                            organizationId: organizationUuid,
                            projectId: projectUuid,
                            context,
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

                    const { rows, cacheMetadata } =
                        await this.getResultsFromCacheOrWarehouse({
                            projectUuid,
                            context,
                            warehouseClient,
                            metricQuery: metricQueryWithLimit,
                            query,
                            queryTags,
                            invalidateCache,
                        });
                    await sshTunnel.disconnect();
                    return { rows, cacheMetadata, fields: fieldsWithOverrides };
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
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            user.ability.cannot(
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

        // enforce limit for current SQL queries as it may crash server. We are working on a new SQL runner that supports streaming
        const cteWithLimit = applyLimitToSqlQuery({
            sqlQuery: sql,
            limit: this.lightdashConfig.query.maxLimit,
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
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

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
            this.s3Client,
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
            this.s3Client,
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
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

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
            this.s3Client,
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
            this.s3Client,
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

    async getFileStream(
        user: SessionUser,
        projectUuid: string,
        fileId: string,
    ): Promise<Readable> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const downloadFile = await this.downloadFileModel.getDownloadFile(
            fileId,
        );
        switch (downloadFile.type) {
            case DownloadFileType.JSONL:
                return fs.createReadStream(downloadFile.path);
            case DownloadFileType.S3_JSONL:
                return this.s3Client.getS3FileStream(downloadFile.path);
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
    }: {
        projectUuid: string;
        table: string;
        initialFieldId: string;
        search: string;
        limit: number;
        filters: AndFilterGroup | undefined;
    }) {
        if (limit > this.lightdashConfig.query.maxLimit) {
            throw new ParameterError(
                `Query limit can not exceed ${this.lightdashConfig.query.maxLimit}`,
            );
        }

        let explore = await this.projectModel.findExploreByTableName(
            projectUuid,
            table,
        );
        let fieldId = initialFieldId;
        if (!explore) {
            // fallback: find explore by join alias and replace fieldId
            explore = await this.projectModel.findJoinAliasExplore(
                projectUuid,
                table,
            );
            if (explore && !isExploreError(explore)) {
                fieldId = initialFieldId.replace(table, explore.baseTable);
            }
        }

        if (!explore) {
            throw new NotExistsError(`Explore ${table} does not exist`);
        } else if (isExploreError(explore)) {
            throw new NotExistsError(`Explore ${table} has errors`);
        }

        const field = findFieldByIdInExplore(explore, fieldId);

        if (!field) {
            throw new NotExistsError(`Can't dimension with id: ${fieldId}`);
        }

        if (!isDimension(field)) {
            throw new ParameterError(
                `Searching by field is only available for dimensions, but ${fieldId} is a ${field.type}`,
            );
        }
        const autocompleteDimensionFilters: FilterGroupItem[] = [
            {
                id: uuidv4(),
                target: {
                    fieldId,
                },
                operator: FilterOperator.INCLUDE,
                values: [search],
            },
            {
                id: uuidv4(),
                target: {
                    fieldId,
                },
                operator: FilterOperator.NOT_NULL,
                values: [],
            },
        ];
        if (filters) {
            const filtersCompatibleWithExplore = filters.and.filter(
                (filter) =>
                    isFilterRule(filter) &&
                    findFieldByIdInExplore(
                        explore as Explore,
                        filter.target.fieldId,
                    ),
            );
            autocompleteDimensionFilters.push(...filtersCompatibleWithExplore);
        }
        const metricQuery: MetricQuery = {
            exploreName: explore.name,
            dimensions: [getItemId(field)],
            metrics: [],
            filters: {
                dimensions: {
                    id: uuidv4(),
                    and: autocompleteDimensionFilters,
                },
            },
            tableCalculations: [],
            sorts: [
                {
                    fieldId: getItemId(field),
                    descending: false,
                },
            ],
            limit,
        };
        return { metricQuery, explore, field };
    }

    async searchFieldUniqueValues(
        user: SessionUser,
        projectUuid: string,
        table: string,
        initialFieldId: string,
        search: string,
        limit: number,
        filters: AndFilterGroup | undefined,
        forceRefresh: boolean = false,
        parameters?: ParametersValuesMap,
        userAttributeOverrides?: UserAttributeValueMap, // EXPERIMENTAL: used to override user attributes for MCP
    ) {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const { metricQuery, explore, field } =
            await this._getFieldValuesMetricQuery({
                projectUuid,
                table,
                initialFieldId,
                search,
                limit,
                filters,
            });

        const { warehouseClient, sshTunnel } = await this._getWarehouseClient(
            projectUuid,
            await this.getWarehouseCredentials({
                projectUuid,
                userId: user.userUuid,
                isRegisteredUser: true,
            }),
            {
                snowflakeVirtualWarehouse: explore.warehouse,
                databricksCompute: explore.databricksCompute,
            },
        );
        const { userAttributes, intrinsicUserAttributes } =
            await this.getUserAttributes({ user });

        const mergedUserAttributes = userAttributeOverrides
            ? {
                  ...userAttributes,
                  ...userAttributeOverrides,
              }
            : userAttributes;

        const availableParameterDefinitions = await this.getAvailableParameters(
            projectUuid,
            explore,
        );

        const { query } = await ProjectService._compileQuery({
            metricQuery,
            explore,
            warehouseSqlBuilder: warehouseClient,
            intrinsicUserAttributes,
            userAttributes: mergedUserAttributes,
            timezone: this.lightdashConfig.query.timezone || 'UTC',
            parameters,
            availableParameterDefinitions,
        });

        // Add a cache_autocomplete prefix to the query hash to avoid collisions with the results cache
        const queryHashKey = metricQuery.timezone
            ? `${projectUuid}.cache_autocomplete.${query}.${metricQuery.timezone}`
            : `${projectUuid}.cache_autocomplete.${query}`;
        const queryHash = crypto
            .createHash('sha256')
            .update(queryHashKey)
            .digest('hex');

        const isCacheEnabled = this.lightdashConfig.results.autocompleteEnabled;

        if (!forceRefresh && isCacheEnabled) {
            const isCached = await this.s3CacheClient.getResultsMetadata(
                queryHash,
            );

            if (isCached !== undefined) {
                const cacheEntry = await this.s3CacheClient.getResults(
                    queryHash,
                );
                const stringResults =
                    await cacheEntry.Body?.transformToString();
                if (stringResults) {
                    try {
                        return JSON.parse(stringResults);
                    } catch (e) {
                        this.logger.error(
                            'Error parsing autocomplete cache results:',
                            e,
                        );
                    }
                }
            }
        }

        const queryTags: RunQueryTags = {
            organization_uuid: organizationUuid,
            user_uuid: user.userUuid,
            project_uuid: projectUuid,
            explore_name: explore.name,
            query_context: QueryExecutionContext.FILTER_AUTOCOMPLETE,
        };
        const { rows } = await warehouseClient.runQuery(query, queryTags);
        await sshTunnel.disconnect();

        this.analytics.track({
            event: 'field_value.search',
            userId: user.userUuid,
            properties: {
                projectId: projectUuid,
                fieldId: getItemId(field),
                searchCharCount: search.length,
                resultsCount: rows.length,
                searchLimit: limit,
            },
        });

        const searchResults = {
            search,
            results: rows.map((row) => row[getItemId(field)]),
            refreshedAt: new Date(),
        };
        if (isCacheEnabled) {
            const buffer = Buffer.from(
                JSON.stringify({
                    ...searchResults,
                    cached: true,
                }),
            );
            // fire and forget
            this.s3CacheClient
                .uploadResults(queryHash, buffer, queryTags)
                .catch((e) => undefined); // ignore since error is tracked in s3Client
        }

        return {
            ...searchResults,
            cached: false,
        };
    }

    private async refreshTablesAndProjectConfig(
        user: Pick<SessionUser, 'userUuid'>,
        projectUuid: string,
        requestMethod: RequestMethod,
    ): Promise<{
        explores: (Explore | ExploreError)[];
        lightdashProjectConfig: LightdashProjectConfig;
    }> {
        // Checks that project exists
        const project = await this.projectModel.get(projectUuid);

        // Force refresh adapter (refetch git repos, check for changed credentials, etc.)
        // Might want to cache parts of this in future if slow
        const { adapter, sshTunnel } = await this.buildAdapter(
            projectUuid,
            user,
        );
        const packages = await adapter.getDbtPackages();
        try {
            const trackingParams = {
                projectUuid,
                organizationUuid: project.organizationUuid,
                userUuid: user.userUuid,
            };
            const explores = await adapter.compileAllExplores(trackingParams);
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
                },
            });

            const lightdashProjectConfig =
                await adapter.getLightdashProjectConfig(trackingParams);

            return { explores, lightdashProjectConfig };
        } catch (e) {
            if (!(e instanceof LightdashError)) {
                Sentry.captureException(e);
            }
            this.logger.error(
                `Failed to compile all explores:${
                    e instanceof Error ? e.stack : e
                }`,
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
        }
    }

    async getJobStatus(jobUuid: string, user: SessionUser): Promise<Job> {
        const job = await this.jobModel.get(jobUuid);

        if (job.projectUuid) {
            const { organizationUuid } = await this.projectModel.getSummary(
                job.projectUuid,
            );
            if (
                user.ability.cannot(
                    'view',
                    subject('Project', {
                        organizationUuid,
                        projectUuid: job.projectUuid,
                    }),
                )
            ) {
                throw new NotFoundError(`Cannot find job`);
            }
        } else if (user.ability.cannot('view', subject('Job', job))) {
            throw new NotFoundError(`Cannot find job`);
        }

        return job;
    }

    async scheduleCompileProject(
        user: SessionUser,
        projectUuid: string,
        requestMethod: RequestMethod,
        skipPermissionCheck: boolean = false,
    ): Promise<{ jobUuid: string }> {
        const { organizationUuid, type } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            !skipPermissionCheck &&
            (user.ability.cannot(
                'create',
                subject('Job', { organizationUuid, projectUuid }),
            ) ||
                user.ability.cannot(
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
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'create',
                subject('Job', { organizationUuid, projectUuid }),
            ) ||
            user.ability.cannot(
                'manage',
                subject('CompileProject', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
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
            throw new AlreadyProcessingError('Project is already compiling');
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
                        const { explores, lightdashProjectConfig } =
                            await this.refreshTablesAndProjectConfig(
                                user,
                                projectUuid,
                                requestMethod,
                            );

                        await this.replaceYamlTags(
                            user,
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
                        await this.replaceProjectParameters({
                            user,
                            projectUuid,
                            parameters: lightdashProjectConfig.parameters,
                        });
                        return this.saveExploresToCacheAndIndexCatalog(
                            user.userUuid,
                            projectUuid,
                            explores,
                            'refresh_dbt',
                            job.jobUuid,
                            requestMethod,
                        );
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
    }

    private async getExploreSummaries(
        account: Account,
        projectUuid: string,
        includeErrors: boolean = true,
    ) {
        // Use optimized query that only fetches summary fields instead of full explore JSON
        const exploreSummaries = await this.projectModel.getAllExploreSummaries(
            projectUuid,
        );

        if (!exploreSummaries || exploreSummaries.length === 0) {
            return [];
        }
        const { userAttributes } = await this.getUserAttributes({ account });

        return exploreSummaries.reduce<SummaryExplore[]>((acc, summary) => {
            const { baseTableRequiredAttributes, ...rest } = summary;
            const summaryExplore: SummaryExplore = rest; // Just type assertion to remove the baseTableRequiredAttributes

            if (!includeErrors && 'errors' in summaryExplore) {
                return acc;
            }

            // Check user attribute access
            if (
                !doesExploreMatchRequiredAttributes(
                    baseTableRequiredAttributes,
                    userAttributes,
                )
            ) {
                return acc;
            }

            // Add valid explore summary (databaseName and schemaName are required for non-error explores)
            return [...acc, summaryExplore];
        }, []);
    }

    async getAllExploresSummary(
        account: Account,
        projectUuid: string,
        filtered: boolean,
        includeErrors: boolean = true,
    ): Promise<SummaryExplore[]> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            ProjectService.isChartEmbed(account) ||
            account.user.ability.cannot(
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

        if (filtered) {
            const {
                tableSelection: { type, value },
            } = await this.getTablesConfiguration(account, projectUuid);
            if (type === TableSelectionType.WITH_TAGS) {
                return allExploreSummaries.filter(
                    (explore) =>
                        hasIntersection(explore.tags || [], value || []) ||
                        explore.type === ExploreType.VIRTUAL, // Custom explores/Virtual views are included by default
                );
            }
            if (type === TableSelectionType.WITH_NAMES) {
                return allExploreSummaries.filter(
                    (explore) =>
                        (value || []).includes(explore.name) ||
                        explore.type === ExploreType.VIRTUAL, // Custom explores/Virtual views are included by default
                );
            }
        }

        return allExploreSummaries;
    }

    async getExplore(
        account: Account,
        projectUuid: string,
        exploreName: string,
        organizationUuid?: string,
        includeUnfilteredTables: boolean = true,
    ): Promise<Explore> {
        return Sentry.startSpan(
            {
                op: 'ProjectService.getExplore',
                name: 'ProjectService.getExplore',
            },
            async () => {
                const exploresMap = await this.findExplores({
                    account,
                    projectUuid,
                    exploreNames: [exploreName],
                    organizationUuid,
                });
                const explore = exploresMap[exploreName];

                if (!explore) {
                    throw new NotExistsError(
                        `Explore "${exploreName}" does not exist.`,
                    );
                }
                if (isExploreError(explore)) {
                    throw new NotExistsError(
                        `Explore "${exploreName}" has an error.`,
                    );
                }
                if (includeUnfilteredTables) {
                    return explore;
                }
                return { ...explore, unfilteredTables: undefined };
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
        return Sentry.startSpan(
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

                const isForbidden =
                    account.user.ability.cannot(
                        'view',
                        subject('Project', {
                            organizationUuid: project.organizationUuid,
                            projectUuid,
                        }),
                    ) &&
                    account.user.ability.cannot(
                        'view',
                        subject('Explore', {
                            organizationUuid: project.organizationUuid,
                            projectUuid,
                            exploreNames,
                        }),
                    );

                if (isForbidden) {
                    throw new ForbiddenError();
                }
                const explores = await this.projectModel.findExploresFromCache(
                    projectUuid,
                    'name',
                    exploreNames,
                );

                const { userAttributes } = await this.getUserAttributes({
                    account,
                });

                return Object.values(explores).reduce<
                    Record<string, Explore | ExploreError>
                >((acc, explore) => {
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
                                userAttributes,
                            );
                        }
                    }
                    return acc;
                }, {});
            },
        );
    }

    async getCatalog(
        user: SessionUser,
        projectUuid: string,
    ): Promise<ProjectCatalog> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
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
            default:
                return assertUnreachable(credentials, 'Unknown warehouse type');
        }
    }

    async populateWarehouseTablesCache(
        user: SessionUser,
        projectUuid: string,
    ): Promise<WarehouseTablesCatalog> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'manage',
                subject('CustomSql', { organizationUuid, projectUuid }),
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
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'manage',
                subject('CustomSql', { organizationUuid, projectUuid }),
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
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'manage',
                subject('CustomSql', { organizationUuid, projectUuid }),
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
            throw new NotFoundError(
                `Could not find table "${tableName}" in schema "${schemaName}" of database "${database}". Please verify the table exists and you have access to it.`,
            );
        }
    }

    async getTablesConfiguration(
        account: Account,
        projectUuid: string,
    ): Promise<TablesConfiguration> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            ProjectService.isChartEmbed(account) ||
            account.user.ability.cannot(
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
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
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

    async getAvailableFiltersForSavedQuery(
        account: Account,
        savedChartUuid: string,
    ): Promise<FilterableDimension[]> {
        return Sentry.startSpan(
            {
                op: 'projectService.getAvailableFiltersForSavedQuery',
                name: 'ProjectService.getAvailableFiltersForSavedQuery',
            },
            async () => {
                const [savedChart] =
                    await this.savedChartModel.getInfoForAvailableFilters([
                        savedChartUuid,
                    ]);

                const space = await this.spaceModel.getSpaceSummary(
                    savedChart.spaceUuid,
                );

                const access = await this.spaceModel.getUserSpaceAccess(
                    account.user.id,
                    space.uuid,
                );

                if (
                    account.user.ability.cannot(
                        'view',
                        subject('SavedChart', {
                            ...savedChart,
                            isPrivate: space.isPrivate,
                            access,
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
        let allFilters: {
            uuid: string;
            filters: CompiledDimension[];
        }[] = [];

        allFilters = await Sentry.startSpan(
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

                const [spaceAccessMap, exploresMap, userSpacesAccess] =
                    await Promise.all([
                        this.spaceModel.getSpacesForAccessCheck(
                            uniqueSpaceUuids,
                        ),
                        this.findExplores({
                            account,
                            projectUuid: savedCharts[0].projectUuid, // TODO: route should be updated to be project/dashboard specific. For now we pick it from first chart as they all should be from the same project
                            exploreNames: savedCharts.map(
                                (chart) => chart.tableName,
                            ),
                            organizationUuid:
                                account.organization.organizationUuid,
                        }),
                        this.spaceModel.getUserSpacesAccess(
                            account.user.id,
                            uniqueSpaceUuids,
                        ),
                    ]);

                return savedCharts.map((savedChart) => {
                    const spaceAccess = spaceAccessMap.get(
                        savedChart.spaceUuid,
                    );

                    if (
                        account.user.ability.cannot(
                            'view',
                            subject('SavedChart', {
                                ...savedChart,
                                isPrivate: spaceAccess?.isPrivate,
                                access:
                                    userSpacesAccess[savedChart.spaceUuid] ??
                                    [],
                            }),
                        )
                    ) {
                        return { uuid: savedChart.uuid, filters: [] };
                    }

                    const explore = exploresMap[savedChart.tableName];

                    let filters: CompiledDimension[] = [];
                    if (explore && !isExploreError(explore)) {
                        filters = getDimensions(explore).filter(
                            (field) =>
                                isFilterableDimension(field) && !field.hidden,
                        );
                    }

                    return { uuid: savedChart.uuid, filters };
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

        return {
            savedQueryFilters,
            allFilterableFields,
        };
    }

    async hasSavedCharts(
        user: SessionUser,
        projectUuid: string,
    ): Promise<boolean> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
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

    async getProjectMemberAccess(
        user: SessionUser,
        projectUuid: string,
        userUuid: string,
    ): Promise<ProjectMemberProfile> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
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
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
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
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'manage',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
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

    async updateProjectAccess(
        user: SessionUser,
        projectUuid: string,
        userUuid: string,
        data: UpdateProjectMember,
    ): Promise<void> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'manage',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
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
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
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

    async deleteProjectAccess(
        user: SessionUser,
        projectUuid: string,
        userUuid: string,
    ): Promise<void> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'manage',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.projectModel.deleteProjectAccess(projectUuid, userUuid);
    }

    async getProjectGroupAccesses(
        actor: SessionUser,
        projectUuid: string,
    ): Promise<ProjectGroupAccess[]> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            actor.ability.cannot(
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
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const spaces = await this.spaceModel.find({ projectUuid });
        const spacesAccess = await this.spaceModel.getUserSpacesAccess(
            user.userUuid,
            spaces.map((s) => s.uuid),
        );

        const allowedSpaceUuids = spaces
            .filter(
                (space) =>
                    space.projectUuid === projectUuid &&
                    hasViewAccessToSpace(
                        user,
                        space,
                        spacesAccess[space.uuid] ?? [],
                    ),
            )
            .map(({ uuid }) => uuid);

        const savedQueries = await this.spaceModel.getSpaceQueries(
            allowedSpaceUuids,
        );
        const savedSqlCharts = await this.spaceModel.getSpaceSqlCharts(
            allowedSpaceUuids,
        );

        return [...savedQueries, ...savedSqlCharts];
    }

    async getChartSummaries(
        user: SessionUser,
        projectUuid: string,
        excludeChartsSavedInDashboard: boolean = false,
    ): Promise<ChartSummary[]> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const spaces = await this.spaceModel.find({ projectUuid });
        const spacesAccess = await this.spaceModel.getUserSpacesAccess(
            user.userUuid,
            spaces.map((s) => s.uuid),
        );

        const allowedSpaceUuids = spaces
            .filter(
                (space) =>
                    space.projectUuid === projectUuid &&
                    hasViewAccessToSpace(
                        user,
                        space,
                        spacesAccess[space.uuid] ?? [],
                    ),
            )
            .map((space) => space.uuid);

        return this.savedChartModel.find({
            projectUuid,
            spaceUuids: allowedSpaceUuids,
            excludeChartsSavedInDashboard,
        });
    }

    async getMostPopularAndRecentlyUpdated(
        user: SessionUser,
        projectUuid: string,
    ): Promise<MostPopularAndRecentlyUpdated> {
        const projectSummary = await this.projectModel.getSummary(projectUuid);
        if (
            user.ability.cannot(
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
        const spacesAccess = await this.spaceModel.getUserSpacesAccess(
            user.userUuid,
            spaces.map((s) => s.uuid),
        );
        const allowedSpaces = spaces.filter(
            (space) =>
                (space.projectUuid === projectUuid &&
                    hasDirectAccessToSpace(user, space)) ||
                hasViewAccessToSpace(
                    user,
                    space,
                    spacesAccess[space.uuid] ?? [],
                ),
        );

        const mostPopular = await this.getMostPopular(allowedSpaces);
        const recentlyUpdated = await this.getRecentlyUpdated(allowedSpaces);

        return {
            mostPopular: mostPopular
                .sort((a, b) => b.views - a.views)
                .slice(
                    0,
                    this.spaceModel.MOST_POPULAR_OR_RECENTLY_UPDATED_LIMIT,
                ),
            recentlyUpdated: recentlyUpdated
                .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))
                .slice(
                    0,
                    this.spaceModel.MOST_POPULAR_OR_RECENTLY_UPDATED_LIMIT,
                ),
        };
    }

    async getMostPopular(
        allowedSpaces: Pick<SpaceSummary, 'uuid'>[],
    ): Promise<(SpaceQuery | DashboardBasicDetails)[]> {
        const mostPopularCharts = await this.spaceModel.getSpaceQueries(
            allowedSpaces.map(({ uuid }) => uuid),
            {
                mostPopular: true,
            },
        );
        const mostPopularSqlCharts = await this.spaceModel.getSpaceSqlCharts(
            allowedSpaces.map(({ uuid }) => uuid),
            {
                mostPopular: true,
            },
        );
        const mostPopularDashboards = await this.spaceModel.getSpaceDashboards(
            allowedSpaces.map(({ uuid }) => uuid),
            {
                mostPopular: true,
            },
        );

        return [
            ...mostPopularCharts,
            ...mostPopularSqlCharts,
            ...mostPopularDashboards,
        ];
    }

    async getRecentlyUpdated(
        allowedSpaces: Pick<SpaceSummary, 'uuid'>[],
    ): Promise<(SpaceQuery | DashboardBasicDetails)[]> {
        const recentlyUpdatedCharts = await this.spaceModel.getSpaceQueries(
            allowedSpaces.map(({ uuid }) => uuid),
            {
                recentlyUpdated: true,
            },
        );
        const recentlyUpdatedSqlCharts =
            await this.spaceModel.getSpaceSqlCharts(
                allowedSpaces.map(({ uuid }) => uuid),
                {
                    recentlyUpdated: true,
                },
            );
        const recentlyUpdatedDashboards =
            await this.spaceModel.getSpaceDashboards(
                allowedSpaces.map(({ uuid }) => uuid),
                {
                    recentlyUpdated: true,
                },
            );
        return [
            ...recentlyUpdatedCharts,
            ...recentlyUpdatedSqlCharts,
            ...recentlyUpdatedDashboards,
        ];
    }

    async getSpaces(
        user: SessionUser,
        projectUuid: string,
    ): Promise<SpaceSummary[]> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );
        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const spaces = await this.spaceModel.find({ projectUuid });
        const spacesAccess = await this.spaceModel.getUserSpacesAccess(
            user.userUuid,
            spaces.map((s) => s.uuid),
        );

        const spacesWithUserAccess = spaces
            .filter((space) =>
                hasViewAccessToSpace(user, space, spacesAccess[space.uuid]),
            )
            .map((spaceSummary) => ({
                ...spaceSummary,
                userAccess: spacesAccess[spaceSummary.uuid]?.[0] ?? [],
            }));

        return spacesWithUserAccess;
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
        },
        context: RequestMethod,
    ): Promise<ApiCreatePreviewResults> {
        // create preview project permissions are checked in `createWithoutCompile`
        const project = await this.projectModel.getWithSensitiveFields(
            projectUuid,
        );

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
            upstreamProjectUuid: data.copyContent ? projectUuid : undefined,
            organizationWarehouseCredentialsUuid:
                project.organizationWarehouseCredentialsUuid,
            dbtVersion: project.dbtVersion,
        };

        const previewProject = await this.createWithoutCompile(
            user,
            previewData,
            context,
        );

        // Since the project is new, and we have copied some permissions,
        // it is possible that the user `abilities` are not uptodate
        // Before we check permissions on scheduleCompileProject
        // Permissions will be checked again with the uptodate user on scheduler

        const { jobUuid } = await this.scheduleCompileProject(
            user,
            previewProject.project.projectUuid,
            context,
            true, // Skip permission check
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
                const projectAccesses =
                    await this.projectModel.getProjectAccess(
                        upstreamProjectUuid,
                    );
                const groupAccesses =
                    await this.projectModel.getProjectGroupAccesses(
                        upstreamProjectUuid,
                    );

                this.logger.info(
                    `Copying ${projectAccesses.length} user access on ${previewProjectUuid}`,
                );
                this.logger.info(
                    `Copying ${groupAccesses.length} group access on ${previewProjectUuid}`,
                );
                const insertProjectAccessPromises = projectAccesses.map(
                    (projectAccess) =>
                        this.projectModel.createProjectAccess(
                            previewProjectUuid,
                            projectAccess.email,
                            projectAccess.role,
                        ),
                );
                const insertGroupAccessPromises = groupAccesses.map(
                    (groupAccess) =>
                        this.groupsModel.addProjectAccess({
                            groupUuid: groupAccess.groupUuid,
                            projectUuid: previewProjectUuid,
                            role: groupAccess.role,
                        }),
                );

                await Promise.all([
                    ...insertGroupAccessPromises,
                    ...insertProjectAccessPromises,
                ]);
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

                await this.projectModel.duplicateContent(
                    projectUuid,
                    previewProjectUuid,
                    spaces,
                );
            },
        );
    }

    async _getCalculateTotalQuery(
        userAttributes: UserAttributeValueMap,
        intrinsicUserAttributes: IntrinsicUserAttributes,
        explore: Explore,
        metricQuery: MetricQuery,
        warehouseClient: WarehouseClient,
        availableParameterDefinitions: ParameterDefinitions,
        parameters?: ParametersValuesMap,
    ) {
        const totalQuery: MetricQuery = {
            ...metricQuery,
            limit: 1,
            tableCalculations: [],
            sorts: [],
            dimensions: [],
            customDimensions: metricQuery.customDimensions,
            metrics: metricQuery.metrics,
            additionalMetrics: metricQuery.additionalMetrics,
        };

        const hasMetricFilters =
            !!totalQuery.filters.metrics &&
            flattenFilterGroup(totalQuery.filters.metrics).length > 0;
        const hasTableCalculationFilters =
            !!totalQuery.filters.tableCalculations &&
            flattenFilterGroup(totalQuery.filters.tableCalculations).length > 0;

        if (hasMetricFilters || hasTableCalculationFilters) {
            throw new NotSupportedError(
                'Totals cannot be correctly calculated with metric filters or table calculation filters',
            );
        }

        const { query } = await ProjectService._compileQuery({
            metricQuery: totalQuery,
            explore,
            warehouseSqlBuilder: warehouseClient,
            intrinsicUserAttributes,
            userAttributes,
            timezone: this.lightdashConfig.query.timezone || 'UTC',
            parameters,
            availableParameterDefinitions,
        });

        return { query, totalQuery };
    }

    async _calculateTotal(
        account: Account,
        projectUuid: string,
        explore: Explore,
        metricQuery: MetricQuery,
        organizationUuid: string,
        parameters?: ParametersValuesMap,
    ) {
        const { warehouseClient, sshTunnel } = await this._getWarehouseClient(
            projectUuid,
            await this.getWarehouseCredentials({
                projectUuid,
                userId: account.user.id,
                isRegisteredUser: account.isRegisteredUser(),
            }),
            {
                snowflakeVirtualWarehouse: explore.warehouse,
                databricksCompute: explore.databricksCompute,
            },
        );

        const { userAttributes, intrinsicUserAttributes } =
            await this.getUserAttributes({ account });

        const availableParameterDefinitions = await this.getAvailableParameters(
            projectUuid,
            explore,
        );

        try {
            const { query } = await this._getCalculateTotalQuery(
                userAttributes,
                intrinsicUserAttributes,
                explore,
                metricQuery,
                warehouseClient,
                availableParameterDefinitions,
                parameters,
            );

            const queryTags: RunQueryTags = {
                ...this.getUserQueryTags(account),
                organization_uuid: account.organization.organizationUuid,
                project_uuid: projectUuid,
                explore_name: explore.name,
                query_context: QueryExecutionContext.CALCULATE_TOTAL,
            };

            const { rows } = await warehouseClient.runQuery(query, queryTags);
            await sshTunnel.disconnect();
            return { row: rows[0] };
        } catch (e) {
            if (e instanceof NotSupportedError) {
                this.logger.warn(e.message);
                return { row: {} }; // no totals
            }
            throw e;
        }
    }

    async _calculateTotalFromCacheOrWarehouse(
        account: Account,
        projectUuid: string,
        explore: Explore,
        metricQuery: MetricQuery,
        invalidateCache: boolean,
        organizationUuid: string,
        parameters?: ParametersValuesMap,
    ) {
        const { warehouseClient, sshTunnel } = await this._getWarehouseClient(
            projectUuid,
            await this.getWarehouseCredentials({
                projectUuid,
                userId: account.user.id,
                isRegisteredUser: account.isRegisteredUser(),
            }),
            {
                snowflakeVirtualWarehouse: explore.warehouse,
                databricksCompute: explore.databricksCompute,
            },
        );

        const { userAttributes, intrinsicUserAttributes } =
            await this.getUserAttributes({ account });

        const availableParameterDefinitions = await this.getAvailableParameters(
            projectUuid,
            explore,
        );

        try {
            const { query, totalQuery } = await this._getCalculateTotalQuery(
                userAttributes,
                intrinsicUserAttributes,
                explore,
                metricQuery,
                warehouseClient,
                availableParameterDefinitions,
                parameters,
            );

            const queryTags: RunQueryTags = {
                ...this.getUserQueryTags(account),
                organization_uuid: organizationUuid,
                project_uuid: projectUuid,
                explore_name: explore.name,
                query_context: QueryExecutionContext.CALCULATE_TOTAL,
            };

            const { rows, cacheMetadata } =
                await this.getResultsFromCacheOrWarehouse({
                    projectUuid,
                    context: QueryExecutionContext.CALCULATE_TOTAL,
                    warehouseClient,
                    metricQuery: totalQuery,
                    query,
                    queryTags,
                    invalidateCache,
                });
            await sshTunnel.disconnect();
            return { row: rows[0], cacheMetadata };
        } catch (e) {
            if (e instanceof NotSupportedError) {
                this.logger.warn(e.message);
                return { row: {} }; // no totals
            }
            throw e;
        }
    }

    async calculateTotalFromSavedChart(
        account: Account,
        chartUuid: string,
        dashboardFilters?: DashboardFilters,
        invalidateCache: boolean = false,
        parameters?: ParametersValuesMap,
    ) {
        assertIsAccountWithOrg(account);

        const savedChart = await this.savedChartModel.get(
            chartUuid,
            undefined, // VersionUuid
        );
        const { organizationUuid, projectUuid } = savedChart;

        const explore = await this.getExplore(
            account,
            projectUuid,
            savedChart.tableName,
            organizationUuid,
        );
        const tables = Object.keys(explore.tables);

        const appliedDashboardFilters = dashboardFilters
            ? {
                  dimensions: getDashboardFilterRulesForTables(
                      tables,
                      dashboardFilters.dimensions,
                  ),
                  metrics: getDashboardFilterRulesForTables(
                      tables,
                      dashboardFilters.metrics,
                  ),
                  tableCalculations: getDashboardFilterRulesForTables(
                      tables,
                      dashboardFilters.tableCalculations,
                  ),
              }
            : undefined;

        const metricQuery: MetricQuery = appliedDashboardFilters
            ? addDashboardFiltersToMetricQuery(
                  savedChart.metricQuery,
                  appliedDashboardFilters,
              )
            : savedChart.metricQuery;

        const space = await this.spaceModel.getSpaceSummary(
            savedChart.spaceUuid,
        );
        const access = await this.spaceModel.getUserSpaceAccess(
            account.user.id,
            savedChart.spaceUuid,
        );

        if (
            account.user.ability.cannot(
                'view',
                subject('SavedChart', {
                    organizationUuid,
                    projectUuid,
                    isPrivate: space.isPrivate,
                    access,
                }),
            ) ||
            account.user.ability.cannot(
                'view',
                subject('Project', {
                    organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const combinedParameters = await this.combineParameters(
            projectUuid,
            explore,
            parameters,
            savedChart.parameters,
        );

        const results = await this._calculateTotalFromCacheOrWarehouse(
            account,
            projectUuid,
            explore,
            metricQuery,
            invalidateCache,
            savedChart.organizationUuid,
            combinedParameters,
        );
        return results.row;
    }

    async calculateTotalFromQuery(
        account: Account,
        projectUuid: string,
        data: CalculateTotalFromQuery,
    ) {
        assertIsAccountWithOrg(account);

        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            account.user.ability.cannot(
                'manage',
                subject('Explore', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (
            data.metricQuery.customDimensions?.some(isCustomSqlDimension) &&
            account.user.ability.cannot(
                'manage',
                subject('CustomSql', { organizationUuid, projectUuid }),
            )
        ) {
            throw new CustomSqlQueryForbiddenError();
        }

        const explore = await this.getExplore(
            account,
            projectUuid,
            data.explore,
            organizationUuid,
        );

        const combinedParameters = await this.combineParameters(
            projectUuid,
            explore,
            data.parameters,
        );

        const results = await this._calculateTotal(
            account,
            projectUuid,
            explore,
            data.metricQuery,
            organizationUuid,
            combinedParameters,
        );
        return results.row;
    }

    async _calculateSubtotals(
        account: Account,
        projectUuid: string,
        data: CalculateSubtotalsFromQuery,
        explore: Explore,
        organizationUuid: string,
        parameters?: ParametersValuesMap,
    ) {
        const {
            explore: exploreName,
            metricQuery,
            columnOrder,
            pivotDimensions,
        } = data;

        // Use the shared utility to prepare dimension groups
        const { dimensionGroupsToSubtotal, analyticsData } =
            SubtotalsCalculator.prepareDimensionGroups(
                metricQuery,
                columnOrder,
                pivotDimensions,
            );

        this.analytics.trackAccount(account, {
            event: 'query.subtotal',
            properties: {
                context: QueryExecutionContext.CALCULATE_SUBTOTAL,
                organizationId: organizationUuid,
                projectId: projectUuid,
                exploreName,
                ...analyticsData,
            },
        });

        const queryTags: RunQueryTags = {
            ...this.getUserQueryTags(account),
            organization_uuid: account.organization.organizationUuid,
            project_uuid: projectUuid,
            explore_name: exploreName,
            query_context: QueryExecutionContext.CALCULATE_SUBTOTAL,
        };

        // Run the query for each dimension group and format the raw rows, this is needed because we apply raw formatting to date dimensions, and we need to compare values in the same format in the frontend
        const runQueryAndFormatRaw = async (
            subtotalMetricQuery: MetricQuery,
        ) => {
            const { rows, fields } = await this.runMetricQuery({
                account,
                metricQuery: subtotalMetricQuery,
                explore,
                queryTags,
                projectUuid,
                exploreName,
                context: QueryExecutionContext.CALCULATE_SUBTOTAL,
                csvLimit: null,
                chartUuid: undefined,
                parameters,
            });

            return formatRawRows(rows, fields);
        };

        const subtotalsPromises = dimensionGroupsToSubtotal.map<
            Promise<[string, Record<string, unknown>[]]>
        >(async (subtotalDimensions) => {
            let subtotals: Record<string, unknown>[] = [];

            try {
                // Use utility to create properly configured subtotal query
                const { metricQuery: subtotalMetricQuery } =
                    SubtotalsCalculator.createSubtotalQueryConfig(
                        metricQuery,
                        subtotalDimensions,
                        pivotDimensions,
                    );

                subtotals = await runQueryAndFormatRaw(subtotalMetricQuery);
            } catch (e) {
                this.logger.error(
                    `Error running subtotal query for dimensions ${subtotalDimensions.join(
                        ',',
                    )}`,
                );
            }

            return [
                SubtotalsCalculator.getSubtotalKey(subtotalDimensions),
                subtotals,
            ] satisfies [string, Record<string, unknown>[]];
        });

        const subtotalsEntries = await Promise.all(subtotalsPromises);
        return SubtotalsCalculator.formatSubtotalEntries(subtotalsEntries);
    }

    async calculateSubtotalsFromQuery(
        account: Account,
        projectUuid: string,
        data: CalculateSubtotalsFromQuery,
    ) {
        assertIsAccountWithOrg(account);

        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            account.user.ability.cannot(
                'manage',
                subject('Explore', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (
            data.metricQuery.customDimensions?.some(isCustomSqlDimension) &&
            account.user.ability.cannot(
                'manage',
                subject('CustomSql', { organizationUuid, projectUuid }),
            )
        ) {
            throw new CustomSqlQueryForbiddenError();
        }

        const explore = await this.getExplore(
            account,
            projectUuid,
            data.explore,
            organizationUuid,
        );

        const combinedParameters = await this.combineParameters(
            projectUuid,
            explore,
            data.parameters,
        );

        // Reuse the _calculateTotal method by passing the explore, metricQuery, and organizationUuid
        return this._calculateSubtotals(
            account,
            projectUuid,
            data,
            explore,
            organizationUuid,
            combinedParameters,
        );
    }

    async getDbtExposures(
        user: SessionUser,
        projectUuid: string,
    ): Promise<Record<string, DbtExposure>> {
        const projectSummary = await this.projectModel.getSummary(projectUuid);
        if (user.ability.cannot('manage', subject('Project', projectSummary))) {
            throw new ForbiddenError();
        }
        const cachedExplores = await this.projectModel.findExploresFromCache(
            projectUuid,
            'name',
        );
        const allExplores = Object.values(cachedExplores);

        const validExplores = allExplores?.filter(
            (explore) => explore.type !== ExploreType.VIRTUAL,
        );

        if (!validExplores) {
            throw new NotFoundError('No explores found');
        }

        const charts = await this.savedChartModel.findInfoForDbtExposures(
            projectUuid,
        );

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
        const dashboards = await this.dashboardModel.findInfoForDbtExposures(
            projectUuid,
        );

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
        if (user.ability.cannot('view', subject('Project', project))) {
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
        if (user.ability.cannot('view', subject('Project', project))) {
            throw new ForbiddenError();
        }
        await this.userWarehouseCredentialsModel.upsertUserCredentialsPreference(
            user.userUuid,
            projectUuid,
            userWarehouseCredentialsUuid,
        );
    }

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
    ) {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            account.user.ability.cannot(
                'create',
                subject('VirtualView', { organizationUuid, projectUuid }),
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
                isRegisteredUser: true,
            }),
        );
        const virtualView = await this.projectModel.createVirtualView(
            projectUuid,
            payload,
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
    ) {
        const virtualView = await this.findExplores({
            account,
            projectUuid,
            exploreNames: [exploreName],
        });

        if (!virtualView) {
            throw new NotFoundError('Virtual view not found');
        }

        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            account.user.ability.cannot(
                'create',
                subject('VirtualView', { organizationUuid, projectUuid }),
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
            }),
        );

        const updatedExplore = await this.projectModel.updateVirtualView(
            projectUuid,
            exploreName,
            payload,
            warehouseClient,
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
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            user.ability.cannot(
                'delete',
                subject('VirtualView', { organizationUuid, projectUuid }),
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

    async updateDefaultSchedulerTimezone(
        user: SessionUser,
        projectUuid: string,
        schedulerTimezone: string,
    ) {
        const project = await this.projectModel.getSummary(projectUuid);

        if (user.ability.cannot('update', subject('Project', project))) {
            throw new ForbiddenError();
        }

        const updatedProject =
            await this.projectModel.updateDefaultSchedulerTimezone(
                projectUuid,
                schedulerTimezone,
            );

        this.analytics.track({
            event: 'default_scheduler_timezone.updated',
            userId: user.userUuid,
            properties: {
                projectId: projectUuid,
                organizationUuid: project.organizationUuid,
                timeZone: getTimezoneLabel(schedulerTimezone),
            },
        });

        return updatedProject;
    }

    async createTag(
        user: SessionUser,
        {
            projectUuid,
            name,
            color,
        }: Pick<Tag, 'projectUuid' | 'name' | 'color'>,
    ): Promise<Pick<Tag, 'tagUuid'>> {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            user.ability.cannot(
                'manage',
                subject('Tags', {
                    projectUuid,
                    organizationUuid,
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

        if (
            user.ability.cannot(
                'manage',
                subject('Tags', {
                    projectUuid: tag.projectUuid,
                    organizationUuid,
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

        if (
            user.ability.cannot(
                'manage',
                subject('Tags', {
                    projectUuid: tag.projectUuid,
                    organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.tagsModel.update(tagUuid, tagUpdate);
    }

    async getTags(user: SessionUser, projectUuid: string) {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            user.ability.cannot(
                'view',
                subject('Tags', { projectUuid, organizationUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        return this.tagsModel.list(projectUuid);
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
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            user.ability.cannot(
                'update',
                subject('Project', {
                    projectUuid,
                    organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.projectParametersModel.replace(
            projectUuid,
            parameters ?? {},
        );
    }

    async replaceYamlTags(
        user: SessionUser,
        projectUuid: string,
        yamlTags: (Pick<Tag, 'name' | 'color'> & {
            yamlReference: NonNullable<Tag['yamlReference']>;
        })[],
    ) {
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        if (
            user.ability.cannot(
                'manage',
                subject('Tags', {
                    projectUuid,
                    organizationUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

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
        const charts = await this.savedChartModel.findChartsWithCustomFields(
            projectUuid,
        );
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

    async createPreviewWithExplores(
        projectUuid: string,
        accountId: string,
        runId: string,
    ): Promise<string> {
        // create preview project permissions are checked in `createWithoutCompile`
        const project = await this.projectModel.getWithSensitiveFields(
            projectUuid,
        );

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
            (node: AnyType) => node.resource_type === 'model' && node.meta, // check that node.meta exists
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
            [],
            warehouseClient,
            {
                spotlight: {
                    default_visibility: 'hide', // todo: pass correct config
                },
            },
            disableTimestampConversion,
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
            projectToSetExplores = newPreview.project.projectUuid;
        }

        Logger.info(`Set explores for: ${projectToSetExplores}`);
        await this.saveExploresToCacheAndIndexCatalog(
            user.userUuid,
            projectToSetExplores,
            [...convertedExplores, ...exploreErrors],
            'refresh_dbt',
            null,
            'api',
        );

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
        const refreshToken = await this.userModel.getRefreshToken(
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
    ): Promise<ParametersValuesMap> {
        // Get default values for parameters
        const projectDefaultParameterValues: ParametersValuesMap = {};

        // Fetch all parameters
        const parameterConfigs = await this.projectParametersModel.find(
            projectUuid,
        );

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

        // Combine in order of priority: defaults (project / explore) < saved parameters (chart/dashboard) < request
        return {
            ...projectDefaultParameterValues,
            ...exploreDefaultParameterValues,
            ...(savedParameters || {}),
            ...(requestParameters || {}),
        };
    }

    static isChartEmbed(account: Account) {
        if (!isJwtUser(account)) return false;

        return account.access.content.type === 'chart';
    }
}
