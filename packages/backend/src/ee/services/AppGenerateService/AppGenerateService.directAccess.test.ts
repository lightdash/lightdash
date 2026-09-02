import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    ProjectType,
    SpaceMemberRole,
    type SessionUser,
} from '@lightdash/common';
import { verifyPreviewTokenClaims } from '../../../routers/appPreviewToken';
import { AppGenerateService } from './AppGenerateService';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', () => ({ generateObject: vi.fn() }));

const USER_UUID = 'user-uuid';
const APP_UUID = '11111111-1111-4111-8111-111111111111';
const PROJECT_UUID = 'project-uuid';
const ORGANIZATION_UUID = 'organization-uuid';
const SPACE_UUID = 'space-uuid';

const app = {
    app_id: APP_UUID,
    project_uuid: PROJECT_UUID,
    organization_uuid: ORGANIZATION_UUID,
    space_uuid: SPACE_UUID,
    created_by_user_uuid: 'owner-uuid',
    template: null,
};

const buildUser = (): SessionUser => {
    const ability = new Ability([
        {
            action: 'view',
            subject: 'DataApp',
            conditions: {
                projectUuid: PROJECT_UUID,
                access: { $elemMatch: { userUuid: USER_UUID } },
            },
        },
        {
            action: 'manage',
            subject: 'DataApp',
            conditions: {
                projectUuid: PROJECT_UUID,
                access: {
                    $elemMatch: {
                        userUuid: USER_UUID,
                        role: SpaceMemberRole.EDITOR,
                    },
                },
            },
        },
    ]);
    return {
        userUuid: USER_UUID,
        organizationUuid: ORGANIZATION_UUID,
        isActive: true,
        ability,
        abilityRules: ability.rules,
    } as unknown as SessionUser;
};

const buildService = (role: SpaceMemberRole) => {
    const appModel = {
        findApp: vi.fn().mockResolvedValue(app),
        getApp: vi.fn().mockResolvedValue(app),
        getAppByUuidOrSlug: vi.fn().mockResolvedValue(app),
        getAppWithVersions: vi.fn().mockResolvedValue({
            name: 'Granted app',
            description: 'Description',
            createdByUserUuid: app.created_by_user_uuid,
            organizationUuid: ORGANIZATION_UUID,
            spaceUuid: SPACE_UUID,
            spaceName: 'Private parent',
            template: null,
            slug: 'granted-app',
            viewsCount: 3,
            pinnedListUuid: 'private-list',
            pinnedListOrder: 1,
            versions: [
                {
                    version: 2,
                    prompt: 'generation prompt',
                    status: 'ready',
                    status_message: null,
                    status_history: [],
                    error: null,
                    resources: null,
                    dependencies: null,
                    viz_schema: null,
                    created_at: new Date(),
                    status_updated_at: new Date(),
                    created_by_user_uuid: 'owner-uuid',
                    created_by_user_first_name: 'Owner',
                    created_by_user_last_name: 'User',
                },
            ],
            hasMore: false,
        }),
        getLatestReadyVersion: vi.fn().mockResolvedValue({ version: 2 }),
        moveToSpace: vi.fn(),
    };
    const accessContext = {
        organizationUuid: ORGANIZATION_UUID,
        projectUuid: PROJECT_UUID,
        inheritsFromOrgOrProject: false,
        admins: [],
        access: [
            {
                userUuid: USER_UUID,
                role,
                hasDirectAccess: true,
                grantedVia: 'app' as const,
            },
        ],
        directOnly: true,
    };
    const spacePermissionService = {
        resolveAccess: vi.fn().mockResolvedValue(accessContext),
        resolveAccessBatch: vi
            .fn()
            .mockResolvedValue([{ context: accessContext }]),
    };
    const userModel = {
        findSessionUserAndOrgByUuid: vi.fn().mockResolvedValue(buildUser()),
    };
    const service = new AppGenerateService({
        dataAppTemplateService: {} as never,
        lightdashConfig: {
            lightdashSecrets: {
                active: 'test-secret',
                fallbacks: [],
                all: ['test-secret'],
            },
        } as never,
        analytics: { track: vi.fn() } as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        userModel: userModel as never,
        appModel: appModel as never,
        featureFlagModel: {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        } as never,
        organizationDesignModel: {} as never,
        pinnedListModel: {} as never,
        projectModel: {
            getSummary: vi.fn().mockResolvedValue({
                organizationUuid: ORGANIZATION_UUID,
                type: ProjectType.DEFAULT,
                createdByUserUuid: 'project-owner-uuid',
                upstreamProjectUuid: null,
            }),
        } as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        savedChartModel: {} as never,
        schedulerClient: {} as never,
        savedChartService: {} as never,
        spacePermissionService: spacePermissionService as never,
        coderService: {} as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {
            getBrowserImageOrigins: vi.fn().mockResolvedValue([]),
        } as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {} as never,
        sandboxManager: null,
        appRuntimeS3: null,
    });
    return { appModel, service, spacePermissionService, userModel };
};

describe('AppGenerateService direct app access', () => {
    it('gives a direct Viewer the normal app read surface without parent metadata', async () => {
        const { service, spacePermissionService } = buildService(
            SpaceMemberRole.VIEWER,
        );
        const user = buildUser();

        await expect(
            service.getAppVersions(user, PROJECT_UUID, APP_UUID, {}),
        ).resolves.toMatchObject({
            spaceUuid: null,
            spaceName: null,
            pinnedListUuid: null,
            versions: [{ version: 2, prompt: 'generation prompt' }],
        });

        const token = await service.getPreviewToken(
            user,
            PROJECT_UUID,
            APP_UUID,
            1,
        );
        expect(
            verifyPreviewTokenClaims(token, {
                active: 'test-secret',
                fallbacks: [],
                all: ['test-secret'],
            }),
        ).toMatchObject({ ok: true });

        await expect(
            service.filterAppsUserCanView(
                user,
                ORGANIZATION_UUID,
                PROJECT_UUID,
                [
                    {
                        uuid: APP_UUID,
                        spaceUuid: SPACE_UUID,
                        createdBy: { userUuid: app.created_by_user_uuid },
                    },
                ],
            ),
        ).resolves.toEqual([
            {
                uuid: APP_UUID,
                spaceUuid: SPACE_UUID,
                createdBy: { userUuid: app.created_by_user_uuid },
            },
        ]);
        expect(
            spacePermissionService.resolveAccessBatch,
        ).toHaveBeenCalledOnce();
    });

    it('gives a direct Editor the normal app manage surface', async () => {
        const { appModel, service } = buildService(SpaceMemberRole.EDITOR);

        await service.moveToSpace(buildUser(), {
            projectUuid: PROJECT_UUID,
            itemUuid: APP_UUID,
            targetSpaceUuid: 'target-space-uuid',
        });

        expect(appModel.moveToSpace).toHaveBeenCalledWith(
            {
                appId: APP_UUID,
                projectUuid: PROJECT_UUID,
                targetSpaceUuid: 'target-space-uuid',
            },
            { tx: undefined },
        );
    });

    it('re-authorizes queued access after revocation', async () => {
        const { service, spacePermissionService, userModel } = buildService(
            SpaceMemberRole.EDITOR,
        );
        const queuedAuthorization = service as unknown as {
            authorizePipelineExecution: (payload: {
                appUuid: string;
                organizationUuid: string;
                projectUuid: string;
                userUuid: string;
            }) => Promise<SessionUser>;
        };
        const payload = {
            appUuid: APP_UUID,
            version: 2,
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PROJECT_UUID,
            userUuid: USER_UUID,
        };

        await expect(
            queuedAuthorization.authorizePipelineExecution(payload),
        ).resolves.toBe(await userModel.findSessionUserAndOrgByUuid());
        spacePermissionService.resolveAccess.mockResolvedValue({
            organizationUuid: ORGANIZATION_UUID,
            projectUuid: PROJECT_UUID,
            inheritsFromOrgOrProject: false,
            admins: [],
            access: [],
            directOnly: false,
        });

        await expect(
            queuedAuthorization.authorizePipelineExecution(payload),
        ).rejects.toThrow(ForbiddenError);
    });
});
