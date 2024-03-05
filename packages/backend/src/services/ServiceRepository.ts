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

    constructor({ services }: { services: ServiceManifest }) {
        this._services = services;
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
 */ export class ServiceRepository
    extends ServiceRepositoryBase
    implements ServiceFactoryMethod<ServiceManifest>
{
    public getAnalyticsService(): AnalyticsService {
        return this._services.analyticsService;
    }

    public getCommentService(): CommentService {
        return this._services.commentService;
    }

    public getCsvService(): CsvService {
        return this._services.csvService;
    }

    public getDashboardService(): DashboardService {
        return this._services.dashboardService;
    }

    public getDownloadFileService(): DownloadFileService {
        return this._services.downloadFileService;
    }

    public getEncryptionService(): EncryptionService {
        return this._services.encryptionService;
    }

    public getGitIntegrationService(): GitIntegrationService {
        return this._services.gitIntegrationService;
    }

    public getGithubAppService(): GithubAppService {
        return this._services.githubAppService;
    }

    public getGdriveService(): GdriveService {
        return this._services.gdriveService;
    }

    public getGroupService(): GroupsService {
        return this._services.groupService;
    }

    public getHealthService(): HealthService {
        return this._services.healthService;
    }

    public getNotificationService(): NotificationsService {
        return this._services.notificationService;
    }

    public getOrganizationService(): OrganizationService {
        return this._services.organizationService;
    }

    public getPersonalAccessTokenService(): PersonalAccessTokenService {
        return this._services.personalAccessTokenService;
    }

    public getPinningService(): PinningService {
        return this._services.pinningService;
    }

    public getProjectService(): ProjectService {
        return this._services.projectService;
    }

    public getSavedChartService(): SavedChartService {
        return this._services.savedChartService;
    }

    public getSchedulerService(): SchedulerService {
        return this._services.schedulerService;
    }

    public getSearchService(): SearchService {
        return this._services.searchService;
    }

    public getShareService(): ShareService {
        return this._services.shareService;
    }

    public getSshKeyPairService(): SshKeyPairService {
        return this._services.sshKeyPairService;
    }

    public getSpaceService(): SpaceService {
        return this._services.spaceService;
    }

    public getUnfurlService(): UnfurlService {
        return this._services.unfurlService;
    }

    public getUserAttributesService(): UserAttributesService {
        return this._services.userAttributesService;
    }

    public getUserService(): UserService {
        return this._services.userService;
    }

    public getValidationService(): ValidationService {
        return this._services.validationService;
    }
}
