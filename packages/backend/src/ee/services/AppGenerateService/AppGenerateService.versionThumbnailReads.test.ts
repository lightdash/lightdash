import { Ability } from '@casl/ability';
import {
    AgentActorSurface,
    buildAgentIdentityClaim,
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    ProjectType,
    SpaceMemberRole,
    type AgentIdentityClaim,
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
    name: 'Sales app',
    template: null,
};

type VersionRow = {
    version: number;
    status: 'ready' | 'error' | 'building';
    thumbnail_captured_at: Date | null;
    thumbnail_is_manual: boolean | null;
};

const versionRow = (row: VersionRow) => ({
    ...row,
    app_thread_uuid: 'thread-1',
    thread_number: 1,
    prompt: `prompt ${row.version}`,
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
});

const VERSIONS: VersionRow[] = [
    {
        version: 4,
        status: 'building',
        thumbnail_captured_at: null,
        thumbnail_is_manual: null,
    },
    {
        version: 3,
        status: 'ready',
        thumbnail_captured_at: new Date(),
        thumbnail_is_manual: true,
    },
    {
        version: 2,
        status: 'error',
        thumbnail_captured_at: null,
        thumbnail_is_manual: null,
    },
    {
        version: 1,
        status: 'ready',
        thumbnail_captured_at: null,
        thumbnail_is_manual: null,
    },
];

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
    ]);
    return {
        userUuid: USER_UUID,
        organizationUuid: ORGANIZATION_UUID,
        isActive: true,
        ability,
        abilityRules: ability.rules,
    } as unknown as SessionUser;
};

const buildService = ({
    canView,
    agentIdentityEnabled = false,
    organizationIdentityEnabled = agentIdentityEnabled,
    agentIdentity = null,
}: {
    canView: boolean;
    agentIdentityEnabled?: boolean;
    organizationIdentityEnabled?: boolean;
    agentIdentity?: AgentIdentityClaim | null;
}) => {
    const rows = VERSIONS.map((row) => ({
        ...versionRow(row),
        agent_identity: agentIdentity,
    }));
    const appModel = {
        getApp: async () => app,
        getAppByUuidOrSlug: async () => app,
        getVersion: async (_appUuid: string, version: number) =>
            rows.find((row) => row.version === version) ?? null,
        getLatestReadyVersion: async () =>
            rows.find((row) => row.status === 'ready') ?? null,
        getAppWithVersions: async () => ({
            name: app.name,
            description: '',
            createdByUserUuid: app.created_by_user_uuid,
            organizationUuid: ORGANIZATION_UUID,
            spaceUuid: SPACE_UUID,
            spaceName: 'Space',
            template: null,
            slug: 'sales-app',
            viewsCount: 0,
            pinnedListUuid: null,
            pinnedListOrder: null,
            currentThread: {
                app_thread_uuid: 'thread-1',
                thread_number: 1,
                created_at: new Date(),
            },
            versions: rows,
            hasMore: false,
        }),
    };
    const accessContext = {
        organizationUuid: ORGANIZATION_UUID,
        projectUuid: PROJECT_UUID,
        inheritsFromOrgOrProject: false,
        admins: [],
        access: canView
            ? [
                  {
                      userUuid: USER_UUID,
                      role: SpaceMemberRole.VIEWER,
                      hasDirectAccess: true,
                      grantedVia: 'app' as const,
                  },
              ]
            : [],
        directOnly: false,
    };
    return new AppGenerateService({
        agentActionLogModel: { insert: vi.fn().mockResolvedValue(undefined) },
        aiCreditService: { assertAiCreditsAvailable: async () => undefined },
        lightdashConfig: { appRuntime: {} } as never,
        analytics: { track: vi.fn() } as never,
        analyticsModel: {} as never,
        catalogModel: {} as never,
        userModel: {} as never,
        appModel: appModel as never,
        featureFlagModel: {
            get: async ({
                featureFlagId,
                user: viewer,
            }: {
                featureFlagId: string;
                user?: { userUuid?: string };
            }) => {
                const viewerEnabled =
                    viewer?.userUuid === USER_UUID
                        ? agentIdentityEnabled
                        : organizationIdentityEnabled;
                return {
                    enabled:
                        featureFlagId === FeatureFlags.AgentIdentity
                            ? viewerEnabled
                            : true,
                };
            },
        } as never,
        organizationDesignModel: {} as never,
        pinnedListModel: {} as never,
        projectModel: {
            getSummary: async () => ({
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
        spacePermissionService: {
            resolveAccess: async () => accessContext,
            resolveAccessBatch: async () => [{ context: accessContext }],
        } as never,
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
        appThumbnailClient: buildAppThumbnailClientMock({
            appModel: appModel as never,
        }),
        chartRegistryClient: {} as never,
        contentVerificationModel: {
            getByContent: async () => null,
        } as never,
    });
};

describe('AppGenerateService version thumbnails', () => {
    it.each([true, false])(
        'uses the viewer override over the opposite org flag for app DTOs (%s)',
        async (enabled) => {
            const agentIdentity = buildAgentIdentityClaim({
                subject: { type: 'user', uuid: USER_UUID },
                surface: AgentActorSurface.MCP,
                clientId: null,
            });
            const service = buildService({
                canView: true,
                agentIdentityEnabled: enabled,
                organizationIdentityEnabled: !enabled,
                agentIdentity,
            });
            const { versions } = await service.getAppVersions(
                buildUser(),
                PROJECT_UUID,
                APP_UUID,
                {},
            );
            for (const version of versions) {
                if (enabled)
                    expect(version).toHaveProperty(
                        'agentIdentity',
                        agentIdentity,
                    );
                else expect(version).not.toHaveProperty('agentIdentity');
            }
        },
    );
    it('reports on each version whether it has a thumbnail to read', async () => {
        const service = buildService({ canView: true });

        const { versions } = await service.getAppVersions(
            buildUser(),
            PROJECT_UUID,
            APP_UUID,
            {},
        );

        expect(
            versions.map(({ version, hasThumbnail }) => ({
                version,
                hasThumbnail,
            })),
        ).toEqual([
            { version: 4, hasThumbnail: false },
            { version: 3, hasThumbnail: true },
            { version: 2, hasThumbnail: false },
            { version: 1, hasThumbnail: false },
        ]);
    });

    it('gives a viewer of the app a link to a version thumbnail', async () => {
        const service = buildService({ canView: true });

        const { thumbnailUrl } = await service.getVersionThumbnailUrl(
            buildUser(),
            PROJECT_UUID,
            APP_UUID,
            3,
        );

        expect(() => new URL(thumbnailUrl)).not.toThrow();
    });

    it('finds no thumbnail for a version the summary reports without one', async () => {
        const service = buildService({ canView: true });

        await expect(
            service.getVersionThumbnailUrl(
                buildUser(),
                PROJECT_UUID,
                APP_UUID,
                1,
            ),
        ).rejects.toThrow(NotFoundError);
    });

    it('refuses a version thumbnail to a user who cannot view the app', async () => {
        const service = buildService({ canView: false });

        await expect(
            service.getVersionThumbnailUrl(
                buildUser(),
                PROJECT_UUID,
                APP_UUID,
                3,
            ),
        ).rejects.toThrow(ForbiddenError);
    });
});
