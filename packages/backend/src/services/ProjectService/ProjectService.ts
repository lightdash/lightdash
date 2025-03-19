import { subject } from '@casl/ability';
import {
    addDashboardFiltersToMetricQuery,
    AlreadyExistsError,
    AlreadyProcessingError,
    AndFilterGroup,
    AnyType,
    ApiChartAndResults,
    type ApiCreateProjectResults,
    type ApiExecuteAsyncQueryResults,
    type ApiGetAsyncQueryResults,
    ApiQueryResults,
    ApiSqlQueryResults,
    assertUnreachable,
    CacheMetadata,
    type CalculateSubtotalsFromQuery,
    CalculateTotalFromQuery,
    ChartSourceType,
    ChartSummary,
    CompiledDimension,
    ContentType,
    convertCustomMetricToDbt,
    countCustomDimensionsInMetricQuery,
    countTotalFilterRules,
    type CreateDatabricksCredentials,
    createDimensionWithGranularity,
    CreateJob,
    CreateProject,
    CreateProjectMember,
    CreateSnowflakeCredentials,
    CreateVirtualViewPayload,
    CreateWarehouseCredentials,
    CustomFormatType,
    DashboardAvailableFilters,
    DashboardBasicDetails,
    DashboardFilters,
    DateGranularity,
    DbtExposure,
    DbtExposureType,
    DbtProjectType,
    deepEqual,
    DEFAULT_RESULTS_PAGE_SIZE,
    DefaultSupportedDbtVersion,
    DimensionType,
    DownloadFileType,
    type ExecuteAsyncDashboardChartRequestParams,
    type ExecuteAsyncMetricQueryRequestParams,
    type ExecuteAsyncQueryRequestParams,
    type ExecuteAsyncSavedChartRequestParams,
    type ExecuteAsyncUnderlyingDataRequestParams,
    Explore,
    ExploreError,
    ExploreType,
    FilterableDimension,
    FilterGroupItem,
    FilterOperator,
    findFieldByIdInExplore,
    findReplaceableCustomMetrics,
    ForbiddenError,
    formatRawRows,
    formatRow,
    formatRows,
    getAggregatedField,
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
    hasIntersection,
    IntrinsicUserAttributes,
    isCustomSqlDimension,
    isDateItem,
    isDimension,
    isExploreError,
    isField,
    isFilterableDimension,
    isFilterRule,
    isMetric,
    isNotNull,
    isUserWithOrg,
    ItemsMap,
    Job,
    JobStatusType,
    JobStepType,
    JobType,
    LightdashError,
    maybeReplaceFieldsInChartVersion,
    MetricQuery,
    MissingWarehouseCredentialsError,
    MostPopularAndRecentlyUpdated,
    NotExistsError,
    NotFoundError,
    ParameterError,
    PivotChartData,
    PivotValuesColumn,
    Project,
    ProjectCatalog,
    ProjectGroupAccess,
    ProjectMemberProfile,
    ProjectMemberRole,
    ProjectType,
    QueryExecutionContext,
    QueryHistoryStatus,
    ReplaceableCustomFields,
    ReplaceCustomFields,
    ReplaceCustomFieldsPayload,
    replaceDimensionInExplore,
    RequestMethod,
    ResultRow,
    type RunQueryTags,
    SavedChartDAO,
    SavedChartsInfoForDashboardAvailableFilters,
    type SemanticLayerConnectionUpdate,
    SessionUser,
    snakeCaseName,
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
    UserAttributeValueMap,
    UserWarehouseCredentials,
    VizColumn,
    WarehouseClient,
    WarehouseCredentials,
    WarehouseTablesCatalog,
    WarehouseTableSchema,
    WarehouseTypes,
} from '@lightdash/common';
import { SshTunnel } from '@lightdash/warehouses';
import * as Sentry from '@sentry/node';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as yaml from 'js-yaml';
import { uniq } from 'lodash';
import { Readable } from 'stream';
import { URL } from 'url';
import { v4 as uuidv4 } from 'uuid';
import { Worker } from 'worker_threads';
import {
    LightdashAnalytics,
    MetricQueryExecutionProperties,
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
import { GroupsModel } from '../../models/GroupsModel';
import { JobModel } from '../../models/JobModel/JobModel';
import { OnboardingModel } from '../../models/OnboardingModel/OnboardingModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { QueryHistoryModel } from '../../models/QueryHistoryModel';
import { SavedChartModel } from '../../models/SavedChartModel';
import { SpaceModel } from '../../models/SpaceModel';
import { SshKeyPairModel } from '../../models/SshKeyPairModel';
import type { TagsModel } from '../../models/TagsModel';
import { UserAttributesModel } from '../../models/UserAttributesModel';
import { UserWarehouseCredentialsModel } from '../../models/UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { WarehouseAvailableTablesModel } from '../../models/WarehouseAvailableTablesModel/WarehouseAvailableTablesModel';
import { projectAdapterFromConfig } from '../../projectAdapters/projectAdapter';
import {
    applyLimitToSqlQuery,
    buildQuery,
    CompiledQuery,
} from '../../queryBuilder';
import { compileMetricQuery } from '../../queryCompiler';
import { SchedulerClient } from '../../scheduler/SchedulerClient';
import { ProjectAdapter } from '../../types';
import { runWorkerThread, wrapSentryTransaction } from '../../utils';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
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
import {
    getNextAndPreviousPage,
    validatePagination,
} from './resultsPagination';
import {
    type ExecuteAsyncDashboardChartQueryArgs,
    type ExecuteAsyncMetricQueryArgs,
    type ExecuteAsyncSavedChartQueryArgs,
    type ExecuteAsyncUnderlyingDataQueryArgs,
    type GetAsyncQueryResultsArgs,
} from './types';

type ProjectServiceArguments = {
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
    queryHistoryModel: QueryHistoryModel;
    encryptionUtil: EncryptionUtil;
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

    queryHistoryModel: QueryHistoryModel;

    encryptionUtil: EncryptionUtil;

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
        queryHistoryModel,
        encryptionUtil,
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
        this.queryHistoryModel = queryHistoryModel;
        this.encryptionUtil = encryptionUtil;
    }

    static getMetricQueryExecutionProperties({
        metricQuery,
        hasExampleMetric,
        granularity,
        chartUuid,
        queryTags,
        explore,
    }: {
        metricQuery: MetricQuery;
        hasExampleMetric: boolean;
        granularity: DateGranularity | undefined;
        chartUuid: string | undefined;
        queryTags: Record<string, unknown>;
        explore: Explore;
    }): MetricQueryExecutionProperties {
        return {
            hasExampleMetric,
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
            dateZoomGranularity: granularity || null,
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
        };
    }

    private async validateProjectCreationPermissions(
        user: SessionUser,
        data: CreateProject,
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
                                organizationUuid: user.organizationUuid,
                                projectUuid: data.upstreamProjectUuid,
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
                }

                if (
                    // checks if user has permission to create project on an organization level or from an upstream project on a project level
                    user.ability.can(
                        'create',
                        subject('Project', {
                            organizationUuid: user.organizationUuid,
                            upstreamProjectUuid: data.upstreamProjectUuid,
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

    private async _resolveWarehouseClientSshKeys<
        T extends { warehouseConnection: CreateWarehouseCredentials },
    >(args: T): Promise<T> {
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
        return args;
    }

    // TODO: getWarehouseCredentials could be moved to a client WarehouseClientManager. However, this client shouldn't be using a model. Perhaps this information can be passed as a prop to the client so that other services can use the warehouse client credentials logic?

    private async getWarehouseCredentials(
        projectUuid: string,
        userUuid: string,
    ) {
        let credentials =
            await this.projectModel.getWarehouseCredentialsForProject(
                projectUuid,
            );
        let userWarehouseCredentialsUuid: string | undefined;
        if (credentials.requireUserCredentials) {
            const userWarehouseCredentials =
                await this.userWarehouseCredentialsModel.findForProjectWithSecrets(
                    projectUuid,
                    userUuid,
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
            userWarehouseCredentialsUuid = userWarehouseCredentials.uuid;
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
        return this.schedulerClient.indexCatalog({
            projectUuid,
            userUuid,
            organizationUuid,
            prevCatalogItemsWithTags,
            prevCatalogItemsWithIcons,
            prevMetricTreeEdges,
        });
    }

    async getProject(projectUuid: string, user: SessionUser): Promise<Project> {
        const project = await this.projectModel.get(projectUuid);
        if (
            user.ability.cannot(
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
        data: CreateProject,
        method: RequestMethod,
    ): Promise<ApiCreateProjectResults> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        await this.validateProjectCreationPermissions(user, data);

        const newProjectData = data;
        if (
            newProjectData.type === ProjectType.PREVIEW &&
            data.copyWarehouseConnectionFromUpstreamProject &&
            data.upstreamProjectUuid
        ) {
            newProjectData.warehouseConnection =
                await this.projectModel.getWarehouseCredentialsForProject(
                    data.upstreamProjectUuid,
                );
        }

        const createProject = await this._resolveWarehouseClientSshKeys(
            newProjectData,
        );
        const projectUuid = await this.projectModel.create(
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
            properties: {
                projectName: createProject.name,
                projectId: projectUuid,
                projectType: createProject.dbtConnection.type,
                warehouseConnectionType: createProject.warehouseConnection.type,
                organizationId: user.organizationUuid,
                dbtConnectionType: createProject.dbtConnection.type,
                isPreview: createProject.type === ProjectType.PREVIEW,
                method,
                copiedFromProjectUuid: data.upstreamProjectUuid,
            },
        });

        let hasContentCopy = false;

        if (data.type === ProjectType.PREVIEW && data.upstreamProjectUuid) {
            try {
                await this.copyUserAccessOnPreview(
                    data.upstreamProjectUuid,
                    projectUuid,
                );
                await this.copyContentOnPreview(
                    data.upstreamProjectUuid,
                    projectUuid,
                    user,
                );

                hasContentCopy = true;
            } catch (e) {
                Sentry.captureException(e);
                this.logger.error(`Unable to copy content on preview ${e}`);
            }
        }

        const project = await this.projectModel.get(projectUuid);

        return {
            hasContentCopy,
            project,
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
            const createProject = await this._resolveWarehouseClientSshKeys(
                data,
            );
            await this.jobModel.update(jobUuid, {
                jobStatus: JobStatusType.RUNNING,
            });
            const { adapter, sshTunnel } = await this.jobModel.tryJobStep(
                jobUuid,
                JobStepType.TESTING_ADAPTOR,
                async () => this.testProjectAdapter(createProject, user),
            );

            const explores = await this.jobModel.tryJobStep(
                jobUuid,
                JobStepType.COMPILING,
                async () => {
                    try {
                        // There's no project yet, so we don't track
                        const trackingParams = undefined;
                        return await adapter.compileAllExplores(trackingParams);
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

                    const trackingParams = {
                        projectUuid: newProjectUuid,
                        organizationUuid: user.organizationUuid,
                        userUuid: user.userUuid,
                    };

                    const lightdashProjectConfig =
                        await adapter.getLightdashProjectConfig(trackingParams);

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
                    await this.saveExploresToCacheAndIndexCatalog(
                        user.userUuid,
                        newProjectUuid,
                        explores,
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
                properties: {
                    projectName: createProject.name,
                    projectId: projectUuid,
                    projectType: createProject.dbtConnection.type,
                    warehouseConnectionType:
                        createProject.warehouseConnection.type,
                    organizationId: user.organizationUuid,
                    dbtConnectionType: createProject.dbtConnection.type,
                    isPreview: createProject.type === ProjectType.PREVIEW,
                    method,
                },
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

        await this.saveExploresToCacheAndIndexCatalog(
            user.userUuid,
            projectUuid,
            explores,
        );

        await this.schedulerClient.generateValidation({
            userUuid: user.userUuid,
            projectUuid,
            context: 'cli',
            organizationUuid,
        });
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
        const createProject = await this._resolveWarehouseClientSshKeys(data);
        const updatedProject = ProjectModel.mergeMissingProjectConfigSecrets(
            createProject,
            savedProject,
        );

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
                            await this.saveExploresToCacheAndIndexCatalog(
                                user.userUuid,
                                projectUuid,
                                explores,
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
            this.analytics.track({
                event: 'project.updated',
                userId: user.userUuid,
                properties: {
                    projectName: updatedProject.name,
                    projectId: projectUuid,
                    projectType: updatedProject.dbtConnection.type,
                    warehouseConnectionType:
                        updatedProject.warehouseConnection!.type,
                    organizationId: user.organizationUuid,
                    dbtConnectionType: updatedProject.dbtConnection.type,
                    isPreview: updatedProject.type === ProjectType.PREVIEW,
                    method,
                },
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

    static updateExploreWithGranularity(
        explore: Explore,
        metricQuery: MetricQuery,
        warehouseClient: WarehouseClient,
        granularity?: DateGranularity,
    ): Explore {
        if (granularity) {
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

            const firstTimeDimensionIdInMetricQuery =
                metricQuery.dimensions.find(
                    (dimension) => !!timeDimensionsMap[dimension],
                );
            if (firstTimeDimensionIdInMetricQuery) {
                const dimToOverride =
                    timeDimensionsMap[firstTimeDimensionIdInMetricQuery];
                const { baseDimensionId } = getDateDimension(
                    firstTimeDimensionIdInMetricQuery,
                );
                const baseTimeDimension =
                    dimToOverride.timeInterval && baseDimensionId
                        ? timeDimensionsMap[baseDimensionId]
                        : dimToOverride;
                const dimWithGranularityOverride =
                    createDimensionWithGranularity(
                        dimToOverride.name,
                        baseTimeDimension,
                        explore,
                        warehouseClient,
                        granularity,
                    );
                return replaceDimensionInExplore(
                    explore,
                    dimWithGranularityOverride,
                );
            }
        }
        return explore;
    }

    static async _compileQuery(
        metricQuery: MetricQuery,
        explore: Explore,
        warehouseClient: WarehouseClient,
        intrinsicUserAttributes: IntrinsicUserAttributes,
        userAttributes: UserAttributeValueMap,
        timezone: string,
        granularity?: DateGranularity,
    ): Promise<CompiledQuery> {
        const exploreWithOverride = ProjectService.updateExploreWithGranularity(
            explore,
            metricQuery,
            warehouseClient,
            granularity,
        );

        const compiledMetricQuery = compileMetricQuery({
            explore: exploreWithOverride,
            metricQuery,
            warehouseClient,
        });

        const buildQueryResult = buildQuery({
            explore: exploreWithOverride,
            compiledMetricQuery,
            warehouseClient,
            intrinsicUserAttributes,
            userAttributes,
            timezone,
        });

        return buildQueryResult;
    }

    async compileQuery(
        user: SessionUser,
        metricQuery: MetricQuery,
        projectUuid: string,
        exploreName: string,
    ) {
        const { organizationUuid } =
            await this.projectModel.getWithSensitiveFields(projectUuid);

        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        if (
            metricQuery.customDimensions?.some(isCustomSqlDimension) &&
            user.ability.cannot(
                'manage',
                subject('CustomSql', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError(
                'User cannot run queries with custom SQL dimensions',
            );
        }

        const explore = await this.getExplore(user, projectUuid, exploreName);

        const { warehouseClient, sshTunnel } = await this._getWarehouseClient(
            projectUuid,
            await this.getWarehouseCredentials(projectUuid, user.userUuid),
            {
                snowflakeVirtualWarehouse: explore.warehouse,
                databricksCompute: explore.databricksCompute,
            },
        );
        const userAttributes =
            await this.userAttributesModel.getAttributeValuesForOrgMember({
                organizationUuid,
                userUuid: user.userUuid,
            });

        const emailStatus = await this.emailModel.getPrimaryEmailStatus(
            user.userUuid,
        );
        const intrinsicUserAttributes = emailStatus.isVerified
            ? getIntrinsicUserAttributes(user)
            : {};

        const compiledQuery = await ProjectService._compileQuery(
            metricQuery,
            explore,
            warehouseClient,
            intrinsicUserAttributes,
            userAttributes,
            this.lightdashConfig.query.timezone || 'UTC',
        );
        await sshTunnel.disconnect();
        return compiledQuery;
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
        user: SessionUser,
        metricQuery: MetricQuery,
        projectUuid: string,
        exploreName: string,
        csvLimit: number | null | undefined,
        context: QueryExecutionContext = QueryExecutionContext.VIEW_UNDERLYING_DATA,
    ): Promise<ApiQueryResults> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { organizationUuid } =
            await this.projectModel.getWithSensitiveFields(projectUuid);

        if (
            user.ability.cannot(
                'view',
                subject('UnderlyingData', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (
            metricQuery.customDimensions?.some(isCustomSqlDimension) &&
            user.ability.cannot(
                'manage',
                subject('CustomSql', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError(
                'User cannot run queries with custom SQL dimensions',
            );
        }

        const queryTags: RunQueryTags = {
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            user_uuid: user.userUuid,
            explore_name: exploreName,
            query_context: context,
        };

        return this.runQueryAndFormatRows({
            user,
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
        user,
        chartUuid,
        versionUuid,
        invalidateCache,
        context = QueryExecutionContext.CHART,
    }: {
        user: SessionUser;
        chartUuid: string;
        versionUuid?: string;
        invalidateCache?: boolean;
        context?: QueryExecutionContext;
    }): Promise<ApiQueryResults> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        const savedChart = await this.savedChartModel.get(
            chartUuid,
            versionUuid,
        );
        const { organizationUuid, projectUuid } = savedChart;

        const [space, explore] = await Promise.all([
            this.spaceModel.getSpaceSummary(savedChart.spaceUuid),
            this.getExplore(
                user,
                projectUuid,
                savedChart.tableName,
                organizationUuid,
            ),
        ]);

        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            space.uuid,
        );

        if (
            user.ability.cannot(
                'view',
                subject('SavedChart', {
                    organizationUuid,
                    projectUuid,
                    isPrivate: space.isPrivate,
                    access,
                }),
            ) ||
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

        const { metricQuery } = savedChart;

        const queryTags: RunQueryTags = {
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            user_uuid: user.userUuid,
            chart_uuid: chartUuid,
            explore_name: savedChart.tableName,
            query_context: context,
        };

        const { cacheMetadata, rows, fields } =
            await this.runQueryAndFormatRows({
                user,
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
        user,
        chartUuid,
        dashboardFilters,
        invalidateCache,
        dashboardSorts,
        granularity,
        dashboardUuid,
        autoRefresh,
        context = QueryExecutionContext.DASHBOARD,
    }: {
        user: SessionUser;
        chartUuid: string;
        dashboardUuid: string;
        dashboardFilters: DashboardFilters;
        invalidateCache?: boolean;
        dashboardSorts: SortField[];
        granularity?: DateGranularity;
        autoRefresh?: boolean;
        context?: QueryExecutionContext;
    }): Promise<ApiChartAndResults> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        const savedChart = await this.savedChartModel.get(chartUuid);
        const { organizationUuid, projectUuid } = savedChart;

        const [space, explore] = await Promise.all([
            this.spaceModel.getSpaceSummary(savedChart.spaceUuid),
            this.getExplore(
                user,
                projectUuid,
                savedChart.tableName,
                organizationUuid,
            ),
        ]);

        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            space.uuid,
        );

        if (
            user.ability.cannot(
                'view',
                subject('SavedChart', {
                    organizationUuid,
                    projectUuid,
                    isPrivate: space.isPrivate,
                    access,
                }),
            ) ||
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

        await this.analyticsModel.addChartViewEvent(
            savedChart.uuid,
            user.userUuid,
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
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            user_uuid: user.userUuid,
            chart_uuid: chartUuid,
            dashboard_uuid: dashboardUuid,
            explore_name: explore.name,
            query_context: context,
        };

        const exploreDimensions = getDimensions(explore);

        const { cacheMetadata, rows, fields } =
            await this.runQueryAndFormatRows({
                user,
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
                granularity,
                chartUuid,
            });

        const metricQueryDimensions = [
            ...metricQueryWithDashboardOverrides.dimensions,
            ...(metricQueryWithDashboardOverrides.customDimensions ?? []),
        ];
        const hasADateDimension = exploreDimensions.find(
            (c) =>
                metricQueryDimensions.includes(getItemId(c)) && isDateItem(c),
        );

        if (hasADateDimension) {
            metricQueryWithDashboardOverrides.metadata = {
                hasADateDimension: {
                    name: hasADateDimension.name,
                    label: hasADateDimension.label,
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
        user: SessionUser,
        metricQuery: MetricQuery,
        projectUuid: string,
        exploreName: string,
        csvLimit: number | null | undefined,
        dateZoomGranularity?: DateGranularity,
        context: QueryExecutionContext = QueryExecutionContext.EXPLORE,
    ): Promise<ApiQueryResults> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { organizationUuid } =
            await this.projectModel.getWithSensitiveFields(projectUuid);

        if (
            user.ability.cannot(
                'manage',
                subject('Explore', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (
            metricQuery.customDimensions?.some(isCustomSqlDimension) &&
            user.ability.cannot(
                'manage',
                subject('CustomSql', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError(
                'User cannot run queries with custom SQL dimensions',
            );
        }

        const queryTags: RunQueryTags = {
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            user_uuid: user.userUuid,
            explore_name: exploreName,
            query_context: context,
        };

        const explore = await this.getExplore(
            user,
            projectUuid,
            exploreName,
            organizationUuid,
        );

        return this.runQueryAndFormatRows({
            user,
            metricQuery,
            projectUuid,
            exploreName,
            explore,
            csvLimit,
            context: QueryExecutionContext.EXPLORE,
            queryTags,
            granularity: dateZoomGranularity,
            chartUuid: undefined,
            invalidateCache: true, // Do not cache results for explore queries
        });
    }

    async getAsyncQueryResults({
        user,
        projectUuid,
        queryUuid,
        page = 1,
        pageSize,
    }: GetAsyncQueryResultsArgs): Promise<ApiGetAsyncQueryResults> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { organizationUuid } =
            await this.projectModel.getWithSensitiveFields(projectUuid);

        const queryHistory = await this.queryHistoryModel.get(
            queryUuid,
            projectUuid,
            user.userUuid,
        );

        if (
            user.ability.cannot(
                'view',
                subject('Project', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const { metricQuery, context, status, totalRowCount } = queryHistory;

        const defaultedPageSize =
            pageSize ??
            queryHistory.defaultPageSize ??
            DEFAULT_RESULTS_PAGE_SIZE;

        validatePagination({
            pageSize: defaultedPageSize,
            page,
            queryMaxLimit: this.lightdashConfig.query.maxPageSize,
            totalRowCount,
        });

        switch (status) {
            case QueryHistoryStatus.CANCELLED:
            case QueryHistoryStatus.PENDING:
                return {
                    status,
                    queryUuid,
                    metricQuery,
                    fields: queryHistory.fields,
                };
            case QueryHistoryStatus.ERROR:
                return {
                    status,
                    queryUuid,
                    metricQuery,
                    fields: queryHistory.fields,
                    error: queryHistory.error,
                };
            case QueryHistoryStatus.READY:
                break;
            default:
                return assertUnreachable(status, 'Unknown query status');
        }

        const explore = await this.getExplore(
            user,
            projectUuid,
            metricQuery.exploreName,
        );

        const { warehouseClient, sshTunnel } = await this._getWarehouseClient(
            projectUuid,
            await this.getWarehouseCredentials(projectUuid, user.userUuid),
            {
                snowflakeVirtualWarehouse: explore.warehouse,
                databricksCompute: explore.databricksCompute,
            },
        );

        const formatter = (row: Record<string, unknown>) =>
            formatRow(row, queryHistory.fields);

        const queryTags: RunQueryTags = {
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            user_uuid: user.userUuid,
            explore_name: metricQuery.exploreName,
            query_context: context,
        };

        const { result, durationMs } = await measureTime(
            () =>
                warehouseClient
                    .getAsyncQueryResults(
                        {
                            page,
                            pageSize: defaultedPageSize,
                            tags: queryTags,
                            queryId: queryHistory.warehouseQueryId,
                            sql: queryHistory.compiledSql,
                            queryMetadata: queryHistory.warehouseQueryMetadata,
                        },
                        formatter,
                    )
                    .catch((e) => ({ errorMessage: getErrorMessage(e) })),
            'getAsyncQueryResults',
            this.logger,
            context,
        );

        if ('errorMessage' in result) {
            this.analytics.track({
                userId: user.userUuid,
                event: 'query.error',
                properties: {
                    queryId: queryHistory.queryUuid,
                    projectId: projectUuid,
                    warehouseType: warehouseClient.credentials.type,
                },
            });
            await this.queryHistoryModel.update(
                queryHistory.queryUuid,
                projectUuid,
                user.userUuid,
                {
                    status: QueryHistoryStatus.ERROR,
                    error: result.errorMessage,
                },
            );

            return {
                status: QueryHistoryStatus.ERROR,
                error: result.errorMessage,
                queryUuid: queryHistory.queryUuid,
                metricQuery,
                fields: queryHistory.fields,
            };
        }

        const roundedDurationMs = Math.round(durationMs);

        /**
         * Update the query history with non null values
         * defaultPageSize is null when user never fetched the results - we don't send pagination params to the query execution endpoint
         * warehouseExecutionTimeMs is null when warehouse doesn't support async queries - query is only executed when user fetches results
         * totalRowCount is null when warehouse doesn't support async queries - query is only executed when user fetches results
         */
        if (
            queryHistory.defaultPageSize === null ||
            queryHistory.warehouseExecutionTimeMs === null ||
            queryHistory.totalRowCount === null
        ) {
            await this.queryHistoryModel.update(
                queryHistory.queryUuid,
                projectUuid,
                user.userUuid,
                {
                    ...(queryHistory.defaultPageSize === null
                        ? { default_page_size: defaultedPageSize }
                        : {}),
                    ...(queryHistory.warehouseExecutionTimeMs === null
                        ? {
                              warehouse_execution_time_ms: roundedDurationMs,
                          }
                        : {}),
                    ...(queryHistory.totalRowCount === null
                        ? { total_row_count: result.totalRows }
                        : {}),
                },
            );
        }

        await sshTunnel.disconnect();

        const { nextPage, previousPage } = getNextAndPreviousPage(
            page,
            result.pageCount,
        );

        this.analytics.track({
            userId: user.userUuid,
            event: 'query_page.fetched',
            properties: {
                queryId: queryHistory.queryUuid,
                projectId: projectUuid,
                warehouseType: warehouseClient.credentials.type,
                page,
                columnsCount: Object.keys(result.fields).length,
                totalRowCount: result.totalRows,
                totalPageCount: result.pageCount,
                resultsPageSize: result.rows.length,
                resultsPageExecutionMs: roundedDurationMs,
            },
        });

        return {
            rows: result.rows,
            totalPageCount: result.pageCount,
            totalResults: result.totalRows,
            queryUuid: queryHistory.queryUuid,
            fields: queryHistory.fields,
            metricQuery,
            pageSize: result.rows.length,
            page,
            nextPage,
            previousPage,
            initialQueryExecutionMs:
                queryHistory.warehouseExecutionTimeMs ?? roundedDurationMs,
            resultsPageExecutionMs: roundedDurationMs,
            status,
        };
    }

    private async executeAsyncQuery(
        args: ExecuteAsyncMetricQueryArgs & {
            queryTags: RunQueryTags;
            exploreName: string;
        },
        requestParameters: ExecuteAsyncQueryRequestParams,
    ) {
        return wrapSentryTransaction(
            'ProjectService.executeAsyncQuery',
            {},
            async (span) => {
                const {
                    user,
                    projectUuid,
                    context,
                    granularity,
                    queryTags,
                    exploreName,
                } = args;

                try {
                    if (!isUserWithOrg(user)) {
                        throw new ForbiddenError(
                            'User is not part of an organization',
                        );
                    }

                    const { organizationUuid } =
                        await this.projectModel.getSummary(projectUuid);

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

                    const explore = await this.getExplore(
                        user,
                        projectUuid,
                        exploreName,
                    );

                    const { warehouseClient, sshTunnel } =
                        await this._getWarehouseClient(
                            projectUuid,
                            await this.getWarehouseCredentials(
                                projectUuid,
                                user.userUuid,
                            ),
                            {
                                snowflakeVirtualWarehouse: explore.warehouse,
                                databricksCompute: explore.databricksCompute,
                            },
                        );

                    span.setAttribute('lightdash.projectUuid', projectUuid);
                    span.setAttribute(
                        'warehouse.type',
                        warehouseClient.credentials.type,
                    );

                    const { metricQuery } = args;
                    const userAttributes =
                        await this.userAttributesModel.getAttributeValuesForOrgMember(
                            {
                                organizationUuid,
                                userUuid: user.userUuid,
                            },
                        );

                    const emailStatus =
                        await this.emailModel.getPrimaryEmailStatus(
                            user.userUuid,
                        );
                    const intrinsicUserAttributes = emailStatus.isVerified
                        ? getIntrinsicUserAttributes(user)
                        : {};

                    const fullQuery = await ProjectService._compileQuery(
                        metricQuery,
                        explore,
                        warehouseClient,
                        intrinsicUserAttributes,
                        userAttributes,
                        this.lightdashConfig.query.timezone || 'UTC',
                        granularity,
                    );

                    const {
                        query,
                        fields: fieldsFromQuery,
                        hasExampleMetric,
                    } = fullQuery;

                    const fieldsWithOverrides: ItemsMap = Object.fromEntries(
                        Object.entries(fieldsFromQuery).map(([key, value]) => {
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

                    const fieldsMap = fieldsWithOverrides;
                    span.setAttribute('generatedSql', query);

                    const onboardingRecord =
                        await this.onboardingModel.getByOrganizationUuid(
                            user.organizationUuid,
                        );

                    if (!onboardingRecord.ranQueryAt) {
                        await this.onboardingModel.update(
                            user.organizationUuid,
                            {
                                ranQueryAt: new Date(),
                            },
                        );
                    }

                    const { queryUuid: queryHistoryUuid } =
                        await this.queryHistoryModel.create({
                            projectUuid,
                            organizationUuid,
                            createdByUserUuid: user.userUuid,
                            context,
                            fields: fieldsMap,
                            compiledSql: query,
                            requestParameters,
                            metricQuery,
                        });

                    this.analytics.track({
                        userId: user.userUuid,
                        event: 'query.executed',
                        properties: {
                            organizationId: organizationUuid,
                            projectId: projectUuid,
                            context,
                            queryId: queryHistoryUuid,
                            warehouseType: warehouseClient.credentials.type,
                            ...ProjectService.getMetricQueryExecutionProperties(
                                {
                                    metricQuery,
                                    hasExampleMetric,
                                    queryTags,
                                    granularity,
                                    chartUuid:
                                        'chartUuid' in requestParameters
                                            ? requestParameters.chartUuid
                                            : undefined,
                                    explore,
                                },
                            ),
                        },
                    });

                    // Trigger query in the background, update query history when complete
                    warehouseClient
                        .executeAsyncQuery({
                            sql: query,
                            tags: queryTags,
                        })
                        .then(
                            ({
                                queryId,
                                queryMetadata,
                                totalRows,
                                durationMs,
                            }) => {
                                this.analytics.track({
                                    userId: user.userUuid,
                                    event: 'query.ready',
                                    properties: {
                                        queryId: queryHistoryUuid,
                                        projectId: projectUuid,
                                        warehouseType:
                                            warehouseClient.credentials.type,
                                        warehouseExecutionTimeMs: durationMs,
                                        columnsCount:
                                            Object.keys(fieldsMap).length,
                                        totalRowCount: totalRows,
                                    },
                                });
                                return this.queryHistoryModel.update(
                                    queryHistoryUuid,
                                    projectUuid,
                                    user.userUuid,
                                    {
                                        warehouse_query_id: queryId,
                                        warehouse_query_metadata: queryMetadata,
                                        status: QueryHistoryStatus.READY,
                                        error: null,
                                        warehouse_execution_time_ms:
                                            durationMs !== null
                                                ? Math.round(durationMs)
                                                : null,
                                        total_row_count: totalRows,
                                    },
                                );
                            },
                        )
                        .catch((e) => {
                            this.analytics.track({
                                userId: user.userUuid,
                                event: 'query.error',
                                properties: {
                                    queryId: queryHistoryUuid,
                                    projectId: projectUuid,
                                    warehouseType:
                                        warehouseClient.credentials.type,
                                },
                            });
                            return this.queryHistoryModel.update(
                                queryHistoryUuid,
                                projectUuid,
                                user.userUuid,
                                {
                                    status: QueryHistoryStatus.ERROR,
                                    error: getErrorMessage(e),
                                },
                            );
                        })
                        .finally(() => sshTunnel.disconnect());

                    return {
                        queryUuid: queryHistoryUuid,
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

    async executeAsyncMetricQuery({
        user,
        projectUuid,
        granularity,
        context,
        metricQuery,
    }: ExecuteAsyncMetricQueryArgs): Promise<ApiExecuteAsyncQueryResults> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { organizationUuid } =
            await this.projectModel.getWithSensitiveFields(projectUuid);

        if (
            user.ability.cannot(
                'manage',
                subject('Explore', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (
            metricQuery.customDimensions?.some(isCustomSqlDimension) &&
            user.ability.cannot(
                'manage',
                subject('CustomSql', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError(
                'User cannot run queries with custom SQL dimensions',
            );
        }

        const requestParameters: ExecuteAsyncMetricQueryRequestParams = {
            context,
            query: metricQuery,
        };

        const queryTags: RunQueryTags = {
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            user_uuid: user.userUuid,
            explore_name: metricQuery.exploreName,
            query_context: context,
        };

        const { queryUuid } = await this.executeAsyncQuery(
            {
                user,
                metricQuery,
                projectUuid,
                exploreName: metricQuery.exploreName,
                context,
                queryTags,
                granularity,
            },
            requestParameters,
        );

        return {
            queryUuid,
            appliedDashboardFilters: null,
        };
    }

    async executeAsyncSavedChartQuery({
        user,
        projectUuid,
        chartUuid,
        versionUuid,
        context,
    }: ExecuteAsyncSavedChartQueryArgs): Promise<ApiExecuteAsyncQueryResults> {
        // Check user is in organization
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User does not belong to an organization');
        }

        const {
            uuid: savedChartUuid,
            organizationUuid: savedChartOrganizationUuid,
            projectUuid: savedChartProjectUuid,
            spaceUuid: savedChartSpaceUuid,
            tableName: savedChartTableName,
            metricQuery,
        } = await this.savedChartModel.get(chartUuid, versionUuid);

        // Check chart belongs to project
        if (savedChartProjectUuid !== projectUuid) {
            throw new ForbiddenError('Chart does not belong to project');
        }

        const space = await this.spaceModel.getSpaceSummary(
            savedChartSpaceUuid,
        );

        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            space.uuid,
        );

        if (
            user.ability.cannot(
                'view',
                subject('SavedChart', {
                    organizationUuid: savedChartOrganizationUuid,
                    projectUuid,
                    isPrivate: space.isPrivate,
                    access,
                }),
            ) ||
            user.ability.cannot(
                'view',
                subject('Project', {
                    organizationUuid: savedChartOrganizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        await this.analyticsModel.addChartViewEvent(
            savedChartUuid,
            user.userUuid,
        );

        const requestParameters: ExecuteAsyncSavedChartRequestParams = {
            context,
            chartUuid,
            versionUuid,
        };

        const queryTags: RunQueryTags = {
            organization_uuid: savedChartOrganizationUuid,
            project_uuid: projectUuid,
            user_uuid: user.userUuid,
            chart_uuid: chartUuid,
            explore_name: savedChartTableName,
            query_context: context,
        };

        const { queryUuid } = await this.executeAsyncQuery(
            {
                user,
                projectUuid,
                exploreName: savedChartTableName,
                context,
                queryTags,
                invalidateCache: false,
                metricQuery,
            },
            requestParameters,
        );

        return {
            queryUuid,
            appliedDashboardFilters: null,
        };
    }

    async executeAsyncDashboardChartQuery({
        user,
        projectUuid,
        chartUuid,
        dashboardUuid,
        dashboardFilters,
        dashboardSorts,
        granularity,
        context,
    }: ExecuteAsyncDashboardChartQueryArgs): Promise<ApiExecuteAsyncQueryResults> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        const savedChart = await this.savedChartModel.get(chartUuid);
        const { organizationUuid, projectUuid: savedChartProjectUuid } =
            savedChart;

        if (savedChartProjectUuid !== projectUuid) {
            throw new ForbiddenError('Dashboard does not belong to project');
        }

        const [space, explore] = await Promise.all([
            this.spaceModel.getSpaceSummary(savedChart.spaceUuid),
            this.getExplore(
                user,
                projectUuid,
                savedChart.tableName,
                organizationUuid,
            ),
        ]);

        const access = await this.spaceModel.getUserSpaceAccess(
            user.userUuid,
            space.uuid,
        );

        if (
            user.ability.cannot(
                'view',
                subject('SavedChart', {
                    organizationUuid,
                    projectUuid,
                    isPrivate: space.isPrivate,
                    access,
                }),
            ) ||
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

        await this.analyticsModel.addChartViewEvent(
            savedChart.uuid,
            user.userUuid,
        );

        const tables = Object.keys(explore.tables);
        const appliedDashboardFilters: DashboardFilters = {
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

        const exploreDimensions = getDimensions(explore);

        const metricQueryDimensions = [
            ...metricQueryWithDashboardOverrides.dimensions,
            ...(metricQueryWithDashboardOverrides.customDimensions ?? []),
        ];
        const hasADateDimension = exploreDimensions.find(
            (c) =>
                metricQueryDimensions.includes(getItemId(c)) && isDateItem(c),
        );

        if (hasADateDimension) {
            metricQueryWithDashboardOverrides.metadata = {
                hasADateDimension: {
                    name: hasADateDimension.name,
                    label: hasADateDimension.label,
                },
            };
        }

        const requestParameters: ExecuteAsyncDashboardChartRequestParams = {
            context,
            chartUuid,
            dashboardUuid,
            dashboardFilters,
            dashboardSorts,
            granularity,
        };

        const queryTags: RunQueryTags = {
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            user_uuid: user.userUuid,
            chart_uuid: chartUuid,
            dashboard_uuid: dashboardUuid,
            explore_name: explore.name,
            query_context: context,
        };

        const { queryUuid } = await this.executeAsyncQuery(
            {
                user,
                projectUuid,
                exploreName: savedChart.tableName,
                metricQuery: metricQueryWithDashboardOverrides,
                context,
                queryTags,
                invalidateCache: false,
                granularity,
            },
            requestParameters,
        );

        return {
            queryUuid,
            appliedDashboardFilters,
        };
    }

    async executeAsyncUnderlyingDataQuery({
        user,
        projectUuid,
        underlyingDataSourceQueryUuid,
        filters,
        underlyingDataItemId,
        context,
    }: ExecuteAsyncUnderlyingDataQueryArgs): Promise<ApiExecuteAsyncQueryResults> {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { organizationUuid } =
            await this.projectModel.getWithSensitiveFields(projectUuid);

        if (
            user.ability.cannot(
                'view',
                subject('UnderlyingData', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const { metricQuery } = await this.queryHistoryModel.get(
            underlyingDataSourceQueryUuid,
            projectUuid,
            user.userUuid,
        );

        if (
            metricQuery.customDimensions?.some(isCustomSqlDimension) &&
            user.ability.cannot(
                'manage',
                subject('CustomSql', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError(
                'User cannot run queries with custom SQL dimensions',
            );
        }

        const { exploreName } = metricQuery;

        const explore = await this.getExplore(user, projectUuid, exploreName);
        const { fields: metricQueryFields } = await this.compileQuery(
            user,
            metricQuery,
            projectUuid,
            exploreName,
        );

        const underlyingDataItem = underlyingDataItemId
            ? metricQueryFields[underlyingDataItemId]
            : undefined;

        const joinedTables = explore.joinedTables.map(
            (joinedTable) => joinedTable.table,
        );

        const availableTables = new Set([
            ...joinedTables,
            ...Object.values(metricQueryFields)
                .filter(isField)
                .map((field) => field.table),
        ]);

        const itemShowUnderlyingValues =
            isField(underlyingDataItem) && isMetric(underlyingDataItem)
                ? underlyingDataItem.showUnderlyingValues
                : undefined;

        const itemShowUnderlyingTable = isField(underlyingDataItem)
            ? underlyingDataItem.table
            : undefined;

        const allDimensions = getDimensions(explore);

        const availableDimensions = allDimensions.filter(
            (dimension) =>
                availableTables.has(dimension.table) &&
                !dimension.timeInterval &&
                !dimension.hidden &&
                (itemShowUnderlyingValues !== undefined
                    ? (itemShowUnderlyingValues.includes(dimension.name) &&
                          itemShowUnderlyingTable === dimension.table) ||
                      itemShowUnderlyingValues.includes(
                          `${dimension.table}.${dimension.name}`,
                      )
                    : true),
        );

        const requestParameters: ExecuteAsyncUnderlyingDataRequestParams = {
            context,
            underlyingDataSourceQueryUuid,
            filters,
            underlyingDataItemId,
        };

        const queryTags: RunQueryTags = {
            organization_uuid: organizationUuid,
            project_uuid: projectUuid,
            user_uuid: user.userUuid,
            explore_name: exploreName,
            query_context: context,
        };

        const underlyingDataMetricQuery: MetricQuery = {
            exploreName,
            dimensions: availableDimensions.map(getItemId),
            filters,
            metrics: [],
            sorts: [],
            limit: 500,
            tableCalculations: [],
            additionalMetrics: [],
        };

        const { queryUuid: underlyingDataQueryUuid } =
            await this.executeAsyncQuery(
                {
                    user,
                    metricQuery: underlyingDataMetricQuery,
                    projectUuid,
                    exploreName,
                    context,
                    queryTags,
                    invalidateCache: false,
                },
                requestParameters,
            );

        return {
            queryUuid: underlyingDataQueryUuid,
            appliedDashboardFilters: null,
        };
    }

    private async runQueryAndFormatRows({
        user,
        metricQuery,
        projectUuid,
        exploreName,
        csvLimit,
        context,
        queryTags,
        invalidateCache,
        explore: validExplore,
        granularity,
        chartUuid,
    }: {
        user: SessionUser;
        metricQuery: MetricQuery;
        projectUuid: string;
        exploreName: string;
        csvLimit: number | null | undefined;
        context: QueryExecutionContext;
        queryTags: RunQueryTags;
        invalidateCache?: boolean;
        explore?: Explore;
        granularity?: DateGranularity;
        chartUuid: string | undefined;
    }): Promise<ApiQueryResults> {
        return wrapSentryTransaction(
            'ProjectService.runQueryAndFormatRows',
            {},
            async (span) => {
                const explore =
                    validExplore ??
                    (await this.getExplore(user, projectUuid, exploreName));

                const { rows, cacheMetadata, fields } =
                    await this.runMetricQuery({
                        user,
                        metricQuery,
                        projectUuid,
                        exploreName,
                        csvLimit,
                        context,
                        queryTags,
                        invalidateCache,
                        explore,
                        granularity,
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
        user: SessionUser,
        projectUuid: string,
        exploreName: string,
        metricQuery: MetricQuery,
    ) {
        const { result } = await measureTime(
            () =>
                this.runMetricQuery({
                    user,
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
        user: SessionUser,
        chartUuid: string,
        context: QueryExecutionContext,
    ): Promise<{
        rows: Record<string, AnyType>[];
        cacheMetadata: CacheMetadata;
    }> {
        return wrapSentryTransaction(
            'getResultsForChartWithWarehouseQuery',
            {
                userUuid: user.userUuid,
                chartUuid,
            },
            async () => {
                const chart = await this.savedChartModel.get(chartUuid);
                const { metricQuery } = chart;
                const exploreId = chart.tableName;
                const queryTags: RunQueryTags = {
                    project_uuid: chart.projectUuid,
                    user_uuid: user.userUuid,
                    chart_uuid: chartUuid,
                    explore_name: exploreId,
                    query_context: context,
                };

                return this.runMetricQuery({
                    user,
                    metricQuery,
                    projectUuid: chart.projectUuid,
                    exploreName: exploreId,
                    csvLimit: undefined,
                    context,
                    chartUuid,
                    queryTags,
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
                    this.lightdashConfig.resultsCache?.resultsEnabled &&
                    !invalidateCache
                ) {
                    const cacheEntryMetadata = await this.s3CacheClient
                        .getResultsMetadata(queryHash)
                        .catch((e) => undefined); // ignore since error is tracked in s3Client

                    if (
                        cacheEntryMetadata?.LastModified &&
                        new Date().getTime() -
                            cacheEntryMetadata.LastModified.getTime() <
                            this.lightdashConfig.resultsCache
                                .cacheStateTimeSeconds *
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

                if (this.lightdashConfig.resultsCache?.resultsEnabled) {
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
        user,
        metricQuery,
        projectUuid,
        exploreName,
        csvLimit,
        context,
        queryTags,
        invalidateCache,
        explore: loadedExplore,
        granularity,
        chartUuid,
    }: {
        user: SessionUser;
        metricQuery: MetricQuery;
        projectUuid: string;
        exploreName: string;
        csvLimit: number | null | undefined;
        context: QueryExecutionContext;
        queryTags: Omit<RunQueryTags, 'query_context'>; // We already have context in the context parameter
        invalidateCache?: boolean;
        explore?: Explore;
        granularity?: DateGranularity;
        chartUuid: string | undefined; // for analytics
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
                    if (!isUserWithOrg(user)) {
                        throw new ForbiddenError(
                            'User is not part of an organization',
                        );
                    }

                    const { organizationUuid } =
                        await this.projectModel.getSummary(projectUuid);

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

                    const metricQueryWithLimit = this.metricQueryWithLimit(
                        metricQuery,
                        csvLimit,
                    );

                    const explore =
                        loadedExplore ??
                        (await this.getExplore(user, projectUuid, exploreName));

                    const { warehouseClient, sshTunnel } =
                        await this._getWarehouseClient(
                            projectUuid,
                            await this.getWarehouseCredentials(
                                projectUuid,
                                user.userUuid,
                            ),
                            {
                                snowflakeVirtualWarehouse: explore.warehouse,
                                databricksCompute: explore.databricksCompute,
                            },
                        );

                    const userAttributes =
                        await this.userAttributesModel.getAttributeValuesForOrgMember(
                            {
                                organizationUuid,
                                userUuid: user.userUuid,
                            },
                        );

                    const emailStatus =
                        await this.emailModel.getPrimaryEmailStatus(
                            user.userUuid,
                        );
                    const intrinsicUserAttributes = emailStatus.isVerified
                        ? getIntrinsicUserAttributes(user)
                        : {};

                    const fullQuery = await ProjectService._compileQuery(
                        metricQueryWithLimit,
                        explore,
                        warehouseClient,
                        intrinsicUserAttributes,
                        userAttributes,
                        this.lightdashConfig.query.timezone || 'UTC',
                        granularity,
                    );

                    const { query, hasExampleMetric } = fullQuery;

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
                            user.organizationUuid,
                        );
                    if (!onboardingRecord.ranQueryAt) {
                        await this.onboardingModel.update(
                            user.organizationUuid,
                            {
                                ranQueryAt: new Date(),
                            },
                        );
                    }

                    this.analytics.track({
                        userId: user.userUuid,
                        event: 'query.executed',
                        properties: {
                            organizationId: organizationUuid,
                            projectId: projectUuid,
                            context,
                            ...ProjectService.getMetricQueryExecutionProperties(
                                {
                                    metricQuery: metricQueryWithLimit,
                                    hasExampleMetric,
                                    queryTags,
                                    chartUuid,
                                    granularity,
                                    explore,
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
            await this.getWarehouseCredentials(projectUuid, user.userUuid),
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
            await this.getWarehouseCredentials(projectUuid, userUuid),
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

    static applyPivotToSqlQuery({
        warehouseType,
        sql,
        limit,
        indexColumn,
        valuesColumns,
        groupByColumns,
        sortBy,
    }: Pick<
        SqlRunnerPivotQueryPayload,
        | 'sql'
        | 'limit'
        | 'indexColumn'
        | 'valuesColumns'
        | 'groupByColumns'
        | 'sortBy'
    > & { warehouseType: WarehouseTypes }): string {
        if (!indexColumn) throw new ParameterError('Index column is required');
        const q = getFieldQuoteChar(warehouseType);
        const userSql = sql.replace(/;\s*$/, '');
        const groupBySelectDimensions = [
            ...(groupByColumns || []).map((col) => `${q}${col.reference}${q}`),
            `${q}${indexColumn.reference}${q}`,
        ];
        const groupBySelectMetrics = [
            ...(valuesColumns ?? []).map((col) => {
                const aggregationField = getAggregatedField(
                    warehouseType,
                    col.aggregation,
                    col.reference,
                );
                return `${aggregationField} AS ${q}${col.reference}_${col.aggregation}${q}`;
            }),
        ];
        const groupByQuery = `SELECT ${[
            ...new Set(groupBySelectDimensions), // Remove duplicate columns
            ...groupBySelectMetrics,
        ].join(', ')} FROM original_query group by ${Array.from(
            new Set(groupBySelectDimensions),
        ).join(', ')}`;

        const selectReferences = [
            indexColumn.reference,
            ...(groupByColumns || []).map((col) => `${q}${col.reference}${q}`),
            ...(valuesColumns || []).map(
                (col) => `${q}${col.reference}_${col.aggregation}${q}`,
            ),
        ];

        const orderBy: string = sortBy
            ? `ORDER BY ${sortBy
                  .map((s) => `${q}${s.reference}${q} ${s.direction}`)
                  .join(', ')}`
            : ``;

        const sortDirectionForIndexColumn =
            sortBy?.find((s) => s.reference === indexColumn.reference)
                ?.direction === SortByDirection.DESC
                ? 'DESC'
                : 'ASC';
        const pivotQuery = `SELECT ${selectReferences.join(
            ', ',
        )}, dense_rank() over (order by ${q}${
            indexColumn.reference
        }${q} ${sortDirectionForIndexColumn}) as ${q}row_index${q}, dense_rank() over (order by ${q}${
            groupByColumns?.[0]?.reference
        }${q}) as ${q}column_index${q} FROM group_by_query`;

        if (groupByColumns && groupByColumns.length > 0) {
            // Wrap the original query in a CTE
            let pivotedSql = `WITH original_query AS (${userSql}), group_by_query AS (${groupByQuery}), pivot_query AS (${pivotQuery})`;

            pivotedSql += `\nSELECT * FROM pivot_query WHERE ${q}row_index${q} <= ${
                limit ?? 500
            } and ${q}column_index${q} <= 10 order by ${q}row_index${q}, ${q}column_index${q}`;
            return pivotedSql;
        }

        let sqlQuery = `WITH original_query AS (${userSql}), group_by_query AS (${groupByQuery})`;
        sqlQuery += `\nSELECT * FROM group_by_query ${orderBy} LIMIT ${
            limit ?? 500
        } `;

        return sqlQuery;
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
        if (!indexColumn) throw new ParameterError('Index column is required');
        const { organizationUuid } = await this.projectModel.getSummary(
            projectUuid,
        );

        const warehouseCredentials = await this.getWarehouseCredentials(
            projectUuid,
            userUuid,
        );
        // Apply limit and pivot to the SQL query
        const pivotedSql = ProjectService.applyPivotToSqlQuery({
            warehouseType: warehouseCredentials.type,
            sql,
            limit,
            indexColumn,
            valuesColumns,
            groupByColumns,
            sortBy,
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

        const fileUrl = await this.downloadFileModel.streamFunction(
            this.s3Client,
        )(
            `${this.lightdashConfig.siteUrl}/api/v1/projects/${projectUuid}/sqlRunner/results`,
            async (writer) => {
                try {
                    await warehouseClient.streamQuery(
                        pivotedSql,
                        async ({ rows, fields }) => {
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
                                    currentTransformedRow = {
                                        [indexColumn.reference]:
                                            row[indexColumn.reference],
                                    };
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
            fileUrl,
            valuesColumns: processedColumns,
            indexColumn,
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
            await this.getWarehouseCredentials(projectUuid, user.userUuid),
            {
                snowflakeVirtualWarehouse: explore.warehouse,
                databricksCompute: explore.databricksCompute,
            },
        );
        const userAttributes =
            await this.userAttributesModel.getAttributeValuesForOrgMember({
                organizationUuid,
                userUuid: user.userUuid,
            });

        const emailStatus = await this.emailModel.getPrimaryEmailStatus(
            user.userUuid,
        );
        const intrinsicUserAttributes = emailStatus.isVerified
            ? getIntrinsicUserAttributes(user)
            : {};

        const { query } = await ProjectService._compileQuery(
            metricQuery,
            explore,
            warehouseClient,
            intrinsicUserAttributes,
            userAttributes,
            this.lightdashConfig.query.timezone || 'UTC',
        );
        // Add a cache_autocomplete prefix to the query hash to avoid collisions with the results cache
        const queryHashKey = metricQuery.timezone
            ? `${projectUuid}.cache_autocomplete.${query}.${metricQuery.timezone}`
            : `${projectUuid}.cache_autocomplete.${query}`;
        const queryHash = crypto
            .createHash('sha256')
            .update(queryHashKey)
            .digest('hex');

        const isCacheEnabled =
            this.lightdashConfig.resultsCache.autocompleteEnabled &&
            this.s3CacheClient.isEnabled();

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

    private async refreshAllTables(
        user: Pick<SessionUser, 'userUuid'>,
        projectUuid: string,
        requestMethod: RequestMethod,
    ): Promise<{
        explores: (Explore | ExploreError)[];
        adapter: ProjectAdapter;
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
                            return (
                                acc +
                                getMetrics(explore).filter(
                                    ({ isAutoGenerated }) => !isAutoGenerated,
                                ).length
                            );
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

            return { explores, adapter };
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
                        const { explores, adapter } =
                            await this.refreshAllTables(
                                user,
                                projectUuid,
                                requestMethod,
                            );
                        const trackingParams = {
                            projectUuid,
                            organizationUuid,
                            userUuid: user.userUuid,
                        };
                        const lightdashProjectConfig =
                            await adapter.getLightdashProjectConfig(
                                trackingParams,
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
                        return this.saveExploresToCacheAndIndexCatalog(
                            user.userUuid,
                            projectUuid,
                            explores,
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

    async getAllExploresSummary(
        user: SessionUser,
        projectUuid: string,
        filtered: boolean,
        includeErrors: boolean = true,
    ): Promise<SummaryExplore[]> {
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
        );
        const explores = Object.values(cachedExplores);

        if (!explores) {
            return [];
        }
        const userAttributes =
            await this.userAttributesModel.getAttributeValuesForOrgMember({
                organizationUuid,
                userUuid: user.userUuid,
            });

        const allExploreSummaries = explores.reduce<SummaryExplore[]>(
            (acc, explore) => {
                if (isExploreError(explore)) {
                    return includeErrors
                        ? [
                              ...acc,
                              {
                                  name: explore.name,
                                  label: explore.label,
                                  tags: explore.tags,
                                  groupLabel: explore.groupLabel,
                                  errors: explore.errors,
                                  databaseName:
                                      explore.baseTable &&
                                      explore.tables?.[explore.baseTable]
                                          ?.database,
                                  schemaName:
                                      explore.baseTable &&
                                      explore.tables?.[explore.baseTable]
                                          ?.schema,
                                  description:
                                      explore.baseTable &&
                                      explore.tables?.[explore.baseTable]
                                          ?.description,
                              },
                          ]
                        : acc;
                }
                if (
                    doesExploreMatchRequiredAttributes(explore, userAttributes)
                ) {
                    return [
                        ...acc,
                        {
                            name: explore.name,
                            label: explore.label,
                            tags: explore.tags,
                            groupLabel: explore.groupLabel,
                            databaseName:
                                explore.tables[explore.baseTable].database,
                            schemaName:
                                explore.tables[explore.baseTable].schema,
                            description:
                                explore.tables[explore.baseTable].description,
                            type: explore.type ?? ExploreType.DEFAULT,
                        },
                    ];
                }
                return acc;
            },
            [],
        );

        if (filtered) {
            const {
                tableSelection: { type, value },
            } = await this.getTablesConfiguration(user, projectUuid);
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
        user: SessionUser,
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
                    user,
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

    private async findExplores({
        user,
        projectUuid,
        exploreNames,
        organizationUuid,
    }: {
        user: SessionUser;
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
                if (
                    user.ability.cannot(
                        'view',
                        subject('Project', {
                            organizationUuid: project.organizationUuid,
                            projectUuid,
                        }),
                    )
                ) {
                    throw new ForbiddenError();
                }
                const explores = await this.projectModel.findExploresFromCache(
                    projectUuid,
                    exploreNames,
                );

                const userAttributes =
                    await this.userAttributesModel.getAttributeValuesForOrgMember(
                        {
                            organizationUuid: project.organizationUuid,
                            userUuid: user.userUuid,
                        },
                    );

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

        const credentials = await this.getWarehouseCredentials(
            projectUuid,
            user.userUuid,
        );

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

        const credentials = await this.getWarehouseCredentials(
            projectUuid,
            user.userUuid,
        );

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
        const credentials = await this.getWarehouseCredentials(
            projectUuid,
            user.userUuid,
        );

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
        if (!database) {
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
        user: SessionUser,
        projectUuid: string,
    ): Promise<TablesConfiguration> {
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
        user: SessionUser,
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
                    user.userUuid,
                    space.uuid,
                );

                if (
                    user.ability.cannot(
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
                    user,
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
        user: SessionUser,
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
                            user,
                            projectUuid: savedCharts[0].projectUuid, // TODO: route should be updated to be project/dashboard specific. For now we pick it from first chart as they all should be from the same project
                            exploreNames: savedCharts.map(
                                (chart) => chart.tableName,
                            ),
                            organizationUuid: user.organizationUuid,
                        }),
                        this.spaceModel.getUserSpacesAccess(
                            user.userUuid,
                            uniqueSpaceUuids,
                        ),
                    ]);

                return savedCharts.map((savedChart) => {
                    const spaceAccess = spaceAccessMap.get(
                        savedChart.spaceUuid,
                    );

                    if (
                        user.ability.cannot(
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
        const savedSemanticViewerCharts =
            await this.spaceModel.getSpaceSemanticViewerCharts(
                allowedSpaceUuids,
            );

        return [
            ...savedQueries,
            ...savedSqlCharts,
            ...savedSemanticViewerCharts,
        ];
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
        if (
            user.ability.cannot(
                'view',
                subject('Project', {
                    organizationUuid: user.organizationUuid,
                    projectUuid,
                }),
            )
        ) {
            throw new ForbiddenError();
        }

        const spaces = await this.spaceModel.find({ projectUuid });
        const allowedSpaces = spaces.filter(
            (space) =>
                space.projectUuid === projectUuid &&
                hasDirectAccessToSpace(user, space), // NOTE: We don't check for admin access to the space - exclude private spaces from this panel if admin
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
        const mostPopularSemanticViewerCharts =
            await this.spaceModel.getSpaceSemanticViewerCharts(
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
            ...mostPopularSemanticViewerCharts,
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
        const recentlyUpdatedSemanticViewerCharts =
            await this.spaceModel.getSpaceSemanticViewerCharts(
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
            ...recentlyUpdatedSemanticViewerCharts,
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
        },
        context: RequestMethod,
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
        const previewData: CreateProject = {
            name: data.name,
            type: ProjectType.PREVIEW,
            warehouseConnection: project.warehouseConnection,
            dbtConnection: project.dbtConnection,
            upstreamProjectUuid: data.copyContent ? projectUuid : undefined,
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
        await this.scheduleCompileProject(
            user,
            previewProject.project.projectUuid,
            context,
            true, // Skip permission check
        );
        return previewProject.project.projectUuid;
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
        user: SessionUser,
        explore: Explore,
        metricQuery: MetricQuery,
        organizationUuid: string,
        warehouseClient: WarehouseClient,
    ) {
        const userAttributes =
            await this.userAttributesModel.getAttributeValuesForOrgMember({
                organizationUuid,
                userUuid: user.userUuid,
            });

        const emailStatus = await this.emailModel.getPrimaryEmailStatus(
            user.userUuid,
        );
        const intrinsicUserAttributes = emailStatus.isVerified
            ? getIntrinsicUserAttributes(user)
            : {};

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

        const { query } = await ProjectService._compileQuery(
            totalQuery,
            explore,
            warehouseClient,
            intrinsicUserAttributes,
            userAttributes,
            this.lightdashConfig.query.timezone || 'UTC',
        );

        return { query, totalQuery };
    }

    async _calculateTotal(
        user: SessionUser,
        projectUuid: string,
        exploreName: string,
        metricQuery: MetricQuery,
        organizationUuid: string,
    ) {
        const explore = await this.getExplore(
            user,
            projectUuid,
            exploreName,
            organizationUuid,
        );

        const { warehouseClient, sshTunnel } = await this._getWarehouseClient(
            projectUuid,
            await this.getWarehouseCredentials(projectUuid, user.userUuid),
            {
                snowflakeVirtualWarehouse: explore.warehouse,
                databricksCompute: explore.databricksCompute,
            },
        );

        const { query } = await this._getCalculateTotalQuery(
            user,
            explore,
            metricQuery,
            organizationUuid,
            warehouseClient,
        );

        const queryTags: RunQueryTags = {
            organization_uuid: user.organizationUuid,
            project_uuid: projectUuid,
            user_uuid: user.userUuid,
            explore_name: exploreName,
            query_context: QueryExecutionContext.CALCULATE_TOTAL,
        };

        const { rows } = await warehouseClient.runQuery(query, queryTags);
        await sshTunnel.disconnect();
        return { row: rows[0] };
    }

    async _calculateTotalFromCacheOrWarehouse(
        user: SessionUser,
        projectUuid: string,
        explore: Explore,
        metricQuery: MetricQuery,
        invalidateCache: boolean,
        organizationUuid: string,
    ) {
        const { warehouseClient, sshTunnel } = await this._getWarehouseClient(
            projectUuid,
            await this.getWarehouseCredentials(projectUuid, user.userUuid),
            {
                snowflakeVirtualWarehouse: explore.warehouse,
                databricksCompute: explore.databricksCompute,
            },
        );

        const { query, totalQuery } = await this._getCalculateTotalQuery(
            user,
            explore,
            metricQuery,
            organizationUuid,
            warehouseClient,
        );

        const queryTags: RunQueryTags = {
            organization_uuid: user.organizationUuid,
            project_uuid: projectUuid,
            user_uuid: user.userUuid,
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
    }

    async calculateTotalFromSavedChart(
        user: SessionUser,
        chartUuid: string,
        dashboardFilters: DashboardFilters,
        invalidateCache: boolean = false,
    ) {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }

        const savedChart = await this.savedChartModel.get(
            chartUuid,
            undefined, // VersionUuid
        );
        const { organizationUuid, projectUuid } = savedChart;

        const explore = await this.getExplore(
            user,
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
            user.userUuid,
            savedChart.spaceUuid,
        );

        if (
            user.ability.cannot(
                'view',
                subject('SavedChart', {
                    organizationUuid,
                    projectUuid,
                    isPrivate: space.isPrivate,
                    access,
                }),
            ) ||
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

        const results = await this._calculateTotalFromCacheOrWarehouse(
            user,
            projectUuid,
            explore,
            metricQuery,
            invalidateCache,
            savedChart.organizationUuid,
        );
        return results.row;
    }

    async calculateTotalFromQuery(
        user: SessionUser,
        projectUuid: string,
        data: CalculateTotalFromQuery,
    ) {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { organizationUuid } =
            await this.projectModel.getWithSensitiveFields(projectUuid);

        if (
            user.ability.cannot(
                'manage',
                subject('Explore', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (
            data.metricQuery.customDimensions?.some(isCustomSqlDimension) &&
            user.ability.cannot(
                'manage',
                subject('CustomSql', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError(
                'User cannot run queries with custom SQL dimensions',
            );
        }

        const results = await this._calculateTotal(
            user,
            projectUuid,
            data.explore,
            data.metricQuery,
            organizationUuid,
        );
        return results.row;
    }

    async _calculateSubtotals(
        user: SessionUser,
        projectUuid: string,
        data: CalculateSubtotalsFromQuery,
        organizationUuid: string,
    ) {
        const {
            explore: exploreName,
            metricQuery,
            columnOrder,
            pivotDimensions,
        } = data;

        const explore = await this.getExplore(
            user,
            projectUuid,
            exploreName,
            organizationUuid,
        );

        // Order dimensions according to columnOrder
        const orderedDimensions = metricQuery.dimensions.sort((a, b) => {
            const aIndex = columnOrder.indexOf(a);
            const bIndex = columnOrder.indexOf(b);
            // Handle cases where dimension isn't in columnOrder
            if (aIndex === -1) return 1;
            if (bIndex === -1) return -1;
            return aIndex - bIndex;
        });

        // Pivot dimensions always need to be in the query, therefore we need to remove them before calculating the subtotal groupings by order
        const orderedDimensionsWithoutPivot = orderedDimensions.filter(
            (dimension) => !pivotDimensions?.includes(dimension),
        );

        // Remove the last dimension since it will not be used for subtotals, would produce the most detailed row
        const dimensionsToSubtotal = orderedDimensionsWithoutPivot.slice(0, -1);

        // Create a list of all the dimension groups to subtotal, starting with the first dimension, then the first two dimensions, then the first three dimensions, etc.
        const dimensionGroupsToSubtotal = dimensionsToSubtotal.map(
            (dimension, index) => {
                if (index === 0) {
                    return [dimension];
                }

                return [...dimensionsToSubtotal.slice(0, index), dimension];
            },
        );

        this.analytics.track({
            userId: user.userUuid,
            event: 'query.subtotal',
            properties: {
                context: QueryExecutionContext.CALCULATE_SUBTOTAL,
                organizationId: organizationUuid,
                projectId: projectUuid,
                exploreName,
                subtotalDimensionGroups: dimensionGroupsToSubtotal.map(
                    (group) => group.join(','),
                ),
                subtotalQueryCount: dimensionGroupsToSubtotal.length,
            },
        });

        const queryTags: RunQueryTags = {
            organization_uuid: user.organizationUuid,
            project_uuid: projectUuid,
            user_uuid: user.userUuid,
            explore_name: exploreName,
            query_context: QueryExecutionContext.CALCULATE_SUBTOTAL,
        };

        // Run the query for each dimension group and format the raw rows, this is needed because we apply raw formatting to date dimensions, and we need to compare values in the same format in the frontend
        const runQueryAndFormatRaw = async (
            subtotalMetricQuery: MetricQuery,
        ) => {
            const { rows, fields } = await this.runMetricQuery({
                user,
                metricQuery: subtotalMetricQuery,
                explore,
                queryTags,
                projectUuid,
                exploreName,
                context: QueryExecutionContext.CALCULATE_SUBTOTAL,
                csvLimit: null,
                chartUuid: undefined,
            });

            return formatRawRows(rows, fields);
        };

        const subtotalsPromises = dimensionGroupsToSubtotal.map(
            async (subtotalDimensions) => {
                let subtotals: Record<string, unknown>[] = [];

                try {
                    subtotals = await runQueryAndFormatRaw({
                        ...metricQuery,
                        dimensions: [
                            ...subtotalDimensions,
                            ...(pivotDimensions || []), // we always need to include the pivot dimensions in the subtotal query
                        ],
                    });
                } catch (e) {
                    this.logger.error(
                        `Error running subtotal query for dimensions ${subtotalDimensions.join(
                            ',',
                        )}`,
                    );
                }

                return [getSubtotalKey(subtotalDimensions), subtotals];
            },
        );

        const subtotalsEntries = await Promise.all(subtotalsPromises);
        return Object.fromEntries(subtotalsEntries);
    }

    async calculateSubtotalsFromQuery(
        user: SessionUser,
        projectUuid: string,
        data: CalculateSubtotalsFromQuery,
    ) {
        if (!isUserWithOrg(user)) {
            throw new ForbiddenError('User is not part of an organization');
        }
        const { organizationUuid } =
            await this.projectModel.getWithSensitiveFields(projectUuid);

        if (
            user.ability.cannot(
                'manage',
                subject('Explore', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        if (
            data.metricQuery.customDimensions?.some(isCustomSqlDimension) &&
            user.ability.cannot(
                'manage',
                subject('CustomSql', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError(
                'User cannot run queries with custom SQL dimensions',
            );
        }

        // Reuse the _calculateTotal method by passing the explore, metricQuery, and organizationUuid
        return this._calculateSubtotals(
            user,
            projectUuid,
            data,
            organizationUuid,
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
        user: SessionUser,
        projectUuid: string,
        payload: CreateVirtualViewPayload,
    ) {
        const { organizationUuid } =
            await this.projectModel.getWithSensitiveFields(projectUuid);

        if (
            user.ability.cannot(
                'manage',
                subject('VirtualView', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }
        const explore = await this.findExplores({
            user,
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
            await this.getWarehouseCredentials(projectUuid, user.userUuid),
        );
        const virtualView = await this.projectModel.createVirtualView(
            projectUuid,
            payload,
            warehouseClient,
        );

        this.analytics.track({
            event: 'virtual_view.created',
            userId: user.userUuid,
            properties: {
                virtualViewId: virtualView.name,
                name: virtualView.label,
                projectId: projectUuid,
                organizationId: organizationUuid,
            },
        });

        return { name: virtualView.name };
    }

    async updateSemanticLayerConnection(
        user: SessionUser,
        projectUuid: string,
        payload: SemanticLayerConnectionUpdate,
    ) {
        const project = await this.projectModel.getSummary(projectUuid);

        if (user.ability.cannot('update', subject('Project', project))) {
            throw new ForbiddenError();
        }

        const updatedProject =
            await this.projectModel.updateSemanticLayerConnection(
                projectUuid,
                payload,
            );

        return updatedProject;
    }

    async deleteSemanticLayerConnection(
        user: SessionUser,
        projectUuid: string,
    ) {
        const project = await this.projectModel.getSummary(projectUuid);

        if (user.ability.cannot('update', subject('Project', project))) {
            throw new ForbiddenError();
        }

        const updatedProject =
            await this.projectModel.deleteSemanticLayerConnection(projectUuid);

        return updatedProject;
    }

    async updateVirtualView(
        user: SessionUser,
        projectUuid: string,
        exploreName: string,
        payload: UpdateVirtualViewPayload,
    ) {
        const virtualView = await this.findExplores({
            user,
            projectUuid,
            exploreNames: [exploreName],
        });

        if (!virtualView) {
            throw new NotFoundError('Virtual view not found');
        }

        const { organizationUuid } =
            await this.projectModel.getWithSensitiveFields(projectUuid);

        if (
            user.ability.cannot(
                'manage',
                subject('VirtualView', { organizationUuid, projectUuid }),
            )
        ) {
            throw new ForbiddenError();
        }

        const { warehouseClient } = await this._getWarehouseClient(
            projectUuid,
            await this.getWarehouseCredentials(projectUuid, user.userUuid),
        );

        const updatedExplore = await this.projectModel.updateVirtualView(
            projectUuid,
            exploreName,
            payload,
            warehouseClient,
        );

        this.analytics.track({
            event: 'virtual_view.updated',
            userId: user.userUuid,
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
            await this.projectModel.getWithSensitiveFields(projectUuid);

        if (
            user.ability.cannot(
                'manage',
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
}
