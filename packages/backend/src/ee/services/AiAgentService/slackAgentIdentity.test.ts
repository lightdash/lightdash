import {
    AgentActorSurface,
    type AiAgent,
    type SlackPrompt,
} from '@lightdash/common';
import { agentExecutionContext } from '../../../services/AiAccessService/agentExecutionContext';
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
        'scopes app id %s to the running prompt',
        async (slackAppId) => {
            const prompt = { promptUuid: 'prompt' } as SlackPrompt;
            const findSlackPrompt = vi.fn().mockResolvedValue(prompt);
            const service = new AiAgentService({
                aiAgentModel: { findSlackPrompt },
                lightdashConfig: { ai: {} },
            } as unknown as ConstructorParameters<typeof AiAgentService>[0]);
            const generate = vi
                .spyOn(
                    service as unknown as {
                        generateSlackPromptReply: (
                            promptUuid: string,
                            slackPrompt: SlackPrompt,
                        ) => Promise<void>;
                    },
                    'generateSlackPromptReply',
                )
                .mockImplementation(async () => {
                    expect(agentExecutionContext.getStore()).toEqual({
                        surface: AgentActorSurface.SLACK_AGENT,
                        clientId: slackAppId,
                    });
                });
            await service.replyToSlackPrompt('prompt', slackAppId);
            expect(generate).toHaveBeenCalledWith('prompt', prompt);
            expect(findSlackPrompt).toHaveBeenCalledOnce();
            expect(agentExecutionContext.getStore()).toBeUndefined();
        },
    );
});
