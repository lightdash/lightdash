import {
    AdminNotificationType,
    FeatureFlags,
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
    createMockAccount,
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

const createMocks = () => ({
    emailClient: {
        sendAdminChangeNotificationEmail: jest.fn(),
    },
    featureFlagModel: {
        get: jest.fn(),
    },
    organizationMemberProfileModel: {
        getOrganizationAdmins: jest.fn(),
    },
    organizationModel: {
        get: jest.fn(),
    },
    projectModel: {
        getSummary: jest.fn(),
        getProjectAccess: jest.fn(),
    },
    userModel: {
        getUserDetailsByUuid: jest.fn(),
    },
});

const createService = (mocks: ReturnType<typeof createMocks>) =>
    new AdminNotificationService({
        lightdashConfig: lightdashConfigMock,
        emailClient: mocks.emailClient as unknown as EmailClient,
        featureFlagModel: mocks.featureFlagModel as unknown as FeatureFlagModel,
        organizationMemberProfileModel:
            mocks.organizationMemberProfileModel as unknown as OrganizationMemberProfileModel,
        organizationModel:
            mocks.organizationModel as unknown as OrganizationModel,
        projectModel: mocks.projectModel as unknown as ProjectModel,
        userModel: mocks.userModel as unknown as UserModel,
    });

describe('AdminNotificationService', () => {
    let mocks: ReturnType<typeof createMocks>;
    let service: AdminNotificationService;

    beforeEach(() => {
        mocks = createMocks();
        service = createService(mocks);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('notifyOrgAdminRoleChange', () => {
        describe('feature flag behavior', () => {
            it('should not send notification when feature flag is disabled', async () => {
                mocks.featureFlagModel.get.mockResolvedValue({
                    enabled: false,
                });

                await service.notifyOrgAdminRoleChange(
                    mockSessionAccount,
                    mockTargetUserUuid,
                    mockOrganizationUuid,
                    OrganizationMemberRole.MEMBER,
                    OrganizationMemberRole.ADMIN,
                );

                expect(
                    mocks.emailClient.sendAdminChangeNotificationEmail,
                ).not.toHaveBeenCalled();
            });

            it('should not send notification when feature flag check throws', async () => {
                mocks.featureFlagModel.get.mockRejectedValue(
                    new Error('Feature flag error'),
                );

                await service.notifyOrgAdminRoleChange(
                    mockSessionAccount,
                    mockTargetUserUuid,
                    mockOrganizationUuid,
                    OrganizationMemberRole.MEMBER,
                    OrganizationMemberRole.ADMIN,
                );

                expect(
                    mocks.emailClient.sendAdminChangeNotificationEmail,
                ).not.toHaveBeenCalled();
            });
        });

        describe('role change detection', () => {
            beforeEach(() => {
                mocks.featureFlagModel.get.mockResolvedValue({ enabled: true });
                mocks.organizationModel.get.mockResolvedValue(mockOrganization);
                mocks.userModel.getUserDetailsByUuid.mockResolvedValue(
                    mockTargetUser,
                );
                mocks.organizationMemberProfileModel.getOrganizationAdmins.mockResolvedValue(
                    [mockOrgAdmin1, mockOrgAdmin2],
                );
            });

            it('should send notification when promoting user to admin', async () => {
                await service.notifyOrgAdminRoleChange(
                    mockSessionAccount,
                    mockTargetUserUuid,
                    mockOrganizationUuid,
                    OrganizationMemberRole.MEMBER,
                    OrganizationMemberRole.ADMIN,
                );

                expect(
                    mocks.emailClient.sendAdminChangeNotificationEmail,
                ).toHaveBeenCalledTimes(1);
                const [recipients, payload] =
                    mocks.emailClient.sendAdminChangeNotificationEmail.mock
                        .calls[0];
                expect(recipients).toEqual([
                    mockOrgAdmin1.email,
                    mockOrgAdmin2.email,
                ]);
                expect(payload.type).toBe(
                    AdminNotificationType.ORG_ADMIN_ADDED,
                );
            });

            it('should send notification when demoting user from admin', async () => {
                await service.notifyOrgAdminRoleChange(
                    mockSessionAccount,
                    mockTargetUserUuid,
                    mockOrganizationUuid,
                    OrganizationMemberRole.ADMIN,
                    OrganizationMemberRole.MEMBER,
                );

                expect(
                    mocks.emailClient.sendAdminChangeNotificationEmail,
                ).toHaveBeenCalledTimes(1);
                const [, payload] =
                    mocks.emailClient.sendAdminChangeNotificationEmail.mock
                        .calls[0];
                expect(payload.type).toBe(
                    AdminNotificationType.ORG_ADMIN_REMOVED,
                );
            });

            it('should not send notification for non-admin role changes', async () => {
                await service.notifyOrgAdminRoleChange(
                    mockSessionAccount,
                    mockTargetUserUuid,
                    mockOrganizationUuid,
                    OrganizationMemberRole.MEMBER,
                    OrganizationMemberRole.EDITOR,
                );

                expect(
                    mocks.emailClient.sendAdminChangeNotificationEmail,
                ).not.toHaveBeenCalled();
            });

            it('should not send notification when editor becomes viewer', async () => {
                await service.notifyOrgAdminRoleChange(
                    mockSessionAccount,
                    mockTargetUserUuid,
                    mockOrganizationUuid,
                    OrganizationMemberRole.EDITOR,
                    OrganizationMemberRole.VIEWER,
                );

                expect(
                    mocks.emailClient.sendAdminChangeNotificationEmail,
                ).not.toHaveBeenCalled();
            });
        });

        describe('recipient logic', () => {
            beforeEach(() => {
                mocks.featureFlagModel.get.mockResolvedValue({ enabled: true });
                mocks.organizationModel.get.mockResolvedValue(mockOrganization);
                mocks.userModel.getUserDetailsByUuid.mockResolvedValue(
                    mockTargetUser,
                );
            });

            it('should not send notification when no admins have emails', async () => {
                mocks.organizationMemberProfileModel.getOrganizationAdmins.mockResolvedValue(
                    [
                        { ...mockOrgAdmin1, email: undefined },
                        { ...mockOrgAdmin2, email: '' },
                    ],
                );

                await service.notifyOrgAdminRoleChange(
                    mockSessionAccount,
                    mockTargetUserUuid,
                    mockOrganizationUuid,
                    OrganizationMemberRole.MEMBER,
                    OrganizationMemberRole.ADMIN,
                );

                expect(
                    mocks.emailClient.sendAdminChangeNotificationEmail,
                ).not.toHaveBeenCalled();
            });

            it('should send to all org admins with valid emails', async () => {
                mocks.organizationMemberProfileModel.getOrganizationAdmins.mockResolvedValue(
                    [mockOrgAdmin1, mockOrgAdmin2],
                );

                await service.notifyOrgAdminRoleChange(
                    mockSessionAccount,
                    mockTargetUserUuid,
                    mockOrganizationUuid,
                    OrganizationMemberRole.MEMBER,
                    OrganizationMemberRole.ADMIN,
                );

                const [recipients] =
                    mocks.emailClient.sendAdminChangeNotificationEmail.mock
                        .calls[0];
                expect(recipients).toHaveLength(2);
                expect(recipients).toContain(mockOrgAdmin1.email);
                expect(recipients).toContain(mockOrgAdmin2.email);
            });
        });

        describe('payload construction', () => {
            beforeEach(() => {
                mocks.featureFlagModel.get.mockResolvedValue({ enabled: true });
                mocks.organizationModel.get.mockResolvedValue(mockOrganization);
                mocks.userModel.getUserDetailsByUuid.mockResolvedValue(
                    mockTargetUser,
                );
                mocks.organizationMemberProfileModel.getOrganizationAdmins.mockResolvedValue(
                    [mockOrgAdmin1],
                );
            });

            it('should include correct target user information', async () => {
                await service.notifyOrgAdminRoleChange(
                    mockSessionAccount,
                    mockTargetUserUuid,
                    mockOrganizationUuid,
                    OrganizationMemberRole.MEMBER,
                    OrganizationMemberRole.ADMIN,
                );

                const [, payload] =
                    mocks.emailClient.sendAdminChangeNotificationEmail.mock
                        .calls[0];
                expect(payload.targetUser).toEqual({
                    userUuid: mockTargetUser.userUuid,
                    email: mockTargetUser.email,
                    firstName: mockTargetUser.firstName,
                    lastName: mockTargetUser.lastName,
                });
            });

            it('should include correct changedBy information for session user', async () => {
                await service.notifyOrgAdminRoleChange(
                    mockSessionAccount,
                    mockTargetUserUuid,
                    mockOrganizationUuid,
                    OrganizationMemberRole.MEMBER,
                    OrganizationMemberRole.ADMIN,
                );

                const [, payload] =
                    mocks.emailClient.sendAdminChangeNotificationEmail.mock
                        .calls[0];
                expect(payload.changedBy.isServiceAccount).toBe(false);
                expect(payload.changedBy.email).toBe(
                    mockSessionAccount.user?.email,
                );
            });

            it('should include service account info when changed by service account', async () => {
                await service.notifyOrgAdminRoleChange(
                    mockServiceAccount,
                    mockTargetUserUuid,
                    mockOrganizationUuid,
                    OrganizationMemberRole.MEMBER,
                    OrganizationMemberRole.ADMIN,
                );

                const [, payload] =
                    mocks.emailClient.sendAdminChangeNotificationEmail.mock
                        .calls[0];
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

                const [, payload] =
                    mocks.emailClient.sendAdminChangeNotificationEmail.mock
                        .calls[0];
                expect(payload.settingsUrl).toContain(
                    '/generalSettings/userManagement',
                );
            });

            it('should include role change details', async () => {
                await service.notifyOrgAdminRoleChange(
                    mockSessionAccount,
                    mockTargetUserUuid,
                    mockOrganizationUuid,
                    OrganizationMemberRole.MEMBER,
                    OrganizationMemberRole.ADMIN,
                );

                const [, payload] =
                    mocks.emailClient.sendAdminChangeNotificationEmail.mock
                        .calls[0];
                expect(payload.changes).toEqual([
                    {
                        field: 'Organization Role',
                        previousValue: OrganizationMemberRole.MEMBER,
                        newValue: OrganizationMemberRole.ADMIN,
                    },
                ]);
            });
        });

        describe('error handling', () => {
            beforeEach(() => {
                mocks.featureFlagModel.get.mockResolvedValue({ enabled: true });
            });

            it('should not throw when email sending fails', async () => {
                mocks.organizationModel.get.mockResolvedValue(mockOrganization);
                mocks.userModel.getUserDetailsByUuid.mockResolvedValue(
                    mockTargetUser,
                );
                mocks.organizationMemberProfileModel.getOrganizationAdmins.mockResolvedValue(
                    [mockOrgAdmin1],
                );
                mocks.emailClient.sendAdminChangeNotificationEmail.mockRejectedValue(
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

            it('should not throw when fetching data fails', async () => {
                mocks.organizationModel.get.mockRejectedValue(
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
        });
    });

    describe('notifyProjectAdminRoleChange', () => {
        beforeEach(() => {
            mocks.projectModel.getSummary.mockResolvedValue(mockProjectSummary);
        });

        describe('feature flag behavior', () => {
            it('should not send notification when feature flag is disabled', async () => {
                mocks.featureFlagModel.get.mockResolvedValue({
                    enabled: false,
                });

                await service.notifyProjectAdminRoleChange(
                    mockSessionAccount,
                    mockTargetUserUuid,
                    mockProjectUuid,
                    ProjectMemberRole.EDITOR,
                    ProjectMemberRole.ADMIN,
                );

                expect(
                    mocks.emailClient.sendAdminChangeNotificationEmail,
                ).not.toHaveBeenCalled();
            });
        });

        describe('role change detection', () => {
            beforeEach(() => {
                mocks.featureFlagModel.get.mockResolvedValue({ enabled: true });
                mocks.organizationModel.get.mockResolvedValue(mockOrganization);
                mocks.userModel.getUserDetailsByUuid.mockResolvedValue(
                    mockTargetUser,
                );
                mocks.organizationMemberProfileModel.getOrganizationAdmins.mockResolvedValue(
                    [mockOrgAdmin1],
                );
                mocks.projectModel.getProjectAccess.mockResolvedValue([
                    mockProjectAdmin,
                ]);
            });

            it('should send notification when promoting user to project admin', async () => {
                await service.notifyProjectAdminRoleChange(
                    mockSessionAccount,
                    mockTargetUserUuid,
                    mockProjectUuid,
                    ProjectMemberRole.EDITOR,
                    ProjectMemberRole.ADMIN,
                );

                expect(
                    mocks.emailClient.sendAdminChangeNotificationEmail,
                ).toHaveBeenCalledTimes(1);
                const [, payload] =
                    mocks.emailClient.sendAdminChangeNotificationEmail.mock
                        .calls[0];
                expect(payload.type).toBe(
                    AdminNotificationType.PROJECT_ADMIN_ADDED,
                );
            });

            it('should send notification when demoting user from project admin', async () => {
                await service.notifyProjectAdminRoleChange(
                    mockSessionAccount,
                    mockTargetUserUuid,
                    mockProjectUuid,
                    ProjectMemberRole.ADMIN,
                    ProjectMemberRole.EDITOR,
                );

                expect(
                    mocks.emailClient.sendAdminChangeNotificationEmail,
                ).toHaveBeenCalledTimes(1);
                const [, payload] =
                    mocks.emailClient.sendAdminChangeNotificationEmail.mock
                        .calls[0];
                expect(payload.type).toBe(
                    AdminNotificationType.PROJECT_ADMIN_REMOVED,
                );
            });

            it('should not send notification for non-admin role changes', async () => {
                await service.notifyProjectAdminRoleChange(
                    mockSessionAccount,
                    mockTargetUserUuid,
                    mockProjectUuid,
                    ProjectMemberRole.VIEWER,
                    ProjectMemberRole.EDITOR,
                );

                expect(
                    mocks.emailClient.sendAdminChangeNotificationEmail,
                ).not.toHaveBeenCalled();
            });
        });

        describe('recipient logic', () => {
            beforeEach(() => {
                mocks.featureFlagModel.get.mockResolvedValue({ enabled: true });
                mocks.organizationModel.get.mockResolvedValue(mockOrganization);
                mocks.userModel.getUserDetailsByUuid.mockResolvedValue(
                    mockTargetUser,
                );
            });

            it('should send to both org admins and project admins', async () => {
                mocks.organizationMemberProfileModel.getOrganizationAdmins.mockResolvedValue(
                    [mockOrgAdmin1],
                );
                mocks.projectModel.getProjectAccess.mockResolvedValue([
                    mockProjectAdmin,
                ]);

                await service.notifyProjectAdminRoleChange(
                    mockSessionAccount,
                    mockTargetUserUuid,
                    mockProjectUuid,
                    ProjectMemberRole.EDITOR,
                    ProjectMemberRole.ADMIN,
                );

                const [recipients] =
                    mocks.emailClient.sendAdminChangeNotificationEmail.mock
                        .calls[0];
                expect(recipients).toContain(mockOrgAdmin1.email);
                expect(recipients).toContain(mockProjectAdmin.email);
            });

            it('should deduplicate recipients when same user is org and project admin', async () => {
                const sameEmail = 'shared@example.com';
                mocks.organizationMemberProfileModel.getOrganizationAdmins.mockResolvedValue(
                    [{ ...mockOrgAdmin1, email: sameEmail }],
                );
                mocks.projectModel.getProjectAccess.mockResolvedValue([
                    { ...mockProjectAdmin, email: sameEmail },
                ]);

                await service.notifyProjectAdminRoleChange(
                    mockSessionAccount,
                    mockTargetUserUuid,
                    mockProjectUuid,
                    ProjectMemberRole.EDITOR,
                    ProjectMemberRole.ADMIN,
                );

                const [recipients] =
                    mocks.emailClient.sendAdminChangeNotificationEmail.mock
                        .calls[0];
                expect(recipients).toHaveLength(1);
                expect(recipients).toContain(sameEmail);
            });
        });

        describe('payload construction', () => {
            beforeEach(() => {
                mocks.featureFlagModel.get.mockResolvedValue({ enabled: true });
                mocks.organizationModel.get.mockResolvedValue(mockOrganization);
                mocks.userModel.getUserDetailsByUuid.mockResolvedValue(
                    mockTargetUser,
                );
                mocks.organizationMemberProfileModel.getOrganizationAdmins.mockResolvedValue(
                    [mockOrgAdmin1],
                );
                mocks.projectModel.getProjectAccess.mockResolvedValue([]);
            });

            it('should include project information in payload', async () => {
                await service.notifyProjectAdminRoleChange(
                    mockSessionAccount,
                    mockTargetUserUuid,
                    mockProjectUuid,
                    ProjectMemberRole.EDITOR,
                    ProjectMemberRole.ADMIN,
                );

                const [, payload] =
                    mocks.emailClient.sendAdminChangeNotificationEmail.mock
                        .calls[0];
                expect(payload.projectUuid).toBe(mockProjectUuid);
                expect(payload.projectName).toBe(mockProjectSummary.name);
            });

            it('should include correct settings URL for project admin change', async () => {
                await service.notifyProjectAdminRoleChange(
                    mockSessionAccount,
                    mockTargetUserUuid,
                    mockProjectUuid,
                    ProjectMemberRole.EDITOR,
                    ProjectMemberRole.ADMIN,
                );

                const [, payload] =
                    mocks.emailClient.sendAdminChangeNotificationEmail.mock
                        .calls[0];
                expect(payload.settingsUrl).toContain(
                    `/projects/${mockProjectUuid}/settings/projectManagement/projectAccess`,
                );
            });
        });
    });
});
