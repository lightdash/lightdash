import { Ability, AbilityBuilder } from '@casl/ability';
import {
    ForbiddenError,
    projectMemberAbilities,
    ProjectMemberRole,
    ProjectType,
    type MemberAbility,
    type SessionUser,
} from '@lightdash/common';
import { buildAppThumbnailClientMock } from '../../clients/AppThumbnailClient.mock';
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

const ORG_UUID = 'org-uuid';
const USER_UUID = 'user-uuid';
const PROJECT_UUID = 'project-uuid';
const SHARED_SPACE_UUID = 'shared-space-uuid';
const PRIVATE_SPACE_UUID = 'private-space-uuid';

const sharedApp = {
    app_id: 'shared-app',
    name: 'Shared app',
    slug: 'shared-app',
    template: null,
    project_uuid: PROJECT_UUID,
    space_uuid: SHARED_SPACE_UUID,
    created_by_user_uuid: 'someone-else',
};
const privateApp = {
    app_id: 'private-app',
    name: 'Private app',
    slug: 'private-app',
    template: null,
    project_uuid: PROJECT_UUID,
    space_uuid: PRIVATE_SPACE_UUID,
    created_by_user_uuid: 'someone-else',
};

const buildUser = (role: ProjectMemberRole): SessionUser => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    projectMemberAbilities[role](
        { role, projectUuid: PROJECT_UUID, userUuid: USER_UUID },
        builder,
    );
    const ability = builder.build();
    return {
        userUuid: USER_UUID,
        organizationUuid: ORG_UUID,
        isActive: true,
        ability,
        abilityRules: ability.rules,
    } as unknown as SessionUser;
};

const accessContextFor = (spaceUuid: string | null) => ({
    organizationUuid: ORG_UUID,
    projectUuid: PROJECT_UUID,
    // Only the shared space is visible project-wide.
    inheritsFromOrgOrProject: spaceUuid === SHARED_SPACE_UUID,
    access: [],
    admins: [],
    directOnly: false,
});

const buildService = () => {
    const spacePermissionService = {
        resolveAccessBatch: vi
            .fn()
            .mockImplementation(
                async (
                    _userUuid: string,
                    targets: Array<{ spaceUuid: string | null }>,
                ) =>
                    targets.map((target) => ({
                        context: accessContextFor(target.spaceUuid),
                    })),
            ),
    };
    const service = new AppGenerateService({
        agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
        aiCreditService: { assertAiCreditsAvailable: async () => undefined },
        lightdashConfig: {} as never,
        analytics: {} as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        userModel: {} as never,
        appModel: {
            listAppsByProject: vi
                .fn()
                .mockResolvedValue([sharedApp, privateApp]),
        } as never,
        featureFlagModel: {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        } as never,
        organizationDesignModel: {} as never,
        pinnedListModel: {} as never,
        projectModel: {
            getSummary: vi.fn().mockResolvedValue({
                organizationUuid: ORG_UUID,
                projectUuid: PROJECT_UUID,
                type: ProjectType.DEFAULT,
                createdByUserUuid: 'project-owner',
                upstreamProjectUuid: undefined,
            }),
        } as never,
        projectParametersModel: {} as never,
        spaceModel: {} as never,
        savedChartModel: {} as never,
        schedulerClient: {} as never,
        savedChartService: {} as never,
        spacePermissionService: spacePermissionService as never,
        coderService: {} as never,
        documentService: {} as never,
        dashboardService: {} as never,
        projectService: {} as never,
        promoteService: {} as never,
        externalConnectionModel: {} as never,
        sandboxRegistryModel: {} as never,
        orgAiCopilotConfigResolver: {} as never,
        sandboxManager: null,
        appRuntimeS3: null,
        appThumbnailClient: buildAppThumbnailClientMock(),
        chartRegistryClient: {} as never,
        contentVerificationModel: {
            getByContent: async () => null,
            verify: async () => undefined,
            unverify: async () => undefined,
        } as never,
    });
    return { service, spacePermissionService };
};

describe('AppGenerateService.listAppsForProject', () => {
    it('lists the apps a project Developer can view', async () => {
        const { service } = buildService();

        await expect(
            service.listAppsForProject(
                buildUser(ProjectMemberRole.DEVELOPER),
                PROJECT_UUID,
            ),
        ).resolves.toEqual([
            {
                appUuid: 'shared-app',
                name: 'Shared app',
                slug: 'shared-app',
                template: null,
            },
        ]);
    });

    it('lists every app for a project Admin', async () => {
        const { service, spacePermissionService } = buildService();

        await expect(
            service.listAppsForProject(
                buildUser(ProjectMemberRole.ADMIN),
                PROJECT_UUID,
            ),
        ).resolves.toEqual([
            expect.objectContaining({ appUuid: 'shared-app' }),
            expect.objectContaining({ appUuid: 'private-app' }),
        ]);
        expect(
            spacePermissionService.resolveAccessBatch,
        ).toHaveBeenCalledOnce();
    });

    it('refuses a plain Viewer with no data app access', async () => {
        const { service } = buildService();

        await expect(
            service.listAppsForProject(
                buildUser(ProjectMemberRole.VIEWER),
                PROJECT_UUID,
            ),
        ).rejects.toThrow(ForbiddenError);
    });
});
