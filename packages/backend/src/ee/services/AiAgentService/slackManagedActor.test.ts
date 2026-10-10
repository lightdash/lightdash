import {
    AgentActorSurface,
    AiAccessRefusalReason,
    AiAccessRefusedError,
    type AiAgent,
    type SlackPrompt,
} from '@lightdash/common';
import { defaultSessionUser } from '../../../auth/account/account.mock';
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
                    settingsUrl: '/generalSettings/agentIdentity',
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
            assertActorVerified,
            assertOperation,
            isManaged: vi.fn().mockResolvedValue(managed),
        },
        aiOrganizationSettingsService: {
            isAiAgentMemoryEnabled: vi.fn().mockResolvedValue(false),
        },
        slackAuthenticationModel: {
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
        lightdashConfig: { ai: {} },
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
                    projectUuid: 'agent-project',
                } as SlackPrompt,
                stream: false,
                threadMessages: [],
            },
        );
    return {
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
            settingsUrl: '/generalSettings/agentIdentity',
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
