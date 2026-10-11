import {
    AgentActorSurface,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    type AiAgent,
    type SlackPrompt,
} from '@lightdash/common';
import knex from 'knex';
import { getTracker, MockClient } from 'knex-mock-client';
import { fromSession } from '../../../auth/account/account';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import {
    expectAdmissionSql,
    setupPermissionSql,
} from '../../../services/AgentPermissionService/agentPermissionSqlFixture';
import { AiAgentService } from './AiAgentService';

const setup = (
    managed: boolean,
    requireOAuth = false,
    linkedUserUuid: string | null = requireOAuth
        ? defaultSessionUser.userUuid
        : null,
) => {
    const assertActorVerified = vi.fn(async ({ actorVerified }) => {
        if (managed && !actorVerified)
            throw new AiAccessRefusedError(
                AiAccessRefusalReason.AGENT_ACTOR_UNVERIFIED,
                {
                    settingsUrl: null,
                },
            );
    });
    const findIdentityByOpenId = vi
        .fn()
        .mockResolvedValue(
            linkedUserUuid ? { userUuid: linkedUserUuid } : null,
        );
    const assertOperation = vi.fn();
    const service = new AiAgentService({
        agentPermissionService: {
            assertActorVerifiedWithRequest: ({
                operation,
            }: {
                operation: Parameters<typeof assertActorVerified>[0];
            }) => assertActorVerified(operation),
            assertOperation,
            assertOperationWithRequest: ({
                operation,
            }: {
                operation: unknown;
            }) => assertOperation(operation),
            loadRequest: vi.fn().mockResolvedValue({
                enforcementMode: managed ? 'managed' : 'off',
            }),
        },
        aiOrganizationSettingsService: {
            isAiAgentMemoryEnabled: vi.fn().mockResolvedValue(false),
        },
        slackAuthenticationModel: {
            getRawInstallationFromOrganizationUuid: vi
                .fn()
                .mockResolvedValue({ team: { id: 'team' } }),
            getInstallationFromOrganizationUuid: vi
                .fn()
                .mockResolvedValue({ aiRequireOAuth: requireOAuth }),
        },
        openIdIdentityModel: {
            findIdentityByOpenId,
        },
        featureFlagService: {
            get: vi.fn().mockResolvedValue({ enabled: true }),
        },
        lightdashConfig: { ai: {}, siteUrl: 'https://example.com' },
    } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
    const modelStart = vi.fn().mockRejectedValue(new Error('model started'));
    Object.assign(service, {
        getIsCopilotEnabled: vi.fn().mockResolvedValue(true),
        getAgentSettings: vi.fn().mockResolvedValue({
            uuid: 'agent',
            projectUuid: 'agent-project',
        } as AiAgent),
        getPromptDecisionClient: modelStart,
    });
    const onSlackAccessRefusal = vi.fn();
    const run = () =>
        service.generateOrStreamAgentResponse(
            defaultSessionUser,
            { messageHistory: [], compactionSummary: null } as never,
            {
                canManageAgent: false,
                onSlackAccessRefusal,
                aiCreditCheck: null,
                prompt: {
                    slackUserId: 'sender',
                    slackChannelId: 'channel',
                    promptSlackTs: 'message',
                    slackThreadTs: 'thread',
                    projectUuid: 'agent-project',
                } as SlackPrompt,
                stream: false,
                threadMessages: [],
            },
        );
    return {
        service,
        run,
        modelStart,
        assertActorVerified,
        assertOperation,
        findIdentityByOpenId,
        onSlackAccessRefusal,
    };
};

test('managed Slack refuses installer fallback before starting the prompt', async () => {
    const h = setup(true);
    await expect(h.run()).rejects.toMatchObject({
        refusal: {
            reason: AiAccessRefusalReason.AGENT_ACTOR_UNVERIFIED,
            settingsUrl: null,
            action: 'sign_in',
            connectUrl:
                'https://example.com/api/v1/auth/slack?team=team&channel=channel&message=message&trigger=app_mention&thread_ts=thread',
        },
    });
    expect(h.modelStart).not.toHaveBeenCalled();
    expect(h.onSlackAccessRefusal).toHaveBeenCalledWith(
        expect.objectContaining({
            reason: AiAccessRefusalReason.AGENT_ACTOR_UNVERIFIED,
        }),
    );
    expect(h.assertActorVerified).toHaveBeenCalledWith(
        expect.objectContaining({
            kind: 'agent_tool',
            key: 'slack_prompt',
            surface: AgentActorSurface.SLACK_AGENT,
            projectUuid: 'agent-project',
            actorVerified: false,
        }),
    );
});

test.each([
    [false, false],
    [true, true],
])(
    'legacy or linked Slack preserves prompt execution (%s, %s)',
    async (managed, requireOAuth) => {
        const h = setup(managed, requireOAuth);
        await expect(h.run()).rejects.toThrow('model started');
        expect(h.modelStart).toHaveBeenCalledOnce();
    },
);

test.each([null, 'different-user'])(
    'managed queued Slack refuses an unlinked or changed sender (%s)',
    async (linkedUserUuid) => {
        const h = setup(true, true, linkedUserUuid);
        await expect(h.run()).rejects.toMatchObject({
            refusal: { reason: AiAccessRefusalReason.AGENT_ACTOR_UNVERIFIED },
        });
        expect(h.findIdentityByOpenId).toHaveBeenCalledWith('slack', 'sender');
        expect(h.modelStart).not.toHaveBeenCalled();
        expect(h.onSlackAccessRefusal).toHaveBeenCalledWith(
            expect.objectContaining({
                reason: AiAccessRefusalReason.AGENT_ACTOR_UNVERIFIED,
            }),
        );
    },
);

test('legacy Slack does not add a sender identity check', async () => {
    const h = setup(false, true, null);
    await expect(h.run()).rejects.toThrow('model started');
    expect(h.findIdentityByOpenId).not.toHaveBeenCalled();
    expect(h.assertActorVerified).not.toHaveBeenCalled();
});

test('managed Slack reports a turn admission refusal before starting decisions', async () => {
    const h = setup(true, true);
    h.assertOperation.mockRejectedValue(
        new AiAccessRefusedError(AiAccessRefusalReason.AGENT_ACCESS_DISABLED),
    );
    await expect(h.run()).rejects.toMatchObject({
        refusal: { reason: AiAccessRefusalReason.AGENT_ACCESS_DISABLED },
    });
    expect(h.modelStart).not.toHaveBeenCalled();
    expect(h.onSlackAccessRefusal).toHaveBeenCalledWith(
        expect.objectContaining({
            reason: AiAccessRefusalReason.AGENT_ACCESS_DISABLED,
        }),
    );
});

test('managed linked Slack passes actor verification with OAuth requirement off', async () => {
    const h = setup(true, false, defaultSessionUser.userUuid);
    await expect(h.run()).rejects.toThrow('model started');
    expect(h.assertActorVerified).toHaveBeenCalledWith(
        expect.objectContaining({ actorVerified: true }),
    );
});

const admissionDatabase = knex({ client: MockClient, dialect: 'pg' });
const admissionTracker = getTracker();
beforeEach(() => admissionTracker.reset());
afterAll(async () => admissionDatabase.destroy());

test.each([true, false])(
    'Slack response shares sender and turn admission: verified %s',
    async (verified) => {
        const h = setup(
            true,
            false,
            verified ? defaultSessionUser.userUuid : null,
        );
        const sql = setupPermissionSql(
            admissionDatabase,
            admissionTracker,
            fromSession(defaultSessionUser),
        );
        Object.assign(h.service, { agentPermissionService: sql.service });
        if (verified) await expect(h.run()).rejects.toThrow('model started');
        else
            await expect(h.run()).rejects.toMatchObject({
                refusal: {
                    reason: AiAccessRefusalReason.AGENT_ACTOR_UNVERIFIED,
                },
            });
        expectAdmissionSql(admissionTracker, {
            policy: 1,
            groups: 0,
            people: 0,
            membership: verified ? 1 : 0,
        });
        expect(h.modelStart).toHaveBeenCalledTimes(verified ? 1 : 0);
    },
);
