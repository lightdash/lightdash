import { Ability } from '@casl/ability';
import {
    ContentType,
    ForbiddenError,
    OrganizationMemberRole,
    ParameterError,
    ProjectType,
    type SessionUser,
} from '@lightdash/common'; // pragma: allowlist secret
import { AppGenerateService } from './AppGenerateService';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', async (importOriginal) => ({
    ...(await importOriginal<typeof import('ai')>()),
    generateText: vi.fn(),
}));
vi.mock('@aws-sdk/client-s3', () => ({
    CopyObjectCommand: class {},
    DeleteObjectCommand: class {},
    DeleteObjectsCommand: class {},
    GetObjectCommand: class {},
    HeadObjectCommand: class {},
    ListObjectsV2Command: class {},
    PutObjectCommand: class {},
    S3Client: class {},
    S3ServiceException: class extends Error {},
}));
vi.mock('../../../clients/Aws/S3BaseClient', () => ({
    S3BaseClient: class {},
    createS3ClientFromConfig: vi.fn(),
}));

const USER_UUID = 'user-uuid';
const EDITOR_UUID = 'editor-uuid';
const APP_UUID = '11111111-1111-4111-8111-111111111111';
const PROJECT_UUID = 'project-uuid';
const ORGANIZATION_UUID = 'organization-uuid';

const app = {
    app_id: APP_UUID,
    name: 'Pulse',
    description: 'Jaffle pulse',
    icon: null,
    project_uuid: PROJECT_UUID,
    organization_uuid: ORGANIZATION_UUID,
    space_uuid: 'space-uuid',
    created_by_user_uuid: USER_UUID,
    template: null,
    registry_slug: null,
};

type StoredApp = Omit<typeof app, 'space_uuid'> & {
    space_uuid: string | null;
};

const verificationInfo = {
    verifiedBy: {
        userUuid: USER_UUID,
        firstName: 'Admin',
        lastName: 'User',
    },
    verifiedAt: new Date(),
};

const buildUser = (
    userUuid: string,
    rules: Array<{ action: string; subject: string }>,
): SessionUser => {
    const ability = new Ability(rules);
    return {
        userUuid,
        email: `${userUuid}@test.com`,
        firstName: 'Test',
        lastName: 'User',
        organizationUuid: ORGANIZATION_UUID,
        organizationName: 'Test Org',
        organizationCreatedAt: new Date(),
        isTrackingAnonymized: false,
        isMarketingOptedIn: false,
        avatarUrl: null,
        avatarGradient: null,
        timezone: null,
        isSetupComplete: true,
        userId: 1,
        role: OrganizationMemberRole.ADMIN,
        ability,
        abilityRules: ability.rules,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
    } as unknown as SessionUser;
};

const adminUser = buildUser(USER_UUID, [
    { subject: 'DataApp', action: 'manage' },
    { subject: 'ContentVerification', action: 'manage' },
    { subject: 'VerifiedContent', action: 'manage' },
]);

const editorUser = buildUser(EDITOR_UUID, [
    { subject: 'DataApp', action: 'manage' },
]);

const verifiedContentEditor = buildUser(EDITOR_UUID, [
    { subject: 'DataApp', action: 'manage' },
    { subject: 'VerifiedContent', action: 'manage' },
]);

const buildService = (
    contentVerificationModel: {
        verify: ReturnType<typeof vi.fn>;
        unverify: ReturnType<typeof vi.fn>;
        getByContent: ReturnType<typeof vi.fn>;
    },
    storedApp: StoredApp = app,
) => {
    const analytics = { track: vi.fn() };
    const appModel = {
        getApp: vi.fn(async () => storedApp),
        updateApp: vi.fn(async () => storedApp),
    };
    const service = new AppGenerateService({
        lightdashConfig: { appRuntime: {} } as never, // pragma: allowlist secret
        analytics: analytics as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        userModel: {} as never,
        appModel: appModel as never,
        featureFlagModel: {
            get: vi.fn(async () => ({ enabled: true })),
        } as never,
        organizationDesignModel: {} as never,
        pinnedListModel: {} as never,
        projectModel: {
            getSummary: vi.fn(async () => ({
                organizationUuid: ORGANIZATION_UUID,
                type: ProjectType.DEFAULT,
                createdByUserUuid: USER_UUID,
                upstreamProjectUuid: null,
            })),
        } as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        savedChartModel: {} as never,
        schedulerClient: {} as never,
        savedChartService: {} as never,
        spacePermissionService: {
            resolveAccess: vi.fn(async () => ({
                organizationUuid: ORGANIZATION_UUID,
                projectUuid: PROJECT_UUID,
                inheritsFromOrgOrProject: true,
                access: [],
                admins: [],
                directOnly: false,
            })),
        } as never,
        coderService: {} as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {} as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {} as never,
        sandboxManager: null,
        appRuntimeS3: null,
        chartRegistryClient: {} as never,
        contentVerificationModel: contentVerificationModel as never,
    });
    return { service, appModel, analytics };
};

describe('AppGenerateService content verification', () => {
    it('verifies a data app when the user can manage ContentVerification', async () => {
        const contentVerificationModel = {
            verify: vi.fn(async () => undefined),
            unverify: vi.fn(async () => undefined),
            getByContent: vi.fn(async () => verificationInfo),
        };
        const { service, analytics } = buildService(contentVerificationModel);

        const result = await service.verifyDataApp(
            adminUser,
            PROJECT_UUID,
            APP_UUID,
        );

        expect(result).toEqual(verificationInfo);
        expect(contentVerificationModel.verify).toHaveBeenCalledWith(
            ContentType.DATA_APP,
            APP_UUID,
            PROJECT_UUID,
            USER_UUID,
        );
        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'content_verification.created',
                properties: expect.objectContaining({
                    contentType: ContentType.DATA_APP,
                    contentId: APP_UUID,
                }),
            }),
        );
    });

    it('rejects verify when the user cannot manage ContentVerification', async () => {
        const contentVerificationModel = {
            verify: vi.fn(async () => undefined),
            unverify: vi.fn(async () => undefined),
            getByContent: vi.fn(async () => null),
        };
        const { service } = buildService(contentVerificationModel);

        await expect(
            service.verifyDataApp(editorUser, PROJECT_UUID, APP_UUID),
        ).rejects.toThrow(ForbiddenError);
        expect(contentVerificationModel.verify).not.toHaveBeenCalled();
    });

    it('rejects verify for a personal app that is not in a space', async () => {
        const contentVerificationModel = {
            verify: vi.fn(async () => undefined),
            unverify: vi.fn(async () => undefined),
            getByContent: vi.fn(async () => null),
        };
        const { service } = buildService(contentVerificationModel, {
            ...app,
            space_uuid: null,
        });

        await expect(
            service.verifyDataApp(adminUser, PROJECT_UUID, APP_UUID),
        ).rejects.toThrow(ParameterError);
        expect(contentVerificationModel.verify).not.toHaveBeenCalled();
    });

    it('unverifies a data app when the user can manage ContentVerification', async () => {
        const contentVerificationModel = {
            verify: vi.fn(async () => undefined),
            unverify: vi.fn(async () => undefined),
            getByContent: vi.fn(async () => verificationInfo),
        };
        const { service, analytics } = buildService(contentVerificationModel);

        await service.unverifyDataApp(adminUser, PROJECT_UUID, APP_UUID);

        expect(contentVerificationModel.unverify).toHaveBeenCalledWith(
            ContentType.DATA_APP,
            APP_UUID,
        );
        expect(analytics.track).toHaveBeenCalledWith(
            expect.objectContaining({
                event: 'content_verification.deleted',
            }),
        );
    });

    it('blocks metadata edits on a verified app without VerifiedContent', async () => {
        const contentVerificationModel = {
            verify: vi.fn(async () => undefined),
            unverify: vi.fn(async () => undefined),
            getByContent: vi.fn(async () => verificationInfo),
        };
        const { service, appModel } = buildService(contentVerificationModel);

        await expect(
            service.updateApp(editorUser, PROJECT_UUID, APP_UUID, {
                name: 'Renamed',
            }),
        ).rejects.toThrow(/verified/);
        expect(appModel.updateApp).not.toHaveBeenCalled();
    });

    it('lets the original verifier rename a verified app and keeps the badge', async () => {
        const contentVerificationModel = {
            verify: vi.fn(async () => undefined),
            unverify: vi.fn(async () => undefined),
            getByContent: vi.fn(async () => verificationInfo),
        };
        const { service, appModel } = buildService(contentVerificationModel);

        await service.updateApp(adminUser, PROJECT_UUID, APP_UUID, {
            name: 'Renamed',
        });

        expect(appModel.updateApp).toHaveBeenCalled();
        expect(contentVerificationModel.unverify).not.toHaveBeenCalled();
    });

    it('auto-unverifies when a non-verifier with VerifiedContent edits the app', async () => {
        const contentVerificationModel = {
            verify: vi.fn(async () => undefined),
            unverify: vi.fn(async () => undefined),
            getByContent: vi.fn(async () => verificationInfo),
        };
        const { service } = buildService(contentVerificationModel);

        await service.updateApp(verifiedContentEditor, PROJECT_UUID, APP_UUID, {
            name: 'Renamed',
        });

        expect(contentVerificationModel.unverify).toHaveBeenCalledWith(
            ContentType.DATA_APP,
            APP_UUID,
        );
    });
});
