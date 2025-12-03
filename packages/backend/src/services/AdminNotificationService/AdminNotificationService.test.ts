import {
    AdminNotificationPayload,
    AdminNotificationType,
    CreateBigqueryCredentials,
    CreatePostgresCredentials,
    DbtGithubProjectConfig,
    DbtGitlabProjectConfig,
    DbtProjectType,
    OrganizationMemberRole,
    ProjectMemberRole,
    WarehouseTypes,
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

    // notifyOrgAdminRoleChange tests
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

    it('should not send org notification when no admins have emails', async () => {
        (
            organizationMemberProfileModel.getOrganizationAdmins as jest.Mock
        ).mockResolvedValueOnce([
            { ...mockOrgAdmin1, email: undefined },
            { ...mockOrgAdmin2, email: '' },
        ]);

        await service.notifyOrgAdminRoleChange(
            mockSessionAccount,
            mockTargetUserUuid,
            mockOrganizationUuid,
            OrganizationMemberRole.MEMBER,
            OrganizationMemberRole.ADMIN,
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

    it('should include role change details in org notification', async () => {
        await service.notifyOrgAdminRoleChange(
            mockSessionAccount,
            mockTargetUserUuid,
            mockOrganizationUuid,
            OrganizationMemberRole.MEMBER,
            OrganizationMemberRole.ADMIN,
        );

        expect(
            sendAdminChangeNotificationEmail.mock.calls[0][1].changes,
        ).toEqual([
            {
                field: 'Organization Role',
            },
        ]);
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

    // notifyProjectAdminRoleChange tests
    it('should not send project notification when feature flag is disabled', async () => {
        (featureFlagModel.get as jest.Mock).mockResolvedValueOnce({
            enabled: false,
        });

        await service.notifyProjectAdminRoleChange(
            mockSessionAccount,
            mockTargetUserUuid,
            mockProjectUuid,
            mockOrganizationUuid,
            ProjectMemberRole.EDITOR,
            ProjectMemberRole.ADMIN,
        );

        expect(sendAdminChangeNotificationEmail).not.toHaveBeenCalled();
    });

    it('should send notification when promoting user to project admin', async () => {
        await service.notifyProjectAdminRoleChange(
            mockSessionAccount,
            mockTargetUserUuid,
            mockProjectUuid,
            mockOrganizationUuid,
            ProjectMemberRole.EDITOR,
            ProjectMemberRole.ADMIN,
        );

        expect(sendAdminChangeNotificationEmail).toHaveBeenCalledTimes(1);
        expect(sendAdminChangeNotificationEmail.mock.calls[0][1].type).toBe(
            AdminNotificationType.PROJECT_ADMIN_ADDED,
        );
    });

    it('should send notification when demoting user from project admin', async () => {
        await service.notifyProjectAdminRoleChange(
            mockSessionAccount,
            mockTargetUserUuid,
            mockProjectUuid,
            mockOrganizationUuid,
            ProjectMemberRole.ADMIN,
            ProjectMemberRole.EDITOR,
        );

        expect(sendAdminChangeNotificationEmail).toHaveBeenCalledTimes(1);
        expect(sendAdminChangeNotificationEmail.mock.calls[0][1].type).toBe(
            AdminNotificationType.PROJECT_ADMIN_REMOVED,
        );
    });

    it('should not send project notification for non-admin role changes', async () => {
        await service.notifyProjectAdminRoleChange(
            mockSessionAccount,
            mockTargetUserUuid,
            mockProjectUuid,
            mockOrganizationUuid,
            ProjectMemberRole.VIEWER,
            ProjectMemberRole.EDITOR,
        );

        expect(sendAdminChangeNotificationEmail).not.toHaveBeenCalled();
    });

    it('should send to both org admins and project admins', async () => {
        await service.notifyProjectAdminRoleChange(
            mockSessionAccount,
            mockTargetUserUuid,
            mockProjectUuid,
            mockOrganizationUuid,
            ProjectMemberRole.EDITOR,
            ProjectMemberRole.ADMIN,
        );

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

        await service.notifyProjectAdminRoleChange(
            mockSessionAccount,
            mockTargetUserUuid,
            mockProjectUuid,
            mockOrganizationUuid,
            ProjectMemberRole.EDITOR,
            ProjectMemberRole.ADMIN,
        );

        const recipients = sendAdminChangeNotificationEmail.mock.calls[0][0];
        expect(recipients).toHaveLength(1);
        expect(recipients).toContain(sameEmail);
    });

    it('should include project information in payload', async () => {
        await service.notifyProjectAdminRoleChange(
            mockSessionAccount,
            mockTargetUserUuid,
            mockProjectUuid,
            mockOrganizationUuid,
            ProjectMemberRole.EDITOR,
            ProjectMemberRole.ADMIN,
        );

        const payload = sendAdminChangeNotificationEmail.mock.calls[0][1];
        expect(payload.projectUuid).toBe(mockProjectUuid);
        expect(payload.projectName).toBe(mockProjectSummary.name);
    });

    it('should include correct settings URL for project admin change', async () => {
        await service.notifyProjectAdminRoleChange(
            mockSessionAccount,
            mockTargetUserUuid,
            mockProjectUuid,
            mockOrganizationUuid,
            ProjectMemberRole.EDITOR,
            ProjectMemberRole.ADMIN,
        );

        expect(
            sendAdminChangeNotificationEmail.mock.calls[0][1].settingsUrl,
        ).toContain(
            `/projects/${mockProjectUuid}/settings/projectManagement/projectAccess`,
        );
    });

    describe('detectDatabaseChanges', () => {
        const basePostgresCredentials: CreatePostgresCredentials = {
            type: WarehouseTypes.POSTGRES,
            host: 'localhost',
            port: 5432,
            user: 'admin',
            password: 'secret',
            dbname: 'mydb',
            schema: 'public',
        };

        it('should return empty array when credentials are identical', () => {
            const changes = service.detectDatabaseChanges(
                basePostgresCredentials,
                basePostgresCredentials,
            );
            expect(changes).toEqual([]);
        });

        it('should detect warehouse type change', () => {
            const bigqueryCredentials: CreateBigqueryCredentials = {
                type: WarehouseTypes.BIGQUERY,
                project: 'my-project',
                dataset: 'my_dataset',
                keyfileContents: {},
                timeoutSeconds: 300,
                priority: 'interactive',
                retries: 3,
                location: 'US',
                maximumBytesBilled: 1000000,
            };

            const changes = service.detectDatabaseChanges(
                basePostgresCredentials,
                bigqueryCredentials,
            );

            expect(changes).toHaveLength(1);
            expect(changes[0].field).toBe('Warehouse Type');
        });

        it('should only return type change when warehouse type changes', () => {
            const bigqueryCredentials: CreateBigqueryCredentials = {
                type: WarehouseTypes.BIGQUERY,
                project: 'my-project',
                dataset: 'my_dataset',
                keyfileContents: {},
                timeoutSeconds: 300,
                priority: 'interactive',
                retries: 3,
                location: 'US',
                maximumBytesBilled: 1000000,
            };

            const changes = service.detectDatabaseChanges(
                basePostgresCredentials,
                bigqueryCredentials,
            );

            expect(changes).toHaveLength(1);
            expect(changes[0].field).toBe('Warehouse Type');
        });

        it('should detect individual field changes', () => {
            const updatedCredentials: CreatePostgresCredentials = {
                ...basePostgresCredentials,
                host: 'production.db.com',
                port: 5433,
            };

            const changes = service.detectDatabaseChanges(
                basePostgresCredentials,
                updatedCredentials,
            );

            expect(changes).toHaveLength(2);
            expect(changes.map((c) => c.field)).toContain('Host');
            expect(changes.map((c) => c.field)).toContain('Port');
        });

        it('should handle undefined before state', () => {
            const changes = service.detectDatabaseChanges(
                undefined,
                basePostgresCredentials,
            );

            expect(changes.length).toBeGreaterThan(0);
            expect(changes[0].field).toBe('Warehouse Type');
        });

        it('should use friendly field labels', () => {
            const updatedCredentials: CreatePostgresCredentials = {
                ...basePostgresCredentials,
                dbname: 'newdb',
            };

            const changes = service.detectDatabaseChanges(
                basePostgresCredentials,
                updatedCredentials,
            );

            expect(changes[0].field).toBe('Database');
        });
    });

    describe('detectDbtChanges', () => {
        const baseGithubConfig: DbtGithubProjectConfig = {
            type: DbtProjectType.GITHUB,
            repository: 'org/repo',
            branch: 'main',
            project_sub_path: '/',
            host_domain: 'github.com',
            authorization_method: 'personal_access_token',
            personal_access_token: 'ghp_xxx',
        };

        it('should return empty array when configs are identical', () => {
            const changes = service.detectDbtChanges(
                baseGithubConfig,
                baseGithubConfig,
            );
            expect(changes).toEqual([]);
        });

        it('should detect connection type change', () => {
            const gitlabConfig: DbtGitlabProjectConfig = {
                type: DbtProjectType.GITLAB,
                repository: 'org/repo',
                branch: 'main',
                project_sub_path: '/',
                host_domain: 'gitlab.com',
                personal_access_token: 'glpat_xxx',
            };

            const changes = service.detectDbtChanges(
                baseGithubConfig,
                gitlabConfig,
            );

            expect(changes).toHaveLength(1);
            expect(changes[0].field).toBe('Connection Type');
        });

        it('should only return type change when connection type changes', () => {
            const gitlabConfig: DbtGitlabProjectConfig = {
                type: DbtProjectType.GITLAB,
                repository: 'different/repo',
                branch: 'develop',
                project_sub_path: '/subpath',
                host_domain: 'gitlab.com',
                personal_access_token: 'glpat_xxx',
            };

            const changes = service.detectDbtChanges(
                baseGithubConfig,
                gitlabConfig,
            );

            expect(changes).toHaveLength(1);
            expect(changes[0].field).toBe('Connection Type');
        });

        it('should detect individual field changes', () => {
            const updatedConfig: DbtGithubProjectConfig = {
                ...baseGithubConfig,
                branch: 'develop',
                repository: 'org/new-repo',
            };

            const changes = service.detectDbtChanges(
                baseGithubConfig,
                updatedConfig,
            );

            expect(changes).toHaveLength(2);
            expect(changes.map((c) => c.field)).toContain('Branch');
            expect(changes.map((c) => c.field)).toContain('Repository');
        });

        it('should handle undefined before state', () => {
            const changes = service.detectDbtChanges(
                undefined,
                baseGithubConfig,
            );

            expect(changes.length).toBeGreaterThan(0);
            expect(changes[0].field).toBe('Connection Type');
        });
    });

    describe('notifyDatabaseConnectionChange', () => {
        it('should not send when feature flag is disabled', async () => {
            (featureFlagModel.get as jest.Mock).mockResolvedValueOnce({
                enabled: false,
            });

            await service.notifyDatabaseConnectionChange({
                organizationUuid: mockOrganizationUuid,
                projectUuid: mockProjectUuid,
                projectName: 'Test Project',
                changedBy: mockSessionAccount,
                changes: [{ field: 'Host' }],
            });

            expect(sendAdminChangeNotificationEmail).not.toHaveBeenCalled();
        });

        it('should not send when changes array is empty', async () => {
            await service.notifyDatabaseConnectionChange({
                organizationUuid: mockOrganizationUuid,
                projectUuid: mockProjectUuid,
                projectName: 'Test Project',
                changedBy: mockSessionAccount,
                changes: [],
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

            await service.notifyDatabaseConnectionChange({
                organizationUuid: mockOrganizationUuid,
                projectUuid: mockProjectUuid,
                projectName: 'Test Project',
                changedBy: mockSessionAccount,
                changes: [{ field: 'Host' }],
            });

            expect(sendAdminChangeNotificationEmail).not.toHaveBeenCalled();
        });

        it('should send notification with correct type', async () => {
            await service.notifyDatabaseConnectionChange({
                organizationUuid: mockOrganizationUuid,
                projectUuid: mockProjectUuid,
                projectName: 'Test Project',
                changedBy: mockSessionAccount,
                changes: [{ field: 'Host' }],
            });

            expect(sendAdminChangeNotificationEmail).toHaveBeenCalledTimes(1);
            expect(sendAdminChangeNotificationEmail.mock.calls[0][1].type).toBe(
                AdminNotificationType.DATABASE_CONNECTION_CHANGE,
            );
        });

        it('should send to org admins and project admins', async () => {
            await service.notifyDatabaseConnectionChange({
                organizationUuid: mockOrganizationUuid,
                projectUuid: mockProjectUuid,
                projectName: 'Test Project',
                changedBy: mockSessionAccount,
                changes: [{ field: 'Host' }],
            });

            const recipients =
                sendAdminChangeNotificationEmail.mock.calls[0][0];
            expect(recipients).toContain(mockOrgAdmin1.email);
            expect(recipients).toContain(mockProjectAdmin.email);
        });

        it('should include correct settings URL', async () => {
            await service.notifyDatabaseConnectionChange({
                organizationUuid: mockOrganizationUuid,
                projectUuid: mockProjectUuid,
                projectName: 'Test Project',
                changedBy: mockSessionAccount,
                changes: [{ field: 'Host' }],
            });

            expect(
                sendAdminChangeNotificationEmail.mock.calls[0][1].settingsUrl,
            ).toContain(
                `/generalSettings/projectManagement/${mockProjectUuid}/settings`,
            );
        });
    });

    describe('notifyDbtConnectionChange', () => {
        it('should not send when feature flag is disabled', async () => {
            (featureFlagModel.get as jest.Mock).mockResolvedValueOnce({
                enabled: false,
            });

            await service.notifyDbtConnectionChange({
                organizationUuid: mockOrganizationUuid,
                projectUuid: mockProjectUuid,
                projectName: 'Test Project',
                changedBy: mockSessionAccount,
                changes: [{ field: 'Branch' }],
            });

            expect(sendAdminChangeNotificationEmail).not.toHaveBeenCalled();
        });

        it('should not send when changes array is empty', async () => {
            await service.notifyDbtConnectionChange({
                organizationUuid: mockOrganizationUuid,
                projectUuid: mockProjectUuid,
                projectName: 'Test Project',
                changedBy: mockSessionAccount,
                changes: [],
            });

            expect(sendAdminChangeNotificationEmail).not.toHaveBeenCalled();
        });

        it('should send notification with correct type', async () => {
            await service.notifyDbtConnectionChange({
                organizationUuid: mockOrganizationUuid,
                projectUuid: mockProjectUuid,
                projectName: 'Test Project',
                changedBy: mockSessionAccount,
                changes: [{ field: 'Branch' }],
            });

            expect(sendAdminChangeNotificationEmail).toHaveBeenCalledTimes(1);
            expect(sendAdminChangeNotificationEmail.mock.calls[0][1].type).toBe(
                AdminNotificationType.DBT_CONNECTION_CHANGE,
            );
        });

        it('should send to org admins and project admins', async () => {
            await service.notifyDbtConnectionChange({
                organizationUuid: mockOrganizationUuid,
                projectUuid: mockProjectUuid,
                projectName: 'Test Project',
                changedBy: mockSessionAccount,
                changes: [{ field: 'Branch' }],
            });

            const recipients =
                sendAdminChangeNotificationEmail.mock.calls[0][0];
            expect(recipients).toContain(mockOrgAdmin1.email);
            expect(recipients).toContain(mockProjectAdmin.email);
        });
    });
});
