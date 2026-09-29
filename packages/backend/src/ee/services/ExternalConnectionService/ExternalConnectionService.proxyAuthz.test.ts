import { Ability } from '@casl/ability';
import {
    ChartType,
    DashboardTileTypes,
    DATA_APP_VIZ_TEMPLATE,
    defineUserAbility,
    ForbiddenError,
    NotFoundError,
    OrganizationMemberRole,
    ParameterError,
    ProjectType,
    type ExternalFetchRequest,
} from '@lightdash/common';
import { fromJwt, fromSession } from '../../../auth/account';
import {
    buildAccount,
    defaultSessionUser,
} from '../../../auth/account/account.mock';
import { SavedChartService } from '../../../services/SavedChartsService/SavedChartService';
import * as secureFetchModule from '../../../utils/secureFetch/secureFetch';
import { AppGenerateService } from '../AppGenerateService/AppGenerateService';
import { EmbedService } from '../EmbedService/EmbedService';
import { ExternalConnectionService } from './ExternalConnectionService';

vi.mock('../../../utils/secureFetch/secureFetch', async (importOriginal) => ({
    ...(await importOriginal<
        typeof import('../../../utils/secureFetch/secureFetch')
    >()),
    secureFetch: vi.fn(),
}));
vi.mock('e2b', () => ({
    Sandbox: class {},
    CommandExitError: class extends Error {},
    ALL_TRAFFIC: '*',
}));

const mockSecureFetch = vi.mocked(secureFetchModule.secureFetch);
const request: ExternalFetchRequest = {
    connectionAlias: 'weather',
    path: '/v1/today',
};
const chartRequest = {
    ...request,
    chartContext: { savedChartUuid: 'chart-1' },
};

const sessionAccount = (
    role = OrganizationMemberRole.VIEWER,
    organizationUuid = 'org-1',
    userUuid = 'viewer-1',
) => {
    const user = { ...defaultSessionUser, role, organizationUuid, userUuid };
    return fromSession(
        { ...user, ability: defineUserAbility(user, []) },
        'session',
    );
};

const embeddedAccount = (type: 'chart' | 'dashboard', canExplore = false) => {
    const base = buildAccount({ accountType: 'jwt' });
    return fromJwt({
        decodedToken: {
            user: { externalId: 'viewer-1' },
            content:
                type === 'chart'
                    ? { type, contentId: 'chart-1' }
                    : { type, dashboardUuid: 'dashboard-1', canExplore },
        },
        embed: {
            ...base.embed,
            projectUuid: 'proj-1',
            organization: {
                ...base.embed.organization,
                organizationUuid: 'org-1',
            },
            allowAllCharts: true,
            allowAllDashboards: true,
        },
        source: 'embed-token',
        content: {
            type,
            chartUuids: ['chart-1'],
            explores: [],
            ...(type === 'dashboard' ? { dashboardUuid: 'dashboard-1' } : {}),
        },
        userAttributes: base.access.controls!,
    });
};

function buildService({
    template = DATA_APP_VIZ_TEMPLATE,
    chartAccessible = true,
    linked = true,
    chartAppUuid = 'app-1',
    chartProjectUuid = 'proj-1',
    connectionProjectUuid = 'proj-1',
    connectionOrganizationUuid = 'org-1',
    dashboardChartUuid = 'chart-1',
    flagsEnabled = true,
}: {
    template?: string;
    chartAccessible?: boolean;
    linked?: boolean;
    chartAppUuid?: string;
    chartProjectUuid?: string;
    connectionProjectUuid?: string;
    connectionOrganizationUuid?: string;
    dashboardChartUuid?: string;
    flagsEnabled?: boolean;
} = {}) {
    const app = {
        app_id: 'app-1',
        project_uuid: 'proj-1',
        organization_uuid: 'org-1',
        space_uuid: null,
        created_by_user_uuid: 'creator-1',
        template,
    };
    const appModel = {
        findApp: vi.fn(async (appUuid: string, projectUuid: string) =>
            appUuid === app.app_id && projectUuid === app.project_uuid
                ? app
                : undefined,
        ),
        getApp: vi.fn(async (appUuid: string, projectUuid: string) => {
            if (appUuid !== app.app_id || projectUuid !== app.project_uuid)
                throw new NotFoundError('App not found');
            return app;
        }),
        findVisualizationApp: vi.fn().mockResolvedValue(app),
    };
    const savedChartModel = {
        get: vi.fn().mockResolvedValue({
            uuid: 'chart-1',
            projectUuid: chartProjectUuid,
            chartConfig: {
                type: ChartType.DATA_APP_VIZ,
                config: { dataAppVizUuid: chartAppUuid },
            },
        }),
        getSummary: vi.fn().mockResolvedValue({
            uuid: 'chart-1',
            projectUuid: chartProjectUuid,
            spaceUuid: 'space-1',
            dashboardUuid: null,
        }),
    };
    const dashboardModel = {
        getByIdOrSlug: vi.fn().mockResolvedValue({
            uuid: 'dashboard-1',
            projectUuid: 'proj-1',
            tiles: [
                {
                    uuid: 'tile-1',
                    type: DashboardTileTypes.SAVED_CHART,
                    properties: { savedChartUuid: dashboardChartUuid },
                },
            ],
        }),
    };
    const spacePermissionService = {
        resolveAccess: vi.fn(
            async (_userUuid: string, target: { type: string }) => ({
                organizationUuid: 'org-1',
                inheritsFromOrgOrProject:
                    target.type === 'space' && chartAccessible,
                access: [],
            }),
        ),
    };
    const featureFlagModel = {
        get: vi.fn().mockResolvedValue({ enabled: flagsEnabled }),
    };
    const savedChartService = new SavedChartService({
        savedChartModel,
        dashboardModel,
        spacePermissionService,
    } as never);
    const appGenerateService = new AppGenerateService({
        appModel,
        savedChartModel,
        savedChartService,
        featureFlagModel,
    } as never);
    const embedService = new EmbedService({
        appModel,
        savedChartModel,
        dashboardModel,
        featureFlagModel,
    } as never);
    const externalConnectionModel = {
        findApp: vi.fn().mockResolvedValue(app),
        resolveAppAlias: vi.fn().mockResolvedValue(
            linked
                ? {
                      externalConnectionUuid: 'conn-1',
                      projectUuid: connectionProjectUuid,
                      organizationUuid: connectionOrganizationUuid,
                      type: 'bearer_token',
                      origin: 'https://api.example.com',
                      allowedPathPrefixes: ['/v1/'],
                      allowedMethods: ['GET'],
                      allowedContentTypes: ['application/json'],
                      responseMaxBytes: 1_000_000,
                      requestMaxBytes: 10_000,
                      timeoutMs: 5_000,
                      rateLimitPerMinute: null,
                      customHeaders: null,
                  }
                : undefined,
        ),
        getDecryptedSecret: vi.fn().mockResolvedValue('connection-secret'),
        incrementRateCounter: vi.fn().mockResolvedValue(1),
        findProjectAbilityContext: vi.fn().mockResolvedValue({
            organizationUuid: 'org-1',
            projectType: ProjectType.DEFAULT,
            projectCreatedByUserUuid: null,
            upstreamProjectUuid: null,
        }),
    };
    const service = new ExternalConnectionService({
        allowedPrivateHostCidrs: {},
        appModel,
        appGenerateService,
        embedService,
        externalConnectionModel,
        spacePermissionService,
        analytics: { trackAccount: vi.fn() },
    } as never);
    return {
        service,
        externalConnectionModel,
        savedChartModel,
        dashboardModel,
    };
}

beforeEach(() => {
    mockSecureFetch.mockReset();
    mockSecureFetch.mockResolvedValue({
        status: 200,
        contentType: 'application/json',
        headers: {},
        bodyText: '{"ok":true}',
        truncated: false,
    });
});

describe('custom chart type external connection authorization', () => {
    it('allows a saved-chart viewer to use the linked credential without app or connection permissions', async () => {
        const { service } = buildService();
        await expect(
            service.proxyFetch(
                sessionAccount(),
                'proj-1',
                'app-1',
                chartRequest,
            ),
        ).resolves.toMatchObject({ body: { ok: true } });
        expect(mockSecureFetch).toHaveBeenCalledWith(
            'https://api.example.com/v1/today',
            expect.objectContaining({
                headers: { Authorization: 'Bearer connection-secret' },
            }),
        );
    });

    it('allows an explorer user to use a chart type created by someone else', async () => {
        const { service } = buildService();
        await expect(
            service.proxyFetch(
                sessionAccount(OrganizationMemberRole.INTERACTIVE_VIEWER),
                'proj-1',
                'app-1',
                request,
            ),
        ).resolves.toMatchObject({ status: 200 });
    });

    it.each(['chart', 'dashboard'] as const)(
        'allows a %s embed to use connections for its rendered chart without data-app permission',
        async (type) => {
            const { service } = buildService();
            await expect(
                service.proxyFetch(
                    embeddedAccount(type),
                    'proj-1',
                    'app-1',
                    chartRequest,
                ),
            ).resolves.toMatchObject({ status: 200 });
        },
    );

    it.each([
        [OrganizationMemberRole.INTERACTIVE_VIEWER, 'creator-1'],
        [OrganizationMemberRole.ADMIN, 'admin-1'],
    ])('preserves runtime access for %s (%s)', async (role, userUuid) => {
        const { service } = buildService();
        await expect(
            service.proxyFetch(
                sessionAccount(role, 'org-1', userUuid),
                'proj-1',
                'app-1',
                request,
            ),
        ).resolves.toMatchObject({ status: 200 });
    });

    it.each([undefined, 'version-2'])(
        'authorizes a matching history version but rejects mismatched version %s',
        async (mismatchedVersion) => {
            const { service, savedChartModel, externalConnectionModel } =
                buildService();
            savedChartModel.get.mockImplementation(
                async (_chartUuid: string, chartVersionUuid?: string) => ({
                    uuid: 'chart-1',
                    projectUuid: 'proj-1',
                    chartConfig: {
                        type: ChartType.DATA_APP_VIZ,
                        config: {
                            dataAppVizUuid:
                                chartVersionUuid === 'version-1'
                                    ? 'app-1'
                                    : 'another-app',
                        },
                    },
                }),
            );

            await expect(
                service.proxyFetch(sessionAccount(), 'proj-1', 'app-1', {
                    ...request,
                    chartContext: {
                        savedChartUuid: 'chart-1',
                        chartVersionUuid: 'version-1',
                    },
                }),
            ).resolves.toMatchObject({ status: 200 });
            expect(mockSecureFetch).toHaveBeenCalledTimes(1);

            mockSecureFetch.mockClear();
            externalConnectionModel.getDecryptedSecret.mockClear();
            await expect(
                service.proxyFetch(sessionAccount(), 'proj-1', 'app-1', {
                    ...request,
                    chartContext: {
                        savedChartUuid: 'chart-1',
                        chartVersionUuid: mismatchedVersion,
                    },
                }),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(mockSecureFetch).not.toHaveBeenCalled();
            expect(
                externalConnectionModel.getDecryptedSecret,
            ).not.toHaveBeenCalled();
        },
    );

    it('allows authoring from an embed with explore permission', async () => {
        const { service } = buildService();
        await expect(
            service.proxyFetch(
                embeddedAccount('dashboard', true),
                'proj-1',
                'app-1',
                request,
            ),
        ).resolves.toMatchObject({ status: 200 });
    });

    it.each([
        {
            description: 'inaccessible chart',
            options: { chartAccessible: false },
            error: ForbiddenError,
        },
        {
            description: 'unrelated chart type',
            options: { chartAppUuid: 'another-app' },
            error: ForbiddenError,
        },
        {
            description: 'chart in another project',
            options: { chartProjectUuid: 'another-project' },
            error: NotFoundError,
        },
        {
            description: 'unlinked alias',
            options: { linked: false },
            error: ForbiddenError,
        },
        {
            description: 'connection in another project',
            options: { connectionProjectUuid: 'another-project' },
            error: ForbiddenError,
        },
        {
            description: 'connection in another organization',
            options: { connectionOrganizationUuid: 'another-org' },
            error: ForbiddenError,
        },
        {
            description: 'disabled chart types',
            options: { flagsEnabled: false },
            error: ForbiddenError,
        },
    ])(
        'rejects $description before loading credentials',
        async ({ options, error }) => {
            const { service, externalConnectionModel } = buildService(options);
            await expect(
                service.proxyFetch(
                    sessionAccount(),
                    'proj-1',
                    'app-1',
                    chartRequest,
                ),
            ).rejects.toBeInstanceOf(error);
            expect(
                externalConnectionModel.getDecryptedSecret,
            ).not.toHaveBeenCalled();
            expect(mockSecureFetch).not.toHaveBeenCalled();
        },
    );

    it('keeps data app access for a chart type creator without explorer permission', async () => {
        const { service } = buildService();
        const user = {
            ...defaultSessionUser,
            role: OrganizationMemberRole.VIEWER,
            organizationUuid: 'org-1',
            userUuid: 'creator-1',
        };
        const account = fromSession(
            {
                ...user,
                ability: new Ability([
                    { action: 'view', subject: 'DataApp' },
                ]) as never,
            },
            'session',
        );
        await expect(
            service.proxyFetch(account, 'proj-1', 'app-1', request),
        ).resolves.toMatchObject({ status: 200 });
    });

    it('rejects a viewer without explorer permission when no saved chart is supplied', async () => {
        const { service } = buildService();
        await expect(
            service.proxyFetch(sessionAccount(), 'proj-1', 'app-1', request),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(mockSecureFetch).not.toHaveBeenCalled();
    });

    it('rejects a user without data app view or explorer permission before loading credentials', async () => {
        const { service, externalConnectionModel } = buildService();
        await expect(
            service.proxyFetch(sessionAccount(), 'proj-1', 'app-1', request),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(
            externalConnectionModel.getDecryptedSecret,
        ).not.toHaveBeenCalled();
        expect(mockSecureFetch).not.toHaveBeenCalled();
    });

    it.each([chartRequest, request])(
        'rejects users from another organization',
        async (fetchRequest) => {
            const { service } = buildService();
            await expect(
                service.proxyFetch(
                    sessionAccount(
                        OrganizationMemberRole.INTERACTIVE_VIEWER,
                        'another-org',
                    ),
                    'proj-1',
                    'app-1',
                    fetchRequest,
                ),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(mockSecureFetch).not.toHaveBeenCalled();
        },
    );

    it.each(['chart', 'dashboard'] as const)(
        'rejects a %s embed requesting a chart outside its token despite broad embed configuration',
        async (type) => {
            const { service } = buildService();
            await expect(
                service.proxyFetch(embeddedAccount(type), 'proj-1', 'app-1', {
                    ...request,
                    chartContext: { savedChartUuid: 'another-chart' },
                }),
            ).rejects.toBeInstanceOf(
                type === 'chart' ? ForbiddenError : ParameterError,
            );
            expect(mockSecureFetch).not.toHaveBeenCalled();
        },
    );

    it.each(['chart', 'dashboard'] as const)(
        'rejects an unrelated chart type from a %s embed',
        async (type) => {
            const { service } = buildService({ chartAppUuid: 'another-app' });
            await expect(
                service.proxyFetch(
                    embeddedAccount(type),
                    'proj-1',
                    'app-1',
                    chartRequest,
                ),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(mockSecureFetch).not.toHaveBeenCalled();
        },
    );

    it.each(['chart', 'dashboard'] as const)(
        'rejects authoring from a %s embed without explore permission',
        async (type) => {
            const { service } = buildService();
            await expect(
                service.proxyFetch(
                    embeddedAccount(type),
                    'proj-1',
                    'app-1',
                    request,
                ),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(mockSecureFetch).not.toHaveBeenCalled();
        },
    );

    it('does not use a saved chart context to grant access to someone else’s personal data app', async () => {
        const { service } = buildService({ template: 'custom' });
        await expect(
            service.proxyFetch(
                sessionAccount(OrganizationMemberRole.INTERACTIVE_VIEWER),
                'proj-1',
                'app-1',
                chartRequest,
            ),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(mockSecureFetch).not.toHaveBeenCalled();
    });

    it('preserves personal data app access for its creator', async () => {
        const { service } = buildService({ template: 'custom' });
        await expect(
            service.proxyFetch(
                sessionAccount(
                    OrganizationMemberRole.INTERACTIVE_VIEWER,
                    'org-1',
                    'creator-1',
                ),
                'proj-1',
                'app-1',
                request,
            ),
        ).resolves.toMatchObject({ status: 200 });
    });

    it.each(['chart', 'dashboard'] as const)(
        'does not use a chart context to grant data app permission to a %s embed',
        async (type) => {
            const { service } = buildService({ template: 'custom' });
            await expect(
                service.proxyFetch(
                    embeddedAccount(type),
                    'proj-1',
                    'app-1',
                    chartRequest,
                ),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(mockSecureFetch).not.toHaveBeenCalled();
        },
    );

    it('does not allow a chart viewer to unlink its external connection', async () => {
        const { service } = buildService();
        await expect(
            service.unlinkFromApp(
                sessionAccount(),
                'proj-1',
                'app-1',
                'weather',
            ),
        ).rejects.toBeInstanceOf(ForbiddenError);
        expect(mockSecureFetch).not.toHaveBeenCalled();
    });

    it.each(['chart', 'dashboard'] as const)(
        'rejects a %s embed from another project',
        async (type) => {
            const { service } = buildService();
            const account = embeddedAccount(type);
            await expect(
                service.proxyFetch(
                    {
                        ...account,
                        embed: {
                            ...account.embed,
                            projectUuid: 'another-project',
                        },
                    },
                    'proj-1',
                    'app-1',
                    chartRequest,
                ),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(mockSecureFetch).not.toHaveBeenCalled();
        },
    );

    it.each(['chart', 'dashboard'] as const)(
        'rejects a %s embed from another organization',
        async (type) => {
            const { service } = buildService();
            const account = embeddedAccount(type);
            await expect(
                service.proxyFetch(
                    {
                        ...account,
                        embed: {
                            ...account.embed,
                            organization: {
                                ...account.embed.organization,
                                organizationUuid: 'another-org',
                            },
                        },
                    },
                    'proj-1',
                    'app-1',
                    chartRequest,
                ),
            ).rejects.toBeInstanceOf(ForbiddenError);
            expect(mockSecureFetch).not.toHaveBeenCalled();
        },
    );

    it('rejects a URL project that does not contain the app', async () => {
        const { service, externalConnectionModel } = buildService();
        await expect(
            service.proxyFetch(
                sessionAccount(),
                'another-project',
                'app-1',
                chartRequest,
            ),
        ).rejects.toBeInstanceOf(NotFoundError);
        expect(externalConnectionModel.resolveAppAlias).not.toHaveBeenCalled();
        expect(mockSecureFetch).not.toHaveBeenCalled();
    });
});
