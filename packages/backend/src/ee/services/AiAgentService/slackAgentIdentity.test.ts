import {
    AgentActorSurface,
    type AiAgent,
    type SlackPrompt,
} from '@lightdash/common';
import { defaultSessionUser } from '../../../auth/account/account.mock';
import {
    agentExecutionContext,
    getContentWriteAgentIdentity,
} from '../../../services/AiAccessService/agentExecutionContext';
import { AiAgentService } from './AiAgentService';

describe('Slack agent identity', () => {
    test('carries the loaded app id in the scheduled prompt', async () => {
        const slackAiPrompt = vi.fn();
        const service = new AiAgentService({
            slackClient: {
                setAssistantStatus: vi.fn().mockResolvedValue(undefined),
            },
            schedulerClient: { slackAiPrompt },
            lightdashConfig: { ai: {} },
        } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
        await service['setThinkingStatusAndSchedule']({
            agentConfig: {
                organizationUuid: 'org',
                projectUuid: 'project',
            } as AiAgent,
            slackPromptUuid: 'prompt',
            userUuid: 'user',
            channelId: 'channel',
            threadTs: 'ts',
            slackAppId: 'A123',
        });
        expect(slackAiPrompt).toHaveBeenCalledWith(
            expect.objectContaining({ slackAppId: 'A123' }),
        );
    });

    test.each(['A123', null])(
        'resolves person and agent before scoping app id %s',
        async (slackAppId) => {
            const user = defaultSessionUser;
            const prompt = {
                promptUuid: 'prompt',
                prompt: '',
                createdByUserUuid: user.userUuid,
                organizationUuid: user.organizationUuid,
                projectUuid: 'project',
                threadUuid: 'thread',
            } as SlackPrompt;
            const service = new AiAgentService({
                aiAgentModel: {
                    findSlackPrompt: vi.fn().mockResolvedValue(prompt),
                    findThread: vi
                        .fn()
                        .mockResolvedValue({ agentUuid: 'stored-agent' }),
                    getThreadMessages: vi.fn().mockResolvedValue([]),
                },
                userModel: {
                    findSessionUserAndOrgByUuid: vi
                        .fn()
                        .mockResolvedValue(user),
                },
                featureFlagService: {
                    get: vi.fn().mockResolvedValue({ enabled: true }),
                },
                slackAuthenticationModel: {
                    getInstallationFromOrganizationUuid: vi
                        .fn()
                        .mockResolvedValue({ appId: 'installed-app' }),
                },
                lightdashConfig: { ai: {} },
            } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
            vi.spyOn(service, 'getAgent').mockResolvedValue({
                uuid: 'stored-agent',
            } as AiAgent);
            const reply = vi
                .spyOn(
                    service as unknown as {
                        editPlaceholderOrPost: () => Promise<void>;
                    },
                    'editPlaceholderOrPost',
                )
                .mockImplementation(async () => {
                    expect(
                        getContentWriteAgentIdentity({
                            userUuid: user.userUuid,
                            organizationUuid: user.organizationUuid,
                        }),
                    ).toMatchObject({
                        subject: { type: 'user', uuid: user.userUuid },
                        act: {
                            surface: AgentActorSurface.SLACK_AGENT,
                            client_id: slackAppId ?? 'installed-app',
                            agent_uuid: 'stored-agent',
                        },
                    });
                });
            await service.replyToSlackPrompt('prompt', slackAppId);
            expect(reply).toHaveBeenCalledOnce();
            expect(agentExecutionContext.getStore()).toBeUndefined();
        },
    );
});
