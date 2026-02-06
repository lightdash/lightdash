import {
    Account,
    AdminNotificationPayload,
    AdminNotificationType,
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

    async notifyConnectionSettingsChange(params: {
        organizationUuid: string;
        projectUuid: string;
        projectName: string;
        changedBy: Account;
    }): Promise<void> {
        if (!(await this.isFeatureEnabled(params.organizationUuid))) {
            this.logger.debug('Admin change notifications disabled', {
                organizationUuid: params.organizationUuid,
            });
            return;
        }

        const orgName = await this.getOrganizationName(params.organizationUuid);

        const recipients = await this.getProjectNotificationRecipients(
            params.organizationUuid,
            params.projectUuid,
        );

        if (recipients.length === 0) {
            this.logger.debug(
                'No recipients for connection settings change notification',
            );
            return;
        }

        const changedByInfo = AdminNotificationService.resolveChangedByAccount(
            params.changedBy,
        );

        const payload: AdminNotificationPayload = {
            type: AdminNotificationType.CONNECTION_SETTINGS_CHANGE,
            organizationUuid: params.organizationUuid,
            organizationName: orgName,
            projectUuid: params.projectUuid,
            projectName: params.projectName,
            changedBy: changedByInfo,
            timestamp: new Date(),
            settingsUrl: new URL(
                `/generalSettings/projectManagement/${params.projectUuid}/settings`,
                this.lightdashConfig.siteUrl,
            ).href,
        };

        this.logger.info('Sending connection settings change notification', {
            type: payload.type,
            organizationUuid: params.organizationUuid,
            projectUuid: params.projectUuid,
            recipientCount: recipients.length,
        });

        await this.emailClient.sendAdminChangeNotificationEmail(
            recipients,
            payload,
        );
    }
}
