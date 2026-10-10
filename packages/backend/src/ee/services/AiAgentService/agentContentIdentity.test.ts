import {
    AgentActorSurface,
    FeatureFlags,
    type AiAgent,
    type AiWebAppPrompt,
} from '@lightdash/common';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import {
    agentExecutionContext,
    getContentWriteAgentIdentity,
} from '../../../services/AiAccessService/agentExecutionContext';
import { AiAgentService } from './AiAgentService';

describe('in-app runtime content identity', () => {
    test.each([true, false])(
        'uses the loaded agent and feature flag enabled=%s',
        async (enabled) => {
            const user = defaultSessionUser;
            const getFlag = vi.fn().mockResolvedValue({ enabled });
            const service = new AiAgentService({
                lightdashConfig: { ai: {} },
                aiOrganizationSettingsService: {
                    isAiAgentMemoryEnabled: vi.fn().mockResolvedValue(false),
                },
                featureFlagService: { get: getFlag },
            } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
            const runtime = service as unknown as {
                getIsCopilotEnabled: () => Promise<boolean>;
                getAgentSettings: () => Promise<AiAgent>;
                getPromptDecisionClient: () => Promise<null>;
            };
            vi.spyOn(runtime, 'getIsCopilotEnabled').mockResolvedValue(true);
            vi.spyOn(runtime, 'getAgentSettings').mockResolvedValue({
                uuid: 'loaded-agent',
            } as AiAgent);
            const boundary = new Error('runtime dependency boundary');
            vi.spyOn(runtime, 'getPromptDecisionClient').mockImplementation(
                async () => {
                    const claim = getContentWriteAgentIdentity({
                        userUuid: user.userUuid,
                        organizationUuid: user.organizationUuid,
                    });
                    if (enabled)
                        expect(claim).toMatchObject({
                            subject: { uuid: user.userUuid },
                            act: {
                                surface: AgentActorSurface.IN_APP_AGENT,
                                client_id: 'lightdash-chat',
                                agent_uuid: 'loaded-agent',
                            },
                        });
                    else expect(claim).toBeNull();
                    throw boundary;
                },
            );
            await expect(
                service.generateOrStreamAgentResponse(
                    user,
                    {
                        messageHistory: [],
                        compactionSummary: null,
                        resolveMessageHistory: async () => [],
                    },
                    {
                        prompt: {
                            agentUuid: 'caller-declared-agent',
                            projectUuid: 'project',
                        } as AiWebAppPrompt,
                        stream: false,
                        canManageAgent: false,
                        aiCreditCheck: null,
                    },
                ),
            ).rejects.toBe(boundary);
            expect(getFlag).toHaveBeenCalledWith({
                user,
                featureFlagId: FeatureFlags.AgentIdentity,
            });
            expect(agentExecutionContext.getStore()).toBeUndefined();
        },
    );
});
