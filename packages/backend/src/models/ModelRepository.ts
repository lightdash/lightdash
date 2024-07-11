import { Knex } from 'knex';
import { LightdashConfig } from '../config/parseConfig';
import { type UtilRepository } from '../utils/UtilRepository';
import { AnalyticsModel } from './AnalyticsModel';
import { CatalogModel } from './CatalogModel/CatalogModel';
import { CommentModel } from './CommentModel/CommentModel';
import { DashboardModel } from './DashboardModel/DashboardModel';
import { PersonalAccessTokenModel } from './DashboardModel/PersonalAccessTokenModel';
import { DownloadFileModel } from './DownloadFileModel';
import { EmailModel } from './EmailModel';
import { GithubAppInstallationsModel } from './GithubAppInstallations/GithubAppInstallationsModel';
import { GroupsModel } from './GroupsModel';
import { InviteLinkModel } from './InviteLinkModel';
import { JobModel } from './JobModel/JobModel';
import { MigrationModel } from './MigrationModel/MigrationModel';
import { NotificationsModel } from './NotificationsModel/NotificationsModel';
import { OnboardingModel } from './OnboardingModel/OnboardingModel';
import { OpenIdIdentityModel } from './OpenIdIdentitiesModel';
import { OrganizationAllowedEmailDomainsModel } from './OrganizationAllowedEmailDomainsModel';
import { OrganizationMemberProfileModel } from './OrganizationMemberProfileModel';
import { OrganizationModel } from './OrganizationModel';
import { PasswordResetLinkModel } from './PasswordResetLinkModel';
import { PinnedListModel } from './PinnedListModel';
import { ProjectModel } from './ProjectModel/ProjectModel';
import { ResourceViewItemModel } from './ResourceViewItemModel';
import { SavedChartModel } from './SavedChartModel';
import { SavedSqlModel } from './SavedSqlModel';
import { SchedulerModel } from './SchedulerModel';
import { SearchModel } from './SearchModel';
import { SessionModel } from './SessionModel';
import { ShareModel } from './ShareModel';
import { SlackAuthenticationModel } from './SlackAuthenticationModel';
import { SpaceModel } from './SpaceModel';
import { SshKeyPairModel } from './SshKeyPairModel';
import { UserAttributesModel } from './UserAttributesModel';
import { UserModel } from './UserModel';
import { UserWarehouseCredentialsModel } from './UserWarehouseCredentials/UserWarehouseCredentialsModel';
import { ValidationModel } from './ValidationModel/ValidationModel';

/**
 * Interface outlining all models. Add new models to
 * this list (in alphabetical order, please!).
 */

export type ModelManifest = {
    analyticsModel: AnalyticsModel;
    commentModel: CommentModel;
    dashboardModel: DashboardModel;
    downloadFileModel: DownloadFileModel;
    emailModel: EmailModel;
    githubAppInstallationsModel: GithubAppInstallationsModel;
    groupsModel: GroupsModel;
    inviteLinkModel: InviteLinkModel;
    jobModel: JobModel;
    migrationModel: MigrationModel;
    notificationsModel: NotificationsModel;
    onboardingModel: OnboardingModel;
    openIdIdentityModel: OpenIdIdentityModel;
    organizationAllowedEmailDomainsModel: OrganizationAllowedEmailDomainsModel;
    organizationMemberProfileModel: OrganizationMemberProfileModel;
    organizationModel: OrganizationModel;
    passwordResetLinkModel: PasswordResetLinkModel;
    personalAccessTokenModel: PersonalAccessTokenModel;
    pinnedListModel: PinnedListModel;
    projectModel: ProjectModel;
    resourceViewItemModel: ResourceViewItemModel;
    savedChartModel: SavedChartModel;
    schedulerModel: SchedulerModel;
    searchModel: SearchModel;
    sessionModel: SessionModel;
    shareModel: ShareModel;
    slackAuthenticationModel: SlackAuthenticationModel;
    spaceModel: SpaceModel;
    sshKeyPairModel: SshKeyPairModel;
    userAttributesModel: UserAttributesModel;
    userModel: UserModel;
    userWarehouseCredentialsModel: UserWarehouseCredentialsModel;
    validationModel: ValidationModel;
    catalogModel: CatalogModel;
    savedSqlModel: SavedSqlModel;

    /** An implementation signature for these models are not available at this stage */
    aiModel: unknown;
    embedModel: unknown;
    dashboardSummaryModel: unknown;
};

/**
 * Enforces the presence of getter methods for all models declared in the manifest.
 */
type ModelFactoryMethod<T extends ModelManifest> = {
    [K in keyof T as `get${Capitalize<string & K>}`]: () => T[K];
};

type ModelProvider<T extends ModelManifest> = (providerArgs: {
    repository: ModelRepository;
    database: Knex;
    utils: UtilRepository;
}) => T[keyof T];

/**
 * Structure for describing model providers:
 *
 *   <modelName> -> providerMethod
 */
export type ModelProviderMap<T extends ModelManifest = ModelManifest> =
    Partial<{
        [K in keyof T]: ModelProvider<T>;
    }>;

/**
 * Intermediate abstract class used to enforce model factory methods via the `ModelFactoryMethod`
 * type. We need this extra thin layer to ensure we are statically aware of all members.
 */
abstract class ModelRepositoryBase {
    /**
     * Container for model provider overrides. Providers can be defined when instancing
     * the model repository, and take precedence when instancing the given model.
     *
     * Providers receive an instance of the current OperationContext, and the parent
     * ModelRepository instance.
     *
     * new ModelRepository({
     *    modelProviders: {
     *      encryptionModel: ({ repository, context }) => {
     *          return new EncryptionModelOverride(...);
     *      }
     *    }
     * })
     *
     * NOTE: This exact implementation is temporary, and is likely to be adjusted soon
     * as part of the dependency injection rollout.
     */
    protected providers: ModelProviderMap;

    protected readonly lightdashConfig: LightdashConfig;

    /**
     * Knex database instance, used for all database operations.
     */
    protected readonly database: Knex;

    protected readonly utils: UtilRepository;

    constructor({
        modelProviders,
        lightdashConfig,
        database,
        utils,
    }: {
        modelProviders?: ModelProviderMap<ModelManifest>;
        lightdashConfig: LightdashConfig;
        database: Knex;
        utils: UtilRepository;
    }) {
        this.providers = modelProviders ?? {};
        this.lightdashConfig = lightdashConfig;
        this.database = database;
        this.utils = utils;
    }
}

/**
 * Bare model repository class, which acts as a container for all existing
 * models, and as a point to share instantiation and common logic.
 *
 * If you need to access a model, you should do it through an instance of this
 * repository - ideally one that you accessed through a controller, or otherwise
 * via dependency injection.
 *
 */
export class ModelRepository
    extends ModelRepositoryBase
    implements ModelFactoryMethod<ModelManifest>
{
    /**
     * Holds memoized instances of models after their initial instantiation:
     */
    protected modelInstances: Partial<ModelManifest> = {};

    public getAnalyticsModel(): AnalyticsModel {
        return this.getModel(
            'analyticsModel',
            () => new AnalyticsModel({ database: this.database }),
        );
    }

    public getCommentModel(): CommentModel {
        return this.getModel(
            'commentModel',
            () => new CommentModel({ database: this.database }),
        );
    }

    public getDashboardModel(): DashboardModel {
        return this.getModel(
            'dashboardModel',
            () => new DashboardModel({ database: this.database }),
        );
    }

    public getDownloadFileModel(): DownloadFileModel {
        return this.getModel(
            'downloadFileModel',
            () => new DownloadFileModel({ database: this.database }),
        );
    }

    public getEmailModel(): EmailModel {
        return this.getModel(
            'emailModel',
            () => new EmailModel({ database: this.database }),
        );
    }

    public getGithubAppInstallationsModel(): GithubAppInstallationsModel {
        return this.getModel(
            'githubAppInstallationsModel',
            () =>
                new GithubAppInstallationsModel({
                    database: this.database,
                    encryptionUtil: this.utils.getEncryptionUtil(),
                }),
        );
    }

    public getGroupsModel(): GroupsModel {
        return this.getModel(
            'groupsModel',
            () => new GroupsModel({ database: this.database }),
        );
    }

    public getInviteLinkModel(): InviteLinkModel {
        return this.getModel(
            'inviteLinkModel',
            () =>
                new InviteLinkModel({
                    database: this.database,
                    lightdashConfig: this.lightdashConfig,
                }),
        );
    }

    public getJobModel(): JobModel {
        return this.getModel(
            'jobModel',
            () => new JobModel({ database: this.database }),
        );
    }

    public getMigrationModel(): MigrationModel {
        return this.getModel(
            'migrationModel',
            () => new MigrationModel({ database: this.database }),
        );
    }

    public getNotificationsModel(): NotificationsModel {
        return this.getModel(
            'notificationsModel',
            () => new NotificationsModel({ database: this.database }),
        );
    }

    public getOnboardingModel(): OnboardingModel {
        return this.getModel(
            'onboardingModel',
            () => new OnboardingModel({ database: this.database }),
        );
    }

    public getOpenIdIdentityModel(): OpenIdIdentityModel {
        return this.getModel(
            'openIdIdentityModel',
            () => new OpenIdIdentityModel({ database: this.database }),
        );
    }

    public getOrganizationAllowedEmailDomainsModel(): OrganizationAllowedEmailDomainsModel {
        return this.getModel(
            'organizationAllowedEmailDomainsModel',
            () =>
                new OrganizationAllowedEmailDomainsModel({
                    database: this.database,
                }),
        );
    }

    public getOrganizationMemberProfileModel(): OrganizationMemberProfileModel {
        return this.getModel(
            'organizationMemberProfileModel',
            () =>
                new OrganizationMemberProfileModel({
                    database: this.database,
                }),
        );
    }

    public getOrganizationModel(): OrganizationModel {
        return this.getModel(
            'organizationModel',
            () => new OrganizationModel(this.database),
        );
    }

    public getPasswordResetLinkModel(): PasswordResetLinkModel {
        return this.getModel(
            'passwordResetLinkModel',
            () =>
                new PasswordResetLinkModel({
                    database: this.database,
                    lightdashConfig: this.lightdashConfig,
                }),
        );
    }

    public getPersonalAccessTokenModel(): PersonalAccessTokenModel {
        return this.getModel(
            'personalAccessTokenModel',
            () => new PersonalAccessTokenModel({ database: this.database }),
        );
    }

    public getPinnedListModel(): PinnedListModel {
        return this.getModel(
            'pinnedListModel',
            () => new PinnedListModel({ database: this.database }),
        );
    }

    public getProjectModel(): ProjectModel {
        return this.getModel(
            'projectModel',
            () =>
                new ProjectModel({
                    database: this.database,
                    lightdashConfig: this.lightdashConfig,
                    encryptionUtil: this.utils.getEncryptionUtil(),
                }),
        );
    }

    public getResourceViewItemModel(): ResourceViewItemModel {
        return this.getModel(
            'resourceViewItemModel',
            () => new ResourceViewItemModel({ database: this.database }),
        );
    }

    public getSavedChartModel(): SavedChartModel {
        return this.getModel(
            'savedChartModel',
            () =>
                new SavedChartModel({
                    database: this.database,
                    lightdashConfig: this.lightdashConfig,
                }),
        );
    }

    public getSchedulerModel(): SchedulerModel {
        return this.getModel(
            'schedulerModel',
            () => new SchedulerModel({ database: this.database }),
        );
    }

    public getSearchModel(): SearchModel {
        return this.getModel(
            'searchModel',
            () => new SearchModel({ database: this.database }),
        );
    }

    public getSessionModel(): SessionModel {
        return this.getModel(
            'sessionModel',
            () => new SessionModel(this.database),
        );
    }

    public getShareModel(): ShareModel {
        return this.getModel(
            'shareModel',
            () => new ShareModel({ database: this.database }),
        );
    }

    public getSlackAuthenticationModel(): SlackAuthenticationModel {
        return this.getModel(
            'slackAuthenticationModel',
            () => new SlackAuthenticationModel({ database: this.database }),
        );
    }

    public getSpaceModel(): SpaceModel {
        return this.getModel(
            'spaceModel',
            () => new SpaceModel({ database: this.database }),
        );
    }

    public getSshKeyPairModel(): SshKeyPairModel {
        return this.getModel(
            'sshKeyPairModel',
            () =>
                new SshKeyPairModel({
                    database: this.database,
                    encryptionUtil: this.utils.getEncryptionUtil(),
                }),
        );
    }

    public getUserAttributesModel(): UserAttributesModel {
        return this.getModel(
            'userAttributesModel',
            () => new UserAttributesModel({ database: this.database }),
        );
    }

    public getUserModel(): UserModel {
        return this.getModel(
            'userModel',
            () =>
                new UserModel({
                    database: this.database,
                    lightdashConfig: this.lightdashConfig,
                }),
        );
    }

    public getUserWarehouseCredentialsModel(): UserWarehouseCredentialsModel {
        return this.getModel(
            'userWarehouseCredentialsModel',
            () =>
                new UserWarehouseCredentialsModel({
                    database: this.database,
                    encryptionUtil: this.utils.getEncryptionUtil(),
                }),
        );
    }

    public getValidationModel(): ValidationModel {
        return this.getModel(
            'validationModel',
            () => new ValidationModel({ database: this.database }),
        );
    }

    public getCatalogModel(): CatalogModel {
        return this.getModel(
            'catalogModel',
            () => new CatalogModel({ database: this.database }),
        );
    }

    public getSavedSqlModel(): SavedSqlModel {
        return this.getModel(
            'savedSqlModel',
            () => new SavedSqlModel({ database: this.database }),
        );
    }

    public getAiModel<ModelImplT>(): ModelImplT {
        return this.getModel('aiModel');
    }

    public getEmbedModel<ModelImplT>(): ModelImplT {
        return this.getModel('embedModel');
    }

    public getDashboardSummaryModel<ModelImplT>(): ModelImplT {
        return this.getModel('dashboardSummaryModel');
    }

    /**
     * Handles initializing a model, and taking into account model
     * providers + memoization.
     *
     * If a factory is not provided, and a model provider is not defined,
     * this method throws an error. This should not happen in normal operation.
     */
    private getModel<K extends keyof ModelManifest, T extends ModelManifest[K]>(
        modelName: K,
        factory?: () => T,
    ): T {
        if (this.modelInstances[modelName] == null) {
            let modelInstance: T;

            if (this.providers[modelName] != null) {
                modelInstance = this.providers[modelName]!({
                    repository: this,
                    database: this.database,
                    utils: this.utils,
                }) as T;
            } else if (factory != null) {
                modelInstance = factory();
            } else {
                throw new Error(
                    `Unable to initialize model '${modelName}' - no factory or provider.`,
                );
            }

            this.modelInstances[modelName] = modelInstance;
        }

        return this.modelInstances[modelName] as T;
    }
}
