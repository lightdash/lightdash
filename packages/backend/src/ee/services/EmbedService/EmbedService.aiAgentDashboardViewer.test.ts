import { Ability, type RawRuleOf } from '@casl/ability';
import {
    ForbiddenError,
    NotFoundError,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import { encodeLightdashJwt } from '../../../auth/lightdashJwt';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { EncryptionUtil } from '../../../utils/EncryptionUtil/EncryptionUtil';
import { EmbedService } from './EmbedService';
import {
    EmbedServiceArgumentsMock,
    mockOrganizationUuid,
    mockProjectUuid,
    mockUserUuid,
} from './EmbedService.mock';

const AGENT_UUID = 'agent-uuid';
const WRITE_SPACE_UUID = 'write-space-uuid';
const DASHBOARD_UUID = 'dashboard-uuid';

const encodedSecret = new EncryptionUtil({
    lightdashConfig: lightdashConfigMock,
}).encrypt('embed-secret');

const embed = {
    projectUuid: mockProjectUuid,
    organization: {
        organizationUuid: mockOrganizationUuid,
        name: 'Org',
        createdAt: new Date(),
    },
    encodedSecret,
    dashboardUuids: ['allowlisted-dashboard'],
    allowAllDashboards: false,
    chartUuids: [],
    allowAllCharts: false,
    allowAllApps: false,
    appUuids: [],
    createdAt: '',
    user: null,
};

type ActorRule = RawRuleOf<Ability<PossibleAbilities>>;

const hasRule = (
    account: { user: { abilityRules: ActorRule[] } },
    action: 'view' | 'export',
    subject: 'Explore' | 'Dashboard',
) =>
    account.user.abilityRules.some(
        (rule) =>
            rule.subject === subject &&
            (Array.isArray(rule.action)
                ? rule.action.includes(action)
                : rule.action === action),
    );

const buildActor = ({
    canViewDashboard = true,
    canExplore = false,
}: { canViewDashboard?: boolean; canExplore?: boolean } = {}) => {
    const rules: ActorRule[] = [
        { subject: 'Project', action: ['view'] },
        { subject: 'SavedChart', action: ['create', 'view'] },
    ];
    const dashboardRule: ActorRule[] = canViewDashboard
        ? [{ subject: 'Dashboard', action: ['view'] }]
        : [];
    const exploreRule: ActorRule[] = canExplore
        ? [{ subject: 'EmbedExplore', action: ['view'] }]
        : [];
    return {
        userUuid: mockUserUuid,
        organizationUuid: mockOrganizationUuid,
        isActive: true,
        ability: new Ability<PossibleAbilities>([
            ...rules,
            ...dashboardRule,
            ...exploreRule,
        ]),
    } as unknown as SessionUser;
};

const mintAgentToken = (content: Record<string, unknown> = {}) =>
    encodeLightdashJwt(
        {
            content: { type: 'aiAgent', agentUuid: AGENT_UUID, ...content },
            writeActions: {
                userUuid: mockUserUuid,
                spaceUuid: WRITE_SPACE_UUID,
            },
            userAttributes: { tenant_id: 'tenant-1' },
            user: { externalId: 'viewer' },
        },
        encodedSecret,
        '5m',
    );

const buildService = ({
    actor = buildActor(),
    dashboardSpaceUuid = WRITE_SPACE_UUID,
}: { actor?: SessionUser; dashboardSpaceUuid?: string } = {}) =>
    new EmbedService({
        ...EmbedServiceArgumentsMock,
        embedModel: { get: vi.fn().mockResolvedValue(embed) },
        userAttributesModel: { find: vi.fn().mockResolvedValue([]) },
        userModel: {
            findSessionUserAndOrgByUuid: vi.fn().mockResolvedValue(actor),
        },
        dashboardModel: {
            getByIdOrSlug: vi.fn(async (uuid: string) => {
                if (uuid !== DASHBOARD_UUID) {
                    throw new NotFoundError('Dashboard not found');
                }
                return {
                    uuid: DASHBOARD_UUID,
                    name: 'Agent dashboard',
                    projectUuid: mockProjectUuid,
                    organizationUuid: mockOrganizationUuid,
                    spaceUuid: dashboardSpaceUuid,
                    tiles: [],
                };
            }),
        },
        spacePermissionService: {
            resolveAccess: vi.fn().mockResolvedValue({
                projectUuid: mockProjectUuid,
                organizationUuid: mockOrganizationUuid,
                spaceUuid: WRITE_SPACE_UUID,
                inheritsFromOrgOrProject: true,
                access: [],
            }),
        },
    } as unknown as ConstructorParameters<typeof EmbedService>[0]);

describe('embedded AI agent dashboard viewer', () => {
    test('serves a write-space dashboard as a read-only dashboard embed limited to it', async () => {
        const account = await buildService().getAccountFromJwt(
            mockProjectUuid,
            mintAgentToken(),
            { dashboardUuid: DASHBOARD_UUID },
        );

        expect(account.access.content).toMatchObject({
            type: 'dashboard',
            dashboardUuid: DASHBOARD_UUID,
        });
        expect(account.authentication.data.content).toMatchObject({
            type: 'dashboard',
            dashboardUuid: DASHBOARD_UUID,
            canExplore: false,
            canExportPagePdf: false,
        });
        expect(account.authentication.data.writeActions).toBeUndefined();
        expect(account.embedWriteUser).toBeUndefined();
        expect(account.embedWriteContext).toBeUndefined();
        expect(account.embed.dashboardUuids).toEqual([DASHBOARD_UUID]);
        expect(account.embed.allowAllDashboards).toBe(false);
        expect(account.access.filtering).toBeUndefined();
        expect(account.access.controls?.userAttributes).toEqual({
            tenant_id: ['tenant-1'],
        });
        expect(hasRule(account, 'view', 'Explore')).toBe(false);
        expect(hasRule(account, 'export', 'Dashboard')).toBe(false);
    });

    test.each([
        [
            'the token flag',
            { actor: buildActor(), content: { canExplore: true } },
        ],
        [
            'the actor scope',
            { actor: buildActor({ canExplore: true }), content: {} },
        ],
    ])('grants Explore from %s', async (_label, { actor, content }) => {
        const account = await buildService({ actor }).getAccountFromJwt(
            mockProjectUuid,
            mintAgentToken(content),
            { dashboardUuid: DASHBOARD_UUID },
        );

        expect(account.authentication.data.content).toMatchObject({
            canExplore: true,
        });
        expect(hasRule(account, 'view', 'Explore')).toBe(true);
    });

    test('keeps the agent account when no dashboard is requested', async () => {
        const account = await buildService().getAccountFromJwt(
            mockProjectUuid,
            mintAgentToken(),
        );

        expect(account.access.content.type).toBe('aiAgent');
        expect(account.embedWriteUser).toBeDefined();
        expect(account.embed.dashboardUuids).toEqual(['allowlisted-dashboard']);
    });

    test('rejects a dashboard outside the write space', async () => {
        await expect(
            buildService({
                dashboardSpaceUuid: 'other-space',
            }).getAccountFromJwt(mockProjectUuid, mintAgentToken(), {
                dashboardUuid: DASHBOARD_UUID,
            }),
        ).rejects.toThrow(ForbiddenError);
    });

    test('rejects a dashboard the write actor cannot view', async () => {
        await expect(
            buildService({
                actor: buildActor({ canViewDashboard: false }),
            }).getAccountFromJwt(mockProjectUuid, mintAgentToken(), {
                dashboardUuid: DASHBOARD_UUID,
            }),
        ).rejects.toThrow(ForbiddenError);
    });

    test('rejects an unknown dashboard', async () => {
        await expect(
            buildService().getAccountFromJwt(
                mockProjectUuid,
                mintAgentToken(),
                { dashboardUuid: 'missing' },
            ),
        ).rejects.toThrow(NotFoundError);
    });

    test('ignores the requested dashboard for non-agent tokens', async () => {
        const dashboardToken = encodeLightdashJwt(
            {
                content: {
                    type: 'dashboard',
                    dashboardUuid: 'allowlisted-dashboard',
                },
            },
            encodedSecret,
            '5m',
        );

        const account = await buildService().getAccountFromJwt(
            mockProjectUuid,
            dashboardToken,
            { dashboardUuid: DASHBOARD_UUID },
        );

        expect(account.access.content.dashboardUuid).toBe(
            'allowlisted-dashboard',
        );
        expect(account.embed.dashboardUuids).toEqual(['allowlisted-dashboard']);
    });
});
