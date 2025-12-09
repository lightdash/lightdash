import { MissingConfigError } from '@lightdash/common';
import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { ClientRepository } from '../clients/ClientRepository';
import { LightdashConfig } from '../config/parseConfig';
import { ModelRepository } from '../models/ModelRepository';
import PrometheusMetrics from '../prometheus';
import type { UtilRepository } from '../utils/UtilRepository';
import { AnalyticsService } from './AnalyticsService/AnalyticsService';
import { AsyncQueryService } from './AsyncQueryService/AsyncQueryService';
import { BaseService } from './BaseService';
import { CatalogService } from './CatalogService/CatalogService';
import { ChangesetService } from './ChangesetService';
import { CoderService } from './CoderService/CoderService';
import { CommentService } from './CommentService/CommentService';
import { ContentService } from './ContentService/ContentService';
import { CsvService } from './CsvService/CsvService';
import { DashboardService } from './DashboardService/DashboardService';
import { DownloadFileService } from './DownloadFileService/DownloadFileService';
import { FeatureFlagService } from './FeatureFlag/FeatureFlagService';
import { GdriveService } from './GdriveService/GdriveService';
import { GithubAppService } from './GithubAppService/GithubAppService';
import { GitIntegrationService } from './GitIntegrationService/GitIntegrationService';
import { GitlabAppService } from './GitlabAppService/GitlabAppService';
import { GroupsService } from './GroupService';
import { HealthService } from './HealthService/HealthService';
import { LightdashAnalyticsService } from './LightdashAnalyticsService/LightdashAnalyticsService';
import { MetricsExplorerService } from './MetricsExplorerService/MetricsExplorerService';
import { NotificationsService } from './NotificationsService/NotificationsService';
import { OAuthService } from './OAuthService/OAuthService';
import { OrganizationService } from './OrganizationService/OrganizationService';
import { PermissionsService } from './PermissionsService/PermissionsService';
import { PersonalAccessTokenService } from './PersonalAccessTokenService';
import { PinningService } from './PinningService/PinningService';
import { PivotTableService } from './PivotTableService/PivotTableService';
import { ProjectCompileLogService } from './ProjectCompileLogService/ProjectCompileLogService';
import { ProjectParametersService } from './ProjectParametersService';
import { ProjectService } from './ProjectService/ProjectService';
import { PromoteService } from './PromoteService/PromoteService';
import { RenameService } from './RenameService/RenameService';
import { RolesService } from './RolesService/RolesService';
import { SavedChartService } from './SavedChartsService/SavedChartService';
import { SavedSqlService } from './SavedSqlService/SavedSqlService';
import { SchedulerService } from './SchedulerService/SchedulerService';
import { SearchService } from './SearchService/SearchService';
import { ShareService } from './ShareService/ShareService';
import { SlackIntegrationService } from './SlackIntegrationService/SlackIntegrationService';
import { SlackService } from './SlackService/SlackService';
import { SpaceService } from './SpaceService/SpaceService';
import { SpotlightService } from './SpotlightService/SpotlightService';
import { SshKeyPairService } from './SshKeyPairService';
import { UnfurlService } from './UnfurlService/UnfurlService';
import { UserAttributesService } from './UserAttributesService/UserAttributesService';
import { UserService } from './UserService';
import { ValidationService } from './ValidationService/ValidationService';
/**
 * Interface outlining all services available under the `ServiceRepository`. Add new services to
 * this list (in alphabetical order, please!) to have typescript help ensure you've updated the
 * service repository correctly.
 */
interface ServiceManifest {
    analyticsService: AnalyticsService;
    commentService: CommentService;
    csvService: CsvService;
    dashboardService: DashboardService;
    downloadFileService: DownloadFileService;
    gitIntegrationService: GitIntegrationService;
    githubAppService: GithubAppService;
    gitlabAppService: GitlabAppService;
    gdriveService: GdriveService;
    groupService: GroupsService;
    healthService: HealthService;
    notificationService: NotificationsService;
    oauthService: OAuthService;

    organizationService: OrganizationService;
    personalAccessTokenService: PersonalAccessTokenService;
    pinningService: PinningService;
    pivotTableService: PivotTableService;
    projectService: ProjectService;
    savedChartService: SavedChartService;
    schedulerService: SchedulerService;
    searchService: SearchService;
    shareService: ShareService;
    slackIntegrationService: SlackIntegrationService;
    sshKeyPairService: SshKeyPairService;
    spaceService: SpaceService;
    unfurlService: UnfurlService;
    userAttributesService: UserAttributesService;
    userService: UserService;
    validationService: ValidationService;
    catalogService: CatalogService;
    metricsExplorerService: MetricsExplorerService;
    promoteService: PromoteService;
    savedSqlService: SavedSqlService;
    contentService: ContentService;
    coderService: CoderService;
    featureFlagService: FeatureFlagService;
    spotlightService: SpotlightService;
    lightdashAnalyticsService: LightdashAnalyticsService;
    asyncQueryService: AsyncQueryService;
    renameService: RenameService;
    projectParametersService: ProjectParametersService;
    projectCompileLogService: ProjectCompileLogService;
    permissionsService: PermissionsService;
    /** An implementation signature for these services are not available at this stage */
    embedService: unknown;
    aiService: unknown;
    aiAgentService: unknown;
    aiAgentAdminService: unknown;
    aiOrganizationSettingsService: unknown;
    scimService: unknown;
    supportService: unknown;
    cacheService: unknown;
    serviceAccountService: unknown;
    instanceConfigurationService: unknown;
    mcpService: unknown;
    rolesService: RolesService;
    slackService: SlackService;
    changesetService: ChangesetService;
    organizationWarehouseCredentialsService: unknown;
}

/**
 * Enforces the presence of getter methods for all services declared in the manifest.
 */
type ServiceFactoryMethod<T extends ServiceManifest> = {
    [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

type ServiceProvider<T extends ServiceManifest> = (providerArgs: {
    repository: ServiceRepository;
    context: OperationContext;
    models: ModelRepository;
    utils: UtilRepository;
    clients: ClientRepository;
    prometheusMetrics?: PrometheusMetrics;
}) => T[keyof T];

/**
 * Structure for describing service providers:
 *
 *   <serviceName> -> providerMethod
 */
export type ServiceProviderMap<T extends ServiceManifest = ServiceManifest> =
    Partial<{
        [K in keyof T]: ServiceProvider<T>;
    }>;

/**
 * Placeholder ServiceRepository context.
 *
 * The OperationContext object is created alongside the ServiceRepository, and shares
 * its lifetime with a unit of work/single operation - for example, a single
 * request thread.
 *
 * OperationContext can be subclassed to provide additional functionality for specific
 * types of operations, if necessary.
 */
export class OperationContext extends BaseService {
    public readonly operationId: string;

    public readonly lightdashAnalytics: LightdashAnalytics;

    public readonly lightdashConfig: LightdashConfig;

    constructor({
        operationId,
        lightdashAnalytics,
        lightdashConfig,
    }: {
        operationId: string;
        lightdashAnalytics: LightdashAnalytics;
        lightdashConfig: LightdashConfig;
    }) {
        super();
        this.operationId = operationId;
        this.lightdashAnalytics = lightdashAnalytics;
        this.lightdashConfig = lightdashConfig;
    }
}

/**
 * Intermediate abstract class used to enforce service factory methods via the `ServiceFactoryMethod`
 * type. We need this extra thin layer to ensure we are statically aware of all members.
 */
abstract class ServiceRepositoryBase {
    /**
     * Container for service provider overrides. Providers can be defined when instancing
     * the service repository, and take precedence when instancing the given service.
     *
     * Providers receive an instance of the current OperationContext, and the parent
     * ServiceRepository instance.
     *
     * new ServiceRepository({
     *    serviceProviders: {
     *      projectService: ({ repository, context }) => {
     *          return new ProjectServiceOverride(...);
     *      }
     *    }
     * })
     *
     * NOTE: This exact implementation is temporary, and is likely to be adjusted soon
     * as part of the dependency injection rollout.
     */
    protected providers: ServiceProviderMap;

    /**
     * See @type OperationContext
     */
    protected readonly context: OperationContext;

    protected clients: ClientRepository;

    protected models: ModelRepository;

    protected readonly utils: UtilRepository;

    protected readonly prometheusMetrics?: PrometheusMetrics;

    constructor({
        serviceProviders,
        context,
        clients,
        models,
        utils,
        prometheusMetrics,
    }: {
        serviceProviders?: ServiceProviderMap<ServiceManifest>;
        context: OperationContext;
        clients: ClientRepository;
        models: ModelRepository;
        utils: UtilRepository;
        prometheusMetrics?: PrometheusMetrics;
    }) {
        this.providers = serviceProviders ?? {};
        this.context = context;
        this.clients = clients;
        this.models = models;
        this.utils = utils;
        this.prometheusMetrics = prometheusMetrics;
    }
}

/**
 * Bare service repository class, which acts as a container for all existing
 * services, and as a point to share instantiation and common logic.
 *
 * If you need to access a service, you should do it through an instance of this
 * repository - ideally one that you accessed through a controller, or otherwise
 * via dependency injection.
 *
 */
export class ServiceRepository
    extends ServiceRepositoryBase
    implements ServiceFactoryMethod<ServiceManifest>
{
    /**
     * Holds memoized instances of services after their initial instantiation:
     */
    protected serviceInstances: Partial<ServiceManifest> = {};

    public getAnalyticsService(): AnalyticsService {
        return this.getService(
            'analyticsService',
            () =>
                new AnalyticsService({
                    analytics: this.context.lightdashAnalytics,
                    analyticsModel: this.models.getAnalyticsModel(),
                    projectModel: this.models.getProjectModel(),
                    csvService: this.getCsvService(),
                }),
        );
    }

    public getCommentService(): CommentService {
        return this.getService(
            'commentService',
            () =>
                new CommentService({
                    analytics: this.context.lightdashAnalytics,
                    dashboardModel: this.models.getDashboardModel(),
                    spaceModel: this.models.getSpaceModel(),
                    commentModel: this.models.getCommentModel(),
                    notificationsModel: this.models.getNotificationsModel(),
                    userModel: this.models.getUserModel(),
                    featureFlagModel: this.models.getFeatureFlagModel(),
                }),
        );
    }

    public getCsvService(): CsvService {
        return this.getService(
            'csvService',
            () =>
                new CsvService({
                    lightdashConfig: this.context.lightdashConfig,
                    analytics: this.context.lightdashAnalytics,
                    projectService: this.getProjectService(),
                    userModel: this.models.getUserModel(),
                    s3Client: this.clients.getS3Client(),
                    dashboardModel: this.models.getDashboardModel(),
                    savedChartModel: this.models.getSavedChartModel(),
                    savedSqlModel: this.models.getSavedSqlModel(),
                    downloadFileModel: this.models.getDownloadFileModel(),
                    schedulerClient: this.clients.getSchedulerClient(),
                    projectModel: this.models.getProjectModel(),
                    pivotTableService: this.getPivotTableService(),
                }),
        );
    }

    public getDashboardService(): DashboardService {
        return this.getService(
            'dashboardService',
            () =>
                new DashboardService({
                    analytics: this.context.lightdashAnalytics,
                    dashboardModel: this.models.getDashboardModel(),
                    spaceModel: this.models.getSpaceModel(),
                    analyticsModel: this.models.getAnalyticsModel(),
                    pinnedListModel: this.models.getPinnedListModel(),
                    schedulerModel: this.models.getSchedulerModel(),
                    savedChartModel: this.models.getSavedChartModel(),
                    savedChartService: this.getSavedChartService(),
                    projectModel: this.models.getProjectModel(),
                    schedulerClient: this.clients.getSchedulerClient(),
                    slackClient: this.clients.getSlackClient(),
                    catalogModel: this.models.getCatalogModel(),
                }),
        );
    }

    public getDownloadFileService(): DownloadFileService {
        return this.getService(
            'downloadFileService',
            () =>
                new DownloadFileService({
                    lightdashConfig: this.context.lightdashConfig,
                    downloadFileModel: this.models.getDownloadFileModel(),
                }),
        );
    }

    public getGitIntegrationService(): GitIntegrationService {
        return this.getService(
            'gitIntegrationService',
            () =>
                new GitIntegrationService({
                    lightdashConfig: this.context.lightdashConfig,
                    savedChartModel: this.models.getSavedChartModel(),
                    projectModel: this.models.getProjectModel(),
                    spaceModel: this.models.getSpaceModel(),
                    githubAppInstallationsModel:
                        this.models.getGithubAppInstallationsModel(),
                    analytics: this.context.lightdashAnalytics,
                }),
        );
    }

    public getGithubAppService(): GithubAppService {
        return this.getService(
            'githubAppService',
            () =>
                new GithubAppService({
                    githubAppInstallationsModel:
                        this.models.getGithubAppInstallationsModel(),
                    userModel: this.models.getUserModel(),
                    lightdashConfig: this.context.lightdashConfig,
                    analytics: this.context.lightdashAnalytics,
                }),
        );
    }

    public getGitlabAppService(): GitlabAppService {
        return this.getService(
            'gitlabAppService',
            () =>
                new GitlabAppService({
                    gitlabAppInstallationsModel:
                        this.models.getGitlabAppInstallationsModel(),
                    userModel: this.models.getUserModel(),
                    lightdashConfig: this.context.lightdashConfig,
                    analytics: this.context.lightdashAnalytics,
                }),
        );
    }

    public getGdriveService(): GdriveService {
        return this.getService(
            'gdriveService',
            () =>
                new GdriveService({
                    lightdashConfig: this.context.lightdashConfig,
                    projectService: this.getProjectService(),
                    userModel: this.models.getUserModel(),
                    dashboardModel: this.models.getDashboardModel(),
                    savedChartModel: this.models.getSavedChartModel(),
                    schedulerClient: this.clients.getSchedulerClient(),
                    projectModel: this.models.getProjectModel(),
                }),
        );
    }

    public getGroupService(): GroupsService {
        return this.getService(
            'groupService',
            () =>
                new GroupsService({
                    analytics: this.context.lightdashAnalytics,
                    groupsModel: this.models.getGroupsModel(),
                    projectModel: this.models.getProjectModel(),
                    featureFlagService: this.getFeatureFlagService(),
                }),
        );
    }

    public getHealthService(): HealthService {
        return this.getService(
            'healthService',
            () =>
                new HealthService({
                    lightdashConfig: this.context.lightdashConfig,
                    organizationModel: this.models.getOrganizationModel(),
                    migrationModel: this.models.getMigrationModel(),
                }),
        );
    }

    public getNotificationService(): NotificationsService {
        return this.getService(
            'notificationService',
            () =>
                new NotificationsService({
                    notificationsModel: this.models.getNotificationsModel(),
                }),
        );
    }

    public getOauthService(): OAuthService {
        return this.getService(
            'oauthService',
            () =>
                new OAuthService({
                    userModel: this.models.getUserModel(),
                    oauthModel: this.models.getOauthModel(),
                    lightdashConfig: this.context.lightdashConfig,
                }),
        );
    }

    public getOrganizationService(): OrganizationService {
        return this.getService(
            'organizationService',
            () =>
                new OrganizationService({
                    lightdashConfig: this.context.lightdashConfig,
                    analytics: this.context.lightdashAnalytics,
                    organizationModel: this.models.getOrganizationModel(),
                    projectModel: this.models.getProjectModel(),
                    onboardingModel: this.models.getOnboardingModel(),
                    organizationMemberProfileModel:
                        this.models.getOrganizationMemberProfileModel(),
                    userModel: this.models.getUserModel(),
                    organizationAllowedEmailDomainsModel:
                        this.models.getOrganizationAllowedEmailDomainsModel(),
                    groupsModel: this.models.getGroupsModel(),
                }),
        );
    }

    public getPermissionsService(): PermissionsService {
        return this.getService(
            'permissionsService',
            () =>
                new PermissionsService({
                    dashboardModel: this.models.getDashboardModel(),
                }),
        );
    }

    public getPersonalAccessTokenService(): PersonalAccessTokenService {
        return this.getService(
            'personalAccessTokenService',
            () =>
                new PersonalAccessTokenService({
                    lightdashConfig: this.context.lightdashConfig,
                    analytics: this.context.lightdashAnalytics,
                    personalAccessTokenModel:
                        this.models.getPersonalAccessTokenModel(),
                }),
        );
    }

    public getPinningService(): PinningService {
        return this.getService(
            'pinningService',
            () =>
                new PinningService({
                    dashboardModel: this.models.getDashboardModel(),
                    savedChartModel: this.models.getSavedChartModel(),
                    spaceModel: this.models.getSpaceModel(),
                    pinnedListModel: this.models.getPinnedListModel(),
                    resourceViewItemModel:
                        this.models.getResourceViewItemModel(),
                    projectModel: this.models.getProjectModel(),
                }),
        );
    }

    public getPivotTableService(): PivotTableService {
        return this.getService(
            'pivotTableService',
            () =>
                new PivotTableService({
                    lightdashConfig: this.context.lightdashConfig,
                    s3Client: this.clients.getS3Client(),
                    downloadFileModel: this.models.getDownloadFileModel(),
                }),
        );
    }

    public getProjectService(): ProjectService {
        return this.getService(
            'projectService',
            () =>
                new ProjectService({
                    lightdashConfig: this.context.lightdashConfig,
                    analytics: this.context.lightdashAnalytics,
                    projectModel: this.models.getProjectModel(),
                    onboardingModel: this.models.getOnboardingModel(),
                    savedChartModel: this.models.getSavedChartModel(),
                    jobModel: this.models.getJobModel(),
                    emailClient: this.clients.getEmailClient(),
                    spaceModel: this.models.getSpaceModel(),
                    sshKeyPairModel: this.models.getSshKeyPairModel(),
                    userAttributesModel: this.models.getUserAttributesModel(),
                    s3CacheClient: this.clients.getS3CacheClient(),
                    analyticsModel: this.models.getAnalyticsModel(),
                    dashboardModel: this.models.getDashboardModel(),
                    userWarehouseCredentialsModel:
                        this.models.getUserWarehouseCredentialsModel(),
                    warehouseAvailableTablesModel:
                        this.models.getWarehouseAvailableTablesModel(),
                    emailModel: this.models.getEmailModel(),
                    schedulerClient: this.clients.getSchedulerClient(),
                    downloadFileModel: this.models.getDownloadFileModel(),
                    s3Client: this.clients.getS3Client(),
                    groupsModel: this.models.getGroupsModel(),
                    tagsModel: this.models.getTagsModel(),
                    catalogModel: this.models.getCatalogModel(),
                    contentModel: this.models.getContentModel(),
                    encryptionUtil: this.utils.getEncryptionUtil(),
                    userModel: this.models.getUserModel(),
                    featureFlagModel: this.models.getFeatureFlagModel(),
                    projectParametersModel:
                        this.models.getProjectParametersModel(),
                    organizationWarehouseCredentialsModel:
                        this.models.getOrganizationWarehouseCredentialsModel(),
                    projectCompileLogModel:
                        this.models.getProjectCompileLogModel(),
                }),
        );
    }

    public getAsyncQueryService(): AsyncQueryService {
        return this.getService(
            'asyncQueryService',
            () =>
                new AsyncQueryService({
                    lightdashConfig: this.context.lightdashConfig,
                    analytics: this.context.lightdashAnalytics,
                    projectModel: this.models.getProjectModel(),
                    onboardingModel: this.models.getOnboardingModel(),
                    savedChartModel: this.models.getSavedChartModel(),
                    jobModel: this.models.getJobModel(),
                    emailClient: this.clients.getEmailClient(),
                    spaceModel: this.models.getSpaceModel(),
                    sshKeyPairModel: this.models.getSshKeyPairModel(),
                    userAttributesModel: this.models.getUserAttributesModel(),
                    s3CacheClient: this.clients.getS3CacheClient(),
                    analyticsModel: this.models.getAnalyticsModel(),
                    dashboardModel: this.models.getDashboardModel(),
                    userWarehouseCredentialsModel:
                        this.models.getUserWarehouseCredentialsModel(),
                    warehouseAvailableTablesModel:
                        this.models.getWarehouseAvailableTablesModel(),
                    emailModel: this.models.getEmailModel(),
                    schedulerClient: this.clients.getSchedulerClient(),
                    downloadFileModel: this.models.getDownloadFileModel(),
                    s3Client: this.clients.getS3Client(),
                    groupsModel: this.models.getGroupsModel(),
                    tagsModel: this.models.getTagsModel(),
                    catalogModel: this.models.getCatalogModel(),
                    contentModel: this.models.getContentModel(),
                    encryptionUtil: this.utils.getEncryptionUtil(),
                    userModel: this.models.getUserModel(),
                    queryHistoryModel: this.models.getQueryHistoryModel(),
                    downloadAuditModel: this.models.getDownloadAuditModel(),
                    savedSqlModel: this.models.getSavedSqlModel(),
                    resultsStorageClient:
                        this.clients.getResultsFileStorageClient(),
                    featureFlagModel: this.models.getFeatureFlagModel(),
                    projectParametersModel:
                        this.models.getProjectParametersModel(),
                    organizationWarehouseCredentialsModel:
                        this.models.getOrganizationWarehouseCredentialsModel(),
                    pivotTableService: this.getPivotTableService(),
                    prometheusMetrics: this.prometheusMetrics,
                    permissionsService: this.getPermissionsService(),
                    projectCompileLogModel:
                        this.models.getProjectCompileLogModel(),
                }),
        );
    }

    public getSavedChartService(): SavedChartService {
        return this.getService(
            'savedChartService',
            () =>
                new SavedChartService({
                    analytics: this.context.lightdashAnalytics,
                    projectModel: this.models.getProjectModel(),
                    savedChartModel: this.models.getSavedChartModel(),
                    spaceModel: this.models.getSpaceModel(),
                    analyticsModel: this.models.getAnalyticsModel(),
                    pinnedListModel: this.models.getPinnedListModel(),
                    schedulerModel: this.models.getSchedulerModel(),
                    schedulerClient: this.clients.getSchedulerClient(),
                    slackClient: this.clients.getSlackClient(),
                    dashboardModel: this.models.getDashboardModel(),
                    catalogModel: this.models.getCatalogModel(),
                    permissionsService: this.getPermissionsService(),
                }),
        );
    }

    public getSchedulerService(): SchedulerService {
        return this.getService(
            'schedulerService',
            () =>
                new SchedulerService({
                    lightdashConfig: this.context.lightdashConfig,
                    analytics: this.context.lightdashAnalytics,
                    schedulerModel: this.models.getSchedulerModel(),
                    savedChartModel: this.models.getSavedChartModel(),
                    dashboardModel: this.models.getDashboardModel(),
                    spaceModel: this.models.getSpaceModel(),
                    projectModel: this.models.getProjectModel(),
                    schedulerClient: this.clients.getSchedulerClient(),
                    slackClient: this.clients.getSlackClient(),
                }),
        );
    }

    public getSearchService(): SearchService {
        return this.getService(
            'searchService',
            () =>
                new SearchService({
                    analytics: this.context.lightdashAnalytics,
                    projectModel: this.models.getProjectModel(),
                    searchModel: this.models.getSearchModel(),
                    spaceModel: this.models.getSpaceModel(),
                    userAttributesModel: this.models.getUserAttributesModel(),
                }),
        );
    }

    public getShareService(): ShareService {
        return this.getService(
            'shareService',
            () =>
                new ShareService({
                    lightdashConfig: this.context.lightdashConfig,
                    analytics: this.context.lightdashAnalytics,
                    shareModel: this.models.getShareModel(),
                }),
        );
    }

    public getSshKeyPairService(): SshKeyPairService {
        return this.getService(
            'sshKeyPairService',
            () =>
                new SshKeyPairService({
                    sshKeyPairModel: this.models.getSshKeyPairModel(),
                }),
        );
    }

    public getSlackIntegrationService(): SlackIntegrationService {
        return this.getService(
            'slackIntegrationService',
            () =>
                new SlackIntegrationService({
                    analytics: this.context.lightdashAnalytics,
                    slackAuthenticationModel:
                        this.models.getSlackAuthenticationModel(),
                    slackClient: this.clients.getSlackClient(),
                }),
        );
    }

    public getSpaceService(): SpaceService {
        return this.getService(
            'spaceService',
            () =>
                new SpaceService({
                    analytics: this.context.lightdashAnalytics,
                    projectModel: this.models.getProjectModel(),
                    spaceModel: this.models.getSpaceModel(),
                    pinnedListModel: this.models.getPinnedListModel(),
                }),
        );
    }

    public getUnfurlService(): UnfurlService {
        return this.getService(
            'unfurlService',
            () =>
                new UnfurlService({
                    lightdashConfig: this.context.lightdashConfig,
                    dashboardModel: this.models.getDashboardModel(),
                    savedChartModel: this.models.getSavedChartModel(),
                    spaceModel: this.models.getSpaceModel(),
                    shareModel: this.models.getShareModel(),
                    s3Client: this.clients.getS3Client(),
                    projectModel: this.models.getProjectModel(),
                    downloadFileModel: this.models.getDownloadFileModel(),
                    slackClient: this.clients.getSlackClient(),
                    analytics: this.context.lightdashAnalytics,
                    slackAuthenticationModel:
                        this.models.getSlackAuthenticationModel(),
                }),
        );
    }

    public getUserAttributesService(): UserAttributesService {
        return this.getService(
            'userAttributesService',
            () =>
                new UserAttributesService({
                    analytics: this.context.lightdashAnalytics,
                    userAttributesModel: this.models.getUserAttributesModel(),
                }),
        );
    }

    public getUserService(): UserService {
        return this.getService(
            'userService',
            () =>
                new UserService({
                    lightdashConfig: this.context.lightdashConfig,
                    analytics: this.context.lightdashAnalytics,
                    inviteLinkModel: this.models.getInviteLinkModel(),
                    userModel: this.models.getUserModel(),
                    groupsModel: this.models.getGroupsModel(),
                    sessionModel: this.models.getSessionModel(),
                    emailModel: this.models.getEmailModel(),
                    openIdIdentityModel: this.models.getOpenIdIdentityModel(),
                    passwordResetLinkModel:
                        this.models.getPasswordResetLinkModel(),
                    emailClient: this.clients.getEmailClient(),
                    organizationMemberProfileModel:
                        this.models.getOrganizationMemberProfileModel(),
                    organizationModel: this.models.getOrganizationModel(),
                    personalAccessTokenModel:
                        this.models.getPersonalAccessTokenModel(),
                    organizationAllowedEmailDomainsModel:
                        this.models.getOrganizationAllowedEmailDomainsModel(),
                    userWarehouseCredentialsModel:
                        this.models.getUserWarehouseCredentialsModel(),
                    warehouseAvailableTablesModel:
                        this.models.getWarehouseAvailableTablesModel(),
                }),
        );
    }

    public getValidationService(): ValidationService {
        return this.getService(
            'validationService',
            () =>
                new ValidationService({
                    lightdashConfig: this.context.lightdashConfig,
                    analytics: this.context.lightdashAnalytics,
                    projectModel: this.models.getProjectModel(),
                    savedChartModel: this.models.getSavedChartModel(),
                    validationModel: this.models.getValidationModel(),
                    dashboardModel: this.models.getDashboardModel(),
                    spaceModel: this.models.getSpaceModel(),
                    schedulerClient: this.clients.getSchedulerClient(),
                }),
        );
    }

    public getCoderService(): CoderService {
        return this.getService(
            'coderService',
            () =>
                new CoderService({
                    lightdashConfig: this.context.lightdashConfig,
                    analytics: this.context.lightdashAnalytics,
                    projectModel: this.models.getProjectModel(),
                    savedChartModel: this.models.getSavedChartModel(),
                    savedSqlModel: this.models.getSavedSqlModel(),
                    dashboardModel: this.models.getDashboardModel(),
                    spaceModel: this.models.getSpaceModel(),
                    schedulerClient: this.clients.getSchedulerClient(),
                    promoteService: this.getPromoteService(),
                }),
        );
    }

    public getCatalogService(): CatalogService {
        return this.getService(
            'catalogService',
            () =>
                new CatalogService({
                    lightdashConfig: this.context.lightdashConfig,
                    analytics: this.context.lightdashAnalytics,
                    projectModel: this.models.getProjectModel(),
                    userAttributesModel: this.models.getUserAttributesModel(),
                    catalogModel: this.models.getCatalogModel(),
                    savedChartModel: this.models.getSavedChartModel(),
                    spaceModel: this.models.getSpaceModel(),
                    tagsModel: this.models.getTagsModel(),
                    changesetModel: this.models.getChangesetModel(),
                }),
        );
    }

    public getChangesetService(): ChangesetService {
        return this.getService(
            'changesetService',
            () =>
                new ChangesetService({
                    changesetModel: this.models.getChangesetModel(),
                    catalogModel: this.models.getCatalogModel(),
                    projectModel: this.models.getProjectModel(),
                }),
        );
    }

    public getMetricsExplorerService(): MetricsExplorerService {
        return this.getService(
            'metricsExplorerService',
            () =>
                new MetricsExplorerService({
                    lightdashConfig: this.context.lightdashConfig,
                    catalogModel: this.models.getCatalogModel(),
                    projectService: this.getProjectService(),
                    catalogService: this.getCatalogService(),
                    projectModel: this.models.getProjectModel(),
                }),
        );
    }

    public getPromoteService(): PromoteService {
        return this.getService(
            'promoteService',
            () =>
                new PromoteService({
                    lightdashConfig: this.context.lightdashConfig,
                    analytics: this.context.lightdashAnalytics,
                    projectModel: this.models.getProjectModel(),
                    savedChartModel: this.models.getSavedChartModel(),
                    spaceModel: this.models.getSpaceModel(),
                    dashboardModel: this.models.getDashboardModel(),
                }),
        );
    }

    public getRenameService(): RenameService {
        return this.getService(
            'renameService',
            () =>
                new RenameService({
                    lightdashConfig: this.context.lightdashConfig,
                    analytics: this.context.lightdashAnalytics,
                    projectModel: this.models.getProjectModel(),
                    savedChartModel: this.models.getSavedChartModel(),
                    dashboardModel: this.models.getDashboardModel(),
                    schedulerClient: this.clients.getSchedulerClient(),
                    schedulerModel: this.models.getSchedulerModel(),
                }),
        );
    }

    public getSavedSqlService(): SavedSqlService {
        return this.getService(
            'savedSqlService',
            () =>
                new SavedSqlService({
                    analytics: this.context.lightdashAnalytics,
                    projectModel: this.models.getProjectModel(),
                    spaceModel: this.models.getSpaceModel(),
                    savedSqlModel: this.models.getSavedSqlModel(),
                    schedulerClient: this.clients.getSchedulerClient(),
                    analyticsModel: this.models.getAnalyticsModel(),
                }),
        );
    }

    public getContentService(): ContentService {
        return this.getService(
            'contentService',
            () =>
                new ContentService({
                    analytics: this.context.lightdashAnalytics,
                    projectModel: this.models.getProjectModel(),
                    contentModel: this.models.getContentModel(),
                    spaceModel: this.models.getSpaceModel(),
                    spaceService: this.getSpaceService(),
                    dashboardService: this.getDashboardService(),
                    savedChartService: this.getSavedChartService(),
                    savedSqlService: this.getSavedSqlService(),
                }),
        );
    }

    public getFeatureFlagService(): FeatureFlagService {
        return this.getService(
            'featureFlagService',
            () =>
                new FeatureFlagService({
                    lightdashConfig: this.context.lightdashConfig,
                    featureFlagModel: this.models.getFeatureFlagModel(),
                }),
        );
    }

    public getEmbedService<EmbedServiceImplT>(): EmbedServiceImplT {
        return this.getService('embedService');
    }

    public getAiService<AiServiceImplT>(): AiServiceImplT {
        return this.getService('aiService');
    }

    public getAiAgentService<AiAgentServiceImplT>(): AiAgentServiceImplT {
        return this.getService('aiAgentService');
    }

    public getAiAgentAdminService<
        AiAgentAdminServiceImplT,
    >(): AiAgentAdminServiceImplT {
        return this.getService('aiAgentAdminService');
    }

    public getAiOrganizationSettingsService<
        AiOrganizationSettingsServiceImplT,
    >(): AiOrganizationSettingsServiceImplT {
        return this.getService('aiOrganizationSettingsService');
    }

    public getRolesService(): RolesService {
        return this.getService(
            'rolesService',
            () =>
                new RolesService({
                    lightdashConfig: this.context.lightdashConfig,
                    analytics: this.context.lightdashAnalytics,
                    rolesModel: this.models.getRolesModel(),
                    userModel: this.models.getUserModel(),
                    organizationModel: this.models.getOrganizationModel(),
                    groupsModel: this.models.getGroupsModel(),
                    projectModel: this.models.getProjectModel(),
                    emailClient: this.clients.getEmailClient(),
                }),
        );
    }

    public getScimService<ScimServiceImplT>(): ScimServiceImplT {
        return this.getService('scimService');
    }

    public getSupportService<SupportServiceImptT>(): SupportServiceImptT {
        return this.getService('supportService');
    }

    public getMcpService<McpServiceImplT>(): McpServiceImplT {
        return this.getService('mcpService');
    }

    public getSpotlightService(): SpotlightService {
        return this.getService(
            'spotlightService',
            () =>
                new SpotlightService({
                    lightdashConfig: this.context.lightdashConfig,
                    spotlightTableConfigModel:
                        this.models.getSpotlightTableConfigModel(),
                    projectModel: this.models.getProjectModel(),
                }),
        );
    }

    public getLightdashAnalyticsService(): LightdashAnalyticsService {
        return this.getService(
            'lightdashAnalyticsService',
            () =>
                new LightdashAnalyticsService({
                    analytics: this.context.lightdashAnalytics,
                    projectModel: this.models.getProjectModel(),
                    savedChartModel: this.models.getSavedChartModel(),
                }),
        );
    }

    public getCacheService<CacheServiceImplT>(): CacheServiceImplT {
        return this.getService('cacheService');
    }

    public getServiceAccountService<
        ServiceAccountServiceImplT,
    >(): ServiceAccountServiceImplT {
        return this.getService('serviceAccountService');
    }

    public getOrganizationWarehouseCredentialsService<
        OrganizationWarehouseCredentialsServiceImplT,
    >(): OrganizationWarehouseCredentialsServiceImplT {
        return this.getService('organizationWarehouseCredentialsService');
    }

    public getInstanceConfigurationService<
        InstanceConfigurationServiceImplT,
    >(): InstanceConfigurationServiceImplT {
        return this.getService('instanceConfigurationService');
    }

    public getProjectParametersService(): ProjectParametersService {
        return this.getService(
            'projectParametersService',
            () =>
                new ProjectParametersService({
                    lightdashConfig: this.context.lightdashConfig,
                    analytics: this.context.lightdashAnalytics,
                    projectParametersModel:
                        this.models.getProjectParametersModel(),
                    projectModel: this.models.getProjectModel(),
                }),
        );
    }

    public getProjectCompileLogService(): ProjectCompileLogService {
        return this.getService(
            'projectCompileLogService',
            () =>
                new ProjectCompileLogService({
                    projectCompileLogModel:
                        this.models.getProjectCompileLogModel(),
                }),
        );
    }

    public getSlackService(): SlackService {
        return this.getService(
            'slackService',
            () =>
                new SlackService({
                    slackClient: this.clients.getSlackClient(),
                    unfurlService: this.getUnfurlService(),
                }),
        );
    }

    /**
     * Handles initializing a service, and taking into account service
     * providers + memoization.
     *
     * If a factory is not provided, and a service provider is not defined,
     * this method throws an error. This should not happen in normal operation.
     */
    private getService<
        K extends keyof ServiceManifest,
        T extends ServiceManifest[K],
    >(serviceName: K, factory?: () => T): T {
        if (this.serviceInstances[serviceName] == null) {
            let serviceInstance: T;

            if (this.providers[serviceName] != null) {
                serviceInstance = this.providers[serviceName]!({
                    repository: this,
                    context: this.context,
                    models: this.models,
                    clients: this.clients,
                    utils: this.utils,
                    prometheusMetrics: this.prometheusMetrics,
                }) as T;
            } else if (factory != null) {
                serviceInstance = factory();
            } else {
                throw new MissingConfigError(
                    `Unable to initialize service '${serviceName}' - no factory or provider.`,
                );
            }

            this.serviceInstances[serviceName] = serviceInstance;
        }

        return this.serviceInstances[serviceName] as T;
    }
}
