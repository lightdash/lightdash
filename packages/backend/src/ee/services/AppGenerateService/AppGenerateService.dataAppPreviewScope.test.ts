import { Ability, AbilityBuilder } from '@casl/ability';
import {
    buildAbilityFromScopes,
    ForbiddenError,
    ProjectType,
    type MemberAbility,
    type SessionUser,
} from '@lightdash/common';
import { AppGenerateService } from './AppGenerateService';

vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));
vi.mock('ai', () => ({
    generateObject: vi.fn(),
}));

const ORG_UUID = 'org-1';
const USER_UUID = 'user-1';
const PRODUCTION_PROJECT_UUID = 'production-1';
const OWN_PREVIEW_UUID = 'preview-own';
const OTHERS_PREVIEW_UUID = 'preview-others';

const PROJECTS = {
    [PRODUCTION_PROJECT_UUID]: {
        organizationUuid: ORG_UUID,
        projectUuid: PRODUCTION_PROJECT_UUID,
        name: 'Production',
        type: ProjectType.DEFAULT,
        createdByUserUuid: USER_UUID,
        upstreamProjectUuid: undefined,
    },
    [OWN_PREVIEW_UUID]: {
        organizationUuid: ORG_UUID,
        projectUuid: OWN_PREVIEW_UUID,
        name: 'Own preview',
        type: ProjectType.PREVIEW,
        createdByUserUuid: USER_UUID,
        upstreamProjectUuid: PRODUCTION_PROJECT_UUID,
    },
    [OTHERS_PREVIEW_UUID]: {
        organizationUuid: ORG_UUID,
        projectUuid: OTHERS_PREVIEW_UUID,
        name: "Someone else's preview",
        type: ProjectType.PREVIEW,
        createdByUserUuid: 'another-user',
        upstreamProjectUuid: PRODUCTION_PROJECT_UUID,
    },
};

const buildPreviewOnlyUser = (scopes: string[]): SessionUser => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    buildAbilityFromScopes(
        {
            userUuid: USER_UUID,
            projectUuid: PRODUCTION_PROJECT_UUID,
            scopes,
            isEnterprise: true,
        },
        builder,
    );
    return {
        userUuid: USER_UUID,
        organizationUuid: ORG_UUID,
        ability: builder.build(),
    } as unknown as SessionUser;
};

type AssertFn = (
    user: SessionUser,
    action: 'view' | 'create' | 'manage',
    projectUuid: string,
    errorMessage: string,
    extraContext?: Record<string, unknown>,
) => Promise<{ projectUuid: string }>;

const buildService = () =>
    new AppGenerateService({
        lightdashConfig: {} as never,
        analytics: {} as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        appModel: {
            listAppsByProject: vi.fn().mockResolvedValue([
                {
                    app_id: 'app-1',
                    name: 'Preview app',
                    slug: 'preview-app',
                },
            ]),
        } as never,
        featureFlagModel: {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        } as never,
        organizationDesignModel: {} as never,
        pinnedListModel: {} as never,
        projectModel: {
            getSummary: vi
                .fn()
                .mockImplementation(async (projectUuid: string) => {
                    const project =
                        PROJECTS[projectUuid as keyof typeof PROJECTS];
                    if (!project) throw new Error('unknown project');
                    return project;
                }),
        } as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        savedChartModel: {} as never,
        schedulerClient: {} as never,
        savedChartService: {} as never,
        spacePermissionService: {} as never,
        coderService: {} as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {} as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {} as never,
    });

const buildAssert = (): AssertFn => {
    const service = buildService();
    return (
        service as unknown as { assertDataAppAbility: AssertFn }
    ).assertDataAppAbility.bind(service);
};

describe('DataApp preview scopes', () => {
    const previewOnlyScopes = [
        'view:Project',
        'view:DataApp',
        'create:Project@preview',
        'create:DataApp@preview',
        'manage:DataApp@preview',
    ];

    it('allows creating and iterating on apps in a preview the user created', async () => {
        const assertDataAppAbility = buildAssert();
        const user = buildPreviewOnlyUser(previewOnlyScopes);

        await expect(
            assertDataAppAbility(user, 'create', OWN_PREVIEW_UUID, 'denied'),
        ).resolves.toMatchObject({ projectUuid: OWN_PREVIEW_UUID });
        await expect(
            assertDataAppAbility(user, 'manage', OWN_PREVIEW_UUID, 'denied', {
                createdByUserUuid: USER_UUID,
            }),
        ).resolves.toMatchObject({ projectUuid: OWN_PREVIEW_UUID });
    });

    it('allows viewing apps in a preview the user created', async () => {
        const service = buildService();
        const user = buildPreviewOnlyUser(previewOnlyScopes);

        await expect(
            service.canViewApp(user, {
                organization_uuid: ORG_UUID,
                project_uuid: OWN_PREVIEW_UUID,
                space_uuid: null,
                created_by_user_uuid: 'another-user',
            }),
        ).resolves.toBe(true);
    });

    it('allows listing apps in a preview the user created', async () => {
        const service = buildService();
        const user = buildPreviewOnlyUser(previewOnlyScopes);

        await expect(
            service.listAppsForProject(user, OWN_PREVIEW_UUID),
        ).resolves.toEqual([
            {
                appUuid: 'app-1',
                name: 'Preview app',
                slug: 'preview-app',
            },
        ]);
    });

    it('refuses uploads to production and to previews created by someone else', async () => {
        const assertDataAppAbility = buildAssert();
        const user = buildPreviewOnlyUser(previewOnlyScopes);

        await expect(
            assertDataAppAbility(
                user,
                'create',
                PRODUCTION_PROJECT_UUID,
                'denied',
            ),
        ).rejects.toThrow(ForbiddenError);
        await expect(
            assertDataAppAbility(user, 'create', OTHERS_PREVIEW_UUID, 'denied'),
        ).rejects.toThrow(ForbiddenError);
    });

    it('explains that the role is preview-only when it is', async () => {
        const assertDataAppAbility = buildAssert();
        const user = buildPreviewOnlyUser(previewOnlyScopes);

        await expect(
            assertDataAppAbility(
                user,
                'create',
                PRODUCTION_PROJECT_UUID,
                'Insufficient permissions to create data apps',
            ),
        ).rejects.toMatchObject({
            message:
                'Insufficient permissions to create data apps. Your role only allows data apps in preview projects you created, and this is not one.',
        });
    });

    it('keeps the generic message for roles with no preview-only grant', async () => {
        const assertDataAppAbility = buildAssert();
        const user = buildPreviewOnlyUser(['view:Project']);

        await expect(
            assertDataAppAbility(
                user,
                'create',
                PRODUCTION_PROJECT_UUID,
                'Insufficient permissions to create data apps',
            ),
        ).rejects.toThrow(/^Insufficient permissions to create data apps$/);
    });

    it('leaves create:DataApp reaching production as before', async () => {
        const assertDataAppAbility = buildAssert();
        const user = buildPreviewOnlyUser(['view:Project', 'create:DataApp']);

        await expect(
            assertDataAppAbility(
                user,
                'create',
                PRODUCTION_PROJECT_UUID,
                'denied',
            ),
        ).resolves.toMatchObject({ projectUuid: PRODUCTION_PROJECT_UUID });
    });
});
