import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import { ClientRepository } from '../clients/ClientRepository';
import { LightdashConfig } from '../config/parseConfig';
import { ModelRepository } from '../models/ModelRepository';
import { AnalyticsService } from './AnalyticsService/AnalyticsService';
import { BaseService } from './BaseService';
import { CatalogService } from './CatalogService/CatalogService';
import { CommentService } from './CommentService/CommentService';
import { CsvService } from './CsvService/CsvService';
import { DashboardService } from './DashboardService/DashboardService';
import { DownloadFileService } from './DownloadFileService/DownloadFileService';
import { GdriveService } from './GdriveService/GdriveService';
import { GithubAppService } from './GithubAppService/GithubAppService';
import { GitIntegrationService } from './GitIntegrationService/GitIntegrationService';
import { GroupsService } from './GroupService';
import { HealthService } from './HealthService/HealthService';
import { NotificationsService } from './NotificationsService/NotificationsService';
import { OrganizationService } from './OrganizationService/OrganizationService';
import { PersonalAccessTokenService } from './PersonalAccessTokenService';
import { PinningService } from './PinningService/PinningService';
import { ProjectService } from './ProjectService/ProjectService';
import { SavedChartService } from './SavedChartsService/SavedChartService';
import { SchedulerService } from './SchedulerService/SchedulerService';
import { SearchService } from './SearchService/SearchService';
import { ShareService } from './ShareService/ShareService';
import { SlackIntegrationService } from './SlackIntegrationService/SlackIntegrationService';
import { SpaceService } from './SpaceService/SpaceService';
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
    gdriveService: GdriveService;
    groupService: GroupsService;
    healthService: HealthService;
    notificationService: NotificationsService;
    organizationService: OrganizationService;
    personalAccessTokenService: PersonalAccessTokenService;
    pinningService: PinningService;
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

    /** An implementation signature for these services are not available at this stage */
    embedService: unknown;
    aiService: unknown;
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
    clients: ClientRepository;
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

    constructor({
        serviceProviders,
        context,
        clients,
        models,
    }: {
        serviceProviders?: ServiceProviderMap<ServiceManifest>;
        context: OperationContext;
        clients: ClientRepository;
        models: ModelRepository;
    }) {
        this.providers = serviceProviders ?? {};
        this.context = context;
        this.clients = clients;
        this.models = models;
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
                    downloadFileModel: this.models.getDownloadFileModel(),
                    schedulerClient: this.clients.getSchedulerClient(),
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
                    schedulerClient: this.clients.getSchedulerClient(),
                    slackClient: this.clients.getSlackClient(),
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
                    inviteLinkModel: this.models.getInviteLinkModel(),
                    organizationMemberProfileModel:
                        this.models.getOrganizationMemberProfileModel(),
                    userModel: this.models.getUserModel(),
                    organizationAllowedEmailDomainsModel:
                        this.models.getOrganizationAllowedEmailDomainsModel(),
                    groupsModel: this.models.getGroupsModel(),
                }),
        );
    }

    public getPersonalAccessTokenService(): PersonalAccessTokenService {
        return this.getService(
            'personalAccessTokenService',
            () =>
                new PersonalAccessTokenService({
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
                    emailModel: this.models.getEmailModel(),
                    schedulerClient: this.clients.getSchedulerClient(),
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
                }),
        );
    }

    public getEmbedService<EmbedServiceImplT>(): EmbedServiceImplT {
        return this.getService('embedService');
    }

    public getAiService<AiServiceImplT>(): AiServiceImplT {
        return this.getService('aiService');
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
                }) as T;
            } else if (factory != null) {
                serviceInstance = factory();
            } else {
                throw new Error(
                    `Unable to initialize service '${serviceName}' - no factory or provider.`,
                );
            }

            this.serviceInstances[serviceName] = serviceInstance;
        }

        return this.serviceInstances[serviceName] as T;
    }
}
