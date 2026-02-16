import {
    AdminNotificationPayload,
    AdminNotificationType,
    OrganizationMemberRole,
    ProjectMemberRole,
} from '@lightdash/common';
import EmailClient from '../../clients/EmailClient/EmailClient';
import { lightdashConfigMock } from '../../config/lightdashConfig.mock';
import { FeatureFlagModel } from '../../models/FeatureFlagModel/FeatureFlagModel';
import { OrganizationMemberProfileModel } from '../../models/OrganizationMemberProfileModel';
import { OrganizationModel } from '../../models/OrganizationModel';
import { ProjectModel } from '../../models/ProjectModel/ProjectModel';
import { UserModel } from '../../models/UserModel';
import { AdminNotificationService } from './AdminNotificationService';
import {
    mockOrgAdmin1,
    mockOrgAdmin2,
    mockOrganization,
    mockOrganizationUuid,
    mockProjectAdmin,
    mockProjectSummary,
    mockProjectUuid,
    mockServiceAccount,
    mockSessionAccount,
    mockTargetUser,
    mockTargetUserUuid,
} from './AdminNotificationService.mock';

const sendAdminChangeNotificationEmail = jest.fn<
    Promise<void>,
    [string[], AdminNotificationPayload]
>();

const emailClient = {
    sendAdminChangeNotificationEmail,
};

const featureFlagModel = {
    get: jest.fn(async () => ({ enabled: true })),
};

const organizationMemberProfileModel = {
    getOrganizationAdmins: jest.fn(async () => [mockOrgAdmin1, mockOrgAdmin2]),
};

const organizationModel = {
    get: jest.fn(async () => mockOrganization),
};

const projectModel = {
    getSummary: jest.fn(async () => mockProjectSummary),
    getProjectAccess: jest.fn(async () => [mockProjectAdmin]),
};

const userModel = {
    getUserDetailsByUuid: jest.fn(async () => mockTargetUser),
};

describe('AdminNotificationService', () => {
    const service = new AdminNotificationService({
        lightdashConfig: lightdashConfigMock,
        emailClient: emailClient as unknown as EmailClient,
        featureFlagModel: featureFlagModel as unknown as FeatureFlagModel,
        organizationMemberProfileModel:
            organizationMemberProfileModel as unknown as OrganizationMemberProfileModel,
        organizationModel: organizationModel as unknown as OrganizationModel,
        projectModel: projectModel as unknown as ProjectModel,
        userModel: userModel as unknown as UserModel,
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('should not send org notification when feature flag is disabled', async () => {
        (featureFlagModel.get as jest.Mock).mockResolvedValueOnce({
            enabled: false,
        });

        await service.notifyOrgAdminRoleChange(
            mockSessionAccount,
            mockTargetUserUuid,
            mockOrganizationUuid,
            OrganizationMemberRole.MEMBER,
            OrganizationMemberRole.ADMIN,
        );

        expect(sendAdminChangeNotificationEmail).not.toHaveBeenCalled();
    });

    it('should not send org notification when feature flag check throws', async () => {
        (featureFlagModel.get as jest.Mock).mockRejectedValueOnce(
            new Error('Feature flag error'),
        );

        await service.notifyOrgAdminRoleChange(
            mockSessionAccount,
            mockTargetUserUuid,
            mockOrganizationUuid,
            OrganizationMemberRole.MEMBER,
            OrganizationMemberRole.ADMIN,
        );

        expect(sendAdminChangeNotificationEmail).not.toHaveBeenCalled();
    });

    it('should send notification when promoting user to org admin', async () => {
        await service.notifyOrgAdminRoleChange(
            mockSessionAccount,
            mockTargetUserUuid,
            mockOrganizationUuid,
            OrganizationMemberRole.MEMBER,
            OrganizationMemberRole.ADMIN,
        );

        expect(sendAdminChangeNotificationEmail).toHaveBeenCalledTimes(1);
        expect(sendAdminChangeNotificationEmail.mock.calls[0][0]).toEqual([
            mockOrgAdmin1.email,
            mockOrgAdmin2.email,
            mockTargetUser.email,
        ]);
        expect(sendAdminChangeNotificationEmail.mock.calls[0][1].type).toBe(
            AdminNotificationType.ORG_ADMIN_ADDED,
        );
    });

    it('should send notification when demoting user from org admin', async () => {
        await service.notifyOrgAdminRoleChange(
            mockSessionAccount,
            mockTargetUserUuid,
            mockOrganizationUuid,
            OrganizationMemberRole.ADMIN,
            OrganizationMemberRole.MEMBER,
        );

        expect(sendAdminChangeNotificationEmail).toHaveBeenCalledTimes(1);
        expect(sendAdminChangeNotificationEmail.mock.calls[0][1].type).toBe(
            AdminNotificationType.ORG_ADMIN_REMOVED,
        );
    });

    it('should not send org notification for non-admin role changes', async () => {
        await service.notifyOrgAdminRoleChange(
            mockSessionAccount,
            mockTargetUserUuid,
            mockOrganizationUuid,
            OrganizationMemberRole.MEMBER,
            OrganizationMemberRole.EDITOR,
        );

        expect(sendAdminChangeNotificationEmail).not.toHaveBeenCalled();
    });

    it('should not send org notification when editor becomes viewer', async () => {
        await service.notifyOrgAdminRoleChange(
            mockSessionAccount,
            mockTargetUserUuid,
            mockOrganizationUuid,
            OrganizationMemberRole.EDITOR,
            OrganizationMemberRole.VIEWER,
        );

        expect(sendAdminChangeNotificationEmail).not.toHaveBeenCalled();
    });

    it('should include correct target user information in org notification', async () => {
        await service.notifyOrgAdminRoleChange(
            mockSessionAccount,
            mockTargetUserUuid,
            mockOrganizationUuid,
            OrganizationMemberRole.MEMBER,
            OrganizationMemberRole.ADMIN,
        );

        expect(
            sendAdminChangeNotificationEmail.mock.calls[0][1].targetUser,
        ).toEqual({
            userUuid: mockTargetUser.userUuid,
            email: mockTargetUser.email,
            firstName: mockTargetUser.firstName,
            lastName: mockTargetUser.lastName,
        });
    });

    it('should include correct changedBy for session user', async () => {
        await service.notifyOrgAdminRoleChange(
            mockSessionAccount,
            mockTargetUserUuid,
            mockOrganizationUuid,
            OrganizationMemberRole.MEMBER,
            OrganizationMemberRole.ADMIN,
        );

        const payload = sendAdminChangeNotificationEmail.mock.calls[0][1];
        expect(payload.changedBy.isServiceAccount).toBe(false);
        expect(payload.changedBy.email).toBe(mockSessionAccount.user?.email);
    });

    it('should include service account info when changed by service account', async () => {
        await service.notifyOrgAdminRoleChange(
            mockServiceAccount,
            mockTargetUserUuid,
            mockOrganizationUuid,
            OrganizationMemberRole.MEMBER,
            OrganizationMemberRole.ADMIN,
        );

        const payload = sendAdminChangeNotificationEmail.mock.calls[0][1];
        expect(payload.changedBy.isServiceAccount).toBe(true);
        expect(payload.changedBy.serviceAccountDescription).toBe(
            'Automated sync service',
        );
    });

    it('should include correct settings URL for org admin change', async () => {
        await service.notifyOrgAdminRoleChange(
            mockSessionAccount,
            mockTargetUserUuid,
            mockOrganizationUuid,
            OrganizationMemberRole.MEMBER,
            OrganizationMemberRole.ADMIN,
        );

        expect(
            sendAdminChangeNotificationEmail.mock.calls[0][1].settingsUrl,
        ).toContain('/generalSettings/userManagement');
    });

    it('should not throw when email sending fails', async () => {
        (sendAdminChangeNotificationEmail as jest.Mock).mockRejectedValueOnce(
            new Error('SMTP error'),
        );

        await expect(
            service.notifyOrgAdminRoleChange(
                mockSessionAccount,
                mockTargetUserUuid,
                mockOrganizationUuid,
                OrganizationMemberRole.MEMBER,
                OrganizationMemberRole.ADMIN,
            ),
        ).resolves.not.toThrow();
    });

    it('should not throw when fetching org data fails', async () => {
        (organizationModel.get as jest.Mock).mockRejectedValueOnce(
            new Error('DB error'),
        );

        await expect(
            service.notifyOrgAdminRoleChange(
                mockSessionAccount,
                mockTargetUserUuid,
                mockOrganizationUuid,
                OrganizationMemberRole.MEMBER,
                OrganizationMemberRole.ADMIN,
            ),
        ).resolves.not.toThrow();
    });

    it('should not send project notification when feature flag is disabled', async () => {
        (featureFlagModel.get as jest.Mock).mockResolvedValueOnce({
            enabled: false,
        });

        await service.notifyProjectAdminRoleChange({
            account: mockSessionAccount,
            targetUserUuid: mockTargetUserUuid,
            projectUuid: mockProjectUuid,
            organizationUuid: mockOrganizationUuid,
            previousRole: ProjectMemberRole.EDITOR,
            newRole: ProjectMemberRole.ADMIN,
        });

        expect(sendAdminChangeNotificationEmail).not.toHaveBeenCalled();
    });

    it('should send notification when promoting user to project admin', async () => {
        await service.notifyProjectAdminRoleChange({
            account: mockSessionAccount,
            targetUserUuid: mockTargetUserUuid,
            projectUuid: mockProjectUuid,
            organizationUuid: mockOrganizationUuid,
            previousRole: ProjectMemberRole.EDITOR,
            newRole: ProjectMemberRole.ADMIN,
        });

        expect(sendAdminChangeNotificationEmail).toHaveBeenCalledTimes(1);
        expect(sendAdminChangeNotificationEmail.mock.calls[0][1].type).toBe(
            AdminNotificationType.PROJECT_ADMIN_ADDED,
        );
    });

    it('should send notification when demoting user from project admin', async () => {
        await service.notifyProjectAdminRoleChange({
            account: mockSessionAccount,
            targetUserUuid: mockTargetUserUuid,
            projectUuid: mockProjectUuid,
            organizationUuid: mockOrganizationUuid,
            previousRole: ProjectMemberRole.ADMIN,
            newRole: ProjectMemberRole.EDITOR,
        });

        expect(sendAdminChangeNotificationEmail).toHaveBeenCalledTimes(1);
        expect(sendAdminChangeNotificationEmail.mock.calls[0][1].type).toBe(
            AdminNotificationType.PROJECT_ADMIN_REMOVED,
        );
    });

    it('should not send project notification for non-admin role changes', async () => {
        await service.notifyProjectAdminRoleChange({
            account: mockSessionAccount,
            targetUserUuid: mockTargetUserUuid,
            projectUuid: mockProjectUuid,
            organizationUuid: mockOrganizationUuid,
            previousRole: ProjectMemberRole.VIEWER,
            newRole: ProjectMemberRole.EDITOR,
        });

        expect(sendAdminChangeNotificationEmail).not.toHaveBeenCalled();
    });

    it('should send to both org admins and project admins', async () => {
        await service.notifyProjectAdminRoleChange({
            account: mockSessionAccount,
            targetUserUuid: mockTargetUserUuid,
            projectUuid: mockProjectUuid,
            organizationUuid: mockOrganizationUuid,
            previousRole: ProjectMemberRole.EDITOR,
            newRole: ProjectMemberRole.ADMIN,
        });

        const recipients = sendAdminChangeNotificationEmail.mock.calls[0][0];
        expect(recipients).toContain(mockOrgAdmin1.email);
        expect(recipients).toContain(mockProjectAdmin.email);
    });

    it('should deduplicate recipients when same user is org and project admin', async () => {
        const sameEmail = 'shared@example.com';
        (
            organizationMemberProfileModel.getOrganizationAdmins as jest.Mock
        ).mockResolvedValueOnce([{ ...mockOrgAdmin1, email: sameEmail }]);
        (projectModel.getProjectAccess as jest.Mock).mockResolvedValueOnce([
            { ...mockProjectAdmin, email: sameEmail },
        ]);

        await service.notifyProjectAdminRoleChange({
            account: mockSessionAccount,
            targetUserUuid: mockTargetUserUuid,
            projectUuid: mockProjectUuid,
            organizationUuid: mockOrganizationUuid,
            previousRole: ProjectMemberRole.EDITOR,
            newRole: ProjectMemberRole.ADMIN,
        });

        const recipients = sendAdminChangeNotificationEmail.mock.calls[0][0];
        expect(recipients).toHaveLength(2);
        expect(recipients).toContain(sameEmail);
        expect(recipients).toContain(mockTargetUser.email);
    });

    it('should include project information in payload', async () => {
        await service.notifyProjectAdminRoleChange({
            account: mockSessionAccount,
            targetUserUuid: mockTargetUserUuid,
            projectUuid: mockProjectUuid,
            organizationUuid: mockOrganizationUuid,
            previousRole: ProjectMemberRole.EDITOR,
            newRole: ProjectMemberRole.ADMIN,
        });

        const payload = sendAdminChangeNotificationEmail.mock.calls[0][1];
        expect(payload.projectUuid).toBe(mockProjectUuid);
        expect(payload.projectName).toBe(mockProjectSummary.name);
    });

    it('should include correct settings URL for project admin change', async () => {
        await service.notifyProjectAdminRoleChange({
            account: mockSessionAccount,
            targetUserUuid: mockTargetUserUuid,
            projectUuid: mockProjectUuid,
            organizationUuid: mockOrganizationUuid,
            previousRole: ProjectMemberRole.EDITOR,
            newRole: ProjectMemberRole.ADMIN,
        });

        expect(
            sendAdminChangeNotificationEmail.mock.calls[0][1].settingsUrl,
        ).toContain(
            `/projects/${mockProjectUuid}/settings/projectManagement/projectAccess`,
        );
    });

    describe('notifyConnectionSettingsChange', () => {
        it('should not send when feature flag is disabled', async () => {
            (featureFlagModel.get as jest.Mock).mockResolvedValueOnce({
                enabled: false,
            });

            await service.notifyConnectionSettingsChange({
                organizationUuid: mockOrganizationUuid,
                projectUuid: mockProjectUuid,
                projectName: 'Test Project',
                changedBy: mockSessionAccount,
            });

            expect(sendAdminChangeNotificationEmail).not.toHaveBeenCalled();
        });

        it('should not send when no recipients found', async () => {
            (
                organizationMemberProfileModel.getOrganizationAdmins as jest.Mock
            ).mockResolvedValueOnce([]);
            (projectModel.getProjectAccess as jest.Mock).mockResolvedValueOnce(
                [],
            );

            await service.notifyConnectionSettingsChange({
                organizationUuid: mockOrganizationUuid,
                projectUuid: mockProjectUuid,
                projectName: 'Test Project',
                changedBy: mockSessionAccount,
            });

            expect(sendAdminChangeNotificationEmail).not.toHaveBeenCalled();
        });

        it('should send notification with correct type', async () => {
            await service.notifyConnectionSettingsChange({
                organizationUuid: mockOrganizationUuid,
                projectUuid: mockProjectUuid,
                projectName: 'Test Project',
                changedBy: mockSessionAccount,
            });

            expect(sendAdminChangeNotificationEmail).toHaveBeenCalledTimes(1);
            expect(sendAdminChangeNotificationEmail.mock.calls[0][1].type).toBe(
                AdminNotificationType.CONNECTION_SETTINGS_CHANGE,
            );
        });

        it('should send to org admins and project admins', async () => {
            await service.notifyConnectionSettingsChange({
                organizationUuid: mockOrganizationUuid,
                projectUuid: mockProjectUuid,
                projectName: 'Test Project',
                changedBy: mockSessionAccount,
            });

            const recipients =
                sendAdminChangeNotificationEmail.mock.calls[0][0];
            expect(recipients).toContain(mockOrgAdmin1.email);
            expect(recipients).toContain(mockProjectAdmin.email);
        });

        it('should include correct settings URL', async () => {
            await service.notifyConnectionSettingsChange({
                organizationUuid: mockOrganizationUuid,
                projectUuid: mockProjectUuid,
                projectName: 'Test Project',
                changedBy: mockSessionAccount,
            });

            expect(
                sendAdminChangeNotificationEmail.mock.calls[0][1].settingsUrl,
            ).toContain(
                `/generalSettings/projectManagement/${mockProjectUuid}/settings`,
            );
        });
    });
});
