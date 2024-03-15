import { LightdashAnalytics } from '../analytics/LightdashAnalytics';
import type { ClientManifest } from '../clients/clients';
import { LightdashConfig } from '../config/parseConfig';
import {
    analyticsModel,
    commentModel,
    dashboardModel,
    downloadFileModel,
    emailModel,
    githubAppInstallationsModel,
    groupsModel,
    inviteLinkModel,
    jobModel,
    notificationsModel,
    onboardingModel,
    openIdIdentityModel,
    organizationAllowedEmailDomainsModel,
    organizationMemberProfileModel,
    organizationModel,
    passwordResetLinkModel,
    personalAccessTokenModel,
    pinnedListModel,
    projectModel,
    resourceViewItemModel,
    savedChartModel,
    schedulerModel,
    searchModel,
    sessionModel,
    shareModel,
    spaceModel,
    sshKeyPairModel,
    userAttributesModel,
    userModel,
    userWarehouseCredentialsModel,
    validationModel,
} from '../models/models';
import { AnalyticsService } from './AnalyticsService/AnalyticsService';
import { CommentService } from './CommentService/CommentService';
import { CsvService } from './CsvService/CsvService';
import { DashboardService } from './DashboardService/DashboardService';
import { DownloadFileService } from './DownloadFileService/DownloadFileService';
import { EncryptionService } from './EncryptionService/EncryptionService';
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
    encryptionService: EncryptionService;
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
    sshKeyPairService: SshKeyPairService;
    spaceService: SpaceService;
    unfurlService: UnfurlService;
    userAttributesService: UserAttributesService;
    userService: UserService;
    validationService: ValidationService;

    /** An implementation signature for embedService is not available at this stage */
    embedService: unknown;
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
export class OperationContext {
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
     *      encryptionService: ({ repository, context }) => {
     *          return new EncryptionServiceOverride(...);
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

    /**
     * Holds client singletons. Temporary solution, will be replaced by dependency injection.
     */
    public clients: ClientManifest;

    constructor({
        serviceProviders,
        context,
        clients,
    }: {
        serviceProviders?: ServiceProviderMap<ServiceManifest>;
        context: OperationContext;
        clients: ClientManifest;
    }) {
        this.providers = serviceProviders ?? {};
        this.context = context;
        this.clients = clients;
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
 * NOTE: For now, this repository simply exposes services instantiated in `./services.ts`,
 *       and provided to this repository directly. At a later stage, this repository will
 *       handle instantiating all services internally, including cross-service dependencies.
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
                    analyticsModel,
                }),
        );
    }

    public getCommentService(): CommentService {
        return this.getService(
            'commentService',
            () =>
                new CommentService({
                    analytics: this.context.lightdashAnalytics,
                    dashboardModel,
                    spaceModel,
                    commentModel,
                    notificationsModel,
                    userModel,
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
                    userModel,
                    s3Client: this.clients.s3Client,
                    dashboardModel,
                    savedChartModel,
                    downloadFileModel,
                    schedulerClient: this.clients.schedulerClient,
                }),
        );
    }

    public getDashboardService(): DashboardService {
        return this.getService(
            'dashboardService',
            () =>
                new DashboardService({
                    analytics: this.context.lightdashAnalytics,
                    dashboardModel,
                    spaceModel,
                    analyticsModel,
                    pinnedListModel,
                    schedulerModel,
                    savedChartModel,
                    schedulerClient: this.clients.schedulerClient,
                    slackClient: this.clients.slackClient,
                }),
        );
    }

    public getDownloadFileService(): DownloadFileService {
        return this.getService(
            'downloadFileService',
            () =>
                new DownloadFileService({
                    lightdashConfig: this.context.lightdashConfig,
                    downloadFileModel,
                }),
        );
    }

    public getEncryptionService(): EncryptionService {
        return this.getService(
            'encryptionService',
            () =>
                new EncryptionService({
                    lightdashConfig: this.context.lightdashConfig,
                }),
        );
    }

    public getGitIntegrationService(): GitIntegrationService {
        return this.getService(
            'gitIntegrationService',
            () =>
                new GitIntegrationService({
                    lightdashConfig: this.context.lightdashConfig,
                    savedChartModel,
                    projectModel,
                    spaceModel,
                    githubAppInstallationsModel,
                }),
        );
    }

    public getGithubAppService(): GithubAppService {
        return this.getService(
            'githubAppService',
            () =>
                new GithubAppService({
                    githubAppInstallationsModel,
                    userModel,
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
                    userModel,
                    dashboardModel,
                    savedChartModel,
                    schedulerClient: this.clients.schedulerClient,
                }),
        );
    }

    public getGroupService(): GroupsService {
        return this.getService(
            'groupService',
            () =>
                new GroupsService({
                    analytics: this.context.lightdashAnalytics,
                    groupsModel,
                    projectModel,
                }),
        );
    }

    public getHealthService(): HealthService {
        return this.getService(
            'healthService',
            () =>
                new HealthService({
                    lightdashConfig: this.context.lightdashConfig,
                    organizationModel,
                }),
        );
    }

    public getNotificationService(): NotificationsService {
        return this.getService(
            'notificationService',
            () =>
                new NotificationsService({
                    notificationsModel,
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
                    organizationModel,
                    projectModel,
                    onboardingModel,
                    inviteLinkModel,
                    organizationMemberProfileModel,
                    userModel,
                    organizationAllowedEmailDomainsModel,
                    groupsModel,
                }),
        );
    }

    public getPersonalAccessTokenService(): PersonalAccessTokenService {
        return this.getService(
            'personalAccessTokenService',
            () =>
                new PersonalAccessTokenService({
                    analytics: this.context.lightdashAnalytics,
                    personalAccessTokenModel,
                }),
        );
    }

    public getPinningService(): PinningService {
        return this.getService(
            'pinningService',
            () =>
                new PinningService({
                    dashboardModel,
                    savedChartModel,
                    spaceModel,
                    pinnedListModel,
                    resourceViewItemModel,
                    projectModel,
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
                    projectModel,
                    onboardingModel,
                    savedChartModel,
                    jobModel,
                    emailClient: this.clients.emailClient,
                    spaceModel,
                    sshKeyPairModel,
                    userAttributesModel,
                    s3CacheClient: this.clients.s3CacheClient,
                    analyticsModel,
                    dashboardModel,
                    userWarehouseCredentialsModel,
                    schedulerClient: this.clients.schedulerClient,
                }),
        );
    }

    public getSavedChartService(): SavedChartService {
        return this.getService(
            'savedChartService',
            () =>
                new SavedChartService({
                    analytics: this.context.lightdashAnalytics,
                    projectModel,
                    savedChartModel,
                    spaceModel,
                    analyticsModel,
                    pinnedListModel,
                    schedulerModel,
                    schedulerClient: this.clients.schedulerClient,
                    slackClient: this.clients.slackClient,
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
                    schedulerModel,
                    savedChartModel,
                    dashboardModel,
                    spaceModel,
                    schedulerClient: this.clients.schedulerClient,
                    slackClient: this.clients.slackClient,
                }),
        );
    }

    public getSearchService(): SearchService {
        return this.getService(
            'searchService',
            () =>
                new SearchService({
                    analytics: this.context.lightdashAnalytics,
                    projectModel,
                    searchModel,
                    spaceModel,
                    userAttributesModel,
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
                    shareModel,
                }),
        );
    }

    public getSshKeyPairService(): SshKeyPairService {
        return this.getService(
            'sshKeyPairService',
            () =>
                new SshKeyPairService({
                    sshKeyPairModel,
                }),
        );
    }

    public getSpaceService(): SpaceService {
        return this.getService(
            'spaceService',
            () =>
                new SpaceService({
                    analytics: this.context.lightdashAnalytics,
                    projectModel,
                    spaceModel,
                    pinnedListModel,
                }),
        );
    }

    public getUnfurlService(): UnfurlService {
        return this.getService(
            'unfurlService',
            () =>
                new UnfurlService({
                    lightdashConfig: this.context.lightdashConfig,
                    encryptionService: this.getEncryptionService(),
                    dashboardModel,
                    savedChartModel,
                    spaceModel,
                    shareModel,
                    s3Client: this.clients.s3Client,
                    projectModel,
                    downloadFileModel,
                }),
        );
    }

    public getUserAttributesService(): UserAttributesService {
        return this.getService(
            'userAttributesService',
            () =>
                new UserAttributesService({
                    analytics: this.context.lightdashAnalytics,
                    userAttributesModel,
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
                    inviteLinkModel,
                    userModel,
                    groupsModel,
                    sessionModel,
                    emailModel,
                    openIdIdentityModel,
                    passwordResetLinkModel,
                    emailClient: this.clients.emailClient,
                    organizationMemberProfileModel,
                    organizationModel,
                    personalAccessTokenModel,
                    organizationAllowedEmailDomainsModel,
                    userWarehouseCredentialsModel,
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
                    projectModel,
                    savedChartModel,
                    validationModel,
                    dashboardModel,
                    spaceModel,
                    schedulerClient: this.clients.schedulerClient,
                }),
        );
    }

    public getEmbedService<EmbedServiceImplT>(): EmbedServiceImplT {
        return this.getService('embedService');
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
