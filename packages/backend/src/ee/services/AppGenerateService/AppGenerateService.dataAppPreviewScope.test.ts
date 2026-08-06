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

/**
 * A CLI-style custom role assigned on the production project: it may create
 * previews and author data apps inside them, but has no production data app
 * rights.
 */
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
) => Promise<void>;

const buildAssert = (): AssertFn => {
    const service = new AppGenerateService({
        lightdashConfig: {} as never,
        analytics: {} as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        appModel: {} as never,
        featureFlagModel: {} as never,
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
    return (
        service as unknown as { assertDataAppAbility: AssertFn }
    ).assertDataAppAbility.bind(service);
};

describe('DataApp preview scopes', () => {
    const previewOnlyScopes = [
        'view:Project',
        'create:Project@preview',
        'create:DataApp@preview',
        'manage:DataApp@preview',
    ];

    it('allows creating and iterating on apps in a preview the user created', async () => {
        const assertDataAppAbility = buildAssert();
        const user = buildPreviewOnlyUser(previewOnlyScopes);

        await expect(
            assertDataAppAbility(user, 'create', OWN_PREVIEW_UUID, 'denied'),
        ).resolves.toBeUndefined();
        await expect(
            assertDataAppAbility(user, 'manage', OWN_PREVIEW_UUID, 'denied', {
                createdByUserUuid: USER_UUID,
            }),
        ).resolves.toBeUndefined();
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
        ).rejects.toThrow(/only allows data apps in preview projects/);
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
        ).resolves.toBeUndefined();
    });
});
