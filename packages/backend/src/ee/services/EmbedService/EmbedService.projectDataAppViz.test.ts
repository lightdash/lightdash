import { Ability, AbilityBuilder } from '@casl/ability';
import {
    applyEmbeddedAbility,
    FeatureFlags,
    ForbiddenError,
    NotFoundError,
    type AnonymousAccount,
    type CreateEmbedJwt,
    type DataAppVizSchema,
    type MemberAbility,
} from '@lightdash/common';
import { verifyPreviewTokenClaims } from '../../../routers/appPreviewToken';
import { EmbedService } from './EmbedService';
import { EmbedServiceArgumentsMock } from './EmbedService.mock';

const PROJECT_UUID = 'project-1';
const OTHER_PROJECT_UUID = 'project-2';
const ORGANIZATION_UUID = 'org-1';
const DATA_APP_VIZ_UUID = 'data-app-viz-1';
const schema: DataAppVizSchema = {
    fields: [],
    configOptions: [],
    colorPalette: null,
};

const viz = (overrides: Record<string, unknown> = {}) => ({
    app_id: DATA_APP_VIZ_UUID,
    project_uuid: PROJECT_UUID,
    organization_uuid: ORGANIZATION_UUID,
    space_uuid: null,
    created_by_user_uuid: 'author-1',
    slug: 'custom-viz',
    name: 'Custom viz',
    description: null,
    registry_slug: null,
    icon: null,
    created_at: new Date('2026-09-01'),
    viz_schema: schema,
    ...overrides,
});

const version = (overrides: Record<string, unknown> = {}) => ({
    app_version_id: 'version-1',
    app_id: DATA_APP_VIZ_UUID,
    version: 1,
    status: 'ready',
    viz_schema: schema,
    viz_preview: null,
    ...overrides,
});

const accountForToken = (
    embedUser: CreateEmbedJwt,
    hasExploreRole = false,
): AnonymousAccount => {
    const builder = new AbilityBuilder<MemberAbility>(Ability);
    if (hasExploreRole) {
        builder.can('view', 'EmbedExplore', {
            projectUuid: PROJECT_UUID,
            organizationUuid: ORGANIZATION_UUID,
        });
    }
    const content =
        embedUser.content.type === 'dataApp'
            ? {
                  type: 'dataApp' as const,
                  appUuid: embedUser.content.appUuid,
                  chartUuids: [],
                  explores: [],
              }
            : {
                  type: 'dashboard' as const,
                  dashboardUuid: 'dashboard-1',
                  chartUuids: [],
                  explores: [],
              };
    applyEmbeddedAbility(
        embedUser,
        content,
        {
            projectUuid: PROJECT_UUID,
            organization: { organizationUuid: ORGANIZATION_UUID },
        } as never,
        'embed-user-1',
        builder,
    );
    return {
        authentication: { type: 'jwt', source: 'embed-token', data: embedUser },
        organization: { organizationUuid: ORGANIZATION_UUID },
        access: { content },
        embed: { projectUuid: PROJECT_UUID },
        isAnonymousUser: vi.fn().mockReturnValue(true),
        isJwtUser: vi.fn().mockReturnValue(true),
        user: {
            id: 'embed-user-1',
            type: 'anonymous',
            ability: builder.build(),
        },
    } as unknown as AnonymousAccount;
};

const account = (canExplore = true) =>
    accountForToken({
        content: {
            type: 'dashboard',
            dashboardUuid: 'dashboard-1',
            canExplore,
        },
    });

const buildService = ({
    appModel = {},
    featureFlagModel = { get: vi.fn().mockResolvedValue({ enabled: true }) },
}: {
    appModel?: Record<string, unknown>;
    featureFlagModel?: Record<string, unknown>;
}) =>
    new EmbedService({
        ...EmbedServiceArgumentsMock,
        lightdashConfig: {
            ...EmbedServiceArgumentsMock.lightdashConfig,
            lightdashSecrets: {
                active: 'test-secret',
                fallbacks: [],
                all: ['test-secret'],
            },
        },
        projectModel: {
            getSummary: vi.fn().mockResolvedValue({
                organizationUuid: ORGANIZATION_UUID,
            }),
        },
        appModel,
        featureFlagModel,
        externalConnectionModel: {
            getBrowserImageOrigins: vi.fn().mockResolvedValue([]),
        },
    } as never);

describe('EmbedService project chart types', () => {
    it('lists paginated project chart types for an Explore-authorized embed', async () => {
        const appModel = {
            listDataAppVisualizations: vi.fn().mockResolvedValue({
                data: [viz()],
                pagination: { totalResults: 1, totalPageCount: 1 },
            }),
        };
        const service = buildService({ appModel });

        await expect(
            service.listEmbedProjectDataAppVisualizations(
                account(),
                PROJECT_UUID,
                { page: 2, pageSize: 10 },
                'custom',
                { sortBy: 'name', sortDirection: 'asc' },
            ),
        ).resolves.toMatchObject({
            data: [{ dataAppVizUuid: DATA_APP_VIZ_UUID }],
        });
        expect(appModel.listDataAppVisualizations).toHaveBeenCalledWith(
            PROJECT_UUID,
            { page: 2, pageSize: 10 },
            'custom',
            { sortBy: 'name', sortDirection: 'asc' },
        );
    });

    it('rejects listing without Explore access or for another project', async () => {
        const service = buildService({
            appModel: { listDataAppVisualizations: vi.fn() },
        });
        await expect(
            service.listEmbedProjectDataAppVisualizations(
                account(false),
                PROJECT_UUID,
            ),
        ).rejects.toThrow(ForbiddenError);
        await expect(
            service.listEmbedProjectDataAppVisualizations(
                account(),
                OTHER_PROJECT_UUID,
            ),
        ).rejects.toThrow('Project mismatch');
    });

    it.each([
        [false, false],
        [false, true],
        [true, false],
        [true, true],
    ])(
        'resolves data apps=%s, library=%s for the embed organization',
        async (dataApps, library) => {
            const featureFlagModel = {
                get: vi.fn().mockImplementation(async ({ featureFlagId }) => ({
                    enabled:
                        featureFlagId === FeatureFlags.EnableDataApps
                            ? dataApps
                            : library,
                })),
            };
            const list = vi
                .fn()
                .mockResolvedValue({ data: [], pagination: undefined });
            const service = buildService({
                appModel: { listDataAppVisualizations: list },
                featureFlagModel,
            });
            const result = service.listEmbedProjectDataAppVisualizations(
                account(),
                PROJECT_UUID,
            );
            if (dataApps || library)
                await expect(result).resolves.toMatchObject({ data: [] });
            else {
                await expect(result).rejects.toThrow(
                    'Chart types are not enabled',
                );
                expect(list).not.toHaveBeenCalled();
            }
            expect(featureFlagModel.get).toHaveBeenCalledWith({
                user: {
                    userUuid: 'embed-user-1',
                    organizationUuid: ORGANIZATION_UUID,
                },
                featureFlagId: FeatureFlags.EnableDataApps,
            });
            expect(featureFlagModel.get).toHaveBeenCalledTimes(
                dataApps ? 1 : 2,
            );
            if (!dataApps) {
                expect(featureFlagModel.get).toHaveBeenCalledWith({
                    user: {
                        userUuid: 'embed-user-1',
                        organizationUuid: ORGANIZATION_UUID,
                    },
                    featureFlagId: FeatureFlags.ChartTypeRegistry,
                });
            }
        },
    );

    it.each(['schema', 'metadata', 'preview'] as const)(
        'rejects %s access before reading chart types when Explore is denied',
        async (operation) => {
            const findVisualizationApp = vi.fn().mockResolvedValue(undefined);
            const service = buildService({
                appModel: { findVisualizationApp },
            });
            const denied = account(false);
            const requests = {
                schema: () =>
                    service.getEmbedProjectDataAppVisualization(
                        denied,
                        PROJECT_UUID,
                        DATA_APP_VIZ_UUID,
                    ),
                metadata: () =>
                    service.getEmbedProjectDataAppVizRenderMetadata(
                        denied,
                        PROJECT_UUID,
                        DATA_APP_VIZ_UUID,
                    ),
                preview: () =>
                    service.getEmbedProjectDataAppVizPreviewToken(
                        denied,
                        PROJECT_UUID,
                        DATA_APP_VIZ_UUID,
                        1,
                    ),
            };
            await expect(requests[operation]()).rejects.toThrow(ForbiddenError);
            expect(findVisualizationApp).not.toHaveBeenCalled();
        },
    );

    it.each([
        { type: 'dataApp', appUuid: 'standalone-app' },
        {
            type: 'dashboard',
            dashboardUuid: 'dashboard-1',
            canViewDataApps: true,
        },
    ] satisfies CreateEmbedJwt['content'][])(
        'does not grant chart type access through $type query permissions',
        async (content) => {
            const viewer = accountForToken({ content });
            const service = buildService({
                appModel: {
                    listDataAppVisualizations: vi
                        .fn()
                        .mockResolvedValue({ data: [], pagination: undefined }),
                    findVisualizationApp: vi.fn().mockResolvedValue(viz()),
                    getVersion: vi.fn().mockResolvedValue(version()),
                },
            });
            await expect(
                service.listEmbedProjectDataAppVisualizations(
                    viewer,
                    PROJECT_UUID,
                ),
            ).rejects.toThrow(ForbiddenError);
            await expect(
                service.getEmbedProjectDataAppVizPreviewToken(
                    viewer,
                    PROJECT_UUID,
                    DATA_APP_VIZ_UUID,
                    1,
                ),
            ).rejects.toThrow(ForbiddenError);
        },
    );

    it('uses the EmbedExplore role instead of JWT flags in roles mode', async () => {
        const service = buildService({
            appModel: {
                listDataAppVisualizations: vi
                    .fn()
                    .mockResolvedValue({ data: [], pagination: undefined }),
            },
        });
        const token = {
            content: {
                type: 'dashboard',
                dashboardUuid: 'dashboard-1',
                canExplore: true,
            },
            writeActions: { spaceUuid: 'space-1', permissionsMode: 'roles' },
        } satisfies CreateEmbedJwt;
        await expect(
            service.listEmbedProjectDataAppVisualizations(
                accountForToken(token),
                PROJECT_UUID,
            ),
        ).rejects.toThrow(ForbiddenError);
        await expect(
            service.listEmbedProjectDataAppVisualizations(
                accountForToken(
                    {
                        ...token,
                        content: { ...token.content, canExplore: false },
                    },
                    true,
                ),
                PROJECT_UUID,
            ),
        ).resolves.toEqual({ data: [], pagination: undefined });
    });

    it('gets project-local schemas and denies a visualization outside the project', async () => {
        const service = buildService({
            appModel: {
                findVisualizationApp: vi.fn().mockResolvedValue(viz()),
            },
        });
        await expect(
            service.getEmbedProjectDataAppVisualization(
                account(),
                PROJECT_UUID,
                DATA_APP_VIZ_UUID,
            ),
        ).resolves.toMatchObject({ dataAppVizUuid: DATA_APP_VIZ_UUID, schema });

        const missing = buildService({
            appModel: {
                findVisualizationApp: vi.fn().mockResolvedValue(undefined),
            },
        });
        await expect(
            missing.getEmbedProjectDataAppVisualization(
                account(),
                PROJECT_UUID,
                DATA_APP_VIZ_UUID,
            ),
        ).rejects.toThrow(NotFoundError);
    });

    it('returns metadata and mints a project-bound token for a ready version', async () => {
        const appModel = {
            findVisualizationApp: vi.fn().mockResolvedValue(viz()),
            getLatestVersion: vi.fn().mockResolvedValue(version()),
            getLatestRenderableDataAppVizVersion: vi
                .fn()
                .mockResolvedValue(version()),
            getVersion: vi.fn().mockResolvedValue(version()),
        };
        const service = buildService({ appModel });
        await expect(
            service.getEmbedProjectDataAppVizRenderMetadata(
                account(),
                PROJECT_UUID,
                DATA_APP_VIZ_UUID,
            ),
        ).resolves.toMatchObject({ state: 'ready', version: 1, schema });
        const token = await service.getEmbedProjectDataAppVizPreviewToken(
            account(),
            PROJECT_UUID,
            DATA_APP_VIZ_UUID,
            1,
        );
        expect(
            verifyPreviewTokenClaims(token, {
                active: 'test-secret',
                fallbacks: [],
                all: ['test-secret'],
            }),
        ).toMatchObject({
            ok: true,
            payload: {
                appUuid: DATA_APP_VIZ_UUID,
                userUuid: 'embed-user-1',
                organizationUuid: ORGANIZATION_UUID,
                projectUuid: PROJECT_UUID,
            },
        });
    });

    it('rejects an invalid preview version', async () => {
        const service = buildService({
            appModel: {
                findVisualizationApp: vi.fn().mockResolvedValue(viz()),
                getVersion: vi.fn().mockResolvedValue(null),
            },
        });
        await expect(
            service.getEmbedProjectDataAppVizPreviewToken(
                account(),
                PROJECT_UUID,
                DATA_APP_VIZ_UUID,
                2,
            ),
        ).rejects.toThrow(NotFoundError);
    });
});
