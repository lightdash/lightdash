import type { AnalyticsService } from './AnalyticsService/AnalyticsService';
import type { CommentService } from './CommentService/CommentService';
import type { CsvService } from './CsvService/CsvService';
import type { DashboardService } from './DashboardService/DashboardService';
import type { DownloadFileService } from './DownloadFileService/DownloadFileService';
import type { EncryptionService } from './EncryptionService/EncryptionService';
import type { GdriveService } from './GdriveService/GdriveService';
import type { GithubAppService } from './GithubAppService/GithubAppService';
import type { GitIntegrationService } from './GitIntegrationService/GitIntegrationService';
import type { GroupsService } from './GroupService';
import type { HealthService } from './HealthService/HealthService';
import type { NotificationsService } from './NotificationsService/NotificationsService';
import type { OrganizationService } from './OrganizationService/OrganizationService';
import type { PersonalAccessTokenService } from './PersonalAccessTokenService';
import type { PinningService } from './PinningService/PinningService';
import type { ProjectService } from './ProjectService/ProjectService';
import type { SavedChartService } from './SavedChartsService/SavedChartService';
import type { SchedulerService } from './SchedulerService/SchedulerService';
import type { SearchService } from './SearchService/SearchService';
import type { ShareService } from './ShareService/ShareService';
import type { SpaceService } from './SpaceService/SpaceService';
import type { SshKeyPairService } from './SshKeyPairService';
import type { UnfurlService } from './UnfurlService/UnfurlService';
import type { UserAttributesService } from './UserAttributesService/UserAttributesService';
import type { UserService } from './UserService';
import type { ValidationService } from './ValidationService/ValidationService';

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
}

/**
 * Enforces the presence of getter methods for all services declared in the manifest.
 */
type ServiceFactoryMethod<T extends ServiceManifest> = {
    [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

/**
 * Structure for describing service providers:
 *
 *   <serviceName> -> providerMethod
 */
type ServiceProviderMap<T extends ServiceManifest> = Partial<{
    [K in keyof T]: (providerArgs: {
        repository: ServiceRepository;
        context: OperationContext;
    }) => T[keyof T];
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
    constructor(
        protected readonly properties: {
            operationId: string;
        },
    ) {}
}

/**
 * Intermediate abstract class used to enforce service factory methods via the `ServiceFactoryMethod`
 * type. We need this extra thin layer to ensure we are statically aware of all members.
 */
abstract class ServiceRepositoryBase {
    /**
     * Container for service instances. Can be replaced with bare class members once
     * this class is handling service instantiation directly, and not just behaving as
     * a dumb proxy.
     */
    protected _services: ServiceManifest;

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
    protected _serviceProviders: ServiceProviderMap<ServiceManifest>;

    /**
     * See @type OperationContext
     */
    protected readonly context: OperationContext;

    constructor({
        services,
        serviceProviders,
        context,
    }: {
        services: ServiceManifest;
        serviceProviders?: ServiceProviderMap<ServiceManifest>;
        context: OperationContext;
    }) {
        this._services = services;
        this._serviceProviders = serviceProviders ?? {};
        this.context = context;
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
    protected _serviceCache: Partial<ServiceManifest> = {};

    public getAnalyticsService(): AnalyticsService {
        return this.getService(
            'analyticsService',
            () => this._services.analyticsService,
        );
    }

    public getCommentService(): CommentService {
        return this.getService(
            'commentService',
            () => this._services.commentService,
        );
    }

    public getCsvService(): CsvService {
        return this.getService('csvService', () => this._services.csvService);
    }

    public getDashboardService(): DashboardService {
        return this.getService(
            'dashboardService',
            () => this._services.dashboardService,
        );
    }

    public getDownloadFileService(): DownloadFileService {
        return this.getService(
            'downloadFileService',
            () => this._services.downloadFileService,
        );
    }

    public getEncryptionService(): EncryptionService {
        return this.getService(
            'encryptionService',
            () => this._services.encryptionService,
        );
    }

    public getGitIntegrationService(): GitIntegrationService {
        return this.getService(
            'gitIntegrationService',
            () => this._services.gitIntegrationService,
        );
    }

    public getGithubAppService(): GithubAppService {
        return this.getService(
            'githubAppService',
            () => this._services.githubAppService,
        );
    }

    public getGdriveService(): GdriveService {
        return this.getService(
            'gdriveService',
            () => this._services.gdriveService,
        );
    }

    public getGroupService(): GroupsService {
        return this.getService(
            'groupService',
            () => this._services.groupService,
        );
    }

    public getHealthService(): HealthService {
        return this.getService(
            'healthService',
            () => this._services.healthService,
        );
    }

    public getNotificationService(): NotificationsService {
        return this.getService(
            'notificationService',
            () => this._services.notificationService,
        );
    }

    public getOrganizationService(): OrganizationService {
        return this.getService(
            'organizationService',
            () => this._services.organizationService,
        );
    }

    public getPersonalAccessTokenService(): PersonalAccessTokenService {
        return this.getService(
            'personalAccessTokenService',
            () => this._services.personalAccessTokenService,
        );
    }

    public getPinningService(): PinningService {
        return this.getService(
            'pinningService',
            () => this._services.pinningService,
        );
    }

    public getProjectService(): ProjectService {
        return this.getService(
            'projectService',
            () => this._services.projectService,
        );
    }

    public getSavedChartService(): SavedChartService {
        return this.getService(
            'savedChartService',
            () => this._services.savedChartService,
        );
    }

    public getSchedulerService(): SchedulerService {
        return this.getService(
            'schedulerService',
            () => this._services.schedulerService,
        );
    }

    public getSearchService(): SearchService {
        return this.getService(
            'searchService',
            () => this._services.searchService,
        );
    }

    public getShareService(): ShareService {
        return this.getService(
            'shareService',
            () => this._services.shareService,
        );
    }

    public getSshKeyPairService(): SshKeyPairService {
        return this.getService(
            'sshKeyPairService',
            () => this._services.sshKeyPairService,
        );
    }

    public getSpaceService(): SpaceService {
        return this.getService(
            'spaceService',
            () => this._services.spaceService,
        );
    }

    public getUnfurlService(): UnfurlService {
        return this.getService(
            'unfurlService',
            () => this._services.unfurlService,
        );
    }

    public getUserAttributesService(): UserAttributesService {
        return this.getService(
            'userAttributesService',
            () => this._services.userAttributesService,
        );
    }

    public getUserService(): UserService {
        return this.getService('userService', () => this._services.userService);
    }

    public getValidationService(): ValidationService {
        return this.getService(
            'validationService',
            () => this._services.validationService,
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
        if (this._serviceCache[serviceName] == null) {
            let serviceInstance: T;

            if (this._serviceProviders[serviceName] != null) {
                serviceInstance = this._serviceProviders[serviceName]!({
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

            this._serviceCache[serviceName] = serviceInstance;
        }

        return this._serviceCache[serviceName] as T;
    }
}
