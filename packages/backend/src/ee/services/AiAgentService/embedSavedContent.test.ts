import { Ability } from '@casl/ability';
import {
    ForbiddenError,
    QueryExecutionContext,
    type AnonymousAccount,
    type SessionUser,
} from '@lightdash/common';
import {
    decodeLightdashJwt,
    encodeLightdashJwt,
} from '../../../auth/lightdashJwt';
import { lightdashConfig } from '../../../config/lightdashConfig';
import { AsyncQueryService } from '../../../services/AsyncQueryService/AsyncQueryService';
import { PermissionsService } from '../../../services/PermissionsService/PermissionsService';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import { EmbedService } from '../EmbedService/EmbedService';
import { EmbedServiceArgumentsMock } from '../EmbedService/EmbedService.mock';
import { AiAgentService } from './AiAgentService';

vi.mock('../ai/AiAgentMcpRuntimeClient', () => ({
    // eslint-disable-next-line prefer-arrow-callback
    AiAgentMcpRuntimeClient: vi.fn().mockImplementation(function MockClient() {
        return {};
    }),
}));

const AGENT_UUID = '11111111-1111-4111-8111-111111111111';
const SPACE_UUID = '22222222-2222-4222-8222-222222222222';
const ACTOR_UUID = '33333333-3333-4333-8333-333333333333';

const setup = () => {
    const user = {
        userUuid: ACTOR_UUID,
        organizationUuid: 'org',
        abilityRules: [],
        isActive: true,
        ability: new Ability([
            { action: 'view', subject: 'AiAgent' },
            { action: 'view', subject: 'Project' },
            { action: 'create', subject: 'SavedChart' },
            { action: 'view', subject: 'EmbedAiAgent' },
        ]),
    } as unknown as SessionUser;
    const account = {
        authentication: {
            type: 'jwt',
            source: 'source-token',
            data: {
                content: {
                    type: 'aiAgent',
                    agentUuid: AGENT_UUID,
                    canExplore: true,
                },
                writeActions: {
                    userUuid: ACTOR_UUID,
                    spaceUuid: SPACE_UUID,
                    permissionsMode: 'roles',
                },
                userAttributes: { tenant_id: 'tenant-1' },
                user: { externalId: 'viewer' },
                exp: Math.floor(Date.now() / 1000) + 300,
            },
        },
        access: { controls: { userAttributes: { tenant_id: 'tenant-1' } } },
        embed: { projectUuid: 'project' },
        embedWriteUser: user,
        embedWriteContext: { canUseAiAgent: true },
    } as unknown as AnonymousAccount;
    const resource = {
        uuid: 'resolved-id',
        projectUuid: 'project',
        spaceUuid: SPACE_UUID,
        organizationUuid: 'org',
        tableName: 'orders',
        tiles: [],
    };
    const encodedSecret = new EncryptionUtil({ lightdashConfig }).encrypt(
        'test-embed-secret',
    );
    const savedChartService = { get: vi.fn().mockResolvedValue(resource) };
    const dashboardService = {
        getByIdOrSlug: vi.fn().mockResolvedValue(resource),
    };
    const agent = {
        uuid: AGENT_UUID,
        projectUuid: 'project',
        organizationUuid: 'org',
        spaceAccess: [SPACE_UUID],
        groupAccess: [],
        userAccess: [],
        adminOnly: false,
    };
    const embed = {
        projectUuid: 'project',
        organization: {
            organizationUuid: 'org',
            name: 'Org',
            createdAt: new Date(),
        },
        encodedSecret,
        allowAllCharts: false,
        allowAllDashboards: false,
        chartUuids: [],
        dashboardUuids: [],
        user: null,
    };
    const embedModel = { get: vi.fn().mockResolvedValue(embed) };
    const service = new AiAgentService({
        lightdashConfig,
        analytics: { track: vi.fn() },
        savedChartService,
        dashboardService,
        aiAgentModel: { getAgent: vi.fn().mockResolvedValue(agent) },
        featureFlagService: {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        },
        embedModel,
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    const dashboardModel = {
        getByIdOrSlug: vi.fn().mockResolvedValue(resource),
        savedChartExistsInDashboard: vi
            .fn()
            .mockImplementation(
                async (_project, _dashboard, chartUuid) =>
                    chartUuid === 'tile-chart',
            ),
    };
    const permissionsService = new PermissionsService({
        dashboardModel,
    } as unknown as ConstructorParameters<typeof PermissionsService>[0]);
    const projectModel = {
        getSummary: vi.fn().mockResolvedValue({
            projectUuid: 'project',
            organizationUuid: 'org',
        }),
    };
    const viewerService = new EmbedService({
        ...EmbedServiceArgumentsMock,
        lightdashConfig,
        embedModel,
        dashboardModel,
        permissionsService,
        getAiAgentService: () => service,
        userModel: {
            findSessionUserAndOrgByUuid: vi.fn().mockResolvedValue(user),
        },
        projectModel,
        spacePermissionService: {
            resolveAccess: vi.fn().mockResolvedValue({
                projectUuid: 'project',
                organizationUuid: 'org',
                spaceUuid: SPACE_UUID,
                access: [],
                inheritsFromOrgOrProject: true,
            }),
        },
        savedChartModel: {
            get: vi.fn().mockResolvedValue(resource),
            resolveColorPalette: vi
                .fn()
                .mockResolvedValue({ colors: [], darkColors: null }),
        },
        userAttributesModel: { find: vi.fn().mockResolvedValue([]) },
        analytics: { trackAccount: vi.fn() },
    } as unknown as ConstructorParameters<typeof EmbedService>[0]);
    const asyncQueryService = new AsyncQueryService({
        lightdashConfig,
        projectModel,
    } as unknown as ConstructorParameters<typeof AsyncQueryService>[0]);
    return {
        viewerService,
        permissionsService,
        asyncQueryService,
        service,
        account,
        resource,
        encodedSecret,
        savedChartService,
        dashboardService,
        agent,
    };
};

describe('embedded AI agent saved content', () => {
    it.each(['chart', 'dashboard'] as const)(
        'opens an authorized %s without a separate allowlist, retaining only read-only viewer claims',
        async (type) => {
            const {
                service,
                account,
                encodedSecret,
                viewerService,
                permissionsService,
                asyncQueryService,
                savedChartService,
                dashboardService,
            } = setup();
            const result = await service.getEmbedSavedContentUrl(
                account,
                'project',
                AGENT_UUID,
                type,
                'content-slug',
            );
            const url = new URL(result.url);
            expect(url.pathname).toBe(
                type === 'chart'
                    ? '/embed/project/chart/resolved-id'
                    : '/embed/project',
            );
            const claims = decodeLightdashJwt(url.hash.slice(1), encodedSecret);
            expect(claims.content).toEqual(
                type === 'chart'
                    ? { type: 'chart', contentId: 'resolved-id' }
                    : { type: 'dashboard', dashboardUuid: 'resolved-id' },
            );
            expect(claims.userAttributes).toEqual({ tenant_id: 'tenant-1' });
            expect(claims.user).toEqual({ externalId: 'viewer' });
            expect(claims.exp).toBe(account.authentication.data.exp);
            expect(claims.writeActions).toBeUndefined();
            const viewer = await viewerService.getAccountFromJwt(
                'project',
                url.hash.slice(1),
            );
            expect(viewer.access.controls?.userAttributes).toEqual({
                tenant_id: ['tenant-1'],
            });
            expect(viewer.embedWriteUser).toBeUndefined();
            const queryChartUuid =
                type === 'chart' ? 'resolved-id' : 'tile-chart';
            await expect(
                permissionsService.checkEmbedPermissions(
                    viewer,
                    queryChartUuid,
                ),
            ).resolves.toBeUndefined();
            await expect(
                permissionsService.checkEmbedPermissions(
                    viewer,
                    'another-chart',
                ),
            ).rejects.toThrow(ForbiddenError);
            if (type === 'dashboard') {
                const dashboard = await viewerService.getDashboard(
                    'project',
                    viewer,
                );
                expect(dashboard.uuid).toBe('resolved-id');
                expect(dashboard.canExplore).not.toBe(true);
                expect(dashboard.canExportPagePdf).toBe(false);
            }
            await expect(
                asyncQueryService.executeAsyncMetricQuery({
                    account: viewer,
                    projectUuid: 'project',
                    context: QueryExecutionContext.EXPLORE,
                    metricQuery: {
                        exploreName: 'orders',
                        dimensions: ['orders_secret'],
                        metrics: [],
                        filters: {},
                        sorts: [],
                        limit: 10,
                        tableCalculations: [],
                    },
                }),
            ).rejects.toThrow(ForbiddenError);
            savedChartService.get.mockRejectedValue(
                new ForbiddenError('Actor access revoked'),
            );
            dashboardService.getByIdOrSlug.mockRejectedValue(
                new ForbiddenError('Actor access revoked'),
            );
            await expect(
                viewerService.getAccountFromJwt('project', url.hash.slice(1)),
            ).rejects.toThrow('Actor access revoked');
        },
    );
    it.each(['chart', 'dashboard'] as const)(
        'does not bypass the allowlist for an ordinary %s embed',
        async (type) => {
            const { viewerService, permissionsService, encodedSecret } =
                setup();
            const token = encodeLightdashJwt(
                {
                    content:
                        type === 'chart'
                            ? { type: 'chart', contentId: 'resolved-id' }
                            : {
                                  type: 'dashboard',
                                  dashboardUuid: 'resolved-id',
                              },
                },
                encodedSecret,
                '5m',
            );
            const viewer = await viewerService.getAccountFromJwt(
                'project',
                token,
            );
            if (type === 'dashboard') {
                await expect(
                    viewerService.getDashboard('project', viewer),
                ).rejects.toThrow(ForbiddenError);
            }
            await expect(
                permissionsService.checkEmbedPermissions(
                    viewer,
                    type === 'chart' ? 'resolved-id' : 'tile-chart',
                ),
            ).rejects.toThrow(ForbiddenError);
        },
    );

    it.each(['chart', 'dashboard'] as const)(
        'rejects %s content outside the project or space and propagates actor access denials',
        async (type) => {
            const {
                service,
                account,
                resource,
                savedChartService,
                dashboardService,
            } = setup();
            const open = () =>
                service.getEmbedSavedContentUrl(
                    account,
                    'project',
                    AGENT_UUID,
                    type,
                    'id',
                );
            resource.spaceUuid = 'other-space';
            await expect(open()).rejects.toThrow(ForbiddenError);
            resource.spaceUuid = SPACE_UUID;
            resource.projectUuid = 'other-project';
            await expect(open()).rejects.toThrow(ForbiddenError);
            resource.projectUuid = 'project';
            savedChartService.get.mockRejectedValue(
                new ForbiddenError('Actor denied'),
            );
            dashboardService.getByIdOrSlug.mockRejectedValue(
                new ForbiddenError('Actor denied'),
            );
            await expect(open()).rejects.toThrow('Actor denied');
        },
    );

    it('rejects mismatched projects or agents, disabled embed access and agent restrictions', async () => {
        const { service, account, agent } = setup();
        const open = () =>
            service.getEmbedSavedContentUrl(
                account,
                'project',
                AGENT_UUID,
                'chart',
                'id',
            );
        await expect(
            service.getEmbedSavedContentUrl(
                account,
                'other-project',
                AGENT_UUID,
                'chart',
                'id',
            ),
        ).rejects.toThrow(ForbiddenError);
        await expect(
            service.getEmbedSavedContentUrl(
                account,
                'project',
                'other-agent',
                'chart',
                'id',
            ),
        ).rejects.toThrow(ForbiddenError);
        account.embedWriteContext!.canUseAiAgent = false;
        await expect(open()).rejects.toThrow(ForbiddenError);
        account.embedWriteContext!.canUseAiAgent = true;
        agent.spaceAccess = ['other-space'];
        await expect(open()).rejects.toThrow(ForbiddenError);
        agent.spaceAccess = [SPACE_UUID];
        agent.adminOnly = true;
        await expect(open()).rejects.toThrow(ForbiddenError);
    });

    it('rejects non-agent tokens and missing write actors', async () => {
        const { service, account } = setup();
        account.authentication.data.content = {
            type: 'chart',
            contentId: 'id',
        };
        await expect(
            service.getEmbedSavedContentUrl(
                account,
                'project',
                AGENT_UUID,
                'chart',
                'id',
            ),
        ).rejects.toThrow(ForbiddenError);
        account.authentication.data.content = {
            type: 'aiAgent',
            agentUuid: AGENT_UUID,
        };
        account.embedWriteUser = undefined;
        await expect(
            service.getEmbedSavedContentUrl(
                account,
                'project',
                AGENT_UUID,
                'chart',
                'id',
            ),
        ).rejects.toThrow(ForbiddenError);
    });

    it.each([undefined, 1, Infinity])(
        'does not mint a token without a valid remaining lifetime (%s)',
        async (exp) => {
            const { service, account } = setup();
            account.authentication.data.exp = exp;
            await expect(
                service.getEmbedSavedContentUrl(
                    account,
                    'project',
                    AGENT_UUID,
                    'chart',
                    'id',
                ),
            ).rejects.toThrow(ForbiddenError);
        },
    );
});
