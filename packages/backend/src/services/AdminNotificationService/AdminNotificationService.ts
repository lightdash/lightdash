import {
    Account,
    AdminNotificationPayload,
    AdminNotificationType,
    ChangeDetail,
    CreateWarehouseCredentials,
    DbtProjectConfig,
    DbtProjectType,
    FeatureFlags,
    OrganizationMemberRole,
    ProjectMemberRole,
} from '@lightdash/common';
import EmailClient from '../../clients/EmailClient/EmailClient';
import { LightdashConfig } from '../../config/parseConfig';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { OrganizationMemberProfileModel } from '../../models/OrganizationMemberProfileModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { UserModel } from '../../models/UserModel';
import { BaseService } from '../BaseService';

type AdminNotificationServiceArguments = {
    lightdashConfig: LightdashConfig;
    emailClient: EmailClient;
    featureFlagModel: FeatureFlagModel;
    organizationMemberProfileModel: OrganizationMemberProfileModel;
    organizationModel: OrganizationModel;
    projectModel: ProjectModel;
    userModel: UserModel;
};

export class AdminNotificationService extends BaseService {
    private readonly lightdashConfig: LightdashConfig;

    private readonly emailClient: EmailClient;

    private readonly featureFlagModel: FeatureFlagModel;

    private readonly organizationMemberProfileModel: OrganizationMemberProfileModel;

    private readonly organizationModel: OrganizationModel;

    private readonly projectModel: ProjectModel;

    private readonly userModel: UserModel;

    constructor({
        lightdashConfig,
        emailClient,
        featureFlagModel,
        organizationMemberProfileModel,
        organizationModel,
        projectModel,
        userModel,
    }: AdminNotificationServiceArguments) {
        super({ serviceName: 'AdminNotificationService' });
        this.lightdashConfig = lightdashConfig;
        this.emailClient = emailClient;
        this.featureFlagModel = featureFlagModel;
        this.organizationMemberProfileModel = organizationMemberProfileModel;
        this.organizationModel = organizationModel;
        this.projectModel = projectModel;
        this.userModel = userModel;
    }

    private async isFeatureEnabled(organizationUuid: string): Promise<boolean> {
        try {
            const flag = await this.featureFlagModel.get({
                featureFlagId: FeatureFlags.AdminChangeNotifications,
                user: {
                    userUuid: '',
                    organizationUuid,
                    organizationName: '',
                },
            });
            return flag.enabled;
        } catch {
            return false;
        }
    }

    private static getServiceAccountDescription(
        account: Account,
    ): string | undefined {
        if (account.authentication?.type === 'service-account') {
            return (account.authentication as { description?: string })
                .description;
        }
        return undefined;
    }

    private readonly warehouseFieldLabels: Record<string, string> = {
        type: 'Warehouse Type',
        host: 'Host',
        port: 'Port',
        user: 'Username',
        password: 'Password',
        database: 'Database',
        dbname: 'Database',
        schema: 'Schema',
        account: 'Account',
        warehouse: 'Warehouse',
        role: 'Role',
        project: 'Project',
        dataset: 'Dataset',
        threads: 'Threads',
        timeoutSeconds: 'Timeout (seconds)',
        priority: 'Priority',
        retries: 'Retries',
        location: 'Location',
        maximumBytesBilled: 'Maximum Bytes Billed',
        executionProject: 'Execution Project',
        keyfileContents: 'Service Account Key',
        requireUserCredentials: 'Require User Credentials',
        useSshTunnel: 'Use SSH Tunnel',
        sshTunnelHost: 'SSH Tunnel Host',
        sshTunnelPort: 'SSH Tunnel Port',
        sshTunnelUser: 'SSH Tunnel User',
        startOfWeek: 'Start of Week',
        catalog: 'Catalog',
        serverHostName: 'Server Hostname',
        httpPath: 'HTTP Path',
        personalAccessToken: 'Personal Access Token',
        authenticationType: 'Authentication Type',
        clientId: 'Client ID',
        clientSecret: 'Client Secret',
        token: 'Access Token',
        refreshToken: 'Refresh Token',
        oauthClientId: 'OAuth Client ID',
        oauthClientSecret: 'OAuth Client Secret',
        sslmode: 'SSL Mode',
        sslcert: 'SSL Certificate',
        sslkey: 'SSL Key',
        sslrootcert: 'SSL Root Certificate',
    };

    private readonly dbtFieldLabels: Record<string, string> = {
        type: 'Connection Type',
        repository: 'Repository',
        branch: 'Branch',
        project_sub_path: 'Project Sub-path',
        host_domain: 'Host Domain',
        target: 'Target',
        selector: 'Selector',
        personal_access_token: 'Personal Access Token',
        authorization_method: 'Authorization Method',
        installation_id: 'GitHub App Installation ID',
        environment_id: 'dbt Cloud Environment ID',
        api_key: 'API Key',
        discovery_api_endpoint: 'Discovery API Endpoint',
        tags: 'Tags',
        username: 'Username',
        organization: 'Organization',
        project: 'Project',
        profiles_dir: 'Profiles Directory',
        project_dir: 'Project Directory',
        manifest: 'Manifest',
        hideRefreshButton: 'Hide Refresh Button',
        environment: 'Environment Variables',
    };

    private async getProjectNotificationRecipients(
        organizationUuid: string,
        projectUuid: string,
        targetUserEmail?: string,
    ): Promise<string[]> {
        const [orgAdmins, projectAccess] = await Promise.all([
            this.organizationMemberProfileModel.getOrganizationAdmins(
                organizationUuid,
            ),
            this.projectModel.getProjectAccess(projectUuid),
        ]);

        const projectAdminEmails = projectAccess
            .filter((a) => a.role === ProjectMemberRole.ADMIN)
            .map((a) => a.email);

        const allEmails = [
            ...new Set([
                ...orgAdmins.map((a) => a.email),
                ...projectAdminEmails,
            ]),
        ];

        if (targetUserEmail && !allEmails.includes(targetUserEmail)) {
            allEmails.push(targetUserEmail);
        }

        return allEmails.filter(Boolean);
    }

    private static resolveChangedByAccount(
        account: Account,
    ): AdminNotificationPayload['changedBy'] {
        const accountUser =
            account.user?.type === 'registered' ? account.user : undefined;

        return {
            userUuid: accountUser?.userUuid,
            email: account.user?.email,
            firstName: accountUser?.firstName,
            lastName: accountUser?.lastName,
            role: accountUser?.role,
            isServiceAccount: account.isServiceAccount(),
            serviceAccountDescription:
                AdminNotificationService.getServiceAccountDescription(account),
        };
    }

    private async getOrganizationName(
        organizationUuid: string,
    ): Promise<string> {
        try {
            const org = await this.organizationModel.get(organizationUuid);
            return org.name;
        } catch (error) {
            this.logger.warn('Failed to get organization name', {
                organizationUuid,
                error,
            });
            return 'Unknown Organization';
        }
    }

    private getFieldLabel(field: string): string {
        if (this.warehouseFieldLabels[field]) {
            return this.warehouseFieldLabels[field];
        }
        return field
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, (str) => str.toUpperCase())
            .trim();
    }

    private static getDbtTypeLabel(type: DbtProjectType): string {
        const typeLabels: Record<DbtProjectType, string> = {
            [DbtProjectType.DBT]: 'Local dbt Project',
            [DbtProjectType.DBT_CLOUD_IDE]: 'dbt Cloud',
            [DbtProjectType.GITHUB]: 'GitHub',
            [DbtProjectType.GITLAB]: 'GitLab',
            [DbtProjectType.BITBUCKET]: 'Bitbucket',
            [DbtProjectType.AZURE_DEVOPS]: 'Azure DevOps',
            [DbtProjectType.NONE]: 'No dbt Connection',
            [DbtProjectType.MANIFEST]: 'Manifest Upload',
        };
        return typeLabels[type] ?? type;
    }

    private getDbtFieldLabel(field: string): string {
        if (this.dbtFieldLabels[field]) {
            return this.dbtFieldLabels[field];
        }
        return field
            .split('_')
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }

    private static serializeValue(value: unknown): string | undefined {
        if (value === undefined) return undefined;
        if (value === null) return 'null';
        if (Array.isArray(value)) return JSON.stringify(value.sort());
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    }

    async notifyOrgAdminRoleChange(
        account: Account,
        targetUserUuid: string,
        organizationUuid: string,
        previousRole: OrganizationMemberRole | undefined,
        newRole: OrganizationMemberRole,
    ): Promise<void> {
        const isEnabled = await this.isFeatureEnabled(organizationUuid);
        if (!isEnabled) {
            this.logger.debug('Admin change notifications disabled');
            return;
        }

        const isPromotion = newRole === OrganizationMemberRole.ADMIN;
        const isDemotion = previousRole === OrganizationMemberRole.ADMIN;

        if (!isPromotion && !isDemotion) {
            return;
        }

        try {
            const [organization, targetUser, orgAdmins] = await Promise.all([
                this.organizationModel.get(organizationUuid),
                this.userModel.getUserDetailsByUuid(targetUserUuid),
                this.organizationMemberProfileModel.getOrganizationAdmins(
                    organizationUuid,
                ),
            ]);

            const recipientEmails = orgAdmins
                .filter((admin) => admin.email)
                .map((admin) => admin.email);

            if (recipientEmails.length === 0) {
                this.logger.debug('No org admin recipients for notification');
                return;
            }

            const changes: ChangeDetail[] = [
                {
                    field: 'Organization Role',
                },
            ];

            const accountUser =
                account.user?.type === 'registered' ? account.user : undefined;

            const payload: AdminNotificationPayload = {
                type: isPromotion
                    ? AdminNotificationType.ORG_ADMIN_ADDED
                    : AdminNotificationType.ORG_ADMIN_REMOVED,
                organizationUuid,
                organizationName: organization.name,
                changedBy: {
                    userUuid: accountUser?.userUuid,
                    email: account.user?.email,
                    firstName: accountUser?.firstName,
                    lastName: accountUser?.lastName,
                    role: accountUser?.role,
                    isServiceAccount: account.isServiceAccount(),
                    serviceAccountDescription:
                        AdminNotificationService.getServiceAccountDescription(
                            account,
                        ),
                },
                targetUser: {
                    userUuid: targetUser.userUuid,
                    email: targetUser.email || '',
                    firstName: targetUser.firstName,
                    lastName: targetUser.lastName,
                },
                timestamp: new Date(),
                changes,
                settingsUrl: new URL(
                    '/generalSettings/userManagement',
                    this.lightdashConfig.siteUrl,
                ).href,
            };

            await this.emailClient.sendAdminChangeNotificationEmail(
                recipientEmails,
                payload,
            );

            this.logger.info(
                `Sent org admin ${
                    isPromotion ? 'promotion' : 'demotion'
                } notification to ${recipientEmails.length} recipients`,
            );
        } catch (error) {
            this.logger.error('Failed to send org admin change notification', {
                error,
                targetUserUuid,
                organizationUuid,
            });
        }
    }

    async notifyProjectAdminRoleChange(params: {
        account: Account;
        targetUserUuid: string;
        projectUuid: string;
        organizationUuid: string;
        previousRole: ProjectMemberRole | null;
        newRole: ProjectMemberRole | null;
    }): Promise<void> {
        const {
            account,
            targetUserUuid,
            projectUuid,
            organizationUuid,
            previousRole,
            newRole,
        } = params;
        const isEnabled = await this.isFeatureEnabled(organizationUuid);
        if (!isEnabled) {
            this.logger.debug('Admin change notifications disabled');
            return;
        }

        const isPromotion =
            newRole === ProjectMemberRole.ADMIN &&
            previousRole !== ProjectMemberRole.ADMIN;
        const isDemotion =
            previousRole === ProjectMemberRole.ADMIN &&
            newRole !== ProjectMemberRole.ADMIN;

        if (!isPromotion && !isDemotion) {
            return;
        }

        try {
            const [
                project,
                organization,
                targetUser,
                orgAdmins,
                projectAccess,
            ] = await Promise.all([
                this.projectModel.getSummary(projectUuid),
                this.organizationModel.get(organizationUuid),
                this.userModel.getUserDetailsByUuid(targetUserUuid),
                this.organizationMemberProfileModel.getOrganizationAdmins(
                    organizationUuid,
                ),
                this.projectModel.getProjectAccess(projectUuid),
            ]);

            const projectAdmins = projectAccess.filter(
                (member) => member.role === ProjectMemberRole.ADMIN,
            );

            const allAdminEmails = new Set<string>();
            for (const admin of orgAdmins) {
                if (admin.email) {
                    allAdminEmails.add(admin.email);
                }
            }
            for (const admin of projectAdmins) {
                if (admin.email) {
                    allAdminEmails.add(admin.email);
                }
            }

            const recipientEmails = Array.from(allAdminEmails);

            if (recipientEmails.length === 0) {
                this.logger.debug(
                    'No admin recipients for project notification',
                );
                return;
            }

            const changes: ChangeDetail[] = [
                {
                    field: 'Project Role',
                },
            ];

            const accountUser =
                account.user?.type === 'registered' ? account.user : undefined;

            const payload: AdminNotificationPayload = {
                type: isPromotion
                    ? AdminNotificationType.PROJECT_ADMIN_ADDED
                    : AdminNotificationType.PROJECT_ADMIN_REMOVED,
                organizationUuid,
                organizationName: organization.name,
                projectUuid,
                projectName: project.name,
                changedBy: {
                    userUuid: accountUser?.userUuid,
                    email: account.user?.email,
                    firstName: accountUser?.firstName,
                    lastName: accountUser?.lastName,
                    role: accountUser?.role,
                    isServiceAccount: account.isServiceAccount(),
                    serviceAccountDescription:
                        AdminNotificationService.getServiceAccountDescription(
                            account,
                        ),
                },
                targetUser: {
                    userUuid: targetUser.userUuid,
                    email: targetUser.email || '',
                    firstName: targetUser.firstName,
                    lastName: targetUser.lastName,
                },
                timestamp: new Date(),
                changes,
                settingsUrl: new URL(
                    `/projects/${projectUuid}/settings/projectManagement/projectAccess`,
                    this.lightdashConfig.siteUrl,
                ).href,
            };

            await this.emailClient.sendAdminChangeNotificationEmail(
                recipientEmails,
                payload,
            );

            this.logger.info(
                `Sent project admin ${
                    isPromotion ? 'promotion' : 'demotion'
                } notification to ${recipientEmails.length} recipients`,
            );
        } catch (error) {
            this.logger.error(
                'Failed to send project admin change notification',
                {
                    error,
                    targetUserUuid,
                    projectUuid,
                },
            );
        }
    }

    detectDatabaseChanges(
        before: CreateWarehouseCredentials | undefined,
        after: CreateWarehouseCredentials,
    ): ChangeDetail[] {
        const changes: ChangeDetail[] = [];

        if (before?.type !== after.type) {
            changes.push({
                field: 'Warehouse Type',
            });

            if (before !== undefined) {
                this.logger.debug(
                    'Warehouse type changed, skipping field comparison',
                    {
                        previousType: before.type,
                        newType: after.type,
                    },
                );
                return changes;
            }
        }

        const allKeys = new Set<string>([
            ...Object.keys(before ?? {}),
            ...Object.keys(after),
        ]);

        Array.from(allKeys)
            .filter((key) => key !== 'type')
            .forEach((key) => {
                const beforeValue =
                    before?.[key as keyof CreateWarehouseCredentials];
                const afterValue =
                    after[key as keyof CreateWarehouseCredentials];

                const beforeStr =
                    typeof beforeValue === 'object'
                        ? JSON.stringify(beforeValue)
                        : beforeValue;
                const afterStr =
                    typeof afterValue === 'object'
                        ? JSON.stringify(afterValue)
                        : afterValue;

                if (beforeStr === afterStr) return;
                if (beforeValue === undefined && afterValue === undefined)
                    return;

                changes.push({
                    field: this.getFieldLabel(key),
                });
            });

        this.logger.debug('Detected database connection changes', {
            warehouseType: after.type,
            changeCount: changes.length,
            fields: changes.map((c) => c.field),
        });

        return changes;
    }

    async notifyDatabaseConnectionChange(params: {
        organizationUuid: string;
        projectUuid: string;
        projectName: string;
        changedBy: Account;
        changes: ChangeDetail[];
    }): Promise<void> {
        if (!(await this.isFeatureEnabled(params.organizationUuid))) {
            this.logger.debug('Admin change notifications disabled', {
                organizationUuid: params.organizationUuid,
            });
            return;
        }

        if (params.changes.length === 0) {
            return;
        }

        const orgName = await this.getOrganizationName(params.organizationUuid);

        const recipients = await this.getProjectNotificationRecipients(
            params.organizationUuid,
            params.projectUuid,
        );

        if (recipients.length === 0) {
            this.logger.debug(
                'No recipients for database connection change notification',
            );
            return;
        }

        const changedByInfo = AdminNotificationService.resolveChangedByAccount(
            params.changedBy,
        );

        const payload: AdminNotificationPayload = {
            type: AdminNotificationType.DATABASE_CONNECTION_CHANGE,
            organizationUuid: params.organizationUuid,
            organizationName: orgName,
            projectUuid: params.projectUuid,
            projectName: params.projectName,
            changedBy: changedByInfo,
            timestamp: new Date(),
            changes: params.changes,
            settingsUrl: new URL(
                `/generalSettings/projectManagement/${params.projectUuid}/settings`,
                this.lightdashConfig.siteUrl,
            ).href,
        };

        this.logger.info('Sending database connection change notification', {
            type: payload.type,
            organizationUuid: params.organizationUuid,
            projectUuid: params.projectUuid,
            recipientCount: recipients.length,
            changedFields: params.changes.map((c) => c.field),
        });

        await this.emailClient.sendAdminChangeNotificationEmail(
            recipients,
            payload,
        );
    }

    detectDbtChanges(
        before: DbtProjectConfig | undefined,
        after: DbtProjectConfig,
    ): ChangeDetail[] {
        const changes: ChangeDetail[] = [];

        if (before?.type !== after.type) {
            changes.push({
                field: 'Connection Type',
            });

            if (before !== undefined) {
                this.logger.debug(
                    'dbt connection type changed, skipping field comparison',
                    {
                        previousType: before.type,
                        newType: after.type,
                    },
                );
                return changes;
            }
        }

        const allKeys = new Set<string>([
            ...Object.keys(before ?? {}),
            ...Object.keys(after),
        ]);

        Array.from(allKeys)
            .filter((key) => key !== 'type')
            .forEach((key) => {
                const beforeValue = (
                    before as unknown as Record<string, unknown>
                )?.[key];
                const afterValue = (
                    after as unknown as Record<string, unknown>
                )[key];

                const beforeStr =
                    AdminNotificationService.serializeValue(beforeValue);
                const afterStr =
                    AdminNotificationService.serializeValue(afterValue);

                if (beforeStr === afterStr) return;
                if (beforeValue === undefined && afterValue === undefined)
                    return;

                changes.push({
                    field: this.getDbtFieldLabel(key),
                });
            });

        this.logger.debug('Detected dbt connection changes', {
            dbtType: after.type,
            changeCount: changes.length,
            fields: changes.map((c) => c.field),
        });

        return changes;
    }

    async notifyDbtConnectionChange(params: {
        organizationUuid: string;
        projectUuid: string;
        projectName: string;
        changedBy: Account;
        changes: ChangeDetail[];
    }): Promise<void> {
        if (!(await this.isFeatureEnabled(params.organizationUuid))) {
            this.logger.debug('Admin change notifications disabled', {
                organizationUuid: params.organizationUuid,
            });
            return;
        }

        if (params.changes.length === 0) {
            return;
        }

        const orgName = await this.getOrganizationName(params.organizationUuid);

        const recipients = await this.getProjectNotificationRecipients(
            params.organizationUuid,
            params.projectUuid,
        );

        if (recipients.length === 0) {
            this.logger.debug(
                'No recipients for dbt connection change notification',
            );
            return;
        }

        const changedByInfo = AdminNotificationService.resolveChangedByAccount(
            params.changedBy,
        );

        const payload: AdminNotificationPayload = {
            type: AdminNotificationType.DBT_CONNECTION_CHANGE,
            organizationUuid: params.organizationUuid,
            organizationName: orgName,
            projectUuid: params.projectUuid,
            projectName: params.projectName,
            changedBy: changedByInfo,
            timestamp: new Date(),
            changes: params.changes,
            settingsUrl: new URL(
                `/generalSettings/projectManagement/${params.projectUuid}/settings`,
                this.lightdashConfig.siteUrl,
            ).href,
        };

        this.logger.info('Sending dbt connection change notification', {
            type: payload.type,
            organizationUuid: params.organizationUuid,
            projectUuid: params.projectUuid,
            recipientCount: recipients.length,
            changedFields: params.changes.map((c) => c.field),
        });

        await this.emailClient.sendAdminChangeNotificationEmail(
            recipients,
            payload,
        );
    }
}
