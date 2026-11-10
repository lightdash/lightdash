import { Ability } from '@casl/ability';
import {
    AGENT_CLIENT_IDS,
    AgentActorSurface,
    buildAgentIdentityClaim,
    type AgentIdentityClaim,
    type AiAgent,
    type PossibleAbilities,
    type SessionUser,
} from '@lightdash/common';
import { fromSession } from '../../../auth/account/account';
import {
    buildAccount,
    defaultSessionUser,
} from '../../../auth/account/account.mock';
import { lightdashConfigMock } from '../../../config/lightdashConfig.mock';
import { AiAgentService } from './AiAgentService';

const setup = () => {
    const ability = new Ability<PossibleAbilities>([
        { action: 'view', subject: 'AiAgent' },
    ]);
    const user: SessionUser = {
        ...defaultSessionUser,
        userUuid: 'user',
        organizationUuid: 'org',
        ability,
        abilityRules: ability.rules,
    };
    const account = fromSession(user);
    const agent = {
        uuid: 'agent',
        projectUuid: 'project',
        organizationUuid: 'org',
        enableDataAccess: false,
        adminOnly: false,
        userAccess: [],
        groupAccess: [],
    } as unknown as AiAgent;
    const aiAgentModel = {
        getAgent: vi
            .fn<() => Promise<AiAgent | null>>()
            .mockResolvedValue(agent),
    };
    const groupsModel = { findUserInGroups: vi.fn(async () => []) };
    const service = new AiAgentService({
        lightdashConfig: lightdashConfigMock,
        aiAgentModel,
        groupsModel,
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    const claim = buildAgentIdentityClaim({
        subject: { type: 'user', uuid: user.userUuid },
        surface: AgentActorSurface.IN_APP_AGENT,
        clientId: AGENT_CLIENT_IDS[AgentActorSurface.IN_APP_AGENT],
        agentUuid: 'agent',
    });
    return { service, user, account, agent, aiAgentModel, groupsModel, claim };
};

describe('agent result read access', () => {
    test.each([AgentActorSurface.IN_APP_AGENT, AgentActorSurface.SLACK_AGENT])(
        'allows the subject with access on %s without data access enabled',
        async (surface) => {
            const f = setup();
            const claim = buildAgentIdentityClaim({
                subject: { type: 'user', uuid: f.user.userUuid },
                surface,
                clientId: AGENT_CLIENT_IDS[surface],
                agentUuid: 'agent',
            });
            await expect(
                f.service.canPersonReadAgentResult({
                    account: f.account,
                    projectUuid: 'project',
                    claim,
                }),
            ).resolves.toBe('allowed');
            expect(f.aiAgentModel.getAgent).toHaveBeenCalledExactlyOnceWith({
                organizationUuid: 'org',
                agentUuid: 'agent',
            });
        },
    );

    test('refuses a claim for another person before looking up the agent', async () => {
        const f = setup();
        const claim = buildAgentIdentityClaim({
            subject: { type: 'user', uuid: 'someone' },
            surface: AgentActorSurface.IN_APP_AGENT,
            clientId: AGENT_CLIENT_IDS[AgentActorSurface.IN_APP_AGENT],
            agentUuid: 'agent',
        });
        await expect(
            f.service.canPersonReadAgentResult({
                account: f.account,
                projectUuid: 'project',
                claim,
            }),
        ).resolves.toBe('other_person');
        expect(f.aiAgentModel.getAgent).not.toHaveBeenCalled();
    });

    test.each(['deleted', 'another-project', 'no-access'] as const)(
        'refuses an unavailable agent: %s',
        async (reason) => {
            const f = setup();
            if (reason === 'deleted')
                f.aiAgentModel.getAgent.mockResolvedValue(null);
            if (reason === 'another-project')
                f.agent.projectUuid = 'other-project';
            if (reason === 'no-access') f.agent.userAccess = ['someone'];
            await expect(
                f.service.canPersonReadAgentResult({
                    account: f.account,
                    projectUuid: 'project',
                    claim: f.claim,
                }),
            ).resolves.toBe('agent_unavailable');
        },
    );

    test.each([
        'mcp',
        'service-account',
        'connection-grant',
        'missing-agent',
        'legacy-missing-agent',
    ] as const)('does not elevate a %s claim', async (kind) => {
        const f = setup();
        const claim: AgentIdentityClaim = buildAgentIdentityClaim({
            subject: {
                type: kind === 'service-account' ? 'service_account' : 'user',
                uuid: f.user.userUuid,
            },
            surface:
                kind === 'mcp'
                    ? AgentActorSurface.MCP
                    : AgentActorSurface.IN_APP_AGENT,
            clientId: 'client',
            agentUuid: kind === 'missing-agent' ? null : 'agent',
            agentConnectionGrant:
                kind === 'connection-grant'
                    ? { grantUuid: 'grant', revision: 1 }
                    : null,
        });
        if (kind === 'legacy-missing-agent')
            Reflect.deleteProperty(claim.act, 'agent_uuid');
        await expect(
            f.service.canPersonReadAgentResult({
                account: f.account,
                projectUuid: 'project',
                claim,
            }),
        ).resolves.toBe('not_applicable');
        expect(f.aiAgentModel.getAgent).not.toHaveBeenCalled();
    });

    test('does not elevate a JWT anonymous account', async () => {
        const f = setup();
        await expect(
            f.service.canPersonReadAgentResult({
                account: buildAccount({ accountType: 'jwt' }),
                projectUuid: 'project',
                claim: f.claim,
            }),
        ).resolves.toBe('not_applicable');
        expect(f.aiAgentModel.getAgent).not.toHaveBeenCalled();
    });

    test('does not elevate an account without an organisation', async () => {
        const f = setup();
        const account = fromSession({ ...f.user, organizationUuid: undefined });
        await expect(
            f.service.canPersonReadAgentResult({
                account,
                projectUuid: 'project',
                claim: f.claim,
            }),
        ).resolves.toBe('not_applicable');
        expect(f.aiAgentModel.getAgent).not.toHaveBeenCalled();
    });
});
