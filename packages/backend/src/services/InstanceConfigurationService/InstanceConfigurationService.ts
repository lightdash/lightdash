import {
    AllowedEmailDomains,
    CreateProject,
    CreateWarehouseCredentials,
    DbtProjectConfig,
    isGitProjectType,
    NotExistsError,
    OrganizationMemberRole,
    ParameterError,
    ProjectType,
    RequestMethod,
    ServiceAccountScope,
    UnexpectedServerError,
    UpdateProject,
    validateOrganizationEmailDomains,
    WarehouseTypes,
} from '@lightdash/common';
import { LightdashAnalytics } from '../../analytics/LightdashAnalytics';
import { LightdashConfig } from '../../config/parseConfig';
import { EmbedModel } from '../../ee/models/EmbedModel';
import { ServiceAccountModel } from '../../ee/models/ServiceAccountModel';
import { PersonalAccessTokenModel } from '../../models/DashboardModel/PersonalAccessTokenModel';
import { EmailModel } from '../../models/EmailModel';
import { OrganizationAllowedEmailDomainsModel } from '../../models/OrganizationAllowedEmailDomainsModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { UserModel } from '../../models/UserModel';
import { EncryptionUtil } from '../../utils/EncryptionUtil/EncryptionUtil';
import { BaseService } from '../BaseService';
import { ProjectService } from '../ProjectService/ProjectService';

type InstanceConfigurationServiceArguments = {
    lightdashConfig: LightdashConfig;
    analytics: LightdashAnalytics;
    organizationModel: OrganizationModel;
    projectModel: ProjectModel;
    userModel: UserModel;

    organizationAllowedEmailDomainsModel: OrganizationAllowedEmailDomainsModel;
    personalAccessTokenModel: PersonalAccessTokenModel;
    emailModel: EmailModel;
    projectService: ProjectService; // For compiling project on new setup
    serviceAccountModel?: ServiceAccountModel; // For creating service account on new setup
    embedModel?: EmbedModel; // For updating embed settings on new setup
    encryptionUtil: EncryptionUtil; // For encrypting embed secrets
};

export class InstanceConfigurationService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly analytics: LightdashAnalytics;

    private readonly organizationModel: OrganizationModel;

    private readonly projectModel: ProjectModel;

    private readonly userModel: UserModel;

    private readonly organizationAllowedEmailDomainsModel: OrganizationAllowedEmailDomainsModel;

    private readonly personalAccessTokenModel: PersonalAccessTokenModel;

    private readonly emailModel: EmailModel;

    private readonly projectService: ProjectService;

    private readonly serviceAccountModel?: ServiceAccountModel;

    private readonly embedModel?: EmbedModel;

    private readonly encryptionUtil: EncryptionUtil;

    constructor({
        lightdashConfig,
        analytics,
        organizationModel,
        projectModel,
        userModel,
        organizationAllowedEmailDomainsModel,
        personalAccessTokenModel,
        emailModel,
        projectService,
        serviceAccountModel,
        embedModel,
        encryptionUtil,
    }: InstanceConfigurationServiceArguments) {
        super();
        this.lightdashConfig = lightdashConfig;
        this.analytics = analytics;
        this.organizationModel = organizationModel;
        this.projectModel = projectModel;
        this.userModel = userModel;
        this.organizationAllowedEmailDomainsModel =
            organizationAllowedEmailDomainsModel;
        this.personalAccessTokenModel = personalAccessTokenModel;
        this.emailModel = emailModel;
        this.projectService = projectService;
        this.serviceAccountModel = serviceAccountModel;
        this.embedModel = embedModel;
        this.encryptionUtil = encryptionUtil;
    }

    async initializeInstance() {
        // No permissions check here, there are no users yet
        // No initial setup, we skip this step
        if (!this.lightdashConfig.initialSetup) {
            this.logger.debug(`No initial setup config found, skipping`);
            return;
        }
        try {
            const setup = this.lightdashConfig.initialSetup;
            // If no project is set, we can create a new one using environment variables
            const hasOrgs = await this.organizationModel.hasOrgs();

            if (hasOrgs) {
                this.logger.debug(
                    `Initial setup: There is already an organization, we skip this initial setup`,
                );
                return;
            }
            const hasAnyProjects = await this.projectModel.hasAnyProjects();

            if (hasAnyProjects) {
                // This should not happen, since we can't have projects without orgs
                throw new UnexpectedServerError(
                    `Initial setup: cannot initialize instance, there are already defined projects. Exiting`,
                );
            }

            // No organization and no projects, we can create a new one
            // using the initial setup config
            this.logger.debug(
                `Initial setup: Creating organization "${setup.organization.name}"`,
            );

            const { organizationUuid } = await this.organizationModel.create({
                name: setup.organization.name,
            });

            this.logger.info(
                `Initial setup: Organization "${organizationUuid}" created`,
            );

            this.logger.debug(
                `Initial setup: Creating admin user with email "${setup.organization.admin.email}"`,
            );

            // We need `AUTH_ENABLE_OIDC_TO_EMAIL_LINKING=true`
            // So the user can login using SSO for the pending user
            const { email, name: adminName } = setup.organization.admin;
            const user = await this.userModel.createPendingUser(
                organizationUuid,
                {
                    firstName: adminName.split(' ')[0],
                    lastName: adminName.split(' ').slice(1).join(' '),
                    email,
                    role: OrganizationMemberRole.ADMIN,
                    password: undefined,
                },
            );
            // whatever email they use here will be trusted. And any user with an OIDC account with that email will access the admin user.
            await this.emailModel.verifyUserEmailIfExists(user.userUuid, email);

            this.logger.info(`Initial setup: User ${user.userUuid} created`);

            this.logger.debug(
                `Initial setup: Creating project "${setup.project.name}"`,
            );
            const project: CreateProject = {
                name: setup.project.name,
                type: ProjectType.DEFAULT,
                warehouseConnection: setup.project,
                copyWarehouseConnectionFromUpstreamProject: undefined,
                dbtConnection: setup.dbt,
                upstreamProjectUuid: undefined,
                dbtVersion: setup.project.dbtVersion,
            };

            const projectUuid = await this.projectModel.create(
                user.userUuid,
                organizationUuid,
                project,
            );
            this.logger.info(`Initial setup: Project ${projectUuid} created`);

            this.logger.info(`Initial setup: Compiling project ${projectUuid}`);

            const sessionUser =
                await this.userModel.findSessionUserAndOrgByUuid(
                    user.userUuid,
                    organizationUuid,
                );
            await this.projectService.scheduleCompileProject(
                sessionUser,
                projectUuid,
                RequestMethod.BACKEND,
                true, // Skip permission check
            );

            // Optional steps are performed at the end
            if (
                setup.organization.emailDomains &&
                setup.organization.emailDomains.length > 0
            ) {
                this.logger.debug(
                    `Initial setup: Whitelisting domains "${setup.organization.emailDomains.join(
                        ', ',
                    )}"`,
                );
                const { emailDomains } = setup.organization;
                // Validates input
                const error = validateOrganizationEmailDomains(emailDomains);
                if (error) {
                    throw new ParameterError(error);
                }
                const allowedDomains: AllowedEmailDomains = {
                    organizationUuid,
                    emailDomains,
                    role: setup.organization.defaultRole,
                    projects: [],
                };
                await this.organizationAllowedEmailDomainsModel.upsertAllowedEmailDomains(
                    allowedDomains,
                );

                this.logger.info(
                    `Initial setup: Whitelisted domains "${setup.organization.emailDomains.join(
                        ', ',
                    )}"`,
                );
            } else {
                this.logger.info(
                    `Initial setup: No whitelisted domains, skipping`,
                );
            }

            if (setup.serviceAccount && this.serviceAccountModel) {
                this.logger.debug(`Initial setup: creating service account`);
                await this.serviceAccountModel.save(
                    sessionUser,
                    {
                        organizationUuid,
                        expiresAt: setup.serviceAccount.expirationTime,
                        description: 'Initial setup service account',
                        scopes: [ServiceAccountScope.ORG_ADMIN],
                    },
                    setup.serviceAccount.token,
                );
                this.logger.info(`Initial setup: service account created`);
            } else {
                this.logger.info(
                    `Initial setup: No service account token provided, skipping`,
                );
            }

            if (setup.apiKey) {
                this.logger.debug(`Initial setup: creating API key`);

                await this.personalAccessTokenModel.save(sessionUser, {
                    expiresAt: setup.apiKey.expirationTime,
                    description: 'Initial setup API token',
                    autoGenerated: false,
                    token: setup.apiKey.token,
                });
                this.logger.info(`Initial setup: API key created`);
            } else {
                this.logger.info(
                    `Initial setup: No API key provided, skipping`,
                );
            }

            // Setup embed if configured
            if (this.lightdashConfig.updateSetup?.embed) {
                await this.updateEmbedSettingsForInstance(
                    this.lightdashConfig.updateSetup,
                );
            }
        } catch (error) {
            this.logger.error(
                `Initial setup: Error initializing project: ${error}`,
            );
            throw error;
        }
    }

    /**
     * Update API key for admin
     * revoke other existing PATs for the admin.
     */
    private async updateApiKeyForAdmin(config: LightdashConfig['updateSetup']) {
        if (!config) return;

        const adminEmail = config.organization?.admin?.email;

        if (config.apiKey?.token && adminEmail) {
            this.logger.debug(
                `Update instance: Updating API key for user ${adminEmail}`,
            );
            const sessionUser =
                await this.userModel.findSessionUserByPrimaryEmail(adminEmail);
            if (!sessionUser) {
                throw new NotExistsError(`User ${adminEmail} not found`);
            }
            // Revoke other existing PATs for the admin.
            await this.personalAccessTokenModel.deleteAllTokensForUser(
                sessionUser.userId,
            );
            // Create new PAT
            await this.personalAccessTokenModel.save(sessionUser, {
                expiresAt: config.apiKey.expirationTime,
                description: 'Updated API token',
                autoGenerated: false,
                token: config.apiKey.token,
            });
            this.logger.info(
                `Update instance: Updated API key for user ${adminEmail}`,
            );
        }
    }

    /*
     * Update API key for service account
     */
    private async updateServiceAccountForAdmin(
        config: LightdashConfig['updateSetup'],
    ) {
        if (!config) return;

        if (config.serviceAccount && this.serviceAccountModel) {
            // This will throw an error if there is not exactly 1 org
            const orgUuid = await this.getSingleOrg();
            this.logger.debug(
                `Update instance: Updating API key for service account`,
            );
            const existingServiceAccounts =
                await this.serviceAccountModel.getAllForOrganization(orgUuid, [
                    ServiceAccountScope.ORG_ADMIN,
                ]);
            this.logger.debug(
                `Update instance: Deleting ${existingServiceAccounts.length} existing service accounts`,
            );

            // We will delete all existing service accounts with the org admin scope
            // before creating a new one.
            await Promise.all(
                existingServiceAccounts.map((sa) =>
                    this.serviceAccountModel?.delete(sa.uuid),
                ),
            );

            await this.serviceAccountModel.save(
                undefined, // user
                {
                    organizationUuid: orgUuid,
                    expiresAt: config.serviceAccount.expirationTime,
                    description: 'Updated service account',
                    scopes: [ServiceAccountScope.ORG_ADMIN],
                },
                config.serviceAccount.token,
            );

            this.logger.info(
                `Update instance: Updated service account for org ${orgUuid}`,
            );
        } else {
            this.logger.debug(
                `Update instance: No service account token provided, skipping`,
            );
        }
    }

    /**
     * Update one or many of the following properties on the configuration
     * - Github dbt PAT
     * - Databricks project httpPath
     * - Databricks project dbtVersion
     */
    private async updateProjectConfiguration(
        config: LightdashConfig['updateSetup'],
    ) {
        if (!config) return;

        if (
            config.dbt?.personal_access_token ||
            config.project?.httpPath ||
            config.project?.dbtVersion ||
            config.project?.personalAccessToken
        ) {
            // This will throw an error if there is not exactly 1 project
            const projectUuid = await this.getSingleProject();
            this.logger.debug(
                `Update instance: Updating configuration for project ${projectUuid}`,
            );

            const project = await this.projectModel.getWithSensitiveFields(
                projectUuid,
            );

            const { warehouseConnection, dbtConnection } = project;

            if (!warehouseConnection) {
                throw new ParameterError(
                    `Project ${projectUuid} has no warehouse connection`,
                );
            }

            // Update dbt connection
            let updatedDbtConnection: DbtProjectConfig | undefined;
            if (config.dbt?.personal_access_token) {
                if (!isGitProjectType(dbtConnection)) {
                    throw new ParameterError(
                        `Project ${projectUuid} is not a git project`,
                    );
                }
                updatedDbtConnection = {
                    ...dbtConnection,
                    personal_access_token: config.dbt.personal_access_token,
                };
            }
            // Update warehouse connection
            let updatedWarehouseConnection:
                | CreateWarehouseCredentials
                | undefined;
            if (
                config.project?.httpPath ||
                config.project?.personalAccessToken
            ) {
                if (warehouseConnection.type !== WarehouseTypes.DATABRICKS) {
                    throw new ParameterError(
                        `Project ${projectUuid} is not a Databricks project. Only Databricks projects are supported at the moment.`,
                    );
                }
                updatedWarehouseConnection = {
                    ...warehouseConnection,
                    ...(config.project.httpPath && {
                        httpPath: config.project.httpPath,
                    }),
                    ...(config.project.personalAccessToken && {
                        personalAccessToken: config.project.personalAccessToken,
                    }),
                };
            }

            const updatedProject: UpdateProject = {
                ...project,
                warehouseConnection:
                    updatedWarehouseConnection ?? warehouseConnection,
                dbtVersion: config.project?.dbtVersion || project.dbtVersion,
                dbtConnection: updatedDbtConnection ?? dbtConnection,
            };

            await this.projectModel.update(projectUuid, updatedProject);

            this.logger.info(
                `Update instance: Updated configuration for project ${projectUuid}`,
            );
        } else {
            this.logger.debug(`Update instance: No configuration to update`);
        }
    }

    private async getSingleOrg() {
        const orgUuids = await this.organizationModel.getOrgUuids();
        if (orgUuids.length !== 1) {
            throw new ParameterError(
                `There must be exactly 1 organization to update instance configuration, remove all the LD_SETUP* env variables or keep only one organization to continue`,
            );
        }
        return orgUuids[0];
    }

    private async getSingleProject() {
        const projectUuids = await this.projectModel.getDefaultProjectUuids();
        if (projectUuids.length !== 1) {
            throw new ParameterError(
                `There must be exactly 1 project to update instance configuration, remove all the LD_SETUP* env variables or keep only one project to continue`,
            );
        }
        return projectUuids[0];
    }

    private async updateOrganizationDefaultRole(
        config: NonNullable<LightdashConfig['updateSetup']>,
    ) {
        if (
            !config.organization?.defaultRole ||
            !config.organization?.emailDomains ||
            config.organization.emailDomains.length === 0
        ) {
            this.logger.debug(
                `Update instance: No default role config found, skipping`,
            );
            return;
        }

        const orgUuid = await this.getSingleOrg();

        const { emailDomains } = config.organization;
        // Validates input
        const error = validateOrganizationEmailDomains(emailDomains);
        if (error) {
            throw new ParameterError(error);
        }
        const allowedDomains: AllowedEmailDomains = {
            organizationUuid: orgUuid,
            emailDomains,
            role: config.organization.defaultRole,
            projects: [],
        };
        await this.organizationAllowedEmailDomainsModel.upsertAllowedEmailDomains(
            allowedDomains,
        );

        this.logger.info(
            `Update instance: Updated default role to ${
                config.organization.defaultRole
            } for domains "${emailDomains.join(
                ', ',
            )}" in organization ${orgUuid}`,
        );
    }

    private async updateEmbedSettingsForInstance(
        config: NonNullable<LightdashConfig['updateSetup']>,
    ) {
        if (!config.embed || !this.embedModel) return;

        const { allowAllDashboards, secret } = config.embed;
        if (allowAllDashboards === undefined && !secret) return;

        try {
            const projectUuid = await this.getSingleProject();

            // If config embed secret is provided, we need to call .save to upsert the embed record
            // This requires a user UUID, we get it from the admin email
            if (secret) {
                let userUuid: string | undefined;
                const adminEmail = config.organization?.admin?.email;
                if (adminEmail) {
                    const sessionUser =
                        await this.userModel.findSessionUserByPrimaryEmail(
                            adminEmail,
                        );
                    userUuid = sessionUser?.userUuid;
                }

                if (!userUuid) {
                    throw new ParameterError(
                        `Setting embed secret LD_SETUP_EMBED_SECRET requires an admin email LD_SETUP_ADMIN_EMAIL`,
                    );
                }

                const encodedSecret = this.encryptionUtil.encrypt(secret);

                await this.embedModel.save(
                    projectUuid,
                    encodedSecret,
                    userUuid,
                    [],
                    allowAllDashboards ?? false,
                );
                this.logger.info(
                    `Embed created for project ${projectUuid} with allowAllDashboards=${
                        allowAllDashboards ?? false
                    }`,
                );
            } else if (allowAllDashboards) {
                this.logger.info(
                    'No embed secret provided, enabling allowAllDashboards if configured',
                );
                await this.embedModel.updateDashboards(projectUuid, {
                    dashboardUuids: [],
                    allowAllDashboards,
                });
            }
        } catch (error) {
            this.logger.error(`Error updating embed settings: ${error}`);
        }
    }

    async updateInstanceConfiguration() {
        const config = this.lightdashConfig.updateSetup;
        if (!config) {
            this.logger.debug(
                `Update instance: No update setup config found, skipping`,
            );
            return;
        }

        await this.updateApiKeyForAdmin(config);

        await this.updateServiceAccountForAdmin(config);

        await this.updateProjectConfiguration(config);

        await this.updateOrganizationDefaultRole(config);

        await this.updateEmbedSettingsForInstance(config);
    }
}
